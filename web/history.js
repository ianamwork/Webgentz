// Webgentz history: spend and tokens per day, totals per agent, and a timeline.

(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const LAYERS = [
    { key: "roots", label: "Roots · infra", color: "var(--series-roots)" },
    { key: "understory", label: "Understory · product", color: "var(--series-understory)" },
    { key: "canopy", label: "Canopy · GTM", color: "var(--series-canopy)" },
  ];
  const demo = new URLSearchParams(location.search).has("demo") || window.WEBGENTZ_FORCE_DEMO;
  const state = { days: 14, measure: "cost", rows: [], session: null };

  const tokensOf = r => (r.input || 0) + (r.output || 0) + (r.cache_read || 0) + (r.cache_write || 0);
  const money = v => (v >= 100 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`);
  const compact = v => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`);
  const fmt = v => (state.measure === "cost" ? money(v) : compact(v));
  const valueOf = r => (state.measure === "cost" ? r.cost_usd || 0 : tokensOf(r));

  function dayKey(d) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(dayKey(d));
    }
    return out;
  }

  // ------------------------------------------------------------ demo data

  function demoRows(days) {
    const crew = [
      ["infra-terraform", "claude-code", "roots", "claude-opus-5-5"], ["api-server", "codex", "roots", "gpt-5-codex"],
      ["webgentz-app", "claude-code", "understory", "claude-opus-5-5"], ["onboarding-flow", "openai", "understory", "gpt-x"],
      ["sales-outreach", "gtm", "canopy", "claude-sonnet-5-5"], ["market-research", "research", "canopy", "claude-sonnet-5-5"],
    ];
    const rows = [];
    lastDays(days).forEach((day, i) => {
      crew.forEach(([name, type, layer, model], j) => {
        const seed = Math.sin(i * 7.1 + j * 3.3) * 0.5 + 0.5;
        if (seed < 0.25) return;
        const input = Math.round(20000 + seed * 90000), output = Math.round(4000 + seed * 30000);
        const cacheRead = Math.round(seed * 2_500_000);
        rows.push({ day, session_id: `${name}-${j}`, name, agent_type: type, layer, model, input, output,
          cache_read: cacheRead, cache_write: Math.round(seed * 200000),
          cost_usd: type === "openai" || type === "codex" ? 0 : (input * 4 + output * 20 + cacheRead * 0.4) / 1e6,
          tool_calls: Math.round(seed * 120), prompts: Math.round(seed * 8) });
      });
    });
    return rows;
  }

  function demoTimeline() {
    const now = Date.now() / 1000;
    const lines = [
      ["sales-outreach", "tool_start", { tool: "send_email", detail: "follow-up to 20 leads" }],
      ["webgentz-app", "tool_start", { tool: "Edit", tool_input: { file_path: "web/history.js" } }],
      ["infra-terraform", "needs_you", { message: "Claude needs your permission to use Bash" }],
      ["market-research", "tool_start", { tool: "WebSearch", tool_input: { query: "agent observability pricing" } }],
      ["webgentz-app", "prompt", { prompt: "Add a history page" }],
      ["api-server", "done", {}],
    ];
    return lines.map(([name, event, extra], i) => ({ session_id: name, name, event, received: now - i * 97, ...extra }));
  }

  // ------------------------------------------------------------ chart

  function drawChart() {
    const svg = $("chart");
    const days = lastDays(state.days);
    const byDay = Object.fromEntries(days.map(d => [d, { roots: 0, understory: 0, canopy: 0 }]));
    for (const r of state.rows) if (byDay[r.day]) byDay[r.day][r.layer in byDay[r.day] ? r.layer : "understory"] += valueOf(r);
    const totals = days.map(d => LAYERS.reduce((s, l) => s + byDay[d][l.key], 0));

    const W = Math.max(320, svg.clientWidth || 640), H = 260;
    const pad = { l: 56, r: 12, t: 22, b: 28 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const max = niceMax(Math.max(...totals, state.measure === "cost" ? 0.01 : 10));
    const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    const slot = (W - pad.l - pad.r) / days.length;
    const barW = Math.max(4, Math.min(28, slot * 0.6));

    let out = "";
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>`;
      out += `<text x="${pad.l - 8}" y="${yy + 3}" text-anchor="end">${fmt(v)}</text>`;
    }
    days.forEach((d, i) => {
      const cx = pad.l + slot * i + slot / 2;
      let top = y(0);
      const filled = LAYERS.filter(l => byDay[d][l.key] > 0);
      filled.forEach((l, k) => {
        const h = y(0) - y(byDay[d][l.key]);
        const gap = k > 0 ? 2 : 0;
        const segH = Math.max(0, h - gap);
        const yTop = top - gap - segH;
        const r = k === filled.length - 1 ? Math.min(4, segH) : 0;
        out += `<path d="${roundedTop(cx - barW / 2, yTop, barW, segH, r)}" fill="${l.color}"/>`;
        top = yTop;
      });
      const every = Math.ceil(days.length / 7);
      if (i % every === 0 || i === days.length - 1) {
        const label = new Date(`${d}T12:00`).toLocaleDateString([], { month: "short", day: "numeric" });
        out += `<text x="${cx}" y="${H - 10}" text-anchor="middle">${label}</text>`;
      }
      out += `<rect class="hit" data-i="${i}" x="${cx - slot / 2}" y="${pad.t}" width="${slot}" height="${H - pad.t - pad.b}" fill="transparent"/>`;
    });
    // label only today's total
    const last = days.length - 1;
    if (totals[last] > 0) {
      out += `<text x="${pad.l + slot * last + slot / 2}" y="${y(totals[last]) - 6}" text-anchor="middle" style="fill: var(--ink)">${fmt(totals[last])}</text>`;
    }
    out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ink)" stroke-width="1"/>`;
    svg.innerHTML = out;

    const tip = $("tip");
    svg.querySelectorAll(".hit").forEach(rect => {
      const show = e => {
        const i = +rect.dataset.i, d = days[i];
        const date = new Date(`${d}T12:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
        tip.innerHTML = `<div>${date}</div>` + LAYERS.map(l =>
          `<div><span class="swatch" style="background:${l.color}"></span>${l.label}: ${fmt(byDay[d][l.key])}</div>`).join("") +
          `<div>Total: ${fmt(totals[i])}</div>`;
        tip.hidden = false;
        const box = svg.closest(".card").getBoundingClientRect();
        const rr = rect.getBoundingClientRect();
        const left = Math.min(box.width - tip.offsetWidth - 8, Math.max(8, rr.left - box.left + rr.width / 2 - tip.offsetWidth / 2));
        tip.style.left = `${left}px`;
        tip.style.top = `${rr.top - box.top + 8}px`;
      };
      rect.addEventListener("mouseenter", show);
      rect.addEventListener("mousemove", show);
      rect.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  }

  function roundedTop(x, y, w, h, r) {
    if (h <= 0) return "";
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  // ------------------------------------------------------------ tiles and table

  function drawTiles() {
    const today = dayKey(new Date());
    const week = new Set(lastDays(7));
    const todays = state.rows.filter(r => r.day === today);
    $("k-today").textContent = money(todays.reduce((s, r) => s + (r.cost_usd || 0), 0));
    $("k-week").textContent = money(state.rows.filter(r => week.has(r.day)).reduce((s, r) => s + (r.cost_usd || 0), 0));
    $("k-tokens").textContent = compact(todays.reduce((s, r) => s + tokensOf(r), 0));
    $("k-agents").textContent = String(new Set(todays.map(r => r.session_id)).size);
  }

  function drawTable() {
    const agents = {};
    for (const r of state.rows) {
      const a = agents[r.session_id] ||= { id: r.session_id, name: r.name || r.session_id, layer: r.layer, tokens: 0, cost: 0, tools: 0, days: new Set(), unknown: false };
      a.tokens += tokensOf(r);
      a.cost += r.cost_usd || 0;
      a.tools += r.tool_calls || 0;
      a.days.add(r.day);
      if (!r.cost_usd && tokensOf(r) > 0) a.unknown = true;
    }
    const list = Object.values(agents).sort((p, q) => q.cost - p.cost || q.tokens - p.tokens);
    $("cost-note").hidden = !list.some(a => a.unknown);
    const body = $("agents");
    body.innerHTML = list.length ? "" : `<tr><td colspan="6">No activity in this range yet.</td></tr>`;
    for (const a of list) {
      const layer = LAYERS.find(l => l.key === a.layer) || LAYERS[1];
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.innerHTML = `<td></td><td><span class="swatch" style="background:${layer.color}"></span>${layer.key}</td>
        <td class="num">${compact(a.tokens)}</td><td class="num">${a.unknown && !a.cost ? "unknown" : money(a.cost)}</td>
        <td class="num">${a.tools}</td><td class="num">${a.days.size}</td>`;
      tr.firstChild.textContent = a.name;
      const open = () => loadTimeline(a.id, a.name);
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", e => { if (e.key === "Enter") open(); });
      body.appendChild(tr);
    }
  }

  // ------------------------------------------------------------ timeline

  function describe(e) {
    const tool = e.tool || "tool";
    const input = e.tool_input || {};
    const target = input.file_path ? input.file_path.split("/").pop() : input.command || input.query || input.pattern || input.url;
    switch (e.event) {
      case "start": return "Arrived";
      case "prompt": return `New orders: ${e.prompt || ""}`;
      case "tool_start": return e.detail ? `${tool}: ${e.detail}` : target ? `${tool}: ${target}` : tool;
      case "tool_end": return `Finished ${tool}`;
      case "needs_you": return `Needs you: ${e.message || ""}`;
      case "done": return "Finished and resting";
      case "helper_done": return "A helper finished";
      case "end": return "Left";
      default: return e.event || e.hook_event_name || "event";
    }
  }

  async function loadTimeline(session, name) {
    state.session = session || null;
    $("timeline-title").textContent = session ? `TIMELINE · ${name}` : "TIMELINE";
    $("timeline-all").hidden = !session;
    let events;
    if (demo) {
      events = demoTimeline().filter(e => !session || e.name === name);
    } else {
      const res = await fetch(`api/timeline?limit=200${session ? `&session=${encodeURIComponent(session)}` : ""}`);
      events = (await res.json()).events;
    }
    const names = Object.fromEntries(state.rows.map(r => [r.session_id, r.name]));
    const ol = $("timeline");
    ol.innerHTML = events.length ? "" : "<li>Nothing yet.</li>";
    for (const e of events.filter(e => e.event !== "tool_end")) {
      const li = document.createElement("li");
      const time = document.createElement("time");
      time.textContent = new Date(e.received * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      li.appendChild(time);
      if (!session) {
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = e.name || names[e.session_id] || e.session_id.slice(0, 8);
        li.appendChild(who);
      }
      li.appendChild(document.createTextNode(describe(e)));
      ol.appendChild(li);
    }
  }

  // ------------------------------------------------------------ loading

  async function load() {
    if (demo) {
      state.rows = demoRows(state.days);
    } else {
      const res = await fetch(`api/daily?days=${state.days}`);
      state.rows = (await res.json()).rows;
    }
    $("chart-title").textContent = state.measure === "cost" ? "SPEND PER DAY BY LAYER" : "TOKENS PER DAY BY LAYER";
    drawTiles();
    drawChart();
    drawTable();
  }

  $("legend").innerHTML = LAYERS.map(l => `<span><i style="background:${l.color}"></i>${l.label}</span>`).join("");
  if (demo) $("hud-mode").textContent = "DEMO";

  document.querySelectorAll("[data-days]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-days]").forEach(x => x.classList.toggle("on", x === b));
    state.days = +b.dataset.days;
    load();
  }));
  document.querySelectorAll("[data-measure]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-measure]").forEach(x => x.classList.toggle("on", x === b));
    state.measure = b.dataset.measure;
    load();
  }));
  $("timeline-all").addEventListener("click", () => loadTimeline(null));
  window.addEventListener("resize", () => drawChart());

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    load().then(() => loadTimeline(null));
  });
  setInterval(load, 60000);
})();
