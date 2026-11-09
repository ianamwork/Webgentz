// The bridge to JungleEngine (web/jungle-engine.js): mounting it, feeding it
// agents, the canvas cursor, and the real-time clock.
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
      S.hoverPos = pos;
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
}

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
