# CLAUDE.md

Webgentz shows AI agents (Claude Code, Codex, scripts, any app calling an AI API)
as animals on a jungle tree in the browser. User-facing docs: README.md.
Event wire format: EVENTS.md.

## Event flow

```
Claude Code hook ─▶ webgentz_hook.py ──┐
Python scripts   ─▶ webgentz_client.py ┤
Apps ─▶ proxy.py (:8766) ─▶ real API   ├─ POST /event ─▶ server.py ─ SSE /stream ─▶ web/
Codex logs       ─▶ codex_watch.py ────┘                    └─ webgentz.db (SQLite)
```

- **Senders.** `webgentz_hook.py` reads a Claude Code hook payload on stdin and
  posts it with a 1s timeout, failing silently. `webgentz_client.py` (`Agent`)
  queues events on one background thread; `proxy.py` and `codex_watch.py` both
  build on `Agent`. Every sender must stay silent and fast when the server is down.
- **`server.py` `ingest()`**: `normalize_event()` (validates, maps Claude hook
  names like `PreToolUse` to `tool_start`, raises `EventError` → HTTP 400) →
  `World.apply()` → `Store.add()` (SQLite + daily totals) →
  `Broadcaster.send({"type": "agent", ...})` → `Notifier.check()` → on `done`,
  `memory.write_completion()` (Obsidian notes, `memory.py`).
- **`webgentz_core.py`** holds all logic with no web or DB code: `normalize_event`,
  `World`, `TranscriptReader`, `Pricing`, `LayerConfig`. Put new logic here so it
  stays testable.
- **SSE.** `/stream` first sends `{"type":"state","agents":[...]}`, then
  `agent` / `note` messages, with a `: ping` every 15s. A background thread
  re-broadcasts stuck/sleeping agents every 30s and prunes the DB daily.
- **`web/`**: `world.js` connects to `EventSource('/stream')` and dispatches in
  `receive(msg)` on `msg.type`. `jungle-engine.js` is the canvas renderer,
  `demo.js` fakes agents for `?demo`, `history.html/js` reads `/api/daily`,
  `/api/ledger` and `/api/timeline`. Other endpoints: `/api/state`, `/api/open`,
  `/api/close`, `/api/dismiss`, `/api/spawn`, `/api/note(s)`, `/api/memory*`.

## Run it

```bash
python3 server.py              # http://localhost:8765  (?demo for fake agents)
python3 proxy.py               # optional API proxy on :8766
python3 codex_watch.py         # optional Codex session watcher
python3 install_hooks.py --dry-run   # then without --dry-run; --uninstall to remove
python3 autostart.py install [proxy codex]   # macOS launchd; status / uninstall
```

Config: `webgentz.json` (project folder → layer, re-read live; see
`webgentz.example.json`), `pricing.json` (per-model dollars). Settings are
`WEBGENTZ_*` env vars (listed in README). A `PORT` env var (Fly.io) makes the
server bind `0.0.0.0`; see `Dockerfile` / `fly.toml`.

## Tests

```bash
python3 -m unittest discover tests
```

Plain `unittest`, one file per module (`test_core`, `test_server`, `test_client`,
`test_proxy`, `test_codex`). Server tests point `WEBGENTZ_DB`/`WEBGENTZ_CONFIG` at a
temp dir before importing `server`. Run the suite after any Python change.

## Rules

- **Stdlib-only Python.** No third-party packages, no requirements.txt, no pip.
  Users run `python3 server.py` with nothing installed.
- **No build step.** `web/` is plain HTML/CSS/JS served as-is: no bundler, npm,
  TypeScript or framework. Edit files and reload.
- **EVENTS.md is a stable contract (v1). Never break old senders.**
  - Only add new *optional* fields; never rename, remove or change the meaning
    of an existing field or event name (including the Claude Code aliases).
  - Unknown fields must keep being ignored, and `v` missing means `1`.
  - A breaking change means `"v": 2` with a clear server error, not a silent change.
  - Update EVENTS.md and `test_core.py` with any change to `normalize_event`.
- Keep everything local: nothing leaves the machine except proxied API calls.
