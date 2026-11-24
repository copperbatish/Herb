// Scramjet service worker for Herb (scope /sj/). Separate from the Ultraviolet worker so each engine can fail on its own.
// Service workers have no URL.createObjectURL; Scramjet only grabs a reference to it at load time, so give it a stub.
if (!URL.createObjectURL) { URL.createObjectURL = function () { throw new Error('createObjectURL unavailable in service worker'); }; URL.revokeObjectURL = URL.revokeObjectURL || function () {}; }
importScripts('/sj/scramjet/scramjet.js', '/sj/controller/controller.sw.js', '/sj/hls.js');
addEventListener('install', function () { skipWaiting(); });
addEventListener('activate', function (e) { e.waitUntil(clients.claim()); });
addEventListener('fetch', function (e) {
  if ($scramjetController.shouldRoute(e)) e.respondWith($scramjetController.route(e).then(function (res) {
    // rewrite HLS playlists so native playback (Safari/iPad) keeps its segments inside the proxy
    try {
      var u = new URL(e.request.url), p = u.pathname.split('/');            // ['', 'sj', '~', controller, frame, encoded address…]
      if (p.length < 6) return res;
      var base = '/sj/~/' + p[3] + '/' + p[4] + '/', real = decodeURIComponent(p.slice(5).join('/'));
      return self.herbHls(res, real, function (abs) { return base + encodeURIComponent(abs); });
    } catch (err) { return res; }
  }));
});
