/* [weaponlab] WEAPON LAB workstream: admins build brand-new weapons from the admin panel (no code). Definitions live in Firestore
   (`customweapons`, mirrors `customskins`), cached in localStorage, and are turned into WEAPON_DATA[id] + SPECIAL[id] by the generic engine below.
   Loaded as a classic script AFTER the main one, so it shares its global lexical scope (g, WEAPON_DATA, SPECIAL, hurt, ...). Everything is try/catch'd:
   a bug in here must never break the base game.
   Hooks in Mineplacer2.html (all marked `// [weaponlab]`): execute() ignores unknown weapon ids, drawHeldAt() calls CWL.drawHeld.
   Public API: window.CWL = { defs, sanitize, calcDps, measure, openLab, ... } */
(function () {
    'use strict';
    const CWL = window.CWL = window.CWL || {};
    const TAU = Math.PI * 2, rnd = Math.random;
    const warned = {};
    const safe = (name, fn) => { try { return fn(); } catch (e) { if (!warned[name]) { warned[name] = 1; console.error('[weaponlab] ' + name, e); } } };
    try {

    // ================================================================== SMALL HELPERS
    const clampN = (v, lo, hi, d) => { v = +v; if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
    const int = (v, lo, hi, d) => Math.round(clampN(v, lo, hi, d));
    const colr = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) ? v.toLowerCase() : d;
    const pick = (v, arr, d) => (arr.indexOf(v) >= 0 ? v : d);
    const text = (v, n, d) => String(v == null ? (d || '') : v).replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
    const live = (z) => z && !z.dead && !(z.emerge > 0);
    const wrapA = (d) => { while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const $q = (id) => document.getElementById(id);
    const E_ = (s) => { try { return esc(s); } catch (e) { return String(s).replace(/[&<>"']/g, ''); } };

    // ================================================================== SCHEMA
    const SHAPES = ['bolt', 'orb', 'shard', 'arrow', 'bullet', 'flame', 'star', 'laser', 'blob'];
    const TRAILS = ['none', 'fade', 'sparks', 'smoke', 'rainbow'];
    const IMPACTS = ['burst', 'ring', 'flash', 'sparks', 'none'];
    const PATTERNS = ['single', 'spread', 'burst', 'nova', 'beam', 'mine', 'orbit'];
    const MSTYLES = ['arc', 'cone', 'slam', 'spin'];
    const BASES = ['blade', 'dagger', 'pistol', 'rifle', 'staff', 'wand', 'orb', 'axe', 'bow', 'cannon', 'hammer', 'scythe'];
    const HOLD_ANIMS = ['none', 'bob', 'swing', 'spin', 'pulse'];
    const ATK_ANIMS = ['kick', 'swing', 'thrust', 'spin', 'flash'];
    const RARITIES = ['common', 'rare', 'epic', 'legendary'];
    const ZONES = ['none', 'poison', 'fire', 'frost'];
    const ABIL = [
        ['chain', 'Chain lightning', 'Arcs to nearby enemies (level+1 jumps).'],
        ['burn', 'Burn', 'Sets the target on fire (damage over time).'],
        ['poison', 'Poison', 'Poison damage over time, lasts longer.'],
        ['slow', 'Slow / freeze', 'Slows the target; level 5 nearly freezes it.'],
        ['stun', 'Stun', 'Chance to freeze the target in place.'],
        ['lifesteal', 'Lifesteal', 'Heals you for part of the damage dealt.'],
        ['execute', 'Execute', 'Kills non-bosses below 6% x level health.'],
        ['crit', 'Crit chance', '10% per level to hit for the crit multiplier.'],
        ['turret', 'Spawn turret', 'Hits sometimes drop a small auto-turret.'],
        ['hole', 'Black hole', 'Hits sometimes open a black hole that pulls enemies in.'],
        ['blades', 'Orbiting blades', 'Using the weapon spins blades around you.'],
        ['shield', 'Shield on hit', 'Each hit adds a little absorb shield.'],
        ['ricochet', 'Ricochet', 'Projectiles jump to another enemy on hit.'],
        ['split', 'Split on hit', 'Projectiles break into smaller ones on impact.'],
        ['mark', 'Mark & detonate', 'Marked enemies explode 1.5s later.'],
        ['haste', 'Speed on kill', 'Kills give you a burst of speed.']
    ];
    const ABK = ABIL.map(a => a[0]);
    const slugOf = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 22);

    // Hard clamps: the only thing standing between a typo and a frozen game. Everything that comes from Firestore/localStorage/import goes through here.
    const sanitize = (r, forPreview) => {
        r = (r && typeof r === 'object') ? r : {};
        const px = r.px || {}, pat = r.pat || {}, n = r.n || {}, an = r.an || {}, ab = r.ab || {}, mel = r.mel || {};
        let id = String(r.id || '').toUpperCase();
        if (forPreview) id = '__pv';
        else if (!/^CW_[A-Z0-9_]{2,28}$/.test(id)) return null;
        const name = text(r.name, 24, '');
        if (!name && !forPreview) return null;
        const d = {
            v: 1, id, name: name || 'New Weapon', desc: text(r.desc, 120, ''),
            icon: (typeof r.icon === 'string' && r.icon.length > 0 && r.icon.length <= 8 && !/[<>&"'`]/.test(r.icon)) ? r.icon : '🗡️',
            accent: colr(r.accent, '#4dd2ff'), rarity: pick(r.rarity, RARITIES, 'common'),
            ptype: pick(r.ptype, ['cash', 'scraps'], 'cash'), price: int(r.price, 0, 100000000, 5000),
            kind: pick(r.kind, ['melee', 'ranged'], 'ranged'),
            mel: { style: pick(mel.style, MSTYLES, 'arc'), arc: int(mel.arc, 20, 360, 120) },
            px: {
                shape: pick(px.shape, SHAPES, 'bolt'), size: clampN(px.size, 2, 30, 6), speed: clampN(px.speed, 2, 30, 11),
                c1: colr(px.c1, '#4dd2ff'), c2: colr(px.c2, '#ffffff'), trail: pick(px.trail, TRAILS, 'fade'), glow: clampN(px.glow, 0, 1, 0.5),
                spin: !!px.spin, impact: pick(px.impact, IMPACTS, 'burst'), muzzle: px.muzzle !== false && px.muzzle !== 0, shake: clampN(px.shake, 0, 10, 0),
                lob: !!px.lob, zone: pick(px.zone, ZONES, 'none'), zsec: clampN(px.zsec, 1, 15, 5)
            },
            pat: { type: pick(pat.type, PATTERNS, 'single'), count: int(pat.count, 1, 24, 3), spread: clampN(pat.spread, 0, 360, 30), delay: int(pat.delay, 30, 600, 90), mode: pick(pat.mode, ['hold', 'tap'], 'hold'), heat: !!pat.heat },
            n: {
                dmg: clampN(n.dmg, 1, 5000, 40), rate: clampN(n.rate, 0.2, 20, 3), cd: clampN(n.cd, 0, 20, 0), range: int(n.range, 40, 900, 360),
                pierce: int(n.pierce, 0, 10, 0), bounce: int(n.bounce, 0, 8, 0), homing: clampN(n.homing, 0, 1, 0), explode: int(n.explode, 0, 250, 0),
                knock: int(n.knock, 0, 300, 20), critMult: clampN(n.critMult, 1, 6, 2)
            },
            ab: {},
            an: { hold: pick(an.hold, HOLD_ANIMS, 'bob'), attack: pick(an.attack, ATK_ANIMS, 'kick'), base: pick(an.base, BASES, 'pistol'), c1: colr(an.c1, '#9ad0ff'), c2: colr(an.c2, '#ffffff') },
            adminOnly: !!r.adminOnly, teaser: !!r.teaser,
            allow: (Array.isArray(r.allow) ? r.allow : []).map(x => String(x).toLowerCase().trim()).filter(x => /^[a-z0-9_]{1,24}$/.test(x)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 30),
            by: text(r.by, 24, ''), t: Math.floor(clampN(r.t, 0, 4102444800000, 0))
        };
        ABK.forEach(k => { d.ab[k] = int(ab[k], 0, 5, 0); });
        if (d.pat.type === 'beam' && d.kind === 'ranged' && r.n && r.n.pierce === undefined) d.n.pierce = 3;
        if (d.pat.heat && d.kind === 'ranged') { d.n.rate = 12.5; d.n.cd = 0; }   // the overheat meter reuses the Spoon Railgun hold path, which fixes the rate at 12.5/s
        return d;
    };
    CWL.sanitize = sanitize;
    const blank = () => sanitize({ id: 'CW_NEW', name: 'New Weapon' });

    // ----- DPS readout (also what the preview/measure test compares against) -----
    const intervalS = (d) => 1 / d.n.rate + d.n.cd;
    const shotsOf = (d) => (d.kind === 'melee' ? 1 : ({ single: 1, beam: 1, spread: d.pat.count, burst: d.pat.count, nova: d.pat.count, mine: d.pat.count, orbit: d.pat.count }[d.pat.type] || 1));
    const calcDps = (d) => {
        const A = d.ab, dmg = d.n.dmg, iv = intervalS(d), notes = [];
        const critF = 1 + Math.min(1, 0.1 * A.crit) * (d.n.critMult - 1);
        let shots = shotsOf(d), direct, per = dmg * critF;
        if (d.kind === 'ranged' && d.pat.type === 'orbit') {   // each blade touches an enemy it passes about 3 times a second; blades last 5s
            direct = per * 3 * Math.min(1, 5 / iv); shots = 1; notes.push(d.pat.count + ' blades orbit for 5s (one blade touching the target)');
        } else if (d.kind === 'ranged' && d.pat.type === 'mine') { direct = per * shots / iv; notes.push('mines: one trigger each'); }
        else direct = per * shots / iv;
        let dots = 0;
        if (A.burn) { dots += 0.25 * A.burn * dmg * Math.min(3, iv) / iv; notes.push('burn +' + (0.25 * A.burn * dmg).toFixed(0) + '/s'); }
        if (A.poison) { dots += 0.2 * A.poison * dmg * Math.min(4, iv) / iv; notes.push('poison +' + (0.2 * A.poison * dmg).toFixed(0) + '/s'); }
        if (A.mark) { dots += dmg * 0.6 * A.mark / (1.5 + iv / 2); notes.push('mark detonation'); }
        if (d.px.zone !== 'none' && d.kind === 'ranged') notes.push(d.px.zone + ' zone ' + d.px.zsec.toFixed(0) + 's (ground damage not in DPS)');
        const single = direct + dots;
        let multi = 1;
        if (d.n.pierce) { multi += d.n.pierce; notes.push('pierces ' + d.n.pierce); }
        if (d.n.explode) { notes.push('blast r' + d.n.explode + ' (70% to others)'); multi += 2; }
        if (A.chain) { notes.push('chain x' + (A.chain + 1)); multi += A.chain * 0.6; }
        if (d.kind === 'melee') { notes.push(d.mel.style === 'slam' ? 'ground slam' : (d.mel.style === 'spin' ? '360 spin' : d.mel.arc + ' deg sweep')); multi += 2; }
        if (d.kind === 'ranged' && (d.pat.type === 'nova' || d.pat.type === 'spread')) notes.push('ring/fan: fewer pellets hit a single target');
        if (A.split) notes.push('split children');
        if (d.pat.heat && d.kind === 'ranged') notes.push('overheat: ~5.5s fire, ~2.7s recharge');
        return { perHit: per, shots, iv, direct, dots, single, multi: single * multi, notes, critF };
    };
    CWL.calcDps = calcDps;
    const cdMs = (d) => Math.max(40, Math.round(intervalS(d) * 1000));

    // ================================================================== ENGINE (works on any "state" S so the lab preview and the real game share it)
    const DEF = {};              // id -> sanitized definition (live ones)
    const PV = { def: null };    // the lab preview's definition (id '__pv')
    const defOf = (id) => (id === '__pv' ? PV.def : DEF[id]);
    const nearestLive = (S, x, y, maxD, skip) => {
        let best = null, bd = (maxD || 1e9) * (maxD || 1e9); const zs = S.env.zs();
        for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (!live(z) || (skip && skip.has(z))) continue; const d = (z.x - x) ** 2 + (z.y - y) ** 2; if (d < bd) { bd = d; best = z; } }
        return best;
    };
    const inLine = (z, x1, y1, dx, dy, len, w) => { const px = z.x - x1, py = z.y - y1, pr = px * dx + py * dy; if (pr < 0 || pr > len) return false; return Math.abs(px * dy - py * dx) < w + (z.size || 14) * 0.6; };
    const push = (S, z, fx, fy, k) => {
        if (!k || !live(z)) return; const dx = z.x - fx, dy = z.y - fy, d = Math.hypot(dx, dy) || 1; if (z.boss) k *= 0.15;
        z.x = Math.min(S.W - 10, Math.max(10, z.x + dx / d * k)); z.y = Math.min(S.H - 10, Math.max(10, z.y + dy / d * k));
    };
    const fxAdd = (S, id, fx, x, y, a, r, life, x2, y2) => { if (S.o.length > 420) return; S.o.push({ k: 'F', id, fx, x, y, a: a || 0, r: r || 0, life, max: life, x2: x2 || 0, y2: y2 || 0 }); };
    const count = (S, k, id, own) => { let n = 0; for (const o of S.o) if (o.k === k && (!id || o.id === id) && (!own || o.own === own)) n++; return n; };
    const isDead = (z) => z.dead || z.hp <= 0;

    // one damaging hit with every ability applied. opt: { direct, depth, fx, fy, nochain }
    const applyHit = (S, def, p, z, dmg, opt) => {
        opt = opt || {}; const A = def.ab, env = S.env, id = def.id;
        if (!live(z)) return;
        if (A.crit && rnd() < 0.1 * A.crit) { dmg *= def.n.critMult; if (!S.noPop && rnd() < 0.6) env.pop(z.x, z.y - (z.size || 14) - 8, 'CRIT'); }
        env.hurt(z, dmg, id);
        const killed = isDead(z);
        if (killed) { if (A.haste) env.haste(40 * A.haste); if (A.lifesteal) env.heal(p, Math.min(6, dmg * 0.04 * A.lifesteal)); return; }
        if (opt.fx !== undefined && def.n.knock && !opt.noKnock) push(S, z, opt.fx, opt.fy, def.n.knock * (opt.kmul || 1));
        if (A.burn) { const d = dmg * 0.25 * A.burn; if (!z.cwb || z.cwb.d < d) z.cwb = { t: 180, d, id }; else z.cwb.t = 180; }
        if (A.poison) { const d = dmg * 0.2 * A.poison; if (!z.cwp || z.cwp.d < d) z.cwp = { t: 240, d, id }; else z.cwp.t = 240; }
        if (A.slow) { const f = Math.max(0.12, 1 - 0.15 * A.slow - (A.slow >= 5 ? 0.1 : 0)); z.slow = Math.min(z.slow === undefined ? 1 : z.slow, z.boss ? 1 - (1 - f) * 0.5 : f); z.cwsl = 40; }
        if (A.stun && rnd() < 0.12 * A.stun) z.cwst = (30 + 10 * A.stun) / (z.boss ? 3 : 1);
        if (A.lifesteal) env.heal(p, Math.min(6, dmg * 0.04 * A.lifesteal));
        if (A.shield) env.shield(2 * A.shield);
        if (A.execute && !z.boss && z.hp > 0 && z.hp / z.max < 0.06 * A.execute) { env.hurt(z, z.hp + 1, id); if (A.haste) env.haste(40 * A.haste); return; }
        if (A.mark && !z.cwm) z.cwm = { t: 90, d: dmg * 0.6 * A.mark, id, own: p, R: 50 + 6 * A.mark };
        if (opt.direct) {
            if (A.chain && !S.inChain && !opt.nochain) {
                S.inChain = true;
                try {
                    const hit = new Set([z]); let cur = z, dm = dmg;
                    for (let i = 0; i < A.chain + 1; i++) {
                        const nx = nearestLive(S, cur.x, cur.y, 150, hit); if (!nx) break; hit.add(nx); dm *= 0.6;
                        fxAdd(S, id, 'bolt', cur.x, cur.y, 0, 0, 10, nx.x, nx.y);
                        applyHit(S, def, p, nx, dm, { direct: false, nochain: true });
                        cur = nx;
                    }
                } finally { S.inChain = false; }
            }
            if (!opt.depth) {
                if (A.turret && rnd() < 0.05 * A.turret && count(S, 'T', id, p) < 3 && S.o.length < 380) S.o.push({ k: 'T', id, own: p, x: z.x, y: z.y, life: 420, cd: 20, dmg: dmg * 0.5 });
                if (A.hole && rnd() < 0.03 * A.hole && count(S, 'B', id) < 2) S.o.push({ k: 'B', id, own: p, x: z.x, y: z.y, life: 150, max: 150, R: 80 + 10 * A.hole, dmg: dmg * 1.2 });
            }
        }
    };

    const aoe = (S, def, p, x, y, R, dmg, factor, excl, opt) => {
        const env = S.env; fxAdd(S, def.id, 'blast', x, y, 0, R, 16);
        const zs = env.zs();
        for (let i = 0; i < zs.length; i++) {
            const z = zs[i]; if (!live(z) || z === excl) continue; if (Math.hypot(z.x - x, z.y - y) < R + (z.size || 14) * 0.5) applyHit(S, def, p, z, dmg * factor, { direct: false, fx: x, fy: y, kmul: 1, ...(opt || {}) });
        }
        for (const b of env.barrels()) if (!b.dead && Math.hypot(b.x - x, b.y - y) < R + 14) env.hurtB(b, dmg * factor, def.id);
        env.shake(Math.min(8, R / 18));
    };

    const impactFx = (S, def, x, y, a) => {
        const px = def.px; if (px.impact === 'none') return;
        const R = 14 + px.size * 1.6;
        if (px.impact === 'ring') fxAdd(S, def.id, 'ring', x, y, a, R * 1.6, 14);
        else if (px.impact === 'flash') fxAdd(S, def.id, 'flash', x, y, a, R * 1.4, 8);
        else if (px.impact === 'sparks') fxAdd(S, def.id, 'sparks', x, y, a, R * 1.6, 16);
        else fxAdd(S, def.id, 'burst', x, y, a, R * 1.5, 14);
        if (px.shake) S.env.shake(px.shake * 0.6);
    };

    const spawnP = (S, def, p, a, o) => {
        if (S.o.length > 380) return null; const px = def.px, n = def.n;
        const sx = o.x !== undefined ? o.x : p.x + Math.cos(a) * 16, sy = o.y !== undefined ? o.y : p.y + Math.sin(a) * 16;
        const rng = n.range * o.rm * (o.rngMul || 1), sp = px.speed;
        const pr = { k: 'P', id: def.id, own: p, x: sx, y: sy, a, sp, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: px.size * (o.sizeMul || 1), dmg: o.dm * (o.dmMul || 1),
            pierce: o.nopierce ? 0 : n.pierce, bounce: o.depth ? 0 : n.bounce, hom: n.homing, life: Math.max(2, Math.ceil(rng / sp)), age: 0, hit: new Set(), rm: o.rm, depth: o.depth || 0, rc: def.ab.ricochet, h: 0 };
        if (o.skip) pr.hit.add(o.skip);
        if (px.lob && o.tgt && !o.depth) {
            const dx = o.tgt.x - sx, dy = o.tgt.y - sy, dist = Math.min(Math.hypot(dx, dy), rng), aa = Math.atan2(dy, dx);
            pr.lob = { sx, sy, tx: sx + Math.cos(aa) * dist, ty: sy + Math.sin(aa) * dist, dur: Math.max(16, Math.ceil(dist / sp)), top: Math.min(90, 26 + dist * 0.25) };
            pr.a = aa;
        }
        S.o.push(pr); return pr;
    };

    const landing = (S, def, o) => {   // blast + zone where a projectile ends
        const R0 = def.n.explode * o.rm;
        if (def.n.explode) aoe(S, def, o.own, o.x, o.y, R0, o.dmg, o.lob ? 1 : 0.7, o.excl || null, { depth: o.depth });
        const zk = def.px.zone;
        if (zk !== 'none' && !o.depth && count(S, 'Z', null) < 10) S.o.push({ k: 'Z', id: def.id, own: o.own, x: o.x, y: o.y, R: Math.max(46, R0 * 0.9 || 60), life: Math.round(def.px.zsec * 60), max: Math.round(def.px.zsec * 60), kind: zk, dps: o.dmg * (zk === 'frost' ? 0.2 : 0.5), tick: 0 });
    };

    const tickP = (S, o) => {
        const def = defOf(o.id); if (!def) return true;
        const env = S.env, A = def.ab; o.age++;
        if (o.lob) {
            const t = Math.min(1, o.age / o.lob.dur);
            o.x = o.lob.sx + (o.lob.tx - o.lob.sx) * t; o.y = o.lob.sy + (o.lob.ty - o.lob.sy) * t; o.h = Math.sin(t * Math.PI) * o.lob.top;
            if (o.age >= o.lob.dur) { impactFx(S, def, o.x, o.y, o.a); landing(S, def, o); return true; }
            return false;
        }
        if (o.hom > 0) {
            let tg = o.tg; if (!tg || !live(tg) || o.hit.has(tg)) tg = o.tg = nearestLive(S, o.x, o.y, 440, o.hit);
            if (tg) { const dd = wrapA(Math.atan2(tg.y - o.y, tg.x - o.x) - o.a), lim = 0.02 + 0.13 * o.hom; o.a += Math.max(-lim, Math.min(lim, dd)); o.vx = Math.cos(o.a) * o.sp; o.vy = Math.sin(o.a) * o.sp; }
        }
        o.x += o.vx; o.y += o.vy;
        if (o.bounce > 0) {
            let b = false;
            if (o.x < 8 || o.x > S.W - 8) { o.vx *= -1; o.x = Math.min(S.W - 8, Math.max(8, o.x)); b = true; }
            if (o.y < 8 || o.y > S.H - 8) { o.vy *= -1; o.y = Math.min(S.H - 8, Math.max(8, o.y)); b = true; }
            if (b) { o.bounce--; o.a = Math.atan2(o.vy, o.vx); o.hit.clear(); impactFx(S, { ...def, px: { ...def.px, impact: 'sparks', shake: 0 } }, o.x, o.y, o.a); o.life += Math.ceil(24 / o.sp * 2); }
        } else if (o.x < -40 || o.x > S.W + 40 || o.y < -40 || o.y > S.H + 40) return true;
        if (--o.life <= 0) { if (def.n.explode) { impactFx(S, def, o.x, o.y, o.a); landing(S, def, o); } return true; }
        const zs = env.zs();
        for (let i = 0; i < zs.length; i++) {
            const z = zs[i]; if (!live(z) || o.hit.has(z)) continue;
            if (Math.hypot(o.x - z.x, o.y - z.y) >= (z.size || 14) + o.size * 0.8) continue;
            o.hit.add(z);
            applyHit(S, def, o.own, z, o.dmg, { direct: true, depth: o.depth, fx: o.x - o.vx, fy: o.y - o.vy });
            impactFx(S, def, o.x, o.y, o.a);
            if (def.n.explode && !o.depth) landing(S, def, { ...o, lob: null, own: o.own, excl: z });
            if (A.split && !o.depth && S.o.length < 360) {
                const kids = 1 + Math.ceil(A.split / 2), base = o.a + Math.PI;
                for (let q = 0; q < kids; q++) spawnP(S, def, o.own, o.a + (q - (kids - 1) / 2) * 0.7 + (kids % 2 ? 0 : 0.0), { x: o.x, y: o.y, dm: o.dmg, dmMul: 0.5, rm: o.rm, depth: 1, sizeMul: 0.7, rngMul: 0.4, skip: z, nopierce: true });
            }
            if (o.pierce > 0) { o.pierce--; continue; }
            if (o.rc > 0 && o.depth === 0) {
                const nx = nearestLive(S, o.x, o.y, 240, o.hit);
                if (nx) { o.rc--; o.a = Math.atan2(nx.y - o.y, nx.x - o.x); o.vx = Math.cos(o.a) * o.sp; o.vy = Math.sin(o.a) * o.sp; o.life = Math.max(o.life, 18); continue; }
            }
            return true;
        }
        for (const b of env.barrels()) {
            if (b.dead || o.hit.has(b) || Math.hypot(o.x - b.x, o.y - b.y) >= 16 + o.size) continue;
            o.hit.add(b); env.hurtB(b, o.dmg, def.id); impactFx(S, def, o.x, o.y, o.a); if (o.pierce > 0) { o.pierce--; continue; } return true;
        }
        return false;
    };

    // ---------- firing ----------
    const melee = (S, def, p, tgt, dm, rm) => {
        const env = S.env, R = def.n.range * rm, a = Math.atan2(tgt.y - p.y, tgt.x - p.x), st = def.mel.style, half = (def.mel.arc * Math.PI / 180) / 2;
        let cx = p.x, cy = p.y, rad = R, hitFn;
        if (st === 'slam') { rad = Math.max(40, R * 0.6); cx = p.x + Math.cos(a) * Math.min(R * 0.7, Math.max(30, Math.hypot(tgt.x - p.x, tgt.y - p.y))); cy = p.y + Math.sin(a) * Math.min(R * 0.7, Math.max(30, Math.hypot(tgt.x - p.x, tgt.y - p.y))); hitFn = (z) => Math.hypot(z.x - cx, z.y - cy) < rad + (z.size || 14) * 0.5; fxAdd(S, def.id, 'slam', cx, cy, a, rad, 18); }
        else if (st === 'spin') { hitFn = (z) => Math.hypot(z.x - p.x, z.y - p.y) < R + (z.size || 14) * 0.5; fxAdd(S, def.id, 'spin', p.x, p.y, a, R, 16); }
        else {
            hitFn = (z) => { const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy); if (d > R + (z.size || 14) * 0.5) return false; if (d < 18) return true; return Math.abs(wrapA(Math.atan2(dy, dx) - a)) < half + Math.min(0.5, (z.size || 14) / Math.max(d, 1)); };
            fxAdd(S, def.id, st === 'cone' ? 'cone' : 'arc', p.x, p.y, a, R, st === 'cone' ? 12 : 11, half * 2);
        }
        const zs = env.zs(); let hits = 0;
        for (let i = 0; i < zs.length; i++) {
            const z = zs[i]; if (!live(z) || !hitFn(z)) continue; hits++;
            applyHit(S, def, p, z, dm, { direct: true, fx: st === 'slam' ? cx : p.x, fy: st === 'slam' ? cy : p.y, kmul: st === 'cone' ? 1.4 : 1 });
            impactFx(S, def, z.x, z.y, a);
        }
        for (const b of env.barrels()) if (!b.dead && hitFn(b)) env.hurtB(b, dm, def.id);
        if (def.px.shake || st === 'slam') env.shake(Math.max(def.px.shake, st === 'slam' ? 6 : 0) * (hits ? 1 : 0.5));
    };

    const beam = (S, def, p, a, dm, rm) => {
        const env = S.env, R = def.n.range * rm, dx = Math.cos(a), dy = Math.sin(a), w = Math.max(5, def.px.size * 0.9), hits = [];
        const zs = env.zs();
        for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (live(z) && inLine(z, p.x, p.y, dx, dy, R, w)) hits.push(z); }
        hits.sort((u, v) => (u.x - p.x) ** 2 + (u.y - p.y) ** 2 - ((v.x - p.x) ** 2 + (v.y - p.y) ** 2));
        const use = hits.slice(0, def.n.pierce + 1); let len = R;
        if (use.length && use.length === def.n.pierce + 1) len = Math.min(R, Math.hypot(use[use.length - 1].x - p.x, use[use.length - 1].y - p.y));
        const sx = p.x + dx * 14, sy = p.y + dy * 14;
        fxAdd(S, def.id, 'beam', sx, sy, a, len, 9, 0, 0);
        const o = { x: p.x + dx * len, y: p.y + dy * len };
        for (const z of use) { applyHit(S, def, p, z, dm, { direct: true, fx: p.x, fy: p.y }); impactFx(S, def, z.x, z.y, a); }
        for (const b of env.barrels()) if (!b.dead && inLine(b, p.x, p.y, dx, dy, len, w)) env.hurtB(b, dm, def.id);
        if (def.n.explode) { const e = use.length ? use[use.length - 1] : o; aoe(S, def, p, e.x, e.y, def.n.explode * rm, dm, 0.7, e === o ? null : e); }
        else if (use.length === 0) impactFx(S, def, o.x, o.y, a);
    };

    const startBlades = (S, def, p, dm, n, life, R, id2) => {
        for (let i = S.o.length - 1; i >= 0; i--) { const q = S.o[i]; if (q.k === 'O' && q.own === p && q.id === def.id && q.tag === id2) S.o.splice(i, 1); }
        for (let i = 0; i < n && S.o.length < 380; i++) S.o.push({ k: 'O', id: def.id, own: p, tag: id2, a: i * TAU / n, R, life, max: life, dmg: dm, hits: new Map(), x: p.x, y: p.y });
    };

    const fireWeapon = (S, def, p, tgt, dm, rm) => {
        const a = Math.atan2(tgt.y - p.y, tgt.x - p.x), px = def.px, env = S.env;
        if (def.ab.blades && !count(S, 'O', def.id, p)) startBlades(S, def, p, dm * 0.35, Math.min(5, 1 + def.ab.blades), 260, 58 * rm, 'ab');
        if (def.kind === 'melee') { melee(S, def, p, tgt, dm, rm); return; }
        const pt = def.pat, n = pt.count;
        if (px.muzzle && pt.type !== 'mine' && pt.type !== 'orbit' && pt.type !== 'nova') fxAdd(S, def.id, 'muzzle', p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, 14 + px.size, 7);
        if (px.shake) env.shake(px.shake);
        const base = { dm, rm, tgt };
        switch (pt.type) {
            case 'spread': { const sp = pt.spread * Math.PI / 180; for (let i = 0; i < n; i++) spawnP(S, def, p, a + (n > 1 ? (i / (n - 1) - 0.5) * sp : 0), base); break; }
            case 'nova': { fxAdd(S, def.id, 'ring', p.x, p.y, 0, 40 + px.size * 2, 12); for (let i = 0; i < n; i++) spawnP(S, def, p, a + i * TAU / n, base); break; }
            case 'burst': {
                spawnP(S, def, p, a, base); const dl = Math.max(2, Math.round(pt.delay / (1000 / 60)));
                for (let i = 1; i < n; i++) S.q.push({ t: dl * i, id: def.id, p, dm, rm, a });
                break;
            }
            case 'beam': beam(S, def, p, a, dm, rm); break;
            case 'mine': {
                for (let i = 0; i < n && count(S, 'M', def.id) < 12; i++) {
                    const aa = a + i * TAU / n + 0.4, dd = n > 1 ? 34 : 0;
                    S.o.push({ k: 'M', id: def.id, own: p, x: Math.min(S.W - 12, Math.max(12, p.x + Math.cos(aa) * dd)), y: Math.min(S.H - 12, Math.max(12, p.y + Math.sin(aa) * dd)), arm: 24, life: 1800, dmg: dm, R: Math.max(36, def.n.explode * rm || 70 * rm), rm });
                }
                break;
            }
            case 'orbit': startBlades(S, def, p, dm, n, 300, Math.max(34, def.n.range * 0.22 * rm), 'pat'); break;
            default: spawnP(S, def, p, a, base);
        }
    };

    const runJob = (S, j) => {
        const def = defOf(j.id); if (!def || !j.p) return;
        const tg = nearestLive(S, j.p.x, j.p.y, 1e9), a = tg ? Math.atan2(tg.y - j.p.y, tg.x - j.p.x) : j.a;
        spawnP(S, def, j.p, a, { dm: j.dm, rm: j.rm, tgt: tg });
        if (def.px.muzzle) fxAdd(S, def.id, 'muzzle', j.p.x + Math.cos(a) * 18, j.p.y + Math.sin(a) * 18, a, 12 + def.px.size, 6);
    };

    // ---------- the per-tick world ----------
    const tickStatus = (S) => {
        const env = S.env, zs = env.zs(), beat = (S.tick % 15) === 0;
        for (let i = 0; i < zs.length; i++) {
            const z = zs[i]; if (!live(z)) continue;
            if (z.cwb) { if (beat) env.hurt(z, z.cwb.d * 0.25, z.cwb.id); if (--z.cwb.t <= 0) z.cwb = null; }
            if (z.cwp && live(z)) { if (beat) env.hurt(z, z.cwp.d * 0.25, z.cwp.id); if (--z.cwp.t <= 0) z.cwp = null; }
            if (z.cwst > 0) { z.cwst--; z.slow = z.boss ? Math.min(z.slow === undefined ? 1 : z.slow, 0.3) : 0; }
            if (z.cwsl > 0) z.cwsl--;
            if (z.cwm && live(z) && --z.cwm.t <= 0) {
                const m = z.cwm; z.cwm = null; const d = defOf(m.id);
                if (d) { fxAdd(S, m.id, 'blast', z.x, z.y, 0, m.R, 16); for (const q of zs) if (live(q) && Math.hypot(q.x - z.x, q.y - z.y) < m.R + (q.size || 14) * 0.5) env.hurt(q, m.d, m.id); env.shake(3); }
            }
        }
    };

    const tickWorld = (S) => {
        S.tick++;
        const env = S.env;
        for (let i = S.q.length - 1; i >= 0; i--) { const j = S.q[i]; if (--j.t <= 0) { S.q.splice(i, 1); safe('job', () => runJob(S, j)); } }
        tickStatus(S);
        for (let i = S.o.length - 1; i >= 0; i--) {
            const o = S.o[i]; if (!o) continue; let rm = false;
            const def = defOf(o.id);
            switch (o.k) {
                case 'P': rm = tickP(S, o); break;
                case 'F': rm = --o.life <= 0; break;
                case 'Z': {
                    if (!def || --o.life <= 0) { rm = true; break; }
                    if (++o.tick % 10 === 0) {
                        const zs = env.zs();
                        for (let q = 0; q < zs.length; q++) {
                            const z = zs[q]; if (!live(z) || Math.hypot(z.x - o.x, z.y - o.y) > o.R + (z.size || 14) * 0.5) continue;
                            env.hurt(z, o.dps / 6, o.id);
                            if (o.kind === 'frost') { z.slow = Math.min(z.slow === undefined ? 1 : z.slow, 0.45); z.cwsl = 20; }
                            else if (o.kind === 'fire' && live(z)) { if (!z.cwb) z.cwb = { t: 60, d: o.dps * 0.4, id: o.id }; }
                            else if (o.kind === 'poison' && live(z)) { z.cwp = { t: 60, d: o.dps * 0.4, id: o.id }; z.slow = Math.min(z.slow === undefined ? 1 : z.slow, 0.8); }
                        }
                    }
                    break;
                }
                case 'M': {
                    if (!def || --o.life <= 0) { rm = true; break; }
                    if (o.arm > 0) { o.arm--; break; }
                    const zs = env.zs(); let trig = false;
                    for (let q = 0; q < zs.length; q++) { const z = zs[q]; if (live(z) && Math.hypot(z.x - o.x, z.y - o.y) < (z.size || 14) + 16) { trig = true; break; } }
                    if (trig) { rm = true; impactFx(S, def, o.x, o.y, 0); aoe(S, def, o.own, o.x, o.y, o.R, o.dmg, 1, null, null); landing(S, { ...def, n: { ...def.n, explode: 0 } }, { id: def.id, own: o.own, x: o.x, y: o.y, dmg: o.dmg, rm: o.rm, depth: 0, lob: null }); }
                    break;
                }
                case 'O': {
                    if (!def || --o.life <= 0 || !o.own) { rm = true; break; }
                    o.a += 0.09; o.x = o.own.x + Math.cos(o.a) * o.R; o.y = o.own.y + Math.sin(o.a) * o.R;
                    const zs = env.zs();
                    for (let q = 0; q < zs.length; q++) {
                        const z = zs[q]; if (!live(z) || Math.hypot(z.x - o.x, z.y - o.y) >= (z.size || 14) + 12) continue;
                        if (S.tick - (o.hits.get(z) || -99) < 20) continue; o.hits.set(z, S.tick);
                        applyHit(S, def, o.own, z, o.dmg, { direct: o.tag === 'pat', depth: o.tag === 'ab' ? 1 : 0, fx: o.own.x, fy: o.own.y, nochain: o.tag === 'ab' });
                    }
                    if (o.hits.size > 40) for (const [z] of o.hits) if (isDead(z)) o.hits.delete(z);
                    break;
                }
                case 'T': {
                    if (!def || --o.life <= 0) { rm = true; break; }
                    if (--o.cd <= 0) {
                        const z = nearestLive(S, o.x, o.y, 300);
                        if (z) { o.cd = 24; spawnP(S, { ...def, id: def.id, px: { ...def.px, shape: 'bolt', size: 4, speed: 13 }, n: { ...def.n, range: 320, pierce: 0, bounce: 0, homing: 0, explode: 0 } }, o.own, Math.atan2(z.y - o.y, z.x - o.x), { x: o.x, y: o.y, dm: o.dmg, rm: 1, depth: 1 }); }
                        else o.cd = 8;
                    }
                    break;
                }
                case 'B': {
                    if (!def) { rm = true; break; }
                    o.life--;
                    const zs = env.zs();
                    for (let q = 0; q < zs.length; q++) {
                        const z = zs[q]; if (!live(z)) continue; const dx = o.x - z.x, dy = o.y - z.y, d = Math.hypot(dx, dy) || 1;
                        if (d < o.R * 1.9) { const f = (z.boss ? 0.5 : 3) * (1 - d / (o.R * 2.2)); z.x = Math.min(S.W - 10, Math.max(10, z.x + dx / d * f)); z.y = Math.min(S.H - 10, Math.max(10, z.y + dy / d * f)); }
                    }
                    if (o.life <= 0) { rm = true; aoe(S, def, o.own, o.x, o.y, o.R, o.dmg, 1, null, { depth: 1, nochain: true }); }
                    break;
                }
                default: rm = true;
            }
            if (rm) S.o.splice(i, 1);
        }
    };

    // ---------- serialisation for party guests + the canvas (host builds, everybody draws) ----------
    const r1 = Math.round, r2 = (v) => Math.round(v * 100) / 100;
    const ser = (S) => {
        const L = []; let nP = 0;
        for (const o of S.o) {
            if (L.length > 150) break;
            switch (o.k) {
                case 'P': if (nP++ < 70) L.push(['P', o.id, r1(o.x), r1(o.y), r2(o.a), r1(o.size), o.age, r1(o.h || 0)]); break;
                case 'F': L.push(['F', o.id, o.fx, r1(o.x), r1(o.y), r2(o.a), r1(o.r), r2(1 - o.life / o.max), r1(o.x2), r1(o.y2)]); break;
                case 'Z': L.push(['Z', o.id, r1(o.x), r1(o.y), r1(o.R), r2(o.life / o.max), o.kind]); break;
                case 'M': L.push(['M', o.id, r1(o.x), r1(o.y), o.arm > 0 ? 1 : 0]); break;
                case 'O': L.push(['O', o.id, r1(o.x), r1(o.y), r2(o.a), r1(o.own.x), r1(o.own.y), r1(o.R)]); break;
                case 'T': L.push(['T', o.id, r1(o.x), r1(o.y)]); break;
                case 'B': L.push(['B', o.id, r1(o.x), r1(o.y), r1(o.R), r2(o.life / o.max)]); break;
            }
        }
        let ns = 0; const zs = S.env.zs();
        for (let i = 0; i < zs.length && ns < 40; i++) {
            const z = zs[i]; if (!live(z)) continue;
            const m = (z.cwb ? 1 : 0) | (z.cwp ? 2 : 0) | (z.cwst > 0 ? 4 : 0) | (z.cwm ? 8 : 0) | (z.cwsl > 0 ? 16 : 0);
            if (m) { L.push(['S', r1(z.x), r1(z.y), m, r1(z.size || 14)]); ns++; }
        }
        if (S.shield && S.shield() > 0.5) L.push(['H', r1(S.shieldAt().x), r1(S.shieldAt().y), r2(Math.min(1, S.shield() / 40))]);
        return L;
    };

    // ================================================================== DRAWING
    const hsl = (h, s, l, a) => `hsla(${h % 360},${s}%,${l}%,${a === undefined ? 1 : a})`;
    const trailDraw = (c, px, size, age, len) => {
        if (px.trail === 'none') return;
        const L = len;
        if (px.trail === 'fade') { const gr = c.createLinearGradient(0, 0, -L, 0); gr.addColorStop(0, px.c1); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(-L, -size * 0.45, L, size * 0.9); }
        else if (px.trail === 'sparks') { for (let i = 0; i < 7; i++) { const f = ((age * 0.13 + i / 7) % 1); c.globalAlpha = 1 - f; c.fillStyle = i % 2 ? px.c2 : px.c1; c.fillRect(-f * L, Math.sin(i * 12.9 + age * 0.3) * size * 0.9 - 1, 2.5, 2.5); } c.globalAlpha = 1; }
        else if (px.trail === 'smoke') { for (let i = 0; i < 6; i++) { const f = i / 6; c.globalAlpha = 0.5 * (1 - f); c.fillStyle = i % 2 ? '#8a8a8a' : px.c2; c.beginPath(); c.arc(-f * L, Math.sin(i * 5 + age * 0.2) * 2, size * (0.4 + f * 0.7), 0, TAU); c.fill(); } c.globalAlpha = 1; }
        else if (px.trail === 'rainbow') { for (let i = 0; i < 12; i++) { const f = i / 12; c.fillStyle = hsl(age * 14 + i * 28, 90, 60, 1 - f); c.fillRect(-f * L - 3, -size * 0.38, L / 12 + 2, size * 0.76); } }
    };
    const drawShape = (c, px, s, age) => {
        const c1 = px.c1, c2 = px.c2;
        switch (px.shape) {
            case 'orb': { const gr = c.createRadialGradient(-s * 0.3, -s * 0.3, 0, 0, 0, s); gr.addColorStop(0, c2); gr.addColorStop(1, c1); c.fillStyle = gr; c.beginPath(); c.arc(0, 0, s, 0, TAU); c.fill(); break; }
            case 'shard': c.fillStyle = c1; c.beginPath(); c.moveTo(s * 1.8, 0); c.lineTo(0, -s * 0.75); c.lineTo(-s * 1.1, 0); c.lineTo(0, s * 0.75); c.closePath(); c.fill(); c.fillStyle = c2; c.beginPath(); c.moveTo(s * 1.4, 0); c.lineTo(0, -s * 0.25); c.lineTo(-s * 0.4, 0); c.closePath(); c.fill(); break;
            case 'arrow': c.strokeStyle = c2; c.lineWidth = Math.max(1.5, s * 0.3); c.beginPath(); c.moveTo(-s * 1.8, 0); c.lineTo(s * 1.2, 0); c.stroke(); c.fillStyle = c1; c.beginPath(); c.moveTo(s * 2, 0); c.lineTo(s * 0.9, -s * 0.6); c.lineTo(s * 0.9, s * 0.6); c.closePath(); c.fill(); c.strokeStyle = c1; c.beginPath(); c.moveTo(-s * 1.8, 0); c.lineTo(-s * 2.3, -s * 0.5); c.moveTo(-s * 1.8, 0); c.lineTo(-s * 2.3, s * 0.5); c.stroke(); break;
            case 'bullet': c.fillStyle = c1; c.fillRect(-s * 1.1, -s * 0.45, s * 1.6, s * 0.9); c.fillStyle = c2; c.beginPath(); c.moveTo(s * 0.5, -s * 0.45); c.quadraticCurveTo(s * 1.5, 0, s * 0.5, s * 0.45); c.fill(); break;
            case 'flame': { const f = 1 + Math.sin(age * 0.8) * 0.15; c.fillStyle = c1; c.beginPath(); c.moveTo(s * 1.3 * f, 0); c.quadraticCurveTo(0, -s * 1.1, -s * 1.8, 0); c.quadraticCurveTo(0, s * 1.1, s * 1.3 * f, 0); c.fill(); c.fillStyle = c2; c.beginPath(); c.moveTo(s * 0.7, 0); c.quadraticCurveTo(-s * 0.2, -s * 0.5, -s, 0); c.quadraticCurveTo(-s * 0.2, s * 0.5, s * 0.7, 0); c.fill(); break; }
            case 'star': { c.fillStyle = c1; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.5 : s * 1.2, a = i * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.fillStyle = c2; c.beginPath(); c.arc(0, 0, s * 0.35, 0, TAU); c.fill(); break; }
            case 'laser': c.fillStyle = c1; c.globalAlpha = 0.5; c.fillRect(-s * 2.5, -s * 0.5, s * 5, s); c.globalAlpha = 1; c.fillStyle = c2; c.fillRect(-s * 2.5, -s * 0.18, s * 5, s * 0.36); break;
            case 'blob': { c.fillStyle = c1; c.beginPath(); for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU, r = s * (1 + Math.sin(a * 3 + age * 0.4) * 0.14); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.fillStyle = c2; c.globalAlpha = 0.7; c.beginPath(); c.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, TAU); c.fill(); c.globalAlpha = 1; break; }
            default: c.fillStyle = c1; c.beginPath(); if (c.roundRect) c.roundRect(-s * 1.3, -s * 0.45, s * 2.6, s * 0.9, s * 0.4); else c.rect(-s * 1.3, -s * 0.45, s * 2.6, s * 0.9); c.fill(); c.fillStyle = c2; c.fillRect(-s * 0.9, -s * 0.15, s * 1.8, s * 0.3);
        }
    };
    const DRW = {
        P(c, e) {
            const def = defOf(e[1]); if (!def) return; const px = def.px, x = e[2], y = e[3], a = e[4], s = e[5], age = e[6], h = e[7] || 0;
            if (h) { c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x, y + 4, s * 0.9, s * 0.45, 0, 0, TAU); c.fill(); }
            c.save(); c.translate(x, y - h); c.rotate(a);
            trailDraw(c, px, s, age, h ? 0 : s * 5 + 10);
            if (px.glow > 0) { c.shadowColor = px.c1; c.shadowBlur = px.glow * 20; }
            if (px.spin || h) c.rotate(age * (px.spin ? 0.35 : 0.08));
            drawShape(c, px, s, age); c.restore();
        },
        F(c, e, t) {
            const def = defOf(e[1]); if (!def) return; const fx = e[2], x = e[3], y = e[4], a = e[5], r = e[6], p = e[7], px = def.px, c1 = px.c1, c2 = px.c2, fade = 1 - p;
            c.save(); c.translate(x, y);
            if (fx === 'arc') {
                const w = e[8] === undefined ? 2 : 2, arc = (def.mel.arc * Math.PI / 180); c.rotate(a); c.shadowColor = c1; c.shadowBlur = 14 * px.glow + 4; c.lineCap = 'round';
                const sweep = Math.min(1, p * 2.4); c.strokeStyle = c1; c.globalAlpha = fade; c.lineWidth = 12 * fade + 3; c.beginPath(); c.arc(0, 0, r * 0.88, -arc / 2 + arc * Math.max(0, sweep - 0.55), -arc / 2 + arc * sweep); c.stroke();
                c.strokeStyle = c2; c.lineWidth = 3 * fade + 1; c.beginPath(); c.arc(0, 0, r * 0.92, -arc / 2 + arc * Math.max(0, sweep - 0.4), -arc / 2 + arc * sweep); c.stroke();
            } else if (fx === 'cone') {
                const arc = (def.mel.arc * Math.PI / 180); c.rotate(a); const gr = c.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, c2); gr.addColorStop(1, c1); c.fillStyle = gr; c.globalAlpha = 0.55 * fade; c.shadowColor = c1; c.shadowBlur = 10;
                c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * (0.45 + 0.55 * Math.min(1, p * 3)), -arc / 2, arc / 2); c.closePath(); c.fill();
            } else if (fx === 'slam') {
                c.globalAlpha = fade; c.strokeStyle = c1; c.lineWidth = 6 * fade + 2; c.shadowColor = c1; c.shadowBlur = 10; c.beginPath(); c.arc(0, 0, r * (0.3 + 0.7 * Math.min(1, p * 2.5)), 0, TAU); c.stroke();
                c.fillStyle = c2; c.globalAlpha = 0.4 * fade; c.beginPath(); c.arc(0, 0, r * 0.5 * (1 - p * 0.4), 0, TAU); c.fill();
                c.fillStyle = '#6b5a45'; c.globalAlpha = 0.8 * fade; for (let i = 0; i < 8; i++) { const aa = i * 0.785 + 0.3, rr = r * (0.5 + p * 0.6); c.fillRect(Math.cos(aa) * rr - 2, Math.sin(aa) * rr - 2 - p * 8, 4, 4); }
            } else if (fx === 'spin') {
                c.globalAlpha = fade; c.rotate(p * TAU * 1.5); c.strokeStyle = c1; c.shadowColor = c1; c.shadowBlur = 12; c.lineWidth = 8 * fade + 2; c.lineCap = 'round';
                for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, r * 0.85, i * TAU / 3, i * TAU / 3 + 1.4); c.stroke(); }
                c.strokeStyle = c2; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.globalAlpha = 0.3 * fade; c.stroke();
            } else if (fx === 'ring') {
                c.globalAlpha = fade; c.strokeStyle = c1; c.shadowColor = c1; c.shadowBlur = 10; c.lineWidth = 4 * fade + 1; c.beginPath(); c.arc(0, 0, r * (0.2 + 0.8 * p), 0, TAU); c.stroke();
            } else if (fx === 'flash') {
                const gr = c.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, c2); gr.addColorStop(0.5, c1); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.globalAlpha = fade; c.beginPath(); c.arc(0, 0, r * (0.6 + 0.4 * p), 0, TAU); c.fill();
            } else if (fx === 'burst') {
                c.globalAlpha = fade; c.strokeStyle = c1; c.lineWidth = 2.5 * fade + 0.5; c.shadowColor = c1; c.shadowBlur = 6;
                for (let i = 0; i < 9; i++) { const aa = i / 9 * TAU + (x * 0.01), r0 = r * 0.25 + r * 0.5 * p, r1_ = r0 + r * 0.35 * fade; c.beginPath(); c.moveTo(Math.cos(aa) * r0, Math.sin(aa) * r0); c.lineTo(Math.cos(aa) * r1_, Math.sin(aa) * r1_); c.stroke(); }
            } else if (fx === 'sparks') {
                c.globalAlpha = fade; for (let i = 0; i < 10; i++) { const aa = i * 2.4 + x, rr = r * p * (0.5 + (i % 3) * 0.3); c.fillStyle = i % 2 ? c1 : c2; c.fillRect(Math.cos(aa) * rr - 1.5, Math.sin(aa) * rr - 1.5 + p * 6 * (i % 2), 3, 3); }
            } else if (fx === 'blast') {
                c.globalAlpha = 0.45 * fade; c.fillStyle = c1; c.beginPath(); c.arc(0, 0, r * (0.4 + 0.6 * Math.min(1, p * 2)), 0, TAU); c.fill();
                c.globalAlpha = fade; c.strokeStyle = c2; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r * Math.min(1, p * 2.2), 0, TAU); c.stroke();
            } else if (fx === 'muzzle') {
                c.rotate(a); c.globalAlpha = fade; c.shadowColor = c1; c.shadowBlur = 12; c.fillStyle = c1; c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.7, -r * 0.35 * fade); c.lineTo(r * 1.1, 0); c.lineTo(r * 0.7, r * 0.35 * fade); c.closePath(); c.fill();
                c.fillStyle = c2; c.beginPath(); c.arc(2, 0, r * 0.25 * fade, 0, TAU); c.fill();
            } else if (fx === 'beam') {
                c.rotate(a); c.globalAlpha = fade; c.shadowColor = c1; c.shadowBlur = 16; c.fillStyle = c1; const w = Math.max(4, px.size * 0.9) * (0.4 + 0.6 * fade); c.fillRect(0, -w / 2, r, w);
                c.fillStyle = c2; c.fillRect(0, -w * 0.18, r, w * 0.36);
            } else if (fx === 'bolt') {
                const x2 = e[8] - x, y2 = e[9] - y, n = 5; c.globalAlpha = fade; c.strokeStyle = c2; c.shadowColor = c1; c.shadowBlur = 12; c.lineWidth = 3 * fade + 1; c.beginPath(); c.moveTo(0, 0);
                for (let i = 1; i < n; i++) { const f = i / n; c.lineTo(x2 * f + Math.sin(i * 7.3 + x) * 10, y2 * f + Math.cos(i * 5.1 + y) * 10); } c.lineTo(x2, y2); c.stroke();
            }
            c.restore();
        },
        Z(c, e, t) {
            const def = defOf(e[1]); if (!def) return; const x = e[2], y = e[3], R = e[4], l = e[5], kind = e[6];
            const col = kind === 'poison' ? ['#8fdc4a', '#5ba02a'] : (kind === 'fire' ? ['#ff9a3a', '#e0451f'] : ['#8fe6ff', '#5aa8e0']);
            c.save(); c.globalAlpha = Math.min(1, l * 3) * 0.28; c.fillStyle = col[1]; c.beginPath(); c.arc(x, y, R * (0.92 + Math.sin(t * 4) * 0.04), 0, TAU); c.fill();
            c.globalAlpha = Math.min(1, l * 3) * 0.7; c.fillStyle = col[0];
            for (let i = 0; i < 9; i++) { const aa = i * 2.4 + x, rr = (R * 0.8) * ((i * 0.37 + t * 0.35) % 1), yy = y + Math.sin(aa) * rr - ((t * 22 + i * 9) % 18); c.beginPath(); c.arc(x + Math.cos(aa) * rr, yy, 2 + (i % 3), 0, TAU); c.fill(); }
            c.globalAlpha = Math.min(1, l * 3) * 0.6; c.strokeStyle = col[0]; c.lineWidth = 2; c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke(); c.restore();
        },
        M(c, e, t) {
            const def = defOf(e[1]); if (!def) return; c.save(); c.translate(e[2], e[3]); c.fillStyle = '#2a241d'; c.strokeStyle = def.px.c1; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill(); c.stroke();
            c.fillStyle = (e[4] || (t * 4 % 1 < 0.5)) ? def.px.c2 : def.px.c1; c.shadowColor = def.px.c1; c.shadowBlur = 8; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill(); c.restore();
        },
        O(c, e, t) {
            const def = defOf(e[1]); if (!def) return; const [, , x, y, a, cx, cy, R] = e;
            c.save(); c.strokeStyle = def.px.c1; c.globalAlpha = 0.22; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, R, a - 0.9, a); c.stroke(); c.globalAlpha = 1;
            c.translate(x, y); c.rotate(a + Math.PI / 2 + t * 7); c.shadowColor = def.px.c1; c.shadowBlur = 10; c.fillStyle = def.px.c2; c.strokeStyle = def.px.c1; c.lineWidth = 2;
            c.beginPath(); c.moveTo(0, -12); c.quadraticCurveTo(8, -2, 0, 10); c.quadraticCurveTo(-3, 0, 0, -12); c.fill(); c.stroke(); c.restore();
        },
        T(c, e, t) {
            const def = defOf(e[1]); if (!def) return; c.save(); c.translate(e[2], e[3]); c.fillStyle = '#2a241d'; c.strokeStyle = def.px.c1; c.lineWidth = 2; c.fillRect(-7, -4, 14, 9); c.strokeRect(-7, -4, 14, 9);
            c.fillStyle = def.px.c1; c.shadowColor = def.px.c1; c.shadowBlur = 6; c.fillRect(-2, -9, 4, 8); c.restore();
        },
        B(c, e, t) {
            const def = defOf(e[1]); if (!def) return; const x = e[2], y = e[3], R = e[4]; c.save(); c.translate(x, y);
            const gr = c.createRadialGradient(0, 0, 2, 0, 0, R); gr.addColorStop(0, '#000'); gr.addColorStop(0.55, 'rgba(10,0,25,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
            c.strokeStyle = def.px.c1; c.lineWidth = 2; c.shadowColor = def.px.c1; c.shadowBlur = 10; c.rotate(t * 5); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, R * (0.35 + i * 0.18), i * 2, i * 2 + 2.2); c.stroke(); } c.restore();
        },
        S(c, e, t) {
            const [, x, y, m, s] = e; c.save(); c.translate(x, y);
            if (m & 1) { c.fillStyle = '#ff9a3a'; for (let i = 0; i < 3; i++) { c.fillRect(-s * 0.5 + i * s * 0.4, -s - ((t * 30 + i * 7) % 12), 3, 4); } }
            if (m & 2) { c.fillStyle = '#8fdc4a'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-s * 0.5 + i * s * 0.5, -s * 0.6 - ((t * 14 + i * 5) % 14), 2.2, 0, TAU); c.fill(); } }
            if (m & 4) { c.fillStyle = '#ffe14d'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText('*', Math.sin(t * 8) * 6, -s - 8); c.fillText('*', -Math.sin(t * 8) * 6, -s - 4); }
            if (m & 8) { c.strokeStyle = '#ff3d3d'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, s + 6 + Math.sin(t * 10) * 2, 0, TAU); c.moveTo(-s - 10, 0); c.lineTo(s + 10, 0); c.moveTo(0, -s - 10); c.lineTo(0, s + 10); c.stroke(); }
            if (m & 16) { c.strokeStyle = '#8fe6ff'; c.lineWidth = 2; c.globalAlpha = 0.7; c.beginPath(); c.arc(0, 0, s + 2, 0, TAU); c.stroke(); }
            c.restore();
        },
        H(c, e, t) { c.save(); c.strokeStyle = 'rgba(120,220,255,' + (0.35 + 0.4 * e[3]) + ')'; c.lineWidth = 3; c.shadowColor = '#4dd2ff'; c.shadowBlur = 10; c.beginPath(); c.arc(e[1], e[2], 22, 0, TAU); c.stroke(); c.restore(); }
    };
    const ORDER = { Z: 0, M: 1, B: 1, O: 2, T: 2, S: 3, P: 4, F: 5, H: 6 };
    let drawList = (c, L, t) => {
        c.save(); c.imageSmoothingEnabled = false;
        const okId = {}; const okOf = (id) => (id in okId ? okId[id] : (okId[id] = (id === '__pv' || mayUse(DEF[id]))));
        L = L.filter(e => !(typeof e[1] === 'string' && e[1].indexOf('CW_') === 0 && !okOf(e[1])));   // a viewer who may not use an admin-exclusive weapon never sees its effects either
        const items = L.slice().sort((a, b) => (ORDER[a[0]] || 0) - (ORDER[b[0]] || 0));
        for (const e of items) { const f = DRW[e[0]]; if (f) { try { f(c, e, t); } catch (er) { /* a bad entry must not kill the frame */ } c.shadowBlur = 0; c.globalAlpha = 1; } }
        c.restore();
    };

    // ================================================================== HELD-WEAPON ART (pixel style, drawn at the hand)
    const BASE_OPS = {
        blade: ({ rc, px }) => { rc(0, 4, 2, 4, 'g'); rc(3, 2, 3, 6, '2'); rc(4, 3, 13, 5, '1'); rc(4, 3, 13, 3, 'w'); px(14, 4, '1'); px(15, 4, '1'); },
        dagger: ({ rc, px }) => { rc(2, 4, 4, 4, 'g'); rc(5, 3, 5, 5, '2'); rc(6, 4, 11, 4, '1'); rc(6, 3, 10, 3, 'w'); px(12, 4, '1'); px(13, 4, '1'); },
        pistol: ({ rc }) => { rc(2, 4, 4, 8, 'g'); rc(2, 2, 11, 5, '1'); rc(3, 2, 10, 2, 'w'); rc(11, 3, 14, 4, '2'); rc(5, 6, 5, 6, '2'); },
        rifle: ({ rc }) => { rc(0, 3, 3, 6, 'g'); rc(4, 3, 12, 5, '1'); rc(4, 3, 12, 3, 'w'); rc(13, 4, 15, 4, '2'); rc(6, 6, 7, 8, '2'); rc(6, 1, 9, 2, '2'); },
        staff: ({ rc, dc, px }) => { rc(0, 4, 11, 4, 'g'); rc(8, 3, 9, 5, '2'); dc(13, 4, 2.4, '1'); px(12, 3, 'w'); px(11, 4, '2'); },
        wand: ({ rc, px }) => { rc(0, 4, 10, 4, 'g'); px(11, 4, '2'); px(12, 4, '1'); px(12, 3, '1'); px(12, 5, '1'); px(13, 4, 'w'); px(14, 4, '1'); px(12, 2, 'w'); px(12, 6, 'w'); },
        orb: ({ rc, dc, px }) => { rc(0, 4, 5, 4, 'g'); rc(5, 3, 6, 5, '2'); dc(10, 4, 3.4, '1'); px(9, 3, 'w'); px(10, 2, 'w'); px(8, 4, 'w'); },
        axe: ({ rc, px }) => { rc(0, 4, 12, 4, 'g'); rc(8, 1, 13, 7, '1'); rc(8, 1, 13, 2, 'w'); rc(13, 2, 14, 6, '2'); px(14, 1, '2'); px(14, 7, '2'); },
        bow: ({ rc, ln, px }) => { ln(7, 0, 10, 2, '1'); ln(10, 2, 11, 4, '1'); ln(11, 4, 10, 6, '1'); ln(10, 6, 7, 8, '1'); ln(7, 0, 7, 8, 'w'); rc(2, 4, 14, 4, 'g'); px(15, 4, '2'); px(14, 3, '2'); px(14, 5, '2'); },
        cannon: ({ rc, dc }) => { rc(4, 2, 12, 6, '1'); rc(4, 2, 12, 3, 'w'); rc(12, 1, 14, 7, '2'); dc(3, 4, 2.6, '2'); rc(5, 6, 6, 8, 'g'); },
        hammer: ({ rc }) => { rc(0, 4, 9, 4, 'g'); rc(9, 1, 14, 7, '1'); rc(9, 1, 14, 2, 'w'); rc(9, 1, 9, 7, '2'); rc(14, 1, 14, 7, '2'); },
        scythe: ({ rc, ln, px }) => { rc(0, 5, 11, 5, 'g'); ln(10, 4, 12, 1, '1'); ln(11, 4, 14, 1, '1'); ln(12, 3, 15, 2, '2'); ln(11, 2, 13, 0, 'w'); px(11, 3, '1'); }
    };
    const SPR = {};
    const baseSprite = (base, c1, c2) => {
        const key = base + c1 + c2; if (SPR[key]) return SPR[key];
        const W = 16, H = 9, G = Array.from({ length: H }, () => Array(W).fill('.'));
        const px = (x, y, ch) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) G[y][x] = ch; };
        const rc = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, ch); };
        const ln = (x0, y0, x1, y1, ch) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, ch); };
        const dc = (cx, cy, r, ch) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - cx, y - cy) <= r + 0.25) G[y][x] = ch; };
        (BASE_OPS[base] || BASE_OPS.pistol)({ rc, ln, dc, px });
        const cv = document.createElement('canvas'); cv.width = W + 2; cv.height = H + 2; const x = cv.getContext('2d');
        const pal = { 1: c1, 2: c2, w: '#ffffffcc', g: '#7a5230', k: '#14110e' };
        for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
            if (G[yy][xx] !== '.') continue;
            if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (G[yy + dy] || [])[xx + dx] && G[yy + dy][xx + dx] !== '.')) { x.fillStyle = pal.k; x.fillRect(xx + 1, yy + 1, 1, 1); }
        }
        for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const ch = G[yy][xx]; if (ch !== '.') { x.fillStyle = pal[ch]; x.fillRect(xx + 1, yy + 1, 1, 1); } }
        return (SPR[key] = cv);
    };
    // c is already translated to the hand and rotated to the aim (and flipped when facing left). Returns true when it drew.
    const drawHeldFor = (c, def, recoil, t) => {
        const an = def.an, sp = baseSprite(an.base, an.c1, an.c2), sc = 2;
        c.save();
        if (an.hold === 'bob') c.translate(0, Math.sin(t * 3.2) * 1.6);
        else if (an.hold === 'swing') c.rotate(Math.sin(t * 2.4) * 0.28);
        else if (an.hold === 'spin') c.rotate(t * 4);
        else if (an.hold === 'pulse') { const k = 1 + Math.sin(t * 6) * 0.1; c.scale(k, k); }
        const r = Math.max(0, recoil || 0);
        if (an.attack === 'kick') c.translate(-r * 5, 0);
        else if (an.attack === 'swing') c.rotate(-r * 1.7);
        else if (an.attack === 'thrust') c.translate(r * 8, 0);
        else if (an.attack === 'spin') c.rotate(r * TAU);
        else if (an.attack === 'flash') { c.shadowColor = def.accent; c.shadowBlur = r * 22; }
        c.imageSmoothingEnabled = false;
        c.drawImage(sp, -4 * sc, -5.5 * sc, sp.width * sc, sp.height * sc);
        c.restore();
        return true;
    };
    CWL.drawHeld = (c, id, recoil) => { const d = DEF[id]; if (!d || !mayUse(d)) return false; try { return drawHeldFor(c, d, recoil, performance.now() / 1000); } catch (e) { return false; } };

    // ================================================================== REAL-GAME GLUE
    const realEnv = {
        zs: () => g.zombies, barrels: () => g.barrels || [],
        hurt: (z, d, id) => withSrc(id, () => hurt(z, d)),
        hurtB: (b, d, id) => withSrc(id, () => hurtBarrel(b, d)),
        pop: (x, y, t) => { try { popSync(x, y, t); } catch (e) { /* ignore */ } },
        shake: (n) => { g.shake = Math.max(g.shake, n); },
        heal: (p, n) => { if (p && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + n); },
        shield: (n) => { g.cwSh = Math.min(40, (g.cwSh || 0) + n); },
        haste: (t) => { if (g.buffs) g.buffs.speed = Math.max(g.buffs.speed || 0, t); }
    };
    const RS = () => g.cw || (g.cw = { o: [], q: [], tick: 0, W: 800, H: 600, env: realEnv, kd: {}, shield: () => g.cwSh || 0, shieldAt: () => g.player });

    const handler = (p, t, id, m) => {
        const def = DEF[id]; if (!def || !t) return;
        const S = RS(), slot = currentUserData.loadout.indexOf(id);
        const refund = () => { if (slot >= 0 && g.cooldowns) g.cooldowns['OPL'[slot]] = 0; };
        const isPeer = g.peers && g.peers.some(pe => pe.pl === p);
        const rm = radOf(id, m) / def.n.range;
        if (def.kind === 'melee' && Math.hypot(t.x - p.x, t.y - p.y) > def.n.range * rm + (t.size || 14) + 10) { refund(); return; }
        if (def.pat.mode === 'tap' && !m.hold && !isPeer && slot >= 0 && S.kd['OPL'[slot]]) { refund(); return; }
        fireWeapon(S, def, p, t, getMod(id, def.n.dmg, 'dmg') * dmgMul(), rm);
    };

    const toWD = (d) => {
        const scr = d.ptype === 'scraps';
        const tag = d.rarity === 'common' ? '' : '[' + d.rarity[0].toUpperCase() + d.rarity.slice(1) + '] ';
        const o = { label: d.name, icon: d.icon, unlock: d.price, color: d.accent, radius: d.n.range, dmg: d.n.dmg, cooldown: cdMs(d), scrap: scr,
            desc: tag + (d.desc || (d.kind === 'melee' ? 'Melee ' + d.mel.style : 'Ranged ' + d.pat.type) + ', ' + d.n.dmg + ' dmg'), cw: true, cwAdm: !!d.adminOnly };
        if (scr) o.cwScrap = d.price;
        if (d.pat.heat && d.kind === 'ranged') { o.hold = true; o.cooldown = 80; }
        return o;
    };

    // ----- persistence -----
    const LS_CACHE = 'mp_cw_cache_v1', LS_PEND = 'mp_cw_pending_v1', COL = 'customweapons';
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window etc */ } };
    const DEFAULTS = {};
    const REMOTE = { docs: {}, ok: false };    // raw docs from Firestore (or the localStorage cache until Firestore answers)
    let PEND = lsGet(LS_PEND, {});             // id -> def | null (null = delete) for writes that have not reached Firestore yet
    let READY = false, onChange = [];

    const merged = () => {
        const out = {};
        Object.keys(DEFAULTS).forEach(id => { out[id] = DEFAULTS[id]; });
        Object.keys(REMOTE.docs).forEach(id => { const r = REMOTE.docs[id]; if (r && r.deleted) { delete out[id]; return; } const d = sanitize({ ...r, id }); if (d) out[id] = d; });
        Object.keys(PEND).forEach(id => { const r = PEND[id]; if (r === null || (r && r.deleted)) delete out[id]; else { const d = sanitize({ ...r, id }); if (d) out[id] = d; } });
        return out;
    };

    // ----- admin-exclusive access. Client-side only (see RULES-NEEDED.md): hidden from WEAPON_DATA for non-admins, stripped from their account, blocked in execute() -----
    const admNow = () => { try { return typeof isAdmin === 'function' && !!isAdmin(); } catch (e) { return false; } };
    const unameOf = (u) => String((u && u.username) || '').toLowerCase();
    const mayUse = (d, u) => !d || !d.adminOnly || admNow() || (d.allow || []).indexOf(unameOf(u || currentUserData)) >= 0;
    CWL.allowed = (id) => mayUse(DEF[id], currentUserData);
    // used by execute(): only for real (hydrated) accounts; a party guest's loadout was already filtered by cleanInfo when they joined
    CWL.blocked = (id) => { const d = DEF[id]; if (!d || !d.adminOnly) return false; if (!currentUserData || !currentUserData.username) return false; return !mayUse(d, currentUserData); };
    CWL.cleanInfo = (info, hello) => safe('cleanInfo', () => {
        if (!info || !Array.isArray(info.loadout)) return;
        const claim = !!(hello && hello.adm === true), un = String(info.un || '').toLowerCase();
        info.loadout = info.loadout.map(id => { const d = id && DEF[id]; return (d && d.adminOnly && !claim && d.allow.indexOf(un) < 0) ? null : id; });
        if (!info.loadout.some(Boolean)) info.loadout = ['MINES'];
    });
    let userSeen = { u: null, t: 0, key: '' };
    const enforce = (force) => safe('enforce', () => {
        const u = typeof currentUserData !== 'undefined' ? currentUserData : null; if (!u || !u.username) return;
        if (userSeen.u !== u) userSeen = { u, t: Date.now(), key: '' };
        const settled = !!force || Date.now() - userSeen.t >= 3000;   // let LINKED / admin flags settle after login so an admin is never stripped by mistake
        const key = unameOf(u) + '|' + admNow() + '|' + settled + '|' + Object.keys(DEF).map(id => (DEF[id].adminOnly ? 1 : 0) + (DEF[id].teaser ? 1 : 0) + DEF[id].allow.join('.')).join(',');
        if (userSeen.key === key) return; userSeen.key = key;
        applyDefs(settled);
    });
    CWL.enforce = enforce;
    setInterval(() => enforce(false), 1000);
    const sanitizeUser = (u, strict) => {
        if (!u || !Array.isArray(u.loadout)) return false;
        if (!READY) return false;
        let ch = false;
        const bad = (id) => { const d = typeof id === 'string' && DEF[id]; return !!(d && d.adminOnly && !mayUse(d, u)); };
        if (strict && u.username && Array.isArray(u.unlocked) && u.unlocked.some(bad)) { u.unlocked = u.unlocked.filter(id => !bad(id)); ch = true; }
        if (strict && u.username && u.loadout.some(bad)) { u.loadout = u.loadout.filter(id => !bad(id)); ch = true; }
        if (ch) u._cwStripped = true;
        const keep = u.loadout.filter(id => !(typeof id === 'string' && id.indexOf('CW_') === 0 && !DEF[id]));
        if (keep.length !== u.loadout.length) { u.loadout = keep; return true; }
        return ch;
    };
    const placeholders = (u) => {   // while Firestore has not answered yet, make sure an equipped custom weapon cannot crash the lobby UI
        if (!u) return;
        [].concat(u.loadout || [], u.unlocked || []).forEach(id => {
            if (typeof id === 'string' && id.indexOf('CW_') === 0 && !WEAPON_DATA[id]) WEAPON_DATA[id] = { label: 'Custom weapon', icon: '🔮', unlock: 0, color: '#9a8e7a', radius: 100, dmg: 0, cooldown: 1000, desc: 'Loading...', cw: true, cwPh: true };
        });
    };

    const applyDefs = (fromEnforce) => safe('applyDefs', () => {
        const m = merged();
        Object.keys(DEF).forEach(id => { if (!m[id]) delete DEF[id]; });
        Object.keys(m).forEach(id => { DEF[id] = m[id]; });
        const vis = (d) => mayUse(d) || (d.adminOnly && d.teaser);   // teaser: shown but locked for non-admins
        Object.keys(WEAPON_DATA).forEach(id => { if (WEAPON_DATA[id] && WEAPON_DATA[id].cw && !(DEF[id] && vis(DEF[id])) && !(WEAPON_DATA[id].cwPh && !READY)) { delete WEAPON_DATA[id]; delete SPECIAL[id]; } });
        Object.keys(DEF).forEach(id => { if (!vis(DEF[id])) return; const w = toWD(DEF[id]); if (!mayUse(DEF[id])) { w.cwLocked = true; w.unlock = Math.min(w.unlock, 7999); delete w.cwScrap; } WEAPON_DATA[id] = w; SPECIAL[id] = handler; });
        CWL.defs = DEF;
        if (READY && typeof currentUserData !== 'undefined' && currentUserData) {
            const settled = fromEnforce || (userSeen.u === currentUserData && Date.now() - userSeen.t >= 3000);
            {
                const ch = sanitizeUser(currentUserData, settled);
                if (ch) { try { save({ loadout: currentUserData.loadout, unlocked: currentUserData.unlocked }); } catch (e) { /* ignore */ } try { refreshLobbyStats(); renderShop(); } catch (e) { /* lobby not up */ } }
            }
            if (typeof g !== 'undefined' && g && !g.active) { /* lobby only: nothing else to do */ }
        }
        onChange.forEach(f => safe('onChange', f));
    });

    const pushRemote = async (id) => {
        if (typeof db === 'undefined') throw new Error('no db');
        const v = PEND[id];
        if (v === null) await db.collection(COL).doc(id).delete();
        else await db.collection(COL).doc(id).set(v);
        delete PEND[id]; lsSet(LS_PEND, PEND);
    };
    const flush = async () => { for (const id of Object.keys(PEND)) { try { await pushRemote(id); } catch (e) { return false; } } return true; };

    // ----- the 3 shipped examples, built with the same schema the lab edits -----
    const EXAMPLES = [
        { id: 'CW_NEON_KATANA', name: 'Neon Katana', desc: 'A humming plasma blade. Wide slashes that love to crit.', icon: '🗡️', accent: '#ff3dcb', rarity: 'epic', ptype: 'cash', price: 45000, kind: 'melee',
          mel: { style: 'arc', arc: 140 }, px: { c1: '#ff3dcb', c2: '#ffe6fb', glow: 0.8, impact: 'sparks', shake: 2, trail: 'none' }, pat: { type: 'single', mode: 'hold' },
          n: { dmg: 55, rate: 3.2, cd: 0, range: 120, knock: 60, critMult: 2.5 }, ab: { crit: 3, lifesteal: 1 },
          an: { hold: 'swing', attack: 'swing', base: 'blade', c1: '#ff3dcb', c2: '#9ad0ff' } },
        { id: 'CW_RICOCHET_PISTOL', name: 'Ricochet Pistol', desc: 'Neon bolts that ping off the walls and hunt a second target.', icon: '🔫', accent: '#4dffb0', rarity: 'rare', ptype: 'cash', price: 22000, kind: 'ranged',
          px: { shape: 'bolt', size: 5, speed: 13, c1: '#4dffb0', c2: '#ffffff', trail: 'rainbow', glow: 0.7, impact: 'sparks', muzzle: true, shake: 0 }, pat: { type: 'single', mode: 'hold' },
          n: { dmg: 34, rate: 4, cd: 0, range: 480, pierce: 0, bounce: 3, homing: 0.25, knock: 15 }, ab: { ricochet: 2 },
          an: { hold: 'bob', attack: 'kick', base: 'pistol', c1: '#4dffb0', c2: '#2a2a35' } },
        { id: 'CW_PLAGUE_MORTAR', name: 'Plague Mortar', desc: 'Lobs a toxic blob that bursts into a lingering poison cloud.', icon: '🧪', accent: '#8fdc4a', rarity: 'legendary', ptype: 'scraps', price: 3500, kind: 'ranged',
          px: { shape: 'blob', size: 9, speed: 6, c1: '#8fdc4a', c2: '#e7ffb0', trail: 'smoke', glow: 0.4, impact: 'ring', muzzle: true, shake: 3, lob: true, zone: 'poison', zsec: 7 }, pat: { type: 'single', mode: 'hold' },
          n: { dmg: 70, rate: 0.7, cd: 0.4, range: 460, explode: 90, knock: 30 }, ab: { poison: 3, slow: 2 },
          an: { hold: 'pulse', attack: 'kick', base: 'cannon', c1: '#6f9a3a', c2: '#e7ffb0' } }
    ];
    EXAMPLES.forEach(e => { const d = sanitize(e); if (d) { d.by = 'Example'; DEFAULTS[d.id] = d; } });

    // boot: defaults + cached copy right now (so offline / slow Firestore still works), then live Firestore on top
    const cached = lsGet(LS_CACHE, null);
    if (cached && typeof cached === 'object') { REMOTE.docs = cached; READY = true; }
    applyDefs();

    safe('firestore', () => {
        if (typeof db === 'undefined') return;
        db.collection(COL).onSnapshot((snap) => {
            const docs = {}; snap.forEach(x => { docs[x.id] = x.data(); });
            REMOTE.docs = docs; REMOTE.ok = true; READY = true; lsSet(LS_CACHE, docs);
            Object.keys(PEND).forEach(id => { const v = PEND[id]; const r = docs[id]; if (v === null ? !r || r.deleted : (r && r.t === v.t)) delete PEND[id]; }); lsSet(LS_PEND, PEND);
            applyDefs();
        }, (err) => { console.warn('[weaponlab] customweapons listener:', err && (err.code || err.message)); });
        flush();
        setInterval(() => { if (Object.keys(PEND).length) flush(); }, 60000);
    });

    // when a user loads, an equipped custom weapon that is not loaded yet must not crash anything; one that was deleted is dropped silently
    safe('fixUser', () => {
        const A = window.ARS; if (!A) return;
        const o = A.fixUser;
        A.fixUser = function (data) { const r = o ? o.apply(this, arguments) : data; safe('fixUser-cw', () => { placeholders(data); if (sanitizeUser(data)) { /* saved on the next equip/save */ } }); return r; };
    });

    // ----- hooks into the arsenal's per-tick / draw / party-snapshot plumbing (wrapping, so no more edits in the main file) -----
    safe('wrap-ars', () => {
        const A = window.ARS; if (!A) { console.warn('[weaponlab] ARS missing: custom weapons cannot tick'); return; }
        const oTick = A.tick;
        A.tick = function () {
            if (oTick) oTick.apply(this, arguments);
            safe('tick', () => {
                if (!g.cw) return; const S = g.cw;
                S.kd.O = !!keys.KeyO; S.kd.P = !!keys.KeyP; S.kd.L = !!keys.KeyL;   // edge detection for tap-to-fire weapons
                tickWorld(S);
            });
        };
        const oDraw = A.draw;
        A.draw = function (c, t) {
            if (oDraw) oDraw.apply(this, arguments);
            safe('draw', () => {
                const L = (typeof MP !== 'undefined' && MP.role === 'guest') ? (A.remote && A.remote.cw) : (g.cw ? ser(g.cw) : null);
                if (L && L.length) drawList(c, L, t);
            });
        };
        const oSnap = A.snap;
        A.snap = function () {
            let s = oSnap ? oSnap.apply(this, arguments) : 0;
            safe('snap', () => { if (g.cw) { const L = ser(g.cw); if (L.length) { if (!s) s = { l: [], m: 0, n: 1 }; s.cw = L; } } });
            return s;
        };
        const oHit = A.onHit;
        A.onHit = function (d) {
            safe('shield', () => { if (g.cwSh > 0 && d > 0) { const a = Math.min(d, g.cwSh); g.cwSh -= a; d -= a; } });
            if (d <= 0.001) return 0;
            return oHit ? oHit.call(this, d) : d;
        };
    });

    // ----- shop: scrap-priced custom weapons -----
    safe('shop', () => {
        const buy = window.buyWeapon;
        if (typeof buy === 'function') window.buyWeapon = function (id) {
            const d = WEAPON_DATA[id];
            if (d && d.cw && (d.cwLocked || (DEF[id] && DEF[id].adminOnly && !mayUse(DEF[id])))) return toast('That weapon is admin-exclusive.');
            if (d && d.cw && d.cwScrap) {
                const u = currentUserData; if (!u || u.unlocked.includes(id)) return;
                if ((u.scraps || 0) < d.cwScrap) return toast('Not enough scraps.');
                u.scraps -= d.cwScrap; u.unlocked.push(id);
                try { renderShop(); refreshLobbyStats(); } catch (e) { /* ignore */ }
                return save({ scraps: u.scraps, unlocked: u.unlocked });
            }
            return buy.apply(this, arguments);
        };
        const sell = window.sellWeapon;
        if (typeof sell === 'function') window.sellWeapon = function (id) { const d = WEAPON_DATA[id]; if (d && d.cw && d.cwScrap) return toast('Scrap-bought weapons cannot be sold.'); return sell.apply(this, arguments); };
        const fix = () => {
            const grid = $q('shop-grid'); if (!grid || !currentUserData) return;
            grid.querySelectorAll('button[onclick]').forEach(b => {
                const m = /^(buyWeapon|sellWeapon)\('(CW_[A-Z0-9_]+)'\)$/.exec(b.getAttribute('onclick') || ''); if (!m) return;
                const d = WEAPON_DATA[m[2]]; if (d && d.cwLocked) { if (m[1] === 'sellWeapon') { b.remove(); return; } b.className = 'btn price cant'; b.removeAttribute('onclick'); b.innerHTML = '🔒 Admins only'; return; } if (!d || !d.cwScrap) return;
                if (m[1] === 'sellWeapon') { b.remove(); return; }
                b.className = 'btn price scrap ' + ((currentUserData.scraps || 0) >= d.cwScrap ? '' : 'cant'); b.innerHTML = '🔩 ' + Number(d.cwScrap).toLocaleString();
            });
        };
        const wrap = () => { const o = window.mpRenderShop; if (typeof o === 'function' && !o.__cw) { const w = function () { const r = o.apply(this, arguments); safe('shopfix', fix); return r; }; w.__cw = 1; window.mpRenderShop = w; } };
        wrap(); setTimeout(wrap, 800);
    });

    // ================================================================== LAB (admin UI + live preview)
    ADMIN_PERMS.weapons = 'Create custom weapons (Weapon Lab)';

    // a few sprite icons so the picker looks like the rest of the game (the page auto-swaps mapped emoji for pixel sprites)
    safe('icons', () => {
        const mk = (ops) => {
            const G = Array.from({ length: 10 }, () => Array(10).fill('.'));
            const px = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < 10 && y >= 0 && y < 10) G[y][x] = c; };
            const ln = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
            const dc = (cx, cy, r, c) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.hypot(x - cx, y - cy) <= r + 0.25) G[y][x] = c; };
            const rc = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c); };
            const dia = (cx, cy, r, c) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.abs(x - cx) + Math.abs(y - cy) <= r) G[y][x] = c; };
            ops({ px, ln, dc, rc, dia });
            const O = G.map(r => r.slice());
            for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (G[y][x] === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (G[y + dy] || [])[x + dx] && G[y + dy][x + dx] !== '.' && G[y + dy][x + dx] !== 'k')) O[y][x] = 'k';
            return O.map(r => r.join(''));
        };
        const S = {
            cw_dagger: ({ ln, px, rc }) => { ln(2, 7, 7, 2, 'w'); ln(3, 7, 8, 2, 'w'); rc(1, 7, 3, 8, 'n'); px(4, 5, 'g'); px(5, 6, 'g'); px(3, 4, 'g'); },
            cw_swords: ({ ln, px }) => { ln(1, 8, 8, 1, 'w'); ln(1, 1, 8, 8, 'b'); px(1, 8, 'n'); px(1, 1, 'n'); px(2, 7, 'g'); px(2, 2, 'g'); },
            cw_knife: ({ ln, rc, px }) => { ln(8, 1, 4, 5, 'w'); ln(7, 1, 4, 4, 'w'); rc(1, 6, 4, 8, 'n'); px(5, 5, 'g'); },
            cw_wand: ({ ln, px }) => { ln(1, 8, 6, 3, 'n'); px(7, 2, 'y'); px(7, 1, 'y'); px(7, 3, 'y'); px(6, 2, 'y'); px(8, 2, 'y'); px(7, 2, 'w'); px(2, 1, 'y'); px(8, 6, 'y'); },
            cw_comet: ({ dc, ln }) => { dc(6.5, 6.5, 2.4, 'o'); dc(6.5, 6.5, 1.2, 'y'); ln(5, 5, 1, 1, 'o'); ln(6, 4, 3, 1, 'r'); ln(4, 6, 1, 3, 'r'); },
            cw_storm: ({ dc, rc, ln }) => { dc(3.5, 3, 2.2, 's'); dc(6.5, 3.5, 2.6, 's'); rc(2, 3, 8, 4, 's'); ln(5, 5, 4, 7, 'y'); ln(6, 5, 5, 7, 'y'); ln(4, 7, 6, 7, 'y'); ln(5, 7, 4, 9, 'y'); },
            cw_magnet: ({ rc, dc }) => { rc(1, 5, 2, 8, 'r'); rc(7, 5, 8, 8, 'r'); rc(1, 1, 8, 4, 'b'); rc(3, 3, 6, 4, 'k'); rc(1, 7, 2, 8, 'w'); rc(7, 7, 8, 8, 'w'); },
            cw_crystal: ({ dia, px }) => { dia(4.5, 4.5, 4, 'c'); dia(4.5, 4.5, 2, 'w'); px(4, 4, 'b'); },
            cw_trap: ({ rc, px }) => { rc(1, 5, 8, 6, 's'); [1, 3, 5, 7].forEach(x => { px(x, 4, 'w'); px(x, 3, 'w'); }); rc(1, 7, 8, 7, 'd'); },
            cw_cane: ({ ln, px }) => { ln(1, 8, 8, 1, 'w'); px(2, 7, 'r'); px(4, 5, 'r'); px(6, 3, 'r'); px(8, 1, 'y'); },
            cw_flask: ({ rc, dc, px }) => { rc(4, 1, 5, 3, 's'); dc(4.5, 6.2, 2.9, 'l'); rc(3, 5, 6, 8, 'l'); px(3, 5, 'w'); px(6, 8, 'L'); }
        };
        const rows = {}; Object.keys(S).forEach(n => { rows[n] = mk(S[n]); });
        Object.assign(ICON_ROWS, rows);
        const map = { '🗡': 'cw_dagger', '⚔': 'cw_swords', '🔪': 'cw_knife', '🪄': 'cw_wand', '☄': 'cw_comet', '🌩': 'cw_storm', '🧲': 'cw_magnet', '💠': 'cw_crystal', '🪤': 'cw_trap', '🦯': 'cw_cane', '⚗': 'cw_flask' };
        Object.keys(map).forEach(k => { if (!EMO_MAP[k]) EMO_MAP[k] = map[k]; });
    });
    const ICONS = ['🗡️', '⚔️', '🔪', '🪄', '☄️', '🌩️', '🧲', '💠', '🪤', '🦯', '⚗️', '🔫', '🏹', '🪓', '🔨', '💣', '🧨', '🔥', '⚡', '🧊', '☢️', '🌀', '💥', '✨', '⭐', '☠️', '🎯', '🔱', '🧪', '🌠', '🚀', '🎆', '🪃', '🔮', '💎', '🤖', '🌊', '🎸', '🥊', '⛏️'];

    // ---- form description ----
    const isOwnerNow = () => { try { return typeof isOwner === 'function' && isOwner(); } catch (e) { return false; } };
    const F = (sec, p, t, lb, o) => Object.assign({ sec, p, t, lb }, o || {});
    const opts = (arr) => arr.map(v => [v, v]);
    const FORM = [
        ['Basics', null],
        F('b', 'name', 'txt', 'Name', { max: 24 }), F('b', 'desc', 'txt', 'Description', { max: 120 }),
        F('b', 'icon', 'icon', 'Shop icon'), F('b', 'accent', 'clr', 'Accent colour'),
        F('b', 'rarity', 'sel', 'Rarity tag', { o: opts(RARITIES) }),
        F('b', 'ptype', 'sel', 'Price in', { o: [['cash', 'Cash ($)'], ['scraps', 'Scraps']] }), F('b', 'price', 'num', 'Price (0 = free)', { min: 0, max: 100000000, step: 100 }),
        F('b', 'adminOnly', 'chk', 'Admin exclusive (only admins can own, buy, see or use it)'),
        F('b', 'teaser', 'chk', 'Visible to players as a locked teaser in the shop', { show: d => d.adminOnly }),
        F('b', 'allow', 'list', 'Also allow these players (usernames, comma separated; owner only)', { show: d => d.adminOnly, dis: () => !isOwnerNow() }),
        F('b', 'kind', 'sel', 'Weapon type', { o: [['ranged', 'Ranged (projectiles)'], ['melee', 'Melee (swing)']] }),
        ['Melee swing', (d) => d.kind === 'melee'],
        F('m', 'mel.style', 'sel', 'Swing style', { o: [['arc', 'Arc slash'], ['cone', 'Cone slash'], ['slam', 'Ground slam'], ['spin', 'Spin (360)']] }),
        F('m', 'mel.arc', 'rng', 'Arc angle (deg)', { min: 20, max: 360, step: 5, show: d => d.mel.style === 'arc' || d.mel.style === 'cone' }),
        ['Fire pattern', (d) => d.kind === 'ranged'],
        F('p', 'pat.type', 'sel', 'Pattern', { o: [['single', 'Single shot'], ['spread', 'Spread (fan)'], ['burst', 'Burst (delayed volley)'], ['nova', 'Ring / nova'], ['beam', 'Beam (hitscan)'], ['mine', 'Mine / trap'], ['orbit', 'Orbiting blades']] }),
        F('p', 'pat.count', 'rng', 'Projectile count', { min: 1, max: 24, step: 1, show: d => d.pat.type !== 'single' && d.pat.type !== 'beam' }),
        F('p', 'pat.spread', 'rng', 'Spread angle (deg)', { min: 0, max: 360, step: 5, show: d => d.pat.type === 'spread' }),
        F('p', 'pat.delay', 'rng', 'Burst delay (ms)', { min: 30, max: 600, step: 10, show: d => d.pat.type === 'burst' }),
        F('p', 'pat.mode', 'sel', 'Trigger', { o: [['hold', 'Hold to fire'], ['tap', 'Tap to fire']] }),
        F('p', 'pat.heat', 'chk', 'Overheat meter (hold, fixed 12.5 shots/s, charge bar)'),
        ['Projectile look', (d) => d.kind === 'ranged' && d.pat.type !== 'orbit' && d.pat.type !== 'mine'],
        F('j', 'px.shape', 'sel', 'Shape', { o: opts(SHAPES), show: d => d.pat.type !== 'beam' }),
        F('j', 'px.size', 'rng', 'Size', { min: 2, max: 30, step: 1 }),
        F('j', 'px.speed', 'rng', 'Speed (px/tick)', { min: 2, max: 30, step: 1, show: d => d.pat.type !== 'beam' }),
        F('j', 'px.lob', 'chk', 'Lobbed arc (lands on the target, blasts there)', { show: d => d.pat.type !== 'beam' }),
        F('j', 'px.spin', 'chk', 'Spinning projectile', { show: d => d.pat.type !== 'beam' }),
        F('j', 'px.trail', 'sel', 'Trail', { o: opts(TRAILS), show: d => d.pat.type !== 'beam' }),
        ['Colours & effects', null],
        F('c', 'px.c1', 'clr', 'Main colour'), F('c', 'px.c2', 'clr', 'Secondary colour'),
        F('c', 'px.glow', 'rng', 'Glow', { min: 0, max: 1, step: 0.05 }),
        F('c', 'px.impact', 'sel', 'Impact effect', { o: opts(IMPACTS) }),
        F('c', 'px.muzzle', 'chk', 'Muzzle flash', { show: d => d.kind === 'ranged' }),
        F('c', 'px.shake', 'rng', 'Screen shake', { min: 0, max: 10, step: 0.5 }),
        F('c', 'px.zone', 'sel', 'Leaves a ground zone', { o: [['none', 'None'], ['poison', 'Poison cloud'], ['fire', 'Fire pool'], ['frost', 'Frost patch']], show: d => d.kind === 'ranged' && d.pat.type !== 'beam' && d.pat.type !== 'orbit' }),
        F('c', 'px.zsec', 'rng', 'Zone lasts (s)', { min: 1, max: 15, step: 1, show: d => d.kind === 'ranged' && d.px.zone !== 'none' && d.pat.type !== 'beam' && d.pat.type !== 'orbit' }),
        ['Numbers', null],
        F('n', 'n.dmg', 'num', 'Damage per hit', { min: 1, max: 5000, step: 1 }),
        F('n', 'n.rate', 'rng', 'Fire rate (shots/sec)', { min: 0.2, max: 20, step: 0.1, dis: d => d.pat.heat && d.kind === 'ranged' }),
        F('n', 'n.cd', 'rng', 'Extra cooldown (s)', { min: 0, max: 10, step: 0.1, dis: d => d.pat.heat && d.kind === 'ranged' }),
        F('n', 'n.range', 'rng', 'Range / radius (px)', { min: 40, max: 900, step: 10 }),
        F('n', 'n.pierce', 'rng', 'Pierce (extra targets)', { min: 0, max: 10, step: 1, show: d => d.kind === 'ranged' }),
        F('n', 'n.bounce', 'rng', 'Wall bounces', { min: 0, max: 8, step: 1, show: d => d.kind === 'ranged' && ['single', 'spread', 'burst', 'nova'].includes(d.pat.type) && !d.px.lob }),
        F('n', 'n.homing', 'rng', 'Homing strength', { min: 0, max: 1, step: 0.05, show: d => d.kind === 'ranged' && ['single', 'spread', 'burst', 'nova'].includes(d.pat.type) && !d.px.lob }),
        F('n', 'n.explode', 'rng', 'Explosion radius', { min: 0, max: 250, step: 5, show: d => d.kind === 'ranged' }),
        F('n', 'n.knock', 'rng', 'Knockback (px)', { min: 0, max: 300, step: 5 }),
        F('n', 'n.critMult', 'rng', 'Crit multiplier', { min: 1, max: 6, step: 0.1, show: d => d.ab.crit > 0 }),
        ['Special abilities (0 = off, 1-5 = strength)', null],
        ...ABIL.map(a => F('a', 'ab.' + a[0], 'rng', a[1], { min: 0, max: 5, step: 1, tip: a[2], ab: 1 })),
        ['Animation & held sprite', null],
        F('s', 'an.base', 'sel', 'Weapon sprite', { o: opts(BASES) }),
        F('s', 'an.c1', 'clr', 'Sprite colour 1'), F('s', 'an.c2', 'clr', 'Sprite colour 2'),
        F('s', 'an.hold', 'sel', 'Hand animation (idle)', { o: opts(HOLD_ANIMS) }),
        F('s', 'an.attack', 'sel', 'Attack animation', { o: opts(ATK_ANIMS) })
    ];

    const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    const setP = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] || (a[ks[i]] = {}); a[ks[ks.length - 1]] = v; };

    const CSS = `
#cwl-modal{z-index:130}
#cwl-modal .cwl-box{width:min(1280px,100%);max-height:calc(100vh - 24px);overflow-y:auto;padding:16px;border-color:var(--violet)}
#cwl-modal h2{font-size:26px;color:var(--violet)}
#cwl-modal .cwl-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
#cwl-modal .cwl-head .btn{width:auto}
#cwl-modal .cwl-cols{display:grid;grid-template-columns:210px minmax(300px,1fr) 440px;gap:14px;align-items:start}
#cwl-modal .cwl-left,#cwl-modal .cwl-right{position:sticky;top:0}
#cwl-modal .cwl-sec{margin:12px 0 4px;padding-top:8px;border-top:2px solid var(--line);color:var(--mustard);font-family:'Special Elite',monospace;font-size:15px}
#cwl-modal .cwl-sec:first-child{margin-top:0;border-top:0;padding-top:0}
#cwl-modal .cwl-f{display:grid;grid-template-columns:132px 1fr 46px;gap:8px;align-items:center;margin:5px 0;font-size:13px}
#cwl-modal .cwl-f.wide{grid-template-columns:132px 1fr}
#cwl-modal .cwl-f>span{color:var(--ink)}
#cwl-modal .cwl-f .v{font-weight:700;color:var(--mustard);text-align:right;font-size:12px}
#cwl-modal input,#cwl-modal select,#cwl-modal textarea{padding:6px 8px;font-size:13px;width:100%;background:#17130f;color:var(--ink);border:2px solid var(--line);border-radius:var(--r-sm);font-family:inherit}
#cwl-modal input[type=range]{padding:0;border:0;background:none;accent-color:var(--mustard)}
#cwl-modal input[type=color]{padding:0;height:30px;cursor:pointer}
#cwl-modal input[type=checkbox]{width:auto}
#cwl-modal .cwl-ck{display:flex;gap:8px;align-items:center;font-size:13px;margin:5px 0;cursor:pointer}
#cwl-modal .cwl-icons{display:grid;grid-template-columns:repeat(10,1fr);gap:3px}
#cwl-modal .cwl-icons button{background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);padding:2px;cursor:pointer;font-size:18px;line-height:1.1;color:var(--ink)}
#cwl-modal .cwl-icons button.on{border-color:var(--mustard);background:#2d2720}
#cwl-modal .cwl-icons .icn{width:20px;height:20px}
#cwl-modal .cwl-pv{width:100%;aspect-ratio:2/1;background:#1b1713;border:2px solid var(--line);border-radius:var(--r-sm);display:block;image-rendering:pixelated}
#cwl-modal .cwl-dps{background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);padding:10px;margin-top:8px;font-size:13px}
#cwl-modal .cwl-dps b{color:var(--mustard)}
#cwl-modal .cwl-big{font-size:24px;color:var(--olive);font-weight:700}
#cwl-modal .cwl-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#cwl-modal .cwl-row .btn{width:auto;flex:1 1 auto}
#cwl-modal .cwl-item{display:flex;align-items:center;gap:6px;padding:6px;margin:4px 0;background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);font-size:12px;flex-wrap:wrap}
#cwl-modal .cwl-item.on{border-color:var(--mustard)}
#cwl-modal .cwl-item .nm{flex:1;min-width:80px;font-weight:700;display:flex;align-items:center;gap:4px}
#cwl-modal .cwl-item .btn{width:auto;padding:3px 7px;font-size:11px}
#cwl-modal .cwl-out{min-height:18px;font-size:12px;margin-top:6px}
#cwl-modal .cwl-json{margin-top:8px;display:none}
#cwl-modal .cwl-json textarea{height:160px;font-family:monospace;font-size:11px}
#cwl-modal .cwl-hold{width:100%;height:56px;background:#17130f;border:2px solid var(--line);border-radius:var(--r-sm);margin-top:8px;display:block;image-rendering:pixelated}
#cwl-modal .cwl-cols>*{min-width:0}#cwl-modal .cwl-dps{overflow-wrap:anywhere}
@media(max-width:900px){#cwl-modal .cwl-cols{grid-template-columns:minmax(0,1fr)}#cwl-modal .cwl-left,#cwl-modal .cwl-right{position:static}#cwl-modal .cwl-right{order:-1}#cwl-modal .cwl-f{grid-template-columns:110px 1fr 40px}#cwl-modal .cwl-box{padding:10px}#cwl-modal .cwl-icons{grid-template-columns:repeat(8,1fr)}}
#adm-tabs button.cwl-tab{}
`;

    const LAB = { cur: null, editing: null, built: false, timer: 0, pv: null, dirty: false };
    const out = (m, bad) => { const o = $q('cwl-out'); if (o) { o.style.color = bad ? 'var(--blood)' : 'var(--olive)'; o.textContent = m; } };
    const isMobileish = () => window.innerWidth < 900;

    const buildDom = () => {
        if (LAB.built) return; LAB.built = true;
        const st = document.createElement('style'); st.id = 'cwl-css'; st.textContent = CSS; document.head.appendChild(st);
        const m = document.createElement('div'); m.id = 'cwl-modal'; m.className = 'overlay hidden';
        m.innerHTML = `<div class="panel cwl-box"><div class="cwl-head"><h2>Weapon Lab</h2><div class="cwl-row" style="margin:0"><button class="btn btn-go btn-sm" id="cwl-new">+ New weapon</button><button class="btn btn-sm" id="cwl-jsonbtn">JSON</button><button class="btn btn-danger btn-sm" id="cwl-close">Close</button></div></div>
            <div class="cwl-cols"><div class="cwl-left"><div class="cwl-sec">Custom weapons</div><div id="cwl-list"></div></div>
            <div class="cwl-mid" id="cwl-form"></div>
            <div class="cwl-right"><canvas class="cwl-pv" id="cwl-pv" width="520" height="260"></canvas><canvas class="cwl-hold" id="cwl-hold" width="260" height="28"></canvas>
                <div class="cwl-dps" id="cwl-dps"></div>
                <div class="cwl-row"><button class="btn btn-primary" id="cwl-save">Save &amp; publish</button><button class="btn" id="cwl-give">Unlock for me</button><button class="btn btn-danger" id="cwl-del">Delete</button></div>
                <p class="cwl-out" id="cwl-out"></p>
                <div class="cwl-json" id="cwl-jsonbox"><textarea id="cwl-json" spellcheck="false" placeholder="paste a weapon JSON (or an array of them) here"></textarea><div class="cwl-row"><button class="btn btn-sm" id="cwl-exp1">Export this weapon</button><button class="btn btn-sm" id="cwl-expall">Export all</button><button class="btn btn-sm btn-go" id="cwl-imp">Import into editor</button><button class="btn btn-sm btn-violet" id="cwl-impsave">Import &amp; publish all</button></div></div>
            </div></div></div>`;
        document.body.appendChild(m);
        m.addEventListener('mousedown', (e) => { if (e.target === m) closeLab(); });
        window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !m.classList.contains('hidden') && !document.activeElement?.matches?.('input[type=text],textarea')) closeLab(); }, true);
        $q('cwl-close').onclick = closeLab; $q('cwl-new').onclick = () => loadDef(blank(), null);
        $q('cwl-save').onclick = saveCur; $q('cwl-del').onclick = () => delDef(LAB.editing);
        $q('cwl-give').onclick = giveMe; $q('cwl-jsonbtn').onclick = () => { const b = $q('cwl-jsonbox'); b.style.display = b.style.display === 'block' ? 'none' : 'block'; };
        $q('cwl-exp1').onclick = () => { $q('cwl-json').value = JSON.stringify(strip(readCur()), null, 1); };
        $q('cwl-expall').onclick = () => { $q('cwl-json').value = JSON.stringify(Object.keys(DEF).map(id => strip(DEF[id])), null, 1); };
        $q('cwl-imp').onclick = () => importJson(false); $q('cwl-impsave').onclick = () => importJson(true);
        buildForm();
    };
    const strip = (d) => { const o = clone(d); delete o.t; return o; };

    const buildForm = () => {
        const f = $q('cwl-form'); let html = '';
        const rowFor = (r) => {
            const id = 'cwf-' + r.p.replace('.', '-');
            if (r.t === 'list') return `<label class="cwl-f wide" data-p="${r.p}"><span>${E_(r.lb)}</span><textarea id="${id}" data-p="${r.p}" rows="2" spellcheck="false"></textarea></label>`;
            if (r.t === 'chk') return `<label class="cwl-ck" data-p="${r.p}"><input type="checkbox" id="${id}" data-p="${r.p}">${E_(r.lb)}</label>`;
            if (r.t === 'icon') return `<div class="cwl-f wide" data-p="${r.p}"><span>${r.lb}</span><div class="cwl-icons" id="${id}">${ICONS.map(e => `<button type="button" data-ic="${e}">${e}</button>`).join('')}</div></div>`;
            let inp;
            if (r.t === 'sel') inp = `<select id="${id}" data-p="${r.p}">${r.o.map(([v, l]) => `<option value="${v}">${E_(l)}</option>`).join('')}</select>`;
            else if (r.t === 'clr') inp = `<input type="color" id="${id}" data-p="${r.p}">`;
            else if (r.t === 'txt') inp = `<input type="text" id="${id}" data-p="${r.p}" maxlength="${r.max}" autocomplete="off">`;
            else if (r.t === 'num') inp = `<input type="number" id="${id}" data-p="${r.p}" min="${r.min}" max="${r.max}" step="${r.step}">`;
            else inp = `<input type="range" id="${id}" data-p="${r.p}" min="${r.min}" max="${r.max}" step="${r.step}">`;
            const wide = r.t === 'sel' || r.t === 'clr' || r.t === 'txt' || r.t === 'num';
            return `<label class="cwl-f ${wide ? 'wide' : ''}" data-p="${r.p}" ${r.tip ? `title="${E_(r.tip)}"` : ''}><span>${E_(r.lb)}</span>${inp}${wide ? '' : `<b class="v" id="${id}-v"></b>`}</label>`;
        };
        FORM.forEach((r) => {
            if (Array.isArray(r)) html += `${html ? '</div>' : ''}<div class="cwl-grp" data-t="${E_(r[0])}"><div class="cwl-sec">${E_(r[0])}</div>`;
            else html += rowFor(r);
        });
        f.innerHTML = html + '</div>';
        f.querySelectorAll('.cwl-grp').forEach((el, i) => { el._show = FORM.filter(Array.isArray)[i][1]; });
        const onIn = (e) => {
            const el = e.target; if (el.closest('.cwl-icons')) return; const p = el.dataset.p; if (!p) return;
            const row = FORM.find(r => !Array.isArray(r) && r.p === p); if (!row) return;
            let v = row.t === 'list' ? el.value.split(/[\s,;]+/).map(x => x.toLowerCase()).filter(Boolean) : row.t === 'chk' ? el.checked : (row.t === 'num' || row.t === 'rng' ? +el.value : el.value);
            if (row.t === 'num' && !isFinite(v)) return;
            setP(LAB.cur, p, v); refresh(false);
        };
        f.addEventListener('input', onIn); f.addEventListener('change', onIn);
        f.addEventListener('click', (e) => { const b = e.target.closest('.cwl-icons button'); if (!b) return; LAB.cur.icon = b.dataset.ic; refresh(false); });
    };

    const readCur = () => sanitize({ ...LAB.cur, id: LAB.editing || 'CW_' + (slugOf(LAB.cur.name) || 'NEW') }) || blank();

    // push the current model into the DOM (full = also reset input values; false = just visibility/readouts, keeps cursor)
    const refresh = (full) => {
        const clean = sanitize({ ...LAB.cur, id: 'CW_X_X' }, false) || blank();
        const hold = clean.pat.heat && clean.kind === 'ranged';
        if (full) LAB.cur = clone(clean);
        const f = $q('cwl-form'); if (!f) return;
        FORM.forEach((r) => {
            if (Array.isArray(r)) return;
            const id = 'cwf-' + r.p.replace('.', '-'), el = $q(id); if (!el) return;
            const val = getP(full ? clean : LAB.cur, r.p);
            if (r.t === 'icon') { el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.ic === clean.icon)); return; }
            if (full || (document.activeElement !== el)) { if (r.t === 'chk') el.checked = !!val; else if (r.t === 'list') el.value = (val || []).join(', '); else if (el.value !== String(val)) el.value = val; }
            const v = $q(id + '-v'); if (v) v.textContent = (typeof val === 'number') ? (Math.round(val * 100) / 100) : '';
            const dis = r.dis ? r.dis(clean) : false; el.disabled = !!dis;
            const row = el.closest('.cwl-f, .cwl-ck'); if (row) row.style.display = (r.show && !r.show(clean)) ? 'none' : '';
        });
        f.querySelectorAll('.cwl-grp').forEach(el => { el.style.display = (el._show && !el._show(clean)) ? 'none' : ''; });
        PV.def = { ...clean, id: '__pv' }; if (!clean.pat.mode) PV.def.pat.mode = 'hold';
        renderDps(clean);
        $q('cwl-del').style.display = LAB.editing ? '' : 'none';
        $q('cwl-save').textContent = LAB.editing ? 'Save changes' : 'Publish new weapon';
        renderList();
        if (PV.S && !PV.fresh) { PV.cool = Math.min(PV.cool || 0, 30); }
    };

    const fmtN = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));
    const renderDps = (d) => {
        const r = calcDps(d), el = $q('cwl-dps'); if (!el) return;
        const per = d.kind === 'melee' ? '1 swing' : (d.pat.type === 'beam' ? '1 beam' : (r.shots + ' projectile' + (r.shots > 1 ? 's' : '')));
        el.innerHTML = `<div>Calculated DPS (one target, every projectile lands)</div><div class="cwl-big">${fmtN(r.single)} / sec</div>
            <div class="small dim" style="font-size:12px;color:var(--dim)">${d.n.dmg} dmg${r.critF > 1 ? ' x' + r.critF.toFixed(2) + ' crit avg' : ''} x ${per} per use, ${(1 / r.iv).toFixed(2)} uses/sec (direct ${fmtN(r.direct)}${r.dots ? ' + effects ' + fmtN(r.dots) : ''})</div>
            <div style="margin-top:4px">Crowd potential: <b>~${fmtN(r.multi)}/sec</b></div>
            <div id="cwl-live" style="margin-top:4px">Preview measured: <b>...</b></div>
            ${r.notes.length ? `<div class="small" style="font-size:11px;color:var(--steel);margin-top:4px">${r.notes.map(E_).join(' &middot; ')}</div>` : ''}
            ${r.direct * 1 > 4000 ? '<div style="color:var(--blood);margin-top:4px">Very high DPS: it will delete bosses.</div>' : ''}`;
    };

    const renderList = () => {
        const el = $q('cwl-list'); if (!el) return;
        const ids = Object.keys(DEF).sort();
        el.innerHTML = ids.length ? ids.map(id => { const d = DEF[id]; return `<div class="cwl-item ${LAB.editing === id ? 'on' : ''}"><div class="nm"><span>${E_(d.icon)}</span><span>${E_(d.name)}</span>${d.adminOnly ? `<span title="Admin exclusive${d.teaser ? ' (teaser)' : ''}${d.allow.length ? ', allowed: ' + E_(d.allow.join(', ')) : ''}" style="color:var(--blood)">&#128274;${d.teaser ? '' : ''}</span>` : ''}</div>
            <div style="width:100%;color:var(--dim)">${d.kind} &middot; ${d.ptype === 'scraps' ? d.price + ' scraps' : '$' + Number(d.price).toLocaleString()}${DEFAULTS[id] && !REMOTE.docs[id] ? ' &middot; example' : ''}</div>
            <button class="btn btn-sm" data-act="edit" data-id="${id}">Edit</button><button class="btn btn-sm" data-act="dup" data-id="${id}">Copy</button><button class="btn btn-sm btn-danger" data-act="del" data-id="${id}">Del</button></div>`; }).join('') : '<p class="small dim" style="font-size:12px">None yet.</p>';
        el.onclick = (e) => { const b = e.target.closest('button[data-act]'); if (!b) return; const id = b.dataset.id, d = DEF[id]; if (!d) return;
            if (b.dataset.act === 'edit') loadDef(clone(d), id); else if (b.dataset.act === 'dup') { const c = clone(d); c.name = (d.name + ' 2').slice(0, 24); loadDef(c, null); out('Copied. Rename it, then publish.', false); } else delDef(id); };
    };

    const loadDef = (d, id) => { LAB.cur = clone(d); LAB.editing = id; PV.fresh = true; refresh(true); resetPreview(); out('', false); };

    const uniqueId = (name) => { let base = 'CW_' + (slugOf(name) || 'WEAPON'); base = base.slice(0, 28); let id = base, n = 2; while (DEF[id]) { id = (base.slice(0, 25) + '_' + n++).slice(0, 28); } return id; };
    const saveCur = async () => {
        if (!can('weapons')) return out('You need the "Create custom weapons" permission.', true);
        const id = LAB.editing || uniqueId(LAB.cur.name);
        if (!isOwnerNow()) LAB.cur.allow = (DEF[id] && DEF[id].allow) || [];   // only the owner can change the allow-list
        const d = sanitize({ ...LAB.cur, id, by: LAB.cur.by || (currentUserData ? currentUserData.username : ''), t: Date.now() });
        if (!d) return out('That weapon is not valid (give it a name).', true);
        PEND[id] = d; lsSet(LS_PEND, PEND); LAB.editing = id; applyDefs(); refresh(false);
        try { await pushRemote(id); out(`Published "${d.name}". It is live for everyone${d.price ? ' in the shop.' : ' (free).'}`, false); }
        catch (e) { out(`Saved here, but Firestore refused it (${(e && (e.code || e.message)) || 'offline'}). It is queued and works on this device. See RULES-NEEDED.md (Weapon Lab).`, true); }
    };
    const delDef = async (id) => {
        if (!id || !DEF[id]) return; if (!can('weapons')) return out('No permission.', true);
        if (!confirm('Delete "' + DEF[id].name + '" for everyone? Players who own it just lose it from their loadout.')) return;
        const isDefault = !!DEFAULTS[id];
        PEND[id] = isDefault ? { id, deleted: true, t: Date.now() } : null; lsSet(LS_PEND, PEND);
        if (isDefault) { /* tombstone doc keeps the shipped example hidden */ }
        if (LAB.editing === id) { LAB.editing = null; }
        applyDefs(); refresh(false);
        try { await pushRemote(id); out('Deleted.', false); } catch (e) { out('Deleted on this device; Firestore refused (' + ((e && e.code) || 'offline') + '). Queued.', true); }
    };
    const giveMe = async () => {
        const id = LAB.editing; if (!id || !DEF[id]) return out('Publish the weapon first.', true);
        const u = currentUserData; if (!u) return; if (!u.unlocked.includes(id)) u.unlocked.push(id);
        try { renderShop(); refreshLobbyStats(); } catch (e) { /* ignore */ }
        try { await save({ unlocked: u.unlocked }); out('Unlocked for you. Equip it in the Gear tab.', false); } catch (e) { out('Unlocked locally; could not save.', true); }
    };
    const importJson = async (publish) => {
        let j; try { j = JSON.parse($q('cwl-json').value); } catch (e) { return out('That is not valid JSON.', true); }
        const arr = Array.isArray(j) ? j : [j]; const ok = [];
        arr.slice(0, 50).forEach(r => { const d = sanitize({ ...r, id: r && /^CW_[A-Z0-9_]{2,28}$/.test(String(r.id || '').toUpperCase()) ? r.id : uniqueId(r && r.name) }); if (d) ok.push(d); });
        if (!ok.length) return out('Nothing valid in there.', true);
        if (!publish) { loadDef(ok[0], null); return out(`Loaded "${ok[0].name}" into the editor${ok.length > 1 ? ` (${ok.length - 1} more ignored; use Import & publish all)` : ''}.`, false); }
        if (!can('weapons')) return out('No permission.', true);
        ok.forEach(d => { d.t = Date.now(); PEND[d.id] = d; }); lsSet(LS_PEND, PEND); applyDefs(); refresh(false);
        const good = await flush(); out(good ? `Published ${ok.length} weapon(s).` : `Imported ${ok.length} locally; Firestore refused them (queued).`, !good);
    };

    // ----- live preview: the real engine against dummy zombies -----
    const pvEnv = () => ({
        zs: () => PV.zs, barrels: () => [],
        hurt: (z, d) => { if (z.dead) return; z.hp -= d; z.flash = 4; PV.dealt.push([PV.S.tick, d]); if (z.hp <= 0) { z.dead = true; z.respawn = 40; } },
        hurtB: () => {}, pop: (x, y, t) => { PV.pops.push({ x, y, t, l: 30 }); }, shake: (n) => { PV.shake = Math.max(PV.shake, n); },
        heal: () => {}, shield: () => {}, haste: () => {}
    });
    const resetPreview = () => {
        PV.p = { x: 70, y: 130, hp: 100, maxHp: 100 };
        PV.zs = [{ x: 330, y: 70, hx: 330, hy: 70 }, { x: 400, y: 135, hx: 400, hy: 135 }, { x: 330, y: 200, hx: 330, hy: 200 }, { x: 470, y: 100, hx: 470, hy: 100 }].map(z => ({ ...z, hp: 600, max: 600, size: 15, slow: 1 }));
        PV.S = { o: [], q: [], tick: 0, W: 520, H: 260, env: null, noPop: false, shield: () => 0, shieldAt: () => PV.p, kd: {} };
        PV.S.env = pvEnv(); PV.dealt = []; PV.pops = []; PV.shake = 0; PV.cool = 20; PV.rec = 0; PV.fresh = false; PV.acc = 0; PV.last = 0; PV.lkey = null;
    };
    const previewStep = () => {
        const S = PV.S, d = PV.def; if (!S || !d) return;
        const key = d.kind === 'melee' ? 'm' + Math.round(d.n.range / 10) : 'r';   // melee: bring the dummies into swing range
        if (PV.lkey !== key) {
            PV.lkey = key; const rr = d.kind === 'melee' ? Math.max(40, Math.min(220, d.n.range * 0.7)) : 0;
            PV.zs.forEach((z, i) => { if (d.kind === 'melee') { const a = [-0.5, 0, 0.45, 0.15][i], r = rr * [1, 0.9, 1, 1.12][i]; z.hx = PV.p.x + Math.cos(a) * r; z.hy = PV.p.y + Math.sin(a) * r; } else { const h = [[330, 70], [400, 135], [330, 200], [470, 100]][i]; z.hx = h[0]; z.hy = h[1]; } });
        }
        // fire on the weapon's real interval
        PV.cool--; PV.rec *= 0.8;
        if (PV.cool <= 0) {
            const t = nearestLive(S, PV.p.x, PV.p.y, 1e9);
            if (t && !(d.kind === 'melee' && Math.hypot(t.x - PV.p.x, t.y - PV.p.y) > d.n.range + 25)) { fireWeapon(S, d, PV.p, t, d.n.dmg, 1); PV.rec = 1; PV.cool = Math.max(3, Math.round(intervalS(d) * 60)); }
            else PV.cool = 6;
        }
        // dummies
        PV.zs.forEach((z, i) => {
            if (z.dead) { if (--z.respawn <= 0) { z.dead = false; z.hp = z.max; z.x = z.hx; z.y = z.hy; } return; }
            z.hp = Math.min(z.max, z.hp + 0.5);   // they regenerate so the target never dies for good; the DPS meter counts what you deal
            z.x += (z.hx - z.x) * 0.04 * (z.slow === undefined ? 1 : Math.max(0.2, z.slow)); z.y += (z.hy - z.y) * 0.04;
            if (z.slow !== undefined && z.slow < 1) z.slow = Math.min(1, z.slow + 0.01);
            z.flash = Math.max(0, (z.flash || 0) - 1);
        });
        tickWorld(S);
        PV.shake *= 0.85; PV.pops.forEach(p => { p.l--; p.y -= 0.5; }); PV.pops = PV.pops.filter(p => p.l > 0);
        while (PV.dealt.length && PV.dealt[0][0] < S.tick - 300) PV.dealt.shift();
    };
    const previewDraw = (ts) => {
        const cv = $q('cwl-pv'); if (!cv) return; const c = cv.getContext('2d'), S = PV.S, d = PV.def; if (!S || !d) return;
        const t = ts / 1000;
        c.save(); c.clearRect(0, 0, cv.width, cv.height);
        c.fillStyle = '#1b1713'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = 'rgba(255,255,255,.03)'; for (let x = 0; x < cv.width; x += 26) c.fillRect(x, 0, 1, cv.height); for (let y = 0; y < cv.height; y += 26) c.fillRect(0, y, cv.width, 1);
        if (PV.shake > 0.3) c.translate((Math.random() - .5) * PV.shake, (Math.random() - .5) * PV.shake);
        // dummies
        PV.zs.forEach(z => {
            if (z.dead) return; c.save(); c.translate(z.x, z.y);
            c.fillStyle = z.flash ? '#ffffff' : '#6e8a4a'; c.strokeStyle = '#14110e'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill(); c.stroke();
            c.fillStyle = '#14110e'; c.fillRect(-6, -4, 3, 3); c.fillRect(3, -4, 3, 3);
            c.fillStyle = '#000'; c.fillRect(-16, -24, 32, 5); c.fillStyle = z.hp / z.max > 0.4 ? '#8aa04a' : '#b8392d'; c.fillRect(-15, -23, 30 * Math.max(0, z.hp / z.max), 3); c.restore();
        });
        // player (simple figure) + held weapon
        const p = PV.p, t0 = PV.zs.length ? nearestLive(S, p.x, p.y, 1e9) : null, a = t0 ? Math.atan2(t0.y - p.y, t0.x - p.x) : 0;
        c.fillStyle = '#d9a441'; c.strokeStyle = '#14110e'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 12, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#14110e'; c.fillRect(p.x - 5, p.y - 4, 3, 3); c.fillRect(p.x + 2, p.y - 4, 3, 3);
        c.save(); c.translate(p.x + Math.cos(a) * (17 - PV.rec * 7), p.y + 4 + Math.sin(a) * (11 - PV.rec * 4)); c.rotate(a); if (Math.cos(a) < 0) c.scale(1, -1); drawHeldFor(c, d, PV.rec, t); c.restore();
        drawList(c, ser(S), t);
        c.font = 'bold 12px "Courier Prime", monospace'; c.textAlign = 'center'; PV.pops.forEach(q => { c.fillStyle = '#ffe14d'; c.fillText(q.t, q.x, q.y); });
        c.restore();
        // measured DPS over the last ~5s
        const live_ = $q('cwl-live');
        if (live_ && (PV.last++ % 12 === 0)) { const win = Math.min(300, S.tick) / 60, sum = PV.dealt.reduce((s, x) => s + x[1], 0); live_.innerHTML = 'Preview measured: <b>' + (win > 1 ? fmtN(sum / win) : '...') + ' / sec</b> (all dummies, last 5s)'; }
        // held-weapon strip: idle + swing
        const hc = $q('cwl-hold'); if (hc) { const h = hc.getContext('2d'); h.clearRect(0, 0, hc.width, hc.height); h.fillStyle = '#9a8e7a'; h.font = '10px monospace'; h.fillText('idle / attack', 4, 10);
            [0, 1].forEach(i => { h.save(); h.translate(70 + i * 90, 18); drawHeldFor(h, d, i ? Math.max(0, 1 - ((t * 1.4) % 1) * 2.2) : 0, t); h.restore(); }); }
    };
    const loop = (ts) => {
        if (!LAB.open) { LAB.raf = 0; return; }
        safe('pvloop', () => {
            if (!LAB.lastTs) LAB.lastTs = ts; PV.acc = (PV.acc || 0) + Math.min(100, ts - LAB.lastTs); LAB.lastTs = ts;
            let n = 0; while (PV.acc >= TICK && n++ < 6) { previewStep(); PV.acc -= TICK; }
            previewDraw(ts);
        });
        LAB.raf = requestAnimationFrame(loop);
    };

    const openLab = () => safe('openLab', () => {
        if (typeof can === 'function' && !can('weapons')) { try { toast('You need the Weapon Lab permission.'); } catch (e) { /* ignore */ } return; }
        buildDom(); $q('cwl-modal').classList.remove('hidden'); LAB.open = true;
        if (!LAB.cur) { LAB.cur = blank(); }
        loadDef(LAB.cur, LAB.editing && DEF[LAB.editing] ? LAB.editing : null);
        LAB.lastTs = 0; if (!LAB.raf) LAB.raf = requestAnimationFrame(loop);
    });
    const closeLab = () => { LAB.open = false; const m = $q('cwl-modal'); if (m) m.classList.add('hidden'); };
    CWL.openLab = openLab; CWL.closeLab = closeLab; window.openWeaponLab = openLab;
    onChange.push(() => { if (LAB.open) renderList(); });

    // admin panel entry: a "Weapons" button on the admin tab strip (and a header button as a fallback)
    safe('admin-tab', () => {
        const inject = () => safe('inject', () => {
            if (typeof can !== 'function' || !can('weapons')) return;
            const bar = $q('adm-tabs');
            if (bar && !bar.querySelector('.cwl-tab')) {
                const b = document.createElement('button'); b.className = 'cwl-tab'; b.type = 'button'; b.onclick = openLab;
                b.innerHTML = `<span class="em" data-ic="cw_dagger"></span><span>Weapons</span>`; bar.appendChild(b);
                try { b.querySelector('.em').innerHTML = iconImg('cw_dagger', 'icn sm'); } catch (e) { b.querySelector('.em').textContent = ''; }
            } else if (!bar) {
                const head = document.querySelector('#admin-modal .adm-panel > div'); if (head && !head.querySelector('.cwl-tab')) { const b = document.createElement('button'); b.className = 'btn btn-violet btn-sm cwl-tab'; b.style.width = 'auto'; b.textContent = 'Weapon Lab'; b.onclick = openLab; head.insertBefore(b, head.lastElementChild); }
            }
        });
        const o = window.openAdmin;
        if (typeof o === 'function') window.openAdmin = function () { const r = o.apply(this, arguments); inject(); setTimeout(inject, 60); setTimeout(inject, 500); return r; };
    });

    // ----- headless measurement used by the tests (and handy in the console) -----
    CWL.measure = (def, secs) => {
        const d = sanitize({ ...def, id: 'CW_MEASURE' }); if (!d) return null;
        const saveDef = DEF.CW_MEASURE; DEF.CW_MEASURE = d;
        const p = { x: 100, y: 100, hp: 100, maxHp: 100 }, z = { x: 250, y: 100, hp: 1e12, max: 1e12, size: 16, slow: 1 }; let dealt = 0;
        const S = { o: [], q: [], tick: 0, W: 800, H: 600, noPop: true, shield: () => 0, shieldAt: () => p, kd: {},
            env: { zs: () => [z], barrels: () => [], hurt: (zz, dm) => { dealt += dm; zz.hp -= dm; }, hurtB: () => {}, pop: () => {}, shake: () => {}, heal: () => {}, shield: () => {}, haste: () => {} } };
        let cool = 0; const ticks = Math.round(secs * 60);
        for (let i = 0; i < ticks; i++) { if (--cool <= 0) { fireWeapon(S, d, p, z, d.n.dmg, 1); cool = Math.max(1, Math.round(intervalS(d) * 60)); } tickWorld(S); z.x = 250; z.y = 100; z.slow = 1; z.cwst = 0; }
        if (saveDef) DEF.CW_MEASURE = saveDef; else delete DEF.CW_MEASURE;
        return { measured: dealt / secs, calc: calcDps(d).single };
    };
    // console helper: CWL.addLocal({id:'CW_FOO', name:'Foo', ...}) adds/replaces a weapon on THIS device only (not published)
    CWL.addLocal = (r) => { const d = sanitize(r); if (!d) return null; DEFAULTS[d.id] = d; applyDefs(); return d; };
    CWL.state = () => ({ defs: Object.keys(DEF), pending: Object.keys(PEND), ready: READY, remote: REMOTE.ok });
    CWL.S = RS; CWL.fire = (id, tgt) => { const S = RS(), d = DEF[id]; if (d) fireWeapon(S, d, g.player, tgt || nearestLive(S, g.player.x, g.player.y, 1e9), d.n.dmg, 1); };
    CWL.reset = () => { PEND = {}; lsSet(LS_PEND, PEND); try { localStorage.removeItem(LS_CACHE); } catch (e) { /* ignore */ } REMOTE.docs = {}; applyDefs(); };

    } catch (e) { console.error('[weaponlab] failed to start (base game unaffected)', e); }
})();
