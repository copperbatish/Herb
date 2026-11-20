/* [skinlab] SKIN LAB workstream: admins build weapon skins (pixel art with layers + frames, per-state animations, particle emitters, muzzle flash,
   projectile re-skin, obtainment) from the admin panel, no code. Definitions live in Firestore (default `db`, collection `customskins2`, versioned schema v2),
   cached in localStorage, and a generic renderer turns each one into entries in SKINS (weapon/name/draw/how/price) so shop, locker, equip, party all reuse
   the existing skin flow. The old `customskins` (pixel + quick) keep working untouched and are listed (read-only + "convert") inside the lab.
   Loaded as a classic script AFTER the main one, so it shares its global lexical scope. Everything is try/catch'd: a bug here must never break the base game.
   Hooks in Mineplacer2.html are marked `// [skinlab]`: drawHeldAt (SKL.held), draw() after bullets (SKL.fx), bullet draw (SKL.bullet), fire() (b.sk).
   Public API: window.SKL = { defs, sanitize, openLab, gen, ... } */
(function () {
    'use strict';
    const SKL = window.SKL = window.SKL || {};
    const TAU = Math.PI * 2, DEG = Math.PI / 180, rnd = Math.random;
    const warned = {};
    const safe = (name, fn) => { try { return fn(); } catch (e) { if (!warned[name]) { warned[name] = 1; console.error('[skinlab] ' + name, e); } } };
    try {

    // ================================================================== HELPERS
    const clampN = (v, lo, hi, d) => { v = +v; if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
    const int = (v, lo, hi, d) => Math.round(clampN(v, lo, hi, d));
    const colr = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) ? v.toLowerCase() : d;
    const pick = (v, arr, d) => (arr.indexOf(v) >= 0 ? v : d);
    const text = (v, n, d) => String(v == null ? (d || '') : v).replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const $q = (id) => document.getElementById(id);
    const E_ = (s) => { try { return esc(s); } catch (e) { return String(s).replace(/[&<>"']/g, ''); } };
    const CH = '0123456789abcdefghijklmnopqrstuv';
    const MAXPAL = 32;
    const RAR = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    const RAR_COL = { common: '#9a8e7a', rare: '#4dd2ff', epic: '#b04bff', legendary: '#ffd23a', mythic: '#ff4d6d' };
    const WAYS = ['shop', 'weekly', 'wave', 'drop', 'admin'];
    const BLENDS = { normal: 'source-over', add: 'lighter', screen: 'screen', multiply: 'multiply' };
    const EASES = ['linear', 'out', 'in', 'inout', 'elastic', 'bounce'];
    const EASE = {
        linear: (x) => x, out: (x) => 1 - (1 - x) * (1 - x), in: (x) => x * x, inout: (x) => (x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
        elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3)) + 1),
        bounce: (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) { x -= 1.5 / d; return n * x * x + .75; } if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + .9375; } x -= 2.625 / d; return n * x * x + .984375; }
    };
    const ease = (name, x) => (EASE[name] || EASE.out)(Math.max(0, Math.min(1, x)));

    // colour utils
    const hex2rgb = (h) => { const n = parseInt(String(h).slice(1), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const rgb2hex = (r, g_, b) => '#' + [r, g_, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
    const rgb2hsl = (r, g_, b) => { r /= 255; g_ /= 255; b /= 255; const mx = Math.max(r, g_, b), mn = Math.min(r, g_, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g_ - b) / d + (g_ < b ? 6 : 0) : mx === g_ ? (b - r) / d + 2 : (r - g_) / d + 4; h /= 6; } return [h, s, l]; };
    const hsl2rgb = (h, s, l) => { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; };
    const hueHex = (hex, deg) => { if (!deg) return hex; const c = hex2rgb(hex), h = rgb2hsl(c[0], c[1], c[2]); const r = hsl2rgb(((h[0] + deg / 360) % 1 + 1) % 1, h[1], h[2]); return rgb2hex(r[0], r[1], r[2]); };
    const ramp = (a, b, k) => { const o = []; for (let i = 0; i < k; i++) o.push(mixHex(a, b, k === 1 ? 0 : i / (k - 1))); return o; };

    // ================================================================== SCHEMA (v2)
    const IDLE = ['none', 'bob', 'sway', 'float', 'spin', 'pulse', 'wobble'];
    const EQUIP = ['none', 'pop', 'spin', 'slide', 'flash'];
    const FIRE = ['none', 'kick', 'spin', 'pulse', 'shake', 'flash'];
    const COOL = ['none', 'dim', 'glow', 'shrink'];
    const FLOUR = ['none', 'burst', 'ring', 'stars', 'flash'];
    const TRAIL = ['none', 'fade', 'sparks', 'rainbow', 'line'];
    const MZ = ['none', 'star', 'burst', 'ring', 'cone', 'cross'];
    const PSHAPE = ['orb', 'bolt', 'shard', 'star', 'arrow', 'pixel', 'flame'];
    const EM_KIND = ['spark', 'ember', 'bubble', 'star', 'dust'];
    const EM_AT = ['muzzle', 'trail', 'impact', 'aura', 'kill'];
    const MELEE_TRAIL = ['none', 'fade', 'spark', 'solid'];
    const GEN_MODES = ['gradient', 'metallic', 'camo', 'neon', 'fire', 'ice', 'galaxy', 'rainbow'];
    const GEN_SHAPES = ['gun', 'blade', 'orb', 'staff'];
    SKL.consts = { RAR, WAYS, IDLE, EQUIP, FIRE, COOL, FLOUR, TRAIL, MZ, PSHAPE, EM_KIND, EM_AT, GEN_MODES, GEN_SHAPES, EASES, MELEE_TRAIL, BLENDS };

    const emptyRows = (n) => { const r = []; for (let i = 0; i < n; i++) r.push('.'.repeat(n)); return r; };
    const cleanRows = (rows, n, palN) => {
        const out = []; rows = Array.isArray(rows) ? rows : [];
        for (let y = 0; y < n; y++) {
            let s = String(rows[y] == null ? '' : rows[y]).slice(0, n).toLowerCase().replace(/[^.0-9a-v]/g, '.');
            s = s.replace(/[0-9a-v]/g, (ch) => (CH.indexOf(ch) < palN ? ch : '.'));
            out.push(s.padEnd(n, '.'));
        }
        return out;
    };
    const cleanEm = (e) => {
        e = (e && typeof e === 'object') ? e : {};
        return { at: pick(e.at, EM_AT, 'muzzle'), kind: pick(e.kind, EM_KIND, 'spark'), count: int(e.count, 1, 20, 6), rate: clampN(e.rate, 1, 80, 20), speed: clampN(e.speed, 0, 12, 3), gravity: clampN(e.gravity, -0.4, 0.5, 0.05),
            c1: colr(e.c1, '#ffd23a'), c2: colr(e.c2, '#ff4d2a'), life: int(e.life, 80, 2500, 500), size: clampN(e.size, 1, 8, 2.5), spread: clampN(e.spread, 0, 360, 60) };
    };
    const defaultAnim = () => ({
        idle: { type: 'bob', amp: 0.5, speed: 1 }, equip: { type: 'pop', dur: 350, ease: 'elastic' }, fire: { type: 'kick', amp: 1, dur: 220, ease: 'out' }, cool: { type: 'none', dur: 600 },
        hit: { type: 'burst', color: '#ffd23a' }, kill: { type: 'stars', color: '#ffffff' }, melee: { on: false, arc: 140, trail: 'fade', color: '#ffffff', width: 5, life: 260 },
        aura: { on: false, color: '#4dd2ff', size: 0.6, pulse: 0.4, speed: 1.5 }, flash: { screen: false, color: '#ffffff', shake: 0 }
    });
    const sanitize = (r, forPreview) => {
        r = (r && typeof r === 'object') ? r : {};
        let id = String(r.id || '').toUpperCase();
        if (forPreview) id = 'L_PV'; else if (!/^L_[A-Z0-9_]{2,28}$/.test(id)) return null;
        const name = text(r.name, 24, ''); if (!name && !forPreview) return null;
        const tg = r.target || {}, A = r.art || {}, an = r.anim || {}, D = defaultAnim();
        const n = int(A.n, 16, 48, 32);
        const pal = (Array.isArray(A.pal) ? A.pal : []).filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).map(c => c.toLowerCase()).slice(0, MAXPAL);
        if (!pal.length) pal.push('#ffffff');
        const frames = int(A.frames, 1, 12, 1);
        const durs = []; for (let i = 0; i < frames; i++) durs.push(int((A.durs || [])[i], 30, 2000, 120));
        let layers = (Array.isArray(A.layers) ? A.layers : []).slice(0, 5).map((L, li) => {
            L = L || {}; const f = [];
            for (let i = 0; i < frames; i++) { let fr = (L.f || [])[i] || (L.f || [])[0]; if (typeof fr === 'string') fr = fr.split('/'); f.push(cleanRows(fr, n, pal.length)); }   // a frame is rows (or one '/'-joined string: Firestore forbids nested arrays)
            return { name: text(L.name, 14, 'Layer ' + (li + 1)), vis: L.vis !== false, blend: pick(L.blend, Object.keys(BLENDS), 'normal'), op: clampN(L.op, 0, 1, 1), hue: clampN(L.hue, -180, 180, 0), spin: clampN(L.spin, 0, 360, 0), glow: !!L.glow, f };
        });
        if (!layers.length) { const f = []; for (let i = 0; i < frames; i++) f.push(emptyRows(n)); layers = [{ name: 'Body', vis: true, blend: 'normal', op: 1, hue: 0, spin: 0, glow: false, f }]; }
        const m = r.muzzle || {}, p = r.proj || {}, o = r.obt || {};
        const d = {
            v: 2, id, name: name || 'New Skin', desc: text(r.desc, 120, ''), rarity: pick(r.rarity, RAR, 'rare'),
            tags: (Array.isArray(r.tags) ? r.tags : []).map(t => text(t, 14, '').toLowerCase()).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, 6),
            target: { mode: pick(tg.mode, ['weapon', 'type'], 'weapon'), weapon: String(tg.weapon || 'SLING').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24) || 'SLING', type: pick(tg.type, ['all', 'ranged', 'melee', 'custom'], 'ranged') },
            art: { n, pal, layers, frames, durs, loop: pick(A.loop, ['loop', 'pingpong', 'once'], 'loop'), gen: A.gen && typeof A.gen === 'object' ? { mode: pick(A.gen.mode, GEN_MODES, 'gradient'), shape: pick(A.gen.shape, GEN_SHAPES, 'gun'), c1: colr(A.gen.c1, '#4dd2ff'), c2: colr(A.gen.c2, '#ffffff'), c3: colr(A.gen.c3, '#12304a'), seed: int(A.gen.seed, 0, 99999, 1) } : null },
            anim: {
                idle: { type: pick((an.idle || {}).type, IDLE, D.idle.type), amp: clampN((an.idle || {}).amp, 0, 2, D.idle.amp), speed: clampN((an.idle || {}).speed, 0.2, 6, D.idle.speed) },
                equip: { type: pick((an.equip || {}).type, EQUIP, D.equip.type), dur: int((an.equip || {}).dur, 100, 1500, D.equip.dur), ease: pick((an.equip || {}).ease, EASES, D.equip.ease) },
                fire: { type: pick((an.fire || {}).type, FIRE, D.fire.type), amp: clampN((an.fire || {}).amp, 0, 2, D.fire.amp), dur: int((an.fire || {}).dur, 60, 1200, D.fire.dur), ease: pick((an.fire || {}).ease, EASES, D.fire.ease) },
                cool: { type: pick((an.cool || {}).type, COOL, D.cool.type), dur: int((an.cool || {}).dur, 100, 3000, D.cool.dur) },
                hit: { type: pick((an.hit || {}).type, FLOUR, D.hit.type), color: colr((an.hit || {}).color, D.hit.color) },
                kill: { type: pick((an.kill || {}).type, FLOUR, D.kill.type), color: colr((an.kill || {}).color, D.kill.color) },
                melee: { on: !!(an.melee || {}).on, arc: int((an.melee || {}).arc, 30, 360, D.melee.arc), trail: pick((an.melee || {}).trail, MELEE_TRAIL, D.melee.trail), color: colr((an.melee || {}).color, D.melee.color), width: clampN((an.melee || {}).width, 1, 14, D.melee.width), life: int((an.melee || {}).life, 80, 900, D.melee.life) },
                aura: { on: !!(an.aura || {}).on, color: colr((an.aura || {}).color, D.aura.color), size: clampN((an.aura || {}).size, 0.1, 2, D.aura.size), pulse: clampN((an.aura || {}).pulse, 0, 1, D.aura.pulse), speed: clampN((an.aura || {}).speed, 0.2, 6, D.aura.speed) },
                flash: { screen: !!(an.flash || {}).screen, color: colr((an.flash || {}).color, D.flash.color), shake: clampN((an.flash || {}).shake, 0, 8, 0) }
            },
            muzzle: { shape: pick(m.shape, MZ, 'none'), size: clampN(m.size, 0.3, 3, 1), color: colr(m.color, '#ffe27a'), dur: int(m.dur, 40, 500, 110) },
            fx: (Array.isArray(r.fx) ? r.fx : []).slice(0, 6).map(cleanEm),
            proj: { on: !!p.on, shape: pick(p.shape, PSHAPE, 'orb'), c1: colr(p.c1, '#4dd2ff'), c2: colr(p.c2, '#ffffff'), size: clampN(p.size, 0.5, 3, 1), trail: pick(p.trail, TRAIL, 'fade'), tlen: clampN(p.tlen, 0.5, 4, 1.5), glow: clampN(p.glow, 0, 1, 0.6), spin: !!p.spin },
            obt: { way: pick(o.way, WAYS, 'shop'), cash: int(o.cash, 0, 100000000, 0), scraps: int(o.scraps, 0, 1000000, 30), slot: int(o.slot, 0, 51, 1), wave: int(o.wave, 1, 500, 20), chance: clampN(o.chance, 0.1, 100, 5), how: text(o.how, 80, '') },
            adminOnly: !!r.adminOnly, allow: (Array.isArray(r.allow) ? r.allow : []).map(x => String(x).toLowerCase().trim()).filter(x => /^[a-z0-9_]{1,24}$/.test(x)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 30),
            by: text(r.by, 24, ''), t: Math.floor(clampN(r.t, 0, 4102444800000, 0))
        };
        if (d.obt.way === 'shop' && !d.obt.cash && !d.obt.scraps) d.obt.scraps = 30;
        return d;
    };
    SKL.sanitize = sanitize;
    const touch = (d) => { d.art._rev = (d.art._rev | 0) + 1; };
    const strip = (d) => sanitize(d, false);
    // Firestore forbids arrays inside arrays, so frames travel as one '/'-joined string per frame
    const toDB = (d) => { const c = clone(d); c.art.layers.forEach(L => { L.f = L.f.map(rows => rows.join('/')); }); return c; };
    const slugOf = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);

    // ================================================================== ART: masks, generators, import
    const OXof = (n) => Math.max(2, Math.round(n * 6 / 32));
    const maskOf = (n, shape) => {
        const m = new Uint8Array(n * n), ox = OXof(n), cy = n >> 1, u = n / 32;
        const set = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < n && y < n) m[y * n + x] = 1; };
        const rect = (x0, y0, x1, y1) => { for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) set(x, y); };
        const disc = (cx, cy2, r) => { r = Math.max(1, r); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * .6) set(cx + x, cy2 + y); };
        if (shape === 'blade') {
            rect(ox - 3 * u, cy - 1 * u, ox + 1 * u, cy + 1 * u); rect(ox + 2 * u, cy - 4 * u, ox + 3.4 * u, cy + 4 * u);
            const x0 = ox + 4.5 * u, x1 = n - 1; for (let x = Math.round(x0); x <= x1; x++) { const tp = (x - x0) / (x1 - x0), half = Math.max(0, 2.2 * u * (tp < .75 ? 1 : (1 - tp) * 4)); rect(x, cy - half, x, cy + half); }
        } else if (shape === 'orb') {
            rect(ox - 4 * u, cy - 1 * u, ox + 9 * u, cy + 1 * u); disc(Math.round(ox + 15 * u), cy, Math.round(7 * u));
        } else if (shape === 'staff') {
            rect(ox - 4 * u, cy - 1 * u, n - 8 * u, cy + 0.6 * u); disc(Math.round(n - 5 * u), cy, Math.round(4 * u)); rect(n - 9 * u, cy - 3 * u, n - 8 * u, cy + 3 * u);
        } else {   // gun
            rect(ox - 2 * u, cy - 3 * u, ox + 14 * u, cy + 2 * u); rect(ox + 14 * u, cy - 2 * u, n - 2, cy + 0.6 * u); rect(ox + 1 * u, cy + 2 * u, ox + 5 * u, cy + 8 * u); rect(ox + 7 * u, cy + 2 * u, ox + 9 * u, cy + 5 * u); rect(ox + 12 * u, cy - 5 * u, ox + 14 * u, cy - 3 * u);
        }
        return m;
    };
    const hash2 = (x, y, s) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 982451653, 1274126177); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
    const vnoise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };

    // gen: returns { n, pal, layers[body, glow, accent], frames, durs } for a mode/shape/colours. Animated modes produce `frames` variants.
    const gen = (o) => {
        o = o || {}; const mode = pick(o.mode, GEN_MODES, 'gradient'), shape = pick(o.shape, GEN_SHAPES, 'gun'), n = int(o.n, 16, 48, 32), F = int(o.frames, 1, 12, 1), seed = int(o.seed, 0, 99999, 1);
        const c1 = colr(o.c1, '#4dd2ff'), c2 = colr(o.c2, '#ffffff'), c3 = colr(o.c3, '#12304a');
        const m = maskOf(n, shape), ox = OXof(n); let pal = [];
        pal = pal.concat(ramp(c3, c1, 4), ramp(c1, c2, 4));          // 0..7 dark -> light
        pal.push(mixHex(c3, '#000000', .55), mixHex(c2, '#ffffff', .6), mixHex(c1, '#ffffff', .35), c1);   // 8 edge, 9 highlight, 10 light accent, 11 base
        if (mode === 'rainbow') { for (let i = 0; i < 12; i++) { const r = hsl2rgb(i / 12, 0.9, 0.55); pal.push(rgb2hex(r[0], r[1], r[2])); } }
        if (mode === 'galaxy') pal.push('#ffffff', '#ffe27a', '#8ad0ff');
        pal = pal.slice(0, MAXPAL);
        const isOn = (x, y) => x >= 0 && y >= 0 && x < n && y < n && m[y * n + x];
        let ymin = n, ymax = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y * n + x]) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
        const dursA = [], bodyF = [], glowF = [], accF = [];
        for (let fi = 0; fi < F; fi++) {
            const ph = F > 1 ? fi / F : 0, rb = [], rg = [], ra = [];
            for (let y = 0; y < n; y++) {
                let sb = '', sg = '', sa = '';
                for (let x = 0; x < n; x++) {
                    let b = '.', gl = '.', ac = '.';
                    const on = isOn(x, y);
                    if (on) {
                        const edge = !isOn(x - 1, y) || !isOn(x + 1, y) || !isOn(x, y - 1) || !isOn(x, y + 1);
                        const nx = (x - ox) / Math.max(1, n - ox), ny = (y - ymin) / Math.max(1, ymax - ymin);
                        let v = .5;
                        if (mode === 'gradient') v = nx;
                        else if (mode === 'metallic') { v = .35 + .35 * Math.sin(ny * 6.5 + nx * 1.5); if (ny < .28) v = .85 + .15 * Math.sin(nx * 9); if (ny > .8) v *= .6; }
                        else if (mode === 'camo') { const q = vnoise(x / (n / 8), y / (n / 8), seed) + .4 * vnoise(x / (n / 3), y / (n / 3), seed + 7); v = q > 1.05 ? .95 : q > .8 ? .55 : q > .5 ? .25 : .05; }
                        else if (mode === 'neon') v = edge ? 1 : .12 + .1 * Math.sin(nx * 8 + ph * TAU);
                        else if (mode === 'fire') { const q = vnoise(x / 3.2, (y + ph * n * 1.4) / 3.2, seed); v = Math.max(0, Math.min(1, (1 - ny) * .7 + (q - .4) * .9)); }
                        else if (mode === 'ice') { const f = (Math.floor((x + y * 0.8) / (n / 8)) % 3 + 3) % 3; v = .35 + f * .25 + (hash2(x, y, seed) > .93 ? .3 : 0); }
                        else if (mode === 'galaxy') { const q = vnoise(x / 4, y / 4, seed) * .7 + vnoise(x / 1.7, y / 1.7, seed + 3) * .3; v = q * .85; }
                        v = Math.max(0, Math.min(1, v));
                        b = CH[mode === 'rainbow' ? 12 + ((((Math.floor((x - ox) / (n / 16)) - fi * Math.max(1, Math.round(12 / F))) % 12) + 12) % 12) : Math.round(v * 7)];
                        if (mode === 'galaxy' && hash2(x, y, seed + 9 + fi * 7) > .955) b = CH[12 + ((x + y + fi) % 3)];
                        if (edge) ac = CH[8];
                        else if (mode !== 'neon' && mode !== 'rainbow' && !isOn(x, y - 1 - 1) && isOn(x, y - 1)) ac = CH[9];
                    } else {
                        let near = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isOn(x + dx, y + dy)) near = Math.max(near, 3 - Math.max(Math.abs(dx), Math.abs(dy)));
                        if (near && (mode === 'neon' || mode === 'fire' || mode === 'galaxy' || mode === 'ice' || mode === 'rainbow')) gl = CH[near === 2 ? 10 : 11];
                    }
                    sb += b; sg += gl; sa += ac;
                }
                rb.push(sb); rg.push(sg); ra.push(sa);
            }
            bodyF.push(rb); glowF.push(rg); accF.push(ra); dursA.push(F > 1 ? (mode === 'rainbow' ? 90 : 110) : 120);
        }
        const gAlpha = mode === 'neon' ? .85 : .4;
        const layers = [
            { name: 'Body', vis: true, blend: 'normal', op: 1, hue: 0, spin: 0, glow: false, f: bodyF },
            { name: 'Glow', vis: true, blend: 'add', op: gAlpha, hue: 0, spin: 0, glow: true, f: glowF },
            { name: 'Accents', vis: true, blend: 'normal', op: 1, hue: 0, spin: 0, glow: false, f: accF }
        ];
        return { n, pal, layers, frames: F, durs: dursA, loop: 'loop', gen: { mode, shape, c1, c2, c3, seed } };
    };
    SKL.gen = gen;

    // import any image (HTMLImageElement/Canvas): scale to the grid, quantise to <=maxCols colours. Returns {pal, rows}.
    const quantise = (img, n, maxCols) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true;
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, sc = Math.min(n / iw, n / ih);
        const dw = Math.max(1, Math.round(iw * sc)), dh = Math.max(1, Math.round(ih * sc));
        x.drawImage(img, Math.round((n - dw) / 2), Math.round((n - dh) / 2), dw, dh);
        const data = x.getImageData(0, 0, n, n).data, buckets = {};
        for (let i = 0; i < n * n; i++) { if (data[i * 4 + 3] < 128) continue; const k = (data[i * 4] >> 4) << 8 | (data[i * 4 + 1] >> 4) << 4 | (data[i * 4 + 2] >> 4); const b = buckets[k] || (buckets[k] = { c: 0, r: 0, g: 0, b: 0 }); b.c++; b.r += data[i * 4]; b.g += data[i * 4 + 1]; b.b += data[i * 4 + 2]; }
        let list = Object.keys(buckets).map(k => { const b = buckets[k]; return { c: b.c, rgb: [b.r / b.c, b.g / b.c, b.b / b.c] }; }).sort((a, b) => b.c - a.c).slice(0, maxCols);
        if (!list.length) list = [{ c: 1, rgb: [255, 255, 255] }];
        const pal = list.map(l => rgb2hex(l.rgb[0], l.rgb[1], l.rgb[2])), rows = [];
        for (let y = 0; y < n; y++) {
            let s = '';
            for (let xx = 0; xx < n; xx++) {
                const i = (y * n + xx) * 4; if (data[i + 3] < 128) { s += '.'; continue; }
                let bi = 0, bd = 1e9; for (let k = 0; k < list.length; k++) { const c = list[k].rgb, dd = (c[0] - data[i]) ** 2 + (c[1] - data[i + 1]) ** 2 + (c[2] - data[i + 2]) ** 2; if (dd < bd) { bd = dd; bi = k; } }
                s += CH[bi];
            }
            rows.push(s);
        }
        return { pal, rows };
    };
    SKL.quantise = quantise;

    // ================================================================== RENDER: compile art -> frame canvases, draw with animation
    const LC = document.createElement('canvas');
    const frameCv = (d, fi, hs) => {
        const a = d.art, n = a.n, C = d._c || (d._c = { rev: -1, m: {} });
        if (C.rev !== (a._rev | 0)) { C.rev = a._rev | 0; C.m = {}; }
        const key = fi + '_' + hs; if (C.m[key]) return C.m[key];
        const cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d');
        LC.width = LC.height = n; const lx = LC.getContext('2d', { willReadFrequently: true });
        a.layers.forEach((L) => {
            if (!L.vis) return;
            const rows = L.f[fi] || L.f[0], img = lx.createImageData(n, n), data = img.data, cols = a.pal.map(h => hex2rgb(hueHex(h, L.hue + (L.spin ? hs * 30 : 0))));
            const cnt = {};
            for (let y = 0; y < n; y++) { const row = rows[y]; for (let xx = 0; xx < n; xx++) { const ch = row[xx]; if (ch === '.') continue; const k = CH.indexOf(ch); const c = cols[k]; if (!c) continue; const i = (y * n + xx) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; cnt[k] = (cnt[k] || 0) + 1; } }
            lx.putImageData(img, 0, 0);
            x.save(); x.globalAlpha = L.op; x.globalCompositeOperation = BLENDS[L.blend] || 'source-over';
            if (L.glow) { let bk = 0, bc = 0; for (const k in cnt) if (cnt[k] > bc) { bc = cnt[k]; bk = +k; } const c = cols[bk] || [255, 255, 255]; x.shadowColor = rgb2hex(c[0], c[1], c[2]); x.shadowBlur = Math.max(2, n / 10); }
            x.drawImage(LC, 0, 0); x.restore();
        });
        C.m[key] = cv; return cv;
    };
    const maxSpin = (d) => d.art.layers.reduce((m, L) => Math.max(m, L.spin), 0);
    // which frame at time (ms): honours per-frame durations and loop / pingpong / once
    const frameAt = (a, ms, born) => {
        const F = a.frames; if (F <= 1) return 0;
        const seq = []; for (let i = 0; i < F; i++) seq.push(i);
        if (a.loop === 'pingpong' && F > 2) for (let i = F - 2; i >= 1; i--) seq.push(i);
        let tot = 0; seq.forEach(i => { tot += a.durs[i]; });
        let t = a.loop === 'once' ? Math.min(Math.max(0, ms - (born || 0)), tot - 1) : ((ms % tot) + tot) % tot;
        for (let k = 0; k < seq.length; k++) { t -= a.durs[seq[k]]; if (t < 0) return seq[k]; }
        return seq[seq.length - 1];
    };
    SKL.frameAt = frameAt;
    const tipOf = (d, sc) => { const cell = sc * 32 / d.art.n; return (d.art.n - OXof(d.art.n)) * cell; };

    const drawStar4 = (c, r, ir) => { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? ir : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); };
    const drawMuzzle = (c, d, age, tip, u) => {
        const M = d.muzzle; if (M.shape === 'none' || age >= M.dur || age < 0) return; const p = age / M.dur, k = 1 - p, S = M.size * 9 * u;
        c.save(); c.translate(tip, 0); c.globalCompositeOperation = 'lighter'; c.globalAlpha = k; c.fillStyle = c.strokeStyle = M.color; c.shadowColor = M.color; c.shadowBlur = 8;
        if (M.shape === 'star') { c.rotate(p * 1.2); drawStar4(c, S * (0.6 + p * .5), S * .22); c.fill(); }
        else if (M.shape === 'burst') { for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + .2; c.lineWidth = 1.6 * u; c.beginPath(); c.moveTo(Math.cos(a) * S * .25, Math.sin(a) * S * .25); c.lineTo(Math.cos(a) * S * (.6 + p), Math.sin(a) * S * (.6 + p)); c.stroke(); } }
        else if (M.shape === 'ring') { c.lineWidth = 2 * u * k + .5; c.beginPath(); c.arc(0, 0, S * (.3 + p * .9), 0, TAU); c.stroke(); }
        else if (M.shape === 'cone') { c.beginPath(); c.moveTo(0, -S * .18); c.lineTo(S * (1 + p), 0); c.lineTo(0, S * .18); c.closePath(); c.fill(); }
        else if (M.shape === 'cross') { c.fillRect(-S * .8, -S * .08, S * 1.6, S * .16); c.fillRect(-S * .08, -S * .8, S * .16, S * 1.6); }
        c.restore();
    };
    // the one painter: sprite + aura + animation state (st may be null: just idle). c is origin-at-hand, pointing +x
    const drawSkin = (c, d, t, sc, st) => {
        const a = d.art, n = a.n, cell = sc * 32 / n, ox = OXof(n), u = sc * 1.25, now = t * 1000, an = d.anim;
        const fa = st && st.fireT ? now - st.fireT : 1e9, ea = st && st.equipT ? now - st.equipT : 1e9;
        const fi = frameAt(a, now, st && st.born), sp = maxSpin(d), hs = sp ? Math.floor(((t * sp) % 360) / 30) : 0;
        const cv = frameCv(d, fi, hs), cx = (n / 2 - ox) * cell, tip = (n - ox) * cell;
        c.save();
        if (an.aura.on) {
            const pu = 1 + Math.sin(t * an.aura.speed * TAU) * an.aura.pulse * .35, r = an.aura.size * 22 * u * pu;
            const gr = c.createRadialGradient(cx, 0, 0, cx, 0, r); gr.addColorStop(0, an.aura.color + 'aa'); gr.addColorStop(1, an.aura.color + '00');
            c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = gr; c.beginPath(); c.arc(cx, 0, r, 0, TAU); c.fill(); c.restore();
        }
        let alpha = 1, bright = 0;
        const I = an.idle, ph = t * I.speed * TAU;
        if (I.type === 'bob') c.translate(0, Math.sin(ph) * I.amp * 1.6 * u);
        else if (I.type === 'sway') c.rotate(Math.sin(ph) * I.amp * .16);
        else if (I.type === 'float') c.translate(Math.cos(ph * .5) * I.amp * u, Math.sin(ph) * I.amp * 1.4 * u);
        else if (I.type === 'wobble') { c.translate(cx, 0); c.rotate(Math.sin(ph * 1.7) * I.amp * .22); c.translate(-cx, 0); }
        else if (I.type === 'spin') { c.translate(cx, 0); c.rotate(ph * .5 * I.amp); c.translate(-cx, 0); }
        else if (I.type === 'pulse') { const s = 1 + Math.sin(ph) * I.amp * .12; c.translate(cx, 0); c.scale(s, s); c.translate(-cx, 0); }
        const Q = an.equip;
        if (Q.type !== 'none' && ea < Q.dur) {
            const p = ease(Q.ease, ea / Q.dur);
            if (Q.type === 'pop') { const s = Math.max(.05, p); c.translate(cx, 0); c.scale(s, s); c.translate(-cx, 0); alpha *= Math.min(1, .3 + p); }
            else if (Q.type === 'spin') { c.translate(cx, 0); c.rotate((p - 1) * TAU); c.translate(-cx, 0); }
            else if (Q.type === 'slide') { c.translate(-(1 - p) * 14 * u, (1 - p) * 9 * u); alpha *= Math.min(1, p + .2); }
            else if (Q.type === 'flash') bright = Math.max(bright, 1 - p);
        }
        const Fm = an.fire, me = an.melee;
        if (me.on && fa < me.life) { const p = ease('out', fa / me.life); c.rotate((-me.arc / 2 + me.arc * p) * DEG * 0.6); }
        else if (Fm.type !== 'none' && fa < Fm.dur) {
            const p = fa / Fm.dur, e = 1 - ease(Fm.ease, p), amp = Fm.amp;
            if (Fm.type === 'kick') { c.translate(-9 * amp * u * e, 0); c.rotate(-.18 * amp * e); }
            else if (Fm.type === 'spin') { c.translate(cx, 0); c.rotate(TAU * Math.min(1, amp) * ease(Fm.ease, p)); c.translate(-cx, 0); }
            else if (Fm.type === 'pulse') { const s = 1 + .5 * amp * e; c.translate(cx, 0); c.scale(s, s); c.translate(-cx, 0); }
            else if (Fm.type === 'shake') c.translate((rnd() - .5) * 5 * amp * u * e, (rnd() - .5) * 5 * amp * u * e);
            else if (Fm.type === 'flash') bright = Math.max(bright, e * amp);
        }
        const K = an.cool;
        if (K.type !== 'none' && fa >= Fm.dur && fa < Fm.dur + K.dur) {
            const p = (fa - Fm.dur) / K.dur;
            if (K.type === 'dim') alpha *= .45 + .55 * p; else if (K.type === 'shrink') { const s = .8 + .2 * p; c.translate(cx, 0); c.scale(s, s); c.translate(-cx, 0); }
            else if (K.type === 'glow') bright = Math.max(bright, (1 - p) * .8);
        }
        c.imageSmoothingEnabled = false; c.globalAlpha *= alpha;
        c.drawImage(cv, -ox * cell, -n * cell / 2, n * cell, n * cell);
        if (bright > .02) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, bright) * .7; c.drawImage(cv, -ox * cell, -n * cell / 2, n * cell, n * cell); }
        c.restore();
        if (st) { c.save(); drawMuzzle(c, d, fa, tip, u); c.restore(); }
    };
    SKL.drawSkin = drawSkin;
    SKL.tipOf = tipOf;
    const RT = SKL._rt = { frameCv, strip, touch, maskOf, OXof, hueHex, mixHex, ramp, hex2rgb, rgb2hex, clone, emptyRows, cleanRows, slugOf, text, colr, int, clampN, pick, drawStar4, ease, defaultAnim, cleanEm, MAXPAL, CH, BLENDS, RAR_COL, E_, $q, safe, TAU, DEG, rnd, tipOf, frameAt, drawSkin };

    // ================================================================== FX RUNTIME (particles, trails, projectile re-skin, kill/hit flourishes). A "world" W is just lists, so the lab preview has its own.
    const CAP = 420;
    const newWorld = () => ({ parts: [], sh: [], flash: 0, flashC: '#ffffff', frame: 0, seen: new Map(), last: 0, act: null, shk: 0 });
    const GW = SKL.W = newWorld();
    const emitEm = (W, em, x, y, ang, n) => {
        n = n || em.count; n = Math.min(n, 24);
        for (let i = 0; i < n && W.parts.length < CAP; i++) {
            const dir = ang + (rnd() - .5) * em.spread * DEG, sp = em.speed * (0.45 + rnd() * .8), life = em.life / 1000 * (0.7 + rnd() * .6);
            W.parts.push({ x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, g: em.gravity, life, max: life, s: em.size * (0.7 + rnd() * .6), c: rnd() < .5 ? em.c1 : em.c2, c1: em.c1, c2: em.c2, k: em.kind, rot: rnd() * TAU, vr: (rnd() - .5) * .3 });
        }
    };
    const EM_AT_DEF = (kind, c1, c2, o) => RT.cleanEm({ kind, c1, c2, ...o });
    const flourish = (W, type, x, y, color, d) => {
        if (type === 'none') return;
        if (type === 'burst') emitEm(W, EM_AT_DEF('spark', color, '#ffffff', { count: 9, speed: 4.5, life: 380, size: 2, spread: 360, gravity: 0.06 }), x, y, 0);
        else if (type === 'stars') emitEm(W, EM_AT_DEF('star', color, '#ffe27a', { count: 6, speed: 2.6, life: 700, size: 3.5, spread: 360, gravity: -0.03 }), x, y, 0);
        else if (type === 'ring') W.sh.push({ t: 'ring', x, y, r0: 4, r1: 34, c: color, w: 3, life: .42, max: .42 });
        else if (type === 'flash') W.sh.push({ t: 'flare', x, y, r: 26, c: color, life: .2, max: .2 });
    };
    const fireEvent = (W, d, st, base, a, tipPx, real) => {
        const now = performance.now(); st.fireT = now;
        const mx = base.x + Math.cos(a) * tipPx, my = base.y + Math.sin(a) * tipPx;
        d.fx.forEach(em => { if (em.at === 'muzzle') emitEm(W, em, mx, my, a); });
        const me = d.anim.melee;
        if (me.on && me.trail !== 'none') W.sh.push({ t: 'arc', x: base.x - Math.cos(a) * 14, y: base.y - Math.sin(a) * 14, a0: a - me.arc / 2 * DEG, a1: a + me.arc / 2 * DEG, r: 30 + tipPx * .5, c: me.color, w: me.width, life: me.life / 1000, max: me.life / 1000, mode: me.trail });
        const F = d.anim.flash;
        if (F.screen) { W.flash = 0.2; W.flashC = F.color; }
        if (F.shake > 0) { if (real) { try { g.shake = Math.max(g.shake || 0, F.shake); } catch (e) { /* no game yet */ } } else W.shk = Math.max(W.shk, F.shake); }
    };
    const hitEvent = (W, d, x, y, kill) => {
        d.fx.forEach(em => { if (em.at === (kill ? 'kill' : 'impact')) emitEm(W, em, x, y, -Math.PI / 2); });
        const A = kill ? d.anim.kill : d.anim.hit; flourish(W, A.type, x, y, A.color, d);
    };
    SKL._fireEvent = fireEvent; SKL._hitEvent = hitEvent;

    const drawParts = (W, ctx, dt) => {
        for (let i = W.parts.length - 1; i >= 0; i--) {
            const p = W.parts[i]; p.life -= dt; if (p.life <= 0) { W.parts.splice(i, 1); continue; }
            p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vy += p.g * dt * 60; p.vx *= (1 - dt * .8); p.rot += p.vr;
            const k = p.life / p.max, col = k > .5 ? p.c : RT.mixHex(p.c, p.c2 === p.c ? p.c1 : p.c2, (.5 - k) * 1.2);
            ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = ctx.strokeStyle = col;
            if (p.k === 'spark') { ctx.lineWidth = Math.max(1, p.s * .5); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6); ctx.stroke(); }
            else if (p.k === 'ember') { ctx.shadowColor = col; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.6, p.s * (.4 + k * .6)), 0, TAU); ctx.fill(); }
            else if (p.k === 'bubble') { ctx.lineWidth = 1; const r = p.s * (1 + (1 - k) * .6); ctx.beginPath(); ctx.arc(p.x + Math.sin(p.rot * 3) * .6, p.y, r, 0, TAU); ctx.stroke(); ctx.globalAlpha *= .6; ctx.fillRect(p.x - r * .4, p.y - r * .5, Math.max(1, r * .3), Math.max(1, r * .3)); }
            else if (p.k === 'star') { ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.shadowColor = col; ctx.shadowBlur = 5; RT.drawStar4(ctx, p.s * (.6 + k * .8), p.s * .25); ctx.fill(); }
            else { const s = Math.max(1, Math.round(p.s * (.5 + k * .5))); ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s); }   // dust = pixel
            ctx.restore();
        }
        for (let i = W.sh.length - 1; i >= 0; i--) {
            const s = W.sh[i]; s.life -= dt; if (s.life <= 0) { W.sh.splice(i, 1); continue; }
            const k = s.life / s.max, p = 1 - k; ctx.save(); ctx.strokeStyle = ctx.fillStyle = s.c;
            if (s.t === 'ring') { ctx.globalAlpha = k; ctx.lineWidth = s.w * k + .5; ctx.beginPath(); ctx.arc(s.x, s.y, s.r0 + (s.r1 - s.r0) * p, 0, TAU); ctx.stroke(); }
            else if (s.t === 'flare') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * .8; const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r); gr.addColorStop(0, s.c); gr.addColorStop(1, s.c + '00'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
            else if (s.t === 'arc') {
                ctx.lineCap = 'round'; ctx.shadowColor = s.c; ctx.shadowBlur = s.mode === 'solid' ? 0 : 8;
                const sweep = Math.min(1, p * 2.4), end = s.a0 + (s.a1 - s.a0) * sweep;
                for (let j = 0; j < 4; j++) { ctx.globalAlpha = k * (s.mode === 'solid' ? 1 : .35 + j * .17); ctx.lineWidth = s.w * (1 - j * .2) * (s.mode === 'solid' ? 1 : k + .3); ctx.beginPath(); ctx.arc(s.x, s.y, s.r - j * 1.5, Math.max(s.a0, end - (s.mode === 'solid' ? 9 : 1.1 + j * .25)), end); ctx.stroke(); }
                if (s.mode === 'spark' && rnd() < .8 && W.parts.length < CAP) { const a = end; W.parts.push({ x: s.x + Math.cos(a) * s.r, y: s.y + Math.sin(a) * s.r, vx: Math.cos(a + 1.57) * 1.2, vy: Math.sin(a + 1.57) * 1.2, g: 0.04, life: .3, max: .3, s: 2, c: s.c, c1: s.c, c2: '#fff', k: 'spark', rot: 0, vr: 0 }); }
            }
            ctx.restore();
        }
    };

    // projectile painter (local frame: origin at the bullet, +x forward)
    const drawProj = (ctx, d, b, ang, t, W, dt, st) => {
        const P = d.proj, S = Math.max(3, (b.r || 6) * P.size), c1 = P.c1, c2 = P.c2, sp = Math.hypot(b.vx || 0, b.vy || 0) || 8;
        ctx.save(); ctx.translate(b.x, b.y); if (b.ghost) ctx.globalAlpha = .35;
        // trail (behind)
        const back = ang + Math.PI;
        if (P.trail === 'line') { const L = S * 3.2 * P.tlen + sp * 1.4, gr = ctx.createLinearGradient(0, 0, -Math.cos(ang) * L, -Math.sin(ang) * L); gr.addColorStop(0, c1); gr.addColorStop(1, c1 + '00'); ctx.strokeStyle = gr; ctx.lineWidth = S * .8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(ang) * L, -Math.sin(ang) * L); ctx.stroke(); }
        else if (P.trail === 'fade' || P.trail === 'rainbow') { const N = 6; for (let i = N; i >= 1; i--) { const k = 1 - i / (N + 1); ctx.globalAlpha = (b.ghost ? .35 : 1) * k * .55; ctx.fillStyle = P.trail === 'rainbow' ? RT.hueHex(c1, i * 40 + t * 120) : c1; const off = i * S * .8 * P.tlen; ctx.beginPath(); ctx.arc(-Math.cos(ang) * off, -Math.sin(ang) * off, S * .55 * k + .5, 0, TAU); ctx.fill(); } ctx.globalAlpha = b.ghost ? .35 : 1; }
        else if (P.trail === 'sparks' && st && W && W.parts.length < CAP) { st.sacc = (st.sacc || 0) + dt * 40; while (st.sacc >= 1) { st.sacc--; W.parts.push({ x: b.x - Math.cos(ang) * S, y: b.y - Math.sin(ang) * S, vx: Math.cos(back + (rnd() - .5) * 1.4) * 1.8, vy: Math.sin(back + (rnd() - .5) * 1.4) * 1.8, g: 0.03, life: .3, max: .3, s: 2, c: rnd() < .5 ? c1 : c2, c1, c2, k: 'spark', rot: 0, vr: 0 }); } }
        ctx.rotate(P.spin ? t * 9 : ang);
        ctx.shadowColor = c1; ctx.shadowBlur = P.glow * 16; ctx.fillStyle = c1;
        if (P.shape === 'orb') { ctx.beginPath(); ctx.arc(0, 0, S, 0, TAU); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(-S * .2, -S * .2, S * .5, 0, TAU); ctx.fill(); }
        else if (P.shape === 'bolt') { ctx.beginPath(); ctx.moveTo(S * 2.2, 0); ctx.lineTo(0, -S * .55); ctx.lineTo(-S * 1.8, 0); ctx.lineTo(0, S * .55); ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.fillRect(-S * .8, -S * .15, S * 2, S * .3); }
        else if (P.shape === 'shard') { ctx.beginPath(); ctx.moveTo(S * 2.4, 0); ctx.lineTo(S * .2, -S * .9); ctx.lineTo(-S * 1.3, 0); ctx.lineTo(S * .2, S * .9); ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(S * 1.6, 0); ctx.lineTo(S * .1, -S * .4); ctx.lineTo(-S * .3, 0); ctx.closePath(); ctx.fill(); }
        else if (P.shape === 'star') { RT.drawStar4(ctx, S * 1.5, S * .5); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, S * .35, 0, TAU); ctx.fill(); }
        else if (P.shape === 'arrow') { ctx.fillRect(-S * 1.8, -S * .2, S * 2.4, S * .4); ctx.beginPath(); ctx.moveTo(S * 1.7, 0); ctx.lineTo(S * .4, -S * .8); ctx.lineTo(S * .4, S * .8); ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.fillRect(-S * 1.8, -S * .6, S * .5, S * 1.2); }
        else if (P.shape === 'pixel') { ctx.rotate(-ang); ctx.shadowBlur = P.glow * 8; const q = Math.max(2, Math.round(S * .8)); ctx.fillRect(-q * 1.5, -q * 1.5, q * 3, q * 3); ctx.fillStyle = c2; ctx.fillRect(-q * .5, -q * 1.5, q, q); ctx.fillRect(-q * 1.5, -q * .5, q, q); }
        else if (P.shape === 'flame') { const fl = 1 + Math.sin(t * 40 + b.x) * .15; ctx.beginPath(); ctx.moveTo(S * 1.3, 0); ctx.quadraticCurveTo(S * .2, -S * 1.1 * fl, -S * 2 * fl, 0); ctx.quadraticCurveTo(S * .2, S * 1.1 * fl, S * 1.3, 0); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(S * .8, 0); ctx.quadraticCurveTo(0, -S * .5, -S * 1.1, 0); ctx.quadraticCurveTo(0, S * .5, S * .8, 0); ctx.fill(); }
        ctx.restore();
    };
    SKL._drawProj = drawProj;

    // ---- game hooks ----
    const ST = new WeakMap(), ZH = new WeakMap();
    const stOf = (p) => { let s = ST.get(p); if (!s) { s = { fireT: 0, equipT: 0, born: 0, prev: 0, last: 0, acc: [] }; ST.set(p, s); } return s; };
    SKL.held = (ctx, k, p, a, recoil) => safe('held', () => {
        const d = k && k.labDef; if (!d || !p) return false;
        const st = stOf(p), now = performance.now(), dt = Math.min(.05, Math.max(0, (now - st.last) / 1000));
        if (now - st.last > 500) { st.equipT = now; st.born = now; st.prev = recoil || 0; }
        st.last = now;
        const base = { x: p.x + Math.cos(a) * (17 - recoil * 7), y: p.y + 4 + Math.sin(a) * (11 - recoil * 4) }, tip = tipOf0(d);
        const real = p === g.player;
        if (recoil - st.prev > .3) fireEvent(GW, d, st, base, a, tip, real);
        st.prev = recoil;
        d.fx.forEach((em, i) => { if (em.at === 'aura') { st.acc[i] = (st.acc[i] || 0) + em.rate * dt; while (st.acc[i] >= 1) { st.acc[i]--; const r = rnd() * tip; emitEm(GW, em, base.x + Math.cos(a) * r, base.y + Math.sin(a) * r, a, 1); } } });
        if (real) GW.act = { d, st, t: now, p };
        drawSkin(ctx, d, now / 1000, 0.8, st);
        return true;
    });
    const tipOf0 = (d) => SKL.tipOf(d, 0.8);
    SKL.bullet = (ctx, b) => safe('bullet', () => {
        const sid = b.sk; if (!sid) return false; const k = SKINS[sid]; if (!k || !k.labDef) return false;
        const d = k.labDef, now = performance.now() / 1000, ang = Math.atan2(b.vy || 0, b.vx || 1);
        const st = b._sl || (b._sl = {}); GW.seen.set(b, { x: b.x, y: b.y, d, f: GW.frame, ang });
        d.fx.forEach((em, i) => { if (em.at === 'trail') { st['a' + i] = (st['a' + i] || 0) + em.rate / 60; while (st['a' + i] >= 1) { st['a' + i]--; emitEm(GW, em, b.x, b.y, ang + Math.PI, 1); } } });
        if (d.proj.on) { drawProj(ctx, d, b, ang, now, GW, 1 / 60, st); return true; }
        if (b.id === 'HOSE') {   // hose skins without a custom projectile: spray in the skin's colours
            const hc = SKIN_COLS[sid] || ['#3498db', '#7fd3ff']; ctx.shadowColor = hc[0]; ctx.shadowBlur = 6; ctx.fillStyle = hc[0]; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill(); ctx.fillStyle = hc[1]; ctx.beginPath(); ctx.arc(b.x - 1, b.y - 1, b.r * .45, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; return true;
        }
        return false;
    });
    SKL.fx = (ctx) => safe('fx', () => {
        const W = GW, now = performance.now(); let dt = (now - W.last) / 1000; W.last = now;
        if (dt > 1) { W.parts.length = 0; W.sh.length = 0; W.seen.clear(); W.flash = 0; dt = .016; } if (!(dt > 0) || dt > .1) dt = .016;
        if (!W.parts.length && !W.sh.length && !W.seen.size && W.flash <= 0 && !W.act) return;
        // projectiles that vanished since last frame = impacts
        W.seen.forEach((r, b) => { if (r.f < W.frame) { W.seen.delete(b); if (r.x > 0 && r.x < 800 && r.y > 0 && r.y < 600) hitEvent(W, r.d, r.x, r.y, false); } });
        // hit / kill flourishes for the weapon the player is holding
        const A = W.act; W.act = null;
        if (A && A.t > now - 200 && typeof g !== 'undefined' && g.zombies && now - A.st.fireT < 1800) {
            const d = A.d, pl = A.p; let n = 0, hits = 0;
            for (const z of g.zombies) {
                if (n++ > 90) break; let r = ZH.get(z); if (!r) { ZH.set(z, { hp: z.hp, dead: !!z.dead }); continue; }
                if (!r.dead && z.dead) { r.dead = true; if (Math.hypot(z.x - pl.x, z.y - pl.y) < 560) hitEvent(W, d, z.x, z.y, true); if (d.anim.flash.screen) { W.flash = .24; W.flashC = d.anim.flash.color; } }
                else if (z.hp < r.hp - .5 && hits < 3 && Math.hypot(z.x - pl.x, z.y - pl.y) < 560 && (d.anim.hit.type !== 'none' || d.fx.some(e => e.at === 'impact')) && !d.proj.on) { hits++; hitEvent(W, d, z.x, z.y, false); }
                r.hp = z.hp;
            }
        }
        if (W.flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(.5, W.flash); ctx.fillStyle = W.flashC; ctx.fillRect(-60, -60, 920, 720); ctx.restore(); W.flash -= dt * 1.4; }
        drawParts(W, ctx, dt); W.frame++;
    });

    // ================================================================== REGISTRY: definitions -> SKINS entries
    const LS_CACHE = 'mp_cs2_cache_v1', LS_PEND = 'mp_cs2_pending_v1', COL = 'customskins2';
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window etc */ } };
    const DEFAULTS = {}, REMOTE = { docs: {}, ok: false }, DEF = SKL.defs = {};
    let PEND = lsGet(LS_PEND, {}), onChange = [];
    const ORIG_CAL = SKIN_CAL.slice();

    const merged = () => {
        const out = {};
        Object.keys(DEFAULTS).forEach(id => { out[id] = DEFAULTS[id]; });
        Object.keys(REMOTE.docs).forEach(id => { const r = REMOTE.docs[id]; if (r && r.deleted) { delete out[id]; return; } const d = sanitize({ ...r, id }); if (d) out[id] = d; });
        Object.keys(PEND).forEach(id => { const r = PEND[id]; if (r === null || (r && r.deleted)) delete out[id]; else { const d = sanitize({ ...r, id }); if (d) out[id] = d; } });
        return out;
    };
    const admNow = () => { try { return typeof isAdmin === 'function' && !!isAdmin(); } catch (e) { return false; } };
    const unameOf = (u) => String((u && u.username) || '').toLowerCase();
    const mayUse = (d) => !d.adminOnly || admNow() || (d.allow || []).indexOf(unameOf(currentUserData)) >= 0;
    SKL.mayUse = (id) => { const d = DEF[id]; return !d || mayUse(d); };
    const MELEE_IDS = ['WEP_100', 'SAWB'];
    const isMelee = (w) => { const c = window.CWL && CWL.defs && CWL.defs[w]; return c ? c.kind === 'melee' : MELEE_IDS.indexOf(w) >= 0; };
    const targetsOf = (d) => {
        const keys = Object.keys(WEAPON_DATA).filter(w => !(WEAPON_DATA[w] || {}).cwPh);
        if (d.target.mode === 'weapon') return WEAPON_DATA[d.target.weapon] ? [d.target.weapon] : [];
        const t = d.target.type;
        return keys.filter(w => t === 'all' || (t === 'custom' && w.indexOf('CW_') === 0) || (t === 'melee' && isMelee(w)) || (t === 'ranged' && !isMelee(w) && ['SHIELD', 'MINES', 'TURRET', 'SUMMON', 'DRONE'].indexOf(w) < 0)).slice(0, 16);
    };
    SKL.targetsOf = targetsOf;
    const skinIdFor = (d, w) => (d.target.mode === 'weapon' ? d.id : (d.id + '__' + w).slice(0, 56));
    SKL.skinIdFor = skinIdFor;
    const howText = (d) => {
        const o = d.obt;
        if (o.how) return o.how;
        return { shop: 'Skins tab in the shop.', weekly: 'Weekly prize skin: finish a week in 1st place.', wave: 'Reach wave ' + o.wave + ' in a run.', drop: 'Rare drop: ' + o.chance + '% chance each time you clear a wave.', admin: 'A special reward from the admin.' }[o.way];
    };
    let sig = '';
    const apply = () => safe('apply', () => {
        const defs = merged();
        for (const id in DEF) delete DEF[id]; Object.assign(DEF, defs);
        for (const id of Object.keys(SKINS)) if (SKINS[id].lab) { delete SKINS[id]; delete SKIN_COLS[id]; }
        for (let i = 0; i < SKIN_CAL.length; i++) SKIN_CAL[i] = ORIG_CAL[i];
        Object.keys(defs).sort().forEach((id) => {
            const d = defs[id]; if (!mayUse(d)) return;
            const ws = targetsOf(d); if (!ws.length) return;
            ws.forEach((w, wi) => {
                const sid = skinIdFor(d, w), o = d.obt;
                const k = { name: d.name + (d.target.mode === 'type' ? ' (' + (WEAPON_DATA[w].label || w) + ')' : ''), weapon: w, how: howText(d), lab: true, labId: d.id, labDef: d, rarity: d.rarity, desc: d.desc, draw: (c, t, sc) => drawSkin(c, d, t, sc, null) };
                if (o.way === 'shop') { const p = {}; if (o.cash) p.cash = o.cash; if (o.scraps) p.scraps = o.scraps; k.price = p; k.how = 'Skins tab in the shop.'; }
                SKINS[sid] = k;
                SKIN_COLS[sid] = d.proj.on ? [d.proj.c1, d.proj.c2] : (d.fx.length ? [d.fx[0].c1, d.fx[0].c2] : [d.art.pal[Math.min(5, d.art.pal.length - 1)], d.art.pal[Math.min(7, d.art.pal.length - 1)]]);
                if (o.way === 'weekly' && wi === 0) SKIN_CAL[o.slot % 52] = sid;
            });
        });
        try { applySkinCfg(); } catch (e) { /* main file not ready */ }
        const sel = $q('adm-skin'); if (sel && admNow()) { const keep = sel.value; sel.innerHTML = Object.keys(SKINS).map(id => `<option value="${id}">${E_(SKINS[id].name)}</option>`).join(''); if (SKINS[keep]) sel.value = keep; }
        try { const sm = $q('shop-modal'); if (sm && !sm.classList.contains('hidden') && window.mpRenderShop) window.mpRenderShop(); } catch (e) { /* ignore */ }
        sig = sigNow();
        onChange.forEach(f => safe('onChange', f));
    });
    const sigNow = () => Object.keys(WEAPON_DATA).length + '|' + (admNow() ? 1 : 0) + '|' + ((currentUserData && currentUserData.username) || '');
    SKL.apply = apply;
    setInterval(() => safe('sig', () => { if (sigNow() !== sig) apply(); }), 1500);

    // ---- persistence: Firestore (default db) + localStorage cache + offline queue ----
    const strip2 = (d) => { const c = sanitize(d, false); return c; };
    const flush = async () => {
        if (typeof db === 'undefined') return false;
        const ids = Object.keys(PEND); let allOk = true;
        for (const id of ids) {
            const v = PEND[id];
            try { await db.collection(COL).doc(id).set(v === null ? { id, deleted: true, t: Date.now() } : { ...v, id }); if (v === null) { /* tombstone written */ } }
            catch (e) { allOk = false; SKL.lastErr = (e && (e.code || e.message)) || 'offline'; }
        }
        return allOk;
    };
    SKL.flush = flush;
    const saveDef = async (d) => {
        d.by = d.by || (typeof myName === 'function' ? myName() : '') || 'admin'; d.t = Date.now();
        const clean = strip2(d); if (!clean) throw new Error('bad definition');
        PEND[clean.id] = toDB(clean); lsSet(LS_PEND, PEND); apply();
        return await flush();
    };
    const delDef = async (id) => { PEND[id] = null; lsSet(LS_PEND, PEND); delete REMOTE.docs[id]; apply(); return await flush(); };
    SKL.save = saveDef; SKL.del = delDef;

    // ---- shipped examples (built with the same generator the lab uses) ----
    const EXAMPLES = [];
    safe('examples', () => {
        const mk = (id, name, weapon, g1, patch) => { const art = gen(g1); return { id, name, desc: patch.desc, rarity: patch.rarity || 'epic', target: { mode: 'weapon', weapon }, art, adminOnly: true, by: 'Example', ...patch.rest }; };
        EXAMPLES.push(mk('L_NEON_PULSE', 'Neon Pulse', 'SLING', { mode: 'neon', shape: 'gun', c1: '#00ffd5', c2: '#ffffff', c3: '#003a4a', frames: 4 }, {
            desc: 'Example: animated neon (4 frames), pulsing aura, spark trail.', rarity: 'epic', rest: {
                anim: { idle: { type: 'float', amp: .8, speed: 1.2 }, equip: { type: 'flash', dur: 400, ease: 'out' }, fire: { type: 'kick', amp: 1, dur: 200, ease: 'out' }, cool: { type: 'glow', dur: 500 }, hit: { type: 'ring', color: '#00ffd5' }, kill: { type: 'stars', color: '#ffffff' }, aura: { on: true, color: '#00ffd5', size: .8, pulse: .6, speed: 1.4 }, flash: { screen: false, color: '#00ffd5', shake: 0 } },
                muzzle: { shape: 'star', size: 1.1, color: '#9cfff0', dur: 120 },
                fx: [{ at: 'muzzle', kind: 'spark', count: 7, speed: 4, gravity: 0, c1: '#00ffd5', c2: '#ffffff', life: 350, size: 2, spread: 50 }, { at: 'aura', kind: 'dust', rate: 8, count: 1, speed: .5, gravity: -.02, c1: '#00ffd5', c2: '#9cfff0', life: 800, size: 2, spread: 360 }, { at: 'trail', kind: 'spark', rate: 30, count: 1, speed: 1, gravity: 0, c1: '#00ffd5', c2: '#ffffff', life: 300, size: 2, spread: 40 }],
                proj: { on: true, shape: 'orb', c1: '#00ffd5', c2: '#ffffff', size: 1.1, trail: 'sparks', tlen: 1.5, glow: .9 }, obt: { way: 'shop', scraps: 30 }
            }
        }));
        EXAMPLES.push(mk('L_INFERNO', 'Inferno Driver', 'NAIL', { mode: 'fire', shape: 'gun', c1: '#ff6a1a', c2: '#ffe27a', c3: '#4a0a00', frames: 6 }, {
            desc: 'Example: flickering fire art, ember trail on the nails, burst on kills.', rarity: 'legendary', rest: {
                anim: { idle: { type: 'wobble', amp: .5, speed: 1.5 }, equip: { type: 'pop', dur: 350, ease: 'elastic' }, fire: { type: 'kick', amp: 1.2, dur: 220, ease: 'out' }, cool: { type: 'glow', dur: 700 }, hit: { type: 'burst', color: '#ff9a1f' }, kill: { type: 'burst', color: '#ffe27a' }, aura: { on: true, color: '#ff6a1a', size: .6, pulse: .5, speed: 2.2 }, flash: { screen: false, color: '#ffb36a', shake: 1.5 } },
                muzzle: { shape: 'burst', size: 1.2, color: '#ffb36a', dur: 120 },
                fx: [{ at: 'muzzle', kind: 'ember', count: 6, speed: 3, gravity: -.04, c1: '#ff9a1f', c2: '#ffe27a', life: 600, size: 3, spread: 70 }, { at: 'trail', kind: 'ember', rate: 36, count: 1, speed: .8, gravity: -.03, c1: '#ff6a1a', c2: '#ffe27a', life: 450, size: 2.6, spread: 60 }, { at: 'impact', kind: 'ember', count: 10, speed: 3.5, gravity: .06, c1: '#ff4a1a', c2: '#ffe27a', life: 600, size: 3, spread: 360 }, { at: 'aura', kind: 'ember', rate: 6, count: 1, speed: .4, gravity: -.05, c1: '#ff6a1a', c2: '#ffe27a', life: 700, size: 2, spread: 360 }],
                proj: { on: true, shape: 'flame', c1: '#ff6a1a', c2: '#ffe27a', size: 1.2, trail: 'fade', tlen: 1.6, glow: .9 }, obt: { way: 'shop', cash: 50000, scraps: 0 }
            }
        }));
        EXAMPLES.push(mk('L_GLACIER', 'Glacier Shard', 'RAIL', { mode: 'ice', shape: 'staff', c1: '#7fd3ff', c2: '#ffffff', c3: '#1c4a6a', frames: 1 }, {
            desc: 'Example: ice-shard projectile with a frozen line trail and drifting bubbles.', rarity: 'rare', rest: {
                anim: { idle: { type: 'sway', amp: 1, speed: .8 }, equip: { type: 'spin', dur: 500, ease: 'out' }, fire: { type: 'pulse', amp: 1, dur: 260, ease: 'out' }, cool: { type: 'dim', dur: 500 }, hit: { type: 'ring', color: '#bfe9ff' }, kill: { type: 'stars', color: '#ffffff' }, aura: { on: false, color: '#7fd3ff', size: .6, pulse: .3, speed: 1 }, flash: { screen: true, color: '#bfe9ff', shake: 3 } },
                muzzle: { shape: 'ring', size: 1.4, color: '#bfe9ff', dur: 160 },
                fx: [{ at: 'trail', kind: 'bubble', rate: 14, count: 1, speed: .6, gravity: -.03, c1: '#bfe9ff', c2: '#7fd3ff', life: 700, size: 2.5, spread: 360 }, { at: 'impact', kind: 'star', count: 6, speed: 2.5, gravity: .02, c1: '#ffffff', c2: '#7fd3ff', life: 650, size: 3, spread: 360 }, { at: 'muzzle', kind: 'dust', count: 8, speed: 3, gravity: 0, c1: '#ffffff', c2: '#bfe9ff', life: 400, size: 2, spread: 40 }],
                proj: { on: true, shape: 'shard', c1: '#7fd3ff', c2: '#ffffff', size: 1.3, trail: 'line', tlen: 2, glow: .7 }, obt: { way: 'wave', wave: 15 }
            }
        }));
        EXAMPLES.push(mk('L_RAINBOW', 'Rainbow Pixel Mine', 'MINES', { mode: 'rainbow', shape: 'orb', c1: '#ff4dd2', c2: '#ffffff', c3: '#401040', frames: 6 }, {
            desc: 'Example: 6-frame rainbow cycle with a hue-spinning glow layer and pixel-star bursts.', rarity: 'mythic', rest: {
                anim: { idle: { type: 'pulse', amp: 1, speed: 1.2 }, equip: { type: 'pop', dur: 400, ease: 'bounce' }, fire: { type: 'spin', amp: 1, dur: 350, ease: 'inout' }, cool: { type: 'shrink', dur: 500 }, hit: { type: 'stars', color: '#ffd23a' }, kill: { type: 'ring', color: '#ff4dd2' }, aura: { on: true, color: '#b04bff', size: .9, pulse: .8, speed: 1 }, flash: { screen: false, color: '#ffffff', shake: 0 } },
                muzzle: { shape: 'cross', size: 1, color: '#ffffff', dur: 140 },
                fx: [{ at: 'aura', kind: 'star', rate: 6, count: 1, speed: .6, gravity: -.02, c1: '#ff4dd2', c2: '#4dd2ff', life: 900, size: 3, spread: 360 }, { at: 'kill', kind: 'star', count: 8, speed: 3, gravity: .02, c1: '#ffd23a', c2: '#4dd2ff', life: 800, size: 3.5, spread: 360 }, { at: 'muzzle', kind: 'dust', count: 8, speed: 2.5, gravity: .02, c1: '#ff4dd2', c2: '#4dd2ff', life: 500, size: 3, spread: 90 }],
                proj: { on: true, shape: 'pixel', c1: '#ff4dd2', c2: '#ffffff', size: 1.1, trail: 'rainbow', tlen: 1.6, glow: .5, spin: false }, obt: { way: 'shop', cash: 250000, scraps: 0 }
            }
        }));
        // rainbow's glow layer spins through hues
        const rb = EXAMPLES[3]; rb.art.layers[1].spin = 120;
        EXAMPLES.forEach(e => { const d = sanitize(e); if (d) { d.by = 'Example'; DEFAULTS[d.id] = d; } });
    });
    SKL.examples = () => Object.keys(DEFAULTS);

    // boot: defaults + cached copy right now (offline / slow Firestore still works), then live Firestore on top
    const cached = lsGet(LS_CACHE, null);
    if (cached && typeof cached === 'object') REMOTE.docs = cached;
    apply();
    safe('firestore', () => {
        if (typeof db === 'undefined') return;
        db.collection(COL).onSnapshot((snap) => {
            const docs = {}; snap.forEach(x => { docs[x.id] = x.data(); });
            REMOTE.docs = docs; REMOTE.ok = true; lsSet(LS_CACHE, docs);
            Object.keys(PEND).forEach(id => { const v = PEND[id]; const r = docs[id]; if (v === null ? !r || r.deleted : (r && r.t === v.t)) delete PEND[id]; }); lsSet(LS_PEND, PEND);
            apply();
        }, (err) => { SKL.lastErr = err && (err.code || err.message); console.warn('[skinlab] customskins2 listener:', SKL.lastErr); });
        flush();
        setInterval(() => { if (Object.keys(PEND).length) flush(); }, 60000);
    });

    // ---- obtainment by play: wave unlocks + rare drops (awarded once, saved to the account) ----
    let lastWave = 0;
    const award = (sid, why) => {
        const u = currentUserData; if (!u || !SKINS[sid] || (u.skins || []).includes(sid)) return;
        u.skins = [...(u.skins || []), sid];
        try { toast(`${SKINS[sid].name} skin unlocked${why ? ' (' + why + ')' : ''}! Equip it in Customize.`); } catch (e) { /* ignore */ }
        try { save({ skins: u.skins }); } catch (e) { /* ignore */ }
    };
    setInterval(() => safe('unlocks', () => {
        const u = currentUserData; if (!u || !u.username) return;
        const w = Math.max(u.highWave || 0, (typeof g !== 'undefined' && g.player && g.wave) || 0), run = typeof g !== 'undefined' && g.player ? (g.wave || 0) : 0;
        const rolled = run > lastWave && lastWave > 0;
        Object.keys(SKINS).forEach(sid => {
            const k = SKINS[sid]; if (!k.lab) return; const o = k.labDef.obt;
            if (o.way === 'wave' && w >= o.wave) award(sid, 'wave ' + o.wave);
            if (o.way === 'drop' && rolled && rnd() * 100 < o.chance) award(sid, 'rare drop');
        });
        lastWave = run;
    }), 1500);

    // ================================================================== LAB UI
    ADMIN_PERMS.skinlab = 'Skin Lab (build animated weapon skins)';
    const may = () => { try { return can('skinlab') || can('skins'); } catch (e) { return false; } };
    const CSS = `
#skl-modal{z-index:131}
#skl-modal .skl-box{width:min(1320px,100%);max-height:calc(100vh - 24px);overflow-y:auto;padding:16px;border-color:var(--violet)}
#skl-modal h2{font-size:26px;color:var(--violet)}
#skl-modal .skl-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
#skl-modal .skl-head .btn,#skl-modal .skl-row .btn{width:auto}
#skl-modal .skl-cols{display:grid;grid-template-columns:210px minmax(300px,1fr) 440px;gap:14px;align-items:start}
#skl-modal .skl-cols>*{min-width:0}
#skl-modal .skl-left,#skl-modal .skl-right{position:sticky;top:0}
#skl-modal .skl-sec{margin:12px 0 4px;padding-top:8px;border-top:2px solid var(--line);color:var(--mustard);font-family:'Special Elite',monospace;font-size:15px}
#skl-modal .skl-sec:first-child{margin-top:0;border-top:0;padding-top:0}
#skl-modal .skl-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
#skl-modal .skl-tabs button{font:inherit;font-weight:700;font-size:13px;color:var(--dim);background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);padding:6px 10px;cursor:pointer}
#skl-modal .skl-tabs button.on{color:var(--ink);border-color:var(--violet);background:#2d2720}
#skl-modal .skl-f{display:grid;grid-template-columns:132px 1fr 46px;gap:8px;align-items:center;margin:5px 0;font-size:13px}
#skl-modal .skl-f.wide{grid-template-columns:132px 1fr}
#skl-modal .skl-f .v{font-weight:700;color:var(--mustard);text-align:right;font-size:12px}
#skl-modal input,#skl-modal select,#skl-modal textarea{padding:6px 8px;font-size:13px;width:100%;background:#17130f;color:var(--ink);border:2px solid var(--line);border-radius:var(--r-sm);font-family:inherit}
#skl-modal input[type=range]{padding:0;border:0;background:none;accent-color:var(--mustard)}
#skl-modal input[type=color]{padding:0;height:30px;cursor:pointer}
#skl-modal input[type=checkbox]{width:auto}
#skl-modal .skl-ck{display:flex;gap:8px;align-items:center;font-size:13px;margin:5px 0;cursor:pointer}
#skl-modal .skl-pv{width:100%;aspect-ratio:2/1;background:#1b1713;border:2px solid var(--line);border-radius:var(--r-sm);display:block;image-rendering:pixelated}
#skl-modal .skl-mini{display:flex;gap:8px;margin-top:8px}
#skl-modal .skl-mini canvas{flex:1;min-width:0;height:84px;background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);image-rendering:pixelated}
#skl-modal .skl-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#skl-modal .skl-row .btn{flex:1 1 auto}
#skl-modal .skl-item{display:flex;align-items:center;gap:6px;padding:6px;margin:4px 0;background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);font-size:12px;flex-wrap:wrap}
#skl-modal .skl-item.on{border-color:var(--mustard)}
#skl-modal .skl-item canvas{width:44px;height:28px;background:#0f0c09;border-radius:3px;image-rendering:pixelated}
#skl-modal .skl-item .nm{flex:1;min-width:70px;font-weight:700}
#skl-modal .skl-item .btn{width:auto;padding:3px 7px;font-size:11px}
#skl-modal .skl-out{min-height:18px;font-size:12px;margin-top:6px}
#skl-modal .skl-json{margin-top:8px;display:none}
#skl-modal .skl-json textarea{height:160px;font-family:monospace;font-size:11px}
#skl-modal .skl-edwrap{overflow:auto;max-width:100%;border:2px solid var(--line);border-radius:var(--r-sm);background:#0f0c09;line-height:0;touch-action:none}
#skl-modal #skl-ed{image-rendering:pixelated;cursor:crosshair;touch-action:none;max-width:100%}
#skl-modal .skl-tools{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
#skl-modal .skl-tools button,#skl-modal .skl-sm{font:inherit;font-size:12px;font-weight:700;color:var(--ink);background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);padding:4px 8px;cursor:pointer;width:auto}
#skl-modal .skl-tools button.on{border-color:var(--mustard);background:#2d2720;color:var(--mustard)}
#skl-modal .skl-pal{display:grid;grid-template-columns:repeat(16,1fr);gap:3px;margin:4px 0}
#skl-modal .skl-pal button{aspect-ratio:1;border:2px solid #000;border-radius:3px;cursor:pointer;padding:0}
#skl-modal .skl-pal button.on{outline:2px solid var(--mustard);outline-offset:1px}
#skl-modal .skl-layer{display:grid;grid-template-columns:auto 1fr 84px;gap:4px 6px;align-items:center;padding:6px;margin:4px 0;background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);font-size:12px}
#skl-modal .skl-layer.on{border-color:var(--violet)}
#skl-modal .skl-layer .sub{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}
#skl-modal .skl-layer .sub label{display:flex;gap:6px;align-items:center}
#skl-modal .skl-frames{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}
#skl-modal .skl-frames canvas{width:46px;height:46px;background:#0f0c09;border:2px solid var(--line);border-radius:3px;cursor:pointer;image-rendering:pixelated}
#skl-modal .skl-frames canvas.on{border-color:var(--mustard)}
#skl-modal .skl-em{border:2px solid var(--line);border-radius:var(--r-sm);padding:6px 8px;margin:6px 0;background:#1a1612}
#skl-modal .skl-hint{font-size:11px;color:var(--dim);margin:2px 0 6px}
@media(max-width:900px){#skl-modal .skl-cols{grid-template-columns:minmax(0,1fr)}#skl-modal .skl-left,#skl-modal .skl-right{position:static}#skl-modal .skl-right{order:-1}#skl-modal .skl-f{grid-template-columns:110px 1fr 40px}#skl-modal .skl-box{padding:10px}#skl-modal .skl-pal{grid-template-columns:repeat(8,1fr)}}
`;
    const LAB = { cur: null, editing: null, built: false, tab: 'basics', li: 0, fi: 0, tool: 'pencil', col: 1, mx: false, my: false, onion: true, grid: true, open: false, undo: [], redo: [], dirty: false, raf: 0 };
    const out = (m, bad) => { const o = $q('skl-out'); if (o) { o.style.color = bad ? 'var(--blood)' : 'var(--olive)'; o.textContent = m; } };
    const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    const setP = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] || (a[ks[i]] = {}); a[ks[ks.length - 1]] = v; };
    const opts = (arr) => arr.map(x => [x, x]);
    const weaponOpts = () => Object.keys(WEAPON_DATA).filter(w => !WEAPON_DATA[w].cwPh).map(w => [w, (WEAPON_DATA[w].label || w) + (w.indexOf('CW_') === 0 ? ' (custom)' : '')]);

    // ---- field builder ----
    const fld = (d, p, type, label, o) => {
        o = o || {}; const v = getP(d, p), re = o.re ? ' data-re="1"' : '';
        if (o.show && !o.show(d)) return '';
        const tip = o.tip ? ` title="${E_(o.tip)}"` : '';
        if (type === 'rng') return `<label class="skl-f"${tip}><span>${label}</span><input type="range" data-p="${p}" data-t="n" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${v}"><b class="v">${(+v).toFixed((o.step || 1) < 1 ? 2 : 0)}</b></label>`;
        if (type === 'sel') return `<label class="skl-f wide"${tip}><span>${label}</span><select data-p="${p}" data-t="s"${re}>${o.o.map(x => `<option value="${x[0]}"${x[0] === v ? ' selected' : ''}>${E_(x[1])}</option>`).join('')}</select></label>`;
        if (type === 'clr') return `<label class="skl-f wide"${tip}><span>${label}</span><input type="color" data-p="${p}" data-t="s" value="${v}"></label>`;
        if (type === 'chk') return `<label class="skl-ck"${tip}><input type="checkbox" data-p="${p}" data-t="b"${re}${v ? ' checked' : ''}> ${label}</label>`;
        if (type === 'num') return `<label class="skl-f wide"${tip}><span>${label}</span><input type="number" data-p="${p}" data-t="n" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${v}"></label>`;
        return `<label class="skl-f wide"${tip}><span>${label}</span><input type="text" data-p="${p}" data-t="s" maxlength="${o.max || 40}" value="${E_(v)}" placeholder="${E_(o.ph || '')}"></label>`;
    };
    const sec = (t) => `<div class="skl-sec">${t}</div>`;

    // ---- tab renderers ----
    const tabBasics = (d) => sec('Identity') + fld(d, 'name', 'txt', 'Skin name', { max: 24 }) + fld(d, 'desc', 'txt', 'Description', { max: 120 }) +
        fld(d, 'rarity', 'sel', 'Rarity', { o: opts(RAR) }) + `<label class="skl-f wide"><span>Tags (comma)</span><input type="text" data-p="tags" data-t="tags" maxlength="80" value="${E_(d.tags.join(', '))}"></label>` +
        sec('Which weapon wears it') + fld(d, 'target.mode', 'sel', 'Applies to', { o: [['weapon', 'One weapon'], ['type', 'Every weapon of a type']], re: 1 }) +
        (d.target.mode === 'weapon' ? fld(d, 'target.weapon', 'sel', 'Weapon', { o: weaponOpts(), re: 1 }) : fld(d, 'target.type', 'sel', 'Weapon type', { o: [['ranged', 'Ranged weapons'], ['melee', 'Melee weapons'], ['custom', 'Custom (Weapon Lab) weapons'], ['all', 'All weapons']], re: 1 }) +
            `<p class="skl-hint">Matches now: ${E_(targetsOf(d).map(w => (WEAPON_DATA[w] || {}).label || w).join(', ') || 'nothing yet')}. Each gets its own shop entry (max 16).</p>`) +
        sec('Visibility') + fld(d, 'adminOnly', 'chk', 'Admin-exclusive (only admins can see, own or equip it)', { re: 1 }) +
        (d.adminOnly ? `<label class="skl-f wide"><span>Also allow (names)</span><input type="text" data-p="allow" data-t="tags" maxlength="200" value="${E_(d.allow.join(', '))}" placeholder="usernames, comma separated"></label>` : '');
    const tabAnim = (d) => {
        const A = 'anim.';
        return sec('Idle (while held)') + fld(d, A + 'idle.type', 'sel', 'Motion', { o: opts(IDLE) }) + fld(d, A + 'idle.amp', 'rng', 'Amount', { min: 0, max: 2, step: .05 }) + fld(d, A + 'idle.speed', 'rng', 'Speed (Hz)', { min: .2, max: 6, step: .1 }) +
            sec('Equip / ready') + fld(d, A + 'equip.type', 'sel', 'Style', { o: opts(EQUIP) }) + fld(d, A + 'equip.dur', 'rng', 'Duration (ms)', { min: 100, max: 1500, step: 10 }) + fld(d, A + 'equip.ease', 'sel', 'Easing', { o: opts(EASES) }) +
            sec('Fire (recoil)') + fld(d, A + 'fire.type', 'sel', 'Recoil style', { o: opts(FIRE) }) + fld(d, A + 'fire.amp', 'rng', 'Strength', { min: 0, max: 2, step: .05 }) + fld(d, A + 'fire.dur', 'rng', 'Duration (ms)', { min: 60, max: 1200, step: 10 }) + fld(d, A + 'fire.ease', 'sel', 'Easing', { o: opts(EASES) }) +
            sec('Reload / cooldown') + fld(d, A + 'cool.type', 'sel', 'Style', { o: opts(COOL) }) + fld(d, A + 'cool.dur', 'rng', 'Duration (ms)', { min: 100, max: 3000, step: 50 }) +
            sec('Hit & kill flourish') + fld(d, A + 'hit.type', 'sel', 'On hit', { o: opts(FLOUR) }) + fld(d, A + 'hit.color', 'clr', 'Hit colour') + fld(d, A + 'kill.type', 'sel', 'On kill', { o: opts(FLOUR) }) + fld(d, A + 'kill.color', 'clr', 'Kill colour') +
            sec('Melee swing arc & trail') + fld(d, A + 'melee.on', 'chk', 'Swing the weapon in an arc when it fires', { re: 1 }) +
            (d.anim.melee.on ? fld(d, A + 'melee.arc', 'rng', 'Arc (degrees)', { min: 30, max: 360, step: 5 }) + fld(d, A + 'melee.trail', 'sel', 'Trail', { o: opts(MELEE_TRAIL) }) + fld(d, A + 'melee.color', 'clr', 'Trail colour') + fld(d, A + 'melee.width', 'rng', 'Trail width', { min: 1, max: 14, step: .5 }) + fld(d, A + 'melee.life', 'rng', 'Swing time (ms)', { min: 80, max: 900, step: 10 }) : '') +
            sec('Muzzle flash') + fld(d, 'muzzle.shape', 'sel', 'Shape', { o: opts(MZ) }) + fld(d, 'muzzle.size', 'rng', 'Size', { min: .3, max: 3, step: .1 }) + fld(d, 'muzzle.color', 'clr', 'Colour') + fld(d, 'muzzle.dur', 'rng', 'Duration (ms)', { min: 40, max: 500, step: 10 }) +
            sec('Idle aura / glow') + fld(d, A + 'aura.on', 'chk', 'Glowing aura around the weapon') + fld(d, A + 'aura.color', 'clr', 'Aura colour') + fld(d, A + 'aura.size', 'rng', 'Size', { min: .1, max: 2, step: .05 }) + fld(d, A + 'aura.pulse', 'rng', 'Pulse depth', { min: 0, max: 1, step: .05 }) + fld(d, A + 'aura.speed', 'rng', 'Pulse speed (Hz)', { min: .2, max: 6, step: .1 }) +
            sec('Screen effects (when firing / killing)') + fld(d, A + 'flash.screen', 'chk', 'Flash the screen') + fld(d, A + 'flash.color', 'clr', 'Flash colour') + fld(d, A + 'flash.shake', 'rng', 'Screen shake', { min: 0, max: 8, step: .5 });
    };
    const EM_PRESETS = { Sparks: { kind: 'spark', c1: '#ffd23a', c2: '#ffffff', speed: 4, life: 350, size: 2, gravity: .05, spread: 60 }, Embers: { kind: 'ember', c1: '#ff9a1f', c2: '#ffe27a', speed: 2, life: 700, size: 3, gravity: -.04, spread: 90 }, Bubbles: { kind: 'bubble', c1: '#bfe9ff', c2: '#7fd3ff', speed: 1, life: 900, size: 3, gravity: -.03, spread: 360 }, Stars: { kind: 'star', c1: '#ffffff', c2: '#ffd23a', speed: 2.5, life: 800, size: 3.5, gravity: 0, spread: 360 }, 'Pixel dust': { kind: 'dust', c1: '#ffffff', c2: '#4dd2ff', speed: 2, life: 600, size: 3, gravity: .03, spread: 120 } };
    const tabFx = (d) => {
        let h = `<p class="skl-hint">Emitters spawn particles at the muzzle (when you fire), along the projectile's trail, on impact, around the weapon (aura) or on kills. Capped at 6 emitters and a global particle limit.</p><div class="skl-row" style="margin-top:0">` +
            Object.keys(EM_PRESETS).map(k => `<button class="btn btn-sm" onclick="SKL.ui.addEm('${k}')">+ ${k}</button>`).join('') + `</div>`;
        d.fx.forEach((e, i) => {
            const P = 'fx.' + i + '.';
            h += `<div class="skl-em"><div style="display:flex;justify-content:space-between;align-items:center"><b>Emitter ${i + 1}</b><button class="btn btn-sm" style="width:auto" onclick="SKL.ui.delEm(${i})">Remove</button></div>` +
                fld(d, P + 'at', 'sel', 'Attached to', { o: [['muzzle', 'Muzzle (on fire)'], ['trail', 'Projectile trail'], ['impact', 'Impact / hit'], ['aura', 'Around the weapon'], ['kill', 'Kill']], re: 1 }) + fld(d, P + 'kind', 'sel', 'Particle', { o: [['spark', 'Spark'], ['ember', 'Ember'], ['bubble', 'Bubble'], ['star', 'Star'], ['dust', 'Pixel dust']] }) +
                (e.at === 'trail' || e.at === 'aura' ? fld(d, P + 'rate', 'rng', 'Per second', { min: 1, max: 80, step: 1 }) : fld(d, P + 'count', 'rng', 'Count', { min: 1, max: 20, step: 1 })) +
                fld(d, P + 'speed', 'rng', 'Speed', { min: 0, max: 12, step: .1 }) + fld(d, P + 'gravity', 'rng', 'Gravity', { min: -.4, max: .5, step: .01 }) + fld(d, P + 'life', 'rng', 'Lifetime (ms)', { min: 80, max: 2500, step: 20 }) + fld(d, P + 'size', 'rng', 'Size', { min: 1, max: 8, step: .1 }) + fld(d, P + 'spread', 'rng', 'Spread (deg)', { min: 0, max: 360, step: 5 }) + fld(d, P + 'c1', 'clr', 'Colour 1') + fld(d, P + 'c2', 'clr', 'Colour 2') + `</div>`;
        });
        return h || '';
    };
    const tabProj = (d) => `<p class="skl-hint">Overrides how this weapon's shots look (colour, shape, trail, glow). Trail and impact particles come from the Particles tab.</p>` + fld(d, 'proj.on', 'chk', 'Use a custom projectile', { re: 1 }) +
        (d.proj.on ? fld(d, 'proj.shape', 'sel', 'Shape', { o: opts(PSHAPE) }) + fld(d, 'proj.c1', 'clr', 'Main colour') + fld(d, 'proj.c2', 'clr', 'Core colour') + fld(d, 'proj.size', 'rng', 'Size', { min: .5, max: 3, step: .1 }) + fld(d, 'proj.trail', 'sel', 'Trail', { o: opts(TRAIL) }) + fld(d, 'proj.tlen', 'rng', 'Trail length', { min: .5, max: 4, step: .1 }) + fld(d, 'proj.glow', 'rng', 'Glow', { min: 0, max: 1, step: .05 }) + fld(d, 'proj.spin', 'chk', 'Spin') : '');
    const tabObt = (d) => {
        const o = d.obt; let h = `<p class="skl-hint">How players get this skin. The shop, locker and equip flow are the existing ones.</p>` + fld(d, 'obt.way', 'sel', 'Obtained by', { o: [['shop', 'Shop (cash / scraps)'], ['weekly', 'Weekly prize calendar'], ['wave', 'Reach a wave'], ['drop', 'Random drop (per wave cleared)'], ['admin', 'Admin gift only']], re: 1 });
        if (o.way === 'shop') h += fld(d, 'obt.cash', 'num', 'Price (cash)', { min: 0, max: 100000000, step: 1000 }) + fld(d, 'obt.scraps', 'num', 'Price (scraps)', { min: 0, max: 1000000, step: 5 });
        if (o.way === 'weekly') { const cur = ORIG_CAL[o.slot]; h += fld(d, 'obt.slot', 'num', 'Calendar slot (0-51)', { min: 0, max: 51 }) + `<p class="skl-hint">Slot ${o.slot} is the solo-board prize in week ${o.slot} and the multiplayer-board prize in week ${(o.slot + 26) % 52} of the 52-week calendar. It replaces <b>${E_((SKINS[cur] || {}).name || cur)}</b> in that slot for everyone. Use "Skin obtainment" in the old tools to override a single week.</p>`; }
        if (o.way === 'wave') h += fld(d, 'obt.wave', 'num', 'Wave to reach', { min: 1, max: 500 });
        if (o.way === 'drop') h += fld(d, 'obt.chance', 'rng', 'Drop chance (%)', { min: .1, max: 100, step: .1 });
        h += fld(d, 'obt.how', 'txt', 'Custom "how to get" text', { max: 80, ph: '(optional) overrides the default hint' });
        if (d.adminOnly) h += `<p class="skl-hint">This skin is admin-exclusive, so only admins (and listed names) see it in the shop.</p>`;
        return h;
    };
    const tabArt = (d) => {
        const a = d.art;
        const tool = (id, t, tip) => `<button class="${LAB.tool === id ? 'on' : ''}" title="${tip}" onclick="SKL.ui.tool('${id}')">${t}</button>`;
        return sec('Pixel canvas') + `<div class="skl-tools">${tool('pencil', 'Pencil', 'Draw with the selected colour')}${tool('erase', 'Eraser', 'Erase')}${tool('fill', 'Fill', 'Flood fill')}${tool('line', 'Line', 'Drag a line')}${tool('rect', 'Rect', 'Outline rectangle')}${tool('rectf', 'Box', 'Filled rectangle')}${tool('pick', 'Pick', 'Eyedropper')}
            <button class="${LAB.mx ? 'on' : ''}" onclick="SKL.ui.tog('mx')" title="Mirror left/right">Mirror X</button><button class="${LAB.my ? 'on' : ''}" onclick="SKL.ui.tog('my')" title="Mirror top/bottom (weapons are usually symmetrical this way)">Mirror Y</button>
            <button class="${LAB.onion ? 'on' : ''}" onclick="SKL.ui.tog('onion')" title="Show the previous frame faintly">Onion</button><button class="${LAB.grid ? 'on' : ''}" onclick="SKL.ui.tog('grid')">Grid</button>
            <button onclick="SKL.ui.undo()">Undo</button><button onclick="SKL.ui.redo()">Redo</button></div>
            <div class="skl-edwrap"><canvas id="skl-ed"></canvas></div>
            <p class="skl-hint">The hand grip sits at the left; the muzzle at the right. Grid ${a.n}x${a.n}, drawing on layer "${E_(a.layers[LAB.li].name)}", frame ${LAB.fi + 1}/${a.frames}.</p>
            <div class="skl-tools"><button onclick="SKL.ui.nudge(-1,0)">Left</button><button onclick="SKL.ui.nudge(1,0)">Right</button><button onclick="SKL.ui.nudge(0,-1)">Up</button><button onclick="SKL.ui.nudge(0,1)">Down</button><button onclick="SKL.ui.flip('h')">Flip H</button><button onclick="SKL.ui.flip('v')">Flip V</button><button onclick="SKL.ui.clearLayer()">Clear layer</button>
            <select class="skl-sm" id="skl-gridsz" onchange="SKL.ui.resize(this.value)" style="width:auto">${[16, 24, 32, 40, 48].map(n => `<option value="${n}"${n === a.n ? ' selected' : ''}>Grid ${n}</option>`).join('')}</select></div>` +
            sec('Palette') + `<div class="skl-pal" id="skl-pal"></div><div id="skl-palctl"></div>` +
            sec('Layers') + `<div id="skl-layers"></div>` + sec('Animated frames (idle / held sprite)') + `<div class="skl-frames" id="skl-frames"></div><div id="skl-framectl"></div>` +
            sec('Generate a starting point') + fld(d, 'art.gen.mode', 'sel', 'Style', { o: opts(GEN_MODES) }) + fld(d, 'art.gen.shape', 'sel', 'Silhouette', { o: opts(GEN_SHAPES) }) + fld(d, 'art.gen.c1', 'clr', 'Colour 1') + fld(d, 'art.gen.c2', 'clr', 'Colour 2') + fld(d, 'art.gen.c3', 'clr', 'Dark colour') +
            `<label class="skl-f wide"><span>Frames (1-12)</span><input type="number" id="skl-genf" min="1" max="12" value="${Math.min(12, a.frames)}"></label><div class="skl-row"><button class="btn btn-sm btn-violet" onclick="SKL.ui.generate()">Generate (replaces art)</button><button class="btn btn-sm" onclick="SKL.ui.reseed()">New seed</button></div>` +
            sec('Import a PNG') + `<input type="file" id="skl-file" accept="image/*"><p class="skl-hint">Scaled to the grid and reduced to the palette (colours merged in, up to 32). Goes into the selected layer and frame.</p>`;
    };
    const ensureGen = (d) => { if (!d.art.gen) d.art.gen = { mode: 'gradient', shape: 'gun', c1: '#4dd2ff', c2: '#ffffff', c3: '#12304a', seed: 1 }; };

    // ---- art editing ----
    const rowsNow = () => LAB.cur.art.layers[LAB.li].f[LAB.fi];
    const snap = () => ({ li: LAB.li, fi: LAB.fi, rows: rowsNow().slice() });
    const pushUndo = () => { LAB.undo.push(snap()); if (LAB.undo.length > 60) LAB.undo.shift(); LAB.redo = []; };
    const restore = (s) => { const L = LAB.cur.art.layers[s.li]; if (L && L.f[s.fi]) L.f[s.fi] = s.rows.slice(); };
    const touchArt = () => { RT.touch(LAB.cur); LAB.dirty = true; edDraw(); };
    const structural = () => { LAB.undo = []; LAB.redo = []; LAB.li = Math.min(LAB.li, LAB.cur.art.layers.length - 1); LAB.fi = Math.min(LAB.fi, LAB.cur.art.frames - 1); touchArt(); renderArtPanels(); };
    const setPx = (rows, x, y, ch) => { const n = LAB.cur.art.n; if (x < 0 || y < 0 || x >= n || y >= n) return; const r = rows[y]; if (r[x] === ch) return; rows[y] = r.slice(0, x) + ch + r.slice(x + 1); };
    const plot = (rows, x, y, ch) => { const n = LAB.cur.art.n; setPx(rows, x, y, ch); if (LAB.mx) setPx(rows, n - 1 - x, y, ch); if (LAB.my) setPx(rows, x, n - 1 - y, ch); if (LAB.mx && LAB.my) setPx(rows, n - 1 - x, n - 1 - y, ch); };
    const line = (x0, y0, x1, y1, f) => { const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx - dy; for (let i = 0; i < 200; i++) { f(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x0 += sx; } if (e2 < dx) { e += dx; y0 += sy; } } };
    const flood = (rows, x, y, ch) => {
        const n = LAB.cur.art.n; const tgt = rows[y][x]; if (tgt === ch) return; const st = [[x, y]]; let guard = 0;
        while (st.length && guard++ < 6000) { const p = st.pop(); if (p[0] < 0 || p[1] < 0 || p[0] >= n || p[1] >= n || rows[p[1]][p[0]] !== tgt) continue; setPx(rows, p[0], p[1], ch); st.push([p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]); }
    };
    const curCh = () => (LAB.tool === 'erase' ? '.' : CH[LAB.col]);
    let drag = null;
    const cellAt = (e) => { const cv = $q('skl-ed'), r = cv.getBoundingClientRect(), n = LAB.cur.art.n, k = cv.width / r.width; return [Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) * k / LAB.cell))), Math.max(0, Math.min(n - 1, Math.floor((e.clientY - r.top) * k / LAB.cell)))]; };
    const edDown = (e) => safe('edDown', () => {
        e.preventDefault(); const cv = $q('skl-ed'); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        const [x, y] = cellAt(e), rows = rowsNow();
        if (LAB.tool === 'pick') { const ch = rows[y][x]; if (ch !== '.') { LAB.col = CH.indexOf(ch); LAB.tool = 'pencil'; renderPal(); const tb = document.querySelector('.skl-tools'); } return; }
        pushUndo();
        if (LAB.tool === 'fill') { flood(rows, x, y, CH[LAB.col]); touchArt(); return; }
        drag = { x0: x, y0: y, x, y, lx: x, ly: y };
        if (LAB.tool === 'pencil' || LAB.tool === 'erase') { plot(rows, x, y, curCh()); touchArt(); }
        else edDraw();
    });
    const edMove = (e) => safe('edMove', () => {
        const [x, y] = cellAt(e); LAB.hov = [x, y];
        if (!drag) { edDraw(); return; }
        drag.x = x; drag.y = y;
        if (LAB.tool === 'pencil' || LAB.tool === 'erase') { line(drag.lx, drag.ly, x, y, (a, b) => plot(rowsNow(), a, b, curCh())); drag.lx = x; drag.ly = y; touchArt(); }
        else edDraw();
    });
    const edUp = () => safe('edUp', () => {
        if (!drag) return; const rows = rowsNow(), ch = CH[LAB.col], d = drag; drag = null;
        if (LAB.tool === 'line') line(d.x0, d.y0, d.x, d.y, (a, b) => plot(rows, a, b, ch));
        else if (LAB.tool === 'rect' || LAB.tool === 'rectf') {
            const x0 = Math.min(d.x0, d.x), x1 = Math.max(d.x0, d.x), y0 = Math.min(d.y0, d.y), y1 = Math.max(d.y0, d.y);
            for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (LAB.tool === 'rectf' || xx === x0 || xx === x1 || yy === y0 || yy === y1) plot(rows, xx, yy, ch);
        }
        touchArt(); renderFrames();
    });
    const edDraw = () => {
        const cv = $q('skl-ed'); if (!cv || !LAB.cur) return; const d = LAB.cur, n = d.art.n; LAB.cell = Math.max(4, Math.floor(Math.min(460, (cv.parentNode.clientWidth || 460) - 4) / n)) || 8;
        const cell = LAB.cell, S = n * cell; if (cv.width !== S) { cv.width = cv.height = S; }
        const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { c.fillStyle = (x + y) % 2 ? '#2b2620' : '#231f1a'; c.fillRect(x * cell, y * cell, cell, cell); }
        if (LAB.onion && LAB.fi > 0) { c.globalAlpha = .3; c.drawImage(RT.frameCv(d, LAB.fi - 1, 0), 0, 0, S, S); c.globalAlpha = 1; }
        c.drawImage(RT.frameCv(d, LAB.fi, 0), 0, 0, S, S);
        // the selected layer's own pixels get a faint outline so you can tell them apart from other layers
        const rows = rowsNow();
        if (LAB.grid && cell >= 6) { c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; c.beginPath(); for (let i = 0; i <= n; i++) { c.moveTo(i * cell + .5, 0); c.lineTo(i * cell + .5, S); c.moveTo(0, i * cell + .5); c.lineTo(S, i * cell + .5); } c.stroke(); }
        const ox = RT.OXof(n); c.strokeStyle = 'rgba(255,210,58,.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ox * cell, 0); c.lineTo(ox * cell, S); c.stroke();   // hand column
        c.setLineDash([4, 4]); c.strokeStyle = 'rgba(77,210,255,.5)'; c.lineWidth = 1; c.beginPath(); if (LAB.my) { c.moveTo(0, S / 2); c.lineTo(S, S / 2); } if (LAB.mx) { c.moveTo(S / 2, 0); c.lineTo(S / 2, S); } c.stroke(); c.setLineDash([]);
        if (drag && ['line', 'rect', 'rectf'].indexOf(LAB.tool) >= 0) {
            c.fillStyle = d.art.pal[LAB.col] || '#fff'; c.globalAlpha = .65;
            const f = (a, b) => c.fillRect(a * cell, b * cell, cell, cell);
            if (LAB.tool === 'line') line(drag.x0, drag.y0, drag.x, drag.y, f);
            else { const x0 = Math.min(drag.x0, drag.x), x1 = Math.max(drag.x0, drag.x), y0 = Math.min(drag.y0, drag.y), y1 = Math.max(drag.y0, drag.y); for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (LAB.tool === 'rectf' || xx === x0 || xx === x1 || yy === y0 || yy === y1) f(xx, yy); }
            c.globalAlpha = 1;
        }
        if (LAB.hov) { c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(LAB.hov[0] * cell + .5, LAB.hov[1] * cell + .5, cell - 1, cell - 1); }
    };

    // palette
    const renderPal = () => {
        const box = $q('skl-pal'); if (!box) return; const a = LAB.cur.art;
        if (LAB.col >= a.pal.length) LAB.col = 0;
        box.innerHTML = a.pal.map((c, i) => `<button style="background:${c}" class="${i === LAB.col ? 'on' : ''}" title="${i}: ${c}" onclick="SKL.ui.col(${i})"></button>`).join('');
        const ctl = $q('skl-palctl'); if (!ctl) return;
        ctl.innerHTML = `<div class="skl-row" style="margin-top:4px;align-items:center"><input type="color" id="skl-colpick" value="${a.pal[LAB.col]}" style="width:44px;flex:none" title="edit the selected colour (recolours everything that uses it)"><button class="btn btn-sm" onclick="SKL.ui.addCol()">+ Add colour</button><button class="btn btn-sm" onclick="SKL.ui.delCol()">Remove</button></div>
            <div class="skl-row" style="align-items:center"><span class="small">Gradient helper:</span><input type="color" id="skl-rampto" value="#ffffff" style="width:44px;flex:none"><input type="number" id="skl-rampk" min="2" max="8" value="5" style="width:56px;flex:none"><button class="btn btn-sm" onclick="SKL.ui.ramp()">Ramp from selected</button></div>
            <div class="skl-row">${Object.keys(PRESETS).map(k => `<button class="btn btn-sm" onclick="SKL.ui.preset('${k}')">${k}</button>`).join('')}</div>`;
        const cp = $q('skl-colpick'); if (cp) { cp.oninput = () => { a.pal[LAB.col] = cp.value.toLowerCase(); RT.touch(LAB.cur); LAB.dirty = true; edDraw(); const b = $q('skl-pal').children[LAB.col]; if (b) b.style.background = cp.value; renderFrames(); }; }
    };
    const PRESETS = { Retro: ['#0f0f1b', '#565a75', '#c6b7be', '#fafbf6', '#d95763', '#df7126', '#fbf236', '#99e550', '#37946e', '#306082', '#5b6ee1', '#639bff'], Neon: ['#0a0014', '#ff2d95', '#b026ff', '#4dd2ff', '#00ffd5', '#faff00', '#ffffff', '#1a1a40'], Fire: ['#1a0500', '#4a0a00', '#8a1a00', '#d9461a', '#ff7a1a', '#ffb33a', '#ffe27a', '#ffffff'], Ice: ['#06121f', '#12304a', '#1c4a6a', '#3a86b0', '#7fd3ff', '#bfe9ff', '#e8f8ff', '#ffffff'], Pastel: ['#ffb3c7', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'] };
    // layers
    const renderLayers = () => {
        const box = $q('skl-layers'); if (!box) return; const a = LAB.cur.art;
        box.innerHTML = a.layers.map((L, i) => `<div class="skl-layer ${i === LAB.li ? 'on' : ''}" data-li="${i}"><button class="skl-sm" data-lk="vis" title="show / hide">${L.vis ? 'On' : 'Off'}</button><input type="text" data-lk="name" maxlength="14" value="${E_(L.name)}" onfocus="SKL.ui.selLayer(${i},1)"><select data-lk="blend">${Object.keys(BLENDS).map(b => `<option${b === L.blend ? ' selected' : ''}>${b}</option>`).join('')}</select>
            <div class="sub"><label>Opacity <input type="range" data-lk="op" min="0" max="1" step=".05" value="${L.op}"></label><label>Hue shift <input type="range" data-lk="hue" min="-180" max="180" step="5" value="${L.hue}"></label><label>Hue spin (deg/s) <input type="range" data-lk="spin" min="0" max="360" step="10" value="${L.spin}"></label><label><input type="checkbox" data-lk="glow"${L.glow ? ' checked' : ''}> Glow</label></div>
            <div class="skl-tools" style="grid-column:1/-1;margin:0"><button data-lk="sel">Select</button><button data-lk="up">Up</button><button data-lk="down">Down</button><button data-lk="dup">Duplicate</button><button data-lk="del">Delete</button></div></div>`).join('') +
            `<div class="skl-row"><button class="btn btn-sm" onclick="SKL.ui.addLayer()">+ Layer (max 5)</button></div>`;
    };
    const renderFrames = () => {
        const box = $q('skl-frames'); if (!box) return; const d = LAB.cur, a = d.art;
        if (box.children.length !== a.frames) box.innerHTML = a.layers && Array.from({ length: a.frames }, (_, i) => `<canvas width="46" height="46" data-fi="${i}" title="frame ${i + 1}"></canvas>`).join('');
        Array.from(box.children).forEach((cv, i) => { cv.className = i === LAB.fi ? 'on' : ''; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, 46, 46); c.drawImage(RT.frameCv(d, i, 0), 0, 0, 46, 46); });
        const ctl = $q('skl-framectl'); if (ctl && !ctl.dataset.f) ctl.dataset.f = '1';
        if (ctl) ctl.innerHTML = `<div class="skl-row" style="align-items:center"><button class="btn btn-sm" onclick="SKL.ui.addFrame()">+ Frame (copy current)</button><button class="btn btn-sm" onclick="SKL.ui.delFrame()">Delete frame</button><button class="btn btn-sm" onclick="SKL.ui.moveFrame(-1)">Move left</button><button class="btn btn-sm" onclick="SKL.ui.moveFrame(1)">Move right</button></div>
            <div class="skl-row" style="align-items:center"><span class="small">Frame ${LAB.fi + 1} time (ms)</span><input type="number" id="skl-fdur" min="30" max="2000" step="10" value="${a.durs[LAB.fi]}" style="width:84px;flex:none"><select id="skl-loop" style="width:auto"><option value="loop"${a.loop === 'loop' ? ' selected' : ''}>Loop</option><option value="pingpong"${a.loop === 'pingpong' ? ' selected' : ''}>Ping-pong</option><option value="once"${a.loop === 'once' ? ' selected' : ''}>Play once</option></select><button class="btn btn-sm" onclick="SKL.ui.allDur()">Same time for all</button></div>`;
        const fd = $q('skl-fdur'); if (fd) fd.onchange = () => { a.durs[LAB.fi] = int(fd.value, 30, 2000, 120); LAB.dirty = true; };
        const lp = $q('skl-loop'); if (lp) lp.onchange = () => { a.loop = lp.value; LAB.dirty = true; };
    };
    const renderArtPanels = () => { renderPal(); renderLayers(); renderFrames(); edDraw(); };

    // ---- UI actions (onclick targets) ----
    const mergeCol = (a, hex) => {
        const c = RT.hex2rgb(hex); let bi = -1, bd = 1e9;
        a.pal.forEach((h, i) => { const q = RT.hex2rgb(h), dd = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = i; } });
        if (bd <= 300 || a.pal.length >= MAXPAL) return bi; a.pal.push(hex); return a.pal.length - 1;
    };
    const UI = SKL.ui = {
        tool: (t) => { LAB.tool = t; renderTab(); },
        tog: (k) => { LAB[k] = !LAB[k]; renderTab(); },
        col: (i) => { LAB.col = i; if (LAB.tool === 'erase' || LAB.tool === 'pick') LAB.tool = 'pencil'; renderTab(); },
        undo: () => { const s = LAB.undo.pop(); if (!s) return; LAB.redo.push(snap2(s)); restore(s); touchArt(); renderFrames(); },
        redo: () => { const s = LAB.redo.pop(); if (!s) return; LAB.undo.push(snap2(s)); restore(s); touchArt(); renderFrames(); },
        addCol: () => { const a = LAB.cur.art; if (a.pal.length >= MAXPAL) return out('Palette is full (32).', true); a.pal.push($q('skl-colpick').value.toLowerCase()); LAB.col = a.pal.length - 1; touchArt(); renderPal(); },
        delCol: () => {
            const a = LAB.cur.art, k = LAB.col; if (a.pal.length <= 1) return; a.pal.splice(k, 1);
            a.layers.forEach(L => { L.f = L.f.map(rows => rows.map(r => r.replace(/[0-9a-v]/g, ch => { const i = CH.indexOf(ch); return i === k ? '.' : (i > k ? CH[i - 1] : ch); }))); });
            LAB.col = Math.min(LAB.col, a.pal.length - 1); structural();
        },
        ramp: () => {
            const a = LAB.cur.art, from = a.pal[LAB.col], to = $q('skl-rampto').value, k = int($q('skl-rampk').value, 2, 8, 5), cols = RT.ramp(from, to, k).slice(1);
            let first = -1; cols.forEach(c => { if (a.pal.length < MAXPAL) { a.pal.push(c); if (first < 0) first = a.pal.length - 1; } });
            if (first >= 0) LAB.col = first; touchArt(); renderPal(); out(`Added ${Math.min(cols.length, MAXPAL - a.pal.length + cols.length)} shades.`);
        },
        preset: (k) => { const a = LAB.cur.art, p = PRESETS[k]; p.forEach((c, i) => { a.pal[i] = c; }); a.pal = a.pal.slice(0, MAXPAL); touchArt(); renderPal(); renderFrames(); },
        selLayer: (i, keep) => { LAB.li = i; if (!keep) { renderLayers(); } else { Array.from(document.querySelectorAll('.skl-layer')).forEach((e, j) => e.classList.toggle('on', j === i)); } edDraw(); },
        addLayer: () => { const a = LAB.cur.art; if (a.layers.length >= 5) return out('Max 5 layers.', true); a.layers.push({ name: 'Layer ' + (a.layers.length + 1), vis: true, blend: 'normal', op: 1, hue: 0, spin: 0, glow: false, f: Array.from({ length: a.frames }, () => RT.emptyRows(a.n)) }); LAB.li = a.layers.length - 1; structural(); },
        addFrame: () => { const a = LAB.cur.art; if (a.frames >= 12) return out('Max 12 frames.', true); a.layers.forEach(L => L.f.splice(LAB.fi + 1, 0, L.f[LAB.fi].slice())); a.durs.splice(LAB.fi + 1, 0, a.durs[LAB.fi]); a.frames++; LAB.fi++; structural(); },
        delFrame: () => { const a = LAB.cur.art; if (a.frames <= 1) return; a.layers.forEach(L => L.f.splice(LAB.fi, 1)); a.durs.splice(LAB.fi, 1); a.frames--; LAB.fi = Math.min(LAB.fi, a.frames - 1); structural(); },
        moveFrame: (dir) => { const a = LAB.cur.art, j = LAB.fi + dir; if (j < 0 || j >= a.frames) return; a.layers.forEach(L => { const t = L.f[j]; L.f[j] = L.f[LAB.fi]; L.f[LAB.fi] = t; }); const t = a.durs[j]; a.durs[j] = a.durs[LAB.fi]; a.durs[LAB.fi] = t; LAB.fi = j; structural(); },
        allDur: () => { const a = LAB.cur.art, v = a.durs[LAB.fi]; a.durs = a.durs.map(() => v); LAB.dirty = true; out('All frames now ' + v + ' ms.'); },
        nudge: (dx, dy) => { pushUndo(); const n = LAB.cur.art.n, rows = rowsNow(), src = rows.slice(); for (let y = 0; y < n; y++) { let s = ''; for (let x = 0; x < n; x++) { const sx = x - dx, sy = y - dy; s += (sx < 0 || sy < 0 || sx >= n || sy >= n) ? '.' : src[sy][sx]; } rows[y] = s; } touchArt(); renderFrames(); },
        flip: (k) => { pushUndo(); const rows = rowsNow(); if (k === 'h') { for (let y = 0; y < rows.length; y++) rows[y] = rows[y].split('').reverse().join(''); } else rows.reverse(); touchArt(); renderFrames(); },
        clearLayer: () => { pushUndo(); const n = LAB.cur.art.n; LAB.cur.art.layers[LAB.li].f[LAB.fi] = RT.emptyRows(n); touchArt(); renderFrames(); },
        resize: (v) => {
            const a = LAB.cur.art, n = int(v, 16, 48, a.n); if (n === a.n) return; const o = a.n;
            a.layers.forEach(L => { L.f = L.f.map(rows => { const r = []; for (let y = 0; y < n; y++) { let s = ''; for (let x = 0; x < n; x++) s += rows[Math.floor(y * o / n)][Math.floor(x * o / n)]; r.push(s); } return r; }); });
            a.n = n; structural(); out('Grid is now ' + n + 'x' + n + ' (art rescaled).');
        },
        generate: () => {
            const d = LAB.cur; ensureGen(d); const G = d.art.gen, f = int($q('skl-genf').value, 1, 12, 1), r = gen({ ...G, n: d.art.n, frames: f });
            Object.assign(d.art, { pal: r.pal, layers: r.layers, frames: r.frames, durs: r.durs, loop: r.loop }); LAB.li = 0; LAB.fi = 0; structural(); out('Generated ' + G.mode + ' ' + G.shape + (f > 1 ? ' (' + f + ' frames)' : '') + '. Now paint over it.');
        },
        reseed: () => { const d = LAB.cur; ensureGen(d); d.art.gen.seed = int(rnd() * 99999, 0, 99999, 1); UI.generate(); },
        addEm: (k) => { if (LAB.cur.fx.length >= 6) return out('Max 6 emitters.', true); const at = LAB.tab === 'fx' ? 'muzzle' : 'muzzle'; LAB.cur.fx.push(RT.cleanEm({ at, ...EM_PRESETS[k] })); LAB.dirty = true; renderTab(); },
        delEm: (i) => { LAB.cur.fx.splice(i, 1); LAB.dirty = true; renderTab(); },
        tab: (t) => { LAB.tab = t; renderTab(); },
        test: (k) => pvTrigger(k)
    };
    const snap2 = (s) => ({ li: s.li, fi: s.fi, rows: LAB.cur.art.layers[s.li].f[s.fi].slice() });

    // delegated form handling
    const onForm = (e) => safe('onForm', () => {
        const el = e.target, d = LAB.cur;
        if (el.dataset && el.dataset.p) {
            const t = el.dataset.t; let v;
            if (t === 'n') v = parseFloat(el.value); else if (t === 'b') v = el.checked; else if (t === 'tags') v = el.value.split(',').map(x => x.trim()).filter(Boolean); else v = el.value;
            if (t === 'n' && !isFinite(v)) return;
            setP(d, el.dataset.p, v); LAB.dirty = true;
            if (el.dataset.p.indexOf('art.gen') === 0) ensureGen(d);
            const vv = el.parentNode && el.parentNode.querySelector('.v'); if (vv && t === 'n') vv.textContent = (+v).toFixed((parseFloat(el.step) || 1) < 1 ? 2 : 0);
            if (e.type === 'change' && el.dataset.re) { if (el.dataset.p === 'target.mode' && d.target.mode === 'weapon' && !WEAPON_DATA[d.target.weapon]) d.target.weapon = 'SLING'; renderTab(); }
            if (el.dataset.p.indexOf('fx.') === 0 && el.dataset.p.endsWith('.at') && e.type === 'change') renderTab();
        }
    });
    const onLayerEvt = (e) => safe('layerEvt', () => {
        const el = e.target.closest('[data-lk]'); if (!el) return; const row = el.closest('.skl-layer'); if (!row) return; const i = +row.dataset.li, a = LAB.cur.art, L = a.layers[i], k = el.dataset.lk;
        if (e.type === 'click' && el.tagName === 'BUTTON') {
            if (k === 'vis') { L.vis = !L.vis; } else if (k === 'sel') { LAB.li = i; } else if (k === 'up' && i < a.layers.length - 1) { a.layers.splice(i + 1, 0, a.layers.splice(i, 1)[0]); LAB.li = i + 1; }
            else if (k === 'down' && i > 0) { a.layers.splice(i - 1, 0, a.layers.splice(i, 1)[0]); LAB.li = i - 1; }
            else if (k === 'dup' && a.layers.length < 5) { const c = clone(L); c.name = (c.name + ' 2').slice(0, 14); a.layers.splice(i + 1, 0, c); LAB.li = i + 1; }
            else if (k === 'del' && a.layers.length > 1) { a.layers.splice(i, 1); LAB.li = Math.max(0, i - 1); }
            structural(); return;
        }
        if (e.type === 'input' || e.type === 'change') {
            if (el.tagName === 'BUTTON') return;
            if (k === 'name') L.name = text(el.value, 14, 'Layer'); else if (k === 'blend') L.blend = el.value; else if (k === 'glow') L.glow = el.checked; else if (k === 'op' || k === 'hue' || k === 'spin') L[k] = +el.value;
            touchArt(); renderFrames();
        }
    });

    // ---- tab dispatch ----
    const TABS = [['basics', 'Basics'], ['art', 'Art'], ['anim', 'Animations'], ['fx', 'Particles'], ['proj', 'Projectile'], ['obt', 'Obtainment']];
    const renderTab = () => {
        const box = $q('skl-form'); if (!box || !LAB.cur) return; const d = LAB.cur; ensureGen(d);
        const keep = $q('skl-modal').querySelector('.skl-box').scrollTop, kmid = box.scrollTop;
        $q('skl-tabs').innerHTML = TABS.map(t => `<button class="${t[0] === LAB.tab ? 'on' : ''}" onclick="SKL.ui.tab('${t[0]}')">${t[1]}</button>`).join('');
        box.innerHTML = ({ basics: tabBasics, art: tabArt, anim: tabAnim, fx: tabFx, proj: tabProj, obt: tabObt }[LAB.tab] || tabBasics)(d);
        if (LAB.tab === 'art') {
            renderArtPanels();
            const cv = $q('skl-ed'); cv.onpointerdown = edDown; cv.onpointermove = edMove; cv.onpointerup = edUp; cv.onpointercancel = edUp; cv.onpointerleave = () => { LAB.hov = null; if (!drag) edDraw(); };
            const f = $q('skl-file'); if (f) f.onchange = () => safe('import', () => {
                const file = f.files && f.files[0]; if (!file) return; const rd = new FileReader();
                rd.onload = () => { const img = new Image(); img.onload = () => safe('importImg', () => { UI.importImage(img); }); img.onerror = () => out('Could not read that image.', true); img.src = rd.result; }; rd.readAsDataURL(file);
            });
        }
        $q('skl-modal').querySelector('.skl-box').scrollTop = keep;
    };
    UI.importImage = (img) => {
        const a = LAB.cur.art, q = quantise(img, a.n, MAXPAL); pushUndo();
        const map = q.pal.map(h => mergeCol(a, h)); const rows = rowsNow();
        q.rows.forEach((r, y) => { let s = ''; for (const ch of r) s += ch === '.' ? '.' : CH[map[CH.indexOf(ch)]]; rows[y] = s; });
        touchArt(); renderPal(); renderFrames(); out('Imported into layer "' + a.layers[LAB.li].name + '" (' + q.pal.length + ' colours merged).');
    };

    // ---- def loading ----
    const blank = () => {
        const art = gen({ mode: 'gradient', shape: 'gun', n: 32, c1: '#4dd2ff', c2: '#ffffff', c3: '#12304a', frames: 1 });
        return sanitize({ id: 'L_NEW', name: 'New Skin', rarity: 'rare', target: { mode: 'weapon', weapon: 'SLING' }, art, adminOnly: false, obt: { way: 'shop', scraps: 30 }, proj: { on: false }, muzzle: { shape: 'star', size: 1, color: '#ffe27a', dur: 110 }, fx: [] });
    };
    const loadDef = (d, editingId) => {
        LAB.cur = clone(d); ensureGen(LAB.cur); LAB.cur = sanitize(LAB.cur) || blank(); LAB.editing = editingId || null; LAB.li = 0; LAB.fi = 0; LAB.col = Math.min(1, LAB.cur.art.pal.length - 1); LAB.undo = []; LAB.redo = []; LAB.dirty = false;
        if (!LAB.editing) LAB.cur.id = 'L_NEW';
        renderList(); renderTab(); pvReset(); out('');
    };
    const uniqueId = (name) => { let base = 'L_' + (slugOf(name) || 'SKIN'); if (base.length < 4) base += '_SK'; base = base.slice(0, 26); let id = base, i = 2; while (DEF[id] || PEND[id]) { id = base + '_' + i++; } return id; };

    // ---- left list ----
    const thumb = (cv, d) => { const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); c.save(); c.translate(6, cv.height / 2); drawSkin(c, d, performance.now() / 1000, 0.9, null); c.restore(); };
    const renderList = () => {
        const box = $q('skl-list'); if (!box) return;
        const ids = Object.keys(DEF).sort();
        box.innerHTML = (ids.length ? ids.map(id => { const d = DEF[id]; return `<div class="skl-item ${LAB.editing === id ? 'on' : ''}"><canvas width="88" height="56" data-th="${id}"></canvas><span class="nm" style="color:${RAR_COL[d.rarity]}">${E_(d.name)}<br><span class="small dim" style="font-weight:400">${E_(d.target.mode === 'type' ? d.target.type + ' weapons' : ((WEAPON_DATA[d.target.weapon] || {}).label || d.target.weapon))}${d.adminOnly ? ' · admin' : ''}${d.by === 'Example' ? ' · example' : ''}</span></span>
            <button class="btn btn-sm" onclick="SKL.ui.edit('${id}')">Edit</button><button class="btn btn-sm" onclick="SKL.ui.dup('${id}')">Dup</button><button class="btn btn-sm btn-danger" onclick="SKL.ui.del('${id}')">Del</button></div>`; }).join('') : '<p class="small dim">No lab skins yet.</p>');
        const raws = (typeof CONTENT !== 'undefined' && CONTENT.rawSkins) ? Object.keys(CONTENT.rawSkins) : [];
        box.innerHTML += `<div class="skl-sec">Old skins (read-only)</div>` + (raws.length ? raws.map(id => { const k = SKINS[id]; return k ? `<div class="skl-item"><span class="nm">${E_(k.name)}</span><button class="btn btn-sm" onclick="SKL.ui.convert('${id}')" title="Copy into the lab as a new editable skin">Convert</button><button class="btn btn-sm" onclick="SKL.ui.oldEdit('${id}')">Old editor</button></div>` : ''; }).join('') : '<p class="small dim">None.</p>');
        box.querySelectorAll('canvas[data-th]').forEach(cv => { const d = DEF[cv.dataset.th]; if (d) thumb(cv, d); });
    };
    UI.edit = (id) => { if (!DEF[id]) return; loadDef(DEF[id], id); };
    UI.dup = (id) => { const d = clone(DEF[id]); if (!d) return; d.name = text(d.name + ' copy', 24); d.id = uniqueId(d.name); d.by = ''; d.adminOnly = DEF[id].adminOnly; loadDef(d, null); LAB.cur.id = 'L_NEW'; out('Duplicated: save to publish the copy.'); };
    UI.del = async (id) => { if (!confirm('Delete "' + (DEF[id] || {}).name + '" for everyone? Players who own it fall back to the default look.')) return; const ok = await delDef(id); if (LAB.editing === id) loadDef(blank(), null); out(ok ? 'Deleted.' : 'Deleted here; Firestore refused it (queued).', !ok); };
    UI.oldEdit = (id) => { closeLab(); try { window.skEdit(id); } catch (e) { try { openSkinEd(); } catch (x) { /* ignore */ } } };
    UI.convert = (id) => safe('convert', () => {
        const raw = CONTENT.rawSkins[id], k = SKINS[id]; if (!raw || !k) return; let art;
        if (raw.gen) { const gsh = { barrel: 'gun', blade: 'blade', orb: 'orb', blob: 'orb' }[raw.gen.shape] || 'gun'; art = gen({ mode: 'gradient', shape: gsh, n: 32, c1: raw.gen.c1, c2: raw.gen.c2, c3: raw.gen.c3, frames: 1 }); }
        else { const pal = (raw.pal || []).slice(0, MAXPAL), rows = RT.emptyRows(32), top = Math.max(0, (32 - (raw.px || []).length) >> 1); (raw.px || []).forEach((r, y) => { if (top + y < 32) rows[top + y] = String(r).slice(0, 32).replace(/[^.0-9a-f]/gi, '.').toLowerCase().padEnd(32, '.'); }); art = { n: 32, pal, layers: [{ name: 'Body', f: [rows] }], frames: 1 }; }
        const d = sanitize({ id: 'L_NEW', name: (raw.name || k.name) + ' v2', target: { mode: 'weapon', weapon: raw.weapon }, art, obt: { way: (raw.cash || raw.scraps) ? 'shop' : 'admin', cash: raw.cash || 0, scraps: raw.scraps || 0 }, anim: { aura: { on: !!(raw.glow || (raw.gen && (raw.gen.fx || []).includes('glow'))), color: raw.glow || (raw.gen && raw.gen.c1) || '#4dd2ff' } } });
        loadDef(d, null); LAB.cur.id = 'L_NEW'; LAB.tab = 'art'; renderTab(); out('Converted the old skin to a lab skin: tweak it, add animation, then Save (the old one stays as it is).');
    });

    // ---- save / give / json ----
    const readCur = () => { const d = clone(LAB.cur); return d; };
    const saveCur = async () => safe('saveCur', async () => {
        if (!may()) return out('You need the Skin Lab (or Skins) permission.', true);
        const d = readCur(); if (!text(d.name, 24)) return out('Give it a name first.', true);
        if (!LAB.editing || d.id === 'L_NEW') d.id = uniqueId(d.name); else d.id = LAB.editing;
        if (d.target.mode === 'weapon' && !WEAPON_DATA[d.target.weapon]) return out('Pick a weapon that exists.', true);
        const ok = await saveDef(d); LAB.editing = d.id; LAB.cur.id = d.id; LAB.dirty = false; renderList();
        out(ok ? `Published "${d.name}". It is live for everyone${d.adminOnly ? ' (admins only)' : ''}.` : `Saved here, but Firestore refused it (${SKL.lastErr || 'offline'}). It is queued and works on this device. See RULES-NEEDED.md (Skin Lab).`, !ok);
    });
    const giveMe = async () => safe('giveMe', async () => {
        const d = LAB.editing && DEF[LAB.editing]; if (!d) return out('Save it first, then unlock it.', true);
        const sid = skinIdFor(d, targetsOf(d)[0]); if (!SKINS[sid]) return out('Not registered (check the weapon).', true);
        const f = ADMIN_ACTIONS.giveskin(currentUserData, sid); await save(f); try { applyLook(); refreshLobbyStats(); } catch (e) { /* ignore */ }
        out('Unlocked and equipped "' + SKINS[sid].name + '" for you. Start a run to see it.');
    });
    const importJson = async (publish) => safe('importJson', async () => {
        let v; try { v = JSON.parse($q('skl-json').value); } catch (e) { return out('That is not valid JSON.', true); }
        const arr = Array.isArray(v) ? v : [v], good = [];
        arr.forEach(r => { const d = sanitize(r) || sanitize({ ...r, id: uniqueId((r && r.name) || 'IMPORT') }); if (d) good.push(d); });
        if (!good.length) return out('No valid skins in there.', true);
        if (!publish) { loadDef(good[0], null); LAB.cur.id = 'L_NEW'; return out('Loaded the first skin into the editor (not saved).'); }
        for (const d of good) { if (DEF[d.id] && d.by === 'Example') d.id = uniqueId(d.name); await saveDef(d); } out('Imported ' + good.length + ' skin(s).'); renderList();
    });

    // ================================================================== PREVIEW (dummy target firing with the skin applied)
    const PV = { W: newWorld(), st: { fireT: 0, equipT: 0, born: 0, acc: [] }, bullets: [], next: 0, shot: 0, dummy: { hp: 1, flash: 0, dead: 0 }, last: 0, t0: 0 };
    function pvReset() { PV.W = newWorld(); PV.st = { fireT: 0, equipT: performance.now(), born: performance.now(), acc: [] }; PV.bullets = []; PV.next = performance.now() + 500; PV.shot = 0; PV.dummy = { hp: 1, flash: 0, dead: 0 }; }
    const PBASE = { x: 56, y: 68 };
    function pvTrigger(k) {
        const d = LAB.cur, now = performance.now();
        if (k === 'equip') { PV.st.equipT = now; PV.st.born = now; return; }
        if (k === 'kill') { PV.shot = 3; }
        pvFire(d, now);
    }
    function pvFire(d, now) {
        const tip = SKL.tipOf(d, 0.8) + 4, base = { x: PBASE.x + 17, y: PBASE.y + 4 };
        fireEvent(PV.W, d, PV.st, base, 0, tip, false);
        const melee = d.anim.melee.on;
        PV.shot++;
        if (melee) { PV.bullets.push({ melee: true, t: 0, kill: PV.shot % 4 === 0 }); }
        else PV.bullets.push({ x: base.x + tip, y: base.y, vx: 260, vy: 0, r: 5, id: 'X', kill: PV.shot % 4 === 0, a: {} });
    }
    const pvStep = (ts) => {
        const cv = $q('skl-pv'); if (!cv || !LAB.cur || !LAB.open) return;
        const d = LAB.cur, now = performance.now(), dt = Math.min(.05, (now - (PV.last || now)) / 1000); PV.last = now;
        const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height);
        c.fillStyle = '#1b1713'; c.fillRect(0, 0, cv.width, cv.height);
        c.save(); c.scale(cv.width / 260, cv.width / 260);
        if (PV.W.shk > .1) { c.translate((rnd() - .5) * PV.W.shk * 1.5, (rnd() - .5) * PV.W.shk * 1.5); PV.W.shk *= .88; }
        c.fillStyle = '#26211b'; for (let x = 0; x < 260; x += 20) c.fillRect(x, 96, 10, 1); c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(PBASE.x, PBASE.y + 24, 11, 3, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(212, PBASE.y + 24, 11, 3, 0, 0, TAU); c.fill();
        // player
        try { if (typeof SPR !== 'undefined' && SPR.player) { const im = SPR.player; c.drawImage(im, PBASE.x - im.width * 1.5, PBASE.y - im.height * 1.5 + 6, im.width * 3, im.height * 3); } else { c.fillStyle = '#7a6a55'; c.fillRect(PBASE.x - 6, PBASE.y - 12, 12, 24); } } catch (e) { /* no sprite */ }
        // dummy zombie
        const Z = PV.dummy; Z.flash = Math.max(0, Z.flash - dt);
        if (Z.dead > 0) { Z.dead -= dt; if (Z.dead <= 0) { Z.hp = 1; } }
        if (Z.dead <= 0) { c.save(); c.translate(212, PBASE.y + 6); c.fillStyle = Z.flash > 0 ? '#ffffff' : '#6f8f4a'; c.fillRect(-7, -16, 14, 24); c.fillStyle = Z.flash > 0 ? '#fff' : '#58733a'; c.fillRect(-7, -16, 14, 6); c.fillStyle = '#b8392d'; c.fillRect(-4, -13, 2, 2); c.fillRect(2, -13, 2, 2); c.fillStyle = '#000'; c.fillRect(-9, -22, 18, 3); c.fillStyle = '#d9461a'; c.fillRect(-9, -22, 18 * Z.hp, 3); c.restore(); }
        // timing
        if (now > PV.next) { pvFire(d, now); PV.next = now + 1000 + d.anim.fire.dur * .3; }
        if (now - PV.st.equipT > 7000) { PV.st.equipT = now; PV.st.born = now; }
        // aura emitters
        d.fx.forEach((em, i) => { if (em.at === 'aura') { PV.st.acc[i] = (PV.st.acc[i] || 0) + em.rate * dt; while (PV.st.acc[i] >= 1) { PV.st.acc[i]--; emitEm(PV.W, em, PBASE.x + 17 + rnd() * 24, PBASE.y + 4, 0, 1); } } });
        // weapon
        c.save(); c.translate(PBASE.x + 17, PBASE.y + 4); drawSkin(c, d, now / 1000, 0.8, PV.st); c.restore();
        // shots
        for (let i = PV.bullets.length - 1; i >= 0; i--) {
            const b = PV.bullets[i];
            if (b.melee) { b.t += dt; if (b.t > .12) { PV.bullets.splice(i, 1); Z.flash = .15; Z.hp = Math.max(0, Z.hp - .25); hitEvent(PV.W, d, 205, PBASE.y, false); if (b.kill) { Z.dead = .6; Z.hp = 0; hitEvent(PV.W, d, 212, PBASE.y, true); if (d.anim.flash.screen) { PV.W.flash = .24; PV.W.flashC = d.anim.flash.color; } } } continue; }
            b.x += b.vx * dt;
            d.fx.forEach((em, j) => { if (em.at === 'trail') { b['a' + j] = (b['a' + j] || 0) + em.rate * dt; while (b['a' + j] >= 1) { b['a' + j]--; emitEm(PV.W, em, b.x, b.y, Math.PI, 1); } } });
            if (d.proj.on) drawProj(c, d, b, 0, now / 1000, PV.W, dt, b.a); else { c.fillStyle = '#d9a441'; c.fillRect(b.x - 2.5, b.y - 2.5, 5, 5); }
            if (b.x >= 204) { PV.bullets.splice(i, 1); Z.flash = .15; Z.hp = Math.max(0, Z.hp - .25); hitEvent(PV.W, d, b.x, b.y, false); if (b.kill) { Z.dead = .6; Z.hp = 0; hitEvent(PV.W, d, 212, PBASE.y, true); if (d.anim.flash.screen) { PV.W.flash = .24; PV.W.flashC = d.anim.flash.color; } } }
        }
        drawParts(PV.W, c, dt);
        if (PV.W.flash > 0) { c.save(); c.globalAlpha = Math.min(.5, PV.W.flash); c.fillStyle = PV.W.flashC; c.fillRect(0, 0, 260, 130); c.restore(); PV.W.flash -= dt * 1.4; }
        c.restore();
        // shop card + held-in-hand previews
        const sc = $q('skl-shop'); if (sc) { const x = sc.getContext('2d'); x.clearRect(0, 0, sc.width, sc.height); x.save(); x.translate(sc.width / 2 - 8, sc.height / 2); drawSkin(x, d, now / 1000, 1.6, null); x.restore(); }
        const hv = $q('skl-held'); if (hv) { const x = hv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, hv.width, hv.height); try { if (SPR.player) { const im = SPR.player, s = 3.4, w = im.width * s, h = im.height * s, cx = hv.width / 2 - 14, gy = hv.height - 10; x.drawImage(im, cx - w / 2, gy - h, w, h); x.save(); x.translate(cx + w * .72, gy - s * 7); x.rotate(-Math.PI / 2 + .12); drawSkin(x, d, now / 1000, s / 5.5 * 1.3, null); x.restore(); } } catch (e) { /* ignore */ } }
        if (!(Math.floor(now / 2000) % 1) && LAB.tab !== 'art') { /* keep list thumbs alive */ }
    };
    const loop = (ts) => { LAB.raf = 0; if (!LAB.open) return; safe('pv', () => pvStep(ts)); LAB.raf = requestAnimationFrame(loop); };

    // ---- DOM ----
    const buildDom = () => {
        if (LAB.built) return; LAB.built = true;
        const st = document.createElement('style'); st.id = 'skl-css'; st.textContent = CSS; document.head.appendChild(st);
        const m = document.createElement('div'); m.id = 'skl-modal'; m.className = 'overlay hidden';
        m.innerHTML = `<div class="panel skl-box"><div class="skl-head"><h2>Skin Lab</h2><div class="skl-row" style="margin:0"><button class="btn btn-go btn-sm" id="skl-new">+ New skin</button><button class="btn btn-sm" id="skl-jsonbtn">JSON</button><button class="btn btn-sm" onclick="SKL.ui.old('ed')" title="the original 32x12 pixel editor">Pixel editor</button><button class="btn btn-sm" onclick="SKL.ui.old('qk')" title="quick animated generator skins">Quick generator</button><button class="btn btn-sm" onclick="SKL.ui.old('obt')" title="obtainment + weekly prize overrides">Obtainment</button><button class="btn btn-sm" id="skl-close">Close</button></div></div>
            <div class="skl-cols"><div class="skl-left"><div class="skl-sec">Lab skins</div><div id="skl-list"></div></div>
            <div class="skl-mid"><div class="skl-tabs" id="skl-tabs"></div><div id="skl-form"></div></div>
            <div class="skl-right"><canvas class="skl-pv" id="skl-pv" width="520" height="260"></canvas>
                <div class="skl-row" style="margin-top:6px"><button class="btn btn-sm" onclick="SKL.ui.test('fire')">Fire</button><button class="btn btn-sm" onclick="SKL.ui.test('kill')">Kill shot</button><button class="btn btn-sm" onclick="SKL.ui.test('equip')">Equip</button></div>
                <div class="skl-mini"><canvas id="skl-shop" width="130" height="66" title="shop card"></canvas><canvas id="skl-held" width="130" height="84" title="in hand"></canvas></div>
                <div class="skl-row"><button class="btn btn-primary" id="skl-save">Save &amp; publish</button><button class="btn" id="skl-give">Unlock &amp; equip for me</button><button class="btn btn-danger" id="skl-del">Delete</button></div>
                <p class="skl-out" id="skl-out"></p>
                <div class="skl-json" id="skl-jsonbox"><textarea id="skl-json" spellcheck="false" placeholder="paste a skin JSON (or an array) here"></textarea><div class="skl-row"><button class="btn btn-sm" id="skl-exp1">Export this skin</button><button class="btn btn-sm" id="skl-expall">Export all</button><button class="btn btn-sm" id="skl-imp">Import (edit)</button><button class="btn btn-sm btn-go" id="skl-impsave">Import &amp; publish</button></div></div>
            </div></div></div>`;
        document.body.appendChild(m);
        m.addEventListener('mousedown', (e) => { if (e.target === m) closeLab(); });
        window.addEventListener('keydown', (e) => { if (!LAB.open) return; if (e.code === 'Escape' && !document.activeElement?.matches?.('input[type=text],textarea')) closeLab(); if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && LAB.tab === 'art') { e.preventDefault(); e.shiftKey ? UI.redo() : UI.undo(); } }, true);
        $q('skl-close').onclick = closeLab; $q('skl-new').onclick = () => loadDef(blank(), null);
        $q('skl-save').onclick = saveCur; $q('skl-del').onclick = () => { if (LAB.editing) UI.del(LAB.editing); else out('Not saved yet.', true); };
        $q('skl-give').onclick = giveMe; $q('skl-jsonbtn').onclick = () => { const b = $q('skl-jsonbox'); b.style.display = b.style.display === 'block' ? 'none' : 'block'; };
        $q('skl-exp1').onclick = () => { $q('skl-json').value = JSON.stringify(toDB(strip(readCur()) || readCur())); };
        $q('skl-expall').onclick = () => { $q('skl-json').value = JSON.stringify(Object.keys(DEF).map(id => toDB(DEF[id]))); };
        $q('skl-imp').onclick = () => importJson(false); $q('skl-impsave').onclick = () => importJson(true);
        const form = $q('skl-form'); ['input', 'change'].forEach(ev => form.addEventListener(ev, (e) => { if (e.target.closest && e.target.closest('.skl-layer')) onLayerEvt(e); else onForm(e); }));
        form.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.skl-layer')) onLayerEvt(e); const fc = e.target.closest && e.target.closest('#skl-frames canvas'); if (fc) { LAB.fi = +fc.dataset.fi; renderFrames(); edDraw(); } });
        onChange.push(() => { if (LAB.open) renderList(); });
    };
    UI.old = (w) => { closeLab(); try { if (w === 'ed') openSkinEd(); else if (w === 'qk') openQuick(); else openObt(); } catch (e) { console.warn('[skinlab] old tool', e); } };
    const openLab = () => safe('openLab', () => {
        if (!may()) { try { toast('You need the Skin Lab permission.'); } catch (e) { /* ignore */ } return; }
        buildDom(); $q('skl-modal').classList.remove('hidden'); LAB.open = true;
        if (!LAB.cur) LAB.cur = blank();
        loadDef(LAB.cur, LAB.editing && DEF[LAB.editing] ? LAB.editing : null);
        PV.last = 0; if (!LAB.raf) LAB.raf = requestAnimationFrame(loop);
    });
    const closeLab = () => { LAB.open = false; const m = $q('skl-modal'); if (m) m.classList.add('hidden'); };
    SKL.openLab = openLab; SKL.closeLab = closeLab; window.openSkinLab = openLab; SKL.LAB = LAB;

    // admin panel entry: a clear "Skins" tab on the admin tab strip (+ a Skin Lab button next to the old skin buttons)
    safe('admin-tab', () => {
        const inject = () => safe('inject', () => {
            if (!may()) return;
            const bar = $q('adm-tabs');
            if (bar && !bar.querySelector('.skl-tab')) {
                const b = document.createElement('button'); b.className = 'skl-tab'; b.type = 'button'; b.onclick = openLab;
                b.innerHTML = `<span class="em"></span><span>Skins</span>`; bar.appendChild(b);
                try { b.querySelector('.em').innerHTML = iconImg('palette', 'icn sm'); } catch (e) { b.querySelector('.em').textContent = ''; }
            } else if (!bar) {
                const head = document.querySelector('#admin-modal .adm-panel > div'); if (head && !head.querySelector('.skl-tab')) { const b = document.createElement('button'); b.className = 'btn btn-violet btn-sm skl-tab'; b.style.width = 'auto'; b.textContent = 'Skin Lab'; b.onclick = openLab; head.insertBefore(b, head.lastElementChild); }
            }
            const old = document.querySelector('#admin-modal [onclick="openSkinEd()"]');
            if (old && old.parentNode && !old.parentNode.querySelector('.skl-btn')) { const b = document.createElement('button'); b.className = 'btn btn-go skl-btn'; b.textContent = 'Skin Lab (new)'; b.onclick = openLab; old.parentNode.insertBefore(b, old.parentNode.firstChild); }
        });
        const o = window.openAdmin;
        if (typeof o === 'function') window.openAdmin = function () { const r = o.apply(this, arguments); inject(); setTimeout(inject, 60); setTimeout(inject, 500); return r; };
    });

    SKL.reset = () => { PEND = {}; lsSet(LS_PEND, PEND); try { localStorage.removeItem(LS_CACHE); } catch (e) { /* ignore */ } REMOTE.docs = {}; apply(); };

    } catch (e) { console.error('[skinlab] failed to initialise', e); }
})();
