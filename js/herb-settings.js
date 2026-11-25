// Herb settings store (localStorage) + theme application. Loaded by the shell and every app page.
(function () {
  var KEY = 'herb.settings';
  var DEFAULTS = {
    theme: 'emerald', accent: '#34d399', clock24: false, blur: true, anim: true, particles: true,
    search: 'duckduckgo', panicKey: '`', panicUrl: 'https://classroom.google.com',
    copperchatUrl: '',   // empty = Herb's own servers (/copperchat/); a full address overrides it
    vmUrl: '',
    ui: 'desktop',
    // desktop + taskbar
    taskbarPos: 'bottom', taskbarSize: 'medium', taskbarAlign: 'left', taskbarAutohide: false, showClock: true, showDate: true, showTray: true,
    showIcons: true, iconSize: 'medium', iconLabels: true, scene: true, wallMode: 'theme', wallColor: '#0b1c15', wallFit: 'cover', winRadius: 'round', iconStyle: 'glow',
  };
  var THEMES = [
    ['emerald', 'Emerald Night'], ['dusk', 'Dusk'], ['ocean', 'Deep Ocean'],
    ['sunrise', 'Sunrise'], ['graphite', 'Graphite'], ['snow', 'Snow'],
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
    r.style.setProperty('--accent', ac); r.style.setProperty('--accent-rgb', hexToRgb(ac));
    r.classList.toggle('no-blur', !s.blur); r.classList.toggle('no-anim', !s.anim); r.classList.toggle('no-particles', !s.particles);
    r.setAttribute('data-tbpos', s.taskbarPos); r.setAttribute('data-tbsize', s.taskbarSize); r.setAttribute('data-tbalign', s.taskbarAlign);
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
  window.HerbSettings = H; apply();
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(); });
})();
