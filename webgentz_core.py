"""The logic at the heart of Webgentz, with no web server or database attached.

Everything here is plain Python so it can be tested on its own (see tests/).

    normalize_event()  checks an incoming event and puts it in the standard shape
    World              turns events into "where is each agent and what is it doing"
    TranscriptReader   adds up token usage from Claude Code transcript files
    Pricing            turns token counts into dollars
"""

import glob
import json
import os
import re
import threading
import time

EVENT_VERSION = 1

# The standard event names (see EVENTS.md), and the Claude Code hook names
# that mean the same thing.
EVENT_NAMES = ("start", "prompt", "tool_start", "tool_end", "needs_you", "done", "helper_done", "end")
ALIASES = {
    "SessionStart": "start",
    "UserPromptSubmit": "prompt",
    "PreToolUse": "tool_start",
    "PostToolUse": "tool_end",
    "Notification": "needs_you",
    "Stop": "done",
    "SubagentStop": "helper_done",
    "SessionEnd": "end",
}

LAYERS = ("roots", "understory", "canopy")
TOKEN_KINDS = ("input", "output", "cache_read", "cache_write")

# An agent that is working but has sent nothing for this long might be stuck.
STUCK_AFTER_SECONDS = 5 * 60
# An agent that is resting and has sent nothing for this long is asleep.
SLEEP_AFTER_SECONDS = 10 * 60
# Agents that left more than this long ago are dropped from the live view.
FORGET_GONE_AFTER_SECONDS = 24 * 60 * 60
RECENT_EVENTS = 40
# Keep this much of an agent's final answer.
ANSWER_CHARS = 2000

# Apps Webgentz may bring to the front when you click an agent. Only these
# names are accepted in an event's `open` field.
OPEN_APPS = (
    "Terminal", "iTerm2", "Visual Studio Code", "Cursor", "Windsurf", "Zed", "Warp",
    "Ghostty", "WezTerm", "Alacritty", "kitty", "Claude", "ChatGPT", "Codex",
)

# Which spot an agent goes to for each tool.
TOOL_LOCATIONS = {
    "Read": "library", "Grep": "library", "Glob": "library", "LS": "library",
    "WebFetch": "library", "WebSearch": "library",
    "Edit": "workshop", "MultiEdit": "workshop", "Write": "workshop",
    "NotebookEdit": "workshop",
    "Bash": "forge", "BashOutput": "forge", "KillShell": "forge", "shell": "forge",
    "Task": "barracks", "Agent": "barracks",
    "TodoWrite": "townhall", "ExitPlanMode": "townhall",
    "llm_call": "townhall",
    # Codex tool names
    "exec_command": "forge", "local_shell": "forge", "write_stdin": "forge",
    "apply_patch": "workshop", "web_search": "library", "view_image": "library",
    "update_plan": "townhall",
}

LOCATION_ACTIVITY = {
    "library": "researching",
    "workshop": "building",
    "forge": "running commands",
    "barracks": "briefing a helper",
    "townhall": "planning",
    "market": "using an outside tool",
    "square": "working",
}


class EventError(ValueError):
    """An event that does not follow the format in EVENTS.md."""


# ---------------------------------------------------------------- helpers

def short_text(value, limit=80):
    if value is None:
        return ""
    text = value if isinstance(value, str) else json.dumps(value)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def empty_tokens():
    return {k: 0 for k in TOKEN_KINDS}


def clean_tokens(raw, field):
    if not isinstance(raw, dict):
        raise EventError(f"'{field}' must be an object like {{\"input\": 10, \"output\": 5}}")
    out = {}
    for key, value in raw.items():
        if key not in TOKEN_KINDS:
            raise EventError(f"'{field}' has an unknown key '{key}' (use {', '.join(TOKEN_KINDS)})")
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
            raise EventError(f"'{field}.{key}' must be a number of 0 or more")
        out[key] = int(value)
    return out


def clean_open(raw):
    """Check the `open` field: where to take you when you click the agent."""
    if not isinstance(raw, dict):
        raise EventError("'open' must be an object like {\"app\": \"Terminal\", \"tty\": \"/dev/ttys003\"}")
    where = {}
    url = raw.get("url")
    if url is not None:
        if not isinstance(url, str) or not url.startswith(("https://", "http://")) or len(url) > 1000:
            raise EventError("'open.url' must be an http or https address")
        where["url"] = url
    app = raw.get("app")
    if app is not None:
        if app not in OPEN_APPS:
            raise EventError(f"'open.app' must be one of: {', '.join(OPEN_APPS)}")
        where["app"] = app
    tty = raw.get("tty")
    if tty is not None:
        if not isinstance(tty, str) or not re.fullmatch(r"/dev/ttys?\d{1,4}", tty):
            raise EventError("'open.tty' must look like /dev/ttys003")
        where["tty"] = tty
    return where


def describe_tool(tool, tool_input):
    """One short human line about what a tool call is doing."""
    tool_input = tool_input or {}
    for key in ("file_path", "path", "pattern", "url", "query", "command", "description", "prompt"):
        if key in tool_input:
            value = tool_input[key]
            if key in ("file_path", "path"):
                value = os.path.basename(str(value)) or value
            return f"{tool}: {short_text(value, 60)}"
    return tool


def location_for_tool(tool):
    if not tool:
        return "square"
    if tool.startswith("mcp__"):
        return "market"
    return TOOL_LOCATIONS.get(tool, "square")


# ---------------------------------------------------------------- event format

def normalize_event(raw, now=None):
    """Check an incoming event and return it in the standard shape.

    Accepts the standard format from EVENTS.md as well as Claude Code's own
    hook payloads, which use different field names for the same things.
    Raises EventError with a readable message when something is wrong.
    """
    if not isinstance(raw, dict):
        raise EventError("an event must be a JSON object")
    session = raw.get("session_id") or raw.get("agent_id")
    if not session or not isinstance(session, (str, int)):
        raise EventError("'session_id' is required: a string that is the same for every event from one agent run")
    name = raw.get("event") or raw.get("hook_event_name")
    name = ALIASES.get(name, name)
    if name not in EVENT_NAMES:
        raise EventError(f"'event' must be one of: {', '.join(EVENT_NAMES)} (got {name!r})")
    version = raw.get("v", EVENT_VERSION)
    if version != EVENT_VERSION:
        raise EventError(f"this server understands event format v{EVENT_VERSION}, not v{version}")

    event = {"v": EVENT_VERSION, "session_id": str(session), "event": name,
             "received": now if now is not None else time.time()}

    for key in ("agent_type", "name", "cwd", "model", "transcript_path", "source"):
        if raw.get(key) is not None:
            event[key] = short_text(str(raw[key]), 300)
    if raw.get("layer") is not None:
        if raw["layer"] not in LAYERS:
            raise EventError(f"'layer' must be one of: {', '.join(LAYERS)}")
        event["layer"] = raw["layer"]

    tool = raw.get("tool") or raw.get("tool_name")
    if tool:
        event["tool"] = short_text(str(tool), 80)
    tool_input = raw.get("tool_input")
    if isinstance(tool_input, dict):
        # keep tool inputs small so the database does not fill up with file contents
        event["tool_input"] = {k: short_text(v, 200) for k, v in tool_input.items()}
    if raw.get("detail"):
        event["detail"] = short_text(str(raw["detail"]), 120)
    if raw.get("prompt"):
        event["prompt"] = short_text(str(raw["prompt"]), 500)
    if raw.get("message"):
        event["message"] = short_text(str(raw["message"]), 300)

    if raw.get("usage") is not None:
        event["usage"] = clean_tokens(raw["usage"], "usage")
    if raw.get("tokens") is not None:
        event["tokens"] = clean_tokens(raw["tokens"], "tokens")
    answer = raw.get("answer") or raw.get("last_assistant_message")
    if isinstance(answer, str) and answer.strip():
        event["answer"] = answer.strip()[-ANSWER_CHARS:]
    if raw.get("open") is not None:
        event["open"] = clean_open(raw["open"])

    if raw.get("cost_usd") is not None:
        cost = raw["cost_usd"]
        if not isinstance(cost, (int, float)) or isinstance(cost, bool) or cost < 0:
            raise EventError("'cost_usd' must be a number of 0 or more")
        event["cost_usd"] = float(cost)
    return event


# ---------------------------------------------------------------- tokens from transcripts

class TranscriptReader:
    """Adds up token usage from Claude Code transcript files.

    A Claude Code session writes one transcript (.jsonl, one JSON record per
    line). Helper agents it starts write their own transcripts in a
    `<session>/subagents/` folder next to it, so those are added in too.

    Files only ever grow, so we remember how far we have read each one and
    only read the new part on the next event. One reply can be split over
    several lines that share a message id, so each message id is counted once.
    """

    def __init__(self):
        self.lock = threading.Lock()
        self.files = {}  # path -> {"offset": int, "usage": {msg_id: usage}, "model": str}

    def _read_file(self, path):
        state = self.files.setdefault(path, {"offset": 0, "usage": {}, "model": None, "answer": ""})
        try:
            size = os.path.getsize(path)
            if size < state["offset"]:  # the file was replaced, start over
                state.update(offset=0, usage={}, model=None, answer="")
            if size == state["offset"]:
                return state
            with open(path, "rb") as f:
                f.seek(state["offset"])
                chunk = f.read()
        except OSError:
            return state
        end = chunk.rfind(b"\n")
        if end < 0:
            return state  # no complete line yet
        state["offset"] += end + 1
        for line in chunk[: end + 1].splitlines():
            if b'"usage"' not in line:
                continue
            try:
                record = json.loads(line)
            except ValueError:
                continue
            message = record.get("message") if isinstance(record, dict) else None
            if not isinstance(message, dict) or not isinstance(message.get("usage"), dict):
                continue
            state["model"] = message.get("model") or state["model"]
            state["usage"][message.get("id") or record.get("uuid")] = message["usage"]
            content = message.get("content")
            if isinstance(content, list):
                text = "\n".join(b.get("text", "") for b in content
                                 if isinstance(b, dict) and b.get("type") == "text").strip()
                if text:
                    state["answer"] = text[-ANSWER_CHARS:]
        return state

    def last_answer(self, transcript_path):
        """The last thing the agent wrote back in its main transcript."""
        if not transcript_path or not os.path.exists(transcript_path):
            return ""
        with self.lock:
            return self._read_file(transcript_path)["answer"]

    def totals(self, transcript_path):
        """Returns (tokens, model) for a session, helpers included."""
        tokens = empty_tokens()
        model = None
        if not transcript_path:
            return tokens, model
        paths = [transcript_path]
        base = transcript_path[:-6] if transcript_path.endswith(".jsonl") else transcript_path
        paths += sorted(glob.glob(os.path.join(base, "subagents", "*.jsonl")))
        with self.lock:
            for i, path in enumerate(paths):
                if not os.path.exists(path):
                    continue
                state = self._read_file(path)
                if i == 0:
                    model = state["model"]
                for usage in state["usage"].values():
                    tokens["input"] += usage.get("input_tokens") or 0
                    tokens["output"] += usage.get("output_tokens") or 0
                    tokens["cache_read"] += usage.get("cache_read_input_tokens") or 0
                    tokens["cache_write"] += usage.get("cache_creation_input_tokens") or 0
        return tokens, model


# ---------------------------------------------------------------- pricing

class Pricing:
    """Dollar prices per million tokens, read from pricing.json.

    Each key is the start of a model name. The longest matching key wins, so
    "claude-opus-5-5" beats "claude-opus". Models with no match have no cost.
    """

    def __init__(self, path=None, table=None):
        self.path = path
        self.mtime = None
        self.table = table or {}

    def _load(self):
        if not self.path:
            return
        try:
            mtime = os.path.getmtime(self.path)
        except OSError:
            return
        if mtime != self.mtime:
            try:
                with open(self.path, encoding="utf-8") as f:
                    data = json.load(f)
                self.table = {k: v for k, v in data.get("models", {}).items() if isinstance(v, dict)}
            except (OSError, ValueError) as exc:
                print(f"Could not read {self.path}: {exc}")
            self.mtime = mtime

    def price_for(self, model):
        self._load()
        if not model:
            return None
        best = None
        for prefix in self.table:
            if model.startswith(prefix) and (best is None or len(prefix) > len(best)):
                best = prefix
        return self.table.get(best) if best else None

    def cost(self, model, tokens):
        """Dollar cost of these token counts, or None if the model has no price."""
        price = self.price_for(model)
        if not price:
            return None
        return sum(tokens.get(k, 0) * float(price.get(k, 0)) for k in TOKEN_KINDS) / 1_000_000


# ---------------------------------------------------------------- layers

class LayerConfig:
    """Reads webgentz.json, which says which projects live on which layer.

    Example:
        {"default_layer": "understory",
         "layers": {"infra": "roots", "webgentz": "understory", "sales": "canopy"}}

    Each key under "layers" is matched against the agent's project folder
    (case does not matter, part of the path is enough). The file is re-read
    whenever it changes, so you can edit it while the server runs.
    """

    def __init__(self, path=None, data=None):
        self.path = path
        self.mtime = None
        self.data = data or {}

    def _load(self):
        if not self.path:
            return
        try:
            mtime = os.path.getmtime(self.path)
        except OSError:
            self.data, self.mtime = {}, None
            return
        if mtime != self.mtime:
            try:
                with open(self.path, encoding="utf-8") as f:
                    self.data = json.load(f) or {}
            except (OSError, ValueError) as exc:
                print(f"Could not read {self.path}: {exc}")
                self.data = {}
            self.mtime = mtime

    def layer_for(self, cwd):
        self._load()
        folder = (cwd or "").lower()
        for key, layer in (self.data.get("layers") or {}).items():
            if key.lower() in folder and layer in LAYERS:
                return layer
        default = self.data.get("default_layer")
        return default if default in LAYERS else "understory"


# ---------------------------------------------------------------- world state

class World:
    """Turns the stream of events into a picture of every agent.

    `apply(event)` returns (agent_view, change) where `change` holds the new
    tokens and dollars this event added, so the server can keep daily totals.
    """

    def __init__(self, layers=None, pricing=None, transcripts=None):
        self.lock = threading.Lock()
        self.agents = {}
        self.layers = layers or LayerConfig()
        self.pricing = pricing or Pricing()
        self.transcripts = transcripts or TranscriptReader()

    def _new_agent(self, event):
        sid = event["session_id"]
        cwd = event.get("cwd") or ""
        project = os.path.basename(cwd.rstrip("/")) or event.get("agent_type") or "agent"
        return {
            "id": sid,
            "name": event.get("name") or f"{project}-{sid[:4]}",
            "agent_type": event.get("agent_type") or "claude-code",
            "layer": event.get("layer") or self.layers.layer_for(cwd),
            "project": project,
            "cwd": cwd,
            "model": None,
            "status": "idle",
            "location": "square",
            "activity": "just arrived",
            "detail": "",
            "started": event["received"],
            "last_seen": event["received"],
            "tokens": empty_tokens(),
            "cost_usd": 0.0,
            "cost_known": True,
            "tool_counts": {},
            "prompts": 0,
            "tool_running": False,
            "recent": [],
            "open": None,          # where clicking the agent takes you
            "answer": "",          # its last answer, once a task is done
            "task_started": None,
            "finished_at": None,
            "last_prompt": "",
        }

    def apply(self, event):
        with self.lock:
            sid = event["session_id"]
            agent = self.agents.get(sid)
            if agent is None:
                agent = self.agents[sid] = self._new_agent(event)
            name = event["event"]
            now = event["received"]
            agent["last_seen"] = now
            for key in ("cwd", "agent_type", "layer", "name"):
                if event.get(key):
                    agent[key] = event[key]
            if event.get("model"):
                agent["model"] = event["model"]
            if event.get("open"):
                agent["open"] = {**(agent["open"] or {}), **event["open"]}

            line = self._move(agent, event, name)
            change = self._count(agent, event, name)
            if name == "done":
                agent["answer"] = event.get("answer") or self.transcripts.last_answer(event.get("transcript_path"))

            agent["recent"].append({"time": now, "kind": name, "text": line})
            del agent["recent"][:-RECENT_EVENTS]
            return self.view(agent, now), change

    def _move(self, agent, event, name):
        """Update where the agent is and what it is doing. Returns a log line."""
        if name == "start":
            resumed = agent["status"] == "gone" or event.get("source") == "resume"
            agent.update(status="idle", location="square", activity="just arrived", detail="", tool_running=False)
            return "Came back to the jungle" if resumed else "Arrived in the jungle"
        if name == "prompt":
            agent["prompts"] += 1
            agent.update(task_started=event["received"], finished_at=None, answer="")
            agent["last_prompt"] = (event.get("prompt") or "")[:500]
            prompt = short_text(event.get("prompt"), 70)
            agent.update(status="working", location="townhall", activity="taking orders", detail=prompt, tool_running=False)
            return f"New orders: {prompt}" if prompt else "New orders"
        if name == "tool_start":
            tool = event.get("tool") or "tool"
            where = location_for_tool(tool)
            agent["tool_counts"][tool] = agent["tool_counts"].get(tool, 0) + 1
            detail = event.get("detail")
            desc = f"{tool}: {detail}" if detail else describe_tool(tool, event.get("tool_input"))
            agent.update(status="working", location=where, activity=LOCATION_ACTIVITY[where], detail=desc, tool_running=True)
            return desc
        if name == "tool_end":
            agent.update(status="working", tool_running=False)
            return f"Finished {event.get('tool') or 'tool'}"
        if name == "needs_you":
            message = short_text(event.get("message"), 70) or "Needs your attention"
            agent.update(status="needs_you", location="townhall", activity="waiting for you", detail=message, tool_running=False)
            return message
        if name == "done":
            agent["finished_at"] = event["received"]
            agent.update(status="idle", location="campfire", activity="resting", detail="Finished the job", tool_running=False)
            return "Finished and resting"
        if name == "helper_done":
            return "A helper finished its task"
        if name == "end":
            agent.update(status="gone", location="gate", activity="left the jungle", detail="", tool_running=False)
            return "Left the jungle"
        return name

    def _count(self, agent, event, name):
        """Update tokens and cost. Returns what this event added."""
        before = dict(agent["tokens"])
        # Claude Code: the transcript holds the true running totals.
        if event.get("transcript_path") and name in ("start", "prompt", "tool_end", "done", "helper_done", "end"):
            tokens, model = self.transcripts.totals(event["transcript_path"])
            if any(tokens.values()):
                agent["tokens"] = tokens
            if model:
                agent["model"] = model
        if event.get("tokens"):  # running totals reported by the agent
            agent["tokens"] = {**agent["tokens"], **event["tokens"]}
        if event.get("usage"):  # one call's worth, added on
            for k, v in event["usage"].items():
                agent["tokens"][k] += v

        added = {k: max(0, agent["tokens"][k] - before.get(k, 0)) for k in TOKEN_KINDS}
        if "cost_usd" in event:
            cost = event["cost_usd"]
        elif any(added.values()):
            cost = self.pricing.cost(agent["model"], added)
            if cost is None:
                agent["cost_known"] = False
                cost = 0.0
        else:
            cost = 0.0
        agent["cost_usd"] += cost
        return {"tokens": added, "cost_usd": cost, "tool": event.get("tool") if name == "tool_start" else None,
                "prompt": name == "prompt"}

    def view(self, agent, now=None):
        """The agent as the page should show it, with time-based states worked out."""
        now = now if now is not None else time.time()
        view = dict(agent)
        view["recent"] = list(agent["recent"])
        quiet = now - agent["last_seen"]
        if agent["status"] == "working" and quiet > STUCK_AFTER_SECONDS:
            view["status"] = "stuck"
            view["activity"] = "quiet for a while, may be stuck" if not agent["tool_running"] else "a long tool run, may be stuck"
        elif agent["status"] == "idle" and quiet > SLEEP_AFTER_SECONDS:
            view.update(status="sleeping", location="houses", activity="asleep")
        return view

    def snapshot(self, now=None):
        now = now if now is not None else time.time()
        with self.lock:
            for sid in [s for s, a in self.agents.items()
                        if a["status"] == "gone" and now - a["last_seen"] > FORGET_GONE_AFTER_SECONDS]:
                del self.agents[sid]
            return [self.view(a, now) for a in self.agents.values()]
