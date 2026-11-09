// The bridge to JungleEngine (web/jungle-engine.js): mounting it, feeding it
// agents, fitting the canvas to the window, the canvas cursor, and the
// real-time clock.
import { autoHour, clock, el } from './format.js';
import { S, closeHudPopups } from './state.js';
import { activeAgents, toEngineAgent } from './agents.js';
import { postOpen } from './api.js';
import { setShown } from './motion.js';
import { renderAgentSheet, renderBank, renderBankTip, renderBoardTip, renderHoverCard, renderQuestLog, renderSettingsPop, renderTheme } from './render.js';

export let world = null;

// setAgents triggers scenery recompute; only push every 2s to stop season flashing
export let syncTimeout = 0, syncPending = false, syncLast = 0;

export function syncAgents() {
  if (!world) return;
  const now = Date.now();
  if (now - syncLast > 2000) {
    syncLast = now;
    world.setAgents(activeAgents().map(toEngineAgent));
    return;
  }
  if (!syncPending) {
    syncPending = true;
    syncTimeout = setTimeout(function() {
      syncPending = false;
      syncLast = Date.now();
      if (world) world.setAgents(activeAgents().map(toEngineAgent));
    }, 2000 - (now - syncLast));
  }
}

export function mountEngine() {
  const canvas = document.getElementById('world');
  if (!canvas || !window.JungleEngine) return;
  if (world) { world.destroy(); world = null; }
  world = JungleEngine.mount(canvas, {
    hour: S.auto ? autoHour() : S.hour,
    selectedId: function() { return S.selectedId; },
    onHover: function(agent, pos, place) {
      S.hover = agent;
      // The engine gives positions inside the canvas; panels are placed in the stage.
      S.hoverPos = pos && { x: pos.x + canvas.offsetLeft, y: pos.y + canvas.offsetTop };
      S.bankHover = place === 'bank';
      S.boardHover = place === 'board';
      // Only update the lightweight floating elements, not the whole page
      renderHoverCard();
      renderBankTip();
      renderBoardTip();
    },
    onClick: function(agent) {
      if (agent) {
        S.selectedId = agent.id;
        S.hover = null;
        renderHoverCard();
        postOpen(agent.id);
      } else {
        S.selectedId = null;
      }
      renderAgentSheet();
    },
    onBank: function() {
      closeHudPopups();
      S.bankOpen = !S.bankOpen;
      S.questsOpen = false;
      setShown(el('modal-back'), S.bankOpen || S.questsOpen);
      renderQuestLog(); renderBank();
    },
    onBoard: function() {
      closeHudPopups();
      S.questsOpen = !S.questsOpen;
      S.bankOpen = false;
      setShown(el('modal-back'), S.bankOpen || S.questsOpen);
      renderQuestLog(); renderBank();
    },
    onHour: function(hour, dark, animating) {
      var prevDark = S.dark;
      S.hour = hour;
      S.dark = dark;
      S.animating = animating;
      // Update clock text in-place — don't rebuild the whole HUD on every frame
      var ct = document.getElementById('hud-clock');
      if (ct) ct.textContent = clock(hour);
      // Only flip theme when the day/night threshold actually crosses
      if ((dark > 0.5) !== (prevDark > 0.5)) renderTheme();
      renderSettingsPop();
    },
  });
  syncAgents();
  layoutWorld();
}

// ===== Fitting the world to the window ====================================
// The art is 576×432 (4:3). Scale it to fit the stage without distorting it,
// and when it is at least 2 device pixels per art pixel, round down to a
// whole number so every art pixel is the same size (crisp on retina too).
// The space left over shows #world-fill: a tiny, blurred copy of the scene.
// The stage gets --world-x/y/w/h so the layer labels can follow the art.
export function layoutWorld() {
  const canvas = el('world'), stage = el('stage');
  if (!canvas || !stage || !window.JungleEngine) return;
  const W = JungleEngine.W, H = JungleEngine.H;
  const dpr = window.devicePixelRatio || 1;
  const sw = stage.clientWidth, sh = stage.clientHeight;
  let s = Math.min(sw * dpr / W, sh * dpr / H);   // device pixels per art pixel
  if (s >= 2) s = Math.floor(s);
  const w = W * s / dpr, h = H * s / dpr;
  // Snap the offset to whole device pixels so the grid does not straddle them.
  const x = Math.round((sw - w) / 2 * dpr) / dpr, y = Math.round((sh - h) / 2 * dpr) / dpr;
  Object.assign(canvas.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  stage.style.setProperty('--world-x', x + 'px');
  stage.style.setProperty('--world-y', y + 'px');
  stage.style.setProperty('--world-w', w + 'px');
  stage.style.setProperty('--world-h', h + 'px');
  stage.classList.toggle('world-banded', w < sw - 1 || h < sh - 1);
}

(function watchSize() {
  const stage = el('stage');
  if (!stage) return;
  if (window.ResizeObserver) new ResizeObserver(layoutWorld).observe(stage);
  else window.addEventListener('resize', layoutWorld);
  // devicePixelRatio changes (browser zoom, moving to another screen) without
  // always resizing the stage, so listen for it too.
  (function watchDpr() {
    const mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    mq.addEventListener('change', function once() { mq.removeEventListener('change', once); layoutWorld(); watchDpr(); });
  })();
})();

// Refresh the soft fill four times a second from the real canvas. It is 48×36
// pixels, so this costs next to nothing; it stops while the tab is hidden.
(function fillLoop() {
  const fill = el('world-fill'), canvas = el('world');
  if (!fill || !canvas) return;
  fill.width = 48; fill.height = 36;
  const fctx = fill.getContext('2d');
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  setInterval(function() {
    if (document.hidden || !el('stage').classList.contains('world-banded')) return;
    fctx.drawImage(canvas, 0, 0, fill.width, fill.height);
  }, 250);
})();

export function applyRealTime(animate) {
  if (!world) return;
  if (animate) world.animateTo(autoHour(), 2);
  else world.setHour(autoHour());
}

// ===== Cursor tracking + hover stale check ================================
let _cx = -1, _cy = -1;
(function() {
  const canvas = document.getElementById('world');
  if (!canvas) return;
  function clearCanvasHover() {
    if (!S.hover && !S.bankHover && !S.boardHover) return;
    S.hover = null; S.hoverPos = null; S.bankHover = false; S.boardHover = false;
    renderHoverCard(); renderBankTip(); renderBoardTip();
  }
  canvas.addEventListener('mousemove', function(e) {
    const r = canvas.getBoundingClientRect();
    _cx = (e.clientX - r.left) / r.width;
    _cy = (e.clientY - r.top) / r.height;
  });
  canvas.addEventListener('mouseleave', function() { _cx = -1; _cy = -1; clearCanvasHover(); });
  canvas.addEventListener('pointerleave', clearCanvasHover);
  document.addEventListener('pointermove', function(e) {
    if (!canvas.contains(e.target)) clearCanvasHover();
  }, true);
})();
(function checkStaleHover() {
  if (S.hover && world && _cx >= 0) {
    const pos = world.positions()[S.hover.id];
    if (!pos) { S.hover = null; S.hoverPos = null; renderHoverCard(); }
    else {
      const dx = (pos.x - _cx) * JungleEngine.W;
      const dy = (pos.y - _cy) * JungleEngine.H;
      if (Math.hypot(dx, dy) > 22) { S.hover = null; S.hoverPos = null; renderHoverCard(); }
    }
  }
  requestAnimationFrame(checkStaleHover);
})();

// ===== Real-time clock ====================================================
// Advance time every minute when in auto mode
setInterval(function() { if (S.auto && world && !S.animating) world.animateTo(autoHour(), 2); }, 60000);
