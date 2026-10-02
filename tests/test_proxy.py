"""Tests for the API proxy, using a pretend upstream API on this machine."""

import json
import os
import sys
import threading
import time
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

RECEIVED = []


class FakeJungle(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        RECEIVED.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        self.send_response(200)
        self.end_headers()


class FakeProvider(BaseHTTPRequestHandler):
    """Answers like Anthropic (/v1/messages) and OpenAI (/v1/chat/completions)."""

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.seen_headers = {k.lower(): v for k, v in self.headers.items()}
        if body.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            if self.path.endswith("/messages"):
                events = [
                    {"type": "message_start", "message": {"model": body["model"], "usage": {
                        "input_tokens": 12, "output_tokens": 1, "cache_read_input_tokens": 300,
                        "cache_creation_input_tokens": 0}}},
                    {"type": "content_block_delta", "delta": {"text": "hi"}},
                    {"type": "message_delta", "usage": {"output_tokens": 42}},
                ]
            else:
                events = [{"model": body["model"], "choices": [{"delta": {"content": "hi"}}]},
                          {"model": body["model"], "choices": [], "usage": {"prompt_tokens": 50, "completion_tokens": 9}}]
            for e in events:
                self.wfile.write(f"data: {json.dumps(e)}\n\n".encode())
                self.wfile.flush()
            self.wfile.write(b"data: [DONE]\n\n")
            return
        answer = json.dumps({"model": body["model"], "content": [{"type": "text", "text": "hi"}],
                             "usage": {"input_tokens": 7, "output_tokens": 3, "cache_read_input_tokens": 0,
                                       "cache_creation_input_tokens": 0}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(answer)))
        self.end_headers()
        self.wfile.write(answer)


def serve(handler):
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


class ProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.jungle, jungle_url = serve(FakeJungle)
        cls.provider, provider_url = serve(FakeProvider)
        os.environ["WEBGENTZ_URL"] = jungle_url
        os.environ["WEBGENTZ_UPSTREAM_ANTHROPIC"] = provider_url
        os.environ["WEBGENTZ_UPSTREAM_OPENAI"] = provider_url
        import importlib
        import webgentz_client
        importlib.reload(webgentz_client)
        import proxy
        cls.proxy_module = importlib.reload(proxy)
        cls.proxy, cls.proxy_url = serve(cls.proxy_module.ProxyHandler)

    @classmethod
    def tearDownClass(cls):
        for s in (cls.jungle, cls.provider, cls.proxy):
            s.shutdown()

    def call(self, path, body, headers=None):
        req = urllib.request.Request(self.proxy_url + path, data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", **(headers or {})})
        with urllib.request.urlopen(req) as r:
            return r.read()

    def wait_for(self, name, kind, count=1):
        for _ in range(100):
            found = [e for e in RECEIVED if e["name"] == name and e["event"] == kind]
            if len(found) >= count:
                return found
            time.sleep(0.02)
        self.fail(f"no {kind} event for {name}; got {RECEIVED}")

    def test_plain_answer_passes_through_and_is_counted(self):
        out = json.loads(self.call("/anthropic/v1/messages", {"model": "claude-opus-5-5", "messages": []},
                                   {"x-api-key": "sk-test", "X-Webgentz-Agent": "plain-bot"}))
        self.assertEqual(out["content"][0]["text"], "hi")
        done = self.wait_for("plain-bot", "done")[0]
        self.assertEqual(done["usage"], {"input": 7, "output": 3, "cache_read": 0, "cache_write": 0})
        self.assertEqual(done["model"], "claude-opus-5-5")
        self.assertEqual(done["agent_type"], "claude-api")
        # our own headers are not sent on to the provider, the key is
        self.assertNotIn("x-webgentz-agent", self.provider.seen_headers)
        self.assertEqual(self.provider.seen_headers.get("x-api-key"), "sk-test")

    def test_streamed_anthropic_answer_is_counted(self):
        raw = self.call("/anthropic/v1/messages", {"model": "claude-sonnet-5-5", "stream": True},
                        {"X-Webgentz-Agent": "stream-bot", "X-Webgentz-Layer": "canopy"})
        self.assertIn(b"message_delta", raw)
        done = self.wait_for("stream-bot", "done")[0]
        self.assertEqual(done["usage"], {"input": 12, "output": 42, "cache_read": 300, "cache_write": 0})
        self.assertEqual(done["layer"], "canopy")

    def test_streamed_openai_answer_is_counted(self):
        self.call("/openai/v1/chat/completions", {"model": "gpt-test", "stream": True},
                  {"X-Webgentz-Agent": "oa-bot"})
        done = self.wait_for("oa-bot", "done")[0]
        self.assertEqual(done["usage"], {"input": 50, "output": 9, "cache_read": 0})
        self.assertEqual(done["agent_type"], "openai")

    def test_each_api_key_is_its_own_agent(self):
        self.call("/anthropic/v1/messages", {"model": "m"}, {"x-api-key": "key-one"})
        self.call("/anthropic/v1/messages", {"model": "m"}, {"x-api-key": "key-two"})
        names = {e["name"] for e in RECEIVED if e["event"] == "start" and e["name"].startswith("anthropic-")}
        self.assertGreaterEqual(len(names), 2)
        self.assertFalse(any("key-one" in n for n in names))  # the key itself never appears


if __name__ == "__main__":
    unittest.main()
