"""Webgentz world server.

Receives events from Claude Code hooks, keeps track of every agent,
stores the history in SQLite, and serves the village web page.

Run it with:  python3 server.py
Then open:    http://localhost:8765

Only the Python standard library is used, so there is nothing to install.
"""

import json
import os
import queue
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = os.environ.get("WEBGENTZ_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEBGENTZ_PORT", "8765"))
ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
DB_PATH = Path(os.environ.get("WEBGENTZ_DB", ROOT / "webgentz.db"))

# An agent with no events for this long is shown asleep.
SLEEP_AFTER_SECONDS = 10 * 60
# How many recent events each agent keeps in memory for the side panel.
RECENT_EVENTS = 40

# Which building an agent walks to for each tool.
TOOL_BUILDINGS = {
    "Read": "library", "Grep": "library", "Glob": "library", "LS": "library",
    "WebFetch": "library", "WebSearch": "library",
    "Edit": "workshop", "MultiEdit": "workshop", "Write": "workshop",
    "NotebookEdit": "workshop",
    "Bash": "forge", "BashOutput": "forge", "KillShell": "forge",
    "Task": "barracks", "Agent": "barracks",
    "TodoWrite": "townhall", "ExitPlanMode": "townhall",
}

BUILDING_ACTIVITY = {
    "library": "researching",
    "workshop": "building",
    "forge": "running commands",
    "barracks": "briefing a helper",
    "townhall": "planning",
    "market": "trading with an outside tool",
    "square": "working",
}


# ---------------------------------------------------------------- storage

class Store:
    """Saves every raw event so the world can be rebuilt after a restart."""

    def __init__(self, path):
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS events ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " received REAL NOT NULL,"
            " session_id TEXT NOT NULL,"
            " body TEXT NOT NULL)"
        )
        self.db.commit()

    def add(self, event):
        with self.lock:
            self.db.execute(
                "INSERT INTO events (received, session_id, body) VALUES (?, ?, ?)",
                (event["received"], event["session_id"], json.dumps(event)),
            )
            self.db.commit()

    def all(self):
        with self.lock:
            rows = self.db.execute("SELECT body FROM events ORDER BY id").fetchall()
        return [json.loads(r[0]) for r in rows]


# ---------------------------------------------------------------- tokens

def read_token_usage(transcript_path):
    """Add up token usage from a Claude Code transcript (.jsonl) file.

    Each line of the transcript is one JSON record. Assistant replies carry a
    `usage` block. One reply can be split over several lines that share the
    same message id, so we count each message id once.
    """
    totals = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    model = None
    if not transcript_path or not os.path.exists(transcript_path):
        return totals, model
    per_message = {}
    try:
        with open(transcript_path, encoding="utf-8") as f:
            for line in f:
                if '"usage"' not in line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                message = record.get("message") or {}
                usage = message.get("usage")
                if not isinstance(usage, dict):
                    continue
                model = message.get("model") or model
                key = message.get("id") or record.get("uuid")
                per_message[key] = usage
    except OSError:
        return totals, model
    for usage in per_message.values():
        totals["input"] += usage.get("input_tokens") or 0
        totals["output"] += usage.get("output_tokens") or 0
        totals["cache_read"] += usage.get("cache_read_input_tokens") or 0
        totals["cache_write"] += usage.get("cache_creation_input_tokens") or 0
    return totals, model


# ---------------------------------------------------------------- world state

def short_text(value, limit=80):
    if value is None:
        return ""
    text = value if isinstance(value, str) else json.dumps(value)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def describe_tool(tool_name, tool_input):
    """One short human line about what a tool call is doing."""
    tool_input = tool_input or {}
    for key in ("file_path", "path", "pattern", "url", "query", "command", "description", "prompt"):
        if key in tool_input:
            value = tool_input[key]
            if key in ("file_path", "path"):
                value = os.path.basename(str(value)) or value
            return f"{tool_name}: {short_text(value, 60)}"
    return tool_name


def building_for_tool(tool_name):
    if not tool_name:
        return "square"
    if tool_name.startswith("mcp__"):
        return "market"
    return TOOL_BUILDINGS.get(tool_name, "square")


class World:
    """Turns the stream of hook events into a picture of every agent."""

    def __init__(self):
        self.lock = threading.Lock()
        self.agents = {}

    def _agent(self, event):
        sid = event["session_id"]
        agent = self.agents.get(sid)
        if agent is None:
            cwd = event.get("cwd") or ""
            project = os.path.basename(cwd.rstrip("/")) or "agent"
            agent = {
                "id": sid,
                "name": f"{project}-{sid[:4]}",
                "project": project,
                "cwd": cwd,
                "model": None,
                "status": "idle",
                "location": "square",
                "activity": "just arrived",
                "detail": "",
                "started": event["received"],
                "last_seen": event["received"],
                "tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0},
                "tool_counts": {},
                "prompts": 0,
                "recent": [],
            }
            self.agents[sid] = agent
        return agent

    def apply(self, event):
        """Update the world for one event. Returns the changed agent."""
        with self.lock:
            agent = self._agent(event)
            kind = event.get("hook_event_name", "")
            agent["last_seen"] = event["received"]
            if event.get("cwd"):
                agent["cwd"] = event["cwd"]
            line = kind

            if kind == "SessionStart":
                agent.update(status="idle", location="square", activity="just arrived", detail="")
                line = "Arrived in the village"
            elif kind == "UserPromptSubmit":
                agent["prompts"] += 1
                prompt = short_text(event.get("prompt"), 70)
                agent.update(status="working", location="townhall", activity="taking orders", detail=prompt)
                line = f"New orders: {prompt}"
            elif kind == "PreToolUse":
                tool = event.get("tool_name") or "tool"
                building = building_for_tool(tool)
                agent["tool_counts"][tool] = agent["tool_counts"].get(tool, 0) + 1
                desc = describe_tool(tool, event.get("tool_input"))
                agent.update(status="working", location=building,
                             activity=BUILDING_ACTIVITY[building], detail=desc)
                line = desc
            elif kind == "PostToolUse":
                line = f"Finished {event.get('tool_name') or 'tool'}"
            elif kind == "Notification":
                message = short_text(event.get("message"), 70) or "Needs your attention"
                agent.update(status="needs_you", location="townhall", activity="waiting for you", detail=message)
                line = message
            elif kind == "Stop":
                agent.update(status="idle", location="campfire", activity="resting", detail="Finished the job")
                line = "Finished and resting at the campfire"
            elif kind == "SubagentStop":
                line = "A helper finished its task"
            elif kind == "SessionEnd":
                agent.update(status="gone", location="gate", activity="left the village", detail="")
                line = "Left the village"

            # Demo events carry tokens directly; real ones are read from the transcript.
            if isinstance(event.get("tokens"), dict):
                agent["tokens"] = {**agent["tokens"], **event["tokens"]}
            if event.get("model"):
                agent["model"] = event["model"]
            if event.get("transcript_path") and kind in ("SessionStart", "PostToolUse", "Stop", "SessionEnd", "UserPromptSubmit"):
                tokens, model = read_token_usage(event["transcript_path"])
                if any(tokens.values()):
                    agent["tokens"] = tokens
                if model:
                    agent["model"] = model

            agent["recent"].append({"time": event["received"], "kind": kind, "text": line})
            del agent["recent"][:-RECENT_EVENTS]
            return self.public(agent)

    def public(self, agent):
        view = dict(agent)
        if view["status"] not in ("gone",) and time.time() - view["last_seen"] > SLEEP_AFTER_SECONDS:
            view["status"] = "sleeping"
            view["location"] = "houses"
            view["activity"] = "asleep"
        return view

    def snapshot(self):
        with self.lock:
            return [self.public(a) for a in self.agents.values()]


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
world = World()
broadcaster = Broadcaster()

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


def ingest(raw):
    """Clean up one incoming event, save it, and update the world."""
    if not isinstance(raw, dict) or not raw.get("session_id"):
        raise ValueError("event needs a session_id")
    event = {k: raw[k] for k in (
        "session_id", "hook_event_name", "cwd", "transcript_path", "tool_name",
        "tool_input", "prompt", "message", "source", "tokens", "model",
    ) if k in raw}
    event["session_id"] = str(event["session_id"])
    event["received"] = time.time()
    # Keep tool inputs small so the database does not fill up with file contents.
    if "tool_input" in event:
        event["tool_input"] = {k: short_text(v, 200) for k, v in (event["tool_input"] or {}).items()}
    if "prompt" in event:
        event["prompt"] = short_text(event["prompt"], 500)
    store.add(event)
    agent = world.apply(event)
    broadcaster.send({"type": "agent", "agent": agent})
    return agent


class Handler(BaseHTTPRequestHandler):
    server_version = "Webgentz/0.1"

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlparse(self.path).path != "/event":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        try:
            ingest(json.loads(self.rfile.read(length) or b"{}"))
        except (ValueError, json.JSONDecodeError) as exc:
            return self._json(400, {"error": str(exc)})
        self._json(200, {"ok": True})

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/state":
            return self._json(200, {"agents": world.snapshot(), "now": time.time()})
        if path == "/stream":
            return self._stream()
        return self._static(path)

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
    for event in store.all():
        world.apply(event)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"Webgentz village is open at http://{HOST}:{PORT}  (Ctrl+C to close)")
    print(f"Saving history to {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nVillage closed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
