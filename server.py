"""Webgentz jungle server.

Receives events from your agents, keeps track of every agent, stores the
history in SQLite, sends a desktop notification when an agent needs you,
and serves the jungle web page.

Run it with:  python3 server.py
Then open:    http://localhost:8765

Only the Python standard library is used, so there is nothing to install.
"""

import json
import os
import queue
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from webgentz_core import EventError, LayerConfig, Pricing, World, normalize_event

HOST = os.environ.get("WEBGENTZ_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEBGENTZ_PORT", "8765"))
ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
DB_PATH = Path(os.environ.get("WEBGENTZ_DB", ROOT / "webgentz.db"))
CONFIG_PATH = Path(os.environ.get("WEBGENTZ_CONFIG", ROOT / "webgentz.json"))
PRICING_PATH = Path(os.environ.get("WEBGENTZ_PRICING", ROOT / "pricing.json"))
# Raw events older than this are deleted. Daily totals are kept forever.
KEEP_DAYS = int(os.environ.get("WEBGENTZ_KEEP_DAYS", "30"))
# Set WEBGENTZ_NOTIFY=0 to turn off desktop notifications.
NOTIFY = os.environ.get("WEBGENTZ_NOTIFY", "1") != "0"
# Say when an agent finishes a task that took at least this long.
DONE_ALERT_AFTER_SECONDS = int(os.environ.get("WEBGENTZ_DONE_ALERT_SECONDS", "60"))
MAX_EVENT_BYTES = 256 * 1024


def day_of(timestamp):
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d")


# ---------------------------------------------------------------- storage

class Store:
    """The SQLite database: every raw event, plus daily totals per agent."""

    def __init__(self, path):
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                received REAL NOT NULL,
                session_id TEXT NOT NULL,
                body TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS events_received ON events (received);
            CREATE INDEX IF NOT EXISTS events_session ON events (session_id, id);
            CREATE TABLE IF NOT EXISTS daily (
                day TEXT NOT NULL,
                session_id TEXT NOT NULL,
                name TEXT, agent_type TEXT, layer TEXT, model TEXT,
                input INTEGER DEFAULT 0, output INTEGER DEFAULT 0,
                cache_read INTEGER DEFAULT 0, cache_write INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0, tool_calls INTEGER DEFAULT 0,
                prompts INTEGER DEFAULT 0, events INTEGER DEFAULT 0,
                PRIMARY KEY (day, session_id));
            """
        )
        self.db.commit()

    def add(self, event, agent, change):
        with self.lock:
            self.db.execute(
                "INSERT INTO events (received, session_id, body) VALUES (?, ?, ?)",
                (event["received"], event["session_id"], json.dumps(event)),
            )
            t = change["tokens"]
            self.db.execute(
                """
                INSERT INTO daily (day, session_id, name, agent_type, layer, model, input, output,
                                   cache_read, cache_write, cost_usd, tool_calls, prompts, events)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT (day, session_id) DO UPDATE SET
                    name = excluded.name, agent_type = excluded.agent_type, layer = excluded.layer,
                    model = COALESCE(excluded.model, daily.model),
                    input = daily.input + excluded.input, output = daily.output + excluded.output,
                    cache_read = daily.cache_read + excluded.cache_read,
                    cache_write = daily.cache_write + excluded.cache_write,
                    cost_usd = daily.cost_usd + excluded.cost_usd,
                    tool_calls = daily.tool_calls + excluded.tool_calls,
                    prompts = daily.prompts + excluded.prompts,
                    events = daily.events + 1
                """,
                (day_of(event["received"]), event["session_id"], agent["name"], agent["agent_type"],
                 agent["layer"], agent["model"], t["input"], t["output"], t["cache_read"],
                 t["cache_write"], change["cost_usd"], 1 if change["tool"] else 0,
                 1 if change["prompt"] else 0),
            )
            self.db.commit()

    def recent_events(self, since):
        with self.lock:
            rows = self.db.execute(
                "SELECT body FROM events WHERE received >= ? ORDER BY id", (since,)
            ).fetchall()
        return [json.loads(r[0]) for r in rows]

    def prune(self, keep_days):
        cutoff = time.time() - keep_days * 86400
        with self.lock:
            deleted = self.db.execute("DELETE FROM events WHERE received < ?", (cutoff,)).rowcount
            self.db.commit()
        if deleted:
            print(f"Deleted {deleted} events older than {keep_days} days (daily totals are kept).")

    def daily(self, days):
        first = (datetime.now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
        with self.lock:
            cur = self.db.execute("SELECT * FROM daily WHERE day >= ? ORDER BY day, session_id", (first,))
            cols = [c[0] for c in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def timeline(self, session_id=None, limit=200):
        with self.lock:
            if session_id:
                rows = self.db.execute(
                    "SELECT body FROM events WHERE session_id = ? ORDER BY id DESC LIMIT ?", (session_id, limit)
                ).fetchall()
            else:
                rows = self.db.execute("SELECT body FROM events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [json.loads(r[0]) for r in rows]


# ---------------------------------------------------------------- notifications

class Notifier:
    """Pops up a desktop notification when an agent needs you or looks stuck."""

    def __init__(self, enabled):
        self.enabled = enabled
        self.flagged = set()  # (agent id, status) pairs already announced

    def _show(self, title, message):
        if not self.enabled:
            return
        try:
            if sys.platform == "darwin":
                script = f"display notification {json.dumps(message)} with title {json.dumps(title)}"
                subprocess.Popen(["osascript", "-e", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif shutil.which("notify-send"):
                subprocess.Popen(["notify-send", title, message], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError:
            pass

    def check(self, agent):
        """Announce an agent once each time it needs you, gets stuck, or finishes a long task."""
        key = agent["id"]
        status = agent["status"]
        finished, started = agent.get("finished_at"), agent.get("task_started")
        if (status == "idle" and finished and started and finished - started >= DONE_ALERT_AFTER_SECONDS
                and time.time() - finished < 120 and (key, "done", finished) not in self.flagged):
            self.flagged.add((key, "done", finished))
            answer = " ".join((agent.get("answer") or "").split())
            self._show(f"{agent['name']} is done", answer[:120] or "Finished the job. Click it in the jungle to jump there.")
            return
        if status in ("needs_you", "stuck"):
            if (key, status) not in self.flagged:
                self.flagged.add((key, status))
                if status == "needs_you":
                    self._show(f"{agent['name']} needs you", agent.get("detail") or "Waiting for your answer")
                else:
                    self._show(f"{agent['name']} may be stuck", "No activity for 5 minutes")
        else:
            self.flagged = {f for f in self.flagged if f[0] != key or f[1] == "done"}


# ---------------------------------------------------------------- jumping to an agent

# AppleScript that finds the Terminal or iTerm2 tab running on a given tty
# and brings it to the front. The tty is passed as an argument, never pasted
# into the script.
TERMINAL_SCRIPT = """
on run argv
  set target to item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is target then
          set selected tab of w to t
          set index of w to 1
          activate
          return "found"
        end if
      end repeat
    end repeat
    activate
  end tell
end run
"""

ITERM_SCRIPT = """
on run argv
  set target to item 1 of argv
  tell application "iTerm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if tty of s is target then
            select w
            select t
            select s
            activate
            return "found"
          end if
        end repeat
      end repeat
    end repeat
    activate
  end tell
end run
"""

# Editors open the agent's project folder, which focuses the right window.
EDITORS = ("Visual Studio Code", "Cursor", "Windsurf", "Zed")


def open_command(agent, platform=sys.platform):
    """The command that brings an agent's window to the front, and a label for it.

    Returns (None, reason) when there is nowhere to go.
    """
    where = agent.get("open") or {}
    app, tty, url = where.get("app"), where.get("tty"), where.get("url")
    cwd = agent.get("cwd") or ""
    if platform == "darwin":
        if app == "Terminal" and tty:
            return ["osascript", "-e", TERMINAL_SCRIPT, tty], "Terminal"
        if app == "iTerm2" and tty:
            return ["osascript", "-e", ITERM_SCRIPT, tty], "iTerm2"
        if app in EDITORS and cwd and os.path.isdir(cwd):
            return ["open", "-a", app, cwd], app
        if app:
            return ["open", "-a", app], app
        if url:
            return ["open", url], "your browser"
    elif url and shutil.which("xdg-open"):
        return ["xdg-open", url], "your browser"
    elif app:
        return None, "Jumping to an app only works on a Mac for now"
    return None, "This agent did not say where it is running"


def open_agent(agent_id):
    agent = next((a for a in world.snapshot() if a["id"] == agent_id), None)
    if agent is None:
        return 404, {"error": "no agent with that id"}
    command, label = open_command(agent)
    if command is None:
        return 409, {"error": label}
    try:
        subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as exc:
        return 500, {"error": f"could not open {label}: {exc}"}
    return 200, {"ok": True, "opened": label}


# ---------------------------------------------------------------- live updates

class Broadcaster:
    """Pushes updates to every open browser tab (Server-Sent Events)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.clients = set()

    def subscribe(self):
        q = queue.Queue(maxsize=500)
        with self.lock:
            self.clients.add(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            self.clients.discard(q)

    def send(self, message):
        with self.lock:
            for q in list(self.clients):
                try:
                    q.put_nowait(message)
                except queue.Full:
                    self.clients.discard(q)


store = Store(DB_PATH)
world = World(layers=LayerConfig(CONFIG_PATH), pricing=Pricing(PRICING_PATH))
broadcaster = Broadcaster()
notifier = Notifier(NOTIFY)

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


def ingest(raw):
    """Check one incoming event, update the world, save it, and tell the page."""
    event = normalize_event(raw)
    agent, change = world.apply(event)
    store.add(event, agent, change)
    broadcaster.send({"type": "agent", "agent": agent})
    notifier.check(agent)
    return agent


def watch_for_quiet_agents():
    """Every 30 seconds: spot agents that went quiet, and tidy the database daily."""
    last_prune = time.time()
    while True:
        time.sleep(30)
        for agent in world.snapshot():
            notifier.check(agent)
            if agent["status"] in ("stuck", "sleeping"):
                broadcaster.send({"type": "agent", "agent": agent})
        if time.time() - last_prune > 86400:
            store.prune(KEEP_DAYS)
            last_prune = time.time()


class Handler(BaseHTTPRequestHandler):
    server_version = "Webgentz/0.2"

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _from_other_website(self):
        """Browsers say which site a request came from. Only our own page, and
        browser extensions you installed (like the chat-tabs one), may post."""
        origin = self.headers.get("Origin")
        if not origin:
            return False  # scripts and hooks, not a browser
        url = urlparse(origin)
        if url.scheme in ("chrome-extension", "moz-extension"):
            return False
        return url.hostname not in ("localhost", "127.0.0.1", "::1")

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/event", "/api/open"):
            return self._json(404, {"error": "not found"})
        if self._from_other_website():
            return self._json(403, {"error": "requests from other websites are not allowed"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_EVENT_BYTES:
            return self._json(413, {"error": "event is too large"})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "the body is not valid JSON"})
        if path == "/api/open":
            if not isinstance(body, dict) or not isinstance(body.get("id"), str):
                return self._json(400, {"error": "send {\"id\": \"<agent id>\"}"})
            return self._json(*open_agent(body["id"]))
        try:
            ingest(body)
        except EventError as exc:
            return self._json(400, {"error": str(exc)})
        self._json(200, {"ok": True})

    def do_GET(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        if url.path == "/api/state":
            return self._json(200, {"agents": world.snapshot(), "now": time.time()})
        if url.path == "/api/daily":
            days = max(1, min(366, int((query.get("days") or ["14"])[0])))
            return self._json(200, {"days": days, "rows": store.daily(days)})
        if url.path == "/api/timeline":
            session = (query.get("session") or [None])[0]
            limit = max(1, min(1000, int((query.get("limit") or ["200"])[0])))
            return self._json(200, {"events": store.timeline(session, limit)})
        if url.path == "/stream":
            return self._stream()
        return self._static(url.path)

    def _stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        q = broadcaster.subscribe()
        try:
            self.wfile.write(f"data: {json.dumps({'type': 'state', 'agents': world.snapshot()})}\n\n".encode())
            self.wfile.flush()
            while True:
                try:
                    message = q.get(timeout=15)
                    self.wfile.write(f"data: {json.dumps(message)}\n\n".encode())
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")  # keeps the connection open
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            broadcaster.unsubscribe(q)

    def _static(self, path):
        if path == "/":
            path = "/index.html"
        target = (WEB_DIR / path.lstrip("/")).resolve()
        if WEB_DIR not in target.parents or not target.is_file():
            return self._json(404, {"error": "not found"})
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    store.prune(KEEP_DAYS)
    # Rebuild the live view from the last day of events. Daily totals are
    # already saved, so replaying does not count anything twice.
    for event in store.recent_events(time.time() - 86400):
        try:
            world.apply(normalize_event(event, now=event["received"]))
        except (EventError, KeyError):
            continue
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        sys.exit(f"Port {PORT} is already in use. The jungle may already be running "
                 f"(check with `python3 autostart.py status`), or set WEBGENTZ_PORT to another port.")
    server.daemon_threads = True
    threading.Thread(target=watch_for_quiet_agents, daemon=True).start()
    print(f"Webgentz jungle is open at http://{HOST}:{PORT}  (Ctrl+C to close)")
    print(f"Saving history to {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nJungle closed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
