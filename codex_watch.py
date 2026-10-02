"""Show OpenAI Codex CLI sessions in the Webgentz jungle.

Codex writes a log of every session ("rollout" files) under
~/.codex/sessions/. This script follows those files as they grow and turns
what Codex does into jungle events: new tasks, tool calls, and token totals.

    python3 codex_watch.py

Keep it running next to server.py (or install it with autostart.py). Codex
does not write approval requests to its log, so Codex agents never show the
"needs you" state; everything else works.
"""

import glob
import json
import os
import sys
import time
from pathlib import Path

from webgentz_client import Agent

SESSIONS_DIR = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "sessions"
POLL_SECONDS = 1.0
# Only follow files touched recently, so old sessions are not replayed.
RECENT_SECONDS = 6 * 60 * 60

TOOL_ITEM_TYPES = ("function_call", "custom_tool_call", "local_shell_call", "web_search_call")


def tokens_from_codex(usage):
    """Codex counts cached input inside input_tokens; split it out."""
    if not isinstance(usage, dict):
        return None
    cached = usage.get("cached_input_tokens") or 0
    return {
        "input": max(0, (usage.get("input_tokens") or 0) - cached),
        "output": usage.get("output_tokens") or 0,
        "cache_read": cached,
        "cache_write": usage.get("cache_write_input_tokens") or 0,
    }


def tool_detail(payload):
    """A short description of a Codex tool call."""
    args = payload.get("arguments") or payload.get("input") or ""
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            return args.strip().splitlines()[0][:60] if args.strip() else None
    if isinstance(args, dict):
        cmd = args.get("command") or args.get("cmd")
        if isinstance(cmd, list):
            cmd = " ".join(str(c) for c in cmd)
            if cmd.startswith("bash -lc "):
                cmd = cmd[len("bash -lc "):]
        if cmd:
            return str(cmd)[:60]
        if args.get("query"):
            return str(args["query"])[:60]
    action = payload.get("action")
    if isinstance(action, dict) and action.get("query"):
        return str(action["query"])[:60]
    return None


class Session:
    """Follows one rollout file."""

    def __init__(self, path):
        self.path = path
        self.offset = 0
        self.agent = None
        self.model = None
        self.cwd = None
        self.last_tool = None
        self.pending = []  # lines seen before the session's id is known

    def _ensure_agent(self, session_id=None):
        if self.agent is None:
            sid = session_id or Path(self.path).stem
            name = f"{Path(self.cwd).name}-codex" if self.cwd else "codex"
            self.agent = Agent(name, agent_type="codex", session_id=f"codex-{sid}", cwd=self.cwd or os.getcwd())
            self.agent._send("start", model=self.model)
        return self.agent

    def read_new_lines(self):
        try:
            size = os.path.getsize(self.path)
            if size <= self.offset:
                return
            with open(self.path, "rb") as f:
                f.seek(self.offset)
                chunk = f.read()
        except OSError:
            return
        end = chunk.rfind(b"\n")
        if end < 0:
            return
        self.offset += end + 1
        for line in chunk[: end + 1].splitlines():
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if isinstance(record, dict):
                self.handle(record)

    def handle(self, record):
        kind = record.get("type")
        payload = record.get("payload") or {}
        if not isinstance(payload, dict):
            return
        if kind == "session_meta":
            self.cwd = payload.get("cwd") or self.cwd
            self._ensure_agent(payload.get("id") or payload.get("session_id"))
            return
        if kind == "turn_context":
            self.model = payload.get("model") or self.model
            self.cwd = payload.get("cwd") or self.cwd
            return

        agent = self._ensure_agent()
        if kind == "response_item" and payload.get("type") in TOOL_ITEM_TYPES:
            tool = payload.get("name") or payload.get("type").replace("_call", "")
            self.last_tool = tool
            agent.tool_start(tool, tool_detail(payload))
        elif kind == "event_msg":
            event = payload.get("type")
            if event == "user_message":
                agent.prompt(payload.get("message") or "")
            elif event == "token_count":
                info = payload.get("info") or {}
                tokens = tokens_from_codex(info.get("total_token_usage"))
                if tokens:
                    agent._send("tool_end", tool=self.last_tool, tokens=tokens, model=self.model)
            elif event in ("task_complete", "turn_complete", "turn_aborted"):
                agent.done()


def find_rollouts(now):
    files = glob.glob(str(SESSIONS_DIR / "**" / "rollout-*.jsonl"), recursive=True)
    return [f for f in files if now - os.path.getmtime(f) < RECENT_SECONDS]


def main():
    if not SESSIONS_DIR.exists():
        print(f"Waiting for Codex to create {SESSIONS_DIR} ...")
    print("Following Codex sessions. Press Ctrl+C to stop.")
    sessions = {}
    first_pass = True
    try:
        while True:
            now = time.time()
            for path in find_rollouts(now):
                if path not in sessions:
                    session = Session(path)
                    if first_pass and now - os.path.getmtime(path) > 60:
                        # an older, finished session: skip its history and only follow new lines
                        session.offset = os.path.getsize(path)
                    sessions[path] = session
                sessions[path].read_new_lines()
            first_pass = False
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
