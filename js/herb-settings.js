// Herb settings store (localStorage) + theme application. Loaded by the shell and every app page.
(function () {
  var KEY = 'herb.settings';
  var DEFAULTS = {
    theme: 'emerald', accent: '#34d399', clock24: false, blur: true, anim: true, particles: true,
    search: 'duckduckgo', panicKey: '`', panicUrl: 'https://classroom.google.com',
    copperchatUrl: '',   // empty = Herb's own servers (/copperchat/); a full address overrides it
    vmUrl: '',
    ui: 'desktop', disguise: 'none', autoBlank: false, disguiseTitle: '', disguiseIcon: '',
    // desktop + taskbar
    taskbarPos: 'bottom', taskbarSize: 'medium', taskbarAlign: 'center', tbLayout: 'dock', taskbarAutohide: false, showClock: true, showDate: true, showTray: true,
    showIcons: true, iconSize: 'medium', iconLabels: true, scene: true, wallMode: 'theme', wallColor: '#0b1c15', wallFit: 'cover', winRadius: 'round', iconStyle: 'glow',
  };
  // Each theme is a full palette: base + three layered surfaces, text, muted text and a default accent (borders are tinted with the accent).
  // [id, name, base, surface, surface-2, surface-3, text, muted, accent, light?]
  var THEMES = [
    ['emerald', 'Emerald Night', '#040706', '#0a0e0c', '#111715', '#16201c', '#e9f1ec', '#8a9a91', '#34d399'],
    ['fern', 'Fern', '#050a08', '#08110d', '#0d1b14', '#13261c', '#d4e6dc', '#92ab9e', '#c2ffe0'],
    ['ocean', 'Deep Ocean', '#04060f', '#070a17', '#0b0f23', '#11162e', '#d6dbe6', '#8d94a8', '#6ec1ff'],
    ['nord', 'Nord', '#0d1117', '#11161e', '#161c25', '#1c232e', '#d8dee9', '#8a93a4', '#88c0d0'],
    ['frost', 'Frost', '#050a14', '#08101e', '#0c1628', '#121e34', '#d8e4f0', '#8d9db5', '#b4e1ff'],
    ['indigo', 'Indigo', '#02020f', '#06061a', '#0c0c28', '#131338', '#d4dbff', '#7c88c8', '#818cf8'],
    ['violet', 'Violet', '#030007', '#07000f', '#0e0018', '#160024', '#ead8ff', '#9070b8', '#a855f7'],
    ['dusk', 'Dusk', '#07000f', '#0f0020', '#180030', '#230042', '#f5d6fd', '#a874c4', '#e879f9'],
    ['rose', 'Rose', '#0c0405', '#11070a', '#170a0d', '#1d0d11', '#f0d8dc', '#b08791', '#ff6b8b'],
    ['holly', 'Holly', '#04100a', '#071710', '#0b1f16', '#10291d', '#ece3d2', '#a59d88', '#f0505f'],
    ['sunrise', 'Ember', '#0f0500', '#160800', '#200c02', '#2b1205', '#fde0c4', '#b07a55', '#f97316'],
    ['amber', 'Amber', '#0c0704', '#120b07', '#180f09', '#1f140c', '#ecdac9', '#a88a73', '#ffb36b'],
    ['mocha', 'Mocha', '#0d0806', '#140c08', '#1c120c', '#261911', '#e8d5b5', '#a88c6c', '#ec6a3c'],
    ['graphite', 'Graphite', '#060708', '#0b0c0e', '#131518', '#1a1d21', '#e5e7eb', '#9ca3af', '#cbd5e1'],
    ['mono', 'Mono', '#000000', '#060606', '#0c0c0c', '#141414', '#e5e5e5', '#8a8a8a', '#ffffff'],
    ['void', 'Void', '#000000', '#050405', '#0b090b', '#131013', '#ece2ea', '#988a95', '#ff82e8'],
    ['snow', 'Snow', '#eef4f0', '#ffffff', '#f3f7f4', '#e6eee9', '#13241b', '#5b6f64', '#16a34a', 1],
    ['sky', 'Sky', '#eaf1fa', '#ffffff', '#f2f6fc', '#e2eaf5', '#162a40', '#52677f', '#2563eb', 1],
    ['paper', 'Paper', '#f4eee3', '#fffdf8', '#f7f1e6', '#ece3d4', '#3b2f22', '#7a6a55', '#c2410c', 1],
  ];
  // a theme name saved on another device that this build doesn't have falls back to the default
  function themeOf(s) { return THEMES.some(function (t) { return t[0] === s.theme; }) ? s.theme : 'emerald'; }
  var ACCENTS = ['#34d399', '#2dd4bf', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#fb7185'];
  var ENGINES = {
    duckduckgo: ['DuckDuckGo', 'https://duckduckgo.com/?q='],
    google: ['Google', 'https://www.google.com/search?q='],
    bing: ['Bing', 'https://www.bing.com/search?q='],
    brave: ['Brave', 'https://search.brave.com/search?q='],
  };
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); }
  function apply(doc) {
    doc = doc || document; var s = load(), r = doc.documentElement;
    var th = themeOf(s), ac = s.accent;
    THEMES.forEach(function (t) { r.classList.remove('th-' + t[0]); });
    r.classList.add('th-' + th);
    var T = THEMES.filter(function (t) { return t[0] === th; })[0], light = !!T[9], arg = hexToRgb(ac), base = hexToRgb(T[2]);
    r.classList.toggle('th-light', light);
    var V = { '--surface': T[3], '--surface-2': T[4], '--surface-3': T[5], '--text': T[6], '--muted': T[7],
      '--border': 'rgba(' + arg + ',' + (light ? .2 : .13) + ')', '--glass': 'rgba(' + hexToRgb(T[3]) + ',' + (light ? .72 : .62) + ')',
      '--bg': 'radial-gradient(1100px 680px at 78% -12%,rgba(' + arg + ',' + (light ? .16 : .17) + '),transparent 62%),radial-gradient(900px 620px at -10% 115%,rgba(' + arg + ',.07),transparent 60%),' + T[2],
      '--hill': 'rgba(' + base + ',.92)', '--hill-2': T[2], '--on-accent': light ? '#ffffff' : '#03110a' };
    for (var k in V) r.style.setProperty(k, V[k]);
    r.style.setProperty('--accent', ac); r.style.setProperty('--accent-rgb', arg);
    r.classList.toggle('no-blur', !s.blur); r.classList.toggle('no-anim', !s.anim); r.classList.toggle('no-particles', !s.particles);
    r.setAttribute('data-tbpos', s.taskbarPos); r.setAttribute('data-tbsize', s.taskbarSize); r.setAttribute('data-tbalign', s.taskbarAlign); r.setAttribute('data-tblayout', s.tbLayout || 'dock');
    r.setAttribute('data-iconsize', s.iconSize); r.setAttribute('data-radius', s.winRadius);
    r.classList.toggle('tb-autohide', !!s.taskbarAutohide && s.ui === 'desktop'); r.classList.toggle('no-icons', !s.showIcons); r.classList.toggle('no-labels', !s.iconLabels);
    r.classList.toggle('no-date', !s.showDate); r.classList.toggle('no-clock', !s.showClock); r.classList.toggle('no-tray', !s.showTray);
    r.classList.toggle('icons-color', s.iconStyle === 'color');
    r.classList.toggle('no-scene', !s.scene || s.wallMode !== 'theme');
  }
  var H = {
    DEFAULTS: DEFAULTS, THEMES: THEMES,  ACCENTS: ACCENTS, ENGINES: ENGINES,
    all: load, get: function (k) { return load()[k]; },
    set: function (k, v) {
      var s = load(); s[k] = v; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
      apply(); try { if (parent !== window && parent.HerbDesktop) parent.HerbDesktop.apply(); } catch (e) {}
      window.dispatchEvent(new CustomEvent('herb:settings', { detail: k }));
    },
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} apply(); try { if (parent !== window && parent.HerbDesktop) parent.HerbDesktop.apply(); } catch (e) {} },
    apply: apply,
    // Custom wallpaper: the original file, kept in IndexedDB at full quality (never resized or recompressed).
    wall: {
      db: function () {
        return new Promise(function (ok, no) {
          var r = indexedDB.open('herb-wall', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('img'); };
          r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
        });
      },
      // stored as raw bytes + type: Safari can refuse to put File/Blob objects in IndexedDB, but always accepts an ArrayBuffer
      put: function (blob) {
        return blob.arrayBuffer().then(function (buf) { return H.wall.db().then(function (db) { return new Promise(function (ok, no) {
          var t = db.transaction('img', 'readwrite'); t.objectStore('img').put({ type: blob.type || 'image/jpeg', name: blob.name || '', buf: buf }, 'current');
          t.oncomplete = function () { ok(); }; t.onerror = function () { no(t.error || new Error('storage blocked')); }; t.onabort = function () { no(t.error || new Error('storage full or blocked')); };
        }); }); });
      },
      get: function () { return H.wall.db().then(function (db) { return new Promise(function (ok) { var q = db.transaction('img').objectStore('img').get('current'); q.onsuccess = function () { var v = q.result; ok(!v ? null : v.buf ? new Blob([v.buf], { type: v.type }) : v); }; q.onerror = function () { ok(null); }; }); }).catch(function () { return null; }); },
      clear: function () { return H.wall.db().then(function (db) { return new Promise(function (ok) { var t = db.transaction('img', 'readwrite'); t.objectStore('img').delete('current'); t.oncomplete = ok; t.onerror = ok; }); }).catch(function () {}); },
    },
  };
  // Tab disguise: make Herb's browser tab look like a school site (title + icon). Applied to the top-level tab Herb is in.
  var DISGUISES = {
    none: null,
    coursera: ['Dashboard | Coursera', 'coursera.org'], classroom: ['Classes', 'classroom.google.com'], docs: ['Untitled document - Google Docs', 'docs.google.com'],
    drive: ['My Drive - Google Drive', 'drive.google.com'], khan: ['Dashboard | Khan Academy', 'khanacademy.org'], canvas: ['Dashboard', 'instructure.com'],
    desmos: ['Desmos | Graphing Calculator', 'desmos.com'], quizlet: ['Your Sets | Quizlet', 'quizlet.com'],
  };
  H.DISGUISES = DISGUISES;
  var orig = null;
  H.disguise = function () {
    var s = load(), d = document; try { if (window.top.document) d = window.top.document; } catch (e) {}
    if (!orig) { var l0 = d.querySelector('link[rel~="icon"]'); orig = { t: d.title, i: l0 ? l0.href : '/images/logo/herb.svg' }; }
    var p = DISGUISES[s.disguise], title = orig.t, icon = orig.i;
    if (s.disguise === 'custom') { title = s.disguiseTitle || orig.t; icon = s.disguiseIcon || orig.i; }
    else if (p) { title = p[0]; icon = 'https://www.google.com/s2/favicons?domain=' + p[1] + '&sz=64'; }
    d.title = title;
    d.querySelectorAll('link[rel~="icon"]').forEach(function (l) { l.remove(); });
    var ln = d.createElement('link'); ln.rel = 'icon'; ln.href = icon; d.head.appendChild(ln);
  };
  window.HerbSettings = H; apply();
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(); });
})();
