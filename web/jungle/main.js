// Entry point for the jungle page (web/index.html loads this as a module).
// Receives agent updates, loads history and notes, wires up document-level
// listeners and timers, and starts everything.
import { el } from './format.js';
import { S, upsert } from './state.js';
import { fetchDaily, fetchNotes, openStream } from './api.js';
import { render, renderBank, renderLedger, renderQuestLog, renderSettingsPop, scheduleRender } from './render.js';
import { applyRealTime, mountEngine, syncAgents, world } from './engine.js';
import { closeLedger, closeModals, closeSheet } from './actions.js';

// ===== Data layer =========================================================

function receive(msg) {
  if (msg.type === 'state') {
    for (const a of (msg.agents || [])) upsert(a);
  } else if (msg.type === 'agent') {
    if (msg.agent) upsert(msg.agent);
  } else if (msg.type === 'note' && msg.note) {
    if (!S.boardNotes.some(function(n){ return n.received === msg.note.received && n.text === msg.note.text; })) S.boardNotes.push(msg.note);
  }
  syncAgents();
  scheduleRender();
}

function loadBoardNotes() {
  fetchNotes().then(function(data){
    if (!data || !Array.isArray(data.notes)) return;
    S.boardNotes = data.notes;
    if (S.questsOpen) renderQuestLog();
  }).catch(function(){});
}

function loadHistory() {
  fetchDaily(14)
    .then(function(data){
      if (!data || !data.rows) return;
      const byDay = {};
      for (const row of data.rows) {
        if (!byDay[row.day]) byDay[row.day] = { day: row.day, cost: 0, tokens: 0 };
        byDay[row.day].cost += row.cost_usd || 0;
        byDay[row.day].tokens += (row.input||0) + (row.output||0) + (row.cache_read||0) + (row.cache_write||0);
      }
      S.bankHistory = Object.values(byDay).sort(function(a,b){ return a.day < b.day ? -1 : 1; }).slice(-14);
      renderBank();
    })
    .catch(function(){});
}

function connect() {
  if (new URLSearchParams(location.search).has('demo') && typeof WebgentzDemo !== 'undefined') {
    WebgentzDemo.start(receive);
    return;
  }
  openStream(receive, connect);
}

// Used to pick day or night when auto time is off.
const mq = window.matchMedia('(prefers-color-scheme: dark)');

// ===== Sleeping watchdog ==================================================
// Only promote idle → sleeping (conservative; never override working/stuck)
setInterval(function() {
  let changed = false;
  const now = Date.now() / 1000;
  for (const [id, a] of S.agents) {
    if (a.status === 'idle' && a.since && (now - a.since) > 900) {
      S.agents.set(id, Object.assign({}, a, { status: 'sleeping' }));
      changed = true;
    }
  }
  if (changed) { syncAgents(); scheduleRender(); }
}, 30000);

// ===== Close modals on backdrop ==========================================
el('modal-back').addEventListener('click', closeModals);

// Dismiss transient HUD panels as soon as the pointer goes elsewhere. Use
// capture-phase pointerdown so frequent live updates cannot detach the target
// before its click event is delivered.
document.addEventListener('pointerdown', function(e) {
  const target = e.target;
  const ledger = el('ledger-wrap');
  const settingsPop = el('time-pop');
  const settingsBtn = el('btn-settings');

  if (S.settingsOpen && settingsPop && !settingsPop.contains(target) && settingsBtn && !settingsBtn.contains(target)) {
    S.settingsOpen = false;
    renderSettingsPop();
  }
  if (S.ledgerOpen && !ledger.contains(target)) {
    S.ledgerOpen = false;
    renderLedger();
  }
}, true);

// ===== Escape key ========================================================
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (S.selectedId) { closeSheet(); return; }
  if (S.questsOpen || S.bankOpen) { closeModals(); return; }
  if (S.ledgerOpen) closeLedger();
});

// ===== Click outside agent sheet =========================================
document.addEventListener('click', function(e) {
  if (!S.selectedId) return;
  const sheet = el('agent-sheet');
  if (!sheet || sheet.hidden) return;
  const canvas = document.getElementById('world');
  // Canvas clicks are handled by the engine (onClick(null) closes sheet)
  if (canvas && canvas.contains(e.target)) return;
  // Use composedPath so re-renders during the event don't orphan e.target
  const path = e.composedPath ? e.composedPath() : [];
  if (sheet.contains(e.target) || path.indexOf(sheet) !== -1) return;
  // Rows in the roster and bank open the sheet on this same click; don't undo that.
  if (path.some(function(n){ return n.hasAttribute && n.hasAttribute('data-opens-sheet'); })) return;
  closeSheet();
});

// ===== Init ===============================================================
function init() {
  try { S.customs = JSON.parse(localStorage.getItem('wg-customs') || '{}'); } catch(e) {}
  mountEngine();
  if (world) { if (S.auto) applyRealTime(false); else world.setHour(mq.matches ? 22 : 12); }
  connect();
  loadHistory();
  loadBoardNotes();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
