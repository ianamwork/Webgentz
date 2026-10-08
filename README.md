# Webgentz

A rainforest where you can watch your AI agents work.

Your agents live on one master tree, and each layer of the tree is a part of
your company:

- **Canopy: growth and GTM.** Sales, marketing and research agents.
- **Understory: product.** Apps, front end and maintenance.
- **Roots: infrastructure.** The agents building what everything stands on.

Each kind of agent is a different animal. The primary roster:

| `agent_type` | Animal | Layer |
|---|---|---|
| `infra` | Termite (ant) | Roots |
| `backend` | Anaconda (snake) | Roots |
| `frontend` | Tree frog | Understory |
| `ux` | Hummingbird | Understory |
| `pm` | Spider monkey | Understory |
| `marketing` | Toucan | Canopy |
| `sales` | Macaw (parrot) | Canopy |
| `research` | Owl | Canopy |

Agents climb the trunk when they move between layers, and walk along their
branch to show what they are doing right now. Click any agent to see its
tokens, the tools it has used, and its recent activity. When agents are stuck
waiting for you, the tree's leaves start to wilt.

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

## Keep it running (Mac)

Make Webgentz start by itself whenever you log in, and restart if it crashes:

```bash
python3 autostart.py install               # the jungle server
python3 autostart.py install proxy codex   # also the API proxy and the Codex watcher
python3 autostart.py status                # check what is running
python3 autostart.py uninstall             # turn it all off
```

Logs go to `~/Library/Logs/webgentz*.log`. macOS stops background programs from
reading `~/Documents`, `~/Desktop` and `~/Downloads`, so keep the Webgentz folder
somewhere else, like `~/code/Webgentz`.

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

## Other kinds of agents

Each kind of agent shows up as a different animal.

**Your own Python scripts.** Copy `webgentz_client.py` next to your script:

```python
from webgentz_client import Agent

with Agent("lead-finder", layer="canopy", link="https://mail.google.com/mail/#drafts") as agent:
    agent.prompt("Find 20 fintech leads")
    with agent.tool("WebSearch", "fintech startups 2026"):
        results = search("fintech startups 2026")
    response = client.messages.create(...)   # Anthropic or OpenAI
    agent.record(response)                    # counts tokens and cost
    agent.needs_you("Approve the email draft?")
    agent.done(answer="20 drafts are ready in Gmail")
```

If the jungle is not running, the helper silently does nothing.

**Any app that calls an AI API.** Run `python3 proxy.py` and point the app at it
instead of the real API. Every call is counted, with no code changes:

| Provider  | Point the app's base URL at          |
|-----------|--------------------------------------|
| Anthropic | `http://127.0.0.1:8766/anthropic`    |
| OpenAI    | `http://127.0.0.1:8766/openai/v1`    |
| Grok      | `http://127.0.0.1:8766/xai/v1`       |
| Gemini    | `http://127.0.0.1:8766/gemini`       |

Each API key becomes its own agent. To name it, add the headers
`X-Webgentz-Agent: my-bot` and `X-Webgentz-Layer: canopy` (the proxy removes them
before forwarding). A rejected key shows the agent as "needs you".

**OpenAI Codex CLI.** Run `python3 codex_watch.py`. It follows Codex's session
logs in `~/.codex/sessions/`. Codex does not log approval requests, so Codex
agents never show "needs you".

**Anything else.** Send JSON to `POST /event`. The format is written down in
[EVENTS.md](EVENTS.md) and will not change in ways that break old senders.

## Working, done, and jumping back

A busy agent has a pulsing ring at its feet and a bubble like "Edit..." with
moving dots. When it finishes, the bubble turns into a green **✓ Done**.

Click a finished agent (or one that needs you) to jump straight to it:

- **Terminal or iTerm2:** the exact tab Claude Code is running in comes to the
  front. The first time, macOS asks whether Webgentz may control Terminal. Say OK.
- **VS Code, Cursor, Windsurf, Zed:** the window for that project opens.
- **Python scripts:** pass `link="https://..."` to `Agent(...)` and that page opens.

The side panel also shows the agent's final answer, so you can often read it
without leaving the jungle.

## History, spending and alerts

Click **HISTORY** in the top bar (or open `/history.html`) to see tokens and
dollars per day for each layer, a table of agents, and a timeline of what each
agent did. Dollar costs come from `pricing.json`; models that are not listed
there count tokens but no dollars, and the page says so. Add a line for any
model you use that is missing.

Your Mac shows a notification once when an agent needs you, when it has been
working for 5 minutes with no sign of progress ("may be stuck"), and when it
finishes a task that took over a minute.

Old history is deleted after 30 days, and agents that have been gone for a day
are cleared from the jungle.

## How it works

```
Claude Code ──hook──▶ webgentz_hook.py ─┐
Python scripts ─▶ webgentz_client.py ───┤
Apps ─▶ proxy.py ─▶ real AI API         ├─HTTP─▶ server.py ──live stream──▶ browser
Codex logs ─▶ codex_watch.py ───────────┘           │
                                                    └─ webgentz.db (SQLite)
```

- **`webgentz_core.py`** is the logic that turns events into "where is this
  agent and what has it spent". It has no web code, so it is easy to test.
- **`server.py`** receives events, saves them and the daily totals to SQLite,
  sends notifications, and streams updates to the page.
- **`web/`** draws the jungle and the history page. `web/demo.js` makes up fake
  agents for demo mode.

Everything runs on your own machine. Nothing is sent anywhere else, except that
`proxy.py` forwards your API calls to the provider you were already calling.

Run the tests with `python3 -m unittest discover tests`.

## Settings

| Environment variable           | Default                 | What it does                           |
|--------------------------------|-------------------------|----------------------------------------|
| `WEBGENTZ_PORT`                | `8765`                  | port the server listens on             |
| `WEBGENTZ_DB`                  | `webgentz.db`           | where the history is saved             |
| `WEBGENTZ_URL`                 | `http://127.0.0.1:8765` | where hooks and helpers send events    |
| `WEBGENTZ_CONFIG`              | `webgentz.json`         | which projects live on which layer     |
| `WEBGENTZ_PRICING`             | `pricing.json`          | dollar prices per model                |
| `WEBGENTZ_KEEP_DAYS`           | `30`                    | how many days of history to keep       |
| `WEBGENTZ_NOTIFY`              | `1`                     | set to `0` to turn off notifications   |
| `WEBGENTZ_DONE_ALERT_SECONDS`  | `60`                    | only say "done" for tasks this long    |
| `WEBGENTZ_PROXY_PORT`          | `8766`                  | port the API proxy listens on          |
| `WEBGENTZ_UPSTREAM_<PROVIDER>` | the real API            | send a provider's calls somewhere else |

## Ideas for later

- Agent frameworks like LangGraph and CrewAI.
- Launching agents from the jungle ("hatch a researcher").
- Spending caps.
