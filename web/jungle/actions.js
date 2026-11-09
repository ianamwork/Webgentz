// What the buttons do. The HTML from render.js calls these through inline
// onclick="..." attributes, so the bottom of this file puts them on window.
import { LAYER_LABEL } from './constants.js';
import { el } from './format.js';
import { S, closeHudPopups, upsert } from './state.js';
import { agentAction, postApproval, postNote, postOpen } from './api.js';
import { render, renderAgentSheet, renderBank, renderLayerLabels, renderSettingsPop, renderTheme } from './render.js';
import { syncAgents, world } from './engine.js';
import { setShown } from './motion.js';

export function openAgentApp(id) {
  postOpen(id);
}

export function dismissAgent(id) {
  agentAction('/api/dismiss', id).then(function(result) { if (result) closeSheet(); });
}

export function closeAgentTerminal(id) {
  if (!window.confirm('Close this agent’s terminal session?')) return;
  agentAction('/api/close', id).then(function(result) { if (result) closeSheet(); });
}

export function jumpTo(id) {
  S.selectedId = id;
  syncAgents();
  render();
}

export function selectAgent(id) {
  S.selectedId = id;
  render();
}

export function resolveAgent(id, ok) {
  postApproval(id, ok);
  const a = S.agents.get(id);
  if (a) {
    upsert(Object.assign({}, a, { status: ok ? 'working' : 'idle' }));
    syncAgents();
    render();
  }
}

export function postBoardNote(event) {
  event.preventDefault();
  const input = el('quest-note-input');
  const text = (input && input.value || '').trim();
  if (!text) return;
  S.boardError = '';
  postNote(text).then(function(data){
    if (data.note && !S.boardNotes.some(function(n){ return n.received === data.note.received && n.text === data.note.text; })) S.boardNotes.push(data.note);
    const draft = el('quest-note-input');
    if (draft) draft.value = '';
    render();
  }).catch(function(){ S.boardError = 'Could not post to the board. Check that Webgentz is connected and try again.'; render(); });
}

export function closeSheet() { S.selectedId = null; S.customPanel = null; render(); }

export function toggleCustomPanel(id) { S.customPanel = S.customPanel === id ? null : id; renderAgentSheet(); }

export function openLedger()  { closeHudPopups(); S.ledgerOpen = true; render(); }

export function closeLedger() { S.ledgerOpen = false; render(); }

export function setLedgerTab(t){ S.ledgerTab = t; render(); }

export function setChannel(id) { S.ledgerChannel = id; render(); }

export function openQuests()  { closeHudPopups(); S.questsOpen = true; S.bankOpen = false; setShown(el('modal-back'), true); render(); }

export function openBank()    { closeHudPopups(); S.settingsOpen = false; S.bankOpen = true; S.questsOpen = false; setShown(el('modal-back'), true); render(); }

export function closeModals() { S.questsOpen = false; S.bankOpen = false; setShown(el('modal-back'), false); render(); }

export function toggleSettings(){
  S.settingsOpen = !S.settingsOpen;
  renderSettingsPop();
}

export function startRenameLayer(layer) {
  S.renamingLayer = layer;
  renderLayerLabels();
}

export function cancelRenameLayer() {
  S.renamingLayer = null;
  renderLayerLabels();
}

export function saveLayerName(layer, value) {
  // Escape (or a re-render) may blur the box after the rename was cancelled.
  if (S.renamingLayer !== layer) return;
  S.renamingLayer = null;
  const name = (value || '').trim();
  if (name && name !== LAYER_LABEL[layer]) {
    S.layerNames[layer] = name;
  } else {
    delete S.layerNames[layer];
  }
  localStorage.setItem('webgentz.layerNames', JSON.stringify(S.layerNames));
  requestAnimationFrame(render);
}

export function setTimeOfDay(night) { S.auto = false; if (world) world.setHour(night ? 22 : 12); }

export function setDarkOverride(dark) { S.darkOverride = dark; renderSettingsPop(); renderTheme(); }

export function toggleSect(k) { S.sectOpen[k] = !S.sectOpen[k]; renderAgentSheet(); }

export function setMeasure(m) { S.measure = m; renderBank(); }

export function customizeAgent(id, color) {
  if (color) {
    S.customs[id] = Object.assign({}, S.customs[id] || {}, { color });
  } else {
    if (S.customs[id]) delete S.customs[id].color;
    if (S.customs[id] && !Object.keys(S.customs[id]).length) delete S.customs[id];
  }
  try { localStorage.setItem('wg-customs', JSON.stringify(S.customs)); } catch(e) {}
  syncAgents();
  renderAgentSheet();
}

// ===== Inline handlers ====================================================
// render.js builds HTML that calls these from onclick="..." attributes, which
// only see globals, so this module puts them on window itself.
Object.assign(window, {
  cancelRenameLayer, closeAgentTerminal, closeLedger, closeModals, closeSheet,
  customizeAgent, dismissAgent, jumpTo, openAgentApp, openBank, openLedger,
  openQuests, postBoardNote, resolveAgent, saveLayerName, selectAgent,
  setChannel, setDarkOverride, setLedgerTab, setMeasure, setTimeOfDay,
  startRenameLayer, toggleCustomPanel, toggleSect, toggleSettings,
});
