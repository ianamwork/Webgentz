"""Tests for the Codex adapter, using a made-up Codex session log."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import codex_watch  # noqa: E402
from webgentz_core import World, normalize_event  # noqa: E402

SENT = []


class RecordingAgent:
    """Stands in for webgentz_client.Agent and keeps what would be sent."""

    def __init__(self, name, agent_type, session_id, cwd):
        self.base = {"v": 1, "session_id": session_id, "name": name, "agent_type": agent_type, "cwd": cwd}

    def _send(self, event, **fields):
        SENT.append({**self.base, "event": event, **{k: v for k, v in fields.items() if v is not None}})

    def tool_start(self, tool, detail=None):
        self._send("tool_start", tool=tool, detail=detail)

    def prompt(self, task):
        self._send("prompt", prompt=task)

    def done(self):
        self._send("done")


def line(kind, payload):
    return json.dumps({"timestamp": "2026-10-02T08:00:00Z", "type": kind, "payload": payload}) + "\n"


class CodexTests(unittest.TestCase):
    def setUp(self):
        SENT.clear()
        codex_watch.Agent = RecordingAgent
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "rollout-2026-10-02T08-00-00-abc.jsonl")

    def tearDown(self):
        self.dir.cleanup()

    def test_a_codex_session_becomes_jungle_events(self):
        with open(self.path, "w") as f:
            f.write(line("session_meta", {"id": "t-123", "cwd": "/Users/ian/code/api-server", "originator": "codex_cli"}))
            f.write(line("turn_context", {"model": "gpt-5-codex", "cwd": "/Users/ian/code/api-server"}))
            f.write(line("event_msg", {"type": "user_message", "message": "speed up the events endpoint"}))
            f.write(line("response_item", {"type": "function_call", "name": "shell",
                                           "arguments": json.dumps({"command": ["bash", "-lc", "rg slow"]})}))
            f.write(line("event_msg", {"type": "token_count", "info": {"total_token_usage": {
                "input_tokens": 1200, "cached_input_tokens": 1000, "output_tokens": 80,
                "reasoning_output_tokens": 40, "total_tokens": 1280}}}))
            f.write(line("response_item", {"type": "custom_tool_call", "name": "apply_patch", "input": "*** Begin Patch"}))
            f.write(line("event_msg", {"type": "task_complete"}))
        session = codex_watch.Session(self.path)
        session.read_new_lines()

        self.assertEqual([e["event"] for e in SENT], ["start", "prompt", "tool_start", "tool_end", "tool_start", "done"])
        self.assertEqual(SENT[0]["session_id"], "codex-t-123")
        self.assertEqual(SENT[0]["name"], "api-server-codex")
        self.assertEqual(SENT[2]["detail"], "rg slow")
        self.assertEqual(SENT[3]["tokens"], {"input": 200, "output": 80, "cache_read": 1000, "cache_write": 0})
        self.assertEqual(SENT[3]["model"], "gpt-5-codex")

        world = World()
        for e in SENT:
            agent, _ = world.apply(normalize_event(e))
        self.assertEqual(agent["agent_type"], "codex")
        self.assertEqual(agent["tool_counts"], {"shell": 1, "apply_patch": 1})
        self.assertEqual(agent["tokens"]["cache_read"], 1000)
        self.assertEqual(agent["location"], "campfire")

    def test_half_written_lines_wait(self):
        text = line("session_meta", {"id": "t-9", "cwd": "/x"})
        with open(self.path, "w") as f:
            f.write(text[:10])
        session = codex_watch.Session(self.path)
        session.read_new_lines()
        self.assertEqual(SENT, [])
        with open(self.path, "a") as f:
            f.write(text[10:])
        session.read_new_lines()
        self.assertEqual([e["event"] for e in SENT], ["start"])


if __name__ == "__main__":
    unittest.main()
