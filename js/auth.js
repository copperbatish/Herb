// Herb accounts: username + password only (no email). Under the hood Firebase Auth needs an address-shaped id, so a
// username becomes "<name>@herb.local"; that address is never shown, never receives mail, and can't be used for recovery.
// Requires /js/vendor/firebase-{app,auth,database}-compat.js. Safe to include in the shell and in app iframes.
(function () {
  var CFG = { apiKey: 'AIzaSyB05wOLEOkrp7FEqbS_ryvby1kBMfD9WNA', authDomain: 'copperchat-4cb91.firebaseapp.com',
    databaseURL: 'https://copperchat-4cb91-default-rtdb.firebaseio.com', projectId: 'copperchat-4cb91',
    storageBucket: 'copperchat-4cb91.firebasestorage.app', messagingSenderId: '1045463824701', appId: '1:1045463824701:web:6c40cf5167c05bb1a56d54' };
  var DOMAIN = '@herb.local', NAME_RE = /^[a-z0-9_]{3,20}$/;
  var app, auth, db, ok = false, listeners = [];
  var state = { ready: false, user: null, name: null, admin: false, owner: false };
  try {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      app = firebase.apps.filter(function (a) { return a.name === 'herbvm'; })[0] || firebase.initializeApp(CFG, 'herbvm');
      auth = app.auth(); db = app.database(); ok = true;
    }
  } catch (e) { ok = false; }

  function emit() { listeners.forEach(function (f) { try { f(state); } catch (e) {} }); }
  function clean(u) { return String(u || '').trim().toLowerCase(); }
  function nice(e) {
    var c = e && e.code || '';
    return ({ 'auth/invalid-credential': 'Wrong username or password.', 'auth/wrong-password': 'Wrong username or password.', 'auth/user-not-found': 'Wrong username or password.',
      'auth/email-already-in-use': 'That username is taken.', 'auth/weak-password': 'Password needs at least 8 characters.', 'auth/too-many-requests': 'Too many tries. Wait a minute.',
      'auth/network-request-failed': 'No connection.', 'auth/operation-not-allowed': 'Sign-in is switched off for this site.' })[c] || 'Something went wrong. Try again.';
  }
  function checkName(u) { if (!NAME_RE.test(u)) throw { friendly: 'Username: 3-20 letters, numbers or _ (no spaces).' }; }
  function checkPass(p) { if (!p || p.length < 8) throw { friendly: 'Password needs at least 8 characters.' }; }
  function wrap(p) { return p.catch(function (e) { throw new Error(e && e.friendly ? e.friendly : nice(e)); }); }

  // After sign-in: make sure the profile rows exist, then learn whether this account is an admin.
  function refresh(user) {
    state.user = user || null; state.name = null; state.admin = false; state.owner = false;
    if (!user) { state.ready = true; emit(); return; }
    var name = clean((user.email || '').replace(DOMAIN, ''));
    state.name = name;
    Promise.all([
      db.ref('herb/owner').once('value').catch(function () { return null; }),
      db.ref('herb/admins/' + user.uid).once('value').catch(function () { return null; }),
    ]).then(function (r) {
      state.owner = !!(r[0] && r[0].val() === user.uid);
      state.admin = state.owner || !!(r[1] && r[1].exists());
      state.ready = true; emit();
    });
    // idempotent profile + username claim (a sign-up that was interrupted heals itself on the next sign-in)
    db.ref('herb/users/' + user.uid).set({ name: name, at: firebase.database.ServerValue.TIMESTAMP }).catch(function () {});
    db.ref('herb/usernames/' + name).set(user.uid).catch(function () {});
  }
  if (ok) auth.onAuthStateChanged(refresh); else { state.ready = true; }

  // ---- presence: one row per open Herb tab, removed automatically on disconnect (admins count these) ----
  var presenceOn = false, cid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
  function startPresence() {
    if (!ok || presenceOn) return; presenceOn = true;
    var me = db.ref('herb/presence/' + cid), ts = firebase.database.ServerValue.TIMESTAMP;
    db.ref('.info/connected').on('value', function (s) {
      if (!s.val()) return; me.onDisconnect().remove(); push();
    });
    function push() { var o = { t: ts }; if (state.user) { o.uid = state.user.uid; o.name = state.name || ''; } me.set(o).catch(function () {}); }
    listeners.push(function () { push(); });
    setInterval(push, 60000);
  }

  window.HerbAuth = {
    available: function () { return ok; },
    state: function () { return state; },
    onChange: function (f) { listeners.push(f); if (state.ready) f(state); },
    startPresence: startPresence,
    db: function () { return db; },
    signIn: function (u, p) { return wrap(Promise.resolve().then(function () { u = clean(u); checkName(u); if (!p) throw { friendly: 'Enter your password.' }; return auth.signInWithEmailAndPassword(u + DOMAIN, p); })); },
    signUp: function (u, p) { return wrap(Promise.resolve().then(function () { u = clean(u); checkName(u); checkPass(p); return auth.createUserWithEmailAndPassword(u + DOMAIN, p); })); },
    signOut: function () { return auth ? auth.signOut() : Promise.resolve(); },
    clean: clean,
    token: function (force) { return auth && auth.currentUser ? auth.currentUser.getIdToken(!!force) : Promise.resolve(null); },
  };
})();
