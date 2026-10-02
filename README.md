# Webgentz

A rainforest where you can watch your AI agents work.

Your agents live on one master tree, and each layer of the tree is a part of
your company:

- **Canopy: growth and GTM.** Sales, marketing and research agents.
- **Understory: product.** Apps, front end and maintenance.
- **Roots: infrastructure.** The agents building what everything stands on.

Each kind of agent is a different animal (Claude Code agents are ants, GTM
agents are toucans, and so on). Agents climb the trunk when they move between
layers, and walk along their branch to show what they are doing right now.
Click any agent to see its tokens, the tools it has used, and its recent
activity. When agents are stuck waiting for you, the tree's leaves start to wilt.

## Try it in 30 seconds (no setup)

```bash
python3 server.py
```

Open <http://localhost:8765/?demo> to see a jungle full of pretend agents.

Only the Python standard library is used, so there is nothing to install.

## Watch your real Claude Code agents

1. Keep `python3 server.py` running in one terminal.
2. Connect Claude Code to the jungle (once):

   ```bash
   python3 install_hooks.py --dry-run   # look at what will change first
   python3 install_hooks.py             # add the hook to ~/.claude/settings.json
   ```

   Your old settings are backed up next to the file before anything changes.
3. Open <http://localhost:8765> and start a Claude Code session anywhere.
   Your agent walks in from the side of its layer.

To disconnect later: `python3 install_hooks.py --uninstall`.

If the server is not running, the hook quietly does nothing, so Claude Code is
never slowed down.

## Choosing each agent's layer

Copy `webgentz.example.json` to `webgentz.json` and list which project folders
belong on which layer:

```json
{
  "default_layer": "understory",
  "layers": { "infra": "roots", "my-app": "understory", "sales": "canopy" }
}
```

Each key is matched against the agent's project folder (part of the path is
enough). Agents in folders that match nothing go to `default_layer`. The file is
re-read when it changes, so you can edit it while the server runs.

## What each spot means

Every layer has the same spots from left to right, with names that fit the layer.

| The agent is...                 | Claude Code tools                     | Canopy / Understory / Roots          |
|---------------------------------|---------------------------------------|--------------------------------------|
| researching                     | Read, Grep, Glob, WebSearch, WebFetch | Lookout / Fruit grove / Root scan    |
| building                        | Edit, Write, NotebookEdit             | Nest weaving / Vine weaving / Tunnel digging |
| briefing a helper agent         | Task / Agent (subagents)              | Flock / Troop / Colony               |
| taking orders or waiting for you | new prompt, TodoWrite, notifications | the hollow in the trunk              |
| resting after finishing         | Stop                                  | Sunny perch / Shady leaf / Warm hollow |
| running commands                | Bash                                  | Song post / Pond / Engine room       |
| using an outside tool           | any MCP tool (Gmail, Notion, ...)      | Trading branch / Visitors' vine / River gate |
| asleep (quiet for 10 minutes)   |                                       | Roost / Hammock / Burrow             |

## Sending events from other agents

Anything can report to the jungle by sending JSON to `POST /event`. These
fields are optional extras on top of Claude Code's own hook fields:

| Field        | Meaning                                                       |
|--------------|---------------------------------------------------------------|
| `agent_type` | which animal to draw: `claude-code`, `codex`, `openai`, `grok`, `gemini`, `python`, `gtm`, `research` |
| `layer`      | `roots`, `understory` or `canopy` (overrides `webgentz.json`) |
| `name`       | the name shown above the agent                                |
| `tokens`     | `{"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}` |

## How it works

```
Claude Code ──hook──▶ webgentz_hook.py ──HTTP──▶ server.py ──live stream──▶ browser jungle
                                                  │
                                                  └─ webgentz.db (SQLite history)
```

- **`webgentz_hook.py`** runs on every Claude Code hook event and forwards the
  event to the server.
- **`server.py`** turns events into agent state (where it is, what it is
  doing), adds up token usage from the session transcript, saves everything to
  SQLite so the jungle survives a restart, and streams updates to the page.
- **`web/`** draws the jungle on a `<canvas>` and moves the animals.
  `web/demo.js` makes up fake agents for demo mode.

Everything runs on your own machine. Nothing is sent anywhere else.

## Settings

| Environment variable | Default                  | What it does                      |
|----------------------|--------------------------|-----------------------------------|
| `WEBGENTZ_PORT`      | `8765`                   | port the server listens on        |
| `WEBGENTZ_DB`        | `webgentz.db`            | where the history is saved        |
| `WEBGENTZ_URL`       | `http://127.0.0.1:8765`  | where the hook sends events       |
| `WEBGENTZ_CONFIG`    | `webgentz.json`          | which projects live on which layer |

## Ideas for later

- More agent types: Codex CLI, an API proxy for OpenAI / Grok / Gemini calls,
  agent frameworks like LangGraph.
- Launching agents from the jungle ("hatch a researcher").
- Spending caps and alerts.
