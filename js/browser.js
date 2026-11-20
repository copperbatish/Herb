// Herb web browser app: tabs + iframe viewport + new-tab page on Ultraviolet.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var I = HerbIcons.glyph;
  var tabsEl = $('tabs'), views = $('views'), urlEl = $('url'), ntp = $('ntp'), banner = $('banner');
  var tabs = [], active = null;
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
    if (!t.loaded) return 'New Tab';
    try { var d = t.frame.contentDocument; if (d && d.title) return d.title; } catch (e) {}
    return t.last || 'Loading…';
  }
  function currentUrl(t) {
    try { var l = t.frame.contentWindow.location;
      if (l.pathname.indexOf(__uv$config.prefix) === 0) return HerbProxy.decode(l.pathname + l.search + l.hash);
      return l.href === 'about:blank' ? '' : l.href; } catch (e) { return null; }
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
    t.frame = document.createElement('iframe'); t.frame.addEventListener('load', render); views.appendChild(t.frame);
    t.el.onclick = function () { active = t; render(); };
    t.el.querySelector('.x').onclick = function (e) { e.stopPropagation(); close(t); };
    tabs.push(t); active = t; render(); $('q').focus(); return t;
  }
  function close(t) {
    var i = tabs.indexOf(t); tabs.splice(i, 1); t.el.remove(); t.frame.remove();
    if (!tabs.length) { active = null; newTab(); return; } if (active === t) active = tabs[Math.max(0, i - 1)]; render();
  }
  async function go(input) {
    input = (input || '').trim(); if (!input) return; if (!active) newTab(); banner.classList.remove('on');
    var dest = HerbProxy.resolve(input);
    try { await HerbProxy.init(); } catch (e) { warn('Proxy failed to start: ' + e.message, true); return; }
    var st = HerbWisp.status(); if (st && !st.best) { warn('No proxy server is reachable right now.', true); return; }
    active.loaded = true; active.frame.src = dest; $('q').value = ''; render();
  }
  $('newtab').onclick = newTab;
  $('home').onclick = function () { if (active) { active.loaded = false; active.frame.src = 'about:blank'; banner.classList.remove('on'); render(); } };
  urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { go(urlEl.value); urlEl.blur(); } });
  urlEl.addEventListener('focus', function () { urlEl.select(); });
  $('reload').onclick = function () { try { active.frame.contentWindow.location.reload(); } catch (e) {} };
  $('back').onclick = function () { try { active.frame.contentWindow.history.back(); } catch (e) {} };
  $('fwd').onclick = function () { try { active.frame.contentWindow.history.forward(); } catch (e) {} };
  setInterval(function () { render(); try { var u = active && active.loaded ? (currentUrl(active) || active.last || '') : ''; if (u !== lastSent) { lastSent = u; parent.postMessage({ herb: 'bstate', url: u }, '*'); } } catch (e) {} }, 1000); var lastSent = null;
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
