// Everything that talks to server.py: the live stream and the HTTP API.
// web/auth.js (a classic script loaded first) adds the token, if any, to fetch.

function postJSON(path, body) {
  return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

// Bring the agent's app or terminal to the front. Failures are ignored.
export function postOpen(id) {
  postJSON('/api/open', { id: id }).catch(function(){});
}

// POST {id} to an agent action (/api/dismiss, /api/close). Resolves to the
// response body, or to undefined after showing an alert if it failed.
export function agentAction(path, id) {
  return postJSON(path, { id: id })
    .then(function(r) { return r.json().then(function(body) { if (!r.ok) throw new Error(body.error || 'Action failed'); return body; }); })
    .catch(function(err) { window.alert(err.message || 'Could not complete the action'); });
}

// Record an approve / deny answer as a Quest Board note. Failures are ignored.
// The name is only used when the server does not know the agent (demo mode).
export function postApproval(id, ok, name) {
  postJSON('/api/note', { agent_id: id, approved: ok, agent_name: name }).catch(function(){});
}

// Post a note to the quest board. Resolves to the response body; rejects on failure.
export function postNote(text) {
  return postJSON('/api/note', { text: text, author: 'you' }).then(function(response){
    if (!response.ok) throw new Error('Could not post. Please try again.');
    return response.json();
  });
}

// Resolve to the parsed JSON, or null when the server answers with an error.
function getJSON(path) {
  return fetch(path).then(function(r){ return r.ok ? r.json() : null; });
}

export function fetchNotes() { return getJSON('/api/notes?limit=100'); }
export function fetchDaily(days) { return getJSON('/api/daily?days=' + days); }

// Follow the live stream, reconnecting 3 seconds after any error.
export function openStream(onMessage, reconnect) {
  const es = new EventSource(typeof webgentzStreamUrl === 'function' ? webgentzStreamUrl() : '/stream');
  window.__es = es;
  es.onmessage = function(e) {
    try { onMessage(JSON.parse(e.data)); } catch(ex) {}
  };
  es.onerror = function() {
    es.close();
    window.__es = null;
    setTimeout(reconnect, 3000);
  };
}
