# Handoff: Webgentz Jungle World (ledger, bank, quest log, roster)

Target repo: ianamwork/Webgentz, folder `web/` (index.html, world.js, style.css, demo.js, history.html).

## Overview
A full-screen pixel-art jungle tree where every running agent is an animal. The tree has three layers: canopy (growth/GTM), understory (product), and roots (infrastructure). It replaces the separate History page. Everything the user needs sits on top of the world:
- **Ledger** — a bottom drawer you pull up, with two tabs: **Chat** (a running feed of agent messages, filterable by agent) and **Who's on what** (a roster of every agent with its job, current step, progress and status).
- **Bank** — a hut on the forest floor and a small coin button in the top bar. It opens a panel with today's spend, a per-agent cost table, and history.
- **Quest log** — a notice board on the forest floor and a large top-bar button. It opens a panel with approvals ("needs you") and each agent's to-do list.
- **Agent sheet** — click an animal to open its details: job, status, approve/deny, answer, tokens/cost/time, tools, recent messages.
- **Time of day** — follows the OS light/dark setting; a clock button lets the user scrub or play dawn and dusk.

## About the design files
`Jungle World.dc.html` and `jungle-engine.js` are **design references built in HTML**. They show the intended look and behavior; they are not production code. Recreate them inside the existing `web/` app using its current patterns (plain HTML/JS + `world.js` canvas renderer + the live agent feed). The prototype uses fake agents (`CREW`, `SEED`, `TOOLS` and a timer in the logic class). Replace all of that with the real data the app already gets.

`jungle-engine.js` is plain JavaScript with no dependencies. It was adapted from `web/world.js` and can mostly replace it.

## Fidelity
**High fidelity.** Match the colors, type, spacing and motion. The UI chrome uses the Industry look: square corners, hairline borders, "+" corner marks, steel accent #5980a6, Barlow Condensed headings over Barlow body text.

## Recommended implementation order
1. Replace `web/world.js` with `jungle-engine.js` (API below). Map live agents to the agent shape below.
2. Top bar (logo, counts, clock, bank coin, quest log button).
3. Agent hover card + agent sheet.
4. Ledger drawer with Chat + Who's on what tabs.
5. Quest log panel.
6. Bank panel (move what `history.html` shows here, then remove the History page link).
7. Time of day (OS dark mode + dusk/dawn scrubber).

## Renderer API (jungle-engine.js)
```js
const world = JungleEngine.mount(canvas, {
  hour: 12,                       // 0–24
  selectedId: () => currentId,    // draws white brackets around the selected animal
  onHover(agent, pos, place) {},  // pos = {x,y} in CSS px above the animal; place = "bank" | "board" | null
  onClick(agentOrNull) {},
  onBank() {}, onBoard() {},
  onHour(hour, dark, animating) {}, // dark 0–1, use to theme the HUD panels
});
world.setAgents(list);            // call on every data update
world.setHour(h); world.animateTo(h, seconds, linear);
world.destroy();
```
The canvas is 576×432 art pixels drawn at 2× (1152×864) and stretched to fill the 1200×900 stage.

### Agent shape passed to setAgents
```js
{ id, name, agent_type,   // infra | backend | frontend | ux | pm | marketing | sales | research
  layer,                  // "canopy" | "understory" | "roots"
  status,                 // "working" | "needs_you" | "stuck" | "idle" | "sleeping"
  location,               // library | workshop | barracks | campfire | forge | market | houses | square | townhall (= quest board)
  activity,               // "researching" | "building" | "running commands" | "taking orders" | "checking off" | other
  detail, started, since, done, answer,
  tokens: {input, output, cache_read, cache_write}, cost_usd, tool_counts, recent: [{t, text}] }
```
- Animal per type: infra/backend = ant/snake (roots), frontend = monkey, ux = frog, pm = hummingbird (understory), marketing = toucan, sales = parrot, research = owl (canopy).
- Map tool use to location/activity the same way `TOOLS` does in the prototype (Read/Grep → library/researching, Edit/Write → workshop/building, Bash → forge/running commands, MCP → market).
- When `done` goes up, set `location: "townhall", activity: "checking off"` briefly. The animal walks to the quest board and a green check pops up.
- When status changes to `idle` with an `answer`, the engine plays the finish celebration on its own.

### Movement (built into the engine)
- Roots (ant, snake): crawl only. Three floors (forest floor y=272, tunnel y=358, deep dig y=404) linked by shafts at x=140/452 (to the surface) and x=220/470 (to the deep dig). They roam every 2–5 s.
- Understory: monkey swings, frog hops, and both leap between floors; the hummingbird flies. Can go up to the canopy branch and down to the forest floor.
- Canopy birds fly in arcs and land in the leaves (y=60) or on the branch (y=104).
- Working animations per animal (ants dig and kick up dirt, frogs bounce, and so on). A white bubble over the head shows an activity icon. Yellow "!" = needs you, orange "?" = stuck, green check = finished, "z" = sleeping.
- Finish: gold glow, confetti, then a jump that fits the animal (frog leap, monkey backflip, hummingbird loop, owl spin, snake wiggle).

## Screens and components
Stage: 1200×900, full bleed. All panels use `--p-bg` / `--p-fg` / `--p-line` / `--p-soft` / `--p-mute`, which switch between light and dark as night falls.

**Top bar** (16 px inset): on the left, WEBGENTZ in "Press Start 2P" 22px, white with a dark 3px drop shadow. On the right: agent and working counts (Barlow Condensed 600 24px, white text with a shadow), a clock button showing the time, a 40×40 bank coin button (tooltip shows today's spend), and the Quest log button (52px tall, 22px heading, yellow #ffd23f "N need you" badge).

**Ledger drawer** (bottom, full width): when closed it is a pull tab. When open it has a 44px tab row (Chat | Who's on what with counts; the active tab has a 2px accent underline; Close button on the right) and a 300px body.
- Chat: a 180px agent filter list on the left and the message feed on the right (28px pixel avatar, name, time, text). Auto-scrolls to new messages.
- Who's on what: columns Agent / Working on / Progress / Status. Sorted needs_you → stuck → working → idle → sleeping. Click a row to find that agent on the tree (select + pulse).

**Quest log panel**: a "Needs you" section first (detail + Approve primary / Deny secondary / Find on tree ghost), then each agent's to-do list with checked items.

**Bank panel**: today's total, a table (Agent / Layer / Tokens / Cost, numbers right-aligned and tabular), and history by day.

**Agent sheet** (right side): avatar, name, kind, status tag, job, an Approve/Deny block if it needs you, Answer if finished, a 3-cell stat grid (Tokens / Cost / Active), and collapsible Tools / Recent / Details.

**Hover cards**: agent (name, summary, spot, tokens · cost); bank and quest board one-line labels.

## State
`agents` (by id), `messages[]`, `selectedId`, `hover/hoverPos`, `ledgerOpen`, `ledgerTab` ("chat" | "roster"), `ledgerFilter`, `questsOpen`, `bankOpen`, `bankHover`, `boardHover`, `hour`, `dark`, `auto` (follow the system), `timeOpen`. Only one of quest log or bank is open at a time.

## Time of day
- `auto` follows `matchMedia('(prefers-color-scheme: dark)')`: light = 12:00, dark = 22:00, with a 4-second animated transition when it changes.
- The clock popover has a scrub slider plus "Watch sunset" (17→21) and "Watch sunrise" (5→8) buttons, which call `animateTo` with linear easing.
- At night the engine adds lit windows, lanterns and fireflies; the HUD switches to the dark panel palette when `dark > 0.5`.

## Design tokens
Accent #5980a6 · text #1d1f20 · ground #f2f2f3 · needs-you yellow #ffd23f · stuck orange #f8a830 · done green #3fbf6a · glow rgba(255,226,120). Fonts: Barlow Condensed (headings), Barlow (body), Press Start 2P (logo). Radius 0. Icons: Lucide, stroke 1.5.

## Files
- `Jungle World.dc.html` — all UI, state and the fake data simulator (logic class at the bottom).
- `jungle-engine.js` — the canvas world: scenery, sprites, movement, sky, click/hover targets.
