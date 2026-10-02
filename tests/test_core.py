"""Tests for the logic that turns events into "where is each agent".

Run them with:  python3 -m unittest discover tests
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from webgentz_core import (  # noqa: E402
    EventError, LayerConfig, Pricing, TranscriptReader, World, normalize_event,
    SLEEP_AFTER_SECONDS, STUCK_AFTER_SECONDS,
)

T0 = 1_800_000_000.0


def hook(event_name, session="s1", at=T0, **extra):
    """A Claude Code hook payload, as the hook script would send it."""
    return normalize_event({"session_id": session, "hook_event_name": event_name, "cwd": "/code/webgentz", **extra}, now=at)


def standard(event_name, session="s1", at=T0, **extra):
    """An event in the standard Webgentz format."""
    return normalize_event({"v": 1, "session_id": session, "event": event_name, **extra}, now=at)


class NormalizeEventTests(unittest.TestCase):
    def test_claude_code_names_become_standard_names(self):
        e = hook("PreToolUse", tool_name="Read", tool_input={"file_path": "/a/b.py"})
        self.assertEqual(e["event"], "tool_start")
        self.assertEqual(e["tool"], "Read")
        self.assertEqual(e["tool_input"], {"file_path": "/a/b.py"})

    def test_session_id_is_required(self):
        with self.assertRaisesRegex(EventError, "session_id"):
            normalize_event({"event": "start"})

    def test_unknown_event_is_rejected(self):
        with self.assertRaisesRegex(EventError, "event"):
            normalize_event({"session_id": "x", "event": "dance"})

    def test_bad_layer_is_rejected(self):
        with self.assertRaisesRegex(EventError, "layer"):
            normalize_event({"session_id": "x", "event": "start", "layer": "sky"})

    def test_bad_usage_is_rejected(self):
        with self.assertRaisesRegex(EventError, "usage"):
            normalize_event({"session_id": "x", "event": "tool_end", "usage": {"input": -3}})
        with self.assertRaisesRegex(EventError, "unknown key"):
            normalize_event({"session_id": "x", "event": "tool_end", "usage": {"prompt_tokens": 3}})

    def test_wrong_version_is_rejected(self):
        with self.assertRaisesRegex(EventError, "v1"):
            normalize_event({"session_id": "x", "event": "start", "v": 2})

    def test_long_tool_input_is_shortened(self):
        e = hook("PreToolUse", tool_name="Write", tool_input={"content": "x" * 5000})
        self.assertLessEqual(len(e["tool_input"]["content"]), 200)


class WhereIsTheAgentTests(unittest.TestCase):
    def setUp(self):
        self.world = World()

    def apply(self, event):
        agent, _ = self.world.apply(event)
        return agent

    def test_new_agent_arrives_idle(self):
        a = self.apply(hook("SessionStart"))
        self.assertEqual((a["status"], a["location"]), ("idle", "square"))
        self.assertEqual(a["name"], "webgentz-s1")
        self.assertEqual(a["agent_type"], "claude-code")

    def test_tools_send_agents_to_the_right_spot(self):
        cases = {
            "Read": "library", "Grep": "library", "WebSearch": "library",
            "Edit": "workshop", "Write": "workshop",
            "Bash": "forge", "Task": "barracks", "Agent": "barracks",
            "TodoWrite": "townhall", "mcp__gmail__search": "market", "SomethingNew": "square",
        }
        for tool, spot in cases.items():
            a = self.apply(hook("PreToolUse", tool_name=tool))
            self.assertEqual(a["location"], spot, tool)
            self.assertEqual(a["status"], "working")

    def test_tool_detail_describes_the_file(self):
        a = self.apply(hook("PreToolUse", tool_name="Read", tool_input={"file_path": "/x/y/server.py"}))
        self.assertEqual(a["detail"], "Read: server.py")

    def test_prompt_needs_you_done_and_end(self):
        a = self.apply(hook("UserPromptSubmit", prompt="fix the bug"))
        self.assertEqual((a["status"], a["location"], a["prompts"]), ("working", "townhall", 1))
        a = self.apply(hook("Notification", message="Claude needs your permission"))
        self.assertEqual((a["status"], a["location"]), ("needs_you", "townhall"))
        a = self.apply(hook("Stop"))
        self.assertEqual((a["status"], a["location"]), ("idle", "campfire"))
        a = self.apply(hook("SessionEnd"))
        self.assertEqual(a["status"], "gone")

    def test_resumed_session_comes_back(self):
        self.apply(hook("SessionStart"))
        self.apply(hook("PreToolUse", tool_name="Read"))
        self.apply(hook("SessionEnd"))
        a = self.apply(hook("SessionStart", source="resume", at=T0 + 60))
        self.assertEqual(a["status"], "idle")
        self.assertEqual(a["tool_counts"], {"Read": 1})  # history is kept
        self.assertEqual(a["recent"][-1]["text"], "Came back to the jungle")

    def test_working_agent_that_goes_quiet_is_stuck(self):
        self.apply(hook("PreToolUse", tool_name="Bash"))
        a = self.world.view(self.world.agents["s1"], now=T0 + STUCK_AFTER_SECONDS + 1)
        self.assertEqual(a["status"], "stuck")
        a = self.world.view(self.world.agents["s1"], now=T0 + 10)
        self.assertEqual(a["status"], "working")

    def test_resting_agent_falls_asleep_but_waiting_agent_does_not(self):
        self.apply(hook("Stop"))
        a = self.world.view(self.world.agents["s1"], now=T0 + SLEEP_AFTER_SECONDS + 1)
        self.assertEqual((a["status"], a["location"]), ("sleeping", "houses"))
        self.apply(hook("Notification", session="s2"))
        a = self.world.view(self.world.agents["s2"], now=T0 + SLEEP_AFTER_SECONDS * 5)
        self.assertEqual(a["status"], "needs_you")

    def test_gone_agents_are_forgotten_after_a_day(self):
        self.apply(hook("SessionEnd"))
        self.assertEqual(len(self.world.snapshot(now=T0 + 60)), 1)
        self.assertEqual(len(self.world.snapshot(now=T0 + 2 * 86400)), 0)

    def test_standard_event_sets_kind_name_and_layer(self):
        a = self.apply(standard("start", agent_type="gtm", name="sales-bot", layer="canopy"))
        self.assertEqual((a["agent_type"], a["name"], a["layer"]), ("gtm", "sales-bot", "canopy"))
        a = self.apply(standard("tool_start", tool="send_email", detail="to 20 leads"))
        self.assertEqual(a["detail"], "send_email: to 20 leads")


class TokenAndCostTests(unittest.TestCase):
    def setUp(self):
        self.pricing = Pricing(table={"claude-opus-5-5": {"input": 4, "output": 20, "cache_read": 0.4, "cache_write": 5}})
        self.world = World(pricing=self.pricing)

    def test_usage_is_added_up(self):
        self.world.apply(standard("start", model="claude-opus-5-5"))
        _, c1 = self.world.apply(standard("tool_end", usage={"input": 1000, "output": 500}))
        a, c2 = self.world.apply(standard("tool_end", usage={"input": 1000}))
        self.assertEqual(a["tokens"]["input"], 2000)
        self.assertEqual(a["tokens"]["output"], 500)
        self.assertAlmostEqual(c1["cost_usd"], (1000 * 4 + 500 * 20) / 1e6)
        self.assertAlmostEqual(c2["cost_usd"], 1000 * 4 / 1e6)
        self.assertAlmostEqual(a["cost_usd"], c1["cost_usd"] + c2["cost_usd"])

    def test_running_totals_replace_and_only_the_increase_is_charged(self):
        self.world.apply(standard("start", model="claude-opus-5-5"))
        self.world.apply(standard("tool_end", tokens={"input": 100, "output": 10}))
        a, change = self.world.apply(standard("tool_end", tokens={"input": 150, "output": 10}))
        self.assertEqual(a["tokens"]["input"], 150)
        self.assertEqual(change["tokens"]["input"], 50)
        self.assertEqual(change["tokens"]["output"], 0)

    def test_reported_cost_wins(self):
        a, change = self.world.apply(standard("tool_end", usage={"input": 10}, cost_usd=0.5))
        self.assertEqual(change["cost_usd"], 0.5)

    def test_unknown_model_marks_cost_unknown(self):
        a, change = self.world.apply(standard("tool_end", model="mystery-1", usage={"input": 10}))
        self.assertEqual(change["cost_usd"], 0)
        self.assertFalse(a["cost_known"])

    def test_longest_price_prefix_wins(self):
        p = Pricing(table={"claude-opus": {"input": 1}, "claude-opus-5-5": {"input": 4}})
        self.assertEqual(p.price_for("claude-opus-5-5")["input"], 4)
        self.assertEqual(p.price_for("claude-opus-4-8")["input"], 1)
        self.assertIsNone(p.price_for("gpt-9"))


def assistant_line(msg_id, inp, out, model="claude-opus-5-5"):
    return json.dumps({"type": "assistant", "message": {"id": msg_id, "model": model,
                       "usage": {"input_tokens": inp, "output_tokens": out,
                                 "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}}}) + "\n"


class TranscriptTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "abc.jsonl")

    def tearDown(self):
        self.dir.cleanup()

    def test_each_message_is_counted_once(self):
        with open(self.path, "w") as f:
            f.write(assistant_line("m1", 10, 5))
            f.write(assistant_line("m1", 10, 5))  # same reply split over two lines
            f.write(json.dumps({"type": "user", "message": {"content": "hi"}}) + "\n")
            f.write(assistant_line("m2", 3, 2))
        tokens, model = TranscriptReader().totals(self.path)
        self.assertEqual((tokens["input"], tokens["output"]), (13, 7))
        self.assertEqual(model, "claude-opus-5-5")

    def test_reads_only_new_lines_and_waits_for_complete_lines(self):
        reader = TranscriptReader()
        with open(self.path, "w") as f:
            f.write(assistant_line("m1", 10, 5))
        self.assertEqual(reader.totals(self.path)[0]["input"], 10)
        line = assistant_line("m2", 7, 1)
        with open(self.path, "a") as f:
            f.write(line[:20])  # half-written line
        self.assertEqual(reader.totals(self.path)[0]["input"], 10)
        with open(self.path, "a") as f:
            f.write(line[20:])
        self.assertEqual(reader.totals(self.path)[0]["input"], 17)

    def test_helper_agent_transcripts_are_added(self):
        with open(self.path, "w") as f:
            f.write(assistant_line("m1", 10, 5))
        helpers = os.path.join(self.dir.name, "abc", "subagents")
        os.makedirs(helpers)
        with open(os.path.join(helpers, "agent-1.jsonl"), "w") as f:
            f.write(assistant_line("h1", 100, 50, model="claude-haiku-4-5"))
        tokens, model = TranscriptReader().totals(self.path)
        self.assertEqual((tokens["input"], tokens["output"]), (110, 55))
        self.assertEqual(model, "claude-opus-5-5")  # the main agent's model

    def test_missing_file_counts_nothing(self):
        tokens, model = TranscriptReader().totals(os.path.join(self.dir.name, "nope.jsonl"))
        self.assertEqual(sum(tokens.values()), 0)
        self.assertIsNone(model)

    def test_world_reads_tokens_from_the_transcript(self):
        with open(self.path, "w") as f:
            f.write(assistant_line("m1", 10, 5))
        world = World()
        a, change = world.apply(hook("PostToolUse", tool_name="Read", transcript_path=self.path))
        self.assertEqual(a["tokens"]["input"], 10)
        self.assertEqual(a["model"], "claude-opus-5-5")
        self.assertEqual(change["tokens"]["input"], 10)


class LayerConfigTests(unittest.TestCase):
    def test_folders_map_to_layers(self):
        cfg = LayerConfig(data={"default_layer": "roots", "layers": {"Sales": "canopy", "app": "understory"}})
        self.assertEqual(cfg.layer_for("/Users/ian/code/sales-bot"), "canopy")
        self.assertEqual(cfg.layer_for("/Users/ian/code/my-app"), "understory")
        self.assertEqual(cfg.layer_for("/Users/ian/code/terraform"), "roots")

    def test_default_is_understory(self):
        self.assertEqual(LayerConfig().layer_for("/anything"), "understory")


if __name__ == "__main__":
    unittest.main()
