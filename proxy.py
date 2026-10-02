"""A small local proxy that shows any app calling an AI API in the jungle.

Point an app at the proxy instead of the provider, and every API call it
makes is passed straight through and reported to the jungle with its exact
token counts. Nothing about the request or the answer is changed.

    python3 proxy.py          # listens on http://127.0.0.1:8766

Then set the app's base URL:

    Anthropic (Claude)  ANTHROPIC_BASE_URL=http://127.0.0.1:8766/anthropic
    OpenAI              OPENAI_BASE_URL=http://127.0.0.1:8766/openai/v1
    xAI (Grok)          base_url="http://127.0.0.1:8766/xai/v1"
    Gemini (OpenAI mode) base_url="http://127.0.0.1:8766/gemini/v1beta/openai"

Each API key shows up as its own agent. To give an app a nicer name or a
layer, add the headers `X-Webgentz-Agent: sales-bot` and
`X-Webgentz-Layer: canopy` to its requests (most SDKs take `default_headers`).
"""

import hashlib
import http.client
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from webgentz_client import Agent, usage_from_response

HOST = os.environ.get("WEBGENTZ_PROXY_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEBGENTZ_PROXY_PORT", "8766"))

# provider -> (default upstream, agent_type used for the animal)
PROVIDERS = {
    "anthropic": ("https://api.anthropic.com", "claude-api"),
    "openai": ("https://api.openai.com", "openai"),
    "xai": ("https://api.x.ai", "grok"),
    "gemini": ("https://generativelanguage.googleapis.com", "gemini"),
}

# Headers that belong to one connection and must not be passed along.
HOP_HEADERS = {"connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer",
               "upgrade", "host", "content-length", "accept-encoding"}

_agents = {}


def upstream_for(provider):
    default, _ = PROVIDERS[provider]
    return os.environ.get(f"WEBGENTZ_UPSTREAM_{provider.upper()}", default).rstrip("/")


def agent_for(provider, headers):
    """One jungle agent per provider and API key (or per X-Webgentz-Agent name)."""
    name = headers.get("X-Webgentz-Agent")
    if not name:
        key = headers.get("x-api-key") or headers.get("Authorization") or headers.get("x-goog-api-key") or ""
        name = f"{provider}-{hashlib.sha256(key.encode()).hexdigest()[:4]}" if key else f"{provider}-app"
    layer = headers.get("X-Webgentz-Layer")
    layer = layer if layer in ("roots", "understory", "canopy") else None
    cache_key = (provider, name)
    agent = _agents.get(cache_key)
    if agent is None:
        agent = Agent(name, agent_type=PROVIDERS[provider][1], layer=layer, session_id=f"proxy-{provider}-{name}")
        agent.start()
        _agents[cache_key] = agent
    return agent


class StreamUsage:
    """Picks the token counts out of a streamed (Server-Sent Events) answer."""

    def __init__(self):
        self.model = None
        self.usage = None
        self.buffer = b""

    def feed(self, chunk):
        self.buffer += chunk
        while b"\n" in self.buffer:
            line, self.buffer = self.buffer.split(b"\n", 1)
            line = line.strip()
            if not line.startswith(b"data:"):
                continue
            try:
                data = json.loads(line[5:].strip())
            except ValueError:
                continue  # e.g. "data: [DONE]"
            if isinstance(data, dict):
                self._read(data)

    def _read(self, data):
        kind = data.get("type")
        if kind == "message_start":  # Anthropic: input and cache counts come first
            message = data.get("message") or {}
            self.model, self.usage = usage_from_response(message)
        elif kind == "message_delta" and isinstance(data.get("usage"), dict):  # Anthropic: final output count
            self.usage = dict(self.usage or {})
            for field, key in (("output_tokens", "output"), ("input_tokens", "input"),
                               ("cache_read_input_tokens", "cache_read"),
                               ("cache_creation_input_tokens", "cache_write")):
                if data["usage"].get(field) is not None:
                    self.usage[key] = data["usage"][field]
        elif kind == "response.completed" and isinstance(data.get("response"), dict):  # OpenAI Responses API
            self.model, self.usage = usage_from_response(data["response"])
        elif isinstance(data.get("usage"), dict):  # OpenAI-style chat chunk with usage
            self.model, self.usage = usage_from_response(data)
        if data.get("model") and not self.model:
            self.model = data["model"]


class ProxyHandler(BaseHTTPRequestHandler):
    server_version = "WebgentzProxy/0.1"

    def log_message(self, fmt, *args):
        pass

    def _error(self, status, message):
        body = json.dumps({"error": {"type": "webgentz_proxy_error", "message": message}}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._forward()

    def do_POST(self):
        self._forward()

    def do_DELETE(self):
        self._forward()

    def _forward(self):
        parts = self.path.lstrip("/").split("/", 1)
        provider = parts[0]
        if provider not in PROVIDERS:
            return self._error(404, f"Unknown provider '{provider}'. Use one of: {', '.join(PROVIDERS)}")
        rest = "/" + (parts[1] if len(parts) > 1 else "")
        upstream = urlsplit(upstream_for(provider))
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))

        agent = agent_for(provider, self.headers)
        model_asked = None
        try:
            model_asked = json.loads(body).get("model") if body else None
        except (ValueError, AttributeError):
            pass
        is_model_call = self.command == "POST"
        if is_model_call:
            agent.tool_start("llm_call", model_asked)

        headers = {k: v for k, v in self.headers.items()
                   if k.lower() not in HOP_HEADERS and not k.lower().startswith("x-webgentz-")}
        headers["Host"] = upstream.netloc
        headers["Accept-Encoding"] = "identity"  # so the proxy can read the token counts
        if body:
            headers["Content-Length"] = str(len(body))

        conn_class = http.client.HTTPSConnection if upstream.scheme == "https" else http.client.HTTPConnection
        conn = conn_class(upstream.netloc, timeout=600)
        try:
            conn.request(self.command, upstream.path.rstrip("/") + rest, body=body or None, headers=headers)
            response = conn.getresponse()
        except OSError as exc:
            conn.close()
            if is_model_call:
                agent.done()
            return self._error(502, f"Could not reach {upstream.netloc}: {exc}")

        self.send_response(response.status, response.reason)
        for key, value in response.getheaders():
            if key.lower() not in HOP_HEADERS:
                self.send_header(key, value)
        self.send_header("Connection", "close")
        self.end_headers()

        streaming = "text/event-stream" in (response.getheader("Content-Type") or "")
        tally = StreamUsage()
        whole = b""
        try:
            while True:
                chunk = response.read1(65536) if streaming else response.read(65536)
                if not chunk:
                    break
                if streaming:
                    tally.feed(chunk)
                else:
                    whole += chunk
                self.wfile.write(chunk)
                if streaming:
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()

        if not is_model_call:
            return
        if streaming:
            model, usage = tally.model, tally.usage
        else:
            try:
                model, usage = usage_from_response(json.loads(whole))
            except (ValueError, TypeError):
                model, usage = None, None
        if response.status in (401, 403):  # a key problem only a person can fix
            agent.needs_you(f"{provider} rejected the API key ({response.status})")
            return
        agent._send("done", model=model or model_asked, usage=usage)


def main():
    server = ThreadingHTTPServer((HOST, PORT), ProxyHandler)
    server.daemon_threads = True
    print(f"Webgentz API proxy listening on http://{HOST}:{PORT}")
    for name in PROVIDERS:
        print(f"  {name:<10} http://{HOST}:{PORT}/{name}  ->  {upstream_for(name)}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
