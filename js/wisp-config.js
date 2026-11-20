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
    ],
  };
  var TUNNEL_DB = 'https://copperchat-4cb91-default-rtdb.firebaseio.com/herb/tunnel/url.json', K_TUNNEL = 'herb.tunnel';
  var K_STATUS = 'herb.wisp.status', K_CUSTOM = 'herb.wisp.custom', TTL = 90000;

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
        var results = {}, best = null;
        pairs.forEach(function (p) { results[p[0]] = p[1]; if (p[1].ok && (!best || p[1].ms < results[best].ms)) best = p[0]; });
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
    removeCustom: function (url) { set(K_CUSTOM, JSON.stringify(customList().filter(function (u) { return u !== url; }))); return H.check(); },
  };
  window.HerbWisp = H;
})();
