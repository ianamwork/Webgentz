// The UI's single state object, and merging agent updates into it.

export const S = {
  agents: new Map(),
  messages: [],
  selectedId: null,
  layerNames: JSON.parse(localStorage.getItem('webgentz.layerNames') || 'null') || {},
  renamingLayer: null,
  hover: null,
  hoverPos: null,
  bankHover: false,
  boardHover: false,
  ledgerOpen: false,
  ledgerTab: 'chat',
  ledgerChannel: null,
  seenT: 0,
  questsOpen: false,
  boardNotes: [],
  boardError: '',
  bankOpen: false,
  settingsOpen: true,
  hour: 12,
  dark: 0,
  auto: true,
  darkOverride: null,
  animating: false,
  measure: 'cost',
  bankHistory: [],
  sectOpen: {},
  customs: {},
  customPanel: null,
};

export function upsert(a) {
  const existing = S.agents.get(a.id) || {};
  const merged = Object.assign({}, existing, a);
  S.agents.set(a.id, merged);
  const recent = a.recent || [];
  for (const r of recent) {
    const t = r.time || r.t || 0;
    if (!S.messages.find(function(m){ return m.agent_id === a.id && (m.time || m.t) === t; })) {
      S.messages.push({ agent_id: a.id, agent_name: a.name, time: t, text: r.text || '', kind: r.kind || '' });
    }
  }
  S.messages.sort(function(a,b){ return (a.time||a.t||0) - (b.time||b.t||0); });
  if (S.messages.length > 1000) S.messages = S.messages.slice(-500);
}

export function closeHudPopups() { S.ledgerOpen = false; }
