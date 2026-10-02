# Webgentz

A Pokémon-style village where you can watch your AI agents work.

Every Claude Code session on your computer shows up as a little character.
When it reads files it walks to the **Library**, when it edits code it goes to
the **Workshop**, when it runs commands it heads to the **Forge**, and when it
needs you it waits at the **Town Hall** with a `!` over its head. Click any
character to see its tokens, the tools it has used, and what it has been doing.

## Try it in 30 seconds (no setup)

```bash
python3 server.py
```

Open <http://localhost:8765/?demo> to see a village full of pretend agents.

Only the Python standard library is used, so there is nothing to install.

## Watch your real Claude Code agents

1. Keep `python3 server.py` running in one terminal.
2. Connect Claude Code to the village (once):

   ```bash
   python3 install_hooks.py --dry-run   # look at what will change first
   python3 install_hooks.py             # add the hook to ~/.claude/settings.json
   ```

   Your old settings are backed up next to the file before anything changes.
3. Open <http://localhost:8765> and start a Claude Code session anywhere.
   Your agent walks in through the gate.

To disconnect later: `python3 install_hooks.py --uninstall`.

If the server is not running, the hook quietly does nothing, so Claude Code is
never slowed down.

## What each place means

| Place      | The agent is...                               | Claude Code tools                    |
|------------|-----------------------------------------------|--------------------------------------|
| Town Hall  | taking your orders, planning, or waiting for you | new prompt, TodoWrite, notifications |
| Library    | researching                                   | Read, Grep, Glob, WebSearch, WebFetch |
| Workshop   | building                                      | Edit, Write, NotebookEdit            |
| Forge      | running commands                              | Bash                                 |
| Barracks   | briefing a helper agent                       | Task / Agent (subagents)             |
| Market     | using an outside tool                         | any MCP tool (Gmail, Notion, ...)     |
| Campfire   | finished and resting                          | Stop                                 |
| Inn        | asleep (no activity for 10 minutes)           |                                      |
| Gate       | leaving                                       | SessionEnd                           |

## How it works

```
Claude Code ──hook──▶ webgentz_hook.py ──HTTP──▶ server.py ──live stream──▶ browser village
                                                  │
                                                  └─ webgentz.db (SQLite history)
```

- **`webgentz_hook.py`** runs on every Claude Code hook event and forwards the
  event to the server.
- **`server.py`** turns events into agent state (where it is, what it is
  doing), adds up token usage from the session transcript, saves everything to
  SQLite so the village survives a restart, and streams updates to the page.
- **`web/`** draws the village on a `<canvas>` and moves the characters.
  `web/demo.js` makes up fake agents for demo mode.

Everything runs on your own machine. Nothing is sent anywhere else.

## Settings

| Environment variable | Default                  | What it does                      |
|----------------------|--------------------------|-----------------------------------|
| `WEBGENTZ_PORT`      | `8765`                   | port the server listens on        |
| `WEBGENTZ_DB`        | `webgentz.db`            | where the history is saved        |
| `WEBGENTZ_URL`       | `http://127.0.0.1:8765`  | where the hook sends events       |

## Ideas for later

- More agent types: Codex CLI, an API proxy for OpenAI / Grok / Gemini calls,
  agent frameworks like LangGraph.
- Launching agents from the village ("hire a researcher").
- Spending caps and alerts in a town treasury.
