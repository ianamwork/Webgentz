// Demo mode: invents a few busy agents so you can see the village without
// running Claude Code. Open the page with ?demo at the end of the address.
// The fake agents look exactly like what server.py sends.

window.WebgentzDemo = (() => {
  const TOOLS = [
    { tool: "Read", location: "library", activity: "researching", things: ["server.py", "README.md", "pricing.csv", "notes.md"] },
    { tool: "Grep", location: "library", activity: "researching", things: ["TODO", "def main", "token"] },
    { tool: "WebSearch", location: "library", activity: "researching", things: ["competitor pricing 2026", "agent observability tools"] },
    { tool: "Edit", location: "workshop", activity: "building", things: ["world.js", "style.css", "landing.html"] },
    { tool: "Write", location: "workshop", activity: "building", things: ["report.md", "email_draft.txt"] },
    { tool: "Bash", location: "forge", activity: "running commands", things: ["npm test", "python3 analysis.py", "git status"] },
    { tool: "Task", location: "barracks", activity: "briefing a helper", things: ["Summarize the sales calls"] },
    { tool: "mcp__gmail__search", location: "market", activity: "trading with an outside tool", things: ["inbox: leads"] },
    { tool: "TodoWrite", location: "townhall", activity: "planning", things: ["plan the week"] },
  ];

  const CREW = [
    { project: "webgentz", job: "Build the village" },
    { project: "sales-outreach", job: "Draft follow-ups for 20 leads" },
    { project: "market-research", job: "Compare agent observability tools" },
    { project: "thesis-data", job: "Clean the survey data in R" },
  ];

  const pick = list => list[Math.floor(Math.random() * list.length)];
  const rid = () => Math.random().toString(16).slice(2, 10);

  function makeAgent(member) {
    const now = Date.now() / 1000;
    const id = rid() + rid();
    return {
      id,
      name: `${member.project}-${id.slice(0, 4)}`,
      project: member.project,
      cwd: `~/code/${member.project}`,
      model: pick(["claude-opus-5-5", "claude-sonnet-5-5"]),
      status: "idle",
      location: "square",
      activity: "just arrived",
      detail: "",
      started: now - Math.random() * 1800,
      last_seen: now,
      tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      tool_counts: {},
      prompts: 0,
      recent: [],
      job: member.job,
    };
  }

  function step(agent) {
    const now = Date.now() / 1000;
    const roll = Math.random();
    let text;
    if (agent.prompts === 0 || roll < 0.08) {
      agent.prompts++;
      Object.assign(agent, { status: "working", location: "townhall", activity: "taking orders", detail: agent.job });
      text = `New orders: ${agent.job}`;
    } else if (roll < 0.14) {
      Object.assign(agent, { status: "needs_you", location: "townhall", activity: "waiting for you", detail: "Claude needs your permission to use Bash" });
      text = agent.detail;
    } else if (roll < 0.22) {
      Object.assign(agent, { status: "idle", location: "campfire", activity: "resting", detail: "Finished the job" });
      text = "Finished and resting at the campfire";
    } else {
      const t = pick(TOOLS);
      const detail = `${t.tool}: ${pick(t.things)}`;
      agent.tool_counts[t.tool] = (agent.tool_counts[t.tool] || 0) + 1;
      Object.assign(agent, { status: "working", location: t.location, activity: t.activity, detail });
      text = detail;
    }
    const k = Math.floor(Math.random() * 4000) + 500;
    agent.tokens.input += Math.floor(k * 0.05);
    agent.tokens.output += Math.floor(k * 0.3);
    agent.tokens.cache_read += k * 6;
    agent.tokens.cache_write += Math.floor(k * 0.8);
    agent.last_seen = now;
    agent.recent.push({ time: now, kind: "demo", text });
    agent.recent = agent.recent.slice(-40);
    return { ...agent, tokens: { ...agent.tokens }, tool_counts: { ...agent.tool_counts }, recent: [...agent.recent] };
  }

  function start(send) {
    const crew = CREW.map(makeAgent);
    send({ type: "state", agents: [] });
    crew.forEach((agent, i) => {
      setTimeout(() => {
        send({ type: "agent", agent: step(agent) });
        const loop = () => {
          send({ type: "agent", agent: step(agent) });
          setTimeout(loop, 2500 + Math.random() * 4500);
        };
        setTimeout(loop, 2000 + Math.random() * 3000);
      }, 600 + i * 1400);
    });
  }

  return { start };
})();
