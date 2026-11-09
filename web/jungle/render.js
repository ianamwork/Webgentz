// Turns state into HTML for every panel: HUD, cards, sheet, ledger, modals.
// Panels are patched with morph() rather than replaced, so scroll, focus and
// hover survive the frequent live updates. Give list rows and optional blocks
// a data-key so they are matched by identity, not position.
// All styling lives in style.css; only positions computed at runtime and
// data-driven sizes (bar heights, colours) are set inline.
import { BP, KIND_LABEL, LAYER_LABEL, PALETTE, SVG } from './constants.js';
import { ago, clock, dur, el, esc, fmtTok, fmtUsd, tokTotal } from './format.js';
import { S } from './state.js';
import { morph } from './morph.js';
import { cancelLeave, leave, setShown } from './motion.js';
import { activeAgents, agentSummary, av, displayName, layerDisplayName, openLabel, providerBadge, shortName, sortedAgents, statusTag } from './agents.js';

export let rafId = 0;

export function scheduleRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(function() { rafId = 0; render(); });
}

function kindLayer(a) {
  return esc(KIND_LABEL[a.agent_type] || a.agent_type || '') + ' · ' + esc(layerDisplayName(a.layer) || '');
}

function emptyState(title, text) {
  return '<div class="empty-state" data-key="empty"><b>' + esc(title) + '</b><span>' + esc(text) + '</span></div>';
}

// Two-option segmented control. `options` is [[label, onclick, active], ...].
function seg(options) {
  return '<div class="seg" role="group">' + options.map(function(o) {
    return '<button class="seg-btn" aria-pressed="' + (o[2] ? 'true' : 'false') + '" onclick="' + o[1] + '">' + o[0] + '</button>';
  }).join('') + '</div>';
}

export function renderLayerLabels() {
  const counts = { canopy: 0, understory: 0, roots: 0 };
  for (const a of activeAgents()) {
    const l = a.layer || 'understory';
    if (l in counts) counts[l]++;
  }
  const items = [
    ['ll-canopy',     'canopy'],
    ['ll-understory', 'understory'],
    ['ll-roots',      'roots'],
  ];
  for (const [id, layer] of items) {
    const div = el(id);
    if (!div) continue;
    const n = counts[layer] || 0;
    const name = layerDisplayName(layer);
    if (S.renamingLayer === layer) {
      div.style.pointerEvents = 'auto';
      if (!div.querySelector('.ll-rename-input')) {
        // The box replaces the cached label HTML, so forget the cache: the next
        // normal render must always swap the label back in.
        div.dataset.llCache = '';
        div.innerHTML = '<input class="ll-rename-input" value="' + esc(name) + '" maxlength="24" aria-label="Layer name" ' +
          'onblur="saveLayerName(\'' + layer + '\',this.value)" ' +
          'onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')cancelRenameLayer();" />';
        const input = div.querySelector('input');
        if (input) { input.focus(); input.select(); }
      }
    } else {
      div.style.pointerEvents = n > 0 ? 'auto' : 'none';
      const newHTML = n > 0
        ? '<button class="ll-head" title="Rename this layer" onclick="startRenameLayer(\'' + layer + '\')">' + esc(name) + '</button>' +
          '<span class="ll-sub">' + n + ' agent' + (n === 1 ? '' : 's') + '</span>'
        : '';
      if (div.dataset.llCache !== newHTML) { div.dataset.llCache = newHTML; div.innerHTML = newHTML; }
    }
  }
}

export function renderHUD() {
  const hud = el('hud');
  if (!hud) return;
  const all = activeAgents();
  const working = all.filter(a => a.status === 'working' || a.status === 'needs_you' || a.status === 'stuck').length;
  const needsYou = all.filter(a => a.status === 'needs_you').length;

  morph(hud,
    '<div class="hud-logo">WEBGENTZ</div>' +
    '<div class="hud-right">' +
      '<div class="hud-counts" aria-label="' + all.length + ' agents, ' + working + ' working">' +
        '<span class="hud-n">' + all.length + '</span><span class="hud-unit">agents</span>' +
        '<i class="hud-sep"></i>' +
        '<span class="hud-n">' + working + '</span><span class="hud-unit">working</span>' +
      '</div>' +
      '<button class="btn-bp hud-btn" id="btn-settings" aria-label="Settings" aria-expanded="' + S.settingsOpen + '" onclick="toggleSettings()">' +
        BP + SVG.gear + '<span id="hud-clock">' + clock(S.hour) + '</span>' +
      '</button>' +
      '<button class="btn-bp btn-quest" id="btn-quest" onclick="openQuests()">' +
        BP + SVG.scroll + '<span class="btn-quest-label">Quest Board</span>' +
        (needsYou > 0 ? '<span class="need-badge" data-key="badge">' + needsYou + ' need you</span>' : '') +
      '</button>' +
    '</div>');
}

export function renderSettingsPop() {
  const pop = el('time-pop');
  if (!pop) return;
  if (!S.settingsOpen) { setShown(pop, false); return; }
  setShown(pop, true);
  pop.className = 'bp';
  // Hang the popover under the gear button, whatever the top bar's width.
  const gear = el('btn-settings');
  if (gear) {
    const r = gear.getBoundingClientRect();
    pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  }

  const isDark = S.darkOverride !== null ? S.darkOverride : S.dark > 0.5;
  const isNight = S.hour >= 18 || S.hour < 6;
  const todayCost = activeAgents().reduce(function(s, a) { return s + (a.cost_usd || 0); }, 0);

  morph(pop,
    BP +
    '<div class="pop-row">' +
      '<span class="lbl">Bank</span>' +
      '<span class="pop-amount">' + fmtUsd(todayCost) + '</span>' +
    '</div>' +
    '<button class="btn-secondary btn-block" onclick="openBank()">View details</button>' +
    '<div class="pop-rule"></div>' +
    '<span class="lbl">Appearance</span>' +
    seg([['Light', 'setDarkOverride(false)', !isDark], ['Dark', 'setDarkOverride(true)', isDark]]) +
    '<div class="pop-rule"></div>' +
    '<span class="lbl">Time of day</span>' +
    seg([['Day', 'setTimeOfDay(false)', !isNight], ['Night', 'setTimeOfDay(true)', isNight]]));
}

export function renderHoverCard() {
  const card = el('hover-card');
  if (!card) return;
  if (!S.hover || !S.hoverPos) { setShown(card, false); return; }
  const a = S.hover;
  const pos = S.hoverPos;
  setShown(card, true);
  card.className = 'bp';
  // Keep the card on screen near the left and right edges.
  const half = 130;
  card.style.left = Math.min(Math.max(pos.x, half + 8), window.innerWidth - half - 8) + 'px';
  card.style.top = pos.y + 'px';
  const toks = tokTotal(a);
  morph(card,
    BP +
    '<div class="hc-header">' +
      av(a, 32) +
      '<div class="hc-title">' +
        '<div class="hc-name">' + displayName(a.name) + '</div>' +
        '<div class="hc-sub">' + kindLayer(a) + '</div>' +
      '</div>' +
      statusTag(a.status) +
    '</div>' +
    (a.detail ? '<div class="hc-detail" data-key="detail">' + esc(a.detail) + '</div>' : '') +
    '<div class="hc-meta" data-key="meta">' +
      providerBadge(a.agent_type) +
      (toks ? '<span>' + fmtTok(toks) + ' tokens</span>' : '') +
      (a.cost_usd ? '<span>' + fmtUsd(a.cost_usd) + '</span>' : '') +
      (a.started ? '<span>' + dur(a.started) + '</span>' : '') +
    '</div>');
}

export function renderBankTip() {
  const tip = el('bank-tip');
  if (!tip) return;
  if (!S.bankHover) { setShown(tip, false); return; }
  setShown(tip, true);
  tip.className = 'bp tip';
  const cost = [...S.agents.values()].reduce((s, a) => s + (a.cost_usd || 0), 0);
  morph(tip, BP + '<span>Bank · today <b>' + fmtUsd(cost) + '</b></span>');
}

export function renderBoardTip() {
  const tip = el('board-tip');
  if (!tip) return;
  if (!S.boardHover) { setShown(tip, false); return; }
  setShown(tip, true);
  tip.className = 'bp tip';
  const n = [...S.agents.values()].filter(a => a.status === 'needs_you').length;
  morph(tip, BP + '<span>Quest board' + (n > 0 ? ' · <b>' + n + ' need you</b>' : '') + '</span>');
}

function accRow(key, title, hint, body) {
  const open = !!S.sectOpen[key];
  return '<div class="acc-row" data-key="' + key + '">' +
    '<button class="acc-btn" aria-expanded="' + open + '" onclick="toggleSect(\'' + key + '\')">' +
      '<span>' + title + '</span>' +
      '<span class="acc-hint">' + (hint ? '<span>' + hint + '</span>' : '') + SVG[open ? 'chevup' : 'chevdn'] + '</span>' +
    '</button>' +
    (open ? '<div class="acc-body">' + body + '</div>' : '') +
  '</div>';
}

function kv(label, value, title) {
  return '<div class="acc-kv"><span>' + label + '</span><span' + (title ? ' title="' + esc(title) + '"' : '') + '>' + value + '</span></div>';
}

export function renderAgentSheet() {
  const sheet = el('agent-sheet');
  const stage = el('stage');
  if (!sheet) return;
  const a = S.selectedId && S.agents.get(S.selectedId);
  if (stage) stage.classList.toggle('sheet-open', !!a);
  if (!a) { setShown(sheet, false); return; }
  setShown(sheet, true);
  sheet.className = 'bp';
  sheet.setAttribute('aria-label', 'Agent details');

  const toks = tokTotal(a);
  const recent = (a.recent || []).slice(-8).reverse();
  const tools = a.tool_counts || {};
  const toolEntries = Object.entries(tools).filter(function(e) { return e[1] > 0; }).sort(function(x, y) { return y[1] - x[1]; });
  const id = esc(a.id);
  const busy = a.status === 'working' || a.status === 'needs_you' || a.status === 'stuck';

  const needsBox = a.status === 'needs_you'
    ? '<div class="sheet-needs-box" data-key="needs">' +
        '<div class="lbl">Needs your attention</div>' +
        '<div class="sheet-needs-text">' + esc(openLabel(a)) + '</div>' +
        '<div class="btn-row">' +
          '<button class="btn-primary" onclick="resolveAgent(\'' + id + '\',true)">Approve</button>' +
          '<button class="btn-secondary" onclick="resolveAgent(\'' + id + '\',false)">Deny</button>' +
          '<button class="btn-ghost btn-icon" onclick="jumpTo(\'' + id + '\')" title="Find on tree" aria-label="Find on tree">' + SVG.find + '</button>' +
        '</div>' +
      '</div>'
    : '';

  // While the agent is busy again, its answer is from the previous task.
  const answerBox = a.answer
    ? '<div class="sheet-answer" data-key="answer">' +
        '<div class="lbl">' + (busy ? 'Last answer' : 'Answer') + '</div>' +
        '<div class="sheet-answer-text">' + esc(a.answer) + '</div>' +
      '</div>'
    : '';

  const toolsRow = toolEntries.length
    ? accRow('tools', 'Tools', toolEntries.length + ' type' + (toolEntries.length === 1 ? '' : 's'),
        toolEntries.map(function(e) { return kv(esc(e[0]), e[1] + '×'); }).join(''))
    : '';

  const recentRow = recent.length
    ? accRow('recent', 'Recent', recent.length + ' message' + (recent.length === 1 ? '' : 's'),
        recent.map(function(r) {
          return '<div class="acc-item">' +
            '<div class="acc-item-meta"><span>' + esc(r.kind || '') + '</span><span>' + ago(r.time || r.t) + '</span></div>' +
            '<div>' + esc(r.text || '') + '</div>' +
          '</div>';
        }).join(''))
    : '';

  const tk = a.tokens || {};
  const detailsBody =
    (a.cwd ? kv('Project folder', esc(a.cwd.split('/').filter(Boolean).pop() || a.cwd), a.cwd) : '') +
    (a.open && a.open.app ? kv('Running in', esc(a.open.app) + (a.open.tty ? ' · ' + esc(a.open.tty.replace(/^\/dev\//, '')) : '')) : '') +
    (a.helper_type ? kv('Claude helper', esc(a.helper_type)) : '') +
    kv('Session', esc(a.id.slice(0, 12)), a.id) +
    (a.started ? kv('Started', ago(a.started)) : '') +
    (a.since ? kv('Since', ago(a.since)) : '') +
    (a.layer ? kv('Layer', esc(LAYER_LABEL[a.layer] || a.layer)) : '') +
    (a.agent_type ? kv('Type', esc(KIND_LABEL[a.agent_type] || a.agent_type)) : '') +
    (tk.input ? kv('Input tokens', fmtTok(tk.input)) : '') +
    (tk.output ? kv('Output tokens', fmtTok(tk.output)) : '') +
    (tk.cache_read ? kv('Cache read', fmtTok(tk.cache_read)) : '') +
    (tk.cache_write ? kv('Cache write', fmtTok(tk.cache_write)) : '');

  const customPanelOpen = S.customPanel === a.id;
  const currentColor = S.customs[a.id] && S.customs[a.id].color;
  const swatches = PALETTE.map(function(c) {
    return '<button class="color-swatch' + (c === currentColor ? ' active' : '') + '" style="background:' + c + '" onclick="customizeAgent(\'' + id + '\',\'' + c + '\')" title="' + c + '" aria-label="Colour ' + c + '"></button>';
  }).join('');
  const resetSwatch = '<button class="color-swatch reset-swatch' + (!currentColor ? ' active' : '') + '" onclick="customizeAgent(\'' + id + '\',null)" title="Default colour" aria-label="Default colour"></button>';
  const terminalSession = a.open && (a.open.app === 'Terminal' || a.open.app === 'iTerm2') && a.open.tty;
  const footer = a.status !== 'gone'
    ? '<div class="sheet-foot" data-key="foot">' +
        '<button class="btn-secondary" onclick="dismissAgent(\'' + id + '\')">Send away</button>' +
        (terminalSession ? '<button class="btn-secondary" onclick="closeAgentTerminal(\'' + id + '\')">Close terminal</button>' : '') +
      '</div>'
    : '';

  morph(sheet,
    BP +
    '<div class="sheet-head" data-key="head">' +
      '<button class="sheet-id" onclick="openAgentApp(\'' + id + '\')" title="Switch to this agent’s app">' +
        av(a, 48) +
        '<div class="sheet-id-text">' +
          '<div class="sheet-name">' + displayName(a.name) + '</div>' +
          '<div class="sheet-sub">' + kindLayer(a) + providerBadge(a.agent_type) + '</div>' +
          statusTag(a.status) +
        '</div>' +
      '</button>' +
      '<button class="sheet-icon-btn' + (customPanelOpen ? ' active' : '') + '" onclick="toggleCustomPanel(\'' + id + '\')" title="Change colour" aria-label="Change colour" aria-expanded="' + customPanelOpen + '">' + SVG.palette + '</button>' +
      '<button class="sheet-close-btn" onclick="closeSheet()" title="Close" aria-label="Close">' + SVG.x + '</button>' +
    '</div>' +
    (customPanelOpen ? '<div class="color-picker-row" data-key="colors">' + resetSwatch + swatches + '</div>' : '') +
    '<div class="sheet-body" data-key="body-' + id + '">' +
      // The needs-you box already shows the request, so don't repeat it.
      (a.detail && a.status !== 'needs_you' ? '<div class="sheet-now" data-key="detail">' + esc(a.detail) + '</div>' : '') +
      needsBox +
      answerBox +
      '<div class="sheet-stat-grid" data-key="stats">' +
        '<div class="sheet-stat"><span>Tokens</span><b>' + fmtTok(toks) + '</b></div>' +
        '<div class="sheet-stat"><span>Cost</span><b>' + fmtUsd(a.cost_usd) + '</b></div>' +
        '<div class="sheet-stat"><span>Active</span><b>' + (dur(a.started) || '—') + '</b></div>' +
      '</div>' +
      '<div class="acc-section" data-key="sections">' +
        toolsRow + recentRow + accRow('details', 'Details', '', detailsBody) +
      '</div>' +
    '</div>' +
    footer);
}

export function renderLedger() {
  const wrap = el('ledger-wrap');
  if (!wrap) return;
  if (!S.ledgerOpen) {
    // Let the open drawer play its exit before the pull tab replaces it.
    const drawer = wrap.querySelector('.ledger-drawer');
    if (drawer && leave(drawer, renderLedger)) return;
    const msgs = S.messages;
    const unread = msgs.filter(function(m) { return (m.time || m.t || 0) > S.seenT; }).length;
    const last = msgs[msgs.length - 1];
    morph(wrap,
      '<button class="ledger-tab-btn bp" onclick="openLedger()" aria-label="Open the ledger">' +
        '<span class="ltab-title">Ledger</span>' +
        (unread > 0 ? '<span class="unread-badge" data-key="unread">' + unread + '</span>' : '') +
        '<i class="ltab-sep"></i>' +
        '<span class="ltab-prev">' + (last ? esc(last.text || '') : 'Agent messages and who is on what') + '</span>' +
        SVG.chevup +
      '</button>');
    return;
  }

  cancelLeave(wrap.querySelector('.ledger-drawer'));
  const agents = sortedAgents();
  const allMessages = S.messages.slice(-200).reverse();
  const filtered = S.ledgerChannel
    ? allMessages.filter(function(m) { return m.agent_id === S.ledgerChannel; })
    : allMessages;

  const chatHTML =
    '<div class="chat-pane" data-key="chat">' +
      '<div class="chat-channels">' +
        '<div class="lbl chat-ch-lbl">Agents</div>' +
        '<button class="chat-ch-btn" aria-pressed="' + !S.ledgerChannel + '" data-key="all" onclick="setChannel(null)">' +
          '<span class="chat-ch-name">All agents</span>' +
          '<span class="chat-ch-n">' + S.messages.length + '</span>' +
        '</button>' +
        agents.map(function(a) {
          return '<button class="chat-ch-btn" aria-pressed="' + (S.ledgerChannel === a.id) + '" data-key="' + esc(a.id) + '" title="' + esc(a.name) + '" onclick="setChannel(\'' + esc(a.id) + '\')">' +
            '<span class="chat-ch-name">' + av(a, 16) + '<span>' + esc(shortName(a.name)) + '</span></span>' +
            '<span class="chat-ch-n">' + S.messages.filter(function(m) { return m.agent_id === a.id; }).length + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="chat-feed" id="chat-feed" data-key="feed-' + esc(S.ledgerChannel || '') + '">' +
        (filtered.length === 0
          ? emptyState('No messages yet', 'Agent tool calls, prompts and answers show up here as they happen.')
          : filtered.map(function(m) {
              const a = S.agents.get(m.agent_id);
              return '<div class="chat-msg" data-key="' + esc(m.agent_id + '|' + (m.time || m.t || 0)) + '">' +
                av(a || { agent_type: 'backend' }, 28) +
                '<div class="chat-msg-body">' +
                  '<div class="chat-msg-hdr">' +
                    '<span class="chat-msg-name">' + esc(m.agent_name || (a && a.name) || 'Agent') + '</span>' +
                    (m.kind ? '<span class="chat-msg-where">' + esc(m.kind) + '</span>' : '') +
                    '<span class="chat-msg-time">' + ago(m.time || m.t) + '</span>' +
                  '</div>' +
                  '<div class="chat-msg-text">' + esc(m.text || '') + '</div>' +
                '</div>' +
              '</div>';
            }).join('')) +
      '</div>' +
    '</div>';

  const maxToks = Math.max(...[...S.agents.values()].map(tokTotal), 1);
  const rosterHTML =
    '<div class="roster-pane" data-key="roster">' +
      '<div class="roster-hdr-row"><span>Agent</span><span>Working on</span><span class="roster-prog-col">Tokens</span><span>Status</span></div>' +
      (agents.length === 0
        ? emptyState('No agents yet', 'Start Claude Code, Codex or a script that uses the Webgentz client and it will appear here.')
        : agents.map(function(a) {
            const toks = tokTotal(a);
            const pct = Math.round((toks / maxToks) * 100);
            const where = a.open && a.open.app
              ? a.open.app + (a.open.tty ? ' · ' + a.open.tty.replace(/^\/dev\//, '') : '')
              : (a.cwd ? a.cwd.split('/').filter(Boolean).pop() : (KIND_LABEL[a.agent_type] || a.agent_type || ''));
            return '<button class="roster-row" data-key="' + esc(a.id) + '" data-opens-sheet onclick="jumpTo(\'' + esc(a.id) + '\')">' +
              '<div class="roster-agent-cell">' +
                av(a, 28) +
                '<div class="roster-agent-info">' +
                  '<div class="roster-agent-name"><span>' + displayName(a.name) + '</span>' + providerBadge(a.agent_type) + '</div>' +
                  '<div class="roster-agent-sub">' + esc(where) + (a.helper_type ? ' · helper: ' + esc(a.helper_type) : '') + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="roster-job-cell">' +
                '<div class="roster-job">' + esc(a.detail || agentSummary(a) || '—') + '</div>' +
                (a.activity ? '<div class="roster-now" data-key="now">' + esc(a.activity) + '</div>' : '') +
              '</div>' +
              '<div class="roster-prog roster-prog-col">' +
                '<div class="roster-bar"><div class="roster-bar-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="roster-pct">' + fmtTok(toks) + '</span>' +
              '</div>' +
              '<div class="roster-status">' + statusTag(a.status) + '</div>' +
            '</button>';
          }).join('')) +
    '</div>';

  morph(wrap,
    '<div class="ledger-drawer bp" role="region" aria-label="Ledger">' + BP +
      '<div class="ledger-hdr">' +
        '<button class="ltab-sel" aria-pressed="' + (S.ledgerTab === 'chat') + '" onclick="setLedgerTab(\'chat\')">' +
          'Chat <span class="ltab-count">' + S.messages.length + '</span>' +
        '</button>' +
        '<button class="ltab-sel" aria-pressed="' + (S.ledgerTab === 'roster') + '" onclick="setLedgerTab(\'roster\')">' +
          "Who's on what <span class=\"ltab-count\">" + agents.length + '</span>' +
        '</button>' +
        '<button class="ledger-close-btn" onclick="closeLedger()">' + SVG.chevdn + ' Close</button>' +
      '</div>' +
      (S.ledgerTab === 'chat' ? chatHTML : rosterHTML) +
    '</div>');

  if (S.messages.length) S.seenT = Math.max.apply(null, S.messages.map(function(m) { return m.time || m.t || 0; }));
}

function modalHeader(title, sub) {
  return '<div class="modal-hdr" data-key="hdr">' +
    '<div><h2 class="modal-title">' + title + '</h2><div class="modal-sub">' + sub + '</div></div>' +
    '<button class="modal-close" onclick="closeModals()" title="Close" aria-label="Close">' + SVG.x + '</button>' +
  '</div>';
}

export function renderQuestLog() {
  const panel = el('quest-panel');
  if (!panel) return;
  if (!S.questsOpen) { setShown(panel, false); return; }
  setShown(panel, true);
  panel.className = 'bp modal-panel quest-panel-el';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Quest Board');

  const agents = sortedAgents();
  const activeCount = agents.filter(function(a) { return a.status !== 'sleeping' && a.status !== 'done'; }).length;
  // morph() never touches a <textarea>'s text, so this only seeds a new one.
  const draft = panel.querySelector('#quest-note-input');
  const draftText = draft ? draft.value : '';
  const updates = agents.filter(function(a) { return a.status !== 'sleeping'; }).map(function(a) {
    const id = esc(a.id);
    const detail = a.status === 'needs_you'
      ? openLabel(a)
      : (a.activity || a.detail || agentSummary(a) || 'Standing by');
    return '<article class="board-update' + (a.status === 'needs_you' ? ' is-needs' : '') + '" data-key="' + id + '">' +
      '<div class="board-update-hdr">' + av(a, 24) + '<b>' + displayName(a.name) + '</b>' + providerBadge(a.agent_type) + statusTag(a.status) + '</div>' +
      '<div class="board-update-text">' + esc(detail) + '</div>' +
      (a.status === 'needs_you'
        ? '<div class="btn-row" data-key="actions">' +
            '<button class="btn-primary" onclick="resolveAgent(\'' + id + '\',true)">Approve</button>' +
            '<button class="btn-secondary" onclick="resolveAgent(\'' + id + '\',false)">Deny</button>' +
            '<button class="btn-ghost" data-opens-sheet onclick="closeModals();jumpTo(\'' + id + '\')">' + SVG.find + ' Find on tree</button>' +
          '</div>'
        : (a.since ? '<div class="board-update-meta" data-key="meta">Since ' + ago(a.since) + '</div>' : '')) +
    '</article>';
  }).join('') || emptyState('No agent updates yet', 'They’ll show up here as agents start working.');
  const notes = S.boardNotes.slice().reverse().map(function(n) {
    const when = new Date((n.received || Date.now() / 1000) * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return '<article class="board-note" data-key="' + esc(String(n.received) + '|' + n.text) + '">' +
      '<div class="board-note-meta"><b>' + esc(n.author || 'you') + '</b><time>' + esc(when) + '</time></div>' +
      '<div>' + esc(n.text) + '</div>' +
    '</article>';
  }).join('') || emptyState('No notes yet', 'Leave a task, question or reminder for your agents. Notes stay on the board.');

  morph(panel,
    BP +
    modalHeader('Quest Board', 'Live agent updates and notes for the team') +
    '<div class="quest-body" data-key="body">' +
      '<section class="quest-col board-updates"><div class="lbl quest-col-lbl">Agent updates <span>' + activeCount + ' active</span></div>' + updates + '</section>' +
      '<section class="quest-col board-your-notes"><div class="lbl quest-col-lbl">Your quests and notes</div>' +
        '<form class="board-compose" onsubmit="postBoardNote(event)">' +
          '<label for="quest-note-input">Leave a task, question, or note</label>' +
          '<textarea id="quest-note-input" maxlength="500" rows="3" placeholder="What should the agents know?">' + esc(draftText) + '</textarea>' +
          (S.boardError ? '<div class="board-error" data-key="error" role="alert">' + esc(S.boardError) + '</div>' : '') +
          '<button class="btn-primary" type="submit">Post to board</button>' +
        '</form>' +
        '<div class="board-notes">' + notes + '</div>' +
      '</section>' +
    '</div>');
}

// "YYYY-MM-DD" for a local calendar day, the same format the server uses.
function localDay(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function renderBank() {
  const panel = el('bank-panel');
  if (!panel) return;
  if (!S.bankOpen) { setShown(panel, false); return; }
  setShown(panel, true);
  panel.className = 'bp modal-panel bank-panel-el';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Bank');

  const agents = sortedAgents();
  const totalCost = agents.reduce(function(s, a) { return s + (a.cost_usd || 0); }, 0);
  const totalToks = agents.reduce(function(s, a) { return s + tokTotal(a); }, 0);
  const totalTools = agents.reduce(function(s, a) { return s + Object.values(a.tool_counts || {}).reduce(function(x, v) { return x + v; }, 0); }, 0);
  const isCost = S.measure === 'cost';

  // Always show 14 days ending today, so the axis has no gaps and today is
  // the last bar even on days with no use.
  const byDay = {};
  for (const d of S.bankHistory) byDay[d.day] = d;
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const key = localDay(d);
    days.push(byDay[key] || { day: key, cost: 0, tokens: 0 });
  }
  const val = function(d) { return isCost ? (d.cost || 0) : (d.tokens || 0); };
  const fmt = function(v) { return isCost ? fmtUsd(v) : fmtTok(v); };
  const maxVal = Math.max.apply(null, days.map(val).concat([0]));

  // dayStr is the server's local calendar day, "YYYY-MM-DD". Reading it with
  // new Date() would treat it as UTC midnight and show the day before.
  function dateLabel(dayStr) {
    const parts = String(dayStr).split('-');
    return Number(parts[1]) + '/' + Number(parts[2]);
  }

  const histChart = S.bankHistory.length > 0
    ? '<div class="bank-chart" data-key="chart">' +
        '<div class="bank-chart-hdr">' +
          '<div class="lbl">14-day history</div>' +
          '<span class="bank-chart-max">Peak ' + fmt(maxVal) + '</span>' +
          seg([['Cost', 'setMeasure(\'cost\')', isCost], ['Tokens', 'setMeasure(\'tokens\')', !isCost]]) +
        '</div>' +
        '<div class="bank-chart-bars">' +
          days.map(function(d) {
            const v = val(d);
            const pct = maxVal > 0 ? Math.round((v / maxVal) * 100) : 0;
            return '<div class="bank-bar" title="' + dateLabel(d.day) + ' · ' + fmt(v) + '">' +
              '<div class="bank-bar-fill' + (v > 0 ? '' : ' is-zero') + '" style="height:' + pct + '%"></div></div>';
          }).join('') +
        '</div>' +
        '<div class="bank-chart-labels">' +
          days.map(function(d) { return '<div>' + dateLabel(d.day) + '</div>'; }).join('') +
        '</div>' +
      '</div>'
    : emptyState('No history yet', 'Daily totals build up here as your agents use tokens. Come back tomorrow for a trend.');

  morph(panel,
    BP +
    modalHeader('Bank', 'Today’s usage and spend') +
    '<div class="bank-body" data-key="body">' +
      '<div class="bank-tiles" data-key="tiles">' +
        '<div class="bank-tile"><span>Today’s spend</span><b>' + fmtUsd(totalCost) + '</b></div>' +
        '<div class="bank-tile"><span>Tokens used</span><b>' + fmtTok(totalToks) + '</b></div>' +
        '<div class="bank-tile"><span>Tool calls</span><b>' + totalTools.toLocaleString() + '</b></div>' +
      '</div>' +
      histChart +
      '<div class="bank-table" data-key="table">' +
        '<div class="bank-table-hdr"><span>Agent</span><span class="bank-layer">Layer</span><span class="num">Tokens</span><span class="num">Cost</span></div>' +
        (agents.length === 0
          ? emptyState('No agents today', 'Spend per agent appears here once an agent reports tokens.')
          : agents.map(function(a) {
              return '<button class="bank-row" data-key="' + esc(a.id) + '" data-opens-sheet onclick="selectAgent(\'' + esc(a.id) + '\');closeModals()">' +
                '<div class="bank-agent-cell">' + av(a, 20) + '<span>' + displayName(a.name) + '</span></div>' +
                '<span class="bank-layer">' + esc(layerDisplayName(a.layer) || '') + '</span>' +
                '<span class="num">' + fmtTok(tokTotal(a)) + '</span>' +
                '<span class="num">' + fmtUsd(a.cost_usd) + '</span>' +
              '</button>';
            }).join('')) +
      '</div>' +
    '</div>');
}

export function renderTheme() {
  const stage = el('stage');
  if (!stage) return;
  const isDark = S.darkOverride !== null ? S.darkOverride : S.dark > 0.5;
  stage.setAttribute('data-theme', isDark ? 'dusk' : 'day');
}

export function render() {
  renderLayerLabels();
  renderHUD();
  renderSettingsPop();
  renderHoverCard();
  renderBankTip();
  renderBoardTip();
  renderAgentSheet();
  renderLedger();
  renderQuestLog();
  renderBank();
  renderTheme();
}
