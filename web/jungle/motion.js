// Exit animations. Entrances need no JS: a CSS @keyframes animation runs by
// itself when an element stops being hidden or is inserted. Leaving is the
// hard part, because `hidden` or a node swap removes the element at once.
// leave() adds the .is-leaving class (style.css gives it the exit animation),
// waits for that animation's length, then calls `done` to really hide it.
// Under prefers-reduced-motion, or when no exit animation is set, it does
// nothing and the caller hides the element straight away.

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

function durationMs(style) {
  const durs = style.animationDuration.split(',');
  const delays = style.animationDelay.split(',');
  let max = 0;
  for (let i = 0; i < durs.length; i++) {
    const ms = parseTime(durs[i]) + parseTime(delays[i] || '0s');
    if (ms > max) max = ms;
  }
  return style.animationName === 'none' ? 0 : max;
}

function parseTime(t) {
  t = t.trim();
  return t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000 || 0;
}

// Start the exit animation. Returns true while the element is leaving (the
// caller should leave it alone), false when the caller should remove it now.
export function leave(node, done) {
  if (node._leaving) return true;
  if (node._left || reduce.matches) return false;
  node.classList.add('is-leaving');
  const ms = durationMs(getComputedStyle(node));
  if (!ms) { node.classList.remove('is-leaving'); return false; }
  node._leaving = true;
  node._leaveTimer = setTimeout(function() {
    node._leaving = false;
    node._left = true;
    node.classList.remove('is-leaving');
    done();
  }, ms);
  return true;
}

// Stop a running exit, for when something is shown again while leaving.
export function cancelLeave(node) {
  if (!node) return;
  clearTimeout(node._leaveTimer);
  node._leaving = false;
  node._left = false;
  node.classList.remove('is-leaving');
}

// Show or hide an element with the `hidden` attribute, playing its exit
// animation first when hiding.
export function setShown(node, shown) {
  if (!node) return;
  if (shown) { cancelLeave(node); node.hidden = false; return; }
  if (node.hidden) return;
  if (!leave(node, function() { node.hidden = true; node._left = false; })) node.hidden = true;
}
