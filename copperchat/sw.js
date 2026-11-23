/* CopperChat service worker: shows the push banner, opens the right chat when you tap it. Scope is /copperchat/ only (the other apps on this site keep their own). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// iOS REQUIRES every push to show a notification (silent pushes get the subscription revoked), so this always calls showNotification.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'CopperChat', body: event.data ? event.data.text() : '' }; }
  const title = String(d.title || 'CopperChat').slice(0, 80);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 200),
    icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.tag || 'cc', renotify: true,
    data: { url: typeof d.url === 'string' && d.url.indexOf(self.location.origin) === 0 ? d.url : self.registration.scope }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.indexOf(self.registration.scope) === 0) { try { await c.focus(); c.postMessage({ type: 'open', url }); return; } catch (e) {} }
    }
    await self.clients.openWindow(url);
  })());
});
