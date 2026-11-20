// Only inlined into the single-file build. If the page runs somewhere that blocks localStorage (e.g. the Copperchat HTML viewer's
// sandbox), give it an in-memory store shared with its nested app frames, and tell the host page about changes so it can keep them.
(function () {
  try { window.localStorage.getItem('x'); return; } catch (e) {}
  var store = null;
  try { store = window.parent !== window ? window.parent.__herbLS : null; } catch (e) {}      // nested app frame: share the shell's store
  if (!store) {
    store = { d: Object.assign({}, window.__herbLSInit || {}), t: 0 };
    store.save = function () { clearTimeout(store.t); store.t = setTimeout(function () { try { window.parent.postMessage({ herbLS: store.d }, '*'); } catch (e) {} }, 400); };
    window.__herbLS = store;
  }
  var s = {
    getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(store.d, k) ? store.d[k] : null; },
    setItem: function (k, v) { store.d[String(k)] = String(v); store.save(); },
    removeItem: function (k) { delete store.d[String(k)]; store.save(); },
    clear: function () { store.d = {}; store.save(); },
    key: function (i) { return Object.keys(store.d)[i] || null; },
  };
  Object.defineProperty(s, 'length', { get: function () { return Object.keys(store.d).length; } });
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return s; } }); } catch (e) {}
})();
