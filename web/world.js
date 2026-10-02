// Webgentz jungle: a side-on view of one master tree and the agents living on it.
//
//   canopy      growth and go-to-market agents
//   understory  product agents (apps, front end, maintenance)
//   roots       infrastructure agents
//
// Each layer is a branch (or a tunnel, for the roots) where agents stand.
// Spots along it show what the agent is doing right now, and agents climb
// the trunk when they move between layers.

(() => {
  "use strict";

  const W = 576;
  const H = 384;
  const TRUNK_X = 288;     // centre of the trunk, also the climbing line
  const GROUND_Y = 296;    // where the soil starts
  const SPEED = 110;       // pixels per second
  const SIZE = 2;          // creatures are drawn at double size

  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ layout

  // `y` is where creatures' feet rest on each layer.
  const LAYERS = {
    canopy:     { y: 104, label: "CANOPY", sub: "GROWTH & GTM", color: "#f4c542" },
    understory: { y: 212, label: "UNDERSTORY", sub: "PRODUCT", color: "#ff8a5c" },
    roots:      { y: 358, label: "ROOTS", sub: "INFRASTRUCTURE", color: "#c9a27a" },
  };
  const LAYER_ORDER = ["canopy", "understory", "roots"];

  // Where along a layer each activity happens, and what it is called there.
  const SPOTS = {
    library:  { x: 64,  names: { canopy: "Lookout", understory: "Fruit grove", roots: "Root scan" } },
    workshop: { x: 148, names: { canopy: "Nest weaving", understory: "Vine weaving", roots: "Tunnel digging" } },
    barracks: { x: 222, names: { canopy: "Flock", understory: "Troop", roots: "Colony" } },
    townhall: { x: TRUNK_X, names: { canopy: "Trunk", understory: "Trunk", roots: "Heartwood" } },
    campfire: { x: 352, names: { canopy: "Sunny perch", understory: "Shady leaf", roots: "Warm hollow" } },
    forge:    { x: 424, names: { canopy: "Song post", understory: "Pond", roots: "Engine room" } },
    market:   { x: 496, names: { canopy: "Trading branch", understory: "Visitors' vine", roots: "River gate" } },
    houses:   { x: 548, names: { canopy: "Roost", understory: "Hammock", roots: "Burrow" } },
    square:   { x: 330, names: { canopy: "Branch", understory: "Branch", roots: "Tunnel" } },
    gate:     { x: -24, names: { canopy: "Away", understory: "Away", roots: "Away" } },
  };

  const layerOf = d => (LAYERS[d.layer] ? d.layer : "understory");

  // Small deterministic random numbers so the scenery is the same every load.
  function rand(seed) {
    let h = (seed * 374761393) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function px(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function blob(c, cx, cy, r, color) {
    c.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      c.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
    }
  }

  // ------------------------------------------------------------ scenery

  const back = document.createElement("canvas");
  back.width = W; back.height = H;
  const front = document.createElement("canvas");
  front.width = W; front.height = H;

  function drawBackground(c) {
    // sky to forest floor
    const g = c.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, "#cdeccf");
    g.addColorStop(0.35, "#6fb07a");
    g.addColorStop(0.7, "#2f6b45");
    g.addColorStop(1, "#1d4430");
    c.fillStyle = g;
    c.fillRect(0, 0, W, GROUND_Y);

    // distant trees
    for (let i = 0; i < 14; i++) {
      const x = i * 44 + rand(i) * 20;
      const top = 70 + rand(i + 50) * 60;
      px(c, x + 14, top, 8, GROUND_Y - top, "rgba(20,60,40,0.35)");
      blob(c, x + 18, top, Math.round(18 + rand(i + 9) * 10), "rgba(30,80,50,0.35)");
    }
    // soil
    const s = c.createLinearGradient(0, GROUND_Y, 0, H);
    s.addColorStop(0, "#5b3d26");
    s.addColorStop(1, "#2e1f14");
    c.fillStyle = s;
    c.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    for (let i = 0; i < 120; i++) {
      px(c, rand(i + 300) * W, GROUND_Y + 6 + rand(i + 400) * (H - GROUND_Y), 2, 1, "rgba(0,0,0,0.25)");
    }
    // the infrastructure tunnel
    px(c, 0, 332, W, 28, "#22170f");
    px(c, 0, 330, W, 2, "#3b2819");
    px(c, 0, 360, W, 3, "#4a3322");
    for (let x = 30; x < W; x += 96) {
      // lanterns along the tunnel
      px(c, x, 334, 1, 6, "#6b4a2e");
      px(c, x - 2, 340, 5, 5, "#ffcf6b");
      px(c, x - 1, 341, 3, 3, "#fff2c2");
    }
  }

  function drawTrunk(c) {
    // roots spreading into the soil
    c.strokeStyle = "#4a2f1c";
    c.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const dir = i % 2 ? 1 : -1;
      const len = 40 + rand(i + 700) * 200;
      c.lineWidth = 6 - i * 0.4;
      c.beginPath();
      c.moveTo(TRUNK_X + dir * 10, GROUND_Y + 2);
      c.quadraticCurveTo(TRUNK_X + dir * len * 0.5, GROUND_Y + 10 + rand(i) * 20, TRUNK_X + dir * len, GROUND_Y + 24 + rand(i + 3) * 10);
      c.stroke();
    }
    // taproot down to the tunnel
    px(c, TRUNK_X - 9, GROUND_Y, 18, 36, "#4a2f1c");
    // trunk
    px(c, TRUNK_X - 22, 40, 44, GROUND_Y - 38, "#6b4226");
    px(c, TRUNK_X - 22, 40, 8, GROUND_Y - 38, "#7f5131");
    px(c, TRUNK_X + 14, 40, 8, GROUND_Y - 38, "#57351e");
    px(c, TRUNK_X - 30, GROUND_Y - 10, 60, 12, "#6b4226");
    for (let y = 50; y < GROUND_Y; y += 14) {
      px(c, TRUNK_X - 12 + rand(y) * 18, y, 6, 2, "#4f301b");
    }
    // a hollow at each layer, where agents take orders and wait for you
    for (const name of ["canopy", "understory"]) {
      const y = LAYERS[name].y;
      blob(c, TRUNK_X, y - 12, 10, "#2b1a0e");
      blob(c, TRUNK_X, y - 11, 8, "#1a0f08");
    }
  }

  function drawBranch(c, layer, side) {
    const y = LAYERS[layer].y;
    const x0 = side < 0 ? 18 : TRUNK_X + 20;
    const x1 = side < 0 ? TRUNK_X - 20 : W - 18;
    px(c, x0, y, x1 - x0, 7, "#6b4226");
    px(c, x0, y, x1 - x0, 2, "#86593a");
    px(c, x0, y + 5, x1 - x0, 2, "#4f301b");
    const tip = side < 0 ? x0 - 6 : x1;
    px(c, tip, y + 2, 6, 3, "#6b4226");
  }

  function drawLeaves(c, health) {
    // canopy crown, tinted by how healthy the colony is
    const tints = health > 0.75
      ? ["#2f7d3c", "#3f9a48", "#58b55a"]
      : health > 0.4 ? ["#5f7d2f", "#7f9a3a", "#a6b54e"] : ["#7d6a2f", "#a08a3a", "#c4a64e"];
    for (let i = 0; i < 26; i++) {
      const x = 20 + rand(i + 1000) * (W - 40);
      const y = 10 + rand(i + 1100) * 50;
      blob(c, x, y, Math.round(18 + rand(i + 1200) * 14), tints[i % 3]);
    }
    for (let i = 0; i < 14; i++) {
      blob(c, 30 + rand(i + 1300) * (W - 60), 62 + rand(i + 1400) * 16, Math.round(10 + rand(i) * 6), tints[(i + 1) % 3]);
    }
  }

  function drawVines(c) {
    for (let i = 0; i < 9; i++) {
      const x = 30 + rand(i + 1500) * (W - 60);
      if (Math.abs(x - TRUNK_X) < 30) continue;
      const len = 60 + rand(i + 1600) * 120;
      for (let y = 90; y < 90 + len; y += 2) px(c, x + Math.sin(y / 12) * 2, y, 1, 2, "#2d6a35");
      for (let y = 100; y < 90 + len; y += 14) px(c, x + Math.sin(y / 12) * 2 + 1, y, 3, 2, "#4fa652");
    }
  }

  function drawFruit(c) {
    const y = LAYERS.understory.y;
    for (let i = 0; i < 16; i++) {
      const x = 30 + rand(i + 1700) * (W - 60);
      if (Math.abs(x - TRUNK_X) < 34) continue;
      blob(c, x, y - 26 - rand(i) * 26, Math.round(9 + rand(i + 3) * 6), i % 2 ? "#2f7d3c" : "#3f9a48");
      const fruit = ["#ff6f4f", "#ffb02e", "#e84a7f"][i % 3];
      blob(c, x + 3, y + 12, 3, fruit);
      px(c, x + 2, y + 10, 1, 1, "rgba(255,255,255,0.7)");
    }
  }

  function drawUndergrowth(c) {
    // shrubs and ferns along the forest floor
    for (let i = 0; i < 30; i++) {
      const x = rand(i + 1800) * W;
      if (Math.abs(x - TRUNK_X) < 34) continue;
      const h = 8 + rand(i + 1900) * 16;
      blob(c, x, GROUND_Y - h / 2, Math.round(h / 2 + 3), i % 3 ? "#2a5f34" : "#3a7d3f");
    }
    for (let i = 0; i < 40; i++) {
      const x = rand(i + 2000) * W;
      px(c, x, GROUND_Y - 4, 1, 4, "#58b55a");
      px(c, x + 2, GROUND_Y - 6, 1, 6, "#4fa652");
    }
  }

  function drawLayerLabels(c) {
    c.font = "6px 'Press Start 2P', monospace";
    c.textBaseline = "top";
    const place = { canopy: 118, understory: 226, roots: 368 };
    for (const name of LAYER_ORDER) {
      const L = LAYERS[name];
      const text = `${L.label} · ${L.sub}`;
      const w = Math.ceil(c.measureText(text).width) + 12;
      const y = place[name];
      px(c, 6, y, w, 12, "rgba(16,28,20,0.8)");
      px(c, 6, y, 3, 12, L.color);
      c.fillStyle = "#f3f1e4";
      c.fillText(text, 13, y + 3);
    }
  }

  function drawScenery(health) {
    const b = back.getContext("2d");
    b.clearRect(0, 0, W, H);
    drawBackground(b);
    drawVines(b);
    drawTrunk(b);
    for (const layer of ["canopy", "understory"]) {
      drawBranch(b, layer, -1);
      drawBranch(b, layer, 1);
    }
    drawUndergrowth(b);
    drawFruit(b);
    drawLeaves(b, health);
    const f = front.getContext("2d");
    f.clearRect(0, 0, W, H);
    drawLayerLabels(f);
  }

  // ------------------------------------------------------------ creatures

  // Each kind of agent is a different animal. Unknown kinds become ants.
  const KINDS = {
    "claude-code": { animal: "ant",    color: "#d97757", label: "Claude Code" },
    "codex":       { animal: "beetle", color: "#2fa39a", label: "Codex" },
    "openai":      { animal: "frog",   color: "#4caf50", label: "OpenAI API" },
    "grok":        { animal: "beetle", color: "#4a4a58", label: "Grok" },
    "gemini":      { animal: "frog",   color: "#4f7fe0", label: "Gemini" },
    "python":      { animal: "monkey", color: "#a8703f", label: "Python agent" },
    "gtm":         { animal: "toucan", color: "#ff8c1a", label: "GTM agent" },
    "research":    { animal: "toucan", color: "#3fb6e8", label: "Research agent" },
  };
  const kindOf = d => KINDS[d.agent_type] || { animal: "ant", color: "#d97757", label: d.agent_type || "Agent" };

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (n & 255) + amount));
    return `rgb(${r},${g},${b})`;
  }

  // Every drawer paints a creature facing right with its feet at (0, 0).
  const ANIMALS = {
    ant(c, color, step) {
      const dark = shade(color, -70);
      const legs = step % 2;
      for (let i = 0; i < 3; i++) {
        px(c, -5 + i * 4, -3, 1, 3, dark);
        px(c, -6 + i * 4 + (legs ? 1 : -1), -1, 1, 1, dark);
      }
      blob(c, -6, -6, 3, color);       // abdomen
      px(c, -3, -6, 3, 3, dark);       // waist
      blob(c, 1, -6, 2, color);        // thorax
      blob(c, 5, -7, 3, color);        // head
      px(c, 6, -8, 1, 1, "#111");
      px(c, 6, -12, 1, 3, dark);       // antennae
      px(c, 7, -13, 2, 1, dark);
      px(c, -7, -8, 2, 1, shade(color, 50));
    },
    beetle(c, color, step) {
      const dark = shade(color, -60);
      const legs = step % 2;
      for (let i = 0; i < 3; i++) px(c, -5 + i * 4 + (legs ? 1 : 0), -2, 1, 2, "#1a1a1a");
      blob(c, -1, -6, 5, color);
      px(c, -6, -6, 11, 3, color);
      px(c, -1, -11, 1, 8, dark);      // shell seam
      px(c, -4, -9, 2, 1, shade(color, 60));
      blob(c, 5, -5, 2, "#1a1a1a");    // head
      px(c, 7, -7, 3, 1, "#1a1a1a");
    },
    frog(c, color, step) {
      const dark = shade(color, -50);
      const hop = step % 2 ? -2 : 0;
      px(c, -7, -3 + hop, 4, 3, dark); // back leg
      blob(c, -1, -5 + hop, 5, color);
      px(c, -6, -5 + hop, 12, 4, color);
      px(c, -4, -2 + hop, 9, 2, shade(color, 60)); // belly
      blob(c, 3, -10 + hop, 2, color); // eye bump
      px(c, 3, -11 + hop, 2, 2, "#111");
      px(c, 4, -11 + hop, 1, 1, "#fff");
      px(c, 3, -1 + hop, 3, 1, dark);  // front foot
    },
    monkey(c, color, step) {
      const dark = shade(color, -50);
      const legs = step % 2;
      px(c, -8, -12, 2, 8, dark);      // tail
      px(c, -10, -14, 3, 2, dark);
      px(c, -4 + legs, -4, 2, 4, dark);
      px(c, 1 - legs, -4, 2, 4, dark);
      px(c, -5, -11, 8, 7, color);
      blob(c, 2, -14, 4, color);       // head
      px(c, 3, -15, 4, 3, "#f0c9a0");  // face
      px(c, 5, -15, 1, 1, "#111");
      px(c, -2, -17, 2, 2, dark);      // ear
    },
    toucan(c, color, step) {
      const flap = step % 2;
      px(c, -1, -2, 1, 2, "#e0a000");  // feet
      px(c, 2, -2, 1, 2, "#e0a000");
      px(c, -9, -9, 4, 3, "#1a1a1a");  // tail
      blob(c, 0, -7, 5, "#1a1a1a");
      px(c, 1, -10, 4, 5, "#fff8e0");  // chest
      px(c, -5, flap ? -13 : -9, 6, 3, "#2c2c2c"); // wing
      blob(c, 3, -13, 3, "#1a1a1a");   // head
      px(c, 3, -14, 1, 1, "#fff");
      px(c, 6, -15, 7, 3, color);      // big beak
      px(c, 6, -13, 6, 1, shade(color, -60));
      px(c, 12, -14, 1, 1, "#1a1a1a");
    },
  };

  // ------------------------------------------------------------ agents

  const agents = new Map(); // id -> { data, x, y, path, face, step, alpha }
  let selectedId = null;

  function spotFor(d) {
    const spot = SPOTS[d.location] || SPOTS.square;
    return { x: spot.x, y: LAYERS[layerOf(d)].y };
  }

  function targetFor(agent) {
    const base = spotFor(agent.data);
    if (agent.data.location === "gate") return base;
    const crowd = [...agents.values()]
      .filter(a => a.data.location === agent.data.location && layerOf(a.data) === layerOf(agent.data) && a.data.status !== "gone")
      .sort((a, b) => a.data.started - b.data.started);
    const i = Math.max(0, crowd.indexOf(agent));
    const dx = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 36;
    return { x: Math.max(14, Math.min(W - 14, base.x + dx)), y: base.y };
  }

  // Walk along the branch to the trunk, climb, then walk out to the spot.
  function routeTo(a, t) {
    if (Math.abs(a.y - t.y) < 1) return [t];
    return [{ x: TRUNK_X, y: a.y }, { x: TRUNK_X, y: t.y }, t];
  }

  function retarget() {
    for (const a of agents.values()) {
      const t = targetFor(a);
      const last = a.path.length ? a.path[a.path.length - 1] : a;
      if (Math.abs(last.x - t.x) < 0.5 && Math.abs(last.y - t.y) < 0.5) continue;
      a.path = routeTo(a, t);
    }
  }

  function upsert(data) {
    let a = agents.get(data.id);
    if (!a) {
      // new agents arrive from the left edge of their own layer
      a = { data, x: -16, y: LAYERS[layerOf(data)].y, path: [], face: 1, step: 0, stepTime: 0, alpha: 1 };
      agents.set(data.id, a);
    }
    a.data = data;
    retarget();
    return a;
  }

  function update(a, dt) {
    let left = SPEED * dt;
    a.climbing = false;
    while (left > 0 && a.path.length) {
      const t = a.path[0];
      const dx = t.x - a.x, dy = t.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.01) { a.path.shift(); continue; }
      if (Math.abs(dx) > 0.01) a.face = dx > 0 ? 1 : -1;
      a.climbing = Math.abs(dy) > Math.abs(dx);
      a.climbDir = dy < 0 ? -1 : 1;
      const move = Math.min(dist, left);
      a.x += (dx / dist) * move;
      a.y += (dy / dist) * move;
      left -= move;
      if (move === dist) a.path.shift();
    }
    if (a.path.length) {
      a.stepTime += dt;
      if (a.stepTime > 0.12) { a.step++; a.stepTime = 0; }
    } else {
      a.step = 0;
    }
    if (a.data.status === "gone" && !a.path.length) {
      a.alpha -= dt;
      if (a.alpha <= 0) {
        agents.delete(a.data.id);
        if (selectedId === a.data.id) selectedId = null;
        retarget();
      }
    }
  }

  function bubbleText(a) {
    const s = a.data.status;
    if (s === "needs_you") return "!";
    if (s === "sleeping") return "Zz";
    if (s === "idle") return "♪";
    if (a.data.activity === "taking orders") return "…";
    const tool = (a.data.detail || "").split(":")[0];
    return tool ? tool.replace(/^mcp__/, "").slice(0, 10) : "…";
  }

  function drawBubble(text, cx, top, urgent) {
    ctx.font = "6px 'Press Start 2P', monospace";
    const w = Math.max(10, Math.ceil(ctx.measureText(text).width) + 6);
    const x = Math.round(cx - w / 2), y = Math.round(top - 12);
    px(ctx, x - 1, y - 1, w + 2, 11, "#14201a");
    px(ctx, x, y, w, 9, urgent ? "#ffd23f" : "#f8f6ea");
    px(ctx, Math.round(cx) - 1, y + 9, 3, 2, urgent ? "#ffd23f" : "#f8f6ea");
    ctx.fillStyle = "#14201a";
    ctx.textBaseline = "top";
    ctx.fillText(text, x + 3, y + 2);
  }

  // ------------------------------------------------------------ ambience

  const motes = Array.from({ length: 26 }, (_, i) => ({
    x: rand(i + 3000) * W, y: rand(i + 3100) * GROUND_Y, kind: i % 3 ? "firefly" : "leaf", phase: rand(i + 3200) * 6,
  }));

  function drawAmbience(t) {
    // sun rays through the canopy
    ctx.fillStyle = "rgba(255,250,210,0.06)";
    for (let i = 0; i < 4; i++) {
      const x = 80 + i * 130 + (reduceMotion ? 0 : Math.sin(t * 0.2 + i) * 6);
      ctx.beginPath();
      ctx.moveTo(x, 60); ctx.lineTo(x + 18, 60); ctx.lineTo(x + 70, GROUND_Y); ctx.lineTo(x + 30, GROUND_Y);
      ctx.fill();
    }
    if (reduceMotion) return;
    for (const m of motes) {
      if (m.kind === "leaf") {
        const y = (m.y + t * 14) % GROUND_Y;
        const x = m.x + Math.sin(t + m.phase) * 8;
        px(ctx, x, y, 3, 2, "#7fbf4f");
        px(ctx, x + 1, y + 2, 1, 1, "#4f8f2f");
      } else if (m.y > 120) {
        const glow = (Math.sin(t * 2 + m.phase) + 1) / 2;
        if (glow > 0.4) px(ctx, m.x + Math.sin(t * 0.5 + m.phase) * 10, m.y + Math.cos(t * 0.7 + m.phase) * 6, 2, 2, `rgba(255,240,140,${glow})`);
      }
    }
  }

  // ------------------------------------------------------------ frame loop

  let last = performance.now();
  let clock = 0;
  let health = 1;
  let drawnBand = null;

  const healthBand = h => (h > 0.75 ? 2 : h > 0.4 ? 1 : 0);

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;

    const band = healthBand(health);
    if (band !== drawnBand) { drawScenery(health); drawnBand = band; }

    ctx.drawImage(back, 0, 0);
    drawAmbience(clock);

    const list = [...agents.values()];
    for (const a of list) update(a, dt);
    list.sort((p, q) => p.y - q.y);

    for (const a of list) {
      if (!agents.has(a.data.id)) continue;
      const kind = kindOf(a.data);
      const x = Math.round(a.x), y = Math.round(a.y);
      ctx.globalAlpha = Math.max(0, a.alpha) * (a.data.status === "sleeping" ? 0.65 : 1);
      ctx.save();
      ctx.translate(x, y);
      if (a.climbing) {
        // head points the way it is climbing
        ctx.translate(-8, -12);
        ctx.rotate(a.climbDir < 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      ctx.scale((a.climbing ? 1 : a.face) * SIZE, SIZE);
      ANIMALS[kind.animal](ctx, kind.color, a.step);
      ctx.restore();
      if (a.data.id === selectedId) {
        const blink = Math.floor(clock * 4) % 2;
        px(ctx, x - 4, y - 50 - blink, 9, 3, "#ffd23f");
        px(ctx, x - 1, y - 47 - blink, 3, 3, "#ffd23f");
      }
      if (!a.path.length && a.data.status !== "gone") {
        const urgent = a.data.status === "needs_you";
        const hop = urgent ? Math.round(Math.abs(Math.sin(clock * 6)) * 2) : 0;
        drawBubble(bubbleText(a), x, y - 32 - hop, urgent);
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(front, 0, 0);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ clicking

  function agentAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = ((clientX - rect.left) / rect.width) * W;
    const my = ((clientY - rect.top) / rect.height) * H;
    let best = null, bestD = 22;
    for (const a of agents.values()) {
      const d = Math.hypot(mx - a.x, my - (a.y - 14));
      if (d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  canvas.addEventListener("click", e => {
    const a = agentAt(e.clientX, e.clientY);
    select(a ? a.data.id : null);
  });
  canvas.addEventListener("mousemove", e => {
    canvas.style.cursor = agentAt(e.clientX, e.clientY) ? "pointer" : "default";
  });

  // ------------------------------------------------------------ side panel

  const $ = id => document.getElementById(id);
  const fmt = n => (n || 0).toLocaleString();
  const totalTokens = t => (t.input || 0) + (t.output || 0) + (t.cache_read || 0) + (t.cache_write || 0);
  const STATUS_LABEL = { working: "WORKING", needs_you: "NEEDS YOU", idle: "RESTING", sleeping: "ASLEEP", gone: "LEFT" };

  function placeName(d) {
    const spot = SPOTS[d.location] || SPOTS.square;
    return spot.names[layerOf(d)];
  }

  function ago(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  function select(id) {
    selectedId = id;
    renderPanel();
  }

  $("back").addEventListener("click", () => select(null));

  function renderRoster() {
    const list = [...agents.values()];
    $("roster-empty").hidden = list.length > 0;
    const ul = $("roster");
    ul.innerHTML = "";
    for (const layer of LAYER_ORDER) {
      const members = list.filter(a => layerOf(a.data) === layer).sort((p, q) => p.data.started - q.data.started);
      if (!members.length) continue;
      const head = document.createElement("li");
      head.className = "layer-head";
      head.textContent = `${LAYERS[layer].label} · ${LAYERS[layer].sub}`;
      head.style.borderColor = LAYERS[layer].color;
      ul.appendChild(head);
      for (const a of members) {
        const kind = kindOf(a.data);
        const li = document.createElement("li");
        li.className = "member";
        li.tabIndex = 0;
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = kind.color;
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = a.data.name;
        const what = document.createElement("span");
        what.className = "what";
        what.textContent = `${STATUS_LABEL[a.data.status] || a.data.status} · ${placeName(a.data)}`;
        who.appendChild(what);
        li.append(dot, who);
        li.addEventListener("click", () => select(a.data.id));
        li.addEventListener("keydown", e => { if (e.key === "Enter") select(a.data.id); });
        ul.appendChild(li);
      }
    }
  }

  function renderAgent(a) {
    const d = a.data;
    const kind = kindOf(d);
    $("a-name").textContent = d.name;
    const badge = $("a-status");
    badge.textContent = STATUS_LABEL[d.status] || d.status;
    badge.className = `badge ${d.status}`;
    $("a-kind").textContent = `${kind.label} (${kind.animal})`;
    $("a-layer").textContent = `${LAYERS[layerOf(d)].label.toLowerCase()}, ${placeName(d)}`;
    $("a-activity").textContent = d.activity || "-";
    $("a-detail").textContent = d.detail || "-";
    $("a-project").textContent = d.cwd || d.project || "-";
    $("a-model").textContent = d.model || "unknown";
    $("a-age").textContent = ago(Date.now() / 1000 - d.started);
    $("a-prompts").textContent = fmt(d.prompts);
    for (const k of ["input", "output", "cache_read", "cache_write"]) $(`t-${k}`).textContent = fmt(d.tokens[k]);
    $("t-total").textContent = fmt(totalTokens(d.tokens));

    const tools = Object.entries(d.tool_counts || {}).sort((p, q) => q[1] - p[1]);
    const max = tools.length ? tools[0][1] : 1;
    const ul = $("a-tools");
    ul.innerHTML = tools.length ? "" : "<li>No tools used yet</li>";
    for (const [name, count] of tools.slice(0, 10)) {
      const li = document.createElement("li");
      li.innerHTML = `<div class="row"><span></span><span>${count}</span></div><div class="track"><div class="fill"></div></div>`;
      li.querySelector(".row span").textContent = name.replace(/^mcp__/, "");
      li.querySelector(".fill").style.width = `${(count / max) * 100}%`;
      ul.appendChild(li);
    }

    const log = $("a-log");
    log.innerHTML = "";
    for (const item of [...(d.recent || [])].reverse().slice(0, 25)) {
      const li = document.createElement("li");
      const time = document.createElement("time");
      time.textContent = new Date(item.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      li.append(time, document.createTextNode(item.text));
      log.appendChild(li);
    }
  }

  function renderPanel() {
    const a = selectedId && agents.get(selectedId);
    $("panel-roster").hidden = !!a;
    $("panel-agent").hidden = !a;
    if (a) renderAgent(a);
    else renderRoster();

    const live = [...agents.values()].filter(x => x.data.status !== "gone");
    const stuck = live.filter(x => x.data.status === "needs_you").length;
    health = live.length ? 1 - stuck / live.length : 1;
    $("hud-agents").textContent = `${live.length} agent${live.length === 1 ? "" : "s"}`;
    $("hud-tokens").textContent = `${fmt(live.reduce((s, x) => s + totalTokens(x.data.tokens), 0))} tokens`;
    $("hud-health").textContent = `tree ${health > 0.75 ? "thriving" : health > 0.4 ? "thirsty" : "wilting"}`;
  }

  function tick(a) {
    const d = a.data;
    const lastItem = (d.recent || [])[d.recent.length - 1];
    if (lastItem) $("ticker").textContent = `${d.name} (${placeName(d)}): ${lastItem.text}`;
  }

  // ------------------------------------------------------------ data feed

  function receive(message) {
    if (message.type === "state") {
      for (const data of message.agents) if (data.status !== "gone") upsert(data);
      if (!message.agents.length) $("ticker").textContent = "The jungle is quiet. Start a Claude Code session to see an agent arrive.";
    } else if (message.type === "agent") {
      tick(upsert(message.agent));
    }
    renderPanel();
  }

  const demo = window.WEBGENTZ_FORCE_DEMO || new URLSearchParams(location.search).has("demo") || location.protocol === "file:";
  if (demo) {
    $("hud-mode").textContent = "DEMO";
    window.WebgentzDemo.start(receive);
  } else {
    const source = new EventSource("stream");
    source.onmessage = e => receive(JSON.parse(e.data));
    source.onerror = () => { $("ticker").textContent = "Lost contact with the jungle server. Is server.py running?"; };
  }

  // Every second: send quiet agents to sleep and keep "active for" ticking.
  setInterval(() => {
    let changed = false;
    for (const a of agents.values()) {
      const d = a.data;
      if (d.status !== "gone" && d.status !== "sleeping" && Date.now() / 1000 - d.last_seen > 600) {
        a.data = { ...d, status: "sleeping", location: "houses", activity: "asleep" };
        changed = true;
      }
    }
    if (changed) retarget();
    renderPanel();
  }, 1000);

  // Text widths depend on the pixel font, so draw once it has loaded.
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(frame));
})();
