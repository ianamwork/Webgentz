"""Tests for the server: saving events, daily totals, and the HTTP API.

Run them with:  python3 -m unittest discover tests
"""

import io
import json
import os
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import types
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


def tearDownModule():
    server.store.close()


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

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

    def test_tracker_origins_may_only_post_events(self):
        def status(path, origin, body):
            req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "Origin": origin})
            try:
                with urllib.request.urlopen(req) as r:
                    return r.status
            except urllib.error.HTTPError as e:
                e.close()
                return e.code
        event = {"session_id": "tracker-origin", "event": "start", "agent_type": "python"}
        for origin in ("https://claude.ai", "chrome-extension://abcdef"):
            self.assertEqual(status("/event", origin, event), 200, origin)
            for path in ("/api/open", "/api/close", "/api/dismiss", "/api/spawn", "/api/note"):
                self.assertEqual(status(path, origin, {"id": "tracker-origin", "text": "hi"}), 403, (origin, path))

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
        cls.httpd.server_close()

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


class BadInputTests(unittest.TestCase):
    """Odd or hostile requests get a clear 4xx answer, never a dropped connection."""

    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def raw(self, request):
        """Send raw bytes and return the HTTP status code (None if the server hung up)."""
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as s:
            s.sendall(request)
            first = s.makefile("rb").readline()
        parts = first.split()
        return int(parts[1]) if len(parts) > 1 else None

    def post(self, path, body):
        return self.raw(b"POST " + path.encode() + b" HTTP/1.1\r\nHost: x\r\nContent-Length: "
                        + str(len(body)).encode() + b"\r\n\r\n" + body)

    def get(self, path):
        return self.raw(b"GET " + path + b" HTTP/1.1\r\nHost: x\r\n\r\n")

    def test_bad_content_length(self):
        self.assertEqual(self.raw(b"POST /event HTTP/1.1\r\nHost: x\r\nContent-Length: abc\r\n\r\n{}"), 400)
        # A negative length used to wait forever for the client to hang up.
        self.assertEqual(self.raw(b"POST /event HTTP/1.1\r\nHost: x\r\nContent-Length: -1\r\n\r\n{}"), 400)

    def test_body_that_is_not_utf8(self):
        self.assertEqual(self.post("/event", b'{"session_id": "\xff\xfe"}'), 400)

    def test_event_name_that_is_a_list_or_object(self):
        self.assertEqual(self.post("/event", b'{"session_id": "a", "event": ["start"]}'), 400)
        self.assertEqual(self.post("/event", b'{"session_id": "a", "hook_event_name": {}}'), 400)

    def test_note_with_wrong_types(self):
        self.assertEqual(self.post("/api/note", b'{"text": 5}'), 400)
        self.assertEqual(self.post("/api/note", b'{"text": "typed author", "author": 5}'), 200)
        self.assertEqual(server.store.notes(1)[-1]["author"], "you")
        self.assertEqual(self.post("/api/note", b'{"text": "named", "author": "ian"}'), 200)
        self.assertEqual(server.store.notes(1)[-1]["author"], "ian")

    def test_approve_and_deny_are_recorded_as_notes(self):
        server.world.apply(server.normalize_event({"session_id": "appr-1", "event": "needs_you",
                                                   "name": "api-server", "message": "Run tests?"}))
        self.assertEqual(self.post("/api/note", b'{"agent_id": "appr-1", "approved": true}'), 200)
        self.assertEqual(server.store.notes(1)[0]["text"], "Approved api-server: Run tests?")
        self.assertEqual(self.post("/api/note", b'{"agent_id": "appr-1", "approved": false}'), 200)
        self.assertEqual(server.store.notes(1)[0]["text"], "Denied api-server: Run tests?")
        # An agent the server does not know (demo mode) uses the name the page sent.
        self.assertEqual(self.post("/api/note", b'{"agent_id": "nope", "approved": true, "agent_name": "demo-ant"}'), 200)
        self.assertEqual(server.store.notes(1)[0]["text"], "Approved demo-ant")
        # Not an approval: still needs text.
        self.assertEqual(self.post("/api/note", b'{"agent_id": "appr-1", "approved": "yes"}'), 400)
        self.assertEqual(self.post("/api/note", b'{"approved": true}'), 400)

    def test_query_numbers_that_are_not_numbers(self):
        for path in (b"/api/daily?days=abc", b"/api/notes?limit=x", b"/api/memory?n=x",
                     b"/api/ledger?limit=1.5", b"/api/timeline?limit=ten"):
            self.assertEqual(self.get(path), 400, path)
        # Numbers out of range are still clamped, as before.
        self.assertEqual(self.get(b"/api/daily?days=-3"), 200)
        self.assertEqual(self.get(b"/api/timeline?limit=99999"), 200)

    def test_static_paths_that_cannot_be_files(self):
        self.assertEqual(self.get(b"/" + b"a" * 5000), 404)  # name too long for the OS
        self.assertEqual(self.get(b"/a\x00b"), 404)
        self.assertEqual(self.get(b"/../server.py"), 404)
        self.assertEqual(self.get(b"/index.html"), 200)

    def test_stream_closes_when_the_tab_falls_too_far_behind(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as s:
            s.sendall(b"GET /stream HTTP/1.1\r\nHost: x\r\n\r\n")
            f = s.makefile("rb")
            while not f.readline().startswith(b"data: "):
                pass  # headers, then the first state message
            # Send faster than this tab reads, until the broadcaster drops it.
            for _ in range(200000):
                with server.broadcaster.lock:
                    if not server.broadcaster.clients:
                        break
                server.broadcaster.send({"type": "filler"})
            deadline = time.time() + 5
            while time.time() < deadline and f.readline():
                pass
            self.assertLess(time.time(), deadline, "stream stayed open after the tab was dropped")


class BackgroundThreadTests(unittest.TestCase):
    def test_watcher_survives_an_error(self):
        class Stop(BaseException):
            pass

        fake_time = types.SimpleNamespace(sleep=mock.Mock(side_effect=[None, None, Stop()]), time=time.time)
        snapshot = mock.Mock(side_effect=[sqlite3.OperationalError("database is locked"), []])
        with mock.patch.object(server, "time", fake_time), \
                mock.patch.object(server.world, "snapshot", snapshot), \
                mock.patch("sys.stderr", io.StringIO()):
            with self.assertRaises(Stop):
                server.watch_for_quiet_agents()
        self.assertEqual(snapshot.call_count, 2)  # kept going after the first pass failed

    def test_notifier_is_safe_across_threads(self):
        n = server.Notifier(False)
        errors = []

        def run(status):
            try:
                for i in range(20000):
                    n.check({"id": f"{status}{i}", "name": "x", "status": status})
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        old = sys.getswitchinterval()
        sys.setswitchinterval(1e-6)
        try:
            threads = [threading.Thread(target=run, args=(s,)) for s in ("needs_you", "working")]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        finally:
            sys.setswitchinterval(old)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
