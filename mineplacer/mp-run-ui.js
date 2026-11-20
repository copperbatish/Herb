/* mp-run-ui.js: owned by the RUN UI workstream. In-run canvas HUD, wave-clear upgrade screen, skill tree.
   Loaded as a classic script after the main one, so it shares its global lexical scope (g, ctx, UPGRADES, SKILLS ...). */
(() => {
    try {
        const $ = (id) => document.getElementById(id);
        const F_SP = '"Special Elite", monospace', F_CP = '"Courier Prime", monospace';
        const INK = '#e8dec6', DIM = '#9a8e7a', GOLD = '#d9a441', BLOOD = '#b8392d', OLIVE = '#8aa04a', STEEL = '#7f9aa6', LINE = '#4d4235', VIOLET = '#a58bc2';
        const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
        const S = window.RUNUI = { g: null, trail: 1, snap: null, parryMax: 80, hpFlash: 0, lastHp: 0 };

        // ---------- helpers ----------
        const emoName = (e) => {
            if (!e) return 'target';
            if (typeof ICON_ROWS !== 'undefined' && (ICON_ROWS[e] || String(e).startsWith('T.'))) return e;
            return EMO_MAP[String(e).replace(/️/g, '')] || 'target';
        };
        const cssCache = {};
        const cssColor = (c) => {   // 'var(--rust)' / 'var(--violet,#a58bc2)' -> a real colour the canvas understands
            if (!c) return GOLD;
            if (cssCache[c]) return cssCache[c];
            let out = c;
            const m = /var\((--[\w-]+)(?:,\s*([^)]+))?\)/.exec(c);
            if (m) { out = (getComputedStyle(document.documentElement).getPropertyValue(m[1]) || '').trim() || (m[2] || GOLD).trim(); }
            return (cssCache[c] = out);
        };
        const icon = (name, x, y, s) => { try { ctx.drawImage(spriteCanvas(name), Math.round(x), Math.round(y), s, s); } catch (e) { /* missing sprite: skip */ } };
        const txt = (s, x, y, o = {}) => {
            ctx.font = `${o.b ? '700 ' : ''}${o.s || 12}px ${o.f === 'sp' ? F_SP : F_CP}`;
            ctx.textAlign = o.a || 'left'; ctx.textBaseline = o.base || 'alphabetic';
            if (o.sh !== false) { ctx.fillStyle = 'rgba(0,0,0,.9)'; ctx.fillText(s, x + 1, y + 1); }
            ctx.fillStyle = o.c || INK; ctx.fillText(s, x, y);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        };
        const box = (x, y, w, h, o = {}) => {
            ctx.fillStyle = '#0a0908'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
            ctx.fillStyle = o.fill || 'rgba(26,21,16,.88)'; ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = o.bd || LINE; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x + 2, y + 2, w - 4, 2);
        };
        const sweep = (x, y, w, h, remain, color) => {   // cooldown clock: dark wedge that unwinds clockwise
            if (remain <= 0.001) return;
            ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
            ctx.fillStyle = color || 'rgba(8,6,4,.74)'; const cx = x + w / 2, cy = y + h / 2;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Math.max(w, h), -Math.PI / 2 + (1 - Math.min(1, remain)) * 6.2832, Math.PI * 1.5); ctx.closePath(); ctx.fill();
            ctx.restore();
        };
        const ring = (cx, cy, r, frac, color, lw) => {
            ctx.lineWidth = lw || 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
            if (frac > 0) { ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + clampN(frac, 0, 1) * 6.2832); ctx.stroke(); }
        };
        const mmss = (sec) => { sec = Math.max(0, Math.floor(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); };
        const fm = (n) => { n = Math.floor(n); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); };

        // generic icon chip (36px): sprite, key tab, cooldown wedge, state ring, small corner text
        const chip = (x, y, o) => {
            const s = o.s || 36, c = o.color || GOLD, ready = o.ready !== false;
            box(x, y, s, s, { bd: o.active ? c : (ready ? '#6b5d49' : LINE), fill: o.active ? 'rgba(60,44,16,.95)' : 'rgba(22,18,13,.92)' });
            ctx.globalAlpha = ready || o.active ? 1 : 0.55; icon(o.icon, x + (s - s * 0.62) / 2, y + (s - s * 0.62) / 2 - 1, Math.round(s * 0.62)); ctx.globalAlpha = 1;
            if (o.cd > 0) sweep(x + 2, y + 2, s - 4, s - 4, o.cd);
            if (o.active) { ctx.strokeStyle = c; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(g.tick * 0.2); ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, s + 2, s + 2); ctx.globalAlpha = 1; }
            if (o.frac !== undefined) { ctx.fillStyle = '#0a0908'; ctx.fillRect(x + 2, y + s - 6, s - 4, 4); ctx.fillStyle = c; ctx.fillRect(x + 3, y + s - 5, Math.round((s - 6) * clampN(o.frac, 0, 1)), 2); }
            if (o.key) { ctx.fillStyle = '#0a0908'; ctx.fillRect(x, y, o.key.length * 6 + 5, 12); txt(o.key, x + 3, y + 10, { s: 10, b: 1, c: ready ? GOLD : DIM, sh: false }); }
            if (o.label) txt(o.label, x + s - 3, y + 11, { s: 11, b: 1, a: 'right', c: o.lc || INK });
            if (o.ready && !o.active && o.glow) { ctx.strokeStyle = c; ctx.globalAlpha = 0.25 + 0.25 * Math.sin(g.tick * 0.12); ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2); ctx.globalAlpha = 1; }
        };

        // ---------- per-run tracking ----------
        const track = () => {
            const p = g.player;
            if (S.g !== g) { S.g = g; S.trail = clampN(p.hp / p.maxHp, 0, 1); S.snap = null; S.hpFlash = 0; S.lastHp = p.hp; S.parryMax = 80; }
            if (!S.snap || S.snap.wave !== g.wave) S.snap = { wave: g.wave, kills: g.stats.kills, earned: g.earned, tick: g.tick, scraps: g.scraps };
            if (p.hp < S.lastHp - 0.5) S.hpFlash = 12;
            S.lastHp = p.hp; if (S.hpFlash > 0) S.hpFlash--;
            const f = clampN(p.hp / p.maxHp, 0, 1);
            S.trail = f >= S.trail ? f : S.trail + (f - S.trail) * 0.05;
            if (g.parry && g.parry.cd > S.parryMax) S.parryMax = g.parry.cd;
        };

        // ---------- pieces ----------
        const drawPlayerPanel = () => {
            const p = g.player, f = clampN(p.hp / p.maxHp, 0, 1), X = 12, Y = 12, W = 282, H = 78;
            box(X, Y, W, H, { bd: S.hpFlash > 0 ? BLOOD : LINE });
            // portrait
            ctx.fillStyle = '#0f0c09'; ctx.fillRect(X + 6, Y + 6, 56, 56);
            const grd = ctx.createRadialGradient(X + 34, Y + 30, 4, X + 34, Y + 34, 40); grd.addColorStop(0, 'rgba(120,96,60,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd; ctx.fillRect(X + 6, Y + 6, 56, 56);
            ctx.strokeStyle = '#2d2720'; ctx.lineWidth = 2; ctx.strokeRect(X + 7, Y + 7, 54, 54);
            try { const img = (S.hpFlash > 0 && SPR_FLASH.player) || SPR.player; const sc = 3; ctx.drawImage(img, X + 34 - img.width * sc / 2, Y + 36 - img.height * sc / 2, img.width * sc, img.height * sc); } catch (e) { /* no sprite yet */ }
            // hp bar
            const bx = X + 70, by = Y + 8, bw = 172, bh = 18;
            ctx.fillStyle = '#0a0908'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
            ctx.fillStyle = '#2a120f'; ctx.fillRect(bx, by, bw, bh);
            if (S.trail > f) { ctx.fillStyle = '#e8dec6'; ctx.globalAlpha = 0.7; ctx.fillRect(bx, by, bw * S.trail, bh); ctx.globalAlpha = 1; }
            const low = f < 0.3, hc = p.hp > p.maxHp ? '#f0c040' : (low ? (g.tick % 24 < 12 ? '#ff4a3a' : '#c8392d') : (f < 0.6 ? '#d9a441' : '#7fae3a'));
            ctx.fillStyle = hc; ctx.fillRect(bx, by, bw * f, bh);
            ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(bx, by, bw * f, 4);
            ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(bx, by + bh - 4, bw, 4);
            const segs = clampN(Math.round(p.maxHp / 25), 4, 16);   // one notch per ~25 HP
            ctx.fillStyle = '#0a0908'; for (let i = 1; i < segs; i++) ctx.fillRect(Math.round(bx + bw * i / segs) - 1, by, 2, bh);
            ctx.strokeStyle = low ? '#ff4a3a' : '#5a4c3a'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
            txt(`${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`, bx + bw / 2, by + 14, { s: 13, b: 1, a: 'center' });
            // row 2: shield / regen / guard
            let x = bx, y2 = Y + 31;
            if (g.pk && g.pk.bulwark) {
                const rdy = g.bwT <= 0, mx = Math.max(300, 900 - 200 * g.pk.bulwark);
                icon('bulwark', x, y2, 16); if (!rdy) { ctx.fillStyle = 'rgba(8,6,4,.65)'; ctx.fillRect(x, y2, 16, 16 * clampN(g.bwT / mx, 0, 1)); }
                else { ctx.strokeStyle = STEEL; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(g.tick * 0.15); ctx.lineWidth = 1; ctx.strokeRect(x - 1, y2 - 1, 18, 18); ctx.globalAlpha = 1; }
                x += 22;
            }
            const bo = g.hb && g.hb.bo && g.hb.bo.t > 0 ? (BO_FX[g.hb.bo.id] || {}) : {};
            const adr = g.activeAbilityID === 'VAMP' && g.abilityTimeLeft > 0;
            const rg = (g.regen + (adr ? 0.15 : 0) + (bo.regen || 0)) * 60;
            if (rg > 0.05) {
                const pulse = 0.7 + 0.3 * Math.sin(g.tick * 0.1);
                ctx.globalAlpha = pulse; icon('plus', x, y2 + 1, 14); ctx.globalAlpha = 1;
                txt(`+${rg.toFixed(1)}/s`, x + 17, y2 + 12, { s: 11, b: 1, c: '#9ccf5a' }); x += 60;
            }
            if (g.buffs.guard > 0) { icon('shield', x, y2, 16); ctx.fillStyle = '#0a0908'; ctx.fillRect(x + 19, y2 + 5, 38, 6); ctx.fillStyle = STEEL; ctx.fillRect(x + 20, y2 + 6, 36 * clampN(g.buffs.guard / 600, 0, 1), 4); x += 62; }
            if (g.invuln > 0 && g.tick % 6 < 3) txt('SAFE', x, y2 + 12, { s: 10, b: 1, c: '#fff' });
            // row 3: currencies
            let cx = X + 70; const cy = Y + 66;
            const cur = (ic, v, c) => { icon(ic, cx, cy - 11, 14); ctx.font = `700 12px ${F_CP}`; const w = ctx.measureText(v).width; txt(v, cx + 17, cy + 1, { s: 12, b: 1, c }); cx += 17 + w + 7; };
            cur('cash', '$' + fm(g.cash), GOLD); cur('scrap', fm(g.scraps), '#c9b8e6');
            if (g.mats) {
                const M = { shard: ['shard', '#7fd0e8'], core: ['sing', '#e58fb0'], ember: ['flame', '#ff9a3a'] };
                Object.keys(g.mats).forEach((k) => { const m = M[k] || [k, INK], nm = (typeof ICON_ROWS !== 'undefined' && ICON_ROWS['mat_' + k]) ? 'mat_' + k : m[0]; cur(nm, fm(g.mats[k] || 0), m[1]); });
            }
        };

        const drawWeapons = (Y) => {
            const guest = MP.role === 'guest';
            ['O', 'P', 'L'].forEach((k, i) => {
                const id = currentUserData.loadout[i], x = 14 + i * 50;
                if (!id) { box(x, Y, 44, 44, { fill: 'rgba(20,16,12,.5)', bd: '#2d2720' }); txt(/* [controls] */ (window.KEYMAP ? KEYMAP.label('w' + i, true) : k), x + 22, Y + 28, { s: 14, a: 'center', c: '#4d4235' }); return; }
                const meta = WEAPON_DATA[id]; if (!meta) return;
                const prog = guest ? clampN(MP.cdp[i] === undefined ? 1 : MP.cdp[i], 0, 1) : slotProg(id, k, g.cooldowns, g.charges, g.ally, g.isHoseRecharging, cdBase);
                const ready = prog >= 0.995;
                const held = (id === 'HOSE' || id === 'SHIELD') && keys[['KeyO', 'KeyP', 'KeyL'][i]];
                box(x, Y, 44, 44, { bd: ready ? meta.color : '#5a4c3a', fill: 'rgba(24,19,14,.92)' });
                ctx.fillStyle = meta.color; ctx.globalAlpha = 0.14; ctx.fillRect(x + 2, y0(Y), 40, 40); ctx.globalAlpha = 1;
                icon(emoName(meta.icon), x + 8, Y + 9, 28);
                sweep(x + 2, Y + 2, 40, 40, 1 - prog);
                if (id === 'HOSE' || meta.hold) {   // hold-to-use weapon: a big charge bar with the percentage, red while it recharges
                    const rec = !guest && (id === 'HOSE' ? g.isHoseRecharging : g.charges[id + 'R']);
                    ctx.fillStyle = '#0a0908'; ctx.fillRect(x + 2, Y + 31, 40, 11);
                    ctx.fillStyle = rec ? (g.tick % 20 < 10 ? '#ff4d3a' : '#a82a20') : (prog < 0.25 ? '#ffb02e' : meta.color); ctx.fillRect(x + 3, Y + 32, Math.round(38 * prog), 9);
                    txt(rec ? 'WAIT' : Math.round(prog * 100) + '%', x + 22, Y + 40, { s: 9, b: 1, a: 'center', c: '#fff', sh: true });
                } else { ctx.fillStyle = '#0a0908'; ctx.fillRect(x + 2, Y + 38, 40, 5); ctx.fillStyle = meta.color; ctx.fillRect(x + 3, Y + 39, Math.round(38 * prog), 3); }
                if (ready || held) { ctx.strokeStyle = '#fff'; ctx.globalAlpha = held ? 0.9 : 0.12 + 0.12 * Math.sin(g.tick * 0.14); ctx.lineWidth = 2; ctx.strokeRect(x + 1, Y + 1, 42, 42); ctx.globalAlpha = 1; }
                ctx.fillStyle = '#0a0908'; ctx.fillRect(x, Y, 13, 13); txt((window.KEYMAP ? KEYMAP.label('w' + i, true) : k), x + 6.5, Y + 10.5, { s: 11, b: 1, a: 'center', c: GOLD, sh: false });
                if (id === 'SUMMON' && !guest && g.ally.rechargeWaves > 0) txt('zzz', x + 22, Y + 25, { s: 11, a: 'center', c: DIM });
            });
        };
        const y0 = (Y) => Y + 2;

        const drawChips = (Y) => {
            const guest = MP.role === 'guest'; let x = 14; const step = 40;
            // ability (G)
            const ab = guest ? null : ABILITY_DATA[currentUserData.equippedAbility];
            if (ab) {
                const act = g.activeAbilityID === currentUserData.equippedAbility && g.abilityTimeLeft > 0 && ab.duration, cdw = g.abilityWaveCooldown;
                chip(x, Y, { icon: emoName(ab.icon), key: (window.KEYMAP ? KEYMAP.label('ability', true) : 'G'), color: GOLD, active: !!act, ready: cdw <= 0, cd: act ? 0 : clampN(cdw / 20, 0, 1), frac: act ? g.abilityTimeLeft / ab.duration : undefined, label: !act && cdw > 0 ? String(cdw) : '', lc: '#ff9a8a', glow: true });
                x += step;
            }
            // overdrive (H)
            const boId = currentUserData.equippedBoost;
            if (boId && BOOST_DATA[boId]) {
                const bm = BOOST_DATA[boId], bo = guest ? (MP.bo ? { id: MP.bo[0], t: MP.bo[1] } : null) : g.hb.bo, bu = guest ? MP.bu : g.hb.bu;
                chip(x, Y, { icon: emoName(bm.icon), key: (window.KEYMAP ? KEYMAP.label('boost', true) : 'H'), color: '#4be37a', active: !!bo, ready: bo || bu > 0, frac: bo ? bo.t / bm.dur : undefined, label: bo ? Math.ceil(bo.t / 60) + 's' : (bu + '/' + BOOST_USES), lc: bo ? '#4be37a' : (bu > 0 ? GOLD : DIM), glow: true });
                x += step;
            }
            // parry (SPACE) + clutch (SHIFT)
            if (hasSpoon(currentUserData)) {
                const pcd = guest ? MP.pc : g.parry.cd;
                chip(x, Y, { icon: 'spoon', key: (window.KEYMAP ? KEYMAP.label('parry', true) : 'SPC'), color: '#f0d890', ready: !(pcd > 0), active: !guest && g.parry.t > 0, cd: pcd > 0 ? clampN(pcd / S.parryMax, 0, 1) : 0, glow: true });
                x += step;
                const cl = g.clutchWave !== g.wave;
                chip(x, Y, { icon: 'heart', key: (window.KEYMAP ? KEYMAP.label('clutch', true) : 'SHF'), color: '#ff7a6a', ready: cl, glow: true, label: cl ? '' : 'x' });
                x += step;
            }
            // gear (E)
            if (g.gearQ.length) {
                const sd = SUPPLY_DATA[g.gearQ[0]];
                chip(x, Y, { icon: emoName(sd.icon), key: (window.KEYMAP ? KEYMAP.label('gear', true) : 'E'), color: '#7fd0e8', ready: true, glow: true, label: g.gearQ.length > 1 ? 'x' + g.gearQ.length : '' });
                x += step;
            }
            return x > 14;
        };

        const drawCombo = (y) => {
            const n = g.combo.n; if (n < 3) return y;
            const hot = n >= 30, warm = n >= 10, X = 12, W = 188, H = 42;
            const pulse = 1 + (g.combo.t > 135 ? 0.12 : 0);
            // flames behind the panel when the streak gets going
            if (warm) {
                const cnt = hot ? 9 : 5;
                for (let i = 0; i < cnt; i++) {
                    const fx = X + 14 + i * ((W - 28) / (cnt - 1)), ph = g.tick * 0.22 + i * 1.7, fh = (hot ? 20 : 12) + Math.sin(ph) * 6 + (i % 2) * 4;
                    ctx.fillStyle = hot ? '#ff4a1a' : '#e0843a'; ctx.beginPath(); ctx.moveTo(fx - 6, y); ctx.quadraticCurveTo(fx - 3 + Math.sin(ph * 1.3) * 3, y - fh * 0.6, fx + Math.sin(ph) * 3, y - fh); ctx.quadraticCurveTo(fx + 3, y - fh * 0.5, fx + 6, y); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.moveTo(fx - 3, y); ctx.quadraticCurveTo(fx, y - fh * 0.7, fx + Math.sin(ph) * 2, y - fh * 0.62); ctx.quadraticCurveTo(fx + 1, y - fh * 0.3, fx + 3, y); ctx.closePath(); ctx.fill();
                }
            }
            box(X, y, W, H, { bd: hot ? '#ff6a2a' : (warm ? '#e0843a' : LINE) });
            ctx.save(); ctx.translate(X + 38, y + 24); ctx.scale(pulse, pulse);
            txt('x' + n, 0, 8, { s: 24, f: 'sp', a: 'center', c: hot ? '#ff8a3a' : GOLD }); ctx.restore();
            txt('COMBO', X + 82, y + 17, { s: 12, b: 1, c: INK });
            txt('cash x' + comboMul().toFixed(2), X + 82, y + 31, { s: 11, c: GOLD });
            ctx.fillStyle = '#0a0908'; ctx.fillRect(X + 4, y + H - 6, W - 8, 4);
            ctx.fillStyle = g.combo.t < 40 ? BLOOD : (hot ? '#ff8a3a' : GOLD); ctx.fillRect(X + 5, y + H - 5, (W - 10) * clampN(g.combo.t / 150, 0, 1), 2);
            return y + H + 10;
        };

        const drawObjective = (y) => {
            const o = g.obj; if (!o) return y;
            const st = o.done ? 'DONE' : (o.fail ? 'FAILED' : (o.goal > 1 ? `${Math.min(o.prog, o.goal)}/${o.goal}` : '')), c = o.done ? OLIVE : (o.fail ? BLOOD : INK);
            ctx.font = `12px ${F_CP}`; const tw = Math.min(210, ctx.measureText(o.text).width + 60);
            const W = Math.max(190, tw + 40), H = o.goal > 1 && !o.done && !o.fail ? 36 : 26;
            box(12, y, W, H, { bd: o.done ? OLIVE : (o.fail ? BLOOD : '#6b5d49') });
            icon('target', 18, y + 5, 16);
            txt(o.text, 38, y + 17, { s: 12, c });
            if (st) txt(st, 12 + W - 6, y + 17, { s: 11, b: 1, a: 'right', c: o.done ? OLIVE : (o.fail ? BLOOD : GOLD) });
            if (H > 30) { ctx.fillStyle = '#0a0908'; ctx.fillRect(18, y + 26, W - 12, 4); ctx.fillStyle = GOLD; ctx.fillRect(19, y + 27, (W - 14) * clampN(o.prog / o.goal, 0, 1), 2); }
            return y + H + 10;
        };

        const drawBuffs = (y) => {
            const list = [];
            [['speed', 'bolt', '#f4e04d'], ['rage', 'flame', '#ff7a3a'], ['guard', 'shield', STEEL]].forEach(([k, ic, c]) => { if (g.buffs[k] > 0) list.push({ ic, c, frac: g.buffs[k] / (g.buffs[k] > 600 ? 900 : 600), t: Math.ceil(g.buffs[k] / 60) + 's' }); });
            if (g.revive) list.push({ ic: 'heart', c: '#ff7a6a', frac: 1, t: 'WIND' });
            if (g.freezeT > 0) list.push({ ic: 'ice', c: '#7fd0e8', frac: clampN(g.freezeT / 300, 0, 1), t: Math.ceil(g.freezeT / 60) + 's' });
            if (!list.length) return y;
            list.forEach((b, i) => {
                const x = 14 + i * 44;
                box(x, y, 40, 40, { bd: b.c });
                icon(b.ic, x + 9, y + 5, 22);
                ring(x + 20, y + 20, 18, b.frac, b.c, 2);
                txt(b.t, x + 20, y + 36, { s: 10, b: 1, a: 'center', c: INK });
            });
            return y + 50;
        };

        const drawPerks = () => {
            const ids = Object.keys(g.pk || {}).filter((id) => g.pk[id] > 0 && UPGRADES[id]); if (!ids.length) return;
            const per = 7, sz = 26, gap = 4;
            ids.forEach((id, i) => {
                const u = UPGRADES[id], col = Math.floor(i / per), row = i % per;
                const rows = Math.min(per, ids.length - col * per);
                const x = 788 - (col + 1) * (sz + gap) + gap, y = 92 + row * (sz + 9);
                const c = cssColor(u.color);
                ctx.fillStyle = '#0a0908'; ctx.fillRect(x - 2, y - 2, sz + 4, sz + 4);
                ctx.fillStyle = 'rgba(26,21,16,.92)'; ctx.fillRect(x, y, sz, sz); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, sz - 2, sz - 2);
                icon(u.icon, x + 3, y + 3, sz - 6);
                const lv = g.pk[id];
                if (u.max <= 6) { for (let k = 0; k < u.max; k++) { ctx.fillStyle = k < lv ? c : '#2d2720'; ctx.fillRect(x + 1 + k * Math.floor((sz - 2) / u.max), y + sz + 1, Math.floor((sz - 2) / u.max) - 1, 3); } }
                else txt(String(lv), x + sz - 1, y + sz + 7, { s: 10, b: 1, a: 'right', c: c });
                void rows;
            });
        };

        const drawTopCenter = () => {
            const bossWave = g.wave % 10 === 0, alive = g.zombies.filter((z) => !z.dead).length;
            const CX = 456, W = 200, X = CX - W / 2, Y = 10, H = 40;
            box(X, Y, W, H, { bd: bossWave ? BLOOD : '#6b5d49', fill: bossWave ? 'rgba(48,14,10,.88)' : undefined });
            txt('WAVE ' + g.wave, CX, Y + 20, { s: 20, f: 'sp', a: 'center', c: bossWave ? '#ff6a4a' : GOLD });
            const tm = mmss((g.tick - (S.snap ? S.snap.tick : 0)) / 60);
            icon('clock', X + 12, Y + 24, 12); txt(tm, X + 27, Y + 34, { s: 11, b: 1, c: INK });
            icon('zombie', X + W - 70, Y + 23, 13); txt(alive + ' left', X + W - 54, Y + 34, { s: 11, b: 1, c: alive <= 3 && alive > 0 ? '#ff9a6a' : INK });
            const hudTxt = [g.dif && g.dif !== 'normal' ? DF().name : '', Math.max(0, g.hl - DF().ai) > 0 ? 'horde ' + Math.max(0, g.hl - DF().ai) : ''].filter(Boolean).join(' / ');
            if (hudTxt) txt(hudTxt, CX, Y + H + 14, { s: 11, b: 1, a: 'center', c: '#d8685a' });
            const bz = g.zombies.find((z) => z.boss && !z.dead);
            if (bz) {
                const bw = 300, bx = CX - bw / 2, by = Y + H + 22, bh = 18, ph = bz.ph || 1, f = clampN(bz.hp / bz.max, 0, 1);
                box(bx - 10, by - 18, bw + 20, bh + 34, { bd: BLOOD, fill: 'rgba(22,8,6,.9)' });
                icon('skull', bx - 4, by - 15, 16);
                txt((bz.label || 'BOSS').toUpperCase(), bx + 16, by - 3, { s: 14, f: 'sp', c: '#ffcfa0' });
                txt('PHASE ' + ph + '/3', bx + bw, by - 3, { s: 11, b: 1, a: 'right', c: ph >= 3 ? '#ff6a4a' : (ph === 2 ? '#e0843a' : DIM) });
                ctx.fillStyle = '#0a0908'; ctx.fillRect(bx - 2, by - 1, bw + 4, bh + 2);
                ctx.fillStyle = '#3a1410'; ctx.fillRect(bx, by, bw, bh);
                S.bossTrail = S.bossTrail === undefined || S.bossId !== bz.id ? f : S.bossTrail; S.bossId = bz.id;
                S.bossTrail = f >= S.bossTrail ? f : S.bossTrail + (f - S.bossTrail) * 0.04;
                ctx.fillStyle = '#e8dec6'; ctx.globalAlpha = 0.6; ctx.fillRect(bx, by, bw * S.bossTrail, bh); ctx.globalAlpha = 1;
                const bc = ph >= 3 ? '#ff3b2a' : (ph === 2 ? '#e0843a' : '#b8392d');
                ctx.fillStyle = bc; ctx.fillRect(bx, by, bw * f, bh); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(bx, by, bw * f, 4);
                ctx.fillStyle = '#0a0908'; [0.34, 0.67].forEach((q) => ctx.fillRect(Math.round(bx + bw * q) - 1, by - 3, 3, bh + 6));
                txt(Math.ceil(f * 100) + '%', bx + bw / 2, by + 14, { s: 12, b: 1, a: 'center' });
            }
        };

        const drawBanner = () => {
            if (!g.banner) return;
            const b = g.banner, boss = g.zombies.some((z) => z.boss), by2 = boss ? 84 : 0, a = Math.min(1, b.life / 30), enter = clampN((b.maxLife || (b.maxLife = b.life)) - b.life, 0, 12) / 12;
            ctx.globalAlpha = a;
            const y = 118 + by2, w = 440 * (0.6 + 0.4 * enter);
            const gr = ctx.createLinearGradient(400 - w / 2, 0, 400 + w / 2, 0); gr.addColorStop(0, 'rgba(10,8,6,0)'); gr.addColorStop(0.2, 'rgba(10,8,6,.72)'); gr.addColorStop(0.8, 'rgba(10,8,6,.72)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
            ctx.fillStyle = gr; ctx.fillRect(400 - w / 2, y - 30, w, b.sub ? 62 : 44);
            txt(b.text, 400, y, { s: 30 + Math.round((1 - enter) * 8), f: 'sp', a: 'center', c: GOLD });
            if (b.sub) txt(b.sub, 400, y + 24, { s: 14, a: 'center', c: INK });
            ctx.globalAlpha = 1;
        };

        // ---------- the hook the main file calls ----------
        window.RUNUI_drawHud = () => {
            track();
            ctx.save();
            drawTopCenter();
            drawPlayerPanel();
            drawWeapons(124);
            let y = 178;
            if (drawChips(y)) y += 46;
            y += 4;
            y = drawCombo(y + 18) - 6;
            y = drawObjective(y);
            y = drawBuffs(y);
            drawPerks();
            drawBanner();
            ctx.restore();
            return true;
        };
        window.RUNUI_hud = true;

        // ================= UPGRADE SCREEN =================
        const RAR = (u) => (window.MPC && MPC.rar && MPC.rar(u)) || (u.max === 99 ? ['Utility', '#8aa04a'] : u.max === 1 ? ['Legendary', '#d9a441'] : u.max === 2 ? ['Epic', '#a58bc2'] : u.max === 3 ? ['Rare', '#7f9aa6'] : ['Uncommon', '#9aa87a']);   // [content] explicit rarity (incl. Cursed) comes from CONTENT.rar
        const rrCost = () => 2 + 2 * (g.rrN || 0);
        const refreshReroll = () => {
            const b = $('ru-reroll'); if (!b) return;
            const guest = MP.role === 'guest', c = rrCost();
            b.style.display = guest ? 'none' : '';
            b.disabled = g.scraps < c;
            b.innerHTML = `${iconImg('scrap', 'icn sm')} Reroll <b>${c}</b> <span class="ru-have">(${fmt(g.scraps)} scraps)</span>`;
        };
        const fillStats = () => {
            const s = S.snap || { kills: 0, earned: 0, tick: g.tick }, k = $('ru-kicker'); if (k) k.textContent = `Wave ${g.wave} survived`;
            const st = $('ru-stats'); if (!st) return;
            const hp = Math.round(clampN(g.player.hp / g.player.maxHp, 0, 1) * 100);
            const tile = (ic, v, l) => `<div class="ru-stat">${iconImg(ic, 'icn')}<b>${v}</b><span>${l}</span></div>`;
            st.innerHTML = tile('zombie', fmt(g.stats.kills - s.kills), 'kills') + tile('cash', '$' + fmt(Math.max(0, Math.floor(g.earned - s.earned))), 'earned') + tile('clock', mmss((g.tick - s.tick) / 60), 'time') + tile('heart', hp + '%', 'health');
            const o = g.obj, c = $('ru-contract');
            if (c) c.innerHTML = o ? `<div class="ru-panel ${o.done ? 'ok' : (o.fail ? 'bad' : '')}"><h3>${iconImg('target', 'icn sm')} Contract</h3><p>${esc(o.text)}</p><p class="ru-res">${o.done ? 'Completed' : (o.fail ? 'Failed' : 'In progress')}${o.goal > 1 ? ' &middot; ' + Math.min(o.prog, o.goal) + '/' + o.goal : ''}</p></div>` : '';
        };
        window.RUNUI_cards = () => {
            const box = $('upgrade-cards'); if (!box) return;
            fillStats(); refreshReroll();
            box.innerHTML = g.offer.map((id, i) => {
                const u = UPGRADES[id]; if (!u) return '';
                const lv = pkn(id), [rn, rc] = RAR(u), pips = u.max <= 8 ? Array.from({ length: u.max }, (_, k) => `<i class="${k < lv ? 'on' : (k === lv ? 'next' : '')}"></i>`).join('') : '';
                const tag = u.max === 99 ? '<span class="ru-tag use">USE NOW</span>' : (lv ? `<span class="ru-tag up">Lv ${lv} &rarr; ${lv + 1}</span>` : '<span class="ru-tag new">NEW</span>');
                return `<button class="card ru-card" style="--cc:${u.color};--rc:${rc};--d:${i * 110}ms" onclick="applyGameUpgrade('${id}')"><span class="ru-key">${i + 1}</span><div class="ru-rar">${rn}</div><div class="i ru-frame">${iconImg(u.icon, 'icn big')}</div><h3 style="color:${u.color}">${esc(u.name)}</h3>${tag}<div class="ru-pips">${pips}</div><p class="small dim">${u.desc}</p></button>`;
            }).join('');
        };
        window.RUNUI_reroll = () => {
            if (!g.paused || MP.role === 'guest') return;
            const c = rrCost(); if (g.scraps < c) return toast(`Need ${c} scraps to reroll. Bosses drop them.`);
            const ok = Object.keys(UPGRADES).filter((id) => { const u = UPGRADES[id]; return pkn(id) < u.max && (!u.ok || u.ok()); });
            const sh = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
            const cur = g.offer.slice(), fresh = sh(ok.filter((id) => !cur.includes(id))), rest = sh(ok.filter((id) => cur.includes(id)));
            const next = fresh.concat(rest).slice(0, 3);
            if (next.length < 3 && !next.includes('heal')) next.push('heal');
            if (!next.length) return;
            g.scraps -= c; g.rrN = (g.rrN || 0) + 1; g.offer = next;   // g.offer stays the source of truth for applyGameUpgrade
            RUNUI_cards();
        };
        window.RUNUI_trader = (box) => {
            const can0 = (t) => g.cash >= t.cost(g.wave) && !g.traderBought[t.id];
            box.innerHTML = `<div class="ru-panel trader"><h3>${iconImg('cash', 'icn sm')} Field trader <span class="ru-cash">$${fmt(Math.floor(g.cash))}</span></h3><div class="ru-trade">` + TRADER.map((t) => {
                const c = t.cost(g.wave), bought = !!g.traderBought[t.id], can = can0(t);
                return `<button class="ru-item ${bought ? 'bought' : (can ? '' : 'poor')}" onclick="buyTrader('${t.id}')"><span class="ru-ico">${iconImg(emoName(t.icon), 'icn')}</span><span class="ru-it"><b>${t.name}</b><small>${t.desc}</small></span><span class="ru-price">${bought ? 'SOLD' : '$' + fmt(c)}</span></button>`;
            }).join('') + '</div></div>';
        };
        // number keys pick a card while the screen is up
        window.addEventListener('keydown', (e) => {
            const ov = $('game-upgrade-overlay'); if (!ov || ov.classList.contains('hidden') || !g || !g.paused) return;
            const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
            if (n !== undefined && g.offer[n] && !e.repeat) applyGameUpgrade(g.offer[n]);
            else if (e.code === 'KeyR' && !e.repeat) RUNUI_reroll();
        });

        // ================= SKILL TREE =================
        const BR = [
            { name: 'Survival', sub: 'Stay on your feet', c: '#d8685a' },
            { name: 'Offense', sub: 'Hit harder, faster', c: '#e0843a' },
            { name: 'Fortune', sub: 'Loot and luck', c: '#d9a441' }
        ];
        let skSel = null;
        const depthOf = (id) => { const r = SKILLS[id].req; return r ? depthOf(r[0]) + 1 : 0; };
        const layout = () => {   // x (0..100 inside the branch column) and depth for every node
            const pos = {};
            BR.forEach((_, bi) => {
                const ids = Object.keys(SKILLS).filter((id) => SKILLS[id].branch === bi), byD = {};
                ids.forEach((id) => (byD[depthOf(id)] = byD[depthOf(id)] || []).push(id));
                Object.keys(byD).map(Number).sort((a, b) => a - b).forEach((d) => {
                    const row = byD[d];
                    row.forEach((id, k) => {
                        let x;
                        if (d === 0) x = 50 + (k - (row.length - 1) / 2) * 34;
                        else if (row.length === 1) x = pos[SKILLS[id].req[0]] ? pos[SKILLS[id].req[0]].x : 50;
                        else x = row.length === 2 ? (k ? 78 : 22) : 50 + (k - (row.length - 1) / 2) * 36;
                        pos[id] = { x, d, bi };
                    });
                });
            });
            return pos;
        };
        window.RUNUI_pick = (id) => { skSel = id; renderSkills(); };
        window.RUNUI_skills = () => {
            const u = currentUserData, body = $('skills-body'); if (!body) return;
            $('skills-scraps').innerText = fmt(u.scraps);
            body.className = 'sk-tree';
            const pos = layout(), ids = Object.keys(SKILLS), ROW = 104, TOP = 6, NS = 56;
            if (!skSel || !SKILLS[skSel]) skSel = ids.find((id) => skillOpen(id) && skillLvl(id) < SKILLS[id].max && u.scraps >= skillCost(id, skillLvl(id))) || ids[0];
            const maxD = Math.max(...ids.map(depthOf)), H = TOP + (maxD + 1) * ROW;
            const heads = BR.map((b, bi) => {
                const spent = ids.filter((id) => SKILLS[id].branch === bi).reduce((a, id) => a + skillLvl(id), 0), tot = ids.filter((id) => SKILLS[id].branch === bi).reduce((a, id) => a + SKILLS[id].max, 0);
                return `<div class="sk-head" style="--bc:${b.c}"><h3>${b.name}</h3><small>${b.sub}</small><div class="sk-bar"><i style="width:${spent / tot * 100}%"></i></div><small class="sk-pts">${spent}/${tot}</small></div>`;
            }).join('');
            let lines = '', nodes = '';
            const px = (id) => (pos[id].bi + pos[id].x / 100) / 3 * 300, py = (id) => TOP + pos[id].d * ROW + NS / 2;
            ids.forEach((id) => {
                const k = SKILLS[id], r = k.req; if (!r) return;
                const on = skillLvl(r[0]) >= r[1], x1 = px(r[0]), y1 = py(r[0]), x2 = px(id), y2 = py(id), ym = (y1 + y2) / 2;
                lines += `<path d="M${x1} ${y1} C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}" class="${on ? 'on' : ''} ${skillLvl(id) ? 'lit' : ''}" style="--bc:${BR[k.branch].c}" vector-effect="non-scaling-stroke"/>`;
            });
            ids.forEach((id) => {
                const k = SKILLS[id], l = skillLvl(id), open = skillOpen(id), maxed = l >= k.max, can = open && !maxed && u.scraps >= skillCost(id, l);
                const st = maxed ? 'maxed' : (!open ? 'locked' : (l > 0 ? 'owned' : 'open'));
                const pips = Array.from({ length: k.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
                nodes += `<div class="sk-slot" style="left:${(pos[id].bi + pos[id].x / 100) / 3 * 100}%;top:${TOP + pos[id].d * ROW}px;--bc:${BR[k.branch].c}"><button class="sk-node ${st} ${can ? 'can' : ''} ${skSel === id ? 'sel' : ''}" onclick="RUNUI_pick('${id}')" aria-label="${esc(k.name)}">${iconImg(emoName(k.icon), 'icn big')}${maxed ? '<span class="sk-badge max">MAX</span>' : (open ? `<span class="sk-badge cost ${can ? 'ok' : ''}">${skillCost(id, l)}</span>` : `<span class="sk-badge lock">${iconImg('lock', 'icn sm')}</span>`)}</button><div class="sk-pips">${pips}</div><div class="sk-name">${esc(k.name)}</div></div>`;
            });
            // detail panel
            const id = skSel, k = SKILLS[id], l = skillLvl(id), open = skillOpen(id), maxed = l >= k.max, cost = skillCost(id, l), bc = BR[k.branch].c;
            const pipsBig = Array.from({ length: k.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
            const btn = maxed ? '<button class="btn sk-buy" disabled>Maxed out</button>'
                : open ? `<button class="btn sk-buy ${u.scraps >= cost ? 'go' : ''}" onclick="buySkill('${id}')">Upgrade &middot; ${cost} ${iconImg('scrap', 'icn sm')}</button>`
                    : `<button class="btn sk-buy" disabled>Needs ${esc(SKILLS[k.req[0]].name)} Lv ${k.req[1]}</button>`;
            const detail = `<div class="sk-detail" style="--bc:${bc}"><div class="sk-dico">${iconImg(emoName(k.icon), 'icn big')}</div><div class="sk-dtxt"><div class="sk-dbr">${BR[k.branch].name}</div><h3>${esc(k.name)}</h3><p>${esc(k.desc)}</p><div class="sk-dmeta"><span class="sk-pips big">${pipsBig}</span><span>Lv ${l}/${k.max}</span>${maxed ? '' : `<span>Next: ${cost} ${iconImg('scrap', 'icn sm')}</span>`}${u.scraps < cost && open && !maxed ? '<span class="short">need ' + (cost - u.scraps) + ' more</span>' : ''}</div></div>${btn}</div>`;
            body.innerHTML = `<div class="sk-scroll"><div class="sk-heads">${heads}</div><div class="sk-canvas" style="height:${H}px"><svg viewBox="0 0 300 ${H}" preserveAspectRatio="none">${lines}</svg>${nodes}</div></div>${detail}`;
        };
    } catch (e) { console.error('[runui] init failed', e); window.RUNUI_hud = false; }
})();
