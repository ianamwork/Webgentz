// Fixed labels, icons and lookup tables used across the jungle UI.

export const BP = '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>';

export const SVG = {
  clock:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  coin:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="10" x2="16" y2="10"/></svg>',
  gear:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  scroll:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  chevup:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>',
  chevdn:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
  x:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  find:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  palette: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/><circle cx="8" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="9" r="1" fill="currentColor" stroke="none"/></svg>',
};

export const KIND_LABEL = {
  'claude-code': 'Claude Code', 'claude-api': 'Claude API', 'claude-web': 'Claude.ai',
  'codex': 'Codex', 'openai': 'OpenAI', 'grok': 'Grok', 'gemini': 'Gemini',
  'muse': 'Muse', 'instinct': 'Instinct', 'ollama': 'Ollama', 'lm-studio': 'LM Studio',
  'gtm': 'GTM', 'research': 'Research', 'python': 'Python', 'infra': 'Infra',
  'backend': 'Backend', 'frontend': 'Frontend', 'ux': 'UX', 'pm': 'PM',
  'marketing': 'Marketing', 'sales': 'Sales',
};

export const LAYER_LABEL = { canopy: 'Canopy', understory: 'Understory', roots: 'Roots' };

// Provider identity: which AI platform is behind each agent_type
export const PROVIDER_INFO = {
  'claude-code': { label: 'Claude', color: '#8b5cf6' },
  'claude-api':  { label: 'Claude', color: '#8b5cf6' },
  'claude-web':  { label: 'Claude', color: '#8b5cf6' },
  'openai':      { label: 'OpenAI', color: '#10a37f' },
  'codex':       { label: 'OpenAI', color: '#10a37f' },
  'grok':        { label: 'Grok',   color: '#94a3b8' },
  'gemini':      { label: 'Gemini', color: '#4285f4' },
  'muse':        { label: 'Muse',   color: '#1877f2' },
  'instinct':    { label: 'Instinct', color: '#f97316' },
  'ollama':      { label: 'Local',  color: '#22c55e' },
  'lm-studio':   { label: 'Local',  color: '#22c55e' },
};

// Small icons inside status tags, so status never depends on colour alone.
const ICON = (body) => '<svg class="st-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
export const STATUS_ICON = {
  working:   ICON('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  needs_you: ICON('<circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="12.5"/><line x1="12" y1="16.5" x2="12" y2="16.5"/>'),
  stuck:     ICON('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/>'),
  idle:      ICON('<line x1="9" y1="7" x2="9" y2="17"/><line x1="15" y1="7" x2="15" y2="17"/>'),
  sleeping:  ICON('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  done:      ICON('<polyline points="20 6 9 17 4 12"/>'),
};

export const STATUS_ORDER = { needs_you: 0, stuck: 1, working: 2, idle: 3, sleeping: 4, done: 5 };

export const STATUS_LABEL = { working: 'Working', needs_you: 'Needs you', stuck: 'Stuck', idle: 'Idle', sleeping: 'Sleeping', done: 'Done' };

export const TOOL_MAP = {
  Read: ['library', 'researching'], Grep: ['library', 'researching'],
  Edit: ['workshop', 'building'], Write: ['workshop', 'building'], MultiEdit: ['workshop', 'building'],
  Bash: ['forge', 'running commands'], Task: ['barracks', 'taking orders'],
  MCP: ['market', 'trading'], TodoWrite: ['townhall', 'checking off'], TodoRead: ['townhall', 'checking off'],
  WebSearch: ['library', 'researching'], WebFetch: ['library', 'researching'],
};

export const PALETTE = ['#a855f7','#d97757','#3b82f6','#22c55e','#ec4899','#ef4444','#14b8a6','#f59e0b','#84cc16','#64748b'];
