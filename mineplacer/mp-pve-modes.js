/* mp-pve-modes.js: PVE game modes (Boss Rush, Defend the Core, Blitz, Iron Survivor, Gauntlet, Infection, Last Light, Daily Challenge).
   Registered in the shared mode picker (mp-modes-core.js). Everything reuses the wave engine: zombies, weapons, perks, party co-op.
   Host (or solo) owns the rules (R). The host also builds a tiny "view model" (VM: hud rows, world items, lights) each tick; it rides on the
   normal party snapshot as snap.md so guests draw the same HUD/world with zero mode-specific guest code.
   Hooks in Mineplacer2.html are tagged [pve]: PVE_tgt (pickTarget), PVE_noClear (wave-clear check), PVE_drawWorld (draw), PVE_zAlpha (drawZombie). */
(function () {
  try {
    if (!window.MODES || !window.MODES.register) return;
    const $ = (id) => document.getElementById(id);
    const rnd = Math.random, rr = (a, b) => a + rnd() * (b - a), cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const FSP = '"Special Elite", monospace', FCP = '"Courier Prime", monospace';
    const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const dateKey = () => new Date().toISOString().slice(0, 10);
    const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const shuffle = (a, r = rnd) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    let R = null;          // host/solo run state (rules)
    let VM = null;         // view model: host builds it, guests receive it in snap.md
    let ME_INF = false;    // guest: am I infected right now
    let SEL = 'tur';       // local build selection (Defend the Core)
    let MOUSE = null;      // local mouse position on the canvas
    window.MODECFG = null;

    const UD = () => (typeof currentUserData !== 'undefined' ? currentUserData : null);
    const MYNAME = () => (typeof myName === 'function' ? myName() : 'You');
    const isGuest = () => MP.role === 'guest';
    const myId = () => (isGuest() ? MP.uid : 'host');
    const live = () => g.zombies.filter((z) => !z.dead);
    const liveN = () => { let n = 0; for (const z of g.zombies) if (!z.dead) n++; return n; };
    const plist = () => [{ id: 'host', p: g.player, down: g.downT > 0, name: MYNAME(), pe: null }, ...g.peers.map((pe) => ({ id: pe.id, p: pe.pl, down: pe.down > 0 || !!pe.cl, name: pe.name, pe }))];
    const alivePl = () => plist().filter((q) => !q.down);
    const nearestPl = (x, y, list) => { let b = null, bd = 1e12; for (const q of (list || alivePl())) { const d = (q.p.x - x) ** 2 + (q.p.y - y) ** 2; if (d < bd) { bd = d; b = q; } } return b ? { q: b, d: Math.sqrt(bd) } : null; };
    const spawnZ = (type, x, y, extra) => { spawnZombie(type || pickType(), x, y, extra); return g.zombies[g.zombies.length - 1]; };
    const secs = () => (g.tick - R.t0) / 60;

    // ------------------------------------------------------------------ wave plumbing (copies of what spawnWave does, minus the weekly-board submit)
    const newWave = (n) => {
      g.wave = n;
      g.peers.forEach((pe) => {
        if (pe.down > 0 && !(R && R.dead && R.dead[pe.id]) && !(R && R.inf && R.inf[pe.id])) { pe.down = 0; pe.pl.hp = pe.pl.maxHp * 0.5; }
        if (pe.hb) pe.hb.bu = BOOST_USES;
        if (pe.ally) { const a = pe.ally; if (a.active) { a.wavesLeft--; if (a.wavesLeft <= 0) { a.active = false; a.rechargeWaves = 1; } } else if (a.rechargeWaves > 0) a.rechargeWaves--; }
      });
      g.hb.bu = BOOST_USES; g.hz = g.hz.filter((h) => h.k === 'f' && h.t > 60);
      if (g.downT > 0 && !(R && R.dead && R.dead.host) && !(R && R.inf && R.inf.host)) { g.downT = 0; g.invuln = 60; g.player.hp = g.player.maxHp * 0.5; }
      if (g.abilityWaveCooldown > 0) g.abilityWaveCooldown--;
      updateAbilityHUD();
      if (g.ally.active) { g.ally.wavesLeft--; if (g.ally.wavesLeft <= 0) { g.ally.active = false; g.ally.rechargeWaves = 1; } } else if (g.ally.rechargeWaves > 0) g.ally.rechargeWaves--;
      g.mod = null;
    };
    const afterSpawn = () => { spawnBarrels(); g.combo.n = 0; g.combo.t = 0; g.rt = undefined; g.mt = undefined; rollContract(); if (window.PARTY_wave) PARTY_wave(); };
    const stdWave = (n, o = {}) => {
      newWave(n);
      const bossWave = n % 10 === 0;
      if (bossWave) g.banner = { text: bossFor(n).label, sub: 'Boss wave. Bring friends. Or mines.', life: 220 };
      else if (o.mods !== false && n >= 3 && rnd() < 0.65) { const ks = Object.keys(MODS); g.mod = MODS[ks[Math.floor(rnd() * ks.length)]]; g.banner = { text: g.mod.label, sub: g.mod.sub, life: 200 }; }
      else g.banner = { text: o.title || `Wave ${n}`, sub: o.sub || '', life: 100 };
      let count = Math.max(3, Math.round((10 + n * 5) * (g.hs || 1) * (o.count || 1)));
      if (g.mod) count = Math.max(4, Math.round(count * g.mod.count));
      if (bossWave) spawnZombie();
      for (let i = 0; i < count; i++) spawnZombie(pickType());
      afterSpawn();
    };

    // ------------------------------------------------------------------ MODES
    const M = {};

    // ---- 1. BOSS RUSH
    M.bossrush = {
      name: 'Boss Rush', icon: '💪', players: '1-4', total: 9,
      desc: 'Nine bosses back to back (three loops, each tougher). Pick a perk between fights. Beat them all, as fast as you can.',
      init() { R.k = 0; R.beaten = 0; R.addT = 600; R.bt0 = 0; R.times = []; },
      wave() {
        R.k++; const n = R.k; newWave(n * 10);
        g.banner = { text: bossFor(n * 10).label, sub: `Boss ${n} of ${this.total}${n > 6 ? ' · loop 3' : (n > 3 ? ' · loop 2' : '')}`, life: 220 };
        spawnZombie(); const b = g.zombies[g.zombies.length - 1]; if (b && b.boss) { b.hp = b.max = Math.round(b.max * 0.7); }
        for (let i = 0; i < 2 + Math.floor(n / 2); i++) spawnZ(rnd() < 0.5 ? 'speedy' : 'standard');
        R.bt0 = g.tick; R.addT = 700; afterSpawn(); g.obj = null;
        return true;
      },
      noClear() { return R.k >= this.total; },
      tick() {
        if (--R.addT <= 0) { R.addT = 780 - Math.min(300, R.k * 30); if (g.zombies.some((z) => z.boss && !z.dead)) { let n = 0; for (const z of g.zombies) if (!z.dead && !z.boss) n++; if (n < 6) for (let i = 0; i < 2 + Math.floor(R.k / 3); i++) spawnZ(rnd() < 0.6 ? 'speedy' : pickType()); } }
        if (R.k >= this.total && R.beaten >= this.total && !R.pend) R.pend = { win: true, msg: 'Every boss is dead.' };
      },
      kill(z) {
        if (!z.boss) return;
        R.beaten++; R.times.push((g.tick - R.bt0) / 60);
        for (const q of g.zombies) if (!q.dead && !q.boss) { q.noDrop = true; award(q); }   // the adds fall with their boss
        g.banner = { text: 'Boss down!', sub: R.beaten >= this.total ? 'That was the last one.' : 'Pick a perk. The next one is already coming.', life: 160 };
      },
      view() { return { h: [['t', 'BOSS RUSH', '#d9a441'], ['b', `Boss ${Math.min(R.k, this.total)}/${this.total}`, R.beaten / this.total, '#b8392d', `${R.beaten} down`], ['t', `time ${mmss(secs())}`, '#9a8e7a']], sc: R.beaten }; },
      finish(win) { const t = secs(); return { score: R.beaten, t: win ? Math.round(t) : 0, text: `${R.beaten}/${this.total} bosses${win ? ' in ' + mmss(t) : ''}`, cashMul: 1.5, scraps: R.beaten * 6 + (win ? 40 : 0) }; }
    };

    // ---- 2. DEFEND THE CORE
    const CORE_COST = { tur: 200, wall: 60, mine: 40, rep: 150 };
    M.core = {
      name: 'Defend the Core', icon: '📡', players: '1-4',
      desc: 'Hold the core. Between waves spend salvage on turrets, sandbag walls, mines and repairs. Zombies go for the core. Build is shared in co-op.',
      init() { R.core = { x: 400, y: 300, hp: 3000, max: 3000, vx: 0, vy: 0 }; R.items = []; R.res = 450; R.phase = 'build'; R.bt = 0; R.cleared = 0; R.go = false; R.n = 0; R.seenKills = 0; },
      wave() {
        if (R.n > 0 && !R.fresh) { R.cleared = R.n; R.core.hp = Math.min(R.core.max, R.core.hp + R.core.max * 0.08); }
        R.fresh = false; R.res += 120 + 25 * (R.n + 1);
        R.phase = 'build'; R.bt = R.n === 0 ? 1800 : 1200;
        g.banner = { text: 'BUILD PHASE', sub: 'Click to place · 1-4 pick · ENTER starts the wave', life: 200 };
        return true;
      },
      noClear() { return R.phase === 'build'; },
      target(z) {
        const n = nearestPl(z.x, z.y); if (n && n.d < 105) return null;
        let b = null, bd = 72;
        for (const s of R.items) { if (s.hp <= 0) continue; const d = Math.hypot(s.x - z.x, s.y - z.y); if (d < bd) { bd = d; b = s; } }
        return b || R.core;
      },
      tick() {
        const C = R.core;
        if (R.phase === 'build') { if (--R.bt <= 0 || R.startNow) { R.startNow = false; R.phase = 'go'; R.n++; stdWave(R.n, { count: 0.9 }); } }
        for (let i = R.items.length - 1; i >= 0; i--) { const s = R.items[i]; if (s.hp <= 0) { g.vfx.push({ x: s.x, y: s.y, r: 0, max: 50, a: 1 }); burst(s.x, s.y, '#8a6d3b', 10, 3); R.items.splice(i, 1); } }
        for (const s of R.items) {
          if (s.k !== 'tur') continue;
          if (s.cd > 0) s.cd--; if (s.fire > 0) s.fire--;
          let best = null, bd = 235 * 235;
          for (const z of g.zombies) { if (z.dead || z.emerge > 0) continue; const d = (z.x - s.x) ** 2 + (z.y - s.y) ** 2; if (d < bd) { bd = d; best = z; } }
          if (best) { s.ang = Math.atan2(best.y - s.y, best.x - s.x); if (s.cd <= 0) { s.cd = 20; s.fire = 5; s.tx = Math.round(best.x); s.ty = Math.round(best.y); g.src = ''; hurt(best, 15 + g.wave * 2.2); } }
        }
        if (C.hp <= 0 && !R.pend) R.pend = { win: false, msg: 'The core fell on wave ' + R.n + '.' };
      },
      kill(z) { R.res += z.boss ? 60 : 3; },
      view() {
        const C = R.core, w = [['core', C.x, C.y, Math.max(0, Math.round(C.hp)), C.max]];
        for (const s of R.items) w.push([s.k, s.x, s.y, Math.round(s.hp), s.max, +(s.ang || 0).toFixed(2), s.fire > 0 ? 1 : 0, s.tx || 0, s.ty || 0]);
        const h = [['t', 'DEFEND THE CORE', '#d9a441'], ['b', 'Core', C.hp / C.max, '#6fe0c8', String(Math.max(0, Math.round(C.hp)))],
          ['t', R.phase === 'build' ? `BUILD ${Math.ceil(R.bt / 60)}s  ·  next: wave ${R.n + 1}` : `Wave ${R.n}  ·  ${liveN()} left`, R.phase === 'build' ? '#6fe0c8' : '#e8dec6'], ['t', `Salvage ${Math.floor(R.res)}`, '#d9a441']];
        return { h, w, sc: R.n, res: Math.floor(R.res), ph: R.phase, pal: [['tur', 'Turret', CORE_COST.tur], ['wall', 'Sandbags', CORE_COST.wall], ['mine', 'Mine', CORE_COST.mine], ['rep', 'Repair', CORE_COST.rep]] };
      },
      finish(win) { const w = Math.max(0, R.n - (R.phase === 'go' ? 1 : 0)); return { score: w, text: `held ${w} wave${w === 1 ? '' : 's'}`, cashMul: 1.25, scraps: Math.floor(w / 2) }; }
    };
    const coreSnap = (v) => Math.round((v - 20) / 40) * 40 + 20;
    const placeOK = (k, x, y) => {
      if (x < 30 || x > 770 || y < 30 || y > 570) return 'Out of bounds';
      if (Math.hypot(x - R.core.x, y - R.core.y) < 58) return 'Too close to the core';
      if (R.items.some((s) => Math.hypot(s.x - x, s.y - y) < 34)) return 'Spot taken';
      if (k === 'tur' && R.items.filter((s) => s.k === 'tur').length >= 12) return 'Turret limit (12)';
      if (k === 'wall' && R.items.filter((s) => s.k === 'wall').length >= 26) return 'Wall limit (26)';
      if (k === 'mine' && g.traps.length >= 24) return 'Mine limit (24)';
      return '';
    };
    const buildAt = (k, x, y) => {   // host side, validated. returns '' on success or an error string
      if (!R || R.id !== 'core' || !CORE_COST[k]) return 'No';
      if (R.res < CORE_COST[k]) return 'Not enough salvage';
      if (k === 'rep') { if (R.core.hp >= R.core.max) return 'The core is fine'; R.core.hp = Math.min(R.core.max, R.core.hp + R.core.max * 0.3); R.res -= CORE_COST.rep; popSync(R.core.x, R.core.y - 40, 'REPAIRED'); return ''; }
      x = coreSnap(+x || 0); y = coreSnap(+y || 0); const e = placeOK(k, x, y); if (e) return e;
      R.res -= CORE_COST[k];
      if (k === 'mine') placeMine(x, y, 'MINES'); else R.items.push({ k, x, y, hp: k === 'tur' ? 220 : 320, max: k === 'tur' ? 220 : 320, cd: 10, fire: 0, ang: 0, vx: 0, vy: 0 });
      burst(x, y, '#d9a441', 6, 2); return '';
    };

    // ---- 3. BLITZ
    const BLITZ_VAL = { standard: 10, speedy: 14, heavy: 30, spitter: 20, bomber: 18, charger: 28, splitter: 22, splitling: 4, phantom: 20, leaper: 22, howler: 24 };
    M.blitz = {
      name: 'Blitz', icon: '⏱', players: '1-4',
      desc: 'Three-minute score attack. Huge swarms, a combo multiplier that climbs with every kill, and clocks that add time. Solo or co-op.',
      init() { R.dur = 10800; R.left = R.dur; R.score = 0; R.lvl = 1; R.pk = []; R.pkT = 240; R.fz = 0; R.bestMult = 1; g.wave = 4; g.banner = { text: 'BLITZ', sub: 'Kill fast. Chain kills. Grab the clocks.', life: 160 }; },
      wave() { newWave(g.wave = 4); g.banner = { text: 'BLITZ', sub: 'Kill fast. Chain kills. Grab the clocks.', life: 160 }; for (let i = 0; i < 14; i++) spawnZ(); afterSpawn(); g.obj = null; return true; },
      noClear() { return true; },
      mult() { return 1 + Math.min(9, Math.floor(g.combo.n / 5)) * 0.5; },
      tick() {
        R.left--; const sec = (R.dur - R.left) / 60; R.lvl = Math.min(12, 1 + Math.floor(sec / 15)); g.wave = 2 + R.lvl * 2;
        if (R.fz > 0) R.fz--;
        if (g.tick % 18 === 0) { const alive = liveN(), cap = Math.min(78, 20 + R.lvl * 5); if (alive < cap) { const n = Math.min(cap - alive, 1 + Math.floor(R.lvl / 2)); for (let i = 0; i < n; i++) spawnZ(); } }
        if (--R.pkT <= 0) { R.pkT = 520 + Math.floor(rnd() * 300); const r = rnd() * 100; R.pk.push({ x: rr(60, 740), y: rr(70, 540), kind: r < 55 ? 'time' : (r < 80 ? 'frenzy' : 'nuke'), life: 720 }); }
        for (let i = R.pk.length - 1; i >= 0; i--) {
          const k = R.pk[i]; if (--k.life <= 0) { R.pk.splice(i, 1); continue; }
          const n = nearestPl(k.x, k.y); if (!n || n.d > 28) continue;
          R.pk.splice(i, 1);
          if (k.kind === 'time') { R.left = Math.min(R.left + 300, 18000); R.score += 250; popSync(k.x, k.y - 20, '+5 SECONDS'); }
          else if (k.kind === 'frenzy') { R.fz = 480; popSync(k.x, k.y - 20, 'DOUBLE SCORE'); }
          else { popSync(k.x, k.y - 20, 'NUKE!'); g.shake = 14; g.vfx.push({ x: k.x, y: k.y, r: 0, max: 600, a: 1 }); for (const z of g.zombies) if (!z.dead && !z.boss) award(z); }
        }
        if (R.left <= 0 && !R.pend) R.pend = { win: true, msg: "Time's up!" };
      },
      kill(z) {
        const m = this.mult(); R.bestMult = Math.max(R.bestMult, m);
        R.score += (z.boss ? 500 : (BLITZ_VAL[z.type] || 12)) * m * (R.fz > 0 ? 2 : 1);
        if (rnd() < 0.02 && R.pk.length < 4) R.pk.push({ x: cl(z.x, 40, 760), y: cl(z.y, 40, 560), kind: 'time', life: 600 });
      },
      view() {
        return { h: [['t', 'BLITZ' + (R.fz > 0 ? '  ·  DOUBLE SCORE' : ''), R.fz > 0 ? '#ff7a3a' : '#d9a441'], ['b', mmss(R.left / 60), R.left / R.dur, R.left < 1800 ? '#b8392d' : '#d9a441', ''], ['t', `SCORE ${Math.floor(R.score).toLocaleString()}`, '#e8dec6', 20], ['t', `combo x${g.combo.n}  ·  multiplier x${this.mult().toFixed(1)}`, g.combo.n >= 15 ? '#ff7a3a' : '#9a8e7a']],
          w: R.pk.map((k) => ['pk', Math.round(k.x), Math.round(k.y), k.kind, k.life]), sc: Math.floor(R.score) };
      },
      finish(win) { const s = Math.floor(R.score); return { score: s, text: `${s.toLocaleString()} points, best multiplier x${R.bestMult.toFixed(1)}`, cash: Math.floor(s * 0.4), cashMul: 1, scraps: Math.floor(s / 2000) }; }
    };

    // ---- 4. IRON SURVIVOR (hardcore)
    M.hardcore = {
      name: 'Iron Survivor', icon: '☠', players: '1-4',
      descf() { const u = UD(), t = (u && u.modeTroph && u.modeTroph.hardcore) || 0; return 'One life, no second chances, almost no healing, and a horde that levels up every wave. Triple rewards.' + (t ? ` Iron skulls earned: ${t}.` : ''); },
      init() { R.dead = {}; R.base = g.hl || 0; R.n = 0; },
      wave() {
        R.n++; g.hl = R.base + Math.floor(R.n * 0.7);
        stdWave(R.n, { sub: 'One life. Make it count.', count: 1.1 });
        return true;
      },
      tick() {
        g.revive = false; g.clutchWave = g.wave; g.regen = 0;
        if (g.dying) { g.dying = null; }
        for (let i = g.pickups.length - 1; i >= 0; i--) { const k = g.pickups[i]; if (k.kind === 'HEAL' && !k.pvc) { if (rnd() < 0.85) g.pickups.splice(i, 1); else { k.pvc = 1; k.life = 900; } } }
        if (g.downT > 0 && !R.dead.host) { R.dead.host = 1; }
        for (const pe of g.peers) if ((pe.down > 0 || pe.cl) && !R.dead[pe.id]) { R.dead[pe.id] = 1; popSync(pe.pl.x, pe.pl.y - 30, 'FALLEN'); }
        if (R.dead.host) { g.downT = 99999; g.invuln = 99999; g.player.hp = 1; keys.KeyO = keys.KeyP = keys.KeyL = false; }
        for (const pe of g.peers) if (R.dead[pe.id]) { pe.down = 99999; pe.pl.hp = 1; pe.cl = null; }
      },
      view() { const dn = Object.keys(R.dead).length; return { h: [['t', 'IRON SURVIVOR', '#e0843a'], ['t', `Wave ${g.wave}  ·  rewards x3${dn ? '  ·  ' + dn + ' fallen' : ''}`, '#e8dec6']], sc: Math.max(0, g.wave - 1) }; },
      finish() { const w = Math.max(0, g.wave - 1); return { score: w, text: `${w} waves on one life${w >= 10 ? ' · iron skull earned' : ''}`, cashMul: 3, scraps: Math.max(0, (g.scraps - g.startScraps)) * 2 + Math.floor(w / 2), trophy: w >= 10 }; }
    };

    // ---- 5. GAUNTLET (mutations) + 8. DAILY CHALLENGE (same engine, fixed seeded mutators)
    const MUTS = {
      giants:   { name: 'Giants',      icon: '🥊', desc: 'Huge, slow, very tanky zombies.',                 pay: 2.0, apply(z) { if (z.boss) return; z.size *= 1.5; z.sc *= 1.5; z.hp = z.max = Math.round(z.max * 2); z.spd *= 0.8; } },
      swift:    { name: 'Double Time', icon: '⚡', desc: 'Everything moves 60% faster, but is fragile.',    pay: 1.5, apply(z) { z.spd *= 1.6; z.hp = z.max = Math.round(z.max * 0.75); } },
      ghosts:   { name: 'Ghosts',      icon: '👻', desc: 'Zombies are nearly invisible until they are close.', pay: 1.6, apply(z) { z.pvg = 1; } },
      volatile: { name: 'Volatile',    icon: '💥', desc: 'Corpses explode, hurting everyone nearby, you included.', pay: 1.3, kill(z) { const r = 70; explode(z.x, z.y, r, 30 + g.wave * 3); for (const q of alivePl()) if (Math.hypot(q.p.x - z.x, q.p.y - z.y) < r + 10) { if (q.pe) q.pe.pl.hp -= 10; else hitPlayer(10 + g.wave * 0.6); } } },
      friendly: { name: 'Friendly Fire', icon: '🧨', desc: 'Your mines hurt you too. You start with 8 free ones.', pay: 1.4, start() { for (let i = 0; i < 8; i++) placeMine(rr(60, 740), rr(60, 540), 'MINES'); }, tick() {
          const cur = g.traps.map((t) => t); const prev = R.trapPrev || []; for (const t of prev) if (!cur.includes(t)) for (const q of alivePl()) if (Math.hypot(q.p.x - t.x, q.p.y - t.y) < t.rad + 10) { if (q.pe) q.pe.pl.hp -= 25; else hitPlayer(25); }
          R.trapPrev = cur; } },
      dark:     { name: 'Blackout',    icon: '🔦', desc: 'You can barely see past your own light.',          pay: 1.6, vis: { fog: true, tint: 'rgba(10,10,30,.25)' } },
      armored:  { name: 'Armored',     icon: '🛡️', desc: 'Plated zombies shrug off 40% of every hit.',       pay: 1.5, apply(z) { z.armor = Math.max(z.armor || 0, 0.4); z.hp = z.max = Math.round(z.max * 1.3); } },
      swarm:    { name: 'Swarm',       icon: '🧟', desc: 'Twice as many, half the health.',                  pay: 0.9, apply(z) { z.hp = z.max = Math.round(z.max * 0.5); }, extra: 1 },
      regen:    { name: 'Regenerators', icon: '🩹', desc: 'Zombies heal 6% of their health a second.',        pay: 1.4, tick() { if (g.tick % 30 === 0) for (const z of g.zombies) if (!z.dead && z.emerge <= 0 && z.hp < z.max) z.hp = Math.min(z.max, z.hp + z.max * 0.03); } },
      berserk:  { name: 'Berserk',     icon: '🔥', desc: 'Furious zombies: faster, and they hit 50% harder.', pay: 1.3, apply(z) { z.rage = 99999; z.dmg *= 1.5; }, vis: { tint: 'rgba(150,20,10,.18)' } },
      leaden:   { name: 'Leaden Boots', icon: '🥾', desc: 'You move 38% slower. Plan your routes.',           pay: 1.7, tick() { if (g.slowT < 2) g.slowT = 2; } }
    };
    const gauntletBase = {
      init() { R.n = 0; R.cleared = 0; R.mut = null; R.spawned = false; },
      noClear() { return R.n >= R.total && R.spawned; },
      beginWave(mut) {
        R.n++; R.mut = mut; stdWave(R.n, { mods: false });
        g.mod = mut ? { label: mut.name, sub: mut.desc, count: 1, hp: 1, spd: 1, dmg: 1, cash: 1, tint: (mut.vis || {}).tint || null, fog: !!(mut.vis || {}).fog } : null;
        if (mut) {
          g.banner = { text: mut.name, sub: mut.desc + `  (payout x${mut.pay})`, life: 220 };
          const base = g.zombies.slice();
          for (let i = 0; i < (mut.extra || 0) * base.length; i++) spawnZ();
          for (const z of g.zombies) { if (mut.apply) mut.apply(z); z.cashMul *= mut.pay; }
          if (mut.start) mut.start();
        }
        R.spawned = true; g.paused = false;
      },
      tick() {
        if (R.mut && R.mut.tick) R.mut.tick();
        if (R.n >= R.total && R.spawned && liveN() === 0 && !R.pend) { R.cleared = R.n; R.pend = { win: true, msg: 'Gauntlet cleared.' }; }
      },
      kill(z) { if (R.mut && R.mut.kill) R.mut.kill(z); },
      view() { const m = R.mut; return { h: [['t', this.title(), '#d9a441'], ['b', `Wave ${Math.max(1, R.n)}/${R.total}`, R.cleared / R.total, '#a58bc2', `${R.cleared} cleared`], ['t', m ? `${m.icon} ${m.name}  x${m.pay}` : 'Choosing a mutation...', '#e8dec6']], sc: R.cleared }; }
    };
    M.gauntlet = Object.assign({}, gauntletBase, {
      name: 'Gauntlet', icon: '🌀', players: '1-4', total: 12,
      desc: 'Twelve waves. Before each one you pick a mutation card: giants, ghosts, exploding corpses, friendly-fire mines... Riskier cards pay more.',
      title() { return 'GAUNTLET'; },
      wave() {
        if (R.n > 0) R.cleared = R.n;
        const cards = shuffle(Object.keys(MUTS)).slice(0, 3);
        g.paused = true; R.spawned = false;
        showPicker(`Wave ${R.n + 1} of ${R.total}: choose your mutation`, cards.map((id) => ({ id, ...MUTS[id] })), (id) => { if (!R || !g.active) return; this.beginWave(id ? MUTS[id] : null); });
        return true;
      },
      finish(win) { return { score: R.cleared, text: `${R.cleared}/${R.total} waves${win ? ', gauntlet cleared' : ''}`, cashMul: 1.2, scraps: R.cleared + (win ? 15 : 0) }; }
    });
    M.daily = Object.assign({}, gauntletBase, {
      name: 'Daily Challenge', icon: '🎯', players: '1-4', total: 8,
      descf() { const u = UD(), b = u && u.modeBest && u.modeBest['daily_' + dateKey()]; return `Same eight mutated waves for everyone today (${dateKey()}). No picks, no mercy.` + (b ? ` Your best today: ${b.s} waves.` : ''); },
      title() { return 'DAILY ' + dateKey().slice(5); },
      wave() {
        if (R.n > 0) R.cleared = R.n;
        if (!R.seq) { const r = mulberry(hashStr('mp-daily-' + dateKey())); R.seq = shuffle(Object.keys(MUTS), r).slice(0, this.total); }
        this.beginWave(MUTS[R.seq[R.n]]); return true;
      },
      finish(win) { const s = R.cleared; return { score: s, text: `${s}/${R.total} waves today${win ? ', perfect day' : ''}`, cashMul: 1.5, scraps: s + (win ? 20 : 0), key: 'daily_' + dateKey() }; }
    });

    // ---- 6. INFECTION (PvPvE)
    M.infection = {
      name: 'Infection', icon: '🧟', players: '1-4',
      desc: 'Survive four minutes against a growing swarm. In co-op, a fallen survivor rises as a fast infected player and hunts the rest. Last survivor standing wins. Solo: alphas hunt you.',
      init() { R.dur = 14400; R.left = R.dur; R.lvl = 1; R.inf = {}; R.alphaT = 900; R.baseSpeed = g.speedLvl; g.wave = 3; },
      wave() { newWave(3); g.banner = { text: 'INFECTION', sub: 'Survive until dawn. Do not get bitten.', life: 200 }; for (let i = 0; i < 10; i++) spawnZ(rnd() < 0.5 ? 'speedy' : 'standard'); afterSpawn(); g.obj = null; return true; },
      noClear() { return true; },
      convert(id, name) {
        R.inf[id] = { z: null, rs: 0 }; g.banner = { text: name + ' IS INFECTED', sub: 'They hunt the survivors now.', life: 180 };
        if (id === 'host') { g.downT = 99999; g.invuln = 99999; g.player.hp = 1; }
      },
      tick() {
        R.left--; const el = (R.dur - R.left) / 60; R.lvl = Math.min(13, 1 + Math.floor(el / 20)); g.wave = 2 + R.lvl;
        if (g.tick % 40 === 0) { const cap = 16 + R.lvl * 5; let n = 0; for (const z of g.zombies) if (!z.dead && !z.pcid) n++; if (n < cap) for (let i = 0; i < Math.min(cap - n, 1 + Math.floor(R.lvl / 3)); i++) spawnZ(rnd() < 0.45 ? 'speedy' : (rnd() < 0.5 ? 'standard' : pickType())); }
        if (--R.alphaT <= 0) { R.alphaT = 1800 - Math.min(700, R.lvl * 60); const a = spawnZ('charger', undefined, undefined, { label: 'Alpha' }); a.hp = a.max = Math.round(a.max * 2.2); a.spd *= 1.3; a.alpha = 1; g.banner = { text: 'AN ALPHA SPAWNS', sub: 'It hunts you by name.', life: 120 }; }
        // survivors that went down become infected (co-op)
        if (g.peers.length) {
          if (g.downT > 0 && !R.inf.host) M.infection.convert('host', plist()[0].name);
          for (const pe of g.peers) if ((pe.down > 0 || pe.pl.hp <= 0) && !pe.cl && !R.inf[pe.id]) M.infection.convert(pe.id, pe.name);
        }
        g.speedLvl = R.baseSpeed + (R.inf.host ? 2 : 0);
        for (const id in R.inf) {
          const inf = R.inf[id], host = id === 'host', pe = host ? null : g.peers.find((q) => q.id === id);
          if (!host && !pe) continue;
          const pl = host ? g.player : pe.pl;
          if (host) { g.downT = 99999; g.invuln = 99999; pl.hp = 1; keys.KeyO = keys.KeyP = keys.KeyL = keys.Space = false; } else { pe.down = 99999; pe.pl.hp = 1; pe.cl = null; }
          if (!inf.z || inf.z.dead) {
            if (inf.z) { inf.z = null; inf.rs = 300; } if (inf.rs > 0) { inf.rs--; continue; }
            const z = spawnZ('speedy', pl.x, pl.y, { emerge: 0, noDrop: true, pcid: id }); z.hp = z.max = 140 + 14 * R.lvl; z.dmg = 34; z.spd = 0; z.cashMul = 1.5; z.size = 15; inf.z = z;
          } else { inf.z.x = pl.x; inf.z.y = pl.y; inf.z.spd = 0; inf.z.slow = 1; inf.z.emerge = 0; }
        }
        const sv = plist().filter((q) => !R.inf[q.id] && !q.down).length;
        if (g.peers.length && sv === 0 && !R.pend) R.pend = { win: false, msg: 'Everyone is infected.' };
        if (R.left <= 0 && !R.pend) R.pend = { win: sv > 0 || !g.peers.length, msg: 'Dawn breaks.' };
      },
      kill(z) { if (z.pcid) popSync(z.x, z.y - 30, 'INFECTED DOWN'); },
      view() {
        const n = Object.keys(R.inf).length, sv = plist().length - n, w = [];
        for (const id in R.inf) { const z = R.inf[id].z; if (z && !z.dead) w.push(['tag', Math.round(z.x), Math.round(z.y) - 26, (id === 'host' ? plist()[0].name : ((g.peers.find((q) => q.id === id) || {}).name || '?')) + ' (infected)', '#ff5a4a']); }
        for (const z of g.zombies) if (z.alpha && !z.dead) w.push(['tag', Math.round(z.x), Math.round(z.y) - 30, 'ALPHA', '#ff9a3a']);
        return { h: [['t', 'INFECTION', '#b8e04a'], ['b', 'Dawn ' + mmss(R.left / 60), 1 - R.left / R.dur, '#d9a441', ''], ['t', g.peers.length ? `survivors ${sv}  ·  infected ${n}` : `swarm level ${R.lvl}  ·  kills ${g.stats.kills}`, '#e8dec6']], w, inf: Object.keys(R.inf), sc: Math.floor(secs()) };
      },
      finish(win) { const s = Math.floor(secs()); return { score: s + g.stats.kills * 2, text: `survived ${mmss(s)}, ${g.stats.kills} kills${win ? ', dawn reached' : ''}`, cashMul: 1.4, scraps: Math.floor(s / 40) + (win ? 12 : 0) }; }
    };

    // ---- 7. LAST LIGHT
    M.lastlight = {
      name: 'Last Light', icon: '🕯', players: '1-4',
      desc: 'The night is four minutes long. Darkness hides the horde; only your lamps and flashlight show it. Keep the lamps fed and alive until dawn.',
      init() {
        R.dur = 14400; R.left = R.dur; R.lvl = 1; g.wave = 3;
        R.lamps = [[400, 165], [205, 425], [595, 425]].map(([x, y]) => ({ k: 'lamp', x, y, fuel: 1, hp: 700, max: 700, vx: 0, vy: 0, prev: 700 }));
      },
      wave() { newWave(3); g.banner = { text: 'LAST LIGHT', sub: 'Stand near a lamp to refuel it. Dawn is 4:00 away.', life: 220 }; for (let i = 0; i < 6; i++) spawnZ(); afterSpawn(); g.obj = null; return true; },
      noClear() { return true; },
      target(z) {
        const n = nearestPl(z.x, z.y); if (n && n.d < 100) return null;
        let b = null, bd = 190; for (const l of R.lamps) { if (l.hp <= 0) continue; const d = Math.hypot(l.x - z.x, l.y - z.y); if (d < bd) { bd = d; b = l; } }
        return b;
      },
      tick() {
        R.left--; const el = (R.dur - R.left) / 60; R.lvl = Math.min(11, 1 + Math.floor(el / 22)); g.wave = 2 + R.lvl;
        if (g.tick % 36 === 0) { const cap = 14 + R.lvl * 4; if (liveN() < cap) for (let i = 0; i < 1 + Math.floor(R.lvl / 3); i++) spawnZ(); }
        let on = 0;
        for (const l of R.lamps) {
          if (l.hp <= 0) continue;
          if (l.hp < l.prev) l.hp += (l.prev - l.hp) * 0.5; l.prev = l.hp;   // lamps are sturdy: half of every bite is refunded
          l.fuel = Math.max(0, l.fuel - 1 / 5400);
          for (const q of alivePl()) if (Math.hypot(q.p.x - l.x, q.p.y - l.y) < 48) l.fuel = Math.min(1, l.fuel + 0.0022);
          if (l.fuel > 0) on++;
        }
        if (on === 0 && !R.pend) R.pend = { win: false, msg: 'The last light went out.' };
        if (R.left <= 0 && !R.pend) R.pend = { win: true, msg: 'Dawn breaks.' };
      },
      view() {
        const w = R.lamps.map((l) => ['lamp', l.x, l.y, +l.fuel.toFixed(2), Math.max(0, Math.round(l.hp)), l.max]);
        const dk = []; for (const l of R.lamps) if (l.hp > 0 && l.fuel > 0) dk.push([l.x, l.y, Math.round(55 + 135 * Math.sqrt(l.fuel))]);
        for (const q of plist()) if (!q.down) dk.push([Math.round(q.p.x), Math.round(q.p.y), 95]);
        const lit = R.lamps.filter((l) => l.hp > 0 && l.fuel > 0).length;
        return { h: [['t', 'LAST LIGHT', '#e8c46a'], ['b', 'Dawn ' + mmss(R.left / 60), 1 - R.left / R.dur, '#d9a441', ''], ['t', `lamps lit ${lit}/3  ·  ${R.lamps.map((l) => l.hp > 0 ? Math.round(l.fuel * 100) + '%' : 'X').join(' ')}`, lit < 2 ? '#ff7a3a' : '#e8dec6']], w, dk, sc: Math.floor(secs()) };
      },
      finish(win) { const s = Math.floor(secs()); const lit = R.lamps.filter((l) => l.hp > 0).length; return { score: s + lit * 25, text: `survived ${mmss(s)}${win ? ', dawn reached with ' + lit + ' lamps' : ''}`, cashMul: 1.4, scraps: Math.floor(s / 40) + (win ? 12 : 0) }; }
    };

    // ------------------------------------------------------------------ gauntlet card picker (DOM)
    const pickerCss = document.createElement('style');
    pickerCss.textContent = `#pve-pick{position:fixed;inset:0;z-index:250;background:rgba(6,5,4,.86);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
#pve-pick.hidden{display:none}#pve-pick .pp{width:min(720px,100%);text-align:center;color:#e8dec6}
#pve-pick h2{font-family:'Special Elite',monospace;color:#d9a441;margin:0 0 14px;font-size:22px}
#pve-pick .pc{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
#pve-pick .c{background:#1d1812;border:2px solid #4d4235;border-radius:6px;padding:14px 10px;cursor:pointer;font:inherit;color:inherit}
#pve-pick .c:hover{border-color:#d9a441;background:#262017}#pve-pick .c b{display:block;font-size:16px;margin:6px 0 4px;color:#d9a441}
#pve-pick .c small{display:block;color:#9a8e7a;font-size:12px;min-height:34px}#pve-pick .c i{font-style:normal;display:block;margin-top:8px;color:#8aa04a;font-weight:700}
#pve-pick .s{margin-top:12px;background:none;border:1px solid #4d4235;color:#9a8e7a;padding:6px 12px;cursor:pointer;font:inherit;border-radius:4px}`;
    document.head.appendChild(pickerCss);
    let pickCb = null;
    const hidePicker = () => { const e = $('pve-pick'); if (e) e.classList.add('hidden'); pickCb = null; };
    const showPicker = (title, cards, cb) => {
      let e = $('pve-pick'); if (!e) { e = document.createElement('div'); e.id = 'pve-pick'; document.body.appendChild(e); }
      pickCb = cb; window.PVE_pick = (i) => { const f = pickCb; if (!f) return; hidePicker(); f(i === -1 ? null : cards[i].id); };
      e.innerHTML = `<div class="pp"><h2>${title}</h2><div class="pc">` + cards.map((c, i) => `<button class="c" onclick="PVE_pick(${i})"><span style="font-size:30px">${c.icon}</span><b>${i + 1}. ${c.name}</b><small>${c.desc}</small><i>payout x${c.pay}</i></button>`).join('') + `</div><button class="s" onclick="PVE_pick(-1)">Play it safe (no mutation)</button></div>`;
      e.classList.remove('hidden'); if (typeof applyIcons === 'function') try { applyIcons(); } catch (er) {}
    };
    window.addEventListener('keydown', (ev) => {
      const e = $('pve-pick'); if (!e || e.classList.contains('hidden') || !pickCb) return;
      const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[ev.code]; if (n !== undefined && window.PVE_pick) PVE_pick(n);
    });

    // ------------------------------------------------------------------ framework
    const def = (id) => {
      const m = M[id];
      const d = {
        id, name: m.name, icon: m.icon, tags: ['pve'], players: m.players,
        launch(opts) { launchMode(id, opts); }, stop() { cleanup(); },
        tick() { return modeTick(); }, onWave() { return modeWave(); }
      };
      Object.defineProperty(d, 'desc', { get() { const b = bestOf(id); const x = m.descf ? m.descf() : m.desc; return x + (b && id !== 'daily' ? `  Best: ${b}` : ''); }, enumerable: true });
      return d;
    };
    const bestKey = (id) => (id === 'daily' ? 'daily_' + dateKey() : id);
    const bestOf = (id) => { const u = UD(); const b = u && u.modeBest && u.modeBest[bestKey(id)]; if (!b) return ''; return id === 'bossrush' ? `${b.s}/9 bosses${b.t ? ' (' + mmss(b.t) + ')' : ''}` : (id === 'blitz' ? b.s.toLocaleString() : (id === 'infection' || id === 'lastlight' ? mmss(b.s) : `${b.s}`)); };

    const cleanup = () => { R = null; VM = null; ME_INF = false; window.MODECFG = null; hidePicker(); };
    const launchMode = (id, opts) => {
      if (isGuest()) { toast('Only the party host picks the mode.'); MODES.active = null; return; }
      if (!UD()) { MODES.active = null; return; }
      R = { id, m: M[id], started: false, opts: opts || {}, armUntil: Date.now() + 14000 };
      window.MODECFG = { id, name: M[id].name };
      const party = MP.role === 'host' && !MP.started && MP.conns.some((c) => c.info);
      if (party) { partyStart(); return; }
      realStart();
      if (!g.active) MODES.stop();
    };
    const startRun = () => {
      R.started = true; R.total = R.m.total; R.t0 = g.tick; R.pend = null; R.ending = false; R.dead = R.dead || {}; R.inf = R.inf || {};
      SEL = 'tur';
      g.obj = null;
      R.m.init();
      setTimeout(() => { if (R && g.active) g.banner = g.banner || null; }, 0);
    };
    const modeWave = () => {
      if (!R) return false;
      if (!R.started) startRun();
      return R.m.wave ? R.m.wave() === true : false;
    };
    const modeTick = () => {
      if (isGuest() || !R || !R.started || !g.active) return false;
      if (R.pend && !R.ending) { R.ending = true; R.win = !!R.pend.win; R.msg = R.pend.msg; hidePicker(); quitMission(); return true; }
      if (g.paused || g.dying || g.mini) return false;
      R.m.tick && R.m.tick();
      if (g.tick % 2 === 0 || !R.vm) { const v = R.m.view(); v.i = R.id; R.vm = v; VM = v; }
      return false;
    };
    window.PVE_noClear = () => !!(R && R.started && R.m.noClear && R.m.noClear());
    window.PVE_tgt = (z) => { if (!R || !R.started || !R.m.target || isGuest()) return null; return R.m.target(z); };
    window.PVE_zAlpha = (z) => { if (z.flash > 0) return 0.85; const n = nearestPl(z.x, z.y, [{ p: g.player }]); return n && n.d < 120 ? 0.85 : 0.1; };

    // wrappers on the shared party hooks (they are looked up dynamically by the main file)
    const wrap = (name, fn) => { const prev = window[name]; window[name] = function () { let r; if (prev) r = prev.apply(this, arguments); try { const o = fn.apply(this, [r, ...arguments]); return o === undefined ? r : o; } catch (e) { console.error('[pve] ' + name, e); return r; } }; };
    wrap('PARTY_kill', (r, z) => { if (R && R.started && R.m.kill && !isGuest()) R.m.kill(z); });
    wrap('PARTY_snap', (r, snap, pe) => {
      if (!R || !R.started || !R.vm) return;
      snap.md = R.vm;
      const inf = R.inf && R.inf[pe.id];
      if (inf) { snap.mdm = 1; if (snap.me) { snap.me.down = 0; snap.me.hp = snap.me.maxHp; snap.me.sp = (snap.me.sp || 4.5) * 1.35; } }
      else if (R.inf && R.inf.host && snap.me) snap.me.sp = snap.me.sp * (4.5 + R.baseSpeed * 0.7) / (4.5 + g.speedLvl * 0.7);
    });
    wrap('PARTY_apply', (r, d) => { VM = d.md || null; ME_INF = !!d.mdm; });
    const prevHost = window.PARTY_hostGot;
    window.PARTY_hostGot = function (c, d) {
      if (d && d.t === 'pvb') {
        try { if (R && R.started && c.pe && g.active) { const e = buildAt(String(d.k), d.x, d.y); if (e) mpSend(c, { t: 'pvm', m: e }); } } catch (er) { console.error('[pve] build', er); }
        return true;
      }
      return prevHost ? prevHost.apply(this, arguments) : false;
    };

    const prevGuestGot = window.PARTY_guestGot;
    window.PARTY_guestGot = function (d) {
      if (d && d.t === 'pvm') { try { g.pops.push({ x: 400, y: 520, txt: String(d.m).slice(0, 40), life: 60 }); } catch (e) {} return true; }
      return prevGuestGot ? prevGuestGot.apply(this, arguments) : false;
    };
    if (typeof realStart === 'function' && !window.realStart) window.realStart = realStart;   // the classic 'Wave survival' card in the picker needs it
    // quitMission wrapper: mode rewards, per-mode best, toast, cleanup. the original does the real saving.
    const origQuit = window.quitMission;
    window.quitMission = function () {
      if (!g.active) return origQuit.apply(this, arguments);
      const host = !!(R && R.started), guestRun = !host && isGuest() && !!VM;
      if (!host && !guestRun) return origQuit.apply(this, arguments);
      let info = null, name = '', id = '', newBest = false;
      try {
        const u = UD();
        if (host) {
          const m = R.m; id = R.id; name = m.name;
          const win = R.win === true, f = m.finish(win);
          const cmul = f.cashMul || 1, bonus = Math.round(g.earned * (cmul - 1)) + (f.cash || 0);
          g.cash += bonus; g.earned += bonus; g.scraps += f.scraps || 0;
          info = { f, win, msg: R.msg };
        } else { id = VM.i; name = (MODES.list[id] || {}).name || 'Mode'; info = { f: { score: VM.sc || 0, text: '' }, win: false }; }
        const f = info.f, key = f.key || bestKey(id);
        u.modeBest = u.modeBest || {};
        const old = u.modeBest[key];
        if (f.score > 0 && (!old || f.score > old.s || (f.score === old.s && f.t && (!old.t || f.t < old.t)))) { u.modeBest[key] = { s: f.score, t: f.t || 0, d: dateKey() }; newBest = true; }
        Object.keys(u.modeBest).filter((k) => k.startsWith('daily_')).sort().slice(0, -7).forEach((k) => delete u.modeBest[k]);
        const fields = { modeBest: u.modeBest };
        if (f.trophy) { u.modeTroph = u.modeTroph || {}; u.modeTroph[id] = (u.modeTroph[id] || 0) + 1; fields.modeTroph = u.modeTroph; }
        g.wave = 0; g.dif = 'easy';        // mode runs never touch the weekly wave boards or the wave record
        info.fields = fields;
      } catch (e) { console.error('[pve] finish', e); }
      const res = origQuit.apply(this, arguments);
      try {
        const f = info && info.f;
        if (f) setTimeout(() => toast(`${name}: ${f.text || ''}${newBest ? '  NEW BEST!' : ''}  +$${fmt(g.earned)}${(g.scraps - g.startScraps) > 0 ? `, +${g.scraps - g.startScraps} scraps` : ''}`), 30);
        if (info && info.fields) { try { save(info.fields); } catch (e) {} }
      } catch (e) {}
      if (host) MODES.stop(); else cleanup();
      return res;
    };
    // a launched-but-never-started mode must not hijack a later normal start
    const origStartMission = window.startMission;
    if (origStartMission) window.startMission = function () { if (R && !R.started && !g.active && Date.now() > R.armUntil) MODES.stop(); return origStartMission.apply(this, arguments); };
    const origPartyStart = window.partyStart;
    if (origPartyStart) window.partyStart = function () { if (R && !R.started && !g.active && Date.now() > R.armUntil) MODES.stop(); return origPartyStart.apply(this, arguments); };

    // ------------------------------------------------------------------ rendering (host and guests share this)
    const hpBar = (cx, x, y, w, f, col) => { cx.fillStyle = 'rgba(10,8,6,.8)'; cx.fillRect(x - w / 2, y, w, 5); cx.fillStyle = col; cx.fillRect(x - w / 2, y, w * cl(f, 0, 1), 5); };
    window.PVE_drawWorld = (cx) => {
      if (!VM || !VM.w || !g.active) return;
      const T = g.tick;
      for (const it of VM.w) {
        const k = it[0], x = it[1], y = it[2];
        cx.save();
        if (k === 'core') {
          const f = it[3] / it[4], pulse = 0.5 + 0.5 * Math.sin(T * 0.08), col = f > 0.5 ? '111,224,200' : (f > 0.25 ? '230,170,60' : '230,70,50');
          cx.fillStyle = '#241c14'; cx.beginPath(); cx.arc(x, y, 32, 0, 6.283); cx.fill(); cx.strokeStyle = '#4d4235'; cx.lineWidth = 3; cx.stroke();
          cx.fillStyle = `rgba(${col},${0.18 + 0.16 * pulse})`; cx.beginPath(); cx.arc(x, y, 44 + pulse * 4, 0, 6.283); cx.fill();
          cx.fillStyle = `rgb(${col})`; cx.beginPath(); cx.moveTo(x, y - 22); cx.lineTo(x + 14, y); cx.lineTo(x, y + 22); cx.lineTo(x - 14, y); cx.closePath(); cx.fill();
          cx.fillStyle = 'rgba(255,255,255,.55)'; cx.beginPath(); cx.moveTo(x, y - 20); cx.lineTo(x + 5, y - 4); cx.lineTo(x - 5, y - 4); cx.closePath(); cx.fill();
          hpBar(cx, x, y + 38, 70, f, `rgb(${col})`);
        } else if (k === 'tur') {
          cx.fillStyle = '#2b2118'; cx.fillRect(x - 13, y - 13, 26, 26); cx.strokeStyle = '#6a5a44'; cx.lineWidth = 2; cx.strokeRect(x - 13, y - 13, 26, 26);
          cx.translate(x, y); cx.rotate(it[5]); cx.fillStyle = '#9aa4ab'; cx.fillRect(0, -3, 20, 6); cx.fillStyle = '#d9a441'; cx.beginPath(); cx.arc(0, 0, 7, 0, 6.283); cx.fill();
          cx.rotate(-it[5]); cx.translate(-x, -y);
          if (it[6]) { cx.strokeStyle = 'rgba(255,230,120,.9)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(it[7], it[8]); cx.stroke(); }
          if (it[3] < it[4]) hpBar(cx, x, y + 17, 28, it[3] / it[4], '#d9a441');
        } else if (k === 'wall') {
          cx.fillStyle = '#9b8458'; cx.fillRect(x - 17, y - 8, 34, 16); cx.strokeStyle = '#5c4a2c'; cx.lineWidth = 2; cx.strokeRect(x - 17, y - 8, 34, 16);
          cx.strokeStyle = '#7a6640'; cx.beginPath(); cx.moveTo(x - 6, y - 8); cx.lineTo(x - 6, y + 8); cx.moveTo(x + 6, y - 8); cx.lineTo(x + 6, y + 8); cx.stroke();
          if (it[3] < it[4]) hpBar(cx, x, y + 11, 28, it[3] / it[4], '#c9b27a');
        } else if (k === 'lamp') {
          const fuel = it[3], hp = it[4], on = hp > 0 && fuel > 0, fl = on ? 0.85 + 0.15 * Math.sin(T * 0.3 + x) : 0;
          cx.fillStyle = '#3a2f22'; cx.fillRect(x - 4, y - 6, 8, 30); cx.fillRect(x - 10, y + 22, 20, 5);
          if (on) { cx.fillStyle = `rgba(255,214,120,${0.25 * fl})`; cx.beginPath(); cx.arc(x, y - 12, 22, 0, 6.283); cx.fill(); }
          cx.fillStyle = on ? `rgba(255,224,140,${fl})` : '#4a4034'; cx.beginPath(); cx.arc(x, y - 12, 11, 0, 6.283); cx.fill(); cx.strokeStyle = '#8a7650'; cx.lineWidth = 2; cx.stroke();
          if (hp > 0) { hpBar(cx, x, y + 30, 40, hp / it[5], '#b8392d'); hpBar(cx, x, y + 37, 40, fuel, '#e8c46a'); } else { cx.fillStyle = '#b8392d'; cx.font = '14px ' + FSP; cx.textAlign = 'center'; cx.fillText('X', x, y); }
        } else if (k === 'pk') {
          const kind = it[3], life = it[4]; if (life < 120 && T % 10 < 5) { cx.restore(); continue; }
          const col = kind === 'time' ? '#6fe0c8' : (kind === 'frenzy' ? '#ff9a3a' : '#ff5a4a');
          cx.shadowColor = col; cx.shadowBlur = 12; cx.fillStyle = 'rgba(10,8,6,.85)'; cx.beginPath(); cx.arc(x, y + Math.sin(T * 0.12) * 3, 15, 0, 6.283); cx.fill(); cx.strokeStyle = col; cx.lineWidth = 3; cx.stroke(); cx.shadowBlur = 0;
          cx.fillStyle = col; cx.font = '16px serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(kind === 'time' ? '⏱' : (kind === 'frenzy' ? '⚡' : '💥'), x, y + Math.sin(T * 0.12) * 3);
        } else if (k === 'tag') {
          cx.font = '11px ' + FCP; cx.textAlign = 'center'; cx.fillStyle = 'rgba(10,8,6,.7)'; const tw = cx.measureText(it[3]).width + 8; cx.fillRect(x - tw / 2, y - 10, tw, 15); cx.fillStyle = it[4]; cx.fillText(it[3], x, y + 1);
        }
        cx.restore();
      }
      cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    };

    const darkC = document.createElement('canvas'); darkC.width = 800; darkC.height = 600; const dctx = darkC.getContext('2d');
    const drawDark = (cx) => {
      if (!VM || !VM.dk) return;
      dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, 800, 600); dctx.fillStyle = 'rgba(3,3,9,.95)'; dctx.fillRect(0, 0, 800, 600);
      dctx.globalCompositeOperation = 'destination-out';
      const lights = VM.dk.slice(); if (isGuest()) lights.push([g.player.x, g.player.y, 95]); else lights.push([g.player.x, g.player.y, 95]);
      for (const [x, y, r] of lights) { const gr = dctx.createRadialGradient(x, y, r * 0.15, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); dctx.fillStyle = gr; dctx.beginPath(); dctx.arc(x, y, r, 0, 6.283); dctx.fill(); }
      cx.drawImage(darkC, 0, 0);
      cx.fillStyle = 'rgba(255,200,110,.05)'; for (const [x, y, r] of VM.dk) { if (r > 110) { cx.beginPath(); cx.arc(x, y, r * 0.8, 0, 6.283); cx.fill(); } }
    };
    const palRects = () => {
      if (!VM || !VM.pal) return [];
      const n = VM.pal.length + (isGuest() ? 0 : 1), w = 112, gap = 6, x0 = 400 - (n * (w + gap) - gap) / 2, out = [];
      VM.pal.forEach((p, i) => out.push({ key: p[0], label: p[1], cost: p[2], n: String(i + 1), x: x0 + i * (w + gap), y: 548, w, h: 42 }));
      if (!isGuest()) out.push({ key: 'go', label: 'Start', cost: 0, n: 'Enter', x: x0 + VM.pal.length * (w + gap), y: 548, w, h: 42 });
      return out;
    };
    const drawBuildUi = (cx) => {
      if (!VM || !VM.pal) return;
      const res = VM.res || 0;
      for (const r of palRects()) {
        const can = r.key === 'go' || res >= r.cost, on = SEL === r.key;
        cx.fillStyle = on ? 'rgba(217,164,65,.28)' : 'rgba(10,8,6,.82)'; cx.fillRect(r.x, r.y, r.w, r.h);
        cx.strokeStyle = on ? '#d9a441' : (can ? '#6a5a44' : '#3a2f22'); cx.lineWidth = 2; cx.strokeRect(r.x, r.y, r.w, r.h);
        cx.textAlign = 'center'; cx.fillStyle = can ? '#e8dec6' : '#6a5f50'; cx.font = '13px ' + FSP; cx.fillText(`${r.n}  ${r.label}`, r.x + r.w / 2, r.y + 17);
        cx.font = '12px ' + FCP; cx.fillStyle = can ? '#d9a441' : '#6a5f50'; cx.fillText(r.key === 'go' ? (VM.ph === 'build' ? 'begin' : 'in progress') : `${r.cost} salvage`, r.x + r.w / 2, r.y + 34);
      }
      cx.textAlign = 'left';
      if (MOUSE && (SEL === 'tur' || SEL === 'wall' || SEL === 'mine') && !palRects().some((r) => MOUSE.x >= r.x && MOUSE.x <= r.x + r.w && MOUSE.y >= r.y && MOUSE.y <= r.y + r.h)) {
        const x = coreSnap(MOUSE.x), y = coreSnap(MOUSE.y);
        let bad = '';
        if (!isGuest() && R && R.id === 'core') bad = placeOK(SEL, x, y); else if (VM.w) { if (VM.w.some((it) => it[0] !== 'pk' && it[0] !== 'tag' && Math.hypot(it[1] - x, it[2] - y) < (it[0] === 'core' ? 58 : 34))) bad = 'x'; }
        const ok = !bad && res >= CORE_COST[SEL];
        cx.strokeStyle = ok ? 'rgba(138,224,120,.9)' : 'rgba(255,90,70,.9)'; cx.lineWidth = 2; cx.setLineDash([4, 4]); cx.strokeRect(x - 17, y - 17, 34, 34); cx.setLineDash([]);
        if (SEL === 'tur') { cx.strokeStyle = 'rgba(255,255,255,.18)'; cx.beginPath(); cx.arc(x, y, 235, 0, 6.283); cx.stroke(); }
      }
    };
    const drawModeHud = (cx) => {
      if (!VM || !VM.h || !g.active) return;
      const rows = VM.h; let hgt = 8; rows.forEach((r) => { hgt += r[0] === 'b' ? 20 : (r[3] ? r[3] + 4 : 18); });
      const CX = 448, w = 232, x = CX - w / 2, y0 = g.zombies.some((z) => z.boss && !z.dead) ? 80 : 54;
      cx.save(); cx.globalAlpha = 0.92; cx.fillStyle = 'rgba(10,8,6,.78)'; cx.fillRect(x, y0, w, hgt); cx.strokeStyle = '#4d4235'; cx.lineWidth = 2; cx.strokeRect(x, y0, w, hgt); cx.globalAlpha = 1;
      let y = y0 + 4; cx.textAlign = 'center';
      for (const r of rows) {
        if (r[0] === 't') { const s = r[3] || 14; cx.font = `${s}px ${r[3] ? FSP : (r[1] === r[1].toUpperCase() ? FSP : FCP)}`; cx.fillStyle = r[2]; cx.fillText(r[1], CX, y + s - 1); y += s + 4; }
        else { cx.fillStyle = '#17130f'; cx.fillRect(x + 10, y + 3, w - 20, 12); cx.fillStyle = r[3]; cx.fillRect(x + 10, y + 3, (w - 20) * cl(r[2], 0, 1), 12); cx.strokeStyle = '#4d4235'; cx.lineWidth = 1; cx.strokeRect(x + 10, y + 3, w - 20, 12); cx.font = `12px ${FCP}`; cx.fillStyle = '#e8dec6'; cx.textAlign = 'left'; cx.fillText(r[1], x + 14, y + 13); cx.textAlign = 'right'; cx.fillText(r[4] || '', x + w - 14, y + 13); cx.textAlign = 'center'; y += 20; }
      }
      const inf = isGuest() ? ME_INF : !!(R && R.inf && R.inf.host);
      if (inf) { cx.font = `16px ${FSP}`; cx.fillStyle = '#ff5a4a'; cx.fillText('YOU ARE INFECTED. Bite the survivors!', 400, 520); }
      cx.restore();
      drawBuildUi(cx);
    };
    if (window.RUNUI_drawHud) {   // the darkness has to sit under the HUD, so it is drawn right before the HUD (the party overlay comes after it)
      const prevHud = window.RUNUI_drawHud;
      window.RUNUI_drawHud = function () {
        try { if (g.active && !g.mini) drawDark(ctx); } catch (e) { console.error('[pve] dark', e); }
        const r = prevHud.apply(this, arguments);
        try { if (window.RUNUI_hud) drawModeHud(ctx); } catch (e) { console.error('[pve] hud', e); }
        return r;
      };
    }
    wrap('PARTY_drawOverlay', (r, cx) => { if (!g.active || g.mini || window.RUNUI_hud) return; drawDark(cx || ctx); drawModeHud(cx || ctx); });

    // ------------------------------------------------------------------ input: build placement + start wave
    const cv = document.getElementById('gameCanvas');
    const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; };
    if (cv) {
      cv.addEventListener('pointermove', (e) => { MOUSE = toWorld(e); });
      cv.addEventListener('pointerleave', () => { MOUSE = null; });
      cv.addEventListener('pointerdown', (e) => {
        if (!VM || !VM.pal || !g.active) return;
        const p = toWorld(e); MOUSE = p;
        const hit = palRects().find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
        if (hit) { act(hit.key); return; }
        if (SEL === 'tur' || SEL === 'wall' || SEL === 'mine') place(SEL, p.x, p.y);
      });
    }
    const act = (key) => {
      if (key === 'go') { if (R && R.id === 'core' && R.phase === 'build') R.startNow = true; return; }
      if (key === 'rep') { place('rep', 0, 0); return; }
      SEL = key;
    };
    const place = (k, x, y) => {
      if (isGuest()) { mpSend(MP.hostConn, { t: 'pvb', k, x: Math.round(x), y: Math.round(y) }); return; }
      const e = buildAt(k, x, y); if (e) { g.pops.push({ x: cl(x || 400, 40, 760), y: cl(y || 300, 40, 560), txt: e, life: 50 }); }
    };
    window.addEventListener('keydown', (e) => {
      if (!VM || !VM.pal || !g.active || e.repeat) return;
      const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
      const i = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
      if (i !== undefined && !g.paused) act(VM.pal[i][0]);
      else if (e.code === 'Enter') act('go');
    });

    // ------------------------------------------------------------------ register
    ['bossrush', 'core', 'blitz', 'hardcore', 'gauntlet', 'infection', 'lastlight', 'daily'].forEach((id) => MODES.register(def(id)));
    window.PVE_debug = () => ({ R, VM, M });
  } catch (e) { console.error('[pve-modes]', e); }
})();
