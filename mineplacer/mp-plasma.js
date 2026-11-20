/* [plasma] PLASMA CELL: the ultra-rare mythic skin (1-in-a-million login roll).
   One skin, every weapon: a hand-drawn vector plasma containment cell, a family-specific animation set, and 3 selectable modes
   (Overcharge / Arc / Cryo) whose behaviour is tuned per weapon family. Loaded as a classic script AFTER the main one (shares its global lexical scope).
   Hooks in Mineplacer2.html are all marked `[plasma]`:
     skinOnFor / mySkinMap / cleanSkins (skin applies to every weapon), drawHeldAt -> PLASMA.held, drawOthers (guest sees it), PLASMA.tick / draw / hud / bullet / pierce / onHurt,
     hello / snapshot / 'in' message carry `pm` (the mode), enterLobby -> PLASMA.onLogin, ADMIN_ACTIONS.plasma (+ button).
   ODDS NOTE: the 1-in-1,000,000 roll runs on the client (crypto.getRandomValues, rejection sampled, so it is exactly 1/1e6). Nothing server-side can verify it,
   so a determined player can always edit their own save. The odds live in a closure (no global to flip) and PLASMA is frozen. */
(function () {
    'use strict';
    try {
        const TAU = Math.PI * 2;
        const rnd = Math.random;
        const cl = (v, a, b) => Math.max(a, Math.min(b, v));
        const lerp = (a, b, k) => a + (b - a) * k;
        const warned = {};
        const safe = (n, fn, d) => { try { return fn(); } catch (e) { if (!warned[n]) { warned[n] = 1; console.error('[plasma] ' + n, e); } return d; } };
        const hexRgb = (h) => { const n = parseInt(String(h).slice(1), 16) || 0; return [n >> 16, n >> 8 & 255, n & 255]; };
        const rgba = (h, a) => { const [r, g2, b] = hexRgb(h); return `rgba(${r},${g2},${b},${a})`; };

        // ================================================================== MODES
        const MODES = [
            { id: 'OVR', name: 'Overcharge', letter: 'O', col: '#2fe3ff', lite: '#d6fbff', dark: '#0b5f86', desc: 'Heavy and slow: bigger, piercing, harder-hitting.' },
            { id: 'ARC', name: 'Arc', letter: 'A', col: '#b46cff', lite: '#f0e0ff', dark: '#4a1a8c', desc: 'Faster and lighter: lightning jumps to nearby zombies.' },
            { id: 'CRY', name: 'Cryo', letter: 'C', col: '#a9e9ff', lite: '#ffffff', dark: '#3a8fba', desc: 'Chills and freezes, and shatters kills into ice shards.' }
        ];
        // per weapon family, per mode: dm = damage mult, cd = cooldown mult, rad = blast / beam / area mult, life = duration mult, r = bullet size, pierce, chain (jumps at 30%),
        // slow, shard (ice shards on a kill), every (hold weapons: keep 1 bullet in N), center (spread: keep N centre pellets), drain / refill (hold weapons' charge), twin (2nd mine), fast (drone fire rate)
        const D = (o) => Object.assign({ dm: 1, cd: 1, rad: 1, life: 1, r: 1, pierce: 0, chain: 0, slow: 0, shard: 0, every: 0, center: 0, drain: 1, refill: 1, twin: 0, fast: 1 }, o);
        const FT = {
            gun:    [D({ dm: 1.35, cd: 1.4, rad: 1.5, pierce: 2, r: 1.5 }),                D({ dm: 0.8, cd: 0.85, chain: 2 }),              D({ dm: 0.9, slow: 0.5, shard: 3 })],
            hold:   [D({ dm: 2.2, every: 3, pierce: 3, r: 1.3, drain: 1.3 }),    D({ dm: 0.85, chain: 1 }),                       D({ dm: 0.9, slow: 0.5, refill: 1.35 })],
            spread: [D({ dm: 2.6, cd: 1.25, center: 2, r: 1.5, pierce: 1 }),     D({ dm: 0.8, cd: 0.9, chain: 1 }),               D({ dm: 0.9, slow: 0.55, shard: 2 })],
            beam:   [D({ dm: 1.25, cd: 1.25, rad: 1.3 }),                        D({ dm: 0.85, cd: 0.85, chain: 1 }),             D({ dm: 0.9, slow: 0.45, rad: 1.1 })],
            thrown: [D({ dm: 1.25, cd: 1.3, rad: 1.25 }),                        D({ dm: 0.8, cd: 0.85, chain: 1 }),              D({ dm: 0.9, slow: 0.5, rad: 1.1, shard: 3 })],
            mine:   [D({ dm: 1.3, cd: 1.3, rad: 1.3 }),                          D({ dm: 0.85, cd: 1.1, twin: 1, chain: 1 }),     D({ dm: 0.9, slow: 0.45, rad: 1.15, shard: 3 })],
            orbit:  [D({ dm: 1.25, cd: 1.2, life: 0.85, rad: 1.15 }),            D({ dm: 0.8, cd: 0.9, fast: 0.8, chain: 1 }),    D({ dm: 0.9, slow: 0.5, life: 1.15 })],
            nova:   [D({ dm: 1.25, cd: 1.3, rad: 1.25 }),                        D({ dm: 0.8, cd: 0.85, chain: 1 }),              D({ dm: 0.9, slow: 0.4, rad: 1.1, shard: 3 })],
            melee:  [D({ dm: 1.4, cd: 1.4, rad: 1.2 }),                          D({ dm: 0.75, cd: 0.8, chain: 1 }),              D({ dm: 0.9, slow: 0.5, shard: 2 })],
            special:[D({ dm: 1.25, cd: 1.3, rad: 1.2 }),                         D({ dm: 0.8, cd: 0.85, chain: 1 }),              D({ dm: 0.9, slow: 0.5, shard: 3 })],
            shield: [D(), D(), D()]
        };
        const MELEE_ICONS = '🥊🏏🪓⛏️🪚🏑🏒🥍🏓🏸🪃🥄🧹🪠';
        const FAMS = {
            HOSE: 'hold', MINES: 'mine', F_NAPALM: 'mine', SCAT: 'spread', F_ROCKLADLE: 'spread', ORBIT: 'beam', F_SOLAR: 'beam', FIRE: 'thrown', BOOMA: 'thrown', F_REAPER: 'thrown', MISL: 'thrown', F_TIDAL: 'melee',
            SAWB: 'thrown', F_VOIDSAW: 'thrown', DRONE: 'orbit', ORBB: 'orbit', F_SKYBLADES: 'orbit', SUMMON: 'orbit', TURRET: 'orbit', NOVA: 'nova', THUN: 'nova', TOXIC: 'nova', GRAV: 'nova', ARC: 'special', F_TEMPEST: 'special',
            SHIELD: 'shield', WEP_100: 'melee'
        };
        const famOf = (id) => {
            if (FAMS[id]) return FAMS[id];
            const m = WEAPON_DATA[id]; if (!m) return 'gun';
            if (m.hold) return 'hold';
            if (m.cw) return 'gun';
            if (/^WEP_/.test(id) && m.icon && MELEE_ICONS.includes(m.icon)) return 'melee';
            return 'gun';
        };
        const DUR = { gun: 220, hold: 130, spread: 300, beam: 460, thrown: 420, mine: 480, orbit: 520, nova: 560, melee: 320, special: 320, shield: 200 };

        // ================================================================== STATE
        const PL = {
            fx: [], lastFire: {}, prevCd: { O: 0, P: 0, L: 0 }, seen: new WeakSet(), chainBudget: 0, hitN: 0, eqAt: 0, lastHeld: '', flash: null, killN: 0, lastMode: -1, inChain: false
        };
        const user = () => (typeof currentUserData !== 'undefined' ? currentUserData : null);
        const modeOf = (u) => (((u && u.plasmaMode) | 0) % 3 + 3) % 3;
        const owns = (u) => !!u && (u.skins || []).includes('PLASMA');
        const on = (u) => owns(u) && !!(u.skinOn && u.skinOn.PLASMA);
        const plasmaOn = (id) => { const u = user(); return !!(u && id && on(u) && (u.loadout || []).includes(id) && typeof g !== 'undefined' && g.active); };

        // ================================================================== THE ART (vector, +x forward, hand at the origin, ~46 units long)
        // o: { mode, charge 0..1 (core level), fire 0..1 (pulse), eq 0..1 (equip charge-up), asm 0..1 (assembly), heat, fam, k 0..1 (family action), stream, over, spread }
        const drawCell = (c, t, o) => {
            o = o || {};
            const M = MODES[((o.mode | 0) % 3 + 3) % 3];
            const ch = o.charge == null ? 1 : o.charge, asm = o.asm == null ? 1 : o.asm, fp = o.fire || 0, eq = o.eq == null ? 1 : o.eq, heat = o.heat || 0, spread = o.spread || 0;
            const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
            const glow = cl((0.5 + 0.3 * pulse) * (0.25 + 0.75 * ch) * (0.3 + 0.7 * eq) + fp * 0.7, 0, 1.5);
            const lw = (w) => { c.lineWidth = w; };
            const R = (x, y, w, h) => c.fillRect(x, y, w, h);
            const steel = (y0, y1, dark) => { const gr = c.createLinearGradient(0, y0, 0, y1); if (dark) { gr.addColorStop(0, '#59636d'); gr.addColorStop(0.45, '#2e353d'); gr.addColorStop(1, '#14181c'); } else { gr.addColorStop(0, '#f4f8fb'); gr.addColorStop(0.3, '#c3ccd4'); gr.addColorStop(0.62, '#7d8893'); gr.addColorStop(1, '#3b434c'); } return gr; };
            const part = (i, fn) => {
                if (asm >= 1) { fn(); return; }
                const p = cl((asm - i * 0.1) / 0.42, 0, 1), e = 1 - Math.pow(1 - p, 3), a = i * 1.9 + 0.6;
                c.save(); c.globalAlpha *= e; c.translate(Math.cos(a) * (1 - e) * 44, Math.sin(a) * (1 - e) * 30); c.rotate((1 - e) * (i % 2 ? 1 : -1) * 0.9); fn(); c.restore();
            };
            c.save();
            c.lineJoin = 'round';
            // 0: pistol grip
            part(0, () => {
                const gr = c.createLinearGradient(-4, 0, 6, 0); gr.addColorStop(0, '#454d56'); gr.addColorStop(0.5, '#23292f'); gr.addColorStop(1, '#101316');
                c.fillStyle = gr; c.beginPath(); c.moveTo(-4.5, 5.5); c.lineTo(4, 5.5); c.lineTo(6.2, 16.5); c.quadraticCurveTo(2, 18.5, -2.2, 17.2); c.closePath(); c.fill();
                c.strokeStyle = '#090b0d'; lw(0.8); c.stroke();
                c.strokeStyle = 'rgba(160,172,184,.35)'; lw(0.6); for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-3 + i * 0.5, 8.5 + i * 2.2); c.lineTo(4.2 + i * 0.5, 8.5 + i * 2.2); c.stroke(); }
                c.fillStyle = '#6c7782'; R(-4.5, 5.5, 8.5, 1);
            });
            // 1: rear cap + muzzle ring
            part(1, () => {
                c.fillStyle = steel(-7, 7, true); R(-9.5, -6.8, 7.5, 13.6);
                c.fillStyle = '#12161a'; R(-9.5, -6.8, 1.6, 13.6);
                c.fillStyle = '#6a7580'; R(-6.8, -6.8, 0.7, 13.6); R(-4.8, -6.8, 0.7, 13.6);
                c.strokeStyle = '#0b0e11'; lw(0.8); c.strokeRect(-9.5, -6.8, 7.5, 13.6);
                c.strokeStyle = rgba(M.col, 0.35 + 0.35 * pulse); lw(1.1); c.beginPath(); c.moveTo(-2, -6.4); c.lineTo(-2, 6.4); c.stroke();
            });
            // 2: armoured lower sleeve
            part(2, () => {
                c.fillStyle = steel(-6.8, 6.8); R(-2, -6.8, 10, 13.6);
                c.strokeStyle = '#363e47'; lw(0.6);
                [[-2, -1.8, 8, -1.8], [-2, 2.6, 8, 2.6], [2.4, -6.8, 2.4, 6.8], [5.4, -6.8, 5.4, 6.8]].forEach(([x1, y1, x2, y2]) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); });
                c.fillStyle = '#eef3f6'; [[-0.8, -5.4], [3.2, -5.4], [6.4, -5.4], [-0.8, 4.4], [6.4, 4.4]].forEach(([x, y]) => R(x, y, 1, 1));
                c.fillStyle = '#1a1f24'; R(3.2, 3.4, 3.2, 1.3); R(3.2, -0.6, 3.2, 1);
                c.strokeStyle = '#0b0e11'; lw(0.8); c.strokeRect(-2, -6.8, 10, 13.6);
            });
            // 3: control box with the two indicator lights
            part(3, () => {
                c.save(); c.translate(-1.8, 0.4);
                c.strokeStyle = '#1b2026'; lw(1.1); c.beginPath(); c.moveTo(9.5, 4.5); c.quadraticCurveTo(12, 6, 11.5, 7); c.stroke();
                c.fillStyle = steel(6.5, 13.5, true); c.beginPath(); c.moveTo(8.6, 6.4); c.lineTo(16.4, 6.4); c.lineTo(16.4, 11.8); c.lineTo(14.6, 13); c.lineTo(8.6, 13); c.closePath(); c.fill();
                c.strokeStyle = '#080a0c'; lw(0.8); c.stroke();
                c.fillStyle = '#0d1114'; R(9.4, 7.2, 6.2, 1.2);
                const gOn = 0.55 + 0.45 * Math.sin(t * 5.1), rOn = Math.sin(t * 2.6) > 0.25 ? 1 : 0.22;   // green breathes, red blinks
                c.fillStyle = `rgba(60,255,110,${gOn})`; c.beginPath(); c.arc(10.9, 10.4, 1.35, 0, TAU); c.fill();
                c.fillStyle = `rgba(255,60,60,${rOn})`; c.beginPath(); c.arc(14.1, 10.4, 1.35, 0, TAU); c.fill();
                c.globalCompositeOperation = 'lighter';
                const g1 = c.createRadialGradient(10.9, 10.4, 0, 10.9, 10.4, 4.2); g1.addColorStop(0, `rgba(60,255,110,${0.5 * gOn})`); g1.addColorStop(1, 'rgba(60,255,110,0)'); c.fillStyle = g1; c.beginPath(); c.arc(10.9, 10.4, 4.2, 0, TAU); c.fill();
                const g2 = c.createRadialGradient(14.1, 10.4, 0, 14.1, 10.4, 4.2); g2.addColorStop(0, `rgba(255,60,60,${0.5 * rOn})`); g2.addColorStop(1, 'rgba(255,60,60,0)'); c.fillStyle = g2; c.beginPath(); c.arc(14.1, 10.4, 4.2, 0, TAU); c.fill();
                c.globalCompositeOperation = 'source-over'; c.restore();
            });
            // 4: glass tube with the swirling plasma core
            part(4, () => {
                const x0 = 8, w = 18, y0 = -5.9, h = 11.8;
                c.fillStyle = '#071822'; R(x0, y0, w, h);
                c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
                const lvl = 0.18 + 0.82 * ch, fillW = w * lvl;
                const gh = c.createLinearGradient(x0, 0, x0 + w, 0); gh.addColorStop(0, rgba(M.dark, 0.9)); gh.addColorStop(Math.max(0.05, lvl - 0.25), rgba(M.col, 0.55 * (0.5 + glow * 0.5))); gh.addColorStop(Math.min(1, lvl), rgba(M.col, 0)); gh.addColorStop(1, rgba(M.col, 0));
                c.fillStyle = gh; R(x0, y0, w, h);
                c.globalCompositeOperation = 'lighter';
                const cx = x0 + Math.min(w * 0.5, fillW * 0.55) + Math.sin(t * 2.1) * 0.8, cy = Math.sin(t * 1.7) * 0.8;
                const rg = c.createRadialGradient(cx, cy, 0, cx, cy, 8.5); rg.addColorStop(0, rgba(M.lite, 0.95 * Math.min(1, glow + 0.15))); rg.addColorStop(0.35, rgba(M.col, 0.7 * Math.min(1, glow + 0.1))); rg.addColorStop(1, rgba(M.col, 0));
                c.fillStyle = rg; R(x0, y0, w, h);
                const amp = (1.2 + 3.2 * ch) * (1 + fp * 0.6);
                for (let k = 0; k < 5; k++) {
                    c.strokeStyle = rgba(k % 2 ? M.lite : M.col, (0.28 + 0.4 * ch) * (k % 2 ? 0.8 : 1)); lw(0.5 + (k % 3) * 0.25);
                    c.beginPath();
                    for (let i = 0; i <= 18; i++) { const x = x0 + i, ph = t * (2.6 + k * 0.5) + k * 1.9 + i * 0.5; const y = Math.sin(ph) * amp * (0.45 + 0.55 * Math.sin(i / 18 * Math.PI)) * (k % 2 ? -1 : 1) + Math.sin(ph * 0.5 + k) * 0.6; i ? c.lineTo(x, y) : c.moveTo(x, y); }
                    c.stroke();
                }
                for (let k = 0; k < 7; k++) {   // sparks drifting rear -> front
                    const u = ((t * (0.35 + (k % 3) * 0.12) + k * 0.31) % 1), x = x0 + u * Math.min(w, fillW + 3), y = Math.sin(t * 3 + k * 2.4) * (h * 0.32) * (0.4 + 0.6 * ch);
                    c.fillStyle = rgba(M.lite, 0.85 * (1 - Math.abs(u - 0.5) * 1.2)); R(Math.round(x * 2) / 2, Math.round(y * 2) / 2, 0.9, 0.9);
                }
                if (fp > 0.02) {   // the pulse driven through the cell on a shot: a bright band racing rear -> front
                    const bx = x0 + w * (1 - fp), bg = c.createLinearGradient(bx - 5, 0, bx + 5, 0); bg.addColorStop(0, rgba(M.lite, 0)); bg.addColorStop(0.5, rgba(M.lite, 0.85 * Math.min(1, fp * 1.6))); bg.addColorStop(1, rgba(M.lite, 0));
                    c.fillStyle = bg; R(bx - 5, y0, 10, h);
                }
                if (heat > 0.02) { c.fillStyle = `rgba(255,${Math.round(120 - 60 * heat)},40,${0.35 * heat * (0.6 + 0.4 * Math.sin(t * 22))})`; R(x0, y0, w, h); }
                c.globalCompositeOperation = 'source-over';
                c.restore();
                c.fillStyle = 'rgba(255,255,255,.26)'; R(x0 + 0.5, y0 + 0.5, w - 1, 1.1); c.fillStyle = 'rgba(255,255,255,.12)'; R(x0 + 1, y0 + 1.6, 0.8, h - 3.2);
                // armoured straps
                [10.2, 23].forEach((sx) => { c.fillStyle = steel(-7.4, 7.4); R(sx, -7.4, 1.9, 14.8); c.strokeStyle = '#0b0e11'; lw(0.6); c.strokeRect(sx, -7.4, 1.9, 14.8); });
                c.strokeStyle = '#0b0e11'; lw(0.8); c.strokeRect(x0, y0, w, h);
            });
            // 5: collar with the two glowing rings
            part(5, () => {
                c.save(); c.translate(2, 0);
                c.fillStyle = steel(-7.4, 7.4); R(24.4, -7.4, 5.8, 14.8);
                c.fillStyle = '#20262c'; R(24.4, -1.8, 5.8, 3.6);
                c.strokeStyle = '#0b0e11'; lw(0.8); c.strokeRect(24.4, -7.4, 5.8, 14.8);
                c.globalCompositeOperation = 'lighter';
                [25.6, 28.8].forEach((rx, i) => {
                    const a = 0.45 + 0.4 * Math.sin(t * 4 - i * 1.4) + fp * 0.6;
                    [[3.4, 0.1], [1.9, 0.3], [0.8, 0.95]].forEach(([w2, al]) => { c.strokeStyle = rgba(i ? M.lite : M.col, cl(al * a, 0, 1)); lw(w2); c.beginPath(); c.moveTo(rx, -7.2); c.lineTo(rx, 7.2); c.stroke(); });
                });
                c.globalCompositeOperation = 'source-over'; c.restore();
            });
            // 6: emitter prongs + bulb
            part(6, () => {
                c.save(); c.translate(2, 0);
                [-1, 1].forEach((s) => {
                    c.save(); c.translate(29.5, s * 6.2); c.rotate(s * spread * 0.45);
                    c.fillStyle = steel(-5, 5, true); c.beginPath(); c.moveTo(0, 0); c.lineTo(2, 0); c.quadraticCurveTo(5.4, s * 1.2, 7, s * 5.8); c.lineTo(8.6, s * 5.8); c.quadraticCurveTo(7.4, s * -0.2, 3.6, s * -2.4); c.lineTo(0, s * -2.4); c.closePath(); c.fill();
                    c.strokeStyle = '#080a0c'; lw(0.7); c.stroke();
                    c.strokeStyle = 'rgba(190,205,220,.55)'; lw(0.5); c.beginPath(); c.moveTo(0.4, s * -0.4); c.quadraticCurveTo(4.6, s * 0.6, 7, s * 5.2); c.stroke();
                    c.globalCompositeOperation = 'lighter'; const tg = c.createRadialGradient(7.8, s * 5.8, 0, 7.8, s * 5.8, 3.6); tg.addColorStop(0, rgba(M.lite, 0.9 * Math.min(1, glow))); tg.addColorStop(1, rgba(M.col, 0)); c.fillStyle = tg; c.beginPath(); c.arc(7.8, s * 5.8, 3.6, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
                    c.restore();
                });
                c.fillStyle = '#0c1014'; R(29.8, -2.6, 2.4, 5.2);
                c.globalCompositeOperation = 'lighter';
                const br = 3.6 + glow * 5.5 + fp * 4, bg2 = c.createRadialGradient(32.5, 0, 0, 32.5, 0, br); bg2.addColorStop(0, rgba(M.lite, cl(0.55 + glow * 0.5, 0, 1))); bg2.addColorStop(0.45, rgba(M.col, 0.55 * Math.min(1, glow + 0.2))); bg2.addColorStop(1, rgba(M.col, 0));
                c.fillStyle = bg2; c.beginPath(); c.arc(32.5, 0, br, 0, TAU); c.fill();
                c.globalCompositeOperation = 'source-over'; c.restore();
            });
            // soft bloom over the whole core
            if (asm >= 1) {
                c.globalCompositeOperation = 'lighter';
                const bl = c.createRadialGradient(18, 0, 2, 18, 0, 28); bl.addColorStop(0, rgba(M.col, 0.2 * glow)); bl.addColorStop(1, rgba(M.col, 0)); c.fillStyle = bl; c.beginPath(); c.arc(18, 0, 28, 0, TAU); c.fill();
                c.globalCompositeOperation = 'source-over';
            }
            // equip charge-up: motes spiral into the emitter, rings snap on
            if (eq < 1) {
                c.globalCompositeOperation = 'lighter';
                for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + t * 6 * (1 - eq), r = (1 - eq) * (14 + (i % 3) * 5) + 1; c.fillStyle = rgba(M.lite, 0.9 * (1 - eq)); R(34.5 + Math.cos(a) * r - 0.5, Math.sin(a) * r * 0.8 - 0.5, 1.1, 1.1); }
                c.strokeStyle = rgba(M.col, 0.8 * (1 - eq)); lw(1); c.beginPath(); c.arc(34.5, 0, (1 - eq) * 16, 0, TAU); c.stroke();
                c.globalCompositeOperation = 'source-over';
            }
            // ---- family overlays (in the weapon's own frame) ----
            if (o.fam && asm >= 1) famOverlay(c, t, o, M);
            c.restore();
        };

        // per-family effects that ride on the cell: muzzle flash, hose stream, lens focus, nova rings, mine drop, motes ...
        const famOverlay = (c, t, o, M) => {
            const k = o.k || 0, f = o.fam;
            c.save(); c.translate(2, 0); c.globalCompositeOperation = 'lighter';
            const ring = (x, y, r, a, w) => { c.strokeStyle = rgba(M.col, cl(a, 0, 1)); c.lineWidth = w || 1; c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); c.stroke(); };
            if (f === 'gun' || f === 'special') {
                if (k > 0.02) { ring(37, 0, (1 - k) * 10 + 2, k, 1.2); c.fillStyle = rgba(M.lite, k); c.beginPath(); c.arc(37, 0, 2 + k * 3, 0, TAU); c.fill(); }
                if (f === 'special') { c.strokeStyle = rgba(M.lite, 0.8); c.lineWidth = 0.6; for (let i = 0; i < 3; i++) { const s = i % 2 ? 1 : -1; c.beginPath(); let x = 37.5, y = s * 11.5; c.moveTo(x, y); for (let j = 0; j < 4; j++) { x += 1.4 + rnd(); y += (rnd() - 0.5) * 4 - s * 0.2; c.lineTo(x, y); } c.globalAlpha = 0.35 + 0.5 * rnd(); c.stroke(); } c.globalAlpha = 1; }
            } else if (f === 'hold') {
                if (o.stream) {
                    const L = 12 + 6 * rnd(); const gr = c.createLinearGradient(35, 0, 35 + L, 0); gr.addColorStop(0, rgba(M.lite, 0.95)); gr.addColorStop(1, rgba(M.col, 0));
                    c.fillStyle = gr; c.beginPath(); c.moveTo(35, -2.4); c.lineTo(35 + L, -0.6 - rnd()); c.lineTo(35 + L, 0.6 + rnd()); c.lineTo(35, 2.4); c.closePath(); c.fill();
                    for (let i = 0; i < 3; i++) { c.fillStyle = rgba(M.lite, 0.8); c.fillRect(36 + rnd() * 16, (rnd() - 0.5) * 3, 1, 1); }
                }
                if (o.over) { c.globalCompositeOperation = 'source-over'; for (let i = 0; i < 4; i++) { const u = ((t * 0.9 + i * 0.25) % 1); c.fillStyle = `rgba(210,225,235,${0.5 * (1 - u)})`; c.beginPath(); c.arc(14 + i * 4 + Math.sin(t * 6 + i) * 1.2, -7 - u * 11, 1.2 + u * 2.4, 0, TAU); c.fill(); } }
            } else if (f === 'spread') {
                if (k > 0.02) { c.strokeStyle = rgba(M.lite, k); c.lineWidth = 0.8; for (let i = -3; i <= 3; i++) { const a = i * 0.16; c.beginPath(); c.moveTo(38 + (1 - k) * 4, 0); c.lineTo(38 + (1 - k) * 4 + Math.cos(a) * (7 + 10 * k), Math.sin(a) * (7 + 10 * k)); c.stroke(); } }
            } else if (f === 'beam') {
                if (k > 0.02) {
                    const kk = 1 - k; ring(36, 0, (1 - Math.min(1, kk * 2.2)) * 9 + 1.5, 0.9 * k, 1.1);
                    if (kk > 0.18) { const a = Math.sin(Math.min(1, (kk - 0.18) / 0.5) * Math.PI) * k * 1.4; const gr = c.createLinearGradient(36, 0, 120, 0); gr.addColorStop(0, rgba(M.lite, cl(a, 0, 1))); gr.addColorStop(1, rgba(M.col, 0)); c.fillStyle = gr; c.fillRect(36, -1.2, 84, 2.4); }
                }
            } else if (f === 'thrown') {
                if (k > 0.02) { const kk = 1 - k; c.fillStyle = rgba(M.lite, 0.9 * k); c.beginPath(); c.arc(37 + kk * 14, -kk * 5 * (1 - kk), 3.5 * k + 1, 0, TAU); c.fill(); ring(37 + kk * 14, -kk * 5 * (1 - kk), 3 + kk * 7, 0.6 * k, 0.9); }
            } else if (f === 'mine') {
                if (k > 0.02) { const kk = 1 - k, y = kk * 22; c.fillStyle = rgba(M.lite, 0.95); c.beginPath(); c.arc(30, 6 + y, 2.4, 0, TAU); c.fill(); ring(30, 6 + y, 3 + Math.sin(kk * 30) * 1, 0.7, 0.8); if (kk > 0.8) ring(30, 28, (kk - 0.8) * 60, (1 - kk) * 4, 0.8); }
            } else if (f === 'orbit') {
                const n = 3, sp = 2.4 + k * 6;
                for (let i = 0; i < n; i++) { const a = t * sp + i * TAU / n; const x = 18 + Math.cos(a) * 17, y = Math.sin(a) * 11; c.fillStyle = rgba(M.lite, 0.9); c.fillRect(x - 0.9, y - 0.9, 1.9, 1.9); c.fillStyle = rgba(M.col, 0.25); c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); }
            } else if (f === 'nova') {
                if (k > 0.02) { const kk = 1 - k; ring(18, 0, 8 + kk * 26, k * 0.9, 1.4); ring(18, 0, 5 + kk * 17, k * 0.6, 0.9); }
            } else if (f === 'shield') {
                ring(18, 0, 9 + Math.sin(t * 5) * 0.8, 0.35, 1.2);
            }
            c.restore();
        };

        // ================================================================== TIMERS / STATE FOR A HELD CELL
        const now = () => performance.now();
        const heldState = (p, id, recoil) => {
            const u = user(), own = typeof g !== 'undefined' && p === g.player;
            if (!own) return { mode: ((p && p.pm) | 0) % 3, fam: famOf(id), k: 0, stream: false, charge: 1, fire: 0, eq: 1 };
            const m = modeOf(u), meta = WEAPON_DATA[id] || {}, fam = famOf(id), i = (u.loadout || []).indexOf(id), key = ['O', 'P', 'L'][i];
            if (PL.lastHeld !== id) { PL.lastHeld = id; PL.eqAt = now(); }
            const dt = now() - (PL.lastFire[id] || -1e9), dur = DUR[fam] || 300, k = cl(1 - dt / dur, 0, 1);
            const st = { mode: m, fam, k, eq: cl((now() - PL.eqAt) / 800, 0, 1), fire: cl(1 - dt / 260, 0, 1), spread: fam === 'spread' ? k : 0, charge: 1 };
            try {
                if (fam === 'hold') {
                    const ch = g.charges || {}; const cur = id === 'HOSE' ? ch.HOSE : ch[id]; st.charge = cur === undefined ? 1 : cl(cur / 20000, 0, 1);
                    st.over = id === 'HOSE' ? !!g.isHoseRecharging : !!ch[id + 'R']; st.heat = st.over ? 0.8 : (1 - st.charge) * 0.5;
                    st.stream = !st.over && dt < 160; st.fire = st.stream ? 0.5 : 0;
                } else if (fam !== 'shield' && key && typeof slotProg === 'function' && meta) {
                    const prog = slotProg(id, key, g.cooldowns, g.charges, g.ally, g.isHoseRecharging, cdBase);   // core dims on a shot, then refills over the cooldown
                    st.charge = cl(0.12 + 0.88 * prog, 0, 1);
                }
            } catch (e) { /* keep drawing */ }
            return st;
        };
        // in-hand drawing, called from drawHeldAt with the context already moved to the hand and rotated toward the aim
        PL.held = (c, p, id, a, recoil, lvl) => safe('held', () => {
            const st = heldState(p, id, recoil), t = now() / 1000, k = st.k, s = 1 - k, fam = st.fam;
            const sc = 0.8;
            c.save(); c.scale(sc, sc);
            let ox = 0, oy = 0, rot = 0, zs = 1;
            const rk = (recoil || 0);
            if (fam === 'gun') { ox = -3 * Math.max(k, rk); rot = -0.1 * k; }
            else if (fam === 'hold') { if (st.stream) { ox = -1 + rnd() * 0.8; oy = (rnd() - 0.5) * 1.2; } if (st.over) oy += Math.sin(t * 40) * 0.3; }
            else if (fam === 'spread') { ox = -4.5 * k; rot = -0.2 * k; }
            else if (fam === 'beam') { ox = -1.5 * k; }
            else if (fam === 'thrown') { rot = -0.95 * Math.sin(Math.PI * Math.min(1, s)) * (s < 0.5 ? 1 : -0.45) * (k > 0 ? 1 : 0); ox = 2 * Math.sin(Math.PI * s) * (k > 0 ? 1 : 0); }
            else if (fam === 'mine') { rot = 0.8 * Math.sin(Math.PI * Math.min(1, s)) * (k > 0 ? 1 : 0); oy = 2 * Math.sin(Math.PI * s) * (k > 0 ? 1 : 0); }
            else if (fam === 'orbit') { oy = Math.sin(t * 2.4) * 0.8; }
            else if (fam === 'nova') { zs = 1 + 0.13 * k; }
            else if (fam === 'melee') { if (k > 0) { const e = s * s * (3 - 2 * s); rot = -1.25 + 2.5 * e; ox = 3 * Math.sin(Math.PI * s); } }
            else if (fam === 'special') { ox = -2 * k; oy = (rnd() - 0.5) * 0.8 * k; }
            c.translate(ox, oy); c.rotate(rot); c.scale(zs, zs);
            if (fam === 'melee' && k > 0.02) {   // plasma-edged arc trail swept behind the blade
                const M = MODES[st.mode], a0 = -1.25, a1 = rot; c.save(); c.rotate(-rot); c.globalCompositeOperation = 'lighter';
                const gr = c.createRadialGradient(0, 0, 18, 0, 0, 44); gr.addColorStop(0, rgba(M.col, 0)); gr.addColorStop(0.7, rgba(M.col, 0.55 * k)); gr.addColorStop(1, rgba(M.lite, 0.9 * k));
                c.fillStyle = gr; c.beginPath(); c.arc(0, 0, 44, a0, a1, false); c.arc(0, 0, 20, a1, a0, true); c.closePath(); c.fill(); c.restore();
            }
            drawCell(c, t, { mode: st.mode, charge: st.charge, fire: st.fire, eq: st.eq, heat: st.heat, fam, k, stream: st.stream, over: st.over, spread: st.spread });
            c.restore();
            return true;
        }, false);
        // for the shop / locker / avatar previews: idle animation with a demo shot now and then
        const demo = (t, mode) => {
            const cyc = (t % 3.2), fire = cl(1 - (cyc - 1.6) / 0.35, 0, 1) * (cyc > 1.6 ? 1 : 0), eq = cyc < 0.9 ? cyc / 0.9 : 1;
            return { mode, charge: cyc < 1.6 || cyc > 1.95 ? 1 : 0.55, fire: cyc > 1.6 ? fire : 0, eq: t % 12 < 1 ? cl((t % 12), 0, 1) : 1, k: 0, fam: '', spread: 0 };
        };
        const drawSkin = (c, t, sc, opt) => {
            const u = user(), mode = opt && opt.mode != null ? opt.mode : modeOf(u);
            c.save(); c.scale(sc, sc); drawCell(c, t, opt && opt.cell ? opt.cell : demo(t, mode)); c.restore();
        };

        // ================================================================== FX LIST (world-space effects)
        const addFx = (f) => { if (PL.fx.length < 140) PL.fx.push(f); };
        const fxRing = (x, y, r1, col, life, w) => addFx({ k: 'ring', x, y, r0: 2, r1, col, life, max: life, w: w || 2 });
        const fxSparks = (x, y, col, n, sp) => { for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (0.4 + rnd()) * (sp || 2.4); addFx({ k: 'sp', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col, life: 14 + rnd() * 10, max: 24, s: 1.5 + rnd() * 1.5 }); } };
        const fxBolt = (pts, col) => addFx({ k: 'bolt', pts, col, life: 10, max: 10 });
        const fxShard = (x, y, a, col) => addFx({ k: 'sh', x, y, vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4, rot: a, col, life: 18, max: 18 });
        const tickFx = () => {
            for (let i = PL.fx.length - 1; i >= 0; i--) { const f = PL.fx[i]; f.life--; if (f.k === 'sp' || f.k === 'sh') { f.x += f.vx; f.y += f.vy; f.vx *= 0.93; f.vy *= 0.93; } if (f.life <= 0) PL.fx.splice(i, 1); }
            if (PL.flash && --PL.flash.life <= 0) PL.flash = null;
        };

        // ================================================================== GAMEPLAY: tick, spawn tweaks, hurt hook
        const cfgFor = (id) => { const u = user(), m = modeOf(u), f = famOf(id), c = FT[f][m]; return (f === 'hold' && id !== 'HOSE') ? Object.assign({}, c, { dm: c.dm / (c.every || 1) * 1.4, every: 0, r: 1, pierce: 0 }) : c; };   // ARS hold weapons (Spoon Railgun) are not g.bullets: spread the lance damage instead of dropping bullets
        const aim = () => (typeof g !== 'undefined' && g.lastAim != null ? g.lastAim : 0);
        const muzzle = () => { const p = g.player, a = aim(); return [p.x + Math.cos(a) * 40, p.y + 4 + Math.sin(a) * 28]; };
        const shake = (n) => { try { g.shake = Math.max(g.shake || 0, n); } catch (e) { /* none */ } };

        const onFired = (id, slotKey) => {
            const M = MODES[modeOf(user())], f = famOf(id), c = cfgFor(id);
            PL.lastFire[id] = now();
            const [mx, my] = muzzle();
            fxRing(mx, my, 14 + (f === 'nova' ? 30 : 0), M.col, 14, 1.5);
            fxSparks(mx, my, M.lite, 4, 2.2);
            shake(modeOf(user()) === 0 ? 2.2 : 1.1);
            PL.flash = { col: M.col, life: 5, a: 0.07 };
            if (slotKey && c.cd !== 1 && g.cooldowns[slotKey] > 0) g.cooldowns[slotKey] *= c.cd;
            return c;
        };
        const tuneEntity = (e, id, c, kind) => {   // geometry only: damage multipliers are applied at hit time (onHurt) so nothing is counted twice
            e._pl = 1;
            if (kind === 'trap') { e.rad *= c.rad; }
            else if (kind === 'hz') { e.r *= c.rad; e.t = Math.round(e.t * c.life); e.max = e.t; }
            else if (kind === 'hole') { e.r *= c.rad; e.life = Math.round(e.life * c.life); e.max = e.life; }
            else if (kind === 'beam') { e.w *= c.rad; }
            else if (kind === 'drone') { e.life = Math.round(e.life * c.life); if (c.fast !== 1) e.cdMul = c.fast; }
            else if (kind === 'ars') {
                if (e.max !== undefined && e.r !== undefined && e.sp !== undefined) e.max *= c.rad;   // nova rings
                if (e.R !== undefined) e.R *= c.rad;
                if (e.life !== undefined && c.life !== 1) e.life = Math.round(e.life * c.life);
            }
        };
        PL.tick = () => safe('tick', () => {
            tickFx();
            const u = user(); if (!u || !g || !g.active) return;
            if (g.tick % 60 === 0) PL.chainBudget = 0;
            PL.chainBudget = Math.max(0, PL.chainBudget - 0.34);
            if (!on(u)) { PL.prevCd = { O: 0, P: 0, L: 0 }; return; }
            const lo = u.loadout || [], mi = modeOf(u);
            // 1) shots: a cooldown that jumped up means that slot just fired
            ['O', 'P', 'L'].forEach((k, i) => {
                const id = lo[i], cur = g.cooldowns[k] || 0, prev = PL.prevCd[k] || 0;
                if (id && cur > prev + 1) { const c = onFired(id, k); if (c.twin && famOf(id) === 'mine' && g.traps.length < 30) { const p = g.player, a = aim() + Math.PI / 2; const tp = g.traps[g.traps.length - 1]; if (tp && tp.id === id) { const n = { ...tp, x: clamp(p.x + Math.cos(a) * 26, 10, 790), y: clamp(p.y + Math.sin(a) * 26, 10, 590), dmg: tp.dmg * 0.5, born: g.tick, _pl: 0 }; g.traps.push(n); } } }
                PL.prevCd[k] = g.cooldowns[k] || 0;
            });
            // 2) new bullets
            const fresh = {};
            for (let i = 0; i < g.bullets.length; i++) { const b = g.bullets[i]; if (b._pl !== undefined) continue; if (b.o || !plasmaOn(b.id) || b.id === 'PLSH') { b._pl = 0; continue; } b._pl = 1; (fresh[b.id] || (fresh[b.id] = [])).push(b); }
            const kill = new Set();
            for (const id in fresh) {
                const list = fresh[id], c = cfgFor(id), f = famOf(id);
                list.forEach((b, i) => {
                    b.sk = 'P' + mi; b._m = mi;
                    if (c.every && (i + (PL.hoseN = (PL.hoseN || 0) + 1)) % c.every !== 0) { kill.add(b); return; }
                    if (c.center && list.length > c.center) { const mid = (list.length - 1) / 2, lo2 = Math.floor(mid - (c.center - 1) / 2 + 0.01), hi2 = lo2 + c.center - 1; if (i < lo2 || i > hi2) { kill.add(b); return; } }
                    if (c.r !== 1) b.r = Math.min(b.r * c.r, 15);
                    if (b.splash && c.rad !== 1 && f === 'gun') b.splash *= c.rad;   // Overcharge: bigger blast
                    if (c.pierce && !b.splash && !b.saw) b._pp = c.pierce;
                    if (f === 'hold') PL.lastFire[id] = now();
                });
            }
            if (kill.size) g.bullets = g.bullets.filter(b => !kill.has(b));
            // 3) hold-weapon charge economy
            for (const id of lo) {
                if (!id || !WEAPON_DATA[id] || famOf(id) !== 'hold') continue;
                const c = cfgFor(id), ch = g.charges, rk = id === 'HOSE' ? g.isHoseRecharging : !!ch[id + 'R'], held = isHeld(id);
                if (held && !rk && c.drain !== 1 && ch[id] !== undefined) ch[id] -= 60 * (c.drain - 1);
                if (rk && c.refill !== 1 && ch[id] !== undefined) ch[id] += 120 * (c.refill - 1);
            }
            // 4) mines: our own trigger so the blast is attributed to the weapon (and gets the mode effects)
            for (let i = g.traps.length - 1; i >= 0; i--) {
                const t = g.traps[i];
                if (t._pl === undefined) { if (plasmaOn(t.id)) tuneEntity(t, t.id, cfgFor(t.id), 'trap'); else t._pl = 0; }
                if (t._pl === 1 && g.zombies.some(z => !z.dead && !(z.emerge > 0) && Math.hypot(t.x - z.x, t.y - z.y) < z.size + 15)) {
                    g.traps.splice(i, 1); withSrc(t.id, () => explode(t.x, t.y, t.rad, t.dmg));
                    fxRing(t.x, t.y, t.rad, MODES[mi].col, 18, 2.5); fxSparks(t.x, t.y, MODES[mi].lite, 10, 3.2);
                }
            }
            // 5) world entities from the special weapons
            for (const h of g.hz) if (h._pl === undefined) { if (h.k === 'f' && plasmaOn(h.src)) tuneEntity(h, h.src, cfgFor(h.src), 'hz'); else h._pl = 0; }
            for (const h of g.holes) if (h._pl === undefined) { if (plasmaOn(h.src)) tuneEntity(h, h.src, cfgFor(h.src), 'hole'); else h._pl = 0; }
            for (const b of g.beams) if (b._pl === undefined) { if (plasmaOn(b.src)) tuneEntity(b, b.src, cfgFor(b.src), 'beam'); else b._pl = 0; }
            for (const d of g.drones) if (d._pl === undefined) { if (plasmaOn(d.id)) tuneEntity(d, d.id, cfgFor(d.id), 'drone'); else d._pl = 0; }
            for (const d of g.drones) if (d._pl === 1 && d.cdMul && d.cd === 22) d.cd = Math.max(1, Math.round(22 * d.cdMul));
            const w = g.aw;
            if (w) for (const key of ['orbs', 'rangs', 'novas', 'miss', 'bolts', 'clouds', 'lances', 'fl', 'rays']) for (const e of (w[key] || [])) if (e._pl === undefined) { if (e.id && plasmaOn(e.id)) tuneEntity(e, e.id, cfgFor(e.id), 'ars'); else e._pl = 0; }
            // 6) the shield: each mode gives it a small plasma trick
            if (plasmaOn('SHIELD') && isHeld('SHIELD')) {
                const p = g.player;
                if (mi === 0 && g.tick % 100 === 0) { fxRing(p.x, p.y, 54, MODES[0].col, 16, 2); for (const z of g.zombies) if (!z.dead && !z.boss && Math.hypot(z.x - p.x, z.y - p.y) < 56) { const d = Math.hypot(z.x - p.x, z.y - p.y) || 1; z.x = clamp(z.x + (z.x - p.x) / d * 28, 10, 790); z.y = clamp(z.y + (z.y - p.y) / d * 28, 10, 590); } }
                if (mi === 1 && g.tick % 45 === 0) { const z = nearest(p.x, p.y); if (z && Math.hypot(z.x - p.x, z.y - p.y) < 90) { fxBolt([[p.x, p.y], [(p.x + z.x) / 2 + (rnd() - 0.5) * 14, (p.y + z.y) / 2 + (rnd() - 0.5) * 14], [z.x, z.y]], MODES[1].col); withSrc('SHIELD', () => hurt(z, 28 * dmgMul())); } }
                if (mi === 2) for (const z of g.zombies) if (!z.dead && Math.hypot(z.x - p.x, z.y - p.y) < 58) z.slow = Math.min(z.slow === undefined ? 1 : z.slow, 0.55);
            }
        });

        // damage hook: called from hurt() for every damage event. src = g.src (the weapon id that is dealing it)
        PL.onHurt = (z, dmg) => {
            try {
                if (PL.inChain || typeof g === 'undefined' || !g.src) return dmg;
                const src = g.src; if (src === 'PLSH' || !plasmaOn(src)) return dmg;
                const mi = modeOf(user()), c = cfgFor(src), M = MODES[mi];
                dmg *= c.dm;
                const killing = z.hp - dmg * (1 - (z.armor || 0)) <= 0;
                PL.hitN++;
                if (PL.hitN % 3 === 0 || killing) fxSparks(z.x, z.y, M.lite, killing ? 7 : 2, killing ? 3 : 1.8);
                if (c.slow && !z.dead) {
                    z.slow = Math.min(z.slow === undefined ? 1 : z.slow, z.boss ? 1 - (1 - c.slow) * 0.5 : c.slow);
                    z._cry = (g.tick | 0) + 70; z._chill = ((z._chill || 0) + 1);
                    if (z._chill >= 4 && !z.boss) { z._chill = 0; z.slow = 0; z._cry = (g.tick | 0) + 100; fxRing(z.x, z.y, z.size + 8, M.col, 12, 1.5); }   // every 4th hit freezes it solid for a moment
                }
                if (c.chain && PL.chainBudget < 7) {
                    PL.inChain = true;
                    try {
                        let cur = z, left = c.chain; const hit = new Set([z]), pts = [[z.x, z.y]];
                        while (left-- > 0) {
                            let best = null, bd = 120 * 120;
                            for (const q of g.zombies) { if (q.dead || q.emerge > 0 || hit.has(q)) continue; const d2 = (q.x - cur.x) ** 2 + (q.y - cur.y) ** 2; if (d2 < bd) { bd = d2; best = q; } }
                            if (!best) break; hit.add(best); pts.push([best.x, best.y]); PL.chainBudget += 1;
                            const q = best; hurt(q, dmg * 0.22); cur = best;
                        }
                        if (pts.length > 1) { fxBolt(pts, M.col); if (typeof evPush === 'function' && g.arcs.length < 20) { g.arcs.push({ pts: pts.map(p => [Math.round(p[0]), Math.round(p[1])]), life: 8 }); } }
                    } finally { PL.inChain = false; }
                }
                if (killing) {
                    PL.killN++;
                    fxRing(z.x, z.y, z.size + 14, M.col, 14, 2);
                    if (c.shard && g.bullets.length < 240) {   // ice shards burst out of a frozen kill
                        for (let i = 0; i < c.shard; i++) { const a = rnd() * TAU; g.bullets.push({ x: z.x, y: z.y, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, r: 4, id: 'PLSH', dmg: Math.max(4, dmg * 0.25), born: gameNow(), splash: 0, ghost: false, maxT: 380, _pl: 1, _m: 2, sk: 'P2' }); fxShard(z.x, z.y, a, M.lite); }
                    }
                    if (mi === 0 && rnd() < 0.35) { g.vfx.push({ x: z.x, y: z.y, r: 0, max: 46, a: 1 }); }
                }
            } catch (e) { if (!warned.hurt) { warned.hurt = 1; console.error('[plasma] onHurt', e); } }
            return dmg;
        };
        PL.pierce = (b, z) => { try { if (b._pp > 0 && !b.splash) { b._pp--; (b.ph || (b.ph = new Set())).add(z); b.dmg *= 0.88; return true; } } catch (e) { /* none */ } return false; };

        // ================================================================== DRAWING: bolts, overlays, HUD
        PL.bullet = (c, b) => {
            const sk = b.sk;
            if (!(b._pl === 1 || sk === 'PLASMA' || (typeof sk === 'string' && sk.length === 2 && sk[0] === 'P' && '012'.includes(sk[1])))) return false;
            const mi = b._m != null ? b._m : (sk && sk.length === 2 ? +sk[1] : 0), M = MODES[mi] || MODES[0];
            const spd = Math.hypot(b.vx || 0, b.vy || 0), ux = spd ? b.vx / spd : 1, uy = spd ? b.vy / spd : 0, r = Math.max(2.5, b.r || 5);
            c.save(); c.globalCompositeOperation = 'lighter';
            if (spd) {
                const L = b.id === 'HOSE' ? 6 : Math.min(34, spd * (mi === 0 ? 2.8 : 2.1)); const gr = c.createLinearGradient(b.x, b.y, b.x - ux * L, b.y - uy * L);
                gr.addColorStop(0, rgba(M.col, 0.85)); gr.addColorStop(1, rgba(M.col, 0)); c.strokeStyle = gr; c.lineWidth = r * (mi === 1 ? 0.7 : 1.1); c.lineCap = 'round';
                c.beginPath(); c.moveTo(b.x, b.y);
                if (mi === 1 && b.id !== 'HOSE') { const n = 3; for (let i = 1; i <= n; i++) { const kk = i / n; c.lineTo(b.x - ux * L * kk + (-uy) * Math.sin((g.tick + i * 3) * 1.7 + b.x * 0.1) * 3, b.y - uy * L * kk + ux * Math.sin((g.tick + i * 3) * 1.7 + b.y * 0.1) * 3); } } else c.lineTo(b.x - ux * L, b.y - uy * L);
                c.stroke();
            }
            const hr = r * 2.7, hg = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, hr); hg.addColorStop(0, rgba(M.lite, 0.95)); hg.addColorStop(0.35, rgba(M.col, 0.6)); hg.addColorStop(1, rgba(M.col, 0));
            c.fillStyle = hg; c.beginPath(); c.arc(b.x, b.y, hr, 0, TAU); c.fill();
            if (mi === 2 && b.id !== 'HOSE') { c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(uy, ux)); c.fillStyle = rgba(M.lite, 0.95); c.beginPath(); c.moveTo(r * 1.3, 0); c.lineTo(0, r * 0.6); c.lineTo(-r * 0.9, 0); c.lineTo(0, -r * 0.6); c.closePath(); c.fill(); c.restore(); }
            else { c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x, b.y, Math.max(1.2, r * 0.38), 0, TAU); c.fill(); }
            c.restore(); return true;
        };
        PL.draw = (c, t) => safe('draw', () => {
            if (typeof g === 'undefined') return;
            if (PL.fx.length) {
                c.save(); c.globalCompositeOperation = 'lighter';
                for (const f of PL.fx) {
                    const a = f.life / f.max;
                    if (f.k === 'ring') { c.strokeStyle = rgba(f.col, a * 0.9); c.lineWidth = f.w * a + 0.5; c.beginPath(); c.arc(f.x, f.y, lerp(f.r1, f.r0, a), 0, TAU); c.stroke(); }
                    else if (f.k === 'sp') { c.fillStyle = rgba(f.col, a); c.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s); }
                    else if (f.k === 'bolt') { c.strokeStyle = rgba(f.col, a); c.lineWidth = 2.2; c.lineJoin = 'round'; c.beginPath(); f.pts.forEach((p, i) => { const jx = (i && i < f.pts.length) ? (rnd() - 0.5) * 6 : 0, jy = (i && i < f.pts.length) ? (rnd() - 0.5) * 6 : 0; i ? c.lineTo(p[0] + jx, p[1] + jy) : c.moveTo(p[0], p[1]); }); c.stroke(); c.strokeStyle = rgba('#ffffff', a * 0.9); c.lineWidth = 0.8; c.stroke(); }
                    else if (f.k === 'sh') { c.save(); c.translate(f.x, f.y); c.rotate(f.rot); c.fillStyle = rgba(f.col, a); c.beginPath(); c.moveTo(5, 0); c.lineTo(0, 2); c.lineTo(-4, 0); c.lineTo(0, -2); c.closePath(); c.fill(); c.restore(); }
                }
                c.restore();
            }
            if (!g.active) return; const u = user(); if (!on(u)) return;
            const mi = modeOf(u), M = MODES[mi];
            c.save(); c.globalCompositeOperation = 'lighter';
            for (const tr of g.traps) if (tr._pl === 1) {   // mines: a plasma charge that pulses as it arms
                const k = Math.min(1, (g.tick - tr.born) / 40), pu = 0.5 + 0.5 * Math.sin(g.tick * (0.25 + 0.5 * k));
                const gr = c.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, 14); gr.addColorStop(0, rgba(M.lite, 0.9)); gr.addColorStop(0.4, rgba(M.col, 0.5 * (0.5 + pu * 0.5))); gr.addColorStop(1, rgba(M.col, 0)); c.fillStyle = gr; c.beginPath(); c.arc(tr.x, tr.y, 14, 0, TAU); c.fill();
                if (k < 1) { c.strokeStyle = rgba(M.col, 0.7 * (1 - k)); c.lineWidth = 1.2; c.beginPath(); c.arc(tr.x, tr.y, 4 + (1 - k) * 16, 0, TAU); c.stroke(); }
            }
            for (const d of g.drones) if (d._pl === 1) { const gr = c.createRadialGradient(d.x, d.y, 0, d.x, d.y, 15); gr.addColorStop(0, rgba(M.lite, 0.8)); gr.addColorStop(0.5, rgba(M.col, 0.4)); gr.addColorStop(1, rgba(M.col, 0)); c.fillStyle = gr; c.beginPath(); c.arc(d.x, d.y, 15, 0, TAU); c.fill(); }
            for (const h of g.holes) if (h._pl === 1) { c.strokeStyle = rgba(M.col, 0.6); c.lineWidth = 1.5; c.beginPath(); c.arc(h.x, h.y, h.r * (0.3 + 0.7 * (h.life / h.max)), 0, TAU); c.stroke(); }
            for (const b of g.beams) if (b._pl === 1) { const gr = c.createLinearGradient(b.x - b.w, 0, b.x + b.w, 0); gr.addColorStop(0, rgba(M.col, 0)); gr.addColorStop(0.5, rgba(M.lite, 0.4)); gr.addColorStop(1, rgba(M.col, 0)); c.fillStyle = gr; c.fillRect(b.x - b.w, 0, b.w * 2, 600); }
            for (const b of g.bullets) if (b.saw && b._pl === 1) { c.strokeStyle = rgba(M.col, 0.7); c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, b.r + 5, 0, TAU); c.stroke(); }
            for (const z of g.zombies) if (!z.dead && z._cry > g.tick) { c.fillStyle = rgba('#bfefff', 0.14 + 0.08 * Math.sin(g.tick * 0.3)); c.beginPath(); c.ellipse(z.x, z.y, z.size * 0.95, z.size * 0.95, 0, 0, TAU); c.fill(); }
            if (isHeld('SHIELD') && plasmaOn('SHIELD')) {   // plasma shield: a rotating segmented ring
                const p = g.player; c.strokeStyle = rgba(M.col, 0.8); c.lineWidth = 2.5; for (let i = 0; i < 6; i++) { const a0 = g.tick * 0.05 + i * TAU / 6; c.beginPath(); c.arc(p.x, p.y, 32, a0, a0 + 0.75); c.stroke(); }
                const gr = c.createRadialGradient(p.x, p.y, 10, p.x, p.y, 34); gr.addColorStop(0, rgba(M.col, 0)); gr.addColorStop(1, rgba(M.col, 0.22)); c.fillStyle = gr; c.beginPath(); c.arc(p.x, p.y, 34, 0, TAU); c.fill();
            }
            if (PL.flash) { c.fillStyle = rgba(PL.flash.col, PL.flash.a * PL.flash.life / 5); c.fillRect(0, 0, 800, 600); }
            c.restore();
        });
        // little mode pip on each weapon slot of the HUD (RUNUI slots: x = 14 + i*50, y = 124)
        PL.hud = (c) => safe('hud', () => {
            const u = user(); if (!on(u) || typeof g === 'undefined') return;
            const M = MODES[modeOf(u)];
            (u.loadout || []).forEach((id, i) => {
                if (!id) return; const x = 14 + i * 50 + 30, y = 125;
                c.save(); c.fillStyle = 'rgba(8,10,12,.92)'; c.fillRect(x, y, 13, 13);
                c.strokeStyle = rgba(M.col, 0.9); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, 12, 12);
                c.fillStyle = M.col; c.font = 'bold 10px "Courier Prime", monospace'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(M.letter, x + 6.5, y + 10.5);
                c.restore();
            });
            if (g.tick % 600 < 240 && !PL.hintDone) { c.save(); c.font = '11px "Courier Prime", monospace'; c.fillStyle = rgba(M.col, 0.9); c.textAlign = 'left'; c.fillText(`PLASMA ${M.name.toUpperCase()}  [X] switch mode`, 14, 176); c.restore(); if (g.tick > 1500) PL.hintDone = true; }
        });

        // ================================================================== MODE SWITCHING
        const setMode = (m, quiet) => {
            const u = user(); if (!u || !owns(u)) return;
            m = ((m | 0) % 3 + 3) % 3; if (u.plasmaMode === m && PL.lastMode === m) return;
            u.plasmaMode = m; PL.lastMode = m;
            try { save({ plasmaMode: m }); } catch (e) { /* offline */ }
            const M = MODES[m];
            if (!quiet && typeof g !== 'undefined' && g.active && g.player) {
                const p = g.player; fxRing(p.x, p.y, 40, M.col, 16, 2.5); fxSparks(p.x, p.y, M.lite, 12, 3); shake(3);
                PL.flash = { col: M.col, life: 5, a: 0.12 };
                if (g.pops && g.pops.length < 60) g.pops.push({ x: p.x, y: p.y - 38, txt: 'PLASMA: ' + M.name.toUpperCase(), life: 50 });
            }
            document.querySelectorAll('.pl-modes').forEach(paintModes);
        };
        const cycleMode = () => setMode(modeOf(user()) + 1);
        window.addEventListener('keydown', (e) => {
            try {
                if ((e.code !== 'KeyX' && String(e.key).toLowerCase() !== 'x') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
                const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
                const u = user(); if (!u || !on(u)) return;
                e.stopImmediatePropagation(); e.preventDefault();   // X is also the co-op "Nice!" emote: it is yours while the Plasma Cell is equipped
                cycleMode();
            } catch (er) { /* never break input */ }
        }, true);

        // ================================================================== OWNERSHIP, THE ROLL, THE REVEAL
        const grant = (u, how) => {
            u = u || user(); if (!u) return false;
            const had = owns(u);
            u.skins = [...new Set([...(u.skins || []), 'PLASMA'])];
            try { skinEquip(u, 'PLASMA'); } catch (e) { u.skinOn = Object.assign({}, u.skinOn, { PLASMA: true }); }
            if (!u.plasmaAt) u.plasmaAt = Date.now();
            if (u.plasmaMode == null) u.plasmaMode = 0;
            try { save({ skins: u.skins, skinOn: u.skinOn, plasmaAt: u.plasmaAt, plasmaMode: u.plasmaMode }); } catch (e) { /* offline */ }
            try { applyLook(); refreshLobbyStats(); } catch (e) { /* lobby not up */ }
            return !had;
        };
        // exactly 1 in 1,000,000: rejection-sample a uniform integer in [0, 1e6) from 32-bit draws. The odds are a closure constant, not a global.
        const secureRoll = (() => {
            const N = 1000000, LIM = Math.floor(4294967296 / N) * N;
            return () => { const a = new Uint32Array(1); for (let i = 0; i < 16; i++) { crypto.getRandomValues(a); if (a[0] < LIM) return a[0] % N === 0; } return false; };
        })();
        const rolledThisSession = new WeakSet();
        PL.onLogin = () => {
            const u = user(); if (!u || rolledThisSession.has(u)) return; rolledThisSession.add(u);
            if (u.anon || u.anonForced || u.isBot || owns(u)) return;
            const key = 'MP_PLASMA_ROLL_' + (u.username || '?');
            try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { /* private mode: the WeakSet still limits it to once per login */ }
            if (secureRoll()) { if (grant(u, 'login')) { reveal(true); try { toast('PLASMA CELL: a 1-in-1,000,000 mythic skin is yours!'); } catch (e) { /* none */ } } }
        };

        const reveal = (won) => {
            if (document.getElementById('pl-reveal')) return;
            const ov = document.createElement('div'); ov.id = 'pl-reveal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:radial-gradient(ellipse at center,#04141f 0%,#010509 75%);display:flex;align-items:center;justify-content:center;font-family:"Special Elite","Courier Prime",monospace;overflow:hidden';
            const cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block'; ov.appendChild(cv);
            const btn = document.createElement('button'); btn.textContent = 'Equip & close'; btn.className = 'btn btn-primary';
            btn.style.cssText = 'position:absolute;left:50%;bottom:6%;transform:translateX(-50%);padding:12px 28px;font:inherit;font-size:16px;cursor:pointer;opacity:0;transition:opacity .6s;z-index:2';
            ov.appendChild(btn);
            const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Close'); x.style.cssText = 'position:absolute;top:14px;right:18px;background:none;border:0;color:#9fe8ff;font-size:30px;cursor:pointer;z-index:2';
            ov.appendChild(x); document.body.appendChild(ov);
            const dpr = Math.min(2, window.devicePixelRatio || 1); let W = 0, H = 0;
            const rs = () => { W = cv.width = Math.round(ov.clientWidth * dpr); H = cv.height = Math.round(ov.clientHeight * dpr); }; rs();
            const parts = Array.from({ length: 140 }, () => ({ a: rnd() * TAU, d: 0.5 + rnd() * 0.6, sp: 0.6 + rnd(), s: 1 + rnd() * 2, ph: rnd() * 6 }));
            const t0 = now(); let raf = 0, closed = false;
            const close = () => { if (closed) return; closed = true; cancelAnimationFrame(raf); ov.remove(); window.removeEventListener('resize', rs); try { renderLookIfOpen(); } catch (e) { /* none */ } };
            btn.onclick = close; x.onclick = close; ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
            const frame = () => {
                if (closed) return; const T = (now() - t0) / 1000, c = cv.getContext('2d'); c.clearRect(0, 0, W, H);
                const cx = W / 2, cy = H * 0.34, S = Math.min(W / 92, H / 44);
                c.save(); c.globalCompositeOperation = 'lighter';
                parts.forEach((p) => {   // motes converge on the centre, then orbit and rise
                    const conv = cl(1 - T / 2.6, 0, 1), r = (p.d * Math.max(W, H) * 0.7) * conv + 30 + Math.sin(T * p.sp + p.ph) * 12, a = p.a + T * 0.4 * p.sp * (1 - conv * 0.6);
                    const col = (T > 2.6 && p.ph > 3) ? '#b46cff' : '#2fe3ff'; c.fillStyle = rgba(col, 0.55 * cl(T / 0.6, 0, 1)); c.fillRect(cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 0.75, p.s * dpr, p.s * dpr);
                });
                if (T > 2.4) { const k = cl((T - 2.4) / 0.9, 0, 1); c.strokeStyle = rgba('#d6fbff', (1 - k) * 0.9); c.lineWidth = 6 * dpr * (1 - k) + 1; c.beginPath(); c.arc(cx, cy, k * Math.max(W, H) * 0.55, 0, TAU); c.stroke(); const fl = Math.max(0, 1 - (T - 2.4) * 2.2); if (fl > 0) { c.fillStyle = rgba('#bff6ff', fl * 0.5); c.fillRect(0, 0, W, H); } }
                c.restore();
                c.save(); c.translate(cx - S * 15, cy); c.scale(S, S);
                const asm = cl(T / 2.5, 0, 1), cyc = Math.floor(T / 3.6) % 3;
                const mode = T > 3 ? Math.floor((T - 3) / 2) % 3 : 0;
                drawCell(c, T, { mode, asm, charge: 1, fire: T > 3.4 ? Math.max(0, 1 - ((T - 3.4) % 2) / 0.3) : 0, eq: 1, fam: '', spread: 0 });
                c.restore(); void cyc;
                const ta = cl((T - 2.6) / 0.8, 0, 1);
                if (ta > 0) {
                    c.save(); c.textAlign = 'center'; c.globalAlpha = ta;
                    const fs = Math.round(Math.min(W / 13, H / 9)); c.font = `${fs}px "Special Elite","Courier Prime",monospace`; c.shadowColor = '#2fe3ff'; c.shadowBlur = 26 * dpr; c.fillStyle = '#e6fcff'; c.fillText('PLASMA CELL', cx, H * 0.74);
                    c.shadowBlur = 0; c.font = `${Math.round(fs * 0.36)}px "Courier Prime",monospace`; c.fillStyle = '#9fe8ff'; c.fillText('MYTHIC  ·  1 IN 1,000,000', cx, H * 0.74 + fs * 0.55);
                    c.font = `${Math.round(fs * 0.26)}px "Courier Prime",monospace`; c.fillStyle = 'rgba(190,225,240,.85)'; c.fillText(won ? 'It is yours. Equip it in the Locker, press X in a run to switch modes.' : 'Preview of the Plasma Cell.', cx, H * 0.74 + fs * 0.95);
                    c.restore();
                }
                if (T > 3.4) btn.style.opacity = '1';
                raf = requestAnimationFrame(frame);
            };
            window.addEventListener('resize', rs); frame();
        };
        const renderLookIfOpen = () => { if (typeof renderLook === 'function' && !document.getElementById('look-modal').classList.contains('hidden')) renderLook(); };

        // ================================================================== SKIN REGISTRATION
        try { Object.defineProperty(WEAPON_DATA, 'PLASMA_ALL', { value: { label: 'every weapon', icon: '⚛️', unlock: 0, color: '#2fe3ff', radius: 0, dmg: 0, cooldown: 0 }, enumerable: false, configurable: true }); } catch (e) { /* frozen? */ }
        SKINS.PLASMA = {
            name: 'Plasma Cell', weapon: 'PLASMA_ALL', mythic: true, releaseAt: 4102444800000,   // never listed for sale / calendar: you own it or you do not
            how: 'Mythic. A 1-in-1,000,000 chance every time you log in. Works on every weapon.',
            draw: (c, t, sc, o) => drawSkin(c, t, sc, o), hold: (c, t, sc, o) => drawSkin(c, t, sc, o)
        };
        try { SKIN_COLS.PLASMA = ['#2fe3ff', '#d6fbff']; } catch (e) { /* none */ }

        // ================================================================== LOCKER / SHOP MODE SELECTOR (injected next to the Plasma Cell card)
        const paintModes = (box) => {
            const u = user(), cur = modeOf(u);
            box.querySelectorAll('button[data-m]').forEach((b) => { const m = +b.dataset.m, M = MODES[m]; const act = m === cur; b.style.background = act ? M.col : 'rgba(10,14,18,.9)'; b.style.color = act ? '#04131b' : M.col; b.style.borderColor = M.col; b.style.boxShadow = act ? `0 0 8px ${M.col}` : 'none'; });
        };
        const makeModes = () => {
            const box = document.createElement('div'); box.className = 'pl-modes'; box.style.cssText = 'display:flex;gap:4px;margin:6px 0;flex-wrap:wrap;justify-content:center';
            MODES.forEach((M, m) => { const b = document.createElement('button'); b.dataset.m = m; b.type = 'button'; b.title = M.desc; b.textContent = M.name; b.style.cssText = 'font:11px "Courier Prime",monospace;padding:3px 7px;border:1px solid;border-radius:4px;cursor:pointer'; b.onclick = (e) => { e.stopPropagation(); setMode(m, true); }; box.appendChild(b); });
            const d = document.createElement('div'); d.style.cssText = 'width:100%;font:10px "Courier Prime",monospace;opacity:.75;text-align:center'; d.textContent = 'press X in a run to switch'; box.appendChild(d);
            paintModes(box); return box;
        };
        let injT = 0;
        const inject = () => {
            injT = 0;
            try {
                const u = user(); if (!u) return;
                document.querySelectorAll('.skin-prev[data-skin="PLASMA"]').forEach((cv) => {
                    const card = cv.closest('.item, .card, [class*="card"]') || cv.parentElement.parentElement;
                    if (!card) return;
                    if (owns(u) && !card.querySelector('.pl-modes')) { const act = card.querySelector('.item-actions, [class*="actions"]'); const box = makeModes(); if (act) act.parentNode.insertBefore(box, act); else card.appendChild(box); }
                    card.querySelectorAll('*').forEach((el) => { if (!el.children.length && /^\s*LEGENDARY\s*$/i.test(el.textContent)) { el.textContent = 'MYTHIC'; el.style.color = '#2fe3ff'; el.style.textShadow = '0 0 6px #2fe3ff'; } });
                    card.querySelectorAll('.item-sub, [class*="sub"]').forEach((el) => { if (/not owned yet/.test(el.textContent)) el.textContent = el.textContent.replace(' (not owned yet)', ''); });
                });
                document.querySelectorAll('#look-spoon button[onclick*="PLASMA"]').forEach((bt) => { if (owns(u) && !(bt.nextElementSibling && bt.nextElementSibling.classList.contains('pl-modes'))) bt.parentNode.insertBefore(makeModes(), bt.nextSibling); });
            } catch (e) { /* UI only */ }
        };
        try { new MutationObserver(() => { if (!injT) injT = setTimeout(inject, 30); }).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* no observer */ }

        // ================================================================== DEBUG / ADMIN HELPERS (admins or localhost only)
        const allowed = () => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || (typeof isAdmin === 'function' && isAdmin()); } catch (e) { return false; } };
        const DBG = {
            grant: () => { if (!allowed()) return 'not allowed'; const u = user(); if (!u) return 'no user'; const fresh = grant(u, 'debug'); return fresh ? 'granted' : 'already owned'; },
            roll: (forceWin) => { if (!allowed()) return 'not allowed'; const u = user(); if (!u) return 'no user'; if (owns(u)) return 'already owned'; if (forceWin === true || secureRoll()) { grant(u, 'debug-roll'); reveal(true); return 'WIN'; } return 'no luck'; },
            reveal: () => { if (!allowed()) return 'not allowed'; reveal(false); return 'ok'; },
            mode: (m) => { if (!allowed()) return 'not allowed'; setMode(m); return MODES[modeOf(user())].name; },
            take: () => { if (!allowed()) return 'not allowed'; const u = user(); if (!u) return 'no user'; u.skins = (u.skins || []).filter(x => x !== 'PLASMA'); if (u.skinOn) delete u.skinOn.PLASMA; try { save({ skins: u.skins, skinOn: u.skinOn || {} }); } catch (e) { /* none */ } return 'removed'; },
            state: () => ({ owned: owns(user()), on: on(user()), mode: modeOf(user()), fx: PL.fx.length })
        };

        // surface (frozen so a console user cannot swap the roll out)
        const API = { tick: PL.tick, draw: PL.draw, hud: PL.hud, held: PL.held, bullet: PL.bullet, pierce: PL.pierce, onHurt: PL.onHurt, onLogin: PL.onLogin, setMode, cycleMode, mode: () => modeOf(user()), MODES, FT, famOf, drawCell, drawSkin, reveal: () => reveal(false), heldState };
        window.PLASMA = Object.freeze(API);
        window.PLASMA_debug = Object.freeze(DBG);
    } catch (e) { console.error('[plasma] init failed', e); }
})();
