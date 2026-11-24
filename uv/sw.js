/*global UVServiceWorker,__uv$config*/
/*
 * Stock service worker script.
 * Users can provide their own sw.js if they need to extend the functionality of the service worker.
 * Ideally, this will be registered under the scope in uv.config.js so it will not need to be modified.
 * However, if a user changes the location of uv.bundle.js/uv.config.js or sw.js is not relative to them, they will need to modify this script locally.
 */
importScripts('uv.bundle.js');
importScripts('/sj/hls.js');   // Herb: HLS playlist rewriting (shared with Scramjet)
importScripts('uv.config.js');
importScripts(__uv$config.sw || 'uv.sw.js');

const uv = new UVServiceWorker();

// Herb: some sites (YouTube) reset HTTP/2 streams for very new / unusual browser UA strings.
// Send one stable, widely-accepted UA and drop client hints that would contradict it.
const HERB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
uv.on('request', (event) => {
    const h = event.data.headers;
    h['user-agent'] = HERB_UA;
    for (const k of Object.keys(h)) if (k.toLowerCase().startsWith('sec-ch-ua')) delete h[k];
});

// Herb: tell the Cloud app's diagnostics panel (BroadcastChannel) why the proxy answered with an error.
let herbDiag = null; try { herbDiag = new BroadcastChannel('herb-diag'); } catch (e) {}
async function handleRequest(event) {
    if (uv.route(event)) {
        const res = await uv.fetch(event);
        if (herbDiag && res.status >= 500) {
            try {
                const t = await res.clone().text(), m = /<textarea[^>]*>([\s\S]*?)<\/textarea>/i.exec(t);
                let u = event.request.url; try { u = String(__uv$config.decodeUrl(u.slice(u.indexOf(__uv$config.prefix) + __uv$config.prefix.length))); } catch (e) {}
                herbDiag.postMessage({ k: 'proxy-' + res.status, m: event.request.method + ' ' + u.replace(/^https?:\/\//, '').slice(0, 90) + ' -> ' + ((m && m[1]) || t).replace(/\s+/g, ' ').slice(0, 200), u: 'service worker', t: Date.now() });
            } catch (e) {}
        }
        // Herb: rewrite HLS playlists so native playback (Safari/iPad) keeps its segments inside the proxy
        try {
            let u = event.request.url; const real = String(__uv$config.decodeUrl(u.slice(u.indexOf(__uv$config.prefix) + __uv$config.prefix.length)));
            return await self.herbHls(res, real, (abs) => __uv$config.prefix + __uv$config.encodeUrl(abs));
        } catch (e) { return res; }
    }
    
    return await fetch(event.request)
}

self.addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event));
});

// Herb: activate updated workers immediately so fixes apply without closing every tab.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
