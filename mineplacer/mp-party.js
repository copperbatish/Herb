/* mp-party.js: co-op "squad" layer. Host-authoritative, guests are purely visual.
   Everything here is inert in solo (every entry point checks P.on / MP.role). Hooks in Mineplacer2.html are marked // [party].
   Features: team combo tiers, squad link, role boons, beacon / supply crate / rescue events, revive-by-standing-near,
   last stand, pings + emotes, post-run award cards + team payout, party lobby (roles, ready, countdown). */
(() => {
    'use strict';
    try {
        // ---------------------------------------------------------------- constants
        const ROLES = {
            V: { n: 'Vanguard', ic: '🛡', c: '#95afc0', d: '+40 HP, 25% less damage, zombies near you hunt YOU, allies within 130px take 10% less' },
            M: { n: 'Medic', ic: '💊', c: '#8aa04a', d: 'Revives twice as fast, heal pulse every 2s (+6 HP to nearby allies)' },
            G: { n: 'Gunner', ic: '🎯', c: '#f39c12', d: '+12% damage for you, +8% for the whole squad' },
            S: { n: 'Scavenger', ic: '🔩', c: '#d9a441', d: '+10% cash, bonus scrap drops, pickups fly to everyone' }
        };
        const ORDER = ['V', 'M', 'G', 'S'];
        const LINK = 150;                    // px: players closer than this are "linked"
        const TIERS = [
            { n: 0, nm: '', dm: 0, reg: 0, cash: 0, dr: 0 },
            { n: 10, nm: 'WARM', dm: 0.06, reg: 0, cash: 0, dr: 0 },
            { n: 25, nm: 'HOT', dm: 0.10, reg: 0.04, cash: 0, dr: 0 },
            { n: 45, nm: 'BLAZING', dm: 0.15, reg: 0.04, cash: 0.25, dr: 0.06 },
            { n: 70, nm: 'LEGEND', dm: 0.22, reg: 0.08, cash: 0.5, dr: 0.10 }
        ];
        const EMOTES = [['🩹', 'Help!', 'KeyZ'], ['⭐', 'Nice!', 'KeyX'], ['💥', 'Danger!', 'KeyC'], ['🎯', 'On me!', 'KeyV']];
        const FX_LIFE = { p: 270, e: 160, h: 40, l: 50 };
        const PCOL = ['#d9a441', '#6fb3d9', '#c77dd4', '#8fd16a'];
        const EV_NAME = { b: 'DEFEND THE BEACON', c: 'SUPPLY DROP', r: 'RESCUE RUSH' };
        const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const FONT_SP = '"Special Elite", monospace', FONT_CP = '"Courier Prime", monospace';
        const safe = (name, fn, fb) => { window[name] = (...a) => { try { return fn(...a); } catch (e) { console.error('[party] ' + name, e); return typeof fb === 'function' ? fb(...a) : fb; } }; };

        // ---------------------------------------------------------------- state
        const blankP = () => ({ on: false, run: 0, roles: {}, st: {}, tier: 0, ev: null, evN: 0, evStart: 0, evOk: 0, evFail: 0, revives: 0, bestCombo: 0, ls: null, lsUsed: {}, fx: [], seq: 0, sg: 0, cool: {}, inv: {},
            link: {}, dr: {}, dm: {}, reg: {}, pos: {}, alive: [], ann: 0, annB: null, clearW: -1, hpl: null, ptC: null, ptT: -1, hasS: false, hasG: false });
        let P = blankP();
        let V = null;                                   // guest: last 'pt' block from the host
        const GST = { seen: 0, run: 0, fx: [], me: 'x' };   // guest: dedupe of effects
        const L = { pick: {}, ready: {}, m: [], me: 0, cd: 0, cdT: null, names: [], bypass: false };   // lobby
        let hudShown = true;
        window.PARTY_cur = null;                        // who is acting right now ('host' / peer id), set by hooks

        const isHost = () => MP.role === 'host';
        const isGuest = () => MP.role === 'guest';
        const partyRun = () => g.active && ((isHost() && g.peers.length > 0 && P.on) || (isGuest() && !!V));
        const st = (id) => P.st[id] || (P.st[id] = { k: 0, d: 0, t: 0, r: 0, c: 0, h: 0 });
        const nameOfId = (id) => { if (id === 'host') return myName(); const pe = g.peers.find(q => q.id === id); return pe ? pe.name : 'someone'; };
        const colOf = (id) => PCOL[(String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % PCOL.length];

        // ---------------------------------------------------------------- host: players
        const plist = () => {
            const a = [{ id: 'host', pl: P.hpl || g.player, down: g.downT > 0, name: myName(), pe: null }];
            for (const pe of g.peers) a.push({ id: pe.id, pl: pe.pl, down: pe.down > 0 || !!pe.cl, name: pe.name, pe });
            return a;
        };
        const aliveList = () => plist().filter(q => !q.down);
        const tierOf = (n) => { let t = 0; for (let i = 1; i < TIERS.length; i++) if (n >= TIERS[i].n) t = i; return t; };

        // ---------------------------------------------------------------- run start / wave hooks
        const assignRoles = () => {
            const ids = ['host', ...g.peers.map(pe => pe.id)]; P.roles = {};
            const used = {};
            ids.forEach(id => { const r = L.pick[id]; if (r && ROLES[r] && !used[r]) { P.roles[id] = r; used[r] = 1; } });
            ids.forEach(id => { if (P.roles[id]) return; const r = ORDER.find(x => !used[x]) || ORDER[Math.random() * 4 | 0]; P.roles[id] = r; used[r] = 1; });
            P.hasS = ids.some(id => P.roles[id] === 'S'); P.hasG = ids.some(id => P.roles[id] === 'G');
            plist().forEach(q => { if (P.roles[q.id] === 'V') { q.pl.maxHp += 40; q.pl.hp += 40; if (q.id === 'host') g.baseMaxHp += 40; } });
            if (P.hasS) g.cashMul += 0.10;
        };
        const startRun = () => {
            P = blankP(); P.on = true; P.run = (Math.random() * 1e9) | 0; P.hpl = g.player; P.evStart = Math.random() * 3 | 0;
            assignRoles(); L.ready = {}; L.cd = 0;
            P.ann = 120; P.annB = { text: 'SQUAD UP', sub: ids2roles(), life: 170 };
        };
        const ids2roles = () => plist().map(q => `${q.name}: ${ROLES[P.roles[q.id]].n}`).join('  ·  ');
        safe('PARTY_wave', () => {
            if (!isHost() || !g.peers.length) { P.on = false; return; }
            if (g.wave === 1 || !P.on) startRun();
            P.ev = null; P.clearW = -1; P.ptT = -1;
            // roll a co-op event for this wave
            if (g.wave >= 2 && g.wave % 10 !== 0 && (g.wave === 2 || Math.random() < 0.75)) {
                const k = ['b', 'c', 'r'][(P.evStart + P.evN++) % 3];
                const al = aliveList(); const cx = al.reduce((s, q) => s + q.pl.x, 0) / (al.length || 1), cy = al.reduce((s, q) => s + q.pl.y, 0) / (al.length || 1);
                let best = null, bs = -1;
                for (let i = 0; i < 10; i++) {
                    const x = 130 + Math.random() * 540, y = 140 + Math.random() * 330, d = Math.hypot(x - cx, y - cy);
                    const sc = -Math.abs(d - 230) + Math.random() * 40; if (best === null || sc > bs) { best = { x, y }; bs = sc; }
                }
                const w = g.wave;
                if (k === 'b') { const mx = Math.min(2200, 520 + w * 48); P.ev = { k, x: best.x, y: best.y, ch: 0, sg: 0, tg: { x: best.x, y: best.y, hp: mx, max: mx, vx: 0, vy: 0, bk: true } }; P.annB = { text: 'DEFEND THE BEACON', sub: 'Zombies are drawn to it. Stand near it to charge a squad surge.', life: 190 }; }
                else if (k === 'c') P.ev = { k, x: best.x, y: best.y, prog: 0, need: 110, t: 2100 }, P.annB = { text: 'SUPPLY DROP', sub: 'Two players must stand on the crate to crack it open.', life: 190 };
                else P.ev = { k, x: best.x, y: best.y, prog: 0, need: 260, t: 2100 }, P.annB = { text: 'RESCUE RUSH', sub: 'A survivor is pinned down. Stand with them to pull them out.', life: 190 };
                P.ann = 160;
            }
            if (g.wave > 1) P.ann = Math.max(P.ann, 150);
        });

        // ---------------------------------------------------------------- damage / kill hooks
        safe('PARTY_wp', (pe, on) => {   // entering / leaving a party member's weapon code (withPeer)
            if (!P.on) return;
            if (on) { pe.__pn = g.bullets.length; pe.__pc = window.PARTY_cur; window.PARTY_cur = pe.id; }
            else { for (let i = pe.__pn || 0; i < g.bullets.length; i++) if (!g.bullets[i].o) g.bullets[i].o = pe.id; window.PARTY_cur = pe.__pc || null; }
        });
        safe('PARTY_hurt', (z, dmg) => {
            if (!P.on) return;
            const id = window.PARTY_cur; if (!id) return;
            z.own = id; st(id).d += Math.min(dmg, Math.max(0, z.hp));
        });
        safe('PARTY_kill', (z) => {
            if (!P.on) return;
            const id = z.own || window.PARTY_cur || 'host'; const s = st(id); s.k++;
            const cb = g.combo; cb.t = 210;                                   // squads get a longer window than solo (3.5s)
            if (cb.n > s.c) s.c = cb.n;
            if (cb.n > P.bestCombo) P.bestCombo = cb.n;
            const t = tierOf(cb.n);
            if (t > P.tier) { P.tier = t; popSync(z.x, z.y - 54, `SQUAD ${TIERS[t].nm}!`); g.shake = Math.max(g.shake, 5); }
            if (P.hasS && Math.random() < 0.035 && g.pickups.length < 40) g.pickups.push({ x: clampN(z.x, 30, 770), y: clampN(z.y, 30, 570), kind: 'SCRAP', born: g.tick, life: 900 });
        });
        safe('PARTY_hit', (id, d) => {     // damage about to land on a player (after the normal reductions)
            if (!P.on) return d;
            d *= (P.dr[id] === undefined ? 1 : P.dr[id]);
            st(id).t += d; return d;
        }, (id, d) => d);
        safe('PARTY_dm', () => P.on ? (P.dm[window.PARTY_cur || 'host'] || 1) : 1, 1);
        safe('PARTY_cm', () => P.on ? 1 + TIERS[P.tier].cash : 1, 1);
        safe('PARTY_tgt', (z, bd) => {      // zombie target override: beacon bait + vanguard taunt
            if (!P.on) return null;
            const ev = P.ev;
            if (ev && ev.k === 'b' && ev.tg.hp > 0 && !z.boss) {
                const db = Math.hypot(ev.x - z.x, ev.y - z.y);
                if (db < 480 && db < bd + 90 && (Math.floor(z.seed * 997) % 5) < 3) return ev.tg;
            }
            for (const q of plist()) {
                if (q.down || P.roles[q.id] !== 'V' || (q.pe && q.pe.cl)) continue;
                const d = Math.hypot(q.pl.x - z.x, q.pl.y - z.y);
                if (d < 190 && d < bd + 130) return q.pl;
            }
            return null;
        }, null);

        // ---------------------------------------------------------------- effects list (pings / emotes / pulses)
        const addFx = (id, k, i, x, y) => {
            P.seq++; P.fx.push({ s: P.seq, id, k, i, x: Math.round(x), y: Math.round(y), t0: g.tick });
            if (P.fx.length > 16) P.fx.shift();
        };
        const fxAlive = (f) => g.tick - f.t0 < (FX_LIFE[f.k] || 60) && g.tick >= f.t0 - 2;
        const hostFx = (id, k, i, x, y) => {      // validated + throttled
            if (!P.on) return;
            const key = id + k, last = P.cool[key] || -999, gap = k === 'p' ? 100 : 70;
            if (g.tick - last < gap) return; P.cool[key] = g.tick;
            if (k === 'e' && !EMOTES[i]) return;
            addFx(id, k, k === 'e' ? i : 0, clampN(+x || 0, 10, 790), clampN(+y || 0, 10, 590));
        };

        // ---------------------------------------------------------------- tick (host, once per sim tick, after peersTick)
        const tickRevives = (al, all) => {
            for (const q of all) {
                if (!q.down || (q.pe && q.pe.cl)) { if (q.rv) q.rv = 0; if (P.cool['rv' + q.id]) P.cool['rv' + q.id] = 0; continue; }
                let rate = 0, who = null, wd = 1e9;
                for (const o of al) { if (o.id === q.id) continue; const d = dist(o.pl, q.pl); if (d < 60) { rate += P.roles[o.id] === 'M' ? 2 : 1; if (d < wd) { wd = d; who = o; } } }
                let pr = P.cool['rv' + q.id] || 0;
                pr = rate > 0 ? pr + Math.min(rate, 3.5) : Math.max(0, pr - 2);
                P.cool['rv' + q.id] = pr;
                if (pr >= 100) {
                    P.cool['rv' + q.id] = 0; P.revives++; if (who) st(who.id).r++;
                    const med = who && P.roles[who.id] === 'M';
                    if (q.pe) { q.pe.down = 0; q.pe.pl.hp = q.pe.pl.maxHp * (med ? 0.75 : 0.55); }
                    else { g.downT = 0; g.player.hp = g.player.maxHp * (med ? 0.75 : 0.55); g.invuln = 150; }
                    P.inv[q.id] = g.tick + 150;
                    popSync(q.pl.x, q.pl.y - 34, 'REVIVED'); addFx(q.id, 'h', 0, q.pl.x, q.pl.y);
                    g.banner = { text: `${q.name} is back up`, sub: who ? `${who.name} pulled them out.` : '', life: 100 };
                }
            }
        };
        const spawnRing = (x, y, n, r) => { for (let i = 0; i < n; i++) { const a = i / n * 6.283 + Math.random(); spawnZombie(null, clampN(x + Math.cos(a) * r, 20, 780), clampN(y + Math.sin(a) * r, 20, 580)); } };
        const teamReward = (cashEach, scrapEach) => { const n = 1 + g.peers.length; g.cash += cashEach * n; g.earned += cashEach * n; g.scraps += scrapEach * n; };
        const healTeam = (frac) => { plist().forEach(q => { if (!q.down) q.pl.hp = Math.min(q.pl.maxHp, q.pl.hp + q.pl.maxHp * frac); }); };
        const shockwave = (x, y, R, dmg) => {
            g.vfx.push({ x, y, r: 0, max: R, a: 1 }); g.shake = Math.max(g.shake, 8);
            for (const z of g.zombies) { if (z.dead || z.emerge > 0) continue; const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy) || 1; if (d > R + z.size) continue; if (!z.boss) { z.x = clampN(z.x + dx / d * 90, 10, 790); z.y = clampN(z.y + dy / d * 90, 10, 590); } if (dmg) hurt(z, dmg); }
        };
        const evDone = (ok, msg, sub) => {
            const ev = P.ev; P.ev = null; if (!ev) return;
            if (ok) P.evOk++; else P.evFail++;
            g.banner = { text: msg, sub, life: 150 };
        };
        const tickEvent = (al) => {
            const ev = P.ev; if (!ev) return;
            const near = (r) => al.filter(q => Math.hypot(q.pl.x - ev.x, q.pl.y - ev.y) < r);
            if (ev.k === 'b') {
                const tg = ev.tg, n = near(100).length;
                if (tg.hp <= 0) { spawnRing(ev.x, ev.y, 4 + Math.floor(g.wave / 6), 120); shockwave(ev.x, ev.y, 110, 0); evDone(false, 'Beacon destroyed!', 'No reward. Something followed the signal in.'); return; }
                tg.hp = Math.min(tg.max, tg.hp + 0.3 * n);
                if (P.sg <= 0) ev.ch += n;
                if (ev.ch >= 900) { ev.ch = 0; P.sg = 600; shockwave(ev.x, ev.y, 190, 30 + g.wave * 3); healTeam(0.25); g.banner = { text: 'SQUAD SURGE!', sub: '+25% damage, -15% damage taken, regen. 10 seconds.', life: 120 }; popSync(ev.x, ev.y - 40, 'SURGE!'); }
            } else if (ev.k === 'c') {
                ev.t--;
                const n = near(44).length, need2 = al.length >= 2;
                if (need2 ? n >= 2 : n >= 1) ev.prog += need2 ? 1 + 0.4 * (n - 2) : 0.5; else ev.prog = Math.max(0, ev.prog - 0.6);
                if (ev.prog >= ev.need) {
                    const e = 160 + g.wave * 35; teamReward(e, 1 + (g.wave >= 12 ? 1 : 0));
                    ['HEAL', 'RAGE', 'GUARD', 'SPEED'].forEach((kind, i) => g.pickups.push({ x: clampN(ev.x + (i - 1.5) * 26, 30, 770), y: clampN(ev.y + (i % 2) * 22, 30, 570), kind, born: g.tick, life: 900 }));
                    g.buffs.rage = Math.max(g.buffs.rage, 480);
                    evDone(true, 'Crate cracked!', `+$${fmt(e)} each, supplies and a damage buff.`); popSync(ev.x, ev.y - 30, 'CRACKED!');
                } else if (ev.t <= 0) { spawnRing(ev.x, ev.y, 3 + Math.floor(g.wave / 8), 130); evDone(false, 'Alarm tripped!', 'The crate called in company.'); }
            } else if (ev.k === 'r') {
                ev.t--;
                const n = Math.min(3, near(48).length);
                ev.prog = n ? ev.prog + n : Math.max(0, ev.prog - 0.7);
                if (ev.prog >= ev.need) {
                    const e = 200 + g.wave * 40; teamReward(e, 1); healTeam(1);
                    plist().forEach(q => { if (q.down) { if (q.pe) { q.pe.down = 0; q.pe.pl.hp = q.pe.pl.maxHp * 0.6; } else { g.downT = 0; g.player.hp = g.player.maxHp * 0.6; g.invuln = 120; } } });
                    g.buffs.speed = Math.max(g.buffs.speed, 600);
                    evDone(true, 'Survivor rescued!', `+$${fmt(e)} each, full heal and a speed boost.`); popSync(ev.x, ev.y - 30, 'RESCUED!');
                } else if (ev.t <= 0) { spawnRing(ev.x, ev.y, 4 + Math.floor(g.wave / 5), 140); evDone(false, 'Too slow!', 'The survivor was overrun.'); }
            }
        };

        safe('PARTY_tick', () => {
            if (!isHost() || !P.on || !g.peers.length) return;
            P.hpl = g.player;
            const all = plist(), al = all.filter(q => !q.down); P.alive = al;
            const tn = g.tick;
            // team combo tier (drops back when the combo dies)
            const t = tierOf(g.combo.n); if (t < P.tier) P.tier = t; else if (t > P.tier) P.tier = t;
            // squad link: count neighbours (cheap, 5 times a second)
            if (tn % 12 === 0 || !P.link.__init) {
                P.link = { __init: 1 };
                for (const a of al) { let c = 0; for (const b of al) if (a !== b && dist(a.pl, b.pl) < LINK) c++; P.link[a.id] = c; }
            }
            // precomputed multipliers for this tick
            const surge = P.sg > 0, lsId = P.ls ? P.ls.id : null, tr = TIERS[P.tier];
            for (const q of all) {
                const id = q.id, lk = P.link[id] || 0, role = P.roles[id];
                let dr = 1;
                if (lk > 0) dr *= 1 - Math.min(0.18, 0.10 + 0.04 * (lk - 1));
                if (role === 'V') dr *= 0.75;
                else for (const v of al) if (P.roles[v.id] === 'V' && dist(v.pl, q.pl) < 130) { dr *= 0.9; break; }
                dr *= 1 - tr.dr; if (surge) dr *= 0.85; if (lsId === id) dr *= 0.65;
                if ((P.inv[id] || 0) > tn) dr *= 0.15;
                P.dr[id] = Math.max(0.12, dr);
                P.dm[id] = 1 + tr.dm + (P.hasG ? 0.08 : 0) + (role === 'G' ? 0.12 : 0) + (surge ? 0.25 : 0) + (lsId === id ? 0.45 : 0);
            }
            // regen + pulses
            const rgBase = tr.reg + (surge ? 0.06 : 0);
            for (const q of al) {
                const rg = rgBase + (lsId === q.id ? 0.15 : 0);
                if (rg > 0 && q.pl.hp < q.pl.maxHp) q.pl.hp = Math.min(q.pl.maxHp, q.pl.hp + rg);
            }
            if (tn % 180 === 0) for (const q of al) if ((P.link[q.id] || 0) > 0 && q.pl.hp < q.pl.maxHp) q.pl.hp = Math.min(q.pl.maxHp, q.pl.hp + 2);
            if (tn % 120 === 0) for (const m of al) {
                if (P.roles[m.id] !== 'M') continue;
                let healed = 0;
                for (const q of al) if (dist(q.pl, m.pl) < 150 && q.pl.hp < q.pl.maxHp) { const a = Math.min(q.pl.maxHp - q.pl.hp, q === m ? 3 : 6); q.pl.hp += a; healed += a; }
                st(m.id).h += healed; addFx(m.id, 'h', 0, m.pl.x, m.pl.y);
            }
            if (P.sg > 0) P.sg--;
            tickRevives(al, all);
            // last stand: one player left, the rest are down
            if (all.length >= 2 && al.length === 1 && !P.ls && P.lsUsed[al[0].id] !== g.wave && g.zombies.length > 0) {
                const q = al[0]; P.lsUsed[q.id] = g.wave; P.ls = { id: q.id, t: 720 };
                q.pl.hp = Math.min(q.pl.maxHp, q.pl.hp + q.pl.maxHp * 0.4); if (q.id === 'host') g.invuln = Math.max(g.invuln, 90); else P.inv[q.id] = tn + 90;
                shockwave(q.pl.x, q.pl.y, 210, 40); addFx(q.id, 'l', 0, q.pl.x, q.pl.y);
                g.banner = { text: 'LAST STAND', sub: `${q.name} has 12 seconds of fury. Everyone else gets a chance next wave.`, life: 160 };
            }
            if (P.ls && --P.ls.t <= 0) P.ls = null;
            // co-op event
            tickEvent(al);
            // scavenger magnet: pickups drift to the nearest living player
            if (P.hasS && al.length) for (const k of g.pickups) {
                let b = null, bd = 150; for (const q of al) { const d = Math.hypot(q.pl.x - k.x, q.pl.y - k.y); if (d < bd) { bd = d; b = q; } }
                if (b && bd > 20) { k.x += (b.pl.x - k.x) / bd * 3.2; k.y += (b.pl.y - k.y) / bd * 3.2; }
            }
            // event announcements wait for the wave banner to finish
            if (P.ann > 0 && --P.ann === 0 && P.annB) { if (!g.banner) g.banner = P.annB; P.annB = null; }
            // cleanup
            if (P.fx.length && tn % 30 === 0) P.fx = P.fx.filter(fxAlive);
        });

        // wave cleared (just before the upgrade screen): resolve events, bring everyone back
        safe('PARTY_clear', () => {
            if (!isHost() || !P.on || !g.peers.length || P.clearW === g.wave) return;
            P.clearW = g.wave;
            const ev = P.ev;
            if (ev) {
                if (ev.k === 'b' && ev.tg.hp > 0) { const e = 220 + g.wave * 45; teamReward(e, 2); healTeam(0.5); evDone(true, 'Beacon held!', `+$${fmt(e)} each and +2 scraps each.`); }
                else { P.ev = null; }
            }
            let back = 0;
            plist().forEach(q => { if (q.down) { back++; if (q.pe) { q.pe.down = 0; q.pe.cl = null; q.pe.pl.hp = q.pe.pl.maxHp * 0.6; } else { g.downT = 0; g.player.hp = g.player.maxHp * 0.6; g.invuln = 120; } popSync(q.pl.x, q.pl.y - 30, 'BACK UP'); } });
            P.ls = null; P.sg = 0; P.cool = {};
            if (back) g.banner = { text: 'Second chance', sub: 'Everyone down is back on their feet.', life: 120 };
        });

        // ---------------------------------------------------------------- snapshot (host -> guest)
        const buildPt = () => {
            if (P.ptT === g.tick && P.ptC) return P.ptC;
            const ev = P.ev; let e = 0;
            if (ev) e = ev.k === 'b' ? ['b', Math.round(ev.x), Math.round(ev.y), Math.round(ev.tg.hp), ev.tg.max, Math.round(ev.ch / 9)] : ev.k === 'c' ? ['c', Math.round(ev.x), Math.round(ev.y), Math.round(ev.prog / ev.need * 100), ev.t, P.alive.length >= 2 ? 2 : 1] : ['r', Math.round(ev.x), Math.round(ev.y), Math.round(ev.prog / ev.need * 100), ev.t];
            const rv = {};
            for (const q of plist()) if (q.down && !(q.pe && q.pe.cl)) rv[q.id] = [Math.round(clampN((P.cool['rv' + q.id] || 0), 0, 100)), Math.round(clampN((q.pe ? q.pe.down : g.downT) / 4.8, 0, 100))];
            const pt = { q: P.run, r: P.roles, t: P.tier, e, sg: P.sg, ls: P.ls ? [P.ls.id, P.ls.t] : 0, rv, f: P.fx.filter(fxAlive).slice(-8).map(f => [f.s, f.id, f.k, f.i, f.x, f.y, f.t0]) };
            P.ptC = pt; P.ptT = g.tick; return pt;
        };
        safe('PARTY_snap', (snap, pe) => { if (!P.on) return; snap.pt = Object.assign({ m: pe.id }, buildPt()); });
        safe('PARTY_apply', (d) => {                 // guest: snapshot arrived
            const pt = d.pt; if (!pt) { V = null; return; }
            if (!V || V.q !== pt.q) { GST.seen = 0; GST.fx = []; }
            V = pt; GST.me = pt.m;
            for (const a of (pt.f || [])) {
                if (a[0] <= GST.seen) continue; GST.seen = Math.max(GST.seen, a[0]);
                if (a[1] === pt.m && (a[2] === 'p' || a[2] === 'e')) { const j = GST.fx.findIndex(f => f.loc && f.k === a[2] && f.i === a[3]); if (j >= 0) { GST.fx[j].loc = false; GST.fx[j].t0 = a[6]; continue; } }   // my own, already shown optimistically
                GST.fx.push({ id: a[1], k: a[2], i: a[3], x: a[4], y: a[5], t0: a[6] });
            }
            if (GST.fx.length > 30) GST.fx.splice(0, GST.fx.length - 30);
        });

        // ---------------------------------------------------------------- guest/host message plumbing
        const sendHostMsg = (m) => { if (isGuest()) mpSend(MP.hostConn, m); };
        safe('PARTY_hostGot', (c, d) => {
            if (d.t === 'pp') { if (c.pe) hostFx(c.pe.id, d.k === 'p' ? 'p' : 'e', (+d.i) | 0, d.x, d.y); return true; }
            if (d.t === 'prl') { if (c.info) { L.pick[c.info.uid] = ROLES[d.r] ? d.r : null; lobbyCast(); renderIfOpen(); } return true; }
            if (d.t === 'prd') { if (c.info) { L.ready[c.info.uid] = !!d.v; lobbyCast(); renderIfOpen(); } return true; }
            return false;
        }, false);
        safe('PARTY_guestGot', (d) => {
            if (d.t === 'pr') {
                const m = Array.isArray(d.m) ? d.m.slice(0, 4).map(a => [String(a[0] || '').replace(/[<>&"'`]/g, '').slice(0, 16), ROLES[a[1]] ? a[1] : null, a[2] ? 1 : 0, (Array.isArray(a[3]) ? a[3] : []).slice(0, 3).map(x => String(x || '').slice(0, 12))]) : [];
                diffNames(L.m.map(a => a[0]), m.map(a => a[0]), true);
                L.m = m; L.me = d.i | 0; L.cd = d.cd | 0; renderIfOpen(); return true;
            }
            if (d.t === 'pcd') { L.cd = d.n | 0; if (L.cd > 0) toast(`Run starts in ${L.cd}...`); renderIfOpen(); return true; }
            if (d.t === 'pa') { showAwards(d); return true; }
            return false;
        }, false);

        // ---------------------------------------------------------------- lobby (inside the existing party modal)
        const renderIfOpen = () => { const m = document.getElementById('party-modal'); if (m && !m.classList.contains('hidden')) renderParty(); };
        const lobbyModel = () => {
            if (isHost()) {
                const conns = MP.conns.filter(c => c.info);
                return [{ id: 'host', name: myName(), role: L.pick.host || null, ready: true, lo: currentUserData.loadout || [] }, ...conns.map(c => ({ id: c.info.uid, name: c.info.name, role: L.pick[c.info.uid] || null, ready: !!L.ready[c.info.uid], lo: c.info.loadout || [] }))];
            }
            return L.m.map((a, i) => ({ id: 'm' + i, name: a[0], role: a[1], ready: !!a[2], lo: a[3] }));
        };
        const diffNames = (oldN, newN, quiet) => {
            if (!oldN.length) return;
            newN.forEach(n => { if (!oldN.includes(n)) toast(`${n} joined the party`); });
            oldN.forEach(n => { if (!newN.includes(n)) toast(`${n} left the party`); });
        };
        const lobbyCast = () => {
            if (!isHost()) return;
            const mem = lobbyModel(); const m = mem.map(q => [q.name, q.role, q.ready ? 1 : 0, q.lo.filter(Boolean)]);
            MP.conns.filter(c => c.info).forEach((c, i) => mpSend(c, { t: 'pr', m, i: i + 1, cd: L.cd }));
        };
        safe('PARTY_roster', () => {     // mpRoster ran (somebody joined / left / changed)
            if (!isHost()) return;
            const names = [myName(), ...MP.conns.filter(c => c.info).map(c => c.info.name)];
            diffNames(L.names, names); L.names = names;
            const live = {}; MP.conns.forEach(c => { if (c.info) live[c.info.uid] = 1; });
            Object.keys(L.pick).forEach(k => { if (k !== 'host' && !live[k]) delete L.pick[k]; }); Object.keys(L.ready).forEach(k => { if (!live[k]) delete L.ready[k]; });
            if (L.cd > 0 && names.length < 2) cancelCd();
            lobbyCast();
        });
        const cancelCd = () => { clearInterval(L.cdT); L.cdT = null; L.cd = 0; MP.conns.forEach(c => c.info && mpSend(c, { t: 'pcd', n: 0 })); };
        window.PARTY_pickRole = (r) => {
            if (L.cd > 0) return;
            const me = isHost() ? 'host' : null;
            if (me) { L.pick.host = L.pick.host === r ? null : r; lobbyCast(); }
            else { const cur = (L.m[L.me] || [])[1]; const nr = cur === r ? '' : r; if (L.m[L.me]) L.m[L.me][1] = nr || null; sendHostMsg({ t: 'prl', r: nr }); }
            renderParty();
        };
        window.PARTY_toggleReady = () => {
            if (isHost()) return;
            const cur = !!(L.m[L.me] || [])[2]; if (L.m[L.me]) L.m[L.me][2] = cur ? 0 : 1;
            sendHostMsg({ t: 'prd', v: !cur }); renderParty();
        };
        window.PARTY_startClick = () => {
            if (!isHost()) return;
            if (L.cd > 0) { cancelCd(); renderParty(); return; }
            const guests = MP.conns.filter(c => c.info).length;
            if (!guests) { window.partyStart(); return; }
            L.cd = 3; MP.conns.forEach(c => c.info && mpSend(c, { t: 'pcd', n: 3 })); renderParty();
            L.cdT = setInterval(() => {
                if (!isHost() || !MP.conns.some(c => c.info)) { cancelCd(); renderParty(); return; }
                L.cd--; MP.conns.forEach(c => c.info && mpSend(c, { t: 'pcd', n: L.cd }));
                if (L.cd <= 0) { clearInterval(L.cdT); L.cdT = null; L.bypass = true; try { window.partyStart(); } finally { L.bypass = false; L.cd = 0; } }
                else renderParty();
            }, 1000);
        };
        const origStart = window.partyStart;
        if (typeof origStart === 'function') window.partyStart = function () {
            if (!isHost()) return;
            const guests = MP.conns.filter(c => c.info).length;
            if (guests && !L.bypass) return window.PARTY_startClick();        // "Go outside" with friends waiting also gets the countdown
            return origStart();
        };
        const wepIcon = (id) => (WEAPON_DATA[id] && WEAPON_DATA[id].icon) || '';
        safe('PARTY_lobby', (box, host) => {      // post-process renderParty's output
            if (!box) return;
            const slots = box.querySelector('.slots'); if (!slots) return;
            const mem = lobbyModel(); const myIdx = host ? 0 : L.me, mine = mem[myIdx] || {};
            const taken = {}; mem.forEach((q, i) => { if (q.role && i !== myIdx) taken[q.role] = q.name; });
            const rows = mem.map((q, i) => {
                const r = ROLES[q.role];
                return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin:3px 0;background:#17130f;border:2px solid ${q.ready ? '#566a2a' : '#4d4235'};text-align:left">
                    <b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${i === myIdx ? 'color:var(--mustard)' : ''}">${i === 0 ? '👑 ' : ''}${esc(q.name)}</b>
                    <span class="small" style="color:${r ? r.c : 'var(--dim)'}">${r ? r.ic + ' ' + r.n : 'no role yet'}</span>
                    <span class="small" style="letter-spacing:2px">${q.lo.filter(Boolean).map(wepIcon).join(' ')}</span>
                    <span class="small" style="color:${q.ready ? 'var(--olive)' : 'var(--dim)'};min-width:58px;text-align:right">${q.ready ? '✔ ready' : 'not ready'}</span></div>`;
            }).join('');
            const btns = ORDER.map(k => { const R = ROLES[k], on = mine.role === k, tk = taken[k]; return `<button class="btn" title="${esc(R.d)}" style="flex:1;min-width:0;padding:6px 2px;font-size:13px;${on ? `background:${R.c};color:#141008;border-color:#fff` : (tk ? 'opacity:.45' : '')}" onclick="PARTY_pickRole('${k}')">${R.ic}<br>${R.n}</button>`; }).join('');
            const sel = mine.role ? ROLES[mine.role] : null;
            const panel = document.createElement('div'); panel.id = 'party-squad'; panel.style.cssText = 'margin:8px 0';
            panel.innerHTML = `<div class="small dim" style="text-align:left;margin-bottom:2px">Squad</div>${rows}
                <div class="small dim" style="text-align:left;margin:8px 0 4px">Pick your role boon <span style="opacity:.7">(left unpicked you get one automatically)</span></div>
                <div style="display:flex;gap:6px">${btns}</div>
                <div class="small" style="min-height:34px;margin-top:6px;color:${sel ? sel.c : 'var(--dim)'}">${sel ? sel.d : 'Vanguard tanks, Medic heals and revives, Gunner buffs damage, Scavenger boosts loot.'}</div>
                ${host ? '' : `<button class="btn ${mine.ready ? '' : 'btn-go'}" style="width:100%;margin-top:6px" onclick="PARTY_toggleReady()">${mine.ready ? 'Not ready' : 'Ready up'}</button>`}
                ${L.cd > 0 ? `<div style="font-size:34px;color:var(--mustard);margin-top:8px">Starting in ${L.cd}...</div>` : ''}`;
            slots.insertAdjacentElement('afterend', panel);
            if (host) {
                const go = [...box.querySelectorAll('button')].find(b => /partyStart/.test(b.getAttribute('onclick') || ''));
                if (go) {
                    const others = mem.slice(1), rdy = others.filter(q => q.ready).length;
                    go.setAttribute('onclick', 'PARTY_startClick()');
                    go.textContent = L.cd > 0 ? `Starting in ${L.cd}... (click to cancel)` : (others.length ? `Start run (${mem.length} players${rdy === others.length ? ', all ready' : `, ${rdy}/${others.length} ready`})` : 'Start solo');
                }
            }
        });

        // ---------------------------------------------------------------- post-run awards
        const AW = [
            ['k', 'Most Kills', '☠', (s) => s.k, (v) => `${fmt(v)} kills`],
            ['d', 'Heavy Hitter', '💥', (s) => s.d, (v) => `${fmt(Math.round(v))} damage`],
            ['t', 'Meat Shield', '🛡', (s) => s.t, (v) => `${fmt(Math.round(v))} damage taken`],
            ['r', 'Lifesaver', '🩹', (s) => s.r, (v) => `${v} revive${v === 1 ? '' : 's'}`],
            ['c', 'Combo King', '🔥', (s) => s.c, (v) => `x${v} combo`],
            ['h', 'Field Medic', '💊', (s) => s.h, (v) => `${fmt(Math.round(v))} HP healed`]
        ];
        safe('PARTY_end', () => {
            if (!isHost() || !P.on || !g.peers.length || g.wave < 1) return;
            const all = plist(); const n = all.length; const cards = [];
            AW.forEach(([key, title, ic, f, txt]) => {
                let best = null, bv = 0; all.forEach(q => { const v = f(st(q.id)); if (v > bv) { bv = v; best = q; } });
                if (best && bv > 0) cards.push([key, title, ic, best.id, best.name, txt(bv)]);
            });
            const score = (s) => s.k + s.d / 220 + s.r * 8 + s.h / 60 + s.c * 0.6;
            let mvp = null, ms = -1; all.forEach(q => { const sc = score(st(q.id)); if (sc > ms) { ms = sc; mvp = q; } });
            const each = Math.round(g.wave * 90 + P.evOk * 200 + P.revives * 60 + P.bestCombo * 6);
            const mvpB = Math.round(each * 0.25);
            g.earned += each * n; g.cash += each * n;
            if (mvp) g.mvp[mvp.id] = (g.mvp[mvp.id] || 0) + mvpB;
            const tot = { k: all.reduce((s, q) => s + st(q.id).k, 0), r: P.revives, ev: P.evOk, bc: P.bestCombo };
            const msg = { t: 'pa', w: g.wave, n, aw: cards, mvp: mvp ? [mvp.id, mvp.name, mvpB] : 0, each, tot, roles: Object.fromEntries(all.map(q => [q.id, P.roles[q.id]])), nm: Object.fromEntries(all.map(q => [q.id, q.name])) };
            MP.conns.forEach(c => { if (c.pe) mpSend(c, msg); });
            showAwards(msg, 'host');
            P.on = false;
        });
        const closeAwards = () => { const el = document.getElementById('party-awards'); if (el) el.remove(); };
        window.PARTY_closeAwards = closeAwards;
        const showAwards = (m, me) => {
            closeAwards();
            me = me || GST.me || 'x';
            const el = document.createElement('div'); el.id = 'party-awards';
            el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(10,8,6,.9);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
            const card = (a, i) => `<div style="background:#17130f;border:2px solid ${a[3] === me ? '#d9a441' : '#4d4235'};padding:12px 8px;text-align:center;animation:paw .35s ${i * 0.08}s both">
                <div style="font-size:30px">${a[2]}</div><div style="color:var(--mustard);font-size:15px;margin:2px 0">${esc(a[1])}</div>
                <div style="font-size:17px;${a[3] === me ? 'color:#fff' : ''}">${esc(a[4])}${a[3] === me ? ' (you)' : ''}</div><div class="small dim">${esc(a[5])}</div></div>`;
            const mvp = m.mvp;
            el.innerHTML = `<style>@keyframes paw{from{transform:translateY(14px) scale(.9);opacity:0}to{transform:none;opacity:1}}</style>
                <div style="margin:auto;width:min(640px,96vw);background:#1c1710;border:3px solid #4d4235;padding:18px;font-family:'Special Elite',monospace;text-align:center">
                <h2 style="font-size:30px;color:var(--mustard)">SQUAD REPORT</h2>
                <p class="small dim" style="margin-bottom:10px">Wave ${m.w} · ${m.n} players · ${fmt(m.tot.k)} kills · ${m.tot.r} revives · ${m.tot.ev} event${m.tot.ev === 1 ? '' : 's'} won · best combo x${m.tot.bc}</p>
                ${mvp ? `<div style="background:#2a2012;border:2px solid #d9a441;padding:12px;margin-bottom:12px;animation:paw .4s both"><div style="font-size:34px">🏆</div><div style="font-size:22px;color:var(--mustard)">MVP: ${esc(mvp[1])}${mvp[0] === me ? ' (you)' : ''}</div>${m.roles && m.roles[mvp[0]] ? `<div class="small dim">${ROLES[m.roles[mvp[0]]].ic} ${ROLES[m.roles[mvp[0]]].n}</div>` : ''}<div class="small" style="color:var(--olive)">+$${fmt(mvp[2])} MVP bonus${mvp[0] === me ? ' for you' : ''}</div></div>` : ''}
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">${m.aw.map(card).join('') || '<p class="dim">Nobody did anything notable. Impressive, in a way.</p>'}</div>
                <div style="margin-top:14px;font-size:18px;color:var(--olive)">Team bonus: +$${fmt(m.each)} each</div>
                <p class="small dim">Wave progress, revives, event wins and your best combo all feed it.</p>
                <button class="btn btn-primary" style="margin-top:12px;font-size:18px;padding:10px 26px" onclick="PARTY_closeAwards()">Back to base</button></div>`;
            document.body.appendChild(el);
        };

        // ---------------------------------------------------------------- input: ping + emotes
        const MS = { x: 0, y: 0, t: -9999 };
        const sendFx = (k, i, x, y) => {
            if (!partyRun()) return;
            const now = performance.now(), key = k === 'p' ? 'lp' : 'le';
            if (now - (MS[key] || 0) < (k === 'p' ? 1500 : 1100)) return; MS[key] = now;
            if (isHost()) hostFx('host', k, i, x, y);
            else {
                sendHostMsg({ t: 'pp', k, i, x: Math.round(x), y: Math.round(y) });
                GST.fx.push({ id: GST.me, k, i, x: Math.round(x), y: Math.round(y), t0: g.tick, loc: true });
            }
        };
        const canvasPt = (e) => { const c = document.getElementById('gameCanvas'), r = c.getBoundingClientRect(); return { x: clampN((e.clientX - r.left) / r.width * 800, 8, 792), y: clampN((e.clientY - r.top) / r.height * 600, 8, 592), in: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; };
        window.addEventListener('mousemove', (e) => { try { const p = canvasPt(e); if (p.in) { MS.x = p.x; MS.y = p.y; MS.t = performance.now(); } } catch (x) {} }, { passive: true });
        window.addEventListener('keydown', (e) => {
            try {
                if (e.repeat || !partyRun()) return;
                const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
                if (e.code === 'KeyQ') { const rec = performance.now() - MS.t < 4000; sendFx('p', 0, rec ? MS.x : g.player.x, rec ? MS.y : g.player.y); }
                else { const i = EMOTES.findIndex(q => q[2] === e.code); if (i >= 0) sendFx('e', i, g.player.x, g.player.y); }
            } catch (x) { /* never break input */ }
        });
        (() => {      // touch: long-press the playfield to ping; tiny emote bar when there is no keyboard
            const c = document.getElementById('gameCanvas'); if (!c) return; let tm = null, sx = 0, sy = 0;
            c.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; sx = e.clientX; sy = e.clientY; clearTimeout(tm); tm = setTimeout(() => { try { const p = canvasPt(e); sendFx('p', 0, p.x, p.y); } catch (x) {} }, 480); }, { passive: true });
            c.addEventListener('pointermove', (e) => { if (tm && Math.hypot(e.clientX - sx, e.clientY - sy) > 14) { clearTimeout(tm); tm = null; } }, { passive: true });
            ['pointerup', 'pointercancel'].forEach(ev => c.addEventListener(ev, () => { clearTimeout(tm); tm = null; }, { passive: true }));
            const bar = document.createElement('div'); bar.id = 'party-emotes';
            bar.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);display:none;gap:6px;z-index:60';
            EMOTES.forEach((q, i) => { const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'padding:4px 8px;font-size:13px;opacity:.85'; b.textContent = q[0]; b.onclick = () => sendFx('e', i, g.player.x, g.player.y); bar.appendChild(b); });
            document.body.appendChild(bar);
        })();

        // ---------------------------------------------------------------- drawing
        const vPlayers = () => {
            if (isHost()) return plist().map(q => ({ id: q.id, x: q.pl.x, y: q.pl.y, down: q.down, name: q.name, me: q.id === 'host', hp: q.pl.hp, max: q.pl.maxHp }));
            const a = [{ id: GST.me, x: g.player.x, y: g.player.y, down: !!MP.down, name: myName(), me: true, hp: g.player.hp, max: g.player.maxHp }];
            for (const o of (g.others || [])) a.push({ id: o.id, x: o.x, y: o.y, down: !!o.down, name: o.name, hp: o.hp, max: o.maxHp });
            return a;
        };
        const txtC = (s, x, y, size, col, font, align) => { ctx.font = `${size}px ${font || FONT_CP}`; ctx.textAlign = align || 'center'; ctx.fillStyle = '#000'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(s, x, y); };
        const ringP = (x, y, r, f, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w || 3; ctx.beginPath(); ctx.arc(x, y, r, -1.5708, -1.5708 + 6.2832 * clampN(f, 0, 1)); ctx.stroke(); };
        const drawBeacon = (e, T) => {
            const [, x, y, hp, mx, ch] = e, f = clampN(hp / mx, 0, 1), surge = V ? V.sg : P.sg;
            ctx.save(); ctx.translate(x, y);
            ctx.setLineDash([6, 6]); ctx.strokeStyle = surge > 0 ? 'rgba(255,210,90,.75)' : 'rgba(120,200,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 100, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(80,140,200,.07)'; ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 14, 22, 7, 0, 0, 6.2832); ctx.fill();
            ctx.fillStyle = '#4b5560'; ctx.fillRect(-14, 4, 28, 10); ctx.fillStyle = '#7f8c98'; ctx.fillRect(-6, -28, 12, 34); ctx.fillStyle = '#2a3036'; ctx.fillRect(-6, -28, 3, 34);
            const pulse = 0.5 + 0.5 * Math.sin(T * 0.12); ctx.shadowColor = surge > 0 ? '#ffd23a' : '#66ccff'; ctx.shadowBlur = 10 + pulse * 12; ctx.fillStyle = surge > 0 ? '#ffd23a' : '#9fe0ff'; ctx.beginPath(); ctx.arc(0, -32, 7, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
            ctx.fillStyle = '#0a0908'; ctx.fillRect(-26, 20, 52, 6); ctx.fillStyle = f > 0.5 ? '#6fd16a' : (f > 0.25 ? '#e0a63a' : '#d9453a'); ctx.fillRect(-25, 21, 50 * f, 4);
            ctx.restore();
            ringP(x, y, 40, ch / 100, surge > 0 ? '#ffd23a' : '#66ccff', 3);
            txtC(surge > 0 ? '📡 SURGE ' + Math.ceil(surge / 60) + 's' : '📡 ' + Math.round(ch) + '%', x, y - 52, 12, surge > 0 ? '#ffd23a' : '#9fe0ff');
        };
        const drawCrate = (e, T) => {
            const [, x, y, pr, tl, need] = e; const near = pr > 0;
            ctx.save(); ctx.translate(x, y);
            const bl = Math.sin(T * 0.15) * 0.5 + 0.5;
            ctx.strokeStyle = `rgba(217,164,65,${0.35 + bl * 0.4})`; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(0, 0, 44, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-16, 10, 32, 5);
            ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-15, -12, 30, 24); ctx.fillStyle = '#b5803f'; ctx.fillRect(-15, -12, 30, 5); ctx.fillStyle = '#5a3a1b'; ctx.fillRect(-2, -12, 4, 24);
            ctx.restore();
            ringP(x, y, 30, pr / 100, '#8fd16a', 4);
            txtC('📦 ' + (need >= 2 ? 'STAND ON IT x2' : 'STAND ON IT'), x, y - 52, 12, '#e8dec6');
            txtC(Math.ceil(tl / 60) + 's', x, y + 58, 11, tl < 480 ? '#ff6a4a' : '#9a8e7a');
        };
        const drawRescue = (e, T) => {
            const [, x, y, pr, tl] = e;
            ctx.strokeStyle = `rgba(143,209,106,${0.35 + 0.3 * Math.sin(T * 0.15)})`; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(x, y, 48, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
            ctx.globalAlpha = 0.9; try { drawSprite('player', x, y, 3, {}); } catch (er) {} ctx.globalAlpha = 1;
            ringP(x, y, 34, pr / 100, '#8fd16a', 4);
            txtC('HELP!', x, y - 44 + Math.sin(T * 0.2) * 2, 14, '#ff9a6a', FONT_SP);
            txtC(Math.ceil(tl / 60) + 's', x, y + 56, 11, tl < 480 ? '#ff6a4a' : '#9a8e7a');
        };
        safe('PARTY_drawOverlay', (cx) => {
            if (!g.active || g.mini) return;
            const pv = isHost() ? (P.on && g.peers.length ? buildPt() : null) : V;
            if (!pv) { if (hudShown) { const b = document.getElementById('party-emotes'); if (b) b.style.display = 'none'; hudShown = false; } return; }
            const T = g.tick; const pl = vPlayers(); const alive = pl.filter(q => !q.down);
            // emote bar for touch
            const bar = document.getElementById('party-emotes'); if (bar) { const sh = !document.body.classList.contains('kb-mode'); const want = sh ? 'flex' : 'none'; if (bar.style.display !== want) bar.style.display = want; hudShown = true; }
            cx.save(); cx.lineJoin = 'round';
            // events
            const e = pv.e; if (e) { if (e[0] === 'b') drawBeacon(e, T); else if (e[0] === 'c') drawCrate(e, T); else if (e[0] === 'r') drawRescue(e, T); }
            // squad link: aura, lines, soft range ring on me
            const me = pl.find(q => q.me);
            const linked = {}; const lines = [];
            for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) { const d = dist(alive[i], alive[j]); if (d < LINK) { linked[alive[i].id] = (linked[alive[i].id] || 0) + 1; linked[alive[j].id] = (linked[alive[j].id] || 0) + 1; lines.push([alive[i], alive[j], d]); } }
            if (me && !me.down) { cx.strokeStyle = linked[me.id] ? 'rgba(111,224,200,.28)' : 'rgba(255,255,255,.08)'; cx.lineWidth = 1.5; cx.setLineDash([3, 7]); cx.beginPath(); cx.arc(me.x, me.y, LINK, 0, 6.2832); cx.stroke(); cx.setLineDash([]); }
            for (const [a, b, d] of lines) {
                const al = 0.55 - d / LINK * 0.3; cx.strokeStyle = `rgba(111,224,200,${al})`; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
                const f = ((T * 0.02) % 1); cx.fillStyle = 'rgba(190,255,240,.9)'; cx.fillRect(a.x + (b.x - a.x) * f - 2, a.y + (b.y - a.y) * f - 2, 4, 4);
            }
            for (const q of alive) if (linked[q.id]) { cx.strokeStyle = 'rgba(111,224,200,.55)'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(q.x, q.y + 12, 17 + Math.sin(T * 0.1) * 1.5, 6, 0, 0, 6.2832); cx.stroke(); }
            // effects: pulses, pings, emotes
            const fxl = isHost() ? P.fx.filter(fxAlive) : GST.fx.filter(f => T - f.t0 < (FX_LIFE[f.k] || 60) && T >= f.t0 - 2);
            const byId = {}; pl.forEach(q => { byId[q.id] = q; });
            for (const f of fxl) {
                const age = T - f.t0, who = byId[f.id];
                if (f.k === 'h') { const q = who || { x: f.x, y: f.y }; const r = 150 * clampN(age / 24, 0, 1); cx.strokeStyle = `rgba(138,224,120,${1 - age / 40})`; cx.lineWidth = 3; cx.beginPath(); cx.arc(q.x, q.y, r, 0, 6.2832); cx.stroke(); }
                else if (f.k === 'l') { cx.strokeStyle = `rgba(255,120,70,${1 - age / 50})`; cx.lineWidth = 5; cx.beginPath(); cx.arc(f.x, f.y, 210 * clampN(age / 16, 0, 1), 0, 6.2832); cx.stroke(); }
                else if (f.k === 'p') {
                    const col = colOf(f.id), a = age > 210 ? 1 - (age - 210) / 60 : 1, x = f.x, y = f.y;
                    cx.globalAlpha = a; cx.strokeStyle = col; cx.lineWidth = 3;
                    for (let k = 0; k < 2; k++) { const ph = ((age * 1.4 + k * 30) % 60) / 60; cx.globalAlpha = a * (1 - ph); cx.beginPath(); cx.arc(x, y, 6 + ph * 26, 0, 6.2832); cx.stroke(); }
                    cx.globalAlpha = a; const bob = Math.sin(age * 0.2) * 3; cx.fillStyle = col; cx.strokeStyle = '#000'; cx.lineWidth = 2;
                    cx.beginPath(); cx.moveTo(x, y - 6 + bob); cx.lineTo(x - 9, y - 22 + bob); cx.lineTo(x + 9, y - 22 + bob); cx.closePath(); cx.stroke(); cx.fill();
                    txtC((who ? who.name : '').slice(0, 10), x, y - 28 + bob, 11, col); cx.globalAlpha = 1;
                } else if (f.k === 'e' && who && EMOTES[f.i]) {
                    const em = EMOTES[f.i], a = age > 120 ? 1 - (age - 120) / 40 : 1, rise = Math.min(8, age * 0.6);
                    cx.globalAlpha = a; const tw = 26 + em[1].length * 7.2, bx = who.x - tw / 2, by = who.y - 78 - rise;
                    cx.fillStyle = 'rgba(10,8,6,.88)'; cx.fillRect(bx, by, tw, 20); cx.strokeStyle = colOf(f.id); cx.lineWidth = 2; cx.strokeRect(bx, by, tw, 20);
                    cx.fillStyle = colOf(f.id); cx.fillRect(who.x - 3, by + 20, 6, 4);
                    cx.font = '13px ' + FONT_SP; cx.textAlign = 'left'; cx.fillText(em[0], bx + 4, by + 15); cx.fillStyle = '#e8dec6'; cx.font = `12px ${FONT_CP}`; cx.fillText(em[1], bx + 22, by + 14);
                    cx.globalAlpha = 1;
                }
            }
            // role tags + revive rings + last stand glow
            const roles = pv.r || {}, rv = pv.rv || {}, ls = pv.ls;
            for (const q of pl) {
                const R = ROLES[roles[q.id]];
                if (R && !q.down) { const y = q.me ? q.y - 42 : q.y - 46; cx.font = `11px ${FONT_CP}`; const w = cx.measureText(R.n).width + 22; cx.fillStyle = 'rgba(10,8,6,.7)'; cx.fillRect(q.x - w / 2, y - 11, w, 14); cx.fillStyle = R.c; cx.fillRect(q.x - w / 2, y - 11, 2, 14); cx.textAlign = 'left'; cx.fillStyle = R.c; cx.fillText(R.ic, q.x - w / 2 + 5, y); cx.fillStyle = '#e8dec6'; cx.fillText(R.n, q.x - w / 2 + 19, y); }
                if (ls && ls[0] === q.id && !q.down) { cx.strokeStyle = `rgba(255,120,60,${0.5 + 0.4 * Math.sin(T * 0.3)})`; cx.lineWidth = 3; cx.beginPath(); cx.arc(q.x, q.y, 30, 0, 6.2832); cx.stroke(); txtC('LAST STAND', q.x, q.y + 38, 11, '#ff9a5a'); }
                if (q.down && rv[q.id]) {
                    const [pr, bl] = rv[q.id]; ringP(q.x, q.y, 30, bl / 100, 'rgba(184,57,45,.9)', 3); ringP(q.x, q.y, 24, pr / 100, '#d9e86a', 4);
                    const any = alive.some(o => Math.hypot(o.x - q.x, o.y - q.y) < 60);
                    txtC(pr > 0 ? 'REVIVING' : (q.me ? 'HOLD ON' : 'HOLD NEAR TO REVIVE'), q.x, q.y - 40, 11, pr > 0 ? '#d9e86a' : '#ff9a8a');
                    if (!any && !q.me) { cx.strokeStyle = `rgba(255,255,255,${0.2 + 0.2 * Math.sin(T * 0.2)})`; cx.lineWidth = 1; cx.setLineDash([3, 5]); cx.beginPath(); cx.arc(q.x, q.y, 60, 0, 6.2832); cx.stroke(); cx.setLineDash([]); }
                }
            }
            if (ls) { const a = 0.18 + 0.1 * Math.sin(T * 0.25); const gr = cx.createRadialGradient(400, 300, 220, 400, 300, 440); gr.addColorStop(0, 'rgba(255,90,40,0)'); gr.addColorStop(1, `rgba(255,90,40,${a})`); cx.fillStyle = gr; cx.fillRect(0, 0, 800, 600); }
            if (pv.sg > 0) { cx.strokeStyle = `rgba(255,210,90,${0.5 + 0.3 * Math.sin(T * 0.3)})`; cx.lineWidth = 3; cx.strokeRect(2, 2, 796, 596); }
            // bottom strip: event objective, then team tier + link chip
            let by = 598;
            const chips = [];
            const tier = tierOf(g.combo.n), tr = TIERS[tier];
            const nextT = TIERS[tier + 1];
            const myLk = me ? (linked[me.id] || 0) : 0;
            if (e) {
                const w = 300, x = 250; by -= 34;
                cx.fillStyle = 'rgba(10,8,6,.8)'; cx.fillRect(x, by, w, 30); cx.strokeStyle = '#4d4235'; cx.lineWidth = 2; cx.strokeRect(x, by, w, 30);
                const f = e[0] === 'b' ? e[3] / e[4] : e[3] / 100; const col = e[0] === 'b' ? '#66ccff' : '#8fd16a';
                cx.fillStyle = '#0a0908'; cx.fillRect(x + 8, by + 17, w - 16, 7); cx.fillStyle = col; cx.fillRect(x + 9, by + 18, (w - 18) * clampN(f, 0, 1), 5);
                cx.textAlign = 'left'; cx.font = `12px ${FONT_SP}`; cx.fillStyle = '#e8dec6'; cx.fillText(EV_NAME[e[0]], x + 8, by + 13);
                cx.textAlign = 'right'; cx.font = `11px ${FONT_CP}`; cx.fillStyle = '#9a8e7a'; cx.fillText(e[0] === 'b' ? `${fmt(e[3])} hp` : `${Math.ceil(e[4] / 60)}s left`, x + w - 8, by + 13); cx.textAlign = 'left';
            }
            by -= 26;
            { const w = 300, x = 250; cx.fillStyle = 'rgba(10,8,6,.8)'; cx.fillRect(x, by, w, 22); cx.strokeStyle = tier ? '#d9a441' : '#4d4235'; cx.lineWidth = 2; cx.strokeRect(x, by, w, 22);
                for (let i = 1; i < TIERS.length; i++) { cx.fillStyle = i <= tier ? '#d9a441' : '#2d2720'; cx.fillRect(x + 8 + (i - 1) * 16, by + 7, 12, 8); }
                cx.font = `11px ${FONT_SP}`; cx.textAlign = 'left'; cx.fillStyle = tier ? '#d9a441' : '#9a8e7a';
                const eff = tier ? `+${Math.round(tr.dm * 100)}% dmg${tr.reg ? ' · regen' : ''}${tr.cash ? ' · +' + Math.round(tr.cash * 100) + '% cash' : ''}` : (nextT ? `squad combo ${g.combo.n}/${nextT.n}` : '');
                cx.fillText(tier ? `SQUAD ${tr.nm}` : 'SQUAD', x + 78, by + 15);
                cx.textAlign = 'right'; cx.font = `10px ${FONT_CP}`; cx.fillStyle = '#9a8e7a'; cx.fillText(eff, x + w - 6, by + 10);
                cx.fillStyle = myLk ? '#6fe0c8' : '#6a6050'; cx.fillText(myLk ? `LINK x${myLk + 1} · -${Math.round(Math.min(0.18, 0.10 + 0.04 * (myLk - 1)) * 100)}% dmg` : 'stay close: link', x + w - 6, by + 20); cx.textAlign = 'left';
                if (nextT) { cx.fillStyle = '#0a0908'; cx.fillRect(x + 78, by + 18, 90, 3); cx.fillStyle = '#d9a441'; cx.fillRect(x + 78, by + 18, 90 * clampN((g.combo.n - tr.n) / (nextT.n - tr.n), 0, 1), 3); }
            }
            // first-seconds key hint
            if (T < 900 || (T % 3000 < 240 && g.wave < 4)) { cx.textAlign = 'center'; cx.font = `11px ${FONT_CP}`; cx.fillStyle = 'rgba(232,222,198,.55)'; /* [controls] */ cx.fillText((window.KEYMAP ? `${KEYMAP.label('ping')} ping   ${KEYMAP.label('em0')} help   ${KEYMAP.label('em1')} nice   ${KEYMAP.label('em2')} danger   ${KEYMAP.label('em3')} on me` : 'Q ping   Z help   X nice   C danger   V on me'), 400, by - 6); }
            cx.restore(); cx.textAlign = 'left'; cx.globalAlpha = 1; cx.setLineDash([]);
        });

        // reset helpers: leaving a run / party
        const resetAll = () => { P = blankP(); V = null; GST.seen = 0; GST.fx = []; window.PARTY_cur = null; };
        safe('PARTY_reset', resetAll);
        window.PARTY_debug = () => ({ P, V, L, GST });
    } catch (e) { console.error('[party] failed to start', e); }
})();
