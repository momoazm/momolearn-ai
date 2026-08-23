(function () {
  'use strict';
  var LS = 'momo.byok.v1';

  function get() {
    try {
      var v = JSON.parse(localStorage.getItem(LS) || 'null');
      if (v && typeof v.provider === 'string' && typeof v.key === 'string' && v.key.length >= 16) return v;
    } catch (e) { /* ignore */ }
    return null;
  }

  function set(provider, key) {
    localStorage.setItem(LS, JSON.stringify({ provider: String(provider), key: String(key).trim(), at: Date.now() }));
  }

  function clear() {
    localStorage.removeItem(LS);
  }

  function headers() {
    var v = get();
    if (!v) return {};
    return { 'x-ai-provider': v.provider, 'x-ai-key': v.key };
  }

  function mask() {
    var v = get();
    if (!v) return '';
    var k = v.key;
    return k.slice(0, 4) + '\u2026' + k.slice(-4);
  }

  window.Byok = { get: get, set: set, clear: clear, headers: headers, mask: mask };
})();
