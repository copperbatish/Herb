// Herb – registers the Ultraviolet service worker and points BareMux at the
// selected Wisp server through the Epoxy transport.
// Requires (in order): /uv/uv.bundle.js, /uv/uv.config.js, /baremux/index.js, /js/wisp-config.js
(function () {
  var connection = null;

  async function registerSW() {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported in this browser.');
    var reg = await navigator.serviceWorker.register('/uv/sw.js', { scope: __uv$config.prefix });
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
        return t === 'epoxy' ? connection.setTransport('/epoxy/index.mjs', [{ wisp: url }]) : connection.setTransport('/libcurl/index.mjs', [{ websocket: url }]);
      })(),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Timed out configuring transport')); }, 15000); }),
    ]);
    applied = url;
  }

  var ready = null;
  window.HerbProxy = {
    init: function () {
      if (!ready) ready = Promise.all([registerSW(), applyTransport()]);
      return ready;
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
