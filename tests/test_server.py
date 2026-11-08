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
from unittest import mock
from http.server import ThreadingHTTPServer
from pathlib import Path

TMP = tempfile.mkdtemp()
os.environ["WEBGENTZ_DB"] = os.path.join(TMP, "test.db")
os.environ["WEBGENTZ_CONFIG"] = os.path.join(TMP, "none.json")
os.environ["WEBGENTZ_NOTIFY"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402
import webgentz_client  # noqa: E402
from webgentz_client import Agent  # noqa: E402


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

    def test_other_websites_cannot_post(self):
        req = urllib.request.Request(self.base + "/api/open", data=b'{"id": "x"}',
                                     headers={"Content-Type": "application/json", "Origin": "https://evil.example"})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 403)

    def test_open_command_for_each_kind_of_place(self):
        cmd, label = server.open_command({"open": {"app": "Terminal", "tty": "/dev/ttys003"}}, "darwin")
        self.assertEqual((cmd[0], cmd[-1], label), ("osascript", "/dev/ttys003", "Terminal"))
        cmd, _ = server.open_command({"open": {"app": "Cursor"}, "cwd": os.getcwd()}, "darwin")
        self.assertEqual(cmd, ["open", "-a", "Cursor", os.getcwd()])
        cmd, label = server.open_command({"open": {"url": "https://example.com/run/1"}}, "darwin")
        self.assertEqual((cmd, label), (["open", "https://example.com/run/1"], "your browser"))
        cmd, reason = server.open_command({}, "darwin")
        self.assertIsNone(cmd)
        self.assertIn("did not say", reason)

    def test_notifier_says_when_a_long_task_is_done(self):
        shown = []
        n = server.Notifier(True)
        n._show = lambda title, message: shown.append((title, message))
        now = time.time()
        agent = {"id": "d", "name": "bot", "status": "idle", "task_started": now - 300,
                 "finished_at": now, "answer": "Report is in reports/q3.md"}
        n.check(agent)
        n.check(agent)
        self.assertEqual(shown, [("bot is done", "Report is in reports/q3.md")])
        n.check({**agent, "task_started": now - 5, "finished_at": now + 1})  # quick task: no alert
        self.assertEqual(len(shown), 1)

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


class TokenTests(unittest.TestCase):
    """With WEBGENTZ_TOKEN set, events, the API and the stream need the token."""

    TOKEN = "s3cret-token"

    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def setUp(self):
        patcher = mock.patch.object(server, "TOKEN", self.TOKEN)
        patcher.start()
        self.addCleanup(patcher.stop)

    def request(self, path, body=None, token=None, read_line=False):
        """Return the HTTP status (and the first line of the body if asked)."""
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return (r.status, r.readline()) if read_line else r.status
        except urllib.error.HTTPError as e:
            if read_line:
                return e.code, e.read()
            e.read()
            return e.code

    def event(self, sid):
        return {"session_id": sid, "event": "start", "agent_type": "python"}

    def test_requests_without_a_token_are_rejected(self):
        self.assertEqual(self.request("/event", self.event("no-token")), 401)
        self.assertEqual(self.request("/api/note", {"text": "hi"}), 401)
        self.assertEqual(self.request("/api/state"), 401)
        self.assertEqual(self.request("/api/daily?days=1"), 401)
        self.assertEqual(self.request("/stream"), 401)
        sids = [a["id"] for a in server.world.snapshot()]
        self.assertNotIn("no-token", sids)

    def test_wrong_token_is_rejected(self):
        self.assertEqual(self.request("/event", self.event("wrong"), token="nope"), 401)
        self.assertEqual(self.request("/api/state", token="nope"), 401)
        self.assertEqual(self.request("/api/state?token=nope"), 401)
        self.assertEqual(self.request("/stream?token="), 401)

    def test_bearer_header_is_allowed(self):
        self.assertEqual(self.request("/event", self.event("bearer-ok"), token=self.TOKEN), 200)
        self.assertEqual(self.request("/api/state", token=self.TOKEN), 200)
        status, line = self.request("/stream", token=self.TOKEN, read_line=True)
        self.assertEqual(status, 200)
        self.assertTrue(line.startswith(b"data: "))

    def test_token_in_query_is_allowed(self):
        self.assertEqual(self.request(f"/event?token={self.TOKEN}", self.event("query-ok")), 200)
        self.assertEqual(self.request(f"/api/state?token={self.TOKEN}"), 200)
        status, line = self.request(f"/stream?token={self.TOKEN}", read_line=True)
        self.assertEqual(status, 200)
        self.assertIn(b'"type": "state"', line)

    def test_page_itself_needs_no_token(self):
        self.assertEqual(self.request("/"), 200)
        self.assertEqual(self.request("/auth.js"), 200)

    def test_client_sends_its_token(self):
        sid = "client-token"
        agent = Agent("token-bot", session_id=sid, url=self.base, token=self.TOKEN)
        agent.start()
        webgentz_client._get_sender().flush()
        self.assertIn(sid, [a["id"] for a in server.world.snapshot()])

        stray = Agent("stray-bot", session_id="client-no-token", url=self.base, token=None)
        stray.token = None  # ignore any WEBGENTZ_TOKEN in the test runner's environment
        stray.start()
        webgentz_client._get_sender().flush()
        self.assertNotIn("client-no-token", [a["id"] for a in server.world.snapshot()])


if __name__ == "__main__":
    unittest.main()
