// Starts Scramjet inside an iframe. window.HerbScramjet.start(iframe, url) -> Promise
(function () {
  var ctl = null, frames = new WeakMap(), initP = null, curWisp = null;
  function load(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('could not load ' + src)); }; document.head.appendChild(s); }); }
  function step(n) { window.__sjStep = n; }
  function tmo(p, ms, n) { return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('Scramjet timed out at: ' + n)); }, ms); })]); }
  // Always talk to the newest worker: during an update the old one is replaced and stops answering.
  async function getWorker(fresh) {
    if (fresh) { try { var old = await navigator.serviceWorker.getRegistration('/sj/'); if (old) await old.unregister(); } catch (e) {} }
    var v = (window.HerbProxy && HerbProxy.version) || '1';
    step('register'); var reg = await tmo(navigator.serviceWorker.register('/sj/sw.js?v=' + v, { scope: '/sj/' }), 15000, 'register');
    try { await reg.update(); } catch (e) {}
    var w = reg.installing || reg.waiting || reg.active;
    step('ready');   // this page is outside /sj/, so serviceWorker.ready never fires; wait for the worker itself
    if (w.state !== 'activated') await tmo(new Promise(function (ok) { var t = setInterval(function () { if (reg.active && reg.active.state === 'activated' && !reg.installing && !reg.waiting) { clearInterval(t); ok(); } }, 100); }), 15000, 'sw activate');
    return reg.active || w;
  }
  function init() { if (!initP) initP = init1().catch(function (e) { initP = null; throw e; }); return initP; }
  async function init1() {
    if (ctl) return ctl;
    await load('/sj/scramjet/scramjet.js');
    await load('/sj/controller/controller.api.js');
    var C = window.$scramjetController;
    var sw = await getWorker(false);
    var url = await HerbWisp.ensure();
    var wu = /\/$/.test(url) ? url : (url.indexOf('?') >= 0 ? url + '&_=/' : url + '/');
    var mod = await import('/sj/transport/libcurl.mjs');
    var T = mod.default || mod.LibcurlClient;
    var transport = new T({ wisp: wu }); curWisp = url;
    step('transport'); await tmo(transport.init(), 20000, 'transport');
    // follow Herb's server choice: when the health check moves to another server, point Scramjet at it too
    var follow = async function () {
      try {
        var u2 = await HerbWisp.ensure(); if (!ctl || !u2 || u2 === curWisp) return;
        var w2 = /\/$/.test(u2) ? u2 : (u2.indexOf('?') >= 0 ? u2 + '&_=/' : u2 + '/');
        var t2 = new T({ wisp: w2 }); await t2.init(); ctl.setTransport(t2); curWisp = u2;
      } catch (e) { console.warn('Scramjet: could not switch server', e); }
    };
    window.addEventListener('herb:wisp-status', follow);
    window.addEventListener('storage', function (e) { if (e.key === 'herb.wisp.status') follow(); });
    var CFG = { prefix: '/sj/~/', scramjetPath: '/sj/scramjet/scramjet.js', injectPath: '/sj/controller/controller.inject.js', wasmPath: '/sj/scramjet/scramjet.wasm' };
    for (var attempt = 0; ; attempt++) {
      var c = new C.Controller({ serviceworker: sw, transport: transport, config: CFG });
      step('controller');
      try { await tmo(c.wait(), 12000, 'controller wait'); ctl = c; return ctl; }
      catch (e) {
        if (attempt >= 1) throw e;
        // the worker didn't answer (usually an old copy that was replaced mid-update): start again with a fresh worker
        console.warn('Scramjet: worker did not answer, re-registering');
        sw = await getWorker(true);
      }
    }
  }
  window.HerbScramjet = {
    warm: function () { return init(); },
    start: async function (iframe, url) { var c = await init(); var f = frames.get(iframe); if (!f) { f = c.createFrame(iframe); frames.set(iframe, f); } f.go(url); return f; },
  };
})();
