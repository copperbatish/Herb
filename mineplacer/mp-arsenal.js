/* [arsenal] ARSENAL workstream: new weapons, perks, materials, and the Forge.
   Loaded as a classic script AFTER the main one, so it shares the main script's global lexical scope (g, WEAPON_DATA, SPECIAL, UPGRADES, hurt, explode ...).
   Everything is wrapped in try/catch: a bug in here must never break the base game.
   Hooks in Mineplacer2.html (all marked `// [arsenal]`): ARS.tick / ARS.draw / ARS.onHurt / ARS.onKill / ARS.onHit / ARS.pierce / ARS.snap / ARS.applySnap / ARS.runEnd / ARS.fixUser. */
(function () {
    'use strict';
    const A = window.ARS = window.ARS || {};
    const TAU = Math.PI * 2;
    const rnd = Math.random;
    let warned = {};
    const safe = (name, fn) => { try { return fn(); } catch (e) { if (!warned[name]) { warned[name] = 1; console.error('[arsenal] ' + name, e); } } };

    // ================================================================== SPRITES (procedural 10x10, auto-outlined)
    safe('sprites', () => {
        const mk = (ops) => {
            const G = Array.from({ length: 10 }, () => Array(10).fill('.'));
            const px = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < 10 && y >= 0 && y < 10) G[y][x] = c; };
            const ln = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
            const dc = (cx, cy, r, c) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.hypot(x - cx, y - cy) <= r + 0.25) G[y][x] = c; };
            const rg = (cx, cy, r, c) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.abs(Math.hypot(x - cx, y - cy) - r) < 0.75) G[y][x] = c; };
            const rc = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c); };
            const dia = (cx, cy, r, c) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.abs(x - cx) + Math.abs(y - cy) <= r) G[y][x] = c; };
            ops({ px, ln, dc, rg, rc, dia });
            const O = G.map(r => r.slice());
            for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (G[y][x] === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (G[y + dy] || [])[x + dx] && G[y + dy][x + dx] !== '.' && G[y + dy][x + dx] !== 'k')) O[y][x] = 'k';
            return O.map(r => r.join(''));
        };
        const S = {
            orbblade: ({ dc, rg }) => { rg(4.5, 4.5, 3.3, 's'); dc(4.5, 4.5, 1, 'y'); dc(4.5, 1.6, 1, 'w'); dc(7.2, 6.2, 1, 'w'); dc(1.8, 6.2, 1, 'w'); },
            boomaxe: ({ ln, dc, px }) => { ln(2, 8, 6, 3, 'n'); ln(3, 8, 7, 3, 'n'); dc(6.2, 3, 2.3, 'b'); px(7, 2, 'w'); px(6, 2, 'w'); },
            frostnova: ({ ln, dc }) => { ln(1, 4, 8, 4, 'w'); ln(1, 5, 8, 5, 'w'); ln(4, 1, 4, 8, 'w'); ln(5, 1, 5, 8, 'w'); ln(2, 2, 7, 7, 'c'); ln(2, 7, 7, 2, 'c'); dc(4.5, 4.5, 1.2, 'B'); },
            scatter: ({ ln, px }) => { ln(1, 5, 4, 5, 's'); ln(1, 6, 4, 6, 'd'); [[6, 2], [7, 4], [7, 6], [6, 8], [8, 5]].forEach(([x, y]) => { px(x, y, 'y'); px(x, y + 1, 'o'); }); },
            missile: ({ ln, px }) => { ln(2, 7, 6, 3, 'w'); ln(3, 7, 7, 3, 'w'); px(7, 2, 'r'); px(6, 2, 'r'); px(7, 3, 'r'); px(1, 8, 'o'); px(2, 8, 'y'); px(1, 7, 'y'); },
            thunder: ({ ln, rc }) => { rc(1, 1, 8, 2, 'b'); ln(6, 3, 3, 5, 'y'); ln(7, 3, 4, 5, 'y'); ln(3, 5, 6, 5, 'y'); ln(6, 5, 3, 8, 'y'); ln(7, 5, 4, 8, 'y'); },
            vial: ({ rc, dc, px }) => { rc(4, 1, 5, 3, 's'); dc(4.5, 6, 2.6, 'l'); rc(3, 5, 6, 7, 'l'); px(3, 5, 'w'); px(6, 7, 'L'); },
            tempest: ({ rg, ln }) => { rg(4.5, 4.5, 3.6, 'b'); ln(5, 2, 3, 5, 'y'); ln(6, 2, 4, 5, 'y'); ln(3, 5, 6, 5, 'y'); ln(6, 5, 4, 7, 'y'); },
            napalm: ({ dc, ln }) => { dc(4.5, 5.5, 2.9, 'o'); dc(4.5, 6, 1.6, 'y'); ln(4, 1, 4, 3, 'o'); ln(5, 2, 5, 3, 'o'); },
            voidsaw: ({ dc, rg }) => { dc(4.5, 4.5, 3.6, 'v'); rg(4.5, 4.5, 3.6, 's'); dc(4.5, 4.5, 1.6, 'k'); },
            skyblades: ({ ln, dc }) => { ln(1, 2, 8, 7, 'b'); ln(1, 3, 8, 8, 'b'); ln(1, 7, 8, 2, 'w'); ln(1, 8, 8, 3, 'w'); dc(4.5, 4.5, 1, 'y'); },
            cryorail: ({ rc, ln, px }) => { rc(1, 4, 8, 5, 'c'); ln(6, 2, 8, 4, 'w'); ln(6, 7, 8, 5, 'w'); px(2, 3, 'w'); px(2, 6, 'w'); px(4, 3, 'b'); px(4, 6, 'b'); },
            solar: ({ dc, px }) => { dc(4.5, 4.5, 2.1, 'y'); [[4, 1], [5, 1], [4, 8], [5, 8], [1, 4], [1, 5], [8, 4], [8, 5], [2, 2], [7, 7], [2, 7], [7, 2]].forEach(([x, y]) => px(x, y, 'o')); },
            reaper: ({ ln, dc, px }) => { ln(2, 8, 6, 3, 'd'); ln(3, 8, 7, 3, 'd'); dc(6, 3.2, 2.5, 'r'); px(7, 2, 'w'); px(2, 2, 'w'); px(8, 7, 'w'); },
            crit: ({ ln, dc }) => { ln(1, 4, 8, 4, 'y'); ln(1, 5, 8, 5, 'y'); ln(4, 1, 4, 8, 'y'); ln(5, 1, 5, 8, 'y'); ln(2, 2, 7, 7, 'o'); ln(2, 7, 7, 2, 'o'); dc(4.5, 4.5, 1.4, 'r'); },
            critdmg: ({ ln, px }) => { ln(1, 8, 7, 2, 'w'); ln(2, 8, 8, 2, 'w'); ln(2, 6, 4, 8, 'n'); px(8, 1, 'r'); px(7, 1, 'r'); px(8, 2, 'r'); px(1, 1, 'y'); px(2, 2, 'y'); },
            pierce: ({ rc, ln, px }) => { rc(4, 1, 5, 8, 'd'); rc(1, 4, 8, 5, 's'); ln(7, 2, 8, 4, 'w'); ln(7, 7, 8, 5, 'w'); px(1, 3, 'w'); px(1, 6, 'w'); },
            satellite: ({ dc, rg }) => { rg(4.5, 4.5, 3.6, 's'); dc(4.5, 4.5, 1.5, 'b'); dc(8, 4, 1, 'y'); dc(1, 5, 1, 'y'); },
            snow: ({ ln, dc }) => { ln(4, 1, 4, 8, 'c'); ln(5, 1, 5, 8, 'c'); ln(1, 4, 8, 4, 'c'); ln(1, 5, 8, 5, 'c'); ln(2, 2, 7, 7, 'w'); ln(2, 7, 7, 2, 'w'); dc(4.5, 4.5, 1, 'B'); },
            salvage: ({ rc, px }) => { rc(1, 3, 8, 8, 'n'); rc(1, 3, 8, 4, 'g'); rc(4, 5, 5, 6, 'y'); px(2, 2, 's'); px(6, 1, 's'); px(7, 2, 'g'); },
            overheal: ({ rc, px }) => { rc(2, 1, 7, 5, 'B'); rc(3, 6, 6, 7, 'B'); px(4, 8, 'B'); px(5, 8, 'B'); rc(4, 2, 5, 5, 'w'); rc(3, 3, 6, 4, 'w'); },
            evade: ({ dc, rc, px }) => { dc(4.5, 3, 2, 'w'); rc(3, 4, 6, 7, 'w'); px(3, 8, 'w'); px(5, 8, 'w'); px(2, 6, 'w'); px(7, 6, 'w'); px(4, 3, 'k'); px(6, 3, 'k'); },
            rage: ({ dc, ln }) => { dc(4.5, 5.5, 3, 'r'); dc(4.5, 6, 1.5, 'y'); ln(4, 1, 4, 3, 'r'); ln(2, 2, 3, 4, 'r'); ln(7, 2, 6, 4, 'r'); },
            hourglass: ({ rc }) => { rc(2, 1, 7, 1, 'g'); rc(2, 8, 7, 8, 'g'); rc(2, 2, 7, 2, 'w'); rc(3, 3, 6, 3, 'w'); rc(4, 4, 5, 5, 'w'); rc(3, 6, 6, 6, 'y'); rc(2, 7, 7, 7, 'y'); },
            revive: ({ rc, px }) => { rc(4, 1, 5, 8, 'r'); rc(1, 4, 8, 5, 'r'); px(4, 4, 'w'); px(5, 5, 'w'); px(4, 5, 'p'); px(5, 4, 'p'); }
        };
        const rows = {};
        Object.keys(S).forEach(n => { rows[n] = mk(S[n]); });
        Object.assign(ICON_ROWS, rows);
        Object.assign(ICON_ROWS, {
            tidalspoon: ['....sss...', '...sbbbs..', '...sbwbs..', '...sbbbs..', '....sss...', '.....s....', '..b..s..b.', '.bbb.s.bbb', 'bbbbbsbbbb', 'BBBBBBBBBB'],
            rockladle: ['......ss..', '.....sbbs.', '.....sbbs.', '..y...ss..', '.yoy..s...', 'yoooy.s...', '.yoyoos...', '..yooy....', '...yy.....', '..........'],
            spoonrail: ['...ss.....', '..ssss....', '..ssss....', '...ss.....', '...ss.....', 'kkkkkkkkkk', 'kbbbbbbbbk', 'kbwwwwwwbk', 'kkkkkkkkkk', '..........']
        });
        Object.assign(EMO_MAP, { '🫗': 'tidalspoon', '🪕': 'rockladle', '🍴': 'spoonrail', '💫': 'orbblade', '🪝': 'boomaxe', '🥶': 'frostnova', '🎆': 'scatter', '🚀': 'missile', '🔱': 'thunder', '🧪': 'vial', '🌠': 'tempest', '🌋': 'napalm', '🪐': 'voidsaw', '🎇': 'skyblades', '🧬': 'cryorail', '🔆': 'solar', '🧭': 'reaper' });
    });

    // ================================================================== SMALL HELPERS
    const W = () => g.aw || (g.aw = { orbs: [], rangs: [], novas: [], miss: [], bolts: [], fl: [], clouds: [], nm: [], rays: [], lances: [], sat: [], satA: 0, sh: 0, shMax: 0, shT: 0, zap: 4, warpP: null });
    const GM = () => g.mats || (g.mats = { shard: 0, core: 0, ember: 0 });
    const live = (z) => z && !z.dead && !(z.emerge > 0);
    const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
    const dmgOf = (id, m) => getMod(id, m.dmg, 'dmg') * dmgMul();
    const nearestTo = (x, y, maxD, skip) => { let best = null, bd = (maxD || 1e9) ** 2; for (const z of g.zombies) { if (!live(z) || (skip && skip.has(z))) continue; const d = (z.x - x) ** 2 + (z.y - y) ** 2; if (d < bd) { bd = d; best = z; } } return best; };
    const hitZ = (id, z, d) => withSrc(id, () => hurt(z, d));
    const slowZ = (z, f) => { z.slow = Math.min(z.slow === undefined ? 1 : z.slow, z.boss ? 1 - (1 - f) * 0.5 : f); };
    const inLine = (z, x1, y1, dx, dy, len, w) => { const px = z.x - x1, py = z.y - y1, pr = px * dx + py * dy; if (pr < 0 || pr > len) return false; return Math.abs(px * dy - py * dx) < w + z.size * 0.6; };
    const inArena = (x, y, m) => x > -m && x < 800 + m && y > -m && y < 600 + m;
    const pushAway = (z, x, y, k) => { if (z.boss) return; const d = Math.hypot(z.x - x, z.y - y) || 1; z.x = clamp(z.x + (z.x - x) / d * k, 10, 790); z.y = clamp(z.y + (z.y - y) / d * k, 10, 590); };
    const spark = (x, y, c, n) => { if (g.parts.length < 380) burst(x, y, c, n, 3); };

    // ================================================================== WEAPON DATA
    safe('weapon-data', () => {
        Object.assign(WEAPON_DATA, {
            SCAT:   { label: 'Scatter Gun',   icon: '🎆', unlock: 16000,  color: '#ffd27a', radius: 270, dmg: 30,  cooldown: 850,   scrap: true, desc: 'A cone of 7 pellets. Brutal up close, pellets pierce with the perk' },
            ORBB:   { label: 'Orbit Blades',  icon: '💫', unlock: 30000,  color: '#c8e0ff', radius: 50,  dmg: 26,  cooldown: 9000,  scrap: true, desc: '3 blades spin around you for 8 seconds and shred what touches you' },
            TOXIC:  { label: 'Toxic Cloud',   icon: '🧪', unlock: 42000,  color: '#8fdc4a', radius: 70,  dmg: 9,   cooldown: 4500,  scrap: true, desc: 'A creeping poison cloud that follows the horde and slows it' },
            BOOMA:  { label: 'Boomerang Axe', icon: '🪝', unlock: 48000,  color: '#e0a060', radius: 280, dmg: 78,  cooldown: 1800,  scrap: true, desc: 'Pierces everything on the way out, and again on the way back' },
            NOVA:   { label: 'Frost Nova',    icon: '🥶', unlock: 75000,  color: '#8fe6ff', radius: 170, dmg: 85,  cooldown: 5000,  scrap: true, desc: 'A freezing ring bursts from you: damage and a hard slow' },
            THUN:   { label: 'Thunder Call',  icon: '🔱', unlock: 95000,  color: '#fff27a', radius: 52,  dmg: 120, cooldown: 5500,  scrap: true, desc: 'Marks 5 zombies. Lightning drops on each a moment later' },
            MISL:   { label: 'Homing Missiles', icon: '🚀', unlock: 160000, color: '#ff8a5a', radius: 55, dmg: 95, cooldown: 6000,  scrap: true, desc: 'Four seeker missiles that chase down different targets' },
            // ---- FUSED (Forge only). unlock 0 = cannot be bought or sold for cash.
            F_TEMPEST:  { label: 'Tempest',        icon: '🌠', unlock: 0, color: '#8fe6ff', radius: 190, dmg: 70,  cooldown: 1000,  scrap: true, fused: true, desc: 'Chain lightning (6 jumps) that ends in a big explosion' },
            F_NAPALM:   { label: 'Napalm Mines',   icon: '🌋', unlock: 0, color: '#ff7a1f', radius: 80,  dmg: 170, cooldown: 4000,  scrap: true, fused: true, desc: 'Lays 3 mines. They blow up and leave a burning pool' },
            F_VOIDSAW:  { label: 'Void Saw',       icon: '🪐', unlock: 0, color: '#b04bff', radius: 16,  dmg: 2000, cooldown: 4500,  scrap: true, fused: true, desc: 'A huge saw that drags the horde into its path' },
            F_SKYBLADES:{ label: 'Sky Blades',     icon: '🎇', unlock: 0, color: '#9ad0ff', radius: 62,  dmg: 38,  cooldown: 11000, scrap: true, fused: true, desc: '4 blades orbit you and keep lunging at the nearest zombie' },
            F_CRYORAIL: { label: 'Cryo Rail',      icon: '🧬', unlock: 0, color: '#6fe0ff', radius: 60,  dmg: 240, cooldown: 3600,  scrap: true, fused: true, desc: 'A piercing frost slug that freezes everything in its line' },
            F_SOLAR:    { label: 'Solar Lance',    icon: '🔆', unlock: 0, color: '#ffd23a', radius: 20,  dmg: 36,  cooldown: 7000,  scrap: true, fused: true, desc: 'A sun-hot beam that tracks the horde for 1.5 seconds' },
            F_REAPER:   { label: 'Reaper Rangs',   icon: '🧭', unlock: 0, color: '#d05050', radius: 240, dmg: 60,  cooldown: 2300,  scrap: true, fused: true, desc: 'Three spinning saw-axes thrown in a fan. They all come back' },
            // ---- the Big Spoon fusions: absurdly strong, absurdly expensive. They count as a Big Spoon (parry + SHIFT clutch) while equipped.
            F_TIDAL:    { label: 'Tidal Ladle',    icon: '🫗', unlock: 0, color: '#3fa9ff', radius: 300, dmg: 260, cooldown: 3500, scrap: true, fused: true, spoon: true, desc: 'A crashing wave: huge damage, throws the horde away, freezes it solid and heals you' },
            F_ROCKLADLE:{ label: 'Rock Ladle',     icon: '🪕', unlock: 0, color: '#ffb24a', radius: 130, dmg: 110, cooldown: 1600, scrap: true, fused: true, spoon: true, desc: 'A sonic fan of 7 piercing echoes that bounce around, plus a shockwave that blasts everything close' },
            F_SPOONRAIL:{ label: 'Spoon Railgun',  icon: '🍴', unlock: 0, color: '#e8f4ff', radius: 24,  dmg: 170, cooldown: 80,   scrap: true, fused: true, spoon: true, hold: true, desc: 'Hold to unleash a nonstop stream of piercing slugs, like the Water Cannon: it drains while you hold and recharges when empty. Bosses lose 1.5% of their health per shot on top' }
        });
        try { CONTRACT_WEAPONS.push('SCAT', 'ORBB', 'TOXIC', 'BOOMA', 'NOVA', 'THUN', 'MISL'); } catch (e) { /* const array, fine */ }
    });

    // ================================================================== SPECIALS (what happens when you press the key)
    const throwRang = (p, t, id, m, o) => {
        const w = W(), base = ang(p, t), n = o.n || 1, range = radOf(id, m) * (o.rng || 1), dmg = dmgOf(id, m) * (o.dm || 1);
        for (let i = 0; i < n; i++) {
            const a = base + (n > 1 ? (i - (n - 1) / 2) * (o.spread || 0.3) : 0), sp = 10;
            if (w.rangs.length > 24) w.rangs.shift();
            w.rangs.push({ own: p, id, x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, d: 0, max: range, ph: 0, rot: rnd() * 6, dmg, hits: new Set(), k: o.k || 0, r: o.r || 14 });
        }
    };
    const addNova = (x, y, max, dmg, id, p, kind, slow) => { const w = W(); if (w.novas.length > 12) w.novas.shift(); w.novas.push({ x, y, r: 8, max, sp: kind ? 11 : 8, dmg, id, own: p, hit: new Set(), k: kind || 0, slow: slow === undefined ? 0.1 : slow }); g.shake = Math.max(g.shake, 3); };
    const addRay = (x1, y1, x2, y2, kind) => { const w = W(); if (w.rays.length > 8) w.rays.shift(); w.rays.push({ x1, y1, x2, y2, life: 16, k: kind || 0 }); };

    safe('specials', () => {
        SPECIAL.SCAT = (p, t, id, m) => {
            const a0 = ang(p, t), dmg = dmgOf(id, m), life = radOf(id, m) / 15.5 * TICK;
            if (g.bullets.length > 420) return;
            for (let i = 0; i < 7; i++) {
                const a = a0 + (i - 3) * 0.1 + (rnd() - .5) * 0.05, sp = 15 + rnd() * 3;
                const near = Math.hypot(t.x - p.x, t.y - p.y) < 30;   // point blank: start the pellets inside the target so they connect
                g.bullets.push({ x: near ? t.x : p.x + Math.cos(a0) * 14, y: near ? t.y : p.y + Math.sin(a0) * 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 4, id, dmg, born: gameNow(), splash: 0, ghost: false, maxT: life });
            }
            spark(p.x + Math.cos(a0) * 22, p.y + Math.sin(a0) * 22, '#ffd27a', 4);
        };
        SPECIAL.ORBB = (p, t, id, m) => {
            const w = W(), R = radOf(id, m), dmg = dmgOf(id, m);
            w.orbs = w.orbs.filter(o => !(o.own === p && o.id === id));
            for (let i = 0; i < 3; i++) w.orbs.push({ own: p, id, a: i * TAU / 3, sp: 0.085, R, life: 480, dmg, hits: new Map(), x: p.x, y: p.y, sky: 0 });
        };
        SPECIAL.F_SKYBLADES = (p, t, id, m) => {
            const w = W(), R = radOf(id, m), dmg = dmgOf(id, m);
            w.orbs = w.orbs.filter(o => !(o.own === p && o.id === id));
            for (let i = 0; i < 4; i++) w.orbs.push({ own: p, id, a: i * TAU / 4, sp: 0.07, R, life: 540, dmg, hits: new Map(), x: p.x, y: p.y, sky: 1, st: 0, cd: 25 + i * 18, dd: 0 });
        };
        SPECIAL.BOOMA = (p, t, id, m) => throwRang(p, t, id, m, {});
        SPECIAL.F_REAPER = (p, t, id, m) => throwRang(p, t, id, m, { n: 3, spread: 0.32, k: 1, r: 12 });
        SPECIAL.NOVA = (p, t, id, m) => addNova(p.x, p.y, radOf(id, m), dmgOf(id, m), id, p, 0, 0.1);
        SPECIAL.MISL = (p, t, id, m) => {
            const w = W(), dmg = dmgOf(id, m), rad = radOf(id, m);
            for (let i = 0; i < 4; i++) if (w.miss.length < 20) w.miss.push({ own: p, id, delay: i * 9, x: p.x, y: p.y, a: ang(p, t) + (i % 2 ? 1 : -1) * (0.6 + i * 0.2), v: 3, tg: null, life: 190, dmg, rad, init: false });
        };
        SPECIAL.THUN = (p, t, id, m) => {
            const w = W(), dmg = dmgOf(id, m), rad = radOf(id, m), used = new Set(), pool = g.zombies.filter(live);
            for (let i = 0; i < 5 && pool.length; i++) {
                const k = pool.splice(rnd() * pool.length | 0, 1)[0]; used.add(k);
                if (w.bolts.length < 24) w.bolts.push({ id, x: k.x, y: k.y, tg: k, t: 34 + i * 9, st: 0, dmg, r: rad });
            }
        };
        SPECIAL.TOXIC = (p, t, id, m) => {
            const w = W(); if (w.clouds.length >= 5) w.clouds.shift();
            w.clouds.push({ id, x: t.x, y: t.y, r: radOf(id, m), life: 360, max: 360, dps: dmgOf(id, m), seed: rnd() * 9 });
        };
        SPECIAL.F_TEMPEST = (p, t, id, m) => {
            const dmg = dmgOf(id, m), rng = radOf(id, m), pts = [[Math.round(p.x), Math.round(p.y)]], hit = new Set(); let cur = t, last = t;
            for (let n = 0; n < 6 && cur; n++) {
                hit.add(cur); last = cur; pts.push([Math.round(cur.x), Math.round(cur.y)]);
                const c0 = cur; hitZ(id, c0, dmg * Math.pow(0.88, n));
                cur = null; let bd = rng * rng;
                for (const z of g.zombies) { if (!live(z) || hit.has(z)) continue; const d = (z.x - c0.x) ** 2 + (z.y - c0.y) ** 2; if (d < bd) { bd = d; cur = z; } }
            }
            if (g.arcs.length < 20) g.arcs.push({ pts, life: 12 }); evPush(['a', pts]);
            withSrc(id, () => explode(last.x, last.y, 78, dmg * 1.5));
        };
        SPECIAL.F_NAPALM = (p, t, id, m) => {
            const w = W(), dmg = dmgOf(id, m), rad = radOf(id, m), a0 = rnd() * TAU;
            for (let i = 0; i < 3; i++) {
                const a = a0 + i * TAU / 3; if (w.nm.length >= 9) w.nm.shift();
                w.nm.push({ id, x: clamp(p.x + Math.cos(a) * 40, 20, 780), y: clamp(p.y + Math.sin(a) * 40, 20, 580), dmg, rad, dps: dmg * 0.11, born: g.tick });
            }
        };
        SPECIAL.F_VOIDSAW = (p, t, id, m) => {
            const a = ang(p, t); if (g.bullets.length > 420) return;
            g.bullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, r: radOf(id, m), id, dmg: dmgOf(id, m), born: gameNow(), splash: 0, saw: true, vd: true, hits: new Map(), ghost: true });
        };
        SPECIAL.F_CRYORAIL = (p, t, id, m) => {
            const a = ang(p, t), dx = Math.cos(a), dy = Math.sin(a), dmg = dmgOf(id, m); let first = null, fd = 1e9;
            addRay(p.x, p.y, p.x + dx * 1100, p.y + dy * 1100, 0);
            for (const z of g.zombies) {
                if (!live(z) || !inLine(z, p.x, p.y, dx, dy, 1100, 10)) continue;
                hitZ(id, z, dmg); slowZ(z, 0.05); const d = Math.hypot(z.x - p.x, z.y - p.y); if (d < fd) { fd = d; first = z; }
            }
            if (first) addNova(first.x, first.y, radOf(id, m) + 40, dmg * 0.2, id, p, 1, 0.15);
            g.shake = Math.max(g.shake, 4);
        };
        SPECIAL.F_TIDAL = (p, t, id, m) => {   // Big Spoon x Water Cannon
            const dmg = dmgOf(id, m), R = radOf(id, m);
            for (const z of g.zombies) {
                if (!live(z)) continue; const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy) || 1; if (d > R + z.size) continue;
                const k = z.boss ? 22 : 110 * (1 - d / (R + 40) * 0.5); z.x = clamp(z.x + dx / d * k, 10, 790); z.y = clamp(z.y + dy / d * k, 10, 590);
                hitZ(id, z, dmg); slowZ(z, 0.05);
            }
            addNova(p.x, p.y, R, dmg * 0.4, id, p, 1, 0.1);
            const w = W(); if (w.novas.length) { const n = w.novas[w.novas.length - 1]; n.r = -50; }   // a second, delayed swell behind the first
            addNova(p.x, p.y, R * 0.8, dmg * 0.4, id, p, 1, 0.1);
            p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.1); g.shake = Math.max(g.shake, 10); g.invuln = Math.max(g.invuln || 0, 30);
        };
        SPECIAL.F_ROCKLADLE = (p, t, id, m) => {   // Big Spoon x Guitar
            const a0 = ang(p, t), dmg = dmgOf(id, m); if (g.bullets.length > 420) return;
            for (let i = 0; i < 7; i++) {
                const a = a0 + (i - 3) * 0.2;
                g.bullets.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, r: 9, id, dmg, born: gameNow(), splash: 0, saw: true, hits: new Map(), ghost: false, maxT: 1400 });
            }
            addNova(p.x, p.y, radOf(id, m), dmg * 0.7, id, p, 1, 0.2); spark(p.x, p.y, '#ffb24a', 8);
        };
        SPECIAL.F_SPOONRAIL = (p, t, id, m) => {   // Big Spoon x Railgun
            const a = ang(p, t), dx = Math.cos(a), dy = Math.sin(a), dmg = dmgOf(id, m); let last = null;
            addRay(p.x, p.y, p.x + dx * 1300, p.y + dy * 1300, 0);
            for (const z of g.zombies) {
                if (!live(z) || !inLine(z, p.x, p.y, dx, dy, 1300, 24)) continue;
                hitZ(id, z, dmg + (z.boss ? z.max * 0.015 : 0)); last = z;
            }
            if (last) { for (const z of g.zombies) if (live(z) && z !== last && Math.hypot(z.x - last.x, z.y - last.y) < 60 + z.size) hitZ(id, z, dmg * 0.3); spark(last.x, last.y, '#e8f4ff', 5); }   // splash without the screen shake, this thing fires ~9 times a second
            g.shake = Math.max(g.shake, 2);
        };
        SPECIAL.F_SOLAR = (p, t, id, m) => {
            const w = W(); w.lances = w.lances.filter(l => l.own !== p);
            w.lances.push({ own: p, id, a: ang(p, t), life: 90, max: 90, w: radOf(id, m), dmg: dmgOf(id, m) });
        };
    });

    // ================================================================== PER-TICK WORLD OBJECTS
    const tickOrbs = (w) => {
        for (let i = w.orbs.length - 1; i >= 0; i--) {
            const o = w.orbs[i]; o.life--; if (o.life <= 0 || !o.own) { w.orbs.splice(i, 1); continue; }
            o.a += o.sp;
            const rr = o.R * (0.72 + 0.4 * Math.sin(o.life * 0.05 + o.a * 0.5)), tx = o.own.x + Math.cos(o.a) * rr, ty = o.own.y + Math.sin(o.a) * rr;   // blades breathe in and out so they sweep zombies hugging you
            let mul = 1;
            if (!o.sky) { o.x = tx; o.y = ty; }
            else if (o.st === 0) {
                o.x = tx; o.y = ty;
                if (--o.cd <= 0) { const z = nearestTo(o.x, o.y, 300); if (z) { o.st = 1; o.tg = z; o.dd = 0; o.hd = false; } else o.cd = 14; }
            } else if (o.st === 1) {
                mul = 1.6;
                if (!live(o.tg)) o.tg = nearestTo(o.x, o.y, 300);
                if (!o.tg || o.dd > 360 || o.hd) o.st = 2;
                else { const d = Math.hypot(o.tg.x - o.x, o.tg.y - o.y) || 1; o.x += (o.tg.x - o.x) / d * 15; o.y += (o.tg.y - o.y) / d * 15; o.dd += 15; }
            } else {
                const d = Math.hypot(tx - o.x, ty - o.y) || 1;
                if (d < 20) { o.st = 0; o.cd = 55 + rnd() * 35; o.x = tx; o.y = ty; } else { o.x += (tx - o.x) / d * 17; o.y += (ty - o.y) / d * 17; }
            }
            for (const z of g.zombies) {
                if (!live(z) || Math.hypot(z.x - o.x, z.y - o.y) >= z.size + 16) continue;
                if (g.tick - (o.hits.get(z) || -99) < 20) continue;
                o.hits.set(z, g.tick); hitZ(o.id, z, o.dmg * mul); pushAway(z, o.own.x, o.own.y, 7); spark(z.x, z.y, '#c8e0ff', 3); if (o.sky && o.st === 1) o.hd = true;
            }
            if (o.hits.size > 40) for (const [z] of o.hits) if (z.dead) o.hits.delete(z);
        }
    };
    const tickRangs = (w) => {
        for (let i = w.rangs.length - 1; i >= 0; i--) {
            const r = w.rangs[i]; r.rot += 0.5;
            if (r.ph === 0) {
                r.x += r.vx; r.y += r.vy; r.d += r.sp;
                if (r.d >= r.max || !inArena(r.x, r.y, -4)) { r.ph = 1; r.hits.clear(); r.sp = 6; }
            } else {
                r.sp = Math.min(14, r.sp + 0.45); const d = Math.hypot(r.own.x - r.x, r.own.y - r.y) || 1;
                if (d < 22) { w.rangs.splice(i, 1); continue; }
                r.x += (r.own.x - r.x) / d * r.sp; r.y += (r.own.y - r.y) / d * r.sp;
            }
            for (const z of g.zombies) {
                if (!live(z) || r.hits.has(z) || Math.hypot(z.x - r.x, z.y - r.y) >= z.size + r.r) continue;
                r.hits.add(z); hitZ(r.id, z, r.dmg); spark(z.x, z.y, r.k ? '#d05050' : '#e0a060', 4);
            }
            for (const b of g.barrels) if (!b.dead && !r.hits.has(b) && Math.hypot(b.x - r.x, b.y - r.y) < 16 + r.r) { r.hits.add(b); withSrc(r.id, () => hurtBarrel(b, r.dmg)); }
        }
    };
    const tickNovas = (w) => {
        for (let i = w.novas.length - 1; i >= 0; i--) {
            const n = w.novas[i]; n.r += n.sp;
            for (const z of g.zombies) {
                if (!live(z) || n.hit.has(z) || Math.hypot(z.x - n.x, z.y - n.y) >= n.r + z.size * 0.4) continue;
                n.hit.add(z); hitZ(n.id, z, n.dmg); slowZ(z, n.slow); spark(z.x, z.y, '#8fe6ff', 3);
            }
            if (n.r >= n.max) w.novas.splice(i, 1);
        }
    };
    const tickMissiles = (w) => {
        for (let i = w.miss.length - 1; i >= 0; i--) {
            const m = w.miss[i];
            if (m.delay > 0) { m.delay--; m.x = m.own.x; m.y = m.own.y; continue; }
            if (!m.init) { m.init = true; m.tg = nearestTo(m.x, m.y, 900); }
            if (--m.life <= 0) { w.miss.splice(i, 1); continue; }
            if (!live(m.tg)) m.tg = nearestTo(m.x, m.y, 900);
            if (m.tg) {
                let d = Math.atan2(m.tg.y - m.y, m.tg.x - m.x) - m.a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
                m.a += clamp(d, -0.13, 0.13);
            }
            m.v = Math.min(9.5, m.v + 0.35); m.x += Math.cos(m.a) * m.v; m.y += Math.sin(m.a) * m.v;
            if (g.parts.length < 380 && g.tick % 2 === 0) g.parts.push({ x: m.x - Math.cos(m.a) * 6, y: m.y - Math.sin(m.a) * 6, vx: (rnd() - .5), vy: (rnd() - .5), life: 12, color: '#d0a070', s: 3 });
            let boom = !inArena(m.x, m.y, 0);
            if (!boom) for (const z of g.zombies) if (live(z) && Math.hypot(z.x - m.x, z.y - m.y) < z.size + 7) { boom = true; break; }
            if (boom) { w.miss.splice(i, 1); withSrc(m.id, () => explode(clamp(m.x, 0, 800), clamp(m.y, 0, 600), m.rad, m.dmg)); }
        }
    };
    const tickBolts = (w) => {
        for (let i = w.bolts.length - 1; i >= 0; i--) {
            const b = w.bolts[i]; b.t--;
            if (b.st === 0) { if (live(b.tg)) { b.x = b.tg.x; b.y = b.tg.y; } if (b.t <= 14) b.st = 1; }
            if (b.t <= 0) {
                w.bolts.splice(i, 1); if (w.fl.length < 14) w.fl.push({ x: b.x, y: b.y, life: 12, seed: rnd() * 99 });
                withSrc(b.id, () => explode(b.x, b.y, b.r, b.dmg)); if (live(b.tg)) hitZ(b.id, b.tg, b.dmg * 0.3);
                g.shake = Math.max(g.shake, 6); spark(b.x, b.y, '#fff27a', 8);
            }
        }
        for (let i = w.fl.length - 1; i >= 0; i--) if (--w.fl[i].life <= 0) w.fl.splice(i, 1);
    };
    const tickClouds = (w) => {
        for (let i = w.clouds.length - 1; i >= 0; i--) {
            const c = w.clouds[i]; if (--c.life <= 0) { w.clouds.splice(i, 1); continue; }
            const z = nearestTo(c.x, c.y, 320);
            if (z) { const d = Math.hypot(z.x - c.x, z.y - c.y) || 1; if (d > 20) { c.x += (z.x - c.x) / d * 0.6; c.y += (z.y - c.y) / d * 0.6; } }
            if (c.life % 10 === 0) for (const q of g.zombies) {
                if (!live(q) || Math.hypot(q.x - c.x, q.y - c.y) > c.r + q.size * 0.5) continue;
                hitZ(c.id, q, c.dps); slowZ(q, 0.62);
            }
        }
    };
    const tickMines = (w) => {
        for (let i = w.nm.length - 1; i >= 0; i--) {
            const n = w.nm[i];
            if (!g.zombies.some(z => live(z) && Math.hypot(z.x - n.x, z.y - n.y) < z.size + 14)) continue;
            w.nm.splice(i, 1); withSrc(n.id, () => explode(n.x, n.y, n.rad, n.dmg));
            if (g.hz.length < 40) g.hz.push({ k: 'f', x: n.x, y: n.y, r: n.rad * 0.85, t: 240, max: 240, dps: n.dps, src: n.id, born: g.tick });
        }
    };
    const tickLances = (w) => {
        for (let i = w.lances.length - 1; i >= 0; i--) {
            const l = w.lances[i]; if (--l.life <= 0 || !l.own) { w.lances.splice(i, 1); continue; }
            const t = nearestTo(l.own.x, l.own.y, 700);
            if (t) { let d = Math.atan2(t.y - l.own.y, t.x - l.own.x) - l.a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; l.a += clamp(d, -0.05, 0.05); }
            if (l.life % 5 === 0) { const dx = Math.cos(l.a), dy = Math.sin(l.a); for (const z of g.zombies) if (live(z) && inLine(z, l.own.x, l.own.y, dx, dy, 1000, l.w)) hitZ(l.id, z, l.dmg); }
        }
        for (let i = w.rays.length - 1; i >= 0; i--) if (--w.rays[i].life <= 0) w.rays.splice(i, 1);
    };
    const tickBullets = () => {
        const now = gameNow();
        for (let i = g.bullets.length - 1; i >= 0; i--) {
            const b = g.bullets[i];
            if (b.maxT && now - b.born > b.maxT) { g.bullets.splice(i, 1); continue; }
            if (b.vd) for (const z of g.zombies) {   // Void Saw: drag the horde into its path
                if (!live(z)) continue; const dx = b.x - z.x, dy = b.y - z.y, d = Math.hypot(dx, dy) || 1;
                if (d < 130 && d > 8) { const f = z.boss ? 0.5 : 2.4; z.x = clamp(z.x + dx / d * f, 10, 790); z.y = clamp(z.y + dy / d * f, 10, 590); }
            }
        }
    };

    // ================================================================== PERKS
    const pkOf = (id) => (g.pk && g.pk[id]) || 0;
    safe('perks', () => {
        const P = (id, o) => { UPGRADES[id] = o; };
        P('crit',     { icon: 'crit',      name: 'Sharpshooter',    max: 4, desc: 'Hits have a chance to crit for extra damage. +10% crit chance each level (base 5%).',               color: 'var(--mustard)', fn: () => addPk('crit') });
        P('critdmg',  { icon: 'critdmg',   name: 'Killer Instinct', max: 3, desc: 'Crits hit much harder: +50% crit damage each level (base crit is x1.75). Pairs with Sharpshooter.',                       color: 'var(--blood)',   fn: () => addPk('critdmg') });
        P('pierce',   { icon: 'pierce',    name: 'Piercing Rounds', max: 3, desc: 'Bullets punch through 1 more zombie each level (each pass loses a little damage).',                  color: 'var(--steel)',   fn: () => addPk('pierce') });
        P('lucky',    { icon: 'clover',    name: 'Lucky Drops',     max: 3, desc: 'More pickups and more material drops (shards, cores, embers).',                                    color: 'var(--olive)',   fn: () => { addPk('lucky'); g.dropBonus = (g.dropBonus || 0) + 0.05; } });
        P('sat',      { icon: 'satellite', name: 'Satellites',      max: 4, desc: 'Small orbs circle you for the rest of the run and burn whatever they touch. More orbs each level.',  color: 'var(--steel)',   fn: () => addPk('sat') });
        P('zap',      { icon: 'bolt',      name: 'Static Discharge', max: 3, desc: 'Your hits sometimes arc lightning to a nearby zombie.',                                            color: 'var(--mustard)', fn: () => addPk('zap') });
        P('frost',    { icon: 'snow',      name: 'Frost Touch',     max: 3, desc: 'Everything you hit is slowed. Stronger each level (bosses resist half).',                           color: 'var(--steel)',   fn: () => addPk('frost') });
        P('salv',     { icon: 'salvage',   name: 'Salvager',        max: 3, desc: 'Kills sometimes drop scrap, elites drop more, and materials drop more often.',                      color: 'var(--mustard)', fn: () => addPk('salv') });
        P('shield',   { icon: 'overheal',  name: 'Overheal Barrier', max: 3, desc: 'A rechargeable shield soaks damage first. It recharges when nothing has hit you for a few seconds.', color: 'var(--steel)',   fn: () => addPk('shield') });
        P('dodge',    { icon: 'evade',     name: 'Evasion',         max: 3, desc: '7% dodge chance per level: you simply are not there when it hits.',                                  color: 'var(--olive)',   fn: () => addPk('dodge') });
        P('berserk',  { icon: 'rage',      name: 'Berserker',       max: 3, desc: 'The lower your health, the harder you hit: up to +30% per level at death\'s door.',                 color: 'var(--blood)',   fn: () => addPk('berserk') });
        P('warp',     { icon: 'hourglass', name: 'Time Warp',       max: 3, desc: 'Zombies near you move slower. Wider and stronger each level.',                                       color: 'var(--violet,#a58bc2)', fn: () => addPk('warp') });
        P('second',   { icon: 'revive',    name: 'Second Chance',   max: 2, desc: 'Once per wave, a killing blow instead heals you and blasts nearby zombies away.',                    color: 'var(--rust)',    fn: () => addPk('second') });
        P('fleet',    { icon: 'boot',      name: 'Fleet Foot',      max: 3, desc: '+1 speed patch each level. Outrun everything.',                                                      color: 'var(--olive)',   fn: () => { addPk('fleet'); g.speedLvl++; } });
    });

    // ================================================================== ONE-HIT CAP (nobody gets deleted by a single hit)
    // A single hit from a normal weapon can take at most `cap` x the target's MAX HP. The clipped part is not thrown away: `bleed` of it
    // comes back as a short damage-over-time, so overkill weapons keep roughly their DPS against tough targets but cannot one-shot.
    // Weapon Lab weapons (ids starting CW_) are exempt unless STUDIO.balance.hitCap(id) says otherwise.
    A.hitCap = { enabled: true, normal: 0.40, elite: 0.25, boss: 0.08, bleed: 0.7, bleedMax: 0.7, over: {} /* per-weapon fractions, e.g. { MINES: 0.5 } */ };
    const capOf = (z, id) => {
        const B = window.STUDIO && STUDIO.balance;
        if (B && typeof B.hitCap === 'function') { try { const v = B.hitCap(id); if (typeof v === 'number' && v > 0) return v; } catch (e) { /* studio bug must not break combat */ } }
        if (id && String(id).indexOf('CW_') === 0) return Infinity;
        const hc = A.hitCap; if (hc.over[id] > 0) return hc.over[id];
        return z.boss ? hc.boss : (z.elite ? hc.elite : hc.normal);
    };
    // fire-rate compensation for the slow burst weapons whose damage was mostly overkill (so they are not dead after the cap)
    safe('cap-comp', () => { WEAPON_DATA.TURRET.cooldown = 5000; WEAPON_DATA.GRAV.cooldown = 8500; });
    A.debug = null;   // set to [] to log every hit: [src, raw dmg, capped dmg, max hp, class]
    const capHit = (z, dmg) => {
        if (A.bypass || !(z.max > 0) || (!A.hitCap.enabled && !A.debug)) return dmg;
        const id = g.src || '', cap = capOf(z, id), arm = 1 - (z.armor || 0), eff = dmg * arm;
        // the budget is per target, per source, per tick: a shotgun blast (7 pellets) or an explosion that also clips the same zombie is ONE hit
        let lim = cap * z.max; const cb = z.cb || (z.cb = { t: -1, s: '', u: 0 });
        const same = cb.t === g.tick && cb.s === id; if (same) lim = Math.max(0, lim - cb.u);
        if (A.debug) A.debug.push([id, eff, Math.min(eff, lim), z.max, z.boss ? 'boss' : (z.elite ? 'elite' : 'normal')]);
        if (!A.hitCap.enabled) return dmg;
        const used = Math.min(eff, lim);
        if (same) cb.u += used; else { cb.t = g.tick; cb.s = id; cb.u = used; }
        if (!(eff > lim)) return dmg;
        const ex = (eff - lim) * A.hitCap.bleed;
        if (ex > 0.5 && !z.dead) { const b = z.bl || (z.bl = { amt: 0, n: 0, src: id }); b.amt = Math.min(z.max * A.hitCap.bleedMax, b.amt + ex); b.n = 12; b.src = id; }
        return lim / arm;
    };
    // one-button wipes (Nuke, Big Red Button, Clutch): heavy damage + stun instead of an instant kill. Bosses barely notice.
    A.bigHit = (z, frac, stun) => {
        if (z.dead) return;
        const f = z.boss ? 0.1 : (z.elite ? frac * 0.6 : frac);
        A.bypass = true; try { withSrc('BLAST', () => hurt(z, z.max * f)); } finally { A.bypass = false; }
        if (!z.dead) z.stunT = Math.max(z.stunT || 0, z.boss ? 40 : (stun || 150));
    };
    const tickCombatFx = () => {
        const bleedStep = g.tick % 10 === 0;
        for (const z of g.zombies) {
            if (z.dead) continue;
            if (z.stunT > 0) { z.stunT--; z.slow = 0; }
            if (bleedStep && z.bl) {
                const b = z.bl, d = b.amt / Math.max(1, b.n); b.amt -= d; if (--b.n <= 0) z.bl = null;
                A.bypass = true; try { withSrc(b.src, () => hurt(z, d)); } finally { A.bypass = false; }
            }
        }
    };

    let inZap = false;
    A.onHurt = (z, dmg) => {
        if (A.bypass) return dmg;
        const pk = g.pk; if (!pk) return dmg;
        if (pk.berserk) { const pl = g.player; dmg *= 1 + 0.3 * pk.berserk * (1 - clamp(pl.hp / pl.maxHp, 0, 1)); }
        if (pk.crit || pk.critdmg) {
            if (rnd() < 0.05 + 0.1 * (pk.crit || 0)) {
                dmg *= 1.75 + 0.5 * (pk.critdmg || 0);
                if (g.pops.length < 40 && rnd() < 0.5) g.pops.push({ x: z.x, y: z.y - z.size - 8, txt: 'CRIT', life: 26 });
            }
        }
        if (pk.frost) slowZ(z, 0.8 - 0.12 * pk.frost);
        if (pk.zap && !inZap) {
            const w = g.aw;
            if (w && w.zap > 0 && rnd() < 0.1 * pk.zap) {
                const o = nearestTo(z.x, z.y, 150, new Set([z]));
                if (o) {
                    w.zap--; inZap = true;
                    try {
                        if (g.arcs.length < 20) { const pts = [[Math.round(z.x), Math.round(z.y)], [Math.round(o.x), Math.round(o.y)]]; g.arcs.push({ pts, life: 10 }); evPush(['a', pts]); }
                        hurt(o, dmg * 0.5 + 10 * pk.zap);
                    } finally { inZap = false; }
                }
            }
        }
        return dmg;
    };
    A.capHit = capHit;   // called from hurt() AFTER every other damage multiplier (content perks included)

    A.onHit = (d) => {
        const pk = g.pk; if (!pk) return d;
        const w = g.aw, p = g.player;
        if (pk.dodge && rnd() < 0.07 * pk.dodge) { if (d > 0.5) popSync(p.x, p.y - 34, 'DODGE'); return 0; }
        if (w && w.sh > 0) {
            const a = Math.min(d, w.sh); w.sh -= a; d -= a; w.shT = Math.max(120, 330 - 40 * pkOf('shield'));
            if (d <= 0.001) return 0;
        } else if (w && pk.shield) w.shT = Math.max(120, 330 - 40 * pk.shield);
        if (pk.second && g.scW !== g.wave && p.hp - d * (g.dmgTaken || 1) <= 0) {
            g.scW = g.wave; p.hp = Math.max(p.hp, p.maxHp * (0.3 + 0.2 * pk.second)); g.invuln = 90; g.shake = Math.max(g.shake, 14);
            g.vfx.push({ x: p.x, y: p.y, r: 0, max: 200, a: 1 });
            for (const z of g.zombies) if (live(z) && Math.hypot(z.x - p.x, z.y - p.y) < 220) { pushAway(z, p.x, p.y, 120); z.slow = Math.min(z.slow, 0.3); }
            g.banner = { text: 'Second Chance', sub: 'Not yet.', life: 100 };
            return 0;
        }
        return d;
    };

    A.pierce = (b, z) => {
        const n = g.pk && g.pk.pierce; if (!n || b.id === 'HOSE' || b.splash || b.saw) return false;
        if (b.pr === undefined) b.pr = n;
        if (b.pr <= 0) return false;
        b.pr--; (b.ph || (b.ph = new Set())).add(z); b.dmg *= 0.85; return true;
    };

    const tickPerks = (w) => {
        const pk = g.pk || {}, p = g.player;
        // Satellites
        const n = pk.sat ? pk.sat + 1 : 0;
        if (n) {
            w.satA += 0.06;
            if (!w.satH) w.satH = [];
            const dmg = (12 + g.wave * 0.8) * dmgMul() * (1 + 0.25 * (pk.sat - 1));
            w.sat = [];
            for (let i = 0; i < n; i++) {
                const a = w.satA + i * TAU / n, x = p.x + Math.cos(a) * 54, y = p.y + Math.sin(a) * 54; w.sat.push([x, y]);
                const hm = w.satH[i] || (w.satH[i] = new Map());
                for (const z of g.zombies) {
                    if (!live(z) || Math.hypot(z.x - x, z.y - y) >= z.size + 8) continue;
                    if (g.tick - (hm.get(z) || -99) < 22) continue; hm.set(z, g.tick); hitZ('SAT', z, dmg);
                }
                if (hm.size > 40) for (const [z] of hm) if (z.dead) hm.delete(z);
            }
        } else w.sat = [];
        // Overheal barrier
        const mx = pk.shield ? 20 + 15 * pk.shield : 0;
        if (w.shMax !== mx) { w.sh += Math.max(0, mx - w.shMax); w.shMax = mx; if (w.sh > mx) w.sh = mx; }
        if (mx) { if (w.shT > 0) w.shT--; else if (w.sh < mx) w.sh = Math.min(mx, w.sh + 0.3); }
        // Time Warp
        if (pk.warp) {
            const R = 110 + 30 * pk.warp, f = 0.82 - 0.1 * pk.warp; w.warpP = [p.x, p.y, R];
            for (const z of g.zombies) if (live(z) && Math.hypot(z.x - p.x, z.y - p.y) < R + z.size) slowZ(z, f);
        } else w.warpP = null;
    };

    // ================================================================== MAIN TICK (called from update() right after specialsTick)
    // hold-to-use weapons (the Spoon Railgun): same feel as the Water Cannon. Drains while held, locks out until fully recharged when empty.
    // State lives in g.charges / g.lastShot, which party members each have their own copy of.
    A.hold = (id, p, m) => {
        const c = g.charges, k = id + 'T', rk = id + 'R'; if (c[id] === undefined) c[id] = 20000;
        const el = Math.max(1, g.tick - (c[k] || g.tick)); c[k] = g.tick;
        if (c[rk]) { c[id] += 120 * el; if (c[id] >= 20000) { c[id] = 20000; c[rk] = 0; } return; }
        c[id] -= 60; if (c[id] <= 0) { c[id] = 0; c[rk] = 1; }
        const now = gameNow(); if (now - (g.lastShot[id] || 0) < (isFrenzy() ? 10 : 80)) return;
        const t = nearest(p.x, p.y); if (!t) return; g.lastShot[id] = now; SPECIAL[id](p, t, id, m);
    };
    A.tick = () => {
        const w = W(); A.lastN = 1 + (g.peers ? g.peers.length : 0); w.zap = 4; GM();
        safe('orbs', () => tickOrbs(w)); safe('rangs', () => tickRangs(w)); safe('novas', () => tickNovas(w)); safe('miss', () => tickMissiles(w));
        safe('bolts', () => tickBolts(w)); safe('clouds', () => tickClouds(w)); safe('mines', () => tickMines(w)); safe('lances', () => tickLances(w));
        safe('combatfx', tickCombatFx); safe('bullets', tickBullets); safe('perks', () => tickPerks(w));
    };

    // ================================================================== MATERIALS (drops while a run is live)
    const FIREISH = { FIRE: 1, F_NAPALM: 1, MINES: 1, GRAV: 1, MISL: 1, F_TEMPEST: 1, THUN: 1 };
    A.onKill = (z) => {
        const m = GM(), pk = g.pk || {}, luck = 1 + 0.35 * (pk.lucky || 0) + 0.5 * (pk.salv || 0);
        const gain = (k, n) => { m[k] += n; popSync(z.x, z.y - (z.size || 14) - 14, '+' + n + ' ' + k); };
        if (z.boss) {
            gain('core', 1 + (g.wave >= 20 ? 1 : 0) + (g.wave >= 40 ? 1 : 0) + (pk.salv ? 1 : 0));
            m.shard += 2; m.ember += 1 + (g.wave >= 30 ? 1 : 0);
            return;
        }
        if (z.noDrop) return;
        if (z.elite) gain('shard', 1 + (rnd() < 0.3 * luck ? 1 : 0));
        else if (z.type === 'heavy' ? rnd() < 0.05 * luck : rnd() < 0.004 * luck) gain('shard', 1);
        if (FIREISH[z.src] && rnd() < 0.02 * luck) gain('ember', 1);
        else if (g.wave > 0 && g.wave % 10 === 0 && rnd() < 0.03) gain('ember', 1);
        if (pk.salv && g.pickups.length < 40 && rnd() < (z.elite ? 0.3 : 0.03) * pk.salv) g.pickups.push({ x: clamp(z.x, 30, 770), y: clamp(z.y, 30, 570), kind: 'SCRAP', born: g.tick, life: 900 });
    };

    const matsOf = (u) => { const m = u.mats = (u.mats && typeof u.mats === 'object') ? u.mats : {}; ['shard', 'core', 'ember'].forEach(k => { m[k] = Math.max(0, Math.floor(+m[k] || 0)); }); return m; };
    A.fixUser = (data) => { try { matsOf(data); } catch (e) { /* ignore */ } return data; };
    A.runEnd = (u) => {
        let txt = '';
        safe('runEnd', () => {
            let tot, n;
            if (MP.role === 'guest') { const r = A.remote; tot = r && r.m; n = (r && r.n) || 1; }
            else { tot = g.mats; n = Math.max(1, A.lastN || 1); }
            if (!tot) return;
            const m = matsOf(u), parts = [], keys = ['shard', 'core', 'ember'];
            keys.forEach((k, i) => { const v = Array.isArray(tot) ? tot[i] : tot[k]; const share = Math.floor((v || 0) / n); if (share > 0) { m[k] += share; parts.push(`+${share} ${k}${share > 1 && k !== 'ember' ? 's' : (share > 1 ? 's' : '')}`); } });
            if (parts.length) { txt = ', ' + parts.join(' '); save({ mats: m }); }
        });
        A.remote = null;
        return txt;
    };

    // ================================================================== PARTY SYNC (host builds a compact list, guests just draw it)
    const r1 = Math.round;
    const build = () => {
        const w = g.aw, L = [];
        if (!w) return { l: L, m: 0, n: 1 };
        w.orbs.forEach(o => { if (L.length < 150) L.push(['o', r1(o.x), r1(o.y), +o.a.toFixed(2), r1(o.own.x), r1(o.own.y), r1(Math.hypot(o.x - o.own.x, o.y - o.own.y)), o.sky]); });
        w.rangs.forEach(r => L.push(['r', r1(r.x), r1(r.y), +r.rot.toFixed(1), r.k]));
        w.novas.forEach(n => L.push(['n', r1(n.x), r1(n.y), r1(n.r), r1(n.max), n.k]));
        w.miss.forEach(m => { if (m.delay <= 0) L.push(['m', r1(m.x), r1(m.y), +m.a.toFixed(2)]); });
        w.bolts.forEach(b => L.push(['t', r1(b.x), r1(b.y), b.t, b.st, b.r]));
        w.fl.forEach(f => L.push(['T', r1(f.x), r1(f.y), f.life, f.seed | 0]));
        w.clouds.forEach(c => L.push(['c', r1(c.x), r1(c.y), r1(c.r), c.life, c.max]));
        w.nm.forEach(n => L.push(['k', r1(n.x), r1(n.y)]));
        w.rays.forEach(r => L.push(['y', r1(r.x1), r1(r.y1), r1(r.x2), r1(r.y2), r.life, r.k]));
        w.lances.forEach(l => L.push(['l', r1(l.own.x), r1(l.own.y), +l.a.toFixed(2), l.w, l.life, l.max]));
        w.sat.forEach(s => L.push(['e', r1(s[0]), r1(s[1])]));
        g.bullets.forEach(b => { if (b.vd && L.length < 170) L.push(['v', r1(b.x), r1(b.y), b.r]); });
        if (w.sh > 0.5 && w.shMax) L.push(['h', r1(g.player.x), r1(g.player.y), +(w.sh / w.shMax).toFixed(2)]);
        if (w.warpP) L.push(['w', r1(w.warpP[0]), r1(w.warpP[1]), r1(w.warpP[2])]);
        const m = g.mats;
        return { l: L, m: m ? [m.shard, m.core, m.ember] : 0, n: 1 + (g.peers ? g.peers.length : 0) };
    };
    A.snap = () => (g.aw ? build() : 0);
    A.applySnap = (d) => { A.remote = d || null; if (d && d.m) { const n = d.n || 1; g.mats = { shard: Math.floor(d.m[0] / n), core: Math.floor(d.m[1] / n), ember: Math.floor(d.m[2] / n) }; } };

    // ================================================================== DRAWING (one path for host and guests)
    const glow = (c, col, blur) => { c.shadowColor = col; c.shadowBlur = blur; };
    const DR = {
        o(c, e, t) {   // blade
            const [, x, y, a, cx, cy, R, sky] = e;
            c.save(); c.lineCap = 'round';
            c.strokeStyle = sky ? 'rgba(154,208,255,.28)' : 'rgba(200,224,255,.25)'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, R, a - 0.9, a); c.stroke();
            c.translate(x, y); c.rotate(a + Math.PI / 2 + t * 6); glow(c, sky ? '#9ad0ff' : '#c8e0ff', 10);
            c.fillStyle = sky ? '#cfe8ff' : '#e8f0ff'; c.strokeStyle = '#5a6a80'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(0, -13); c.quadraticCurveTo(10, -2, 0, 11); c.quadraticCurveTo(-3, 0, 0, -13); c.fill(); c.stroke();
            c.restore();
        },
        r(c, e, t) {   // rang
            const [, x, y, rot, k] = e;
            c.save(); c.translate(x, y); c.rotate(rot); glow(c, k ? '#ff5050' : '#ffb060', 8);
            c.fillStyle = k ? '#d05050' : '#d9b070'; c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(-3, -12); c.lineTo(-3, 12); c.lineTo(3, 12); c.lineTo(3, -4); c.quadraticCurveTo(14, -6, 15, -15); c.quadraticCurveTo(6, -14, -3, -12); c.fill(); c.stroke();
            if (k) { c.fillStyle = '#fff'; c.beginPath(); c.arc(8, -10, 2, 0, TAU); c.fill(); }
            c.restore();
        },
        n(c, e) {   // nova ring
            const [, x, y, r, mx, k] = e, a = Math.max(0, 1 - r / (mx + 1)) * 0.9 + 0.1;
            c.save(); glow(c, k ? '#6fe0ff' : '#8fe6ff', 14);
            c.fillStyle = `rgba(143,230,255,${a * 0.18})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
            c.strokeStyle = `rgba(220,250,255,${a})`; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
            c.strokeStyle = `rgba(143,230,255,${a * 0.6})`; c.lineWidth = 2;
            for (let i = 0; i < 10; i++) { const q = i / 10 * TAU + r * 0.01; c.beginPath(); c.moveTo(x + Math.cos(q) * (r - 10), y + Math.sin(q) * (r - 10)); c.lineTo(x + Math.cos(q) * (r + 6), y + Math.sin(q) * (r + 6)); c.stroke(); }
            c.restore();
        },
        m(c, e) {   // missile
            const [, x, y, a] = e;
            c.save(); c.translate(x, y); c.rotate(a); glow(c, '#ff9040', 10);
            c.fillStyle = '#ffb040'; c.beginPath(); c.moveTo(-6, 0); c.lineTo(-14 - Math.random() * 5, -3); c.lineTo(-14 - Math.random() * 5, 3); c.fill();
            c.fillStyle = '#e8e8e8'; c.strokeStyle = '#444'; c.lineWidth = 1; c.fillRect(-7, -3, 12, 6); c.strokeRect(-7, -3, 12, 6);
            c.fillStyle = '#e04030'; c.beginPath(); c.moveTo(5, -3); c.lineTo(10, 0); c.lineTo(5, 3); c.fill();
            c.fillStyle = '#c03020'; c.fillRect(-7, -5, 3, 2); c.fillRect(-7, 3, 3, 2);
            c.restore();
        },
        t(c, e, t) {   // thunder mark
            const [, x, y, left, st, r] = e, k = Math.min(1, left / 40);
            c.save(); glow(c, '#fff27a', 8); c.strokeStyle = st ? 'rgba(255,255,255,.95)' : 'rgba(255,242,122,.85)'; c.lineWidth = 2;
            c.beginPath(); c.arc(x, y, r * (0.45 + k * 0.55), 0, TAU); c.stroke();
            c.beginPath(); c.arc(x, y, r * 0.25, 0, TAU); c.stroke();
            c.beginPath(); c.moveTo(x - r * 0.7, y); c.lineTo(x + r * 0.7, y); c.moveTo(x, y - r * 0.7); c.lineTo(x, y + r * 0.7); c.stroke();
            if (st) { c.fillStyle = 'rgba(255,242,122,.18)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
            c.restore();
        },
        T(c, e) {   // lightning bolt
            const [, x, y, life, seed] = e, a = life / 12;
            c.save(); glow(c, '#fff27a', 20); c.strokeStyle = `rgba(255,255,230,${a})`; c.lineWidth = 4 * a + 1; c.beginPath(); c.moveTo(x + Math.sin(seed) * 30, -10);
            const N = 7; for (let i = 1; i <= N; i++) { const f = i / N; c.lineTo(x + (i < N ? Math.sin(seed * (i + 1) + life) * 22 * (1 - f) : 0), -10 + (y + 10) * f); }
            c.stroke(); c.fillStyle = `rgba(255,242,122,${a * 0.35})`; c.beginPath(); c.arc(x, y, 50 * (1.2 - a * 0.4), 0, TAU); c.fill(); c.restore();
        },
        c(c, e, t) {   // toxic cloud
            const [, x, y, r, life, mx] = e, a = Math.min(1, life / 40, (mx - life) / 20 + 0.3);
            c.save();
            for (let i = 0; i < 7; i++) {
                const q = i * 2.4 + t * 0.6, rr = r * (0.45 + 0.2 * Math.sin(t * 1.3 + i)), ox = Math.cos(q) * r * 0.5, oy = Math.sin(q * 1.3) * r * 0.4;
                c.fillStyle = `rgba(${110 + i * 8},${200 - i * 6},60,${0.13 * a})`; c.beginPath(); c.arc(x + ox, y + oy, rr, 0, TAU); c.fill();
            }
            c.strokeStyle = `rgba(150,230,80,${0.35 * a})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.restore();
        },
        k(c, e, t) {   // napalm mine
            const [, x, y] = e, blink = (t * 4 | 0) % 2;
            c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill(); c.strokeStyle = '#ff7a1f'; c.lineWidth = 2; c.stroke();
            c.fillStyle = blink ? '#ffd23a' : '#a03a10'; c.fillRect(x - 2, y - 2, 4, 4);
        },
        y(c, e) {   // cryo ray
            const [, x1, y1, x2, y2, life] = e, a = life / 16;
            c.save(); c.lineCap = 'round'; glow(c, '#6fe0ff', 16);
            c.strokeStyle = `rgba(111,224,255,${a * 0.5})`; c.lineWidth = 16 * a + 2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
            c.strokeStyle = `rgba(235,255,255,${a})`; c.lineWidth = 5 * a + 1; c.stroke(); c.restore();
        },
        l(c, e, t) {   // solar lance
            const [, x, y, a, w, life, mx] = e, f = Math.min(1, life / 15, (mx - life) / 8 + 0.2), len = 1000;
            c.save(); c.translate(x, y); c.rotate(a);
            const gr = c.createLinearGradient(0, -w, 0, w); gr.addColorStop(0, 'rgba(255,150,30,0)'); gr.addColorStop(0.5, `rgba(255,220,90,${0.55 * f})`); gr.addColorStop(1, 'rgba(255,150,30,0)');
            c.fillStyle = gr; c.fillRect(0, -w * 1.4, len, w * 2.8);
            glow(c, '#ffd23a', 18); c.fillStyle = `rgba(255,255,230,${0.9 * f})`; c.fillRect(0, -w * 0.28 - Math.sin(t * 40) * 1.5, len, w * 0.56 + Math.sin(t * 40) * 3);
            c.restore();
        },
        e(c, e, t) {   // satellite orb
            const [, x, y] = e; c.save(); glow(c, '#9ad0ff', 10);
            c.fillStyle = '#cfe8ff'; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill(); c.fillStyle = '#4a90d0'; c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); c.restore();
        },
        v(c, e, t) {   // void saw aura + blade
            const [, x, y, r] = e; c.save(); c.translate(x, y);
            c.fillStyle = 'rgba(176,75,255,.12)'; c.beginPath(); c.arc(0, 0, 130, 0, TAU); c.fill();
            c.strokeStyle = 'rgba(190,110,255,.5)'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, 40 + i * 28, t * (3 + i) + i, t * (3 + i) + i + 3.6); c.stroke(); }
            c.rotate(t * 11); glow(c, '#b04bff', 14); c.fillStyle = '#2a0f45'; c.strokeStyle = '#c070ff'; c.lineWidth = 2; c.beginPath();
            for (let k = 0; k < 20; k++) { const rr = k % 2 ? r * 0.72 : r * 1.12, q = k / 20 * TAU; c.lineTo(Math.cos(q) * rr, Math.sin(q) * rr); } c.closePath(); c.fill(); c.stroke();
            c.fillStyle = '#05010a'; c.beginPath(); c.arc(0, 0, r * 0.35, 0, TAU); c.fill(); c.restore();
        },
        h(c, e, t) {   // overheal barrier
            const [, x, y, f] = e; c.save(); c.strokeStyle = `rgba(100,170,255,${0.35 + 0.4 * f})`; c.lineWidth = 3; glow(c, '#6fb0ff', 8);
            c.beginPath(); c.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.stroke(); c.restore();
        },
        w(c, e, t) {   // time warp field
            const [, x, y, R] = e; c.save(); c.strokeStyle = 'rgba(165,139,194,.28)'; c.lineWidth = 2; c.setLineDash([6, 8]); c.lineDashOffset = -t * 20;
            c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke(); c.restore();
        }
    };
    // charge meter above your head for hold-to-use weapons (Water Cannon, Spoon Railgun): fill = charge left, red and flashing while it recharges
    const drawCharge = (c, t) => {
        if (MP.role === 'guest' || !g.player || !currentUserData) return;
        let row = 0;
        for (const id of currentUserData.loadout) {
            const m = WEAPON_DATA[id]; if (!m || !(id === 'HOSE' || m.hold)) continue;
            const v = id === 'HOSE' ? g.charges.HOSE : g.charges[id], rec = id === 'HOSE' ? g.isHoseRecharging : g.charges[id + 'R'];
            if (v === undefined || (v >= 20000 && !rec)) continue;
            const f = Math.max(0, Math.min(1, v / 20000)), w = 46, x = g.player.x - w / 2, y = g.player.y - 46 - row * 20; row++;
            c.save(); c.globalAlpha = 0.95; c.fillStyle = '#0a0908'; c.fillRect(x - 2, y - 2, w + 4, 9);
            c.fillStyle = rec ? (t * 6 % 1 < 0.5 ? '#ff4d3a' : '#a82a20') : (f < 0.25 ? '#ffb02e' : (m.color || '#4dd2ff'));
            c.fillRect(x, y, Math.round(w * f), 5);
            c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.strokeRect(x - 0.5, y - 0.5, w + 1, 6);
            c.font = 'bold 9px "Courier Prime", monospace'; c.textAlign = 'center'; c.fillStyle = rec ? '#ff8a7a' : '#fff'; c.fillText(rec ? 'RECHARGING' : Math.round(f * 100) + '%', g.player.x, y - 4);
            c.restore();
        }
    };
    A.draw = (c, t) => {
        safe('charge', () => drawCharge(c, t));
        const L = (MP.role === 'guest') ? (A.remote && A.remote.l) : build().l;
        if (!L || !L.length) return;
        c.save();
        for (const e of L) { const f = DR[e[0]]; if (f) { try { f(c, e, t); } catch (er) { /* a bad entry must not kill the frame */ } c.shadowBlur = 0; c.setLineDash([]); } }
        c.restore();
    };

    // ================================================================== THE FORGE
    const RECIPES = [
        { id: 'F_TEMPEST',   a: 'ARC',   b: 'SLING', scraps: 40,  mats: { shard: 4 } },
        { id: 'F_NAPALM',    a: 'FIRE',  b: 'MINES', scraps: 50,  mats: { shard: 3, ember: 2 } },
        { id: 'F_REAPER',    a: 'BOOMA', b: 'SAWB',  scraps: 60,  mats: { shard: 4, core: 1 } },
        { id: 'F_VOIDSAW',   a: 'SAWB',  b: 'GRAV',  scraps: 2500, mats: { shard: 50, core: 25, ember: 20 } },
        { id: 'F_SKYBLADES', a: 'DRONE', b: 'ORBB',  scraps: 90,  mats: { shard: 6, core: 1, ember: 2 } },
        { id: 'F_CRYORAIL',  a: 'RAIL',  b: 'NOVA',  scraps: 100, mats: { shard: 6, core: 2 } },
        { id: 'F_SOLAR',     a: 'ORBIT', b: 'RAIL',  scraps: 160, mats: { shard: 8, core: 4, ember: 4 } },
        { id: 'F_TIDAL',     a: 'HOSE',  b: 'WEP_100', scraps: 600,  mats: { shard: 20, core: 8,  ember: 6 } },
        { id: 'F_ROCKLADLE', a: 'WEP_9', b: 'WEP_100', scraps: 900,  mats: { shard: 25, core: 10, ember: 8 } },
        { id: 'F_SPOONRAIL', a: 'WEP_100', b: 'RAIL',  scraps: 1500, mats: { shard: 35, core: 15, ember: 12 } }
    ];
    A.RECIPES = RECIPES;
    const MAT_UI = { shard: ['Shard', 'mat_shard', '#7fd0e8'], core: ['Core', 'mat_core', '#e58fb0'], ember: ['Ember', 'mat_ember', '#ff9a3a'] };
    const $ = (id) => document.getElementById(id);
    const ic = (n, c) => { try { return iconImg(n, c || 'icn sm'); } catch (e) { return ''; } };
    const css = `
#forge-modal { z-index: 95; }
#forge-modal .forge-box { width: min(920px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; border-color: var(--rust); }
#forge-modal .fg-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
#forge-modal h2 { color: var(--rust); font-size: 26px; display: flex; align-items: center; gap: 8px; }
#forge-modal .fg-res { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 4px; }
#forge-modal .fg-pill { display: inline-flex; align-items: center; gap: 6px; background: var(--panel-2); border: 2px solid var(--line); border-radius: var(--r-sm); padding: 4px 10px; font-weight: 700; }
#forge-modal .fg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-top: 12px; }
#forge-modal .fg-card { background: var(--panel-2); border: 2px solid var(--line); border-radius: var(--r); padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 3px 3px 0 #0a0908; }
#forge-modal .fg-card.ready { border-color: var(--olive); }
#forge-modal .fg-card.done { border-color: var(--steel); opacity: .8; }
#forge-modal .fg-recipe { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
#forge-modal .fg-ing { flex: 1; text-align: center; font-size: 11px; background: #17130f; border: 2px solid var(--line); border-radius: var(--r-sm); padding: 6px 4px; min-width: 0; }
#forge-modal .fg-ing.have { border-color: var(--olive); }
#forge-modal .fg-ing.miss { border-color: var(--blood); color: var(--dim); }
#forge-modal .fg-ing .big { font-size: 26px; line-height: 1.1; display: block; }
#forge-modal .fg-plus { color: var(--mustard); font-size: 20px; font-weight: 700; }
#forge-modal .fg-arrow { text-align: center; color: var(--rust); font-size: 18px; line-height: 1; }
#forge-modal .fg-out { display: flex; align-items: center; gap: 10px; }
#forge-modal .fg-out .big { font-size: 34px; }
#forge-modal .fg-name { color: var(--mustard); font-family: 'Special Elite', monospace; font-size: 18px; }
#forge-modal .fg-cost { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
#forge-modal .fg-cost span { display: inline-flex; align-items: center; gap: 4px; background: #17130f; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 6px; }
#forge-modal .fg-cost .no { color: var(--blood); border-color: var(--blood); }
#forge-modal .fg-cost .yes { color: var(--ink); }
#forge-modal .fg-note { font-size: 12px; color: var(--dim); margin-top: 6px; }
#forge-modal .icn.sm { width: 16px; height: 16px; }
`;
    safe('forge-ui', () => {
        const st = document.createElement('style'); st.id = 'forge-css'; st.textContent = css; document.head.appendChild(st);
        const m = document.createElement('div'); m.id = 'forge-modal'; m.className = 'overlay hidden';
        m.innerHTML = `<div class="panel forge-box"><div class="fg-head"><h2><span id="fg-ic"></span>The Forge</h2><button class="btn btn-sm" style="width:auto" onclick="closeForge()">Close</button></div>
            <div class="fg-res" id="fg-res"></div>
            <p class="fg-note">Fuse two weapons you own, plus scraps and materials, into one stronger weapon. You keep the originals. Elites drop shards, bosses drop cores, fire and explosion kills (and every 10th wave) drop embers.</p>
            <div class="fg-grid" id="fg-grid"></div></div>`;
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) closeForge(); });
        window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !m.classList.contains('hidden')) closeForge(); }, true);
    });

    const renderForge = () => {
        const u = currentUserData, grid = $('fg-grid'), res = $('fg-res'); if (!u || !grid) return;
        const mats = matsOf(u); $('fg-ic').innerHTML = ic('forge', 'icn big') + ' ';
        res.innerHTML = `<span class="fg-pill">${ic('scrap')} ${fmt(u.scraps || 0)} scraps</span>` + Object.keys(MAT_UI).map(k => `<span class="fg-pill" style="color:${MAT_UI[k][2]}">${ic(MAT_UI[k][1])} ${fmt(mats[k])} ${MAT_UI[k][0]}s</span>`).join('');
        grid.innerHTML = RECIPES.map(r => {
            const out = WEAPON_DATA[r.id], A_ = WEAPON_DATA[r.a], B_ = WEAPON_DATA[r.b]; if (!out || !A_ || !B_) return '';
            const done = u.unlocked.includes(r.id), ha = u.unlocked.includes(r.a), hb = u.unlocked.includes(r.b);
            const okS = (u.scraps || 0) >= r.scraps, okM = Object.keys(r.mats).every(k => mats[k] >= r.mats[k]), ready = !done && ha && hb && okS && okM;
            const ing = (d, have, id) => `<div class="fg-ing ${have ? 'have' : 'miss'}"><span class="big">${d.icon}</span>${esc(d.label)}<br>${have ? '<span style="color:var(--olive)">owned</span>' : `<span style="color:var(--blood)">missing</span>` + (d.unlock ? `<br><span class="dim">shop $${fmt(d.unlock)}</span>` : '')}</div>`;
            const cost = `<span class="${okS ? 'yes' : 'no'}">${ic('scrap')} ${r.scraps}</span>` + Object.keys(r.mats).map(k => `<span class="${mats[k] >= r.mats[k] ? 'yes' : 'no'}">${ic(MAT_UI[k][1])} ${mats[k]}/${r.mats[k]}</span>`).join('');
            const label = done ? 'Fused' : (!ha || !hb ? 'Missing weapons' : (!okS || !okM ? 'Need more' : 'Fuse'));
            return `<div class="fg-card ${done ? 'done' : (ready ? 'ready' : '')}">
                <div class="fg-recipe">${ing(A_, ha, r.a)}<span class="fg-plus">+</span>${ing(B_, hb, r.b)}</div>
                <div class="fg-arrow">&#9660;</div>
                <div class="fg-out"><span class="big">${out.icon}</span><div><div class="fg-name">${esc(out.label)}</div><div class="small dim">${out.dmg} dmg, ${(out.cooldown / 1000).toFixed(1)}s &middot; ${esc(out.desc || '')}</div></div></div>
                <div class="fg-cost">${cost}</div>
                <button class="btn ${ready ? 'btn-go' : ''}" ${ready ? '' : 'disabled'} onclick="forgeFuse('${r.id}')">${label}</button></div>`;
        }).join('');
    };
    window.openForge = () => { if (!currentUserData) return toast('Log in first.'); safe('openForge', () => { matsOf(currentUserData); renderForge(); $('forge-modal').classList.remove('hidden'); }); };
    window.closeForge = () => { const m = $('forge-modal'); if (m) m.classList.add('hidden'); };
    window.forgeFuse = async (id) => {
        const u = currentUserData, r = RECIPES.find(x => x.id === id); if (!u || !r || !WEAPON_DATA[id]) return;
        const mats = matsOf(u);
        if (u.unlocked.includes(id)) return;                                         // double click
        if (!u.unlocked.includes(r.a) || !u.unlocked.includes(r.b)) return toast('You need both weapons first.');
        if ((u.scraps || 0) < r.scraps || Object.keys(r.mats).some(k => mats[k] < r.mats[k])) return toast('Not enough scraps or materials.');
        u.scraps -= r.scraps; Object.keys(r.mats).forEach(k => { mats[k] -= r.mats[k]; }); u.unlocked.push(id);
        toast(`Forged ${WEAPON_DATA[id].label}! Equip it in Gear.`);
        safe('forge-refresh', () => { renderForge(); try { renderShop(); } catch (e) { /* shop not open */ } try { refreshLobbyStats(); } catch (e) { /* ignore */ } });
        try { await save({ scraps: u.scraps, mats, unlocked: u.unlocked }); } catch (e) { toast("Couldn't save the fusion. Check your connection."); }
    };
    // a fused weapon is never for sale: guard the shop buttons
    safe('guards', () => {
        const buy = window.buyWeapon;
        window.buyWeapon = function (id) { if (WEAPON_DATA[id] && WEAPON_DATA[id].fused) { toast('Fuse that one in the Forge.'); return; } return buy.apply(this, arguments); };
        const sell = window.sellWeapon;
        if (sell) window.sellWeapon = function (id) { if (WEAPON_DATA[id] && WEAPON_DATA[id].fused) return; return sell.apply(this, arguments); };
    });
    // lobby button: only add one if the base UI did not
    safe('forge-button', () => { if (!document.querySelector('[onclick*="openForge"]')) console.warn('[arsenal] no lobby button calls openForge()'); });
})();
