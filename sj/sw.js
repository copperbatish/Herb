// Scramjet service worker for Herb (scope /sj/). Separate from the Ultraviolet worker so each engine can fail on its own.
// Service workers have no URL.createObjectURL; Scramjet only grabs a reference to it at load time, so give it a stub.
if (!URL.createObjectURL) { URL.createObjectURL = function () { throw new Error('createObjectURL unavailable in service worker'); }; URL.revokeObjectURL = URL.revokeObjectURL || function () {}; }
importScripts('/sj/scramjet/scramjet.js', '/sj/controller/controller.sw.js');
addEventListener('install', function () { skipWaiting(); });
addEventListener('activate', function (e) { e.waitUntil(clients.claim()); });
addEventListener('fetch', function (e) {
  if ($scramjetController.shouldRoute(e)) e.respondWith($scramjetController.route(e));
});
