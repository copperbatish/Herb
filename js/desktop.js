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
    var k = document.createElement('button'); k.className = 'tbbtn' + (a.store ? ' store' : ''); k.title = a.title; k.dataset.app = a.id;
    k.innerHTML = appIcon(a, 24) + '<span class="lbl">' + a.title + '</span><i class="run"></i>'; k.onclick = function () { toggle(a.id); };
    $('tbapps').appendChild(k); tbBtns[a.id] = k;
  }
  // installed apps that have no icon of their own get their first letter, so several of them don't look identical
  function appIcon(a, px) { return a.store && (!a.icon || a.icon === 'apps') ? HerbIcons.letter((a.title || '?').charAt(0).toUpperCase(), px) : HerbIcons.tile(a.icon, px, a.colors); }
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

  // ---------- layouts: Taskbar, Dock (floating, centred) or Side dock (left, with a top bar holding the date and tray) ----------
  function applyLayout() {
    var lay = UI === 'desktop' ? (S.get('tbLayout') || 'dock') : 'bar', tray = $('tbtray');
    if (lay === 'side') { if (tray.parentNode !== $('tb-right')) $('tb-right').appendChild(tray); }
    else if (tray.parentNode !== $('taskbar')) $('taskbar').appendChild(tray);
    $('start-btn').innerHTML = lay === 'side' ? HerbIcons.glyph('apps', 20, 1.9) : HerbIcons.glyph('leaf', 20, 2);
    $('start-btn').title = lay === 'side' ? 'All apps' : 'Start';
  }
  applyLayout();

  // ---------- start menu ----------
  var sm = $('start');
  sm.innerHTML = '<div class="sm-search">' + I('search', 16) + '<input id="sm-q" type="text" placeholder="Search apps, or type a website" autocomplete="off" spellcheck="false"></div><div class="sm-sec">Apps</div><div class="sm-apps" id="sm-apps"></div>' +
    '<div class="sm-foot"><button id="sm-settings">' + I('settings', 16) + 'Settings</button><button id="sm-cloak">' + I('shield', 16) + 'Cloak</button><button id="sm-full">' + I('max', 16) + 'Fullscreen</button></div>';
  var smItems = {};
  function addSm(a) {
    var b = document.createElement('button'); b.className = 'sm-item'; b.dataset.t = a.title.toLowerCase(); b.innerHTML = appIcon(a, 40) + '<span>' + a.title + '</span>';
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
    d.innerHTML = appIcon(a, 58) + '<span class="lbl">' + a.title + '</span>'; IC.appendChild(d); icons[a.id] = d; wireIcon(d, a.id);
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
    d.addEventListener('click', function () { if (d.dataset.moved) return; if (UI === 'ipad') ipOpen(id); else open(id); });
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
    var vw = WINS.clientWidth, vh = WINS.clientHeight, width = Math.min(a.w || 900, vw - 24), height = Math.min(a.h || 640, vh - 24);
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
  function focus(id) { var w = wins[id]; if (!w) return; focused = id; if (UI === 'standard' && id !== 'browser') markSide(id); w.el.style.zIndex = ++z; tutEvent('open'); ipFocused(id); if (UI !== 'desktop') Object.keys(wins).forEach(function (k) { wins[k].el.classList.toggle('bg', k !== id); }); Object.keys(wins).forEach(function (k) { wins[k].el.classList.toggle('focus', k === id); }); refreshTaskbar(); }
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
    var s = S.all(); D.style.background = ''; D.classList.remove('has-wall'); D.classList.toggle('wall-aurora', s.wallMode === 'aurora');
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
    $('clock').querySelector('.t').textContent = t; $('clock').querySelector('.d').textContent = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
    $('tb-date').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + '   ' + t; }

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

  // ---------- iPadOS-style interface ----------
  // Status bar, home screen with widgets, dock (favourites + recents), Search pill, home indicator (tap / swipe up = home,
  // swipe up and hold = app switcher), Control Center (swipe down from the top-right) and Spotlight (swipe down on the home screen).
  var ipClock = null, ipStat = null, TUT_KEY = 'herb.iptut', ipFrom = null, recents = [], FAV = ['browser', 'copperchat', 'games', 'movies', 'settings'];
  try { recents = JSON.parse(localStorage.getItem('herb.ip.recents') || '[]'); } catch (e) {}
  function iconRect(id) {
    var el = document.querySelector('#ipdock button[data-app="' + id + '"] .hicon') || (icons[id] && icons[id].querySelector('.hicon'));
    if (!el || UI !== 'ipad') return null; var r = el.getBoundingClientRect(); return r.width ? r : null;
  }
  function zoom(el, r, dir, done) {   // window <-> icon zoom, like opening/closing an app on iPad
    if (!r || !el.animate || S.get('anim') === false) { if (done) done(); return; }
    var b = el.getBoundingClientRect(); if (!b.width) { if (done) done(); return; }
    var sx = r.width / b.width, sy = r.height / b.height, dx = r.left - b.left, dy = r.top - b.top;
    var small = { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', opacity: .35, borderRadius: '90px' }, big = { transform: 'none', opacity: 1, borderRadius: '22px' };
    el.style.transformOrigin = '0 0';
    var a = el.animate(dir === 'in' ? [small, big] : [big, small], { duration: dir === 'in' ? 320 : 280, easing: 'cubic-bezier(.2,.9,.25,1)' });
    a.onfinish = function () { el.style.transformOrigin = ''; if (done) done(); };
  }
  function ipFocused(id) {   // called from focus()
    if (UI !== 'ipad') return;
    if (ipFrom) { var r = ipFrom; ipFrom = null; zoom(wins[id].el, r, 'in'); }
    if (byId[id] && id.indexOf('game:') !== 0) { recents = [id].concat(recents.filter(function (x) { return x !== id; })).slice(0, 6); try { localStorage.setItem('herb.ip.recents', JSON.stringify(recents)); } catch (e) {} drawDock(); }
  }
  function ipOpen(id) { ipFrom = iconRect(id); open(id); }
  function goHome() {
    var id = focused, w = id && wins[id];
    function hide() { Object.keys(wins).forEach(function (k) { wins[k].el.classList.add('min'); }); focused = null; refreshTaskbar(); tutEvent('home'); }
    if (w && !w.el.classList.contains('min') && UI === 'ipad') { document.body.classList.add('ip-going-home'); zoom(w.el, iconRect(id), 'out', function () { hide(); document.body.classList.remove('ip-going-home'); }); }
    else hide();
  }
  function drawDock() {
    var dock = $('ipdock'); if (!dock) return; dock.innerHTML = '';
    function btn(id) { var a = byId[id]; if (!a) return; var b = document.createElement('button'); b.dataset.app = id; b.title = a.title; b.innerHTML = appIcon(a, 64); b.onclick = function () { ipOpen(id); }; dock.appendChild(b); }
    FAV.forEach(btn);
    var rec = recents.filter(function (x) { return FAV.indexOf(x) < 0 && byId[x]; }).slice(0, 3);
    if (rec.length) { var sep = document.createElement('i'); sep.className = 'ipsep'; dock.appendChild(sep); rec.forEach(btn); }
  }
  // --- app switcher: every open app as a live, scaled-down card ---
  var swOn = false;
  function switcher(on) {
    swOn = on; document.body.classList.toggle('ip-switch', on); var host = $('ipsw'); host.innerHTML = ''; if (!on) return;
    var ids = Object.keys(wins).sort(function (a, b) { return recents.indexOf(a) - recents.indexOf(b); });
    if (!ids.length) { host.innerHTML = '<div class="ipsw-empty">No open apps</div>'; return; }
    var W = D.clientWidth, H = D.clientHeight, s = Math.min(.36, (W - 80) / (ids.length * W * 1.08)), cw = W * s, ch = H * s, gap = 30;
    var total = ids.length * cw + (ids.length - 1) * gap, x0 = Math.max(40, (W - total) / 2), y0 = (H - ch) / 2;
    ids.forEach(function (k, i) {
      var w = wins[k], x = x0 + i * (cw + gap);
      var card = document.createElement('div'); card.className = 'ipsw-card'; card.style.cssText = 'left:' + x + 'px;top:' + y0 + 'px;width:' + cw + 'px;height:' + ch + 'px';
      card.innerHTML = '<div class="ipsw-lab"><span></span></div><div class="ipsw-face">' + appIcon(w.app, Math.round(Math.min(cw, ch) * .32)) + '<b></b></div>';
      card.querySelector('.ipsw-lab span').textContent = w.app.title; card.querySelector('.ipsw-face b').textContent = w.app.title;
      host.appendChild(card);
      var sy = null, moved = 0;
      card.addEventListener('pointerdown', function (ev) { sy = ev.clientY; moved = 0; try { card.setPointerCapture(ev.pointerId); } catch (er) {} card.style.transition = 'none'; });
      card.addEventListener('pointermove', function (ev) { if (sy === null) return; moved = Math.min(0, ev.clientY - sy); card.style.transform = 'translateY(' + moved + 'px)'; card.style.opacity = 1 + moved / 450; });
      card.addEventListener('pointerup', function () { if (sy === null) return; sy = null; card.style.transition = '';
        if (moved < -110) { card.style.transform = 'translateY(-120%)'; card.style.opacity = 0; setTimeout(function () { close(k); recents = recents.filter(function (r) { return r !== k; }); drawDock(); switcher(true); }, 200); return; }   // swipe a card up to quit the app
        card.style.transform = ''; card.style.opacity = '';
        if (moved > -8) { switcher(false); ipFrom = null; open(k); } });
    });
  }
  // --- Control Center ---
  function ccToggle(on) {
    var cc = $('ipcc'); if (on === undefined) on = !cc.classList.contains('on'); cc.classList.toggle('on', on); if (on) paintCC();
  }
  function paintCC() {
    var st = null; try { st = JSON.parse(localStorage.getItem('herb.wisp.status') || 'null'); } catch (e) {}
    $('cc-net').querySelector('.v').textContent = !st ? 'Checking…' : st.best ? st.results[st.best].ms + ' ms · server ' + srvNum(st.best) : 'Offline';
    $('cc-net').classList.toggle('on', !!(st && st.best));
    $('cc-full').classList.toggle('on', !!document.fullscreenElement);
    var light = document.documentElement.classList.contains('th-light'); $('cc-dark').classList.toggle('on', !light); $('cc-dark').querySelector('.v').textContent = light ? 'Off' : 'On';
    $('cc-bright').value = S.get('ipBright') || 100; $('cc-b').style.setProperty('--bv', ((S.get('ipBright') || 100) - 35) / 65 * 100 + '%');
  }
  function applyBright() { var v = +S.get('ipBright') || 100; D.style.filter = v < 100 ? 'brightness(' + (v / 100) + ')' : ''; }
  // --- Spotlight ---
  function spot(on) {
    var sp = $('ipspot'); sp.classList.toggle('on', on); if (!on) return; var q = $('spq'); q.value = ''; spotDraw(''); setTimeout(function () { try { q.focus(); } catch (e) {} }, 30);
  }
  function spotDraw(q) {
    var list = $('spres'); list.innerHTML = ''; q = q.trim(); var ql = q.toLowerCase();
    var apps = APPS.filter(function (a) { return a.id.indexOf('game:') !== 0 && (!ql || a.title.toLowerCase().indexOf(ql) >= 0); }).slice(0, ql ? 6 : 8);
    if (apps.length) { var h = document.createElement('div'); h.className = 'sph'; h.textContent = ql ? 'Top hits' : 'Siri suggestions'; list.appendChild(h); }
    apps.forEach(function (a) { var r = document.createElement('button'); r.className = 'spr'; r.innerHTML = appIcon(a, 30) + '<span></span><small>App</small>'; r.querySelector('span').textContent = a.title; r.onclick = function () { spot(false); ipOpen(a.id); }; list.appendChild(r); });
    if (q) { var r = document.createElement('button'); r.className = 'spr web'; r.innerHTML = '<span class="spw">' + I('search', 16) + '</span><span></span><small>Web</small>'; r.querySelector('span:nth-child(2)').textContent = 'Search the web for “' + q + '”'; r.onclick = function () { spot(false); open('browser', { url: q }); }; list.appendChild(r); }
  }
  if (UI === 'ipad') {
    var bar = document.createElement('div'); bar.id = 'ipbar';
    bar.innerHTML = '<span id="ipclock"></span><span id="ipright"><span id="ipstat"></span><button id="ipcchit" title="Control Center">' + I('settings', 15, 2) + '</button></span>'; D.appendChild(bar);
    // widgets
    var wg = document.createElement('div'); wg.id = 'ipwidgets';
    wg.innerHTML = '<div class="wdg wclock"><div class="wday"></div><div class="wtime"></div><div class="wdate"></div></div>' +
      '<div class="wdg wnet"><div class="wh">' + I('proxy', 15, 2) + 'Herb proxy</div><div class="wbig"><span class="sdot" id="wdot"></span><span id="wms">…</span></div><div class="wsub" id="wsrv"></div></div>' +
      '<div class="wdg wsearch"><div class="wh">' + I('browser', 15, 2) + 'Web</div><form id="wform"><input id="wq" type="text" placeholder="Search or type a website" autocomplete="off"></form></div>';
    D.insertBefore(wg, $('icons'));
    $('wform').onsubmit = function (e) { e.preventDefault(); var v = $('wq').value.trim(); if (v) { $('wq').value = ''; open('browser', { url: v }); } };
    var dock = document.createElement('div'); dock.id = 'ipdock'; D.appendChild(dock); drawDock();
    var pill = document.createElement('button'); pill.id = 'ipsearch'; pill.innerHTML = I('search', 13, 2.2) + 'Search'; pill.onclick = function () { spot(true); }; D.appendChild(pill);
    // home indicator + gesture strip along the bottom edge
    var edge = document.createElement('div'); edge.id = 'ipedge'; D.appendChild(edge);
    var hb = document.createElement('div'); hb.id = 'iphomebar'; D.appendChild(hb);
    var g = null;
    edge.addEventListener('pointerdown', function (e) { g = { y: e.clientY, t: Date.now(), held: false }; try { edge.setPointerCapture(e.pointerId); } catch (er) {}
      g.timer = setTimeout(function () { if (g && g.dy < -60) { g.held = true; switcher(true); } }, 420); });
    edge.addEventListener('pointermove', function (e) { if (!g) return; g.dy = e.clientY - g.y; var w = focused && wins[focused];
      if (w && !swOn && g.dy < 0) { var k = Math.max(.6, 1 + g.dy / 900); w.el.style.transform = 'translateY(' + (g.dy * .5) + 'px) scale(' + k + ')'; w.el.style.borderRadius = '30px'; }
      clearTimeout(g.timer); var gg = g; g.timer = setTimeout(function () { if (g === gg && g.dy < -60 && !swOn) { g.held = true; var w2 = focused && wins[focused]; if (w2) { w2.el.style.transform = ''; } switcher(true); } }, 380); });
    edge.addEventListener('pointerup', function () { if (!g) return; clearTimeout(g.timer); var w = focused && wins[focused]; if (w) { w.el.style.transform = ''; w.el.style.borderRadius = ''; }
      var tap = Math.abs(g.dy || 0) < 6 && Date.now() - g.t < 400; if (!g.held && (tap || (g.dy || 0) < -50)) goHome(); g = null; });
    edge.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    var awakeT = null; function awake() { document.body.classList.add('hb-awake'); clearTimeout(awakeT); awakeT = setTimeout(function () { document.body.classList.remove('hb-awake'); }, 2500); }
    edge.addEventListener('pointerdown', awake);
    edge.addEventListener('dblclick', function () { switcher(true); });
    // app switcher layer
    var sw = document.createElement('div'); sw.id = 'ipsw'; D.appendChild(sw);
    sw.addEventListener('pointerdown', function (e) { if (e.target === sw) { switcher(false); goHome(); } });
    // Control Center
    var cc = document.createElement('div'); cc.id = 'ipcc';
    cc.innerHTML = '<div class="ccgrid">' +
      '<button class="cct wide" id="cc-net">' + I('proxy', 20, 2) + '<span class="n">Proxy</span><span class="v"></span></button>' +
      '<label class="cct tall" id="cc-b">' + '<input type="range" id="cc-bright" min="35" max="100" orient="vertical">' + '<span class="bic">' + I('appearance', 18, 2) + '</span></label>' +
      '<button class="cct" id="cc-dark">' + I('appearance', 20, 2) + '<span class="n">Dark mode</span><span class="v"></span></button>' +
      '<button class="cct" id="cc-full">' + I('max', 20, 2) + '<span class="n">Full screen</span></button>' +
      '<button class="cct" id="cc-cloak">' + I('shield', 20, 2) + '<span class="n">Cloak</span></button>' +
      '<button class="cct" id="cc-set">' + I('settings', 20, 2) + '<span class="n">Settings</span></button>' +
      '<button class="cct" id="cc-help">' + I('info', 20, 2) + '<span class="n">How to use</span></button>' +
      '</div>';
    D.appendChild(cc);
    $('ipcchit').onclick = function (e) { e.stopPropagation(); ccToggle(); };
    $('cc-net').onclick = function () { ccToggle(false); open('settings', { section: 'proxy' }); };
    $('cc-full').onclick = function () { document.fullscreenElement ? document.exitFullscreen() : (document.documentElement.requestFullscreen && document.documentElement.requestFullscreen()); setTimeout(paintCC, 300); };
    $('cc-dark').onclick = function () {   // flip between your dark theme and Snow
      var light = document.documentElement.classList.contains('th-light'), last = null; try { last = localStorage.getItem('herb.ip.darktheme'); } catch (e) {}
      if (light) { var t = last || 'emerald', T = HerbSettings.THEMES.filter(function (x) { return x[0] === t; })[0]; S.set('accent', T ? T[8] : '#34d399'); S.set('theme', t); }
      else { try { localStorage.setItem('herb.ip.darktheme', S.get('theme')); } catch (e) {} S.set('accent', '#16a34a'); S.set('theme', 'snow'); }
      paintCC(); };
    $('cc-cloak').onclick = function () { ccToggle(false); cloak(); };
    $('cc-set').onclick = function () { ccToggle(false); open('settings'); };
    $('cc-help').onclick = function () { ccToggle(false); startTutorial(); };
    $('cc-bright').oninput = function () { S.set('ipBright', +this.value); applyBright(); $('cc-b').style.setProperty('--bv', (this.value - 35) / 65 * 100 + '%'); };
    applyBright();
    // Spotlight
    var sp = document.createElement('div'); sp.id = 'ipspot';
    sp.innerHTML = '<div class="spbox"><div class="spin">' + I('search', 18, 2) + '<input id="spq" type="text" placeholder="Search" autocomplete="off" spellcheck="false"></div><div id="spres"></div></div>'; D.appendChild(sp);
    $('spq').addEventListener('input', function () { spotDraw(this.value); });
    $('spq').addEventListener('keydown', function (e) { if (e.key === 'Escape') spot(false); if (e.key === 'Enter') { var f = $('spres').querySelector('.spr'); if (f) f.click(); } });
    sp.addEventListener('pointerdown', function (e) { if (e.target === sp) spot(false); });
    // gestures on the home screen / status bar: swipe down from the top-right = Control Center, swipe down elsewhere = Spotlight
    var hs = null;
    D.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('#ipcc') && !e.target.closest('#ipcchit') && $('ipcc').classList.contains('on')) ccToggle(false);
      if (e.target.closest('.win') || e.target.closest('#ipdock') || e.target.closest('#ipcc') || e.target.closest('#ipspot') || e.target.closest('#ipsw') || e.target.closest('#ipedge') || e.target.closest('.wdg')) return;
      hs = { x: e.clientX, y: e.clientY };
    });
    D.addEventListener('pointerup', function (e) { if (!hs) return; var dy = e.clientY - hs.y, dx = Math.abs(e.clientX - hs.x); var top = hs.y < 40, right = hs.x > innerWidth * .66; hs = null;
      if (dy > 60 && dx < 80) { if (top && right) ccToggle(true); else if (!document.body.classList.contains('app-open')) spot(true); } });
    addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (swOn) switcher(false); ccToggle(false); spot(false); } });
    ipClock = $('ipclock'); ipStat = $('ipstat');
  }
  function paintIp() {
    if (!ipClock) return; var d = new Date(), h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2), c24 = S.get('clock24');
    var t = (c24 ? ('0' + h).slice(-2) : ((h + 11) % 12 + 1)) + ':' + m;
    ipClock.textContent = t + (c24 ? '' : (h < 12 ? ' AM' : ' PM')) + '  ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    var cls = $('sdot').className.replace('sdot', '').trim();
    ipStat.innerHTML = '<span class="sdot ' + cls + '"></span>' + $('stxt').textContent;
    var wc = document.querySelector('#ipwidgets .wclock'); if (wc) { wc.querySelector('.wday').textContent = d.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase(); wc.querySelector('.wtime').textContent = t; wc.querySelector('.wdate').textContent = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }); }
    var st = null; try { st = JSON.parse(localStorage.getItem('herb.wisp.status') || 'null'); } catch (e) {}
    if ($('wms')) { $('wdot').className = 'sdot ' + cls; $('wms').textContent = !st ? 'Checking' : st.best ? st.results[st.best].ms + ' ms' : 'Offline'; $('wsrv').textContent = st && st.best ? 'Server ' + srvNum(st.best) + ' · ' + HerbWisp.workingCount()[0] + ' of ' + HerbWisp.workingCount()[1] + ' online' : 'No server reachable'; }
  }

  // ---------- iPad tutorial ----------
  var tut = null, tutEl = null;
  var TUT_STEPS = [
    ['Welcome to Herb', 'This works like iPadOS. Tap any app to open it. Try opening one now.', 'Skip'],
    ['Now go back home', 'Tap the <b>bar near the bottom</b>, or start your swipe up <b>on that bar</b> (not the very edge of the screen, which iPadOS uses to leave Safari). Swipe up and hold to see all your open apps.', 'Skip'],
    ['You’ve got it', 'Swipe down on the home screen to search, and swipe down from the top-right corner (or tap ⚙ in the status bar) for Control Center.', 'Done']
  ];
  function renderTut() {
    if (!tut) return; if (!tutEl) { tutEl = document.createElement('div'); tutEl.id = 'tut'; D.appendChild(tutEl); }
    var st = TUT_STEPS[tut.step]; var dots = TUT_STEPS.map(function (x, i) { return '<i' + (i <= tut.step ? ' class="on"' : '') + '></i>'; }).join('');
    tutEl.innerHTML = '<div class="steps">' + dots + '</div><h3>' + st[0] + '</h3><p>' + st[1] + '</p><div class="btns"><button id="tut-skip" class="' + (tut.step === 2 ? 'primary' : '') + '">' + st[2] + '</button></div>';
    tutEl.classList.add('on'); $('tut-skip').onclick = endTutorial;
    var h = $('iphomebar'); if (h) h.classList.toggle('pulse', tut.step === 1);
  }
  function startTutorial() { if (UI !== 'ipad') return false; goHome(); tut = { step: 0 }; renderTut(); return true; }
  function endTutorial() { tut = null; if (tutEl) tutEl.classList.remove('on'); var h = $('iphomebar'); if (h) h.classList.remove('pulse'); try { localStorage.setItem(TUT_KEY, '1'); } catch (e) {} }
  function tutEvent(ev) {
    if (!tut) return;
    if (ev === 'open' && tut.step === 0) { tut.step = 1; renderTut(); }
    else if (ev === 'home' && tut.step === 1) { tut.step = 2; renderTut(); }
  }

  // ---------- standard interface: sidebar (Home + apps), collapsible to an icon rail ----------
  var sideActive = 'home', RAIL = 'herb.side.rail';
  // Herb's own mark (the sprout from images/logo/herb.svg), drawn in the theme's accent
  var SPROUT = '<svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 56V31" stroke="currentColor" stroke-opacity=".55" stroke-width="4.5" stroke-linecap="round"/><path d="M32 33C19 33 10 24 10 11c13 0 22 9 22 22z" fill="currentColor"/><path d="M32 42c11 0 20-8 20-20-11 0-20 8-20 20z" fill="currentColor" fill-opacity=".7"/></svg>';
  function drawSide() {
    if (UI !== 'standard') return; var nav = $('sd-apps'); nav.innerHTML = '';
    var items = [{ id: 'home', title: 'Home', icon: 'home' }].concat(APPS.filter(function (a) { return a.id !== 'browser' && a.id.indexOf('game:') !== 0 && !a.store; }));   // App Store installs open from the Store (or herb://), not the sidebar
    items.forEach(function (a) {
      var b = document.createElement('button'); b.className = 'sd-item' + (sideActive === a.id ? ' on' : ''); b.dataset.app = a.id; b.title = a.title;
      b.innerHTML = '<span class="sd-ic">' + I(a.icon || 'apps', 18, 1.8) + '</span><span class="sd-l"></span>'; b.querySelector('.sd-l').textContent = a.title;
      b.onclick = function () { if (a.id === 'home') { toBrowser({ herb: 'home' }); markSide('home'); } else open(a.id); }; nav.appendChild(b);
    });
  }
  if (UI === 'standard') {
    var side = document.createElement('aside'); side.id = 'side';
    side.innerHTML = '<div class="sd-top"><span class="sd-logo">' + SPROUT + '<b>herb</b></span><button id="sd-rail" title="Collapse sidebar">' + I('rail', 17, 1.8) + '</button></div>' +
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
    v.open.forEach(function (id) {
      if (!byId[id]) return;
      var hm = id === 'browser' && /^herb:\/\/([\w-]+)$/.exec(v.url || '');
      if (hm && UI !== 'standard') { if (byId[hm[1]]) open(hm[1]); else open('browser'); return; }   // an app tab from Standard mode comes back as its own window
      open(id, id === 'browser' && v.url ? { url: v.url } : undefined);
    });
    if (v.focus && wins[v.focus]) focus(v.focus); return v.open.length > 0;
  }

  // ---------- public API ----------
  window.HerbDesktop = {
    open: open, close: close, apps: APPS, cloak: cloak,
    // apps that only some people may see (e.g. Admin) are added/removed at runtime
    addApp: function (a) { if (byId[a.id]) return; APPS.push(a); byId[a.id] = a; addTb(a); addSm(a); addIc(a); layoutIcons(); drawSide(); drawDock(); },
    removeApp: function (id) {
      var a = byId[id]; if (!a) return; if (wins[id]) close(id);
      APPS.splice(APPS.indexOf(a), 1); delete byId[id];
      [tbBtns, smItems, icons].forEach(function (m) { if (m[id]) { m[id].remove(); delete m[id]; } });
      layoutIcons(); refreshTaskbar(); drawSide(); drawDock();
    },
    recheck: function () { return HerbWisp.check(); },
    apply: function () { if (((S.get('ui') || 'desktop')) !== UI) { saveSession(); location.reload(); return; } HerbSettings.apply(); HerbSettings.disguise(); applyLayout(); applyWallpaper(); layoutIcons(); tick(); },
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
  setTimeout(function () { var hb = document.getElementById('hboot'); if (hb) hb.style.display = 'none'; }, 3500);   // the loader's version label
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
