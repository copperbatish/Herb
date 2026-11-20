// Herb App Store (shell side): optional apps stay off the desktop until installed. The installed list lives in
// Herb settings ("installed"), so it syncs with the account like every other setting.
(function () {
  var CATALOG = [
    { id: 'shows', title: 'Shows', icon: 'shows', src: '/apps/shows.html', w: 1100, h: 720, tag: 'Streaming',
      desc: 'A Netflix-style home for series. Starts with Unstable SMP Season 1, with Continue Watching and resume.' },
  ];
  function installed() { var v = HerbSettings.get('installed'); return Array.isArray(v) ? v : []; }
  function metas() { var m = HerbSettings.get('installedMeta'); return m && typeof m === 'object' ? m : {}; }
  function reconcile() {
    if (!window.HerbDesktop) return; var on = installed(), mm = metas();
    // community apps: ids look like c_<submissionId>; their title is remembered in installedMeta so the desktop doesn't need the network
    on.forEach(function (id) {
      if (id.indexOf('c_') !== 0 || HerbDesktop.apps.some(function (x) { return x.id === id; })) return;
      var m = mm[id] || {}; HerbDesktop.addApp({ id: id, title: m.title || 'App', icon: 'apps', src: '/apps/community.html?id=' + id.slice(2), w: 900, h: 640, store: true });
    });
    HerbDesktop.apps.slice().forEach(function (x) { if (x.id.indexOf('c_') === 0 && on.indexOf(x.id) < 0) HerbDesktop.removeApp(x.id); });
    CATALOG.forEach(function (a) {
      var has = HerbDesktop.apps.some(function (x) { return x.id === a.id; });
      if (on.indexOf(a.id) >= 0 && !has) HerbDesktop.addApp({ id: a.id, title: a.title, icon: a.icon, src: a.src, w: a.w, h: a.h, store: true });
      if (on.indexOf(a.id) < 0 && has) HerbDesktop.removeApp(a.id);
    });
  }
  window.HerbStore = {
    catalog: CATALOG, installed: installed,
    has: function (id) { return installed().indexOf(id) >= 0; },
    install: function (id, meta) {
      if (id.indexOf('c_') === 0 && meta) { var m = Object.assign({}, metas()); m[id] = { title: String(meta.title || 'App').slice(0, 40) }; HerbSettings.set('installedMeta', m); }
      var l = installed().filter(function (x) { return x !== id; }); l.push(id); HerbSettings.set('installed', l); reconcile();
    },
    uninstall: function (id) { HerbSettings.set('installed', installed().filter(function (x) { return x !== id; })); reconcile(); },
  };
  // account sync / other tabs change settings through HerbDesktop.apply or a storage event
  var ap = HerbDesktop.apply; HerbDesktop.apply = function () { var r = ap.apply(this, arguments); reconcile(); return r; };
  addEventListener('storage', function (e) { if (e.key === 'herb.settings') reconcile(); });
  reconcile();
})();
