// Account settings sync: while signed in, Herb settings follow you across devices (live).
// Not synced on purpose: interface mode (desktop/standard/iPad is per device), icon positions, and the uploaded wallpaper image (too big).
(function () {
  if (!window.HerbAuth || !HerbAuth.available()) return;
  var KEYS = { settings: 'herb.settings', transport: 'herb.transport', recent: 'herb.recentgames', movies: 'herb.movies.net', lite: 'herb.ffLite' };
  var ref = null, last = '', timer = 0, applying = false;
  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function wr(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function bundle() {
    var o = {}, s = {}; try { s = JSON.parse(rd(KEYS.settings) || '{}'); } catch (e) {} delete s.ui; o.settings = s;
    ['transport', 'recent', 'movies', 'lite'].forEach(function (k) { var v = rd(KEYS[k]); if (v != null) o[k] = v; });
    return JSON.stringify(o);
  }
  function applyBundle(str) {
    var o; try { o = JSON.parse(str); } catch (e) { return; }
    applying = true;
    var cur = {}; try { cur = JSON.parse(rd(KEYS.settings) || '{}'); } catch (e) {}
    var next = Object.assign({}, o.settings || {}); if (cur.ui) next.ui = cur.ui; else delete next.ui;   // keep this device's interface mode
    wr(KEYS.settings, JSON.stringify(next));
    ['transport', 'recent', 'movies', 'lite'].forEach(function (k) { if (o[k] != null) wr(KEYS[k], o[k]); });
    try { HerbSettings.apply(); HerbDesktop.apply(); } catch (e) {}
    applying = false;
  }
  function push() { timer = 0; if (!ref) return; var b = bundle(); if (b === last) return; last = b; ref.set(b).catch(function () {}); }
  function schedule() { if (applying || !ref) return; clearTimeout(timer); timer = setTimeout(push, 1200); }
  // changes made in app windows (same origin) arrive here as storage events
  addEventListener('storage', function (e) { if (e.key && Object.keys(KEYS).some(function (k) { return KEYS[k] === e.key; })) schedule(); });
  addEventListener('herb:settings', schedule);

  HerbAuth.onChange(function (st) {
    if (ref) { try { ref.off(); } catch (e) {} ref = null; }
    if (!st.user) return;
    var r = HerbAuth.db().ref('herb/settings/' + st.user.uid), first = true;
    r.on('value', function (snap) {
      var v = snap.val();
      if (first) { first = false; ref = r;
        if (typeof v === 'string' && v) { last = v; applyBundle(v); } else { last = ''; push(); }   // new account: upload this device's settings
        return; }
      if (typeof v === 'string' && v !== last) { last = v; applyBundle(v); }   // another device changed something
    }, function () {});
  });
})();
