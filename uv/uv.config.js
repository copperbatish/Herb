/*global Ultraviolet*/
// Herb – Ultraviolet config. Loaded by both pages and the service worker.
// The Wisp server is NOT configured here: it is chosen at runtime by
// /js/wisp-config.js (localStorage-backed switcher) and applied through
// BareMux in /js/proxy-init.js.

// ───────────────────────────── WebRTC TURN relay (optional) ─────────────────────────────
// Service workers can't see WebRTC media (UDP), so a proxied page's video would otherwise try to go straight out from the
// browser. When TURN.urls is filled in, every proxied page on a matching host gets RTCPeerConnection wrapped so that it
// adds YOUR TURN server as a fallback (media goes direct when it can, through the relay when it can't).
// Leave TURN.urls empty to disable it completely (nothing is injected).
var TURN = {
    // No password lives in this file. The Wisp VM mints short-lived TURN credentials (coturn "REST API" auth: username = expiry
    // timestamp, credential = HMAC of it with a secret that only the VM knows) and the service worker fetches them from here.
    api: [((self.location && self.location.origin) || '') + '/api/turn', 'https://herb.copperbat3.workers.dev/api/turn', 'https://129-158-194-64.nip.io/api/turn', 'https://lightspeedspeed.duckdns.org/api/turn', 'https://leweirdlink.twilightparadox.com/api/turn'],   // tried in order
    hosts: '(^|\\.)(geforcenow\\.com|nvidiagrid\\.net)$',   // regex of proxied site hostnames that get the wrapper
};
var __turnCreds = null, __turnAt = 0;
function herbRefreshTurn() {   // service worker only; credentials last 1 hour on the server, refreshed every 30 minutes
    if (typeof ServiceWorkerGlobalScope === 'undefined' || !TURN.api.length || Date.now() - __turnAt < 30 * 60 * 1000) return;
    __turnAt = Date.now();
    var tryAt = function (i) {
        if (i >= TURN.api.length) { __turnAt = 0; return; }
        fetch(TURN.api[i], { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
            if (j && j.urls && j.username && j.credential) __turnCreds = j; else tryAt(i + 1);
        }).catch(function () { tryAt(i + 1); });
    };
    tryAt(0);
}

function herbTurnInjection(cfg) {
    // This function's body is serialised and runs INSIDE the proxied page, before the page's own scripts.
    (function () {
        function patchConfig(c) {
            c = Object.assign({}, c || {});
            var servers = Array.isArray(c.iceServers) ? c.iceServers.slice() : [];
            servers.unshift({ urls: cfg.urls, username: cfg.username, credential: cfg.credential });
            c.iceServers = servers;   // direct connection first; the relay is only used if direct fails (the page's own transport policy is left alone)
            return c;
        }
        ['RTCPeerConnection', 'webkitRTCPeerConnection'].forEach(function (name) {
            var Orig = window[name]; if (!Orig || Orig.__herbTurn) return;
            // A Proxy keeps the prototype, static members (generateCertificate, …), instanceof and subclassing intact.
            var P = new Proxy(Orig, {
                construct: function (target, args, newTarget) {
                    args = Array.prototype.slice.call(args); args[0] = patchConfig(args[0]);
                    return Reflect.construct(target, args, newTarget === P ? target : newTarget);
                },
                get: function (target, prop) {
                    if (prop === '__herbTurn') return true;
                    var v = Reflect.get(target, prop, target);
                    return (typeof v === 'function' && prop !== 'prototype' && prop !== 'constructor') ? v.bind(target) : v;   // keep statics like generateCertificate working
                },
            });
            try { window[name] = P; } catch (e) {}
        });
        var proto = window.RTCPeerConnection && window.RTCPeerConnection.prototype;
        if (proto && proto.setConfiguration && !proto.setConfiguration.__herbTurn) {
            var sc = proto.setConfiguration;
            proto.setConfiguration = function (c) { return sc.call(this, patchConfig(c)); };
            proto.setConfiguration.__herbTurn = true;
        }
    })();
}

// Compatibility shim, injected into every proxied page before its own scripts run.
// Ultraviolet rewrites an <a>/<area> element's `href` but leaves pathname/search/hash/host/hostname/port/protocol/origin pointing at the
// proxy's internal address (/uv/service/...). Angular reads `a.pathname` to work out its base path, so single-page apps like NVIDIA's
// sign-in page (login.nvgs.nvidia.com) lost their route and redirected to "not found". These getters now derive the parts from the real address.
function herbUrlPartsShim() {
    ['HTMLAnchorElement', 'HTMLAreaElement'].forEach(function (cls) {
        var C = window[cls]; if (!C || !C.prototype) return;
        ['pathname', 'search', 'hash', 'host', 'hostname', 'port', 'protocol', 'origin'].forEach(function (p) {
            var d = Object.getOwnPropertyDescriptor(C.prototype, p); if (!d || !d.get || d.get.__herbParts) return;
            var orig = d.get;
            var get = function () {
                try { var h = this.href; if (h) return new URL(h)[p]; } catch (e) {}
                return orig.call(this);
            };
            get.__herbParts = true;
            Object.defineProperty(C.prototype, p, { get: get, set: d.set, enumerable: d.enumerable, configurable: true });
        });
    });
}

// Passkeys (WebAuthn) are bound to the exact website address, so they can never work through a proxy. NVIDIA's sign-in pages try one and show
// "Passkey login isn't available". Telling them WebAuthn is absent makes them skip it and offer the normal email + password sign-in.
// NVIDIA's sign-in is opened with window.open(): as a separate pop-up window on iPadOS/Safari. A pop-up is a fresh page that has to rebuild the proxy
// connection on its own (and the page that opened it may be paused while the pop-up is in front), which left a blank grey sign-in. Opening the
// sign-in in the same window keeps it inside the Cloud app where the connection already works; NVIDIA's own site supports that ("_self") flow.
function herbSameWindowLogin() {
    function install() {
        var orig = window.open; if (typeof orig !== 'function' || orig.__herbSelf) return;
        var w = function (url, target, features) {
            try { if (/^https?:\/\/(login\.nvidia\.com|[a-z0-9-]+\.nvgs\.nvidia\.com)\//i.test(String(url))) return orig.call(this, url, '_self'); } catch (e) {}
            return orig.apply(this, arguments);
        };
        w.__herbSelf = true; window.open = w;
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
    window.addEventListener('load', install);   // after Ultraviolet's own window.open wrapper is in place
}

// Streaming diagnostics (GeForce NOW pages): what the video connection does, and whether the page was paused/hidden (iPads suspend pages).
function herbRtcDiag() {
    try {
        var bc = new BroadcastChannel('herb-diag');
        var send = function (k, m) { try { bc.postMessage({ k: k, m: String(m).slice(0, 260), u: String(location.href).slice(0, 110), t: Date.now() }); } catch (e) {} };
        document.addEventListener('visibilitychange', function () { send('page-' + document.visibilityState, ''); });
        document.addEventListener('freeze', function () { send('page-frozen', 'the browser paused this page'); });
        document.addEventListener('resume', function () { send('page-resumed', ''); });
        ['RTCPeerConnection', 'webkitRTCPeerConnection'].forEach(function (name) {
            var O = window[name]; if (!O || O.__herbRtcDiag) return;
            var P = new Proxy(O, {
                construct: function (target, args, newTarget) {
                    var cfg = args[0] || {}, counts = { relay: 0, srflx: 0, host: 0, other: 0 };
                    try { send('rtc-new', 'policy=' + (cfg.iceTransportPolicy || 'all') + ' servers=' + (cfg.iceServers || []).map(function (s) { return [].concat(s.urls).join(',').replace(/turns?:/g, '').slice(0, 44); }).join(' ; ').slice(0, 170)); } catch (e) {}
                    var pc = Reflect.construct(target, args, newTarget === P ? target : newTarget);
                    try {
                        pc.addEventListener('iceconnectionstatechange', function () { send('rtc-ice', pc.iceConnectionState); });
                        pc.addEventListener('connectionstatechange', function () { send('rtc-conn', pc.connectionState); });
                        pc.addEventListener('icegatheringstatechange', function () { send('rtc-gather', pc.iceGatheringState + ' (relay ' + counts.relay + ', srflx ' + counts.srflx + ', host ' + counts.host + ')'); });
                        pc.addEventListener('icecandidate', function (e) { if (e.candidate) { var m = / typ (\w+)/.exec(e.candidate.candidate); counts[m && counts[m[1]] !== undefined ? m[1] : 'other']++; } });
                        pc.addEventListener('icecandidateerror', function (e) { send('rtc-ice-error', e.errorCode + ' ' + (e.errorText || '') + ' ' + String(e.url || '').replace(/turns?:/, '').slice(0, 50)); });
                    } catch (e) {}
                    return pc;
                },
                get: function (target, prop) { if (prop === '__herbRtcDiag') return true; var v = Reflect.get(target, prop, target); return (typeof v === 'function' && prop !== 'prototype' && prop !== 'constructor') ? v.bind(target) : v; },
            });
            try { window[name] = P; } catch (e) {}
        });
    } catch (e) {}
}

function herbNoPasskeys() { try { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true, writable: true }); } catch (e) {} }

// Diagnostics: an iPad has no developer tools, so every proxied page reports script errors, failed files and console errors to the Cloud app
// (tap the "proxy ..." label there). Same-origin BroadcastChannel, nothing leaves the browser.
function herbDiagReporter() {
    try {
        if (window.__herbDiag || typeof BroadcastChannel !== 'function') return; window.__herbDiag = 1;
        var bc = new BroadcastChannel('herb-diag');
        var send = function (k, m) { try { bc.postMessage({ k: k, m: String(m).slice(0, 260), u: String(location.href).slice(0, 110), t: Date.now() }); } catch (e) {} };
        send('start', 'page starting, ' + (typeof document.hasStorageAccess === 'function' ? 'storageAPI' : 'no-storageAPI'));
        window.addEventListener('error', function (e) {
            var t = e.target;
            if (t && t !== window && (t.src || t.href)) send('file-failed', t.tagName + ' ' + String(t.src || t.href).slice(0, 150));
            else send('js-error', (e.message || '?') + ' @' + String(e.filename || '').slice(-50) + ':' + e.lineno);
        }, true);
        window.addEventListener('unhandledrejection', function (e) { var r = e.reason; send('rejection', r && (r.message || r.name) || r); });
        window.addEventListener('securitypolicyviolation', function (e) { send('csp', e.violatedDirective + ' ' + e.blockedURI); });
        ['error', 'warn'].forEach(function (k) {
            var o = console[k]; if (typeof o !== 'function') return;
            console[k] = function () { try { send('console.' + k, Array.prototype.map.call(arguments, function (a) { return a && a.message ? a.message : String(a); }).join(' ')); } catch (e) {} return o.apply(this, arguments); };
        });
        // failed network requests (status, real address, start of the reply): what NVIDIA's sign-in code trips over when a call fails
        var dec = function (u) { try { u = String(u); var p = (window.__uv$config && __uv$config.prefix) || '/uv/service/'; var i = u.indexOf(p); return i >= 0 ? String(__uv$config.decodeUrl(u.slice(i + p.length))).replace(/^https?:\/\//, '').slice(0, 130) : u.slice(0, 130); } catch (e) { return String(u).slice(0, 130); } };
        try {
            var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (m, u) { try { this.__hd = { m: m, u: u }; } catch (e) {} return XO.apply(this, arguments); };
            XMLHttpRequest.prototype.send = function () {
                var x = this; try { x.addEventListener('loadend', function () {
                    if (x.status >= 400 || x.status === 0) { var b = ''; try { b = typeof x.responseText === 'string' ? x.responseText.replace(/\s+/g, ' ').slice(0, 90) : ''; } catch (e) {} send('xhr-fail', x.status + ' ' + (x.__hd ? x.__hd.m + ' ' + dec(x.__hd.u) : '?') + (b ? ' | ' + b : '')); }
                }); } catch (e) {}
                return XS.apply(this, arguments);
            };
        } catch (e) {}
        try {
            var F = window.fetch;
            if (typeof F === 'function') window.fetch = function (i, o) {
                var u = i && i.url || i;
                return F.apply(this, arguments).then(function (r) { if (!r.ok) send('fetch-fail', r.status + ' ' + dec(u)); return r; }, function (e) { send('fetch-error', (e && e.message) + ' ' + dec(u)); throw e; });
            };
        } catch (e) {}
        window.addEventListener('load', function () { send('loaded', document.title + ' | ' + document.getElementsByTagName('*').length + ' nodes | ' + (document.body ? document.body.innerText.replace(/\s+/g, ' ').slice(0, 60) : 'no body')); });
        window.addEventListener('pagehide', function () { send('leaving', 'navigating away'); });
    } catch (e) {}
}

var __herbInject = [
    { host: '.*', injectTo: 'head', html: '<script>(' + herbUrlPartsShim.toString() + ')();</script>' },
    { host: '.*', injectTo: 'head', html: '<script>(' + herbDiagReporter.toString() + ')();</script>' },
    { host: '(^|\\.)(geforcenow\\.com|nvidiagrid\\.net|nvidia\\.com)$', injectTo: 'head', html: '<script>(' + herbRtcDiag.toString() + ')();</script>' },
    { host: '(^|\\.)(nvidia\\.com|geforcenow\\.com)$', injectTo: 'head', html: '<script>(' + herbNoPasskeys.toString() + ')();(' + herbSameWindowLogin.toString() + ')();</script>' },
];
if (TURN.api.length) {
    herbRefreshTurn();
    // `html` is a getter: UV reads it on every page load, so it always uses the latest credentials (nothing is injected until they arrive).
    __herbInject.push({
        host: TURN.hosts, injectTo: 'head',
        get html() {
            herbRefreshTurn();
            return __turnCreds ? '<script>(' + herbTurnInjection.toString() + ')(' + JSON.stringify(__turnCreds) + ');</script>' : '';
        },
    });
}

self.__uv$config = {
    prefix: '/uv/service/',
    encodeUrl: Ultraviolet.codec.xor.encode,
    decodeUrl: Ultraviolet.codec.xor.decode,
    handler: '/uv/uv.handler.js',
    client: '/uv/uv.client.js',
    bundle: '/uv/uv.bundle.js',
    config: '/uv/uv.config.js',
    sw: '/uv/uv.sw.js',
    inject: __herbInject,
};
