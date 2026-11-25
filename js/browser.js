// Herb web browser app: tabs + iframe viewport + new-tab page on Ultraviolet.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var I = HerbIcons.glyph;
  var tabsEl = $('tabs'), views = $('views'), urlEl = $('url'), ntp = $('ntp'), banner = $('banner');
  var tabs = [], active = null;
  // Herb apps opened as tabs (herb://games, herb://settings…) live one frame deeper; give them the shell's APIs under the same names.
  try { if (parent !== window) ['HerbDesktop', 'HerbStore', 'HerbConfig'].forEach(function (k) { if (!window[k] && parent[k]) window[k] = parent[k]; }); } catch (e) {}
  function appList() { try { return (window.HerbDesktop && HerbDesktop.apps) || []; } catch (e) { return []; } }
  $('newtab').innerHTML = I('close', 16).replace('M6 6l12 12M18 6L6 18', 'M12 5v14M5 12h14');
  $('back').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  $('fwd').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
  $('reload').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/></svg>';
  $('home').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7M6 10v9h12v-9"/></svg>';
  $('lock').innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  $('sico').innerHTML = I('search', 18);

  var TILES = [
    ['YouTube', 'https://www.youtube.com', ['#ff4b4b', '#b91c1c'], 'Y'], ['Reddit', 'https://www.reddit.com', ['#ff7a45', '#e2430f'], 'R'],
    ['Wikipedia', 'https://www.wikipedia.org', ['#94a3b8', '#475569'], 'W'], ['Twitch', 'https://www.twitch.tv', ['#a78bfa', '#6d28d9'], 'T'],
    ['Spotify', 'https://open.spotify.com', ['#34d399', '#15803d'], 'S'], ['GitHub', 'https://github.com', ['#64748b', '#1e293b'], 'G'],
    ['Discord', 'https://discord.com/app', ['#818cf8', '#4338ca'], 'D'], ['Geometry Dash', 'https://web-dashers.github.io/', ['#facc15', '#ea580c'], 'G'],
  ];
  TILES.forEach(function (t) {
    var b = document.createElement('button'); b.className = 'tile'; b.innerHTML = HerbIcons.letter(t[3], 58, t[2]) + t[0];
    b.onclick = function () { go(t[1]); }; $('tiles').appendChild(b);
  });
  $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') go($('q').value); });

  function warn(msg, withBtn) { $('bmsg').textContent = msg; $('bgo').style.display = withBtn ? '' : 'none'; $('bgo').textContent = 'Re-check servers'; banner.classList.add('on'); }
  $('bgo').onclick = function () { $('bgo').textContent = 'Checking…'; HerbWisp.check().then(function (st) { $('bgo').textContent = 'Re-check servers'; if (st.best) banner.classList.remove('on'); else warn('Still no reachable proxy server.', true); }); };

  function tabTitle(t) {
    if (t.app) return t.app.title;
    if (!t.loaded) return 'New Tab';
    try { var d = t.frame.contentDocument; if (d && d.title) return d.title; } catch (e) {}
    return t.last || 'Loading…';
  }
  function currentUrl(t) {
    if (t.app) return 'herb://' + t.app.id.replace(/^game:/, 'game/').replace(/\.html$/, '');
    return HerbProxy.currentUrl(t.frame);
  }
  function render() {
    tabs.forEach(function (t) { t.label.textContent = tabTitle(t); t.el.classList.toggle('active', t === active); t.frame.classList.toggle('on', t === active && t.loaded); });
    ntp.style.display = active && active.loaded ? 'none' : 'block';
    if (active && document.activeElement !== urlEl) { var u = active.loaded ? currentUrl(active) : ''; urlEl.value = u || ''; if (u) active.last = u; }
  }
  function newTab() {
    var t = { loaded: false }; t.el = document.createElement('div'); t.el.className = 'tab';
    t.el.innerHTML = I('leaf', 14, 2) + '<span></span><button class="x" title="Close">' + I('close', 12, 2.4) + '</button>';
    t.label = t.el.querySelector('span'); tabsEl.insertBefore(t.el, $('newtab'));
    t.frame = document.createElement('iframe'); t.frame.setAttribute('allow', 'fullscreen; gamepad; clipboard-read; clipboard-write; autoplay'); t.frame.addEventListener('load', render); views.appendChild(t.frame);
    t.el.onclick = function () { active = t; render(); };
    t.el.querySelector('.x').onclick = function (e) { e.stopPropagation(); close(t); };
    tabs.push(t); active = t; render(); $('q').focus(); return t;
  }
  function close(t) {
    var i = tabs.indexOf(t); tabs.splice(i, 1); t.el.remove(); t.frame.remove();
    if (!tabs.length) { active = null; newTab(); return; } if (active === t) active = tabs[Math.max(0, i - 1)]; render();
  }
  // The transport can report ready a moment before libcurl's wasm has finished loading; the first page then shows that error.
  // It is gone on the next try, so retry quietly (up to 12 times, 1.5 s apart) instead of making the user press reload.
  function retryWasm(frame, n) {
    frame.addEventListener('load', function h() {
      frame.removeEventListener('load', h);
      try {
        var d = frame.contentDocument, ta = d && d.querySelector('textarea'), t = (ta && ta.value) || '';   // UV puts the message in a <textarea> value, which neither innerText nor textContent show
        if (t && /wasm not loaded yet/.test(t) && n < 12) setTimeout(function () { try { frame.contentWindow.location.reload(); } catch (e) {} retryWasm(frame, n + 1); }, 1500);
      } catch (e) {}
    });
  }
  // ---------- Herb apps as tabs: herb://games, herb://settings, herb://game/<name> ----------
  function openApp(app, opts) {
    opts = opts || {}; if (!app) return;
    var t = tabs.filter(function (x) { return x.app && x.app.id === app.id; })[0];
    if (t) { active = t; render(); sendState(); if (opts.section || opts.url) try { t.frame.contentWindow.postMessage({ herb: 'nav', section: opts.section, url: opts.url }, location.origin); } catch (e) {} return t; }
    t = active && !active.loaded && !active.app ? active : newTab();   // reuse an empty new tab
    t.app = app; t.loaded = true;
    var ic = t.el.querySelector('svg'); if (ic) ic.outerHTML = I(app.icon || 'apps', 14, 2);
    var src = app.src; if (opts.section) src += (src.indexOf('?') < 0 ? '?' : '&') + 'section=' + opts.section; if (opts.url) src += (src.indexOf('?') < 0 ? '?' : '&') + 'url=' + encodeURIComponent(opts.url);
    if (window.HerbConfig && HerbConfig.setFrame) HerbConfig.setFrame(t.frame, src); else t.frame.src = src;
    render(); sendState(); return t;
  }
  function goHerb(input) {
    var name = input.replace(/^herb:\/\//i, '').replace(/\/+$/, '').toLowerCase();
    if (!name || name === 'home' || name === 'newtab') { if (!active || active.loaded) newTab(); render(); return; }
    var id = /^game\//.test(name) ? 'game:' + name.slice(5) + '.html' : name;
    var app = appList().filter(function (a) { return a.id.toLowerCase() === id || a.title.toLowerCase() === name; })[0];
    if (app) return openApp(app);
    warn('No Herb page called “' + name + '”. Try ' + appList().map(function (a) { return 'herb://' + a.id; }).filter(function (x) { return x.indexOf('game:') < 0; }).join(', ') + '.', false);
  }
  window.addEventListener('message', function (e) {
    if (!e.data || (e.source !== parent && e.origin !== location.origin)) return;
    if (e.data.herb === 'app' && e.data.app) openApp(e.data.app, e.data.opts);
    if (e.data.herb === 'home') { var h = tabs.filter(function (x) { return !x.loaded; })[0]; if (h) { active = h; render(); } else newTab(); sendState(); }
  });

  // ---------- bookmarks: star in the address bar, list on the new-tab page ----------
  var BK = 'herb.bookmarks';
  function bms() { try { return JSON.parse(localStorage.getItem(BK) || '[]'); } catch (e) { return []; } }
  function saveBms(l) { try { localStorage.setItem(BK, JSON.stringify(l.slice(0, 60))); } catch (e) {} drawBms(); paintStar(); }
  var star = document.createElement('button'); star.id = 'star'; star.className = 'nb'; star.title = 'Bookmark this page'; $('addr').appendChild(star);
  function curInfo() { if (!active || !active.loaded) return null; var u = currentUrl(active) || active.last; return u ? { u: u, t: tabTitle(active) } : null; }
  function paintStar() { var c = curInfo(), on = !!(c && bms().some(function (b) { return b.u === c.u; }));
    star.style.visibility = c ? 'visible' : 'hidden'; star.classList.toggle('on', on); star.title = on ? 'Remove bookmark' : 'Bookmark this page';
    star.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="' + (on ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>'; }
  star.onclick = function () { var c = curInfo(); if (!c) return; var l = bms(), i = -1; l.forEach(function (b, j) { if (b.u === c.u) i = j; });
    if (i >= 0) l.splice(i, 1); else l.unshift({ u: c.u, t: (c.t || c.u).slice(0, 60) }); saveBms(l); };
  var bmWrap = document.createElement('div'); bmWrap.id = 'bms'; $('tiles').parentNode.insertBefore(bmWrap, $('tiles'));
  function drawBms() {
    var l = bms(); bmWrap.innerHTML = l.length ? '<div class="bmh">Bookmarks</div><div class="bml"></div>' : ''; if (!l.length) return;
    l.forEach(function (b, i) { var d = document.createElement('div'); d.className = 'bm';
      var host = ''; try { host = b.u.indexOf('herb://') === 0 ? b.u : new URL(b.u).hostname.replace(/^www\./, ''); } catch (e) { host = b.u; }
      d.innerHTML = '<span class="bmi"></span><span class="bmt"></span><button class="bmx" title="Remove">' + I('close', 11, 2.4) + '</button>';
      d.querySelector('.bmi').textContent = (b.t || host).charAt(0).toUpperCase(); d.querySelector('.bmt').textContent = b.t || host; d.title = b.u;
      d.onclick = function (e) { if (e.target.closest('.bmx')) { var l2 = bms(); l2.splice(i, 1); saveBms(l2); return; } go(b.u); };
      bmWrap.querySelector('.bml').appendChild(d); });
  }
  drawBms(); addEventListener('storage', function (e) { if (e.key === BK) { drawBms(); paintStar(); } });

  async function go(input) {
    input = (input || '').trim(); if (!input) return;
    if (/^herb:\/\//i.test(input)) { $('q').value = ''; return goHerb(input); }
    if (!active || active.app) newTab(); banner.classList.remove('on');
    var dest = HerbProxy.toUrl(input);
    try { await HerbProxy.init(); } catch (e) { warn('Proxy failed to start: ' + e.message, true); return; }
    var st = HerbWisp.status(); if (st && !st.best) { warn('No proxy server is reachable right now.', true); return; }
    var fr = active.frame; active.loaded = true; $('q').value = ''; render();
    var used = await HerbProxy.open(fr, dest);
    if (used === 'uv') retryWasm(fr, 0);
  }
  $('newtab').onclick = newTab;
  $('home').onclick = function () { if (active) { active.loaded = false; active.frame.src = 'about:blank'; banner.classList.remove('on'); render(); } };
  urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { go(urlEl.value); urlEl.blur(); } });
  urlEl.addEventListener('focus', function () { urlEl.select(); });
  $('reload').onclick = function () { try { active.frame.contentWindow.location.reload(); } catch (e) {} };
  $('back').onclick = function () { try { active.frame.contentWindow.history.back(); } catch (e) {} };
  $('fwd').onclick = function () { try { active.frame.contentWindow.history.forward(); } catch (e) {} };
  function sendState() { try { var u = active && active.loaded ? (currentUrl(active) || active.last || '') : '', k = u + '|' + (active && active.app ? active.app.id : ''); if (k !== lastSent) { lastSent = k; parent.postMessage({ herb: 'bstate', url: u, app: active && active.app ? active.app.id : (active && active.loaded ? '' : 'home') }, '*'); } } catch (e) {} paintStar(); }
  setInterval(function () { render(); sendState(); }, 1000); var lastSent = null;
  window.addEventListener('message', function (e) { if (e.origin === location.origin && e.data && e.data.herb === 'nav' && e.data.url) go(e.data.url); });
  // ---------- developer tools (Inspect): eruda, injected into the proxied page ----------
  // The page is same-origin (served through /uv/service/), so we can reach into its document. The <script> is created in
  // OUR document and then adopted, so Ultraviolet's client hooks don't rewrite its /js/vendor/eruda.js address.
  function toggleDevtools() {
    if (!active || !active.loaded) return;
    var w, d; try { w = active.frame.contentWindow; d = w.document; if (!d || !d.documentElement) return; } catch (e) { return; }
    function open() { try { if (!w.eruda._isInit) w.eruda.init({ defaults: { displaySize: 55, transparency: 0.96, theme: 'Dark' } }); w.eruda.show(); w.__herbDev = true; } catch (e) {} }
    if (w.eruda) { if (w.__herbDev) { try { w.eruda.hide(); } catch (e) {} w.__herbDev = false; } else open(); return; }
    var sc = document.createElement('script'); sc.src = '/js/vendor/eruda.js'; sc.onload = open; sc.onerror = function () { try { alert('Could not load the developer tools.'); } catch (e) {} };
    d.documentElement.appendChild(d.adoptNode(sc));
  }
  var dtBtn = $('devtools'); if (dtBtn) { dtBtn.innerHTML = I('code', 16, 2); dtBtn.onclick = toggleDevtools; }
  window.HerbBrowser = { go: go, devtools: toggleDevtools };

  newTab();
  var q = new URLSearchParams(location.search).get('url'); if (q) go(q);
  HerbProxy.init().catch(function () {});
})();
