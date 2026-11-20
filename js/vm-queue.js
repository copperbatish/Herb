// Herb VM queue: at most MAX people can run the full Firefox at once; everyone else waits in a live line.
// State lives in Firebase Realtime Database under /herbvm/sessions (see rules). No server of our own is needed.
// Requires /js/vendor/firebase-app-compat.js and /js/vendor/firebase-database-compat.js.
(function () {
  'use strict';
  var MAX = 3, BEAT_MS = 20000, STALE_MS = 150000, CONNECT_TIMEOUT_MS = 8000;
  var LIMIT_MS = (window.__HERB_LIMIT_MS | 0) || 20 * 60 * 1000, GRACE_MS = 20000;   // __HERB_LIMIT_MS: test-only override   // everyone gets 20 solid minutes in a spot, then the next person's turn
  var CFG = { apiKey: 'AIzaSyB05wOLEOkrp7FEqbS_ryvby1kBMfD9WNA', authDomain: 'copperchat-4cb91.firebaseapp.com',
    databaseURL: 'https://copperchat-4cb91-default-rtdb.firebaseio.com', projectId: 'copperchat-4cb91',
    storageBucket: 'copperchat-4cb91.firebasestorage.app', messagingSenderId: '1045463824701', appId: '1:1045463824701:web:6c40cf5167c05bb1a56d54' };
  var app = null, db = null, offset = 0;
  function init() {
    if (db) return true;
    try { app = firebase.apps.filter(function (a) { return a.name === 'herbvm'; })[0] || firebase.initializeApp(CFG, 'herbvm'); db = app.database(); db.ref('.info/serverTimeOffset').on('value', function (s) { offset = s.val() || 0; }); return true; }
    catch (e) { return false; }
  }
  function now() { return Date.now() + offset; }
  function live(entries) { // [{key, joined, beat, since}] -> fresh and within their time, ordered by arrival
    var t = now();
    return entries.filter(function (e) { return typeof e.joined === 'number' && typeof e.beat === 'number' && e.beat > t - STALE_MS && !(typeof e.since === 'number' && t > e.since + LIMIT_MS + GRACE_MS); })
      .sort(function (a, b) { return a.joined - b.joined || (a.key < b.key ? -1 : 1); });
  }
  function toEntries(snap) { var out = []; snap.forEach(function (c) { var v = c.val() || {}; out.push({ key: c.key, joined: v.joined, beat: v.beat, since: v.since }); }); return out; }

  window.HerbQueue = {
    MAX: MAX, LIMIT_MS: LIMIT_MS,
    available: function () { return typeof firebase !== 'undefined' && init(); },
    // read-only: how many sessions are running right now
    watch: function (cb) {
      if (!this.available()) return function () {};
      var r = db.ref('herbvm/sessions'), fn = function (s) { var l = live(toEntries(s)); cb({ total: l.length, active: Math.min(l.length, MAX), waiting: Math.max(0, l.length - MAX), full: l.length >= MAX }); };
      r.on('value', fn); return function () { r.off('value', fn); };
    },
    // take a place in line. cb({state:'connecting'|'waiting'|'active'|'unavailable', position, ahead, active, total})
    join: function (mode, cb) {
      var dead = false, joined = false, ctl = { leave: function () { dead = true; clearInterval(hb); clearTimeout(to); try { me && me.remove(); sref && sref.off('value', onVal); } catch (e) {} } };
      var hb = null, to = null, me = null, sref = null, sinceSet = false;
      if (!this.available()) { setTimeout(function () { cb({ state: 'unavailable' }); }, 0); return ctl; }
      sref = db.ref('herbvm/sessions');
      function register() {
        me = sref.push(); me.onDisconnect().remove();
        me.set({ joined: firebase.database.ServerValue.TIMESTAMP, beat: firebase.database.ServerValue.TIMESTAMP, mode: String(mode || 'firefox').slice(0, 12) })
          .then(function () { joined = true; }, function () { if (!dead) { dead = true; cb({ state: 'unavailable' }); } });
      }
      function onVal(snap) {
        if (dead) return; var l = live(toEntries(snap)), key = me && me.key, i = -1;
        l.forEach(function (e, n) { if (e.key === key) i = n; });
        // our entry was removed (e.g. laptop slept and someone cleaned it up): get back in line
        if (joined && i < 0 && !toEntries(snap).some(function (e) { return e.key === key; })) { joined = false; sinceSet = false; register(); return; }
        // tidy up entries whose owner vanished without leaving (any client may do this)
        var t = now(); snap.forEach(function (c) { var v = c.val() || {};
          if (typeof v.beat === 'number' && v.beat < t - STALE_MS * 2) c.ref.remove();                                    // owner vanished
          else if (typeof v.since === 'number' && t > v.since + LIMIT_MS + GRACE_MS) c.ref.remove(); });                   // ran past 20 minutes
        if (i < 0) { cb({ state: 'connecting' }); return; }
        if (i < MAX) {
          var mine = toEntries(snap).filter(function (e) { return e.key === key; })[0] || {};
          if (typeof mine.since !== 'number' && !sinceSet) { sinceSet = true; me.update({ since: firebase.database.ServerValue.TIMESTAMP }); }   // the 20 minutes start now
          var endsAt = Date.now() + (typeof mine.since === 'number' ? mine.since + LIMIT_MS - now() : LIMIT_MS);
          if (endsAt <= Date.now()) { dead = true; ctl.leave(); cb({ state: 'expired' }); return; }
          cb({ state: 'active', position: 0, ahead: 0, active: Math.min(l.length, MAX), total: l.length, endsAt: endsAt });
        }
        else cb({ state: 'waiting', position: i - MAX + 1, ahead: i - MAX, active: MAX, total: l.length });
      }
      to = setTimeout(function () { if (!joined && !dead) { dead = true; try { sref.off('value', onVal); } catch (e) {} cb({ state: 'unavailable' }); } }, CONNECT_TIMEOUT_MS);
      register(); sref.on('value', onVal, function () { if (!dead) { dead = true; cb({ state: 'unavailable' }); } });
      hb = setInterval(function () { if (me && joined) me.update({ beat: firebase.database.ServerValue.TIMESTAMP }); }, BEAT_MS);
      addEventListener('pagehide', function () { try { me && me.remove(); } catch (e) {} });
      return ctl;
    },
  };
})();
