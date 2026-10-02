"""Tests for the Python helper (webgentz_client.py)."""

import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from webgentz_client import Agent, usage_from_response  # noqa: E402
from webgentz_core import normalize_event  # noqa: E402


class UsageTests(unittest.TestCase):
    def test_anthropic_response_object(self):
        response = SimpleNamespace(model="claude-opus-5-5", usage=SimpleNamespace(
            input_tokens=10, output_tokens=5, cache_read_input_tokens=100, cache_creation_input_tokens=20))
        model, usage = usage_from_response(response)
        self.assertEqual(model, "claude-opus-5-5")
        self.assertEqual(usage, {"input": 10, "output": 5, "cache_read": 100, "cache_write": 20})

    def test_openai_chat_completion_dict(self):
        model, usage = usage_from_response({"model": "gpt-x", "usage": {
            "prompt_tokens": 120, "completion_tokens": 30, "prompt_tokens_details": {"cached_tokens": 100}}})
        self.assertEqual(usage, {"input": 20, "output": 30, "cache_read": 100})

    def test_openai_responses_api_dict(self):
        _, usage = usage_from_response({"model": "gpt-x", "usage": {
            "input_tokens": 50, "output_tokens": 7, "input_tokens_details": {"cached_tokens": 10}}})
        self.assertEqual(usage, {"input": 40, "output": 7, "cache_read": 10})

    def test_no_usage(self):
        self.assertEqual(usage_from_response({"model": "m"}), ("m", None))


class AgentTests(unittest.TestCase):
    def test_agent_sends_valid_events_in_order(self):
        received = []

        class Collect(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                received.append(body)
                self.send_response(200)
                self.end_headers()

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), Collect)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            url = f"http://127.0.0.1:{httpd.server_address[1]}"
            with Agent("sales-bot", agent_type="gtm", layer="canopy", url=url) as agent:
                agent.prompt("Draft follow-ups")
                with agent.tool("search_crm", "last week's leads"):
                    pass
                agent.record({"model": "claude-sonnet-5-5", "usage": {"input_tokens": 9, "output_tokens": 3,
                                                                       "cache_read_input_tokens": 0}})
                agent.needs_you("Approve?")
                agent.done()
        finally:
            httpd.shutdown()

        kinds = [e["event"] for e in received]
        self.assertEqual(kinds, ["start", "prompt", "tool_start", "tool_end", "tool_end", "needs_you", "done", "end"])
        for e in received:
            normalize_event(e)  # every event passes the server's checks
            self.assertEqual((e["name"], e["agent_type"], e["layer"]), ("sales-bot", "gtm", "canopy"))
        self.assertEqual(received[4]["usage"], {"input": 9, "output": 3, "cache_read": 0, "cache_write": 0})

    def test_no_server_does_not_raise(self):
        agent = Agent("lonely", url="http://127.0.0.1:9")  # nothing listens here
        agent.start()
        agent.end()


if __name__ == "__main__":
    unittest.main()
