/* mp-content.js: CONTENT workstream. 12 new enemy types, 3 new bosses + harder old ones, 30 new perks with rarity, trader items and relics.
   Loaded as a classic script AFTER the main one, so it shares its global lexical scope (g, UPGRADES, BOSSES, TRADER, hurt, spawnZombie ...).
   Everything is wrapped in try/catch + guard(): a bug in here can never break the base game.
   Hooks in Mineplacer2.html are all marked `// [content]`: MPC.cfg / pick / move / onHurt / onKill / onHit / tick / drawUnder / draw / preZ / postZ / snap / applySnap / offer / boss.
   Host-only logic. Guests only draw: everything they need rides in z.state / z.ax / z.ay / z.cx (a bitfield) and the g.cxw world list (CONTENT.snap). */
(function () {
    'use strict';
    try {
        const warned = {};
        const guard = (name, fn, fallback) => function () {
            try { return fn.apply(this, arguments); }
            catch (e) { if (!warned[name]) { warned[name] = 1; console.warn('[content] ' + name + ' failed:', e); } return typeof fallback === 'function' ? fallback.apply(this, arguments) : fallback; }
        };
        const rnd = Math.random, TAU = Math.PI * 2, r1 = Math.round;
        const C = window.MPC = { types: {}, ver: 1, inBlast: false };
        const T = C.types;
        const live = (z) => z && !z.dead && !(z.emerge > 0);
        const wv = () => g.wave;
        const dfd = () => (DF().dmg || 1);
        const np = () => (g.peers ? g.peers.length : 0);
        const nearestLive = (x, y) => { let b = null, bd = 1e9; for (const t of liveTargets()) { const d = (t.x - x) ** 2 + (t.y - y) ** 2; if (d < bd) { bd = d; b = t; } } return b || g.player; };
        const angDiff = (a, b) => { const d = a - b; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); };

        // ============================================================== per-run state (host)
        const st = () => g.cxs || (g.cxs = { q: [], wv: -1, n: 0, rel: {}, relOffer: {}, relPicked: {}, brT: 0, brOn: 0, lh: 0, crT: 0, rk: 0, blT: 0, stT: 200, chT: 0, tk: 0, depth: 0, inFx: 0, trapSet: new Set(), seen: {} });
        const W = () => g.cxw || (g.cxw = { zones: [], proj: [], corpses: [], fx: [] });
        // ============================================================== TUNING TABLES (one place, per difficulty tier)
        // BOSS TIERS: tel = telegraph-time multiplier (floor: circles 36t, lines 42t), bd = boss-attack damage, sp = boss speed, adds = add/egg/totem count,
        //             mt = mutation level (extra lanes/rings/fans; 3 also unlocks every pattern one phase early), ph = [phase-3 hp fraction, phase-2 hp fraction].
        //             (boss HP, attack frequency and contact damage already scale through DIFFS.bossHp / bossAtk / dmg in the main file.)
        const BTAB = {
            easy:   { tel: 1.25, bd: 0.75, sp: 0.92, adds: 0.6, mt: -1, ph: [0.30, 0.62] },
            normal: { tel: 1,    bd: 1,    sp: 1,    adds: 1,   mt: 0,  ph: [0.38, 0.72] },
            hard:   { tel: 0.9,  bd: 1.15, sp: 1.05, adds: 1.2, mt: 1,  ph: [0.40, 0.75] },
            night:  { tel: 0.8,  bd: 1.3,  sp: 1.1,  adds: 1.5, mt: 2,  ph: [0.43, 0.78] },
            nodge:  { tel: 0.7,  bd: 1.5,  sp: 1.18, adds: 1.8, mt: 3,  ph: [0.46, 0.82] }
        };
        const BT = () => BTAB[g.dif] || BTAB.normal;
        C.BTAB = BTAB;
        let inBoss = false;
        const TD = (d) => { if (!inBoss) return d; const t = BT().tel; return t >= 1 ? Math.round(d * t) : (d <= 36 ? d : Math.max(36, Math.round(d * t))); };
        const BD = (d) => inBoss ? d * BT().bd : d;
        const MT = () => BT().mt;
        C.want = (frac) => { const b = BT(); return frac < b.ph[0] ? 3 : (frac < b.ph[1] ? 2 : 1); };
        const later = (d, f) => { const ib = inBoss; st().q.push({ t: g.tick + TD(d), f: ib ? () => { const o = inBoss; inBoss = true; try { f(); } finally { inBoss = o; } } : f }); };
        const ZK = ['frost', 'fire', 'tox'], PK = ['ice', 'gren'], FXK = ['ring', 'line'];
        const FXC = ['#b48ad8', '#9fd0ee', '#ff7a1a', '#6aff8a', '#ff5a4a'];
        const zone = (k, x, y, r, t, dps, arm) => { const w = W(); if (w.zones.length >= 60) w.zones.shift(); w.zones.push({ k, x: clamp(x, 10, 790), y: clamp(y, 10, 590), r, t, max: t, dps, arm: g.tick + (arm || 0) }); };
        const fx = (k, x, y, r, t, col, a) => { const w = W(); if (w.fx.length >= 40) w.fx.shift(); t = TD(t); w.fx.push({ k, x, y, r, t, max: t, c: col || 0, a: a || 0 }); };
        const tele = (x, y, r, delay, dmg) => { delay = TD(delay); dmg = BD(dmg); if (g.hz.length < 90) g.hz.push({ k: 'c', x: clamp(x, 20, 780), y: clamp(y, 20, 580), r, arm: g.tick + delay, dmg, born: g.tick }); };
        const beam = (x, y, a, warn, dmg, w, len, own, sp, life) => {   // existing 'b' hazard: dashed warning line, then it bites. Hits land when age % 6 == 0 so the warning is rounded to a multiple of 6
            if (inBoss) { warn = Math.max(Math.min(warn, 42), TD(warn)); dmg = BD(dmg); } warn = Math.ceil(warn / 6) * 6; const h = { k: 'b', x, y, a, sp: sp || 0, born: g.tick, warn, life: life || warn + 1, len: len || 900, w: w || 8, dmg };
            if (own) h.own = own; if (g.hz.length < 90) g.hz.push(h); return h;
        };
        const flashFor = (z, n) => { z.cxw = g.tick + TD(n); };
        const ringB = (x, y, o) => spawnRing(x, y, Object.assign({}, o, { dmg: (o.dmg || 20) * BT().bd }));
        const aoe = (x, y, r, d, src) => { C.inBlast = true; const o = g.src; if (src) g.src = src; try { explode(x, y, r, d); } finally { C.inBlast = false; g.src = o; } };
        const liveCount = (id) => { let n = 0; for (const z of g.zombies) if (z.cai === id && !z.dead) n++; return n; };
        const kids = (z, spr) => { let n = 0; for (const o of g.zombies) if (!o.dead && o.pid === z.id && (!spr || o.spr === spr)) n++; return n; };
        const aimPoint = (z, p, spd) => { const d = Math.hypot(p.x - z.x, p.y - z.y), tt = d / spd; return { x: clamp(p.x + (p.vx || 0) * tt * 0.8, 20, 780), y: clamp(p.y + (p.vy || 0) * tt * 0.8, 20, 580) }; };
        const kite = (z, c, near, far, str, back) => {
            const ex = (c.p.x - z.x) / c.dist, ey = (c.p.y - z.y) / c.dist, dir = c.dist > far ? 1 : (c.dist < near ? -(back || 1) : 0);
            z.x += ex * c.sp * dir; z.y += ey * c.sp * dir;
            if (str) { const sg = Math.sin(g.tick * 0.02 + z.seed) > 0 ? 1 : -1; z.x += -ey * c.sp * str * sg; z.y += ex * c.sp * str * sg; }
        };
        const shoot = (kind, x, y, tx, ty, spd, dmg, life) => {
            const w = W(); if (w.proj.length >= 40) return; const d = Math.hypot(tx - x, ty - y) || 1;
            w.proj.push({ k: kind, x, y, vx: (tx - x) / d * spd, vy: (ty - y) / d * spd, life: life || 150, dmg });
        };
        const ignite = (z, t) => { if (z.dead || z.boss && rnd() < 0.5) return; if (!(z.cb > 0)) { z.cbAge = 0; } z.cb = Math.max(z.cb || 0, t || 180); };

        // ============================================================== sprites
        const reg = (name, rows, pal) => {
            rows = rows.map((r) => r.padEnd(10, '.').slice(0, 10)); while (rows.length < 12) rows.push('..........');
            SPR[name] = makeSprite(rows, pal); SPR_FLASH[name] = makeSprite(rows, pal, true);
        };
        reg('bloater', ['...hhhh...', '..hhhhhh..', '..hehheh..', '..hhmmhh..', '.cccccccc.', 'cccyccyccc', 'accccccccc', 'acyccccyca', 'cccccycccc', '..ll..ll..', '..ll..ll..', '.lll..lll.'], { h: '#8fae5a', e: '#ffe27a', m: '#2a4a1a', c: '#6f8a3a', y: '#d6ee6a', a: '#7f9a4a', l: '#3a4a2a' });
        reg('riot', ['..ssssss..', '.ssssssss.', '.sseyyess.', '.ssshhsss.', '..cccccc..', 'sccccccccs', 'acccccccca', 'a.cccccc.a', '..cccccc.a', '..ll..ll..', '..ll..ll..', '.lll..lll.'], { s: '#7d8a96', e: '#14110e', y: '#ffd23a', h: '#d9b48a', c: '#4a5560', a: '#6a7480', l: '#2e3640' });
        reg('sapper', ['..bbbbbb..', '.bbbbbbbb.', '..hgyygh..', '..hhmmhh..', '..cccccc..', 'aacxxxcc..', 'a.cxrxcc.a', '..cxxxcc.a', '..cccccc.a', '..ll..ll..', '..ll..ll..', '.lll..lll.'], { b: '#d9a441', g: '#2a2a33', y: '#ffe27a', h: '#c9a07a', m: '#4a1f1f', c: '#7a6a3a', a: '#c9a07a', x: '#4a4030', r: '#ff4d4d', l: '#3a3020' });
        reg('mother', ['...hhhh...', '..hhhhhh..', '..hehheh..', '..hhmmhh..', '.cccccccc.', 'cccooccocc', 'acooooccoa', 'acccooccca', '.cccccccc.', '..ll..ll..', '.ll....ll.', 'lll....lll'], { h: '#b48a6a', e: '#ff5a4a', m: '#3a1f1f', c: '#7a4a5a', o: '#e8d8a8', a: '#8a5a6a', l: '#4a2a36' });
        reg('frostling', ['..w.ww.w..', '..wbbbbw..', '..bebbeb..', '..bbbbbb..', '...bmmb...', '..cccccc..', 'waccccccaw', 'w.cccccc.w', '..cccccc..', '..ll..ll..', '..ll..ll..', '.lll..lll.'], { w: '#e8f8ff', b: '#9fd0ee', e: '#14202a', m: '#2a4a6a', c: '#4a7ab0', a: '#7fb0d8', l: '#2a4a6a' });
        reg('sniper', ['...dddd...', '..dddddd..', '..dhyyhd..', '..ddhhdd..', '..cccccc..', 'ssssssssss', 'a.cccccc.a', '..cccccc.a', '..cccccc..', '..ll..ll..', '..ll..ll..', '.lll..lll.'], { d: '#6a6a4a', h: '#2a2a22', y: '#ff4d4d', c: '#8a8a62', a: '#6a6a4a', s: '#2a2a2a', l: '#4a4a34' });
        reg('thrower', ['.r..yy..r.', '.rr.yy.rr.', '..rhhhhr..', '..hehheh..', '..hhmmhh..', '..cccccc..', 'kaccccccak', '..cccccc..', '..cccccc..', '..ll..ll..', '..ll..ll..', '.lll..lll.'], { r: '#c04a8a', y: '#ffd23a', h: '#e0b48a', e: '#14110e', m: '#6a2a2a', c: '#3a8a6a', a: '#e0b48a', k: '#222222', l: '#2a4a3a' });
        reg('necro', ['...pppp...', '..pppppp..', '..peggep..', 'g.pppppp..', 'n.rrrrrr..', 'nhrrrrrrh.', 'n.rrrrrr..', 'n.rrrrrr..', 'n.rrrrrr..', 'n.rr..rr..', '..rr..rr..', '.rrr..rrr.'], { p: '#4a2a6a', e: '#14110e', g: '#6aff8a', r: '#2a1a3a', n: '#6a4a2a', h: '#b9d09a' });
        reg('screamer', ['w.wwwwww.w', '.wwhhhhww.', '..hehheh..', '..hmmmmh..', '..hmmmmh..', '..cccccc..', 'acccccccca', 'a.cccccc.a', '..cccccc..', '..cc..cc..', '..ll..ll..', '.lll..lll.'], { w: '#e8e8f0', h: '#d8c0d8', e: '#14110e', m: '#5a0a2a', c: '#8a3a5a', a: '#d8c0d8', l: '#4a2a3a' });
        reg('pyro', ['..o.yy.o..', '.ooyyyyoo.', '..hhhhhh..', '..hehheh..', '...hmmh...', '..cccccc..', 'aaccrrccaa', 'a.ccrrcc.a', '..cccccc..', '..ll..ll..', '..ll..ll..', '.lll..lll.'], { o: '#ff7a1a', y: '#ffe04a', h: '#6a2a1a', e: '#ffe04a', m: '#14110e', c: '#3a2a24', a: '#8a3a1a', r: '#ff5a1a', l: '#2a1a14' });
        reg('brute', ['hh......hh', 'hhhhhhhhhh', '.shheehhs.', '.sshhhhss.', '..hmmmmh..', 'ssccccccss', 'saccccccas', 'saccrrccas', '..cccccc..', '..ll..ll..', '.lll..lll.', 'lll....lll'], { h: '#8a5a3a', e: '#ff5a4a', m: '#2a1a1a', s: '#8a8f98', c: '#5a3a2a', a: '#7a4a32', r: '#b8392d', l: '#3a2a20' });
        reg('magnet', ['wr......bw', 'rr......bb', 'rr.eyye.bb', 'rrr....bbb', '.rrrmmbbb.', '..cccccc..', 'acccccccca', 'a.cccccc.a', '..cccccc..', '..ll..ll..', '..ll..ll..', '.lll..lll.'], { r: '#c0392b', b: '#3a5a8a', w: '#e8e8e8', e: '#14110e', y: '#ffe04a', m: '#222222', c: '#5a5a66', a: '#8a8a96', l: '#2e2e38' });
        reg('crawler', ['..........', '..........', '..........', '..hhhhhh..', '.hhehhehh.', 'hhhhhhhhhh', 'l.hhhhhh.l', 'l..l..l..l', 'l..l..l..l', '..........', '..........', '..........'], { h: '#a89a6a', e: '#ff4d4d', l: '#5a4a2a' });
        reg('egg', ['..........', '..........', '...eeee...', '..eeeeee..', '.eeeseeee.', '.eeeeeeee.', '.eesseeee.', '.eeeeeeee.', '..eeeeee..', '...eeee...', '..........', '..........'], { e: '#d8d0a0', s: '#8a8a50' });
        reg('totem', ['....ww....', '...wbbw...', '..wbbbbw..', '..bbwwbb..', '...bbbb...', '..bbbbbb..', '..bwbbwb..', '..bbbbbb..', '..bbbbbb..', '.bbbbbbbb.', '.bbbbbbbb.', 'ssssssssss'], { w: '#e8f8ff', b: '#6fb8e8', s: '#5a6a7a' });
        reg('bossD', ['w.w.ww.w.w', '.wwwwwwww.', '..hhhhhh..', '..hehheh..', '..hhmmhh..', 'wwccccccww', 'waccccccaw', 'a.cwwwwc.a', '..cccccc..', '..cc..cc..', '..ll..ll..', '.lll..lll.'], { w: '#e8f8ff', h: '#bfe0f0', e: '#2a6aff', m: '#2a4a6a', c: '#4a86c8', a: '#7fb8e8', l: '#2a4a7a' });
        reg('bossE', ['..pppppp..', '.pppppppp.', '.pwwwwwwp.', '.pwkwwkwp.', '.pwwkkwwp.', '..pwwwwp..', 'gpprrrrppg', 'g.rrwwrr.g', '..rrwwrr..', '..rrrrrr..', '.rrrrrrrr.', 'rrr.rr.rrr'], { p: '#3a2a5a', w: '#e8e4d0', k: '#6aff9a', r: '#241a36', g: '#6aff9a' });
        reg('bossF', ['..rrrrrr..', '.rrrrrrrr.', '.rryrryrr.', '.rrrrrrrr.', '..rrmmrr..', 'rrrrrrrrrr', 'arrorrorra', 'arrrooorra', '..rorrror.', '..rr..rr..', '..rr..rr..', '.rrr..rrr.'], { r: '#4a3a36', y: '#ffb02a', m: '#ff5a1a', o: '#ff7a1a', a: '#6a4a3a' });

        // ============================================================== icons (10x10, built from tiny primitives)
        const GR = () => Array.from({ length: 10 }, () => Array(10).fill('.'));
        const px = (G, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < 10 && y >= 0 && y < 10) G[y][x] = c; };
        const disc = (G, cx, cy, r, c) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.hypot(x - cx, y - cy) <= r) G[y][x] = c; };
        const ringI = (G, cx, cy, r, c) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r && d > r - 1.1) G[y][x] = c; } };
        const ln = (G, x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) px(G, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
        const rc = (G, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(G, x + i, y + j, c); };
        const outl = (G, ch) => { const O = G.map((r) => r.slice()); for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (G[y][x] === '.') { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = (G[y + dy] || [])[x + dx]; if (q && q !== '.' && q !== ch) { O[y][x] = ch; break; } } } return O; };
        const ICONS = {
            wildfire() { const G = GR(); ln(G, 5, 8, 5, 3, 'o'); disc(G, 4.5, 6, 2.6, 'o'); disc(G, 4.5, 6.5, 1.6, 'y'); px(G, 5, 1, 'r'); px(G, 4, 2, 'o'); px(G, 7, 4, 'r'); px(G, 2, 4, 'o'); return G; },
            shatter() { const G = GR(); ln(G, 5, 0, 5, 9, 'b'); ln(G, 0, 5, 9, 5, 'b'); ln(G, 1, 1, 8, 8, 'w'); ln(G, 8, 1, 1, 8, 'w'); disc(G, 4.5, 4.5, 1.2, 'B'); return G; },
            overdrive() { const G = GR(); for (const o of [0, 4]) { ln(G, 1 + o, 1, 4 + o, 4, 'r'); ln(G, 4 + o, 4, 1 + o, 7, 'r'); ln(G, 2 + o, 1, 5 + o, 4, 'o'); ln(G, 5 + o, 4, 2 + o, 7, 'o'); } return G; },
            minepulse() { const G = GR(); disc(G, 4.5, 4.5, 2.2, 's'); px(G, 4, 4, 'r'); px(G, 5, 4, 'r'); ringI(G, 4.5, 4.5, 4.4, 'y'); return G; },
            vampmine() { const G = GR(); disc(G, 4.5, 5, 3, 's'); px(G, 4, 5, 'r'); px(G, 5, 5, 'r'); ln(G, 3, 7, 3, 9, 'r'); ln(G, 6, 7, 6, 9, 'r'); px(G, 3, 9, 'w'); px(G, 6, 9, 'w'); return G; },
            thorns() { const G = GR(); disc(G, 4.5, 4.5, 2.5, 'L'); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ln(G, 4.5 + Math.cos(a) * 2.5, 4.5 + Math.sin(a) * 2.5, 4.5 + Math.cos(a) * 4.8, 4.5 + Math.sin(a) * 4.8, 'l'); } return G; },
            blood() { const G = GR(); disc(G, 4.5, 6, 3, 'r'); ln(G, 4.5, 0, 2, 5, 'r'); ln(G, 4.5, 0, 7, 5, 'r'); ln(G, 4.5, 1, 4.5, 4, 'r'); px(G, 3, 5, 'p'); px(G, 3, 6, 'p'); return G; },
            hexcoin() { const G = GR(); disc(G, 4.5, 4.5, 4, 'g'); ringI(G, 4.5, 4.5, 4, 'd'); px(G, 3, 3, 'k'); px(G, 6, 3, 'k'); rc(G, 4, 5, 2, 1, 'k'); px(G, 3, 6, 'k'); px(G, 6, 6, 'k'); return G; },
            fever() { const G = GR(); disc(G, 4.5, 5, 3.4, 'r'); px(G, 3, 4, 'k'); px(G, 6, 4, 'k'); rc(G, 3, 7, 4, 1, 'k'); ln(G, 2, 3, 1, 0, 'o'); ln(G, 7, 3, 8, 0, 'o'); ln(G, 4.5, 2, 4.5, 0, 'y'); return G; },
            feather() { const G = GR(); ln(G, 1, 8, 8, 1, 'w'); for (let i = 0; i < 6; i++) { px(G, 2 + i, 7 - i + 1, 'b'); px(G, 3 + i, 7 - i + 1, 'w'); } ln(G, 1, 9, 4, 6, 'n'); return G; },
            overcharge() { const G = GR(); rc(G, 2, 2, 6, 7, 'b'); rc(G, 3, 1, 4, 1, 's'); ln(G, 5, 3, 3, 6, 'y'); ln(G, 3, 6, 6, 6, 'y'); ln(G, 6, 6, 4, 8, 'y'); return G; },
            demo() { const G = GR(); rc(G, 3, 3, 3, 6, 'r'); rc(G, 3, 3, 1, 6, 'o'); ln(G, 4, 3, 5, 1, 'n'); px(G, 6, 0, 'y'); px(G, 7, 1, 'o'); px(G, 5, 0, 'y'); return G; },
            orbitm() { const G = GR(); disc(G, 4.5, 4.5, 1.4, 'y'); ringI(G, 4.5, 4.5, 4.2, 'b'); px(G, 8, 4, 'w'); px(G, 1, 6, 'w'); px(G, 5, 0, 'w'); return G; },
            conduct() { const G = GR(); ln(G, 5, 0, 2, 4, 'y'); ln(G, 2, 4, 7, 5, 'y'); ln(G, 7, 5, 4, 9, 'y'); px(G, 0, 7, 'b'); px(G, 9, 2, 'b'); return G; },
            steady() { const G = GR(); ringI(G, 4.5, 4.5, 4, 'w'); ln(G, 4.5, 0, 4.5, 9, 'w'); ln(G, 0, 4.5, 9, 4.5, 'w'); disc(G, 4.5, 4.5, 1, 'r'); return G; },
            scraphound() { const G = GR(); disc(G, 4.5, 4.5, 2.4, 's'); disc(G, 4.5, 4.5, 1, 'k'); ln(G, 0, 0, 2, 2, 'y'); ln(G, 9, 0, 7, 2, 'y'); ln(G, 0, 9, 2, 7, 'y'); ln(G, 9, 9, 7, 7, 'y'); return G; },
            reach() { const G = GR(); ringI(G, 4.5, 4.5, 4.3, 'c'); ringI(G, 4.5, 4.5, 2.4, 'c'); px(G, 4, 4, 'w'); px(G, 5, 5, 'w'); return G; },
            bounty() { const G = GR(); disc(G, 4.5, 4.5, 4, 'w'); px(G, 3, 3, 'k'); px(G, 6, 3, 'k'); px(G, 4, 5, 'k'); px(G, 5, 5, 'k'); rc(G, 3, 7, 4, 1, 'k'); px(G, 8, 0, 'y'); px(G, 9, 1, 'y'); px(G, 0, 9, 'y'); return G; },
            counter() { const G = GR(); rc(G, 1, 1, 8, 6, 'b'); rc(G, 2, 7, 6, 1, 'b'); rc(G, 3, 8, 4, 1, 'b'); ln(G, 2, 2, 7, 6, 'w'); ln(G, 7, 2, 2, 6, 'w'); return G; },
            nano() { const G = GR(); rc(G, 4, 1, 2, 8, 'c'); rc(G, 1, 4, 8, 2, 'c'); px(G, 1, 1, 'l'); px(G, 8, 8, 'l'); px(G, 8, 1, 'l'); px(G, 1, 8, 'l'); return G; },
            brace() { const G = GR(); ln(G, 1, 8, 5, 1, 'y'); ln(G, 5, 1, 9, 8, 'y'); ln(G, 2, 8, 5, 3, 'o'); ln(G, 5, 3, 8, 8, 'o'); return G; },
            medic() { const G = GR(); rc(G, 1, 1, 8, 8, 'w'); rc(G, 4, 2, 2, 6, 'r'); rc(G, 2, 4, 6, 2, 'r'); return G; },
            quickdraw() { const G = GR(); ringI(G, 4.5, 4.5, 4.3, 'w'); ln(G, 4.5, 4.5, 4.5, 1, 'k'); ln(G, 4.5, 4.5, 7, 5, 'k'); ln(G, 8, 0, 6, 3, 'y'); px(G, 6, 3, 'y'); return G; },
            storm() { const G = GR(); disc(G, 3, 3, 2.2, 's'); disc(G, 6, 3, 2.2, 's'); rc(G, 2, 3, 6, 2, 's'); ln(G, 5, 5, 3, 8, 'y'); ln(G, 3, 8, 6, 8, 'y'); px(G, 6, 9, 'y'); return G; },
            reaper() { const G = GR(); ln(G, 2, 9, 7, 1, 'n'); for (let i = 0; i < 5; i++) { px(G, 7 - i * 0.2 + 1, 1 + i * 0.5, 's'); px(G, 6.5 - i * 0.9, 1.5 + i * 0.1, 'w'); } ln(G, 7, 1, 1, 3, 'w'); ln(G, 7, 2, 2, 4, 's'); return G; },
            slayer() { const G = GR(); ln(G, 1, 8, 8, 1, 'w'); ln(G, 2, 8, 8, 2, 'b'); ln(G, 1, 6, 3, 8, 'n'); ln(G, 0, 9, 1, 8, 'n'); return G; },
            longshot() { const G = GR(); rc(G, 0, 4, 9, 2, 's'); ringI(G, 6, 4.5, 3, 'b'); disc(G, 6, 4.5, 1, 'r'); return G; },
            mob() { const G = GR(); for (const [x, y] of [[2, 3], [7, 3], [4.5, 5.5]]) { disc(G, x, y, 1.6, 'l'); px(G, x - 0.5, y - 0.5, 'k'); px(G, x + 0.5, y - 0.5, 'k'); } rc(G, 1, 7, 8, 2, 'L'); return G; },
            solar() { const G = GR(); disc(G, 4.5, 4.5, 2.4, 'y'); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ln(G, 4.5 + Math.cos(a) * 3.4, 4.5 + Math.sin(a) * 3.4, 4.5 + Math.cos(a) * 4.8, 4.5 + Math.sin(a) * 4.8, 'o'); } return G; },
            chrono() { const G = GR(); ringI(G, 4.5, 4.5, 4.4, 'v'); ln(G, 4.5, 4.5, 4.5, 1.5, 'w'); ln(G, 4.5, 4.5, 7, 6, 'w'); px(G, 4, 4, 'y'); px(G, 5, 4, 'y'); return G; },
            ember() { const G = GR(); disc(G, 4.5, 5, 3.4, 'r'); disc(G, 4.5, 5, 1.8, 'o'); px(G, 4, 5, 'y'); px(G, 4, 1, 'o'); px(G, 5, 2, 'o'); return G; },
            frozen() { const G = GR(); disc(G, 4.5, 4.5, 3.4, 'b'); disc(G, 4.5, 4.5, 1.6, 'w'); ln(G, 4.5, 0, 4.5, 9, 'w'); ln(G, 0, 4.5, 9, 4.5, 'w'); return G; },
            titan() { const G = GR(); rc(G, 1, 3, 8, 6, 's'); rc(G, 2, 1, 6, 2, 's'); rc(G, 3, 4, 4, 3, 'd'); px(G, 4, 5, 'y'); px(G, 5, 5, 'y'); return G; },
            idol() { const G = GR(); rc(G, 3, 5, 4, 4, 'g'); disc(G, 4.5, 3, 2.2, 'g'); px(G, 4, 3, 'k'); px(G, 5, 3, 'k'); rc(G, 2, 8, 6, 1, 'y'); return G; },
            siege() { const G = GR(); disc(G, 5, 5, 3.4, 's'); disc(G, 5, 5, 1.4, 'r'); rc(G, 0, 4, 3, 2, 'n'); ln(G, 7, 2, 9, 0, 'y'); return G; },
            eye() { const G = GR(); rc(G, 0, 4, 10, 2, 'w'); rc(G, 1, 3, 8, 4, 'w'); disc(G, 4.5, 4.5, 2, 'g'); px(G, 4, 4, 'k'); px(G, 5, 4, 'k'); px(G, 4, 5, 'k'); px(G, 5, 5, 'k'); return outl(G, 'k'); },
            totemr() { const G = GR(); rc(G, 3, 1, 4, 8, 'n'); rc(G, 2, 2, 6, 2, 'g'); px(G, 4, 3, 'k'); px(G, 5, 3, 'k'); ln(G, 5, 5, 3, 8, 'y'); return G; },
            crest() { const G = GR(); rc(G, 1, 1, 8, 5, 'g'); rc(G, 2, 6, 6, 1, 'g'); rc(G, 3, 7, 4, 1, 'g'); rc(G, 4, 8, 2, 1, 'g'); rc(G, 4, 2, 2, 3, 'y'); return G; },
            fang() { const G = GR(); ln(G, 2, 1, 4, 8, 'w'); ln(G, 3, 1, 4, 7, 'w'); ln(G, 7, 1, 5, 8, 'w'); ln(G, 6, 1, 5, 7, 'w'); px(G, 4, 9, 'r'); px(G, 5, 9, 'r'); rc(G, 1, 0, 8, 1, 'p'); return G; },
            vault() { const G = GR(); rc(G, 1, 2, 8, 7, 's'); rc(G, 2, 3, 6, 5, 'd'); disc(G, 4.5, 5.5, 1.6, 'g'); px(G, 4, 5, 'k'); return G; },
            gloves() { const G = GR(); rc(G, 2, 3, 5, 5, 'n'); rc(G, 2, 1, 1, 3, 'n'); rc(G, 4, 1, 1, 2, 'n'); rc(G, 6, 2, 1, 2, 'n'); rc(G, 2, 8, 5, 1, 'g'); return G; }
        };
        Object.keys(ICONS).forEach((k) => { ICON_ROWS['c_' + k] = ICONS[k]().map((r) => r.join('')); });

        // ============================================================== ENEMY TYPES
        // def(id, { from, wt, cap, cash, armor, cfg(w), init(z), ai(z, c), die(z), cx(z) })   c = { p, dist, ux, uy, sp, step, hl, frozen }
        const def = (id, o) => { T[id] = Object.assign({ id, pick: true }, o); };
        def('bloater', {
            from: 4, wt: 7, cap: 5, cash: 1.2, cfg: (w) => ({ spr: 'bloater', color: '#8fae5a', size: 24, sc: 4, hp: 150 + w * 60, spd: 0.85, dmg: 14 }),
            ai(z, c) { z.x += c.ux * c.sp; z.y += c.uy * c.sp; },
            die(z) { const burn = z.cb > 0; zone(burn ? 'fire' : 'tox', z.x, z.y, burn ? 86 : 74, burn ? 300 : 420, (burn ? 0.3 : 0.26) + wv() * 0.01); burst(z.x, z.y, burn ? '#ff7a1a' : '#8fdc4a', 18, 3.5); g.shake = Math.max(g.shake, 5); }
        });
        def('riot', {
            from: 5, wt: 8, cap: 6, cash: 1.3, cfg: (w) => ({ spr: 'riot', color: '#7d8a96', size: 18, sc: 3, hp: 120 + w * 50, spd: 1.35, dmg: 20 }),
            init(z) { z.fa = Math.atan2(g.player.y - z.y, g.player.x - z.x); },
            cx: (z) => (((z.fa * 57.3) % 360 + 360) % 360 / 2) | 0,
            ai(z, c) {
                const tgt = Math.atan2(c.p.y - z.y, c.p.x - z.x), hl = c.hl;
                let d = Math.atan2(Math.sin(tgt - z.fa), Math.cos(tgt - z.fa)); const turn = (0.026 + hl * 0.002) * c.step; z.fa += clamp(d, -turn, turn);
                const al = angDiff(tgt, z.fa);
                if (z.state === 'walk') {
                    const k = al > 1.1 ? 0.55 : 1; z.x += c.ux * c.sp * k; z.y += c.uy * c.sp * k; z.cd -= c.step;
                    if (z.cd <= 0 && c.dist < 85) { z.state = 'hwind'; z.t = 24; }
                } else if (z.state === 'hwind') { z.t -= c.step; if (z.t <= 0) { z.state = 'dash'; z.t = 14; z.dvx = Math.cos(z.fa); z.dvy = Math.sin(z.fa); } }
                else if (z.state === 'dash') { z.x += z.dvx * 6.5 * c.step; z.y += z.dvy * 6.5 * c.step; if ((z.t -= c.step) <= 0) { z.state = 'rest'; z.t = 40; z.cd = Math.max(110, 190 - hl * 6); } }
                else { z.t -= c.step; if (z.t <= 0) z.state = 'walk'; }   // 'rest' (also what a parry leaves us in)
            },
            die(z) { if (rnd() < 0.2 && g.pickups.length < 30) g.pickups.push({ x: clamp(z.x, 30, 770), y: clamp(z.y, 30, 570), kind: 'GUARD', born: g.tick, life: 720 }); }
        });
        def('sapper', {
            from: 6, wt: 6, cap: 4, cash: 1.2, cfg: (w) => ({ spr: 'sapper', color: '#c9a07a', size: 13, sc: 3, hp: 55 + w * 20, spd: 2.0, dmg: 6 }),
            ai(z, c) {
                if (z.state === 'walk') {
                    kite(z, c, 200, 300, 0.5, 1.3); z.cd -= c.step;
                    if (z.cd <= 0 && c.dist < 480) { z.state = 'hwind'; z.t = 22; }
                } else if (z.state === 'hwind') {
                    z.t -= c.step; flashFor(z, 2);
                    if (z.t <= 0) {
                        z.state = 'walk'; z.cd = Math.max(110, 210 - c.hl * 6) * DF().fire;
                        const n = 1 + (c.hl >= 5 ? 1 : 0) + (c.hl >= 10 ? 1 : 0);
                        for (let i = 0; i < n; i++) if (g.bossTraps.length < 36) g.bossTraps.push({ x: clamp(c.p.x + (c.p.vx || 0) * 26 + (rnd() - .5) * 90, 30, 770), y: clamp(c.p.y + (c.p.vy || 0) * 26 + (rnd() - .5) * 90, 30, 570), r: 34, dmg: (16 + wv() * 0.6) * dfd(), armAt: g.tick + 72, born: g.tick });
                    }
                }
            },
            die(z) { if (g.bossTraps.length < 36) g.bossTraps.push({ x: clamp(z.x, 30, 770), y: clamp(z.y, 30, 570), r: 34, dmg: (14 + wv() * 0.5) * dfd(), armAt: g.tick + 45, born: g.tick }); }
        });
        def('mother', {
            from: 8, wt: 4, cap: 2, cash: 1.8, cfg: (w) => ({ spr: 'mother', color: '#b48a6a', size: 22, sc: 4, hp: 170 + w * 55, spd: 0.9, dmg: 12 }),
            ai(z, c) {
                if (z.state === 'walk') {
                    kite(z, c, 170, 280, 0.3); z.cd -= c.step;
                    if (z.cd <= 0 && c.dist < 560 && g.zombies.length < 105 && kids(z) < 6) { z.state = 'hwind'; z.t = 34; }
                } else if (z.state === 'hwind') {
                    z.t -= c.step; flashFor(z, 2);
                    if (z.t <= 0) { z.state = 'walk'; z.cd = Math.max(150, 240 - c.hl * 6); const n = 3 + (c.hl >= 6 ? 1 : 0); for (let i = 0; i < n; i++) spawnZombie('crawler', z.x + (rnd() - .5) * 50, z.y + (rnd() - .5) * 50, { cashMul: 0.25, noDrop: true, pid: z.id, emerge: 8, hl: z.hl }); }
                }
            },
            die(z) { if (g.zombies.length < 105) for (let i = 0; i < 4; i++) { const a = i * 1.57 + rnd(); spawnZombie('crawler', z.x + Math.cos(a) * 24, z.y + Math.sin(a) * 24, { cashMul: 0.25, noDrop: true, emerge: 0, hl: z.hl }); } burst(z.x, z.y, '#e8d8a8', 16, 3); }
        });
        def('crawler', { pick: false, cash: 1, cfg: (w) => ({ spr: 'crawler', color: '#a89a6a', size: 8, sc: 2, hp: 14 + w * 5, spd: 3.4, dmg: 6 }), ai(z, c) { z.x += c.ux * c.sp; z.y += c.uy * c.sp; } });
        def('egg', {
            pick: false, cash: 0.3, cfg: (w) => ({ spr: 'egg', color: '#d8d0a0', size: 13, sc: 3, hp: 70 + w * 18, spd: 0, dmg: 0, nobite: true }),
            cx: (z) => Math.ceil(Math.max(0, z.hatch || 0) / 10),
            ai(z, c) {
                z.hatch = (z.hatch === undefined ? 210 : z.hatch) - c.step;
                if (z.hatch <= 0 && !z.dead) { z.dead = true; burst(z.x, z.y, '#d8d0a0', 12, 3); if (g.zombies.length < 105) for (let i = 0; i < 2; i++) spawnZombie('crawler', z.x + (i ? 14 : -14), z.y, { cashMul: 0.25, noDrop: true, emerge: 6, hl: z.hl }); }
            }
        });
        def('frostling', {
            from: 7, wt: 6, cap: 5, cash: 1.3, cfg: (w) => ({ spr: 'frostling', color: '#9fd0ee', size: 14, sc: 3, hp: 70 + w * 28, spd: 1.5, dmg: 7 }),
            ai(z, c) {
                if (z.state === 'walk') {
                    kite(z, c, 200, 290, 0.5); z.cd -= c.step;
                    if (z.cd <= 0 && c.dist < 500) { z.state = 'aim'; z.t = 32; const a = aimPoint(z, c.p, 4.2); z.ax = a.x; z.ay = a.y; }
                } else if (z.state === 'aim') {
                    z.t -= c.step; if (z.t < 12) flashFor(z, 2);
                    if (z.t <= 0) {
                        z.state = 'walk'; z.cd = (Math.max(95, 150 - c.hl * 5) + rnd() * 40) * DF().fire;
                        const shots = c.hl >= 6 ? [-0.22, 0, 0.22] : [0], ba = Math.atan2(z.ay - z.y, z.ax - z.x);
                        for (const o of shots) shoot('ice', z.x, z.y, z.x + Math.cos(ba + o) * 100, z.y + Math.sin(ba + o) * 100, 4.2 + c.hl * 0.08, 7 * dfd(), 170);
                    }
                }
            },
            die(z) { zone('frost', z.x, z.y, 62, 300, 0.04); fx('ring', z.x, z.y, 62, 24, 1); burst(z.x, z.y, '#cfeaff', 14, 3); }
        });
        def('sniper', {
            from: 10, wt: 5, cap: 3, cash: 1.5, cfg: (w) => ({ spr: 'sniper', color: '#5a5a42', size: 13, sc: 3, hp: 60 + w * 22, spd: 1.2, dmg: 4 }),
            ai(z, c) {
                if (z.state === 'walk') {
                    kite(z, c, 320, 470, 0.3, 1.2); z.cd -= c.step;
                    if (z.cd <= 0 && c.dist < 700) {
                        z.state = 'aim'; z.t = 84; const a = Math.atan2(c.p.y - z.y, c.p.x - z.x);
                        z.bm = beam(z.x, z.y, a, 84, (15 + wv() * 0.7) * dfd(), 5, 950);
                    }
                } else if (z.state === 'aim') {   // tracks you for the first moments, then LOCKS. step sideways when the line stops moving
                    z.t -= c.step; const b = z.bm;
                    if (b) { b.x = z.x; b.y = z.y; if (z.t > 34) { const want = Math.atan2(c.p.y + (c.p.vy || 0) * 8 - z.y, c.p.x + (c.p.vx || 0) * 8 - z.x); b.a += clamp(Math.atan2(Math.sin(want - b.a), Math.cos(want - b.a)), -0.07, 0.07); } else { z.ax = z.x + Math.cos(b.a) * 900; z.ay = z.y + Math.sin(b.a) * 900; } }
                    if (z.t < 26) flashFor(z, 2);
                    if (z.t <= 0) { z.state = 'rest'; z.t = 24; z.bm = null; }
                } else { z.t -= c.step; if (z.t <= 0) { z.state = 'walk'; z.cd = Math.max(170, 270 - c.hl * 8) * DF().fire; } }
            },
            die(z) { if (z.bm) { const i = g.hz.indexOf(z.bm); if (i >= 0) g.hz.splice(i, 1); z.bm = null; } if (rnd() < 0.12) g.scraps += 1; }
        });
        def('thrower', {
            from: 9, wt: 6, cap: 4, cash: 1.4, cfg: (w) => ({ spr: 'thrower', color: '#e0b48a', size: 15, sc: 3, hp: 95 + w * 32, spd: 1.4, dmg: 9 }),
            ai(z, c) {
                if (z.state === 'walk') {
                    kite(z, c, 200, 320, 0.5); z.cd -= c.step;
                    if (z.cd <= 0 && c.dist < 520) { z.state = 'hwind'; z.t = 20; }
                } else if (z.state === 'hwind') {
                    z.t -= c.step; flashFor(z, 2);
                    if (z.t <= 0) {
                        z.state = 'walk'; z.cd = Math.max(130, 205 - c.hl * 6) * DF().fire;
                        const n = 1 + (c.hl >= 5 ? 1 : 0) + (c.hl >= 10 ? 1 : 0), W_ = W();
                        for (let i = 0; i < n; i++) {
                            const tx = clamp(c.p.x + (c.p.vx || 0) * 30 + (rnd() - .5) * 70, 30, 770), ty = clamp(c.p.y + (c.p.vy || 0) * 30 + (rnd() - .5) * 70, 30, 570), fl = 72 + i * 14;
                            tele(tx, ty, 56, fl, (17 + wv() * 0.7) * dfd());
                            if (W_.proj.length < 40) W_.proj.push({ k: 'gren', x: z.x, y: z.y, x0: z.x, y0: z.y, x1: tx, y1: ty, t: 0, max: fl });
                        }
                    }
                }
            },
            die(z) { tele(z.x, z.y, 50, 50, (14 + wv() * 0.5) * dfd()); }   // it drops the last one at its feet
        });
        def('necro', {
            from: 12, wt: 4, cap: 2, cash: 2, cfg: (w) => ({ spr: 'necro', color: '#6a4a9a', size: 16, sc: 3, hp: 120 + w * 40, spd: 1.1, dmg: 5 }),
            ai(z, c) {
                const w = W();
                if (z.state === 'walk') {
                    kite(z, c, 240, 360, 0.4, 1.2); z.cd -= c.step;
                    if (z.cd <= 0 && w.corpses.length) {
                        let b = null, bd = 340 * 340; for (const o of w.corpses) { const d = (o.x - z.x) ** 2 + (o.y - z.y) ** 2; if (d < bd) { bd = d; b = o; } }
                        if (b && g.zombies.length < 100 && C.revived() < 14) { z.state = 'raise'; z.t = 56; z.cp = b; z.ax = b.x; z.ay = b.y; }
                    }
                } else if (z.state === 'raise') {
                    z.t -= c.step; flashFor(z, 2);
                    if (!w.corpses.includes(z.cp)) { z.state = 'walk'; z.cd = 40; }
                    else if (z.t <= 0) {
                        const b = z.cp; w.corpses.splice(w.corpses.indexOf(b), 1); z.state = 'walk'; z.cd = Math.max(95, 160 - c.hl * 5);
                        spawnZombie(b.type, b.x, b.y, { cashMul: 0.25, noDrop: true, rev: 1, emerge: 26, hl: z.hl });
                        const nz = g.zombies[g.zombies.length - 1]; if (nz) { nz.hp = nz.max = Math.round(nz.max * 0.55); }
                        fx('ring', b.x, b.y, 34, 30, 3); burst(b.x, b.y, '#6aff8a', 12, 3);
                    }
                }
            },
            die(z) { if (!g.zombies.some((o) => o !== z && !o.dead && (o.cai === 'necro' || (o.boss && o.bossKind === 'lich')))) { const w = W(); w.corpses.forEach((o) => burst(o.x, o.y, '#6aff8a', 6, 2)); w.corpses.length = 0; } }
        });
        def('screamer', {
            from: 11, wt: 4, cap: 2, cash: 1.5, cfg: (w) => ({ spr: 'screamer', color: '#d8c0d8', size: 14, sc: 3, hp: 85 + w * 28, spd: 1.7, dmg: 6 }),
            ai(z, c) {
                kite(z, c, 260, 380, 0.6, 1.6);
                if (!z.sc2 && z.hp / z.max < 0.5) {   // wounded: it SHRIEKS. nearby zombies go berserk for a good while
                    z.sc2 = 1; z.state = 'hwind'; z.t = 30;
                } else if (z.state === 'hwind') {
                    z.t -= c.step; flashFor(z, 2);
                    if (z.t <= 0) {
                        z.state = 'walk'; spawnRing(z.x, z.y, { max: 300, sp: 4.5, dmg: 8 + z.dmg, ga: Math.atan2(c.p.y - z.y, c.p.x - z.x) + Math.PI, gw: 0.5 });
                        for (const o of g.zombies) if (live(o) && !o.boss && Math.hypot(o.x - z.x, o.y - z.y) < 320) o.rage = Math.max(o.rage || 0, 360);
                        g.shake = Math.max(g.shake, 5); popSync(z.x, z.y - 24, 'SHRIEK');
                    }
                }
            },
            die(z) { fx('ring', z.x, z.y, 120, 26, 0); }
        });
        def('pyro', {
            from: 13, wt: 6, cap: 4, cash: 1.3, cfg: (w) => ({ spr: 'pyro', color: '#ff7a1a', size: 15, sc: 3, hp: 90 + w * 32, spd: 1.9, dmg: 10 }),
            ai(z, c) {
                const sg = Math.sin(g.tick * 0.09 + z.seed) * 0.35, ca = Math.cos(sg), sa = Math.sin(sg);
                z.x += (c.ux * ca - c.uy * sa) * c.sp; z.y += (c.ux * sa + c.uy * ca) * c.sp;
                if ((z.tr = (z.tr || 0) - c.step) <= 0) { z.tr = 13; zone('fire', z.x, z.y, 24, 150, 0.2 + wv() * 0.008); }
            },
            die(z) { zone('fire', z.x, z.y, 70, 240, 0.28 + wv() * 0.01); hurtAt(z.x, z.y, 55, (12 + wv() * 0.5) * dfd()); burst(z.x, z.y, '#ff7a1a', 18, 4); }
        });
        def('brute', {
            from: 11, wt: 5, cap: 3, cash: 2.2, armor: 0.25, cfg: (w) => ({ spr: 'brute', color: '#8a5a3a', size: 28, sc: 5, hp: 280 + w * 115, spd: 0.85, dmg: 30 }),
            ai(z, c) {
                z.slow = 1;   // nothing slows a brute
                const mg = 28;
                if (z.state === 'walk') {
                    z.x += c.ux * c.sp; z.y += c.uy * c.sp; z.t -= c.step;
                    if (z.t <= 0 && c.dist < 420 && c.dist > 90) { z.state = 'hwind'; z.t = Math.max(30, 52 - c.hl * 2); const a = Math.atan2(c.p.y - z.y, c.p.x - z.x); z.dvx = Math.cos(a); z.dvy = Math.sin(a); z.ax = z.x + z.dvx * 800; z.ay = z.y + z.dvy * 800; z.nobite = true; z.v = 0; }
                } else if (z.state === 'hwind') { z.t -= c.step; flashFor(z, 2); if (z.t <= 0) { z.state = 'dash'; z.t = 80; z.nobite = false; z.v = 2.5; } }
                else if (z.state === 'dash') {
                    z.v = Math.min(11, z.v + 0.16 * c.step); z.x += z.dvx * z.v * c.step; z.y += z.dvy * z.v * c.step; z.t -= c.step;
                    for (const b of g.barrels) if (!b.dead && Math.hypot(b.x - z.x, b.y - z.y) < z.size + 14) hurtBarrel(b, 400);   // breaks cover
                    if (z.x <= mg + 2 || z.x >= 800 - mg - 2 || z.y <= mg + 2 || z.y >= 600 - mg - 2) {   // slammed into the wall: stunned and wide open
                        z.state = 'stun'; z.t = 110; z.nobite = true; z.vul = 1.6; g.shake = Math.max(g.shake, 9); popSync(z.x, z.y - 40, 'STUNNED'); burst(z.x, z.y, '#c8c0b0', 14, 3);
                        g.vfx.push({ x: z.x, y: z.y, r: 0, max: 90, a: 1 }); hurtAt(z.x, z.y, 70, 10 + wv() * 0.4);
                    } else if (z.t <= 0) { z.state = 'rest'; z.t = 36; }
                } else if (z.state === 'stun') { z.t -= c.step; if (z.t <= 0) { z.state = 'walk'; z.t = Math.max(60, 120 - c.hl * 4); z.nobite = false; z.vul = 0; } }
                else { z.t -= c.step; z.vul = 0; z.nobite = false; if (z.t <= 0) { z.state = 'walk'; z.t = Math.max(60, 120 - c.hl * 4); } }   // 'rest' (also what a parry leaves us in)
            },
            die(z) { if (rnd() < 0.35 && g.pickups.length < 30) g.pickups.push({ x: clamp(z.x, 30, 770), y: clamp(z.y, 30, 570), kind: 'HEAL', born: g.tick, life: 720 }); }
        });
        def('magnet', {
            from: 14, wt: 4, cap: 2, cash: 1.8, cfg: (w) => ({ spr: 'magnet', color: '#c0392b', size: 16, sc: 3, hp: 120 + w * 38, spd: 1.1, dmg: 10 }),
            ai(z, c) {
                if (z.state === 'walk') {
                    kite(z, c, 220, 330, 0.3); z.cd -= c.step;
                    if (z.cd <= 0 && c.dist < 400) { z.state = 'hwind'; z.t = 34; }
                } else if (z.state === 'hwind') { z.t -= c.step; flashFor(z, 2); if (z.t <= 0) { z.state = 'pull'; z.t = 130; } }
                else if (z.state === 'pull') {
                    z.t -= c.step;
                    if (c.p === g.player && c.dist > 40 && c.dist < 460 && !(g.downT > 0)) { const f = (1.4 + c.hl * 0.05) * c.step * (1 - c.dist / 600); c.p.x = clamp(c.p.x + (z.x - c.p.x) / c.dist * f, 20, 780); c.p.y = clamp(c.p.y + (z.y - c.p.y) / c.dist * f, 20, 580); }
                    if (z.t <= 0) { z.state = 'walk'; z.cd = Math.max(170, 270 - c.hl * 8) * DF().fire; }
                }
            },
            die(z) { fx('ring', z.x, z.y, 90, 26, 4); if (rnd() < 0.3) dropPickup(z, true); }
        });
        def('totem', {
            pick: false, cash: 0.5, cfg: (w) => ({ spr: 'totem', color: '#6fb8e8', size: 14, sc: 3, hp: 140 + w * 35, spd: 0, dmg: 0, nobite: true }),
            ai(z, c) {
                z.slow = 1;
                if (z.state === 'walk') { z.cd -= c.step; if (z.cd <= 0 && c.dist < 650) { z.state = 'aim'; z.t = 34; const a = aimPoint(z, c.p, 3.8); z.ax = a.x; z.ay = a.y; } }
                else if (z.state === 'aim') { z.t -= c.step; if (z.t < 12) flashFor(z, 2); if (z.t <= 0) { z.state = 'walk'; z.cd = 170 * DF().fire; shoot('ice', z.x, z.y, z.ax, z.ay, 3.8, 8 * dfd(), 200); } }
            }
        });

        // ---- zombie lifecycle helpers
        const initZ = (z) => {
            z.cin = 1; const t = T[z.cai]; if (!t) return;
            if (t.cash) z.cashMul = (z.cashMul || 1) * t.cash;
            if (t.armor) z.armor = Math.max(z.armor || 0, t.armor);
            if (t.init) t.init(z);
        };
        C.revived = () => { let n = 0; for (const z of g.zombies) if (z.rev && !z.dead) n++; return n; };
        C.cfg = guard('cfg', (type) => { const t = T[type]; if (!t || !t.cfg) return undefined; return Object.assign({ type, ai: 'cx', cai: type }, t.cfg(g.wave)); });
        C.pick = guard('pick', (opts, w, hl, e) => {
            for (const id in T) {
                const t = T[id]; if (!t.pick || w + e < t.from) continue;
                const cap = t.cap + Math.floor(np() / 2);
                opts.push([id, liveCount(id) >= cap ? 0 : t.wt + hl * 0.4]);
            }
        });
        C.move = guard('move', (z, p, dist, ux, uy, sp, step, hl, frozen) => {
            if (!z.cai) return false; const t = T[z.cai]; if (!t) return false;
            if (!z.cin) initZ(z);
            t.ai(z, { p, dist, ux, uy, sp, step, hl, frozen });
            return true;
        }, false);

        // ============================================================== BOSSES
        // existing three: a touch more health, speed and damage
        BOSSES.forEach((b) => { if (b.cxt) return; b.cxt = 1; b.hpPer = Math.round(b.hpPer * 1.12); b.spd = +(b.spd * 1.05).toFixed(2); b.dmg = Math.round(b.dmg * 1.08); });
        [
            { bossKind: 'frost', label: 'Frost Warden', spr: 'bossD', color: '#6fb8e8', ai: 'cx', cai: 'b_frost', hpBase: 4200, hpPer: 1350, spd: 0.95, dmg: 100 },
            { bossKind: 'lich', label: 'Grave Lord', spr: 'bossE', color: '#6a4a9a', ai: 'cx', cai: 'b_lich', hpBase: 4400, hpPer: 1300, spd: 0.9, dmg: 95 },
            { bossKind: 'titan', label: 'Magma Titan', spr: 'bossF', color: '#ff7a1a', ai: 'cx', cai: 'b_titan', hpBase: 5000, hpPer: 1500, spd: 0.7, dmg: 130 }
        ].forEach((b) => { if (!BOSSES.some((o) => o.bossKind === b.bossKind)) BOSSES.push(b); });

        const bossEnrage = (z, ph, hl) => {
            if (z.cxe || z.hp / z.max >= 0.2) return;
            z.cxe = 1; z.spd *= 1.18; z.dmg *= 1.1; z.flash = 6;
            g.banner = { text: z.label + ' ENRAGES', sub: 'Everything faster. Finish it.', life: 150 }; g.shake = Math.max(g.shake, 12);
            spawnRing(z.x, z.y, { max: 460, sp: 7, dmg: 14, gw: 0.9 });
        };
        const adds = (z, type, n, extra) => { n = Math.max(1, Math.round(n * BT().adds)); for (let i = 0; i < n && g.zombies.length < 100; i++) { const a = rnd() * TAU, d = 50 + rnd() * 50; spawnZombie(type, z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, Object.assign({ cashMul: 0.3, noDrop: true, pid: z.id, hl: z.hl }, extra || {})); } };
        // ---- the old bosses
        const bossHive = (z, step, ph, hl, e) => {
            z.h1 = (z.h1 ?? 320) - step * e;
            if (z.h1 <= 0) {   // CARPET STRIKE: a lane of circles sweeps out from the Commander toward you
                z.h1 = Math.max(250, 520 - ph * 55 - hl * 8); const t = rndTarget(), a = Math.atan2(t.y - z.y, t.x - z.x), n = 7 + (ph >= 3 ? 2 : 0);
                flashFor(z, 30); popSync(z.x, z.y - 50, 'CARPET STRIKE');
                for (const lo of (MT() >= 2 ? [-0.5, 0, 0.5] : (MT() === 1 ? [-0.28, 0.28] : [0]))) for (let i = 0; i < n - (MT() < 0 ? 2 : 0); i++) tele(z.x + Math.cos(a + lo) * (70 + i * 66), z.y + Math.sin(a + lo) * (70 + i * 66), 42, 48 + i * 7, 22 + wv() * 0.55);
            }
            if (ph >= 2) {
                z.h2 = (z.h2 ?? 460) - step * e;
                if (z.h2 <= 0) {   // HIVE CAGE: eight blasts ring a target. The middle is safe: stand still, or run through BEFORE they go off
                    z.h2 = Math.max(360, 680 - ph * 70 - hl * 8); const t = rndTarget(), R = 108;
                    popSync(t.x, t.y - 40, 'CAGE'); fx('ring', t.x, t.y, 56, 80, 0);
                    const nc = MT() >= 2 ? 10 : 8; for (let i = 0; i < nc; i++) tele(t.x + Math.cos(i / nc * TAU + 0.4) * R, t.y + Math.sin(i / nc * TAU + 0.4) * R, 44, 80, 28 + wv() * 0.6);
                }
            }
        };
        const bossBrood = (z, step, ph, hl, e) => {
            z.b1 = (z.b1 ?? 380) - step * e;
            if (z.b1 <= 0) {   // EGG CLUTCH: shoot them before they hatch
                z.b1 = Math.max(420, 660 - ph * 50 - hl * 8); const n = Math.min(Math.max(1, Math.round((2 + ph + (z.cxe ? 2 : 0) + Math.max(0, MT())) * BT().adds)), 8 - kids(z, 'egg'));
                if (n > 0) { flashFor(z, 24); popSync(z.x, z.y - 50, 'EGGS'); for (let i = 0; i < n && g.zombies.length < 100; i++) { const a = rnd() * TAU, d = 90 + rnd() * 90; spawnZombie('egg', z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, { pid: z.id, noDrop: true, cashMul: 0.3, hl: z.hl, emerge: 10 }); } }
            }
            if (ph >= 2) {
                z.b2 = (z.b2 ?? 300) - step * e;
                if (z.b2 <= 0) {   // ACID BARRAGE: a warning line, then a fan of spit down it
                    z.b2 = Math.max(360, 570 - ph * 40 - hl * 6); const t = rndTarget(), a = Math.atan2(t.y - z.y, t.x - z.x), n = (z.cxe ? 11 : 7) + 2 * Math.max(0, MT() - 1), zx = z.x, zy = z.y;
                    fx('line', zx, zy, 520, 52, 3, a); flashFor(z, 40); popSync(z.x, z.y - 50, 'ACID BARRAGE');
                    const fan = (sv) => () => { if (z.dead) return; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.11; if (g.spits.length < 120) g.spits.push({ x: zx, y: zy, vx: Math.cos(a + o) * sv, vy: Math.sin(a + o) * sv, life: 240 }); } };
                    later(52, fan(4.4)); if (MT() >= 2) later(82, fan(3.4));   // mutated: a slower second fan fills the gaps
                }
            }
        };
        const bossJug = (z, step, ph, hl, e) => {
            z.j1 = (z.j1 ?? 340) - step * e;
            if (z.j1 <= 0) {   // SEISMIC FISSURE: blasts march out from the Juggernaut along a line to you
                z.j1 = Math.max(260, 470 - ph * 45 - hl * 8); const t = rndTarget(), a = Math.atan2(t.y - z.y, t.x - z.x);
                flashFor(z, 24); popSync(z.x, z.y - 50, 'FISSURE');
                for (const lo of (MT() >= 1 ? [-0.3, 0.3] : [0])) for (let i = 0; i < 8; i++) tele(z.x + Math.cos(a + lo) * (80 + i * 62), z.y + Math.sin(a + lo) * (80 + i * 62), 40, 40 + i * 8, 22 + wv() * 0.5);
            }
            if (ph >= 2) {
                z.j2 = (z.j2 ?? 440) - step * e;
                if (z.j2 <= 0) {   // QUAKE: three rings, each with a gap in a different place. Read the gaps
                    z.j2 = Math.max(430, 640 - ph * 50 - hl * 8); const t = rndTarget(), a = Math.atan2(t.y - z.y, t.x - z.x); z.slow = 0.1; flashFor(z, 40); popSync(z.x, z.y - 50, 'QUAKE');
                    fx('ring', z.x, z.y, 90, 40, 4);
                    for (let i = 0; i < 3 + Math.max(0, Math.min(2, MT() - 1)); i++) later(40 + i * 24, () => { if (!z.dead) ringB(z.x, z.y, { max: 430, sp: 5, w: 11, dmg: 18 + wv() * 0.4, ga: a + i * 2.1, gw: 0.6 }); });
                }
            }
        };
        // ---- the new bosses
        const boss_frost = {
            ai(z, c) { kite(z, c, 230, 320, 0.4); },
            cx: (z) => (z.sh ? 1 : 0),
            step(z, step, ph, hl, e) {
                const totems = () => kids(z, 'totem'), np_ = np();
                if (!z.cin2) { z.cin2 = 1; z.sh = true; this.spawnTotems(z, Math.max(2, Math.round((3 + np_) * BT().adds))); }
                if (z.sh && totems() === 0) { z.sh = false; z.stunT = 230; z.reT = 760; g.banner = { text: 'SHIELD BROKEN', sub: 'Hit her now.', life: 130 }; g.shake = Math.max(g.shake, 10); fx('ring', z.x, z.y, 140, 30, 1); }
                if (!z.sh && !(z.stunT > 0) && (z.reT -= step) <= 0) { z.sh = true; this.spawnTotems(z, Math.min(6, Math.round((3 + ph + np_) * BT().adds))); popSync(z.x, z.y - 60, 'ICE SHIELD'); }
                z.cdm = z.sh ? 0.08 : (z.stunT > 0 ? 1.5 : 1);
                if (z.stunT > 0) { z.stunT -= step; z.slow = Math.min(z.slow, 0.05); return; }
                z.f1 = (z.f1 ?? 220) - step * e;
                if (z.f1 <= 0) {   // BLIZZARD: dashed circles, then patches of freezing ground
                    z.f1 = Math.max(300, 520 - ph * 50 - hl * 6); flashFor(z, 24); popSync(z.x, z.y - 60, 'BLIZZARD');
                    for (let i = 0; i < 2 + ph + Math.max(0, MT()); i++) { const t = rndTarget(); zone('frost', t.x + (rnd() - .5) * 120, t.y + (rnd() - .5) * 120, 72, 460, 0.06, 66); }
                }
                z.f2 = (z.f2 ?? 400) - step * e;
                if (z.f2 <= 0) {   // ICE LANCES: a fan of lines, locked after the warning
                    z.f2 = Math.max(370, 620 - ph * 60 - hl * 6); const t = rndTarget(), a = Math.atan2(t.y - z.y, t.x - z.x), n = (ph >= 3 ? 5 : 3) + Math.max(0, MT());
                    flashFor(z, 30); popSync(z.x, z.y - 60, 'ICE LANCES');
                    for (let i = 0; i < n; i++) beam(z.x, z.y, a + (i - (n - 1) / 2) * 0.3, 72, 17 + wv() * 0.5, 7, 900);
                }
                if (ph >= 2) { z.f3 = (z.f3 ?? 360) - step * e; if (z.f3 <= 0) { z.f3 = Math.max(430, 580 - ph * 40); ringB(z.x, z.y, { max: 470, sp: 5, dmg: 18 + wv() * 0.4, gw: 0.55 }); fx('ring', z.x, z.y, 60, 20, 1); } }
                if (ph >= 3 || MT() >= 3) {   // ABSOLUTE ZERO (unlocked a phase early on the top tier): one huge circle on you
                    z.f4 = (z.f4 ?? 500) - step * e;
                    if (z.f4 <= 0) { z.f4 = Math.max(520, 740 - hl * 8); const t = rndTarget(); tele(t.x, t.y, 138, 100, 30 + wv() * 0.6); zone('frost', t.x, t.y, 138, 360, 0.08, 100); popSync(t.x, t.y - 60, 'ABSOLUTE ZERO'); }
                }
            },
            spawnTotems(z, n) { const P = [[110, 110], [690, 110], [110, 490], [690, 490], [400, 90], [400, 510]]; for (let i = 0; i < n && i < P.length; i++) spawnZombie('totem', P[i][0], P[i][1], { pid: z.id, noDrop: true, cashMul: 0.4, emerge: 36, hl: z.hl }); }
        };
        const boss_lich = {
            ai(z, c) { if (z.tpw > 0) return; kite(z, c, 200, 280, 0.3); },
            step(z, step, ph, hl, e) {
                z.cdm = z.tpw > 0 ? 0.4 : 1;
                if (z.tpw > 0) { z.tpw -= step; z.slow = Math.min(z.slow, 0.05); flashFor(z, 2); return; }
                z.l1 = (z.l1 ?? 200) - step * e;
                if (z.l1 <= 0) {   // GRAVE STEP: it marks where it will reappear, vanishes, comes back with a shockwave and a scythe
                    z.l1 = Math.max(330, 470 - ph * 40 - hl * 6); const ts = liveTargets(), t = ts[rnd() * ts.length | 0];
                    let dx = 0, dy = 0; for (let i = 0; i < 8; i++) { dx = 80 + rnd() * 640; dy = 80 + rnd() * 440; if (Math.hypot(dx - t.x, dy - t.y) > 220) break; }
                    z.tpw = TD(64); fx('ring', dx, dy, 50, 64, 0); popSync(z.x, z.y - 60, 'GRAVE STEP');
                    later(64, () => {
                        if (z.dead) return; burst(z.x, z.y, '#6aff8a', 16, 4); z.x = dx; z.y = dy; burst(z.x, z.y, '#6aff8a', 16, 4); z.tpw = 0;
                        ringB(z.x, z.y, { max: 300, sp: 6, dmg: 14 + wv() * 0.3, gw: 0.7 }); g.shake = Math.max(g.shake, 8);
                        const sg = rnd() < 0.5 ? 1 : -1, a0 = rnd() * TAU, n = (ph >= 3 ? 2 : 1) + (MT() >= 2 ? 1 : 0);
                        for (let i = 0; i < n; i++) beam(z.x, z.y, a0 + i * Math.PI, 54, 10 + wv() * 0.2, 14, 560, z, 0.019 * sg, 250);
                    });
                }
                z.l2 = (z.l2 ?? 360) - step * e;
                if (z.l2 <= 0) { z.l2 = Math.max(430, 650 - ph * 50 - hl * 8); flashFor(z, 30); popSync(z.x, z.y - 60, 'RAISE DEAD'); adds(z, ph >= 2 ? 'speedy' : 'standard', 3 + ph + np(), { emerge: 30 }); fx('ring', z.x, z.y, 100, 30, 3); }
                if (ph >= 2 || MT() >= 2) {   // BONE CAGE (mutated tiers cast it from phase 1): a ring of blasts around you, middle safe
                    z.l3 = (z.l3 ?? 420) - step * e;
                    if (z.l3 <= 0) { z.l3 = Math.max(430, 700 - hl * 8); const t = rndTarget(), R = 118; popSync(t.x, t.y - 40, 'BONE CAGE'); fx('ring', t.x, t.y, 60, 84, 3); for (let i = 0; i < 10; i++) tele(t.x + Math.cos(i / 10 * TAU) * R, t.y + Math.sin(i / 10 * TAU) * R, 38, 84, 24 + wv() * 0.5); }
                }
                if (ph >= 3) {   // SOUL HARVEST: a big warning ring around the lord. Get out of it or it heals off you
                    z.l4 = (z.l4 ?? 600) - step * e;
                    if (z.l4 <= 0) {
                        z.l4 = 880; popSync(z.x, z.y - 60, 'SOUL HARVEST'); fx('ring', z.x, z.y, 210, 80, 0); flashFor(z, 80);
                        later(80, () => { if (z.dead) return; g.vfx.push({ x: z.x, y: z.y, r: 0, max: 210, a: 1 }); g.shake = Math.max(g.shake, 8); let hit = 0; for (const t of liveTargets()) if (Math.hypot(t.x - z.x, t.y - z.y) < 210) { hitT(t, BD(20 + wv() * 0.4)); hit++; } z.hp = Math.min(z.max, z.hp + z.max * 0.025 * hit); });
                    }
                }
            }
        };
        const boss_titan = {
            ai(z, c) { if (z.stunT > 0) return; z.x += c.ux * c.sp * 0.8; z.y += c.uy * c.sp * 0.8; if ((z.lv = (z.lv || 0) - c.step) <= 0) { z.lv = 34; zone('fire', z.x, z.y, 38, 230, 0.28 + wv() * 0.01); } },
            cx: (z) => clamp(Math.round((z.heat || 0) / 10), 0, 120),
            step(z, step, ph, hl, e) {
                const cycle = Math.max(640, (1150 - ph * 90 - hl * 10) * (1 - 0.06 * Math.max(0, MT())));
                if (z.stunT > 0) { z.stunT -= step; z.slow = Math.min(z.slow, 0.05); z.cdm = 1.9; z.vulnOn = true; if (z.stunT <= 0) { z.vulnOn = false; z.cdm = 0.75; } return; }
                z.cdm = 0.75; z.vulnOn = false; z.heat = (z.heat || 0) + step * 1000 / cycle * e;
                if (z.heat >= 1000 && !z.venting) {   // OVERHEAT: it flashes, then vents. The vent leaves it stunned and cracked open: spend everything now
                    z.venting = true; flashFor(z, 80); popSync(z.x, z.y - 60, 'VENTING!'); fx('ring', z.x, z.y, 160, 80, 2);
                    later(80, () => {
                        if (z.dead) return; z.venting = false; z.heat = 0; z.stunT = 250; g.shake = Math.max(g.shake, 14);
                        ringB(z.x, z.y, { max: 540, sp: 6, w: 14, dmg: 24 + wv() * 0.5, gw: 0.42, ga: Math.atan2(nearestLive(z.x, z.y).y - z.y, nearestLive(z.x, z.y).x - z.x) });
                        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; zone('fire', z.x + Math.cos(a) * 110, z.y + Math.sin(a) * 110, 40, 220, 0.25, 40); }
                        g.banner = { text: 'OVERHEATED', sub: 'Armor open. Hit it!', life: 140 };
                    });
                }
                if (z.venting) { z.slow = Math.min(z.slow, 0.1); return; }
                z.m1 = (z.m1 ?? 240) - step * e;
                if (z.m1 <= 0) {   // MAGMA GEYSERS: circles, then pools of fire where they went off
                    z.m1 = Math.max(260, 440 - ph * 40 - hl * 6); flashFor(z, 24); popSync(z.x, z.y - 60, 'GEYSERS');
                    for (let i = 0; i < 3 + ph + np() + 2 * Math.max(0, MT() - 1) + (MT() === 1 ? 1 : 0); i++) { const t = rndTarget(), x = t.x + (rnd() - .5) * 140, y = t.y + (rnd() - .5) * 140; tele(x, y, 46, 64, 24 + wv() * 0.55); later(64, () => { if (!z.dead) zone('fire', x, y, 46, 190, 0.26); }); }
                }
                z.m2 = (z.m2 ?? 360) - step * e;
                if (z.m2 <= 0) {   // MAGMA BOMBS: a ring of blasts around the Titan itself, then it lunges
                    z.m2 = Math.max(430, 640 - ph * 50); popSync(z.x, z.y - 60, 'MAGMA RING'); const R = 96, n = 7;
                    for (let i = 0; i < n; i++) tele(z.x + Math.cos(i / n * TAU) * R, z.y + Math.sin(i / n * TAU) * R, 40, 56, 22 + wv() * 0.5);
                    tele(z.x, z.y, 56, 56, 26 + wv() * 0.5);
                }
            }
        };
        T.b_frost = Object.assign({ id: 'b_frost', pick: false, cash: 1 }, boss_frost); T.b_lich = Object.assign({ id: 'b_lich', pick: false, cash: 1 }, boss_lich); T.b_titan = Object.assign({ id: 'b_titan', pick: false, cash: 1 }, boss_titan);
        C.boss = guard('boss', (z, step, ph, hl) => {
            if (z.cai && !z.cin) initZ(z);
            const B = BT(); if (!z.cbt) { z.cbt = 1; z.spd *= B.sp; }
            const e = z.cxe ? 1.35 : 1, pe = B.mt >= 3 ? Math.min(3, ph + 1) : ph;   // top tier: every pattern unlocks a phase early
            bossEnrage(z, ph, hl);
            const o = inBoss; inBoss = true;
            try {
                if (z.bossKind === 'hive') bossHive(z, step, pe, hl, e);
                else if (z.bossKind === 'brood') bossBrood(z, step, pe, hl, e);
                else if (z.bossKind === 'jug') bossJug(z, step, pe, hl, e);
                else { const t = T[z.cai]; if (t && t.step) t.step(z, step, pe, hl, e); }
            } finally { inBoss = o; }
        });

        // ============================================================== ARENA OBJECTS (zones, projectiles, markers) + their sync
        const objectsTick = () => {
            const w = g.cxw; if (!w) return;
            const tk = g.tick, tg = liveTargets();
            for (let i = w.zones.length - 1; i >= 0; i--) {
                const q = w.zones[i]; if (--q.t <= 0) { w.zones.splice(i, 1); continue; }
                if (tk < q.arm) continue;
                for (const t of tg) {
                    if (Math.hypot(t.x - q.x, t.y - q.y) >= q.r + 6) continue;
                    if (q.k === 'frost') { if (t === g.player) g.slowT = Math.max(g.slowT || 0, 4); if (q.dps > 0.05 && tk % 6 === 0) hitT(t, q.dps * 6); }
                    else hitT(t, q.dps * dfd());
                }
            }
            for (let i = w.proj.length - 1; i >= 0; i--) {
                const q = w.proj[i];
                if (q.k === 'gren') { if (++q.t >= q.max) w.proj.splice(i, 1); continue; }
                q.x += q.vx; q.y += q.vy;
                let hit = false;
                for (const t of tg) if (Math.hypot(t.x - q.x, t.y - q.y) < 14) { hitT(t, q.dmg); if (t === g.player) g.slowT = Math.max(g.slowT || 0, 70); zone('frost', q.x, q.y, 36, 220, 0, 0); burst(q.x, q.y, '#cfeaff', 6, 2); hit = true; break; }
                if (hit || --q.life <= 0 || q.x < -20 || q.x > 820 || q.y < -20 || q.y > 620) w.proj.splice(i, 1);
            }
            for (let i = w.corpses.length - 1; i >= 0; i--) if (--w.corpses[i].t <= 0) w.corpses.splice(i, 1);
            for (let i = w.fx.length - 1; i >= 0; i--) if (--w.fx[i].t <= 0) w.fx.splice(i, 1);
        };
        C.snap = guard('snap', () => {
            const w = g.cxw; if (!w || !(w.zones.length + w.proj.length + w.corpses.length + w.fx.length)) return 0;
            return {
                z: w.zones.slice(0, 60).map((q) => [Math.max(0, ZK.indexOf(q.k)), r1(q.x), r1(q.y), q.r, q.t, Math.max(0, q.arm - g.tick)]),
                p: w.proj.slice(0, 40).map((q) => q.k === 'gren' ? [1, r1(q.x0), r1(q.y0), r1(q.x1), r1(q.y1), q.t, q.max] : [0, r1(q.x), r1(q.y), +q.vx.toFixed(1), +q.vy.toFixed(1)]),
                c: w.corpses.slice(0, 24).map((q) => [r1(q.x), r1(q.y), q.t]),
                f: w.fx.slice(0, 40).map((q) => [Math.max(0, FXK.indexOf(q.k)), r1(q.x), r1(q.y), r1(q.r), q.t, q.max, q.c, +q.a.toFixed(2)])
            };
        }, 0);
        C.applySnap = guard('applySnap', (d) => {
            if (!d) { g.cxw = null; return; }
            g.cxw = {
                zones: (d.z || []).map((a) => ({ k: ZK[a[0]] || 'frost', x: a[1], y: a[2], r: a[3], t: a[4], max: Math.max(a[4], 60), arm: g.tick + a[5] })),
                proj: (d.p || []).map((a) => a[0] === 1 ? { k: 'gren', x0: a[1], y0: a[2], x1: a[3], y1: a[4], t: a[5], max: a[6] } : { k: 'ice', x: a[1], y: a[2], vx: a[3], vy: a[4] }),
                corpses: (d.c || []).map((a) => ({ x: a[0], y: a[1], t: a[2] })),
                fx: (d.f || []).map((a) => ({ k: FXK[a[0]] || 'ring', x: a[1], y: a[2], r: a[3], t: a[4], max: a[5], c: a[6], a: a[7] }))
            };
        });

        // ============================================================== DRAWING (host and guests share all of it)
        const dashCircle = (x, y, r, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w || 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); };
        C.drawUnder = guard('drawUnder', () => {
            const w = g.cxw; if (!w) return;
            const t = performance.now() / 1000;
            for (const q of w.zones) {
                const warm = q.arm - g.tick, a = Math.min(1, q.t / 40);
                if (warm > 0) { dashCircle(q.x, q.y, q.r, q.k === 'frost' ? 'rgba(160,215,255,.9)' : (q.k === 'fire' ? 'rgba(255,140,50,.9)' : 'rgba(140,220,70,.9)'), 2); continue; }
                if (q.k === 'frost') {
                    ctx.fillStyle = `rgba(150,205,255,${0.2 * a + 0.04 * Math.sin(t * 4 + q.x)})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
                    ctx.strokeStyle = `rgba(215,240,255,${0.8 * a})`; ctx.lineWidth = 2; ctx.stroke();
                    ctx.strokeStyle = `rgba(215,240,255,${0.35 * a})`; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + 0.3; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + Math.cos(an) * q.r * 0.85, q.y + Math.sin(an) * q.r * 0.85); ctx.stroke(); }
                } else if (q.k === 'fire') {
                    ctx.fillStyle = `rgba(255,${100 + 50 * Math.sin(t * 9 + q.y)},30,${0.28 * a})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
                    ctx.strokeStyle = `rgba(255,170,60,${0.85 * a})`; ctx.lineWidth = 2; ctx.stroke();
                    ctx.fillStyle = `rgba(255,220,90,${0.6 * a})`; for (let i = 0; i < 3; i++) ctx.fillRect(q.x + Math.cos(i * 2.1 + t * 2) * q.r * 0.5 - 2, q.y + Math.sin(i * 1.7 + t * 3) * q.r * 0.4 - 2 - ((t * 20 + i * 9) % 10), 4, 4);
                } else {
                    ctx.fillStyle = `rgba(120,200,40,${(0.24 + 0.06 * Math.sin(t * 5 + q.x)) * a})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
                    ctx.strokeStyle = `rgba(175,230,90,${0.85 * a})`; ctx.lineWidth = 2; ctx.stroke();
                    ctx.fillStyle = `rgba(190,240,110,${0.5 * a})`; for (let i = 0; i < 4; i++) { const yy = ((t * 14 + i * 13) % 30); ctx.beginPath(); ctx.arc(q.x + Math.cos(i * 1.9) * q.r * 0.55, q.y + Math.sin(i * 2.3) * q.r * 0.4 - yy * 0.5, 2.5, 0, TAU); ctx.fill(); }
                }
            }
            for (const q of w.corpses) {   // necromancer's marked dead: kill the necromancer, burn them, or blow them up
                const p = 0.6 + 0.4 * Math.sin(t * 6 + q.x);
                ctx.strokeStyle = `rgba(106,255,138,${0.7 * p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, 11 + 2 * p, 0, TAU); ctx.stroke();
                ctx.fillStyle = `rgba(106,255,138,${0.5 * p})`; ctx.fillRect(q.x - 1, q.y - 6, 2, 12); ctx.fillRect(q.x - 5, q.y - 2, 10, 2);
            }
            for (const q of w.fx) {
                const k = q.t / q.max, col = FXC[q.c] || '#fff';
                ctx.globalAlpha = Math.min(1, k * 2); ctx.strokeStyle = col;
                if (q.k === 'line') { ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + Math.cos(q.a) * q.r, q.y + Math.sin(q.a) * q.r); ctx.stroke(); ctx.setLineDash([]); }
                else { ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.45 + 0.55 * (1 - k * 0.0) ), 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(2, q.r * (1 - k)), 0, TAU); ctx.stroke(); }
                ctx.globalAlpha = 1;
            }
        });
        C.draw = guard('draw', () => {
            const w = g.cxw; if (!w) return;
            for (const q of w.proj) {
                if (q.k === 'gren') {
                    const k = clamp(q.t / q.max, 0, 1), x = q.x0 + (q.x1 - q.x0) * k, y = q.y0 + (q.y1 - q.y0) * k - Math.sin(k * Math.PI) * 70;
                    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(q.x0 + (q.x1 - q.x0) * k, q.y0 + (q.y1 - q.y0) * k, 6, 3, 0, 0, TAU); ctx.fill();
                    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = (g.tick % 8 < 4) ? '#ff4d4d' : '#ffd23a'; ctx.fillRect(x - 1, y - 9, 3, 4);
                } else {
                    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.atan2(q.vy, q.vx)); ctx.shadowColor = '#9fd8ff'; ctx.shadowBlur = 8;
                    ctx.fillStyle = '#d8f0ff'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -4); ctx.lineTo(-2, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.restore();
                }
            }
        });
        // under-sprite telegraphs
        C.preZ = guard('preZ', (z) => {
            const s = z.spr, tk = g.tick;
            if (z.boss && (z.cx & 4) ) { /* frost shield bubble is in postZ */ }
            if (s === 'brute' && z.state === 'hwind') {
                ctx.save(); ctx.strokeStyle = 'rgba(255,90,60,.22)'; ctx.lineWidth = z.size * 1.8; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.ax, z.ay); ctx.stroke();
                ctx.strokeStyle = 'rgba(255,90,60,.8)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); const nx = -(z.ay - z.y), ny = z.ax - z.x, l = Math.hypot(nx, ny) || 1, ox = nx / l * z.size * 0.9, oy = ny / l * z.size * 0.9;
                ctx.beginPath(); ctx.moveTo(z.x + ox, z.y + oy); ctx.lineTo(z.ax + ox, z.ay + oy); ctx.moveTo(z.x - ox, z.y - oy); ctx.lineTo(z.ax - ox, z.ay - oy); ctx.stroke(); ctx.restore();
            } else if ((s === 'frostling' || s === 'totem') && z.state === 'aim') {
                ctx.strokeStyle = 'rgba(160,215,255,.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.x + (z.ax - z.x) * 1.5, z.y + (z.ay - z.y) * 1.5); ctx.stroke(); ctx.setLineDash([]);
            } else if (s === 'necro' && z.state === 'raise') {
                ctx.strokeStyle = 'rgba(106,255,138,.85)'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.ax, z.ay); ctx.stroke(); ctx.setLineDash([]);
                ctx.beginPath(); ctx.arc(z.ax, z.ay, 14 + 5 * Math.sin(tk * 0.4), 0, TAU); ctx.stroke();
            } else if (s === 'screamer') {
                const wide = z.hp / z.max < 0.5;
                ctx.strokeStyle = `rgba(240,120,200,${0.35 + 0.15 * Math.sin(tk * 0.15)})`; ctx.lineWidth = 2; ctx.setLineDash([4, 8]); ctx.beginPath(); ctx.arc(z.x, z.y, 150 + 6 * Math.sin(tk * 0.12), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                if (wide) { ctx.strokeStyle = 'rgba(255,90,90,.25)'; ctx.beginPath(); ctx.arc(z.x, z.y, 170, 0, TAU); ctx.stroke(); }
            } else if (s === 'magnet' && (z.state === 'hwind' || z.state === 'pull')) {
                const k = (tk % 30) / 30;
                for (let i = 0; i < 3; i++) { const r = 300 * (1 - ((k + i / 3) % 1)); ctx.strokeStyle = `rgba(210,80,70,${0.5 * (1 - r / 300)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(z.x, z.y, Math.max(8, r), 0, TAU); ctx.stroke(); }
                if (z.state === 'pull') { const p = g.player; ctx.strokeStyle = 'rgba(120,140,255,.55)'; ctx.lineWidth = 3; ctx.setLineDash([4, 8]); ctx.lineDashOffset = -tk; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(z.x, z.y); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
            } else if (s === 'sniper' && z.state === 'aim') {
                ctx.strokeStyle = 'rgba(255,60,60,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.ax || z.x, z.ay || z.y); ctx.stroke();
            } else if (s === 'bossF' && (z.cx >> 4) >= 85) {
                ctx.strokeStyle = `rgba(255,${120 + 80 * Math.sin(tk * 0.5)},40,.6)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(z.x, z.y, z.size * 1.5 + 4 * Math.sin(tk * 0.4), 0, TAU); ctx.stroke();
            }
        });
        // over-sprite overlays: shields, flames, stuns, auras
        C.postZ = guard('postZ', (z) => {
            const s = z.spr, tk = g.tick, fl = (z.cx | 0) & 15, ex = (z.cx | 0) >> 4, h = z.sc * 12;
            if (s === 'riot') {
                const a = ex * 2 / 57.3, R = z.size * 1.25, hit = z.cblk > tk;
                ctx.save(); ctx.translate(z.x, z.y); ctx.lineCap = 'round';
                ctx.strokeStyle = '#2a323a'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, R, a - 1.0, a + 1.0); ctx.stroke();
                ctx.strokeStyle = hit ? '#ffffff' : '#9aa8b6'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R, a - 0.95, a + 0.95); ctx.stroke();
                ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R, a - 0.3, a + 0.3); ctx.stroke(); ctx.restore();
            }
            if (s === 'brute' && z.state === 'stun') { for (let i = 0; i < 3; i++) { const an = tk * 0.1 + i * 2.1; ctx.fillStyle = '#ffd23a'; ctx.fillRect(z.x + Math.cos(an) * 16 - 2, z.y - h / 2 - 4 + Math.sin(an) * 4, 4, 4); } }
            if (s === 'bloater' && z.hp / z.max < 0.35) { ctx.strokeStyle = `rgba(190,240,90,${0.4 + 0.4 * Math.sin(tk * 0.4)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(z.x, z.y, z.size * 1.1, 0, TAU); ctx.stroke(); }
            if (s === 'egg') {
                const hl_ = ex * 10; if (hl_ < 70) { ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(z.x - 6, z.y - 8); ctx.lineTo(z.x, z.y - 1); ctx.lineTo(z.x - 3, z.y + 4); ctx.lineTo(z.x + 5, z.y + 9); ctx.stroke(); }
                ctx.fillStyle = '#ffd23a'; ctx.fillRect(z.x - 10, z.y + 20, Math.min(20, hl_ / 10), 3);
            }
            if (z.boss && (fl & 4)) {   // frost warden's ice shield
                ctx.strokeStyle = `rgba(190,230,255,${0.6 + 0.2 * Math.sin(tk * 0.2)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(z.x, z.y, z.size * 1.25, 0, TAU); ctx.stroke();
                ctx.fillStyle = 'rgba(160,210,255,.14)'; ctx.fill();
            }
            if (z.boss && (fl & 8)) { ctx.fillStyle = `rgba(255,220,120,${0.15 + 0.12 * Math.sin(tk * 0.5)})`; ctx.beginPath(); ctx.arc(z.x, z.y, z.size * 1.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffe27a'; ctx.font = '12px "Special Elite", monospace'; ctx.textAlign = 'center'; ctx.fillText('VULNERABLE', z.x, z.y + z.size * 1.4); ctx.textAlign = 'left'; }
            if (z.boss && s === 'bossF') { const heat = ex / 100; ctx.fillStyle = '#000'; ctx.fillRect(z.x - 30, z.y + h / 2 + 4, 60, 5); ctx.fillStyle = heat > 0.85 ? '#ffe04a' : '#ff7a1a'; ctx.fillRect(z.x - 29, z.y + h / 2 + 5, 58 * clamp(heat, 0, 1), 3); }
            if (fl & 1) { for (let i = 0; i < 3; i++) { const fx_ = z.x - 6 + i * 6 + Math.sin(tk * 0.4 + i * 2 + z.seed) * 2, fy = z.y - h / 2 + 2 - ((tk * 0.8 + i * 5) % 10); ctx.fillStyle = i === 1 ? '#ffe04a' : '#ff7a1a'; ctx.fillRect(fx_, fy, 3, 4); } }
            if ((fl & 2) && !z.boss) { ctx.strokeStyle = 'rgba(160,215,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(z.x, z.y + z.size * 0.45, z.size * 0.75, z.size * 0.3, 0, 0, TAU); ctx.stroke(); }
        });

        // ============================================================== PERKS
                const VAR = { rust: 'var(--rust)', steel: 'var(--steel)', blood: 'var(--blood)', mustard: 'var(--mustard)', olive: 'var(--olive)', violet: 'var(--violet,#a58bc2)' };
        const P = (id, rarity, max, icon, name, desc, color, fn, ok) => { UPGRADES[id] = { icon: 'c_' + icon, name, desc, max, rarity, color: VAR[color] || color, fn: fn || (() => addPk(id)) }; if (ok) UPGRADES[id].ok = ok; };
        // --- offense and synergy
        P('wildfire', 'rare', 3, 'wildfire', 'Wildfire', 'Fire weapons ignite everything; other hits sometimes do (10% a level). Burning zombies take damage over time and spread the fire when they die.', 'rust');
        P('shatter', 'rare', 3, 'shatter', 'Shatterfreeze', 'Hits sometimes chill. Any slowed zombie that dies SHATTERS, blasting and slowing its neighbours. Pairs with Frost Touch and Shock Aura.', 'steel');
        P('overdrive', 'epic', 2, 'overdrive', 'Overdrive', 'A 12+ kill combo kicks you into overdrive: +25% damage a level and a speed boost until the combo drops.', 'blood');
        P('minepulse', 'rare', 3, 'minepulse', 'Voltaic Mines', 'Every mine on the ground pulses, hurting zombies that stand near it. Lay a minefield, then kite through it.', 'mustard');
        P('vampmine', 'epic', 2, 'vampmine', 'Vampiric Mines', 'Whenever a mine goes off you heal, a little more per level.', 'blood');
        P('thorns', 'rare', 3, 'thorns', 'Thorns', 'When something hurts you, everything near you is hurt right back.', 'olive');
        P('demo', 'rare', 3, 'demo', 'Demolitionist', 'Mines (existing and new) hit 25% harder per level and blast a little wider.', 'rust');
        P('orbitm', 'rare', 3, 'orbitm', 'Orbit Master', 'Orbiting and satellite weapons deal +25% damage per level.', 'steel');
        P('conduct', 'rare', 3, 'conduct', 'Conductor', 'Chain and lightning weapons deal +25% damage per level. Chain Reaction blasts reach further.', 'mustard');
        P('steady', 'rare', 3, 'steady', 'Steady Hand', 'Hold-to-fire weapons (Water Cannon, Spoon Railgun) deal +35% damage per level.', 'steel');
        P('slayer', 'rare', 3, 'slayer', 'Giant Slayer', '+35% damage per level to bosses, elites and anything big.', 'blood');
        P('longshot', 'common', 4, 'longshot', 'Long Shot', '+12% damage per level to zombies far from you. Kite and punish.', 'olive');
        P('mob', 'common', 4, 'mob', 'Mob Justice', '+3% damage per level for every zombie close to you (up to 12).', 'rust');
        P('storm', 'epic', 2, 'storm', 'Stormcaller', 'Lightning strikes a random zombie every few seconds. Faster each level.', 'mustard');
        P('reaper', 'epic', 2, 'reaper', 'Soul Reaper', 'Every 6th kill releases a soul nova that hurts nearby zombies and heals you.', 'violet');
        // --- economy and utility
        P('scraphound', 'common', 4, 'scraphound', 'Scrap Hound', 'Scrap pickups fly to you from far away, and kills sometimes drop one.', 'mustard');
        P('reach', 'common', 4, 'reach', 'Wide Pockets', 'You pick pickups up from a much larger radius.', 'olive');
        P('bounty', 'rare', 3, 'bounty', 'Bounty Hunter', 'Special zombies (not the plain ones) pay +40% cash per level, and sometimes drop scrap.', 'mustard');
        P('quickdraw', 'rare', 3, 'quickdraw', 'Quickdraw', 'Every kill shaves time off all your weapon cooldowns.', 'steel');
        P('medic', 'common', 3, 'medic', 'Field Medic', 'Heal 10% of max HP per level at the start of every wave, for the whole squad.', 'olive');
        // --- defence
        P('counter', 'rare', 3, 'counter', 'Counterstrike', 'Parry window lasts longer and recharges faster (Big Spoon).', 'steel', () => { addPk('counter'); g.parryBonus = (g.parryBonus || 0) + 1; });
        P('nano', 'common', 4, 'nano', 'Nano-Weave', 'After a few quiet seconds your health knits itself back together.', 'olive');
        P('brace', 'rare', 3, 'brace', 'Adrenal Brace', 'Getting hit triggers a burst: 1.5 seconds of speed and 35% less damage. Short cooldown.', 'mustard');
        // --- cursed: real upside, real cost
        P('blood', 'cursed', 2, 'blood', 'Blood Pact', '+50% damage per level, but your life slowly drains (never below a sliver). Kills heal a little.', '#c0392b');
        P('hexcoin', 'cursed', 2, 'hexcoin', 'Hexed Coins', 'Kills pay +60% cash per level, but every zombie moves 8% faster per level.', '#c0392b', () => { addPk('hexcoin'); g.cashMul += 0.6; });
        P('fever', 'cursed', 2, 'fever', 'Fevered Horde', 'Zombies get +15% health per level; drops and cash go up 25% per level.', '#c0392b', () => { addPk('fever'); g.cashMul += 0.25; g.dropBonus = (g.dropBonus || 0) + 0.04; });
        P('feather', 'cursed', 2, 'feather', 'Featherweight', '+2 speed patches per level, but -25% max HP per level.', '#c0392b', () => { addPk('feather'); g.speedLvl += 2; const cut = Math.max(0, Math.min(Math.round(g.baseMaxHp * 0.25), g.baseMaxHp - 40)); g.baseMaxHp -= cut; const f = (pl) => { pl.maxHp -= cut; pl.hp = Math.min(pl.hp, pl.maxHp); }; f(g.player); g.peers.forEach((pe) => f(pe.pl)); });
        P('overcharge', 'cursed', 2, 'overcharge', 'Overcharge', 'Weapons fire 22% faster per level, but you take 25% more damage per level.', '#c0392b', () => { addPk('overcharge'); g.cdMul *= 0.78; g.dmgTaken = (g.dmgTaken || 1) * 1.25; });
        // --- legendary
        P('solar', 'legendary', 1, 'solar', 'Solar Core', '+20% damage. EVERY hit ignites, and burning zombies explode when they die.', 'mustard');
        P('chrono', 'legendary', 1, 'chrono', 'Chrono Anchor', 'Every 25 seconds time stops for 3 seconds. Everything freezes but you.', '#a58bc2');

        const RMAP = { common: ['Common', '#9aa87a'], rare: ['Rare', '#7f9aa6'], epic: ['Epic', '#a58bc2'], legendary: ['Legendary', '#d9a441'], cursed: ['Cursed', '#c0392b'], utility: ['Utility', '#8aa04a'] };
        const rarityOf = (u) => u.rarity || (u.max === 99 ? 'utility' : u.max === 1 ? 'legendary' : u.max === 2 ? 'epic' : u.max === 3 ? 'rare' : 'common');
        C.rar = (u) => RMAP[rarityOf(u)];
        const WTS = { common: 100, rare: 55, epic: 24, legendary: 8, cursed: 16, utility: 22 };
        C.offer = guard('offer', (ids, cur, exclude) => {
            const pool = ids.filter((id) => UPGRADES[id] && !(exclude && exclude.includes(id)));
            if (pool.length < 3) return cur;
            const pick = (arr) => { let tot = 0; arr.forEach((id) => { tot += WTS[rarityOf(UPGRADES[id])] || 40; }); let r = rnd() * tot; for (const id of arr) { r -= WTS[rarityOf(UPGRADES[id])] || 40; if (r < 0) return id; } return arr[0]; };
            const out = [], left = pool.slice();
            while (out.length < 3 && left.length) { const id = pick(left); out.push(id); left.splice(left.indexOf(id), 1); }
            const epicPlus = (id) => { const r = rarityOf(UPGRADES[id]); return r === 'epic' || r === 'legendary'; };
            if (g.wave > 0 && g.wave % 10 === 0 && !out.some(epicPlus)) {   // boss clears always offer something big
                const big = left.filter(epicPlus); if (big.length) out[out.length - 1] = pick(big);
            }
            return out;
        }, (ids, cur) => cur);

        // --- perk effect hooks
        const FIREISH = { FIRE: 1, F_NAPALM: 1, MINES: 0, GRAV: 1, MISL: 1, F_TEMPEST: 0, THUN: 1, F_SOLAR: 1 };
        const isOrbit = (s) => /ORB|SAT|SKYBLADE/.test(s), isChain = (s) => /^ARC|TEMPEST|THUN|ZAP/.test(s);
        const isHold = (s) => s === 'HOSE' || s === 'SHIELD' || !!(WEAPON_DATA[s] && WEAPON_DATA[s].hold);
        const hasRel = (id) => !!(g.cxs && g.cxs.rel[id]);
        C.onHurt = guard('onHurt', (z, dmg) => {
            if (!(dmg > 0)) return dmg;
            const S = st(), src = g.src || '', pk = g.pk || {};
            let m = 1;
            const od = pk.overdrive; if (od && g.combo.n >= 12) m *= 1 + 0.25 * od;
            if (pk.blood) m *= 1 + 0.5 * pk.blood;
            if (pk.solar) m *= 1.2;
            if (hasRel('eye')) m *= 1.15 * ((z.boss || z.elite) ? 1.5 : 1);
            if (pk.slayer && (z.boss || z.elite || z.max > 700)) m *= 1 + 0.35 * pk.slayer;
            if (pk.longshot) { const d = Math.hypot(g.player.x - z.x, g.player.y - z.y); if (d > 260) m *= 1 + 0.12 * pk.longshot; }
            if (pk.mob) { let n = 0; const p = g.player; for (const o of g.zombies) if (!o.dead && Math.abs(o.x - p.x) < 140 && Math.abs(o.y - p.y) < 140 && Math.hypot(o.x - p.x, o.y - p.y) < 140) n++; m *= 1 + 0.03 * pk.mob * Math.min(12, n); }
            if (pk.orbitm && isOrbit(src)) m *= 1 + 0.25 * pk.orbitm;
            if (pk.conduct && isChain(src)) m *= 1 + 0.25 * pk.conduct;
            if (pk.steady && isHold(src)) m *= 1 + 0.35 * pk.steady;
            if (z.cdm) m *= z.cdm;
            if (z.vul) m *= z.vul;
            if (z.spr === 'riot' && src !== 'BURN' && !C.inBlast && live(z)) {   // frontal shield: flank it, burn it or blow it up
                const tg = nearestLive(z.x, z.y), a = Math.atan2(tg.y - z.y, tg.x - z.x);
                if (angDiff(a, z.fa || 0) < 1.15) { m *= 0.18; z.cblk = g.tick + 6; if (g.pops.length < 40 && g.tick % 9 === 0) g.pops.push({ x: z.x, y: z.y - 24, txt: 'BLOCKED', life: 22 }); }
            }
            if (!S.inFx) {
                const wf = pk.wildfire || 0;
                if (src !== 'BURN') {
                    if (pk.solar || hasRel('ember') || (wf && (FIREISH[src] || rnd() < 0.1 * wf))) ignite(z, 180);
                    const sh = pk.shatter || 0; if (sh && rnd() < 0.08 * sh) z.slow = Math.min(z.slow, 0.55);
                    if (hasRel('frozen') && rnd() < 0.08) z.slow = Math.min(z.slow, 0.55);
                }
            }
            if (hasRel('scythe') && !z.boss && z.hp / z.max < 0.12) z.hp = Math.min(z.hp, dmg * m * 0.5);
            return dmg * m;
        }, (z, d) => d);
        const cashPop = (z, n) => { g.cash += n; g.earned += n; };
        C.onKill = guard('onKill', (z) => {
            const S = st(), pk = g.pk || {}, p = g.player;
            if (!z.cin && z.cai) initZ(z);
            if (S.depth > 2) return; S.depth++;
            try {
                const t = T[z.cai]; if (t && t.die) t.die(z);
                if (z.boss) {   // minions vanish with their master
                    for (const o of g.zombies) if (o.pid === z.id && !o.dead) { o.dead = true; burst(o.x, o.y, o.color || '#fff', 8, 3); }
                    if (z.cai === 'b_frost' || z.cai === 'b_lich') W().zones.length = 0;
                }
                // necromancer corpses
                if (!z.boss && !z.rev && !z.noDrop && !(z.cb > 0) && !C.inBlast && z.cai !== 'crawler' && z.cai !== 'egg' && z.cai !== 'totem' && z.cai !== 'bloater') {
                    if (g.zombies.some((o) => !o.dead && o !== z && (o.cai === 'necro' || o.bossKind === 'lich'))) { const w = W(); if (w.corpses.length < 24) w.corpses.push({ x: z.x, y: z.y, t: 420, type: z.type }); }
                }
                // perks
                if (z.cb > 0) {   // fire spreads
                    const wf = pk.wildfire || 0, R = 55 + 16 * wf;
                    if (wf || pk.solar || hasRel('ember')) for (const o of g.zombies) if (live(o) && o !== z && Math.hypot(o.x - z.x, o.y - z.y) < R) ignite(o, 150 + 30 * wf);
                    if (pk.solar) aoe(z.x, z.y, 62, (30 + wv() * 1.5) * dmgMul(), 'BURN');
                    if (z.cai === 'bloater') zone('fire', z.x, z.y, 60, 200, 0.25);
                }
                const sh = pk.shatter || 0;
                if (sh && z.slow < 0.75 && !z.boss) { const R = 52 + 10 * sh; fx('ring', z.x, z.y, R, 14, 1); g.vfx.push({ x: z.x, y: z.y, r: 0, max: R, a: 1 }); aoe(z.x, z.y, R, (28 * sh + wv() * 1.2) * dmgMul(), 'SHATTER'); for (const o of g.zombies) if (live(o) && !o.boss && Math.hypot(o.x - z.x, o.y - z.y) < R + 10) o.slow = Math.min(o.slow, 0.4); }
                if (pk.reaper && ++S.rk >= 6) { S.rk = 0; const R = 80 + 12 * pk.reaper; fx('ring', z.x, z.y, R, 18, 0); g.vfx.push({ x: z.x, y: z.y, r: 0, max: R, a: 1 }); aoe(z.x, z.y, R, (42 + wv() * 2) * pk.reaper * dmgMul(), 'REAPER'); healAll(3 + 2 * pk.reaper); }
                if (pk.quickdraw) for (const k of ['O', 'P', 'L']) if (g.cooldowns[k] > 0) g.cooldowns[k] = Math.max(0, g.cooldowns[k] - 140 * pk.quickdraw);
                if (pk.blood) p.hp = Math.min(p.maxHp, p.hp + 1.5);
                if (hasRel('fang')) p.hp = Math.min(p.maxHp, p.hp + 2);
                if (hasRel('scythe')) p.hp = Math.min(p.maxHp, p.hp + 1);
                if (pk.bounty && z.type !== 'standard' && z.type !== 'splitling' && z.type !== 'crawler' && !z.noDrop) { cashPop(z, Math.round(30 * 0.4 * pk.bounty * (z.cashMul || 1) * g.cashMul)); if (rnd() < 0.04 * pk.bounty) { g.scraps += 1; popSync(z.x, z.y - 30, '+1 scrap'); } }
                if (pk.scraphound && !z.noDrop && rnd() < 0.03 * pk.scraphound && g.pickups.length < 40) g.pickups.push({ x: clamp(z.x, 30, 770), y: clamp(z.y, 30, 570), kind: 'SCRAP', born: g.tick, life: 900 });
                if (hasRel('idol') && !z.noDrop && rnd() < 0.05 && g.pickups.length < 40) dropPickup(z, true);
            } finally { S.depth--; }
        });
        C.onHit = guard('onHit', (d) => {
            const S = st(), pk = g.pk || {};
            if (d > 0.5 && hasRel('crest') && S.crT <= 0) { S.crT = 600; g.vfx.push({ x: g.player.x, y: g.player.y, r: 0, max: 44, a: 1 }); popSync(g.player.x, g.player.y - 34, 'CREST'); return 0; }
            if (S.brOn > 0) d *= 0.65;
            if (d > 0.5) {
                S.lh = g.tick;
                if (pk.brace && S.brT <= 0) { S.brT = 400 - 60 * pk.brace; S.brOn = 90; }
                if (pk.thorns && g.tick - (S.thT || -99) > 25) {
                    S.thT = g.tick; const p = g.player, R = 76, dm = (24 + wv() * 1.4) * pk.thorns * dmgMul(); g.vfx.push({ x: p.x, y: p.y, r: 0, max: R, a: 1 });
                    const o = g.src; g.src = 'THORNS'; for (const z of g.zombies) if (live(z) && Math.hypot(z.x - p.x, z.y - p.y) < R + z.size) hurt(z, dm); g.src = o;
                }
            }
            return d;
        }, (d) => d);

        // ============================================================== RELICS (free pick every 5th wave) + TRADER ITEMS
        const RELICS = {
            ember: { icon: 'c_ember', name: 'Ember Heart', desc: 'Every hit sets zombies on fire.' },
            frozen: { icon: 'c_frozen', name: 'Frozen Core', desc: 'All zombies are 12% slower and your hits often chill.', fn: () => { } },
            titan: { icon: 'c_titan', name: "Titan's Belt", desc: '+60 max HP and 10% less damage taken.', fn: () => { g.baseMaxHp += 60; g.player.maxHp += 60; g.player.hp += 60; g.peers.forEach((pe) => { pe.pl.maxHp += 60; pe.pl.hp += 60; }); g.dmgTaken = (g.dmgTaken || 1) * 0.9; } },
            idol: { icon: 'c_idol', name: "Gambler's Idol", desc: '+50% cash from kills and extra pickup drops.', fn: () => { g.cashMul += 0.5; g.dropBonus = (g.dropBonus || 0) + 0.06; } },
            siege: { icon: 'c_siege', name: 'Siege Engine', desc: 'Mines hit 60% harder and wider, and a free mine drops every 8 seconds.', fn: () => { } },
            eye: { icon: 'c_eye', name: "Hunter's Eye", desc: '+15% damage, +50% more against bosses and elites.' },
            chrono: { icon: 'c_chrono', name: 'Chrono Gear', desc: 'Weapons fire 15% faster and you get +1 speed patch.', fn: () => { g.cdMul *= 0.85; g.speedLvl++; } },
            scythe: { icon: 'c_reaper', name: "Reaper's Scythe", desc: 'Nearly-dead zombies die instantly; every kill heals 1.', fn: () => { } },
            totem: { icon: 'c_totemr', name: 'Storm Totem', desc: 'Lightning strikes the horde every 2 seconds.', fn: () => { } },
            crest: { icon: 'c_crest', name: 'Bulwark Crest', desc: 'Negates one hit every 10 seconds.', fn: () => { } },
            fang: { icon: 'c_fang', name: 'Vampiric Fang', desc: 'Every kill heals 2.', fn: () => { } },
            vault: { icon: 'c_vault', name: 'Bottomless Pockets', desc: 'Huge pickup radius and +1 scrap whenever you clear a wave.', fn: () => { } }
        };
        C.relics = RELICS;
        window.CONTENT_relic = (id) => {
            try {
                const S = st(); if (!g.paused || MP.role === 'guest' || g.wave % 5 !== 0 || S.relPicked[g.wave] || !RELICS[id] || !(S.relOffer[g.wave] || []).includes(id)) return;
                S.relPicked[g.wave] = id; S.rel[id] = 1; if (RELICS[id].fn) RELICS[id].fn();
                toast('Relic: ' + RELICS[id].name); renderTrader();
            } catch (e) { console.warn('[content] relic', e); }
        };
        const relicPanel = () => {
            const S = st(); if (!S.relOffer[g.wave]) { const pool = Object.keys(RELICS).filter((id) => !S.rel[id]); for (let i = pool.length - 1; i > 0; i--) { const j = rnd() * (i + 1) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; } S.relOffer[g.wave] = pool.slice(0, 3); }
            const picked = S.relPicked[g.wave], offer = S.relOffer[g.wave]; if (!offer.length && !picked) return '';
            return `<div class="ru-panel trader" style="margin-top:12px"><h3>${iconImg('star', 'icn sm')} Milestone relic <span class="ru-cash">${picked ? 'taken' : 'free: pick one'}</span></h3><div class="ru-trade">` + offer.map((id) => {
                const r = RELICS[id], took = picked === id;
                return `<button class="ru-item ${picked ? (took ? 'bought' : 'poor') : ''}" onclick="CONTENT_relic('${id}')"><span class="ru-ico">${iconImg(r.icon, 'icn')}</span><span class="ru-it"><b>${r.name}</b><small>${r.desc}</small></span><span class="ru-price">${took ? 'TAKEN' : (picked ? '' : 'FREE')}</span></button>`;
            }).join('') + '</div></div>';
        };
        const wrapTrader = () => {
            const orig = window.RUNUI_trader; if (!orig || orig.cx) return;
            const w = function (box) { orig(box); try { if (g.wave % 5 === 0 && MP.role !== 'guest') box.insertAdjacentHTML('beforeend', relicPanel()); } catch (e) { console.warn('[content] relicPanel', e); } };
            w.cx = 1; window.RUNUI_trader = w;
        };
        wrapTrader();
        const origReroll = window.RUNUI_reroll;
        if (origReroll && !origReroll.cx) {
            const w = function () {
                const rr = g.rrN || 0, before = (g.offer || []).slice();
                origReroll.apply(this, arguments);
                if ((g.rrN || 0) !== rr) {
                    try {
                        const ok = Object.keys(UPGRADES).filter((id) => { const u = UPGRADES[id]; return pkn(id) < u.max && (!u.ok || u.ok()); });
                        const n = C.offer(ok, g.offer, before); if (n && n.length === 3) { g.offer = n; if (window.RUNUI_cards) RUNUI_cards(); }
                    } catch (e) { console.warn('[content] reroll', e); }
                }
            };
            w.cx = 1; window.RUNUI_reroll = w;
        }
        // trader items. Each gets pricier every time you buy it in a run.
        const tcost = (id, base, per) => (w) => Math.round((base + w * per) * (1 + 0.6 * ((g.cxn && g.cxn[id]) || 0)));
        const bought = (id) => { g.cxn = g.cxn || {}; g.cxn[id] = (g.cxn[id] || 0) + 1; };
        [
            { id: 'c_regen', icon: '🩹', name: 'Nano-bandages', desc: 'Slow passive regeneration (this run)', cost: tcost('c_regen', 450, 35), fn: () => { bought('c_regen'); g.regen += 0.012; } },
            { id: 'c_kevlar', icon: '🦺', name: 'Kevlar lining', desc: '-10% damage taken (this run)', cost: tcost('c_kevlar', 650, 50), fn: () => { bought('c_kevlar'); g.dmgTaken = (g.dmgTaken || 1) * 0.9; } },
            { id: 'c_oil', icon: '🛠', name: 'Gun oil', desc: 'Weapons fire 8% faster', cost: tcost('c_oil', 600, 45), fn: () => { bought('c_oil'); g.cdMul *= 0.92; } },
            { id: 'c_powder', icon: '💥', name: 'Blast powder', desc: 'Blasts 10% wider', cost: tcost('c_powder', 550, 40), fn: () => { bought('c_powder'); g.radMul *= 1.1; } },
            { id: 'c_stash', icon: '🔩', name: 'Scrap stash', desc: '+3 scrap (for rerolls and the forge)', cost: tcost('c_stash', 800, 60), fn: () => { bought('c_stash'); g.scraps += 3; } },
            { id: 'c_clover', icon: '🍀', name: 'Four-leaf clover', desc: '+10% cash and more pickup drops', cost: tcost('c_clover', 500, 35), fn: () => { bought('c_clover'); g.cashMul += 0.1; g.dropBonus = (g.dropBonus || 0) + 0.04; } },
            { id: 'c_lifeline', icon: '🫀', name: 'Defibrillator', desc: 'Come back once at half HP (one per run)', cost: (w) => (g.revive ? 9999999 : 1800 + w * 100), fn: () => { g.revive = true; } },
            { id: 'c_stim', icon: '💉', name: 'Combat stims', desc: '30s of rage and speed at the start of next wave', cost: tcost('c_stim', 500, 40), fn: () => { bought('c_stim'); g.buffs.rage = Math.max(g.buffs.rage, 1800); g.buffs.speed = Math.max(g.buffs.speed, 1800); } },
            { id: 'c_kegs', icon: '💣', name: 'Powder kegs', desc: 'Four extra explosive barrels on the field', cost: tcost('c_kegs', 350, 30), fn: () => { bought('c_kegs'); for (let i = 0; i < 4; i++) g.barrels.push({ x: 80 + rnd() * 640, y: 80 + rnd() * 440, hp: 40, flash: 0, dead: false }); } },
            { id: 'c_dice', icon: '📦', name: 'Supply drop', desc: 'Resets reroll prices and adds 2 scrap', cost: tcost('c_dice', 400, 30), fn: () => { bought('c_dice'); g.rrN = 0; g.scraps += 2; } }
        ].forEach((it) => { if (!TRADER.some((x) => x.id === it.id)) TRADER.push(it); });

        // ============================================================== MAIN TICK
        const onWave = (S) => {
            S.wv = g.wave; S.q.length = 0; const w = W(); w.zones.length = 0; w.proj.length = 0; w.corpses.length = 0; w.fx.length = 0; S.stT = 200;
            const md = pkn('medic'); if (md && g.wave > 1) { healAll(g.player.maxHp * 0.1 * md); }
            if (hasRel('vault') && g.wave > 1) { g.scraps += 1; }
        };
        C.tick = guard('tick', () => {
            if (!g || !g.active || g.paused || g.mini) return;
            const S = st(), p = g.player, pk = g.pk || {}, tk = g.tick;
            if (S.wv !== g.wave) onWave(S);
            for (let i = S.q.length - 1; i >= 0; i--) { const e = S.q[i]; if (tk >= e.t) { S.q.splice(i, 1); try { e.f(); } catch (er) { console.warn('[content] later', er); } } }
            const hx = pk.hexcoin || 0, fv = pk.fever || 0, fro = hasRel('frozen');
            for (const z of g.zombies) {
                if (z.dead) continue;
                if (z.cai && !z.cin) initZ(z);
                if (hx || z.hxl) { if (z.hxl !== hx) { z.spd *= (1 + 0.08 * hx) / (1 + 0.08 * (z.hxl || 0)); z.hxl = hx; } }
                if (fv || z.fvl) { if (z.fvl !== fv) { const r = (1 + 0.15 * fv) / (1 + 0.15 * (z.fvl || 0)); z.hp *= r; z.max *= r; z.fvl = fv; } }
                if (fro && !z.frr) { z.frr = 1; z.spd *= 0.88; }
                if (z.boss && z.cai) { z.slow = Math.min(1, z.slow); }
                if (z.flash < 3 && z.cxw > tk && tk % 8 < 4) z.flash = 3;
                if (z.cb > 0 && !z.emerge) {
                    z.cb--; z.cbAge = (z.cbAge || 0) + 1;
                    if (z.cbAge % 30 === 0) {
                        const wf = pk.wildfire || 1, d = (5 + wv() * 0.9) * (0.8 + 0.3 * wf) * dmgMul() * (z.boss ? 0.5 : 1), o = g.src;
                        S.inFx++; g.src = 'BURN'; try { hurt(z, d); } finally { g.src = o; S.inFx--; }
                        if (g.pops.length < 40 && tk % 3 === 0) burst(z.x, z.y - z.size * 0.5, '#ff7a1a', 2, 1.5);
                    }
                }
                let cx = 0; if (z.cb > 0) cx |= 1; if (z.slow < 0.75) cx |= 2; if (z.sh) cx |= 4; if (z.vulnOn) cx |= 8;
                const t = T[z.cai]; if (t && t.cx) cx |= (t.cx(z) | 0) << 4;
                z.cx = cx;
                if (z.spr === 'screamer' && tk % 5 === 0) {   // the haste aura: everything near a screamer runs hot
                    const R = z.hp / z.max < 0.5 ? 170 : 150;
                    for (const o of g.zombies) if (o !== z && !o.dead && !o.boss && (o.x - z.x) ** 2 + (o.y - z.y) ** 2 < R * R) o.rage = Math.max(o.rage || 0, 12);
                }
            }
            objectsTick();
            // ---------- perks
            if (pk.blood && tk % 90 === 0 && p.hp > p.maxHp * 0.15) p.hp -= 0.8 * pk.blood;
            if (pk.nano && tk - S.lh > 180 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 0.035 * pk.nano);
            if (S.brT > 0) S.brT--; if (S.crT > 0) S.crT--;
            if (S.brOn > 0) { S.brOn--; g.buffs.speed = Math.max(g.buffs.speed, 4); }
            if (pk.overdrive && g.combo.n >= 12) g.buffs.speed = Math.max(g.buffs.speed, 6);
            // pickups: bigger grab radius + scrap magnet + relic vault
            const reach = pkn('reach'), sh = pkn('scraphound'), vault = hasRel('vault');
            if ((reach || sh || vault) && g.pickups.length) {
                for (let i = g.pickups.length - 1; i >= 0; i--) {
                    const k = g.pickups[i], d = Math.hypot(p.x - k.x, p.y - k.y) || 1, R = 26 + 24 * reach + (vault ? 70 : 0);
                    if (d < R && d >= 20) { collectPickup(k); g.pickups.splice(i, 1); continue; }
                    if (k.kind === 'SCRAP' && sh && d < 220 + 90 * sh && d > 26) { k.x += (p.x - k.x) / d * 5; k.y += (p.y - k.y) / d * 5; }
                }
            }
            // mines: demolitionist / siege engine scale them, voltaic pulses hurt, vampiric heals when they blow
            const dm = pk.demo || 0, sg = hasRel('siege'), mp_ = pk.minepulse || 0;
            if (g.traps.length) {
                for (const t of g.traps) {
                    if (!t.cm) { t.cm = 1; const f = (1 + 0.25 * dm) * (sg ? 1.6 : 1); if (f !== 1) { t.dmg *= f; t.rad *= 1 + 0.06 * dm + (sg ? 0.2 : 0); } }
                }
                if (mp_ && tk % 40 === 0) {
                    const o = g.src; g.src = 'MINES';
                    for (const t of g.traps) { const dd = (8 + wv() * 0.5) * mp_ * dmgMul(); g.vfx.length < 60 && g.vfx.push({ x: t.x, y: t.y, r: 0, max: 62, a: 0.5 }); for (const z of g.zombies) if (live(z) && Math.abs(z.x - t.x) < 70 && Math.abs(z.y - t.y) < 70 && Math.hypot(z.x - t.x, z.y - t.y) < 62 + z.size * 0.4) hurt(z, dd); }
                    g.src = o;
                }
            }
            const vm = pk.vampmine || 0;
            if (vm || S.trapSet.size) {
                const now = new Set(g.traps);
                if (vm) for (const t of S.trapSet) if (!now.has(t)) { healAll(2 + 2 * vm); popSync(t.x, t.y - 20, '+HP'); }
                S.trapSet = now;
            }
            if (sg && tk % 480 === 0 && g.traps.length < 24) placeMine(p.x, p.y, 'MINES');
            // lightning
            const st_ = pk.storm || 0, tot = hasRel('totem');
            if (st_ || tot) {
                const per = Math.min(st_ ? 200 - 50 * st_ : 9999, tot ? 120 : 9999);
                if (++S.stT >= per) {
                    S.stT = 0; const live_ = g.zombies.filter(live); if (live_.length) {
                        const z = live_[rnd() * live_.length | 0], pts = [[r1(z.x), r1(z.y - 90)], [r1(z.x), r1(z.y)]];
                        if (g.arcs.length < 20) { g.arcs.push({ pts, life: 12 }); evPush(['a', pts]); }
                        aoe(z.x, z.y, 54, (60 + wv() * 3) * ((st_ || 1) * 0.8 + (tot ? 0.4 : 0)) * dmgMul(), 'STORM');
                    }
                }
            }
            if (pk.chrono && tk > 0 && tk % 1500 === 0) { g.freezeT = 180; g.banner = { text: 'TIME STOP', sub: 'Three seconds.', life: 120 }; }
        });
        // ---- boss tuning hook & misc glue
        C.version = 1;
        // ============================================================== CHASE STEERING (tier-scaled tracking)
        // TRK: the one table to tune. Per difficulty tier:
        //   ri     = ticks between steering refreshes (higher = laggier / dumber; also the "reaction delay" feel at low tiers)
        //   delay  = ticks a fresh zombie stands still before it reacts to you
        //   lead   = how far ahead of your movement vector it aims (1 = full interception); horde level adds +0.02 per level
        //   flank  = max angle (radians x1) it arcs off a straight line toward you while far away, so packs spread around you instead of queueing
        //   pincer = 1: half of every pack (by id parity) arcs the opposite way
        //   sep    = separation from other zombies (0..1)
        //   avoid  = 1: steers around barrels, armed blast circles, your fire pools and mines
        //   hold   = 1: fast zombies hang back (outside 250px) until >= 3 slower zombies are near you
        //   persist= 1: stuck/idle detection, nudges sideways instead of pushing into a wall or a friend
        const TRK = {
            easy:   { ri: 18, delay: 26, lead: 0,    flank: 0,   pincer: 0, sep: 0,    avoid: 0, hold: 0, persist: 0 },
            normal: { ri: 7,  delay: 8,  lead: 0.25, flank: 0.2, pincer: 0, sep: 0.15, avoid: 0, hold: 0, persist: 0 },
            hard:   { ri: 4,  delay: 0,  lead: 0.65, flank: 0.55, pincer: 1, sep: 0.45, avoid: 1, hold: 0, persist: 1 },
            night:  { ri: 3,  delay: 0,  lead: 0.95, flank: 0.8, pincer: 1, sep: 0.7,  avoid: 1, hold: 1, persist: 1 },
            nodge:  { ri: 2,  delay: 0,  lead: 1.2,  flank: 1.0, pincer: 1, sep: 1,    avoid: 1, hold: 1, persist: 1 }
        };
        C.TRK = TRK;
        const trk = () => TRK[g.dif] || TRK.normal;
        let grid = null, gridTk = -99, packNear = 99;
        const cellOf = (x, y) => ((x / 40) | 0) * 64 + ((y / 40) | 0);
        const buildGrid = () => {
            gridTk = g.tick; grid = new Map(); let n = 0; const p = g.player;
            for (const z of g.zombies) {
                if (z.dead) continue; const k = cellOf(z.x, z.y); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(z);
                if (!z.boss && z.spd < 2.6 && (z.x - p.x) ** 2 + (z.y - p.y) ** 2 < 220 * 220) n++;
            }
            packNear = n;
        };
        const OUT = [0, 0];
        C.steer = guard('steer', (z, p, dist, ux, uy, step) => {
            if (z.spd <= 0 || z.state === 'dash' || z.state === 'leap' || z.state === 'stun' || z.state === 'pull') return null;
            const T_ = trk(), hl = z.hl || 0;
            if (z.sdl === undefined) z.sdl = T_.delay;
            if (z.sdl > 0) { z.sdl -= step; OUT[0] = 0; OUT[1] = 0; return OUT; }   // reaction delay: it has noticed you, but has not decided yet
            if (g.tick - gridTk >= 3 && T_.sep > 0 || !grid) buildGrid();
            if (!z.sx || (z.sk -= step) <= 0) {
                z.sk = T_.ri;
                const leadE = Math.min(1.3, T_.lead + hl * 0.02), tt = Math.min(60, dist / Math.max(0.5, z.spd * (z.slow || 1))) * leadE;
                const px = clamp(p.x + (p.vx || 0) * tt, 20, 780), py = clamp(p.y + (p.vy || 0) * tt, 20, 580);   // clamped: aiming past the wall is the old border bug
                let dx = px - z.x, dy = py - z.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
                if (T_.flank > 0 && d > 80 && !(z.ai === 'bomb')) {
                    const side = T_.pincer ? ((z.id & 1) ? 1 : -1) : (z.offset > 0 ? 1 : -1), amt = T_.flank * Math.min(1, d / 300) * (0.55 + 0.45 * ((z.id % 5) / 4)) * 0.9, ca = Math.cos(side * amt), sa = Math.sin(side * amt);
                    const nx = dx * ca - dy * sa; dy = dx * sa + dy * ca; dx = nx;
                }
                if (T_.sep > 0 && grid) {   // separation from neighbours (cheap: only the 3x3 cells around us)
                    const cx = (z.x / 40) | 0, cy = (z.y / 40) | 0; let sx = 0, sy = 0, c = 0;
                    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = grid.get((cx + i) * 64 + cy + j); if (!a) continue; for (const o of a) { if (o === z) continue; const ox = z.x - o.x, oy = z.y - o.y, dd = ox * ox + oy * oy; if (dd < 900 && dd > 0.01) { const m = 1 - Math.sqrt(dd) / 30; sx += ox / Math.sqrt(dd) * m; sy += oy / Math.sqrt(dd) * m; c++; } } }
                    if (c) { dx += sx * T_.sep * 0.9; dy += sy * T_.sep * 0.9; }
                }
                if (T_.avoid) {
                    for (const b of g.barrels) { if (b.dead) continue; const ox = z.x - b.x, oy = z.y - b.y, dd = Math.hypot(ox, oy); if (dd < 44 && dd > 0.1) { dx += ox / dd * 0.8; dy += oy / dd * 0.8; } }
                    for (const h of g.hz) {
                        if (h.k === 'c' || h.k === 'f') { if (h.k === 'c' && g.tick > h.arm) continue; const ox = z.x - h.x, oy = z.y - h.y, dd = Math.hypot(ox, oy); if (dd < h.r + 14 && dd > 0.1 && (h.k === 'f' || dist > 40)) { dx += ox / dd * 1.2; dy += oy / dd * 1.2; } }
                    }
                    if (hl < 5) for (const t of g.traps) { const ox = z.x - t.x, oy = z.y - t.y, dd = Math.hypot(ox, oy); if (dd < 50 && dd > 0.1) { let tx = -oy / dd, ty = ox / dd; if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; } dx += tx + ox / dd * 0.3; dy += ty + oy / dd * 0.3; } }
                }
                // walls: slide along a border instead of grinding into it
                if (z.x < 26 && dx < 0) { dx = 0; dy = dy >= 0 ? 1 : -1; } else if (z.x > 774 && dx > 0) { dx = 0; dy = dy >= 0 ? 1 : -1; }
                if (z.y < 26 && dy < 0) { dy = 0; dx = dx >= 0 ? 1 : -1; } else if (z.y > 574 && dy > 0) { dy = 0; dx = dx >= 0 ? 1 : -1; }
                if (T_.persist) {   // idle / stuck: sample our position, and if we barely moved while far from you, sidestep for a moment
                    if ((z.so = (z.so || 0) - z.sk) > 0) { const k = z.sg || 1; const nx = -dy * k * 0.9; dy = dx * k * 0.9 + dy * 0.4; dx = nx + dx * 0.4; }
                    z.sc = (z.sc || 0) + 1;
                    if (z.sc >= 8) { z.sc = 0; if (z.lx !== undefined && dist > 70 && Math.hypot(z.x - z.lx, z.y - z.ly) < 4 && z.spd * (z.slow || 1) > 0.4 && !(z.emerge > 0)) { z.so = 40; z.sg = rnd() < 0.5 ? 1 : -1; } z.lx = z.x; z.ly = z.y; }
                }
                const l = Math.hypot(dx, dy) || 1; z.sx = dx / l; z.sy = dy / l;
            }
            let f = 1;
            if (T_.hold && z.spd >= 2.6 && dist < 250 && dist > 90 && packNear < 3) f = 0.12;   // speedy ones wait for the pack
            OUT[0] = z.sx * f; OUT[1] = z.sy * f; return OUT;
        }, null);

        console.log('[content] ready:', Object.keys(T).filter((k) => T[k].pick).length + ' enemy types, ' + BOSSES.length + ' bosses, ' + Object.keys(UPGRADES).length + ' perks');
    } catch (e) {
        console.warn('[content] failed to initialise (base game unaffected):', e);
    }
})();
