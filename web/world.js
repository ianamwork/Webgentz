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
  // Keep the game's compact map coordinates, but paint at 2× so fine curves,
  // edges and the little critters stay crisp on modern displays.
  const RENDER_SCALE = 2;
  const TRUNK_X = 288;     // centre of the trunk, also the climbing line
  const GROUND_Y = 272;    // where the soil starts
  const TUNNEL_TOP = 300;  // the infrastructure tunnel under the tree
  const TUNNEL_FLOOR = 358;
  const SPEED = 110;       // pixels per second
  const SIZE = 2;          // creatures are drawn at double size

  const canvas = document.getElementById("world");
  canvas.width = W * RENDER_SCALE;
  canvas.height = H * RENDER_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // Words are drawn on a second, full-resolution canvas laid over the pixel
  // art, so they stay sharp and easy to read at any size.
  const stage = document.createElement("div");
  stage.className = "stage";
  canvas.parentNode.insertBefore(stage, canvas);
  stage.appendChild(canvas);
  const overlay = document.createElement("canvas");
  overlay.className = "words";
  overlay.setAttribute("aria-hidden", "true");
  stage.appendChild(overlay);
  const ui = overlay.getContext("2d");
  const READ_FONT = "Nunito, system-ui, -apple-system, 'Segoe UI', sans-serif";

  // Match the overlay to the canvas's size on screen; draw in jungle units.
  function fitOverlay() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
    const V = VIEWS[currentView];
    const sx = w / W * V.scale, sy = h / H * V.scale;
    ui.setTransform(sx, 0, 0, sy, -V.x * sx, -V.y * sy);
    ui.clearRect(V.x, V.y, W / V.scale, H / V.scale);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ layout

  // `y` is where creatures' feet rest on each layer.
  const LAYERS = {
    canopy:     { y: 104, label: "CANOPY", sub: "GROWTH & GTM", color: "#f4c542" },
    understory: { y: 212, label: "UNDERSTORY", sub: "PRODUCT", color: "#ff8a5c" },
    roots:      { y: 358, label: "ROOTS", sub: "INFRASTRUCTURE", color: "#c9a27a" },
  };
  const LAYER_ORDER = ["canopy", "understory", "roots"];

  // Each view zooms the canvas to show a slice of the tree.
  // x/y are the top-left world coord of the visible region; scale is the zoom.
  const VIEWS = {
    eagle:      { x: 0, y: 0,   scale: 1,   layer: null },
    canopy:     { x: 0, y: 0,   scale: 2.0, layer: "canopy" },
    understory: { x: 0, y: 130, scale: 2.5, layer: "understory" },
    roots:      { x: 0, y: 260, scale: 3.1, layer: "roots" },
    spawn:      { x: 0, y: 0,   scale: 1,   layer: null, nest: true },
  };
  let currentView = "eagle";

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

  function blob(c, cx, cy, r, color, squash = 1) {
    c.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      c.fillRect(Math.round(cx - half), Math.round(cy + dy * squash), half * 2, Math.max(1, Math.round(squash)));
    }
  }

  // A checkerboard of one colour over an area: the classic pixel-art way to blend.
  function dither(c, x, y, w, h, color) {
    c.fillStyle = color;
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < h; j++) {
      for (let i = (j + x + y) % 2; i < w; i += 2) c.fillRect(x + i, y + j, 1, 1);
    }
  }

  // Leaf colours from darkest to brightest, for a thriving, wilting and dying tree.
  const FOLIAGE = [
    ["#4a3a1a", "#75602b", "#a08a3a", "#d4bf62", "#f0e08a"],
    ["#33461d", "#5b7329", "#86993a", "#b5c25a", "#e0e58a"],
    ["#123824", "#1e5a32", "#2f7d3c", "#4fa34a", "#9ad66a"],
  ];

  // A clump of leaves: overlapping blobs lit from the top left.
  function clump(c, cx, cy, r, pal, seed) {
    const parts = [];
    const n = 4 + Math.floor(r / 4);
    for (let i = 0; i < n; i++) {
      const a = rand(seed + i) * Math.PI * 2;
      const d = rand(seed + i + 40) * r * 0.55;
      const s = Math.max(3, Math.round(r * (0.42 + rand(seed + i + 80) * 0.3)));
      parts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, s]);
    }
    for (const [x, y, s] of parts) blob(c, x, y + 2, s, pal[0]);
    for (const [x, y, s] of parts) blob(c, x - 1, y, s - 1, pal[1]);
    for (const [x, y, s] of parts) blob(c, x - s * 0.3, y - s * 0.3, Math.max(1, Math.round(s * 0.6)), pal[2]);
    for (const [x, y, s] of parts) blob(c, x - s * 0.45, y - s * 0.45, Math.max(1, Math.round(s * 0.3)), pal[3]);
    // single leaves catching the light
    for (let i = 0; i < r * 0.25; i++) {
      const a = rand(seed + i + 200) * Math.PI * 2;
      const d = rand(seed + i + 300) * r * 0.7;
      px(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6 - r * 0.25, 2, 1, pal[4]);
    }
  }

  // A long tropical leaf hanging at an angle, with a midrib.
  function bigLeaf(c, x, y, len, angle, pal) {
    const steps = Math.round(len);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const w = Math.round(Math.sin(t * Math.PI) * len * 0.22);
      const lx = x + Math.cos(angle) * i;
      const ly = y + Math.sin(angle) * i + t * t * len * 0.25; // tips droop
      px(c, lx - w, ly, w, 2, pal[1]);
      px(c, lx, ly, w + 1, 2, pal[2]);
      if (i % 5 === 2 && w > 2) px(c, lx + 1, ly, w - 1, 1, pal[3]);
      px(c, lx, ly, 1, 2, pal[0]); // midrib
    }
  }

  // A fern growing out of the forest floor.
  function fern(c, x, base, h, pal, seed) {
    const fronds = 5;
    for (let f = 0; f < fronds; f++) {
      const dir = f / (fronds - 1) * 2 - 1;           // -1 left ... 1 right
      const len = h * (0.75 + rand(seed + f) * 0.4) * (1 - Math.abs(dir) * 0.25);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const fx = x + dir * i * 0.9;
        const fy = base - i * (1 - Math.abs(dir) * 0.55) + t * t * len * Math.abs(dir) * 0.7;
        px(c, fx, fy, 1, 1, pal[1]);
        if (i % 3 === 0 && t > 0.15) {
          const leaf = Math.max(1, Math.round((1 - t) * 4));
          px(c, fx - leaf, fy - 1, leaf, 1, pal[2]);
          px(c, fx + 1, fy - 1, leaf, 1, pal[3]);
        }
      }
    }
  }

  // ------------------------------------------------------------ scenery

  const back = document.createElement("canvas");
  back.width = W * RENDER_SCALE; back.height = H * RENDER_SCALE;
  const front = document.createElement("canvas");
  front.width = W * RENDER_SCALE; front.height = H * RENDER_SCALE;

  function drawSky(c) {
    const g = c.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, "#eaf5c9");
    g.addColorStop(0.3, "#a6d394");
    g.addColorStop(0.65, "#3f7d56");
    g.addColorStop(1, "#173b2a");
    c.fillStyle = g;
    c.fillRect(0, 0, W, GROUND_Y);

    // three rows of distant trees, paler and hazier the further back they are
    const depths = [
      { n: 11, bark: "#86b38a", pal: ["#8fbf90", "#9ccb9b", "#abd4a8", "#bcdeb5", "#cfe8c4"], top: 40, w: 8, r: 20 },
      { n: 9,  bark: "#4f8a62", pal: ["#3f7d55", "#4c8c60", "#5c9c6b", "#72af7c", "#8cc290"], top: 70, w: 12, r: 24 },
      { n: 7,  bark: "#2c5a3e", pal: ["#1b4630", "#24563a", "#2f6846", "#3d7b53", "#4f8f62"], top: 96, w: 16, r: 26 },
    ];
    depths.forEach((d, k) => {
      for (let i = 0; i < d.n; i++) {
        const seed = k * 100 + i;
        const x = (i + 0.2 + rand(seed) * 0.6) * (W / d.n);
        const top = d.top + rand(seed + 7) * 40;
        px(c, x - d.w / 2, top, d.w, GROUND_Y - top, d.bark);
        px(c, x - d.w / 2, top, 2, GROUND_Y - top, d.pal[3]);
        clump(c, x, top - 4, d.r + Math.round(rand(seed + 9) * 8), d.pal, seed * 13);
        if (rand(seed + 11) > 0.5) clump(c, x + 14, top + 30, 10, d.pal, seed * 17);
      }
      c.fillStyle = "rgba(214,238,200,0.16)"; // haze between rows
      c.fillRect(0, 0, W, GROUND_Y);
    });
  }

  function drawSoil(c) {
    const s = c.createLinearGradient(0, GROUND_Y, 0, H);
    s.addColorStop(0, "#5e3e25");
    s.addColorStop(1, "#21150c");
    c.fillStyle = s;
    c.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    // layers in the earth
    for (let y = GROUND_Y + 7; y < H; y += 8) {
      for (let x = 0; x < W; x += 1) {
        if (rand(x * 7 + y) < 0.45) px(c, x, y + Math.round(Math.sin(x / 23 + y) * 1.5), 1, 1, "rgba(0,0,0,0.18)");
      }
    }
    // pebbles
    for (let i = 0; i < 46; i++) {
      const x = rand(i + 300) * W;
      const y = GROUND_Y + 6 + rand(i + 400) * (H - GROUND_Y - 8);
      if (y > TUNNEL_TOP - 4 && y < TUNNEL_FLOOR + 4) continue;
      const w = 2 + Math.round(rand(i + 500) * 3);
      px(c, x, y, w, 2, "#7d6048");
      px(c, x, y, w - 1, 1, "#a08268");
      px(c, x + 1, y + 2, w, 1, "#2a1a10");
    }

    // the infrastructure tunnel, dug out and propped up with timber
    px(c, 0, TUNNEL_TOP, W, TUNNEL_FLOOR - TUNNEL_TOP, "#1d130b");
    dither(c, 0, TUNNEL_TOP, W, TUNNEL_FLOOR - TUNNEL_TOP, "#241810");
    for (let x = 0; x < W; x++) {
      const bump = Math.round(rand(x + 900) * 2.4);
      px(c, x, TUNNEL_TOP - bump, 1, bump + 2, "#3a2717");
      px(c, x, TUNNEL_FLOOR - 1 + Math.round(rand(x + 950) * 1.2), 1, 2, "#140c07");
    }
    px(c, 0, TUNNEL_FLOOR, W, 5, "#5a3d27");
    px(c, 0, TUNNEL_FLOOR, W, 1, "#8a6544");
    for (let x = 4; x < W; x += 9) px(c, x + rand(x) * 5, TUNNEL_FLOOR + 2, 2, 1, "#47301e");

    for (let x = 18; x < W; x += 96) {
      // timber frame
      px(c, x, TUNNEL_TOP + 2, 4, TUNNEL_FLOOR - TUNNEL_TOP - 2, "#5c3f26");
      px(c, x, TUNNEL_TOP + 2, 1, TUNNEL_FLOOR - TUNNEL_TOP - 2, "#86603d");
      px(c, x + 3, TUNNEL_TOP + 2, 1, TUNNEL_FLOOR - TUNNEL_TOP - 2, "#3a2716");
      px(c, x - 8, TUNNEL_TOP, 20, 4, "#6b4a2e");
      px(c, x - 8, TUNNEL_TOP, 20, 1, "#94704a");
      // lantern hanging from the beam, with a warm glow
      const lx = x + 28, ly = TUNNEL_TOP + 12;
      const glow = c.createRadialGradient(lx, ly, 0, lx, ly, 26);
      glow.addColorStop(0, "rgba(255,196,96,0.45)");
      glow.addColorStop(1, "rgba(255,196,96,0)");
      c.fillStyle = glow;
      c.fillRect(lx - 26, ly - 26, 52, 52);
      px(c, lx, TUNNEL_TOP + 1, 1, 8, "#3a2716");
      px(c, lx - 2, ly - 3, 5, 1, "#3a2716");
      px(c, lx - 2, ly - 2, 5, 6, "#ffc45c");
      px(c, lx - 1, ly - 1, 3, 3, "#fff3c4");
      px(c, lx - 2, ly + 4, 5, 1, "#3a2716");
    }
    // glowing mushrooms along the tunnel floor
    for (let i = 0; i < 9; i++) {
      const x = 40 + rand(i + 1234) * (W - 80);
      px(c, x, TUNNEL_FLOOR - 3, 1, 3, "#cfe8d0");
      px(c, x - 2, TUNNEL_FLOOR - 5, 5, 2, "#6ff0d8");
      px(c, x - 1, TUNNEL_FLOOR - 6, 3, 1, "#b8fff0");
    }
  }

  function drawRoots(c, pal) {
    c.lineCap = "round";
    for (let i = 0; i < 11; i++) {
      const dir = i % 2 ? 1 : -1;
      const len = 50 + rand(i + 700) * 230;
      const drop = 6 + rand(i) * (TUNNEL_TOP - GROUND_Y - 8);
      const width = 7 - i * 0.45;
      const path = () => {
        c.beginPath();
        c.moveTo(TRUNK_X + dir * 14, GROUND_Y + 1);
        c.quadraticCurveTo(TRUNK_X + dir * len * 0.45, GROUND_Y + drop * 0.4, TRUNK_X + dir * len, GROUND_Y + drop);
      };
      c.strokeStyle = "#3a2414"; c.lineWidth = width; path(); c.stroke();
      c.strokeStyle = "#6b4528"; c.lineWidth = Math.max(1, width - 3);
      c.save(); c.translate(0, -1); path(); c.stroke(); c.restore();
    }
    // taproot down to the tunnel
    px(c, TRUNK_X - 10, GROUND_Y, 20, TUNNEL_TOP - GROUND_Y + 2, "#4a2f1c");
    px(c, TRUNK_X - 10, GROUND_Y, 4, TUNNEL_TOP - GROUND_Y + 2, "#6b4528");
    // little rootlets hanging into the tunnel
    for (let i = 0; i < 14; i++) {
      const x = rand(i + 820) * W;
      const len = 3 + rand(i + 840) * 8;
      for (let y = 0; y < len; y++) px(c, x + Math.sin(y / 2 + i) * 1, TUNNEL_TOP + 1 + y, 1, 1, "#5a3a22");
    }
  }

  function trunkHalf(y) {
    const t = Math.max(0, (y - 20) / (GROUND_Y - 20));
    return 20 + Math.pow(t, 4) * 26; // flares out into buttresses at the base
  }

  function drawTrunk(c, pal) {
    for (let y = 20; y < GROUND_Y + 2; y++) {
      const half = Math.round(trunkHalf(y));
      const x0 = TRUNK_X - half;
      px(c, x0, y, half * 2, 1, "#6b4226");
      px(c, x0, y, Math.round(half * 0.5), 1, "#86573a");       // lit side
      px(c, x0, y, 2, 1, "#a87450");
      px(c, TRUNK_X + Math.round(half * 0.45), y, Math.round(half * 0.55), 1, "#4f2f1a"); // shade side
      px(c, TRUNK_X + half - 2, y, 2, 1, "#371f10");
      // bark grooves wander down the trunk
      for (let k = -3; k <= 3; k++) {
        const gx = TRUNK_X + (k / 3.6) * half + Math.sin(y / 11 + k * 1.7) * 1.6;
        px(c, gx, y, 1, 1, k < 0 ? "#6b4226" : "#3d2414");
      }
    }
    // knots in the wood
    for (const y of [70, 160, 250]) {
      blob(c, TRUNK_X - 8, y, 3, "#3d2414");
      blob(c, TRUNK_X - 8, y, 1, "#86573a");
    }
    // a vine spiralling up the trunk
    for (let y = 30; y < GROUND_Y; y++) {
      const half = trunkHalf(y);
      const s = Math.sin(y / 18);
      if (s > -0.2) px(c, TRUNK_X + s * half * 0.9, y, 2, 1, s > 0.5 ? pal[3] : pal[2]);
      if (y % 9 === 0 && s > 0) px(c, TRUNK_X + s * half * 0.9 + 2, y - 1, 3, 2, pal[3]);
    }
    // a hollow at each layer, where agents take orders and wait for you
    for (const name of ["canopy", "understory"]) {
      const y = LAYERS[name].y - 14;
      blob(c, TRUNK_X, y, 11, "#3d2414", 1.2);
      blob(c, TRUNK_X, y + 1, 9, "#140a05", 1.2);
      blob(c, TRUNK_X - 2, y - 2, 4, "#0a0503", 1.2);
      px(c, TRUNK_X - 8, y + 11, 16, 2, "#a87450"); // worn lip
    }
  }

  function drawBranch(c, layer, side, pal) {
    const y = LAYERS[layer].y;
    const start = TRUNK_X + side * (trunkHalf(y) - 4);
    const end = side < 0 ? 10 : W - 10;
    const len = Math.abs(end - start);
    for (let i = 0; i <= len; i++) {
      const x = start + side * i;
      const t = i / len;
      const thick = Math.round(11 - 7 * t);
      px(c, x, y, 1, thick, "#6b4226");
      px(c, x, y, 1, 2, "#a87450");
      px(c, x, y + thick - 2, 1, 2, "#3d2414");
      if (rand(Math.round(x) + y) < 0.12) px(c, x, y + 2 + rand(x) * (thick - 4), 1, 1, "#4f2f1a");
    }
    // moss along the top and twigs with leaves
    for (let i = 0; i < 9; i++) {
      const x = start + side * (16 + rand(i + y + side * 50) * (len - 30));
      dither(c, x, y - 1, 6 + rand(i) * 8, 2, pal[3]);
    }
    for (let i = 0; i < 4; i++) {
      const x = start + side * (40 + i * (len - 50) / 4 + rand(i + y) * 12);
      const twig = 10 + rand(i + y + 3) * 8;
      for (let k = 0; k < twig; k++) px(c, x + side * k * 0.6, y + 6 + k, 1, 1, "#4f2f1a");
      bigLeaf(c, x + side * twig * 0.6, y + 6 + twig, 9 + rand(i + y) * 5, side < 0 ? Math.PI * 0.6 : Math.PI * 0.4, pal);
    }
    // rounded tip
    blob(c, end, y + 2, 2, "#6b4226");
  }

  function drawCanopy(c, pal) {
    // back row, then front row of the tree's crown
    for (let i = 0; i < 16; i++) {
      const x = (i + rand(i + 1000)) * (W / 15) - 20;
      clump(c, x, 18 + rand(i + 1100) * 22, 30 + Math.round(rand(i + 1200) * 10), pal, i * 37 + 1);
    }
    for (let i = 0; i < 12; i++) {
      const x = (i + rand(i + 1300)) * (W / 11) - 10;
      clump(c, x, 52 + rand(i + 1400) * 14, 16 + Math.round(rand(i + 1500) * 8), pal, i * 41 + 5);
    }
    // leaves dripping down below the crown
    for (let i = 0; i < 22; i++) {
      const x = rand(i + 1550) * W;
      const len = 4 + rand(i + 1560) * 12;
      for (let k = 0; k < len; k++) px(c, x, 66 + k, 1, 1, pal[1]);
      px(c, x - 1, 66 + len, 3, 2, pal[2]);
    }
  }

  // Little treehouse stops sit along the existing routes. Their shared timber
  // shape makes one village; the roof and doorway details give each place a cue.
  function drawHuts(c) {
    // ── Canopy layer ──────────────────────────────────────────────────────
    const cy = LAYERS.canopy.y;

    // LEFT: Lookout post — tall flag tower on the upper branch
    {
      const x = 108, y = cy;
      // platform floor and supports
      px(c, x - 12, y - 5, 24, 3, "#c88a50");
      px(c, x - 12, y - 5, 24, 1, "#e0a870");
      px(c, x - 8,  y - 2, 3, 4, "#7a4a28");
      px(c, x + 5,  y - 2, 3, 4, "#7a4a28");
      // railing posts and top rail
      px(c, x - 10, y - 17, 2, 12, "#8b5e3c");
      px(c, x + 8,  y - 17, 2, 12, "#8b5e3c");
      px(c, x - 10, y - 17, 20, 2, "#a07040");
      // mid rail
      px(c, x - 10, y - 12, 20, 1, "#8b5e3c");
      // flag pole
      px(c, x + 8,  y - 24, 1, 8, "#6b4226");
      // gold triangular pennant (3 rows tapering right-to-left)
      px(c, x + 9,  y - 24, 8, 1, "#f4c542");
      px(c, x + 9,  y - 23, 6, 1, "#e8b030");
      px(c, x + 9,  y - 22, 4, 1, "#f4c542");
      px(c, x + 9,  y - 21, 2, 1, "#e8b030");
      // lantern hanging below platform
      px(c, x,      y - 5,  1, 3, "#6b4226");
      px(c, x - 2,  y - 3,  4, 3, "#ffc45c");
      px(c, x - 1,  y - 2,  2, 1, "#fff3c4");
    }

    // RIGHT: Bird roost — cozy thatched shelter for scouts returning home
    {
      const x = 462, y = cy;
      // A-frame thatched roof (widening rows)
      for (let i = 0; i <= 9; i++) {
        const w = i * 2 + 4;
        px(c, x - i - 2, y - 20 + i, w, 1, i % 2 === 0 ? "#c8a050" : "#a07038");
      }
      // walls
      px(c, x - 10, y - 11, 20, 7, "#ddb87a");
      px(c, x - 10, y - 11, 20, 1, "#e8c88a");
      // doorway arch (simple)
      px(c, x - 3,  y - 9,  6, 5, "#6b3a1a");
      px(c, x - 2,  y - 10, 4, 1, "#7a4a28");
      // windows
      px(c, x - 8,  y - 9,  4, 3, "#ffe4a0");
      px(c, x + 4,  y - 9,  4, 3, "#ffe4a0");
      // bird silhouette on ridge
      px(c, x - 1,  y - 22, 1, 1, "#3a2810");
      px(c, x,      y - 23, 3, 1, "#3a2810");
      px(c, x + 3,  y - 22, 1, 2, "#3a2810");
      px(c, x - 2,  y - 22, 1, 1, "#3a2810");
    }

    // ── Understory layer ─────────────────────────────────────────────────
    const uy = LAYERS.understory.y;

    // LEFT: Workshop — squat hut with a pickaxe on the wall and smoke
    {
      const x = 108, y = uy;
      // pitched roof (widening rows of shingles)
      for (let i = 0; i <= 11; i++) {
        const w = i * 2 + 4;
        px(c, x - i - 2, y - 22 + i, w, 1, i % 2 === 0 ? "#7a5a2a" : "#5e4820");
      }
      // wall
      px(c, x - 12, y - 11, 24, 8, "#c8a060");
      px(c, x - 12, y - 11, 24, 1, "#d8b070");
      // doorway (wider workshop entrance)
      px(c, x - 4,  y - 9,  8, 7, "#3a2410");
      // window with cross-bar
      px(c, x - 10, y - 9,  5, 4, "#ffe4a0");
      px(c, x - 8,  y - 9,  1, 4, "#c8a060");
      px(c, x - 10, y - 8,  5, 1, "#c8a060");
      // chimney and smoke
      px(c, x + 5,  y - 28, 4, 8, "#a07040");
      px(c, x + 5,  y - 28, 4, 1, "#c09060");
      px(c, x + 5,  y - 30, 3, 2, "#c8b8a8");
      px(c, x + 4,  y - 32, 5, 2, "#b0a090");
      // pickaxe hanging on wall
      px(c, x + 11, y - 17, 2, 7, "#6b4226");
      px(c, x + 9,  y - 19, 5, 2, "#888080");
      px(c, x + 9,  y - 19, 1, 2, "#aaaaaa");
    }

    // RIGHT: Fruit market stall — striped awning, hanging produce
    {
      const x = 462, y = uy;
      // striped awning (3-color columns)
      for (let i = 0; i < 22; i++) {
        const col = i % 3 === 0 ? "#ff6840" : i % 3 === 1 ? "#ffd840" : "#fff8e8";
        px(c, x - 11 + i, y - 16, 1, 7, col);
      }
      // awning front trim
      px(c, x - 11, y - 10, 22, 1, "#c84820");
      // scalloped hem (alternating drop pixels)
      for (let i = 0; i < 11; i++) px(c, x - 11 + i * 2, y - 9, 1, 2, "#c84820");
      // support poles
      px(c, x - 11, y - 9,  2, 9, "#8b5e3c");
      px(c, x + 9,  y - 9,  2, 9, "#8b5e3c");
      // counter/table
      px(c, x - 11, y - 1, 22, 3, "#c8a060");
      px(c, x - 11, y - 1, 22, 1, "#d8b070");
      // hanging fruit (4 items)
      for (let i = 0; i < 4; i++) {
        const fx = x - 8 + i * 5;
        const clr = ["#ff6f4f", "#ffb02e", "#e84a7f", "#7fc244"][i];
        px(c, fx,     y - 14, 1, 3, "#3d5a20");
        px(c, fx - 1, y - 12, 3, 3, clr);
        px(c, fx,     y - 12, 1, 1, shade(clr, 50));
      }
    }

    // ── Roots layer ───────────────────────────────────────────────────────
    const ry = TUNNEL_FLOOR;

    // LEFT: Mine entrance — timber-framed arch with lantern and rail tracks
    {
      const x = 100, y = ry;
      // timber frame sides
      px(c, x - 13, y - 18, 5, 18, "#5c3f26");
      px(c, x + 8,  y - 18, 5, 18, "#5c3f26");
      px(c, x - 13, y - 18, 1, 18, "#7a5a3a");
      px(c, x + 12, y - 18, 1, 18, "#3a2010");
      // top beam
      px(c, x - 13, y - 19, 26, 4, "#6b4a2e");
      px(c, x - 13, y - 19, 26, 1, "#8a6040");
      // dark tunnel interior
      px(c, x - 8,  y - 15, 16, 15, "#1a0e08");
      // arched top of the tunnel interior (3-row stepped arch)
      px(c, x - 7,  y - 16, 14, 1, "#1a0e08");
      px(c, x - 6,  y - 17, 12, 1, "#1a0e08");
      px(c, x - 4,  y - 18, 8,  1, "#1a0e08");
      // lantern hanging on wire
      px(c, x,      y - 19, 1, 3, "#4a3020");
      px(c, x - 2,  y - 17, 4, 4, "#ffc45c");
      px(c, x - 1,  y - 16, 2, 2, "#fff3c4");
      px(c, x - 2,  y - 17, 1, 4, "#e8a840");
      // rail tracks on the floor
      px(c, x - 12, y - 2,  24, 1, "#5a4030");
      px(c, x - 12, y - 1,  24, 1, "#5a4030");
      for (let i = -10; i <= 10; i += 5) px(c, x + i, y - 2, 1, 1, "#7a6050");
    }

    // RIGHT: Power station — brick box with glowing vents and gauges
    {
      const x = 464, y = ry;
      // main brick body
      px(c, x - 12, y - 18, 24, 18, "#3a3040");
      px(c, x - 12, y - 18, 24, 1,  "#5a4a60");
      px(c, x - 12, y - 18, 1,  18, "#4a3a50");
      // brick pattern (alternating row offsets)
      for (let row = 0; row < 5; row++) {
        const off = row % 2 === 0 ? 0 : 4;
        for (let col = 0; col < 3; col++) {
          px(c, x - 11 + off + col * 8, y - 16 + row * 3, 7, 2, "#312840");
          px(c, x - 11 + off + col * 8, y - 15 + row * 3, 7, 1, "#2a2238");
        }
      }
      // glowing cyan vent slots (3 across)
      for (let i = 0; i < 3; i++) {
        px(c, x - 8 + i * 6, y - 13, 4, 2, "#004c4a");
        px(c, x - 8 + i * 6, y - 13, 4, 1, "#00c8c0");
        px(c, x - 7 + i * 6, y - 13, 2, 1, "#80ffff");
      }
      // instrument panel (3 dial bezels with indicator lights)
      for (let i = 0; i < 3; i++) {
        px(c, x - 7 + i * 5, y - 9, 4, 4, "#1a1828");
        px(c, x - 7 + i * 5, y - 9, 4, 1, "#2a2840");
      }
      px(c, x - 6, y - 8, 2, 2, "#ff4040");
      px(c, x - 1, y - 8, 2, 2, "#40ff80");
      px(c, x + 4, y - 8, 2, 2, "#ffd040");
      // pipe leading into wall on the right
      px(c, x + 12, y - 14, 8, 3, "#5a5070");
      px(c, x + 12, y - 14, 8, 1, "#7a6a90");
      px(c, x + 19, y - 14, 1, 3, "#3a3050");
      // access door
      px(c, x - 4,  y - 7,  8, 7, "#28243a");
      px(c, x - 4,  y - 7,  1, 7, "#3a3050");
      px(c, x - 1,  y - 5,  1, 1, "#c8c0e0");
    }
  }

  function drawVines(c, pal) {
    for (let i = 0; i < 12; i++) {
      const x = 24 + rand(i + 1700) * (W - 48);
      if (Math.abs(x - TRUNK_X) < 40) continue;
      const top = LAYERS.canopy.y + 6;
      const len = 40 + rand(i + 1710) * 120;
      for (let k = 0; k < len; k++) {
        const vx = x + Math.sin((top + k) / 13 + i) * 2;
        px(c, vx, top + k, 1, 1, "#2a5a30");
        if (k > 20 && k % 37 === 0) {
          const s = (k / 37) % 2 ? 1 : -1;
          bigLeaf(c, vx, top + k, 10 + rand(i + k) * 6, s > 0 ? Math.PI * 0.3 : Math.PI * 0.7, pal);
        } else if (k % 8 === 4) {
          const s = (k / 8) % 2 ? 1 : -1;
          px(c, vx + (s > 0 ? 1 : -3), top + k, 3, 2, pal[3]);
          px(c, vx + (s > 0 ? 1 : -3), top + k + 1, 3, 1, pal[2]);
        }
      }
    }
  }

  function drawUnderstory(c, pal) {
    // fruit hanging below the product branch
    const y = LAYERS.understory.y;
    for (let i = 0; i < 18; i++) {
      const x = 26 + rand(i + 1900) * (W - 52);
      if (Math.abs(x - TRUNK_X) < 44) continue;
      const hang = 10 + rand(i + 1910) * 10;
      px(c, x, y + 6, 1, hang - 4, "#3d5a20");
      const fruit = [["#ff6f4f", "#c4402a"], ["#ffb02e", "#c47a10"], ["#e84a7f", "#a82858"]][i % 3];
      blob(c, x, y + hang, 3, fruit[1]);
      blob(c, x - 1, y + hang - 1, 2, fruit[0]);
      px(c, x - 2, y + hang - 2, 1, 1, "#fff7e0");
      px(c, x + 1, y + 4, 3, 2, pal[3]); // leaf at the stem
    }
  }

  function drawFloor(c, pal) {
    // bushes behind, ferns in front, then flowers, mushrooms and grass
    for (let i = 0; i < 16; i++) {
      const x = rand(i + 2000) * W;
      if (Math.abs(x - TRUNK_X) < 60) continue;
      clump(c, x, GROUND_Y - 8, 10 + Math.round(rand(i + 2010) * 8), pal, i * 53 + 9);
    }
    for (let i = 0; i < 14; i++) {
      const x = 8 + rand(i + 2100) * (W - 16);
      if (Math.abs(x - TRUNK_X) < 52) continue;
      fern(c, x, GROUND_Y, 14 + rand(i + 2110) * 10, pal, i * 7);
    }
    for (let i = 0; i < 12; i++) {
      const x = rand(i + 2200) * W;
      if (Math.abs(x - TRUNK_X) < 50) continue;
      const color = ["#ff7ab0", "#ffd23f", "#ffffff", "#ff8a5c"][i % 4];
      px(c, x, GROUND_Y - 6, 1, 6, pal[1]);
      px(c, x - 1, GROUND_Y - 8, 3, 1, color);
      px(c, x, GROUND_Y - 9, 1, 3, color);
      px(c, x, GROUND_Y - 8, 1, 1, "#7a4a10");
    }
    for (const x of [TRUNK_X - 70, TRUNK_X + 58, 120, 470]) {
      px(c, x, GROUND_Y - 4, 2, 4, "#efe4cf");
      px(c, x - 3, GROUND_Y - 7, 8, 3, "#d8452e");
      px(c, x - 2, GROUND_Y - 8, 6, 1, "#d8452e");
      px(c, x - 1, GROUND_Y - 7, 1, 1, "#fff");
      px(c, x + 2, GROUND_Y - 6, 1, 1, "#fff");
    }
    for (let x = 0; x < W; x += 2) {
      const h = 1 + Math.round(rand(x + 2300) * 4);
      px(c, x, GROUND_Y - h, 1, h, rand(x + 2400) < 0.5 ? pal[3] : pal[2]);
    }
    px(c, 0, GROUND_Y, W, 1, "#2a1a0e");
  }

  function drawLayerLabels(c) {
    c.textBaseline = "middle";
    const place = { canopy: LAYERS.canopy.y + 16, understory: LAYERS.understory.y + 30, roots: TUNNEL_FLOOR + 7 };
    for (const name of LAYER_ORDER) {
      const L = LAYERS[name];
      const y = place[name];
      c.font = `800 7px ${READ_FONT}`;
      const head = L.label.charAt(0) + L.label.slice(1).toLowerCase();
      const hw = c.measureText(head).width;
      c.font = `600 7px ${READ_FONT}`;
      const sub = L.sub === "GROWTH & GTM" ? "growth & GTM" : L.sub.toLowerCase();
      const sw = c.measureText(sub).width;
      const w = 12 + hw + 5 + sw + 7;
      c.fillStyle = "rgba(14,26,19,0.85)";
      roundRect(c, 6, y, w, 14, 3);
      c.fill();
      c.fillStyle = L.color;
      roundRect(c, 6, y, 3, 14, 1.5);
      c.fill();
      c.fillStyle = "#ffffff";
      c.font = `800 7px ${READ_FONT}`;
      c.fillText(head, 13, y + 7.3);
      c.fillStyle = "#c9d8cc";
      c.font = `600 7px ${READ_FONT}`;
      c.fillText(sub, 13 + hw + 5, y + 7.3);
    }
  }

  function drawFrontLeaves(c, pal) {
    // dark leaves in the top corners frame the scene
    for (const [x, y, s] of [[-6, -4, 1], [W + 6, -4, -1]]) {
      for (let i = 0; i < 4; i++) {
        bigLeaf(c, x, y + i * 7, 26 - i * 3, s > 0 ? 0.6 + i * 0.25 : Math.PI - 0.6 - i * 0.25,
          ["#081a10", "#0e2a1a", "#143822", "#1c4a2c"]);
      }
    }
    // soft shadow at the edges
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, "rgba(6,18,12,0)");
    v.addColorStop(1, "rgba(6,18,12,0.35)");
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }

  function drawScenery(health) {
    const pal = FOLIAGE[healthBand(health)];
    const b = back.getContext("2d");
    b.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    b.clearRect(0, 0, W, H);
    drawSky(b);
    drawSoil(b);
    drawRoots(b, pal);
    drawVines(b, pal);
    drawUnderstory(b, pal);
    drawTrunk(b, pal);
    for (const layer of ["canopy", "understory"]) {
      drawBranch(b, layer, -1, pal);
      drawBranch(b, layer, 1, pal);
    }
    drawFloor(b, pal);
    drawCanopy(b, pal);
    drawHuts(b);
    const f = front.getContext("2d");
    f.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    f.clearRect(0, 0, W, H);
    drawFrontLeaves(f, pal);
  }

  // ------------------------------------------------------------ creatures

  // Each kind of agent is a different animal. Unknown kinds become chameleons.
  const KINDS = {
    // Claude products — chameleon, warm palette
    "claude-code": { animal: "chameleon", color: "#d97757", label: "Claude Code" },
    "claude-api":  { animal: "chameleon", color: "#a855f7", label: "Claude API" },
    "claude-web":  { animal: "chameleon", color: "#f59e0b", label: "Claude.ai" },
    // Provider agents — all beetle, brand colors
    "codex":       { animal: "beetle",    color: "#2fa39a", label: "Codex" },
    "chatgpt":     { animal: "beetle",    color: "#10a37f", label: "ChatGPT" },
    "openai":      { animal: "beetle",    color: "#10a37f", label: "OpenAI API" },
    "grok":        { animal: "beetle",    color: "#6c67f1", label: "Grok" },
    "gemini":      { animal: "beetle",    color: "#4285f4", label: "Gemini" },
    "perplexity":  { animal: "beetle",    color: "#20b0b0", label: "Perplexity" },
    "copilot":     { animal: "beetle",    color: "#0078d4", label: "Copilot" },
    // Primary roster — one animal per discipline
    "infra":       { animal: "ant",         color: "#c9a27a", label: "Infra" },
    "backend":     { animal: "snake",       color: "#2fa39a", label: "Backend" },
    "frontend":    { animal: "frog",        color: "#5a9e6f", label: "Frontend" },
    "ux":          { animal: "hummingbird", color: "#e87aaa", label: "UX" },
    "pm":          { animal: "monkey",      color: "#a8703f", label: "PM" },
    "marketing":   { animal: "toucan",      color: "#ff8c1a", label: "Marketing" },
    "sales":       { animal: "parrot",      color: "#ff5522", label: "Sales" },
    "research":    { animal: "owl",         color: "#3fb6e8", label: "Research" },
    // Legacy role aliases
    "engineering": { animal: "ant",         color: "#d97757", label: "Engineering" },
    "design":      { animal: "butterfly",   color: "#e87aaa", label: "Design" },
    "devops":      { animal: "frog",        color: "#5a9e6f", label: "DevOps" },
    "gtm":         { animal: "parrot",      color: "#ff8c1a", label: "GTM" },
    "outreach":    { animal: "parrot",      color: "#ff5522", label: "Outreach" },
    "python":      { animal: "monkey",      color: "#a8703f", label: "Python agent" },
    "snake":       { animal: "snake",       color: "#7a9a4a", label: "Snake agent" },
  };
  const PALETTE = ["#d97757","#e87aaa","#e8c630","#4caf50","#2fa39a","#4f7fe0","#9b6abf","#e05050","#c48030","#5a5a7a"];

  const CUSTOM_KEY = "webgentz-custom";
  let customizations = {};
  try { customizations = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "{}"); } catch {}
  function saveCustom() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customizations)); } catch {} }
  function customOf(id) { return customizations[id] || {}; }
  function setCustom(id, obj) { customizations[id] = obj; saveCustom(); }
  function clearCustom(id) { delete customizations[id]; saveCustom(); }

  const kindOf = d => {
    const base = KINDS[d.agent_type] || { animal: "chameleon", color: "#8a8a9a", label: d.agent_type || "Agent" };
    const c = customOf(d.id);
    return c.color ? { ...base, color: c.color } : base;
  };
  const displayName = d => customOf(d.id).name || d.name;

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (n & 255) + amount));
    return `rgb(${r},${g},${b})`;
  }

  // A rounded body part with a shaded underside and a highlight on top.
  function ball(c, cx, cy, r, color, squash = 1) {
    blob(c, cx, cy, r, shade(color, -50), squash);
    blob(c, cx - 0.5, cy - 0.6, Math.max(1, r - 1), color, squash);
    if (r >= 2) blob(c, cx - r * 0.35, cy - r * 0.45 * squash, Math.max(1, Math.round(r * 0.35)), shade(color, 50), squash);
  }

  // Every drawer paints a creature facing right with its feet at (0, 0).
  const ANIMALS = {
    ant(c, color, step) {
      const dark = shade(color, -90);
      for (let i = 0; i < 3; i++) {
        const lx = -3 + i * 3;
        const swing = (i + step) % 2 ? 1 : -1;
        px(c, lx, -5, 1, 2, dark);
        px(c, lx + swing, -3, 1, 3, dark);
      }
      ball(c, -6, -7, 4, color, 0.8);
      px(c, -8, -8, 1, 3, shade(color, -30));
      px(c, -3, -7, 2, 1, dark);
      ball(c, 0, -7, 2, color);
      ball(c, 5, -9, 3, color);
      px(c, 6, -10, 1, 1, "#111");
      px(c, 8, -7, 2, 1, dark);
      px(c, 5, -12, 1, 1, dark);
      px(c, 6, -13, 1, 1, dark);
      px(c, 7, -14, 2, 1, dark);
    },
    beetle(c, color, step) {
      const legs = step % 2;
      for (let i = 0; i < 3; i++) px(c, -5 + i * 4 + (legs ? 1 : 0), -2, 1, 2, "#16161c");
      ball(c, -1, -6, 6, color, 0.72);              // shell
      px(c, -1, -10, 1, 7, shade(color, -70));      // seam
      px(c, -5, -9, 3, 1, shade(color, 110));       // shine
      ball(c, 6, -5, 2, "#24242c");                 // head
      px(c, 8, -8, 1, 2, "#24242c");                // horn
      px(c, 9, -9, 1, 1, "#24242c");
      px(c, 7, -6, 1, 1, "#e8e8e8");
    },
    frog(c, color, step) {
      const hop = step % 2 ? -2 : 0;
      const dark = shade(color, -60);
      ball(c, -5, -3 + hop, 3, color);              // back leg
      px(c, -8, -1 + hop, 5, 1, dark);              // back foot
      ball(c, 0, -5 + hop, 5, color, 0.8);          // body
      px(c, -2, -2 + hop, 7, 2, shade(color, 70));  // pale belly
      ball(c, 3, -9 + hop, 2, color);               // eye bump
      px(c, 3, -10 + hop, 2, 2, "#fff8e0");
      px(c, 4, -10 + hop, 1, 2, "#111");
      px(c, 2, -5 + hop, 4, 1, dark);               // smile
      px(c, 4, -2 + hop, 1, 2, dark);               // front leg
      px(c, 4, -1 + hop, 3, 1, dark);
      px(c, -3, -8 + hop, 1, 1, shade(color, -30)); // spots
      px(c, 0, -9 + hop, 1, 1, shade(color, -30));
    },
    monkey(c, color, step) {
      const dark = shade(color, -55);
      const face = "#f2cfa6";
      const legs = step % 2;
      // curly tail
      px(c, -6, -6, 1, 1, dark); px(c, -7, -7, 1, 3, dark); px(c, -8, -11, 1, 4, dark);
      px(c, -9, -13, 1, 2, dark); px(c, -8, -14, 2, 1, dark); px(c, -6, -13, 1, 1, dark);
      px(c, -3 + legs, -4, 2, 4, dark);             // legs
      px(c, 1 - legs, -4, 2, 4, dark);
      ball(c, -1, -8, 4, color);                    // body
      px(c, 0, -8, 3, 3, face);                     // tummy
      px(c, 3, -9, 1, 4, dark);                     // arm
      ball(c, 3, -14, 4, color);                    // head
      ball(c, -1, -15, 1.5, face);                  // ear
      ball(c, 5, -13, 2.5, face);                   // face
      px(c, 5, -15, 1, 1, "#111");
      px(c, 7, -12, 1, 1, shade(color, -80));       // nose
    },
    toucan(c, color, step) {
      const flap = step % 2;
      px(c, -1, -2, 1, 2, "#e08a00");               // feet
      px(c, 2, -2, 1, 2, "#e08a00");
      px(c, -10, -8, 5, 3, "#18181e");              // tail
      ball(c, -1, -7, 5, "#2a2a34", 0.9);           // body
      ball(c, 2, -10, 2.5, "#fff3c8");              // bib
      px(c, 1, -7, 3, 1, "#ffcf3f");
      ball(c, -3, flap ? -11 : -7, 3, "#3a3a46", 0.7); // wing
      ball(c, 3, -13, 3, "#2a2a34");                // head
      px(c, 3, -15, 2, 2, "#7fd6ff");               // eye ring
      px(c, 4, -15, 1, 1, "#111");
      px(c, 6, -15, 8, 3, color);                   // big beak
      px(c, 7, -15, 5, 1, shade(color, 70));
      px(c, 6, -13, 7, 1, shade(color, -60));
      px(c, 13, -14, 1, 2, "#18181e");
    },
    chameleon(c, color, step) {
      const dark = shade(color, -70);
      const mid  = shade(color, -30);
      const hi   = shade(color, 60);
      const anim = step % 2;
      // coiled tail (extends left)
      px(c, -11, -2, 5, 2, mid);
      px(c, -12, -4, 2, 3, dark);
      px(c, -10, -6, 3, 2, dark);
      px(c, -8,  -5, 2, 1, mid);
      // gripping feet (slightly animated)
      px(c, -6, 0, 4, 1, dark);
      px(c, -3, -1 + (anim ? 1 : 0), 1, 1, dark);
      px(c, -3, -3, 1, 3, dark);
      px(c, 2,  0, 4, 1, dark);
      px(c, 4,  -1 - (anim ? 1 : 0), 1, 1, dark);
      px(c, 4,  -3, 1, 3, dark);
      // body (wide, squished oval)
      ball(c, 0, -6, 5, color, 0.68);
      // dorsal spines
      px(c, -3, -11, 1, 2, mid);
      px(c, -1, -12, 1, 3, mid);
      px(c,  1, -11, 1, 2, mid);
      px(c,  3, -10, 1, 2, mid);
      // head + casque
      ball(c, 6, -8, 3, color);
      px(c, 4, -11, 5, 4, color);
      px(c, 5, -11, 3, 1, hi);
      // big turret eye
      ball(c, 7, -10, 2, shade(color, 80));
      px(c, 7, -11, 2, 2, "#f8f8d8");
      px(c, 8, -11, 1, 1, "#111");
      // tongue shoots out on frame 1
      if (anim) {
        px(c, 9,  -8, 5, 1, "#f0b8d8");
        px(c, 13, -9, 2, 1, "#e02060");
        px(c, 13, -7, 2, 1, "#e02060");
      }
    },
    parrot(c, color, step) {
      const flap = step % 2;
      const dark = shade(color, -55);
      // colorful tail feathers
      px(c, -10, -2, 2, 6, "#d03820");
      px(c, -8,  -2, 2, 7, "#e08820");
      px(c, -6,  -2, 2, 5, "#d0c020");
      // feet
      px(c, 0, -1, 1, 2, "#c49020");
      px(c, 3, -1, 1, 2, "#c49020");
      // body
      ball(c, 0, -7, 5, color, 0.82);
      blob(c, 0, -6, 3, shade(color, 90), 0.9);    // bright breast
      // wing
      ball(c, -3, flap ? -10 : -6, 3, dark, 0.72);
      // head
      ball(c, 4, -12, 3, color);
      px(c, 3, -15, 1, 3, "#d03820");              // red crest
      px(c, 5, -15, 1, 2, "#e08820");
      // eye
      px(c, 5, -13, 3, 3, "#fffce0");
      px(c, 6, -13, 1, 1, "#111");
      // hooked beak
      px(c, 7, -13, 3, 2, "#c49020");
      px(c, 8, -12, 2, 1, "#c49020");
      px(c, 9, -11, 1, 1, "#906010");
    },
    raven(c, color, step) {
      const flap = step % 2;
      const sheen = shade(color, 50);
      // forked tail
      px(c, -10, -4, 5, 2, shade(color, -15));
      px(c, -10, -6, 2, 3, shade(color, -15));
      px(c, -6,  -4, 2, 2, shade(color, -15));
      // feet
      px(c, -1, -2, 1, 2, "#444");
      px(c, 2,  -2, 1, 2, "#444");
      // body (sleek, low squash)
      ball(c, -1, -8, 5, color, 0.72);
      px(c, -3, -9, 4, 2, sheen);                  // iridescent sheen
      // wing
      ball(c, -3, flap ? -11 : -7, 4, shade(color, 18), 0.65);
      // head
      ball(c, 3, -13, 3, color);
      px(c, 2, -14, 3, 1, sheen);
      // glowing blue eye (techy look)
      px(c, 4, -14, 2, 2, "#4a90ff");
      px(c, 5, -14, 1, 1, "#c0d8ff");
      // sharp beak
      px(c, 6, -14, 5, 2, shade(color, 20));
      px(c, 6, -13, 5, 1, shade(color, -30));
      px(c, 10, -13, 1, 1, shade(color, -50));
    },
    butterfly(c, color, step) {
      const flap = step % 2;
      const dark = shade(color, -55);
      const hi   = shade(color, 70);
      const lo   = shade(color, -80);           // deep contrast for lower wings
      const body = "#1a1a22";
      if (!flap) {
        // wings spread — lower wings first so body overlaps them
        blob(c, -7, -5, 5, lo, 1.2);            // left lower wing
        blob(c,  4, -5, 4, lo, 1.2);            // right lower wing
        px(c, -6, -3, 2, 2, shade(color, -40)); // lower wing accent
        px(c,  3, -3, 2, 2, shade(color, -40));
        // upper wings
        blob(c, -8, -12, 6, color, 0.75);
        blob(c,  5, -12, 5, color, 0.75);
        px(c, -10, -13, 3, 2, hi);              // highlights
        px(c,   5, -13, 2, 2, hi);
        px(c,  -7,  -9, 2, 2, body);            // eyespots
        px(c,   4,  -9, 2, 2, body);
      } else {
        // wings closing upward
        blob(c, -4, -13, 4, dark, 0.8);
        blob(c,  2, -13, 4, dark, 0.8);
        blob(c, -3,  -8, 3, lo, 0.9);
        blob(c,  1,  -8, 3, lo, 0.9);
      }
      // body drawn last so it sits cleanly on wings
      px(c, -1, -14, 2, 11, body);
      ball(c, 0, -15, 2, body);
      // antennae
      px(c, -2, -16, 1, 3, body);
      px(c,  1, -16, 1, 3, body);
      px(c, -3, -19, 2, 2, color);              // tips match wing color
      px(c,  1, -19, 2, 2, color);
    },
    lizard(c, color, step) {
      const dark  = shade(color, -60);
      const belly = shade(color, 60);
      const legs  = step % 2;
      // tapering tail (left)
      px(c, -14, -3, 2, 1, dark);
      px(c, -13, -4, 3, 2, dark);
      px(c, -10, -5, 4, 3, shade(color, -30));
      // back leg
      px(c, -6, -1, 1, 2, dark);
      px(c, -8 + (legs ? 2 : 0), 0, 4, 1, dark);
      // body (long and low)
      ball(c, -2, -6, 5, color, 0.62);
      px(c, -3, -3, 8, 2, belly);              // pale belly stripe
      // front leg
      px(c, 3,  0, 4, 1, dark);
      px(c, 4, -1, 1, 2, dark);
      // neck and head
      px(c, 5, -7, 3, 4, shade(color, -20));
      ball(c, 8, -8, 3, color);
      px(c, 9, -7, 4, 2, shade(color, -30));   // tapering snout
      // eye
      px(c, 8, -10, 2, 2, "#fff8e0");
      px(c, 9, -10, 1, 1, "#111");
      // tongue flick on odd step
      if (legs) {
        px(c, 12, -7, 3, 1, "#e03060");
        px(c, 14, -8, 1, 1, "#e03060");
        px(c, 14, -6, 1, 1, "#e03060");
      }
    },
    snake(c, color, step) {
      const dark  = shade(color, -55);
      const belly = shade(color, 65);
      const anim  = step % 2;
      // tail coil (left)
      px(c, -12, -2, 4, 2, dark);
      px(c, -13, -4, 2, 3, dark);
      px(c, -11, -5, 3, 1, color);
      // S-curve body
      px(c,  -8, -3, 5, 3, color);
      px(c,  -7, -2, 4, 1, belly);
      px(c,  -4, -7, 6, 4, color);
      px(c,  -3, -6, 4, 1, belly);
      px(c,   1, -10, 5, 3, color);
      px(c,   2,  -9, 3, 1, belly);
      // head
      ball(c, 7, -10, 3, color);
      px(c, 9,  -9, 3, 2, shade(color, -20));  // snout
      px(c, 7, -12, 2, 2, "#fff8e0");           // eye
      px(c, 8, -12, 1, 1, "#111");
      // tongue
      if (anim) {
        px(c, 12,  -9, 3, 1, "#e02060");
        px(c, 14, -10, 1, 1, "#e02060");
        px(c, 14,  -8, 1, 1, "#e02060");
      }
    },
    hummingbird(c, color, step) {
      const dark   = shade(color, -55);
      const gorget = shade(color, 80);
      const hover  = step % 2 ? -1 : 0;
      // feet
      px(c, -1, -1 + hover, 1, 2, dark);
      px(c,  2, -1 + hover, 1, 2, dark);
      // forked tail
      px(c, -7, -4 + hover, 4, 1, dark);
      px(c, -7, -6 + hover, 3, 1, dark);
      // body
      ball(c, 0, -8 + hover, 3, color, 0.82);
      px(c, -1, -6 + hover, 3, 1, gorget);
      // wings (rapid beat — blurred above or below body each frame)
      if (step % 2) {
        px(c, -4, -12 + hover, 7, 4, shade(color, 20));
      } else {
        px(c, -4,  -7 + hover, 7, 4, shade(color, 20));
      }
      // head
      ball(c, 3, -11 + hover, 2, color);
      px(c, 3, -12 + hover, 2, 2, "#fffce0");
      px(c, 4, -12 + hover, 1, 1, "#111");
      // needle beak
      px(c, 5, -11 + hover, 8, 1, dark);
    },
    owl(c, color, step) {
      const dark  = shade(color, -60);
      const belly = shade(color, 50);
      const blink = step % 2;
      // feet/talons
      px(c, -2, 0, 2, 2, dark);
      px(c,  2, 0, 2, 2, dark);
      // body
      ball(c, 0, -8, 6, color, 0.9);
      // wing feather edges
      px(c, -5, -11, 2, 7, dark);
      px(c,  4, -11, 2, 7, dark);
      // pale belly
      ball(c, 0, -6, 4, belly, 1.1);
      // head (wide, round)
      ball(c, 0, -15, 5, color, 0.92);
      // ear tufts
      px(c, -4, -19, 2, 3, dark);
      px(c,  3, -19, 2, 3, dark);
      px(c, -4, -20, 1, 1, dark);
      px(c,  4, -20, 1, 1, dark);
      // facial disc
      ball(c, 0, -14, 4, shade(color, 12), 0.9);
      // big eyes
      px(c, -3, -16, 3, 3, blink ? shade(color, 30) : "#fffce0");
      px(c,  1, -16, 3, 3, blink ? shade(color, 30) : "#fffce0");
      if (!blink) {
        px(c, -2, -16, 1, 1, "#111");
        px(c,  2, -16, 1, 1, "#111");
      }
      // hooked beak
      px(c, -1, -13, 2, 2, "#c49020");
      px(c,  0, -12, 1, 1, "#906010");
    },
  };

  // Each creature is drawn once per pose into a small image with a dark
  // outline, then reused every frame.
  const OUTLINE = "#10170f";
  const sprites = new Map();
  const SPRITE_W = 40, SPRITE_H = 34, FOOT_X = 20, FOOT_Y = 30;

  function sprite(animal, color, step) {
    const key = `${animal}|${color}|${step % 2}`;
    if (sprites.has(key)) return sprites.get(key);
    const make = () => {
      const c = document.createElement("canvas");
      c.width = SPRITE_W * RENDER_SCALE; c.height = SPRITE_H * RENDER_SCALE;
      c.getContext("2d").setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
      return c;
    };
    const raw = make();
    const r = raw.getContext("2d");
    r.translate(FOOT_X, FOOT_Y);
    ANIMALS[animal](r, color, step % 2);
    const silhouette = make();
    const sc = silhouette.getContext("2d");
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.drawImage(raw, 0, 0);
    sc.globalCompositeOperation = "source-in";
    sc.fillStyle = OUTLINE;
    sc.fillRect(0, 0, SPRITE_W * RENDER_SCALE, SPRITE_H * RENDER_SCALE);
    const out = make();
    const o = out.getContext("2d");
    o.setTransform(1, 0, 0, 1, 0, 0);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(silhouette, dx * RENDER_SCALE, dy * RENDER_SCALE);
    o.drawImage(raw, 0, 0);
    sprites.set(key, out);
    return out;
  }

  // ------------------------------------------------------------ agents

  const agents = new Map(); // id -> { data, x, y, path, face, step, alpha }
  let selectedId = null;

  function spotFor(d) {
    const spot = SPOTS[d.location] || SPOTS.square;
    return { x: spot.x, y: LAYERS[layerOf(d)].y };
  }

  function targetFor(agent) {
    // Sleepers are parked well outside the map and live in the Nest view.
    if (agent.data.status === "sleeping") return { x: -1000, y: -1000 };
    const base = spotFor(agent.data);
    if (agent.data.location === "gate") return base;
    const crowd = [...agents.values()]
      .filter(a => a.data.location === agent.data.location && layerOf(a.data) === layerOf(agent.data)
        && a.data.status !== "gone" && a.data.status !== "sleeping")
      .sort((a, b) => a.data.started - b.data.started);
    const i = Math.max(0, crowd.indexOf(agent));
    const dx = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 18 * SIZE;
    return { x: Math.max(14, Math.min(W - 14, base.x + dx)), y: base.y };
  }

  // Walk along the branch to the trunk, climb, then walk out to the spot.
  function routeTo(a, t) {
    if (Math.abs(a.y - t.y) < 1) return [t];
    return [{ x: TRUNK_X, y: a.y }, { x: TRUNK_X, y: t.y }, t];
  }

  function retarget() {
    for (const a of agents.values()) {
      if (a.data.status === "sleeping") {
        a.x = -1000; a.y = -1000; a.path = [];
        continue;
      }
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
      const sleeping = data.status === "sleeping";
      a = { data, x: sleeping ? -1000 : -16, y: sleeping ? -1000 : LAYERS[layerOf(data)].y, path: [], face: 1, step: 0, stepTime: 0, alpha: 1, seed: agents.size * 1.7 };
      agents.set(data.id, a);
    }
    a.data = data;
    if (data.status === "sleeping" && selectedId === data.id) selectedId = null;
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

  // What the speech bubble says, and how it looks.
  function bubbleFor(a) {
    const d = a.data;
    const dots = ".".repeat(1 + (Math.floor(clock * 2.5) % 3)).padEnd(3, "\u2007");
    if (d.status === "needs_you") return { text: "! Needs you", look: "urgent" };
    if (d.status === "stuck") return { text: "? Stuck", look: "urgent" };
    if (d.status === "sleeping") return { text: "Zz", look: "quiet" };
    if (d.status === "idle") return d.prompts ? { text: "\u2713 Done", look: "done" } : { text: "Ready", look: "quiet" };
    if (d.activity === "taking orders") return { text: `Thinking${dots}`, look: "working" };
    const tool = (d.detail || "").split(":")[0].replace(/^mcp__/, "").slice(0, 14);
    return { text: `${tool || "Working"}${dots}`, look: "working" };
  }

  const BUBBLE = {
    working: { fill: "#fbfaf2", ink: "#14201a" },
    done:    { fill: "#3fbf6a", ink: "#ffffff" },
    urgent:  { fill: "#ffd23f", ink: "#14201a" },
    quiet:   { fill: "#dfe6dc", ink: "#4a5a4f" },
  };

  function drawBubble(bubble, cx, top, alpha) {
    const { text, look } = bubble;
    const colors = BUBBLE[look];
    ui.globalAlpha = alpha;
    ui.font = `700 7.5px ${READ_FONT}`;
    ui.textBaseline = "middle";
    ui.textAlign = "center";
    const w = Math.max(12, ui.measureText(text).width + 8);
    const h = 12, x = cx - w / 2, y = top - h - 3;
    ui.fillStyle = "rgba(0,0,0,0.25)";
    roundRect(ui, x, y + 1, w, h, 3);
    ui.fill();
    ui.fillStyle = colors.fill;
    roundRect(ui, x, y, w, h, 3);
    ui.fill();
    ui.beginPath(); // little tail pointing at the animal
    ui.moveTo(cx - 2.5, y + h - 0.5); ui.lineTo(cx + 2.5, y + h - 0.5); ui.lineTo(cx, y + h + 2.5);
    ui.fill();
    ui.strokeStyle = "rgba(20,32,26,0.55)";
    ui.lineWidth = 0.5;
    roundRect(ui, x, y, w, h, 3);
    ui.stroke();
    ui.fillStyle = colors.ink;
    ui.fillText(text, cx, y + h / 2 + 0.4);
    ui.textAlign = "left";
    ui.globalAlpha = 1;
  }

  // ------------------------------------------------------------ ambience

  const motes = Array.from({ length: 26 }, (_, i) => ({
    x: rand(i + 3000) * W, y: rand(i + 3100) * GROUND_Y, kind: i % 3 ? "firefly" : "leaf", phase: rand(i + 3200) * 6,
  }));

  function drawAmbience(t) {
    // sun rays through gaps in the canopy
    const ray = ctx.createLinearGradient(0, 50, 0, GROUND_Y);
    ray.addColorStop(0, "rgba(255,248,200,0.16)");
    ray.addColorStop(1, "rgba(255,248,200,0)");
    ctx.fillStyle = ray;
    for (let i = 0; i < 4; i++) {
      const x = 70 + i * 140 + (reduceMotion ? 0 : Math.sin(t * 0.2 + i) * 6);
      const w = 14 + (i % 2) * 10;
      ctx.beginPath();
      ctx.moveTo(x, 50); ctx.lineTo(x + w, 50); ctx.lineTo(x + w + 80, GROUND_Y); ctx.lineTo(x + 50, GROUND_Y);
      ctx.fill();
    }
    if (reduceMotion) return;
    for (const m of motes) {
      if (m.kind === "leaf") {
        const y = (m.y + t * 14) % GROUND_Y;
        const x = m.x + Math.sin(t + m.phase) * 8;
        const flip = Math.sin(t * 3 + m.phase) > 0;
        px(ctx, x, y, flip ? 3 : 2, 2, "#9ad66a");
        px(ctx, x + 1, y + 2, 1, 1, "#3f8a3a");
      } else if (m.y > 120) {
        const glow = (Math.sin(t * 2 + m.phase) + 1) / 2;
        if (glow > 0.4) {
          const fx = m.x + Math.sin(t * 0.5 + m.phase) * 10, fy = m.y + Math.cos(t * 0.7 + m.phase) * 6;
          px(ctx, fx - 1, fy - 1, 4, 4, `rgba(255,240,140,${glow * 0.25})`);
          px(ctx, fx, fy, 2, 2, `rgba(255,248,180,${glow})`);
        }
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

    fitOverlay();
    const V = VIEWS[currentView];
    const vrs = RENDER_SCALE * V.scale;
    ctx.save();
    ctx.setTransform(vrs, 0, 0, vrs, -V.x * vrs, -V.y * vrs);
    ctx.drawImage(back, 0, 0, W * RENDER_SCALE, H * RENDER_SCALE, 0, 0, W, H);
    drawAmbience(clock);

    const list = [...agents.values()];
    for (const a of list) update(a, dt);
    list.sort((p, q) => p.y - q.y);

    for (const a of list) {
      if (!agents.has(a.data.id) || a.data.status === "sleeping") continue;
      const kind = kindOf(a.data);
      const x = Math.round(a.x), y = Math.round(a.y);
      ctx.globalAlpha = Math.max(0, a.alpha) * (a.data.status === "sleeping" ? 0.65 : 1);
      const resting = !a.path.length;
      if (a.data.status === "working" && !reduceMotion) {
        // a gentle pulse while the agent is busy
        const pulse = (clock * 1.2 + (a.seed || 0)) % 1;
        ui.strokeStyle = `rgba(255,236,150,${0.7 * (1 - pulse)})`;
        ui.lineWidth = 0.8;
        ui.beginPath();
        ui.ellipse(x, y, 6 + pulse * 10, 2 + pulse * 3, 0, 0, Math.PI * 2);
        ui.stroke();
      }
      if (!a.climbing) {
        // soft shadow under the feet
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(x - 4 * SIZE, y - 1, 8 * SIZE, 2);
        ctx.fillRect(x - 3 * SIZE, y + 1, 6 * SIZE, 1);
      }
      // a little breathing bob while standing still
      const breathe = resting && a.data.status !== "sleeping" && !reduceMotion
        && Math.sin(clock * 3 + (a.seed || 0)) > 0.5 ? 1 : 0;
      ctx.save();
      ctx.translate(x, y - breathe);
      if (a.climbing) {
        // head points the way it is climbing
        ctx.translate(-4 * SIZE, -6 * SIZE);
        ctx.rotate(a.climbDir < 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      ctx.scale((a.climbing ? 1 : a.face) * SIZE, SIZE);
      ctx.drawImage(sprite(kind.animal, kind.color, a.step), 0, 0, SPRITE_W * RENDER_SCALE, SPRITE_H * RENDER_SCALE,
        -FOOT_X, -FOOT_Y, SPRITE_W, SPRITE_H);
      ctx.restore();
      const head = y - 19 * SIZE;
      if (a.data.id === selectedId) {
        const blink = Math.floor(clock * 4) % 2;
        px(ctx, x - 5, head - 22 - blink, 11, 3, OUTLINE);
        px(ctx, x - 4, head - 22 - blink, 9, 2, "#ffd23f");
        px(ctx, x - 1, head - 20 - blink, 3, 3, "#ffd23f");
      }
      if (resting && a.data.status !== "gone") {
        const bubble = bubbleFor(a);
        const hop = bubble.look === "urgent" ? Math.round(Math.abs(Math.sin(clock * 6)) * 2) : 0;
        drawBubble(bubble, x, head - hop, ctx.globalAlpha);
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(front, 0, 0, W * RENDER_SCALE, H * RENDER_SCALE, 0, 0, W, H);
    ctx.restore();
    drawLayerLabels(ui);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ clicking

  function agentAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = ((clientX - rect.left) / rect.width) * W;
    const my = ((clientY - rect.top) / rect.height) * H;
    const V = VIEWS[currentView];
    const wx = mx / V.scale + V.x;
    const wy = my / V.scale + V.y;
    let best = null, bestD = 10 * SIZE;
    for (const a of agents.values()) {
      if (a.data.status === "sleeping") continue;
      const d = Math.hypot(wx - a.x, wy - (a.y - 7 * SIZE));
      if (d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  canvas.addEventListener("click", e => {
    const a = agentAt(e.clientX, e.clientY);
    select(a ? a.data.id : null);
    if (a && a.data.open) jumpTo(a.data);
  });
  canvas.addEventListener("mousemove", e => {
    canvas.style.cursor = agentAt(e.clientX, e.clientY) ? "pointer" : "default";
  });

  // ------------------------------------------------------------ right-click customisation menu

  const ctxStyle = document.createElement("style");
  ctxStyle.textContent = `
    .agent-ctx {
      position: fixed; background: #0c1810; border: 1px solid #2a4030;
      border-radius: 10px; padding: 14px; width: 196px;
      box-shadow: 0 6px 30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(154,214,106,0.07);
      z-index: 999; font-family: Nunito, system-ui, sans-serif; color: #dde8d8; user-select: none;
    }
    .agent-ctx-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .agent-ctx-title {
      font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
      color: #9ad66a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 155px;
    }
    .agent-ctx-close { background: none; border: none; color: #4a6a4a; cursor: pointer; font-size: 14px; padding: 0; line-height: 1; }
    .agent-ctx-close:hover { color: #dde8d8; }
    .agent-ctx-label { display: block; font-size: 9px; font-weight: 700; color: #5a8060; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px; }
    .agent-ctx-input {
      width: 100%; background: #162014; border: 1px solid #2a3e28; border-radius: 5px;
      color: #dde8d8; font-family: Nunito, system-ui, sans-serif; font-size: 12px;
      padding: 5px 8px; box-sizing: border-box; margin-bottom: 12px; outline: none;
    }
    .agent-ctx-input:focus { border-color: #4a7a48; }
    .agent-ctx-palette { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .agent-ctx-swatch {
      width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,0.55); transition: transform 0.1s, border-color 0.1s;
    }
    .agent-ctx-swatch:hover { transform: scale(1.18); }
    .agent-ctx-swatch.on { border-color: #fff; transform: scale(1.1); }
    .agent-ctx-btns { display: flex; gap: 6px; }
    .agent-ctx-btns button {
      flex: 1; padding: 6px 0; border-radius: 5px; border: none;
      font-family: Nunito, system-ui, sans-serif; font-size: 11px; font-weight: 700; cursor: pointer;
    }
    .agent-ctx-reset { background: #162014; color: #5a8060; border: 1px solid #2a3e28 !important; }
    .agent-ctx-reset:hover { color: #dde8d8; border-color: #3a5038 !important; }
    .agent-ctx-save { background: #d97757; color: #fff; }
    .agent-ctx-save:hover { background: #e88a64; }
  `;
  document.head.appendChild(ctxStyle);

  const ctxMenu = document.createElement("div");
  ctxMenu.className = "agent-ctx";
  ctxMenu.hidden = true;
  document.body.appendChild(ctxMenu);

  let ctxId = null, ctxPickedColor = null;

  function openCtx(a, mx, my) {
    ctxId = a.data.id;
    const c = customOf(ctxId);
    const defaultColor = (KINDS[a.data.agent_type] || {}).color || "#d97757";
    ctxPickedColor = c.color || null;

    ctxMenu.innerHTML = "";

    const head = document.createElement("div");
    head.className = "agent-ctx-head";
    const title = document.createElement("span");
    title.className = "agent-ctx-title";
    title.textContent = displayName(a.data);
    const closeBtn = document.createElement("button");
    closeBtn.className = "agent-ctx-close";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", closeCtx);
    head.append(title, closeBtn);
    ctxMenu.appendChild(head);

    const nlabel = document.createElement("span");
    nlabel.className = "agent-ctx-label";
    nlabel.textContent = "Nickname";
    const ninput = document.createElement("input");
    ninput.className = "agent-ctx-input";
    ninput.type = "text";
    ninput.placeholder = a.data.name;
    ninput.value = c.name || "";
    ninput.addEventListener("keydown", e => { if (e.key === "Enter") saveBtn.click(); });
    ctxMenu.append(nlabel, ninput);

    const clabel = document.createElement("span");
    clabel.className = "agent-ctx-label";
    clabel.textContent = "Color";
    const palette = document.createElement("div");
    palette.className = "agent-ctx-palette";
    for (const col of PALETTE) {
      const sw = document.createElement("div");
      sw.className = "agent-ctx-swatch" + (col === (ctxPickedColor || defaultColor) ? " on" : "");
      sw.style.background = col;
      sw.addEventListener("click", () => {
        ctxPickedColor = col;
        palette.querySelectorAll(".agent-ctx-swatch").forEach(s => s.classList.remove("on"));
        sw.classList.add("on");
      });
      palette.appendChild(sw);
    }
    ctxMenu.append(clabel, palette);

    const btns = document.createElement("div");
    btns.className = "agent-ctx-btns";
    const resetBtn = document.createElement("button");
    resetBtn.className = "agent-ctx-reset";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => { clearCustom(ctxId); closeCtx(); renderPanel(); });
    const saveBtn = document.createElement("button");
    saveBtn.className = "agent-ctx-save";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => {
      const name = ninput.value.trim() || undefined;
      const color = ctxPickedColor && ctxPickedColor !== defaultColor ? ctxPickedColor : undefined;
      const patch = {};
      if (name) patch.name = name;
      if (color) patch.color = color;
      if (Object.keys(patch).length) setCustom(ctxId, patch);
      else clearCustom(ctxId);
      closeCtx();
      renderPanel();
    });
    btns.append(resetBtn, saveBtn);
    ctxMenu.appendChild(btns);

    const vw = window.innerWidth, vh = window.innerHeight;
    ctxMenu.style.left = Math.min(mx + 4, vw - 212) + "px";
    ctxMenu.style.top = Math.min(my, vh - 256) + "px";
    ctxMenu.hidden = false;
    ninput.focus();
  }

  function closeCtx() { ctxMenu.hidden = true; ctxId = null; }

  canvas.addEventListener("contextmenu", e => {
    e.preventDefault();
    const a = agentAt(e.clientX, e.clientY);
    if (a) openCtx(a, e.clientX, e.clientY);
    else closeCtx();
  });
  document.addEventListener("mousedown", e => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) closeCtx(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !ctxMenu.hidden) closeCtx(); });

  // ------------------------------------------------------------ side panel

  const $ = id => document.getElementById(id);
  const fmt = n => (n || 0).toLocaleString();
  const totalTokens = t => (t.input || 0) + (t.output || 0) + (t.cache_read || 0) + (t.cache_write || 0);
  const STATUS_LABEL = { working: "WORKING", needs_you: "NEEDS YOU", stuck: "MAY BE STUCK", idle: "DONE", sleeping: "ASLEEP", gone: "LEFT" };

  // Where clicking an agent takes you, in words.
  function openLabel(d) {
    const o = d.open || {};
    if (o.app) return `Open in ${o.app}`;
    if (o.url) return "Open its page";
    return null;
  }

  async function jumpTo(d) {
    const label = openLabel(d);
    if (!label) return;
    if (demo) {
      $("ticker").textContent = `In your own jungle, this would bring ${d.name}'s ${d.open.app || "page"} to the front.`;
      return;
    }
    try {
      const r = await fetch("api/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id }),
      });
      const body = await r.json();
      $("ticker").textContent = r.ok ? `Opened ${body.opened} for ${d.name}.` : `Could not jump to ${d.name}: ${body.error}`;
    } catch {
      $("ticker").textContent = "Could not reach the jungle server.";
    }
  }

  async function closeSession(d) {
    if (demo) {
      $("ticker").textContent = `In your own jungle, this would close ${d.name}'s terminal session.`;
      return;
    }
    try {
      const r = await fetch("api/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id }),
      });
      const body = await r.json();
      $("ticker").textContent = r.ok ? `Closed ${body.closed} for ${d.name}.` : `Could not close ${d.name}: ${body.error}`;
      if (r.ok) select(null);
    } catch {
      $("ticker").textContent = "Could not reach the jungle server.";
    }
  }
  const money = v => (v >= 100 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`);

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
  $("a-open").addEventListener("click", () => {
    const a = selectedId && agents.get(selectedId);
    if (a) jumpTo(a.data);
  });
  $("a-close").addEventListener("click", () => {
    const a = selectedId && agents.get(selectedId);
    if (a) closeSession(a.data);
  });
  $("a-copy").addEventListener("click", async () => {
    const btn = $("a-copy");
    const text = $("a-answer").textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
      btn.classList.add("copied");
    } catch {
      btn.textContent = "Failed";
    }
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
  });

  function renderRoster() {
    const list = [...agents.values()].filter(a => a.data.status !== "sleeping");
    const layerFilter = VIEWS[currentView].layer;
    const visible = layerFilter ? list.filter(a => layerOf(a.data) === layerFilter) : list;
    $("roster-empty").hidden = visible.length > 0;
    const ul = $("roster");
    ul.innerHTML = "";
    for (const layer of LAYER_ORDER) {
      if (layerFilter && layer !== layerFilter) continue;
      const members = visible.filter(a => layerOf(a.data) === layer).sort((p, q) => p.data.started - q.data.started);
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
        who.textContent = displayName(a.data);
        const what = document.createElement("span");
        what.className = "what";
        const stuckFor = a.data.status === "stuck"
          ? ` (${ago(Date.now() / 1000 - a.data.last_seen)})` : "";
        what.textContent = `${STATUS_LABEL[a.data.status] || a.data.status}${stuckFor} · ${placeName(a.data)}`;
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
    $("a-name").textContent = displayName(d);
    const badge = $("a-status");
    badge.textContent = STATUS_LABEL[d.status] || d.status;
    badge.className = `badge ${d.status}`;
    const jump = $("a-open");
    const label = openLabel(d);
    jump.hidden = !label;
    if (label) jump.textContent = `${label} \u2197`;
    const closeBtn = $("a-close");
    closeBtn.hidden = !((d.status === "idle" || d.status === "sleeping") && d.open && d.open.app);
    $("a-answer-box").hidden = !d.answer;
    $("a-answer").textContent = d.answer || "";
    $("a-prompt").textContent = d.last_prompt || (d.prompts ? "(not captured)" : "-");
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
    $("t-cost").textContent = d.cost_known === false && !d.cost_usd ? "unknown" : money(d.cost_usd || 0) + (d.cost_known === false ? "+" : "");

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
    if (VIEWS[currentView].nest) renderSpawnPanel();

    const live = [...agents.values()].filter(x => x.data.status !== "gone");
    const stuck = live.filter(x => x.data.status === "needs_you" || x.data.status === "stuck").length;
    health = live.length ? 1 - stuck / live.length : 1;
    $("hud-agents").textContent = `${live.length} agent${live.length === 1 ? "" : "s"}`;
    $("hud-tokens").textContent = `${fmt(live.reduce((s, x) => s + totalTokens(x.data.tokens), 0))} tokens`;
    $("hud-cost").textContent = `${money(live.reduce((s, x) => s + (x.data.cost_usd || 0), 0))} spent`;
    $("hud-health").textContent = `tree ${health > 0.75 ? "thriving" : health > 0.4 ? "thirsty" : "wilting"}`;
  }

  function tick(a) {
    const d = a.data;
    const lastItem = (d.recent || [])[d.recent.length - 1];
    if (lastItem) $("ticker").textContent = `${displayName(d)} (${placeName(d)}): ${lastItem.text}`;
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
    $("hud-history").href = "history.html?demo";
    window.WebgentzDemo.start(receive);
  } else {
    const source = new EventSource("stream");
    source.onmessage = e => receive(JSON.parse(e.data));
    source.onerror = () => { $("ticker").textContent = "Lost contact with the jungle server. Is server.py running?"; };
  }

  // Every second: send quiet agents to sleep, flag quiet workers, and keep "active for" ticking.
  setInterval(() => {
    let changed = false;
    for (const a of agents.values()) {
      const d = a.data;
      const quiet = Date.now() / 1000 - d.last_seen;
      if (d.status === "idle" && quiet > 600) {
        a.data = { ...d, status: "sleeping", location: "houses", activity: "asleep" };
        if (selectedId === d.id) selectedId = null;
        changed = true;
      } else if (d.status === "working" && quiet > 300) {
        a.data = { ...d, status: "stuck", activity: "quiet for a while, may be stuck" };
        changed = true;
      }
    }
    if (changed) retarget();
    renderPanel();
  }, 1000);

  // ------------------------------------------------------------ view tabs

  function renderSpawnPanel() {
    const sleeping = [...agents.values()].filter(a => a.data.status === "sleeping");
    const list = $("sleeping-list");
    list.innerHTML = "";
    if (!sleeping.length) {
      list.innerHTML = '<p class="empty">No sleeping agents. Agents fall asleep after 10 minutes of idling.</p>';
    } else {
      for (const a of sleeping) {
        const d = a.data;
        const kind = kindOf(d);
        const card = document.createElement("div");
        card.className = "sleep-card";
        card.innerHTML = `
          <span class="sleep-dot" style="background:${kind.color}"></span>
          <div class="sleep-info">
            <strong>${displayName(d)}</strong>
            <span>${d.cwd || d.project || "unknown project"}</span>
          </div>
          <button class="wake-btn" data-id="${d.id}">WAKE</button>
        `;
        card.querySelector(".wake-btn").addEventListener("click", () => spawnSession(d.cwd || ""));
        list.appendChild(card);
      }
    }
  }

  async function spawnSession(cwd) {
    if (demo) {
      $("spawn-msg").textContent = "In your own jungle, this would launch a new Claude Code session.";
      $("spawn-msg").style.color = "";
      return;
    }
    try {
      const r = await fetch("api/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const body = await r.json();
      $("spawn-msg").textContent = r.ok ? `Spawning in ${body.cwd || cwd}…` : `Could not spawn: ${body.error}`;
      $("spawn-msg").style.color = r.ok ? "#2a7a4a" : "#c03030";
    } catch {
      $("spawn-msg").textContent = "Could not reach the jungle server.";
      $("spawn-msg").style.color = "#c03030";
    }
  }

  $("spawn-go").addEventListener("click", () => spawnSession($("spawn-cwd").value.trim()));
  $("spawn-cwd").addEventListener("keydown", e => { if (e.key === "Enter") spawnSession($("spawn-cwd").value.trim()); });

  function setView(name) {
    currentView = name;
    const isNest = !!VIEWS[name].nest;
    $("world-wrap").hidden = isNest;
    $("spawn-panel").hidden = !isNest;
    for (const btn of document.querySelectorAll(".vtab")) {
      btn.classList.toggle("active", btn.dataset.view === name);
    }
    if (isNest) renderSpawnPanel();
    renderPanel();
  }

  for (const btn of document.querySelectorAll(".vtab")) {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  }

  // Text widths depend on the font, so draw once it has loaded.
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(frame));
})();
