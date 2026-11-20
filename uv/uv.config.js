/*global Ultraviolet*/
// Herb – Ultraviolet config. Loaded by both pages and the service worker.
// The Wisp server is NOT configured here: it is chosen at runtime by
// /js/wisp-config.js (localStorage-backed switcher) and applied through
// BareMux in /js/proxy-init.js.

// ───────────────────────────── WebRTC TURN relay (optional) ─────────────────────────────
// Service workers can't see WebRTC media (UDP), so a proxied page's video would otherwise try to go straight out from the
// browser. When TURN.urls is filled in, every proxied page on a matching host gets RTCPeerConnection wrapped so that it
// (a) adds YOUR TURN server first and (b) uses iceTransportPolicy "relay", sending all media through that server.
// Leave TURN.urls empty to disable it completely (nothing is injected).
var TURN = {
    // Herb's own coturn relay on the Wisp VM. TLS/TCP first so it works when UDP is blocked; plain UDP last.
    urls: ['turns:129-158-194-64.nip.io:5349?transport=tcp', 'turn:129-158-194-64.nip.io:3478?transport=tcp', 'turn:129-158-194-64.nip.io:3478'],
    username: 'herb',
    credential: 'mWuP1xAAiopf4odUVKfefUvPgudVmChR',
    hosts: '(^|\\.)(geforcenow\\.com|nvidiagrid\\.net)$',   // regex of proxied site hostnames that get the wrapper
};

function herbTurnInjection(cfg) {
    // This function's body is serialised and runs INSIDE the proxied page, before the page's own scripts.
    (function () {
        function patchConfig(c) {
            c = Object.assign({}, c || {});
            var servers = Array.isArray(c.iceServers) ? c.iceServers.slice() : [];
            servers.unshift({ urls: cfg.urls, username: cfg.username, credential: cfg.credential });
            c.iceServers = servers; c.iceTransportPolicy = 'relay';
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

var __herbInject = [];
if (TURN.urls && TURN.urls.length) {
    __herbInject.push({
        host: TURN.hosts, injectTo: 'head',
        html: '<script>(' + herbTurnInjection.toString() + ')(' + JSON.stringify({ urls: TURN.urls, username: TURN.username, credential: TURN.credential }) + ');</script>',
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
