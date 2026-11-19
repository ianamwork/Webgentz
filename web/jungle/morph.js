// Update a live element so its contents match an HTML string, touching only
// what changed. A plain innerHTML swap replaces every node, which throws away
// scroll positions, keyboard focus, hover state and running CSS transitions.
//
// Matching rules for each child of an element:
// - A child with a data-key attribute is matched to the old child with the
//   same key, wherever it is, and moved into place. Use keys for list rows
//   (agents, messages, notes) and for optional blocks, so a row added at the
//   top inserts one node instead of rewriting every row below it.
// - A child without a key is matched to the old child in the same position if
//   it has the same tag and no key either; otherwise a new node is inserted.
// - Old children left over are removed.
// Attributes are synced one by one. A <textarea>'s text is never touched, so a
// draft being typed survives updates.

const tpl = document.createElement('template');

export function morph(target, html) {
  tpl.innerHTML = html;
  morphChildren(target, tpl.content);
}

function keyOf(n) {
  return n.nodeType === 1 ? n.getAttribute('data-key') : null;
}

function morphChildren(from, to) {
  const keyed = new Map();
  for (let c = from.firstChild; c; c = c.nextSibling) {
    const k = keyOf(c);
    if (k !== null) keyed.set(k, c);
  }
  let cur = from.firstChild;
  let next = to.firstChild;
  while (next) {
    const after = next.nextSibling;
    const k = keyOf(next);
    let match = null;
    if (k !== null) {
      match = keyed.get(k) || null;
      if (match) keyed.delete(k);
    } else if (cur && keyOf(cur) === null && cur.nodeType === next.nodeType && cur.nodeName === next.nodeName) {
      match = cur;
    }
    if (match) {
      if (match === cur) cur = cur.nextSibling;
      else from.insertBefore(match, cur);
      morphNode(match, next);
    } else {
      from.insertBefore(next, cur);
    }
    next = after;
  }
  while (cur) {
    const n = cur.nextSibling;
    from.removeChild(cur);
    cur = n;
  }
}

function morphNode(from, to) {
  if (from.nodeType !== 1) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  const fromAttrs = from.attributes, toAttrs = to.attributes;
  for (let i = fromAttrs.length - 1; i >= 0; i--) {
    const name = fromAttrs[i].name;
    if (!to.hasAttribute(name)) from.removeAttribute(name);
  }
  for (let i = 0; i < toAttrs.length; i++) {
    const { name, value } = toAttrs[i];
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
  if (from.nodeName === 'TEXTAREA') return;
  morphChildren(from, to);
}
