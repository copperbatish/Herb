// Herb runtime config. Two modes:
//  - hosted (normal): everything uses ordinary relative paths and service workers register directly.
//  - single file (herb.html from `npm run build:single`, or any page opened from file://): pages and data come from a
//    server. Apps that need the proxy's service worker can't run from file://, so they are shown in an <iframe> on the server.
// The server address defaults to DEFAULT_SERVER_URL; the gear in the taskbar overrides it (stored in localStorage, no HTML edit).
(function () {
  // DEFAULT_SERVER_URL serves the pages and catalogs (Firebase Hosting). DEFAULT_API_URL is the Oracle VM that runs Herb AI and Wisp.
  // If you override the server with the gear, that one address is used for everything (pages, /api/herb-ai and /wisp/).
  var DEFAULT_SERVER_URL = 'https://cdn.jsdelivr.net/gh/copperbatish/Herb@main';
  var DEFAULT_API_URL = 'https://129-158-194-64.nip.io';
  var KEY = 'herb.serverUrl';
  // GitHub-hosted data: the main repo holds the code bundles, shows.json, games.json and icons; games live in shard repos named in games.json.
  var CDN_BASE = 'https://cdn.jsdelivr.net/gh/copperbatish/Herb@main', RAW_BASE = 'https://raw.githubusercontent.com/copperbatish/Herb/main';
  var CDN_JSON = { '/games/games.json': '/games/games.json', '/apps/shows.json': '/shows.json' }, REPO_OF = {};
  var SW_APPS = ['/apps/browser.html', '/apps/vm.html', '/apps/movies.html', '/apps/cloud.html', '/apps/fox.html'], HKEY = 'herb.hostUrl';
  function rootFix(h) { return h.replace(/(\s(?:src|href|action|poster)=["'])\/(?!\/)/gi, '$1' + server() + '/'); }
  function cdnOn() { return window.HERB_CDN === true || (window.HERB_CDN !== false && single); }
  var single = window.HERB_SINGLE_FILE === true || location.protocol === 'file:' || !!(window.HERB_CONFIG && window.HERB_CONFIG.serverUrl);
  function ready(fn) { if (document.readyState === 'loading') addEventListener('DOMContentLoaded', fn); else fn(); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function clean(u) { u = String(u || '').trim().replace(/\/+$/, ''); return /^https?:\/\/[^\s/]+/i.test(u) ? u : ''; }
  function server() { return clean(window.HERB_CONFIG && window.HERB_CONFIG.serverUrl) || clean(ls(KEY)) || DEFAULT_SERVER_URL; }
  function top() { try { return window.parent && window.parent !== window ? window.parent.HERB_DATA : null; } catch (e) { return null; } }
  // ---- update check (single-file mode): compare this file's build with the version the server publishes ----
  var lastCheck = 0, asked = false;
  function checkVersion() {
    try { if (window.top !== window && window.top.HerbConfig) return window.top.HerbConfig.checkVersion(); } catch (e) {}
    if (!single || /cdn\.jsdelivr\.net/.test(server()) || !window.HERB_BUILD || asked || Date.now() - lastCheck < 600000) return;
    lastCheck = Date.now();
    var c = typeof AbortController === 'function' ? new AbortController() : null, t = c && setTimeout(function () { c.abort(); }, 5000);
    fetch(server() + '/single/version.json?t=' + Date.now(), c ? { signal: c.signal, cache: 'no-store' } : { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) {
      if (v && typeof v.version === 'string' && v.version !== window.HERB_BUILD && !asked) { asked = true; askUpdate(v.version); }
    }).catch(function () {}).then(function () { if (t) clearTimeout(t); });
  }
  function askUpdate(remote) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:14px/1.45 system-ui,sans-serif';
    d.innerHTML = '<div style="width:min(92vw,400px);background:#10201a;color:#e8f3ee;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.6)">' +
      '<div style="font-size:18px;font-weight:700;margin-bottom:8px">Update available</div>' +
      '<div style="color:#a9c4b8;margin-bottom:20px">This copy of Herb is out of date. Download the new herb.html and open it to get the latest apps and fixes.</div>' +
      '<div id="hu-msg" style="color:#fca5a5;font-size:12px;margin-bottom:10px;display:none"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end"><button id="hu-later" style="padding:9px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;cursor:pointer">Later</button>' +
      '<button id="hu-go" style="padding:9px 16px;border-radius:10px;border:0;background:#34d399;color:#04130c;font-weight:700;cursor:pointer">Download update</button></div></div>';
    document.body.appendChild(d);
    d.querySelector('#hu-later').onclick = function () { d.remove(); };
    d.querySelector('#hu-go').onclick = function () {
      var go = d.querySelector('#hu-go'), msg = d.querySelector('#hu-msg'); go.disabled = true; go.textContent = 'Downloading\u2026';
      var url = server() + '/single/herb.html';
      fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'herb.html'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); go.textContent = 'Downloaded'; setTimeout(function () { d.remove(); }, 1200);
      }).catch(function () { msg.style.display = 'block'; msg.textContent = 'Couldn\u2019t download it here. Opening the new version in a tab instead.'; go.disabled = false; go.textContent = 'Download update'; window.open(url, '_blank'); });
    };
  }
  // Apps that need the proxy's service worker are framed from the server. Some browsers (Safari, strict privacy settings) block that
  // for pages embedded on another site, so every such window gets an "open in a new tab" shortcut: in its own tab it always works.
  function openChip(frame, url) {
    try {
      var body = frame.parentNode; if (!body || body.querySelector('.hopen')) return;
      if (getComputedStyle(body).position === 'static') body.style.position = 'relative';
      var a = document.createElement('a'); a.className = 'hopen'; a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Not loading? Open in a new tab \u2197';
      a.style.cssText = 'position:absolute;right:10px;bottom:10px;z-index:6;padding:6px 11px;border-radius:999px;background:rgba(10,20,15,.82);color:#e8f3ee;font:12px system-ui,sans-serif;text-decoration:none;border:1px solid rgba(255,255,255,.22);opacity:.6;transition:opacity .15s';
      a.onmouseenter = function () { a.style.opacity = 1; }; a.onmouseleave = function () { a.style.opacity = .6; };
      body.appendChild(a);
    } catch (e) {}
  }
  var C = window.HerbConfig = {
    checkVersion: checkVersion,
    single: single, DEFAULT_SERVER_URL: DEFAULT_SERVER_URL,
    serverUrl: function () { return server(); },
    setServer: function (u) { var c = clean(u); ls(KEY, c || null); return server(); },
    // hosted: '/api/herb-ai' stays relative; single file: becomes <server>/api/herb-ai
    url: function (path) { return single ? server() + path : path; },
    apiBase: function () { return !single ? '' : (clean(window.HERB_CONFIG && window.HERB_CONFIG.serverUrl) || clean(ls(KEY)) || DEFAULT_API_URL); },
    api: function () { return C.apiBase() + '/api/herb-ai'; },
    // Wisp: hosted uses this page's own host, single file uses the configured server
    wisp: function () { var b = single ? C.apiBase() : location.origin; return b.replace(/^http/, 'ws') + '/wisp/'; },
    // JSON catalogs: the single-file build embeds shows.json; otherwise fetch it (cross-origin works because the server sends CORS headers)
    json: function (path) {
      var d = (window.HERB_DATA || top() || {})[path], urls = [];
      checkVersion();
      if (cdnOn() && CDN_JSON[path]) { var cp = CDN_JSON[path]; urls.push(CDN_BASE + cp, RAW_BASE + cp); }
      urls.push(C.url(path));
      return urls.reduce(function (p, u) {
        return p.catch(function () { return fetch(u, single ? { cache: 'no-store' } : {}).then(function (r) { if (!r.ok) throw 0; return r.json(); }); });
      }, Promise.reject()).then(function (j) { if (path === '/games/games.json' && Array.isArray(j)) j.forEach(function (g) { if (g.repo) REPO_OF[g.file] = g.repo; }); return j; })
        .catch(function (e) { if (single && d) return d; throw e; });
    },
    // Static files that live on GitHub (served by jsDelivr, raw.githubusercontent.com as the backup) instead of the Firebase server.
    // jsDelivr serves .html as text/plain: fetch the page, point its root-relative links at the CDN, open it from a blob: URL.
    htmlFrame: function (frame, url) {
      fetch(url).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (h) {
        frame.src = URL.createObjectURL(new Blob([rootFix(h)], { type: 'text/html' }));
      }).catch(function () { frame.srcdoc = '<body style="margin:0;background:#0b1c15;color:#fca5a5;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh">Couldn\u2019t load this app from GitHub.</body>'; });
    },
    cdn: cdnOn,
    asset: function (path) { return cdnOn() ? CDN_BASE + path : path; },
    // jsDelivr serves .html as text/plain, so a game is downloaded as text and opened from a blob: URL.
    gameFrame: function (frame, file) {
      frame.srcdoc = '<body style="margin:0;background:#0b1c15;color:#cde7dc;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh">Loading game\u2026</body>';
      C.json('/games/games.json').catch(function () {}).then(function () {
        var repo = REPO_OF[file] || 'copperbatish/Herb', enc = encodeURIComponent(file);
        var urls = ['https://cdn.jsdelivr.net/gh/' + repo + '@main/games/' + enc, 'https://raw.githubusercontent.com/' + repo + '/main/games/' + enc, server() + '/games/' + enc];
        return urls.reduce(function (p, u) { return p.catch(function () { return fetch(u).then(function (r) { if (!r.ok) throw 0; return r.text(); }); }); }, Promise.reject());
      }).then(function (html) { frame.removeAttribute('srcdoc'); frame.src = URL.createObjectURL(new Blob([html], { type: 'text/html' })); })
        .catch(function () { frame.srcdoc = '<body style="margin:0;background:#0b1c15;color:#fca5a5;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh">Couldn\u2019t load this game from GitHub.</body>'; });
    },
    // Apps are inlined in the single-file build; anything else (proxy, games, ...) is framed from the server.
    setFrame: function (frame, src) {
      var gm = cdnOn() && src.match(/^\/games\/([^\/?]+\.html)$/);
      if (gm) { C.gameFrame(frame, decodeURIComponent(gm[1])); return; }
      if (!single) { frame.src = src; return; }
      var path = src.split('?')[0], qs = src.indexOf('?') >= 0 ? src.slice(src.indexOf('?')) : '', apps = window.HERB_APPS || {};
      if (apps[path]) {
        var pre = (window.HERB_SHIM ? '<script>' + window.HERB_SHIM + '<\/script>' : '') + '<script>window.HERB_QS=' + JSON.stringify(qs) + ';window.HERB_SINGLE_FILE=true;window.HERB_CONFIG={serverUrl:' + JSON.stringify(server()) + '}<\/script>';
        frame.srcdoc = rootFix(apps[path]).replace(/<head[^>]*>/i, function (m) { return m + '<base href="' + server() + '/">' + pre; });
      } else if (SW_APPS.indexOf(path) >= 0) {   // proxy apps need a real origin for their service worker; a CDN can't give them one
        var host = clean(ls(HKEY)) || DEFAULT_API_URL;
        if (host) { frame.src = host + src; openChip(frame, host + src); }
        else frame.srcdoc = '<body style="margin:0;background:#0b1c15;color:#cde7dc;font:15px/1.5 system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px"><div><b>This app needs a proxy host</b><br>It uses a service worker, which GitHub/jsDelivr can\u2019t provide.<br>Click the gear in the taskbar and enter the address of a host that serves Herb.</div></body>';
      } else if (/cdn\.jsdelivr\.net/.test(server())) { C.htmlFrame(frame, server() + path + qs); }
      else { frame.src = server() + src; checkVersion(); openChip(frame, server() + src); }
    },
  };
  if (single && !window.HERB_BASE_DONE) {   // root-relative images/fonts resolve against the server
    window.HERB_BASE_DONE = true;
    try { var bs = document.createElement('base'); bs.href = server() + '/'; (document.head || document.documentElement).insertBefore(bs, (document.head || document.documentElement).firstChild); } catch (e) {}
  }
  if (single && window === window.top && window.HERB_BUILD) ready(function () { setTimeout(checkVersion, 2500); });
  // settings gear (shell only, single-file mode)
  if (single) ready(function () {   // only the shell has #tbtray, so app frames skip this
    var tray = document.getElementById('tbtray'); if (!tray) return;
    var b = document.createElement('button'); b.className = 'tray'; b.id = 'srvgear'; b.title = 'Proxy host for browser/movies/VM';
    b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>';
    b.onclick = function () {
      var v = prompt('Proxy host for the browser, movies, VM and Firefox apps (default: the Wisp VM).\nLeave empty to use the default.', ls(HKEY) || '');
      if (v === null) return;
      if (v.trim() && !clean(v)) { alert('That doesn\u2019t look like a web address. Use something like https://example.com'); return; }
      ls(HKEY, clean(v) || null); location.reload();
    };
    tray.insertBefore(b, tray.firstChild);
  });
})();
