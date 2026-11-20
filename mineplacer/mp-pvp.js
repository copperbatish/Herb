/* mp-pvp.js: team PvP (up to 4v4) with bots, party play, maps, cover, kits and five modes.
   Layout: A data (maps, weapons, kits) / B geometry + sim (host-authoritative, one step() fed by per-player input) /
   C bots / D network + lobby / E rendering + HUD / F modes, results, registration.
   Network messages (all prefixed pv): pvl (lobby state) pvk (guest kit/ready) pvgo (match start) pvi (guest input, latest-wins)
   pvs (snapshot, latest-wins) pvend (results) pvx (host closed the lobby/match). Hooks in Mineplacer2.html: PVP_hostGot / PVP_guestGot. */
(function () {
  'use strict';
  try {
    if (typeof MODES === 'undefined' || !window.MODES) return;
    const W = 800, H = 600, PR = 11, T = (s) => Math.round(s * 60);
    const rnd = Math.random, hyp = Math.hypot, cl = (v, a, b) => (v < a ? a : v > b ? b : v);
    const FSP = '"Special Elite", monospace', FCP = '"Courier Prime", monospace';
    const TEAMS = [{ n: 'RED', c: '#e0533f', d: '#7a2118', shirt: '#b8392d' }, { n: 'BLUE', c: '#4a9be0', d: '#1d3f6e', shirt: '#2d6fb8' }];
    const gl = (name) => { try { return (0, eval)(name); } catch (e) { return undefined; } };   // read a main-file top-level const by name

    // ================================================================ A. MAPS
    // All maps are authored for the LEFT half (team RED side) and mirrored to the right. xMid lists are not mirrored.
    // rects are [x,y,w,h], bushes [x,y,radius].  walls: block movement + bullets, indestructible.  wins: low walls/windows: block movement, NOT bullets.
    // bags: sandbags (destructible, 90hp).  crates: destructible (160hp).  water: slows a bit.  mud: slows a lot.
    const MAPS = {};
    const mirR = (r) => [W - r[0] - r[2], r[1], r[2], r[3]], mirC = (c) => [W - c[0], c[1], c[2]];
    const buildMap = (id, o) => {
      const both = (k, mir) => [...(o[k] || []), ...(o[k] || []).map(mir), ...(o[k + 'Mid'] || [])];
      return { id, name: o.name, desc: o.desc, theme: o.theme, walls: both('walls', mirR), wins: both('wins', mirR), bags: both('bags', mirR), crates: both('crates', mirR),
        bush: both('bush', mirC), water: both('water', mirR), mud: both('mud', mirR),
        sp: [o.spawn, o.spawn.map((s) => [W - s[0], s[1]])], flag: [o.flag, [W - o.flag[0], o.flag[1]]], pts: o.pts, hills: o.hills,
        pk: [...o.pk, ...o.pk.map((p) => [W - p[0], p[1], p[2]]), ...(o.pkMid || [])] };
    };
    MAPS.yard = buildMap('yard', { name: 'The Yard', desc: 'Open grass with scattered sandbags. Rotate between cover, fight over the pond.', theme: 'grass',
      walls: [[180, 250, 14, 100]], bags: [[110, 130, 56, 14], [250, 170, 14, 56], [110, 460, 56, 14], [250, 374, 14, 56], [300, 60, 56, 14], [300, 526, 56, 14], [320, 290, 14, 40]],
      crates: [[210, 300, 30, 30], [165, 520, 30, 30], [165, 50, 30, 30]], cratesMid: [[385, 165, 30, 30], [385, 405, 30, 30]],
      bush: [[120, 220, 30], [305, 235, 26], [305, 365, 26], [120, 380, 30]], bushMid: [[400, 60, 28], [400, 540, 28]], waterMid: [[368, 262, 64, 76]], mud: [[230, 480, 80, 50]],
      spawn: [[44, 225], [44, 275], [44, 325], [44, 375]], flag: [82, 300], pts: [[400, 300], [400, 105], [400, 495]], hills: [[400, 300], [400, 105], [400, 495]],
      pk: [[160, 300, 'hp'], [150, 90, 'sp'], [150, 510, 'sp'], [290, 300, 'dm']], pkMid: [[400, 215, 'pw'], [400, 385, 'pw']] });
    MAPS.warehouse = buildMap('warehouse', { name: 'Warehouse', desc: 'Corridors, doors and crate stacks. Tight lanes reward shotguns and flanks.', theme: 'concrete',
      walls: [[200, 0, 16, 190], [200, 410, 16, 190], [330, 90, 16, 130], [330, 380, 16, 130]], wins: [[200, 190, 16, 34], [200, 376, 16, 34]],
      crates: [[110, 90, 40, 40], [110, 470, 40, 40], [250, 280, 34, 40], [270, 130, 36, 36], [270, 434, 36, 36], [140, 280, 30, 30]], cratesMid: [[385, 250, 30, 20], [385, 330, 30, 20]],
      bags: [[90, 230, 14, 48], [90, 322, 14, 48], [290, 215, 40, 14], [290, 371, 40, 14]], bush: [[60, 60, 24], [60, 540, 24]],
      spawn: [[44, 250], [44, 300], [44, 350], [90, 300]], flag: [60, 300], pts: [[400, 300], [400, 90], [400, 510]], hills: [[400, 300], [400, 90], [400, 510]],
      pk: [[150, 200, 'hp'], [150, 400, 'hp'], [290, 60, 'sp'], [290, 540, 'sp']], pkMid: [[400, 235, 'pw'], [400, 365, 'dm']] });
    MAPS.crossroads = buildMap('crossroads', { name: 'Crossroads', desc: 'Symmetric. Four blocks around a sandbagged plaza. Control the middle.', theme: 'asphalt',
      walls: [[250, 140, 100, 90], [250, 370, 100, 90]], wins: [[250, 230, 100, 10], [250, 360, 100, 10]],
      bags: [[120, 270, 14, 60], [150, 100, 50, 14], [150, 486, 50, 14], [370, 250, 14, 24], [370, 326, 14, 24]], bagsMid: [[385, 262, 30, 12], [385, 326, 30, 12]],
      crates: [[200, 290, 30, 30], [330, 40, 30, 30], [330, 530, 30, 30]], bush: [[90, 80, 28], [90, 520, 28], [215, 200, 24], [215, 400, 24]], bushMid: [[400, 40, 24], [400, 560, 24]],
      spawn: [[44, 240], [44, 290], [44, 340], [44, 390]], flag: [70, 300], pts: [[400, 300], [400, 90], [400, 510]], hills: [[400, 300], [400, 90], [400, 510]],
      pk: [[180, 160, 'hp'], [180, 440, 'hp'], [310, 300, 'sp']], pkMid: [[400, 175, 'pw'], [400, 425, 'dm']] });
    MAPS.ruins = buildMap('ruins', { name: 'Ruins', desc: 'Broken walls, thick brush and a river with one crossing. Hide, ambush, hold the ford.', theme: 'stone',
      walls: [[140, 110, 70, 14], [140, 110, 14, 70], [260, 230, 14, 60], [100, 420, 14, 70], [100, 476, 80, 14], [230, 480, 60, 14]], wins: [[210, 110, 30, 14], [260, 290, 14, 24]],
      waterMid: [[372, 0, 56, 215], [372, 385, 56, 215]], bags: [[330, 296, 14, 28]], bagsMid: [[386, 255, 28, 12], [386, 333, 28, 12]],
      crates: [[170, 300, 30, 30], [300, 520, 30, 30]], bush: [[100, 250, 34], [200, 200, 28], [180, 380, 30], [310, 150, 26], [320, 450, 26], [60, 100, 26]],
      spawn: [[44, 240], [44, 290], [44, 340], [44, 390]], flag: [70, 300], pts: [[400, 300], [400, 105], [400, 495]], hills: [[400, 300], [330, 100], [330, 500]],
      pk: [[220, 330, 'hp'], [100, 540, 'sp'], [340, 40, 'dm']], pkMid: [[400, 300, 'pw']] });
    MAPS.scrapyard = buildMap('scrapyard', { name: 'Scrapyard', desc: 'Wrecks, junk piles and oily mud. Lots of breakable cover, so grenades rule.', theme: 'rust',
      walls: [[300, 250, 60, 36], [140, 140, 80, 22], [140, 440, 80, 22]], bags: [[80, 220, 14, 40], [80, 340, 14, 40], [230, 60, 50, 14], [230, 526, 50, 14]],
      crates: [[100, 90, 40, 30], [190, 220, 30, 30], [240, 320, 50, 24], [130, 380, 36, 36], [300, 110, 30, 50], [290, 440, 50, 30], [210, 520, 34, 34], [210, 40, 34, 34]], cratesMid: [[375, 150, 50, 24], [375, 426, 50, 24]],
      mud: [[170, 250, 100, 70], [300, 330, 60, 50]], mudMid: [[360, 270, 80, 60]], bush: [[50, 120, 26], [50, 480, 26]], wins: [[300, 286, 60, 10]],
      spawn: [[44, 250], [44, 300], [44, 350], [90, 300]], flag: [60, 330], pts: [[400, 300], [400, 90], [400, 510]], hills: [[400, 300], [400, 90], [400, 510]],
      pk: [[150, 300, 'hp'], [270, 200, 'sp'], [270, 400, 'dm']], pkMid: [[400, 205, 'pw'], [400, 395, 'pw']] });
    const MAP_ORDER = ['yard', 'warehouse', 'crossroads', 'ruins', 'scrapyard'];
    const THEMES = {   // ground colour, speckle, accent
      grass: { g: '#34452a', s: '#3d5130', s2: '#2b3b22', edge: '#1c2616' }, concrete: { g: '#3b3c40', s: '#44454a', s2: '#323337', edge: '#1c1c1f' },
      asphalt: { g: '#2f3033', s: '#37383c', s2: '#28292c', edge: '#17171a' }, stone: { g: '#42402f', s: '#4a4835', s2: '#37352a', edge: '#1f1e15' }, rust: { g: '#4a3626', s: '#573f2c', s2: '#3b2a1d', edge: '#21160e' } };

    // ================================================================ A. WEAPONS (PvP balance layer)
    // Everything is normalised: 100 HP players, time to kill 2-4s, no one-shots. cd/life in ticks (60/s), spd in px/tick, dmg in HP.
    // t: gun | beam | mine | shield | turret | spray | arc | saw | lob | orbit | melee.  The table is keyed by main-file WEAPON_DATA ids; anything else
    // falls back to a generic archetype whose dps is derived from the raw stats and squashed into 26-42.
    const SCALE = {
      SLING:  { t: 'gun', cd: 22, dmg: 16, spd: 10, life: 36, spr: 0.025, r: 3, rng: 360 },
      NAIL:   { t: 'gun', cd: 7, dmg: 5.5, spd: 12, life: 28, spr: 0.07, r: 2.5, rng: 330 },
      MINES:  { t: 'mine', cd: 75, dmg: 42, rad: 62, max: 3, arm: 50, rng: 30 },
      SHIELD: { t: 'shield', cd: 0, arc: 1.25, red: 0.8, spdm: 0.6, rng: 40 },
      TURRET: { t: 'turret', cd: 540, dmg: 4, hp: 60, life: T(14), fcd: 14, rng: 240, max: 1 },
      RAIL:   { t: 'beam', cd: 100, dmg: 52, len: 900, rng: 600, pierce: 1 },
      SUMMON: { t: 'turret', drone: 1, cd: 600, dmg: 3.5, hp: 35, life: T(12), fcd: 12, rng: 200, max: 1 },
      HOSE:   { t: 'spray', cd: 4, dmg: 2.4, spd: 8, life: 17, spr: 0.14, r: 4, slow: 0.25, push: 0.35, rng: 140 },
      ARC:    { t: 'arc', cd: 42, dmg: 14, jumps: 2, range: 150, jr: 110, rng: 150 },
      SAWB:   { t: 'saw', cd: 62, dmg: 19, spd: 6.5, life: 70, bounce: 3, r: 7, rng: 300 },
      FIRE:   { t: 'lob', k: 'fire', cd: 150, dmg: 4.5, rad: 52, life: T(3.2), spd: 7, rng: 250 },
      DRONE:  { t: 'turret', drone: 1, n: 2, cd: 620, dmg: 3, hp: 25, life: T(7), fcd: 10, rng: 190, max: 2 },
      GRAV:   { t: 'lob', k: 'grav', cd: 420, dmg: 30, rad: 105, life: T(1.6), spd: 6.5, rng: 260 },
      ORBIT:  { t: 'orbit', cd: 440, dmg: 7, rad: 40, delay: T(0.9), life: T(1.6), rng: 400 },
      WEP_100: { t: 'melee', cd: 30, dmg: 28, arc: 1.4, reach: 44, rng: 44 },
      STD_PISTOL: { t: 'gun', cd: 18, dmg: 13, spd: 11, life: 36, spr: 0.03, r: 3, rng: 360, n: 'Sidearm', ic: '🎯' },
      STD_SMG: { t: 'gun', cd: 7, dmg: 5.2, spd: 12, life: 26, spr: 0.08, r: 2.5, rng: 300, n: 'SMG', ic: '🔫' },
      STD_SHOT: { t: 'gun', cd: 52, dmg: 7.5, pel: 6, spd: 10, life: 20, spr: 0.3, r: 3, rng: 190, n: 'Scattergun', ic: '💥' },
      ROCKET: { t: 'gun', cd: 50, dmg: 55, spd: 7, life: 60, spr: 0.01, r: 6, rad: 58, exp: 1, rng: 400, n: 'Rocket', ic: '🚀' }
    };
    const hashId = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
    const wcache = {};
    const wdef = (id) => {
      if (wcache[id]) return wcache[id];
      const WD = gl('WEAPON_DATA') || {}, m = WD[id] || {};
      let s = SCALE[id];
      if (!s) {   // generic fallback: pick a family from the id, derive dps from the raw stats, clamp hard (fused/admin weapons cannot dominate)
        const rawDps = (m.dmg || 40) / Math.max(0.15, (m.cooldown || 800) / 1000);
        const dps = cl(18 + Math.pow(Math.max(1, rawDps), 0.28) * 4, 26, 42), fam = hashId(String(id)) % 5;
        if (fam === 0) { const cd = 24; s = { t: 'gun', cd, dmg: dps * cd / 60, spd: 10, life: 36, spr: 0.04, r: 3, rng: 340 }; }
        else if (fam === 1) { const cd = 54; s = { t: 'gun', cd, dmg: dps * cd / 60 / 6 * 0.9, pel: 6, spd: 10, life: 20, spr: 0.3, r: 3, rng: 190 }; }
        else if (fam === 2) { const cd = 38; s = { t: 'gun', cd, dmg: dps * cd / 60 / 3, burst: 3, bgap: 4, spd: 11, life: 34, spr: 0.04, r: 3, rng: 330 }; }
        else if (fam === 3) { const cd = 11; s = { t: 'gun', cd, dmg: dps * cd / 60 * 0.85, spd: 12, life: 30, spr: 0.07, r: 2.5, rng: 320 }; }
        else { const cd = 28; s = { t: 'melee', cd, dmg: dps * cd / 60 * 1.1, arc: 1.4, reach: 46, rng: 46 }; }
      }
      const d = { id, ...s, n: s.n || m.label || String(id), ic: s.ic || m.icon || '🔫', col: m.color || '#d9a441' };
      return (wcache[id] = d);
    };
    const RANGE_FAM = (w) => (w.rng || 300);

    // ================================================================ A. KITS
    const KITS = {
      scout: { n: 'Scout', ic: '👟', col: '#6fd0a0', hp: 90, spd: 1.12, dcd: T(1.3), dmg: 1, red: 0, ab: { n: 'Burst', d: 'Point-blank shotgun blast', cd: T(8), ch: 1 }, pas: 'Fast and slippery: +12% speed, dash recharges 35% quicker.' },
      guardian: { n: 'Guardian', ic: '🛡', col: '#95afc0', hp: 130, spd: 0.9, dcd: T(2.1), dmg: 1, red: 0.15, ab: { n: 'Barricade', d: 'Drop a sandbag wall (2 charges)', cd: T(9), ch: 2 }, pas: 'Heavy: 130 HP, takes 15% less damage, a bit slower.' },
      medic: { n: 'Medic', ic: '💊', col: '#8fd16a', hp: 100, spd: 1.0, dcd: T(2), dmg: 0.85, red: 0, ab: { n: 'Heal pulse', d: 'Heals allies in range (and you)', cd: T(10), ch: 1 }, pas: 'Weaker gun (-15%), but revives teammates twice as fast and gets +50% from health packs.' },
      demo: { n: 'Demolisher', ic: '💣', col: '#ffb347', hp: 110, spd: 0.97, dcd: T(2.1), dmg: 1, red: 0, ab: { n: 'Frag grenade', d: 'Lobbed blast, wrecks cover (2 charges)', cd: T(7), ch: 2 }, pas: 'Explosives +25%, mines up to 5, blasts tear through cover.' }
    };
    const KIT_ORDER = ['scout', 'guardian', 'medic', 'demo'];
    const EMOTES = [['🩹', 'Help!', 'KeyZ'], ['⭐', 'Nice!', 'KeyX'], ['💥', 'Danger!', 'KeyC'], ['🎯', 'On me!', 'KeyV']];
    const DIFFS = { easy: { n: 'Easy', rt: 40, err: 0.28, turn: 0.07, dmg: 0.8, hp: 0.9, dash: 0.2, lead: 0 }, normal: { n: 'Normal', rt: 24, err: 0.15, turn: 0.1, dmg: 0.95, hp: 1, dash: 0.45, lead: 0.4 },
      hard: { n: 'Hard', rt: 14, err: 0.08, turn: 0.15, dmg: 1, hp: 1, dash: 0.7, lead: 0.8 }, brutal: { n: 'Brutal', rt: 8, err: 0.035, turn: 0.22, dmg: 1.05, hp: 1.1, dash: 0.9, lead: 1 } };
    const BOT_NAMES = ['Rusty', 'Gravel', 'Sparks', 'Mortar', 'Dingo', 'Pebble', 'Ratchet', 'Boomer', 'Flint', 'Scrap', 'Tango', 'Nova'];
    const STD_LOADOUT = ['STD_PISTOL', 'STD_SMG', 'STD_SHOT'];
    window.PVP_DATA = { MAPS, KITS, SCALE, wdef };   // exposed so tests and tweaks can read them

    // ================================================================ B. GEOMETRY
    const segRect = (x1, y1, x2, y2, r) => {   // segment vs rect: entry t in 0..1 or -1
      let t0 = 0, t1 = 1; const d = [x2 - x1, y2 - y1], o = [x1, y1];
      for (let i = 0; i < 2; i++) {
        const p = d[i], lo = r[i], hi = r[i] + r[i + 2];
        if (Math.abs(p) < 1e-9) { if (o[i] < lo || o[i] > hi) return -1; }
        else { let ta = (lo - o[i]) / p, tb = (hi - o[i]) / p; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return -1; }
      }
      return t0;
    };
    const inRect = (x, y, r, pad) => x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad;
    const pushOut = (e, r, rad) => {
      const cx = cl(e.x, r[0], r[0] + r[2]), cy = cl(e.y, r[1], r[1] + r[3]); let dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= rad * rad) return false;
      if (d2 < 1e-6) {   // centre inside the rect: leave through the nearest side
        const l = e.x - r[0], rt = r[0] + r[2] - e.x, u = e.y - r[1], dn = r[1] + r[3] - e.y, m = Math.min(l, rt, u, dn);
        if (m === l) e.x = r[0] - rad; else if (m === rt) e.x = r[0] + r[2] + rad; else if (m === u) e.y = r[1] - rad; else e.y = r[1] + r[3] + rad; return true;
      }
      const d = Math.sqrt(d2), k = (rad - d) / d; e.x += dx * k; e.y += dy * k; return true;
    };

    // ================================================================ B. STATE
    let S = null;          // the match (host sim or guest mirror). null when no match is running
    let LB = null;         // lobby settings (host) / mirror (guest)
    let loopId = 0, running = false, mouse = { x: 400, y: 300, down: false, rdown: false, on: false }, sbOn = false;
    const bgCache = {};

    const solidsOf = (S_) => { const a = S_.map.walls.concat(S_.map.wins); return a; };
    const newMatch = (cfg) => {   // cfg: {mode,mapId,rules,diff,lim,ts, roster:[{name,team,kit,bot,uid,look,loadout}], role}
      const map = MAPS[cfg.mapId] || MAPS.yard;
      const s = { role: cfg.role, cfg, mode: cfg.mode, map, tick: 0, ph: 'count', phT: T(4), time: 0, lim: cfg.lim, score: [0, 0], rw: [0, 0], round: 1, pl: [], bul: [], hz: [], mines: [], dep: [], pk: [], flags: [], fx: [], pops: [], feed: [], shake: 0, ev: [], evSeq: 0, banner: null,
        bagsAll: [], solid: [], navDirty: true, nav: null, me: -1, zone: null, spec: -1, msgs: [], endInfo: null, hit: 0, cmdQ: [], seq: 0, hist: [], stats: null, tok: [0, 0], lastSnap: 0, kills: [0, 0] };
      const defs = [];
      map.bags.forEach((r) => defs.push({ x: r[0], y: r[1], w: r[2], h: r[3], k: 'bag', hp: 90, mhp: 90 }));
      map.crates.forEach((r) => defs.push({ x: r[0], y: r[1], w: r[2], h: r[3], k: 'crate', hp: 160, mhp: 160 }));
      s.bagsAll = defs;
      s.timeMax = cfg.mode === 'elim' ? T(95) : T(cfg.mode === 'ctf' ? 480 : 420);
      s.time = s.timeMax;
      cfg.roster.forEach((r, i) => s.pl.push(mkPlayer(s, r, i)));
      resetRound(s, true);
      return s;
    };
    const mkPlayer = (s, r, i) => {
      const k = KITS[r.kit] || KITS.scout, df = DIFFS[s.cfg.diff] || DIFFS.normal;
      const p = { i, name: r.name || 'P' + i, team: r.team, kit: KITS[r.kit] ? r.kit : 'scout', bot: !!r.bot, uid: r.uid || '', look: r.look || null, conn: null, loadout: (r.loadout && r.loadout.length ? r.loadout : STD_LOADOUT).slice(0, 3),
        x: 0, y: 0, dx: 0, dy: 0, aim: r.team ? Math.PI : 0, hp: 100, mhp: 100, os: 0, alive: false, rt: 0, wi: 0, cds: [0, 0, 0, 0], abCd: 0, abCh: k.ab.ch, abRech: 0, dashT: 0, dashCD: 0, dashX: 0, dashY: 0, inv: 0, spawnInv: 0,
        in: { mx: 0, my: 0, aim: 0, fire: false, ab: false, use: false, slot: -1, tx: 0, ty: 0 }, lastSlot: -1, abLatch: false, boost: { spd: 0, dmg: 0 }, slowT: 0, wet: 0, rev: 0, rvT: 0, em: 0, emT: 0, burst: 0, burstT: 0, pwAmmo: 0, shielding: false, carry: -1, tok: 0, streak: 0, lastHit: {}, kills: 0, deaths: 0, assists: 0, dmg: 0, caps: 0, heals: 0, score: 0, zoneT: 0, bonus: 0,
        sx: 0, sy: 0, seq: 0, ack: 0, mvBank: 0, mvT: 0, ai: r.bot ? mkAI(df) : null, ox: 0, oy: 0, tx: 0, ty: 0, vis: 1, cdv: 0, hitF: 0, fl: 0, lastFire: -999, tkc: 0 };
      p.mhp = Math.round(k.hp * (p.bot ? df.hp : 1)); p.hp = p.mhp;
      return p;
    };
    const mkAI = (df) => ({ df, tgt: -1, tgtT: 0, react: 0, path: null, pi: 0, goal: null, gT: 0, strafe: rnd() < 0.5 ? 1 : -1, sT: 0, lane: rnd() * 2 - 1, stuck: 0, lx: 0, ly: 0, think: (rnd() * 6) | 0, wantAim: 0, role: 'atk', fireHold: 0, lastSeen: null });

    const spawnFor = (s, p) => {
      const list = s.map.sp[p.team], mates = s.pl.filter((q) => q.team === p.team);
      let idx = mates.indexOf(p) % list.length, best = null, bd = -1;
      for (let k = 0; k < list.length; k++) {   // prefer the spawn point furthest from enemies
        const c = list[(idx + k) % list.length]; let md = 1e9; s.pl.forEach((q) => { if (q.alive && q.team !== p.team) md = Math.min(md, hyp(q.x - c[0], q.y - c[1])); });
        if (s.ph === 'count' || s.mode === 'elim') { best = list[idx]; break; }
        if (md > bd) { bd = md; best = c; }
      }
      return [best[0] + (rnd() - 0.5) * 16, best[1] + (rnd() - 0.5) * 16];
    };
    const rebuildSolids = (s) => {
      s.solid = s.map.walls.concat(s.map.wins); s.bagsAll.forEach((b) => { if (b.hp > 0) s.solid.push([b.x, b.y, b.w, b.h, b]); });
      s.blockers = s.map.walls.map((w) => w).concat(s.bagsAll.filter((b) => b.hp > 0).map((b) => [b.x, b.y, b.w, b.h, b]));   // bullets + sight (windows excluded)
      s.navDirty = true;
    };
    const resetRound = (s, first) => {
      s.bagsAll = s.bagsAll.filter((b) => !b.dep); s.bagsAll.forEach((b) => { b.hp = b.mhp; });
      rebuildSolids(s); s.bul.length = 0; s.hz.length = 0; s.mines.length = 0; s.dep.length = 0;
      s.pk = s.map.pk.map((p, i) => ({ i, x: p[0], y: p[1], k: p[2], t: 0 }));
      s.flags = [0, 1].map((t) => ({ team: t, hx: s.map.flag[t][0], hy: s.map.flag[t][1], x: s.map.flag[t][0], y: s.map.flag[t][1], c: -1, dropT: 0, home: 1 }));
      s.time = s.timeMax;
      s.zone = null;
      if (s.mode === 'koth') s.zone = { hi: 0, prog: [0, 0], own: -1, moveT: T(45), cont: 0 };
      if (s.mode === 'dom') s.zone = { pts: s.map.pts.map((p) => ({ x: p[0], y: p[1], own: -1, prog: 0 })) };
      if (s.mode === 'elim') s.zone = { r: 520, on: 0, cx: 400, cy: 300 };
      s.pl.forEach((p) => {
        const k = KITS[p.kit], sp = spawnFor(s, p);
        p.x = p.dx = sp[0]; p.y = p.dy = sp[1]; p.alive = true; p.hp = p.mhp; p.os = 0; p.rt = 0; p.cds = [0, 0, 0, 0]; p.abCd = 0; p.abCh = k.ab.ch; p.dashT = 0; p.dashCD = 0; p.inv = 0; p.spawnInv = T(2); p.aim = p.team ? Math.PI : 0; p.carry = -1; p.pwAmmo = 0; p.burst = 0; p.boost = { spd: 0, dmg: 0 }; p.slowT = 0; p.lastHit = {}; p.rev = 0; p.rvT = 0; p.shielding = false; p.hitF = 0;
        if (first || s.mode === 'elim') p.streak = 0;
        if (p.ai) { p.ai.path = null; p.ai.tgt = -1; p.ai.react = 0; }
      });
      if (s.mode === 'elim') s.tok = [1, 1];
    };

    // ---- queries
    const solidAt = (s, x, y, pad) => { for (const r of s.solid) if (inRect(x, y, r, pad)) return r; return null; };
    const bushOf = (s, x, y) => { for (const b of s.map.bush) if (hyp(x - b[0], y - b[1]) < b[2] - 4) return b; return null; };
    const zoneMul = (s, x, y) => { for (const r of s.map.mud) if (inRect(x, y, r, 0)) return 0.55; for (const r of s.map.water) if (inRect(x, y, r, 0)) return 0.72; return 1; };
    const losClear = (s, x1, y1, x2, y2) => { for (const r of s.blockers) if (segRect(x1, y1, x2, y2, r) >= 0) return false; return true; };
    const kitOf = (p) => KITS[p.kit] || KITS.scout;
    const curW = (p) => (p.wi === 3 ? wdef('ROCKET') : wdef(p.loadout[p.wi] || p.loadout[0]));
    const addEv = (s, a) => { s.evSeq++; s.ev.push([s.evSeq, ...a]); if (s.ev.length > 60) s.ev.shift(); handleEv(s, [s.evSeq, ...a], true); };

    // ---- movement: one call = one 1/60s step. Used identically by the host sim, bots and the guest's prediction.
    const SPD = 2.55;
    const stepMove = (s, p, mx, my, dashReq) => {
      if (!p.alive) return;
      const k = kitOf(p);
      if (p.dashCD > 0) p.dashCD--;
      if (dashReq && p.dashCD <= 0 && p.dashT <= 0 && !p.frozen) {
        let dx = mx, dy = my; if (!dx && !dy) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
        const l = hyp(dx, dy) || 1; p.dashX = dx / l; p.dashY = dy / l; p.dashT = 10; p.dashCD = k.dcd; p.inv = 8;
        if (s.role !== 'guest' || p.i === s.me) addEv(s, ['d', p.i, Math.round(p.x), Math.round(p.y)]);
      }
      let vx, vy;
      if (p.dashT > 0) { p.dashT--; vx = p.dashX * 9; vy = p.dashY * 9; if (p.inv > 0) p.inv--; }
      else {
        if (p.inv > 0) p.inv--;
        const l = hyp(mx, my); if (l > 1) { mx /= l; my /= l; }
        const sp = SPD * k.spd * (1 + (p.boost.spd > 0 ? 0.3 : 0)) * zoneMul(s, p.x, p.y) * (p.slowT > 0 ? 0.7 : 1) * (p.shielding ? 0.6 : 1) * (p.carry >= 0 ? 0.92 : 1);
        vx = mx * sp; vy = my * sp;
      }
      p.x += vx; resolve(s, p); p.y += vy; resolve(s, p);
      p.x = cl(p.x, PR, W - PR); p.y = cl(p.y, PR, H - PR);
    };
    const resolve = (s, p) => { for (let it = 0; it < 2; it++) for (const r of s.solid) pushOut(p, r, PR); };

    // ================================================================ B. DAMAGE
    const dmgP = (s, t, amt, src, kind, from) => {   // returns damage actually dealt
      if (!t.alive || amt <= 0 || t.inv > 0 || t.spawnInv > 0) return 0;
      if (src && src.team === t.team && src !== t) return 0;   // friendly fire OFF
      const k = kitOf(t); amt *= 1 - k.red;
      if (t.shielding && from != null) {   // frontal shield: bullets from inside the arc are mostly blocked
        let a = Math.atan2(from[1] - t.y, from[0] - t.x) - t.aim; a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) < 1.25) { amt *= 0.2; addEv(s, ['sh', Math.round(t.x), Math.round(t.y), Math.round(t.aim * 100)]); }
      }
      if (t.os > 0) { const o = Math.min(t.os, amt); t.os -= o; amt -= o; }
      amt = Math.min(amt, t.hp + 0.01);
      t.hp -= amt; t.hitF = 6; t.fl |= 0;
      if (src && src !== t) {
        src.dmg += amt; t.lastHit[src.i] = s.tick; src.score += amt * 0.5;
        addEv(s, ['h', t.i, src.i, Math.round(amt), Math.round(t.x), Math.round(t.y - 16)]);
        t.rev = 30; src.rvT = 0;
      } else addEv(s, ['h', t.i, -1, Math.round(amt), Math.round(t.x), Math.round(t.y - 16)]);
      if (t.hp <= 0.01) killP(s, t, src, kind);
      return amt;
    };
    const killP = (s, t, src, kind) => {
      t.hp = 0; t.alive = false; t.deaths++; const was = t.streak; t.streak = 0;
      const mates = s.pl.filter((q) => q.team === t.team && q !== t);
      let killer = src && src !== t && src.team !== t.team ? src : null;
      const asst = []; for (const id in t.lastHit) { const q = s.pl[id]; if (q && q !== killer && q.team !== t.team && s.tick - t.lastHit[id] < T(6)) asst.push(q); }
      if (killer) { killer.kills++; killer.streak++; killer.score += 100; s.kills[killer.team]++; }
      asst.forEach((q) => { q.assists++; q.score += 40; q.tok = Math.min(1, q.tok + 1); if (s.mode === 'elim') s.tok[q.team] = Math.min(2, s.tok[q.team] + (q.assists % 3 === 0 ? 1 : 0)); });
      if (t.carry >= 0) dropFlag(s, t);
      const lead = s.score[t.team ^ 1] - s.score[t.team];
      t.rt = s.mode === 'elim' ? 0 : T(s.mode === 'ctf' ? 5 : 4) * (lead >= 5 ? 0.6 : 1) * (t.tok > 0 ? 0.5 : 1); if (t.tok > 0 && s.mode !== 'elim') t.tok--;
      t.rt = Math.round(t.rt); t.corpse = { x: t.x, y: t.y };
      addEv(s, ['k', t.i, killer ? killer.i : -1, asst[0] ? asst[0].i : -1, Math.round(t.x), Math.round(t.y), kind || 'gun']);
      if (killer) {
        if (s.mode === 'tdm') s.score[killer.team]++;
        if (killer.streak === 3) { killer.os = Math.min(40, killer.os + 30); addEv(s, ['st', killer.i, 3]); }
        if (killer.streak === 5) { killer.boost.spd = T(10); killer.boost.dmg = T(10); addEv(s, ['st', killer.i, 5]); }
        if (killer.streak === 7) { killer.pwAmmo += 3; killer.hp = killer.mhp; addEv(s, ['st', killer.i, 7]); }
        s.shake = Math.max(s.shake, killer.i === s.me ? 7 : 3);
      }
      if (s.mode === 'tdm' && killer && s.score[killer.team] >= s.lim) endMatch(s, killer.team, 'Score limit reached');
    };
    const dropFlag = (s, p) => { const f = s.flags[p.carry]; if (f) { f.c = -1; f.x = p.x; f.y = p.y; f.dropT = T(15); f.home = 0; addEv(s, ['fd', f.team, p.i]); } p.carry = -1; };
    const damageCover = (s, x, y, rad, amt, mulBag) => {
      let changed = false;
      for (const b of s.bagsAll) {
        if (b.hp <= 0) continue;
        const cx = cl(x, b.x, b.x + b.w), cy = cl(y, b.y, b.y + b.h), d = hyp(x - cx, y - cy);
        if (d < rad) { b.hp -= amt * (1 - d / rad * 0.5) * mulBag; if (b.hp <= 0) { b.hp = 0; changed = true; addEv(s, ['br', Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2), b.k === 'bag' ? 0 : 1]); } else b.flash = 6; }
      }
      if (changed) rebuildSolids(s);
    };
    const explode = (s, x, y, rad, dmg, own, kind, coverMul) => {
      addEv(s, ['x', Math.round(x), Math.round(y), Math.round(rad)]);
      const mul = own && own.kit === 'demo' ? 1.25 : 1;
      for (const t of s.pl) {
        if (!t.alive) continue; const d = hyp(t.x - x, t.y - y); if (d > rad + PR) continue;
        if (!losClear(s, x, y, t.x, t.y) && d > 22) continue;
        const f = 1 - Math.min(1, d / (rad + PR)) * 0.5; dmgP(s, t, dmg * mul * f * (own && own.boost.dmg > 0 ? 1.3 : 1), own, kind, [x, y]);
        if (t.alive) { const a = Math.atan2(t.y - y, t.x - x); t.x += Math.cos(a) * 6; t.y += Math.sin(a) * 6; resolve(s, t); }
      }
      damageCover(s, x, y, rad + 10, dmg * 1.4 * (coverMul || 1) * mul, own && own.kit === 'demo' ? 1.5 : 1);
      s.mines = s.mines.filter((m) => !(m.hp !== undefined && 0));
      s.shake = Math.max(s.shake, 5);
    };

    // ================================================================ B. WEAPON FIRE
    const addBul = (s, p, x, y, a, w, over) => {
      const sp = (w.spd || 10) * (p.bot ? 1 : 1);
      const dm = (w.dmg || 1) * kitOf(p).dmg * (p.boost.dmg > 0 ? 1.3 : 1) * (p.ai ? p.ai.df.dmg : 1);
      s.bul.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: dm, own: p.i, team: p.team, life: w.life || 30, r: w.r || 3, k: 'b', exp: w.exp ? w : null, bounce: w.bounce || 0, slow: w.slow || 0, push: w.push || 0, ox: x, oy: y, fam: w.t, ...over });
    };
    const useMine = (s, p, w) => {
      const mine = s.mines.filter((m) => m.own === p.i), mx = p.kit === 'demo' ? 5 : w.max;
      if (mine.length >= mx) { const o = s.mines.indexOf(mine[0]); s.mines.splice(o, 1); }
      s.mines.push({ x: p.x + Math.cos(p.aim) * 20, y: p.y + Math.sin(p.aim) * 20, own: p.i, team: p.team, arm: w.arm, w });
    };
    const fireWeapon = (s, p) => {   // called when the cooldown for the current weapon is ready and the player pulls the trigger
      const w = curW(p), ox = p.x + Math.cos(p.aim) * 14, oy = p.y + Math.sin(p.aim) * 14;
      let cd = w.cd, did = true;
      p.lastFire = s.tick; p.rev = Math.max(p.rev, 50);
      switch (w.t) {
        case 'gun': {
          const n = w.pel || 1;
          if (w.burst && !p.burst) { p.burst = w.burst - 1; p.burstT = w.bgap || 4; }
          for (let i = 0; i < n; i++) addBul(s, p, ox, oy, p.aim + (rnd() - 0.5) * 2 * (w.spr || 0), w);
          addEv(s, ['f', p.i, Math.round(p.aim * 100), w.exp ? 2 : (n > 1 ? 1 : 0)]); break;
        }
        case 'spray': addBul(s, p, ox, oy, p.aim + (rnd() - 0.5) * 2 * w.spr, w, { k: 'w' }); if (s.tick % 6 === 0) addEv(s, ['f', p.i, Math.round(p.aim * 100), 3]); break;
        case 'saw': addBul(s, p, ox, oy, p.aim, w, { k: 's' }); addEv(s, ['f', p.i, Math.round(p.aim * 100), 0]); break;
        case 'beam': beamShot(s, p, w); break;
        case 'mine': useMine(s, p, w); break;
        case 'arc': arcShot(s, p, w); break;
        case 'melee': meleeSwing(s, p, w); break;
        case 'lob': lobAt(s, p, w, w.k); break;
        case 'orbit': { const d = Math.min(w.rng, hyp(p.in.tx - p.x, p.in.ty - p.y)); const tx = cl(p.x + Math.cos(p.aim) * d, 20, W - 20), ty = cl(p.y + Math.sin(p.aim) * d, 20, H - 20); s.hz.push({ k: 'o', x: tx, y: ty, r: w.rad, t: w.delay + w.life, w0: w.delay, own: p.i, team: p.team, dmg: w.dmg * kitOf(p).dmg, tk: 0 }); break; }
        case 'turret': {
          const mine = s.dep.filter((d) => d.own === p.i && d.k === 'turret'); const n = w.n || 1;
          while (mine.length + n > (w.max || 1) && mine.length) { s.dep.splice(s.dep.indexOf(mine.shift()), 1); }
          for (let i = 0; i < n; i++) s.dep.push({ k: 'turret', drone: w.drone ? 1 : 0, x: p.x + Math.cos(p.aim + i * 2.1) * 26, y: p.y + Math.sin(p.aim + i * 2.1) * 26, own: p.i, team: p.team, hp: w.hp, t: w.life, cd: 20, w, ang: p.aim, ph: i });
          break;
        }
        case 'shield': did = false; break;
        default: did = false;
      }
      if (did) p.cds[p.wi] = Math.max(1, Math.round(cd * (p.bot ? 1.1 : 1)));
    };
    const beamShot = (s, p, w) => {
      const a = p.aim, x1 = p.x, y1 = p.y; let len = w.len; const ex = Math.cos(a), ey = Math.sin(a);
      for (const r of s.blockers) { const t = segRect(x1, y1, x1 + ex * len, y1 + ey * len, r); if (t >= 0) len = Math.min(len, t * len); }
      const dm = w.dmg * kitOf(p).dmg * (p.boost.dmg > 0 ? 1.3 : 1) * (p.ai ? p.ai.df.dmg : 1);
      for (const t of s.pl) {
        if (!t.alive || t.team === p.team) continue;
        const px = t.x - x1, py = t.y - y1, pr = px * ex + py * ey; if (pr < 0 || pr > len) continue;
        const d = Math.abs(px * ey - py * ex); if (d < PR + 2) dmgP(s, t, dm, p, 'rail', [x1, y1]);
      }
      let hitC = null; const x2 = x1 + ex * len, y2 = y1 + ey * len;
      for (const b of s.bagsAll) if (b.hp > 0 && inRect(x2, y2, [b.x, b.y, b.w, b.h], 3)) hitC = b;
      if (hitC) damageCover(s, x2, y2, 4, 30, 1);
      addEv(s, ['rl', Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), p.team]);
    };
    const arcShot = (s, p, w) => {
      const dm = w.dmg * kitOf(p).dmg * (p.boost.dmg > 0 ? 1.3 : 1); let from = p, pts = [[p.x, p.y]], hit = new Set();
      for (let j = 0; j <= w.jumps; j++) {
        let best = null, bd = j ? w.jr : w.range;
        for (const t of s.pl) {
          if (!t.alive || t.team === p.team || hit.has(t) || t.inv > 0) continue;
          const d = hyp(t.x - from.x, t.y - from.y); if (d > bd) continue;
          if (j === 0) { let a = Math.atan2(t.y - p.y, t.x - p.x) - p.aim; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) > 0.5) continue; }
          if (!losClear(s, from.x, from.y, t.x, t.y)) continue; best = t; bd = d;
        }
        if (!best) break; hit.add(best); dmgP(s, best, dm * (1 - j * 0.2), p, 'arc', [from.x, from.y]); pts.push([best.x, best.y]); from = best;
      }
      if (pts.length === 1) pts.push([p.x + Math.cos(p.aim) * 70, p.y + Math.sin(p.aim) * 70]);
      addEv(s, ['ar', p.team, pts.map((q) => Math.round(q[0]) + ',' + Math.round(q[1])).join(' ')]);
    };
    const meleeSwing = (s, p, w) => {
      const dm = w.dmg * kitOf(p).dmg * (p.boost.dmg > 0 ? 1.3 : 1);
      for (const t of s.pl) {
        if (!t.alive || t.team === p.team) continue; const d = hyp(t.x - p.x, t.y - p.y); if (d > w.reach + PR) continue;
        let a = Math.atan2(t.y - p.y, t.x - p.x) - p.aim; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) < w.arc / 2 && losClear(s, p.x, p.y, t.x, t.y)) dmgP(s, t, dm, p, 'melee', [p.x, p.y]);
      }
      damageCover(s, p.x + Math.cos(p.aim) * 28, p.y + Math.sin(p.aim) * 28, 22, 12, 1);
      addEv(s, ['sw', p.i, Math.round(p.aim * 100)]);
    };
    const lobAt = (s, p, w, kind, over) => {
      const d = cl(hyp(p.in.tx - p.x, p.in.ty - p.y), 50, w.rng || 260), a = p.aim;
      let tx = p.x + Math.cos(a) * d, ty = p.y + Math.sin(a) * d; tx = cl(tx, 14, W - 14); ty = cl(ty, 14, H - 14);
      // stops short of a wall on the way
      for (const r of s.blockers) { const t = segRect(p.x, p.y, tx, ty, r); if (t >= 0 && t < 1) { tx = p.x + (tx - p.x) * Math.max(0.05, t - 0.04); ty = p.y + (ty - p.y) * Math.max(0.05, t - 0.04); } }
      const sp = w.spd || 7, tt = Math.max(8, Math.round(hyp(tx - p.x, ty - p.y) / sp));
      s.bul.push({ x: p.x, y: p.y, vx: (tx - p.x) / tt, vy: (ty - p.y) / tt, k: 'l', lk: kind, life: tt, own: p.i, team: p.team, dmg: (w.dmg || 20) * kitOf(p).dmg * (p.boost.dmg > 0 ? 1.3 : 1), r: 5, rad: w.rad || 60, hl: w.life || 60, tx, ty, ...over });
      addEv(s, ['f', p.i, Math.round(a * 100), 4]);
    };

    // ================================================================ B. KIT ABILITIES
    const useAbility = (s, p) => {
      const k = kitOf(p), ab = k.ab; if (!p.alive || p.abCh <= 0) return false;
      if (p.kit === 'scout') {
        const w = { dmg: 9, spd: 10, life: 15, r: 3 };
        for (let i = 0; i < 7; i++) addBul(s, p, p.x + Math.cos(p.aim) * 12, p.y + Math.sin(p.aim) * 12, p.aim + (i - 3) * 0.1 + (rnd() - 0.5) * 0.05, w);
        addEv(s, ['f', p.i, Math.round(p.aim * 100), 1]); p.x -= Math.cos(p.aim) * 4; p.y -= Math.sin(p.aim) * 4; resolve(s, p); p.rev = 60;
      } else if (p.kit === 'guardian') {
        const hor = Math.abs(Math.sin(p.aim)) > 0.7, w_ = hor ? 58 : 14, h_ = hor ? 14 : 58, cx = p.x + Math.cos(p.aim) * 38, cy = p.y + Math.sin(p.aim) * 38;
        const r = [cx - w_ / 2, cy - h_ / 2, w_, h_];
        if (r[0] < 4 || r[1] < 4 || r[0] + w_ > W - 4 || r[1] + h_ > H - 4) return false;
        for (const q of s.solid) if (r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1]) return false;
        s.bagsAll.push({ x: r[0], y: r[1], w: w_, h: h_, k: 'bag', hp: 90, mhp: 90, dep: 1, team: p.team, t: T(28) }); rebuildSolids(s);
        addEv(s, ['dp', Math.round(cx), Math.round(cy)]);
      } else if (p.kit === 'medic') {
        let n = 0; addEv(s, ['hp', Math.round(p.x), Math.round(p.y), 120]);
        for (const q of s.pl) if (q.alive && q.team === p.team && hyp(q.x - p.x, q.y - p.y) < 120 && losClear(s, p.x, p.y, q.x, q.y)) {
          const amt = q === p ? 14 : 30, g = Math.min(amt, q.mhp - q.hp); if (g > 0) { q.hp += g; p.heals += g; p.score += g * 0.6; n++; addEv(s, ['hl', q.i, Math.round(g)]); }
        }
      } else if (p.kit === 'demo') {
        lobAt(s, p, { dmg: 55, rad: 70, spd: 7, rng: 270 }, 'frag', { fuse: 1 });
      }
      p.abCh--; if (p.abRech <= 0) p.abRech = ab.cd; p.abCd = T(0.5);
      return true;
    };

    // ================================================================ B. PICKUPS
    const PKTYPES = { hp: { c: '#ff6b6b', ic: '💊', t: T(18) }, sp: { c: '#ffd966', ic: '⚡', t: T(24) }, dm: { c: '#ff9a3c', ic: '🔥', t: T(26) }, pw: { c: '#c77dff', ic: '🚀', t: T(38) } };
    const takePickup = (s, p, k) => {
      if (k.k === 'hp') { if (p.hp >= p.mhp) return false; const g = Math.min(p.mhp - p.hp, 45 * (p.kit === 'medic' ? 1.5 : 1)); p.hp += g; addEv(s, ['hl', p.i, Math.round(g)]); }
      else if (k.k === 'sp') p.boost.spd = T(7);
      else if (k.k === 'dm') p.boost.dmg = T(9);
      else if (k.k === 'pw') { p.pwAmmo += 3; p.wi = 3; }
      k.t = PKTYPES[k.k].t; addEv(s, ['pk', p.i, k.k]); return true;
    };

    // ================================================================ B. THE STEP (host)
    const hostInput = (s, p) => {   // the human host's local controls -> p.in
      const i = p.in;
      let mx = 0, my = 0; if (keys.KeyW || keys.ArrowUp) my--; if (keys.KeyS || keys.ArrowDown) my++; if (keys.KeyA || keys.ArrowLeft) mx--; if (keys.KeyD || keys.ArrowRight) mx++;
      mx += touch.mx; my += touch.my;
      const aimP = aimOf(p); i.aim = aimP.a; i.tx = aimP.tx; i.ty = aimP.ty; i.fire = !!(mouse.down || keys.KeyJ || touch.fire); i.ab = !!(keys.KeyE || mouse.rdown || touch.ab); i.use = !!(keys.KeyR);
      return { mx, my, dash: !!(keys.Space || keys.ShiftLeft || keys.ShiftRight || touch.dash) };
    };
    const aimOf = (p) => {
      if (touch.aim.on) { const a = touch.aim.a; return { a, tx: p.x + Math.cos(a) * 200, ty: p.y + Math.sin(a) * 200 }; }
      return { a: Math.atan2(mouse.y - p.y, mouse.x - p.x), tx: mouse.x, ty: mouse.y };
    };
    const step = (s) => {   // THE host tick. Everything goes through here; tests drive it with scripted inputs.
      s.tick++;
      const L = s.pl;
      if (s.ph === 'count') { if (--s.phT <= 0) { s.ph = 'play'; s.banner = { t: 'FIGHT!', sub: '', life: 70 }; addEv(s, ['bn', 'FIGHT!', '']); } L.forEach((p) => { p.dx = p.x; p.dy = p.y; }); return; }
      if (s.ph === 'rend') { if (--s.phT <= 0) { if (s.round > 1 || true) { s.round++; resetRound(s); s.ph = 'count'; s.phT = T(3); addEv(s, ['bn', 'ROUND ' + s.round, 'Get ready']); } } }
      if (s.ph === 'over') return;
      const playing = s.ph === 'play';
      // --- per-player systems
      for (const p of L) {
        if (p.hitF > 0) p.hitF--;
        if (p.emT > 0) p.emT--; else p.em = 0;
        if (p.rev > 0) p.rev--;
        if (p.spawnInv > 0) p.spawnInv--;
        if (p.slowT > 0) p.slowT--;
        if (p.boost.spd > 0) p.boost.spd--; if (p.boost.dmg > 0) p.boost.dmg--;
        if (!p.alive) {
          if (!playing) continue;
          if (s.mode !== 'elim' && p.rt > 0 && --p.rt <= 0) respawn(s, p);
          continue;
        }
        if (p.conn || p.bot || p === s.meP) { /* input already staged */ }
        let cmd = null; if (p.ai) cmd = aiThink(s, p); else if (p === s.meP) { cmd = hostInput(s, p); p.in.slot = ME.slot; if (ME.emT > 0) { if (!p.em) { p.em = ME.em; p.emT = 120; } ME.emT--; } }
        if (cmd && playing) stepMove(s, p, cmd.mx, cmd.my, cmd.dash);
        const inp = p.in;
        // cooldowns
        for (let q = 0; q < 4; q++) if (p.cds[q] > 0) p.cds[q]--;
        if (p.abCd > 0) p.abCd--;
        if (p.abCh < kitOf(p).ab.ch) { if (--p.abRech <= 0) { p.abCh++; p.abRech = p.abCh < kitOf(p).ab.ch ? kitOf(p).ab.cd : 0; } }
        // weapon select
        if (inp.slot !== p.lastSlot) { p.lastSlot = inp.slot; if (inp.slot >= 0 && inp.slot < 4 && inp.slot !== p.wi) { if (inp.slot < 3 && p.loadout[inp.slot]) p.wi = inp.slot; else if (inp.slot === 3 && p.pwAmmo > 0) p.wi = 3; } }
        if (p.wi === 3 && p.pwAmmo <= 0) p.wi = 0;
        p.aim = inp.aim;
        const w = curW(p);
        p.shielding = w.t === 'shield' && !!inp.fire && p.dashT <= 0;
        // fire
        if (playing && p.burst > 0 && --p.burstT <= 0) { const w2 = curW(p); addBul(s, p, p.x + Math.cos(p.aim) * 14, p.y + Math.sin(p.aim) * 14, p.aim + (rnd() - 0.5) * 2 * (w2.spr || 0), w2); addEv(s, ['f', p.i, Math.round(p.aim * 100), 0]); p.burst--; p.burstT = w2.bgap || 4; }
        if (playing && inp.fire && p.cds[p.wi] <= 0 && p.dashT <= 0 && w.t !== 'shield') {
          if (p.wi === 3) { if (p.pwAmmo > 0) { p.pwAmmo--; fireWeapon(s, p); } } else fireWeapon(s, p);
        }
        // ability
        if (playing && inp.ab && !p.abLatch && p.abCd <= 0) { p.abLatch = true; if (useAbility(s, p) && p.ai) p.ai.abT = 60; }
        if (!inp.ab) p.abLatch = false;
        // flags / pickups / mines
        if (playing) interact(s, p);
        // revive (elimination): hold R near a fallen teammate
        if (s.mode === 'elim' && playing) reviveTick(s, p);
        // bush: standing in brush reveals when shooting handled via p.rev
        p.inBush = !!bushOf(s, p.x, p.y);
        if (p.wet > 0) p.wet--;
      }
      // --- hazards / projectiles / deployables
      if (playing) {
        bulletsTick(s); hazardsTick(s); depTick(s); minesTick(s); pickupsTick(s); modeTick(s);
      }
      // temporary sandbags expire
      let expired = false; for (const b of s.bagsAll) if (b.dep && b.hp > 0 && --b.t <= 0) { b.hp = 0; expired = true; addEv(s, ['br', Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2), 0]); }
      if (expired) rebuildSolids(s);
      for (const b of s.bagsAll) if (b.flash > 0) b.flash--;
      L.forEach((p) => { p.dx = p.x; p.dy = p.y; });
      if (s.shake > 0) s.shake *= 0.86;
      if (s.banner && --s.banner.life <= 0) s.banner = null;
      s.fx = s.fx.filter((f) => --f.life > 0);
    };
    const respawn = (s, p) => { const sp = spawnFor(s, p); p.x = p.dx = sp[0]; p.y = p.dy = sp[1]; p.alive = true; p.hp = p.mhp; p.os = 0; p.spawnInv = T(2); p.abCh = kitOf(p).ab.ch; p.abRech = 0; p.abCd = 0; p.dashCD = 0; p.dashT = 0; p.pwAmmo = 0; p.wi = 0; p.lastHit = {}; p.cds = [0, 0, 0, 0]; if (p.ai) p.ai.path = null; addEv(s, ['sp', Math.round(p.x), Math.round(p.y)]); };
    const interact = (s, p) => {
      // pickups
      for (const k of s.pk) if (k.t <= 0 && hyp(k.x - p.x, k.y - p.y) < 20) takePickup(s, p, k);
      if (s.mode === 'ctf') {
        for (const f of s.flags) {
          if (f.c >= 0) continue; const d = hyp(f.x - p.x, f.y - p.y); if (d > 22) continue;
          if (f.team !== p.team) { f.c = p.i; p.carry = f.team; f.home = 0; addEv(s, ['fp', f.team, p.i]); }
          else if (!f.home) { f.x = f.hx; f.y = f.hy; f.home = 1; f.dropT = 0; p.score += 30; p.caps += 0; addEv(s, ['fr', f.team, p.i]); }
        }
        if (p.carry >= 0) {
          const own = s.flags[p.team];
          if (own.home && hyp(own.hx - p.x, own.hy - p.y) < 28) {
            const f = s.flags[p.carry]; f.c = -1; f.x = f.hx; f.y = f.hy; f.home = 1; p.carry = -1; p.caps++; p.score += 300; s.score[p.team]++; addEv(s, ['fc', p.team, p.i]);
            if (s.score[p.team] >= s.lim) endMatch(s, p.team, 'Flag captures reached');
          }
        }
      }
    };
    const reviveTick = (s, p) => {
      if (!p.in.use) { p.rvT = 0; return; }
      for (const q of s.pl) if (!q.alive && q.team === p.team && q.corpse && hyp(q.corpse.x - p.x, q.corpse.y - p.y) < 36 && s.tok[p.team] > 0) {
        p.rvT = (p.rvT || 0) + 1; if (p.rvT >= (p.kit === 'medic' ? 70 : 150)) { p.rvT = 0; s.tok[p.team]--; q.alive = true; q.hp = q.mhp * 0.5; q.x = q.corpse.x; q.y = q.corpse.y; resolve(s, q); q.spawnInv = T(1.5); q.rt = 0; q.abCh = kitOf(q).ab.ch; p.score += 80; addEv(s, ['rv', q.i, p.i]); }
        return;
      }
      p.rvT = 0;
    };
    const bulletsTick = (s) => {
      const B = s.bul;
      for (let bi = B.length - 1; bi >= 0; bi--) {
        const b = B[bi]; let dead = false;
        const steps = Math.max(1, Math.ceil(hyp(b.vx, b.vy) / 4)), sx = b.vx / steps, sy = b.vy / steps;
        for (let st = 0; st < steps && !dead; st++) {
          b.x += sx; b.y += sy;
          if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) { if (b.k === 's' && b.bounce > 0) { if (b.x < 0 || b.x > W) b.vx *= -1, sx_(b), b.bounce--; else b.vy *= -1, b.bounce--; b.x = cl(b.x, 1, W - 1); b.y = cl(b.y, 1, H - 1); break; } dead = true; break; }
          if (b.k === 'l') continue;   // lobbed things fly over cover
          // cover
          for (const r of s.blockers) if (inRect(b.x, b.y, r, b.r * 0.5)) {
            if (b.k === 's' && b.bounce > 0) {   // saw: bounce off the face we hit
              b.x -= sx; b.y -= sy; const inX = inRect(b.x + sx * 2, b.y, r, 0), inY = inRect(b.x, b.y + sy * 2, r, 0);
              if (inX) b.vx *= -1; if (inY) b.vy *= -1; if (!inX && !inY) { b.vx *= -1; b.vy *= -1; } b.bounce--; if (r[4]) damageCover(s, b.x, b.y, 6, 14, 1); break;
            }
            if (b.exp) { dead = 'x'; break; }
            if (r[4]) damageCover(s, b.x, b.y, 3, b.dmg * 0.8, 1);
            addEv(s, ['hw', Math.round(b.x), Math.round(b.y), r[4] ? (r[4].k === 'bag' ? 1 : 2) : 0]); dead = true; break;
          }
          if (dead) break;
          // players
          for (const t of s.pl) {
            if (!t.alive || t.team === b.team) continue;
            if (hyp(t.x - b.x, t.y - b.y) < PR + b.r) {
              if (t.dashT > 0 && t.inv > 0) continue;
              if (b.k === 's') { b.hits = b.hits || {}; if (b.hits[t.i] > s.tick - 30) continue; b.hits[t.i] = s.tick; }
              const src = s.pl[b.own];
              if (b.exp) { dead = 'x'; break; }
              dmgP(s, t, b.dmg, src, 'gun', [b.ox, b.oy]);
              if (b.slow) t.slowT = 40; if (b.push) { t.x += b.vx * b.push; t.y += b.vy * b.push; resolve(s, t); }
              if (b.k === 's') { b.life -= 12; }
              dead = b.k === 's' ? false : true; if (dead) addEv(s, ['hw', Math.round(b.x), Math.round(b.y), 0]); break;
            }
          }
          // deployables
          if (!dead) for (const d of s.dep) { if (d.team !== b.team && hyp(d.x - b.x, d.y - b.y) < 12) { d.hp -= b.dmg; dead = !b.exp; if (b.exp) dead = 'x'; if (d.hp <= 0) addEv(s, ['x', Math.round(d.x), Math.round(d.y), 22]); break; } }
        }
        if (dead === 'x') { const w = b.exp; explode(s, b.x, b.y, w.rad, b.dmg, s.pl[b.own], 'rocket', 1.2); }
        if (!dead && --b.life <= 0) {
          if (b.k === 'l') { landLob(s, b); dead = true; } else if (b.exp) { explode(s, b.x, b.y, b.exp.rad, b.dmg, s.pl[b.own], 'rocket', 1.2); dead = true; } else dead = true;
        }
        if (dead) B.splice(bi, 1);
      }
      s.dep = s.dep.filter((d) => d.hp > 0);
    };
    const sx_ = () => {};
    const landLob = (s, b) => {
      const own = s.pl[b.own];
      if (b.lk === 'frag') explode(s, b.x, b.y, b.rad, b.dmg, own, 'frag', 2.2);
      else if (b.lk === 'fire') { s.hz.push({ k: 'f', x: b.x, y: b.y, r: b.rad, t: b.hl, own: b.own, team: b.team, dmg: b.dmg, tk: 0 }); addEv(s, ['x', Math.round(b.x), Math.round(b.y), 20]); }
      else if (b.lk === 'grav') { s.hz.push({ k: 'g', x: b.x, y: b.y, r: b.rad, t: b.hl, own: b.own, team: b.team, dmg: b.dmg, tk: 0 }); }
    };
    const hazardsTick = (s) => {
      for (let i = s.hz.length - 1; i >= 0; i--) {
        const h = s.hz[i]; h.tk++; const own = s.pl[h.own];
        if (h.k === 'f') {   // fire pool: burns enemies standing in it
          if (h.tk % 15 === 0) for (const t of s.pl) if (t.alive && t.team !== h.team && hyp(t.x - h.x, t.y - h.y) < h.r) dmgP(s, t, h.dmg, own, 'fire', null);
          if (h.tk % 15 === 0) damageCover(s, h.x, h.y, h.r * 0.6, 4, 1);
        } else if (h.k === 'g') {   // gravity well: drags enemies in, pops at the end
          for (const t of s.pl) if (t.alive && t.team !== h.team) { const d = hyp(t.x - h.x, t.y - h.y); if (d < h.r && d > 5) { const a = Math.atan2(h.y - t.y, h.x - t.x); t.x += Math.cos(a) * 1.6; t.y += Math.sin(a) * 1.6; resolve(s, t); } }
          if (h.t <= 1) { for (const t of s.pl) if (t.alive && t.team !== h.team && hyp(t.x - h.x, t.y - h.y) < h.r) dmgP(s, t, h.dmg, own, 'grav', [h.x, h.y]); addEv(s, ['x', Math.round(h.x), Math.round(h.y), Math.round(h.r)]); }
        } else if (h.k === 'o') {   // orbital strike: warn, then burn
          if (h.tk > h.w0 && h.tk % 8 === 0) for (const t of s.pl) if (t.alive && t.team !== h.team && hyp(t.x - h.x, t.y - h.y) < h.r) dmgP(s, t, h.dmg, own, 'orbit', null);
          if (h.tk > h.w0 && h.tk % 8 === 0) damageCover(s, h.x, h.y, h.r, 6, 1);
        }
        if (--h.t <= 0) s.hz.splice(i, 1);
      }
      if (s.zone && s.mode === 'elim' && s.zone.on) {   // shrinking safe zone
        const z = s.zone; z.r = Math.max(70, z.r - 0.32);
        if (s.tick % 30 === 0) for (const t of s.pl) if (t.alive && hyp(t.x - z.cx, t.y - z.cy) > z.r) dmgP(s, t, 3 + (520 - z.r) / 90, null, 'zone', null);
      }
    };
    const depTick = (s) => {
      for (const d of s.dep) {
        if (--d.t <= 0) { d.hp = 0; continue; }
        const own = s.pl[d.own]; if (d.drone && own && own.alive) { const a = Math.atan2(own.y - d.y, own.x - d.x), dd = hyp(own.x - d.x, own.y - d.y), want = 34 + d.ph * 10; if (dd > want) { d.x += Math.cos(a) * 2.6; d.y += Math.sin(a) * 2.6; } }
        if (--d.cd > 0) continue;
        let best = null, bd = d.w.rng;
        for (const t of s.pl) if (t.alive && t.team !== d.team) { const q = hyp(t.x - d.x, t.y - d.y); if (q < bd && (!(t.inBush) || q < 90) && losClear(s, d.x, d.y, t.x, t.y)) { best = t; bd = q; } }
        if (best) { d.ang = Math.atan2(best.y - d.y, best.x - d.x); d.cd = d.w.fcd; s.bul.push({ x: d.x, y: d.y, vx: Math.cos(d.ang) * 10, vy: Math.sin(d.ang) * 10, dmg: d.w.dmg * (own ? kitOf(own).dmg : 1), own: d.own, team: d.team, life: 26, r: 2.5, k: 'b', ox: d.x, oy: d.y, bounce: 0, fam: 'gun' }); } else d.cd = 4;
      }
      s.dep = s.dep.filter((d) => d.hp > 0 && d.t > 0);
    };
    const minesTick = (s) => {
      for (let i = s.mines.length - 1; i >= 0; i--) {
        const m = s.mines[i]; if (m.arm > 0) { m.arm--; continue; }
        const trig = s.pl.some((t) => t.alive && t.team !== m.team && hyp(t.x - m.x, t.y - m.y) < 30);
        if (trig) { s.mines.splice(i, 1); explode(s, m.x, m.y, m.w.rad, m.w.dmg, s.pl[m.own], 'mine', 1.5); }
      }
    };
    const pickupsTick = (s) => { for (const k of s.pk) if (k.t > 0) k.t--; for (const f of s.flags) if (f.dropT > 0 && --f.dropT <= 0 && f.c < 0 && !f.home) { f.x = f.hx; f.y = f.hy; f.home = 1; addEv(s, ['fr', f.team, -1]); } if (s.flags.length) s.flags.forEach((f) => { if (f.c >= 0) { const c = s.pl[f.c]; if (c && c.alive) { f.x = c.x; f.y = c.y; } } }); };

    // ---- mode logic (per tick)
    const endMatch = (s, win, why) => {
      if (s.ph === 'over') return;
      if (s.mode === 'elim' && s.ph !== 'rend') { /* handled by caller */ }
      s.ph = 'over'; s.winner = win; s.why = why;
      s.endInfo = { win, why };
      if (MODEHOOK.onEnd) MODEHOOK.onEnd(s);
    };
    const MODEHOOK = {};
    const modeTick = (s) => {
      if (s.mode === 'tdm' || s.mode === 'ctf' || s.mode === 'koth' || s.mode === 'dom') {
        if (--s.time <= 0 && s.ph === 'play') { const a = s.score[0], b = s.score[1]; endMatch(s, a === b ? -1 : (a > b ? 0 : 1), 'Time is up'); return; }
      }
      if (s.mode === 'koth') {
        const z = s.zone, h = s.map.hills[z.hi]; if (--z.moveT <= 0) { z.hi = (z.hi + 1) % s.map.hills.length; z.moveT = T(40); z.prog = [0, 0]; z.own = -1; addEv(s, ['bn', 'HILL MOVES', '']); }
        const cnt = [0, 0]; s.pl.forEach((p) => { if (p.alive && hyp(p.x - h[0], p.y - h[1]) < 62) cnt[p.team]++; });
        z.cnt = cnt; z.cont = cnt[0] && cnt[1] ? 1 : 0;
        if (cnt[0] !== cnt[1] && (cnt[0] === 0 || cnt[1] === 0)) { const t = cnt[0] ? 0 : 1; z.own = t; if (s.tick % 60 === 0) { s.score[t]++; s.pl.forEach((p) => { if (p.alive && p.team === t && hyp(p.x - h[0], p.y - h[1]) < 62) { p.caps++; p.score += 6; } }); if (s.score[t] >= s.lim) endMatch(s, t, 'Hill held'); } }
      } else if (s.mode === 'dom') {
        const z = s.zone; let own = [0, 0];
        z.pts.forEach((pt) => {
          const cnt = [0, 0]; s.pl.forEach((p) => { if (p.alive && hyp(p.x - pt.x, p.y - pt.y) < 48) cnt[p.team]++; });
          if (cnt[0] !== cnt[1] && (!cnt[0] || !cnt[1])) { const t = cnt[0] ? 0 : 1, n = cnt[t]; const dir = t === 0 ? 1 : -1; if ((pt.own === t)) pt.prog = cl(pt.prog + dir * 0.0, -100, 100); else { pt.prog += dir * (0.9 + n * 0.5); if (pt.prog >= 100) { pt.prog = 100; pt.own = 0; addEv(s, ['dc', 0]); } else if (pt.prog <= -100) { pt.prog = -100; pt.own = 1; addEv(s, ['dc', 1]); } else if ((pt.own === 0 && pt.prog < 100 && dir < 0) || (pt.own === 1 && pt.prog > -100 && dir > 0)) { if (Math.abs(pt.prog) < 5) pt.own = -1; } } }
          if (pt.own >= 0) own[pt.own]++;
        });
        z.own = own; if (s.tick % 120 === 0) { for (let t = 0; t < 2; t++) if (own[t]) { s.score[t] += own[t]; s.pl.forEach((p) => { if (p.alive && p.team === t) p.score += own[t]; }); } if (s.score[0] >= s.lim) endMatch(s, 0, 'Points reached'); else if (s.score[1] >= s.lim) endMatch(s, 1, 'Points reached'); }
        if (s.tick % 20 === 0) s.pl.forEach((p) => { if (p.alive) z.pts.forEach((pt) => { if (hyp(p.x - pt.x, p.y - pt.y) < 48 && pt.own === p.team) p.caps += 0; }); });
      } else if (s.mode === 'elim') {
        s.time--; const z = s.zone; if (s.time < T(95) - T(55)) z.on = 1;
        const al = [0, 0]; s.pl.forEach((p) => { if (p.alive) al[p.team]++; });
        if (s.ph === 'play' && (!al[0] || !al[1] || s.time <= -T(60))) {
          const win = !al[0] && !al[1] ? -1 : (!al[0] ? 1 : (!al[1] ? 0 : (s.time <= -T(60) ? -1 : -1)));
          if (win >= 0) s.rw[win]++;
          addEv(s, ['bn', win < 0 ? 'DRAW' : TEAMS[win].n + ' WINS THE ROUND', s.rw[0] + ' : ' + s.rw[1]]);
          if (s.rw[0] >= s.lim || s.rw[1] >= s.lim || s.round >= s.lim * 2 - 1) endMatch(s, s.rw[0] === s.rw[1] ? -1 : (s.rw[0] > s.rw[1] ? 0 : 1), 'Rounds decided');
          else { s.ph = 'rend'; s.phT = T(4); }
        }
      }
    };

    // ================================================================ C. BOT AI
    const NC = 20, NX = 40, NY = 30;
    const buildNav = (s) => {
      const bl = new Uint8Array(NX * NY), co = new Float32Array(NX * NY).fill(1);
      for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
        const x = cx * NC + NC / 2, y = cy * NC + NC / 2; let b = 0;
        for (const r of s.solid) if (inRect(x, y, r, PR + 1)) { b = 1; break; }
        bl[cy * NX + cx] = b; co[cy * NX + cx] = zoneMul(s, x, y) < 1 ? 2 : 1;
      }
      s.nav = { bl, co }; s.navDirty = false;
    };
    const nearestFree = (nav, cx, cy) => {
      cx = cl(cx, 0, NX - 1); cy = cl(cy, 0, NY - 1); if (!nav.bl[cy * NX + cx]) return [cx, cy];
      for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < NX && y < NY && !nav.bl[y * NX + x]) return [x, y];
      }
      return [cx, cy];
    };
    const findPath = (s, x0, y0, x1, y1) => {
      if (s.navDirty || !s.nav) buildNav(s);
      const nav = s.nav, st = nearestFree(nav, (x0 / NC) | 0, (y0 / NC) | 0), gl_ = nearestFree(nav, (x1 / NC) | 0, (y1 / NC) | 0);
      const sI = st[1] * NX + st[0], gI = gl_[1] * NX + gl_[0]; if (sI === gI) return [[x1, y1]];
      const g = new Float32Array(NX * NY).fill(1e9), from = new Int16Array(NX * NY).fill(-1), closed = new Uint8Array(NX * NY), open = [sI]; g[sI] = 0;
      const hh = (i) => { const dx = Math.abs((i % NX) - gl_[0]), dy = Math.abs(((i / NX) | 0) - gl_[1]); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
      const f = new Float32Array(NX * NY); f[sI] = hh(sI); let it = 0;
      while (open.length && it++ < 1500) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
        const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop(); if (cur === gI) break; closed[cur] = 1;
        const cx = cur % NX, cy = (cur / NX) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue; const ni = ny * NX + nx; if (nav.bl[ni] || closed[ni]) continue;
          if (dx && dy && (nav.bl[cy * NX + nx] || nav.bl[ny * NX + cx])) continue;   // no cutting corners
          const ng = g[cur] + (dx && dy ? 1.414 : 1) * nav.co[ni]; if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; f[ni] = ng + hh(ni); if (open.indexOf(ni) < 0) open.push(ni); }
        }
      }
      if (from[gI] < 0) return null;
      const out = []; let c = gI; while (c !== sI && c >= 0) { out.push([(c % NX) * NC + NC / 2, ((c / NX) | 0) * NC + NC / 2]); c = from[c]; } out.reverse();
      if (out.length) out[out.length - 1] = [x1, y1];
      return out;
    };
    const WTYPES_OFF = { gun: 1, beam: 1, spray: 1, arc: 1, saw: 1, lob: 1, melee: 1, orbit: 1 };
    const aiWeapons = (p) => p.loadout.map((id, i) => ({ i, w: wdef(id) })).filter((q) => q.w && q.w.t);
    const botMode = (s, p, A) => {   // where should this bot be going when it has no fight?
      const mates = s.pl.filter((q) => q.team === p.team && q.bot), idx = mates.indexOf(p), en = p.team ^ 1;
      if (s.mode === 'elim' && s.zone && s.zone.on && hyp(p.x - s.zone.cx, p.y - s.zone.cy) > s.zone.r - 60) return { x: s.zone.cx + A.lane * 40, y: s.zone.cy + A.lane * 30, hold: 1 };
      if (s.mode === 'ctf') {
        const own = s.flags[p.team], foe = s.flags[en];
        if (p.carry >= 0) return { x: own.hx, y: own.hy };
        if (!own.home) { if (own.c >= 0) { const c = s.pl[own.c]; return { x: c.x, y: c.y, atk: 1 }; } return { x: own.x, y: own.y }; }
        if (idx % 3 === 1) return { x: own.hx + (en ? -50 : 50) + A.lane * 20, y: own.hy + A.lane * 70, hold: 1 };   // defender
        if (foe.c >= 0) { const c = s.pl[foe.c]; if (c.team === p.team) return { x: c.x, y: c.y }; }
        return { x: foe.x, y: foe.y };
      }
      if (s.mode === 'koth') { const h = s.map.hills[s.zone.hi]; return { x: h[0] + A.lane * 24, y: h[1] + (idx % 2 ? 20 : -20), hold: 1 }; }
      if (s.mode === 'dom') {
        const pts = s.zone.pts; let best = null, bs = 1e9;
        pts.forEach((pt, i) => { const d = hyp(pt.x - p.x, pt.y - p.y) + (pt.own === p.team ? 260 : 0) + (i === idx % 3 ? -150 : 0); if (d < bs) { bs = d; best = pt; } });
        return { x: best.x + A.lane * 20, y: best.y + A.lane * 20, hold: 1 };
      }
      // tdm / elim: head for the middle, power weapons and the enemy
      if (A.lastSeen && s.tick - A.lastSeen.t < T(6)) return { x: A.lastSeen.x, y: A.lastSeen.y };
      if (!A.roam || s.tick > A.roam.t) {
        const opts = [[400, 300], [400 + A.lane * 60, 300 + A.lane * 180], ...s.map.pk.filter((k) => k[2] === 'pw' || k[2] === 'dm').map((k) => [k[0], k[1]]), [en ? 560 : 240, 300 + A.lane * 150]];
        const o = opts[(rnd() * opts.length) | 0]; A.roam = { x: o[0], y: o[1], t: s.tick + T(7 + rnd() * 5) };
      }
      return A.roam;
    };
    const aiThink = (s, p) => {
      const A = p.ai, df = A.df, inp = p.in, cmd = { mx: 0, my: 0, dash: false };
      p.vx = p.x - (p.px === undefined ? p.x : p.px); p.vy = p.y - (p.py === undefined ? p.y : p.py); p.px = p.x; p.py = p.y;
      if (!p.alive) return cmd;
      const enemies = s.pl.filter((q) => q.alive && q.team !== p.team);
      // --- perceive (10x a second)
      if (--A.think <= 0) {
        A.think = 6; let best = null, bd = 1e9;
        for (const q of enemies) {
          const d = hyp(q.x - p.x, q.y - p.y); if (d > 440) continue;
          if (q.inBush && d > 95 && q.rev <= 0) continue;
          if (!losClear(s, p.x, p.y, q.x, q.y)) continue; if (d < bd) { bd = d; best = q; }
        }
        if (best) { if (A.tgt !== best.i) { A.tgt = best.i; A.react = df.rt; } A.tgtT = 40; A.lastSeen = { x: best.x, y: best.y, t: s.tick }; }
        else if ((A.tgtT -= 6) <= 0) A.tgt = -1;
        A.noise = (rnd() - 0.5) * 2 * df.err;
        if (s.tick % 300 < 6) A.lane = rnd() * 2 - 1;
      }
      if (A.react > 0) A.react--;
      const tgt = A.tgt >= 0 ? s.pl[A.tgt] : null, seen = tgt && tgt.alive && s.tick - (A.lastSeen ? A.lastSeen.t : -99) < 14;
      const w = curW(p), hf = p.hp / p.mhp, d = seen ? hyp(tgt.x - p.x, tgt.y - p.y) : 9999;
      // --- weapon choice by range (not too often)
      if (seen && s.tick % 20 === 0 && p.wi !== 3) {
        let bi = -1, bs = -1e9; aiWeapons(p).forEach((q) => { if (!WTYPES_OFF[q.w.t]) return; const ideal = q.w.t === 'melee' ? 40 : (q.w.t === 'spray' ? 100 : q.w.rng * 0.6); const sc = -Math.abs(d - ideal) + (p.cds[q.i] > 0 ? -60 : 0); if (sc > bs) { bs = sc; bi = q.i; } });
        if (bi >= 0) inp.slot = bi;
      } else if (!WTYPES_OFF[wdef(p.loadout[p.wi] || '').t] && p.wi !== 3) { const o = aiWeapons(p).find((q) => WTYPES_OFF[q.w.t]); if (o) inp.slot = o.i; }
      if (p.pwAmmo > 0 && seen && d < 330) inp.slot = 3; else if (p.pwAmmo <= 0 && inp.slot === 3) inp.slot = 0;
      // --- goal
      let goal = null, engaged = false;
      if (hf < 0.4 && !p.ai.noRetreat) {
        const kit = s.pk.filter((k) => k.k === 'hp' && k.t <= 0).sort((a, b) => hyp(a.x - p.x, a.y - p.y) - hyp(b.x - p.x, b.y - p.y))[0];
        if (kit && hyp(kit.x - p.x, kit.y - p.y) < 380) goal = { x: kit.x, y: kit.y };
        else if (seen) {   // find cover: a nearby spot the enemy cannot see
          if (!A.cover || s.tick > A.cover.t || losClear(s, A.cover.x, A.cover.y, tgt.x, tgt.y)) {
            let bc = null, bsc = 1e9; for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283, rr = 50 + (k % 3) * 40, cx = cl(p.x + Math.cos(a) * rr, 20, W - 20), cy = cl(p.y + Math.sin(a) * rr, 20, H - 20); if (solidAt(s, cx, cy, PR + 2) || losClear(s, cx, cy, tgt.x, tgt.y)) continue; if (rr < bsc) { bsc = rr; bc = { x: cx, y: cy, t: s.tick + 90 }; } }
            A.cover = bc || { x: p.x - (tgt.x - p.x), y: p.y - (tgt.y - p.y), t: s.tick + 60 };
          }
          goal = A.cover;
        }
      }
      const objM = !goal ? botMode(s, p, A) : null;
      if (!goal && objM && ((s.mode === 'ctf' && (p.carry >= 0 || (!objM.hold && d > 110))) || ((s.mode === 'koth' || s.mode === 'dom') && (!seen || d > 60)))) { goal = objM; if (objM.hold && hyp(objM.x - p.x, objM.y - p.y) < 26) goal = null; }
      if (!goal && seen) {
        const ideal = clampN(w.t === 'melee' ? 30 : w.rng * 0.62, 60, 250);
        engaged = true;
        if (d > ideal + 35) goal = { x: tgt.x, y: tgt.y }; else goal = null;
        if (p.ai.flank === undefined) A.flank = 0;
      }
      if (!goal && !seen) { const m = botMode(s, p, A); goal = m; if (m.hold && hyp(m.x - p.x, m.y - p.y) < 26) goal = null; }
      // --- path following
      let tx = 0, ty = 0, have = false;
      if (goal) {
        const gx = goal.x, gy = goal.y;
        if (!A.goal || hyp(A.goal.x - gx, A.goal.y - gy) > 30 || s.tick - A.gT > 45 || !A.path) {
          const open = losClear(s, p.x, p.y, gx, gy) && hyp(gx - p.x, gy - p.y) < 160;
          A.path = open ? [[gx, gy]] : findPath(s, p.x, p.y, gx, gy); A.pi = 0; A.goal = { x: gx, y: gy }; A.gT = s.tick;
        }
        if (A.path && A.path.length) {
          while (A.pi < A.path.length - 1 && (hyp(A.path[A.pi][0] - p.x, A.path[A.pi][1] - p.y) < 12 || (A.pi + 1 < A.path.length && losClear(s, p.x, p.y, A.path[A.pi + 1][0], A.path[A.pi + 1][1]) && hyp(A.path[A.pi + 1][0] - p.x, A.path[A.pi + 1][1] - p.y) < 70))) A.pi++;
          const wp = A.path[A.pi]; tx = wp[0] - p.x; ty = wp[1] - p.y; const l = hyp(tx, ty); if (l > 3) { tx /= l; ty /= l; have = true; }
        }
      }
      let mx = have ? tx : 0, my = have ? ty : 0;
      // --- combat movement: strafe, keep range
      if (seen) {
        if (--A.sT <= 0) { A.strafe = -A.strafe; A.sT = 25 + ((rnd() * 40) | 0); }
        const ax = (tgt.x - p.x) / (d || 1), ay = (tgt.y - p.y) / (d || 1), ideal = clampN(w.t === 'melee' ? 30 : w.rng * 0.62, 60, 250);
        const sw = engaged ? 0.9 : 0.35; mx += -ay * A.strafe * sw; my += ax * A.strafe * sw;
        if (d < ideal - 40 && w.t !== 'melee') { mx -= ax * 0.8; my -= ay * 0.8; }
        if (hf < 0.4 && !goal) { mx -= ax * 0.6; my -= ay * 0.6; }
      }
      // --- stuck detection
      if (s.tick % 30 === 0) { if (hyp(p.x - A.lx, p.y - A.ly) < 5 && (have || seen)) { A.stuck++; A.path = null; A.strafe = -A.strafe; } else A.stuck = 0; A.lx = p.x; A.ly = p.y; }
      if (A.stuck > 1) { const a = rnd() * 6.283; mx += Math.cos(a); my += Math.sin(a); }
      // --- dodge: dash away from incoming bullets / when low
      if (p.dashCD <= 0 && p.dashT <= 0 && s.tick % 6 === 0) {
        let thr = null; for (const b of s.bul) { if (b.team === p.team || b.k === 'l') continue; const rx = p.x - b.x, ry = p.y - b.y, dd = hyp(rx, ry); if (dd > 90) continue; const dot = (rx * b.vx + ry * b.vy) / (dd * hyp(b.vx, b.vy) + 1e-6); if (dot > 0.93) { thr = b; break; } }
        if (thr && rnd() < df.dash * 0.5) { cmd.dash = true; const px = -thr.vy, py = thr.vx, l = hyp(px, py) || 1, sg = rnd() < 0.5 ? 1 : -1; mx = px / l * sg; my = py / l * sg; }
        else if (hf < 0.3 && seen && d < 160 && rnd() < df.dash * 0.3) { cmd.dash = true; mx = (p.x - tgt.x) / (d || 1); my = (p.y - tgt.y) / (d || 1); }
      }
      cmd.mx = mx; cmd.my = my;
      // --- aim + fire
      let want = p.aim;
      if (seen) {
        let ax = tgt.x, ay = tgt.y; const sp = w.spd || 0;
        if (sp && df.lead) { const t = d / (sp * 60) * 60 / 1; ax += (tgt.vx || 0) * t * df.lead * 0.85; ay += (tgt.vy || 0) * t * df.lead * 0.85; }
        want = Math.atan2(ay - p.y, ax - p.x) + A.noise;
        inp.tx = tgt.x; inp.ty = tgt.y;
      } else if (have) want = Math.atan2(my, mx);
      let diff = want - p.aim; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); inp.aim = p.aim + clampN(diff, -df.turn, df.turn);
      const off = WTYPES_OFF[w.t] || p.wi === 3;
      inp.fire = !!(seen && A.react <= 0 && Math.abs(diff) < 0.22 && d <= (w.rng || 300) * 1.05 && off && !(w.t === 'lob' && d < 80));
      // utilities: turret / mines / shield used when sensible
      A.uT = (A.uT || 0) - 1;
      if (!off && A.uT <= 0 && p.wi !== 3) {
        if (w.t === 'turret' && seen && d < 260 && p.cds[p.wi] <= 0) { inp.fire = true; A.uT = 60; }
        else if (w.t === 'mine' && p.cds[p.wi] <= 0 && (hf < 0.5 || (!seen && rnd() < 0.02))) { inp.fire = true; A.uT = 90; }
        else if (w.t === 'shield') inp.fire = !!(seen && d < 280 && hf < 0.8);
        else inp.fire = false;
      }
      // kit abilities
      inp.ab = false; A.abT = (A.abT || 0) - 1;
      if (p.abCh > 0 && p.abCd <= 0 && A.abT <= 0) {
        const k = p.kit;
        if (k === 'scout' && seen && d < 130) inp.ab = true;
        else if (k === 'guardian' && seen && d < 300 && hf < 0.85) inp.ab = true;
        else if (k === 'medic') { const hurt_ = s.pl.some((q) => q.alive && q.team === p.team && hyp(q.x - p.x, q.y - p.y) < 110 && q.hp < q.mhp * 0.65); if (hurt_ || hf < 0.5) inp.ab = true; }
        else if (k === 'demo' && seen && d > 90 && d < 260) inp.ab = true;
        if (inp.ab) A.abT = 20;
      }
      inp.use = false;
      if (s.mode === 'elim' && s.tok[p.team] > 0) { const c = s.pl.find((q) => !q.alive && q.team === p.team && q.corpse && hyp(q.corpse.x - p.x, q.corpse.y - p.y) < 36); if (c && !seen) inp.use = true; else if (!seen && !goal) { const cc = s.pl.find((q) => !q.alive && q.team === p.team && q.corpse); if (cc) A.roam = { x: cc.corpse.x, y: cc.corpse.y, t: s.tick + 200 }; } }
      return cmd;
    };
    const clampN = cl;

    // ================================================================ D. INPUT
    const canvasEl = document.getElementById('gameCanvas');
    const touch = { mx: 0, my: 0, fire: false, ab: false, dash: false, aim: { on: false, a: 0 } };
    const ME = { slot: -1, em: 0, emT: 0 };
    const canvasPos = (e) => { const r = canvasEl.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
    const isIn = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    canvasEl.addEventListener('mousemove', (e) => { if (!running) return; const q = canvasPos(e); mouse.x = q.x; mouse.y = q.y; mouse.on = true; });
    canvasEl.addEventListener('mousedown', (e) => {
      if (!running || !S) return; const q = canvasPos(e); mouse.x = q.x; mouse.y = q.y; mouse.on = true; e.preventDefault();
      if (e.button === 2) mouse.rdown = true; else { mouse.down = true; if (S.pl[S.me] && !S.pl[S.me].alive) cycleSpec(1); }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) mouse.rdown = false; else mouse.down = false; });
    canvasEl.addEventListener('contextmenu', (e) => { if (running) e.preventDefault(); });
    canvasEl.addEventListener('wheel', (e) => { if (!running || !S) return; e.preventDefault(); cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    const myP = () => (S ? S.pl[S.me] : null);
    const cycleWeapon = (dir) => {
      const p = myP(); if (!p) return; const n = p.loadout.length, list = []; for (let i = 0; i < n; i++) if (p.loadout[i]) list.push(i); if (p.pwAmmo > 0) list.push(3);
      if (!list.length) return; let k = list.indexOf(ME.slot < 0 ? p.wi : ME.slot); if (k < 0) k = list.indexOf(p.wi); ME.slot = list[(k + dir + list.length) % list.length];
    };
    const cycleSpec = (dir) => {
      const s = S, me = myP(); if (!s || !me || me.alive) return;
      let c = s.pl.filter((q) => q.alive && q.team === me.team); if (!c.length) c = s.pl.filter((q) => q.alive); if (!c.length) return;
      const ids = c.map((q) => q.i), k = ids.indexOf(s.spec); s.spec = ids[((k < 0 ? 0 : k + dir) + ids.length) % ids.length];
    };
    window.addEventListener('keydown', (e) => {
      if (!running || !S || isIn(e.target)) return;
      if (e.code === 'Tab') { e.preventDefault(); sbOn = true; return; }
      if (e.repeat) return;
      if (e.code === 'Digit1') ME.slot = 0; else if (e.code === 'Digit2') ME.slot = 1; else if (e.code === 'Digit3') ME.slot = 2; else if (e.code === 'Digit4') ME.slot = 3;
      else if (e.code === 'KeyQ') cycleWeapon(1);
      else if (e.code === 'ArrowRight' || e.code === 'BracketRight') cycleSpec(1); else if (e.code === 'ArrowLeft' || e.code === 'BracketLeft') cycleSpec(-1);
      EMOTES.forEach((em, i) => { if (e.code === em[2]) { ME.em = i + 1; ME.emT = 120; } });
    }, true);
    window.addEventListener('keyup', (e) => { if (e.code === 'Tab') sbOn = false; });
    window.addEventListener('blur', () => { sbOn = false; mouse.down = false; mouse.rdown = false; });

    // ---- touch: left joystick is the game's own (fakes WASD); this adds a right aim stick + buttons
    let touchUI = null;
    const buildTouch = () => {
      if (touchUI || !document.body.classList.contains('is-touch')) return;
      const host = document.getElementById('game-screen'); if (!host) return;
      const d = document.createElement('div'); d.id = 'pv-touch';
      d.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:30;display:none';
      d.innerHTML = `<div id="pv-aim" style="position:absolute;right:3%;bottom:6%;width:26%;aspect-ratio:1;max-width:150px;border-radius:50%;border:3px solid rgba(255,255,255,.35);background:rgba(255,255,255,.07);pointer-events:auto;touch-action:none"><div id="pv-aimk" style="position:absolute;left:50%;top:50%;width:38%;height:38%;margin:-19% 0 0 -19%;border-radius:50%;background:rgba(255,120,90,.55)"></div></div>
      <div class="pvb" data-k="dash" style="right:33%;bottom:6%">DASH</div><div class="pvb" data-k="ab" style="right:33%;bottom:26%">SKILL</div><div class="pvb" data-k="wp" style="right:3%;bottom:44%">SWAP</div>`;
      d.querySelectorAll('.pvb').forEach((b) => { b.style.cssText = 'position:absolute;width:15%;max-width:80px;aspect-ratio:1;border-radius:50%;border:3px solid rgba(255,255,255,.4);background:rgba(20,17,14,.6);color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;' + b.style.cssText;
        b.addEventListener('pointerdown', (e) => { const k = b.dataset.k; if (k === 'wp') cycleWeapon(1); else touch[k] = true; e.preventDefault(); });
        const up = () => { const k = b.dataset.k; if (k !== 'wp') touch[k] = false; }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); });
      const aim = d.querySelector('#pv-aim'), knob = d.querySelector('#pv-aimk'); let pid = null;
      const mv = (e) => { const r = aim.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = hyp(dx, dy); touch.aim.on = true; if (l > 6) touch.aim.a = Math.atan2(dy, dx); touch.fire = l > R * 0.55; const k = Math.min(1, l / R); knob.style.transform = `translate(${Math.cos(touch.aim.a) * k * R * 0.6}px,${Math.sin(touch.aim.a) * k * R * 0.6}px)`; };
      aim.addEventListener('pointerdown', (e) => { pid = e.pointerId; aim.setPointerCapture(pid); mv(e); e.preventDefault(); });
      aim.addEventListener('pointermove', (e) => { if (e.pointerId === pid) mv(e); });
      const end = (e) => { if (e.pointerId !== pid) return; pid = null; touch.fire = false; knob.style.transform = ''; };
      aim.addEventListener('pointerup', end); aim.addEventListener('pointercancel', end);
      host.appendChild(d); touchUI = d;
    };
    // keep the game's own weapon/ability touch buttons out of the way while PvP runs (they would press O/P/L/G)
    const touchMode = (on) => {
      buildTouch(); if (touchUI) touchUI.style.display = on ? 'block' : 'none';
      document.body.classList.toggle('pvp-on', on);
      if (!on) { touch.aim.on = false; touch.fire = touch.ab = touch.dash = false; }
    };
    (() => { const st = document.createElement('style'); st.textContent = 'body.pvp-on #touch-ui .tbtn:not(#joy-base){display:none!important}body.pvp-on #abort-btn,body.pvp-on #active-ability-hud{display:none!important}'; document.head.appendChild(st); })();

    // ================================================================ D. NETWORK
    const myUid = () => String(MP.uid || '').replace(/[^a-z0-9]/gi, '').slice(0, 12);
    const castAll = (msg) => { if (MP.role === 'host') MP.conns.forEach((c) => { if (c.open) mpSend(c, msg); }); };
    const r1 = (v) => Math.round(v * 10) / 10;
    const flagsOf = (p) => (p.alive ? 1 : 0) | (p.dashT > 0 ? 2 : 0) | (p.shielding ? 4 : 0) | (p.inBush ? 8 : 0) | (p.rev > 0 ? 16 : 0) | (p.spawnInv > 0 ? 32 : 0) | (p.hitF > 0 ? 64 : 0);
    const BK = { b: 0, w: 1, s: 2, l: 3 };
    const buildSnap = () => {
      const s = S, phc = { count: 0, play: 1, rend: 2, over: 3 }[s.ph];
      const snap = { t: 'pvs', k: s.tick, ph: phc, pt: s.phT, tm: s.time, sc: s.score, rw: s.rw, rd: s.round, tk: s.tok, kl: s.kills,
        p: s.pl.map((p) => [p.i, r1(p.x), r1(p.y), Math.round(p.aim * 100), Math.ceil(p.hp), Math.ceil(p.os), flagsOf(p), p.wi, p.em, p.carry, p.rt, p.streak, p.kills, p.deaths, p.assists, Math.round(p.dmg), p.caps, p.bot ? 1 : 0]),
        b: s.bul.map((b) => [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), b.exp ? 6 : (b.k === 'l' ? 3 + (b.lk === 'fire' ? 1 : b.lk === 'grav' ? 2 : 0) : BK[b.k] || 0), b.team, b.r]).slice(0, 160),
        mi: s.mines.map((m) => [Math.round(m.x), Math.round(m.y), m.team, m.arm > 0 ? 0 : 1]), dp: s.dep.map((d) => [d.drone ? 1 : 0, Math.round(d.x), Math.round(d.y), d.team, Math.round(d.hp), Math.round((d.ang || 0) * 100)]),
        hz: s.hz.map((h) => [h.k, Math.round(h.x), Math.round(h.y), h.r, h.t, h.team, h.w0 || 0, h.tk]),
        bg: s.bagsAll.filter((b) => !b.dep).map((b) => Math.ceil(b.hp)), db: s.bagsAll.filter((b) => b.dep && b.hp > 0).map((b) => [Math.round(b.x), Math.round(b.y), b.w, b.h, Math.ceil(b.hp), b.team]),
        pk: s.pk.map((k) => Math.ceil(k.t / 60)), fg: s.flags.map((f) => [Math.round(f.x), Math.round(f.y), f.c, f.home]),
        zn: s.zone ? (s.mode === 'koth' ? [s.zone.hi, s.zone.own, s.zone.cont ? 1 : 0, Math.ceil(s.zone.moveT / 60)] : s.mode === 'dom' ? s.zone.pts.map((q) => [q.own, Math.round(q.prog)]) : [Math.round(s.zone.r), s.zone.on]) : 0 };
      return snap;
    };
    const sendSnaps = () => {
      const s = S; if (!s || MP.role !== 'host') return; let base = null;
      for (const c of MP.conns) {
        const p = c.pvp; if (!p || !c.open) continue;
        if (c.relay && s.tick % 9) continue;   // the relay carries ~4/s anyway; don't flood it
        if (!base) base = buildSnap();
        const snap = { ...base, ev: s.ev.filter((e) => e[0] > (c.pvEv || 0)), a: p.ack };
        c.pvEv = s.evSeq;
        const k = kitOf(p);
        snap.me = { m: [r1(p.x), r1(p.y), p.dashT, p.dashCD, r1(p.dashX), r1(p.dashY), p.inv, p.spawnInv], ab: [p.abCd, p.abCh, p.abRech, k.ab.cd], cd: p.cds, pw: p.pwAmmo, bs: p.boost.spd > 0 ? 1 : 0, bd: p.boost.dmg > 0 ? 1 : 0, sl: p.slowT > 0 ? 1 : 0, tok: p.tok, rvT: p.rvT };
        mpSend(c, snap);
      }
      s.evHost = s.evSeq;
    };
    // host side: guest messages
    window.PVP_hostGot = (c, d) => {
      if (typeof d.t !== 'string' || d.t.charCodeAt(0) !== 112 || d.t.charCodeAt(1) !== 118) return false;   // "pv"
      try {
        if (d.t === 'pvk') { if (c.info) { c.pv = c.pv || { team: 0, kit: 'scout', ready: false }; if (KITS[d.kit]) c.pv.kit = d.kit; c.pv.ready = !!d.ready; if (typeof d.grp === 'string') { const g = d.grp.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 5); if (g !== (c.pv.grp || '')) { c.pv.grp = g; c.pv.team = g && g !== MP.code ? 1 : 0; } c.pv.ld = !!d.ld; } lobbyDirty(); } }
        else if (d.t === 'pvc') { if (c.info && c.pv) hostChat(c.info.name, c.pv.team, d.i); }
        else if (d.t === 'pvi' && S && c.pvp && S.role === 'host') hostApplyInput(S, c, d);
        else if (d.t === 'pvq' && S && c.pvp) { botify(S, c.pvp, ' (left)'); c.pvp = null; }
        else if (d.t === 'pvh') mpSend(c, { t: 'pvh2', c: d.c });
      } catch (e) { console.error('[pvp hostGot]', e); }
      return true;
    };
    const hostApplyInput = (s, c, d) => {
      const p = c.pvp; if (!p) return;
      const now = performance.now(); c.tb = Math.min(40, (c.tb === undefined ? 40 : c.tb) + (now - (c.tl || now)) * 0.07); c.tl = now;   // token bucket: ~70 steps/s + burst
      if (Array.isArray(d.c)) for (const q of d.c) {
        if (!Array.isArray(q) || (q[0] | 0) <= p.ack) continue; p.ack = q[0] | 0;
        if (c.tb < 1) continue; c.tb--;
        if (s.ph === 'play' && p.alive) stepMove(s, p, cl(+q[1] || 0, -1, 1), cl(+q[2] || 0, -1, 1), !!q[3]);
      }
      const i = p.in; i.aim = cl(+d.a || 0, -400, 400) / 100; i.fire = !!(d.f & 1); i.ab = !!(d.f & 2); i.use = !!(d.f & 4); if (d.s !== undefined) i.slot = d.s | 0;
      const rr = cl(+d.r || 200, 30, 400); i.tx = p.x + Math.cos(i.aim) * rr; i.ty = p.y + Math.sin(i.aim) * rr;
      if (d.e && d.e > 0 && d.e <= 4 && p.emT <= 0) { p.em = d.e; p.emT = 120; }
    };
    const botify = (s, p, suffix) => {
      p.bot = true; p.conn = null; p.ai = mkAI(DIFFS[s.cfg.diff] || DIFFS.normal); p.name = p.name.replace(/ \(bot\)$/, '') + (suffix || ' (bot)'); if (s.role === 'host') addEv(s, ['ms', p.name + ' disconnected: a bot takes over']);
    };
    // guest side
    window.PVP_guestGot = (d) => {
      if (typeof d.t !== 'string' || d.t.charCodeAt(0) !== 112 || d.t.charCodeAt(1) !== 118) return false;
      try {
        if (d.t === 'pvl') guestLobby(d);
        else if (d.t === 'pvgo') guestStart(d);
        else if (d.t === 'pvs') { if (S && S.role === 'guest') applySnapshot(S, d); }
        else if (d.t === 'pvend') guestEnd(d);
        else if (d.t === 'pvx') { toast(d.why || 'The host closed the PvP lobby.'); if (MG && MG.phase !== 'home') returnHome(); else stopAll(true); }
        else if (d.t === 'pvc') { chatPush({ n: String(d.n || '').replace(/[<>&"'`]/g, '').slice(0, 16), tm: d.tm ? 1 : 0, i: d.i | 0 }); renderLobby(); }
        else if (d.t === 'pvmerge') mergeStart(String(d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5), String(d.home || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5), 0);
        else if (d.t === 'pvsplit') { if (MG && MG.phase !== 'home') returnHome(); }
        else if (d.t === 'pvh2') { const r = Date.now() - d.c; MP.pvRtt = MP.pvRtt ? MP.pvRtt * 0.7 + r * 0.3 : r; }
      } catch (e) { console.error('[pvp guestGot]', e); }
      return true;
    };
    const applySnapshot = (s, d) => {
      if (d.k < s.lastSnap) return; s.lastSnap = d.k; s.snapAt = performance.now();
      s.ph = ['count', 'play', 'rend', 'over'][d.ph] || 'play'; s.phT = d.pt; s.time = d.tm; s.score = d.sc; s.rw = d.rw; s.round = d.rd; s.tok = d.tk; s.kills = d.kl || s.kills; s.tick = d.k;
      d.p.forEach((a) => {
        const p = s.pl[a[0]]; if (!p) return; const was = p.alive; p.alive = !!(a[6] & 1); p.hp = a[4]; p.os = a[5]; p.fl = a[6]; p.dashing = !!(a[6] & 2); p.shielding = !!(a[6] & 4); p.inBush = !!(a[6] & 8); p.rev = (a[6] & 16) ? 5 : 0; p.spawnInv = (a[6] & 32) ? 5 : 0; p.hitF = (a[6] & 64) ? 4 : 0;
        p.carry = a[9]; p.rt = a[10]; p.streak = a[11]; p.kills = a[12]; p.deaths = a[13]; p.assists = a[14]; p.dmg = a[15]; p.caps = a[16]; p.bot = !!a[17]; p.em = a[8]; p.wi = a[7];
        if (p.i === s.me) { if (!was && p.alive) { p.x = a[1]; p.y = a[2]; p.dx = p.x; p.dy = p.y; s.hist.length = 0; } if (!p.alive) { p.x = a[1]; p.y = a[2]; } p.tx = a[1]; p.ty = a[2]; }
        else { p.tx = a[1]; p.ty = a[2]; p.aimT = a[3] / 100; if (!was && p.alive) { p.x = p.dx = a[1]; p.y = p.dy = a[2]; } }
      });
      s.bul = d.b.map((a) => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], kc: a[4], team: a[5], r: a[6] }));
      s.mines = d.mi.map((a) => ({ x: a[0], y: a[1], team: a[2], armed: a[3] })); s.dep = d.dp.map((a) => ({ drone: a[0], x: a[1], y: a[2], team: a[3], hp: a[4], ang: a[5] / 100 }));
      s.hz = d.hz.map((a) => ({ k: a[0], x: a[1], y: a[2], r: a[3], t: a[4], team: a[5], w0: a[6], tk: a[7] }));
      let rb = false; const st = s.bagsAll.filter((b) => !b.dep); st.forEach((b, i) => { const hp = d.bg[i]; if (hp !== undefined && (hp > 0) !== (b.hp > 0)) rb = true; if (hp !== undefined) { if (hp < b.hp) b.flash = 6; b.hp = hp; } });
      const was = s.bagsAll.filter((b) => b.dep).length; s.bagsAll = st.concat(d.db.map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3], hp: a[4], mhp: 90, k: 'bag', dep: 1, team: a[5] }))); if (was !== d.db.length) rb = true;
      if (rb) rebuildSolids(s);
      d.pk.forEach((t, i) => { if (s.pk[i]) s.pk[i].t = t * 60; });
      d.fg.forEach((a, i) => { const f = s.flags[i]; if (f) { f.x = a[0]; f.y = a[1]; f.c = a[2]; f.home = a[3]; } });
      if (d.zn) {
        if (s.mode === 'koth') s.zone = { ...(s.zone || {}), hi: d.zn[0], own: d.zn[1], cont: d.zn[2], moveT: d.zn[3] * 60 };
        else if (s.mode === 'dom') { s.zone = s.zone || { pts: s.map.pts.map((q) => ({ x: q[0], y: q[1], own: -1, prog: 0 })) }; d.zn.forEach((a, i) => { s.zone.pts[i].own = a[0]; s.zone.pts[i].prog = a[1]; }); }
        else if (s.mode === 'elim') s.zone = { r: d.zn[0], on: d.zn[1], cx: 400, cy: 300 };
      }
      const me = s.pl[s.me], m = d.me;
      if (m && me) {
        me.abCd = m.ab[0]; me.abCh = m.ab[1]; me.abRech = m.ab[2]; me.abMax = m.ab[3]; me.cds = m.cd; me.pwAmmo = m.pw; me.boost = { spd: m.bs ? 99 : 0, dmg: m.bd ? 99 : 0 }; me.slowT = m.sl ? 9 : 0; me.tok = m.tok; me.rvT = m.rvT;
        if (me.alive) {   // reconcile: take the server state, replay the inputs it has not seen yet
          const ox = me.dx, oy = me.dy; me.x = m.m[0]; me.y = m.m[1]; me.dashT = m.m[2]; me.dashCD = m.m[3]; me.dashX = m.m[4]; me.dashY = m.m[5]; me.inv = m.m[6]; me.spawnInv = m.m[7];
          s.hist = s.hist.filter((q) => q[0] > d.a);
          if (s.ph === 'play') for (const q of s.hist) stepMove(s, me, q[1], q[2], q[3]);
          const ex = (ox - (me.x)), ey = (oy - (me.y));
          if (hyp(ex, ey) > 60) { me.ox = 0; me.oy = 0; } else { me.ox = ex; me.oy = ey; }
        }
      }
      (d.ev || []).forEach((e) => { if (e[0] > s.evSeen) { s.evSeen = e[0]; handleEv(s, e, false); } });
    };

    // ================================================================ D. LOBBY
    const MODE_DEF = {
      tdm: { n: 'Team Deathmatch', ic: '🔫', d: 'Two teams, one scoreboard. First to the kill limit (or the most kills when time runs out) wins. Quick respawns, pickups on the map.', lim: [15, 30, 50], limN: 'kills' },
      ctf: { n: 'Capture the Flag', ic: '🚩', d: 'Steal the enemy flag and run it home while yours is safe. Carriers are slowed. Dropped flags return after 15s, touch your own to return it.', lim: [1, 3, 5], limN: 'captures' },
      koth: { n: 'King of the Hill', ic: '👑', d: 'A zone rotates around the map. Hold it alone to score; fight inside and nobody scores.', lim: [50, 100, 150], limN: 'points' },
      elim: { n: 'Elimination', ic: '💀', d: 'No respawns. Last team standing wins the round. Long rounds shrink the safe zone. A revive token lets a mate pick up the fallen (hold R).', lim: [2, 3, 4], limN: 'round wins' },
      dom: { n: 'Domination', ic: '🚩', d: 'Three control points. Stand on one to take it; each point you own pays every two seconds.', lim: [100, 150, 250], limN: 'points' }
    };
    const ICON_OF = { tdm: 'target', ctf: 'flame', koth: 'trophy', elim: 'skull', dom: 'shield' };
    let lobbyEl = null, lobbyTimer = null, lobbySig = '', lobbyBusy = false;
    // ---- team parties: each team is its own party; a leader enters the other team's code and the parties merge into the match party (the joined party's host is the hub)
    let MG = null, KIT_PREF = 'scout';   // MG = {home, ld, code, phase:'joining'|'in'|'home', mode, kit, tries}
    const CHAT = [['Ready!', 1], ['Need a minute', 1], ['Rush the middle', 1], ['Good luck, have fun!', 0], ['Pick a map!', 0], ['Fill with bots?', 0]];   // [text, teamOnly]
    const chatPush = (m) => { if (!LB) return; (LB.chat = LB.chat || []).push(m); if (LB.chat.length > 6) LB.chat.shift(); };
    const hostChat = (name, team, i) => {
      const q = CHAT[i | 0]; if (!q || !LB) return; const m = { n: name, tm: team, i: i | 0 }; chatPush(m);
      MP.conns.forEach((c) => { if (c.open && c.info && c.pv && (!q[1] || c.pv.team === team)) mpSend(c, { t: 'pvc', n: name, tm: team, i: i | 0 }); });
      renderLobby();
    };
    const hasForeign = () => MP.role === 'host' && MP.conns.some((c) => c.pv && c.pv.grp && c.pv.grp !== MP.code);
    const humansList = () => {
      const out = [{ uid: myUid(), name: myName(), me: 1, host: 1, ld: 1, grp: MP.role === 'host' ? MP.code : '', team: LB.me.team, kit: LB.me.kit, ready: 1, conn: null }];
      if (MP.role === 'host') MP.conns.filter((c) => c.info).forEach((c) => { if (!c.pv) { const n0 = out.filter((h) => h.team === 0).length, n1 = out.length - n0; c.pv = { team: LB.teamMode ? 0 : (n0 <= n1 ? 0 : 1), kit: KIT_ORDER[(Math.random() * 4) | 0], ready: false }; } out.push({ uid: c.info.uid, name: c.info.name, team: c.pv.team, kit: c.pv.kit, ready: c.pv.ready, conn: c, grp: c.pv.grp || '', ld: !!c.pv.ld }); });
      return out;
    };
    const lobbyDirty = () => { if (lobbyEl && LB && LB.host) { lobbyCast(); renderLobby(); } };
    const lobbyCast = () => {
      if (!LB || !LB.host || MP.role !== 'host') return;
      const h = humansList(); castAll({ t: 'pvl', tmo: LB.teamMode ? 1 : 0, cd: MP.code, m: LB.mode, mp: LB.map, ru: LB.rules, df: LB.diff, lim: LB.lim, ts: LB.ts, fill: LB.fill ? 1 : 0, h: h.map((q) => [q.uid, q.name, q.team, q.kit, q.ready ? 1 : 0, q.host ? 1 : 0, q.grp || '', q.ld ? 1 : 0]) });
    };
    const guestLobby = (d) => {
      if (S) { if (S.ph !== 'over') return; teardown(false); }
      const def = MODES.list['pvp_' + d.m]; if (!def) return;
      if (!LB || LB.host || LB.mode !== d.m) { MODES.active = def; LB = { host: false, mode: d.m, map: 'random', rules: 'own', diff: 'normal', lim: 30, ts: 2, fill: true, me: { team: 0, kit: KIT_PREF, ready: false }, humans: [], chat: [] }; }
      LB.mode = d.m; LB.map = d.mp; LB.rules = d.ru; LB.diff = d.df; LB.lim = d.lim; LB.ts = d.ts; LB.fill = !!d.fill; LB.teamMode = !!d.tmo; LB.hostCode = d.cd; LB.humans = d.h.map((a) => ({ uid: a[0], name: a[1], team: a[2], kit: a[3], ready: !!a[4], host: !!a[5], grp: a[6] || '', ld: !!a[7], me: a[0] === myUid() }));
      if (MG) { MG.mode = d.m; MG.phase = 'in'; const me_ = LB.humans.find((q) => q.me); if (me_ && me_.grp !== MG.home) mergeAnnounce(); }
      const mine = LB.humans.find((q) => q.me); if (mine) { LB.me.team = mine.team; }
      if (!lobbyEl) { MP.pvpGuest = true; showLobby(); }
      renderLobby();
    };
    const lobbyCss = () => {
      if (document.getElementById('pvl-css')) return; const st = document.createElement('style'); st.id = 'pvl-css';
      st.textContent = `#pvl{position:fixed;inset:0;z-index:75;background:rgba(8,6,5,.94);overflow-y:auto;padding:12px;display:flex;justify-content:center;font-family:'Courier Prime',monospace;color:#e8dec6}
#pvl .pp{width:min(980px,100%);margin:auto;background:#14110e;border:3px solid #4d4235;border-radius:6px;padding:14px;box-shadow:4px 4px 0 #0a0908}
#pvl h2{margin:0;font-family:'Special Elite',monospace;color:#d9a441;font-size:24px;display:flex;align-items:center;gap:8px}#pvl .sub{color:#9a8e7a;font-size:13px;margin:4px 0 10px}
#pvl .cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px}@media(max-width:760px){#pvl .cols{grid-template-columns:1fr}}
#pvl h3{margin:10px 0 6px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#9a8e7a}
#pvl .maps{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px}
#pvl .mc{background:#1d1812;border:2px solid #4d4235;border-radius:5px;padding:5px;cursor:pointer;text-align:center;font-size:12px}#pvl .mc.on{border-color:#d9a441;background:#2a2316}#pvl .mc canvas{width:100%;height:auto;display:block;image-rendering:pixelated;border-radius:3px;margin-bottom:3px}
#pvl .mc small{display:block;color:#9a8e7a;font-size:10px;line-height:1.2}#pvl.guest .mc{cursor:default}
#pvl .teams{display:grid;grid-template-columns:1fr 1fr;gap:8px}#pvl .tm{border:2px solid;border-radius:5px;padding:6px;background:#1a1612}
#pvl .tm b{display:block;font-family:'Special Elite',monospace;margin-bottom:4px}#pvl .sl{display:flex;align-items:center;gap:5px;font-size:12px;padding:3px 5px;margin:2px 0;background:#241e17;border-radius:3px;min-height:24px}
#pvl .sl.bot{opacity:.55}#pvl .sl.empty{opacity:.3}#pvl .sl .k{margin-left:auto;font-size:11px;color:#9a8e7a}#pvl .sl button{font:inherit;font-size:11px;padding:1px 5px;background:#3a2f22;color:#e8dec6;border:1px solid #4d4235;border-radius:3px;cursor:pointer}
#pvl .kits{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}#pvl .kc{border:2px solid #4d4235;border-radius:5px;padding:6px;background:#1d1812;cursor:pointer;font-size:12px}#pvl .kc.on{border-color:#d9a441;background:#2a2316}#pvl .kc b{display:block;font-size:13px}#pvl .kc small{color:#9a8e7a;display:block;font-size:11px;line-height:1.25;margin-top:2px}
#pvl .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0;font-size:13px}#pvl .row select,#pvl .row button.seg{font:inherit;font-size:12px;background:#1d1812;color:#e8dec6;border:2px solid #4d4235;border-radius:4px;padding:3px 8px;cursor:pointer}
#pvl .row button.seg.on{background:#d9a441;color:#14110e;border-color:#d9a441}#pvl .go{width:100%;padding:12px;font:700 20px 'Special Elite',monospace;border:3px solid #8aa04a;background:#2a3318;color:#e8dec6;border-radius:5px;cursor:pointer;margin-top:10px}#pvl .go:disabled{opacity:.45;cursor:default}
#pvl .x{float:right;padding:4px 10px;border:2px solid #4d4235;background:#1d1812;color:#e8dec6;cursor:pointer;font:inherit;border-radius:4px}#pvl .pty{background:#1d1812;border:2px dashed #4d4235;border-radius:5px;padding:6px 8px;font-size:12px;margin-top:8px}#pvl .pty b{color:#d9a441;letter-spacing:.2em}
#pvl .ctl{font-size:11px;color:#9a8e7a;line-height:1.5;margin-top:8px}`;
      document.head.appendChild(st);
    };
    const showLobby = () => {
      lobbyCss(); if (lobbyEl) return; lobbyEl = document.createElement('div'); lobbyEl.id = 'pvl'; document.body.appendChild(lobbyEl);
      clearInterval(lobbyTimer); lobbyTimer = setInterval(() => {
        if (!lobbyEl) return; if (LB && LB.host) { const sig = humansList().map((h) => h.uid + h.team + h.kit + h.ready).join('|') + MP.role + MP.code; if (sig !== lobbySig) { lobbySig = sig; lobbyCast(); renderLobby(); } }
        if (LB && !LB.host && MP.role !== 'guest' && !(MG && MG.phase !== 'home')) { toast('The party closed.'); stopAll(true); }
        if (MG && MG.phase === 'in' && MP.role !== 'guest') { toast('The match party closed.'); returnHome(); }
      }, 500);
    };
    const defLim = (mode) => MODE_DEF[mode].lim[1];
    const openLobby = (modeId) => {
      if (MP.role === 'guest') { toast('Only the party host picks the game mode. Waiting for them.'); MODES.active = null; return; }
      if (!currentUserData) { MODES.active = null; return; }
      LB = { host: true, mode: modeId, map: (LB && LB.host && LB.map) || 'random', rules: (LB && LB.rules) || 'own', diff: (LB && LB.diff) || 'normal', lim: defLim(modeId), ts: (LB && LB.ts) || 2, fill: true, teamMode: !!(LB && LB.teamMode), chat: [], me: { team: 0, kit: KIT_PREF, ready: true }, humans: [] };
      showLobby(); lobbySig = ''; lobbyCast(); renderLobby();
    };
    const drawThumb = (cv, map) => {
      const x = cv.getContext('2d'), k = cv.width / W, th = THEMES[map.theme]; x.imageSmoothingEnabled = false;
      x.fillStyle = th.g; x.fillRect(0, 0, cv.width, cv.height);
      const R_ = (r, c) => { x.fillStyle = c; x.fillRect(r[0] * k, r[1] * k, Math.max(1, r[2] * k), Math.max(1, r[3] * k)); };
      map.water.forEach((r) => R_(r, '#2f6f9e')); map.mud.forEach((r) => R_(r, '#5a4328')); map.crates.forEach((r) => R_(r, '#a06a30')); map.bags.forEach((r) => R_(r, '#c9ae74')); map.wins.forEach((r) => R_(r, '#8ca4b4')); map.walls.forEach((r) => R_(r, '#6a655c'));
      x.fillStyle = 'rgba(30,90,30,.8)'; map.bush.forEach((b) => { x.beginPath(); x.arc(b[0] * k, b[1] * k, b[2] * k, 0, 6.3); x.fill(); });
      for (let t = 0; t < 2; t++) { x.fillStyle = TEAMS[t].c; map.sp[t].forEach((p) => x.fillRect(p[0] * k - 2, p[1] * k - 2, 4, 4)); x.fillRect(map.flag[t][0] * k - 3, map.flag[t][1] * k - 3, 6, 6); }
      x.fillStyle = '#ffd966'; map.pts.forEach((p) => { x.beginPath(); x.arc(p[0] * k, p[1] * k, 3, 0, 6.3); x.fill(); });
    };
    const renderLobby = () => {
      if (!lobbyEl || !LB) return; if (lobbyBusy) return; lobbyBusy = true;
      try {
        const md = MODE_DEF[LB.mode], host = LB.host, hs = host ? humansList() : LB.humans;
        const per = [hs.filter((h) => h.team === 0), hs.filter((h) => h.team === 1)], ts = Math.min(4, Math.max(LB.ts, per[0].length, per[1].length));
        const teamHtml = (t) => { let h = ''; for (let i = 0; i < ts; i++) {
          const q = per[t][i];
          if (q) { const k = KITS[q.kit] || KITS.scout; h += `<div class="sl"><span>${k.ic}</span><b style="margin:0;font-size:12px">${esc(q.name)}${q.host ? ' (host)' : ''}${q.me ? ' (you)' : ''}</b><span class="k">${k.n}${host || q.ready || q.host ? '' : ''}${q.ready || q.host ? ' ✔' : ' …'}</span>${host && !q.me && q.conn ? `<button onclick="PVP_ui('swap','${q.uid}')">⇄</button>` : (host && q.me ? `<button onclick="PVP_ui('swap','${q.uid}')">⇄</button>` : '')}</div>`; }
          else h += LB.fill ? `<div class="sl bot"><span>🤖</span>Bot (${DIFFS[LB.diff].n})</div>` : '<div class="sl empty">empty</div>';
        } return h; };
        const mapCards = ['random', ...MAP_ORDER].map((id) => `<div class="mc ${LB.map === id ? 'on' : ''}" onclick="PVP_ui('map','${id}')">${id === 'random' ? '<div style="aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;font-size:30px;background:#241e17;border-radius:3px;margin-bottom:3px">🎲</div><b>Random</b><small>Any map</small>' : `<canvas data-map="${id}" width="160" height="120"></canvas><b>${MAPS[id].name}</b><small>${esc(MAPS[id].desc)}</small>`}</div>`).join('');
        const me = hs.find((q) => q.me) || { kit: LB.me.kit };
        const kits = KIT_ORDER.map((id) => { const k = KITS[id]; return `<div class="kc ${LB.me.kit === id ? 'on' : ''}" onclick="PVP_ui('kit','${id}')"><b>${k.ic} ${k.n}</b><small>Skill: ${k.ab.n}. ${k.ab.d}.</small><small>${k.pas}</small></div>`; }).join('');
        const seg = (items, cur, act) => items.map(([v, n]) => `<button class="seg ${String(cur) === String(v) ? 'on' : ''}" ${host ? `onclick="PVP_ui('${act}','${v}')"` : 'disabled'}>${n}</button>`).join('');
        const hcode = host ? MP.code : LB.hostCode, foreign = hs.filter((q) => q.grp && q.grp !== hcode), leadersBlock = hs.filter((q) => q.ld && !q.host && !q.ready);
        const teamBox = (host ? `<div class="row">Party type: ${seg([[0, 'Mixed party (assign teams)'], [1, 'Team party (one team, find opponents)']], LB.teamMode ? 1 : 0, 'ptype')}</div>` : '')
          + (host && LB.teamMode && MP.role === 'host' && !foreign.length ? `<div class="pty">Your team's code: <b>${esc(MP.code)}</b>. Find opponents: type the other team's code <input id="pvl-code" maxlength="5" placeholder="ABCDE" style="width:90px;text-transform:uppercase;font:inherit;background:#14110e;color:#e8dec6;border:2px solid #4d4235;padding:2px 6px"> <button class="seg" style="font:inherit;font-size:12px;background:#2a3318;color:#e8dec6;border:2px solid #8aa04a;border-radius:4px;padding:3px 8px;cursor:pointer" onclick="PVP_ui('merge')">Join match</button><br>or share your code: their leader enters it in the same box and your two parties merge (their team joins yours, you pick the map and mode).</div>` : '')
          + (foreign.length ? `<div class="pty">Merged match party <b>${esc(hcode || '')}</b>: ${foreign.length} player(s) from another team joined (${foreign.filter((q) => q.ld).map((q) => esc(q.name)).join(', ') || 'no leader'} leads them). Both leaders must be ready.${host ? ' <button class="seg" style="font:inherit;font-size:12px;background:#1d1812;color:#e8dec6;border:2px solid #4d4235;border-radius:4px;padding:3px 8px;cursor:pointer" onclick="PVP_ui(\'split\')">Split back to teams</button>' : ' Your team party: <b>' + esc(MG ? MG.home : '') + '</b>.'}</div>` : '');
        const chatBox = `<div class="pty" style="border-style:solid">${(LB.chat || []).map((m) => `<div style="color:${TEAMS[m.tm] ? TEAMS[m.tm].c : '#ccc'}">${esc(m.n)}: ${esc((CHAT[m.i] || ['?'])[0])}${(CHAT[m.i] || [0, 0])[1] ? ' <small>(team)</small>' : ''}</div>`).join('') || '<small style="color:#9a8e7a">Quick chat (team ones only reach your team):</small>'}<div style="margin-top:4px">${CHAT.map((q, i) => `<button class="seg" style="font:inherit;font-size:11px;background:#1d1812;color:#e8dec6;border:1px solid #4d4235;border-radius:3px;padding:1px 6px;margin:1px;cursor:pointer" onclick="PVP_ui('chat','${i}')">${esc(q[0])}</button>`).join('')}</div></div>`;
        const nh = hs.length, allReady = hs.every((q) => q.ready || q.host), partyLine = MP.role === 'host' ? `<div class="pty">Party code <b>${esc(MP.code)}</b> · ${nh}/8 here. Friends: Party, join with this code.<br><button class="seg" style="margin-top:4px" onclick="openParty()">Party panel</button></div>` : (MP.role === 'guest' ? `<div class="pty">In ${esc(MP.code)}'s party. The host picks the map and mode.</div>` : `<div class="pty">Playing alone with bots. <button class="seg" style="font:inherit;padding:3px 8px;background:#1d1812;color:#e8dec6;border:2px solid #4d4235;border-radius:4px;cursor:pointer" onclick="PVP_ui('party')">Invite friends (host a party)</button></div>`);
        lobbyEl.className = host ? '' : 'guest';
        lobbyEl.innerHTML = `<div class="pp">${host ? `<button class="x" onclick="PVP_ui('close')">Close</button>` : (MG ? `<button class="x" onclick="PVP_ui('leaveTeam')">Leave team</button><button class="x" style="margin-right:6px" onclick="PVP_ui('leaveMatch')">Leave match</button>` : `<button class="x" onclick="PVP_ui('close')">Leave</button>`)}<h2>${md.ic} ${md.n}</h2><div class="sub">${esc(md.d)}</div>
<div class="cols"><div><h3>Map ${host ? '' : '(host picks)'}</h3><div class="maps">${mapCards}</div>
<div class="ctl"><b>Controls</b> · WASD move · Mouse aim (no auto-aim) · Click fire · 1/2/3 or Q or wheel switch weapon · Space/Shift dash-roll (i-frames) · E or right-click kit skill · R revive (hold) · Tab scoreboard · Z X C V emotes. Touch: left stick, right aim stick, buttons.</div></div>
<div><h3>Teams ${host ? '(⇄ moves a player)' : ''}</h3><div class="teams">${[0, 1].map((t) => `<div class="tm" style="border-color:${TEAMS[t].c}"><b style="color:${TEAMS[t].c}">${TEAMS[t].n}</b>${teamHtml(t)}</div>`).join('')}</div>
<h3>Your kit</h3><div class="kits">${kits}</div>
<h3>Rules</h3>
<div class="row">Loadout: ${seg([['own', 'My loadout (balanced)'], ['std', 'Standard issue']], LB.rules, 'rules')}</div>
<div class="row">Team size: ${seg([[1, '1v1'], [2, '2v2'], [3, '3v3'], [4, '4v4']], ts, 'ts')}</div>
<div class="row">Bots: ${seg([['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['brutal', 'Brutal']], LB.diff, 'diff')} ${host ? `<label><input type="checkbox" ${LB.fill ? 'checked' : ''} onchange="PVP_ui('fill',this.checked)"> fill empty slots</label>` : ''}</div>
<div class="row">Limit (${md.limN}): ${seg(md.lim.map((v) => [v, v]), LB.lim, 'lim')}</div>
${teamBox}
${partyLine}
${chatBox}
${host ? `<button class="go" ${leadersBlock.length ? 'disabled' : ''} onclick="PVP_ui('start')">${leadersBlock.length ? 'Waiting for ' + leadersBlock.map((q) => esc(q.name)).join(', ') + ' (leader) to ready up' : nh > 1 && !allReady ? 'Start anyway (' + hs.filter((q) => !(q.ready || q.host)).map((q) => esc(q.name)).join(', ') + ' not ready)' : 'Start match'}</button>`
          : `<button class="go" onclick="PVP_ui('ready')">${LB.me.ready ? 'Ready ✔ (click to undo)' : 'Ready up'}</button>`}</div></div></div>`;
        lobbyEl.querySelectorAll('canvas[data-map]').forEach((cv) => drawThumb(cv, MAPS[cv.dataset.map]));
      } finally { lobbyBusy = false; }
    };
    window.PVP_ui = (a, v) => {
      try {
        if (!LB) return; const host = LB.host;
        if (a === 'kit') { if (!KITS[v]) return; LB.me.kit = v; KIT_PREF = v; if (!host) mpSend(MP.hostConn, { t: 'pvk', kit: v, ready: LB.me.ready }); else lobbyDirty(); renderLobby(); return; }
        if (a === 'ready' && !host) { LB.me.ready = !LB.me.ready; mpSend(MP.hostConn, { t: 'pvk', kit: LB.me.kit, ready: LB.me.ready }); renderLobby(); return; }
        if (a === 'chat') { if (host) hostChat(myName(), LB.me.team, +v); else mpSend(MP.hostConn, { t: 'pvc', i: +v }); return; }
        if (a === 'leaveTeam') { MG = null; if (MP.role === 'guest') partyLeave(); stopAll(true); return; }
        if (a === 'leaveMatch') { returnHome(); return; }
        if (a === 'close') { if (host) { castAll({ t: 'pvx', why: 'The host closed the PvP lobby.' }); stopAll(true); } else { if (MP.role === 'guest') partyLeave(); stopAll(true); } return; }
        if (a === 'party') { if (window.partyHost) partyHost(); if (window.openParty) openParty(); return; }
        if (!host) return;
        if (a === 'map') LB.map = v; else if (a === 'rules') LB.rules = v; else if (a === 'ts') LB.ts = +v; else if (a === 'diff') LB.diff = v; else if (a === 'lim') LB.lim = +v; else if (a === 'fill') LB.fill = !!v;
        else if (a === 'swap') { if (v === myUid()) LB.me.team ^= 1; else { const c = MP.conns.find((q) => q.info && q.info.uid === v); if (c && c.pv) c.pv.team ^= 1; } }
        else if (a === 'ptype') { LB.teamMode = +v === 1; if (LB.teamMode) { LB.me.team = 0; MP.conns.forEach((c) => { if (c.pv && !(c.pv.grp && c.pv.grp !== MP.code)) c.pv.team = 0; }); } }
        else if (a === 'merge') { const el = document.getElementById('pvl-code'); mergeJoinCode(el ? el.value : ''); return; }
        else if (a === 'split') { splitTeams(); return; }
        else if (a === 'start') { startMatch(); return; }
        lobbyCast(); renderLobby();
      } catch (e) { console.error('[pvp ui]', e); }
    };
    const closeLobby = () => { clearInterval(lobbyTimer); lobbyTimer = null; if (lobbyEl) { lobbyEl.remove(); lobbyEl = null; } };

    // ---- merge / split plumbing
    const gotoJoin = (code) => { const inp = document.getElementById('party-code'); if (!inp) return false; inp.value = code; partyJoin(); return true; };
    const mergeAnnounce = () => { if (MG && MP.role === 'guest' && MP.hostConn) mpSend(MP.hostConn, { t: 'pvk', kit: KIT_PREF, ready: !!(LB && LB.me && LB.me.ready), grp: MG.home, ld: MG.ld }); };
    const mergeStart = (code, home, ld) => {   // this player's party is merging into the match party `code`
      if (code.length !== 5 || home.length !== 5) return;
      closeLobby(); LB = null; MG = { home, ld, code, phase: 'joining', mode: MG && MG.mode, tries: 0 };
      toast('Joining match ' + code + '...');
      setTimeout(() => { if (!MG || MG.phase !== 'joining') return; try { if (MP.role) partyLeave(); } catch (e) {} setTimeout(mergeTry, 800); }, ld ? 700 : 400);
    };
    const mergeTry = () => {
      if (!MG || MG.phase !== 'joining') return;
      if (MG.tries++ >= 3) { toast('Could not join match ' + MG.code + '. Back to your team party.'); return returnHome(); }
      try { if (MP.role) partyLeave(); } catch (e) {}
      if (!gotoJoin(MG.code)) { toast('Joining failed (party panel not ready).'); return returnHome(); }
      clearTimeout(MG.chk); MG.chk = setTimeout(() => { if (!MG || MG.phase !== 'joining') return; if (MP.role === 'guest' && MP.code === MG.code) { mergeAnnounce(); return; } if (MP.role === 'guest') return; mergeTry(); }, 14000);
    };
    const mergeJoinCode = (raw) => {
      const code = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 5) return toast('Codes are 5 characters.');
      if (MP.role !== 'host' || !LB || !LB.host) return toast('Host your team party first.');
      if (code === MP.code) return toast('That is your own team code.');
      const home = MP.code, mode = LB.mode;
      castAll({ t: 'pvmerge', code, home });
      mergeStart(code, home, 1); MG.mode = mode;
    };
    const splitTeams = () => {   // match host: send the other team(s) home, keep our own party
      MP.conns.forEach((c) => { if (c.open && c.pv && c.pv.grp && c.pv.grp !== MP.code) mpSend(c, { t: 'pvsplit', home: c.pv.grp }); });
      toast('Teams split. Each team goes back to its own party.');
    };
    const returnHome = () => {   // back to my own team party (leader re-opens it under its old code, members re-join it)
      const m = MG; if (!m || m.phase === 'home') return; clearTimeout(m.chk); m.phase = 'home'; const home = m.home, mode = m.mode || 'tdm';
      teardown(false); closeLobby(); LB = null; if (MODES.active && (MODES.active.tags || []).includes('pvp')) MODES.active = null;
      try { if (MP.role === 'guest') mpSend(MP.hostConn, { t: 'pvq' }); if (MP.role) partyLeave(); } catch (e) {}
      if (typeof enterLobby === 'function' && currentUserData) { try { enterLobby(); } catch (e) {} }
      toast('Returning to your team party...');
      if (m.ld) {
        setTimeout(() => {
          window.PVP_wantCode = home; if (MP.role) { try { partyLeave(); } catch (e) {} } partyHost(); let n = 0;
          const w = setInterval(() => {
            if (MP.role === 'host' && MP.code === home) { clearInterval(w); MG = null; MODES.launch('pvp_' + mode); if (LB) { LB.teamMode = true; lobbyCast(); renderLobby(); } }
            else if (++n > 40) { clearInterval(w); MG = null; window.PVP_wantCode = ''; toast('Could not reopen your team party. Host a new one from Party up.'); }
          }, 500);
        }, 1500);
      } else {
        let n = 0; const tryJ = () => {
          if (!MG || MG.phase !== 'home') return;
          if (MP.role === 'guest' && MP.code === home) { MG = null; return; }
          if (++n > 10) { MG = null; toast('Could not rejoin your team party. Ask your leader for the code.'); return; }
          if (!MP.role) gotoJoin(home);
          setTimeout(tryJ, 5000);
        }; setTimeout(tryJ, 4500);
      }
    };
    setInterval(() => { if (MG && MG.phase === 'joining' && MP.role === 'guest' && MP.code === MG.code && MP.hostConn && MP.hostConn.open && !MG.sent) { MG.sent = 1; MG.phase = 'in'; mergeAnnounce(); toast('Joined match ' + MG.code + '.'); } }, 500);

    // ================================================================ D. MATCH START / STOP
    const botLoadout = (rules) => {
      if (rules === 'std') return STD_LOADOUT;
      const pool = ['SLING', 'NAIL', 'RAIL', 'ARC', 'SAWB', 'FIRE', 'STD_PISTOL', 'STD_SMG', 'STD_SHOT', 'HOSE', 'MINES', 'TURRET'], out = [];
      while (out.length < 3) { const id = pool[(rnd() * pool.length) | 0]; if (!out.includes(id)) out.push(id); }
      if (!out.some((id) => WTYPES_OFF[wdef(id).t])) out[0] = 'STD_SMG'; return out;
    };
    const botLook = (i) => { const hairs = ['#c2552d', '#2a2118', '#d9c36a', '#7a4a2a', '#8a8f98', '#4a2a6a'], skins = ['#e0b48a', '#c58c5a', '#8a5a3a', '#f2d2b0']; return { hair: hairs[i % 6], skin: skins[(i * 3) % 4] }; };
    const startMatch = () => {
      if (!LB || !LB.host || S) return;
      const hs = humansList(), mode = LB.mode, mapId = LB.map === 'random' ? MAP_ORDER[(rnd() * MAP_ORDER.length) | 0] : LB.map;
      if ([0, 1].some((t) => hs.filter((h) => h.team === t).length > 4)) return toast('A team can have at most 4 players. Move someone with the swap button.');
      if (hs.some((h) => h.ld && !h.host && !h.ready)) return toast('Both team leaders must be ready.');
      let ts = Math.min(4, Math.max(LB.ts, hs.filter((h) => h.team === 0).length, hs.filter((h) => h.team === 1).length));
      const roster = []; const lo0 = (arr) => { const f = (arr || []).filter(Boolean); return f.length ? f : STD_LOADOUT; };
      hs.forEach((h) => roster.push({ name: h.name, team: h.team, kit: h.kit, bot: false, uid: h.uid, look: h.me ? lookOut(currentUserData) : h.conn.info.look, loadout: LB.rules === 'std' ? STD_LOADOUT : lo0(h.me ? currentUserData.loadout : h.conn.info.loadout), conn: h.conn }));
      let bn = (rnd() * BOT_NAMES.length) | 0, bi = 0;
      for (let t = 0; t < 2; t++) {
        let cnt = roster.filter((r) => r.team === t).length; const want = LB.fill || cnt === 0 ? ts : cnt;
        if (!LB.fill && cnt === 0) { /* a side must have somebody */ }
        while (cnt < want) { roster.push({ name: BOT_NAMES[(bn++) % BOT_NAMES.length], team: t, kit: KIT_ORDER[(rnd() * 4) | 0], bot: true, uid: 'b' + (bi), look: botLook(bi), loadout: botLoadout(LB.rules) }); bi++; cnt++; }
      }
      roster.sort((a, b) => a.team - b.team || (a.bot ? 1 : 0) - (b.bot ? 1 : 0));
      const cfg = { mode, mapId, rules: LB.rules, diff: LB.diff, lim: LB.lim, ts, roster, role: 'host' };
      S = newMatch(cfg); S.me = roster.findIndex((r) => r.uid === myUid() && !r.bot);
      S.pl.forEach((p, i) => { const r = roster[i]; if (r.conn) { p.conn = r.conn; r.conn.pvp = p; r.conn.pvEv = 0; r.conn.tb = 40; } });
      const slim = roster.map((r) => [r.name, r.team, r.kit, r.bot ? 1 : 0, r.uid, r.look, r.loadout]);
      MP.conns.forEach((c) => { if (c.pvp) mpSend(c, { t: 'pvgo', mode, map: mapId, ru: LB.rules, df: LB.diff, lim: LB.lim, r: slim, me: c.pvp.i }); });
      if (MP.role === 'host') MP.started = true;
      closeLobby(); beginRun();
    };
    const guestStart = (d) => {
      if (S) return; const def = MODES.list['pvp_' + d.mode]; if (!def) return; MODES.active = def; closeLobby();
      const roster = d.r.slice(0, 8).map((a) => ({ name: String(a[0]).slice(0, 16), team: a[1] ? 1 : 0, kit: a[2], bot: !!a[3], uid: a[4], look: a[5], loadout: Array.isArray(a[6]) ? a[6].slice(0, 3).map(String) : STD_LOADOUT }));
      S = newMatch({ mode: d.mode, mapId: d.map, rules: d.ru, diff: d.df, lim: d.lim, roster, role: 'guest' }); S.me = d.me | 0; S.evSeen = 0; S.role = 'guest';
      S.pl.forEach((p) => { p.ai = null; }); beginRun();
    };
    const beginRun = () => {
      touchMode(true); running = true; if (typeof showScreen === 'function') showScreen('game');
      try { if (window.AIM && AIM.force) AIM.force('mouse'); } catch (e) {}
      document.body.classList.add('in-game'); mouse.down = mouse.rdown = false; canvasEl.style.cursor = 'none'; ME.slot = -1;
      MP.pvpLast = Date.now(); if (S.role === 'guest') { S.wd = setInterval(() => { if (!S || S.role !== 'guest') return; if (MP.role !== 'guest') { toast('The party closed.'); stopAll(true); } else if (Date.now() - (MP.lastRx || Date.now()) > 15000) { toast('Lost contact with the host.'); stopAll(true); } }, 2000); S.ping = setInterval(() => { if (MP.role === 'guest') mpSend(MP.hostConn, { t: 'pvh', c: Date.now() }); }, 2500); }
      last = 0; acc = 0; cancelAnimationFrame(loopId); loopId = requestAnimationFrame(frame);
    };
    const stopAll = (toLobby) => {
      running = false; cancelAnimationFrame(loopId); closeLobby(); closeEnd();
      if (S) { clearInterval(S.wd); clearInterval(S.ping); if (MP.role === 'host') { MP.started = false; MP.conns.forEach((c) => { c.pvp = null; }); } }
      S = null; LB = null; MP.pvpGuest = false; touchMode(false); canvasEl.style.cursor = '';
      try { if (window.AIM && AIM.force) { AIM.force(null); } } catch (e) {}
      if (MODES.active && (MODES.active.tags || []).includes('pvp')) MODES.active = null;
      if (toLobby && typeof enterLobby === 'function' && currentUserData) { try { enterLobby(); } catch (e) {} }
    };
    // the match loop
    let last = 0, acc = 0;
    const frame = (t) => {
      if (!running) return; loopId = requestAnimationFrame(frame);
      if (!last) last = t; acc += Math.min(t - last, 100); last = t;
      let n = 0; while (acc >= 1000 / 60 && n++ < 6) { acc -= 1000 / 60; try { simTick(); } catch (e) { console.error('[pvp tick]', e); } }
      try { render(); } catch (e) { console.error('[pvp draw]', e); }
    };
    const simTick = () => {
      const s = S; if (!s) return;
      if (s.role === 'guest') return guestTick(s);
      s.meP = s.me >= 0 ? s.pl[s.me] : null;
      // human host: movement/aim/fire go through the same stepMove as everyone
      step(s);
      if (s.tick % 3 === 0) sendSnaps();
      if (s.tick % 30 === 0 && MP.role === 'host') s.pl.forEach((p) => { if (p.conn && (!p.conn.open || !MP.conns.includes(p.conn))) { botify(s, p, ' (bot)'); } });
      if (s.ph === 'over' && !s.endShown) { s.endShown = 1; }
    };
    const guestTick = (s) => {
      const me = s.pl[s.me]; if (!me) return; s.tick++;
      // bullets coast between snapshots
      for (const b of s.bul) { b.x += b.vx; b.y += b.vy; }
      for (const p of s.pl) { if (p === me) continue; p.dx += (p.tx - p.dx) * 0.33; p.dy += (p.ty - p.dy) * 0.33; if (p.aimT !== undefined) { let a = p.aimT - p.aim; a = Math.atan2(Math.sin(a), Math.cos(a)); p.aim += a * 0.5; } if (p.hitF > 0) p.hitF--; }
      if (s.shake > 0) s.shake *= 0.86; if (s.banner && --s.banner.life <= 0) s.banner = null; s.fx = s.fx.filter((f) => --f.life > 0); for (const b of s.bagsAll) if (b.flash > 0) b.flash--;
      let mx = 0, my = 0; if (keys.KeyW || keys.ArrowUp) my--; if (keys.KeyS || keys.ArrowDown) my++; if (keys.KeyA || keys.ArrowLeft) mx--; if (keys.KeyD || keys.ArrowRight) mx++; mx += touch.mx; my += touch.my;
      const aimP = aimOf(me), dash = !!(keys.Space || keys.ShiftLeft || keys.ShiftRight || touch.dash);
      me.aim = aimP.a; me.shielding = !!(me.alive && wdef(me.loadout[me.wi] || me.loadout[0]).t === 'shield' && (mouse.down || touch.fire) && me.dashT <= 0);
      if (me.alive && s.ph === 'play') {
        const seq = ++s.seq; s.hist.push([seq, mx, my, dash]); if (s.hist.length > 90) s.hist.shift();
        stepMove(s, me, mx, my, dash);
      }
      me.dx = me.x + me.ox; me.dy = me.y + me.oy; me.ox *= 0.82; me.oy *= 0.82;
      if (s.tick % 2 === 0) {
        const c = s.hist.filter((q) => q[0] > (s.sentSeq || 0)).slice(-10); if (c.length) s.sentSeq = c[c.length - 1][0];
        const f = ((mouse.down || touch.fire || keys.KeyJ) ? 1 : 0) | ((keys.KeyE || mouse.rdown || touch.ab) ? 2 : 0) | (keys.KeyR ? 4 : 0);
        const msg = { t: 'pvi', c: c.map((q) => [q[0], q[1], q[2], q[3] ? 1 : 0]), a: Math.round(aimP.a * 100), f, s: ME.slot < 0 ? undefined : ME.slot, r: Math.round(hyp(aimP.tx - me.x, aimP.ty - me.y)), e: ME.emT > 0 ? ME.em : 0 };
        if (ME.emT > 0) ME.emT--; else ME.em = 0;
        mpSend(MP.hostConn, msg);
      }
      if (me.alive && s.ph === 'play' && (mouse.down || touch.fire)) { const w = wdef(me.loadout[me.wi] || me.loadout[0]); if (me.cds[me.wi] <= 0 && w.t !== 'shield' && s.tick % 3 === 0) { me.muz = 3; } }
    };
    const hostStepInputs = null;   // (movement for the host player and bots is applied inside step())

    // ================================================================ E. EVENTS (shared by host and guests)
    const feedAdd = (s, parts) => { s.feed.push({ parts, t: 420 }); if (s.feed.length > 7) s.feed.shift(); };
    const nm = (s, i) => { const p = s.pl[i]; return p ? [p.name, TEAMS[p.team].c] : ['?', '#aaa']; };
    const fx = (s, o) => { if (s.fx.length < 260) s.fx.push(o); };
    const spark = (s, x, y, n, col, sp) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.283, v = (sp || 2) * (0.4 + rnd()); fx(s, { k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 14 + ((rnd() * 10) | 0), max: 24, col, r: 1 + rnd() * 2 }); } };
    const vantage = (s) => { const me = s.pl[s.me]; if (me && me.alive) return me; const sp = s.pl[s.spec]; return sp && sp.alive ? sp : me; };
    const handleEv = (s, e, host) => {
      const t = e[1], me = s.pl[s.me];
      switch (t) {
        case 'f': { const p = s.pl[e[2]]; if (p) { fx(s, { k: 'mz', x: p.dx + Math.cos(e[3] / 100) * 14, y: p.dy + Math.sin(e[3] / 100) * 14, life: 4, max: 4, a: e[3] / 100, big: e[4] }); if (p === me && e[4] !== 3) s.shake = Math.max(s.shake, e[4] === 1 ? 3 : 1); } break; }
        case 'h': { const tp = s.pl[e[2]], sp = s.pl[e[3]]; const mineSrc = sp && sp === me, mineTgt = tp && tp === me; if (mineSrc || mineTgt) fx(s, { k: 'n', x: e[5] + (rnd() - 0.5) * 10, y: e[6], txt: String(e[4]), life: 40, max: 40, col: mineTgt ? '#ff5a4a' : '#ffe27a' }); if (mineSrc) s.hit = 8; if (mineTgt) { s.hurtF = 10; s.shake = Math.max(s.shake, 4); } if (tp) spark(s, tp.dx, tp.dy, 3, '#c0392b', 1.5); break; }
        case 'k': { const v = s.pl[e[2]], k = s.pl[e[3]], a = s.pl[e[4]];
          const parts = []; if (k) parts.push(nm(s, e[3])); else parts.push(['The zone', '#aaa']); parts.push([a ? ' + ' : '', '#aaa']); if (a) parts.push(nm(s, e[4])); parts.push([' ' + (e[7] === 'rail' ? '>>' : '>') + ' ', '#e8dec6']); parts.push(nm(s, e[2])); feedAdd(s, parts);
          if (v) { spark(s, e[5], e[6], 16, TEAMS[v.team].c, 3); fx(s, { k: 'ring', x: e[5], y: e[6], life: 18, max: 18, r: 40, col: TEAMS[v.team].c }); }
          if (k && k === me) { s.banner = { t: 'ELIMINATED ' + (v ? v.name : ''), sub: '', life: 70, small: 1 }; s.shake = Math.max(s.shake, 6); } else if (v && v === me) { s.banner = { t: k ? 'Eliminated by ' + k.name : 'You were eliminated', sub: '', life: 90, small: 1 }; }
          break; }
        case 'x': { fx(s, { k: 'boom', x: e[2], y: e[3], life: 20, max: 20, r: e[4] }); spark(s, e[2], e[3], 14, '#ffb347', 3.5); const v = vantage(s); if (v) s.shake = Math.max(s.shake, Math.min(9, 600 / (30 + hyp(v.dx - e[2], v.dy - e[3])) * (e[4] / 70))); break; }
        case 'd': { const p = s.pl[e[2]]; fx(s, { k: 'ring', x: e[3], y: e[4], life: 12, max: 12, r: 22, col: '#ffffff' }); if (p) spark(s, e[3], e[4], 5, '#dddddd', 1.2); break; }
        case 'br': { spark(s, e[2], e[3], 14, e[4] ? '#9a6a35' : '#c9ae74', 3); fx(s, { k: 'ring', x: e[2], y: e[3], life: 14, max: 14, r: 26, col: '#b8a88a' }); s.shake = Math.max(s.shake, 2); break; }
        case 'hw': spark(s, e[2], e[3], 3, e[4] === 1 ? '#c9ae74' : e[4] === 2 ? '#a06a30' : '#ffe9a0', 1.8); break;
        case 'rl': fx(s, { k: 'line', x1: e[2], y1: e[3], x2: e[4], y2: e[5], life: 12, max: 12, col: e[6] ? '#8cc8ff' : '#ff9a8a' }); s.shake = Math.max(s.shake, 2); break;
        case 'ar': { const pts = String(e[3]).split(' ').map((q) => q.split(',').map(Number)); fx(s, { k: 'arc', pts, life: 10, max: 10, col: e[2] ? '#8cc8ff' : '#ffd0a0' }); break; }
        case 'sw': { const p = s.pl[e[2]]; if (p) fx(s, { k: 'swing', x: p.dx, y: p.dy, a: e[3] / 100, life: 8, max: 8 }); break; }
        case 'dp': fx(s, { k: 'ring', x: e[2], y: e[3], life: 12, max: 12, r: 30, col: '#c9ae74' }); spark(s, e[2], e[3], 8, '#c9ae74', 1.5); break;
        case 'hp': fx(s, { k: 'ring', x: e[2], y: e[3], life: 26, max: 26, r: e[4], col: '#8fd16a', fill: 1 }); break;
        case 'hl': { const p = s.pl[e[2]]; if (p && (p === me || vantage(s) === p)) fx(s, { k: 'n', x: p.dx, y: p.dy - 18, txt: '+' + e[3], life: 36, max: 36, col: '#8fd16a' }); break; }
        case 'pk': { const p = s.pl[e[2]]; if (p) fx(s, { k: 'n', x: p.dx, y: p.dy - 26, txt: { hp: 'HEALTH', sp: 'SPEED', dm: 'DAMAGE UP', pw: 'ROCKETS x3' }[e[3]] || '', life: 44, max: 44, col: '#ffffff' }); break; }
        case 'fp': { feedAdd(s, [nm(s, e[3]), [' took the ' + TEAMS[e[2]].n + ' flag', TEAMS[e[2]].c]]); const p = s.pl[e[3]]; if (me && p) s.banner = { t: p.team === me.team ? 'YOUR TEAM HAS THE FLAG' : TEAMS[e[2]].n + ' FLAG TAKEN!', sub: '', life: 80, small: 1 }; break; }
        case 'fd': feedAdd(s, [['The ' + TEAMS[e[2]].n + ' flag was dropped', TEAMS[e[2]].c]]); break;
        case 'fr': feedAdd(s, [['The ' + TEAMS[e[2]].n + ' flag returned', TEAMS[e[2]].c]]); break;
        case 'fc': { feedAdd(s, [nm(s, e[3]), [' CAPTURED for ' + TEAMS[e[2]].n, TEAMS[e[2]].c]]); s.banner = { t: TEAMS[e[2]].n + ' SCORES!', sub: s.pl[e[3]] ? s.pl[e[3]].name : '', life: 100 }; break; }
        case 'dc': s.banner = { t: TEAMS[e[2]].n + ' CAPTURED A POINT', sub: '', life: 70, small: 1 }; break;
        case 'st': { const p = s.pl[e[2]], n = { 3: 'KILLING SPREE', 5: 'RAMPAGE', 7: 'UNSTOPPABLE' }[e[3]]; if (p) { feedAdd(s, [nm(s, e[2]), [' is on a ' + n, '#ffd966']]); if (p === me) s.banner = { t: n + '!', sub: { 3: '+30 shield', 5: 'Speed + damage up', 7: 'Full heal + rockets' }[e[3]], life: 100 }; } break; }
        case 'bn': s.banner = { t: e[2], sub: e[3] || '', life: 90 }; break;
        case 'ms': feedAdd(s, [[e[2], '#ffb347']]); break;
        case 'rv': { const a = s.pl[e[2]], b = s.pl[e[3]]; if (a && b) { feedAdd(s, [nm(s, e[3]), [' revived ', '#e8dec6'], nm(s, e[2])]); fx(s, { k: 'ring', x: a.dx, y: a.dy, life: 24, max: 24, r: 40, col: '#8fd16a' }); } break; }
        case 'sp': fx(s, { k: 'ring', x: e[2], y: e[3], life: 18, max: 18, r: 34, col: '#ffffff' }); break;
        case 'sh': spark(s, e[2] + Math.cos(e[4] / 100) * 16, e[3] + Math.sin(e[4] / 100) * 16, 4, '#9ad0ff', 2); break;
      }
    };

    // ================================================================ E. RENDER
    const rects = (c, list, fn) => list.forEach((r) => fn(c, r));
    const getBg = (map) => {
      if (bgCache[map.id]) return bgCache[map.id];
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'), th = THEMES[map.theme];
      x.fillStyle = th.g; x.fillRect(0, 0, W, H);
      let sd = 4242 + map.id.length * 77; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 1100; i++) { x.fillStyle = rr() < 0.5 ? th.s : th.s2; const w = 2 + ((rr() * 7) | 0); x.fillRect((rr() * W) | 0, (rr() * H) | 0, w, w); }
      if (map.theme === 'concrete' || map.theme === 'asphalt') { x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; for (let i = 0; i < W; i += 50) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); } for (let j = 0; j < H; j += 50) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); } }
      if (map.theme === 'asphalt') { x.strokeStyle = 'rgba(230,200,80,.35)'; x.setLineDash([16, 14]); x.lineWidth = 3; x.beginPath(); x.moveTo(0, 300); x.lineTo(W, 300); x.moveTo(400, 0); x.lineTo(400, H); x.stroke(); x.setLineDash([]); }
      for (let t = 0; t < 2; t++) { x.fillStyle = TEAMS[t].c + '22'; map.sp[t].forEach((p) => { x.beginPath(); x.arc(p[0], p[1], 26, 0, 6.3); x.fill(); }); x.strokeStyle = TEAMS[t].c + '55'; x.lineWidth = 2; x.beginPath(); x.arc(map.flag[t][0], map.flag[t][1], 26, 0, 6.3); x.stroke(); }
      map.water.forEach((r) => { x.fillStyle = '#2b6a96'; x.fillRect(r[0], r[1], r[2], r[3]); x.fillStyle = '#3b86b8'; for (let i = 0; i < r[2] * r[3] / 500; i++) x.fillRect(r[0] + rr() * r[2], r[1] + rr() * r[3], 8 + rr() * 8, 2); x.strokeStyle = '#1d4a6c'; x.lineWidth = 2; x.strokeRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); });
      map.mud.forEach((r) => { x.fillStyle = '#4a3622'; x.fillRect(r[0], r[1], r[2], r[3]); x.fillStyle = '#5c4430'; for (let i = 0; i < r[2] * r[3] / 300; i++) { x.beginPath(); x.arc(r[0] + rr() * r[2], r[1] + rr() * r[3], 2 + rr() * 4, 0, 6.3); x.fill(); } x.strokeStyle = '#2f2214'; x.lineWidth = 2; x.strokeRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); });
      map.pk.forEach((p) => { x.fillStyle = 'rgba(255,255,255,.06)'; x.beginPath(); x.arc(p[0], p[1], 15, 0, 6.3); x.fill(); x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1; x.stroke(); });
      // low walls / windows: block movement, not bullets
      map.wins.forEach((r) => { x.fillStyle = '#51606b'; x.fillRect(r[0], r[1], r[2], r[3]); x.fillStyle = 'rgba(160,215,240,.55)'; x.fillRect(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4); x.strokeStyle = '#2d363d'; x.lineWidth = 2; x.strokeRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1; const long = r[2] > r[3]; for (let q = 14; q < (long ? r[2] : r[3]); q += 16) { x.beginPath(); if (long) { x.moveTo(r[0] + q, r[1] + 2); x.lineTo(r[0] + q - 4, r[1] + r[3] - 2); } else { x.moveTo(r[0] + 2, r[1] + q); x.lineTo(r[0] + r[2] - 2, r[1] + q - 4); } x.stroke(); } });
      // solid walls: indestructible brick
      map.walls.forEach((r) => {
        x.fillStyle = '#5d564c'; x.fillRect(r[0], r[1], r[2], r[3]); x.fillStyle = '#6f675b'; x.fillRect(r[0], r[1], r[2], 3); x.fillStyle = '#3b362f'; x.fillRect(r[0], r[1] + r[3] - 3, r[2], 3);
        x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; for (let yy = r[1] + 8; yy < r[1] + r[3]; yy += 8) { x.beginPath(); x.moveTo(r[0], yy); x.lineTo(r[0] + r[2], yy); x.stroke(); const off = (((yy - r[1]) / 8) | 0) % 2 ? 6 : 0; for (let xx = r[0] + off + 12; xx < r[0] + r[2]; xx += 14) { x.beginPath(); x.moveTo(xx, yy - 8); x.lineTo(xx, yy); x.stroke(); } }
        x.strokeStyle = '#1e1b17'; x.lineWidth = 2; x.strokeRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2);
      });
      x.strokeStyle = th.edge; x.lineWidth = 8; x.strokeRect(0, 0, W, H);
      return (bgCache[map.id] = cv);
    };
    const drawBag = (c, b) => {
      const f = Math.max(0, b.hp / b.mhp), x = b.x, y = b.y, w = b.w, h = b.h, fl = b.flash > 0;
      if (b.k === 'bag') {
        const long = w >= h, n = Math.max(1, Math.round((long ? w : h) / 14));
        for (let i = 0; i < n; i++) { const sw = long ? w / n : w, sh = long ? h : h / n, sx = long ? x + i * sw : x, sy = long ? y : y + i * sh; c.fillStyle = fl ? '#fff2c8' : (f > 0.5 ? '#c9ae74' : f > 0.25 ? '#a98f5c' : '#8a7448'); c.beginPath(); c.roundRect ? c.roundRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1, 4) : c.rect(sx + 0.5, sy + 0.5, sw - 1, sh - 1); c.fill(); c.strokeStyle = '#6e5a34'; c.lineWidth = 1.2; c.stroke(); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(sx + 3, sy + 2, Math.max(2, sw - 8), 2); }
        if (b.dep) { c.strokeStyle = TEAMS[b.team].c; c.lineWidth = 2; c.strokeRect(x - 1, y - 1, w + 2, h + 2); }
      } else {
        c.fillStyle = fl ? '#ffd9a8' : (f > 0.5 ? '#9a6a35' : f > 0.25 ? '#80552a' : '#654220'); c.fillRect(x, y, w, h); c.strokeStyle = '#4a2f14'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
        c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 2, y + 2); c.lineTo(x + w - 2, y + h - 2); c.moveTo(x + w - 2, y + 2); c.lineTo(x + 2, y + h - 2); c.stroke(); c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(x + 2, y + 2, w - 4, 2);
      }
      if (f < 0.7) { c.strokeStyle = 'rgba(20,12,4,.8)'; c.lineWidth = 1.4; let sd = (x * 7 + y * 13) | 0; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647; const k = f < 0.25 ? 4 : f < 0.5 ? 3 : 2; for (let i = 0; i < k; i++) { c.beginPath(); let px = x + rr() * w, py = y + rr() * h; c.moveTo(px, py); for (let j = 0; j < 3; j++) { px += (rr() - 0.5) * 12; py += (rr() - 0.5) * 12; c.lineTo(cl(px, x, x + w), cl(py, y, y + h)); } c.stroke(); } }
    };
    const drawRubble = (c, b) => { let sd = (b.x * 7 + b.y * 13) | 0; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647; c.fillStyle = b.k === 'bag' ? 'rgba(150,130,90,.55)' : 'rgba(100,70,40,.6)'; for (let i = 0; i < 7; i++) { const w = 2 + rr() * 5; c.fillRect(b.x + rr() * b.w, b.y + rr() * b.h, w, w * 0.8); } };
    const drawBush = (c, b, tt) => {
      let sd = (b[0] * 3 + b[1]) | 0; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 14; i++) { const a = rr() * 6.283, d = rr() * (b[2] - 8), r = 8 + rr() * 8, sway = Math.sin(tt / 700 + i) * 0.8; c.fillStyle = i % 3 ? '#2f6b2a' : (i % 2 ? '#3b8032' : '#245a22'); c.beginPath(); c.arc(b[0] + Math.cos(a) * d + sway, b[1] + Math.sin(a) * d, r, 0, 6.3); c.fill(); }
      c.fillStyle = 'rgba(160,230,120,.25)'; c.beginPath(); c.arc(b[0] - 4, b[1] - 5, b[2] * 0.45, 0, 6.3); c.fill();
    };
    const lookKeyFor = (p) => {
      if (p.sk && p.skT === p.team) return p.sk;
      try { const L = Object.assign({}, typeof cleanLook === 'function' ? cleanLook(p.look || {}) : (p.look || {}), { shirt: TEAMS[p.team].shirt }); p.sk = lookKey(L, false); p.skT = p.team; } catch (e) { p.sk = 'player'; }
      return p.sk;
    };
    const txt = (c, s_, x, y, size, col, al, font, st) => { c.font = size + 'px ' + (font || FCP); c.textAlign = al || 'left'; if (st) { c.strokeStyle = st; c.lineWidth = 3; c.strokeText(s_, x, y); } c.fillStyle = col; c.fillText(s_, x, y); };
    const visTo = (s, q, v) => {
      if (!v) return true; if (q.team === v.team) return true; if (!q.alive) return false;
      const key = q.i; if (s.visT === s.tick && s.visC[key] !== undefined) return s.visC[key];
      let see = false;
      for (const m of s.vsrc) {
        const d = hyp(m.dx - q.dx, m.dy - q.dy); if (d < 72) { see = true; break; }
        if (q.inBush && !(q.rev > 0)) continue;
        if (d < 400 && losClear(s, m.dx, m.dy, q.dx, q.dy)) { see = true; break; }
      }
      s.visC[key] = see; return see;
    };
    const castShadows = (s, c, v, tt) => {
      let cv = s.shCv; if (!cv) { cv = s.shCv = document.createElement('canvas'); cv.width = W; cv.height = H; }
      const x = cv.getContext('2d'); x.clearRect(0, 0, W, H); x.fillStyle = '#000';
      const vx = v.dx, vy = v.dy;
      for (const r of s.blockers) {
        if (inRect(vx, vy, r, 0)) continue;
        const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2; if (hyp(cx - vx, cy - vy) > 520) continue;
        const P = [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0] + r[2], r[1] + r[3]], [r[0], r[1] + r[3]]];
        for (let i = 0; i < 4; i++) {
          const a = P[i], b = P[(i + 1) % 4], ex = b[0] - a[0], ey = b[1] - a[1], nx = ey, ny = -ex, mx = (a[0] + b[0]) / 2 - vx, my = (a[1] + b[1]) / 2 - vy;
          if (nx * mx + ny * my >= 0) continue;   // only edges that face the viewer cast
          const k = 1400, ax = a[0] - vx, ay = a[1] - vy, bx = b[0] - vx, by = b[1] - vy, la = hyp(ax, ay) || 1, lb = hyp(bx, by) || 1;
          x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(b[0] + bx / lb * k, b[1] + by / lb * k); x.lineTo(a[0] + ax / la * k, a[1] + ay / la * k); x.closePath(); x.fill();
        }
      }
      c.save(); c.globalAlpha = 0.42; c.drawImage(cv, 0, 0); c.restore();
    };
    const arcCd = (c, x, y, r, f, col, w) => { c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.stroke(); c.strokeStyle = col; c.beginPath(); c.arc(x, y, r, -1.5708, -1.5708 + 6.283 * cl(f, 0, 1)); c.stroke(); };
    const fmtT = (t) => { t = Math.max(0, Math.ceil(t / 60)); return ((t / 60) | 0) + ':' + String(t % 60).padStart(2, '0'); };

    const render = () => {
      const s = S; if (!s) return; const c = ctx, tt = performance.now();
      const me = s.pl[s.me], v = vantage(s) || me; s.vsrc = s.pl.filter((q) => q.alive && v && q.team === v.team); s.vteam = v ? v.team : 0; if (s.visT !== s.tick) { s.visC = {}; s.visT = s.tick; }
      c.save();
      if (s.shake > 0.3) c.translate((rnd() - 0.5) * s.shake, (rnd() - 0.5) * s.shake);
      c.drawImage(getBg(s.map), 0, 0);
      // rubble + ground hazards
      s.bagsAll.forEach((b) => { if (b.hp <= 0 && !b.dep) drawRubble(c, b); });
      for (const h of s.hz) {
        if (h.k === 'f') { const f = Math.min(1, h.t / 30); c.fillStyle = `rgba(255,${100 + ((tt / 40) % 40)},20,${0.28 * f})`; c.beginPath(); c.arc(h.x, h.y, h.r, 0, 6.3); c.fill(); c.strokeStyle = 'rgba(255,140,40,.7)'; c.lineWidth = 2; c.stroke(); for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(255,200,60,.7)'; c.beginPath(); c.arc(h.x + Math.cos(tt / 200 + i * 1.6) * h.r * 0.5, h.y + Math.sin(tt / 170 + i * 2.1) * h.r * 0.5, 3, 0, 6.3); c.fill(); } }
        else if (h.k === 'g') { c.strokeStyle = 'rgba(176,75,255,.8)'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(h.x, h.y, h.r * (((tt / 600) + i / 3) % 1), 0, 6.3); c.stroke(); } c.fillStyle = 'rgba(30,0,50,.8)'; c.beginPath(); c.arc(h.x, h.y, 10, 0, 6.3); c.fill(); }
        else if (h.k === 'o') { const warm = h.tk <= h.w0; c.strokeStyle = warm ? 'rgba(255,77,109,.9)' : 'rgba(255,200,200,.9)'; c.lineWidth = 2; c.setLineDash(warm ? [6, 5] : []); c.beginPath(); c.arc(h.x, h.y, h.r, 0, 6.3); c.stroke(); c.setLineDash([]); if (!warm) { c.fillStyle = 'rgba(255,90,110,.35)'; c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(h.x - 3, 0, 6, h.y); } }
      }
      if (s.mode === 'koth' && s.zone) { const h = s.map.hills[s.zone.hi]; const col = s.zone.own >= 0 ? TEAMS[s.zone.own].c : '#ffd966'; c.fillStyle = col + (s.zone.cont ? '55' : '2a'); c.beginPath(); c.arc(h[0], h[1], 62, 0, 6.3); c.fill(); c.strokeStyle = s.zone.cont ? '#ffffff' : col; c.lineWidth = 3; c.setLineDash(s.zone.cont ? [8, 6] : []); c.stroke(); c.setLineDash([]); txt(c, 'HILL', h[0], h[1] + 5, 14, '#fff', 'center', FSP); }
      if (s.mode === 'dom' && s.zone) s.zone.pts.forEach((pt, i) => { const col = pt.own >= 0 ? TEAMS[pt.own].c : '#bbbbbb'; c.fillStyle = col + '30'; c.beginPath(); c.arc(pt.x, pt.y, 48, 0, 6.3); c.fill(); c.strokeStyle = col; c.lineWidth = 3; c.stroke(); txt(c, 'ABC'[i], pt.x, pt.y + 7, 20, '#fff', 'center', FSP); const pr = pt.prog / 100; if (Math.abs(pr) < 1) { c.fillStyle = pr > 0 ? TEAMS[0].c : TEAMS[1].c; c.fillRect(pt.x - 24, pt.y + 30, 48 * Math.abs(pr), 4); c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(pt.x - 24, pt.y + 30, 48, 4); } });
      if (s.mode === 'elim' && s.zone && s.zone.on) { c.save(); c.beginPath(); c.rect(-10, -10, W + 20, H + 20); c.arc(s.zone.cx, s.zone.cy, s.zone.r, 0, 6.3, true); c.fillStyle = 'rgba(200,40,40,.28)'; c.fill('evenodd'); c.restore(); c.strokeStyle = '#ff5a4a'; c.lineWidth = 3; c.beginPath(); c.arc(s.zone.cx, s.zone.cy, s.zone.r, 0, 6.3); c.stroke(); }
      for (const k of s.pk) { const d = PKTYPES[k.k]; if (k.t > 0) { c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 2; c.beginPath(); c.arc(k.x, k.y, 12, -1.57, -1.57 + 6.283 * (1 - k.t / d.t)); c.stroke(); continue; } const bob = Math.sin(tt / 300 + k.x) * 2; c.fillStyle = d.c + '55'; c.beginPath(); c.arc(k.x, k.y, 13, 0, 6.3); c.fill(); c.strokeStyle = d.c; c.lineWidth = 2; c.stroke(); txt(c, d.ic, k.x, k.y + 5 + bob, 14, '#fff', 'center'); }
      for (const m of s.mines) { const ally = v && m.team === v.team; if (!ally && hyp(m.x - (v ? v.dx : 0), m.y - (v ? v.dy : 0)) > 160) continue; c.fillStyle = '#222'; c.beginPath(); c.arc(m.x, m.y, 6, 0, 6.3); c.fill(); c.fillStyle = (m.armed === undefined ? m.arm <= 0 : m.armed) ? TEAMS[m.team].c : '#777'; c.beginPath(); c.arc(m.x, m.y, 2.5, 0, 6.3); c.fill(); }
      // fog of war from cover (viewer's line of sight)
      if (v && v.alive) castShadows(s, c, v, tt);
      // structures
      s.bagsAll.forEach((b) => { if (b.hp > 0) drawBag(c, b); });
      // flags (bases + dropped)
      if (s.mode === 'ctf') s.flags.forEach((f) => { if (f.c >= 0) return; const col = TEAMS[f.team].c; c.strokeStyle = '#ddd'; c.lineWidth = 2; c.beginPath(); c.moveTo(f.x, f.y + 10); c.lineTo(f.x, f.y - 16); c.stroke(); c.fillStyle = col; c.beginPath(); c.moveTo(f.x, f.y - 16); c.lineTo(f.x + 16 + Math.sin(tt / 200) * 2, f.y - 11); c.lineTo(f.x, f.y - 5); c.closePath(); c.fill(); if (!f.home) txt(c, 'DROPPED', f.x, f.y + 24, 10, '#fff', 'center', FCP, '#000'); });
      // deployables
      s.dep.forEach((d) => { const col = TEAMS[d.team].c; if (d.drone) { c.fillStyle = '#334'; c.beginPath(); c.arc(d.x, d.y, 6, 0, 6.3); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke(); c.fillStyle = col; c.fillRect(d.x + Math.cos(d.ang || 0) * 5 - 1, d.y + Math.sin(d.ang || 0) * 5 - 1, 3, 3); } else { c.fillStyle = '#444'; c.fillRect(d.x - 8, d.y - 8, 16, 16); c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(d.x - 8, d.y - 8, 16, 16); c.strokeStyle = '#999'; c.lineWidth = 3; c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x + Math.cos(d.ang || 0) * 13, d.y + Math.sin(d.ang || 0) * 13); c.stroke(); } });
      // players, back to front
      const order = s.pl.slice().sort((a, b) => a.dy - b.dy);
      for (const p of order) {
        if (!p.alive) { if (p.corpse && s.mode === 'elim') { c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(p.corpse.x, p.corpse.y, 11, 5, 0, 0, 6.3); c.fill(); c.strokeStyle = TEAMS[p.team].c; c.lineWidth = 2; c.stroke(); txt(c, 'x', p.corpse.x, p.corpse.y + 4, 12, TEAMS[p.team].c, 'center'); if (v && p.team === v.team && s.tok[p.team] > 0) txt(c, 'R', p.corpse.x, p.corpse.y - 10, 10, '#8fd16a', 'center', FCP, '#000'); } continue; }
        const seen = visTo(s, p, v); if (!seen) continue;
        const ally = v && p.team === v.team, hidden = ally && p.inBush;
        const key = lookKeyFor(p), img = (p.hitF > 0 ? SPR_FLASH : SPR)[key] || SPR.player; const sc = 2.4, w = img.width * sc, h = img.height * sc, x = p.dx, y = p.dy;
        c.save(); if (hidden) c.globalAlpha = 0.5;
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y + 8, 10, 4, 0, 0, 6.3); c.fill();
        c.strokeStyle = TEAMS[p.team].c; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + 8, 11, 4.5, 0, 0, 6.3); c.stroke();
        if (p.dashT > 0 || p.dashing) { c.globalAlpha *= 0.5; c.drawImage(img, x - w / 2 - Math.cos(p.aim) * 6, y - h / 2 - 4, w, h); }
        if (p.spawnInv > 0 && s.tick % 8 < 4) c.globalAlpha *= 0.55;
        const flip = Math.cos(p.aim) < 0; c.translate(x, y - 4); if (flip) c.scale(-1, 1); c.drawImage(img, -w / 2, -h / 2, w, h); if (flip) c.scale(-1, 1);
        // weapon in hand
        const cw = p.i === s.me ? wdef(p.wi === 3 ? 'ROCKET' : (p.loadout[p.wi] || p.loadout[0])) : wdef(p.wi === 3 ? 'ROCKET' : (p.loadout[p.wi] || p.loadout[0]));
        c.rotate(p.aim); if (flip) c.rotate(0);
        c.fillStyle = '#222'; c.fillRect(8, -2, cw.t === 'beam' ? 18 : (cw.t === 'melee' ? 12 : 12), 4); c.fillStyle = cw.col || '#ccc'; c.fillRect(10, -1.2, cw.t === 'beam' ? 15 : 9, 2.4);
        if (cw.t === 'shield' && p.shielding) { c.strokeStyle = '#9ad0ff'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 18, -1.25, 1.25); c.stroke(); c.strokeStyle = 'rgba(154,208,255,.3)'; c.lineWidth = 8; c.stroke(); }
        c.restore();
        if (p.carry >= 0) { c.fillStyle = TEAMS[p.carry].c; c.beginPath(); c.moveTo(x + 5, y - 30); c.lineTo(x + 18, y - 25); c.lineTo(x + 5, y - 20); c.fill(); c.strokeStyle = '#ddd'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 5, y - 14); c.lineTo(x + 5, y - 32); c.stroke(); }
        if (p.os > 0) { c.strokeStyle = 'rgba(120,220,255,.7)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y - 4, 15, 0, 6.3); c.stroke(); }
        if (p.boost && (p.boost.spd > 0 || p.boost.dmg > 0)) { c.fillStyle = p.boost.dmg > 0 ? '#ff9a3c' : '#ffd966'; c.fillRect(x - 3, y - 34, 6, 3); }
        // name + bar
        const bw = 26, bx = x - bw / 2, by = y - 25;
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(bx - 1, by - 1, bw + 2, 5); c.fillStyle = ally ? '#6fd06a' : '#e0533f'; c.fillRect(bx, by, bw * cl(p.hp / p.mhp, 0, 1), 3); if (p.os > 0) { c.fillStyle = '#78dcff'; c.fillRect(bx, by - 2, bw * cl(p.os / 40, 0, 1), 1.5); }
        txt(c, p.name, x, by - 4, 10, TEAMS[p.team].c, 'center', FCP, 'rgba(0,0,0,.8)');
        if (p.em && ally) { const em = EMOTES[p.em - 1]; if (em) { c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(x - 28, by - 26, 56, 14); txt(c, em[1], x, by - 15, 11, '#fff', 'center'); } }
        if (p.rev > 0 && !ally) { c.strokeStyle = 'rgba(255,230,120,.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y - 4, 17, 0, 6.3); c.stroke(); }
      }
      // bullets
      for (const b of s.bul) {
        const kc = b.kc !== undefined ? b.kc : (b.exp ? 6 : (b.k === 'l' ? 3 : BK[b.k] || 0)), col = TEAMS[b.team].c;
        if (kc === 3 || kc === 4 || kc === 5) { c.fillStyle = kc === 3 ? '#556b2f' : kc === 4 ? '#ff7a1f' : '#b04bff'; c.beginPath(); c.arc(b.x, b.y - 4, 5, 0, 6.3); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 1; c.stroke(); continue; }
        if (kc === 1) { c.fillStyle = 'rgba(120,190,255,.8)'; c.beginPath(); c.arc(b.x, b.y, 3.2, 0, 6.3); c.fill(); continue; }
        if (kc === 2) { c.save(); c.translate(b.x, b.y); c.rotate(tt / 60); c.fillStyle = '#c8d0d8'; for (let i = 0; i < 6; i++) { c.rotate(1.047); c.fillRect(4, -1.5, 4, 3); } c.beginPath(); c.arc(0, 0, 5, 0, 6.3); c.fill(); c.restore(); continue; }
        const l = hyp(b.vx, b.vy) || 1; c.strokeStyle = kc === 6 ? '#ffb347' : col; c.lineWidth = kc === 6 ? 4 : Math.max(2, b.r || 2.5); c.globalAlpha = 0.45; c.beginPath(); c.moveTo(b.x - b.vx / l * 9, b.y - b.vy / l * 9); c.lineTo(b.x, b.y); c.stroke(); c.globalAlpha = 1; c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x, b.y, (b.r || 3) * 0.7, 0, 6.3); c.fill();
      }
      // bushes above everyone: tall grass hides what is inside
      s.map.bush.forEach((b) => drawBush(c, b, tt));
      // fx
      for (const f of s.fx) {
        const a = f.life / f.max;
        if (f.k === 'p') { f.x += f.vx; f.y += f.vy; f.vx *= 0.92; f.vy *= 0.92; c.globalAlpha = a; c.fillStyle = f.col; c.fillRect(f.x, f.y, f.r, f.r); c.globalAlpha = 1; }
        else if (f.k === 'ring') { c.globalAlpha = a * 0.8; c.strokeStyle = f.col; c.lineWidth = 3 * a + 1; c.beginPath(); c.arc(f.x, f.y, f.r * (1 - a * 0.8 + 0.2), 0, 6.3); c.stroke(); if (f.fill) { c.fillStyle = f.col; c.globalAlpha = a * 0.2; c.fill(); } c.globalAlpha = 1; }
        else if (f.k === 'boom') { const r = f.r * (1 - a * a) ; c.globalAlpha = a; const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, r)); g.addColorStop(0, 'rgba(255,240,180,.95)'); g.addColorStop(0.5, 'rgba(255,140,40,.7)'); g.addColorStop(1, 'rgba(120,30,10,0)'); c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, Math.max(1, r), 0, 6.3); c.fill(); c.globalAlpha = 1; }
        else if (f.k === 'mz') { c.globalAlpha = a; c.fillStyle = '#ffe9a0'; c.beginPath(); c.arc(f.x, f.y, f.big ? 6 : 4, 0, 6.3); c.fill(); c.globalAlpha = 1; }
        else if (f.k === 'line') { c.globalAlpha = a; c.strokeStyle = f.col; c.lineWidth = 3 * a + 1; c.beginPath(); c.moveTo(f.x1, f.y1); c.lineTo(f.x2, f.y2); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1; }
        else if (f.k === 'arc') { c.globalAlpha = a; c.strokeStyle = f.col; c.lineWidth = 2; c.beginPath(); f.pts.forEach((q, i) => { const jx = i ? (rnd() - 0.5) * 6 : 0; if (i) { const pp = f.pts[i - 1]; for (let k = 1; k <= 4; k++) c.lineTo(pp[0] + (q[0] - pp[0]) * k / 4 + (rnd() - 0.5) * 8, pp[1] + (q[1] - pp[1]) * k / 4 + (rnd() - 0.5) * 8); } else c.moveTo(q[0], q[1]); }); c.stroke(); c.globalAlpha = 1; }
        else if (f.k === 'swing') { c.globalAlpha = a; c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.arc(f.x, f.y, 34, f.a - 0.7, f.a + 0.7); c.stroke(); c.globalAlpha = 1; }
        else if (f.k === 'n') { f.y -= 0.5; c.globalAlpha = Math.min(1, a * 1.6); txt(c, f.txt, f.x, f.y, f.txt.length > 3 ? 11 : 14, f.col, 'center', FSP, '#000'); c.globalAlpha = 1; }
      }
      c.restore();
      // vignette around the viewer: lite fog of war
      if (v && v.alive) { const g = c.createRadialGradient(v.dx, v.dy, 260, v.dx, v.dy, 560); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
      if (s.hurtF > 0) { s.hurtF--; c.fillStyle = `rgba(200,20,20,${s.hurtF / 40})`; c.fillRect(0, 0, W, H); }
      if (me && me.alive && me.hp < me.mhp * 0.3) { c.fillStyle = `rgba(200,0,0,${0.12 + Math.sin(tt / 150) * 0.05})`; c.fillRect(0, 0, W, H); }
      drawHud(c, s, me, v, tt);
      // crosshair
      if (me && me.alive && mouse.on && !touch.aim.on) {
        const w = wdef(me.loadout[me.wi] || me.loadout[0]), gap = w.spr ? 4 + w.spr * 40 : 5;
        c.strokeStyle = s.hit > 0 ? '#ff5a4a' : '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(mouse.x, mouse.y, 9 + (s.hit > 0 ? 3 : 0), 0, 6.3); c.stroke(); c.beginPath(); [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => { c.moveTo(mouse.x + dx * (gap + 5), mouse.y + dy * (gap + 5)); c.lineTo(mouse.x + dx * (gap + 11), mouse.y + dy * (gap + 11)); }); c.stroke();
        if (s.hit > 0) { c.strokeStyle = '#ff5a4a'; c.beginPath(); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => { c.moveTo(mouse.x + dx * 6, mouse.y + dy * 6); c.lineTo(mouse.x + dx * 12, mouse.y + dy * 12); }); c.stroke(); }
      }
      if (s.hit > 0) s.hit--;
    };
    const drawHud = (c, s, me, v, tt) => {
      // --- top score bar
      const cx = 400, y0 = 8; c.fillStyle = 'rgba(10,8,6,.78)'; c.fillRect(cx - 130, y0, 260, 36);
      c.fillStyle = TEAMS[0].c + 'cc'; c.fillRect(cx - 130, y0, 8, 36); c.fillStyle = TEAMS[1].c + 'cc'; c.fillRect(cx + 122, y0, 8, 36);
      const sc0 = s.mode === 'elim' ? s.rw[0] : s.score[0], sc1 = s.mode === 'elim' ? s.rw[1] : s.score[1];
      txt(c, String(sc0), cx - 80, y0 + 27, 26, TEAMS[0].c, 'center', FSP); txt(c, String(sc1), cx + 80, y0 + 27, 26, TEAMS[1].c, 'center', FSP);
      txt(c, s.mode === 'elim' ? 'RD ' + s.round : fmtT(s.time), cx, y0 + 16, 15, '#e8dec6', 'center', FSP); txt(c, 'to ' + s.lim + ' · ' + MODE_DEF[s.mode].limN, cx, y0 + 30, 10, '#9a8e7a', 'center');
      let sub = '';
      if (s.mode === 'ctf') { sub = s.flags.map((f) => TEAMS[f.team].n + ' flag: ' + (f.c >= 0 ? 'CARRIED by ' + (s.pl[f.c] ? s.pl[f.c].name : '?') : (f.home ? 'home' : 'DROPPED'))).join('   '); }
      else if (s.mode === 'koth' && s.zone) sub = 'Hill moves in ' + Math.max(0, Math.ceil(s.zone.moveT / 60)) + 's' + (s.zone.cont ? '  CONTESTED' : (s.zone.own >= 0 ? '  held by ' + TEAMS[s.zone.own].n : ''));
      else if (s.mode === 'dom' && s.zone) sub = s.zone.pts.map((q, i) => 'ABC'[i] + ':' + (q.own >= 0 ? TEAMS[q.own].n : '-')).join('  ');
      else if (s.mode === 'elim') sub = 'Alive ' + s.pl.filter((q) => q.alive && q.team === 0).length + ' v ' + s.pl.filter((q) => q.alive && q.team === 1).length + (s.zone && s.zone.on ? '  ZONE SHRINKING' : '') + '  Revive tokens ' + s.tok.join('/');
      if (sub) txt(c, sub, cx, y0 + 54, 11, '#e8dec6', 'center', FCP, 'rgba(0,0,0,.8)');
      // --- kill feed
      s.feed = s.feed.filter((f) => --f.t > 0);
      s.feed.forEach((f, i) => { let w = 0; c.font = '11px ' + FCP; f.parts.forEach((q) => { w += c.measureText(q[0]).width; }); const x0 = W - 12 - w, y = 60 + i * 17; c.globalAlpha = Math.min(1, f.t / 30); c.fillStyle = 'rgba(10,8,6,.6)'; c.fillRect(x0 - 5, y - 12, w + 10, 16); let x = x0; f.parts.forEach((q) => { txt(c, q[0], x, y, 11, q[1]); x += c.measureText(q[0]).width; }); c.globalAlpha = 1; });
      if (!me) return;
      // --- bottom-left: hp, skill, dash
      const k = kitOf(me), hx = 14, hy = H - 40;
      c.fillStyle = 'rgba(10,8,6,.75)'; c.fillRect(hx - 6, hy - 34, 250, 76);
      const hpF = cl(me.hp / me.mhp, 0, 1); c.fillStyle = '#2a1a14'; c.fillRect(hx, hy, 150, 14); c.fillStyle = hpF > 0.5 ? '#6fd06a' : hpF > 0.25 ? '#e0b030' : '#e0533f'; c.fillRect(hx, hy, 150 * hpF, 14); if (me.os > 0) { c.fillStyle = 'rgba(120,220,255,.85)'; c.fillRect(hx, hy, 150 * cl(me.os / 40, 0, 1), 5); }
      c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(hx, hy, 150, 14); txt(c, Math.ceil(me.hp) + '/' + me.mhp, hx + 75, hy + 11, 11, '#fff', 'center', FCP, '#000');
      txt(c, k.ic + ' ' + k.n + (me.streak ? '   streak ' + me.streak : ''), hx, hy - 8, 12, k.col, 'left', FCP, '#000');
      const ax = hx + 176, ay = hy + 10; const abMax = me.abMax || k.ab.cd; arcCd(c, ax, ay, 15, me.abCh > 0 ? 1 - (me.abCd > 0 ? me.abCd / T(0.5) : 0) : 1 - (me.abRech || 0) / abMax, me.abCh > 0 ? k.col : '#888', 4);
      txt(c, k.ic, ax, ay + 5, 14, '#fff', 'center'); txt(c, String(me.abCh), ax + 14, ay + 18, 11, '#fff', 'center', FCP, '#000'); txt(c, 'E', ax, ay - 20, 10, '#9a8e7a', 'center');
      const dx_ = ax + 44; arcCd(c, dx_, ay, 12, me.dashCD > 0 ? 1 - me.dashCD / k.dcd : 1, '#ffffff', 3); txt(c, 'DASH', dx_, ay + 4, 8, '#fff', 'center'); txt(c, 'SPC', dx_, ay - 18, 10, '#9a8e7a', 'center');
      // --- bottom-center: weapons
      const slots = me.loadout.map((id, i) => ({ i, id })).filter((q) => q.id); if (me.pwAmmo > 0) slots.push({ i: 3, id: 'ROCKET' });
      const sw = 70, x0 = 400 - slots.length * sw / 2 + 20;
      slots.forEach((q, n) => { const w = wdef(q.id), x = x0 + n * sw, y = H - 46, on = me.wi === q.i, cdf = w.cd ? cl(1 - (me.cds[q.i] || 0) / w.cd, 0, 1) : 1; c.fillStyle = on ? 'rgba(217,164,65,.35)' : 'rgba(10,8,6,.7)'; c.fillRect(x, y, sw - 4, 38); c.strokeStyle = on ? '#d9a441' : '#4d4235'; c.lineWidth = 2; c.strokeRect(x, y, sw - 4, 38); txt(c, w.ic, x + 16, y + 22, 16, '#fff', 'center'); txt(c, String(q.i + 1), x + 4, y + 11, 9, '#9a8e7a'); txt(c, q.i === 3 ? 'x' + me.pwAmmo : w.n.slice(0, 9), x + (sw - 4) / 2 + 8, y + 30, 9, '#e8dec6', 'center'); c.fillStyle = cdf >= 1 ? '#6fd06a' : '#d9a441'; c.fillRect(x + 2, y + 34, (sw - 8) * cdf, 3); });
      if (me.boost && (me.boost.spd > 0 || me.boost.dmg > 0)) txt(c, (me.boost.spd > 0 ? 'SPEED ' : '') + (me.boost.dmg > 0 ? 'DAMAGE ' : '') + 'BOOST', 400, H - 56, 11, '#ffd966', 'center', FCP, '#000');
      if (me.tok > 0) txt(c, 'Quick-respawn token ready', 14, H - 84, 10, '#8fd16a', 'left', FCP, '#000');
      if (s.mode === 'elim' && me.rvT > 0) { c.fillStyle = '#000'; c.fillRect(350, 330, 100, 8); c.fillStyle = '#8fd16a'; c.fillRect(351, 331, 98 * cl(me.rvT / (me.kit === 'medic' ? 70 : 150), 0, 1), 6); txt(c, 'Reviving...', 400, 326, 11, '#8fd16a', 'center', FCP, '#000'); }
      // --- dead: respawn + spectate
      if (!me.alive && s.ph !== 'over') {
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, H - 150, W, 50);
        const sp = s.pl[s.spec]; txt(c, s.mode === 'elim' ? 'ELIMINATED. Waiting for the round to end' + (s.tok[me.team] > 0 ? ' (a mate can revive you)' : '') : 'Respawning in ' + Math.ceil(me.rt / 60) + 's', 400, H - 125, 20, '#fff', 'center', FSP, '#000');
        txt(c, 'Spectating ' + (sp && sp.alive ? sp.name : '...') + '   click or arrow keys to switch', 400, H - 107, 12, '#e8dec6', 'center', FCP, '#000');
        if (!sp || !sp.alive) cycleSpec(1);
      }
      // --- phases
      if (s.ph === 'count') { const n = Math.ceil(s.phT / 60); txt(c, n > 0 ? String(n) : 'GO', 400, 280, 90, '#fff', 'center', FSP, '#000'); txt(c, MODE_DEF[s.mode].n + ' on ' + s.map.name, 400, 330, 20, '#e8dec6', 'center', FSP, '#000'); }
      if (s.banner) { const b = s.banner, a = Math.min(1, b.life / 20); c.globalAlpha = a; if (b.small) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 150, W, 34); txt(c, b.t, 400, 174, 22, '#fff', 'center', FSP, '#000'); } else { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 190, W, 70); txt(c, b.t, 400, 232, 40, '#ffd966', 'center', FSP, '#000'); if (b.sub) txt(c, b.sub, 400, 252, 14, '#e8dec6', 'center', FCP, '#000'); } c.globalAlpha = 1; }
      if (s.ph === 'rend') txt(c, 'Next round starting...', 400, 300, 22, '#fff', 'center', FSP, '#000');
      // --- scoreboard
      if (sbOn || s.ph === 'over') drawScoreboard(c, s, me);
    };
    const drawScoreboard = (c, s, me) => {
      c.fillStyle = 'rgba(8,6,5,.88)'; c.fillRect(110, 90, 580, 420); c.strokeStyle = '#4d4235'; c.lineWidth = 3; c.strokeRect(110, 90, 580, 420);
      txt(c, MODE_DEF[s.mode].n + ' · ' + s.map.name, 400, 118, 18, '#d9a441', 'center', FSP);
      let y = 140;
      for (let t = 0; t < 2; t++) {
        const list = s.pl.filter((p) => p.team === t).sort((a, b) => b.score - a.score);
        c.fillStyle = TEAMS[t].c + '33'; c.fillRect(122, y, 556, 20); txt(c, TEAMS[t].n + '  ' + (s.mode === 'elim' ? s.rw[t] : s.score[t]), 130, y + 15, 14, TEAMS[t].c, 'left', FSP);
        ['K', 'D', 'A', 'DMG', s.mode === 'ctf' ? 'CAP' : (s.mode === 'koth' || s.mode === 'dom' ? 'OBJ' : 'STK')].forEach((h, i) => txt(c, h, 430 + i * 50, y + 15, 11, '#9a8e7a', 'center'));
        y += 24;
        list.forEach((p) => { if (me && p === me) { c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(122, y - 2, 556, 20); } txt(c, (p.bot ? '[bot] ' : '') + p.name + (p.alive ? '' : '  (down)'), 130, y + 12, 12, '#e8dec6'); txt(c, KITS[p.kit].ic, 300, y + 12, 12, '#fff', 'center'); [p.kills, p.deaths, p.assists, Math.round(p.dmg), s.mode === 'ctf' || s.mode === 'koth' || s.mode === 'dom' ? p.caps : p.streak].forEach((v, i) => txt(c, String(v), 430 + i * 50, y + 12, 12, '#e8dec6', 'center')); y += 22; });
        y += 16;
      }
    };

    // ================================================================ F. MATCH END, REWARDS, REGISTRATION
    let endEl = null;
    const closeEnd = () => { if (endEl) { endEl.remove(); endEl = null; } };
    const rewardFor = (row, win, s) => {
      const botsOnly = s.pl.filter((p) => !p.bot && p.team !== row.team).length === 0, dm = botsOnly ? ({ easy: 0.5, normal: 1, hard: 1.3, brutal: 1.6 }[s.cfg.diff] || 1) : 1.15;
      const cash = Math.min(4500, Math.round((120 + row.k * 40 + row.a * 20 + row.dmg / 8 + row.c * 120 + (win ? 450 : 0)) * dm));
      const scraps = (win ? 3 : 1) + (row.k >= 8 ? 1 : 0) + (row.c >= 2 ? 1 : 0);
      return { cash, scraps };
    };
    const rowsOf = (s) => {
      const rows = s.pl.map((p) => ({ i: p.i, n: p.name, team: p.team, k: p.kills, d: p.deaths, a: p.assists, dmg: Math.round(p.dmg), c: p.caps, sc: Math.round(p.score), bot: p.bot ? 1 : 0, kit: p.kit }));
      const win = s.winner, pool = rows.filter((r) => win < 0 || r.team === win); pool.sort((a, b) => b.sc - a.sc); if (pool[0]) pool[0].mvp = 1; return rows;
    };
    const applyRewards = (s, rows, win) => {
      const mine = rows.find((r) => r.i === s.me); if (!mine) return null;
      const won = win === mine.team, rw = rewardFor(mine, won, s), u = currentUserData;
      if (u && s.ph === 'over' && !s.paid) {
        s.paid = 1;
        try {
          u.cash = (u.cash || 0) + rw.cash; u.scraps = (u.scraps || 0) + rw.scraps; u.pvpWins = (u.pvpWins || 0) + (won ? 1 : 0); u.pvpKills = (u.pvpKills || 0) + mine.k; u.pvpPlayed = (u.pvpPlayed || 0) + 1;
          if (typeof save === 'function') { const pr = save({ cash: u.cash, scraps: u.scraps, pvpWins: u.pvpWins, pvpKills: u.pvpKills, pvpPlayed: u.pvpPlayed }); if (pr && pr.catch) pr.catch(() => {}); }
          if (typeof refreshLobbyStats === 'function') refreshLobbyStats();
        } catch (e) { console.warn('[pvp] could not save rewards', e); }
      }
      return { ...rw, won, mine };
    };
    MODEHOOK.onEnd = (s) => {
      const rows = rowsOf(s); s.rows = rows;
      castAll({ t: 'pvend', w: s.winner, why: s.why, rows: rows.map((r) => [r.i, r.n, r.team, r.k, r.d, r.a, r.dmg, r.c, r.sc, r.bot, r.kit, r.mvp ? 1 : 0]), sc: s.score, rw: s.rw });
      showEnd(s, rows);
    };
    const guestEnd = (d) => {
      const s = S; if (!s || s.ph === 'over') return; s.ph = 'over'; s.winner = d.w; s.why = d.why; s.score = d.sc; s.rw = d.rw;
      const rows = d.rows.map((a) => ({ i: a[0], n: a[1], team: a[2], k: a[3], d: a[4], a: a[5], dmg: a[6], c: a[7], sc: a[8], bot: a[9], kit: a[10], mvp: a[11] })); s.rows = rows; showEnd(s, rows);
    };
    const showEnd = (s, rows) => {
      closeEnd(); const me = s.pl[s.me], win = s.winner, rw = applyRewards(s, rows, win), won = me && win === me.team, draw = win < 0;
      endEl = document.createElement('div'); endEl.id = 'pv-end';
      endEl.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(6,5,4,.86);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:14px;font-family:"Courier Prime",monospace;color:#e8dec6';
      const col = draw ? '#d9a441' : TEAMS[win].c, title = draw ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT');
      const tbl = [0, 1].map((t) => `<table style="width:100%;border-collapse:collapse;margin:8px 0"><tr style="background:${TEAMS[t].c}33"><th style="text-align:left;padding:3px 6px;color:${TEAMS[t].c}">${TEAMS[t].n} ${s.mode === 'elim' ? s.rw[t] : s.score[t]}</th><th>K</th><th>D</th><th>A</th><th>Damage</th><th>${s.mode === 'ctf' ? 'Caps' : (s.mode === 'koth' || s.mode === 'dom' ? 'Obj' : 'Score')}</th></tr>${rows.filter((r) => r.team === t).sort((a, b) => b.sc - a.sc).map((r) => `<tr style="${r.i === s.me ? 'background:rgba(255,255,255,.08)' : ''}"><td style="padding:3px 6px">${r.mvp ? '⭐ ' : ''}${esc(r.n)}${r.bot ? ' <small style="color:#9a8e7a">bot</small>' : ''} <small style="color:#9a8e7a">${KITS[r.kit] ? KITS[r.kit].n : ''}</small></td><td align=center>${r.k}</td><td align=center>${r.d}</td><td align=center>${r.a}</td><td align=center>${r.dmg}</td><td align=center>${s.mode === 'tdm' || s.mode === 'elim' ? r.sc : r.c}</td></tr>`).join('')}</table>`).join('');
      const host = s.role !== 'guest';
      endEl.innerHTML = `<div style="width:min(720px,100%);margin:auto;background:#14110e;border:3px solid ${col};border-radius:6px;padding:16px;box-shadow:4px 4px 0 #0a0908">
<div style="font-family:'Special Elite',monospace;font-size:44px;color:${col};text-align:center;letter-spacing:.1em">${title}</div>
<div style="text-align:center;color:#9a8e7a;margin-bottom:6px">${esc(MODE_DEF[s.mode].n)} · ${esc(s.map.name)} · ${esc(s.why || '')}</div>
${rows.some((r) => r.mvp) ? `<div style="text-align:center;margin:4px 0;color:#ffd966">MVP: ${esc(rows.find((r) => r.mvp).n)}</div>` : ''}${tbl}
${rw ? `<div style="text-align:center;margin:10px 0;padding:8px;border:2px dashed #4d4235;border-radius:5px">Your rewards: <b style="color:#ffd966">+$${fmt(rw.cash)}</b> cash, <b style="color:#d9a441">+${rw.scraps}</b> scraps · ${rw.mine.k} kills, ${rw.mine.a} assists${currentUserData ? ` · PvP wins ${currentUserData.pvpWins || 0}` : ''}</div>` : ''}
<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${host ? '<button id="pv-again" style="padding:10px 18px;font:700 16px \'Special Elite\',monospace;border:3px solid #8aa04a;background:#2a3318;color:#e8dec6;border-radius:5px;cursor:pointer">Back to PvP lobby</button>' : ''}${host && hasForeign() ? '<button id="pv-split" style="padding:10px 18px;font:700 16px \'Special Elite\',monospace;border:3px solid #4a9be0;background:#1d2a3a;color:#e8dec6;border-radius:5px;cursor:pointer">Split back to teams</button>' : ''}${!host && MG ? '<button id="pv-stay" style="padding:10px 18px;font:700 16px \'Special Elite\',monospace;border:3px solid #8aa04a;background:#2a3318;color:#e8dec6;border-radius:5px;cursor:pointer">Stay for rematch</button>' : ''}<button id="pv-leave" style="padding:10px 18px;font:700 16px 'Special Elite',monospace;border:3px solid #4d4235;background:#1d1812;color:#e8dec6;border-radius:5px;cursor:pointer">${host ? 'Leave to menu' : (MG ? 'Back to my team' : 'Back to menu')}</button></div></div>`;
      document.body.appendChild(endEl);
      const again = endEl.querySelector('#pv-again'); if (again) again.onclick = () => { const m = s.mode, old = LB; teardown(false); openLobby(m); };
      const sp_ = endEl.querySelector('#pv-split'); if (sp_) sp_.onclick = () => { const m = s.mode; splitTeams(); teardown(false); openLobby(m); };
      const st_ = endEl.querySelector('#pv-stay'); if (st_) st_.onclick = () => { closeEnd(); };
      endEl.querySelector('#pv-leave').onclick = () => { if (!host && MG) { returnHome(); return; } if (host) castAll({ t: 'pvx', why: 'The host left the match.' }); stopAll(true); };
    };
    const teardown = (toLobby) => {
      running = false; cancelAnimationFrame(loopId); closeEnd();
      if (S) { clearInterval(S.wd); clearInterval(S.ping); if (MP.role === 'host') { MP.started = false; MP.conns.forEach((c) => { c.pvp = null; }); } }
      S = null; touchMode(false); canvasEl.style.cursor = '';
      try { if (window.AIM && AIM.force) { AIM.force(null); } } catch (e) {}
      if (toLobby && typeof enterLobby === 'function' && currentUserData) { try { enterLobby(); } catch (e) {} }
    };
    // leaving mid-match: a guest tells the host (a bot takes the seat), the host ends it for everybody
    const leaveMatch = () => {
      if (!S) return; if (S.role === 'guest') { mpSend(MP.hostConn, { t: 'pvq' }); if (MG) return returnHome(); } else castAll({ t: 'pvx', why: 'The host left the match.' }); stopAll(true);
    };
    const stopAllImpl = stopAll;
    // overlay "Leave" button during the match (replaces the wave "Give up" button which is hidden by CSS while PvP runs)
    const leaveBtn = (() => { const b = document.createElement('button'); b.textContent = 'Leave match'; b.style.cssText = 'position:fixed;right:10px;top:10px;z-index:60;display:none;padding:4px 10px;background:#1d1812;color:#e8dec6;border:2px solid #4d4235;border-radius:4px;font:12px "Courier Prime",monospace;cursor:pointer;opacity:.75'; b.onclick = () => { if (confirm('Leave this match?')) leaveMatch(); }; document.body.appendChild(b); return b; })();
    setInterval(() => { leaveBtn.style.display = running && S && S.ph !== 'over' ? 'block' : 'none'; }, 300);

    MODES.register({ id: 'pvp_practice', name: 'PvP Practice (vs bots)', icon: '🤖', desc: 'Solo or with friends against bots: manual aim, kits, cover and pickups. Tune bot difficulty, size and map in the lobby.', tags: ['pvp'], players: '1-8', launch() { openLobby('tdm'); if (LB) { LB.ts = 2; LB.lim = 15; } renderLobby(); }, stop() { stopAll(false); }, tick() { return true; }, draw() { return true; } });
    Object.keys(MODE_DEF).forEach((id) => {
      const md = MODE_DEF[id];
      MODES.register({ id: 'pvp_' + id, name: md.n, icon: md.ic, desc: md.d, tags: ['pvp'], players: '1-8', launch() { openLobby(id); }, stop() { stopAll(false); }, tick() { return true; }, draw() { return true; } });
    });
    window.PVP = { get MG() { return MG; }, mergeJoinCode, returnHome, splitTeams, hostChat, render() { render(); }, simTick() { simTick(); }, get S() { return S; }, get LB() { return LB; }, step, newMatch, applySnapshot, buildSnap, stepMove, MAPS, KITS, wdef, findPath, aiThink, startMatch, openLobby, stopAll, setS(x) { S = x; }, hostApplyInput, DIFFS, MODE_DEF, mkAI };
  } catch (e) { console.error('[mp-pvp]', e); }
})();
