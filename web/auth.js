// Shared-secret support for servers started with WEBGENTZ_TOKEN.
// Open the page once as /?token=<secret>: the token is kept in this browser,
// removed from the address bar, and sent with every request to this server.
// Without a token nothing changes.
(function () {
  'use strict';
  var KEY = 'webgentz.token';
  var token = null;
  try {
    var params = new URLSearchParams(location.search);
    if (params.has('token')) {
      token = params.get('token') || null;
      if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY);
      params.delete('token');
      var rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    } else {
      token = localStorage.getItem(KEY);
    }
  } catch (e) {}

  // Add the Authorization header to requests that go to this same server.
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (!token) return nativeFetch(input, init);
    var url = typeof input === 'string' ? input : input.url;
    if (new URL(url, location.href).origin !== location.origin) return nativeFetch(input, init);
    init = Object.assign({}, init);
    var headers = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
    headers.set('Authorization', 'Bearer ' + token);
    init.headers = headers;
    return nativeFetch(input, init);
  };

  // EventSource cannot send headers, so the stream carries the token in its URL.
  window.webgentzStreamUrl = function () {
    return token ? '/stream?token=' + encodeURIComponent(token) : '/stream';
  };
})();
