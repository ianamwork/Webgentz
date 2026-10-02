"""Tests for the server: saving events, daily totals, and the HTTP API.

Run them with:  python3 -m unittest discover tests
"""

import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

TMP = tempfile.mkdtemp()
os.environ["WEBGENTZ_DB"] = os.path.join(TMP, "test.db")
os.environ["WEBGENTZ_CONFIG"] = os.path.join(TMP, "none.json")
os.environ["WEBGENTZ_NOTIFY"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def post(self, body):
        req = urllib.request.Request(self.base + "/event", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def get(self, path):
        with urllib.request.urlopen(self.base + path) as r:
            return json.loads(r.read())

    def test_events_build_agents_and_daily_totals(self):
        sid = "daily-test"
        self.post({"session_id": sid, "event": "start", "agent_type": "python", "model": "claude-haiku-4-5"})
        self.post({"session_id": sid, "event": "prompt", "prompt": "write a report"})
        self.post({"session_id": sid, "event": "tool_start", "tool": "Read"})
        status, _ = self.post({"session_id": sid, "event": "tool_end", "usage": {"input": 1_000_000, "output": 0}})
        self.assertEqual(status, 200)

        agents = {a["id"]: a for a in self.get("/api/state")["agents"]}
        self.assertEqual(agents[sid]["agent_type"], "python")
        self.assertAlmostEqual(agents[sid]["cost_usd"], 1.0)  # haiku input is $1 per million

        rows = [r for r in self.get("/api/daily?days=1")["rows"] if r["session_id"] == sid]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["input"], 1_000_000)
        self.assertEqual((rows[0]["tool_calls"], rows[0]["prompts"]), (1, 1))
        self.assertAlmostEqual(rows[0]["cost_usd"], 1.0)

        timeline = self.get(f"/api/timeline?session={sid}")["events"]
        self.assertEqual([e["event"] for e in timeline], ["tool_end", "tool_start", "prompt", "start"])

    def test_bad_events_get_a_clear_error(self):
        status, body = self.post({"event": "start"})
        self.assertEqual(status, 400)
        self.assertIn("session_id", body["error"])
        req = urllib.request.Request(self.base + "/event", data=b"not json")
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 400)

    def test_old_events_are_pruned_but_daily_totals_stay(self):
        old = {"v": 1, "session_id": "old", "event": "start", "received": time.time() - 40 * 86400}
        with server.store.lock:
            server.store.db.execute("INSERT INTO events (received, session_id, body) VALUES (?, ?, ?)",
                                    (old["received"], "old", json.dumps(old)))
            server.store.db.execute("INSERT INTO daily (day, session_id, input) VALUES ('2020-01-01', 'old', 5)")
            server.store.db.commit()
        server.store.prune(30)
        with server.store.lock:
            events = server.store.db.execute("SELECT COUNT(*) FROM events WHERE session_id='old'").fetchone()[0]
            daily = server.store.db.execute("SELECT COUNT(*) FROM daily WHERE session_id='old'").fetchone()[0]
        self.assertEqual((events, daily), (0, 1))

    def test_notifier_announces_once_per_episode(self):
        shown = []
        n = server.Notifier(True)
        n._show = lambda title, message: shown.append(title)
        agent = {"id": "a", "name": "bot", "status": "needs_you", "detail": "?"}
        n.check(agent)
        n.check(agent)
        self.assertEqual(len(shown), 1)
        n.check({**agent, "status": "working"})
        n.check(agent)
        self.assertEqual(len(shown), 2)


if __name__ == "__main__":
    unittest.main()
