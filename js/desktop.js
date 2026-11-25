// Herb desktop shell: window manager, taskbar, start menu, draggable desktop icons.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var S = HerbSettings, I = HerbIcons.glyph;
  var APPS = [
    { id: 'copperchat', title: 'Copperchat', icon: 'chat', src: '/apps/copperchat.html', w: 980, h: 640 },
    { id: 'browser', title: 'Web Browser', icon: 'browser', src: '/apps/browser.html', w: 1100, h: 700 },
    { id: 'vm', title: 'Virtual Machine', icon: 'vm', src: '/apps/vm.html', w: 900, h: 620 },
    { id: 'movies', title: 'Movies', icon: 'movies', src: '/apps/movies.html', w: 1020, h: 700 },
    { id: 'games', title: 'Games', icon: 'games', src: '/apps/launcher.html?type=games', w: 920, h: 640 },
    { id: 'ai', title: 'Herb AI', icon: 'ai', src: '/apps/ai.html', w: 860, h: 660 },
    { id: 'mineplacer', title: 'Mineplacer', icon: 'mineplacer', src: '/mineplacer/index.html', w: 1100, h: 720 },
    { id: 'store', title: 'Herb App Store', icon: 'store', src: '/apps/store.html', w: 900, h: 640 },
    { id: 'settings', title: 'Settings', icon: 'settings', src: '/apps/settings.html', w: 860, h: 600 },
  ];
  var byId = {}; APPS.forEach(function (a) { byId[a.id] = a; });
  var wins = {}, z = 10, focused = null, offset = 0;
  var D = $('desktop'), WINS = $('wins'), mobile = function () { return innerWidth < 720; };
  var UI = S.get('ui') || 'desktop'; if (['desktop', 'standard', 'ipad'].indexOf(UI) < 0) UI = 'desktop';
  document.body.classList.add('ui-' + UI);
  function noDrag() { return mobile() || UI !== 'desktop'; }
  function syncMobile() { document.body.classList.toggle('mobile', mobile()); }

  // ---------- taskbar ----------
  $('start-btn').innerHTML = HerbIcons.glyph('leaf', 20, 2);
  var tbBtns = {};
  function addTb(a) {
    if (a.store && UI === 'standard') return;   // standard mode: apps from the App Store open from inside the Store, not from the bottom bar
    var k = document.createElement('button'); k.className = 'tbbtn'; k.title = a.title; k.dataset.app = a.id;
    k.innerHTML = HerbIcons.tile(a.icon, 24) + '<span class="lbl">' + a.title + '</span><i class="run"></i>'; k.onclick = function () { toggle(a.id); };
    $('tbapps').appendChild(k); tbBtns[a.id] = k;
  }
  APPS.forEach(addTb);
  var dyn = {};
  function refreshTaskbar() {
    document.body.classList.toggle('app-open', Object.keys(wins).some(function (k) { return !wins[k].el.classList.contains('min'); }));
    Object.keys(wins).forEach(function (id) {
      if (byId[id] && APPS.indexOf(byId[id]) >= 0) return;
      if (!dyn[id]) { var k = document.createElement('button'); k.className = 'tbbtn'; k.title = wins[id].app.title; k.innerHTML = HerbIcons.tile(wins[id].app.icon, 24, wins[id].app.colors) + '<i class="run"></i>'; k.onclick = function () { toggle(id); }; $('tbapps').appendChild(k); dyn[id] = k; }
      dyn[id].classList.add('running'); dyn[id].classList.toggle('active', focused === id && !wins[id].el.classList.contains('min'));
    });
    Object.keys(dyn).forEach(function (id) { if (!wins[id]) { dyn[id].remove(); delete dyn[id]; } });
    APPS.forEach(function (a) { var b = tbBtns[a.id], w = wins[a.id]; if (!b) return;   // store apps have no button on the standard bar
      b.classList.toggle('running', !!w); b.classList.toggle('active', !!w && focused === a.id && !w.el.classList.contains('min')); });
  }
  $('showdesk').onclick = function () {
    var anyOpen = Object.keys(wins).some(function (k) { return !wins[k].el.classList.contains('min'); });
    Object.keys(wins).forEach(function (k) { wins[k].el.classList.toggle('min', anyOpen); });
    if (anyOpen) { focused = null; } else { var t = topWin(); if (t) focus(t); }
    refreshTaskbar();
  };
  // auto-hide: reveal when the pointer touches the screen edge
  document.addEventListener('mousemove', function (e) {
    if (!S.get('taskbarAutohide')) return; var top = S.get('taskbarPos') === 'top';
    var near = top ? e.clientY < 4 : e.clientY > innerHeight - 4; if (near) $('taskbar').classList.add('peek');
    else if (!e.target.closest || !e.target.closest('#taskbar')) $('taskbar').classList.remove('peek');
  });

  // ---------- start menu ----------
  var sm = $('start');
  sm.innerHTML = '<div class="sm-search">' + I('search', 16) + '<input id="sm-q" type="text" placeholder="Search apps, or type a website" autocomplete="off" spellcheck="false"></div><div class="sm-sec">Apps</div><div class="sm-apps" id="sm-apps"></div>' +
    '<div class="sm-foot"><button id="sm-settings">' + I('settings', 16) + 'Settings</button><button id="sm-cloak">' + I('shield', 16) + 'Cloak</button><button id="sm-full">' + I('max', 16) + 'Fullscreen</button></div>';
  var smItems = {};
  function addSm(a) {
    var b = document.createElement('button'); b.className = 'sm-item'; b.dataset.t = a.title.toLowerCase(); b.innerHTML = HerbIcons.tile(a.icon, 40) + '<span>' + a.title + '</span>';
    b.onclick = function () { closeStart(); open(a.id); }; $('sm-apps').appendChild(b); smItems[a.id] = b;
  }
  APPS.forEach(addSm);
  function closeStart() { sm.classList.remove('on'); $('start-btn').classList.remove('on'); }
  $('start-btn').onclick = function (e) { e.stopPropagation(); var on = sm.classList.toggle('on'); $('start-btn').classList.toggle('on', on); hideCtx();
    if (on) { $('sm-q').value = ''; filterSm(''); setTimeout(function () { try { $('sm-q').focus(); } catch (er) {} }, 30); } };
  function filterSm(q) { q = q.trim().toLowerCase(); Object.keys(smItems).forEach(function (k) { smItems[k].style.display = !q || smItems[k].dataset.t.indexOf(q) >= 0 ? '' : 'none'; }); }
  $('sm-q').addEventListener('input', function () { filterSm(this.value); });
  $('sm-q').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') return closeStart(); if (e.key !== 'Enter') return; var q = this.value.trim(); if (!q) return;
    var hit = Object.keys(smItems).filter(function (k) { return smItems[k].style.display !== 'none'; })[0];
    closeStart(); if (hit) open(hit); else open('browser', { url: q });   // nothing matched: search the web / open the site
  });
  $('sm-settings').onclick = function () { closeStart(); open('settings'); };
  $('sm-cloak').onclick = function () { closeStart(); cloak(); };
  $('sm-full').onclick = function () { closeStart(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); };
  document.addEventListener('pointerdown', function (e) { if (!e.target.closest('#start') && !e.target.closest('#start-btn')) closeStart(); if (!e.target.closest('#ctx')) hideCtx(); });

  // ---------- context menu ----------
  var ctx = $('ctx');
  function hideCtx() { ctx.classList.remove('on'); }
  function showCtx(x, y, items) {
    ctx.innerHTML = ''; items.forEach(function (it) {
      if (it === '-') { ctx.appendChild(document.createElement('hr')); return; }
      var b = document.createElement('button'); b.innerHTML = (it[0] ? I(it[0], 15) : '<span style="width:15px"></span>') + '<span>' + it[1] + '</span>'; b.onclick = function () { hideCtx(); it[2](); }; ctx.appendChild(b);
    });
    ctx.classList.add('on'); var r = ctx.getBoundingClientRect();
    ctx.style.left = Math.min(x, innerWidth - r.width - 6) + 'px'; ctx.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
  }
  D.addEventListener('contextmenu', function (e) {
    if (UI !== 'desktop') return;
    if (e.target.closest('.win') || e.target.closest('#taskbar') || e.target.closest('#start')) return; e.preventDefault();
    showCtx(e.clientX, e.clientY, [
      ['appearance', 'Personalize', function () { open('settings', { section: 'desktop' }); }],
      ['apps', 'Taskbar settings', function () { open('settings', { section: 'taskbar' }); }],
      '-',
      ['apps', 'Reset icon positions', function () { try { localStorage.removeItem(POS_KEY); } catch (er) {} layoutIcons(); }],
      ['max', 'Toggle fullscreen', function () { $('sm-full').onclick(); }],
    ]);
  });
  $('taskbar').addEventListener('contextmenu', function (e) { if (UI !== 'desktop') return; e.preventDefault(); showCtx(e.clientX, Math.min(e.clientY, innerHeight - 140), [
    ['settings', 'Taskbar settings', function () { open('settings', { section: 'taskbar' }); }],
    ['apps', 'Show desktop', function () { $('showdesk').click(); }],
    ['close', 'Close all windows', function () { Object.keys(wins).forEach(close); }],
  ]); });

  // ---------- desktop icons (draggable, positions remembered) ----------
  var POS_KEY = 'herb.iconpos', icons = {};
  function readPos() { try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch (e) { return {}; } }
  function writePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) {} }
  var IC = $('icons');
  function addIc(a) {
    var d = document.createElement('button'); d.className = 'dicon'; d.dataset.app = a.id;
    d.innerHTML = HerbIcons.tile(a.icon, 58) + '<span class="lbl">' + a.title + '</span>'; IC.appendChild(d); icons[a.id] = d; wireIcon(d, a.id);
  }
  APPS.forEach(addIc);
  function cell() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dcell')) || 104; }
  function layoutIcons() {
    var c = cell(), h = IC.clientHeight, rows = Math.max(1, Math.floor((h - 8) / c)), saved = readPos();
    APPS.forEach(function (a, i) {
      var p = saved[a.id]; var x = p ? p[0] : 8 + Math.floor(i / rows) * c, y = p ? p[1] : 8 + (i % rows) * c;
      var d = icons[a.id]; d.style.left = Math.max(0, Math.min(x, IC.clientWidth - c + 8)) + 'px'; d.style.top = Math.max(0, Math.min(y, h - c + 8)) + 'px';
    });
  }
  function wireIcon(d, id) {
    var st = null;
    d.addEventListener('pointerdown', function (e) {
      if (e.button) return; Object.keys(icons).forEach(function (k) { icons[k].classList.toggle('sel', k === id); });
      st = { x: e.clientX, y: e.clientY, l: parseFloat(d.style.left), t: parseFloat(d.style.top), moved: false };
      if (noDrag()) return; try { d.setPointerCapture(e.pointerId); } catch (er) {}
    });
    d.addEventListener('pointermove', function (e) {
      if (!st || noDrag()) return; var dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) < 6) return; st.moved = true; d.classList.add('dragging');
      var c = cell(); d.style.left = Math.max(0, Math.min(IC.clientWidth - c + 8, st.l + dx)) + 'px'; d.style.top = Math.max(0, Math.min(IC.clientHeight - c + 8, st.t + dy)) + 'px';
    });
    d.addEventListener('pointerup', function () {
      if (!st) return; var moved = st.moved; st = null; d.classList.remove('dragging');
      if (moved) { var g = 8, snap = function (v) { return Math.round(v / g) * g; }; d.style.left = snap(parseFloat(d.style.left)) + 'px'; d.style.top = snap(parseFloat(d.style.top)) + 'px';
        var p = readPos(); p[id] = [parseFloat(d.style.left), parseFloat(d.style.top)]; writePos(p); d.dataset.moved = '1'; setTimeout(function () { delete d.dataset.moved; }, 50); }
    });
    d.addEventListener('click', function () { if (d.dataset.moved) return; open(id); });
  }
  IC.addEventListener('pointerdown', function (e) { if (e.target === IC) Object.keys(icons).forEach(function (k) { icons[k].classList.remove('sel'); }); });

  // ---------- windows ----------
  // Standard mode is browser-first: every app opens as a tab (herb://games, herb://settings…) inside the Web Browser.
  var bReady = false, bq = [];
  function toBrowser(msg) {
    var bw = wins.browser || open('browser'); focus('browser'); markSide(lastB);
    if (bReady) { try { bw.frame.contentWindow.postMessage(msg, '*'); } catch (e) {} } else bq.push(msg);
    return bw;
  }
  // App tabs need the browser on Herb's own address (it shares storage and the HerbDesktop API with them). When Herb runs from the
  // loader file the browser is framed from a server address instead, so apps open as their own panels next to it.
  function tabsOK() {
    var w = wins.browser; if (w && bReady) { try { return !!w.frame.contentWindow.document; } catch (e) { return false; } }
    if (!(window.HerbConfig && HerbConfig.single)) return true;
    var h = ''; try { h = localStorage.getItem('herb.hostUrl') || ''; } catch (e) {} return h === location.origin;
  }
  function open(id, opts) {
    opts = opts || {}; var a = byId[id]; if (!a) return null;
    if (UI === 'standard' && id !== 'browser' && tabsOK()) return toBrowser({ herb: 'app', app: { id: a.id, title: a.title, icon: a.icon, src: a.src }, opts: opts });
    var w = wins[id];
    if (w) { w.el.classList.remove('min'); focus(id); if (opts.section || opts.url) message(w, opts); return w; }
    var vw = WINS.clientWidth, vh = WINS.clientHeight, width = Math.min(a.w, vw - 24), height = Math.min(a.h, vh - 24);
    var x = Math.max(6, (vw - width) / 2 + (offset % 5) * 28 - 56), y = Math.max(6, (vh - height) / 2 + (offset % 5) * 24 - 30); offset++;
    var el = document.createElement('div'); el.className = 'win'; el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + width + 'px;height:' + height + 'px';
    var src = a.src; if (opts.section) src += (src.indexOf('?') < 0 ? '?' : '&') + 'section=' + opts.section; if (opts.url) src += (src.indexOf('?') < 0 ? '?' : '&') + 'url=' + encodeURIComponent(opts.url);
    el.innerHTML = '<div class="tb"><span class="wi">' + I(a.icon, 15) + '</span><span class="ttl">' + a.title + '</span><div class="wc"><button class="m" title="Minimize">' + I('min', 14, 1.6) + '</button><button class="x" title="Maximize">' + I('max', 12, 1.6) + '</button><button class="c" title="Close">' + I('close', 14, 1.6) + '</button></div></div><div class="body"><iframe title="' + a.title + '" allow="fullscreen; gamepad; clipboard-read; clipboard-write; autoplay"></iframe></div>';
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(function (d) { var h = document.createElement('div'); h.className = 'rz ' + d; h.dataset.dir = d; el.appendChild(h); });
    WINS.appendChild(el); w = wins[id] = { id: id, app: a, el: el, frame: el.querySelector('iframe') };
    if (id === 'browser') { bReady = false; w.frame.addEventListener('load', function () { bReady = true; var q = bq; bq = []; q.forEach(function (m) { try { w.frame.contentWindow.postMessage(m, '*'); } catch (e) {} }); }); } (window.HerbConfig ? HerbConfig.setFrame(w.frame, src) : (w.frame.src = src)); w.frame.addEventListener('load', hookLock); mouseLockNotice(String(a.title) + ' ' + String(src));
    el.querySelector('.c').onclick = function () { close(id); }; el.querySelector('.m').onclick = function () { minimize(id); }; el.querySelector('.x').onclick = function () { maximize(id); };
    el.addEventListener('pointerdown', function () { focus(id); }, true);
    var tb = el.querySelector('.tb'); tb.addEventListener('pointerdown', function (e) { if (!e.target.closest('.wc')) startDrag(e, w); });
    tb.addEventListener('dblclick', function (e) { if (!e.target.closest('.wc')) maximize(id); });
    el.querySelectorAll('.rz').forEach(function (h) { h.addEventListener('pointerdown', function (e) { startResize(e, w, h.dataset.dir); }); });
    focus(id); return w;
  }
  function message(w, opts) { try { w.frame.contentWindow.postMessage({ herb: 'nav', section: opts.section, url: opts.url }, location.origin); } catch (e) {} }
  function focus(id) { var w = wins[id]; if (!w) return; focused = id; if (UI === 'standard' && id !== 'browser') markSide(id); w.el.style.zIndex = ++z; tutEvent('open'); if (UI !== 'desktop') Object.keys(wins).forEach(function (k) { wins[k].el.classList.toggle('bg', k !== id); }); Object.keys(wins).forEach(function (k) { wins[k].el.classList.toggle('focus', k === id); }); refreshTaskbar(); }
  function close(id) { var w = wins[id]; if (!w) return; if (id === 'browser') bReady = false; w.el.remove(); delete wins[id]; if (focused === id) { focused = null; var t = topWin(); if (t) focus(t); } refreshTaskbar(); }
  function minimize(id) { var w = wins[id]; if (!w) return; w.el.classList.add('min'); if (focused === id) { focused = null; var t = topWin(); if (t) focus(t); } refreshTaskbar(); }
  function maximize(id) { var w = wins[id]; if (!w) return; w.el.classList.toggle('max'); focus(id); }
  function toggle(id) { var w = wins[id]; if (!w) return open(id); if (UI !== 'desktop') { w.el.classList.remove('min'); return focus(id); } if (w.el.classList.contains('min')) { w.el.classList.remove('min'); focus(id); } else if (focused === id) minimize(id); else focus(id); }
  function topWin() { var best = null, bz = -1; Object.keys(wins).forEach(function (k) { var e = wins[k].el; if (!e.classList.contains('min') && +e.style.zIndex > bz) { bz = +e.style.zIndex; best = k; } }); return best; }

  var snap = $('snap');
  function startDrag(e, w) {
    if (noDrag() || e.button) return; var el = w.el, vw = WINS.clientWidth, vh = WINS.clientHeight, top0 = WINS.getBoundingClientRect().top;
    if (el.classList.contains('max')) { el.classList.remove('max'); var pw = parseFloat(el.style.width) || 800; el.style.left = Math.max(0, e.clientX - pw / 2) + 'px'; el.style.top = '0px'; }
    var r = { x: e.clientX, y: e.clientY, l: parseFloat(el.style.left), t: parseFloat(el.style.top) }; D.classList.add('drag'); var zone = null;
    function mv(ev) {
      el.style.left = (r.l + ev.clientX - r.x) + 'px'; el.style.top = Math.max(0, Math.min(vh - 34, r.t + ev.clientY - r.y)) + 'px';
      var ry = ev.clientY - top0; zone = ry < 4 ? 'max' : ev.clientX < 6 ? 'left' : ev.clientX > vw - 7 ? 'right' : null;
      if (zone) { var g = zone === 'max' ? [0, 0, vw, vh] : zone === 'left' ? [0, 0, vw / 2, vh] : [vw / 2, 0, vw / 2, vh]; snap.style.cssText = 'display:block;left:' + g[0] + 'px;top:' + g[1] + 'px;width:' + g[2] + 'px;height:' + g[3] + 'px'; } else snap.style.display = 'none';
    }
    function up() { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); D.classList.remove('drag'); snap.style.display = 'none';
      if (zone === 'max') el.classList.add('max'); else if (zone) { el.style.left = (zone === 'left' ? 0 : vw / 2) + 'px'; el.style.top = '0px'; el.style.width = vw / 2 + 'px'; el.style.height = vh + 'px'; } }
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function startResize(e, w, dir) {
    if (noDrag() || e.button) return; e.preventDefault(); var el = w.el; el.classList.remove('max'); D.classList.add('drag');
    var s = { x: e.clientX, y: e.clientY, l: parseFloat(el.style.left), t: parseFloat(el.style.top), w: el.offsetWidth, h: el.offsetHeight }, MW = 340, MH = 240;
    function mv(ev) { var dx = ev.clientX - s.x, dy = ev.clientY - s.y, l = s.l, t = s.t, ww = s.w, hh = s.h;
      if (dir.indexOf('e') >= 0) ww = Math.max(MW, s.w + dx); if (dir.indexOf('s') >= 0) hh = Math.max(MH, s.h + dy);
      if (dir.indexOf('w') >= 0) { ww = Math.max(MW, s.w - dx); l = s.l + (s.w - ww); } if (dir.indexOf('n') >= 0) { hh = Math.max(MH, s.h - dy); t = Math.max(0, s.t + (s.h - hh)); }
      el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.width = ww + 'px'; el.style.height = hh + 'px'; }
    function up() { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); D.classList.remove('drag'); }
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  // ---------- cloak / panic ----------
  function cloak() {
    var win; try { win = window.open('about:blank', '_blank'); } catch (e) {}
    if (!win) { alert('Popup blocked – allow popups for this site to use the cloak.'); return; }
    var d = win.document; d.title = document.title || 'Google Classroom'; var ic = document.querySelector('link[rel~="icon"]'); if (ic) { var l = d.createElement('link'); l.rel = 'icon'; l.href = ic.href; d.head.appendChild(l); }
    var fr = d.createElement('iframe'); fr.setAttribute('allow', 'fullscreen; gamepad; clipboard-read; clipboard-write; autoplay; pointer-lock');
    fr.src = location.href; fr.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'; d.body.style.margin = 0; d.body.appendChild(fr);
    location.replace(S.get('panicUrl') || 'https://classroom.google.com');
  }
  addEventListener('keydown', function (e) { var k = S.get('panicKey'); if (k && e.key === k && !/input|textarea/i.test((e.target.tagName || ''))) location.href = S.get('panicUrl') || 'https://classroom.google.com'; });

  // ---------- wallpaper ----------
  // Custom images come from IndexedDB as the original file (full resolution, no recompression) and are shown through an object URL.
  var wallUrl = null, wallVer = null;
  var FITS = { cover: 'cover', contain: 'contain', center: 'auto', stretch: '100% 100%' };
  function paintImage(url, fit) {
    D.classList.add('has-wall');
    D.style.backgroundImage = 'url("' + url + '")'; D.style.backgroundPosition = 'center'; D.style.backgroundRepeat = 'no-repeat';
    D.style.backgroundSize = FITS[fit] || 'cover';
  }
  function applyWallpaper() {
    var s = S.all(); D.style.background = ''; D.classList.remove('has-wall');
    if (s.wallMode === 'color') D.style.background = s.wallColor;
    else if (s.wallMode === 'image') {
      var v = null; try { v = localStorage.getItem('herb.wallver'); } catch (e) {}
      if (wallUrl && v === wallVer) return paintImage(wallUrl, s.wallFit);
      HerbSettings.wall.get().then(function (blob) {
        if (S.get('wallMode') !== 'image') return;
        if (blob) { if (wallUrl) URL.revokeObjectURL(wallUrl); wallUrl = URL.createObjectURL(blob); wallVer = v; paintImage(wallUrl, S.get('wallFit')); return; }
        var old = null; try { old = localStorage.getItem('herb.wallimg'); } catch (e) {}   // wallpapers saved by older versions
        if (old) paintImage(old, S.get('wallFit'));
      });
    }
  }
  addEventListener('storage', function (e) { if (e.key === 'herb.wallver') applyWallpaper(); });

  // ---------- proxy status + clock ----------
  function srvNum(url) { try { var l = HerbWisp.list(); for (var i = 0; i < l.length; i++) if (l[i].url === url) return '#' + (i + 1); } catch (e) {} return '#?'; }
  function paintProxy() {
    var st = null; try { st = JSON.parse(localStorage.getItem('herb.wisp.status') || 'null'); } catch (e) {}
    var dot = $('sdot'), txt = $('stxt'), n = HerbWisp.workingCount();
    if (!st) { dot.className = 'sdot'; txt.textContent = 'checking…'; return; }
    if (st.best) { dot.className = 'sdot ok'; txt.textContent = st.results[st.best].ms + ' ms'; } else { dot.className = 'sdot bad'; txt.textContent = 'offline'; }
    $('trayinfo').title = 'Proxy: ' + n[0] + ' of ' + n[1] + ' servers online' + (st.best ? ' · using server ' + srvNum(st.best) : '');
  }
  $('trayinfo').onclick = function () { open('settings', { section: 'proxy' }); };
  function tick() { var d = new Date(), h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2), t;
    if (S.get('clock24')) t = ('0' + h).slice(-2) + ':' + m; else t = ((h + 11) % 12 + 1) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM');
    $('clock').querySelector('.t').textContent = t; $('clock').querySelector('.d').textContent = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' }); }

  // ---------- mouse lock: Cmd+Shift+, always lets go ----------
  // Games (e.g. Minecraft) lock the mouse themselves. The shortcut below is listened for in the shell and in every same-origin frame
  // (a locked game owns the keyboard focus, so the shell alone wouldn't see it), and releases the lock wherever it is.
  function eachDoc(win, fn, depth) {
    depth = depth || 0; if (depth > 6) return;
    try { fn(win); for (var i = 0; i < win.frames.length; i++) eachDoc(win.frames[i], fn, depth + 1); } catch (e) { /* cross-origin frame: can't reach it */ }
  }
  function releaseMouse() { eachDoc(window, function (w) { try { if (w.document.pointerLockElement) w.document.exitPointerLock(); } catch (e) {} }); }
  function lockKey(e) { if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === 'Comma' || e.key === ',' || e.key === '<')) { e.preventDefault(); e.stopPropagation(); releaseMouse(); } }
  function hookLock() { eachDoc(window, function (w) { if (w.__herbLock) return; w.__herbLock = 1; w.addEventListener('keydown', lockKey, true); }); }
  hookLock(); setInterval(hookLock, 2500);
  var lockHint = false;
  function mouseLockNotice(title) {
    if (lockHint || Element.prototype.requestPointerLock || !/minecraft|eagler|craft|beta|alpha|indev|^1\.\d/i.test(title)) return; lockHint = true;
    var t = document.createElement('div'); t.textContent = 'This browser can\u2019t lock the mouse inside games yet (iPadOS Safari doesn\u2019t support it). Mouse-look may not work.';
    t.style.cssText = 'position:absolute;left:50%;bottom:90px;transform:translateX(-50%);z-index:9700;max-width:min(440px,90vw);padding:12px 16px;border-radius:12px;background:var(--glass,#10201a);border:1px solid var(--border);color:var(--text);font-size:13px;line-height:1.45;box-shadow:0 12px 40px rgba(0,0,0,.5)';
    D.appendChild(t); setTimeout(function () { t.remove(); }, 7000);
  }

  // ---------- fireflies ----------
  for (var i = 0; i < 18; i++) { var f = document.createElement('div'); f.className = 'firefly'; f.style.left = Math.random() * 100 + '%'; f.style.top = 25 + Math.random() * 65 + '%';
    f.style.setProperty('--dx', (Math.random() * 140 - 70) + 'px'); f.style.setProperty('--dy', (Math.random() * -140) + 'px'); f.style.animationDuration = 6 + Math.random() * 9 + 's'; f.style.animationDelay = -Math.random() * 12 + 's'; $('flies').appendChild(f); }

  // ---------- iPadOS-style chrome ----------
  var ipClock = null, ipStat = null, TUT_KEY = 'herb.iptut';
  function goHome() { Object.keys(wins).forEach(function (k) { wins[k].el.classList.add('min'); }); focused = null; refreshTaskbar(); tutEvent('home'); }
  if (UI === 'ipad') {
    var bar = document.createElement('div'); bar.id = 'ipbar'; bar.innerHTML = '<span id="ipclock"></span><span style="display:flex;align-items:center"><span id="ipstat"></span><button id="iphelp" title="How to use this interface">?</button></span>'; D.appendChild(bar);
    var dock = document.createElement('div'); dock.id = 'ipdock'; D.appendChild(dock);
    ['browser', 'copperchat', 'games', 'settings'].forEach(function (id) { var a = byId[id], b = document.createElement('button'); b.title = a.title; b.innerHTML = HerbIcons.tile(a.icon, 62); b.onclick = function () { open(id); }; dock.appendChild(b); });
    // side "home" handle: click it, or swipe right from the left screen edge
    var home = document.createElement('button'); home.id = 'iphome'; home.title = 'Back to home screen'; home.innerHTML = HerbIcons.glyph('home', 18, 1.9); home.onclick = goHome; D.appendChild(home);
    var edge = document.createElement('div'); edge.id = 'ipedge'; D.appendChild(edge); var sx = null;
    edge.addEventListener('pointerdown', function (e) { sx = e.clientX; try { edge.setPointerCapture(e.pointerId); } catch (er) {} });
    edge.addEventListener('pointermove', function (e) { if (sx !== null && e.clientX - sx > 50) { sx = null; goHome(); } });
    edge.addEventListener('pointerup', function () { sx = null; });
    ipClock = $('ipclock'); ipStat = $('ipstat'); $('iphelp').onclick = function () { startTutorial(); };
  }
  function paintIp() {
    if (!ipClock) return; var d = new Date(), h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    ipClock.textContent = (S.get('clock24') ? ('0' + h).slice(-2) : ((h + 11) % 12 + 1)) + ':' + m + (S.get('clock24') ? '' : (h < 12 ? ' AM' : ' PM')) + '   ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    ipStat.innerHTML = '<span class="sdot ' + ($('sdot').className.replace('sdot', '').trim()) + '"></span> ' + $('stxt').textContent;
  }

  // ---------- iPad tutorial: open an app, then use the side handle to come back ----------
  var tut = null, tutEl = null;
  var TUT_STEPS = [
    ['Welcome to Herb', 'This is the iPad-style home screen. Tap any app to open it. Try opening one now.', 'Skip'],
    ['Nice! Now go back home', 'To return to the home screen, tap the glowing <b>handle on the left edge</b> of the screen. You can also swipe right from the very edge.', 'Skip'],
    ['You’ve got it', 'That’s everything: tap an icon to open an app, use the left-edge handle to go home. The dock shows your favourites. Tap the <b>?</b> in the top corner any time to see this again.', 'Done']
  ];
  function renderTut() {
    if (!tut) return; if (!tutEl) { tutEl = document.createElement('div'); tutEl.id = 'tut'; D.appendChild(tutEl); }
    var st = TUT_STEPS[tut.step]; var dots = TUT_STEPS.map(function (x, i) { return '<i' + (i <= tut.step ? ' class="on"' : '') + '></i>'; }).join('');
    tutEl.innerHTML = '<div class="steps">' + dots + '</div><h3>' + st[0] + '</h3><p>' + st[1] + '</p><div class="btns"><button id="tut-skip" class="' + (tut.step === 2 ? 'primary' : '') + '">' + st[2] + '</button></div>';
    tutEl.classList.add('on'); $('tut-skip').onclick = endTutorial;
    var h = $('iphome'); if (h) h.classList.toggle('pulse', tut.step === 1);
  }
  function startTutorial() {
    if (UI !== 'ipad') return false; goHome(); tut = { step: 0 }; renderTut(); return true;
  }
  function endTutorial() { tut = null; if (tutEl) tutEl.classList.remove('on'); var h = $('iphome'); if (h) h.classList.remove('pulse'); try { localStorage.setItem(TUT_KEY, '1'); } catch (e) {} }
  function tutEvent(ev) {
    if (!tut) return;
    if (ev === 'open' && tut.step === 0) { tut.step = 1; renderTut(); }
    else if (ev === 'home' && tut.step === 1) { tut.step = 2; renderTut(); }
  }

  // ---------- standard interface: sidebar (Home + apps), collapsible to an icon rail ----------
  var sideActive = 'home', RAIL = 'herb.side.rail';
  function drawSide() {
    if (UI !== 'standard') return; var nav = $('sd-apps'); nav.innerHTML = '';
    var items = [{ id: 'home', title: 'Home', icon: 'home' }].concat(APPS.filter(function (a) { return a.id !== 'browser' && a.id.indexOf('game:') !== 0; }));
    items.forEach(function (a) {
      var b = document.createElement('button'); b.className = 'sd-item' + (sideActive === a.id ? ' on' : ''); b.dataset.app = a.id; b.title = a.title;
      b.innerHTML = '<span class="sd-ic">' + I(a.icon || 'apps', 18, 1.8) + '</span><span class="sd-l"></span>'; b.querySelector('.sd-l').textContent = a.title;
      b.onclick = function () { if (a.id === 'home') { toBrowser({ herb: 'home' }); markSide('home'); } else open(a.id); }; nav.appendChild(b);
    });
  }
  if (UI === 'standard') {
    var side = document.createElement('aside'); side.id = 'side';
    side.innerHTML = '<div class="sd-top"><span class="sd-logo">' + I('leaf', 18, 2) + '<b>herb</b></span><button id="sd-rail" title="Collapse sidebar">' + I('rail', 17, 1.8) + '</button></div>' +
      '<nav id="sd-apps"></nav><div class="sd-bot"><div id="sideacct"></div><button class="sd-item" id="sd-ping" title="Proxy servers"><span class="sd-ic"><span class="sdot" id="sd-dot"></span></span><span class="sd-l" id="sd-pt">checking…</span></button></div>';
    D.appendChild(side);
    try { document.body.classList.toggle('side-rail', localStorage.getItem(RAIL) === '1'); } catch (e) {}
    $('sd-rail').onclick = function () { var on = document.body.classList.toggle('side-rail'); try { localStorage.setItem(RAIL, on ? '1' : '0'); } catch (e) {} };
    $('sd-ping').onclick = function () { open('settings', { section: 'proxy' }); };
    drawSide();
  }
  function paintStd() {
    if (UI !== 'standard') return; var st = null; try { st = JSON.parse(localStorage.getItem('herb.wisp.status') || 'null'); } catch (e) {}
    $('sd-dot').className = 'sdot' + (!st ? '' : st.best ? ' ok' : ' bad');
    $('sd-pt').textContent = !st ? 'checking…' : (st.best ? st.results[st.best].ms + ' ms · server ' + srvNum(st.best) : 'offline');
  }

  // ---------- keep what was open when the interface mode changes (the page reloads) ----------
  var SESS = 'herb.session', browserUrl = '';
  window.addEventListener('message', function (e) { var d = e.data; if (d && d.herb === 'bstate' && typeof d.url === 'string') { browserUrl = d.url.slice(0, 2000);
    if (UI === 'standard') { lastB = d.app === undefined ? '' : d.app; if (focused === 'browser') markSide(lastB); } } });
  var lastB = 'home';
  function markSide(id) { sideActive = id; document.querySelectorAll('#sd-apps .sd-item').forEach(function (b) { b.classList.toggle('on', b.dataset.app === id); }); }
  function saveSession() {
    try { localStorage.setItem(SESS, JSON.stringify({ t: Date.now(), open: Object.keys(wins).filter(function (k) { return byId[k] && k.indexOf('game:') !== 0; }), focus: focused, url: wins.browser ? browserUrl : '' })); } catch (e) {}
  }
  function restoreSession() {
    var v = null; try { v = JSON.parse(localStorage.getItem(SESS) || 'null'); localStorage.removeItem(SESS); } catch (e) {}
    if (!v || Date.now() - v.t > 60000 || !Array.isArray(v.open)) return false;
    v.open.forEach(function (id) { if (byId[id]) open(id, id === 'browser' && v.url ? { url: v.url } : undefined); });
    if (v.focus && wins[v.focus]) focus(v.focus); return v.open.length > 0;
  }

  // ---------- public API ----------
  window.HerbDesktop = {
    open: open, close: close, apps: APPS, cloak: cloak,
    // apps that only some people may see (e.g. Admin) are added/removed at runtime
    addApp: function (a) { if (byId[a.id]) return; APPS.push(a); byId[a.id] = a; addTb(a); addSm(a); addIc(a); layoutIcons(); drawSide(); },
    removeApp: function (id) {
      var a = byId[id]; if (!a) return; if (wins[id]) close(id);
      APPS.splice(APPS.indexOf(a), 1); delete byId[id];
      [tbBtns, smItems, icons].forEach(function (m) { if (m[id]) { m[id].remove(); delete m[id]; } });
      layoutIcons(); refreshTaskbar(); drawSide();
    },
    recheck: function () { return HerbWisp.check(); },
    apply: function () { if (((S.get('ui') || 'desktop')) !== UI) { saveSession(); location.reload(); return; } HerbSettings.apply(); HerbSettings.disguise(); applyWallpaper(); layoutIcons(); tick(); },
    layout: layoutIcons,
    replayTutorial: function () { try { localStorage.removeItem(TUT_KEY); } catch (e) {} return startTutorial(); },
    ui: UI,
    openUrl: function (url) { open('browser', { url: url }); },
    // Open a self-hosted page (e.g. a game) in its own window.
    openLocal: function (id, title, src, size) {
      if (!byId[id]) byId[id] = { id: id, title: title, icon: 'games', src: src, w: (size && size[0]) || 980, h: (size && size[1]) || 660 };
      return open(id);
    },
  };
  addEventListener('resize', function () { syncMobile(); layoutIcons(); }); syncMobile();
  window.addEventListener('herb:wisp-status', function () { paintIp(); paintStd(); }); setInterval(function () { paintIp(); paintStd(); }, 5000);
  window.addEventListener('herb:wisp-status', paintProxy); window.addEventListener('storage', function (e) { if (e.key === 'herb.wisp.status') paintProxy(); });
  applyWallpaper(); layoutIcons(); tick(); setInterval(tick, 20000); try { HerbSettings.disguise(); } catch (e) {}
  paintProxy(); HerbWisp.check(); setInterval(function () { HerbWisp.check(); }, 60000);
  paintIp(); paintStd();
  if (UI === 'ipad') { var seen = false; try { seen = !!localStorage.getItem(TUT_KEY); } catch (e) {} if (!seen) setTimeout(startTutorial, 800); }
  // Settings > Privacy > Launch in about:blank: browsers only allow the new tab after a click, so the first click anywhere opens it.
  if (S.get('autoBlank') && window.top === window) {
    var ab = document.createElement('div'); ab.id = 'abgate';
    ab.innerHTML = '<div><div class="t">Click anywhere to open Herb</div><div class="d">Herb opens in an about:blank tab (Settings → Privacy).</div><button>Open here instead</button></div>';
    document.body.appendChild(ab);
    ab.addEventListener('click', function (e) { if (e.target.tagName === 'BUTTON') { ab.remove(); return; } ab.remove(); cloak(); });
  }
  var qs = new URLSearchParams(location.search); if (qs.get('app') && byId[qs.get('app')]) open(qs.get('app')); else if (restoreSession()) {} else if (UI === 'standard') open('browser');
})();
