// Webgentz village: draws the map and moves your agents around it.
//
// The map is a grid of 16x16 pixel tiles, like a Game Boy Pokémon town.
// Each agent is a little trainer who walks along the roads to the building
// that matches what it is doing right now.

(() => {
  "use strict";

  const TILE = 16;
  const COLS = 36;
  const ROWS = 20;
  const WALK_SPEED = 7; // tiles per second

  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ------------------------------------------------------------ map layout

  // Roads: two east-west roads joined by a north-south road that ends at the gate.
  const ROAD_TOP = 10;      // agents walk along this row in the top half
  const ROAD_BOTTOM = 18;   // ...and this row in the bottom half
  const ROAD_SPINE = 17;    // column of the north-south road

  // Buildings. x, y, w, h are in tiles; the door sits on the bottom wall.
  // `spot` is the tile in front of the door where agents gather.
  const BUILDINGS = {
    library:  { label: "LIBRARY",   x: 2,  y: 2,  w: 7,  h: 6, roof: "#3870d8", door: 5,  spot: [5, 8] },
    townhall: { label: "TOWN HALL", x: 12, y: 2,  w: 11, h: 6, roof: "#e83838", door: 17, spot: [17, 8] },
    workshop: { label: "WORKSHOP",  x: 27, y: 2,  w: 7,  h: 6, roof: "#e88830", door: 30, spot: [30, 8] },
    forge:    { label: "FORGE",     x: 2,  y: 12, w: 6,  h: 5, roof: "#585868", door: 4,  spot: [4, 17], chimney: true },
    barracks: { label: "BARRACKS",  x: 9,  y: 12, w: 6,  h: 5, roof: "#38a048", door: 11, spot: [11, 17] },
    houses:   { label: "INN",       x: 31, y: 12, w: 4,  h: 5, roof: "#a050c0", door: 32, spot: [32, 17] },
  };

  // Places that are not buildings.
  const PLACES = {
    square:   { label: "SQUARE",   spot: [21, 10] },
    campfire: { label: "CAMPFIRE", spot: [21, 16], fire: [21, 14] },
    market:   { label: "MARKET",   spot: [27, 17], stalls: [[25, 13], [28, 13]] },
    gate:     { label: "GATE",     spot: [ROAD_SPINE, 19] },
  };

  function spotFor(location) {
    const place = BUILDINGS[location] || PLACES[location] || PLACES.square;
    return place.spot;
  }

  // Small deterministic random numbers so the grass looks the same every load.
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function isRoad(x, y) {
    if ((y === 9 || y === 10) && x >= 1 && x <= COLS - 2) return true;
    if (y === ROAD_BOTTOM && x >= 1 && x <= COLS - 2) return true;
    if ((x === ROAD_SPINE || x === ROAD_SPINE + 1) && y >= 9 && y <= ROWS - 1) return true;
    for (const b of Object.values(BUILDINGS)) {
      if (x === b.door && y === b.y + b.h) return true;          // doorstep
      if (x === b.door && y > b.y + b.h && y < (b.y < 9 ? 9 : ROAD_BOTTOM)) return true;
    }
    if (x === PLACES.market.spot[0] && y === 17) return true;
    return false;
  }

  // ------------------------------------------------------------ static map

  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = COLS * TILE;
  mapCanvas.height = ROWS * TILE;
  const m = mapCanvas.getContext("2d");

  function px(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }

  function drawGrass(c, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    px(c, x, y, TILE, TILE, "#78c850");
    const r = hash(tx, ty);
    if (r < 0.35) {
      px(c, x + 3, y + 5, 1, 2, "#58a838");
      px(c, x + 5, y + 4, 1, 3, "#58a838");
      px(c, x + 10, y + 11, 1, 2, "#58a838");
      px(c, x + 12, y + 10, 1, 3, "#58a838");
    } else if (r < 0.42) {
      // a flower
      const petal = r < 0.39 ? "#f86868" : "#f8f8f8";
      px(c, x + 7, y + 6, 2, 1, petal);
      px(c, x + 6, y + 7, 1, 2, petal);
      px(c, x + 9, y + 7, 1, 2, petal);
      px(c, x + 7, y + 9, 2, 1, petal);
      px(c, x + 7, y + 7, 2, 2, "#f8d030");
    }
  }

  function drawPath(c, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    px(c, x, y, TILE, TILE, "#e8d8a0");
    if (hash(tx + 99, ty) < 0.5) px(c, x + 4, y + 6, 2, 1, "#d0c088");
    if (hash(tx, ty + 99) < 0.5) px(c, x + 11, y + 12, 2, 1, "#d0c088");
  }

  function drawTree(c, tx, ty) {
    const x = tx * TILE, y = ty * TILE;
    drawGrass(c, tx, ty);
    px(c, x + 6, y + 11, 4, 5, "#885830");
    px(c, x + 2, y + 2, 12, 10, "#286830");
    px(c, x + 1, y + 4, 14, 6, "#286830");
    px(c, x + 4, y + 1, 8, 1, "#286830");
    px(c, x + 3, y + 3, 6, 4, "#389840");
    px(c, x + 4, y + 2, 3, 2, "#58b858");
  }

  function drawBuilding(c, b) {
    const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    const roofH = Math.floor(h * 0.45);
    // shadow
    px(c, x + 3, y + h, w - 3, 3, "rgba(0,0,0,0.18)");
    // walls
    px(c, x, y + roofH, w, h - roofH, "#f0e8d0");
    px(c, x, y + h - 3, w, 3, "#c8b898");
    // roof with stripes
    px(c, x - 2, y, w + 4, roofH, b.roof);
    for (let i = 3; i < roofH; i += 4) px(c, x - 2, y + i, w + 4, 1, "rgba(0,0,0,0.15)");
    px(c, x - 2, y + roofH - 2, w + 4, 2, "rgba(0,0,0,0.3)");
    px(c, x - 2, y, w + 4, 2, "rgba(255,255,255,0.25)");
    // windows
    const wy = y + roofH + 6;
    for (let wx = x + 8; wx + 12 < x + w - 4; wx += 24) {
      const doorX = b.door * TILE;
      if (wx + 12 > doorX - 2 && wx < doorX + TILE + 2) continue;
      px(c, wx, wy, 12, 10, "#383848");
      px(c, wx + 1, wy + 1, 10, 8, "#88c8f8");
      px(c, wx + 1, wy + 1, 4, 3, "#c8e8f8");
      px(c, wx + 5, wy + 1, 1, 8, "#383848");
    }
    // door
    const dx = b.door * TILE + 3, dy = y + h - 16;
    px(c, dx - 1, dy - 1, 12, 17, "#383848");
    px(c, dx, dy, 10, 16, "#a86838");
    px(c, dx + 7, dy + 8, 2, 2, "#f8d030");
    // chimney
    if (b.chimney) {
      px(c, x + w - 18, y - 8, 8, 12, "#686878");
      px(c, x + w - 19, y - 9, 10, 3, "#484858");
    }
    // sign
    c.font = "6px 'Press Start 2P', monospace";
    const textW = Math.ceil(c.measureText(b.label).width);
    const sx = Math.round(x + w / 2 - textW / 2 - 3), sy = y + roofH - 13;
    px(c, sx, sy, textW + 6, 10, "#383848");
    px(c, sx + 1, sy + 1, textW + 4, 8, "#f8f8f0");
    c.fillStyle = "#202028";
    c.textBaseline = "top";
    c.fillText(b.label, sx + 3, sy + 2);
  }

  function drawStall(c, tx, ty, color) {
    const x = tx * TILE, y = ty * TILE;
    px(c, x, y + 10, 32, 14, "#a86838");
    px(c, x + 2, y + 12, 28, 4, "#f8d030");
    px(c, x + 4, y + 13, 4, 2, "#e83838");
    px(c, x + 12, y + 13, 4, 2, "#78c850");
    px(c, x + 20, y + 13, 4, 2, "#f88838");
    for (let i = 0; i < 4; i++) px(c, x + i * 8, y, 8, 10, i % 2 ? "#f8f8f0" : color);
    px(c, x, y + 10, 32, 1, "rgba(0,0,0,0.25)");
    px(c, x + 1, y + 24, 2, 6, "#684020");
    px(c, x + 29, y + 24, 2, 6, "#684020");
  }

  function drawLabel(c, text, tx, ty) {
    c.font = "6px 'Press Start 2P', monospace";
    const w = Math.ceil(c.measureText(text).width);
    const x = Math.round(tx * TILE + 8 - w / 2 - 3), y = ty * TILE;
    px(c, x, y, w + 6, 10, "#383848");
    px(c, x + 1, y + 1, w + 4, 8, "#f8f8f0");
    c.fillStyle = "#202028";
    c.textBaseline = "top";
    c.fillText(text, x + 3, y + 2);
  }

  function drawMap() {
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const border = tx === 0 || tx === COLS - 1 || ty === 0 || ty === ROWS - 1;
        const gate = ty === ROWS - 1 && (tx === ROAD_SPINE || tx === ROAD_SPINE + 1);
        if (isRoad(tx, ty)) drawPath(m, tx, ty);
        else if (border && !gate) drawTree(m, tx, ty);
        else drawGrass(m, tx, ty);
      }
    }
    for (const b of Object.values(BUILDINGS)) drawBuilding(m, b);
    for (const [i, [sx, sy]] of PLACES.market.stalls.entries()) drawStall(m, sx, sy, i ? "#3870d8" : "#e83838");
    drawLabel(m, "MARKET", 27, 12);
    drawLabel(m, "CAMPFIRE", 21, 12);
    // campfire stones and logs
    const [fx, fy] = PLACES.campfire.fire;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      px(m, fx * TILE + 7 + Math.round(Math.cos(ang) * 9), fy * TILE + 9 + Math.round(Math.sin(ang) * 6), 3, 3, "#909098");
    }
    px(m, fx * TILE + 3, fy * TILE + 11, 11, 2, "#684020");
    // a fountain in the square
    const qx = 23 * TILE, qy = 9 * TILE;
    px(m, qx + 2, qy + 2, 12, 12, "#909098");
    px(m, qx + 4, qy + 4, 8, 8, "#58a8f8");
    px(m, qx + 7, qy + 5, 2, 4, "#c8e8f8");
    // signpost at the gate
    drawLabel(m, "EXIT", ROAD_SPINE - 2, ROWS - 3);
  }

  // ------------------------------------------------------------ sprites

  // A tiny trainer, 12x14 pixels. H = hat (agent color), B = shirt (agent color),
  // S = skin, K = outline, P = trousers, h = darker hat.
  const SPRITES = {
    down: [
      "....KKKK....", "...KHHHHK...", "..KHHHHHHK..", "..KhhhhhhK..",
      "..KSSSSSSK..", "..KSKSSKSK..", "..KSSSSSSK..", "...KSSSSK...",
      "..KBBBBBBK..", ".KSBBBBBBSK.", ".KKBBBBBBKK.", "..KPPPPPPK..",
    ],
    up: [
      "....KKKK....", "...KHHHHK...", "..KHHHHHHK..", "..KHHHHHHK..",
      "..KhhhhhhK..", "..KKKKKKKK..", "..KSSSSSSK..", "...KSSSSK...",
      "..KBBBBBBK..", ".KSBBBBBBSK.", ".KKBBBBBBKK.", "..KPPPPPPK..",
    ],
    left: [
      "....KKKK....", "...KHHHHK...", "..KHHHHHHK..", ".KhhhhhhK...",
      "..KSSSSSSK..", "..KKSSSSSK..", "..KSSSSSSK..", "...KSSSSK...",
      "...KBBBBK...", "...KBSBBK...", "...KBBBBK...", "...KPPPPK...",
    ],
  };
  const LEGS = [
    ["..KPK..KPK..", "..KKK..KKK.."],
    ["..KPK...KK..", "..KKK......."],
    [".......KPK..", "..KK...KKK.."],
  ];
  const LEGS_SIDE = [
    ["...KPKKPK...", "...KK..KK..."],
    ["..KPK..KPK..", "..KK....KK.."],
  ];

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (n & 255) + amount));
    return `rgb(${r},${g},${b})`;
  }

  const PALETTES = ["#e83838", "#3870d8", "#38a048", "#e88830", "#a050c0", "#30a8a8", "#e868a8", "#806040"];

  function colorFor(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTES[h % PALETTES.length];
  }

  function drawSprite(x, y, dir, step, color) {
    const rows = SPRITES[dir === "right" ? "left" : dir];
    const legs = dir === "left" || dir === "right" ? LEGS_SIDE[step % 2] : LEGS[step % 3 === 0 ? 0 : step % 3];
    const all = rows.concat(legs);
    const colors = { K: "#202028", H: color, h: shade(color, -60), S: "#f8c8a0", B: color, P: "#384878" };
    const flip = dir === "right";
    for (let r = 0; r < all.length; r++) {
      const line = all[r];
      for (let col = 0; col < 12; col++) {
        const ch = line[flip ? 11 - col : col];
        if (ch === ".") continue;
        ctx.fillStyle = ch === "B" ? shade(color, 30) : colors[ch];
        ctx.fillRect(x + col, y + r, 1, 1);
      }
    }
  }

  // ------------------------------------------------------------ agents

  const agents = new Map(); // id -> { data, x, y, path, dir, step, alpha }
  let selectedId = null;

  function slotOffset(index) {
    // spread agents at the same place: 0, -1, +1, -2, +2 ... then a row behind
    const row = Math.floor(index / 5);
    const i = index % 5;
    const dx = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2);
    return [dx, -row * 0.0 + (row ? -0.6 * row : 0)];
  }

  function targetFor(agent) {
    const [sx, sy] = spotFor(agent.data.location);
    const sameSpot = [...agents.values()]
      .filter(a => a.data.location === agent.data.location && a.data.status !== "gone")
      .sort((a, b) => a.data.started - b.data.started);
    const index = Math.max(0, sameSpot.indexOf(agent));
    const [dx, dy] = slotOffset(index);
    return [sx + dx, sy + dy];
  }

  function zoneRoad(y) { return y <= 10.5 ? ROAD_TOP : ROAD_BOTTOM; }

  // Walk like a Pokémon character: straight lines along the roads.
  function routeTo(from, to) {
    const [fx, fy] = from, [tx, ty] = to;
    const r1 = zoneRoad(fy), r2 = zoneRoad(ty);
    const pts = [[fx, r1]];
    if (r1 !== r2) pts.push([ROAD_SPINE + 0.5, r1], [ROAD_SPINE + 0.5, r2]);
    pts.push([tx, r2], [tx, ty]);
    return pts;
  }

  function upsert(data) {
    let agent = agents.get(data.id);
    if (!agent) {
      const [gx, gy] = PLACES.gate.spot;
      agent = { data, x: gx + 0.5, y: gy, path: [], dir: "up", step: 0, stepTime: 0, alpha: 1, color: colorFor(data.id) };
      agents.set(data.id, agent);
    }
    const moved = agent.data.location !== data.location || !agent.placed;
    agent.data = data;
    if (moved) retarget();
    return agent;
  }

  function retarget() {
    for (const a of agents.values()) {
      const target = targetFor(a);
      const last = a.path.length ? a.path[a.path.length - 1] : [a.x, a.y];
      if (Math.abs(last[0] - target[0]) < 0.01 && Math.abs(last[1] - target[1]) < 0.01) continue;
      const near = Math.abs(a.y - target[1]) < 1.5 && zoneRoad(a.y) === zoneRoad(target[1]) && Math.abs(a.x - target[0]) < 3;
      a.path = near ? [[target[0], a.y], target] : routeTo([a.x, a.y], target);
      a.placed = true;
    }
  }

  function updateAgent(a, dt) {
    let remaining = WALK_SPEED * dt;
    while (remaining > 0 && a.path.length) {
      const [tx, ty] = a.path[0];
      const dx = tx - a.x, dy = ty - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) { a.path.shift(); continue; }
      if (Math.abs(dx) > Math.abs(dy)) a.dir = dx > 0 ? "right" : "left";
      else a.dir = dy > 0 ? "down" : "up";
      const stepLen = Math.min(dist, remaining);
      a.x += (dx / dist) * stepLen;
      a.y += (dy / dist) * stepLen;
      remaining -= stepLen;
      if (stepLen === dist) a.path.shift();
    }
    const walking = a.path.length > 0;
    if (walking) {
      a.stepTime += dt;
      if (a.stepTime > 0.14) { a.step++; a.stepTime = 0; }
    } else {
      a.step = 0;
      if (a.data.status !== "gone") a.dir = "down";
    }
    if (a.data.status === "gone" && !walking) {
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
    if (a.data.location === "townhall" && a.data.activity === "taking orders") return "…";
    const tool = (a.data.detail || "").split(":")[0];
    return tool ? tool.replace(/^mcp__/, "").slice(0, 10) : "…";
  }

  function drawBubble(text, cx, top, urgent) {
    ctx.font = "6px 'Press Start 2P', monospace";
    const w = Math.max(10, Math.ceil(ctx.measureText(text).width) + 6);
    const x = Math.round(cx - w / 2), y = Math.round(top - 13);
    ctx.fillStyle = "#202028";
    ctx.fillRect(x - 1, y - 1, w + 2, 11);
    ctx.fillStyle = urgent ? "#f8d030" : "#f8f8f0";
    ctx.fillRect(x, y, w, 9);
    ctx.fillRect(Math.round(cx) - 1, y + 9, 3, 2);
    ctx.fillStyle = "#202028";
    ctx.textBaseline = "top";
    ctx.fillText(text, x + 3, y + 2);
  }

  // ------------------------------------------------------------ frame loop

  let lastTime = performance.now();
  let clock = 0;

  function drawAnimated() {
    // flickering campfire
    const [fx, fy] = PLACES.campfire.fire;
    const flick = Math.floor(clock * 8) % 3;
    const bx = fx * TILE + 5, by = fy * TILE + 2;
    ctx.fillStyle = "#e83838"; ctx.fillRect(bx, by + 4 - flick, 7, 7 + flick);
    ctx.fillStyle = "#f88838"; ctx.fillRect(bx + 1, by + 6 - flick, 5, 5 + flick);
    ctx.fillStyle = "#f8d030"; ctx.fillRect(bx + 2 + (flick === 1 ? 1 : 0), by + 8 - flick, 3, 3 + flick);
    // forge smoke, busier when an agent is working there
    const forge = BUILDINGS.forge;
    const busy = [...agents.values()].some(a => a.data.location === "forge" && a.data.status === "working");
    const puffs = busy ? 4 : 2;
    for (let i = 0; i < puffs; i++) {
      const t = (clock * 0.6 + i / puffs) % 1;
      const sx = (forge.x + forge.w) * TILE - 15 + Math.sin((t + i) * 6) * 3;
      const sy = forge.y * TILE - 10 - t * 26;
      ctx.fillStyle = `rgba(220,220,230,${0.8 * (1 - t)})`;
      const s = 3 + Math.round(t * 4);
      ctx.fillRect(Math.round(sx), Math.round(sy), s, s);
    }
    // fountain sparkle
    if (Math.floor(clock * 3) % 2) {
      ctx.fillStyle = "#f8f8f8";
      ctx.fillRect(23 * TILE + 7, 9 * TILE + 3, 2, 2);
    }
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    clock += dt;

    ctx.drawImage(mapCanvas, 0, 0);
    drawAnimated();

    const list = [...agents.values()];
    for (const a of list) updateAgent(a, dt);
    list.sort((a, b) => a.y - b.y);

    for (const a of list) {
      if (!agents.has(a.data.id)) continue;
      const sx = Math.round(a.x * TILE + 2);
      const bob = a.path.length && a.step % 2 ? -1 : 0;
      const sy = Math.round(a.y * TILE - 2) + bob;
      ctx.globalAlpha = Math.max(0, a.alpha) * (a.data.status === "sleeping" ? 0.7 : 1);
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(sx + 2, sy + 13 - bob, 8, 2);
      drawSprite(sx, sy, a.dir, a.step, a.color);
      if (a.data.id === selectedId) {
        const blink = Math.floor(clock * 4) % 2;
        ctx.fillStyle = "#202028";
        ctx.fillRect(sx + 4, sy - 6 - blink, 4, 1);
        ctx.fillRect(sx + 5, sy - 5 - blink, 2, 1);
      }
      if (!a.path.length && a.data.status !== "gone") {
        const urgent = a.data.status === "needs_you";
        const hop = urgent ? Math.round(Math.abs(Math.sin(clock * 6)) * 2) : 0;
        drawBubble(bubbleText(a), sx + 6, sy - 2 - hop, urgent);
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ clicking

  function agentAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = ((clientX - rect.left) / rect.width) * canvas.width;
    const my = ((clientY - rect.top) / rect.height) * canvas.height;
    let best = null;
    for (const a of agents.values()) {
      const sx = a.x * TILE + 2, sy = a.y * TILE - 2;
      if (mx >= sx - 3 && mx <= sx + 15 && my >= sy - 14 && my <= sy + 17) {
        if (!best || a.y > best.y) best = a;
      }
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
    const list = [...agents.values()].sort((a, b) => a.data.started - b.data.started);
    $("roster-empty").hidden = list.length > 0;
    const ul = $("roster");
    ul.innerHTML = "";
    for (const a of list) {
      const li = document.createElement("li");
      li.tabIndex = 0;
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = a.color;
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = a.data.name;
      const what = document.createElement("span");
      what.className = "what";
      what.textContent = `${STATUS_LABEL[a.data.status] || a.data.status} · ${a.data.activity}`;
      who.appendChild(what);
      li.append(dot, who);
      li.addEventListener("click", () => select(a.data.id));
      li.addEventListener("keydown", e => { if (e.key === "Enter") select(a.data.id); });
      ul.appendChild(li);
    }
  }

  function renderAgent(a) {
    const d = a.data;
    $("a-name").textContent = d.name;
    const badge = $("a-status");
    badge.textContent = STATUS_LABEL[d.status] || d.status;
    badge.className = `badge ${d.status}`;
    $("a-activity").textContent = d.activity || "-";
    $("a-detail").textContent = d.detail || "-";
    $("a-project").textContent = d.cwd || d.project || "-";
    $("a-model").textContent = d.model || "unknown";
    $("a-age").textContent = ago(Date.now() / 1000 - d.started);
    $("a-prompts").textContent = fmt(d.prompts);
    for (const k of ["input", "output", "cache_read", "cache_write"]) $(`t-${k}`).textContent = fmt(d.tokens[k]);
    $("t-total").textContent = fmt(totalTokens(d.tokens));

    const tools = Object.entries(d.tool_counts || {}).sort((x, y) => y[1] - x[1]);
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
    $("hud-agents").textContent = `${live.length} agent${live.length === 1 ? "" : "s"}`;
    $("hud-tokens").textContent = `${fmt(live.reduce((s, x) => s + totalTokens(x.data.tokens), 0))} tokens`;
  }

  function tick(agent) {
    const d = agent.data;
    const last = (d.recent || [])[d.recent.length - 1];
    if (last) $("ticker").textContent = `${d.name}: ${last.text}`;
  }

  // ------------------------------------------------------------ data feed

  function receive(message) {
    if (message.type === "state") {
      for (const data of message.agents) if (data.status !== "gone") upsert(data);
      if (!message.agents.length) $("ticker").textContent = "The village is quiet. Start a Claude Code session to see an agent arrive.";
    } else if (message.type === "agent") {
      tick(upsert(message.agent));
    }
    renderPanel();
  }

  const demo = new URLSearchParams(location.search).has("demo") || location.protocol === "file:";
  if (demo) {
    $("hud-mode").textContent = "DEMO";
    window.WebgentzDemo.start(receive);
  } else {
    const source = new EventSource("stream");
    source.onmessage = e => receive(JSON.parse(e.data));
    source.onerror = () => { $("ticker").textContent = "Lost contact with the village server. Is server.py running?"; };
  }

  // Every second: send quiet agents to bed and keep "active for" ticking.
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

  // Fonts change text widths, so draw the map once the pixel font is ready.
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    drawMap();
    requestAnimationFrame(frame);
  });
})();
