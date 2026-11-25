// Only inlined into the single-file build (loader pages such as Herb Anywhere). Handles pages that run where storage is blocked or
// thrown away, like an embed on Google Sites:
//  - localStorage blocked: an in-memory store, shared with nested app frames and kept across in-place restarts;
//  - storage blocked or the page's address changes every visit: settings are mirrored to a small page on Herb's own address
//    (/bridge.html) and restored from there on the next visit;
//  - a normal reload would leave the embed blank: window.herbReload() restarts Herb in place instead.
(function () {
  var parentStore = null; try { parentStore = window.parent !== window ? window.parent.__herbLS : null; } catch (e) {}
  var broken = false; try { window.localStorage.getItem('x'); } catch (e) { broken = true; }
  var framed = false; try { framed = window.top !== window; } catch (e) { framed = true; }
  // embedded anywhere (Google Sites and similar), or on an address that isn't a normal web page: storage may vanish and reloads may blank the page
  var odd = framed || !/^https?:$/.test(location.protocol) || location.origin === 'null' || /(^|\.)googleusercontent\.com$/.test(location.hostname);
  var shell = !parentStore && !window.__herbIsApp;

  if (broken) {
    var store = window.__herbLS || parentStore;
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
  }
  if (!shell || (!broken && !odd)) return;

  // ---- settings bridge to Herb's own address ----
  var HOSTS = window.HERB_BRIDGE_HOSTS || ['https://herb.copperbat3.workers.dev', 'https://129-158-194-64.nip.io', 'https://lightspeedspeed.duckdns.org', 'https://leweirdlink.twilightparadox.com'];
  var KEYS = /^herb\.(settings|proxyEngine|bookmarks|iconpos|wisp\.pin|ip\.recents|ip\.darktheme|side\.rail|iptut|tutorial\.done)$/;
  // what the bridge last had: kept on the window, so it survives an in-place restart (the window outlives the page)
  // sent = what the bridge has confirmed it holds (it answers every save with its contents). Kept on the window so it survives an
  // in-place restart. pushed = what we last sent, to avoid resending.
  var fr = null, win = null, timer = null, sent = window.__herbBridgeSent || null, pushed = sent;
  function snap() { var o = {}; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (KEYS.test(k)) o[k] = localStorage.getItem(k); } } catch (e) {} return o; }
  function flush() {
    if (!win || !pushed) return; var cur = snap(), ch = {}, any = false;
    Object.keys(cur).forEach(function (k) { if (cur[k] !== pushed[k]) { ch[k] = cur[k]; any = true; } });
    Object.keys(pushed).forEach(function (k) { if (!(k in cur)) { ch[k] = null; any = true; } });
    if (any) { try { win.postMessage({ herbBridge: 'set', d: ch }, '*'); } catch (e) {} pushed = cur; }
  }
  window.herbFlushSettings = flush;
  function tryHost(i) {
    if (i >= HOSTS.length || !document.body) return;
    fr = document.createElement('iframe'); fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:absolute;width:1px;height:1px;left:-9px;top:-9px;border:0;opacity:0;pointer-events:none';
    fr.src = HOSTS[i] + '/bridge.html';
    var giveUp = setTimeout(function () { fr.remove(); fr = null; tryHost(i + 1); }, 4000);
    fr.addEventListener('load', function () { win = fr && fr.contentWindow; });
    fr._giveUp = giveUp; document.body.appendChild(fr);
  }
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || !d.herbBridge || !fr || e.source !== fr.contentWindow) return;
    win = fr.contentWindow;
    if (d.herbBridge === 'ready') { clearTimeout(fr._giveUp); win.postMessage({ herbBridge: 'get' }, '*'); }
    if (d.herbBridge === 'data') {
      var got = d.d || {}, changed = false;
      // the bridge's copy wins, except for anything changed here since the last sync (e.g. a mode switch made just before a restart)
      var prev = sent;
      Object.keys(got).forEach(function (k) { if (!KEYS.test(k) || got[k] == null) return; try { var mine = localStorage.getItem(k); if (prev && mine !== prev[k]) return; if (mine !== got[k]) { localStorage.setItem(k, got[k]); changed = true; } } catch (er) {} });
      sent = window.__herbBridgeSent = got; pushed = got; flush();
      if (changed) setTimeout(function () { try { window.HerbSettings && HerbSettings.apply(); window.HerbDesktop && HerbDesktop.apply(); } catch (er) {} }, 0);
      if (!timer) timer = setInterval(flush, 1500);
    }
  });
  if (document.body) tryHost(0); else document.addEventListener('DOMContentLoaded', function () { tryHost(0); });
})();

// Restart Herb. A normal reload works on a real web address; inside an embed (Google Sites and similar) it would show a blank page,
// so the loader rebuilds the page in place instead (window.__herbSoftReload, defined by the loader).
window.herbReload = function () {
  try { if (window.herbFlushSettings) window.herbFlushSettings(); } catch (e) {}
  var framed = false; try { framed = window.top !== window; } catch (e) { framed = true; }
  var odd = framed || !/^https?:$/.test(location.protocol) || location.origin === 'null' || /(^|\.)googleusercontent\.com$/.test(location.hostname);
  var broken = false; try { Object.getOwnPropertyDescriptor(window, 'localStorage') && window.__herbLS && (broken = true); } catch (e) {}
  if ((odd || broken) && window.__herbSoftReload) return window.__herbSoftReload();
  location.reload();
};
