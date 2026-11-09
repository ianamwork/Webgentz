// Read-only views of agents: lists, labels, avatars and the engine's shape.
import { LAYER_LABEL, PROVIDER_INFO, STATUS_ORDER, TOOL_MAP } from './constants.js';
import { esc } from './format.js';
import { S } from './state.js';

export function providerBadge(agent_type) {
  const info = PROVIDER_INFO[agent_type];
  if (!info) return '';
  return '<span class="provider-badge" style="background:' + info.color + '1a;color:' + info.color + ';border-color:' + info.color + '44">' + esc(info.label) + '</span>';
}

export function displayName(name) {
  const m = name && name.match(/^(.+)-([0-9a-f]{4,8})$/i);
  if (!m) return esc(name || '');
  return esc(m[1]) + '<span class="name-suffix">-' + esc(m[2]) + '</span>';
}

export function layerDisplayName(layer) {
  return S.layerNames[layer] || LAYER_LABEL[layer] || layer;
}

export function agentSummary(a) {
  const parts = [];
  if (a.activity) parts.push(a.activity);
  if (a.location) parts.push('at ' + a.location);
  return parts.join(' ') || '';
}

export function av(a, size) {
  size = size || 28;
  if (!window.JungleEngine) return '<div style="width:' + size + 'px;height:' + size + 'px;background:var(--p-soft)"></div>';
  const custom = a && a.id && S.customs[a.id];
  const url = JungleEngine.avatar(a.agent_type || 'backend', custom && custom.color);
  return '<img src="' + url + '" width="' + size + '" height="' + size + '" style="image-rendering:pixelated">';
}

export function openLabel(a) {
  if (a.status === 'needs_you') return a.detail || 'Needs your approval';
  return '';
}

export function activeAgents() {
  return [...S.agents.values()].filter(a => a.status !== 'gone' && a.status !== 'sleeping');
}

export function sortedAgents() {
  return activeAgents().sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  );
}

export function toEngineAgent(a) {
  const tools = a.tool_counts || {};
  let loc = 'square', act = 'idle';
  const toolKeys = Object.keys(tools).filter(k => tools[k] > 0);
  if (toolKeys.length) {
    const entry = TOOL_MAP[toolKeys[toolKeys.length - 1]] || ['square', 'idle'];
    loc = entry[0]; act = entry[1];
  }
  if (a.status === 'done') { loc = 'townhall'; act = 'checking off'; }
  const recent = (a.recent || []).map(r => ({ t: r.time || r.t || 0, text: r.text || '' }));
  const custom = S.customs[a.id];
  return {
    id: a.id, name: a.name, agent_type: a.agent_type,
    layer: a.layer || 'understory',
    status: a.status || 'idle',
    location: a.location || loc,
    activity: a.activity || act,
    detail: a.detail, started: a.started, since: a.since,
    done: a.done, answer: a.answer,
    tokens: a.tokens || {}, cost_usd: a.cost_usd, tool_counts: tools, recent,
    color: custom && custom.color || null,
  };
}
