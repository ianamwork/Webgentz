/* world.js — Webgentz Jungle World UI */
/* eslint-disable no-use-before-define */

// ===== Constants ==========================================================
const BP = '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>';

const SVG = {
  clock:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  coin:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="10" x2="16" y2="10"/></svg>',
  scroll:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  chevup:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>',
  chevdn:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
  x:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  find:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  palette: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/><circle cx="8" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="9" r="1" fill="currentColor" stroke="none"/></svg>',
};

const KIND_LABEL = {
  'claude-code': 'Claude Code', 'claude-api': 'Claude API', 'claude-web': 'Claude.ai',
  'codex': 'Codex', 'openai': 'OpenAI', 'gtm': 'GTM', 'research': 'Research',
  'python': 'Python', 'infra': 'Infra', 'backend': 'Backend', 'frontend': 'Frontend',
  'ux': 'UX', 'pm': 'PM', 'marketing': 'Marketing', 'sales': 'Sales',
};

const LAYER_LABEL = { canopy: 'Canopy', understory: 'Understory', roots: 'Roots' };

const STATUS_ORDER = { needs_you: 0, stuck: 1, working: 2, idle: 3, sleeping: 4, done: 5 };

const STATUS_LABEL = { working: 'Working', needs_you: 'Needs you', stuck: 'Stuck', idle: 'Idle', sleeping: 'Sleeping', done: 'Done' };

const TOOL_MAP = {
  Read: ['library', 'researching'], Grep: ['library', 'researching'],
  Edit: ['workshop', 'building'], Write: ['workshop', 'building'], MultiEdit: ['workshop', 'building'],
  Bash: ['forge', 'running commands'], Task: ['barracks', 'taking orders'],
  MCP: ['market', 'trading'], TodoWrite: ['townhall', 'checking off'], TodoRead: ['townhall', 'checking off'],
  WebSearch: ['library', 'researching'], WebFetch: ['library', 'researching'],
};

// ===== State ==============================================================
const PALETTE = ['#a855f7','#d97757','#3b82f6','#22c55e','#ec4899','#ef4444','#14b8a6','#f59e0b','#84cc16','#64748b'];

const S = {
  agents: new Map(),
  messages: [],
  selectedId: null,
  hover: null,
  hoverPos: null,
  bankHover: false,
  boardHover: false,
  ledgerOpen: false,
  ledgerTab: 'chat',
  ledgerChannel: null,
  seenT: 0,
  questsOpen: false,
  bankOpen: false,
  timeOpen: false,
  hour: 12,
  dark: 0,
  auto: true,
  animating: false,
  measure: 'cost',
  bankHistory: [],
  sectOpen: {},
  customs: {},
  customPanel: null,
};

let world = null;

// ===== Render throttling ==================================================
let rafId = 0;
function scheduleRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(function() { rafId = 0; render(); });
}

// ===== Agent sync throttle ================================================
// setAgents triggers scenery recompute; only push every 2s to stop season flashing
let syncTimeout = 0, syncPending = false, syncLast = 0;
function syncAgents() {
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

// ===== Helpers ============================================================
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function fmtTok(n) {
  if (!n) return '0';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'k';
  return String(n);
}

function fmtUsd(v, decimals) {
  if (v == null) return '$0.00';
  return '$' + Number(v).toFixed(decimals != null ? decimals : 2);
}

function ago(ts) {
  if (!ts) return '';
  const d = Math.floor((Date.now()/1000) - ts);
  if (d < 60) return d + 's ago';
  if (d < 3600) return Math.floor(d/60) + 'm ago';
  if (d < 86400) return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}

function dur(start) {
  if (!start) return '';
  const s = Math.floor((Date.now()/1000) - start);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h) return h + 'h ' + m + 'm';
  if (m) return m + 'm ' + sec + 's';
  return sec + 's';
}

function clock(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  const ap = hh >= 12 ? 'PM' : 'AM';
  const d = hh % 12 || 12;
  return d + ':' + String(mm).padStart(2,'0') + ' ' + ap;
}

function tokTotal(a) {
  const t = a.tokens || {};
  return (t.input||0) + (t.output||0) + (t.cache_read||0) + (t.cache_write||0);
}

function statusStyle(status) {
  const map = { working:'st-working', needs_you:'st-needs_you', stuck:'st-stuck', idle:'st-idle', sleeping:'st-sleeping', done:'st-done' };
  return map[status] || 'st-idle';
}

function agentSummary(a) {
  const parts = [];
  if (a.activity) parts.push(a.activity);
  if (a.location) parts.push('at ' + a.location);
  return parts.join(' ') || '';
}

function av(a, size) {
  size = size || 28;
  if (!window.JungleEngine) return '<div style="width:' + size + 'px;height:' + size + 'px;background:var(--p-soft)"></div>';
  const custom = a && a.id && S.customs[a.id];
  const url = JungleEngine.avatar(a.agent_type || 'backend', custom && custom.color);
  return '<img src="' + url + '" width="' + size + '" height="' + size + '" style="image-rendering:pixelated">';
}

function openLabel(a) {
  if (a.status === 'needs_you') return a.detail || 'Needs your approval';
  return '';
}

function activeAgents() {
  return [...S.agents.values()].filter(a => a.status !== 'gone' && a.status !== 'sleeping');
}

function sortedAgents() {
  return activeAgents().sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  );
}

function toEngineAgent(a) {
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

// ===== Engine =============================================================
function mountEngine() {
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
        fetch('/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: agent.id }) }).catch(function(){});
      } else {
        S.selectedId = null;
      }
      renderAgentSheet();
    },
    onBank: function() {
      closeHudPopups();
      S.bankOpen = !S.bankOpen;
      S.questsOpen = false;
      el('modal-back').hidden = !(S.bankOpen || S.questsOpen);
      renderQuestLog(); renderBank();
    },
    onBoard: function() {
      closeHudPopups();
      S.questsOpen = !S.questsOpen;
      S.bankOpen = false;
      el('modal-back').hidden = !(S.bankOpen || S.questsOpen);
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
      if (S.timeOpen) renderTimePop();
    },
  });
  syncAgents();
}

// ===== Render helpers =====================================================
function el(id) { return document.getElementById(id); }

function renderLayerLabels() {
  const counts = { canopy: 0, roots: 0 };
  for (const a of activeAgents()) {
    const l = a.layer || 'understory';
    if (l in counts) counts[l]++;
  }
  const items = [
    ['ll-canopy',     'Canopy',     counts.canopy],
    ['ll-roots',      'Roots',      counts.roots],
  ];
  for (const [id, label, n] of items) {
    const div = el(id);
    if (!div) continue;
    div.innerHTML = n > 0
      ? '<span class="ll-head">' + esc(label) + '</span><span class="ll-sub">' + n + ' agent' + (n===1?'':'s') + '</span>'
      : '';
  }
}

function renderHUD() {
  const hud = el('hud');
  if (!hud) return;
  const all = activeAgents();
  const total = all.length;
  const working = all.filter(a => a.status === 'working' || a.status === 'needs_you' || a.status === 'stuck').length;
  const needsYou = all.filter(a => a.status === 'needs_you').length;
  const todayCost = all.reduce((s, a) => s + (a.cost_usd || 0), 0);
  const hudStyle = 'color:#fff;background:transparent;border-color:rgba(255,255,255,0.3)';

  hud.innerHTML =
    '<div class="hud-logo">WEBGENTZ</div>' +
    '<div class="hud-right">' +
      '<div class="hud-counts bp" style="pointer-events:none">' + BP +
        '<span class="hud-n">' + total + '</span>' +
        '<span>agents</span>' +
        '<div class="hud-sep"></div>' +
        '<span class="hud-n">' + working + '</span>' +
        '<span>working</span>' +
      '</div>' +
      '<button class="btn-bp" id="btn-clock" aria-expanded="' + S.timeOpen + '" style="' + hudStyle + ';gap:6px;padding:0 12px">' +
        SVG.clock +
        '<span id="hud-clock" style="font:600 13px/1 var(--font-heading);letter-spacing:0.04em">' + clock(S.hour) + '</span>' +
      '</button>' +
      '<button class="btn-bp" id="btn-bank" style="' + hudStyle + ';gap:6px;padding:0 12px" onclick="openBank()">' +
        SVG.coin +
        '<span style="font:600 14px/1 var(--font-heading)">' + fmtUsd(todayCost) + '</span>' +
      '</button>' +
      '<button class="btn-quest btn-bp" id="btn-quest" style="' + hudStyle + '" onclick="openQuests()">' +
        SVG.scroll +
        '<span>Quest Log</span>' +
        (needsYou > 0 ? '<span class="need-badge">' + needsYou + ' need you</span>' : '') +
      '</button>' +
    '</div>';
}

function renderTimePop() {
  const pop = el('time-pop');
  if (!pop) return;
  if (!S.timeOpen) { pop.hidden = true; return; }
  pop.hidden = false;
  pop.className = 'bp';
  pop.style.cssText = 'top:68px;right:16px;width:320px;padding:16px;display:flex;flex-direction:column;gap:14px;z-index:20;';
  pop.innerHTML =
    BP +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font:600 13px/1 var(--font-heading);letter-spacing:0.1em;text-transform:uppercase;color:var(--p-mute)">TIME OF DAY</span>' +
      '<span style="font:600 22px/1 var(--font-heading)">' + clock(S.hour) + '</span>' +
      '<button class="time-close" aria-label="Close time controls" onpointerdown="closeTimePop();event.preventDefault()">' + SVG.x + '</button>' +
    '</div>' +
    '<input type="range" min="0" max="24" step="0.1" value="' + S.hour + '" oninput="onHourSlide(this.value)">' +
    '<div class="preset-grid">' +
      '<button onclick="setPreset(6)"  style="background:#f9a825;color:#1d1f20">Dawn</button>' +
      '<button onclick="setPreset(12)" style="background:#fff9c4;color:#1d1f20">Noon</button>' +
      '<button onclick="setPreset(18)" style="background:#ff7043;color:#fff">Dusk</button>' +
      '<button onclick="setPreset(22)" style="background:#1a237e;color:#fff">Night</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px">' +
      '<button class="btn-secondary" style="flex:1;font:600 13px/1 var(--font-heading);padding:8px" onclick="animatePreset(17,21)">Watch sunset</button>' +
      '<button class="btn-secondary" style="flex:1;font:600 13px/1 var(--font-heading);padding:8px" onclick="animatePreset(5,8)">Watch sunrise</button>' +
    '</div>' +
    '<button class="auto-row" onclick="toggleAuto()">' +
      '<span class="auto-check ' + (S.auto ? 'on' : '') + '">' + (S.auto ? '✓' : '') + '</span>' +
      '<div>' +
        '<div style="font:600 14px/1.2 var(--font-body)">Follow real clock</div>' +
        '<div style="font-size:12px;color:var(--p-mute);margin-top:3px">Keeps the jungle in sync with your local time</div>' +
      '</div>' +
    '</button>';
}

function renderHoverCard() {
  const card = el('hover-card');
  if (!card) return;
  if (!S.hover || !S.hoverPos) { card.hidden = true; return; }
  const a = S.hover;
  const pos = S.hoverPos;
  card.hidden = false;
  card.className = 'bp';
  card.style.cssText = 'left:' + pos.x + 'px;top:' + pos.y + 'px;width:260px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;pointer-events:none;z-index:30;transform:translateY(-100%) translateX(-50%);';
  const toks = tokTotal(a);
  card.innerHTML =
    BP +
    '<div class="hc-header">' +
      av(a, 36) +
      '<div style="min-width:0;flex:1">' +
        '<div class="hc-name">' + esc(a.name) + '</div>' +
        '<div class="hc-sub">' + esc(KIND_LABEL[a.agent_type] || a.agent_type || '') + ' · ' + esc(LAYER_LABEL[a.layer] || '') + '</div>' +
      '</div>' +
      '<span class="status-tag ' + statusStyle(a.status) + '">' + esc(STATUS_LABEL[a.status] || a.status) + '</span>' +
    '</div>' +
    (a.detail ? '<div style="font-size:13px">' + esc(a.detail) + '</div>' : '') +
    '<div style="display:flex;gap:16px;font-size:12px;color:var(--p-mute)">' +
      (toks ? '<span>' + fmtTok(toks) + ' tok</span>' : '') +
      (a.cost_usd ? '<span>' + fmtUsd(a.cost_usd) + '</span>' : '') +
      (a.started ? '<span>' + dur(a.started) + ' active</span>' : '') +
    '</div>';
}

function renderBankTip() {
  const tip = el('bank-tip');
  if (!tip) return;
  if (!S.bankHover) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.className = 'bp';
  const cost = [...S.agents.values()].reduce((s, a) => s + (a.cost_usd || 0), 0);
  tip.style.cssText = 'bottom:64px;left:50%;transform:translateX(-50%);padding:8px 12px;z-index:30;white-space:nowrap;pointer-events:none;';
  tip.innerHTML = BP + '<span>Bank · today ' + fmtUsd(cost) + '</span>';
}

function renderBoardTip() {
  const tip = el('board-tip');
  if (!tip) return;
  if (!S.boardHover) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.className = 'bp';
  const n = [...S.agents.values()].filter(a => a.status === 'needs_you').length;
  tip.style.cssText = 'bottom:64px;left:50%;transform:translateX(-50%);padding:8px 12px;z-index:30;white-space:nowrap;pointer-events:none;';
  tip.innerHTML = BP + '<span>Quest board' + (n > 0 ? ' · ' + n + ' need you' : '') + '</span>';
}

function renderAgentSheet() {
  const sheet = el('agent-sheet');
  if (!sheet) return;
  if (!S.selectedId) { sheet.hidden = true; return; }
  const a = S.agents.get(S.selectedId);
  if (!a) { sheet.hidden = true; return; }
  sheet.hidden = false;
  sheet.className = 'bp';
  sheet.style.cssText = 'right:16px;top:72px;bottom:72px;width:360px;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);z-index:10;overflow:hidden;';

  const toks = tokTotal(a);
  const recent = (a.recent || []).slice(-8).reverse();
  const tools = a.tool_counts || {};
  const toolEntries = Object.entries(tools).filter(function(e){ return e[1] > 0; }).sort(function(a,b){ return b[1]-a[1]; });

  function sectBody(key, html) {
    return S.sectOpen[key] ? '<div class="acc-body">' + html + '</div>' : '';
  }

  let needsBox = '';
  if (a.status === 'needs_you') {
    needsBox =
      '<div class="sheet-needs-box">' +
        '<div class="sheet-lbl">Needs your attention</div>' +
        '<div style="font-size:14px">' + esc(openLabel(a)) + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:4px">' +
          '<button class="btn-primary" onclick="resolveAgent(\'' + esc(a.id) + '\',true)" style="flex:1">Approve</button>' +
          '<button class="btn-secondary" onclick="resolveAgent(\'' + esc(a.id) + '\',false)" style="flex:1">Deny</button>' +
          '<button class="btn-ghost" onclick="jumpTo(\'' + esc(a.id) + '\')" title="Find on tree">' + SVG.find + '</button>' +
        '</div>' +
      '</div>';
  }

  let answerBox = '';
  if (a.answer) {
    answerBox =
      '<div>' +
        '<div class="sheet-lbl" style="margin-bottom:8px">Answer</div>' +
        '<div style="font-size:14px;line-height:1.5;background:var(--p-soft);padding:10px;border:1px solid var(--p-line)">' + esc(a.answer) + '</div>' +
      '</div>';
  }

  let toolsSection = '';
  if (toolEntries.length) {
    toolsSection =
      '<div class="acc-row">' +
        '<button class="acc-btn" onclick="toggleSect(\'tools\')">' +
          '<span>Tools</span>' +
          '<span class="acc-hint">' + toolEntries.length + ' types ' + SVG[S.sectOpen.tools ? 'chevup' : 'chevdn'] + '</span>' +
        '</button>' +
        sectBody('tools', toolEntries.map(function(e){ return '<div class="acc-kv"><span>' + esc(e[0]) + '</span><span>' + e[1] + '×</span></div>'; }).join('')) +
      '</div>';
  }

  let recentSection = '';
  if (recent.length) {
    recentSection =
      '<div class="acc-row">' +
        '<button class="acc-btn" onclick="toggleSect(\'recent\')">' +
          '<span>Recent</span>' +
          '<span class="acc-hint">' + recent.length + ' messages ' + SVG[S.sectOpen.recent ? 'chevup' : 'chevdn'] + '</span>' +
        '</button>' +
        sectBody('recent', recent.map(function(r){
          return '<div class="acc-item">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--p-mute)">' +
              '<span>' + esc(r.kind || '') + '</span><span>' + ago(r.time || r.t) + '</span>' +
            '</div>' +
            '<div style="font-size:13px">' + esc(r.text || '') + '</div>' +
          '</div>';
        }).join('')) +
      '</div>';
  }

  const detailsBody =
    (a.started ? '<div class="acc-kv"><span>Started</span><span>' + ago(a.started) + '</span></div>' : '') +
    (a.since   ? '<div class="acc-kv"><span>Since</span><span>' + ago(a.since) + '</span></div>' : '') +
    (a.layer   ? '<div class="acc-kv"><span>Layer</span><span>' + esc(LAYER_LABEL[a.layer] || a.layer) + '</span></div>' : '') +
    (a.agent_type ? '<div class="acc-kv"><span>Type</span><span>' + esc(KIND_LABEL[a.agent_type] || a.agent_type) + '</span></div>' : '') +
    ((a.tokens || {}).input  ? '<div class="acc-kv"><span>Input tokens</span><span>' + fmtTok(a.tokens.input) + '</span></div>' : '') +
    ((a.tokens || {}).output ? '<div class="acc-kv"><span>Output tokens</span><span>' + fmtTok(a.tokens.output) + '</span></div>' : '') +
    ((a.tokens || {}).cache_read  ? '<div class="acc-kv"><span>Cache read</span><span>' + fmtTok(a.tokens.cache_read) + '</span></div>' : '') +
    ((a.tokens || {}).cache_write ? '<div class="acc-kv"><span>Cache write</span><span>' + fmtTok(a.tokens.cache_write) + '</span></div>' : '');

  const customPanelOpen = S.customPanel === a.id;
  const currentColor = S.customs[a.id] && S.customs[a.id].color;
  const swatches = PALETTE.map(function(c) {
    const isActive = c === currentColor;
    return '<button class="color-swatch' + (isActive ? ' active' : '') + '" style="background:' + c + '" onclick="customizeAgent(\'' + esc(a.id) + '\',\'' + c + '\')" title="' + c + '"></button>';
  }).join('');
  const resetSwatch = '<button class="color-swatch reset-swatch' + (!currentColor ? ' active' : '') + '" onclick="customizeAgent(\'' + esc(a.id) + '\',null)" title="Default color"></button>';

  sheet.innerHTML =
    BP +
    '<div class="sheet-head">' +
      '<button style="all:unset;cursor:pointer;display:contents" onclick="openAgentApp(\'' + esc(a.id) + '\')" title="Switch to this agent\'s app">' +
        av(a, 48) +
        '<div style="flex:1;min-width:0">' +
          '<div class="sheet-name">' + esc(a.name) + '</div>' +
          '<div class="sheet-sub">' + esc(KIND_LABEL[a.agent_type] || a.agent_type || '') + ' · ' + esc(LAYER_LABEL[a.layer] || '') + '</div>' +
          '<span class="status-tag ' + statusStyle(a.status) + '" style="margin-top:6px;display:inline-block">' + esc(STATUS_LABEL[a.status] || a.status) + '</span>' +
        '</div>' +
      '</button>' +
      '<button class="sheet-icon-btn' + (customPanelOpen ? ' active' : '') + '" onclick="toggleCustomPanel(\'' + esc(a.id) + '\')" title="Customize sprite">' + SVG.palette + '</button>' +
      '<button class="sheet-close-btn" onclick="closeSheet()">' + SVG.x + '</button>' +
    '</div>' +
    (customPanelOpen ? '<div class="color-picker-row">' + resetSwatch + swatches + '</div>' : '') +
    '<div class="sheet-body">' +
      (a.detail ? '<div style="font-size:14px">' + esc(a.detail) + '</div>' : '') +
      needsBox +
      answerBox +
      '<div class="sheet-stat-grid bp">' + BP +
        '<div class="sheet-stat"><span>Tokens</span><b>' + fmtTok(toks) + '</b></div>' +
        '<div class="sheet-stat"><span>Cost</span><b>' + fmtUsd(a.cost_usd) + '</b></div>' +
        '<div class="sheet-stat"><span>Active</span><b>' + (dur(a.started) || '—') + '</b></div>' +
      '</div>' +
      '<div class="acc-section">' +
        toolsSection +
        recentSection +
        '<div class="acc-row">' +
          '<button class="acc-btn" onclick="toggleSect(\'details\')">' +
            '<span>Details</span>' + SVG[S.sectOpen.details ? 'chevup' : 'chevdn'] +
          '</button>' +
          sectBody('details', detailsBody) +
        '</div>' +
      '</div>' +
    '</div>';
}

function renderLedger() {
  const wrap = el('ledger-wrap');
  if (!wrap) return;
  if (!S.ledgerOpen) {
    const msgs = S.messages;
    const unread = msgs.filter(function(m){ return (m.time || m.t || 0) > S.seenT; }).length;
    const last = msgs[msgs.length - 1];
    wrap.innerHTML =
      '<button class="ledger-tab-btn" onclick="openLedger()">' +
        '<span class="ltab-title">Ledger</span>' +
        (unread > 0 ? '<span class="unread-badge">' + unread + '</span>' : '') +
        '<div class="ltab-sep"></div>' +
        '<span class="ltab-prev">' + (last ? esc(last.text || '') : 'Agent messages + roster') + '</span>' +
        SVG.chevup +
      '</button>';
    return;
  }

  const agents = sortedAgents();
  const allMessages = S.messages.slice(-200).reverse();
  const filtered = S.ledgerChannel
    ? allMessages.filter(function(m){ return m.agent_id === S.ledgerChannel; })
    : allMessages;

  const chatHTML =
    '<div class="chat-pane">' +
      '<div class="chat-channels">' +
        '<div class="chat-ch-lbl">Agents</div>' +
        '<button class="chat-ch-btn ' + (!S.ledgerChannel ? 'active' : '') + '" onclick="setChannel(null)">' +
          '<span>All agents</span>' +
          '<span class="chat-ch-n">' + S.messages.length + '</span>' +
        '</button>' +
        agents.map(function(a){
          return '<button class="chat-ch-btn ' + (S.ledgerChannel === a.id ? 'active' : '') + '" onclick="setChannel(\'' + esc(a.id) + '\')">' +
            '<span style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">' +
              av(a, 16) + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.name) + '</span>' +
            '</span>' +
            '<span class="chat-ch-n">' + S.messages.filter(function(m){ return m.agent_id === a.id; }).length + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="chat-feed" id="chat-feed">' +
        (filtered.length === 0
          ? '<div style="color:var(--p-mute);font-size:13px;padding:16px">No messages yet</div>'
          : filtered.map(function(m){
              const a = S.agents.get(m.agent_id);
              return '<div class="chat-msg">' +
                av(a || {agent_type:'backend'}, 28) +
                '<div class="chat-msg-body">' +
                  '<div class="chat-msg-hdr">' +
                    '<span class="chat-msg-name">' + esc(m.agent_name || (a && a.name) || 'Agent') + '</span>' +
                    '<span class="chat-msg-where">' + esc(m.kind || '') + '</span>' +
                    '<span class="chat-msg-time">' + ago(m.time || m.t) + '</span>' +
                  '</div>' +
                  '<div class="chat-msg-text">' + esc(m.text || '') + '</div>' +
                '</div>' +
              '</div>';
            }).join('')
        ) +
      '</div>' +
    '</div>';

  const maxToks = Math.max(...[...S.agents.values()].map(tokTotal), 1);

  const rosterHTML =
    '<div class="roster-pane">' +
      '<div class="roster-hdr-row"><span>Agent</span><span>Working on</span><span>Progress</span><span>Status</span></div>' +
      agents.map(function(a){
        const toks = tokTotal(a);
        const pct = Math.round((toks / maxToks) * 100);
        return '<button class="roster-row" onclick="jumpTo(\'' + esc(a.id) + '\')">' +
          '<div class="roster-agent-cell">' +
            av(a, 28) +
            '<div class="roster-agent-info">' +
              '<div class="roster-agent-name">' + esc(a.name) + '</div>' +
              '<div class="roster-agent-sub">' + esc(KIND_LABEL[a.agent_type] || a.agent_type || '') + ' · ' + esc(LAYER_LABEL[a.layer] || '') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="roster-job-cell">' +
            '<div class="roster-job">' + esc(a.detail || agentSummary(a) || '—') + '</div>' +
            (a.activity ? '<div class="roster-now">' + esc(a.activity) + '</div>' : '') +
          '</div>' +
          '<div class="roster-prog">' +
            '<div class="roster-bar"><div class="roster-bar-fill" style="width:' + pct + '%"></div></div>' +
            '<span class="roster-pct">' + fmtTok(toks) + '</span>' +
          '</div>' +
          '<span class="status-tag ' + statusStyle(a.status) + '">' + esc(STATUS_LABEL[a.status] || a.status) + '</span>' +
        '</button>';
      }).join('') +
    '</div>';

  wrap.innerHTML =
    '<div class="ledger-drawer bp">' + BP +
      '<div class="ledger-hdr">' +
        '<button class="ltab-sel ' + (S.ledgerTab === 'chat' ? 'active' : '') + '" onclick="setLedgerTab(\'chat\')">' +
          'Chat <span class="ltab-count">' + S.messages.length + '</span>' +
        '</button>' +
        '<button class="ltab-sel ' + (S.ledgerTab === 'roster' ? 'active' : '') + '" onclick="setLedgerTab(\'roster\')">' +
          "Who's on what <span class=\"ltab-count\">" + S.agents.size + '</span>' +
        '</button>' +
        '<button class="ledger-close-btn" onclick="closeLedger()">' + SVG.chevdn + ' Close</button>' +
      '</div>' +
      (S.ledgerTab === 'chat' ? chatHTML : rosterHTML) +
    '</div>';

  const feed = el('chat-feed');
  if (feed) feed.scrollTop = 0;
  if (S.messages.length) S.seenT = Math.max.apply(null, S.messages.map(function(m){ return m.time||m.t||0; }));
}

function renderQuestLog() {
  const panel = el('quest-panel');
  if (!panel) return;
  if (!S.questsOpen) { panel.hidden = true; return; }
  panel.hidden = false;
  panel.className = 'bp modal-panel quest-panel-el';

  const needsYou = sortedAgents().filter(function(a){ return a.status === 'needs_you'; });
  const others = sortedAgents().filter(function(a){ return a.status !== 'needs_you'; });

  const needsYouCards = needsYou.length === 0
    ? '<div style="color:var(--p-mute);font-size:13px">All clear</div>'
    : needsYou.map(function(a){
        return '<div class="quest-card">' + BP +
          '<div class="quest-card-hdr">' +
            av(a, 28) +
            '<div style="flex:1;min-width:0">' +
              '<div style="font:600 16px/1.1 var(--font-heading)">' + esc(a.name) + '</div>' +
              '<div style="font-size:12px;color:var(--p-mute)">' + esc(KIND_LABEL[a.agent_type] || a.agent_type || '') + '</div>' +
            '</div>' +
            '<span class="status-tag ' + statusStyle(a.status) + '">' + esc(STATUS_LABEL[a.status] || a.status) + '</span>' +
          '</div>' +
          '<div style="font-size:14px">' + esc(openLabel(a)) + '</div>' +
          '<div class="quest-card-btns">' +
            '<button class="btn-primary" onclick="resolveAgent(\'' + esc(a.id) + '\',true);closeModals()">Approve</button>' +
            '<button class="btn-secondary" onclick="resolveAgent(\'' + esc(a.id) + '\',false);closeModals()">Deny</button>' +
            '<button class="btn-ghost" onclick="jumpTo(\'' + esc(a.id) + '\');closeModals()">' + SVG.find + ' Find</button>' +
          '</div>' +
        '</div>';
      }).join('');

  const activeCols = others.map(function(a){
    const tools = Object.entries(a.tool_counts || {}).filter(function(e){ return e[1] > 0; }).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5);
    return '<div class="todo-group">' +
      '<div class="todo-hdr">' +
        av(a, 20) +
        '<b>' + esc(a.name) + '</b>' +
        '<span class="status-tag ' + statusStyle(a.status) + '">' + esc(STATUS_LABEL[a.status] || a.status) + '</span>' +
      '</div>' +
      tools.map(function(e){
        return '<div class="todo-item"><span class="todo-check done">' + SVG.check + '</span><span>' + esc(e[0]) + ' ×' + e[1] + '</span></div>';
      }).join('') +
      (a.activity
        ? '<div class="todo-item"><span class="todo-check ' + (a.status === 'done' ? 'done' : '') + '">' + (a.status === 'done' ? SVG.check : '') + '</span><span>' + esc(a.activity) + '</span></div>'
        : '') +
    '</div>';
  }).join('');

  panel.innerHTML =
    BP +
    '<div class="modal-hdr">' +
      '<div>' +
        '<div class="modal-title">Quest Log</div>' +
        '<div class="modal-sub">' + needsYou.length + ' need your attention · ' + others.length + ' agents active</div>' +
      '</div>' +
      '<button class="modal-close" onclick="closeModals()">' + SVG.x + '</button>' +
    '</div>' +
    '<div class="quest-body">' +
      '<div class="quest-col"><div class="quest-col-lbl">Needs you</div>' + needsYouCards + '</div>' +
      '<div class="quest-col"><div class="quest-col-lbl">Active agents</div>' + activeCols + '</div>' +
    '</div>';
}

function renderBank() {
  const panel = el('bank-panel');
  if (!panel) return;
  if (!S.bankOpen) { panel.hidden = true; return; }
  panel.hidden = false;
  panel.className = 'bp modal-panel bank-panel-el';

  const agents = sortedAgents();
  const totalCost = agents.reduce(function(s,a){ return s + (a.cost_usd||0); }, 0);
  const totalToks = agents.reduce(function(s,a){ return s + tokTotal(a); }, 0);
  const totalTools = agents.reduce(function(s,a){ return s + Object.values(a.tool_counts||{}).reduce(function(x,v){ return x+v; }, 0); }, 0);

  const hist = S.bankHistory;
  const maxVal = Math.max.apply(null, hist.map(function(d){ return S.measure === 'cost' ? (d.cost||0) : (d.tokens||0); }).concat([0.001]));

  function dateLabel(dayStr) {
    const d = new Date(dayStr);
    return (d.getMonth()+1) + '/' + d.getDate();
  }

  const histChart = hist.length > 0
    ? '<div>' +
        '<div class="bank-chart-hdr">' +
          '<div>14-day history</div>' +
          '<div class="measure-toggle">' +
            '<button class="measure-btn" onclick="setMeasure(\'cost\')" style="background:' + (S.measure==='cost'?'var(--p-soft)':'transparent') + ';border:0">Cost</button>' +
            '<button class="measure-btn" onclick="setMeasure(\'tokens\')" style="background:' + (S.measure==='tokens'?'var(--p-soft)':'transparent') + ';border:0">Tokens</button>' +
          '</div>' +
        '</div>' +
        '<div class="bank-chart-bars">' +
          hist.map(function(d){
            const val = S.measure === 'cost' ? (d.cost||0) : (d.tokens||0);
            const pct = Math.round((val / maxVal) * 100);
            return '<div class="bank-bar"><div style="height:' + pct + '%;background:var(--color-accent);min-height:' + (val>0?'2px':'0') + '"></div></div>';
          }).join('') +
        '</div>' +
        '<div class="bank-chart-labels">' +
          hist.map(function(d){ return '<div>' + dateLabel(d.day) + '</div>'; }).join('') +
        '</div>' +
      '</div>'
    : '';

  panel.innerHTML =
    BP +
    '<div class="modal-hdr">' +
      '<div><div class="modal-title">Bank</div><div class="modal-sub">Today\'s usage and spend</div></div>' +
      '<button class="modal-close" onclick="closeModals()">' + SVG.x + '</button>' +
    '</div>' +
    '<div class="bank-body">' +
      '<div class="bank-tiles bp">' + BP +
        '<div class="bank-tile"><span>Today\'s spend</span><b>' + fmtUsd(totalCost) + '</b></div>' +
        '<div class="bank-tile"><span>Tokens used</span><b>' + fmtTok(totalToks) + '</b></div>' +
        '<div class="bank-tile"><span>Tool calls</span><b>' + totalTools + '</b></div>' +
      '</div>' +
      histChart +
      '<div>' +
        '<div class="bank-table-hdr"><span>Agent</span><span>Layer</span><span class="num">Tokens</span><span class="num">Cost</span></div>' +
        agents.map(function(a){
          return '<button class="bank-row" onclick="selectAgent(\'' + esc(a.id) + '\');closeModals()">' +
            '<div class="bank-agent-cell">' + av(a,20) + '<span>' + esc(a.name) + '</span></div>' +
            '<span style="color:var(--p-mute);font-size:13px">' + esc(LAYER_LABEL[a.layer] || a.layer || '') + '</span>' +
            '<span class="num">' + fmtTok(tokTotal(a)) + '</span>' +
            '<span class="num">' + fmtUsd(a.cost_usd) + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</div>';
}

function renderTheme() {
  const stage = el('stage');
  if (!stage) return;
  stage.setAttribute('data-theme', S.dark > 0.5 ? 'dusk' : 'day');
}

function render() {
  renderLayerLabels();
  renderHUD();
  renderTimePop();
  renderHoverCard();
  renderBankTip();
  renderBoardTip();
  renderAgentSheet();
  renderLedger();
  renderQuestLog();
  renderBank();
  renderTheme();
}

// ===== Data layer =========================================================
function upsert(a) {
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

function receive(msg) {
  if (msg.type === 'state') {
    for (const a of (msg.agents || [])) upsert(a);
  } else if (msg.type === 'agent') {
    if (msg.agent) upsert(msg.agent);
  }
  syncAgents();
  scheduleRender();
}

function loadHistory() {
  fetch('/api/daily?days=14')
    .then(function(r){ return r.ok ? r.json() : null; })
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
  const es = new EventSource('/stream');
  window.__es = es;
  es.onmessage = function(e) {
    try { receive(JSON.parse(e.data)); } catch(ex) {}
  };
  es.onerror = function() {
    es.close();
    window.__es = null;
    setTimeout(connect, 3000);
  };
}

// ===== Actions (called from inline onclick) ================================
function openAgentApp(id) {
  fetch('/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id }) }).catch(function(){});
}

function jumpTo(id) {
  S.selectedId = id;
  syncAgents();
  render();
}

function selectAgent(id) {
  S.selectedId = id;
  render();
}

function resolveAgent(id, ok) {
  fetch('/api/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent_id: id, approved: ok }),
  }).catch(function(){});
  const a = S.agents.get(id);
  if (a) {
    upsert(Object.assign({}, a, { status: ok ? 'working' : 'idle' }));
    syncAgents();
    render();
  }
}

function closeSheet() { S.selectedId = null; S.customPanel = null; render(); }
function toggleCustomPanel(id) { S.customPanel = S.customPanel === id ? null : id; renderAgentSheet(); }
function closeHudPopups() { S.ledgerOpen = false; S.timeOpen = false; }
function openLedger()  { closeHudPopups(); S.ledgerOpen = true; render(); }
function closeLedger() { S.ledgerOpen = false; render(); }
function setLedgerTab(t){ S.ledgerTab = t; render(); }
function setChannel(id) { S.ledgerChannel = id; render(); }
function openQuests()  { closeHudPopups(); S.questsOpen = true; S.bankOpen = false; el('modal-back').hidden = false; render(); }
function openBank()    { closeHudPopups(); S.bankOpen = true; S.questsOpen = false; el('modal-back').hidden = false; render(); }
function closeModals() { S.questsOpen = false; S.bankOpen = false; el('modal-back').hidden = true; S.timeOpen = false; render(); }
function toggleTimePop(){
  const opening = !S.timeOpen;
  closeHudPopups();
  S.timeOpen = opening;
  renderLedger();
  renderTimePop();
}
function closeTimePop(){ S.timeOpen = false; renderTimePop(); }
function onHourSlide(v){ S.auto = false; if (world) world.setHour(parseFloat(v)); }
function setPreset(h)  { S.auto = false; if (world) world.setHour(h); }
function animatePreset(from, to){ S.auto = false; if (world) world.animateTo(to, 4, from, true); }
function toggleAuto()  { S.auto = !S.auto; if (S.auto) applyRealTime(true); renderTimePop(); }
function toggleSect(k) { S.sectOpen[k] = !S.sectOpen[k]; renderAgentSheet(); }
function setMeasure(m) { S.measure = m; renderBank(); }

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

// ===== Sprite customization ===============================================
function customizeAgent(id, color) {
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

// ===== Real-time clock ====================================================
function autoHour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
function applyRealTime(animate) {
  if (!world) return;
  if (animate) world.animateTo(autoHour(), 2);
  else world.setHour(autoHour());
}
// Advance time every minute when in auto mode
setInterval(function() { if (S.auto && world && !S.animating) world.animateTo(autoHour(), 2); }, 60000);

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
  const timePop = el('time-pop');
  const clockButton = el('btn-clock');
  const ledger = el('ledger-wrap');

  if (clockButton && clockButton.contains(target)) {
    e.preventDefault();
    toggleTimePop();
    return;
  }
  if (S.timeOpen && !timePop.contains(target)) {
    closeTimePop();
  }
  if (S.ledgerOpen && !ledger.contains(target)) {
    S.ledgerOpen = false;
    renderLedger();
  }
}, true);

// Keep the clock button keyboard operable; pointer activation is handled above
// so a live HUD redraw cannot interrupt the open/close action.
document.addEventListener('click', function(e) {
  const target = e.target;
  if (e.detail === 0 && target.closest && target.closest('#btn-clock')) toggleTimePop();
  if (e.detail === 0 && target.closest && target.closest('.time-close')) closeTimePop();
});

// ===== Escape key ========================================================
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (S.selectedId) { closeSheet(); return; }
  if (S.questsOpen || S.bankOpen || S.timeOpen) { closeModals(); return; }
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
  closeSheet();
});

// ===== Init ===============================================================
function init() {
  try { S.customs = JSON.parse(localStorage.getItem('wg-customs') || '{}'); } catch(e) {}
  mountEngine();
  if (world) { if (S.auto) applyRealTime(false); else world.setHour(mq.matches ? 22 : 12); }
  connect();
  loadHistory();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
