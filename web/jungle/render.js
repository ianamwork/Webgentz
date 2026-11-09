// Turns state into HTML for every panel: HUD, cards, sheet, ledger, modals.
// Panels are patched with morph() rather than replaced, so scroll, focus and
// hover survive the frequent live updates. Give list rows and optional blocks
// a data-key so they are matched by identity, not position.
import { BP, KIND_LABEL, LAYER_LABEL, PALETTE, STATUS_LABEL, SVG } from './constants.js';
import { ago, clock, dur, el, esc, fmtTok, fmtUsd, statusStyle, tokTotal } from './format.js';
import { S } from './state.js';
import { morph } from './morph.js';
import { cancelLeave, leave, setShown } from './motion.js';
import { activeAgents, agentSummary, av, displayName, layerDisplayName, openLabel, providerBadge, sortedAgents } from './agents.js';

export let rafId = 0;

export function scheduleRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(function() { rafId = 0; render(); });
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
        div.innerHTML = '<input class="ll-rename-input" value="' + esc(name) + '" maxlength="24" ' +
          'onblur="saveLayerName(\'' + layer + '\',this.value)" ' +
          'onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')cancelRenameLayer();" ' +
          'style="pointer-events:auto" />';
        const input = div.querySelector('input');
        if (input) { input.focus(); input.select(); }
      }
    } else {
      div.style.pointerEvents = n > 0 ? 'auto' : 'none';
      const newHTML = n > 0
        ? '<span class="ll-head ll-clickable" title="Click to rename" onclick="startRenameLayer(\'' + layer + '\')" style="pointer-events:auto;cursor:pointer">' + esc(name) + '</span>' +
          '<span class="ll-sub">' + n + ' agent' + (n===1?'':'s') + '</span>'
        : '';
      if (div.dataset.llCache !== newHTML) { div.dataset.llCache = newHTML; div.innerHTML = newHTML; }
    }
  }
}

export function renderHUD() {
  const hud = el('hud');
  if (!hud) return;
  const all = activeAgents();
  const total = all.length;
  const working = all.filter(a => a.status === 'working' || a.status === 'needs_you' || a.status === 'stuck').length;
  const needsYou = all.filter(a => a.status === 'needs_you').length;
  const todayCost = all.reduce((s, a) => s + (a.cost_usd || 0), 0);
  const hudStyle = 'color:#fff;background:transparent;border-color:rgba(255,255,255,0.3)';

  morph(hud,
    '<div class="hud-logo">WEBGENTZ</div>' +
    '<div class="hud-right">' +
      '<div class="hud-counts bp" style="pointer-events:none">' + BP +
        '<span class="hud-n">' + total + '</span>' +
        '<span>agents</span>' +
        '<div class="hud-sep"></div>' +
        '<span class="hud-n">' + working + '</span>' +
        '<span>working</span>' +
      '</div>' +
      '<button class="btn-bp" id="btn-settings" aria-expanded="' + S.settingsOpen + '" onclick="toggleSettings()" style="' + hudStyle + ';gap:6px;padding:0 12px">' +
        SVG.gear +
        '<span id="hud-clock" style="font:600 13px/1 var(--font-heading);letter-spacing:0.04em">' + clock(S.hour) + '</span>' +
      '</button>' +
      '<button class="btn-quest btn-bp" id="btn-quest" style="' + hudStyle + '" onclick="openQuests()">' +
        SVG.scroll +
        '<span>Quest Board</span>' +
        (needsYou > 0 ? '<span class="need-badge">' + needsYou + ' need you</span>' : '') +
      '</button>' +
    '</div>');
}

export function renderSettingsPop() {
  const pop = el('time-pop');
  if (!pop) return;
  if (!S.settingsOpen) { setShown(pop, false); return; }
  setShown(pop, true);
  pop.className = 'bp';
  pop.style.cssText = 'top:68px;right:16px;width:240px;padding:14px;display:flex;flex-direction:column;gap:14px;z-index:20;';

  const isDark = S.darkOverride !== null ? S.darkOverride : S.dark > 0.5;
  const isNight = S.hour >= 18 || S.hour < 6;
  const agents = activeAgents();
  const todayCost = agents.reduce(function(s,a){ return s + (a.cost_usd||0); }, 0);

  function seg(active) {
    return 'flex:1;padding:7px 0;font:600 12px/1 var(--font-heading);border:1px solid var(--p-line);cursor:pointer;' +
      (active ? 'background:var(--p-soft);color:var(--p-fg)' : 'background:transparent;color:var(--p-mute)');
  }

  morph(pop,
    BP +
    '<div style="display:flex;align-items:center;justify-content:space-between">' +
      '<span style="font:600 11px/1 var(--font-heading);letter-spacing:0.1em;text-transform:uppercase;color:var(--p-mute)">Bank</span>' +
      '<span style="font:600 15px/1 var(--font-heading)">' + fmtUsd(todayCost) + '</span>' +
    '</div>' +
    '<button onclick="openBank()" style="width:100%;padding:7px 0;font:600 12px/1 var(--font-heading);border:1px solid var(--p-line);background:transparent;color:var(--p-mute);cursor:pointer">View details</button>' +
    '<div style="height:1px;background:var(--p-line);margin:0 -2px"></div>' +
    '<span style="font:600 11px/1 var(--font-heading);letter-spacing:0.1em;text-transform:uppercase;color:var(--p-mute)">Appearance</span>' +
    '<div style="display:flex;gap:6px">' +
      '<button onclick="setDarkOverride(false)" style="' + seg(!isDark) + '">Light</button>' +
      '<button onclick="setDarkOverride(true)"  style="' + seg(isDark)  + '">Dark</button>' +
    '</div>' +
    '<div style="height:1px;background:var(--p-line);margin:0 -2px"></div>' +
    '<span style="font:600 11px/1 var(--font-heading);letter-spacing:0.1em;text-transform:uppercase;color:var(--p-mute)">Time of Day</span>' +
    '<div style="display:flex;gap:6px">' +
      '<button onclick="setTimeOfDay(false)" style="' + seg(!isNight) + '">Day</button>' +
      '<button onclick="setTimeOfDay(true)"  style="' + seg(isNight)  + '">Night</button>' +
    '</div>');
}

export function renderHoverCard() {
  const card = el('hover-card');
  if (!card) return;
  if (!S.hover || !S.hoverPos) { setShown(card, false); return; }
  const a = S.hover;
  const pos = S.hoverPos;
  setShown(card, true);
  card.className = 'bp';
  card.style.cssText = 'left:' + pos.x + 'px;top:' + pos.y + 'px;width:260px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;pointer-events:none;z-index:30;transform:translateY(-100%) translateX(-50%);';
  const toks = tokTotal(a);
  morph(card,
    BP +
    '<div class="hc-header">' +
      av(a, 36) +
      '<div style="min-width:0;flex:1">' +
        '<div class="hc-name">' + displayName(a.name) + '</div>' +
        '<div class="hc-sub">' + esc(KIND_LABEL[a.agent_type] || a.agent_type || '') + ' · ' + esc(layerDisplayName(a.layer) || '') + '</div>' +
      '</div>' +
      '<span class="status-tag ' + statusStyle(a.status) + '">' + esc(STATUS_LABEL[a.status] || a.status) + '</span>' +
    '</div>' +
    (providerBadge(a.agent_type) ? '<div>' + providerBadge(a.agent_type) + '</div>' : '') +
    (a.detail ? '<div style="font-size:13px">' + esc(a.detail) + '</div>' : '') +
    '<div style="display:flex;gap:16px;font-size:12px;color:var(--p-mute)">' +
      (toks ? '<span>' + fmtTok(toks) + ' tok</span>' : '') +
      (a.cost_usd ? '<span>' + fmtUsd(a.cost_usd) + '</span>' : '') +
      (a.started ? '<span>' + dur(a.started) + ' active</span>' : '') +
    '</div>');
}

export function renderBankTip() {
  const tip = el('bank-tip');
  if (!tip) return;
  if (!S.bankHover) { setShown(tip, false); return; }
  setShown(tip, true);
  tip.className = 'bp';
  const cost = [...S.agents.values()].reduce((s, a) => s + (a.cost_usd || 0), 0);
  tip.style.cssText = 'bottom:64px;left:50%;transform:translateX(-50%);padding:8px 12px;z-index:30;white-space:nowrap;pointer-events:none;';
  morph(tip, BP + '<span>Bank · today ' + fmtUsd(cost) + '</span>');
}

export function renderBoardTip() {
  const tip = el('board-tip');
  if (!tip) return;
  if (!S.boardHover) { setShown(tip, false); return; }
  setShown(tip, true);
  tip.className = 'bp';
  const n = [...S.agents.values()].filter(a => a.status === 'needs_you').length;
  tip.style.cssText = 'bottom:64px;left:50%;transform:translateX(-50%);padding:8px 12px;z-index:30;white-space:nowrap;pointer-events:none;';
  morph(tip, BP + '<span>Quest board' + (n > 0 ? ' · ' + n + ' need you' : '') + '</span>');
}

export function renderAgentSheet() {
  const sheet = el('agent-sheet');
  if (!sheet) return;
  if (!S.selectedId) { setShown(sheet, false); return; }
  const a = S.agents.get(S.selectedId);
  if (!a) { setShown(sheet, false); return; }
  setShown(sheet, true);
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
      '<div class="sheet-needs-box" data-key="needs">' +
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
      '<div data-key="answer">' +
        '<div class="sheet-lbl" style="margin-bottom:8px">Answer</div>' +
        '<div style="font-size:14px;line-height:1.5;background:var(--p-soft);padding:10px;border:1px solid var(--p-line)">' + esc(a.answer) + '</div>' +
      '</div>';
  }

  let toolsSection = '';
  if (toolEntries.length) {
    toolsSection =
      '<div class="acc-row" data-key="tools">' +
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
      '<div class="acc-row" data-key="recent">' +
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
    (a.cwd ? '<div class="acc-kv"><span>Project folder</span><span title="' + esc(a.cwd) + '">' + esc(a.cwd.split('/').filter(Boolean).pop() || a.cwd) + '</span></div>' : '') +
    (a.open && a.open.app ? '<div class="acc-kv"><span>Running in</span><span>' + esc(a.open.app) + (a.open.tty ? ' · ' + esc(a.open.tty.replace(/^\/dev\//, '')) : '') + '</span></div>' : '') +
    (a.helper_type ? '<div class="acc-kv"><span>Claude helper</span><span>' + esc(a.helper_type) + '</span></div>' : '') +
    '<div class="acc-kv"><span>Session</span><span title="' + esc(a.id) + '">' + esc(a.id.slice(0, 12)) + '</span></div>' +
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
  const terminalSession = a.open && (a.open.app === 'Terminal' || a.open.app === 'iTerm2') && a.open.tty;
  const lifecycleActions = a.status !== 'gone' ?
    '<div class="sheet-actions" data-key="actions">' +
      '<button class="btn-secondary" onclick="dismissAgent(\'' + esc(a.id) + '\')">Send away</button>' +
      (terminalSession ? '<button class="btn-secondary" onclick="closeAgentTerminal(\'' + esc(a.id) + '\')">Close terminal</button>' : '') +
    '</div>' : '';

  morph(sheet,
    BP +
    '<div class="sheet-head">' +
      '<button style="all:unset;cursor:pointer;display:contents" onclick="openAgentApp(\'' + esc(a.id) + '\')" title="Switch to this agent\'s app">' +
        av(a, 48) +
        '<div style="flex:1;min-width:0">' +
          '<div class="sheet-name">' + displayName(a.name) + '</div>' +
          '<div class="sheet-sub" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            esc(KIND_LABEL[a.agent_type] || a.agent_type || '') + ' · ' + esc(layerDisplayName(a.layer) || '') +
            providerBadge(a.agent_type) +
          '</div>' +
          '<span class="status-tag ' + statusStyle(a.status) + '" style="margin-top:6px;display:inline-block">' + esc(STATUS_LABEL[a.status] || a.status) + '</span>' +
        '</div>' +
      '</button>' +
      '<button class="sheet-icon-btn' + (customPanelOpen ? ' active' : '') + '" onclick="toggleCustomPanel(\'' + esc(a.id) + '\')" title="Customize sprite">' + SVG.palette + '</button>' +
      '<button class="sheet-close-btn" onclick="closeSheet()">' + SVG.x + '</button>' +
    '</div>' +
    (customPanelOpen ? '<div class="color-picker-row" data-key="colors">' + resetSwatch + swatches + '</div>' : '') +
    '<div class="sheet-body" data-key="body-' + esc(a.id) + '">' +
      (a.detail ? '<div style="font-size:14px" data-key="detail">' + esc(a.detail) + '</div>' : '') +
      lifecycleActions +
      needsBox +
      answerBox +
      '<div class="sheet-stat-grid bp" data-key="stats">' + BP +
        '<div class="sheet-stat"><span>Tokens</span><b>' + fmtTok(toks) + '</b></div>' +
        '<div class="sheet-stat"><span>Cost</span><b>' + fmtUsd(a.cost_usd) + '</b></div>' +
        '<div class="sheet-stat"><span>Active</span><b>' + (dur(a.started) || '—') + '</b></div>' +
      '</div>' +
      '<div class="acc-section" data-key="sections">' +
        toolsSection +
        recentSection +
        '<div class="acc-row" data-key="details">' +
          '<button class="acc-btn" onclick="toggleSect(\'details\')">' +
            '<span>Details</span>' + SVG[S.sectOpen.details ? 'chevup' : 'chevdn'] +
          '</button>' +
          sectBody('details', detailsBody) +
        '</div>' +
      '</div>' +
    '</div>');
}

export function renderLedger() {
  const wrap = el('ledger-wrap');
  if (!wrap) return;
  if (!S.ledgerOpen) {
    // Let the open drawer play its exit before the pull tab replaces it.
    const drawer = wrap.querySelector('.ledger-drawer');
    if (drawer && leave(drawer, renderLedger)) return;
    const msgs = S.messages;
    const unread = msgs.filter(function(m){ return (m.time || m.t || 0) > S.seenT; }).length;
    const last = msgs[msgs.length - 1];
    morph(wrap,
      '<button class="ledger-tab-btn" onclick="openLedger()">' +
        '<span class="ltab-title">Ledger</span>' +
        (unread > 0 ? '<span class="unread-badge" data-key="unread">' + unread + '</span>' : '') +
        '<div class="ltab-sep"></div>' +
        '<span class="ltab-prev">' + (last ? esc(last.text || '') : 'Agent messages + roster') + '</span>' +
        SVG.chevup +
      '</button>');
    return;
  }

  cancelLeave(wrap.querySelector('.ledger-drawer'));
  const agents = sortedAgents();
  const allMessages = S.messages.slice(-200).reverse();
  const filtered = S.ledgerChannel
    ? allMessages.filter(function(m){ return m.agent_id === S.ledgerChannel; })
    : allMessages;

  const chatHTML =
    '<div class="chat-pane" data-key="chat">' +
      '<div class="chat-channels">' +
        '<div class="chat-ch-lbl">Agents</div>' +
        '<button class="chat-ch-btn ' + (!S.ledgerChannel ? 'active' : '') + '" data-key="all" onclick="setChannel(null)">' +
          '<span>All agents</span>' +
          '<span class="chat-ch-n">' + S.messages.length + '</span>' +
        '</button>' +
        agents.map(function(a){
          return '<button class="chat-ch-btn ' + (S.ledgerChannel === a.id ? 'active' : '') + '" data-key="' + esc(a.id) + '" onclick="setChannel(\'' + esc(a.id) + '\')">' +
            '<span style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">' +
              av(a, 16) + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + displayName(a.name) + '</span>' +
            '</span>' +
            '<span class="chat-ch-n">' + S.messages.filter(function(m){ return m.agent_id === a.id; }).length + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="chat-feed" id="chat-feed" data-key="feed-' + esc(S.ledgerChannel || '') + '">' +
        (filtered.length === 0
          ? '<div style="color:var(--p-mute);font-size:13px;padding:16px">No messages yet</div>'
          : filtered.map(function(m){
              const a = S.agents.get(m.agent_id);
              return '<div class="chat-msg" data-key="' + esc(m.agent_id + '|' + (m.time || m.t || 0)) + '">' +
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
    '<div class="roster-pane" data-key="roster">' +
      '<div class="roster-hdr-row"><span>Agent</span><span>Working on</span><span>Progress</span><span>Status</span></div>' +
      agents.map(function(a){
        const toks = tokTotal(a);
        const pct = Math.round((toks / maxToks) * 100);
        return '<button class="roster-row" data-key="' + esc(a.id) + '" data-opens-sheet onclick="jumpTo(\'' + esc(a.id) + '\')">' +
          '<div class="roster-agent-cell">' +
            av(a, 28) +
            '<div class="roster-agent-info">' +
              '<div class="roster-agent-name">' + displayName(a.name) + (providerBadge(a.agent_type) ? ' ' + providerBadge(a.agent_type) : '') + '</div>' +
              '<div class="roster-agent-sub">' + esc(a.open && a.open.app ? a.open.app + (a.open.tty ? ' · ' + a.open.tty.replace(/^\/dev\//, '') : '') : (a.cwd ? a.cwd.split('/').filter(Boolean).pop() : (KIND_LABEL[a.agent_type] || a.agent_type || ''))) + (a.helper_type ? ' · helper: ' + esc(a.helper_type) : '') + '</div>' +
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

  morph(wrap,
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
    '</div>');

  if (S.messages.length) S.seenT = Math.max.apply(null, S.messages.map(function(m){ return m.time||m.t||0; }));
}

export function renderQuestLog() {
  const panel = el('quest-panel');
  if (!panel) return;
  if (!S.questsOpen) { setShown(panel, false); return; }
  setShown(panel, true);
  panel.className = 'bp modal-panel quest-panel-el';

  const agents = sortedAgents();
  const activeCount = agents.filter(function(a){ return a.status !== 'sleeping' && a.status !== 'done'; }).length;
  // morph() never touches a <textarea>'s text, so this only seeds a new one.
  const draft = panel.querySelector('#quest-note-input');
  const draftText = draft ? draft.value : '';
  const updates = agents.filter(function(a){ return a.status !== 'sleeping'; }).map(function(a){
    const detail = a.activity || a.detail || agentSummary(a) || STATUS_LABEL[a.status] || 'Standing by';
    return '<article class="board-update" data-key="' + esc(a.id) + '">' +
      '<div class="board-update-hdr">' + av(a, 24) + '<b>' + displayName(a.name) + '</b>' + providerBadge(a.agent_type) + '<span class="status-tag ' + statusStyle(a.status) + '">' + esc(STATUS_LABEL[a.status] || a.status) + '</span></div>' +
      '<div>' + esc(detail) + '</div>' +
      '<div class="board-update-meta">Live from agent activity</div>' +
    '</article>';
  }).join('') || '<div class="board-empty">No agent updates yet. They’ll show up here as agents start working.</div>';
  const notes = S.boardNotes.slice().reverse().map(function(n){
    return '<article class="board-note" data-key="' + esc(String(n.received) + '|' + n.text) + '"><div class="board-note-meta"><b>' + esc(n.author || 'you') + '</b><time>' + esc(new Date((n.received || Date.now() / 1000) * 1000).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})) + '</time></div><div>' + esc(n.text) + '</div></article>';
  }).join('') || '<div class="board-empty">Add a note or quest for your agents here.</div>';

  morph(panel,
    BP +
    '<div class="modal-hdr">' +
      '<div>' +
        '<div class="modal-title">Quest Board</div>' +
        '<div class="modal-sub">Live agent updates and notes for the team</div>' +
      '</div>' +
      '<button class="modal-close" onclick="closeModals()">' + SVG.x + '</button>' +
    '</div>' +
    '<div class="quest-body">' +
      '<section class="quest-col board-updates"><div class="quest-col-lbl">Agent updates <span>' + activeCount + ' active</span></div>' + updates + '</section>' +
      '<section class="quest-col board-your-notes"><div class="quest-col-lbl">Your quests and notes</div>' +
        '<form class="board-compose" onsubmit="postBoardNote(event)"><label for="quest-note-input">Leave a task, question, or note</label><textarea id="quest-note-input" maxlength="500" rows="3" placeholder="What should the agents know?">' + esc(draftText) + '</textarea>' +
          (S.boardError ? '<div class="board-error" data-key="error" role="alert">' + esc(S.boardError) + '</div>' : '') +
          '<button class="btn-primary" type="submit">Post to board</button></form>' +
        '<div class="board-notes">' + notes + '</div>' +
      '</section>' +
    '</div>');
}

export function renderBank() {
  const panel = el('bank-panel');
  if (!panel) return;
  if (!S.bankOpen) { setShown(panel, false); return; }
  setShown(panel, true);
  panel.className = 'bp modal-panel bank-panel-el';

  const agents = sortedAgents();
  const totalCost = agents.reduce(function(s,a){ return s + (a.cost_usd||0); }, 0);
  const totalToks = agents.reduce(function(s,a){ return s + tokTotal(a); }, 0);
  const totalTools = agents.reduce(function(s,a){ return s + Object.values(a.tool_counts||{}).reduce(function(x,v){ return x+v; }, 0); }, 0);

  const hist = S.bankHistory;
  const maxVal = Math.max.apply(null, hist.map(function(d){ return S.measure === 'cost' ? (d.cost||0) : (d.tokens||0); }).concat([0.001]));

  // dayStr is the server's local calendar day, "YYYY-MM-DD". Reading it with
  // new Date() would treat it as UTC midnight and show the day before.
  function dateLabel(dayStr) {
    const parts = String(dayStr).split('-');
    return Number(parts[1]) + '/' + Number(parts[2]);
  }

  const histChart = hist.length > 0
    ? '<div data-key="chart">' +
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

  morph(panel,
    BP +
    '<div class="modal-hdr">' +
      '<div><div class="modal-title">Bank</div><div class="modal-sub">Today\'s usage and spend</div></div>' +
      '<button class="modal-close" onclick="closeModals()">' + SVG.x + '</button>' +
    '</div>' +
    '<div class="bank-body">' +
      '<div class="bank-tiles bp" data-key="tiles">' + BP +
        '<div class="bank-tile"><span>Today\'s spend</span><b>' + fmtUsd(totalCost) + '</b></div>' +
        '<div class="bank-tile"><span>Tokens used</span><b>' + fmtTok(totalToks) + '</b></div>' +
        '<div class="bank-tile"><span>Tool calls</span><b>' + totalTools + '</b></div>' +
      '</div>' +
      histChart +
      '<div data-key="table">' +
        '<div class="bank-table-hdr"><span>Agent</span><span>Layer</span><span class="num">Tokens</span><span class="num">Cost</span></div>' +
        agents.map(function(a){
          return '<button class="bank-row" data-key="' + esc(a.id) + '" data-opens-sheet onclick="selectAgent(\'' + esc(a.id) + '\');closeModals()">' +
            '<div class="bank-agent-cell">' + av(a,20) + '<span>' + displayName(a.name) + '</span></div>' +
            '<span style="color:var(--p-mute);font-size:13px">' + esc(LAYER_LABEL[a.layer] || a.layer || '') + '</span>' +
            '<span class="num">' + fmtTok(tokTotal(a)) + '</span>' +
            '<span class="num">' + fmtUsd(a.cost_usd) + '</span>' +
          '</button>';
        }).join('') +
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
