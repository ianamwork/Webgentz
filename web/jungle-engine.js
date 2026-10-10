// Webgentz jungle renderer — scenery and animals adapted from web/world.js.
// JungleEngine.mount(canvas, {hour, onHover, onClick, onBank, onBoard, onHour}) -> {setAgents, setHour, animateTo, destroy}
(() => {
  "use strict";
  const W = 576, H = 432, RS = 2, TRUNK_X = 288, GROUND_Y = 272, TUNNEL_TOP = 300, TUNNEL_FLOOR = 358, DEEP_TOP = 374, DEEP_FLOOR = 404;
  const LAYERS = { canopy: { y: 104 }, understory: { y: 212 }, roots: { y: 358 } };
  const CROWN = 60, BRC = 104, BRU = 212;
  const BANK = { x: 196, y: GROUND_Y }, BOARD = { x: 382, y: GROUND_Y };
  const UP_SHAFTS = [140, 452], DOWN_SHAFTS = [220, 470];
  // where each layer goes for each kind of work: [x, y]
  const ZONES = {
    canopy: { library: [84, CROWN], workshop: [150, BRC], barracks: [222, BRC], campfire: [366, BRC], forge: [444, CROWN], market: [500, BRC], houses: [536, CROWN], square: [330, BRC] },
    understory: { library: [70, BRU], workshop: [150, GROUND_Y], barracks: [222, BRU], campfire: [366, BRU], forge: [480, GROUND_Y], market: [470, BRC], houses: [536, BRU], square: [336, BRU] },
    roots: { library: [500, GROUND_Y], workshop: [120, DEEP_FLOOR], barracks: [222, TUNNEL_FLOOR], campfire: [366, TUNNEL_FLOOR], forge: [420, DEEP_FLOOR], market: [60, GROUND_Y], houses: [60, DEEP_FLOOR], square: [330, TUNNEL_FLOOR] },
  };
  const SPD = { crawl: 48, climb: 34, fly: 130, hop: 70, leap: 120, swing: 100 };
  const HGT = { ant: 15, snake: 10, frog: 10, hummingbird: 10, monkey: 19, toucan: 16, parrot: 18, owl: 15, chameleon: 14, beetle: 10 };
  const MOVE = { ant: "crawl", snake: "crawl", frog: "hop", monkey: "swing", hummingbird: "fly", toucan: "fly", parrot: "fly", owl: "fly", chameleon: "crawl", beetle: "crawl" };

  function rand(seed) { let h = (seed * 374761393) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function px(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function blob(c, cx, cy, r, color, squash = 1) {
    c.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) { const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))); c.fillRect(Math.round(cx - half), Math.round(cy + dy * squash), half * 2, Math.max(1, Math.round(squash))); }
  }
  function dither(c, x, y, w, h, color) { c.fillStyle = color; x = Math.round(x); y = Math.round(y); for (let j = 0; j < h; j++) for (let i = (j + x + y) % 2; i < w; i += 2) c.fillRect(x + i, y + j, 1, 1); }
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amount)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount)), b = Math.max(0, Math.min(255, (n & 255) + amount));
    return `rgb(${r},${g},${b})`;
  }
  const FOLIAGE = [
    ["#4a3a1a", "#75602b", "#a08a3a", "#d4bf62", "#f0e08a"],
    ["#33461d", "#5b7329", "#86993a", "#b5c25a", "#e0e58a"],
    ["#123824", "#1e5a32", "#2f7d3c", "#4fa34a", "#9ad66a"],
  ];
  function clump(c, cx, cy, r, pal, seed) {
    const parts = [], n = 4 + Math.floor(r / 4);
    for (let i = 0; i < n; i++) {
      const a = rand(seed + i) * Math.PI * 2, d = rand(seed + i + 40) * r * 0.55;
      const s = Math.max(3, Math.round(r * (0.42 + rand(seed + i + 80) * 0.3)));
      parts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, s]);
    }
    for (const [x, y, s] of parts) blob(c, x, y + 2, s, pal[0]);
    for (const [x, y, s] of parts) blob(c, x - 1, y, s - 1, pal[1]);
    for (const [x, y, s] of parts) blob(c, x - s * 0.3, y - s * 0.3, Math.max(1, Math.round(s * 0.6)), pal[2]);
    for (const [x, y, s] of parts) blob(c, x - s * 0.45, y - s * 0.45, Math.max(1, Math.round(s * 0.3)), pal[3]);
    for (let i = 0; i < r * 0.25; i++) { const a = rand(seed + i + 200) * Math.PI * 2, d = rand(seed + i + 300) * r * 0.7; px(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6 - r * 0.25, 2, 1, pal[4]); }
  }
  function bigLeaf(c, x, y, len, angle, pal) {
    const steps = Math.round(len);
    for (let i = 0; i < steps; i++) {
      const t = i / steps, w = Math.round(Math.sin(t * Math.PI) * len * 0.22);
      const lx = x + Math.cos(angle) * i, ly = y + Math.sin(angle) * i + t * t * len * 0.25;
      px(c, lx - w, ly, w, 2, pal[1]); px(c, lx, ly, w + 1, 2, pal[2]);
      if (i % 5 === 2 && w > 2) px(c, lx + 1, ly, w - 1, 1, pal[3]);
      px(c, lx, ly, 1, 2, pal[0]);
    }
  }
  function fern(c, x, base, h, pal, seed) {
    for (let f = 0; f < 5; f++) {
      const dir = f / 4 * 2 - 1, len = h * (0.75 + rand(seed + f) * 0.4) * (1 - Math.abs(dir) * 0.25);
      for (let i = 0; i < len; i++) {
        const t = i / len, fx = x + dir * i * 0.9, fy = base - i * (1 - Math.abs(dir) * 0.55) + t * t * len * Math.abs(dir) * 0.7;
        px(c, fx, fy, 1, 1, pal[1]);
        if (i % 3 === 0 && t > 0.15) { const leaf = Math.max(1, Math.round((1 - t) * 4)); px(c, fx - leaf, fy - 1, leaf, 1, pal[2]); px(c, fx + 1, fy - 1, leaf, 1, pal[3]); }
      }
    }
  }

  // Time of day: [hour, sky stops top→horizon, land tint, tint strength]
  const NIGHT = ["#0b1028", "#141c3e", "#1d2a4a", "#16243a"];
  const KEYS = [
    [0, NIGHT, "#0b1430", 0.55],
    [4.8, ["#141a3c", "#2a2c5a", "#5a4a72", "#9a6a74"], "#1d2048", 0.48],
    [6.4, ["#8a9ad0", "#e8a7a0", "#f6c99a", "#f3e3b0"], "#ff9a80", 0.16],
    [8.5, ["#eaf5c9", "#a6d394", "#6fa883", "#9cc49c"], "#ffb070", 0],
    [16.2, ["#eaf5c9", "#a6d394", "#6fa883", "#9cc49c"], "#ffb070", 0],
    [17.8, ["#f6d79a", "#f0b070", "#c98a6a", "#a07a7a"], "#ff9a40", 0.14],
    [19.2, ["#f3b98a", "#b07aa0", "#4a4f80", "#2a2f50"], "#5a3a80", 0.32],
    [20.8, NIGHT, "#0b1430", 0.55],
    [24, NIGHT, "#0b1430", 0.55],
  ];
  const hex3 = h => { if (h[0] === "r") return h.match(/\d+/g).map(Number); const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const A = hex3(a), B = hex3(b); return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",") + ")"; };
  function sample(h) {
    h = ((h % 24) + 24) % 24; let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const A = KEYS[i], B = KEYS[i + 1], t = (h - A[0]) / (B[0] - A[0] || 1);
    return { stops: A[1].map((c, k) => mix(c, B[1][k], t)), tint: mix(A[2], B[2], t), alpha: A[3] + (B[3] - A[3]) * t };
  }
  function drawSunMoon(c, h, dark) {
    if (dark > 0.3) for (let i = 0; i < 60; i++) {
      c.globalAlpha = Math.min(1, (dark - 0.3) / 0.7) * (0.35 + 0.65 * rand(i + 4200));
      px(c, rand(i + 4000) * W, rand(i + 4100) * 220, 1, 1, "#ffffff");
    }
    c.globalAlpha = 1;
    if (h >= 5.4 && h <= 19.8) {
      const p = (h - 5.4) / 14.4, x = 30 + p * (W - 60), y = GROUND_Y - 6 - Math.sin(p * Math.PI) * 215, low = 1 - Math.sin(p * Math.PI);
      const g = c.createRadialGradient(x, y, 0, x, y, 46); g.addColorStop(0, "rgba(255,214,140,0.55)"); g.addColorStop(1, "rgba(255,214,140,0)");
      c.fillStyle = g; c.fillRect(x - 46, y - 46, 92, 92);
      blob(c, x, y, 10, mix("#fff4d0", "#ff7a30", Math.min(1, low * 1.25))); blob(c, x - 3, y - 3, 4, mix("#ffffff", "#ffb070", Math.min(1, low)));
    }
    if (h >= 18.8 || h <= 6.8) {
      const hh = h >= 18.8 ? h - 18.8 : h + 5.2, p = hh / 12, x = 30 + p * (W - 60), y = GROUND_Y - 6 - Math.sin(p * Math.PI) * 200;
      const g = c.createRadialGradient(x, y, 0, x, y, 30); g.addColorStop(0, "rgba(200,215,255,0.35)"); g.addColorStop(1, "rgba(200,215,255,0)");
      c.fillStyle = g; c.fillRect(x - 30, y - 30, 60, 60);
      blob(c, x, y, 7, "#e8ecf8"); px(c, x - 3, y - 1, 2, 2, "#c4cbe0"); px(c, x + 2, y + 2, 2, 1, "#c4cbe0"); px(c, x, y - 4, 1, 1, "#c4cbe0");
    }
  }
  // Calm jungle backdrop: hazy emergent giants, palms, lianas and big leaves.
  function drawFar(c) {
    const haze = a => { c.save(); c.globalCompositeOperation = "source-atop"; c.fillStyle = "rgba(214,232,206," + a + ")"; c.fillRect(0, 0, W, GROUND_Y); c.restore(); };
    for (let i = 0; i < 5; i++) {
      const x = (i + 0.3 + rand(i + 3000) * 0.4) * (W / 5), top = 92 + rand(i + 3010) * 22, col = "#86b28c";
      px(c, x - 2, top, 4, GROUND_Y - top, col);
      blob(c, x, top - 3, 22 + Math.round(rand(i + 3020) * 8), col, 0.42); blob(c, x - 16, top + 3, 12, col, 0.45); blob(c, x + 15, top + 2, 13, col, 0.45);
    }
    haze(0.4);
    c.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const x0 = 30 + rand(i + 3300) * (W - 60), x1 = x0 + 30 + rand(i + 3310) * 60, sag = 60 + rand(i + 3320) * 70;
      c.strokeStyle = "#6f9f7c"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0, 56); c.quadraticCurveTo((x0 + x1) / 2, 56 + sag * 2, x1, 56); c.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const x = (i + 0.5) * (W / 6) + (rand(i + 3100) - 0.5) * 40; if (Math.abs(x - TRUNK_X) < 56) continue;
      const top = 142 + rand(i + 3110) * 30, col = "#5f9670", pal = [col, col, "#679e78", col];
      for (let y = top; y < GROUND_Y; y++) px(c, x + Math.sin((y - top) / 40) * 3, y, 3, 1, col);
      for (const a of [-0.95, -0.78, -0.6, -0.4, -0.22, -0.05, 0.1, 0.9]) bigLeaf(c, x + 1, top, 20 + rand(i * 7 + a * 10 + 3130) * 8, a * Math.PI, pal);
    }
    haze(0.22);
    for (let i = 0; i < 16; i++) {
      const x = rand(i + 3200) * W; if (Math.abs(x - TRUNK_X) < 50) continue;
      const col = "#4b8460";
      bigLeaf(c, x, GROUND_Y - 12 - rand(i + 3210) * 18, 14 + rand(i + 3220) * 9, rand(i + 3230) < 0.5 ? -Math.PI * 0.15 : -Math.PI * 0.85, [col, col, "#558e69", col]);
    }
  }
  const LANTERNS = [];
  function drawSoil(c) {
    const s = c.createLinearGradient(0, GROUND_Y, 0, H); s.addColorStop(0, "#5e3e25"); s.addColorStop(1, "#21150c");
    c.fillStyle = s; c.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    for (let y = GROUND_Y + 7; y < H; y += 8) for (let x = 0; x < W; x++) if (rand(x * 7 + y) < 0.45) px(c, x, y + Math.round(Math.sin(x / 23 + y) * 1.5), 1, 1, "rgba(0,0,0,0.18)");
    for (let i = 0; i < 18; i++) {
      const x = rand(i + 300) * W, y = GROUND_Y + 6 + rand(i + 400) * (H - GROUND_Y - 8);
      if ((y > TUNNEL_TOP - 4 && y < TUNNEL_FLOOR + 6) || (y > DEEP_TOP - 6 && y < DEEP_FLOOR + 4)) continue;
      const w = 2 + Math.round(rand(i + 500) * 3);
      px(c, x, y, w, 2, "#7d6048"); px(c, x, y, w - 1, 1, "#a08268"); px(c, x + 1, y + 2, w, 1, "#2a1a10");
    }
    px(c, 0, TUNNEL_TOP, W, TUNNEL_FLOOR - TUNNEL_TOP, "#1d130b"); dither(c, 0, TUNNEL_TOP, W, TUNNEL_FLOOR - TUNNEL_TOP, "#241810");
    for (let x = 0; x < W; x++) { const bump = Math.round(rand(x + 900) * 2.4); px(c, x, TUNNEL_TOP - bump, 1, bump + 2, "#3a2717"); px(c, x, TUNNEL_FLOOR - 1 + Math.round(rand(x + 950) * 1.2), 1, 2, "#140c07"); }
    px(c, 0, TUNNEL_FLOOR, W, 5, "#5a3d27"); px(c, 0, TUNNEL_FLOOR, W, 1, "#8a6544");
    LANTERNS.length = 0;
    for (let x = 18; x < W; x += 96) {
      px(c, x, TUNNEL_TOP + 2, 4, TUNNEL_FLOOR - TUNNEL_TOP - 2, "#5c3f26"); px(c, x, TUNNEL_TOP + 2, 1, TUNNEL_FLOOR - TUNNEL_TOP - 2, "#86603d");
      px(c, x - 8, TUNNEL_TOP, 20, 4, "#6b4a2e"); px(c, x - 8, TUNNEL_TOP, 20, 1, "#94704a");
      const lx = x + 28, ly = TUNNEL_TOP + 12; LANTERNS.push([lx, ly, 26]);
      const glow = c.createRadialGradient(lx, ly, 0, lx, ly, 26); glow.addColorStop(0, "rgba(255,196,96,0.45)"); glow.addColorStop(1, "rgba(255,196,96,0)");
      c.fillStyle = glow; c.fillRect(lx - 26, ly - 26, 52, 52);
      px(c, lx, TUNNEL_TOP + 1, 1, 8, "#3a2716"); px(c, lx - 2, ly - 2, 5, 6, "#ffc45c"); px(c, lx - 1, ly - 1, 3, 3, "#fff3c4");
    }
    // deep dig level
    for (let x = 20; x < W - 20; x++) {
      const edge = Math.min(x - 20, W - 21 - x), taper = edge < 14 ? (14 - edge) * 1.6 : 0;
      const top = Math.round(DEEP_TOP + Math.sin(x / 19) * 2 + Math.sin(x / 7 + 2) + taper);
      if (top >= DEEP_FLOOR) continue;
      px(c, x, top - 1, 1, 2, "#3a2717"); px(c, x, top + 1, 1, DEEP_FLOOR - top - 1, (x + top) % 2 ? "#170f08" : "#1c120a");
    }
    px(c, 24, DEEP_FLOOR, W - 48, 3, "#4a3220"); px(c, 24, DEEP_FLOOR, W - 48, 1, "#7a5a3a");
    for (const [x, w] of [[92, 16], [318, 20], [512, 12]]) for (let i = 0; i < w; i++) { const h = Math.round(Math.sin(i / w * Math.PI) * w * 0.3); px(c, x + i - w / 2, DEEP_FLOOR - h, 1, h, i < w / 2 ? "#7a5636" : "#5e4128"); }
    for (const [x, y, col] of [[62, 414, "#6ff0d8"], [268, 420, "#ffc45c"], [402, 412, "#ff7ab0"], [498, 418, "#6ff0d8"]]) { px(c, x, y, 3, 2, col); px(c, x, y, 1, 1, "#ffffff"); }
    for (const s of DOWN_SHAFTS) {
      px(c, s - 6, TUNNEL_FLOOR - 1, 12, DEEP_TOP + 4 - TUNNEL_FLOOR, "#170f08");
      px(c, s - 7, TUNNEL_FLOOR, 1, DEEP_TOP - TUNNEL_FLOOR + 2, "#3a2717"); px(c, s + 6, TUNNEL_FLOOR, 1, DEEP_TOP - TUNNEL_FLOOR + 2, "#3a2717");
    }
    for (const lx of [300, 370]) {
      const ly = DEEP_TOP + 10; LANTERNS.push([lx, ly, 22]);
      const glow = c.createRadialGradient(lx, ly, 0, lx, ly, 22); glow.addColorStop(0, "rgba(255,196,96,0.4)"); glow.addColorStop(1, "rgba(255,196,96,0)");
      c.fillStyle = glow; c.fillRect(lx - 22, ly - 22, 44, 44);
      px(c, lx, DEEP_TOP + 2, 1, 6, "#3a2716"); px(c, lx - 2, ly - 2, 5, 5, "#ffc45c"); px(c, lx - 1, ly - 1, 3, 2, "#fff3c4");
    }
    for (let i = 0; i < 4; i++) { const x = 40 + rand(i + 1234) * (W - 80); px(c, x, TUNNEL_FLOOR - 3, 1, 3, "#cfe8d0"); px(c, x - 2, TUNNEL_FLOOR - 5, 5, 2, "#6ff0d8"); px(c, x - 1, TUNNEL_FLOOR - 6, 3, 1, "#b8fff0"); }
  }
  function drawRoots(c) {
    c.lineCap = "round";
    for (let i = 0; i < 11; i++) {
      const dir = i % 2 ? 1 : -1, len = 50 + rand(i + 700) * 230, drop = 6 + rand(i) * (TUNNEL_TOP - GROUND_Y - 8), width = 7 - i * 0.45;
      const path = () => { c.beginPath(); c.moveTo(TRUNK_X + dir * 14, GROUND_Y + 1); c.quadraticCurveTo(TRUNK_X + dir * len * 0.45, GROUND_Y + drop * 0.4, TRUNK_X + dir * len, GROUND_Y + drop); };
      c.strokeStyle = "#3a2414"; c.lineWidth = width; path(); c.stroke();
      c.strokeStyle = "#6b4528"; c.lineWidth = Math.max(1, width - 3); c.save(); c.translate(0, -1); path(); c.stroke(); c.restore();
    }
    px(c, TRUNK_X - 10, GROUND_Y, 20, TUNNEL_TOP - GROUND_Y + 2, "#4a2f1c"); px(c, TRUNK_X - 10, GROUND_Y, 4, TUNNEL_TOP - GROUND_Y + 2, "#6b4528");
  }
  const trunkHalf = y => 20 + Math.pow(Math.max(0, (y - 20) / (GROUND_Y - 20)), 4) * 26;
  function drawTrunk(c, pal) {
    for (let y = 20; y < GROUND_Y + 2; y++) {
      const half = Math.round(trunkHalf(y)), x0 = TRUNK_X - half;
      px(c, x0, y, half * 2, 1, "#6b4226"); px(c, x0, y, Math.round(half * 0.5), 1, "#86573a"); px(c, x0, y, 2, 1, "#a87450");
      px(c, TRUNK_X + Math.round(half * 0.45), y, Math.round(half * 0.55), 1, "#4f2f1a"); px(c, TRUNK_X + half - 2, y, 2, 1, "#371f10");
      for (let k = -3; k <= 3; k++) px(c, TRUNK_X + (k / 3.6) * half + Math.sin(y / 11 + k * 1.7) * 1.6, y, 1, 1, k < 0 ? "#6b4226" : "#3d2414");
    }
    for (const y of [70, 160, 250]) { blob(c, TRUNK_X - 8, y, 3, "#3d2414"); blob(c, TRUNK_X - 8, y, 1, "#86573a"); }
    for (let y = 30; y < GROUND_Y; y++) {
      const half = trunkHalf(y), s = Math.sin(y / 18);
      if (s > -0.2) px(c, TRUNK_X + s * half * 0.9, y, 2, 1, s > 0.5 ? pal[3] : pal[2]);
      if (y % 9 === 0 && s > 0) px(c, TRUNK_X + s * half * 0.9 + 2, y - 1, 3, 2, pal[3]);
    }
    for (const name of ["canopy", "understory"]) {
      const y = LAYERS[name].y - 14;
      blob(c, TRUNK_X, y, 11, "#3d2414", 1.2); blob(c, TRUNK_X, y + 1, 9, "#140a05", 1.2); px(c, TRUNK_X - 8, y + 11, 16, 2, "#a87450");
    }
  }
  function drawBranch(c, layer, side, pal) {
    const y = LAYERS[layer].y, start = TRUNK_X + side * (trunkHalf(y) - 4), end = side < 0 ? 10 : W - 10, len = Math.abs(end - start);
    for (let i = 0; i <= len; i++) {
      const x = start + side * i, thick = Math.round(11 - 7 * (i / len));
      px(c, x, y, 1, thick, "#6b4226"); px(c, x, y, 1, 2, "#a87450"); px(c, x, y + thick - 2, 1, 2, "#3d2414");
    }
    for (let i = 0; i < 9; i++) dither(c, start + side * (16 + rand(i + y + side * 50) * (len - 30)), y - 1, 6 + rand(i) * 8, 2, pal[3]);
    for (let i = 0; i < 2; i++) {
      const x = start + side * (60 + i * (len - 80) / 2 + rand(i + y) * 12), twig = 10 + rand(i + y + 3) * 8;
      for (let k = 0; k < twig; k++) px(c, x + side * k * 0.6, y + 6 + k, 1, 1, "#4f2f1a");
      bigLeaf(c, x + side * twig * 0.6, y + 6 + twig, 9 + rand(i + y) * 5, side < 0 ? Math.PI * 0.6 : Math.PI * 0.4, pal);
    }
    blob(c, end, y + 2, 2, "#6b4226");
  }
  // One solid crown: a dark mass, a few big lit clumps on top, and a clean
  // scalloped underside that stays above the canopy branch.
  function drawCanopy(c, pal) {
    for (let x = 0; x < W; x++) px(c, x, 0, 1, 50 + Math.sin(x / 37) * 3 + Math.sin(x / 13 + 1) * 1.5, pal[0]);
    for (let i = 0; i < 8; i++) clump(c, (i + 0.5) * (W / 8) + (rand(i + 1300) - 0.5) * 18, 14 + rand(i + 1400) * 12, 30 + Math.round(rand(i + 1500) * 6), pal, i * 41 + 5);
    for (let i = 0; i < 18; i++) {
      const x = i * (W / 17) + (rand(i + 1600) - 0.5) * 8, y = 52 + rand(i + 1610) * 5, r = 11 + Math.round(rand(i + 1620) * 3);
      blob(c, x, y + 2, r, pal[0]); blob(c, x - 1, y, r - 1, pal[1]); blob(c, x - r * 0.35, y - r * 0.35, Math.round(r * 0.45), pal[2]);
    }
    for (const [x, s] of [[64, 1], [214, -1], [372, 1], [516, -1]]) bigLeaf(c, x, 60, 12, s > 0 ? Math.PI * 0.42 : Math.PI * 0.58, pal);
  }
  function drawVines(c, pal) {
    for (let i = 0; i < 6; i++) {
      const x = 24 + rand(i + 1700) * (W - 48); if (Math.abs(x - TRUNK_X) < 40) continue;
      const top = LAYERS.canopy.y + 6, len = 40 + rand(i + 1710) * 120;
      for (let k = 0; k < len; k++) {
        const vx = x + Math.sin((top + k) / 13 + i) * 2; px(c, vx, top + k, 1, 1, "#2a5a30");
        if (k > 20 && k % 37 === 0) bigLeaf(c, vx, top + k, 10 + rand(i + k) * 6, (k / 37) % 2 ? Math.PI * 0.3 : Math.PI * 0.7, pal);
        else if (k % 8 === 4) { const s = (k / 8) % 2 ? 1 : -1; px(c, vx + (s > 0 ? 1 : -3), top + k, 3, 2, pal[3]); }
      }
    }
  }
  function drawFruit(c, pal) {
    const y = LAYERS.understory.y;
    for (let i = 0; i < 7; i++) {
      const x = 26 + rand(i + 1900) * (W - 52); if (Math.abs(x - TRUNK_X) < 44) continue;
      const hang = 10 + rand(i + 1910) * 10, fruit = [["#ff6f4f", "#c4402a"], ["#ffb02e", "#c47a10"], ["#e84a7f", "#a82858"]][i % 3];
      px(c, x, y + 6, 1, hang - 4, "#3d5a20"); blob(c, x, y + hang, 3, fruit[1]); blob(c, x - 1, y + hang - 1, 2, fruit[0]); px(c, x - 2, y + hang - 2, 1, 1, "#fff7e0");
    }
  }
  function drawFloor(c, pal) {
    for (let i = 0; i < 8; i++) { const x = rand(i + 2000) * W; if (Math.abs(x - TRUNK_X) < 60 || Math.abs(x - BANK.x) < 22 || Math.abs(x - BOARD.x) < 28) continue; clump(c, x, GROUND_Y - 8, 10 + Math.round(rand(i + 2010) * 8), pal, i * 53 + 9); }
    for (let i = 0; i < 7; i++) { const x = 8 + rand(i + 2100) * (W - 16); if (Math.abs(x - TRUNK_X) < 52 || Math.abs(x - BANK.x) < 20 || Math.abs(x - BOARD.x) < 26 || UP_SHAFTS.some(s => Math.abs(x - s) < 16)) continue; fern(c, x, GROUND_Y, 14 + rand(i + 2110) * 10, pal, i * 7); }
    for (let i = 0; i < 5; i++) {
      const x = rand(i + 2200) * W; if (Math.abs(x - TRUNK_X) < 50 || Math.abs(x - BANK.x) < 24 || Math.abs(x - BOARD.x) < 26) continue;
      const color = ["#ff7ab0", "#ffd23f", "#ffffff", "#ff8a5c"][i % 4];
      px(c, x, GROUND_Y - 6, 1, 6, pal[1]); px(c, x - 1, GROUND_Y - 8, 3, 1, color); px(c, x, GROUND_Y - 9, 1, 3, color);
    }
    for (let x = 0; x < W; x += 2) { const h = 1 + Math.round(rand(x + 2300) * 4); px(c, x, GROUND_Y - h, 1, h, rand(x + 2400) < 0.5 ? pal[3] : pal[2]); }
    px(c, 0, GROUND_Y, W, 1, "#2a1a0e");
  }
  const WINDOWS = [];
  function drawHuts(c) {
    WINDOWS.length = 0;
    { const x = 100, y = TUNNEL_FLOOR; // mine
      px(c, x - 13, y - 18, 5, 18, "#5c3f26"); px(c, x + 8, y - 18, 5, 18, "#5c3f26"); px(c, x - 13, y - 19, 26, 4, "#6b4a2e");
      px(c, x - 8, y - 15, 16, 15, "#1a0e08"); px(c, x - 2, y - 17, 4, 4, "#ffc45c"); WINDOWS.push([x, y - 15, 12]); }
    for (const s of UP_SHAFTS) { // burrows up to the forest floor
      px(c, s - 6, GROUND_Y - 1, 12, TUNNEL_TOP - GROUND_Y + 4, "#170f08");
      px(c, s - 7, GROUND_Y, 1, TUNNEL_TOP - GROUND_Y + 2, "#3a2717"); px(c, s + 6, GROUND_Y, 1, TUNNEL_TOP - GROUND_Y + 2, "#3a2717");
      for (let i = 0; i < 7; i++) { const h = Math.ceil(i / 2) + 1; px(c, s - 14 + i, GROUND_Y - h + 1, 1, h, "#7a5636"); px(c, s + 13 - i, GROUND_Y - h + 1, 1, h, "#5e4128"); }
    }
  }
  function drawBoard(c, hover, need) {
    const x = BOARD.x, y = BOARD.y;
    px(c, x - 16, y - 30, 3, 30, "#4a2e14"); px(c, x + 13, y - 30, 3, 30, "#4a2e14"); px(c, x - 16, y - 30, 1, 30, "#6b4528"); px(c, x + 13, y - 30, 1, 30, "#6b4528");
    for (let i = 0; i < 4; i++) px(c, x - 18 - i, y - 41 + i, 36 + i * 2, 1, i % 2 ? "#6e4620" : "#8a5a2a");
    px(c, x - 18, y - 37, 36, 21, "#4a2e14"); px(c, x - 17, y - 36, 34, 19, "#b8864a"); px(c, x - 17, y - 36, 34, 1, "#d4a468");
    [[-14, -34], [-4, -35], [6, -34]].forEach(([dx, dy], i) => {
      const hot = i < need, X = x + dx, Y = y + dy;
      px(c, X, Y, 8, 10, hot ? "#ffd23f" : "#f2e2b8"); px(c, X + 7, Y + 1, 1, 9, "rgba(0,0,0,0.18)"); px(c, X + 3, Y - 1, 2, 2, "#d0302a");
      if (hot) { px(c, X + 3, Y + 2, 2, 4, "#10170f"); px(c, X + 3, Y + 7, 2, 1, "#10170f"); }
      else for (let k = 0; k < 3; k++) px(c, X + 1, Y + 3 + k * 2, 6, 1, "#8a7a5a");
    });
    if (hover) brackets(c, x - 24, y - 45, 48, 47, "#ffffff");
  }
  function drawBank(c, hover) {
    const x = BANK.x, y = BANK.y;
    for (let i = 0; i <= 12; i++) px(c, x - i - 3, y - 30 + i, i * 2 + 6, 1, i % 2 === 0 ? "#8a5a2a" : "#6e4620");
    px(c, x - 15, y - 18, 30, 1, "#4a2e14");
    px(c, x - 13, y - 17, 26, 17, "#d9b678"); px(c, x - 13, y - 17, 26, 1, "#ecd09a"); px(c, x - 13, y - 17, 1, 17, "#ecd09a"); px(c, x + 12, y - 17, 1, 17, "#a8844a");
    for (let i = 0; i < 4; i++) px(c, x - 11 + i * 7, y - 15, 2, 15, "#c49e60");
    px(c, x - 4, y - 11, 8, 11, "#4a2e14"); px(c, x - 3, y - 10, 6, 10, "#2a180a"); px(c, x + 1, y - 6, 1, 1, "#ffd040");
    blob(c, x, y - 23, 3, "#ffd040"); blob(c, x - 0.5, y - 23.5, 2, "#ffe88a"); px(c, x, y - 25, 1, 4, "#c49020");
    px(c, x - 18, y - 3, 3, 3, "#ffd040"); px(c, x - 17, y - 4, 3, 1, "#ffe88a"); px(c, x + 15, y - 2, 3, 2, "#ffd040");
    // a little hanging sign so it reads as a place you can visit
    px(c, x + 14, y - 16, 1, 16, "#4a2e14"); px(c, x + 15, y - 16, 14, 1, "#4a2e14");
    px(c, x + 17, y - 15, 1, 2, "#4a2e14"); px(c, x + 26, y - 15, 1, 2, "#4a2e14");
    px(c, x + 15, y - 13, 14, 8, "#4a2e14"); px(c, x + 16, y - 12, 12, 6, "#f2e2b8");
    px(c, x + 21, y - 12, 2, 6, "#c49020"); px(c, x + 19, y - 11, 6, 1, "#c49020"); px(c, x + 19, y - 9, 6, 1, "#c49020"); px(c, x + 19, y - 7, 6, 1, "#c49020");
    px(c, x + 19, y - 10, 1, 1, "#c49020"); px(c, x + 24, y - 8, 1, 1, "#c49020");
    if (hover) brackets(c, x - 20, y - 34, 50, 36, "#ffffff");
  }
  function brackets(c, x, y, w, h, color) {
    x = Math.round(x); y = Math.round(y);
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      px(c, sx > 0 ? cx : cx - 4, cy - (sy > 0 ? 0 : 1), 5, 1, color);
      px(c, cx - (sx > 0 ? 0 : 1), sy > 0 ? cy : cy - 4, 1, 5, color);
    }
  }
  function drawFrontLeaves(c) {
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, W * 0.66); v.addColorStop(0, "rgba(6,18,12,0)"); v.addColorStop(1, "rgba(6,18,12,0.25)");
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }

  // ---------------- animals
  function ball(c, cx, cy, r, color, squash = 1) {
    blob(c, cx, cy, r, shade(color, -50), squash); blob(c, cx - 0.5, cy - 0.6, Math.max(1, r - 1), color, squash);
    if (r >= 2) blob(c, cx - r * 0.35, cy - r * 0.45 * squash, Math.max(1, Math.round(r * 0.35)), shade(color, 50), squash);
  }
  const ANIMALS = {
    ant(c, color, step) {
      const dark = shade(color, -90);
      for (let i = 0; i < 3; i++) { const lx = -3 + i * 3, sw = (i + step) % 2 ? 1 : -1; px(c, lx, -5, 1, 2, dark); px(c, lx + sw, -3, 1, 3, dark); }
      ball(c, -6, -7, 4, color, 0.8); ball(c, 0, -7, 2, color); ball(c, 5, -9, 3, color); px(c, 6, -10, 1, 1, "#111");
      px(c, 5, -12, 1, 1, dark); px(c, 6, -13, 1, 1, dark); px(c, 7, -14, 2, 1, dark);
    },
    frog(c, color, step) { grid(c, GRIDS.frog, step); },
    monkey(c, color, step) { grid(c, GRIDS.monkey, step); },
    toucan(c, color, step) {
      const flap = step % 2;
      px(c, -1, -2, 1, 2, "#e08a00"); px(c, 2, -2, 1, 2, "#e08a00"); px(c, -10, -8, 5, 3, "#18181e"); ball(c, -1, -7, 5, "#2a2a34", 0.9);
      ball(c, 2, -10, 2.5, "#fff3c8"); ball(c, -3, flap ? -11 : -7, 3, "#3a3a46", 0.7); ball(c, 3, -13, 3, "#2a2a34");
      px(c, 3, -15, 2, 2, "#7fd6ff"); px(c, 4, -15, 1, 1, "#111"); px(c, 6, -15, 8, 3, color); px(c, 7, -15, 5, 1, shade(color, 70)); px(c, 6, -13, 7, 1, shade(color, -60));
    },
    parrot(c, color, step) { grid(c, GRIDS.parrot, step); },
    snake(c, color, step) { grid(c, GRIDS.snake, step); },
    hummingbird(c, color, step) { grid(c, GRIDS.hummingbird, step); },
    owl(c, color, step) { grid(c, GRIDS.owl, step); },
    chameleon(c, color, step) {
      const dark = shade(color, -70), mid = shade(color, -30), hi = shade(color, 60), anim = step % 2;
      px(c, -11, -2, 5, 2, mid); px(c, -12, -4, 2, 3, dark); px(c, -10, -6, 3, 2, dark); px(c, -8, -5, 2, 1, mid);
      px(c, -6, 0, 4, 1, dark); px(c, -3, -1 + (anim ? 1 : 0), 1, 1, dark); px(c, -3, -3, 1, 3, dark);
      px(c, 2, 0, 4, 1, dark); px(c, 4, -1 - (anim ? 1 : 0), 1, 1, dark); px(c, 4, -3, 1, 3, dark);
      ball(c, 0, -6, 5, color, 0.68);
      px(c, -3, -11, 1, 2, mid); px(c, -1, -12, 1, 3, mid); px(c, 1, -11, 1, 2, mid); px(c, 3, -10, 1, 2, mid);
      ball(c, 6, -8, 3, color); px(c, 4, -11, 5, 4, color); px(c, 5, -11, 3, 1, hi);
      ball(c, 7, -10, 2, shade(color, 80)); px(c, 7, -11, 2, 2, "#f8f8d8"); px(c, 8, -11, 1, 1, "#111");
      if (anim) { px(c, 9, -8, 5, 1, "#f0b8d8"); px(c, 13, -9, 2, 1, "#e02060"); px(c, 13, -7, 2, 1, "#e02060"); }
    },
    beetle(c, color, step) {
      const legs = step % 2;
      for (let i = 0; i < 3; i++) px(c, -5 + i * 4 + (legs ? 1 : 0), -2, 1, 2, "#16161c");
      ball(c, -1, -6, 6, color, 0.72); px(c, -1, -10, 1, 7, shade(color, -70)); px(c, -5, -9, 3, 1, shade(color, 110));
      ball(c, 6, -5, 2, "#24242c"); px(c, 8, -8, 1, 2, "#24242c"); px(c, 9, -9, 1, 1, "#24242c"); px(c, 7, -6, 1, 1, "#e8e8e8");
    },
  };
  // Hand-placed pixel sprites, facing right, feet on the bottom row.
  // The dark outline is added automatically by sprite().
  const snakeRows = [
    "...............bbbb...",
    "..............blbbkbb.",
    "..............bbbbbbbb",
    "...............bbbb...",
    "..............sbbb....",
    ".............bbbs.....",
    "...bbllbbbbllbbbb.....",
    ".bbbsbbbbsbbbbsbb.....",
    "bbbbbbbbsbbbbbbbb.....",
    ".wwwwwwwwwwwwwwww.....",
  ];
  const monkeyRows = [
    "......dddddd......",
    ".....dbbbbbbd.....",
    "....dbbbbbbbbd....",
    "...dbbffffffbbd...",
    "..ffbfkffffkfbff..",
    "..ffbffffffffbff..",
    "...dbfffnnfffbd...",
    "....dbffmmffbd...d..",
    ".....dbbbbbbd...dd..",
    "....dbbbbbbbbd...d..",
    "...dbbbllllbbbd...d.",
    "..db.bbllllbb.bd..d.",
    "..db.bbllllbb.bd..d.",
    ".db..bbbbbbbb..bd.d.",
    ".db...bbbbbb...bd.d.",
    ".ff...bb..bb...ff.d.",
    "......bb..bb......d.",
    "......bb..bbddddddd.",
    ".....fff..fff.......",
  ];
  const GRIDS = {
    frog: { bob: -2, pal: { b: "#3fbf4a", l: "#8ae070", d: "#2a8a34", w: "#eaf2b4", e: "#e8302a", k: "#111111", f: "#ff8c1a" }, f0: [
      ".........ee...",
      "........ekke..",
      "...bbbbbeeeb..",
      ".bbblllbbbbbb.",
      "bbbbbbbbbbbbbb",
      "bbbbbbbbbbbwww",
      "dbbbbbbbbbwww.",
      ".dbbbddbbww...",
      "..ff..fff.ff..",
      "..f...f.f..ff.",
    ] },
    hummingbird: { pal: { w: "#cfe6f0", l: "#ffffff", b: "#2fae7a", g: "#e8508a", k: "#111111", y: "#2a2a2a", d: "#1f6e50", f: "#333333" }, f0: [
      "....ww...........",
      "...wllw..........",
      "...wllw..bbb.....",
      "....wwl.bbbkb....",
      ".....lwbbbbbyyyyy",
      "......bbbgg......",
      ".....dbbggg......",
      "....ddbbbg.......",
      "...dd.bbb........",
      "..dd...f.........",
    ], f1: [
      ".................",
      ".................",
      ".........bbb.....",
      "........bbbkb....",
      ".......bbbbbyyyyy",
      "...wwwbbbgg......",
      "..wllwbbggg......",
      "..wwddbbbg.......",
      "...dd.bbb........",
      "..dd...f.........",
    ] },
    monkey: { bob: -1, pal: { d: "#4a2a14", b: "#7a4a2a", l: "#a87850", f: "#ecc69a", k: "#111111", n: "#3a2010", m: "#b06a50" }, f0: monkeyRows },
    owl: { pal: { b: "#9a6a3e", d: "#5e3c20", f: "#ead6ae", e: "#ffc83a", k: "#111111", y: "#d89a2a", w: "#f3e6c8", l: "#b88a5a" }, f0: [
      ".d..........d.",
      ".dd........dd.",
      ".dbbbbbbbbbbd.",
      "bbfffbbbbfffbb",
      "bfeeefbbfeeefb",
      "bfekefbbfekefb",
      "bfeeefyyfeeefb",
      "bbfffbyybfffbb",
      "dbbbbbbbbbbbbd",
      "dbbwwlwwlwwbbd",
      "dbwlwwlwwlwwbd",
      "dbbwwlwwlwwbbd",
      ".dbbwwwwwwbbd.",
      "..dbbbbbbbbd..",
      "...yy....yy...",
    ] },
    parrot: { pal: { r: "#e8382a", y: "#ffcf3a", b: "#2f6fd6", w: "#f4f0e6", k: "#1a1a1a", c: "#efe2c4", f: "#6a6a6a" }, f0: [
      "......rrr.....",
      ".....rrrrr....",
      "....rrwwkr....",
      "....rrwwwccc..",
      "....rrrrrcckk.",
      "....rrrrr.ckk.",
      "...rrrrrr.....",
      "..rryyyrrr....",
      "..ryyyyyrr....",
      "..rbbbyyrr....",
      "..bbbbbbrr....",
      "..bbbbbrrr....",
      "..bbbbrrr.....",
      ".bbbbrr.ff....",
      ".rbbr..ff.....",
      "rrbr..........",
      "rbr...........",
      "rr............",
    ] },
    snake: { pal: { b: "#77823a", l: "#97a250", s: "#2e3014", w: "#d6c27a", k: "#111111", t: "#e0284a" }, f0: snakeRows,
      f1: snakeRows.map((r, i) => (i === 2 ? r + "tt" : i === 1 ? r + "..t" : i === 3 ? r.slice(0, 22) + "..t" : r)) },
  };
  function grid(c, G, step) {
    const alt = step % 2, rows = (alt && G.f1) || G.f0, w = Math.max(...G.f0.map(r => r.length)), h = rows.length;
    const x0 = -Math.floor(w / 2), y0 = 1 - h + (alt && !G.f1 ? (G.bob || -1) : 0);
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const col = G.pal[r[i]]; if (col) px(c, x0 + i, y0 + j, 1, 1, col); } });
  }

  const KINDS = {
    // Claude products — ants (primary) and chameleon (web/api)
    "claude-code": { animal: "ant", color: "#d97757", label: "Claude Code" },
    "claude-api":  { animal: "chameleon", color: "#a855f7", label: "Claude API" },
    "claude-web":  { animal: "chameleon", color: "#f59e0b", label: "Claude.ai" },
    // Other AI providers — beetles
    "codex":       { animal: "beetle", color: "#2fa39a", label: "Codex" },
    "chatgpt":     { animal: "beetle", color: "#10a37f", label: "ChatGPT" },
    "openai":      { animal: "beetle", color: "#10a37f", label: "OpenAI API" },
    "grok":        { animal: "beetle", color: "#6c67f1", label: "Grok" },
    "gemini":      { animal: "beetle", color: "#4285f4", label: "Gemini" },
    "perplexity":  { animal: "beetle", color: "#20b0b0", label: "Perplexity" },
    "copilot":     { animal: "beetle", color: "#0078d4", label: "Copilot" },
    // Primary roster
    infra: { animal: "ant", color: "#c9a27a", label: "Termite" },
    backend: { animal: "snake", color: "#2fa39a", label: "Anaconda" },
    frontend: { animal: "frog", color: "#5a9e6f", label: "Tree frog" },
    ux: { animal: "hummingbird", color: "#e87aaa", label: "Hummingbird" },
    pm: { animal: "monkey", color: "#a8703f", label: "Spider monkey" },
    marketing: { animal: "toucan", color: "#ff8c1a", label: "Toucan" },
    sales: { animal: "parrot", color: "#ff5522", label: "Macaw" },
    research: { animal: "owl", color: "#3fb6e8", label: "Owl" },
    // Legacy role aliases
    engineering: { animal: "ant", color: "#d97757", label: "Engineering" },
    devops: { animal: "frog", color: "#5a9e6f", label: "DevOps" },
    gtm: { animal: "parrot", color: "#ff8c1a", label: "GTM" },
    outreach: { animal: "parrot", color: "#ff5522", label: "Outreach" },
    python: { animal: "monkey", color: "#a8703f", label: "Python agent" },
    snake: { animal: "snake", color: "#7a9a4a", label: "Snake agent" },
  };
  const OUTLINE = "#10170f", SW = 40, SH = 34, FX = 20, FY = 30, sprites = new Map();
  function sprite(type, step, colorOverride) {
    const k = KINDS[type] || KINDS.frontend, color = colorOverride || k.color, key = `${type}|${step % 2}|${colorOverride || ''}`;
    if (sprites.has(key)) return sprites.get(key);
    const make = () => { const c = document.createElement("canvas"); c.width = SW * RS; c.height = SH * RS; c.getContext("2d").setTransform(RS, 0, 0, RS, 0, 0); return c; };
    const raw = make(), r = raw.getContext("2d"); r.translate(FX, FY); ANIMALS[k.animal](r, color, step % 2);
    const sil = make(), sc = sil.getContext("2d"); sc.setTransform(1, 0, 0, 1, 0, 0); sc.drawImage(raw, 0, 0); sc.globalCompositeOperation = "source-in"; sc.fillStyle = OUTLINE; sc.fillRect(0, 0, SW * RS, SH * RS);
    const out = make(), o = out.getContext("2d"); o.setTransform(1, 0, 0, 1, 0, 0);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(sil, dx * RS, dy * RS);
    o.drawImage(raw, 0, 0); sprites.set(key, out); return out;
  }
  const avatarCache = {};
  function avatar(type, colorOverride) {
    const key = colorOverride ? type + '|' + colorOverride : type;
    if (avatarCache[key]) return avatarCache[key];
    const s = sprite(type, 0, colorOverride), c = document.createElement("canvas"); c.width = 48; c.height = 48;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(s, 8 * RS, 8 * RS, 24 * RS, 24 * RS, 0, 0, 48, 48);
    return (avatarCache[key] = c.toDataURL());
  }

  // ---------------- markers above heads
  const ICONS = {
    research: [".xxx...", "x...x..", "x...x..", "x...x..", ".xxx...", "....xx.", ".....xx"],
    build: [".xxx...", "xxxxx..", ".xxx...", "..xx...", "...xx..", "....xx.", ".....xx"],
    cmd: ["x......", ".x.....", "..x....", ".x.....", "x......", ".......", "...xxxx"],
    board: ["xxxxxxx", "x.....x", "x.xxx.x", "x.....x", "x.xxx.x", "x.....x", "xxxxxxx"],
    check: ["......x", ".....xx", "x...xx.", "xx.xx..", ".xxx...", "..x....", "......."],
  };
  const ACT_ICON = { researching: "research", building: "build", "running commands": "cmd", "taking orders": "board", "checking off": "check" };
  function icon(c, name, x, y, color) { ICONS[name].forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "x") px(c, x + i, y + j, 1, 1, color); }); }
  function marker(c, a, t, top) {
    const x = Math.round(a.x), st = a.data.status; top = Math.round(top);
    if (st === "needs_you") {
      const b = Math.round(Math.sin(t * 6) * 1.5);
      px(c, x - 4, top - 6 + b, 9, 11, "#10170f"); px(c, x - 3, top - 5 + b, 7, 9, "#ffd23f"); px(c, x, top - 4 + b, 1, 4, "#10170f"); px(c, x, top + 1 + b, 1, 1, "#10170f");
    } else if (st === "stuck") {
      px(c, x - 4, top - 5, 9, 10, "#10170f"); px(c, x - 3, top - 4, 7, 8, "#f8a830"); px(c, x - 1, top - 3, 3, 1, "#10170f"); px(c, x + 1, top - 2, 1, 2, "#10170f"); px(c, x, top, 1, 1, "#10170f"); px(c, x, top + 2, 1, 1, "#10170f");
    } else if (st === "working") {
      const ic = ACT_ICON[a.data.activity], b = Math.round(Math.sin(t * 3));
      px(c, x - 6, top - 7 + b, 13, 11, "#10170f"); px(c, x - 5, top - 6 + b, 11, 9, "#f2f2f3"); px(c, x - 1, top + 4 + b, 3, 1, "#10170f"); px(c, x, top + 5 + b, 1, 1, "#10170f");
      if (ic) icon(c, ic, x - 3, top - 5 + b, ic === "check" ? "#2a8a44" : "#1d1f20");
      else { const n = Math.floor(t * 3) % 4; for (let i = 0; i < 3; i++) px(c, x - 4 + i * 3, top - 2 + b, 2, 2, i < n ? "#1d1f20" : "#b8bcc0"); }
    } else if (st === "idle" && a.data.answer) {
      px(c, x - 4, top - 4, 9, 9, "#10170f"); px(c, x - 3, top - 3, 7, 7, "#3fbf6a");
      px(c, x - 2, top, 1, 1, "#fff"); px(c, x - 1, top + 1, 1, 1, "#fff"); px(c, x, top, 1, 1, "#fff"); px(c, x + 1, top - 1, 1, 1, "#fff"); px(c, x + 2, top - 2, 1, 1, "#fff");
    } else if (st === "sleeping") {
      const f = (t * 0.8) % 1; c.globalAlpha = 1 - f;
      px(c, x + 2, top - f * 8, 4, 1, "#e8f0ff"); px(c, x + 4, top + 1 - f * 8, 1, 1, "#e8f0ff"); px(c, x + 3, top + 2 - f * 8, 1, 1, "#e8f0ff"); px(c, x + 2, top + 3 - f * 8, 4, 1, "#e8f0ff");
      c.globalAlpha = 1;
    }
  }

  function mount(canvas, opts) {
    canvas.width = W * RS; canvas.height = H * RS;
    const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
    const mk = () => { const c = document.createElement("canvas"); c.width = W * RS; c.height = H * RS; return c; };
    const back = mk(), front = mk(), far = mk(), fore = mk(), tmp = mk();
    let band = -1, agents = new Map(), hoverId = null, bankHover = false, raf = 0, last = performance.now(), alive = true;
    let hour = opts.hour ?? 12, composedAt = -99, dark = 0, anim = null, lastNotify = 0;
    const flies = Array.from({ length: 28 }, (_, i) => ({ x: rand(i + 5000) * W, y: 60 + rand(i + 5100) * 200, p: rand(i + 5200) * 6.28 }));
    { const f = far.getContext("2d"); f.setTransform(RS, 0, 0, RS, 0, 0); drawFar(f); }
    { const f = front.getContext("2d"); f.setTransform(RS, 0, 0, RS, 0, 0); drawFrontLeaves(f); }

    function scenery(health) {
      band = health; const pal = FOLIAGE[health];
      const b = fore.getContext("2d"); b.setTransform(RS, 0, 0, RS, 0, 0); b.clearRect(0, 0, W, H);
      drawSoil(b); drawRoots(b); drawVines(b, pal); drawFruit(b, pal); drawTrunk(b, pal);
      for (const l of ["canopy", "understory"]) { drawBranch(b, l, -1, pal); drawBranch(b, l, 1, pal); }
      drawFloor(b, pal); drawCanopy(b, pal); drawHuts(b);
      composedAt = -99;
    }
    function tinted(b, src, tint, a) {
      const t = tmp.getContext("2d"); t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, tmp.width, tmp.height); t.drawImage(src, 0, 0);
      if (a > 0.001) { t.globalCompositeOperation = "source-atop"; t.globalAlpha = a; t.fillStyle = tint; t.fillRect(0, 0, tmp.width, tmp.height); t.globalAlpha = 1; t.globalCompositeOperation = "source-over"; }
      b.save(); b.setTransform(1, 0, 0, 1, 0, 0); b.drawImage(tmp, 0, 0); b.restore();
    }
    function compose(h) {
      const S = sample(h); dark = Math.min(1, S.alpha / 0.55);
      const b = back.getContext("2d"); b.setTransform(RS, 0, 0, RS, 0, 0); b.globalCompositeOperation = "source-over"; b.clearRect(0, 0, W, H);
      const g = b.createLinearGradient(0, 0, 0, GROUND_Y); [0, 0.3, 0.65, 1].forEach((p, i) => g.addColorStop(p, S.stops[i]));
      b.fillStyle = g; b.fillRect(0, 0, W, GROUND_Y);
      drawSunMoon(b, ((h % 24) + 24) % 24, dark);
      tinted(b, far, S.stops[2], 0.3 + S.alpha * 0.9);
      const m = b.createLinearGradient(0, GROUND_Y - 80, 0, GROUND_Y); m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(1, S.stops[1]);
      b.globalAlpha = 0.4 - dark * 0.2; b.fillStyle = m; b.fillRect(0, GROUND_Y - 80, W, 80); b.globalAlpha = 1;
      tinted(b, fore, S.tint, S.alpha);
      if (dark > 0.05) {
        b.globalCompositeOperation = "lighter";
        for (const [x, y, r] of [...LANTERNS, ...WINDOWS]) { const gl = b.createRadialGradient(x, y, 0, x, y, r * 1.4); gl.addColorStop(0, "rgba(255,190,90," + (0.55 * dark) + ")"); gl.addColorStop(1, "rgba(255,190,90,0)"); b.fillStyle = gl; b.fillRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8); }
        b.globalCompositeOperation = "source-over";
      }
    }
    const PARTS = [];
    let needN = 0, place = null;
    const ANIM = type => (KINDS[type] || KINDS.frontend).animal;
    const keyOf = d => { const l = d.status === "sleeping" ? "houses" : d.location; return l === "townhall" ? "board" : d.layer + l; };
    function target(a) {
      const d = a.data, loc = d.status === "sleeping" ? "houses" : d.location, Z = ZONES[d.layer] || ZONES.understory;
      const base = loc === "townhall" ? [BOARD.x, BOARD.y] : Z[loc] || Z.square, key = keyOf(d);
      const crowd = [...agents.values()].filter(o => keyOf(o.data) === key).sort((p, q) => p.data.started - q.data.started);
      const i = Math.max(0, crowd.indexOf(a)), dx = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2) * (loc === "townhall" ? 22 : 28);
      return fixSpot(base[0] + dx, base[1]);
    }
    function fixSpot(x, y) {
      x = Math.max(16, Math.min(W - 16, x));
      if (y === GROUND_Y && Math.abs(x - TRUNK_X) < 54) x = TRUNK_X + (x < TRUNK_X ? -54 : 54);
      if ((y === BRC || y === BRU) && Math.abs(x - TRUNK_X) < 34) x = TRUNK_X + (x < TRUNK_X ? -34 : 34);
      return { x, y };
    }
    function seg(x0, y0, x1, y1, lift, mode) { return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - lift, len: Math.hypot(x1 - x0, y1 - y0) + Math.abs(lift) * 0.9 + 1, u: 0, mode }; }
    function plan(a, to) {
      const m = MOVE[ANIM(a.data.agent_type)], S = []; let x = a.x, y = a.y;
      if (m === "crawl") {
        // All walkable levels top-to-bottom. Transitions 0-2 (above ground) use trunk; 3-4 use shafts.
        const LV = [CROWN, BRC, BRU, GROUND_Y, TUNNEL_FLOOR, DEEP_FLOOR];
        const lv = v => LV.reduce((b, l, i) => (Math.abs(l - v) < Math.abs(LV[b] - v) ? i : b), 0);
        let li = lv(y); const lj = lv(to.y);
        if (Math.abs(y - LV[li]) > 1) { S.push(seg(x, y, x, LV[li], 0, "climb")); y = LV[li]; }
        while (li !== lj) {
          const nx = li + Math.sign(lj - li), minI = Math.min(li, nx);
          let cx;
          if (minI <= 2) {
            cx = TRUNK_X; // above-ground: always climb on the main tree trunk
          } else {
            const sh = minI === 3 ? UP_SHAFTS : DOWN_SHAFTS;
            cx = sh.reduce((b, v) => (Math.abs(x - v) + Math.abs(v - to.x) < Math.abs(x - b) + Math.abs(b - to.x) ? v : b));
          }
          S.push(seg(x, y, cx, y, 0, "crawl")); S.push(seg(cx, y, cx, LV[nx], 0, "climb")); x = cx; y = LV[nx]; li = nx;
        }
        S.push(seg(x, y, to.x, to.y, 0, "crawl"));
      } else if (m === "fly") {
        S.push(seg(x, y, to.x, to.y, Math.min(70, 12 + Math.hypot(to.x - x, to.y - y) * 0.25), "fly"));
      } else if (Math.abs(to.y - y) > 4) {
        S.push(seg(x, y, to.x, to.y, Math.min(90, 30 + Math.abs(to.y - y) * 0.35), "leap"));
      } else {
        const sw = m === "swing", n = Math.max(1, Math.ceil(Math.abs(to.x - x) / (sw ? 60 : 26)));
        for (let i = 0; i < n; i++) S.push(seg(x + (to.x - x) * i / n, y, x + (to.x - x) * (i + 1) / n, y, sw ? -16 : 9, sw ? "swing" : "hop"));
      }
      a.segs = S;
    }
    function celebrate(a, now) {
      a.cele = now;
      const cols = ["#ffd23f", "#ff7ab0", "#6ff0d8", "#ffffff", "#ff8c1a", "#9ad66a"];
      for (let i = 0; i < 20; i++) PARTS.push({ x: a.x, y: a.y - 12, vx: (Math.random() * 2 - 1) * 60, vy: -40 - Math.random() * 70, life: 1.4, max: 1.4, c: cols[i % cols.length], w: 2 });
    }
    function wander(a, now) {
      const st = a.data.status, L = a.data.layer;
      a.wanderAt = now + (st === "working" ? 1400 + Math.random() * 1600 : L === "roots" ? 2000 + Math.random() * 2200 : 3200 + Math.random() * 3600);
      if (st === "needs_you" || st === "stuck" || st === "sleeping" || a.cele || a.data.location === "townhall") return;
      if (a.away) { a.away = false; plan(a, a.base); return; }
      const r = (lo, hi) => lo + Math.random() * (hi - lo);
      let p = null;
      if (st === "working") {
        p = [a.base.x + r(-22, 22), a.base.y]; a.away = true;
      } else if (st === "idle" && Math.random() < 0.55) {
        const o = L === "canopy" ? [[r(40, 536), CROWN], [r(40, 536), CROWN], [r(30, 546), BRC]]
          : L === "understory" ? [[r(30, 546), BRU], [r(50, 526), GROUND_Y], [r(30, 546), BRC]]
          : [[r(30, 546), TUNNEL_FLOOR], [r(40, 536), DEEP_FLOOR], [r(30, 546), GROUND_Y]];
        p = o[Math.floor(Math.random() * o.length)]; a.away = true;
      } else if (L === "roots") p = [a.base.x + r(-46, 46), a.base.y];
      if (p) plan(a, fixSpot(p[0], p[1]));
    }
    function setAgents(list) {
      const seen = new Set(), now = performance.now();
      for (const d of list) {
        seen.add(d.id); let a = agents.get(d.id);
        if (!a) {
          const z = target({ data: d }), roots = d.layer === "roots";
          a = { data: d, x: roots ? W + 16 : -16, y: roots ? TUNNEL_FLOOR : z.y, segs: [], face: 1, step: 0, t: Math.random() * 5, spd: 0.8 + Math.random() * 0.4, wanderAt: now + 3000 + Math.random() * 4000, cele: 0, pop: 0, vert: 0, air: false, land: 0 };
          agents.set(d.id, a);
        } else {
          const p = a.data;
          if (d.status === "idle" && d.answer && !(p.status === "idle" && p.answer)) celebrate(a, now);
          if ((d.done || 0) > (p.done || 0)) a.pop = now;
        }
        a.data = d;
      }
      for (const id of [...agents.keys()]) if (!seen.has(id)) agents.delete(id);
      for (const a of agents.values()) {
        const t = target(a);
        if (!a.base || Math.abs(a.base.x - t.x) > 0.5 || Math.abs(a.base.y - t.y) > 0.5) { a.base = t; a.away = false; plan(a, t); }
      }
      needN = list.filter(d => d.status === "needs_you").length;
      const need = list.filter(d => d.status === "needs_you" || d.status === "stuck").length;
      const h = need >= 4 ? 0 : need >= 2 ? 1 : 2; if (h !== band) scenery(h);
    }
    function drawAgent(a, now, t, dt) {
      const d = a.data, st = d.status, an = ANIM(d.agent_type), moving = a.segs.length > 0, Hh = HGT[an] || 14;
      let ox = 0, oy = 0, rot = 0, flip = 1, step = a.step, glow = 0;
      if (!moving) {
        step = st === "sleeping" ? 0 : Math.floor(a.t * 0.7) % 2;
        if (st !== "sleeping" && !a.cele) {
          ox += Math.sin(a.t * 1.1) * 0.65;
          oy += Math.sin(a.t * 0.73 + 1.6) * 0.5;
        }
        if (a.land && !a.cele) {
          const lp = Math.min(1, (now - a.land) / 380);
          if (lp < 1) oy -= Math.sin(lp * Math.PI) * 3 * (1 - lp * 0.6);
          else a.land = 0;
        }
        if (d.location === "townhall" && st !== "sleeping" && Math.abs(BOARD.x - a.x) > 2) a.face = BOARD.x > a.x ? 1 : -1;
        if (an === "hummingbird" && st !== "sleeping") { oy = -5 + Math.sin(t * 3); step = Math.floor(t * 10) % 2; }
        if (st === "working") {
          if (an === "ant") { oy = -Math.abs(Math.sin(t * 10)); step = Math.floor(t * 8) % 2; if (Math.random() < dt * 9) PARTS.push({ x: a.x + a.face * 7, y: a.y - 2, vx: a.face * (15 + Math.random() * 25), vy: -30 - Math.random() * 30, life: 0.6, max: 0.6, c: "#9a7650", w: 1 }); }
          else if (an === "snake") { ox = Math.sin(t * 4) * 1.5; step = Math.floor(t * 3) % 2; if (a.y === DEEP_FLOOR && Math.random() < dt * 4) PARTS.push({ x: a.x + a.face * 9, y: a.y - 2, vx: a.face * 20, vy: -25, life: 0.5, max: 0.5, c: "#9a7650", w: 1 }); }
          else if (an === "frog") { oy = -Math.max(0, Math.sin(t * 5)) * 3; step = oy < -1 ? 1 : 0; }
          else if (an === "hummingbird") { oy = -6 + Math.sin(t * 6) * 1.5; step = Math.floor(t * 16) % 2; }
          else if (an === "monkey") { oy = -Math.abs(Math.sin(t * 6)) * 2; step = Math.floor(t * 3) % 2; }
          else if (an === "owl") { rot = Math.sin(t * 3) * 0.08; step = Math.floor(t * 1.5) % 2; }
          else { oy = -Math.abs(Math.sin(t * 8)); step = Math.floor(t * 4) % 2; }
        }
      }
      if (a.cele) {
        const p = (now - a.cele) / 2600;
        if (p >= 1) a.cele = 0;
        else {
          glow = 1 - p * 0.5;
          if (an === "hummingbird") { const g = p * Math.PI * 4; ox = Math.sin(g) * 10; oy = -(1 - Math.cos(g)) * 8 - 5; step = Math.floor(t * 16) % 2; }
          else {
            const J = { frog: [22, 2], monkey: [18, 1], ant: [9, 3], snake: [8, 2], toucan: [16, 2], parrot: [16, 2], owl: [12, 2] }[an] || [12, 2];
            oy = -J[0] * Math.abs(Math.sin(p * J[1] * Math.PI));
            if (an === "monkey") rot = p * Math.PI * 2 * a.face;
            if (an === "snake") rot = Math.sin(p * Math.PI * 6) * 0.3;
            if (an === "owl") flip = Math.cos(p * Math.PI * 4) < 0 ? -1 : 1;
            if (an === "toucan" || an === "parrot" || an === "owl") step = Math.floor(t * 12) % 2;
          }
        }
      }
      if (st === "idle" && d.answer) glow = Math.max(glow, 0.32 + 0.12 * Math.sin(t * 3));
      if (glow > 0) {
        const gx = a.x + ox, gy = a.y + oy - Hh / 2, R = 16 + glow * 8, g = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
        g.addColorStop(0, "rgba(255,226,120," + 0.75 * glow + ")"); g.addColorStop(1, "rgba(255,226,120,0)"); ctx.fillStyle = g; ctx.fillRect(gx - R, gy - R, R * 2, R * 2);
      }
      if (!a.air && !a.vert) { ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(a.x + ox, a.y + 1, Math.max(4, 9 + oy * 0.25), 2.2, 0, 0, 6.28); ctx.fill(); }
      const s = sprite(d.agent_type, step, d.color);
      ctx.save(); ctx.translate(Math.round(a.x + ox), Math.round(a.y + oy));
      if (a.vert) { ctx.translate(0, -6); ctx.rotate(a.vert < 0 ? -Math.PI / 2 : Math.PI / 2); ctx.translate(0, 6); }
      else if (a.face < 0) ctx.scale(-1, 1);
      if (rot) { ctx.translate(0, -Hh / 2); ctx.rotate(rot); ctx.translate(0, Hh / 2); }
      if (flip !== 1) ctx.scale(flip, 1);
      if (st === "sleeping") ctx.globalAlpha = 0.75;
      ctx.drawImage(s, -FX, -FY, SW, SH); ctx.restore();
      if (d.id === hoverId || d.id === opts.selectedId?.()) brackets(ctx, a.x - 14, a.y + oy - Hh - 4, 28, Hh + 7, "#ffffff");
      if (!moving && !a.cele) marker(ctx, a, t, a.y + oy - Hh - 9);
      if (a.pop) {
        const p = (now - a.pop) / 1300;
        if (p >= 1) a.pop = 0; else { ctx.globalAlpha = 1 - p; icon(ctx, "check", Math.round(a.x + 9), Math.round(a.y - Hh - 4 - p * 14), "#3fdf6a"); ctx.globalAlpha = 1; }
      }
    }
    function frame(now) {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
      if (anim) {
        const p = Math.min(1, (now - anim.start) / (anim.dur * 1000)), k = anim.linear ? p : p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        hour = (((anim.from + (anim.to - anim.from) * k) % 24) + 24) % 24; if (p >= 1) anim = null;
      }
      if (Math.abs(hour - composedAt) > 0.004) {
        compose(hour); composedAt = hour;
        if (opts.onHour && (now - lastNotify > 80 || !anim)) { lastNotify = now; opts.onHour(hour, dark, !!anim); }
      }
      for (const a of agents.values()) {
        if (a.segs.length) {
          const s = a.segs[0]; s.u = Math.min(1, s.u + SPD[s.mode] * (a.spd || 1) * dt / s.len);
          const eu = s.u < 0.5 ? 2 * s.u * s.u : 1 - Math.pow(-2 * s.u + 2, 2) / 2;
          const u = eu, v = 1 - eu;
          const nx = v * v * s.x0 + 2 * v * u * s.cx + u * u * s.x1, ny = v * v * s.y0 + 2 * v * u * s.cy + u * u * s.y1;
          if (Math.abs(nx - a.x) > 0.02) a.face = nx > a.x ? 1 : -1;
          a.x = nx; a.y = ny; a.vert = s.mode === "climb" ? Math.sign(s.y1 - s.y0) : 0; a.air = !(s.mode === "crawl" || s.mode === "climb");
          a.t += dt; a.step = Math.floor(a.t * (s.mode === "fly" ? 12 : 8)) % 2;
          if (s.u >= 1) { a.segs.shift(); if (!a.segs.length) { a.vert = 0; a.air = false; a.land = now; } }
        } else { a.t += dt; if (now > a.wanderAt) wander(a, now); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(back, 0, 0); ctx.setTransform(RS, 0, 0, RS, 0, 0);
      drawBank(ctx, place === "bank"); drawBoard(ctx, place === "board", needN);
      for (const a of [...agents.values()].sort((p, q) => p.y - q.y)) drawAgent(a, now, t, dt);
      for (let i = PARTS.length - 1; i >= 0; i--) {
        const p = PARTS[i]; p.life -= dt; if (p.life <= 0) { PARTS.splice(i, 1); continue; }
        p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); px(ctx, p.x, p.y, p.w, 1, p.c);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(front, 0, 0); ctx.setTransform(RS, 0, 0, RS, 0, 0);
      if (dark > 0.35) for (const f of flies) {
        const x = f.x + Math.sin(t * 0.6 + f.p) * 10, y = f.y + Math.cos(t * 0.8 + f.p) * 6, al = (0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + f.p))) * Math.min(1, (dark - 0.35) / 0.4);
        ctx.fillStyle = "rgba(230,255,140," + al * 0.35 + ")"; ctx.fillRect(x - 1, y - 1, 3, 3); ctx.fillStyle = "rgba(250,255,200," + al + ")"; ctx.fillRect(x, y, 1, 1);
      }
      raf = requestAnimationFrame(frame);
    }
    function toWorld(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, r }; }
    function hit(p) {
      let best = null, bd = 16;
      for (const a of agents.values()) { const d = Math.hypot(a.x - p.x, a.y - (HGT[ANIM(a.data.agent_type)] || 14) / 2 - p.y); if (d < bd) { bd = d; best = a; } }
      return best;
    }
    const inBank = p => Math.abs(p.x - BANK.x) < 20 && p.y > BANK.y - 34 && p.y < BANK.y + 2;
    const inBoard = p => Math.abs(p.x - BOARD.x) < 22 && p.y > BOARD.y - 44 && p.y < BOARD.y + 2;
    function onMove(e) {
      const p = toWorld(e), a = hit(p); place = a ? null : inBank(p) ? "bank" : inBoard(p) ? "board" : null;
      canvas.style.cursor = a || place ? "pointer" : "default";
      hoverId = a ? a.data.id : null;
      const Hh = a ? HGT[ANIM(a.data.agent_type)] || 14 : 0;
      opts.onHover && opts.onHover(a ? a.data : null, a ? { x: a.x / W * p.r.width, y: (a.y - Hh - 4) / H * p.r.height } : null, place);
    }
    function onLeave() { hoverId = null; place = null; opts.onHover && opts.onHover(null, null, null); }
    function onClick(e) {
      const p = toWorld(e), a = hit(p);
      if (a) opts.onClick && opts.onClick(a.data); else if (inBank(p)) opts.onBank && opts.onBank(); else if (inBoard(p)) opts.onBoard && opts.onBoard(); else opts.onClick && opts.onClick(null);
    }
    canvas.addEventListener("mousemove", onMove); canvas.addEventListener("mouseleave", onLeave); canvas.addEventListener("click", onClick);
    scenery(2); raf = requestAnimationFrame(frame);
    return {
      setAgents,
      setHour(h) { anim = null; hour = ((h % 24) + 24) % 24; },
      animateTo(to, secs, from, linear) { const f = from ?? hour; let tt = to; while (tt < f) tt += 24; anim = { from: f, to: tt, start: performance.now(), dur: secs, linear: !!linear }; },
      getHour() { return hour; },
      positions() { const o = {}; for (const a of agents.values()) o[a.data.id] = { x: a.x / W, y: a.y / H }; return o; },
      destroy() { alive = false; cancelAnimationFrame(raf); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("mouseleave", onLeave); canvas.removeEventListener("click", onClick); },
    };
  }
  window.JungleEngine = { mount, avatar, KINDS, W, H };
})();
