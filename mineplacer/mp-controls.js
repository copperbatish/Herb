/* mp-controls.js  [controls]  AIM (aim modes / auto-aim off-switch) + KEYMAP (rebindable keys) + the Settings "Controls" section.
   Public API (see bottom): window.AIM, window.KEYMAP.
   PvP: call AIM.force('mouse') while a PvP match runs and AIM.force(null) afterwards. AIM.point(p) / AIM.dir(p) give the raw aim for non-zombie targets. */
(function () {
    'use strict';
    try {
        const LS = 'mp_controls_v1';
        const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
        const $id = (i) => document.getElementById(i);
        const esc2 = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

        // =====================================================================================================================
        // KEYMAP: action -> physical key. The game keeps reading canonical codes (keys.KeyO ...): a capture-phase listener
        // rewrites event.code from the physical key to the action's canonical (default) code BEFORE any other handler sees it.
        // =====================================================================================================================
        const ACTIONS = [
            // id, label, default code, group
            ['up', 'Move up', 'KeyW', 'Movement'], ['left', 'Move left', 'KeyA', 'Movement'], ['down', 'Move down', 'KeyS', 'Movement'], ['right', 'Move right', 'KeyD', 'Movement'],
            ['w0', 'Weapon slot 1', 'KeyO', 'Weapons'], ['w1', 'Weapon slot 2', 'KeyP', 'Weapons'], ['w2', 'Weapon slot 3', 'KeyL', 'Weapons'],
            ['ability', 'Ability', 'KeyG', 'Abilities'], ['boost', 'Overdrive', 'KeyH', 'Abilities'], ['gear', 'Use gear', 'KeyE', 'Abilities'], ['parry', 'Parry (Big Spoon)', 'Space', 'Abilities'], ['clutch', 'Clutch / revive', 'ShiftLeft', 'Abilities'],
            ['aimUp', 'Aim up (twin-stick)', 'ArrowUp', 'Aiming'], ['aimDown', 'Aim down (twin-stick)', 'ArrowDown', 'Aiming'], ['aimLeft', 'Aim left (twin-stick)', 'ArrowLeft', 'Aiming'], ['aimRight', 'Aim right (twin-stick)', 'ArrowRight', 'Aiming'],
            ['aimLock', 'Cycle lock-on target', 'Tab', 'Aiming'], ['aimMode', 'Cycle aim mode', 'KeyT', 'Aiming'],
            ['ping', 'Ping (co-op)', 'KeyQ', 'Co-op'], ['em0', 'Emote: Help!', 'KeyZ', 'Co-op'], ['em1', 'Emote: Nice!', 'KeyX', 'Co-op'], ['em2', 'Emote: Danger!', 'KeyC', 'Co-op'], ['em3', 'Emote: On me!', 'KeyV', 'Co-op'],
            ['reroll', 'Reroll upgrades', 'KeyR', 'Other'], ['fullscreen', 'Fullscreen', 'KeyF', 'Other']
        ];
        const DEF = {}, LABELS = {}; ACTIONS.forEach(a => { DEF[a[0]] = a[2]; LABELS[a[0]] = a[1]; });
        const DEFCODES = new Set(Object.values(DEF));
        const PRESETS = {
            wasd: { name: 'WASD', desc: 'The default.', over: {} },
            arrows: { name: 'Arrows', desc: 'Move with the arrow keys. Twin-stick aim moves to WASD.', over: { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight', aimUp: 'KeyW', aimLeft: 'KeyA', aimDown: 'KeyS', aimRight: 'KeyD' } },
            esdf: { name: 'ESDF', desc: 'Move on ESDF (more room for the pinky). Gear goes to W.', over: { up: 'KeyE', left: 'KeyS', down: 'KeyD', right: 'KeyF', gear: 'KeyW', fullscreen: 'KeyB' } },
            lefty: { name: 'Left-handed', desc: 'Move on IJKL, weapons on A/S/D, ability F, overdrive G, gear W, aim with the arrows.', over: { up: 'KeyI', left: 'KeyJ', down: 'KeyK', right: 'KeyL', w0: 'KeyA', w1: 'KeyS', w2: 'KeyD', ability: 'KeyF', boost: 'KeyG', gear: 'KeyW', fullscreen: 'KeyB', aimMode: 'KeyY', ping: 'KeyU' } }
        };
        let bind = {};   // action -> physical code
        const resetAll = () => { bind = {}; ACTIONS.forEach(a => { bind[a[0]] = a[2]; }); };
        resetAll();
        let P2C = {}, BOUND = new Set();
        const rebuild = () => {
            P2C = {}; BOUND = new Set(Object.values(bind));
            for (const a in bind) if (bind[a] !== DEF[a]) P2C[bind[a]] = DEF[a];
        };
        rebuild();
        const toCanon = (code) => {
            if (P2C[code]) return P2C[code];
            if (code === 'ShiftRight') return (bind.clutch === 'ShiftLeft' || bind.clutch === 'ShiftRight') ? code : '~' + code;
            if (DEFCODES.has(code) && !BOUND.has(code)) return '~' + code;   // its job moved elsewhere: this physical key is now dead
            return code;
        };
        const prettyCode = (c) => {
            if (!c) return '?';
            if (/^Key[A-Z]$/.test(c)) return c.slice(3);
            if (/^Digit\d$/.test(c)) return c.slice(5);
            if (/^Numpad/.test(c)) return 'NUM' + c.slice(6).replace('Subtract', '-').replace('Add', '+').replace('Multiply', '*').replace('Divide', '/').replace('Decimal', '.').replace('Enter', 'Ent');
            return ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT', AltRight: 'R-ALT', Tab: 'TAB', Enter: 'ENTER', Backspace: 'BKSP', CapsLock: 'CAPS', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' })[c] || c;
        };
        const SHORT = { SPACE: 'SPC', SHIFT: 'SHF', 'R-SHIFT': 'RSH', ENTER: 'ENT', BKSP: 'BSP', CAPS: 'CAP', CTRL: 'CTL', 'R-CTRL': 'RCT', 'R-ALT': 'RAL' };
        const KEYMAP = {
            ACTIONS, DEF, PRESETS,
            code: (a) => bind[a] || DEF[a],
            label: (a, short) => { const l = prettyCode(bind[a] || DEF[a]); return short ? (SHORT[l] || l.slice(0, 3)) : l; },
            isDefault: (a) => bind[a] === DEF[a],
            canon: toCanon,
            onChange: [],
            // rebind one action; a key already used by another action SWAPS with it. returns the other action's id (or null)
            set(a, code) {
                if (!(a in DEF)) return null;
                const old = bind[a]; let other = null;
                for (const k in bind) if (k !== a && bind[k] === code) other = k;
                if (other) bind[other] = old;
                bind[a] = code; commit(); return other;
            },
            reset(a) { if (a) { const cur0 = bind[a]; const other = Object.keys(bind).find(k => k !== a && bind[k] === DEF[a]); if (other) bind[other] = cur0; bind[a] = DEF[a]; } else resetAll(); commit(); },
            preset(id) { const p = PRESETS[id]; if (!p) return; resetAll(); for (const a in p.over) bind[a] = p.over[a]; commit(); },
            all: () => Object.assign({}, bind),
            reserved: (code) => code === 'Escape' || /^Meta/.test(code) || code === 'ContextMenu' || /^F\d+$/.test(code) || code === 'CapsLock'
        };
        // sanity: no preset may bind one key twice
        Object.keys(PRESETS).forEach(id => { const m = Object.assign({}, DEF, PRESETS[id].over), seen = {}; for (const a in m) { if (seen[m[a]]) console.warn('[controls] preset', id, 'binds', m[a], 'twice:', a, seen[m[a]]); seen[m[a]] = a; } });

        // ---- persistence (localStorage only: keybinds are per-device, and the account doc has no schema room for them)
        let store = {};
        try { store = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { store = {}; }
        let AIMSET = { auto: true, mode: 'mouse', mouseFire: true, autoLock: true, padSide: 'right', padSize: 120, padY: 6, steer: 'med', prompted: false };
        let stamp = 0;   // time of the last settings change: the newest copy (this device or the account) wins
        const compact = () => { const k = {}; for (const a in bind) if (bind[a] !== DEF[a]) k[a] = bind[a]; return { t: stamp, a: Object.assign({}, AIMSET), k }; };
        const persist = (quiet) => { if (!quiet) stamp = Date.now(); try { localStorage.setItem(LS, JSON.stringify({ keys: bind, aim: AIMSET, t: stamp })); } catch (e) { /* private mode */ } if (!quiet) pushAccount(); };
        function commit() { rebuild(); persist(); relabelTouch(); KEYMAP.onChange.forEach(f => { try { f(); } catch (e) { } }); renderKeys(); }
        const applyKeys = (ks) => {   // only accept a valid, conflict-free map
            if (!ks || typeof ks !== 'object') return;
            const t = {}; ACTIONS.forEach(a => { t[a[0]] = a[2]; }); const used = new Set(); let ok = true;
            for (const a in ks) if (a in DEF && typeof ks[a] === 'string') t[a] = ks[a];
            for (const a in t) { if (used.has(t[a])) ok = false; used.add(t[a]); }
            if (ok) { bind = t; rebuild(); }
        };
        applyKeys(store.keys); stamp = +store.t || 0;

        const typing = (e) => { const tg = e.target; return !!(tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)); };
        let capAct = null;   // action currently waiting for a key
        const onKey = (e) => {
            try {
                if (capAct && e.type === 'keydown') {   // click-to-rebind capture
                    e.preventDefault(); e.stopImmediatePropagation();
                    if (e.repeat) return;
                    if (e.code === 'Escape') { capAct = null; renderKeys(); return; }
                    if (KEYMAP.reserved(e.code)) { keyNote(`${prettyCode(e.code)} can't be used.`, true); return; }
                    const a = capAct; capAct = null;
                    const other = KEYMAP.set(a, e.code);
                    keyNote(other ? `${LABELS[a]} is now ${prettyCode(e.code)}. Swapped: ${LABELS[other]} took ${prettyCode(bind[other])}.` : `${LABELS[a]} is now ${prettyCode(e.code)}.`);
                    return;
                }
                if (typing(e)) return;
                const ph = e.code, c = toCanon(ph);
                if (c !== ph) Object.defineProperty(e, 'code', { value: c, configurable: true });
                if (e.type === 'keydown' && typeof g !== 'undefined' && g.active) {
                    const m = AIM.mode();
                    if (/^Arrow/.test(ph) || (c === DEF.aimLock && m === 'lock')) e.preventDefault();
                    if (!e.repeat) {
                        if (c === DEF.aimLock && m === 'lock') AIM.cycle();
                        else if (c === DEF.aimMode) AIM.cycleMode();
                    }
                }
            } catch (x) { /* never break input */ }
        };
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);

        // =====================================================================================================================
        // AIM
        // =====================================================================================================================
        const MODES = {
            auto: { name: 'Auto aim', short: 'AUTO', desc: 'Weapons fire at the nearest zombie. The classic.', reward: 1 },
            mouse: { name: 'Mouse aim', short: 'MOUSE', desc: 'Weapons fire at your cursor. Left/right/middle click fire slots 1/2/3. Hold weapons follow the cursor.', reward: 1.25 },
            soft: { name: 'Soft assist', short: 'SOFT', desc: 'Cursor-led, but snaps to the zombie closest to your aim line (a forgiving cone). Good for trackpads.', reward: 1.15 },
            lock: { name: 'Lock-on', short: 'LOCK', desc: 'Click (or tap) a zombie, or press the lock key to cycle. Weapons track it until it dies or leaves range, then fall back to nearest.', reward: 1.10 },
            stick: { name: 'Twin-stick', short: 'STICK', desc: 'Aim with the arrow keys (remappable), or the extra stick on a phone. Weapons fire the way you point.', reward: 1.25 },
            forward: { name: 'Fire forward', short: 'FWD', desc: 'One-handed: weapons fire the way you are walking (or last walked).', reward: 1.25 },
            tap: { name: 'Tap to target', short: 'TAP', desc: 'Touch-only aiming: tap a zombie (big forgiving hit area) to lock it until it dies, or tap the ground to fire at that spot. Keys just fire.', reward: 1.10 },
            drag: { name: 'Drag aim', short: 'DRAG', desc: 'Touch and drag anywhere on the playfield to steer an aim line from your character. Let go and it keeps the last direction.', reward: 1.15 },
            pad: { name: 'Aim pad', short: 'PAD', desc: 'A thumb pad you can park in either bottom corner (size adjustable). Release keeps the last direction.', reward: 1.15 },
            flick: { name: 'Flick aim', short: 'FLICK', desc: 'Swipe across the playfield: you aim the way the swipe went, and keep that aim until the next flick.', reward: 1.15 },
            guided: { name: 'Guided shots', short: 'GUIDE', desc: 'The game picks the target; you bend the shots in flight with the cursor, the arrow keys, an aim stick or a finger drag.', reward: 1.08 }
        };
        const MANUAL = ['mouse', 'soft', 'lock', 'stick', 'forward', 'tap', 'drag', 'pad', 'flick', 'guided'];
        const FACE = new Set(['stick', 'forward', 'drag', 'pad', 'flick']);   // modes that aim along a remembered direction
        const applyAim = (o) => {
            if (!o || typeof o !== 'object') return;
            if (typeof o.auto === 'boolean') AIMSET.auto = o.auto; if (MANUAL.includes(o.mode)) AIMSET.mode = o.mode;
            ['mouseFire', 'autoLock', 'prompted'].forEach(k => { if (typeof o[k] === 'boolean') AIMSET[k] = o[k]; });
            if (o.padSide === 'left' || o.padSide === 'right') AIMSET.padSide = o.padSide;
            if (typeof o.padSize === 'number') AIMSET.padSize = clampN(Math.round(o.padSize), 80, 220);
            if (typeof o.padY === 'number') AIMSET.padY = clampN(Math.round(o.padY), 2, 40);
            if (['low', 'med', 'high'].includes(o.steer)) AIMSET.steer = o.steer;
        };
        applyAim(store.aim);
        let forcedMode = null;
        const dfNoAim = () => { try { const d = (typeof g !== 'undefined' && g.active) ? DF() : (typeof currentUserData !== 'undefined' && currentUserData && DIFFS[currentUserData.diff]); return !!(d && d.noAim); } catch (e) { return false; } };
        const cur = { x: 520, y: 300, seen: false };      // cursor / last tap, canvas coords
        const facing = { x: 1, y: 0 };                     // twin-stick + fire-forward direction
        let lockT = null;                                  // locked zombie
        let snapT = null;                                  // last zombie the aim snapped to (for the reticle)
        let busy = false;
        let steerInfo = null; const steered = [], seenB = new WeakSet(), mineB = new WeakSet(), budB = new WeakMap();
        const touchStick = { x: 0, y: 0, on: false };
        const IS_COARSE = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
        const live = (z) => !!z && !z.dead && !(z.emerge > 0) && typeof g !== 'undefined' && g.zombies.indexOf(z) >= 0;
        const rawNearest = (x, y) => { let best = null, bd = Infinity; for (const z of g.zombies) { if (z.dead || z.emerge > 0) continue; const d = (z.x - x) ** 2 + (z.y - y) ** 2; if (d < bd) { bd = d; best = z; } } return best; };
        const pseudo = (x, y) => ({ x: clampN(x, 2, 798), y: clampN(y, 2, 598), aim: true, hp: 1e9, max: 1e9, size: 10, dead: false, emerge: 0, boss: false, armor: 0, type: 'aim', id: -1, slow: 1, flash: 0 });
        const isPeer = (p) => !!(typeof g !== 'undefined' && g.peers && g.peers.some(pe => pe.pl === p));
        const updFacing = () => {
            const m = AIM.mode(); let dx = 0, dy = 0;
            if (m === 'stick' || m === 'pad') {
                dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0); dy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
                if (!dx && !dy && touchStick.on) { dx = touchStick.x; dy = touchStick.y; }
            } else if (m === 'forward') { dx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); dy = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0); }
            const l = Math.hypot(dx, dy); if (l > 0.2) { facing.x = dx / l; facing.y = dy / l; }
        };
        let aimPt = null;                                   // tap-to-target: last tapped ground point
        const ripples = [];                                 // tap feedback rings
        const wasFace = () => FACE.has(AIM.mode());

        const AIM = {
            MODES, MANUAL,
            mode() { if (forcedMode) return forcedMode; if (dfNoAim()) return (MANUAL.includes(AIMSET.mode) && AIMSET.mode !== 'guided') ? AIMSET.mode : 'mouse'; return AIMSET.auto ? 'auto' : AIMSET.mode; },
            force(m) { forcedMode = (m && m !== 'auto' && MODES[m]) ? m : null; relabelAim(); return AIM.mode(); },
            forced() { return forcedMode ? 'pvp' : (dfNoAim() ? 'difficulty' : null); },
            settings: () => Object.assign({}, AIMSET),
            setAuto(b) { AIMSET.auto = !!b; persist(); relabelAim(); },
            setMode(m) { if (forcedMode) return; if (m === 'auto') { if (!dfNoAim()) AIMSET.auto = true; } else if (MANUAL.includes(m)) { if (m === 'guided' && dfNoAim()) return; AIMSET.mode = m; if (!dfNoAim()) AIMSET.auto = false; } persist(); relabelAim(); },
            setMouseFire(b) { AIMSET.mouseFire = !!b; persist(); relabelAim(); },
            cycleMode() {
                if (AIM.forced()) { if (typeof toast === 'function') toast('Aim mode is fixed here.'); return; }
                const order = ['auto'].concat(MANUAL), i = order.indexOf(AIM.mode()), nx = order[(i + 1) % order.length];
                AIM.setMode(nx); if (typeof toast === 'function') toast('Aim: ' + MODES[nx].name);
            },
            // cash / boss-scrap multiplier for choosing manual aim (not when it is forced by the difficulty or a PvP match)
            reward() { if (forcedMode || dfNoAim()) return 1; return AIMSET.auto ? 1 : (MODES[AIMSET.mode].reward || 1); },
            dir(p) {
                const m = AIM.mode();
                if (FACE.has(m)) { updFacing(); return { x: facing.x, y: facing.y }; }
                if (m === 'tap') { const t0 = (lockT && live(lockT)) ? lockT : aimPt; if (t0) { const dx = t0.x - p.x, dy = t0.y - p.y, l = Math.hypot(dx, dy); if (l > 4) return { x: dx / l, y: dy / l }; } return { x: facing.x, y: facing.y }; }
                const dx = cur.x - p.x, dy = cur.y - p.y, l = Math.hypot(dx, dy);
                if (l > 4) return { x: dx / l, y: dy / l };
                return { x: facing.x, y: facing.y };
            },
            // raw aim point, for anything that is not a zombie target (PvP shots, etc.)
            point(p) {
                const m = AIM.mode(), d = AIM.dir(p);
                if (FACE.has(m)) return { x: p.x + d.x * 260, y: p.y + d.y * 260 };
                if (m === 'tap') { const t0 = (lockT && live(lockT)) ? lockT : aimPt; return t0 ? { x: t0.x, y: t0.y } : { x: p.x + d.x * 200, y: p.y + d.y * 200 }; }
                const l = Math.hypot(cur.x - p.x, cur.y - p.y);
                return l >= 48 ? { x: cur.x, y: cur.y } : { x: p.x + d.x * 48, y: p.y + d.y * 48 };
            },
            // THE API: a real zombie when one is under / near the aim line, else a pseudo-target {x,y,aim:true} along the aim.
            // fb = the auto-aim answer (a zombie or a function returning one). Party peers always get fb (they keep auto aim).
            target(p, fb) {
                const fbv = () => (typeof fb === 'function' ? fb() : fb);
                const m = AIM.mode();
                if (m === 'auto' || !p || typeof g === 'undefined' || isPeer(p)) return fbv();
                snapT = null;
                if (m === 'lock') {
                    if (lockT && (!live(lockT) || Math.hypot(lockT.x - p.x, lockT.y - p.y) > 620)) lockT = null;
                    if (lockT) { snapT = lockT; return lockT; }
                    const n = fbv(); snapT = n || null; return n || pseudo(p.x + facing.x * 200, p.y + facing.y * 200);
                }
                if (m === 'guided') { const n = fbv(); snapT = n || null; return n; }   // the game aims; AIM.tick() bends the shot afterwards
                if (m === 'tap') {
                    if (lockT && (!live(lockT) || Math.hypot(lockT.x - p.x, lockT.y - p.y) > 700)) { lockT = null; aimPt = null; }
                    if (lockT) { snapT = lockT; return lockT; }
                    if (aimPt) { let best = null, bd = 1e9; for (const z of g.zombies) { if (z.dead || z.emerge > 0) continue; const d = Math.hypot(z.x - aimPt.x, z.y - aimPt.y); if (d < z.size + 18 && d < bd) { bd = d; best = z; } } snapT = best; return best || pseudo(aimPt.x, aimPt.y); }
                    const n = fbv(); snapT = n || null; return n || pseudo(p.x + facing.x * 200, p.y + facing.y * 200);
                }
                if (FACE.has(m)) {
                    updFacing(); let best = null, bd = 520;
                    for (const z of g.zombies) {
                        if (z.dead || z.emerge > 0) continue;
                        const rx = z.x - p.x, ry = z.y - p.y, al = rx * facing.x + ry * facing.y; if (al < 0 || al > bd) continue;
                        const pr = Math.abs(rx * facing.y - ry * facing.x); if (pr < z.size + 12) { best = z; bd = al; }
                    }
                    snapT = best; return best || pseudo(p.x + facing.x * 260, p.y + facing.y * 260);
                }
                // mouse + soft: aim at the cursor
                const dir = AIM.dir(p), pt = AIM.point(p);
                let best = null;
                if (m === 'soft') {
                    let bs = Infinity;
                    for (const z of g.zombies) {
                        if (z.dead || z.emerge > 0) continue;
                        const rx = z.x - p.x, ry = z.y - p.y, dist = Math.hypot(rx, ry); if (dist > 560 || dist < 1) continue;
                        const al = rx * dir.x + ry * dir.y; if (al <= 0) continue;
                        const pr = Math.abs(rx * dir.y - ry * dir.x), ang = Math.atan2(pr, al);
                        const lim = Math.max(0.42, Math.atan2(z.size + 26, dist));   // ~24 degrees, wider up close
                        if (ang > lim && Math.hypot(z.x - pt.x, z.y - pt.y) > 70) continue;
                        const sc = pr + dist * 0.08; if (sc < bs) { bs = sc; best = z; }
                    }
                } else {
                    let bd = Infinity;
                    for (const z of g.zombies) { if (z.dead || z.emerge > 0) continue; const d = Math.hypot(z.x - pt.x, z.y - pt.y); if (d < z.size + 12 && d < bd) { bd = d; best = z; } }
                }
                snapT = best; return best || pseudo(pt.x, pt.y);
            },
            // called from the patched nearest() in the main file for the player's own origin; undefined = "use the normal nearest"
            hook(p) {
                if (busy || AIM.mode() === 'auto') return undefined;
                busy = true;
                try { return AIM.target(p, () => rawNearest(p.x, p.y)); } finally { busy = false; }
            },
            opt(k, v) { applyAim({ [k]: v }); persist(); relabelAim(); },
            // Guided shots: bend the player's own in-flight bullets toward the steer input, with a capped turn rate (called once per sim tick from the main loop)
            tick() {
                try {
                    steerInfo = null; steered.length = 0;
                    if (!running() || AIM.mode() !== 'guided') return;
                    const p = g.player, RATE = { low: 0.025, med: 0.035, high: 0.055 }[AIMSET.steer] || 0.035, BUD = { low: 0.5, med: 0.8, high: 1.2 }[AIMSET.steer] || 0.8;   // per-tick turn cap + total bend a shot may take
                    let kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), ky = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
                    if (!kx && !ky && touchStick.on) { kx = touchStick.x; ky = touchStick.y; }
                    if (kx || ky) { const l = Math.hypot(kx, ky); steerInfo = { key: true, ang: Math.atan2(ky / l, kx / l) }; }
                    else if (cur.seen && performance.now() - lastPtr < 2500) steerInfo = { key: false, x: cur.x, y: cur.y };
                    const now = gameNow();
                    for (const b of g.bullets) {
                        if (!seenB.has(b)) { seenB.add(b); if (!b.o && !b.saw && b.id !== 'HOSE' && Math.hypot(b.x - p.x, b.y - p.y) < 50) mineB.add(b); }
                        if (!mineB.has(b) || now - b.born > 1600) continue;
                        steered.push(b);
                        if (!steerInfo) continue;
                        let des;
                        if (steerInfo.key) des = steerInfo.ang; else { if (Math.hypot(steerInfo.x - b.x, steerInfo.y - b.y) < 22) continue; des = Math.atan2(steerInfo.y - b.y, steerInfo.x - b.x); }
                        const sp = Math.hypot(b.vx, b.vy) || 1; let d = des - Math.atan2(b.vy, b.vx); while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832;
                        const used = budB.get(b) || 0, turn = clampN(clampN(d, -RATE, RATE), -(BUD - used), BUD - used); if (!turn) continue; budB.set(b, used + Math.abs(turn)); const a = Math.atan2(b.vy, b.vx) + turn; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
                    }
                } catch (e) { /* never break the sim */ }
            },
            lock(z) { lockT = (z && live(z)) ? z : null; return lockT; },
            locked: () => ((lockT && live(lockT)) ? lockT : null),
            cycle() {
                if (typeof g === 'undefined' || !g.active) return null;
                const p = g.player, zs = g.zombies.filter(z => !z.dead && z.emerge <= 0 && z.x > 0 && z.x < 800).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
                if (!zs.length) { lockT = null; return null; }
                const i = lockT ? zs.indexOf(lockT) : -1; lockT = zs[(i + 1) % zs.length]; return lockT;
            },
            cursor: () => ({ x: cur.x, y: cur.y }),
            setCursor(x, y) { cur.x = clampN(x, 0, 800); cur.y = clampN(y, 0, 600); cur.seen = true; },
            // ------ drawing: reticle / aim line / lock bracket + a small mode tag
            draw(c) {
                try {
                    const m = AIM.mode(); if (typeof g === 'undefined' || !g.active || g.mini) return;
                    const cv = $id('gameCanvas'); const want = (m === 'mouse' || m === 'soft' || m === 'lock' || m === 'tap' || m === 'guided') && !IS_COARSE ? 'crosshair' : '';
                    if (cv && cv.style.cursor !== want) cv.style.cursor = want;
                    if (m === 'auto') return;
                    const p = g.player; if (!p) return; const t = g.tick || 0;
                    c.save(); c.lineCap = 'round';
                    if (m === 'mouse' || m === 'soft') {
                        const pt = AIM.point(p), d = AIM.dir(p);
                        c.strokeStyle = 'rgba(255,230,160,.22)'; c.lineWidth = 1.5; c.setLineDash([4, 7]); c.beginPath(); c.moveTo(p.x + d.x * 22, p.y + d.y * 22); c.lineTo(pt.x, pt.y); c.stroke(); c.setLineDash([]);
                        if (m === 'soft') { const a0 = Math.atan2(d.y, d.x), w = 0.42; c.fillStyle = 'rgba(255,230,160,.05)'; c.beginPath(); c.moveTo(p.x, p.y); c.arc(p.x, p.y, 300, a0 - w, a0 + w); c.closePath(); c.fill(); }
                        reticle(c, pt.x, pt.y, snapT ? '#ff6a4a' : '#ffe9a8', t);
                        if (snapT && live(snapT)) bracket(c, snapT, '#ff6a4a', t, false);
                    } else if (m === 'lock') {
                        const lz = lockT && live(lockT) ? lockT : null;
                        if (lz) { bracket(c, lz, '#ff4a3a', t, true); c.strokeStyle = 'rgba(255,74,58,.28)'; c.lineWidth = 1.5; c.setLineDash([4, 7]); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(lz.x, lz.y); c.stroke(); c.setLineDash([]); }
                        else if (snapT && live(snapT)) bracket(c, snapT, 'rgba(255,233,168,.6)', t, false);
                        if (cur.seen) reticle(c, cur.x, cur.y, '#ffe9a8', t, true);
                    } else if (m === 'tap') {
                        for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.t++; if (r.t > 26) { ripples.splice(i, 1); continue; } c.strokeStyle = r.hit ? 'rgba(255,106,74,' + (1 - r.t / 26) + ')' : 'rgba(255,233,168,' + (1 - r.t / 26) + ')'; c.lineWidth = 3; c.beginPath(); c.arc(r.x, r.y, 10 + r.t * 2.2, 0, 6.283); c.stroke(); }
                        const lz = lockT && live(lockT) ? lockT : null;
                        if (lz) { bracket(c, lz, '#ff4a3a', t, true); c.strokeStyle = 'rgba(255,74,58,.28)'; c.lineWidth = 1.5; c.setLineDash([4, 7]); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(lz.x, lz.y); c.stroke(); c.setLineDash([]); }
                        else if (aimPt) { reticle(c, aimPt.x, aimPt.y, '#ffe9a8', t); c.strokeStyle = 'rgba(255,230,160,.22)'; c.lineWidth = 1.5; c.setLineDash([4, 7]); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(aimPt.x, aimPt.y); c.stroke(); c.setLineDash([]); }
                        else if (snapT && live(snapT)) bracket(c, snapT, 'rgba(255,233,168,.6)', t, false);
                        if (g.tick % 3000 < 360 && !lz && !aimPt) { c.font = '13px "Courier Prime", monospace'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,233,168,.8)'; c.fillText('Tap a zombie to lock it, or tap the ground to aim there', 400, 560); }
                    } else if (m === 'guided') {
                        if (snapT && live(snapT)) bracket(c, snapT, 'rgba(255,233,168,.75)', t, false);
                        const col = '#6fd8ff';
                        if (steerInfo && !steerInfo.key) { reticle(c, steerInfo.x, steerInfo.y, col, t, true); for (const b of steered) { c.strokeStyle = 'rgba(111,216,255,.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(steerInfo.x, steerInfo.y); c.stroke(); } }
                        else if (steerInfo) { const ex = p.x + Math.cos(steerInfo.ang) * 70, ey = p.y + Math.sin(steerInfo.ang) * 70; c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); c.moveTo(p.x + Math.cos(steerInfo.ang) * 24, p.y + Math.sin(steerInfo.ang) * 24); c.lineTo(ex, ey); c.stroke(); c.beginPath(); c.moveTo(ex + Math.cos(steerInfo.ang + 2.5) * 10, ey + Math.sin(steerInfo.ang + 2.5) * 10); c.lineTo(ex, ey); c.lineTo(ex + Math.cos(steerInfo.ang - 2.5) * 10, ey + Math.sin(steerInfo.ang - 2.5) * 10); c.stroke(); }
                        for (const b of steered) { c.fillStyle = 'rgba(111,216,255,.7)'; c.beginPath(); c.arc(b.x, b.y, 3, 0, 6.283); c.fill(); }
                    } else {
                        updFacing(); const ex = p.x + facing.x * 120, ey = p.y + facing.y * 120, a = Math.atan2(facing.y, facing.x);
                        c.strokeStyle = 'rgba(255,230,160,.35)'; c.lineWidth = 2; c.setLineDash([5, 7]); c.beginPath(); c.moveTo(p.x + facing.x * 26, p.y + facing.y * 26); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]);
                        c.strokeStyle = snapT ? '#ff6a4a' : '#ffe9a8'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ex + Math.cos(a + 2.5) * 11, ey + Math.sin(a + 2.5) * 11); c.lineTo(ex, ey); c.lineTo(ex + Math.cos(a - 2.5) * 11, ey + Math.sin(a - 2.5) * 11); c.stroke();
                        if (snapT && live(snapT)) bracket(c, snapT, '#ff6a4a', t, false);
                    }
                    c.restore();
                    // mode tag, bottom right
                    c.save(); c.font = '11px "Courier Prime", monospace'; c.textAlign = 'right';
                    const rw = AIM.reward(), tag = 'AIM: ' + MODES[m].short + (forcedMode ? ' (fixed)' : (rw > 1 ? '  +' + Math.round((rw - 1) * 100) + '%' : ''));
                    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(tag, 793, 593); c.fillStyle = 'rgba(255,233,168,.8)'; c.fillText(tag, 792, 592); c.restore();
                } catch (e) { /* a reticle must never kill the frame */ }
            }
        };
        const reticle = (c, x, y, col, t, ring) => {
            const r = 11 + Math.sin(t * 0.2) * 1.2;
            c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.stroke();
            c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.stroke();
            c.beginPath(); [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([a, b]) => { c.moveTo(x + a * (r - 4), y + b * (r - 4)); c.lineTo(x + a * (r + 7), y + b * (r + 7)); }); c.stroke();
            if (!ring) { c.fillStyle = col; c.fillRect(x - 1, y - 1, 2, 2); }
        };
        const bracket = (c, z, col, t, pulse) => {
            const s = (z.size || 14) + 8 + (pulse ? Math.sin(t * 0.25) * 2 : 0), L = 7;
            c.strokeStyle = col; c.lineWidth = 2.5;
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { const x = z.x + sx * s, y = z.y + sy * s; c.beginPath(); c.moveTo(x - sx * L, y); c.lineTo(x, y); c.lineTo(x, y - sy * L); c.stroke(); });
        };

        // ---- pointer: cursor tracking, lock-on / tap picking, drag + flick aiming, mouse-button firing
        const canvasPt = (e) => { const c = $id('gameCanvas'); if (!c) return null; const r = c.getBoundingClientRect(); if (!r.width) return null; return { x: (e.clientX - r.left) / r.width * 800, y: (e.clientY - r.top) / r.height * 600, in: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom, sx: r.width / 800 }; };
        const running = () => typeof g !== 'undefined' && g.active;
        const DEV = { touch: false, kb: false, mouse: false };   // what this device has shown us (for the iPad-with-keyboard suggestion)
        let lastPtr = 0, drag = null;
        const faceFrom = (p, x, y) => { const dx = x - p.x, dy = y - p.y, l = Math.hypot(dx, dy); if (l > 6) { facing.x = dx / l; facing.y = dy / l; } };
        window.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'mouse') DEV.mouse = true;
            if (!running()) return; const q = canvasPt(e); if (!q) return;
            if (q.in || e.buttons) { AIM.setCursor(q.x, q.y); lastPtr = performance.now(); }
            if (drag && e.pointerId === drag.id) {
                const m = AIM.mode();
                if (m === 'drag') faceFrom(g.player, q.x, q.y);
                else if (m === 'flick') { const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; if (Math.hypot(dx, dy) > 28) { const l = Math.hypot(dx, dy); facing.x = dx / l; facing.y = dy / l; drag.moved = true; } }
            }
        }, { passive: true });
        const SLOT_BTN = { 0: 'w0', 2: 'w1', 1: 'w2' };
        const mHeld = {};
        const releaseMouse = () => { for (const b in mHeld) { keys[mHeld[b]] = false; delete mHeld[b]; } };
        const pickZ = (q, extra) => { let best = null, bd = Infinity; for (const z of g.zombies) { if (z.dead || z.emerge > 0) continue; const d = Math.hypot(z.x - q.x, z.y - q.y); if (d < z.size + extra && d < bd) { bd = d; best = z; } } return best; };
        const onCanvasDown = (e) => {
            if (e.pointerType === 'touch') DEV.touch = true;
            if (!running()) return; const q = canvasPt(e); if (!q) return;
            AIM.setCursor(q.x, q.y); lastPtr = performance.now(); const m = AIM.mode();
            if (m === 'lock') {   // pick the zombie nearest the click/tap
                const best = pickZ(q, 28);
                if (best) lockT = best; else if (e.pointerType === 'mouse' && e.button === 2) lockT = null;
                return;
            }
            if (m === 'tap') {   // big forgiving hit area; empty ground = fire at that spot
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                const best = pickZ(q, 46);
                ripples.push({ x: best ? best.x : q.x, y: best ? best.y : q.y, t: 0, hit: !!best });
                if (best) { aimPt = { x: best.x, y: best.y }; lockT = AIMSET.autoLock ? best : null; }
                else { aimPt = { x: q.x, y: q.y }; lockT = null; }
                return;
            }
            if ((m === 'drag' || m === 'flick') && (e.pointerType !== 'mouse' || e.button === 0)) {
                drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false };
                if (m === 'drag') faceFrom(g.player, q.x, q.y);
                return;
            }
            if (e.pointerType === 'mouse' && (m === 'mouse' || m === 'soft') && AIMSET.mouseFire && !forcedMode) {
                const a = SLOT_BTN[e.button]; if (!a) return; const k = DEF[a]; keys[k] = true; mHeld[e.button] = k; e.preventDefault();
            }
        };
        const cvEl = $id('gameCanvas');
        if (cvEl) {
            cvEl.style.touchAction = 'none';
            cvEl.addEventListener('pointerdown', onCanvasDown);
            cvEl.addEventListener('contextmenu', (e) => { const m = AIM.mode(); if (running() && (m === 'mouse' || m === 'soft' || m === 'lock')) e.preventDefault(); });
        }
        const onUp = (e) => {
            if (e.pointerType === 'mouse' && mHeld[e.button]) { keys[mHeld[e.button]] = false; delete mHeld[e.button]; }
            if (drag && e.pointerId === drag.id) {
                if (AIM.mode() === 'flick' && !drag.moved && running()) { const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, l = Math.hypot(dx, dy); if (l > 14) { facing.x = dx / l; facing.y = dy / l; } }
                drag = null;
            }
        };
        window.addEventListener('pointerup', onUp, true); window.addEventListener('pointercancel', () => { drag = null; }, true);
        window.addEventListener('blur', () => { releaseMouse(); drag = null; });
        window.addEventListener('keydown', (e) => { if (e.isTrusted && e.key && e.key !== 'Unidentified') DEV.kb = true; }, true);

        // ---- phone: extra aim stick (twin-stick mode only)
        (function () {
            const tu = $id('touch-ui'); if (!tu) return;
            const st = document.createElement('style');
            st.textContent = '#aim-joy{display:none;position:absolute;left:28%;bottom:6%;width:22%;aspect-ratio:1;max-width:130px;border-radius:50%;background:rgba(255,200,120,.08);border:2px solid rgba(255,200,120,.35);pointer-events:auto;touch-action:none}#aim-joy i{position:absolute;left:50%;top:50%;width:42%;height:42%;margin:-21% 0 0 -21%;border-radius:50%;background:rgba(255,200,120,.4)}#aim-joy small{position:absolute;left:0;right:0;top:-16px;text-align:center;font-size:10px;color:rgba(255,230,160,.8)}body.aim-stick #aim-joy{display:block}';
            document.head.appendChild(st);
            const base = document.createElement('div'); base.id = 'aim-joy'; base.innerHTML = '<small>AIM</small><i></i>'; const layer = document.createElement('div'); layer.id = 'aim-layer'; layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:31'; layer.appendChild(base); tu.parentNode.appendChild(layer);   // own layer: the touch buttons hide while a keyboard is in use, the aim pad must not
            const knob = base.querySelector('i'); let id = null;
            const mv = (e) => { const r = base.getBoundingClientRect(), R = r.width / 2; let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } knob.style.transform = `translate(${dx * R * 0.6}px,${dy * R * 0.6}px)`; touchStick.x = dx; touchStick.y = dy; touchStick.on = l > 0.25; };
            const end = () => { id = null; knob.style.transform = ''; touchStick.on = false; touchStick.x = touchStick.y = 0; };
            base.addEventListener('pointerdown', (e) => { id = e.pointerId; base.setPointerCapture(e.pointerId); mv(e); e.preventDefault(); });
            base.addEventListener('pointermove', (e) => { if (e.pointerId === id) mv(e); });
            base.addEventListener('pointerup', (e) => { if (e.pointerId === id) end(); }); base.addEventListener('pointercancel', end);
        })();
        function syncPad() {
            const m = AIM.mode(), on = m === 'stick' || m === 'pad'; document.body.classList.toggle('aim-stick', on);
            const el = $id('aim-joy'); if (!el) return;
            if (m === 'pad') {
                const sz = AIMSET.padSize; Object.assign(el.style, { width: sz + 'px', height: sz + 'px', maxWidth: 'none', aspectRatio: 'auto', bottom: AIMSET.padY + '%', left: AIMSET.padSide === 'left' ? '3%' : 'auto', right: AIMSET.padSide === 'right' ? '3%' : 'auto' });
            } else if (el.getAttribute('style')) el.removeAttribute('style');
        }
        function relabelAim() { try { syncPad(); renderAim(); renderDiffAim(); } catch (e) { } }
        setInterval(() => { try { syncPad(); if (!running()) { lockT = null; releaseMouse(); const cv = $id('gameCanvas'); if (cv && cv.style.cursor) cv.style.cursor = ''; } } catch (e) { } }, 500);

        // ---- touch buttons: show the real key labels (only matters with a keyboard + touch screen, but cheap)
        function relabelTouch() {
            try {
                const set = (id, a) => { const b = $id(id); if (!b) return; const sp = b.querySelector('span'); if (sp && /^[A-Z0-9↑↓←→]{1,6}$/.test(sp.textContent)) sp.textContent = KEYMAP.label(a, true); };
                set('tb-G', 'ability'); set('tb-H', 'boost'); set('tb-E', 'gear');
                [['O', 'w0'], ['P', 'w1'], ['L', 'w2']].forEach(([k, a]) => { const b = $id('tb-' + k), s = b && b.querySelector('small'); if (s) s.textContent = KEYMAP.label(a, true); });
            } catch (e) { }
        }
        setInterval(relabelTouch, 2000);

        // =====================================================================================================================
        // UI: Settings > Controls (aim + keybinds), and the aim picker on the difficulty screen
        // =====================================================================================================================
        const css = document.createElement('style');
        css.textContent = `
        #ctl-sec .ctl-tabs{display:flex;gap:6px;margin:6px 0 10px}
        #ctl-sec .ctl-tabs button.on{background:var(--mustard,#d9a441);color:#17130f}
        #ctl-sec .aim-opt{display:flex;gap:10px;align-items:flex-start;padding:7px 8px;margin:4px 0;border:2px solid var(--line,#4d4235);border-radius:var(--r-sm,6px);cursor:pointer;background:rgba(0,0,0,.18)}
        #ctl-sec .aim-opt.on{border-color:var(--mustard,#d9a441);background:rgba(217,164,65,.12)}
        #ctl-sec .aim-opt.dis{opacity:.45;pointer-events:none}
        #ctl-sec .aim-opt b{display:block;font-size:14px}
        #ctl-sec .aim-opt span.rw{margin-left:auto;white-space:nowrap;font-size:12px;color:var(--olive,#8aa04a)}
        #ctl-sec .kb-grid{display:grid;grid-template-columns:1fr auto auto;gap:5px 8px;align-items:center}
        #ctl-sec .kb-grp{grid-column:1/-1;margin-top:8px;font-size:12px;letter-spacing:1px;color:var(--dim,#9a8e7a);text-transform:uppercase}
        #ctl-sec .kb-key{min-width:78px;text-align:center;padding:5px 8px;font:inherit;font-weight:700;background:#17130f;color:var(--ink,#e8dec6);border:2px solid var(--line,#4d4235);border-radius:var(--r-sm,6px);cursor:pointer}
        #ctl-sec .kb-key.cap{border-color:var(--mustard,#d9a441);color:var(--mustard,#d9a441);animation:kbblink .8s infinite}
        #ctl-sec .kb-key.chg{border-color:var(--olive,#8aa04a)}
        #ctl-sec .kb-rs{padding:3px 8px;min-width:30px;width:auto;visibility:hidden}
        #ctl-sec .kb-rs.show{visibility:visible}
        @keyframes kbblink{50%{opacity:.55}}
        #aim-diff .aim-pick{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
        @media (max-width:560px){#ctl-sec .kb-key{min-width:64px}#ctl-sec .aim-opt{flex-wrap:wrap}#ctl-sec .aim-opt span.rw{margin-left:0}}`;
        document.head.appendChild(css);

        let tab = 'aim';
        const rewardTxt = (m) => { const r = MODES[m].reward; return r > 1 ? '+' + Math.round((r - 1) * 100) + '% cash & boss scraps' : 'no bonus'; };
        function aimNote() {
            const f = AIM.forced();
            if (f === 'difficulty') return `<p class="small" style="color:var(--blood,#b8392d)">This difficulty forces manual aim (${esc2(MODES[AIM.mode()].name)}). Its x3 cash already covers it, so no extra bonus.</p>`;
            if (f === 'pvp') return '<p class="small" style="color:var(--blood,#b8392d)">Aim is fixed to the mouse in this mode.</p>';
            return AIMSET.auto ? '<p class="small dim">Turn auto aim off to aim yourself. Manual aim pays a bonus on cash and boss scraps; Undodgeable forces it.</p>' : `<p class="small" style="color:var(--olive,#8aa04a)">Manual aim bonus active: ${rewardTxt(AIMSET.mode)}.</p>`;
        }
        function aimHTML() {
            const f = AIM.forced(), eff = AIM.mode(), auto = AIMSET.auto && !f;
            let h = `<label class="small" style="display:flex;gap:8px;align-items:center;cursor:pointer;margin:4px 0"><input type="checkbox" ${auto ? 'checked' : ''} ${f ? 'disabled' : ''} style="width:auto" onchange="AIM.setAuto(this.checked)"> <b>Auto aim</b> (weapons fire at the nearest zombie)</label>`;
            h += aimNote();
            h += `<div>` + MANUAL.map(m => `<div class="aim-opt ${eff === m && !auto ? 'on' : ''} ${f === 'pvp' ? 'dis' : ''}" onclick="AIM.setMode('${m}')"><div><b>${esc2(MODES[m].name)}</b><span class="small dim">${esc2(MODES[m].desc)}</span></div><span class="rw">${rewardTxt(m)}</span></div>`).join('') + `</div>`;
            h += `<label class="small" style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-top:6px"><input type="checkbox" ${AIMSET.mouseFire ? 'checked' : ''} style="width:auto" onchange="AIM.setMouseFire(this.checked)"> Mouse buttons fire the weapon slots in Mouse and Soft aim (left, right, middle)</label>`;
            const sel = (k, opts) => `<select onchange="AIM.opt('${k}', this.value)" style="padding:4px;background:#17130f;color:var(--ink,#e8dec6);border:2px solid var(--line,#4d4235);border-radius:var(--r-sm,6px);font:inherit">` + opts.map(([v, l]) => `<option value="${v}" ${AIMSET[k] === v ? 'selected' : ''}>${l}</option>`).join('') + '</select>';
            const rng = (k, lo, hi) => `<input type="range" min="${lo}" max="${hi}" value="${AIMSET[k]}" style="width:140px;padding:0" onchange="AIM.opt('${k}', +this.value)"> <span class="dim">${AIMSET[k]}</span>`;
            h += `<div class="small" style="margin-top:10px;display:grid;gap:6px"><b>Touch and steering options</b>
                <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" ${AIMSET.autoLock ? 'checked' : ''} style="width:auto" onchange="AIM.opt('autoLock', this.checked)"> Tap to target: keep a tapped zombie locked until it dies</label>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">Aim pad corner ${sel('padSide', [['left', 'Left'], ['right', 'Right']])} size ${rng('padSize', 80, 220)}</div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">Aim pad height ${rng('padY', 2, 40)}</div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">Guided shots steering ${sel('steer', [['low', 'Gentle'], ['med', 'Normal'], ['high', 'Strong']])}</div></div>`;
            return h;
        }
        function renderAim() { const b = $id('ctl-aim'); if (b) b.innerHTML = aimHTML(); }
        function renderDiffAim() {
            const wrap = $id('aim-diff'); if (!wrap) return;
            const eff = AIM.mode(), f = AIM.forced(), auto = AIMSET.auto && !f;
            wrap.innerHTML = `<p class="small dim" style="margin-bottom:4px">Aiming${auto ? '' : (f ? ' · forced manual by this difficulty' : ' · manual bonus ' + rewardTxt(AIMSET.mode))}</p><div class="aim-pick">` +
                ['auto'].concat(MANUAL).map(k => `<button class="btn btn-sm ${(k === 'auto' ? auto : (eff === k && !auto)) ? 'btn-primary' : ''}" style="width:auto" ${f && (k === 'auto' || f === 'pvp') ? 'disabled' : ''} title="${esc2(MODES[k].desc)}" onclick="AIM.setMode('${k}')">${esc2(MODES[k].name)}</button>`).join('') + '</div>';
        }
        let kbNoteTimer = null;
        function keyNote(msg, bad) { const n = $id('kb-note'); if (!n) return; n.style.color = bad ? 'var(--blood,#b8392d)' : 'var(--olive,#8aa04a)'; n.textContent = msg; clearTimeout(kbNoteTimer); kbNoteTimer = setTimeout(() => { n.textContent = ''; }, 4500); }
        function renderKeys() {
            const b = $id('ctl-keys'); if (!b) return;
            const note = $id('kb-note') ? $id('kb-note').textContent : '';
            let h = `<div class="adm-row" style="flex-wrap:wrap;gap:6px;align-items:center"><span class="small dim">Presets:</span>` + Object.keys(PRESETS).map(id => `<button class="btn btn-sm" style="width:auto" title="${esc2(PRESETS[id].desc)}" onclick="KEYMAP.preset('${id}')">${esc2(PRESETS[id].name)}</button>`).join('') + `<button class="btn btn-sm btn-danger" style="width:auto" onclick="KEYMAP.reset()">Reset all</button></div>`;
            h += `<p class="small" id="kb-note" style="min-height:16px;margin:4px 0"></p><div class="kb-grid">`;
            let grp = '';
            ACTIONS.forEach(([a, lab, , gp]) => {
                if (gp !== grp) { grp = gp; h += `<div class="kb-grp">${gp}</div>`; }
                const cap = capAct === a, chg = !KEYMAP.isDefault(a);
                h += `<div class="small">${esc2(lab)}</div><button class="kb-key ${cap ? 'cap' : ''} ${chg ? 'chg' : ''}" data-act="${a}" onclick="KEYMAP.capture('${a}')">${cap ? 'Press a key...' : esc2(prettyCode(bind[a]))}</button><button class="btn btn-sm kb-rs ${chg ? 'show' : ''}" title="Reset to ${esc2(prettyCode(DEF[a]))}" onclick="KEYMAP.reset('${a}')">↺</button>`;
            });
            h += `</div><p class="small dim" style="margin-top:8px">Click a key, then press the new one (Esc cancels). A key already in use swaps with the other action. Saved on this device.</p>`;
            b.innerHTML = h; if (note) keyNote(note);
        }
        KEYMAP.capture = (a) => { capAct = (capAct === a) ? null : a; renderKeys(); };
        function setTab(t) { tab = t; capAct = null; const a = $id('ctl-aim'), k = $id('ctl-keys'); if (a) a.style.display = t === 'aim' ? '' : 'none'; if (k) k.style.display = t === 'keys' ? '' : 'none'; document.querySelectorAll('#ctl-sec .ctl-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); if (t === 'aim') renderAim(); else renderKeys(); }
        window.CTL_tab = setTab;
        (function inject() {
            const modal = $id('settings-modal'); if (!modal) return;
            const panel = modal.querySelector('.panel'), out = $id('st-out'); if (!panel || !out) return;
            const sec = document.createElement('div'); sec.className = 'sec'; sec.id = 'ctl-sec';
            sec.innerHTML = `<h3>Controls <span id="ctl-saved" class="small" style="float:right;font-weight:400;color:var(--olive,#8aa04a);transition:opacity .6s;opacity:0"></span></h3><div class="ctl-tabs"><button class="btn btn-sm on" style="width:auto" data-t="aim" onclick="CTL_tab('aim')">Aiming</button><button class="btn btn-sm" style="width:auto" data-t="keys" onclick="CTL_tab('keys')">Keybinds</button></div><div id="ctl-aim"></div><div id="ctl-keys" style="display:none"></div>`;
            panel.insertBefore(sec, out);
            const oo = window.openSettings; window.openSettings = function () { const r = oo.apply(this, arguments); setTab(tab); return r; };
            const oc = window.closeSettings; window.closeSettings = function () { capAct = null; return oc.apply(this, arguments); };
        })();
        (function wrapMutator() {   // aim picker on the difficulty screen
            const om = window.openMutator; if (typeof om !== 'function') return;
            window.openMutator = function () {
                const r = om.apply(this, arguments);
                try {
                    let w = $id('aim-diff');
                    if (!w) { const dp = $id('diff-pick'); if (!dp) return r; w = document.createElement('div'); w.id = 'aim-diff'; w.style.cssText = 'margin:-2px 0 14px;text-align:center'; dp.insertAdjacentElement('afterend', w); }
                    renderDiffAim();
                } catch (e) { }
                return r;
            };
        })();

        // ---- "saved" indicator + account sync (localStorage is the fast path, users/<name>.controls follows the account; newest stamp wins)
        let savedT = null;
        function setIndicator(msg) { const e = $id('ctl-saved'); if (!e) return; e.textContent = msg; e.style.opacity = 1; clearTimeout(savedT); savedT = setTimeout(() => { e.style.opacity = 0; }, 2600); }
        let pushT = null;
        function pushAccount() {
            setIndicator('Saved ✓'); clearTimeout(pushT);
            pushT = setTimeout(async () => {
                try {
                    const u = typeof currentUserData !== 'undefined' ? currentUserData : null; if (!u || !u.username || typeof selfRef !== 'function') return;
                    const c = compact(); u.controls = c; await selfRef().update({ controls: c }); setIndicator('Saved to your account ✓');
                } catch (e) { setIndicator('Saved on this device ✓'); }
            }, 1200);
        }
        let syncedUser = null;
        setInterval(() => {
            try {
                const u = typeof currentUserData !== 'undefined' ? currentUserData : null; if (!u || !u.username) { syncedUser = null; return; }
                if (syncedUser === u.username) return; syncedUser = u.username;
                const c = u.controls, ct = c ? +c.t || 0 : 0;
                if (c && ct > stamp) { applyAim(c.a); applyKeys(c.k); stamp = ct; persist(true); rebuild(); relabelTouch(); relabelAim(); renderKeys(); }
                else if (stamp > ct) pushAccount();
            } catch (e) { }
        }, 1000);

        // ---- device class: touch screen + physical keyboard + no hover pointer (iPad in a keyboard case): suggest Tap to target once
        (function () {
            const ask = () => {
                try {
                    if (AIMSET.prompted || !running() || !AIMSET.auto || AIM.forced() || $id('aim-suggest')) return;
                    if (!(IS_COARSE && DEV.kb && !DEV.mouse && !(window.matchMedia && matchMedia('(any-hover: hover)').matches))) return;
                    const d = document.createElement('div'); d.id = 'aim-suggest';
                    d.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:200;max-width:92vw;padding:10px 12px;background:#17130f;border:2px solid var(--mustard,#d9a441);border-radius:8px;color:#e8dec6;font:14px "Courier Prime",monospace;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center';
                    d.innerHTML = '<span>Looks like you are on an iPad with a keyboard: try Tap to target?</span><button class="btn btn-sm btn-primary" style="width:auto" id="as-y">Try it</button><button class="btn btn-sm" style="width:auto" id="as-n">No thanks</button>';
                    document.body.appendChild(d);
                    const done = (yes) => { if (yes) AIM.setMode('tap'); AIMSET.prompted = true; persist(); d.remove(); };
                    $id('as-y').onclick = () => done(true); $id('as-n').onclick = () => done(false);
                } catch (e) { }
            };
            AIM.suggest = ask; setInterval(ask, 1500);
        })();

        window.KEYMAP = KEYMAP; window.AIM = AIM;
        relabelAim(); relabelTouch();
    } catch (err) { console.error('[controls] failed to start', err); }
})();
