// Small formatting and DOM helpers with no app state.

export const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export function fmtTok(n) {
  if (!n) return '0';
  const sign = n < 0 ? '-' : '', a = Math.abs(n);
  // 999,950 rounds to "1000.0k", so anything that would show as 1000k is M.
  if (a >= 999950) return sign + (a/1e6).toFixed(1) + 'M';
  if (a >= 1e3) return sign + (a/1e3).toFixed(1) + 'k';
  return String(n);
}

export function fmtUsd(v, decimals) {
  if (v == null) return '$0.00';
  return '$' + Number(v).toFixed(decimals != null ? decimals : 2);
}

export function ago(ts) {
  if (!ts) return '';
  const d = Math.max(0, Math.floor((Date.now()/1000) - ts));
  if (d < 60) return d + 's ago';
  if (d < 3600) return Math.floor(d/60) + 'm ago';
  if (d < 86400) return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}

export function dur(start) {
  if (!start) return '';
  const s = Math.max(0, Math.floor((Date.now()/1000) - start));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h) return h + 'h ' + m + 'm';
  if (m) return m + 'm ' + sec + 's';
  return sec + 's';
}

export function clock(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  const ap = hh >= 12 ? 'PM' : 'AM';
  const d = hh % 12 || 12;
  return d + ':' + String(mm).padStart(2,'0') + ' ' + ap;
}

export function tokTotal(a) {
  const t = a.tokens || {};
  return (t.input||0) + (t.output||0) + (t.cache_read||0) + (t.cache_write||0);
}

export function statusStyle(status) {
  const map = { working:'st-working', needs_you:'st-needs_you', stuck:'st-stuck', idle:'st-idle', sleeping:'st-sleeping', done:'st-done' };
  return map[status] || 'st-idle';
}

export function el(id) { return document.getElementById(id); }

export function autoHour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
