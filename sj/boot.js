// Starts Scramjet inside an iframe. window.HerbScramjet.start(iframe, url) -> Promise
(function () {
  var ctl = null, frames = new WeakMap(), initP = null, curWisp = null;
  function load(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('could not load ' + src)); }; document.head.appendChild(s); }); }
  function step(n) { window.__sjStep = n; }
  function tmo(p, ms, n) { return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('Scramjet timed out at: ' + n)); }, ms); })]); }
  function init() { if (!initP) initP = init1().catch(function (e) { initP = null; throw e; }); return initP; }
  async function init1() {
    if (ctl) return ctl;
    await load('/sj/scramjet/scramjet.js');
    await load('/sj/controller/controller.api.js');
    var C = window.$scramjetController;
    step('register'); var reg = await tmo(navigator.serviceWorker.register('/sj/sw.js', { scope: '/sj/' }), 15000, 'register');
    step('ready');   // this page is outside /sj/, so serviceWorker.ready never fires; wait for the worker itself
    var sw = reg.active || reg.waiting || reg.installing;
    if (sw.state !== 'activated') await tmo(new Promise(function (ok) { sw.addEventListener('statechange', function () { if (sw.state === 'activated') ok(); }); }), 15000, 'sw activate');
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
    ctl = new C.Controller({
      serviceworker: sw, transport: transport,
      config: { prefix: '/sj/~/', scramjetPath: '/sj/scramjet/scramjet.js', injectPath: '/sj/controller/controller.inject.js', wasmPath: '/sj/scramjet/scramjet.wasm' },
    });
    step('controller'); await tmo(ctl.wait(), 20000, 'controller wait');
    return ctl;
  }
  window.HerbScramjet = {
    warm: function () { return init(); },
    start: async function (iframe, url) { var c = await init(); var f = frames.get(iframe); if (!f) { f = c.createFrame(iframe); frames.set(iframe, f); } f.go(url); return f; },
  };
})();
