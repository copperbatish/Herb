// HLS playlists for the proxy's service workers (Scramjet and Ultraviolet).
// Safari/iPadOS play <video src="….m3u8"> natively and ask for the playlist's variants, keys and segments by the address written in the
// playlist. Relative or absolute addresses there would bypass or break the proxy, so each one is rewritten (resolved against the real playlist
// address, then re-encoded the way this proxy encodes addresses). Only playlists are read into memory (a few KB); segments stream untouched.
self.herbHls = function (res, realUrl, mk) {
  try {
    var ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !(/mpegurl/.test(ct) || /\.m3u8(\?|#|$)/i.test(realUrl))) return Promise.resolve(res);
    var len = +res.headers.get('content-length') || 0;
    if (len > 2 * 1024 * 1024) return Promise.resolve(res);            // not a playlist, leave it streaming
    var keep = res.clone();
    return res.text().then(function (t) {
      if (t.replace(/^﻿/, '').trim().indexOf('#EXTM3U') !== 0) return keep;   // not actually a playlist
      function rw(u) {
        u = (u || '').trim();
        if (!u || /^(data|blob|about):/i.test(u)) return u;
        try { return mk(new URL(u, realUrl).href); } catch (e) { return u; }
      }
      var out = t.split(/\r?\n/).map(function (l) {
        if (!l.trim()) return l;
        if (l.charAt(0) === '#') return l.replace(/URI="([^"]*)"/g, function (m, u) { return 'URI="' + rw(u) + '"'; });
        return rw(l);
      }).join('\n');
      var h = new Headers(res.headers); h.delete('content-length'); h.delete('content-encoding'); h.set('content-type', 'application/vnd.apple.mpegurl');
      return new Response(out, { status: res.status, statusText: res.statusText, headers: h });
    }, function () { return keep; });
  } catch (e) { return Promise.resolve(res); }
};
