// Herb – Wisp server list + automatic health check.
// At startup Herb probes every server below, then uses the fastest one that answers.
// >>> Edit the defaults to add/remove servers. <<<
(function () {
  var DEFAULTS = {
    primary: 'wss://129-158-194-64.nip.io/wisp/',
    fallbacks: [
      'wss://drew-prude-scoop.ngrok-free.dev/wisp/',
      'wss://leweirdlink.twilightparadox.com/wisp/',
      'wss://lightspeedspeed.duckdns.org/wisp/',
      'wss://herb.copperbat3.workers.dev/wisp/',   // Cloudflare Worker -> the VM's Wisp (stable address)
    ],
  };
  var TUNNEL_DB = 'https://copperchat-4cb91-default-rtdb.firebaseio.com/herb/tunnel/url.json', K_TUNNEL = 'herb.tunnel';
  var K_STATUS = 'herb.wisp.status', K_CUSTOM = 'herb.wisp.custom', K_PIN = 'herb.wisp.pin', TTL = 90000;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function customList() { try { var a = JSON.parse(get(K_CUSTOM) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function status() { try { return JSON.parse(get(K_STATUS) || 'null'); } catch (e) { return null; } }

  // A Wisp server sends a handshake packet as soon as the socket opens; that proves it is really Wisp.
  function probe(url, timeout) {
    return new Promise(function (res) {
      var t0 = Date.now(), done = false, w, tm;
      function finish(ok) { if (done) return; done = true; clearTimeout(tm); try { w.close(); } catch (e) {} res({ ok: ok, ms: Date.now() - t0 }); }
      try { w = new WebSocket(url); } catch (e) { return res({ ok: false, ms: 0 }); }
      w.binaryType = 'arraybuffer';
      tm = setTimeout(function () { finish(false); }, timeout || 6000);
      w.onmessage = function () { finish(true); };
      w.onerror = function () { finish(false); };
      w.onclose = function () { finish(false); };
    });
  }

  // The Cloudflare quick tunnel gets a new address whenever it restarts; the VM publishes the current one to the database.
  function tunnelUrl() { var u = get(K_TUNNEL); return /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(u || '') ? u : ''; }
  function fetchTunnel() {
    var c = typeof AbortController === 'function' ? new AbortController() : null, t = c && setTimeout(function () { c.abort(); }, 4000);
    return fetch(TUNNEL_DB, c ? { signal: c.signal } : {}).then(function (r) { return r.json(); }).then(function (u) {
      if (typeof u === 'string' && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(u)) set(K_TUNNEL, u);
    }).catch(function () {}).then(function () { if (t) clearTimeout(t); return tunnelUrl(); });
  }
  // A server you picked in Settings is used whenever it answers; if it is down Herb falls back to the fastest working one until it is back.
  function pinned() { var p = get(K_PIN) || ''; return p && H.list().some(function (x) { return x.url === p; }) ? p : ''; }
  // Switching servers tears down every open connection (pages, videos, games), which feels far slower than a few ms of extra ping.
  // So the current server is kept unless another one is clearly faster (25% and 20 ms), using smoothed timings.
  function pickBest(results, prev) {
    var pin = pinned(); if (pin && results[pin] && results[pin].ok) return pin;
    var best = null; for (var u in results) if (results[u].ok && (!best || results[u].ms < results[best].ms)) best = u;
    var cur = prev && prev.best;
    if (best && cur && cur !== best && results[cur] && results[cur].ok && results[cur].ms <= results[best].ms * 1.25 + 20) return cur;
    return best;
  }
  var running = null;
  var H = {
    defaults: DEFAULTS, tunnel: tunnelUrl, fetchTunnel: fetchTunnel,
    list: function () {
      var seen = {}, out = [];
      function add(url, label) { if (url && !seen[url]) { seen[url] = 1; out.push({ url: url, label: label }); } }
      add(DEFAULTS.primary, 'Primary');
      DEFAULTS.fallbacks.forEach(function (u, i) { add(u, 'Backup ' + (i + 1)); });
      var tu = tunnelUrl(); if (tu) add(tu.replace(/^https/, 'wss') + '/wisp/', 'Tunnel');
      customList().forEach(function (u) { add(u, 'Custom'); });
      return out;
    },
    status: status,
    // Probe all servers in parallel; remember which work and which is fastest.
    check: function () {
      if (running) return running;
      running = fetchTunnel().then(function () { var list = H.list(); return Promise.all(list.map(function (s) { return probe(s.url).then(function (r) { return [s.url, r]; }); })); }).then(function (pairs) {
        var results = {}, best = null, prev = status();
        // smooth each server's time with the previous checks (one slow handshake shouldn't move you to another server)
        pairs.forEach(function (p) {
          var r = p[1], o = prev && prev.results && prev.results[p[0]];
          if (r.ok && o && o.ok && Date.now() - prev.ts < 10 * 60 * 1000) r = { ok: true, ms: Math.round(o.ms * 0.6 + r.ms * 0.4), raw: r.ms };
          results[p[0]] = r;
        });
        best = pickBest(results, prev);
        var st = { ts: Date.now(), results: results, best: best };
        set(K_STATUS, JSON.stringify(st));
        window.dispatchEvent(new CustomEvent('herb:wisp-status', { detail: st }));
        running = null; return st;
      }, function (e) { running = null; throw e; });
      return running;
    },
    // Resolves to the best working server (checks first if the last result is old).
    ensure: function () {
      var st = status();
      if (st && st.best && Date.now() - st.ts < TTL) return Promise.resolve(st.best);
      return H.check().then(function (s) { return s.best || DEFAULTS.primary; });
    },
    best: function () { var st = status(); return (st && st.best) || DEFAULTS.primary; },
    selected: function () { return H.best(); },
    workingCount: function () { var st = status(); if (!st) return [0, H.list().length]; var n = 0; for (var k in st.results) if (st.results[k].ok) n++; return [n, H.list().length]; },
    addCustom: function (url) {
      if (!/^wss?:\/\/.+/i.test(url)) throw new Error('Wisp URL must start with ws:// or wss://');
      var c = customList(); if (c.indexOf(url) < 0) { c.push(url); set(K_CUSTOM, JSON.stringify(c)); }
      return H.check();
    },
    // ---- password-protected servers -------------------------------------------------------------
    // A server that wants a password takes it as ?password=... on the Wisp address. It is stored with the
    // address on this device only.
    // Accepts "host", "https://host" or "wss://host/wisp/" and returns a clean wss://host/wisp/ address.
    normalize: function (input) {
      var s = String(input || '').trim();
      if (!s) throw new Error('Enter a server address');
      if (!/^[a-z]+:\/\//i.test(s)) s = 'wss://' + s;
      s = s.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
      var u; try { u = new URL(s); } catch (e) { throw new Error('That is not a valid address'); }
      if (u.protocol !== 'wss:' && u.protocol !== 'ws:') throw new Error('Wisp URL must start with ws:// or wss://');
      // wss://user:SECRET@host/ (or wss://SECRET@host/): browsers refuse credentials in a WebSocket address, so move it to ?password=
      var pw = u.password ? decodeURIComponent(u.password) : decodeURIComponent(u.username || '');
      if (pw) { u.username = ''; u.password = ''; u.searchParams.set('password', pw); }
      if (u.pathname === '/') u.pathname = '/wisp/';
      if (!/\/$/.test(u.pathname)) u.pathname += '/';
      return u.toString();
    },
    withPassword: function (url, pw) {
      var u = new URL(url);
      if (pw) u.searchParams.set('password', pw); else u.searchParams.delete('password');
      return u.toString();
    },
    hasPassword: function (url) { try { return !!new URL(url).searchParams.get('password'); } catch (e) { return false; } },
    // Asks the server over plain HTTPS whether it wants a password: 'needed' (none given or wrong), 'ok', or 'unknown'.
    needsPassword: function (url) {
      var u; try { u = new URL(url); } catch (e) { return Promise.resolve('unknown'); }
      var http = (u.protocol === 'wss:' ? 'https:' : 'http:') + '//' + u.host + '/' + u.search;
      var c = typeof AbortController === 'function' ? new AbortController() : null, t = c && setTimeout(function () { c.abort(); }, 6000);
      return fetch(http, { cache: 'no-store', signal: c ? c.signal : undefined }).then(function (r) {
        return r.status === 401 || r.status === 429 ? 'needed' : (r.ok ? 'ok' : 'unknown');
      }).catch(function () { return 'unknown'; }).then(function (v) { if (t) clearTimeout(t); return v; });
    },
    // Swap the password on a saved custom server.
    setPassword: function (oldUrl, pw) {
      var nu = H.withPassword(oldUrl, pw);
      set(K_CUSTOM, JSON.stringify(customList().map(function (u) { return u === oldUrl ? nu : u; })));
      return H.check();
    },
    pinned: pinned,
    // url = a server from the list, or '' for Automatic. Applies straight away from the last check, then re-checks.
    setPinned: function (url) {
      set(K_PIN, url || '');
      var st = status(); if (st && st.results) { st.best = pickBest(st.results); set(K_STATUS, JSON.stringify(st)); window.dispatchEvent(new CustomEvent('herb:wisp-status', { detail: st })); }
      return H.check();
    },
    removeCustom: function (url) { if (get(K_PIN) === url) set(K_PIN, ''); set(K_CUSTOM, JSON.stringify(customList().filter(function (u) { return u !== url; }))); return H.check(); },
  };
  window.HerbWisp = H;
})();
