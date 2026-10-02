"""Report your own Python agents to the Webgentz jungle.

Copy this one file next to your agent (it only needs the standard library),
then:

    from webgentz_client import Agent

    agent = Agent("sales-bot", agent_type="gtm", layer="canopy")
    agent.start()
    agent.prompt("Draft follow-ups for 20 leads")

    with agent.tool("search_crm", "leads from last week"):
        leads = search_crm()

    response = client.messages.create(...)   # any Anthropic or OpenAI call
    agent.record(response)                   # adds its tokens and model

    agent.needs_you("Approve the email before sending?")
    agent.done()

Reporting never raises and never slows your agent down: events are sent in
the background, and if the jungle server is not running they are dropped.
"""

import json
import os
import queue
import threading
import time
import urllib.request
import uuid
from contextlib import contextmanager

DEFAULT_URL = os.environ.get("WEBGENTZ_URL", "http://127.0.0.1:8765")


class _Sender:
    """One background thread that posts events in order."""

    def __init__(self):
        self.queue = queue.Queue(maxsize=1000)
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self):
        while True:
            url, body = self.queue.get()
            try:
                req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
                urllib.request.urlopen(req, timeout=2).close()
            except Exception:
                pass  # the jungle is optional; never bother the agent
            self.queue.task_done()

    def send(self, url, event):
        try:
            self.queue.put_nowait((url, json.dumps(event).encode()))
        except queue.Full:
            pass

    def flush(self, timeout=2.0):
        """Wait (briefly) until queued events are sent, e.g. before the program exits."""
        end = time.time() + timeout
        while self.queue.unfinished_tasks and time.time() < end:
            time.sleep(0.02)


_sender = None


def _get_sender():
    global _sender
    if _sender is None:
        _sender = _Sender()
    return _sender


def usage_from_response(response):
    """Pull (model, usage) out of an Anthropic or OpenAI response object or dict."""
    get = (lambda obj, key: obj.get(key)) if isinstance(response, dict) else (lambda obj, key: getattr(obj, key, None))
    model = get(response, "model")
    raw = get(response, "usage")
    if raw is None:
        return model, None
    u = raw if isinstance(raw, dict) else {k: getattr(raw, k, None) for k in (
        "input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens",
        "prompt_tokens", "completion_tokens", "prompt_tokens_details", "input_tokens_details")}

    def details(name):
        d = u.get(name)
        if d is None:
            return 0
        value = d.get("cached_tokens") if isinstance(d, dict) else getattr(d, "cached_tokens", None)
        return value or 0

    if u.get("prompt_tokens") is not None:  # OpenAI Chat Completions (also Grok, Gemini's OpenAI mode)
        cached = details("prompt_tokens_details")
        usage = {"input": (u.get("prompt_tokens") or 0) - cached, "output": u.get("completion_tokens") or 0,
                 "cache_read": cached}
    elif u.get("cache_read_input_tokens") is not None or u.get("cache_creation_input_tokens") is not None:
        usage = {"input": u.get("input_tokens") or 0, "output": u.get("output_tokens") or 0,  # Anthropic
                 "cache_read": u.get("cache_read_input_tokens") or 0,
                 "cache_write": u.get("cache_creation_input_tokens") or 0}
    else:  # OpenAI Responses API counts cached tokens inside input_tokens
        cached = details("input_tokens_details")
        usage = {"input": (u.get("input_tokens") or 0) - cached, "output": u.get("output_tokens") or 0,
                 "cache_read": cached}
    return model, {k: max(0, int(v)) for k, v in usage.items()}


class Agent:
    """One agent run in the jungle."""

    def __init__(self, name, agent_type="python", layer=None, session_id=None, url=None, cwd=None):
        self.name = name
        self.agent_type = agent_type
        self.layer = layer
        self.session_id = session_id or f"{name}-{uuid.uuid4().hex[:8]}"
        self.url = (url or DEFAULT_URL).rstrip("/") + "/event"
        self.cwd = cwd or os.getcwd()

    def _send(self, event, **fields):
        body = {"v": 1, "session_id": self.session_id, "event": event, "name": self.name,
                "agent_type": self.agent_type, "cwd": self.cwd}
        if self.layer:
            body["layer"] = self.layer
        body.update({k: v for k, v in fields.items() if v is not None})
        _get_sender().send(self.url, body)

    def start(self):
        self._send("start")
        return self

    def prompt(self, task):
        self._send("prompt", prompt=task)

    def tool_start(self, tool, detail=None):
        self._send("tool_start", tool=tool, detail=detail)

    def tool_end(self, tool, usage=None, model=None, cost_usd=None):
        self._send("tool_end", tool=tool, usage=usage, model=model, cost_usd=cost_usd)

    @contextmanager
    def tool(self, tool, detail=None):
        """Wrap a block of code: the agent walks to the tool's spot while it runs."""
        self.tool_start(tool, detail)
        try:
            yield
        finally:
            self.tool_end(tool)

    def record(self, response=None, model=None, usage=None, cost_usd=None):
        """Add the tokens of one model call. Pass the response, or model + usage yourself."""
        if response is not None:
            found_model, found_usage = usage_from_response(response)
            model = model or found_model
            usage = usage or found_usage
        if usage or cost_usd:
            self._send("tool_end", tool="llm_call", model=model, usage=usage, cost_usd=cost_usd)

    def needs_you(self, message):
        self._send("needs_you", message=message)

    def done(self):
        self._send("done")

    def end(self):
        self._send("end")
        _get_sender().flush()

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.end()
