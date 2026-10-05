# Webgentz event format (v1)

Every agent reports to the jungle the same way: it sends small JSON messages
("events") to the server with `POST http://127.0.0.1:8765/event`. Adapters for
new kinds of agents only need to produce these events. The server checks each
one and answers `400` with a plain-English error if something is wrong.

## A minimal example

```json
{"v": 1, "session_id": "sales-bot-2026-10-02", "event": "start",
 "agent_type": "gtm", "name": "sales-bot", "layer": "canopy"}
```

```json
{"v": 1, "session_id": "sales-bot-2026-10-02", "event": "tool_start",
 "tool": "send_email", "detail": "follow-up to 20 leads"}
```

```json
{"v": 1, "session_id": "sales-bot-2026-10-02", "event": "tool_end",
 "model": "claude-sonnet-5-5", "usage": {"input": 1840, "output": 312}}
```

## Events

`event` says what just happened. One agent run goes roughly
`start → prompt → (tool_start → tool_end)… → done`, possibly with `needs_you`
in the middle, and `end` when it shuts down.

| `event`       | Meaning                                   | Where the agent goes        |
|---------------|-------------------------------------------|-----------------------------|
| `start`       | the agent started (or was resumed)        | arrives on its layer        |
| `prompt`      | it was given a new task                   | the trunk ("taking orders") |
| `tool_start`  | it began using a tool                     | the spot for that tool      |
| `tool_end`    | the tool finished                         | stays put                   |
| `needs_you`   | it is waiting for a person                | the trunk, with a `!`       |
| `done`        | it finished the task and is idle          | the resting spot            |
| `helper_done` | a helper agent it started finished        | stays put                   |
| `end`         | the agent shut down                       | walks off                   |

Claude Code's own hook names are accepted too and mean the same thing:
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`Notification`, `Stop`, `SubagentStop`, `SessionEnd`.

## Fields

| Field            | Required | Type   | Meaning |
|------------------|----------|--------|---------|
| `v`              | no       | number | format version, always `1` (assumed if missing) |
| `session_id`     | **yes**  | string | the same for every event from one agent run |
| `event`          | **yes**  | string | one of the events above |
| `agent_type`     | no       | string | decides the animal: `claude-code`, `codex`, `openai`, `chatgpt`, `grok`, `gemini`, `python`, `gtm`, `research` (unknown types become ants) |
| `name`           | no       | string | the name shown in the jungle (default: project folder + id) |
| `layer`          | no       | string | `roots`, `understory` or `canopy` (default: from `webgentz.json`) |
| `cwd`            | no       | string | the agent's project folder, used to pick a layer |
| `model`          | no       | string | the model in use, used to work out cost |
| `tool`           | no       | string | the tool name, on `tool_start` / `tool_end` |
| `detail`         | no       | string | a short description of what the tool is doing |
| `tool_input`     | no       | object | the tool's arguments (shortened before saving) |
| `prompt`         | no       | string | the task text, on `prompt` |
| `message`        | no       | string | what the agent needs, on `needs_you` |
| `usage`          | no       | object | tokens used **by this one call**, added to the running total |
| `tokens`         | no       | object | the agent's **running totals so far**, replacing the old totals |
| `cost_usd`       | no       | number | dollars spent by this call, if you know it better than the price table |
| `transcript_path`| no       | string | Claude Code only: the transcript to read token totals from |
| `answer`         | no       | string | on `done`: the agent's final answer, shown when you click it (Claude Code's is read from the transcript) |
| `open`           | no       | object | where clicking the agent takes you: `{"url": "https://..."}`, or `{"app": "Terminal", "tty": "/dev/ttys003"}`. `app` must be one of the names in `OPEN_APPS` in `webgentz_core.py` |

`usage` and `tokens` both look like
`{"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}`, and any key can
be left out. Use `usage` when you see one API call at a time (the proxy and the
Python helper do this), and `tokens` when the agent keeps its own running
total (Codex does this).

Cost is worked out from `pricing.json` unless `cost_usd` is sent. Models that
are not in the price table show their cost as unknown.

## Rules that will not change within v1

- New optional fields may be added. Existing fields will not change meaning.
- Unknown fields are ignored, so adapters can send extra information safely.
- A breaking change would become `"v": 2`, and the server would say so in its error.
