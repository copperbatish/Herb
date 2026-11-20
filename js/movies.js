// Herb Movies: TMDB browsing + trailer/embed player, with optional routing through the Ultraviolet / BareMux proxy.
(function () {
  'use strict';
  var TMDB_KEY = 'bc92194115581adbb6d5e66170139068';           // TMDB v3 API key
  var API = 'https://api.themoviedb.org/3', IMG = 'https://image.tmdb.org/t/p/w500';
  var $ = function (id) { return document.getElementById(id); };

  // ===================== proxy helpers =====================
  var MODE_KEY = 'herb.movies.net';                              // 'auto' | 'proxy' | 'direct'
  function mode() { try { return localStorage.getItem(MODE_KEY) || 'auto'; } catch (e) { return 'auto'; } }
  var proxyReady = null, proxyOn = false;                       // proxyOn: service worker + transport are up
  function ensureProxy() {
    if (!proxyReady) proxyReady = (window.HerbProxy ? HerbProxy.init().then(function () { proxyOn = true; return true; }) : Promise.resolve(false)).catch(function () { return false; });
    return proxyReady;
  }
  // Turn an external URL into a proxied same-origin URL (for iframes / images).
  // Routes through Ultraviolet when proxy mode is active; otherwise returns the direct URL.
  function proxyUrl(url) {
    if (mode() !== 'direct' && proxyOn && window.__uv$config) return __uv$config.prefix + __uv$config.encodeUrl(url);
    return url;
  }
  // fetch() through BareMux (works from any page, no service-worker scope needed)
  function proxyFetch(url, opts) {
    return ensureProxy().then(function (ok) {
      if (!ok || !window.BareMux) throw new Error('proxy unavailable');
      return new BareMux.BareClient().fetch(url, opts || {});
    });
  }
  // Direct first, proxy as fallback (or proxy only / direct only depending on the Network setting).
  function smartFetch(url) {
    var m = mode();
    if (m === 'proxy') return proxyFetch(url);
    if (m === 'direct') return fetch(url);
    return fetch(url).then(function (r) { if (!r.ok && r.status !== 404 && r.status !== 401) throw new Error('http ' + r.status); return r; }).catch(function () { return proxyFetch(url); });
  }
  function api(path, params) {
    var q = new URLSearchParams(Object.assign({ api_key: TMDB_KEY }, params || {}));
    return smartFetch(API + path + '?' + q.toString()).then(function (r) { if (!r.ok) throw new Error('TMDB ' + r.status); return r.json(); });
  }
  // Poster <img>: direct, falling back to a proxied blob if the browser can't load it.
  function setImg(img, url, ph) {
    function viaProxy() { proxyFetch(url).then(function (r) { return r.blob(); }).then(function (b) { img.src = URL.createObjectURL(b); }).catch(function () { if (ph) ph.textContent = 'No poster'; img.remove(); }); }
    if (mode() === 'proxy') return viaProxy();
    img.onerror = function () { img.onerror = null; if (mode() === 'direct') { if (ph) ph.textContent = 'No poster'; img.remove(); } else viaProxy(); };
    img.src = url;
  }

  // ===================== player sources =====================
  // Each source builds an embeddable URL for a movie. To add another (licensed / your own) embed later, push one more
  // object here – the player UI picks it up automatically.
  //   build(movie, videos) -> url string, or null if unavailable
  var SOURCES = [
    {
      id: 'trailer',
      label: 'Trailer',
      build: function (movie, videos) {
        var vs = (videos && videos.results || []).filter(function (v) { return v.site === 'YouTube'; });
        var v = vs.filter(function (x) { return x.type === 'Trailer' && x.official; })[0] || vs.filter(function (x) { return x.type === 'Trailer'; })[0] || vs[0];
        return v ? 'https://www.youtube-nocookie.com/embed/' + v.key + '?rel=0&modestbranding=1' : null;
      }
    }
    // { id: 'my-source', label: 'My Source', build: function (movie) { return 'https://example.com/embed/' + movie.id; } },
  ];
  function embedSrc(url) {
    // proxy the iframe when the proxy is active (or forced); otherwise fall back to the direct URL
    if (mode() === 'direct') return Promise.resolve(url);
    return ensureProxy().then(function () { return proxyUrl(url); });
  }

  // ===================== UI =====================
  var TABS = [['trending', 'Trending', '/trending/movie/week'], ['popular', 'Popular', '/movie/popular'], ['top', 'Top rated', '/movie/top_rated']];
  var state = { tab: 'trending', query: '', page: 1, total: 1, items: [], loading: false, token: 0 };
  $('sico').innerHTML = HerbIcons.glyph('search', 16);
  $('mode').value = mode(); $('mode').onchange = function () { try { localStorage.setItem(MODE_KEY, this.value); } catch (e) {} proxyReady = null; };
  var tabsEl = $('tabs');
  TABS.forEach(function (t) { var b = document.createElement('button'); b.dataset.t = t[0]; b.textContent = t[1]; b.className = t[0] === state.tab ? 'on' : ''; tabsEl.appendChild(b); });
  tabsEl.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; state.tab = b.dataset.t; state.query = ''; $('q').value = ''; [].forEach.call(tabsEl.children, function (x) { x.classList.toggle('on', x === b); }); load(true); };

  function year(m) { return (m.release_date || '').slice(0, 4) || '—'; }
  function card(m) {
    var b = document.createElement('button'); b.className = 'card'; b.title = m.title;
    b.innerHTML = '<div class="poster"><div class="ph"></div>' + (m.vote_average ? '<span class="rate">★ ' + m.vote_average.toFixed(1) + '</span>' : '') + '</div><div class="meta"><div class="n"></div><div class="y">' + year(m) + '</div></div>';
    b.querySelector('.n').textContent = m.title; var ph = b.querySelector('.ph');
    if (m.poster_path) { var im = document.createElement('img'); im.alt = ''; b.querySelector('.poster').insertBefore(im, ph); setImg(im, IMG + m.poster_path, ph); ph.textContent = ''; } else ph.textContent = m.title;
    b.onclick = function () { openMovie(m); };
    return b;
  }
  function skeletons(n) { var g = document.createElement('div'); g.className = 'grid'; for (var i = 0; i < n; i++) { var s = document.createElement('div'); s.className = 'card skel'; s.innerHTML = '<div class="poster"></div><div class="meta"><div class="n">&nbsp;</div></div>'; g.appendChild(s); } return g; }
  function draw() {
    var m = $('main'); m.innerHTML = '';
    var title = state.query ? 'Results for “' + state.query + '”' : TABS.filter(function (t) { return t[0] === state.tab; })[0][1];
    var h = document.createElement('h2'); h.textContent = title; m.appendChild(h);
    if (!state.items.length) { if (state.loading) m.appendChild(skeletons(12)); else { var d = document.createElement('div'); d.className = 'msg'; d.textContent = state.error || 'No movies found.'; m.appendChild(d); } return; }
    var g = document.createElement('div'); g.className = 'grid'; state.items.forEach(function (x) { g.appendChild(card(x)); }); m.appendChild(g);
    if (state.page < state.total) { var more = document.createElement('button'); more.className = 'btn more'; more.textContent = state.loading ? 'Loading…' : 'Load more'; more.onclick = function () { state.page++; load(false); }; m.appendChild(more); }
  }
  function load(reset) {
    var tok = ++state.token; if (reset) { state.page = 1; state.items = []; } state.loading = true; state.error = ''; draw();
    var req = state.query ? api('/search/movie', { query: state.query, page: state.page }) : api(TABS.filter(function (t) { return t[0] === state.tab; })[0][2], { page: state.page });
    req.then(function (d) { if (tok !== state.token) return; state.total = Math.min(d.total_pages || 1, 20); state.items = state.items.concat((d.results || []).filter(function (x) { return x.title; })); })
      .catch(function (e) { if (tok !== state.token) return; state.error = 'Couldn’t reach TMDB (' + (e && e.message || 'error') + '). Try the Network setting above.'; })
      .then(function () { if (tok !== state.token) return; state.loading = false; draw(); });
  }
  var deb; $('q').oninput = function () { clearTimeout(deb); var v = this.value.trim(); deb = setTimeout(function () { state.query = v; load(true); }, 350); };

  // ---------- details + player ----------
  var modal = $('modal'), sheet = $('sheet');
  function closeMovie() { modal.classList.remove('on'); sheet.innerHTML = ''; }
  modal.onclick = function (e) { if (e.target === modal) closeMovie(); };
  addEventListener('keydown', function (e) { if (e.key === 'Escape') { var o = document.getElementById('fsplay'); if (o && o.classList.contains('on')) { closeFs(); return; } closeMovie(); } });
  function openMovie(m) {
    modal.classList.add('on'); modal.scrollTop = 0;
    sheet.innerHTML = '<button class="close" title="Close">' + HerbIcons.glyph('close', 16, 2.2) + '</button><div class="player"><div class="pm">Loading…</div></div><div class="srcs" id="srcs"></div><div class="info"><h3></h3><div class="facts"></div><p></p></div>';
    sheet.querySelector('.close').onclick = closeMovie; sheet.querySelector('h3').textContent = m.title;
    sheet.querySelector('.facts').innerHTML = '<span>' + (m.release_date || 'Release date unknown') + '</span>' + (m.vote_average ? '<span><b>★ ' + m.vote_average.toFixed(1) + '</b> (' + (m.vote_count || 0) + ' votes)</span>' : '');
    sheet.querySelector('.info p').textContent = m.overview || 'No overview available.';
    var tok = m.id; sheet.dataset.id = tok;
    Promise.all([
      api('/movie/' + m.id),
      api('/movie/' + m.id + '/videos'),
      api('/movie/' + m.id + '/external_ids').catch(function () { return {}; })
    ]).then(function (r) {
      if (sheet.dataset.id != tok) return;
      var d = r[0], videos = r[1], ext = r[2] || {};
      d.imdb_id = d.imdb_id || ext.imdb_id || null;
      var facts = sheet.querySelector('.facts'); var extra = [];
      if (d.runtime) extra.push(Math.floor(d.runtime / 60) + 'h ' + (d.runtime % 60) + 'm'); if (d.genres && d.genres.length) extra.push(d.genres.map(function (g) { return g.name; }).join(', '));
      extra.forEach(function (x) { var s = document.createElement('span'); s.textContent = x; facts.appendChild(s); });
      if (d.overview) sheet.querySelector('.info p').textContent = d.overview;
      var avail = SOURCES.map(function (s) { return { s: s, url: s.build(d, videos) }; }).filter(function (x) { return x.url; });
      var player = sheet.querySelector('.player'), srcs = $('srcs');
      function mark(name) { [].forEach.call(srcs.children, function (b) { b.classList.toggle('on', b.dataset.k === name); }); }
      function trailer() {
        mark('trailer');
        if (!avail.length) { player.innerHTML = '<div class="pm">No trailer is available for this movie.</div>'; return; }
        player.innerHTML = '<div class="pm">Loading player…</div>';
        embedSrc(avail[0].url).then(function (src) {
          if (sheet.dataset.id != tok) return;
          player.innerHTML = '';
          var f = document.createElement('iframe');
          f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
          f.allowFullscreen = true;
          if (src === avail[0].url) f.setAttribute('credentialless', ''); /* only direct embeds; proxied ones are same-origin and need the service worker */
          f.src = src;
          player.appendChild(f);
        });
      }
      function playMovie() {
        mark('play');
        var ov = document.getElementById('fsplay');
        if (!ov) {
          ov = document.createElement('div'); ov.id = 'fsplay';
          ov.innerHTML = '<button class="fsx" title="Close">\u2190 Back</button><iframe title="Player" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
          document.body.appendChild(ov);
          ov.querySelector('.fsx').onclick = closeFs;
          document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement) closeFs(); });
        }
        var frame = ov.querySelector('iframe');
        frame.removeAttribute('srcdoc');
        frame.removeAttribute('src');
        ov.classList.add('on');
        try { ov.requestFullscreen && ov.requestFullscreen(); } catch (e) {}

        var candidates = d.imdb_id ? [
          'https://vidsrc.mov/embed/movie/' + encodeURIComponent(d.imdb_id),
          'https://hnembed.cc/embed/movie/' + encodeURIComponent(d.imdb_id)
        ] : [];

        function showUnavailable(msg) {
          frame.srcdoc = '<!doctype html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fca5a5;font:16px system-ui,sans-serif;text-align:center"><div><div style="font-size:44px;margin-bottom:10px">\u26a0</div><b style="font-size:20px;color:#f87171">Sources not currently available</b><p style="color:#9ca3af;margin:10px 0 0">' + (msg || 'Please try again later.') + '</p></div></body>';
        }

        function tryAt(idx) {
          if (idx >= candidates.length) {
            showUnavailable(d.imdb_id ? 'Please try again later.' : 'No IMDb ID found for this title.');
            return;
          }
          embedSrc(candidates[idx]).then(function (src) {
            if (sheet.dataset.id != tok || !ov.classList.contains('on')) return;
            frame.src = src;
          }).catch(function () {
            if (sheet.dataset.id != tok || !ov.classList.contains('on')) return;
            tryAt(idx + 1);
          });
        }

        tryAt(0);
      }
      function closeFs() {
        var ov = document.getElementById('fsplay');
        if (ov) {
          var frame = ov.querySelector('iframe');
          if (frame) { frame.removeAttribute('src'); frame.removeAttribute('srcdoc'); }
          ov.classList.remove('on');
        }
        if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
      }
      srcs.style.display = '';
      [['trailer', 'Trailer', trailer], ['play', 'Play', playMovie]].forEach(function (x) { var b = document.createElement('button'); b.dataset.k = x[0]; b.textContent = x[1]; b.onclick = x[2]; srcs.appendChild(b); });
      trailer();
    }).catch(function () { if (sheet.dataset.id == tok) sheet.querySelector('.player').innerHTML = '<div class="pm">Couldn’t load details. Check the Network setting.</div>'; });
  }

  window.HerbMovies = { proxyUrl: proxyUrl, SOURCES: SOURCES };
  load(true);
})();