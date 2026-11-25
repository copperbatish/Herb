// Herb – registers the Ultraviolet service worker and points BareMux at the
// selected Wisp server through the Epoxy transport.
// Requires (in order): /uv/uv.bundle.js, /uv/uv.config.js, /baremux/index.js, /js/wisp-config.js
(function () {
  // Bump this whenever uv/ files change: a new script address makes every browser (iOS home-screen apps especially, which keep an old
  // service worker for a long time) install the new proxy straight away instead of waiting for its own update check.
  var SW_VERSION = '20261124c';
  var connection = null;

  async function registerSW() {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported in this browser.');
    var reg = await navigator.serviceWorker.register('/uv/sw.js?v=' + SW_VERSION, { scope: __uv$config.prefix });
    // NOTE: serviceWorker.ready never resolves here because this page is outside the SW scope,
    // so wait on the registration's own worker instead.
    var w = reg.installing || reg.waiting || reg.active;
    if (w && w.state !== 'activated') {
      await new Promise(function (res) {
        w.addEventListener('statechange', function () { if (w.state === 'activated' || w.state === 'redundant') res(); });
      });
    }
    return reg;
  }

  var applied = null, chain = Promise.resolve();
  // one at a time: a second setTransport while the first is still loading libcurl resets it ("wasm not loaded yet")
  function applyTransport() { chain = chain.then(doApply, doApply); return chain; }
  async function doApply() {
    var url = await HerbWisp.ensure();
    if (url === applied) return;
    if (!connection) connection = new BareMux.BareMuxConnection('/baremux/worker.js');
    await Promise.race([
      (function () {
        // Transport: 'libcurl' (default) or 'epoxy' (fallback). Switch with localStorage 'herb.transport'.
        var t = 'libcurl'; try { t = localStorage.getItem('herb.transport') || 'libcurl'; } catch (e) {}
        // The transports insist the address ends in "/". A server with a password ends in "?password=...", so add a throwaway parameter
        // that ends in a slash; the server ignores it and still reads the password.
        var wu = /\/$/.test(url) ? url : (url.indexOf('?') >= 0 ? url + '&_=/' : url + '/');
        return t === 'epoxy' ? connection.setTransport('/epoxy/index.mjs', [{ wisp: wu }]) : connection.setTransport('/libcurl/index.mjs', [{ websocket: wu }]);
      })(),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Timed out configuring transport')); }, 15000); }),
    ]);
    applied = url;
  }

  // setTransport can return before libcurl's wasm has finished loading, and the first proxied page then fails with "wasm not loaded yet".
  // So load a tiny page through the proxy in a hidden frame and wait until that works, before any app starts its own page.
  function warm() {
    return new Promise(function (resolve) {
      var f = document.createElement('iframe'), tries = 0, done = false;
      f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'; f.setAttribute('aria-hidden', 'true');
      function finish() { if (done) return; done = true; clearTimeout(cap); setTimeout(function () { try { f.remove(); } catch (e) {} }, 50); resolve(); }
      var cap = setTimeout(finish, 25000);   // never block an app for long: it still has its own retry
      function check() {
        var bad = false;
        try { var ta = f.contentDocument && f.contentDocument.querySelector('textarea'); bad = !!(ta && /wasm not loaded yet/.test(ta.value)); } catch (e) {}
        if (!bad || ++tries > 16) return finish();
        setTimeout(function () { try { f.contentWindow.location.reload(); } catch (e) { finish(); } }, 1200);
      }
      f.addEventListener('load', check);
      f.src = __uv$config.prefix + __uv$config.encodeUrl('https://example.com/');
      (document.body || document.documentElement).appendChild(f);
    });
  }

  var SJ_PREFIX = '/sj/~/', sjLoad = null;
  function loadSj() {
    if (!sjLoad) sjLoad = new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = '/sj/boot.js'; sc.onload = ok; sc.onerror = function () { sjLoad = null; no(new Error('Scramjet files missing')); }; document.head.appendChild(sc); });
    return sjLoad;
  }
  var ready = null;
  window.HerbProxy = {
    version: SW_VERSION,
    // Which proxy worker the browser is really running ('' if none). Compare with `version`: a mismatch means an old worker is still active.
    workerVersion: function () {
      return navigator.serviceWorker.getRegistration(__uv$config.prefix).then(function (r) {
        var w = r && (r.active || r.waiting || r.installing), m = w && /[?&]v=([^&]+)/.exec(w.scriptURL); return m ? m[1] : '';
      }, function () { return ''; });
    },
    init: function () {
      if (!ready) {
        ready = Promise.all([registerSW(), applyTransport()]).then(function (r) { return warm().then(function () { return r; }); });
        // Scramjet is the default engine: get its worker, wasm and server connection ready in the background so the first page opens faster
        if (HerbProxy.engine() === 'sj') setTimeout(function () { loadSj().then(function () { return window.HerbScramjet.warm(); }).catch(function () {}); }, 300);
      }
      return ready;
    },
    // ---- Engines: Scramjet ('sj', default) or Ultraviolet ('uv'). Settings > Proxy changes it; a failed Scramjet start falls back to Ultraviolet for this session. ----
    engine: function () {
      try { if (sessionStorage.getItem('herb.engine.fallback') === 'uv') return 'uv'; } catch (e) {}
      try { return localStorage.getItem('herb.proxyEngine') === 'uv' ? 'uv' : 'sj'; } catch (e) { return 'sj'; }
    },
    setEngine: function (e) { try { localStorage.setItem('herb.proxyEngine', e === 'uv' ? 'uv' : 'sj'); sessionStorage.removeItem('herb.engine.fallback'); } catch (x) {} },
    // Load a page (a plain https:// URL) into an iframe with whichever engine is active. Resolves with the engine that was used.
    open: function (iframe, url, opts) {
      var force = opts && opts.engine === 'sj';   // force Scramjet: no fallback to Ultraviolet
      var uv = function () { return HerbProxy.init().then(function () { iframe.src = __uv$config.prefix + __uv$config.encodeUrl(url); return 'uv'; }); };
      if ((opts && opts.engine === 'uv') || (!force && HerbProxy.engine() !== 'sj')) return uv();
      return loadSj().then(function () { return window.HerbScramjet.start(iframe, url); }).then(function () { return 'sj'; }, function (e) {
        if (force) throw e;
        try { sessionStorage.setItem('herb.engine.fallback', 'uv'); } catch (x) {}
        console.warn('Scramjet failed, using Ultraviolet:', e && e.message);
        return uv();
      });
    },
    // The real address a proxied iframe is showing (either engine), or null.
    currentUrl: function (frame) {
      var l; try { l = frame.contentWindow.location; } catch (e) { return null; }
      if (l.pathname.indexOf(SJ_PREFIX) === 0) { var m = l.pathname.slice(SJ_PREFIX.length).split('/'); return m.length >= 3 ? decodeURIComponent(m.slice(2).join('/')) : null; }
      if (l.pathname.indexOf(__uv$config.prefix) === 0) return HerbProxy.decode(l.pathname + l.search + l.hash);
      return l.href === 'about:blank' ? '' : l.href;
    },
    // Turn what the user typed into a plain URL (https://… or a search).
    toUrl: function (input) {
      input = (input || '').trim();
      if (!input) return null;
      var url;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) url = input;
      else if (/^[^\s]+\.[^\s]{2,}$/.test(input) && !/\s/.test(input)) url = 'https://' + input;
      else {
        var eng = 'https://duckduckgo.com/?q=';
        try { var k = JSON.parse(localStorage.getItem('herb.settings') || '{}').search; if (window.HerbSettings && HerbSettings.ENGINES[k]) eng = HerbSettings.ENGINES[k][1]; } catch (e) {}
        url = eng + encodeURIComponent(input);
      }
      return url;
    },
    // Turn what the user typed into a proxied URL.
    resolve: function (input) {
      input = (input || '').trim();
      if (!input) return null;
      var url;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) url = input;
      else if (/^[^\s]+\.[^\s]{2,}$/.test(input) && !/\s/.test(input)) url = 'https://' + input;
      else {
        var eng = 'https://duckduckgo.com/?q=';
        try { var k = JSON.parse(localStorage.getItem('herb.settings') || '{}').search; if (window.HerbSettings && HerbSettings.ENGINES[k]) eng = HerbSettings.ENGINES[k][1]; } catch (e) {}
        url = eng + encodeURIComponent(input);
      }
      return __uv$config.prefix + __uv$config.encodeUrl(url);
    },
    decode: function (proxiedPath) {
      var i = proxiedPath.indexOf(__uv$config.prefix);
      if (i < 0) return null;
      return __uv$config.decodeUrl(proxiedPath.slice(i + __uv$config.prefix.length));
    },
  };
  // Re-point the transport whenever a health check finds a different best server (this tab or another).
  function onStatus() { if (ready) applyTransport().catch(console.error); }
  window.addEventListener('herb:wisp-status', onStatus);
  window.addEventListener('storage', function (e) { if (e.key === 'herb.wisp.status') onStatus(); });
})();
