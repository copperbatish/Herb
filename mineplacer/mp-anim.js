/* mp-anim.js: PLAYER ANIMATION ENGINE + STYLES + LOCKER EDITOR  [anim]
   Hooks in Mineplacer2.html (all tagged // [anim]): drawSprite -> MPANIM.sprite, drawHeldAt -> MPANIM.hand, drawAvatar -> MPANIM.avatar,
   cleanLook / lookOut -> MPANIM.clean / MPANIM.lk (style id travels inside `look.an`), in-run + drawOthers call sites pass opts.anim.
   Classic style = engine bypassed = the base game, untouched. PvP is picked up by wrapping ctx.drawImage (no edit to mp-pvp.js). */
(function () {
  'use strict';
  try {
    const NOW = () => performance.now() / 1000;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const T0 = (n) => (typeof n === 'number' && isFinite(n) ? n : 0);
    const GG = () => g, CTX = () => ctx;   // main-file lets/consts live in the shared global lexical scope

    // ================================================================= PARTS + POSE
    // pose = 5 channels per part: x, y (sprite pixels), r (degrees), sx, sy (scale). Parts form a little tree:
    //   root(feet pivot) -> legs, torso(hip) -> back, arms, head(neck) -> hat.   wep = weapon offset (x along aim, y across, r deg). dk = push along facing (px).
    const PN = ['root', 'head', 'hat', 'torso', 'aL', 'aR', 'lL', 'lR', 'back', 'wep', 'dk'];
    const PI = {}; PN.forEach((n, i) => { PI[n] = i; });
    const NP = PN.length, NCH = 5, NV = NP * NCH;
    const IDENT0 = new Float32Array(NV); for (let i = 0; i < NP; i++) { IDENT0[i * 5 + 3] = 1; IDENT0[i * 5 + 4] = 1; }
    const ALL = PN.map((n, i) => i), UPPER = ['root', 'head', 'hat', 'torso', 'aL', 'aR', 'back', 'wep', 'dk'].map((n) => PI[n]);

    const EASE = {
      linear: (t) => t, inOut: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t), in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t),
      snap: (t) => 1 - Math.pow(1 - t, 3), back: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
      elastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * 2.0944) + 1),
      bounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
      step: () => 0
    };
    const EASE_NAMES = Object.keys(EASE);

    // ================================================================= CLIPS (base keyframes; styles tweak them)
    const CLIPS = {}; const CLIP_ORDER = [];
    const def = (id, name, cat, dur, o, keys) => { CLIPS[id] = Object.assign({ id, name, cat, dur, loop: false, lp: 0, mask: ALL, add: false, hold: false, gait: 0, bi: 0.05, bo: 0.1 }, o, { src: keys }); CLIP_ORDER.push(id); };
    const osc = (n, t0, t1, a, b) => { const r = []; for (let i = 0; i < n; i++) r.push([lerp(t0, t1, i / (n - 1)), i % 2 ? b : a]); return r; };
    // movement
    def('idle', 'Idle (breathe)', 'Move', 2.6, { loop: true }, [[0, {}], [0.5, { root: [0, 0.5], head: [0, -0.3], torso: [0, 0, 0, 1, 1.03], aL: [0, 0.2, 3], aR: [0, 0.2, -3] }], [1, {}]]);
    def('idleLook', 'Idle: look around', 'Move', 3.4, { add: true, bi: 0.2, bo: 0.2 }, [[0, {}], [0.18, { head: [0.6, 0, 10], torso: [0, 0, 2] }], [0.4, { head: [0.6, 0, 10], torso: [0, 0, 2] }], [0.58, { head: [-0.6, 0, -11], torso: [0, 0, -2] }], [0.8, { head: [-0.6, 0, -11], torso: [0, 0, -2] }], [0.95, {}], [1, {}]]);
    def('idleTwirl', 'Idle: weapon twirl', 'Move', 1.7, { add: true, bi: 0.1, bo: 0 }, [[0, {}], [0.15, { aR: [0, -1, -30] }], [0.7, { aR: [0, -0.5, -30], wep: [0, 0, 360] }, 'inOut'], [0.85, { aR: [0, 0, -8], wep: [0, 0, 360] }], [1, { wep: [0, 0, 360] }]]);
    def('walk', 'Walk', 'Move', 0.6, { loop: true, gait: 80 }, [
      [0, { root: [0, 0], torso: [0, 0, 2.5], head: [0, 0, -1.5], aL: [0, 0.6, 5], aR: [0, -0.6, -5], lL: [0, -1.1], lR: [0, 0] }],
      [0.25, { root: [0, 0.5], aL: [0, 0], aR: [0, 0], lL: [0, 0.1], lR: [0, 0.1] }],
      [0.5, { root: [0, 0], torso: [0, 0, -2.5], head: [0, 0, 1.5], aL: [0, -0.6, -5], aR: [0, 0.6, 5], lL: [0, 0], lR: [0, -1.1] }],
      [0.75, { root: [0, 0.5], aL: [0, 0], aR: [0, 0], lL: [0, 0.1], lR: [0, 0.1] }]]);
    def('run', 'Run / sprint', 'Move', 0.42, { loop: true, gait: 120 }, [
      [0, { root: [0, 0, 0, 1.06, 0.92], torso: [0, 0, 3], head: [0, 0.2, -2], aL: [0, 1, 18], aR: [0, -1, -18], lL: [0, -2.2], lR: [0, 0.4] }],
      [0.25, { root: [0, -1.2, 0, 0.96, 1.06], head: [0, -0.2], lL: [0, -0.6], lR: [0, -0.6] }],
      [0.5, { root: [0, 0, 0, 1.06, 0.92], torso: [0, 0, -3], head: [0, 0.2, 2], aL: [0, -1, -18], aR: [0, 1, 18], lL: [0, 0.4], lR: [0, -2.2] }],
      [0.75, { root: [0, -1.2, 0, 0.96, 1.06], head: [0, -0.2], lL: [0, -0.6], lR: [0, -0.6] }]]);
    def('strafe', 'Strafe', 'Move', 0.5, { loop: true, gait: 70 }, [
      [0, { root: [0, 0.2], lL: [0.8, -0.6], lR: [-0.8, 0], aL: [0, 0.3], aR: [0, -0.3] }], [0.25, { root: [0, -0.4] }],
      [0.5, { root: [0, 0.2], lL: [-0.8, 0], lR: [0.8, -0.6], aL: [0, -0.3], aR: [0, 0.3] }], [0.75, { root: [0, -0.4] }]]);
    def('limp', 'Low-HP limp', 'Move', 0.9, { loop: true, gait: 42 }, [
      [0, { root: [0, 0.3], torso: [0, 0, 4], head: [0, 0.5, 6], lL: [0, 0], lR: [0, -0.8], aL: [0, 0.5, -6], aR: [0, 0.2, 8] }],
      [0.3, { root: [0, 1.2], torso: [0.3, 0, 5], head: [0, 0.8, 7], lR: [0, 0] }],
      [0.6, { root: [0, 0.3], torso: [0, 0, 3], head: [0, 0.5, 5], lL: [0, -0.4], lR: [0.3, 0] }],
      [0.85, { root: [0, 0.7], torso: [0, 0, 4], head: [0, 0.6, 6] }]]);
    def('hop', 'Hop', 'Move', 0.5, { bi: 0.02 }, [[0, {}], [0.15, { root: [0, 0.9, 0, 1.1, 0.86], aL: [0, 0.5, 20], aR: [0, 0.5, -20] }],
      [0.45, { root: [0, -5.5, 0, 0.9, 1.14], lL: [0.3, -1.8], lR: [-0.3, -1.8], aL: [0, -1, 40], aR: [0, -1, -40], head: [0, -0.3] }], [0.75, { root: [0, 0.7, 0, 1.12, 0.88], aL: [0, 0.5, 15], aR: [0, 0.5, -15] }], [1, {}]]);
    def('dash', 'Dash / roll', 'Move', 0.34, { bi: 0.02, signed: true }, [[0, {}], [0.12, { root: [-1, 0.6, -8, 1, 0.92], torso: [0, 0, -4] }, 'snap'],
      [0.3, { root: [1.5, 0.3, 16, 1.18, 0.84], torso: [0, 0, 6], lL: [-1, -1.2], lR: [1.2, 0.2], aL: [0, 1, -30], aR: [0, -1, -30], dk: [3] }], [0.65, { root: [0.4, 0.2, 6, 1.05, 0.95] }], [1, {}]]);
    // combat
    def('shootPistol', 'Shoot: pistol', 'Combat', 0.2, { add: true, bi: 0.01 }, [[0, {}, 'snap'], [0.15, { wep: [-2.2, 0, -22], dk: [-0.9], torso: [0, 0, -1.5], head: [0, 0.15], aR: [0, 0.4, -8] }, 'out'], [1, {}]]);
    def('shootRifle', 'Shoot: rifle', 'Combat', 0.24, { add: true, bi: 0.01 }, [[0, {}, 'snap'], [0.15, { wep: [-3.2, 0, -14], dk: [-1.6], torso: [0, 0.1, -2, 1, 0.98], aL: [0, 0.5, -10], aR: [0, 0.4, -10], head: [0, 0.2], root: [0, 0.2] }, 'out'], [1, {}]]);
    def('shootShotgun', 'Shoot: shotgun (+pump)', 'Combat', 0.5, { add: true, bi: 0.01 }, [[0, {}, 'snap'], [0.1, { wep: [-5, 0, -48], dk: [-3], torso: [0, 0.3, -4, 1.05, 0.93], head: [0, 0.5, -6], root: [0, 0.5, -3], aL: [0, 0.8, -16], aR: [0, 0.8, -16], lL: [-0.4, 0], lR: [0.4, 0] }, 'out'],
      [0.4, { wep: [-1, 0.5, 18], dk: [-0.5], torso: [0, 0.1, -1], aL: [0, 0.3, -5] }], [0.6, {}], [1, {}]]);
    def('shootMelee', 'Attack: melee swing', 'Combat', 0.42, { add: true, bi: 0.02 }, [[0, {}], [0.22, { wep: [-2.5, 0, -70], dk: [-1.2], torso: [0, 0, -8], head: [0, 0, -5], root: [-0.5, 0.3, -6], aR: [0, -1, -60] }, 'in'],
      [0.4, { wep: [3, 0, 95], dk: [3], torso: [0, 0, 10], head: [0, 0, 6], root: [0.5, 0, 8], aR: [0, -0.5, 50] }, 'snap'], [0.7, { wep: [1, 0, 30], dk: [0.6] }], [1, {}]]);
    def('shootThrow', 'Attack: throw / place', 'Combat', 0.45, { add: true, bi: 0.02 }, [[0, {}], [0.3, { aR: [0, -2, -170], wep: [-1, -1, -30], torso: [0, 0, -6], dk: [-1], head: [0, 0, -6] }, 'inOut'],
      [0.5, { aR: [0, 0.5, 50], wep: [3, 0, 40], torso: [0, 0, 8], dk: [2], head: [0, 0, 4] }, 'snap'], [1, {}]]);
    def('shootBeam', 'Hold beam / spray', 'Combat', 0.3, { add: true, loop: true, hold: true }, [[0, { wep: [-0.6, 0, 0], dk: [-0.7], root: [-0.25, 0], lL: [-0.6, 0], lR: [0.6, 0], torso: [0, 0.2, 0, 1, 0.98], aL: [0, 0.4, -6], aR: [0, 0.4, -6] }],
      [0.5, { wep: [-0.9, 0.3, 0], dk: [-0.9], root: [0.25, 0], lL: [-0.6, 0], lR: [0.6, 0], torso: [0, 0.2, 0, 1, 0.98], aL: [0, 0.4, -6], aR: [0, 0.4, -6] }]]);
    def('cast', 'Cast ability (G)', 'Combat', 0.8, { add: true }, [[0, {}], [0.25, { root: [0, 0.7, 0, 1.06, 0.92], aL: [0, 0.6, 30], aR: [0, 0.6, -30], lL: [-0.5, 0], lR: [0.5, 0] }],
      [0.5, { root: [0, -1, 0, 0.94, 1.08], aL: [0, -1, 165], aR: [0, -1, -165], head: [0, -0.4, -4], torso: [0, 0, 0, 1, 1.05] }], [0.8, { root: [0, -0.7, 0, 0.96, 1.05], aL: [0, -0.8, 160], aR: [0, -0.8, -160], head: [0, -0.4] }], [1, {}]]);
    def('overdrive', 'Overdrive (H)', 'Combat', 0.9, { add: true }, [[0, {}], [0.15, { root: [0, 0.6, 0, 1.08, 0.92], aL: [0, 0.5, 45], aR: [0, 0.5, -45], torso: [0, 0, 0, 1.08, 0.96] }],
      [0.3, { root: [0.35, 0], aL: [0, 0, 70], aR: [0, 0, -70], torso: [0, 0, 0, 1.14, 1.02], head: [0, 0.2, 3] }], [0.4, { root: [-0.35, 0], aL: [0, 0, 70], aR: [0, 0, -70], torso: [0, 0, 0, 1.14, 1.02], head: [0, 0.2, -3] }],
      [0.5, { root: [0.35, 0], aL: [0, 0, 70], aR: [0, 0, -70], torso: [0, 0, 0, 1.14, 1.02], head: [0, 0.2, 3] }], [0.6, { root: [-0.35, 0], aL: [0, 0, 70], aR: [0, 0, -70], torso: [0, 0, 0, 1.14, 1.02], head: [0, 0.2, -3] }],
      [0.75, { root: [0.2, 0], aL: [0, 0, 60], aR: [0, 0, -60], torso: [0, 0, 0, 1.1, 1] }], [1, {}]]);
    def('parry', 'Parry (Space)', 'Combat', 0.3, { add: true, bi: 0.02 }, [[0, {}], [0.2, { torso: [0, 0, -18], head: [0, 0, -8], root: [-0.6, 0.2, -8], aR: [0, -1, -120] }, 'in'], [0.5, { torso: [0, 0, 25], head: [0, 0, 10], root: [0.8, 0, 14], dk: [2], aR: [0, -0.4, -40] }, 'snap'], [1, {}]]);
    def('hurt', 'Hurt (stagger)', 'Reaction', 0.4, { add: true, bi: 0.01, signed: true }, [[0, {}, 'snap'], [0.1, { dk: [-2.6], root: [-0.8, 0.4, -10, 1.1, 0.86], head: [0, 0.4, -14], torso: [0, 0, -6], aL: [0, -0.5, 32], aR: [0, -0.5, -32] }, 'out'],
      [0.3, { dk: [-0.9], root: [-0.3, 0.2, -4], head: [0, 0.2, -5] }], [0.55, { root: [0.1, 0, 2] }], [1, {}]]);
    def('heal', 'Heal (sparkle bounce)', 'Reaction', 0.8, { add: true, fx: 'heal' }, [[0, {}], [0.2, { root: [0, 0.5, 0, 1.06, 0.92] }], [0.4, { root: [0, -1.6, 0, 0.94, 1.1], aL: [0, -0.5, 22], aR: [0, -0.5, -22], head: [0, -0.3] }], [0.7, { root: [0, 0.2, 0, 1.03, 0.97] }], [1, {}]]);
    def('grab', 'Pickup grab pop', 'Reaction', 0.32, { add: true }, [[0, {}], [0.35, { root: [0, -1.2, 0, 0.94, 1.12], aR: [0, -0.8, -55], head: [0, -0.2, 5] }], [0.7, { root: [0, 0.4, 0, 1.06, 0.94] }], [1, {}]]);
    def('victory', 'Victory cheer', 'Reaction', 1.8, { bi: 0.05 }, [[0, {}], [0.12, { root: [0, 0.8, 0, 1.1, 0.88], aL: [0, 0, 60], aR: [0, 0, -60] }],
      [0.28, { root: [0, -3.5, 0, 0.92, 1.1], aL: [0, -1, 165], aR: [0, -1, -165], lL: [0, -1.6], lR: [0, -1.6], head: [0, -0.3] }], [0.42, { root: [0, 0.8, 0, 1.1, 0.88], aL: [0, 0, 60], aR: [0, 0, -60] }],
      [0.58, { root: [0, -3.5, 0, 0.92, 1.1], aL: [0, -1, 165], aR: [0, -1, -165], lL: [0, -1.6], lR: [0, -1.6], head: [0, -0.3] }], [0.75, { root: [0, 0.4], aL: [0, -1, 165], aR: [0, -1, -165] }], [0.9, { aL: [0, -1, 165], aR: [0, -1, -165] }], [1, {}]]);
    def('death', 'Death / lose', 'Reaction', 1.1, { hold: true, holdEnd: true, bi: 0.02 }, [[0, {}], [0.2, { root: [0, 0.8, -6, 1.08, 0.9], head: [0, 0.4, -10], aL: [0, 0, 50], aR: [0, 0, -50] }], [0.55, { root: [-2, 0, 80], aL: [0, 0, 60], aR: [0, 0, -60], head: [0, 0, 10] }, 'in'],
      [0.75, { root: [-3, 0.2, 98], aL: [0, 0, 70], aR: [0, 0, -70] }], [1, { root: [-3, 0.5, 90], aL: [0, 0, 70], aR: [0, 0, -70], head: [0, 0, 8] }]]);
    def('down', 'Downed (collapse + wobble)', 'Reaction', 1.4, { loop: true, hold: true, lp: 0.45, bi: 0.03 }, [[0, {}], [0.18, { root: [0, 1.4, 0, 1.1, 0.82], head: [0, 0.6, 10], torso: [0, 0, 8], lL: [-0.6, 0], lR: [0.6, 0], aL: [0, 0.5, 40], aR: [0, 0.5, -40] }],
      [0.45, { root: [0, 2.2, 0, 1.12, 0.74], head: [0, 1, 22], torso: [-0.3, 0, 14], lL: [-1, 0.2], lR: [0.8, 0.4], aL: [0, 1, 50], aR: [0, 1.5, -30] }],
      [0.72, { root: [0, 2.1, 0, 1.13, 0.76], head: [0, 1.1, 26], torso: [-0.3, 0, 18], lL: [-1, 0.2], lR: [0.8, 0.4], aL: [0, 1, 50], aR: [0, 1.7, -38] }],
      [1, { root: [0, 2.2, 0, 1.12, 0.74], head: [0, 1, 22], torso: [-0.3, 0, 14], lL: [-1, 0.2], lR: [0.8, 0.4], aL: [0, 1, 50], aR: [0, 1.5, -30] }]]);
    def('revive', 'Revive (get up)', 'Reaction', 0.8, { bi: 0, hold: false }, [[0, { root: [0, 2.2, 0, 1.12, 0.74], head: [0, 1, 22], torso: [-0.3, 0, 14], lL: [-1, 0.2], lR: [0.8, 0.4], aL: [0, 1, 50], aR: [0, 1.5, -30] }], [0.4, { root: [0, 1, 0, 1.1, 0.85] }],
      [0.62, { root: [0, -1.8, 0, 0.92, 1.14], aL: [0, -0.5, 40], aR: [0, -0.5, -40] }], [0.82, { root: [0, 0.5, 0, 1.06, 0.94] }], [1, {}]]);
    // emotes (the four party emotes + four new ones, keys 5-8 in a run)
    const sh = (k, a) => [k, { root: [a ? 0.5 : -0.5, -0.5, a ? 3 : -3], aL: [0, -1, 150], aR: [0, -1, -150] }];
    def('emote0', 'Emote: Help!', 'Emote', 1.6, { mask: UPPER, bo: 0.15 }, [[0, {}], [0.15, { aL: [0, -1, 165], aR: [0, -1, -165], root: [0, -0.8, 0, 0.96, 1.05] }], [0.3, { aL: [0, -1, 150], aR: [0, -1, -150], head: [0, -0.2, -5], root: [0, -0.8, 0, 0.96, 1.05] }],
      [0.45, { aL: [0, -1, 175], aR: [0, -1, -175], head: [0, -0.2, 5], root: [0, -0.8, 0, 0.96, 1.05] }], [0.6, { aL: [0, -1, 150], aR: [0, -1, -150], head: [0, -0.2, -5], root: [0, -0.8, 0, 0.96, 1.05] }], [0.75, { aL: [0, -1, 175], aR: [0, -1, -175], head: [0, -0.2, 5], root: [0, -0.8, 0, 0.96, 1.05] }], [1, {}]]);
    def('emote1', 'Emote: Nice!', 'Emote', 1.2, { mask: UPPER, bo: 0.15 }, [[0, {}], [0.2, { aR: [0, -0.5, -95], torso: [0, 0, 4], head: [0, 0, 4] }], [0.35, { aR: [0, -1, -110], root: [0, -0.8], torso: [0, 0, 4], head: [0, 0, 4] }], [0.5, { aR: [0, -0.4, -92], root: [0, 0.2], torso: [0, 0, 4], head: [0, 0, 4] }],
      [0.65, { aR: [0, -1, -110], root: [0, -0.8], torso: [0, 0, 4], head: [0, 0, 4] }], [0.8, { aR: [0, -0.4, -92], torso: [0, 0, 3] }], [1, {}]]);
    def('emote2', 'Emote: Danger!', 'Emote', 1.2, { mask: UPPER, bo: 0.1 }, [[0, {}]].concat([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((k, i) => sh(k, i % 2))).concat([[1, {}]]));
    def('emote3', 'Emote: On me!', 'Emote', 1.4, { mask: UPPER, bo: 0.15 }, [[0, {}], [0.15, { aR: [0, -0.5, -100], torso: [0, 0, 5], head: [0, 0, 5], root: [0.4, 0, 3] }], [0.3, { aR: [0, -0.5, -60], torso: [0, 0, 5], head: [0, 0, 5], root: [0.4, 0, 3] }], [0.45, { aR: [0, -0.5, -100], torso: [0, 0, 5], head: [0, 0, 5], root: [0.4, 0, 3] }],
      [0.6, { aR: [0, -0.5, -60], torso: [0, 0, 5], head: [0, 0, 5], root: [0.4, 0, 3] }], [0.75, { aR: [0, -0.5, -100], torso: [0, 0, 5], head: [0, 0, 5], root: [0.4, 0, 3] }], [1, {}]]);
    def('dance', 'Emote: Dance', 'Emote', 2.4, { mask: ALL, bo: 0.15 }, [[0, {}],
      [0.1, { root: [-0.6, 0.2, -4], torso: [0.4, 0, 5], head: [0, 0, -5], aL: [0, -1, 155], aR: [0, 0.5, -40], lL: [0, -1.2] }], [0.2, { root: [0, -0.8], aL: [0, -0.5, 110], aR: [0, -0.5, -110] }],
      [0.3, { root: [0.6, 0.2, 4], torso: [-0.4, 0, -5], head: [0, 0, 5], aL: [0, 0.5, 40], aR: [0, -1, -155], lR: [0, -1.2] }], [0.4, { root: [0, -0.8], aL: [0, -0.5, 110], aR: [0, -0.5, -110] }],
      [0.5, { root: [-0.6, 0.2, -4], torso: [0.4, 0, 5], head: [0, 0, -5], aL: [0, -1, 155], aR: [0, 0.5, -40], lL: [0, -1.2] }], [0.6, { root: [0, -0.8], aL: [0, -0.5, 110], aR: [0, -0.5, -110] }],
      [0.7, { root: [0.6, 0.2, 4], torso: [-0.4, 0, -5], head: [0, 0, 5], aL: [0, 0.5, 40], aR: [0, -1, -155], lR: [0, -1.2] }], [0.8, { root: [0, -0.8], aL: [0, -0.5, 110], aR: [0, -0.5, -110] }], [1, {}]]);
    def('flex', 'Emote: Flex', 'Emote', 1.7, { mask: UPPER, bo: 0.15 }, [[0, {}], [0.15, { aL: [0, -0.2, 95], aR: [0, -0.2, -95], torso: [0, 0, 0, 1.12, 1], root: [0, 0.5, 0, 1.04, 0.96] }], [0.35, { aL: [0, -0.2, 100], aR: [0, -0.2, -100], torso: [0, 0, 0, 1.22, 1.02], root: [0, 0.4, 0, 1.06, 0.96], head: [0, -0.2, -3] }],
      [0.5, { aL: [0, -0.2, 95], aR: [0, -0.2, -95], torso: [0, 0, 0, 1.1, 1], root: [0, 0.5, 0, 1.04, 0.96] }], [0.7, { aL: [0, -0.2, 100], aR: [0, -0.2, -100], torso: [0, 0, 0, 1.22, 1.02], root: [0, 0.4, 0, 1.06, 0.96], head: [0, -0.2, 3] }], [0.85, { aL: [0, -0.2, 95], aR: [0, -0.2, -95], torso: [0, 0, 0, 1.1, 1] }], [1, {}]]);
    def('salute', 'Emote: Salute', 'Emote', 1.2, { mask: UPPER, bo: 0.15 }, [[0, {}], [0.2, { aR: [-0.6, -0.9, -148], torso: [0, 0, 0, 1, 1.02], root: [0, -0.2] }], [0.8, { aR: [-0.6, -0.9, -148], torso: [0, 0, 0, 1, 1.02], root: [0, -0.2] }], [1, {}]]);
    def('laugh', 'Emote: Laugh', 'Emote', 1.4, { mask: UPPER, bo: 0.15 }, [[0, {}]].concat(osc(12, 0.06, 0.8, 0, 1).map(([t, v]) => [t, v ? { root: [0, 0.3], head: [0, 0.3, -10], torso: [0, 0, -3, 1, 1.02], aL: [0, 0.5, 10], aR: [0, 0.5, -10] } : { root: [0, -0.5], head: [0, 0, -15], torso: [0, 0, -5, 1, 1.04], aL: [0, 0.3, 14], aR: [0, 0.3, -14] }])).concat([[1, {}]]));
    // modifiers (held layers)
    def('boost', 'Speed-boost lean', 'Modifier', 0.5, { add: true, loop: true, hold: true, signed: true }, [[0, { root: [0.3, 0, 6], torso: [0, 0, 4], head: [0, 0, -2] }], [0.5, { root: [0.5, -0.2, 7], torso: [0, 0, 5], head: [0, 0, -2] }]]);
    def('brace', 'Shield-up brace', 'Modifier', 0.8, { add: true, loop: true, hold: true }, [[0, { root: [0, 0.7, 0, 1.04, 0.94], aL: [0, -0.5, 50], aR: [0, -0.5, -50], lL: [-0.5, 0], lR: [0.5, 0], head: [0, 0.3] }], [0.5, { root: [0, 0.9, 0, 1.04, 0.94], aL: [0, -0.5, 50], aR: [0, -0.5, -50], lL: [-0.5, 0], lR: [0.5, 0], head: [0, 0.3] }]]);

    // keyframe compilation: dense Float32Array per key (identity for parts a key does not mention)
    const compile = (src, loop, user) => {
      const K = src.map((k) => {
        const d = new Float32Array(IDENT0); const pp = k[1] || {};
        for (const nm in pp) { const pi = PI[nm]; if (pi === undefined) continue; const a = pp[nm]; if (!Array.isArray(a)) continue; for (let c = 0; c < NCH; c++) if (typeof a[c] === 'number' && isFinite(a[c])) d[pi * 5 + c] = a[c]; }
        return { t: clamp(+k[0] || 0, 0, 1), e: EASE[k[2]] ? k[2] : '', u: !!(user && EASE[k[2]]), d };
      }).sort((a, b) => a.t - b.t);
      if (!K.length || K[0].t > 0) K.unshift({ t: 0, e: '', u: false, d: new Float32Array(IDENT0) });
      if (K[K.length - 1].t < 1) K.push({ t: 1, e: '', u: false, d: new Float32Array(loop ? K[0].d : IDENT0) });
      return K;
    };
    CLIP_ORDER.forEach((id) => { const c = CLIPS[id]; c.K = compile(c.src, c.loop, false); });
    const KFC = new WeakMap();   // custom keyframe arrays -> compiled
    const kfOf = (cl, cc) => { if (!cc || !cc.kf) return cl.K; let k = KFC.get(cc.kf); if (!k) { k = compile(cc.kf, cl.loop, true); KFC.set(cc.kf, k); } return k; };

    const evalKeys = (K, t, se, out) => {
      const n = K.length;
      if (t <= K[0].t) { out.set(K[0].d); return; }
      if (t >= K[n - 1].t) { out.set(K[n - 1].d); return; }
      let i = 0; while (i < n - 2 && t > K[i + 1].t) i++;
      const a = K[i], b = K[i + 1], u = (t - a.t) / ((b.t - a.t) || 1), f = (EASE[a.u ? a.e : (se || a.e || 'inOut')] || EASE.inOut)(u), da = a.d, db = b.d;
      for (let j = 0; j < NV; j++) out[j] = da[j] + (db[j] - da[j]) * f;
    };

    // ================================================================= STYLES
    const DEFG = { spd: 1, amp: 1, sq: 1, snap: 0, rq: 0, steps: 0, ease: '', ant: 0, fol: 0, trail: 0, dust: 0, shadow: 0, hatLag: 0.6, backSway: 0.8, wobble: 0, stomp: 0, lean: 0.5, crouch: 0, blink: 1, blend: 0.12, bypass: 0 };
    // schema: [min, max, step, label]
    const GSCHEMA = {
      spd: [0.3, 2.5, 0.05, 'Global speed'], amp: [0, 2.5, 0.05, 'Amplitude'], sq: [0, 2.5, 0.05, 'Squash & stretch'], ant: [0, 1.6, 0.05, 'Anticipation'], fol: [0, 1.6, 0.05, 'Follow-through'],
      hatLag: [0, 2, 0.05, 'Hat / hair lag'], backSway: [0, 2, 0.05, 'Cape / pack sway'], lean: [0, 2, 0.05, 'Speed lean'], crouch: [0, 1.5, 0.05, 'Crouch'], wobble: [0, 2, 0.05, 'Wobble'],
      stomp: [0, 2, 0.05, 'Stomp shake'], dust: [0, 2, 0.05, 'Dust puffs'], trail: [0, 1, 0.05, 'Afterimage trail'], shadow: [0, 2, 0.05, 'Shadow squash'], steps: [0, 8, 1, 'Frames per cycle (0 = smooth)'], rq: [0, 90, 15, 'Snap rotation (deg)'], blend: [0.02, 0.5, 0.02, 'Blend time (s)']
    };
    const GORDER = ['spd', 'amp', 'sq', 'ant', 'fol', 'hatLag', 'backSway', 'lean', 'crouch', 'wobble', 'stomp', 'dust', 'trail', 'shadow', 'steps', 'rq', 'blend'];
    const mkStyle = (id, name, desc, g, c) => ({ id, name, desc: desc || '', g: Object.assign({}, DEFG, g || {}), c: c || {} });
    const PRESETS = {};
    const P = (id, name, desc, g, c) => { PRESETS[id] = mkStyle(id, name, desc, g, c); };
    P('classic', 'Classic', 'The original. No extra motion.', { bypass: 1 }, {});
    P('bouncy', 'Bouncy', 'Squash and stretch, springy everything.', { sq: 1.35, amp: 1.1, ease: '', fol: 0.9, ant: 0.35, dust: 0.6, shadow: 1, hatLag: 1.2, backSway: 1.3, spd: 1.1 }, { idle: { a: 1.6, s: 1.4 }, walk: { a: 1.3, s: 1.1 }, run: { a: 1.3, s: 1.05 }, hop: { a: 1.1 }, hurt: { a: 1.2, e: 'elastic' }, heal: { a: 1.3 }, grab: { a: 1.4 }, victory: { a: 1.2 } });
    P('heavy', 'Heavy', 'Slow, big recoil, ground-shaking steps.', { spd: 0.85, amp: 1.25, sq: 0.45, stomp: 1, dust: 1, shadow: 1, ant: 0.25, hatLag: 0.3, backSway: 0.4, crouch: 0.25, lean: 0.25, blend: 0.18 }, { walk: { a: 1.3, s: 0.8 }, run: { a: 1.4, s: 0.75 }, idle: { a: 1.2, s: 0.8 }, shootPistol: { a: 1.8, s: 0.9 }, shootRifle: { a: 1.8, s: 0.9 }, shootShotgun: { a: 1.7, s: 0.85 }, shootMelee: { a: 1.4, s: 0.8 }, hurt: { a: 1.4, s: 0.8 }, death: { s: 0.7 } });
    P('sneaky', 'Sneaky', 'Low crouch, quick and quiet.', { spd: 1.25, amp: 0.8, crouch: 0.9, sq: 0.6, hatLag: 0.35, backSway: 0.5, lean: 0.9, dust: 0, shadow: 0, blend: 0.08 }, { walk: { a: 0.8, s: 1.3 }, run: { a: 0.9, s: 1.25 }, idle: { a: 0.6, s: 1.2 }, dash: { a: 1.2 } });
    P('robotic', 'Robotic', 'Stiff, snapped, four-frame moves.', { steps: 4, snap: 1, rq: 45, ease: 'linear', hatLag: 0, backSway: 0, sq: 0.2, lean: 0, blend: 0.05, ant: 0, fol: 0 }, { idle: { a: 0.5, s: 0.7 }, walk: { a: 1 }, run: { a: 1 } });
    P('smooth', 'Smooth', 'Long easing, floaty and calm.', { spd: 0.8, amp: 0.9, sq: 0.5, ease: 'inOut', fol: 1.2, hatLag: 1.4, backSway: 1.5, trail: 0.2, shadow: 1, blend: 0.3, lean: 0.8 }, { idle: { a: 1.3, s: 0.8 }, walk: { a: 0.9, s: 0.85 }, run: { a: 1, s: 0.85 }, hurt: { s: 0.8 } });
    P('dramatic', 'Dramatic', 'Anime wind-ups and big poses.', { ant: 1.0, fol: 0.9, amp: 1.2, sq: 1.1, ease: 'back', dust: 0.5, trail: 0.5, spd: 0.9, shadow: 1, hatLag: 1.2, backSway: 1.5 }, { cast: { a: 1.3 }, overdrive: { a: 1.3 }, hurt: { a: 1.3 }, victory: { a: 1.2 }, dash: { a: 1.2 }, parry: { a: 1.2 }, emote0: { a: 1.2 }, emote1: { a: 1.2 }, emote2: { a: 1.2 }, emote3: { a: 1.2 }, dance: { a: 1.2 }, flex: { a: 1.2 } });
    P('drunk', 'Drunk', 'Wobbly, weaving, one more round.', { wobble: 1.1, spd: 0.9, amp: 1.2, ease: 'inOut', lean: 1.5, hatLag: 1.6, backSway: 1.4, fol: 0.6, blend: 0.25 }, { idle: { a: 1.6, s: 0.9 }, walk: { a: 1.3, s: 0.85 }, run: { a: 1.3, s: 0.9 }, hurt: { a: 1.4 } });
    P('retro', 'Retro', 'Two-frame NES-style flipbook.', { steps: 2, snap: 1, ease: 'linear', hatLag: 0, backSway: 0, sq: 0, lean: 0, blend: 0.03, rq: 90, dust: 0, shadow: 0 }, { idle: { a: 0.8, s: 0.6 }, walk: { a: 1.2 }, run: { a: 1.2 } });
    const PRESET_IDS = Object.keys(PRESETS);

    // ----------------------------------------------------------------- sanitising (also used for strangers' styles off the wire)
    const sanitize = (raw, name) => {
      const S = mkStyle('c', String(name || (raw && raw.name) || 'Custom').replace(/[<>&"'`\\]/g, '').slice(0, 14) || 'Custom', '', {}, {});
      if (!raw || typeof raw !== 'object') return S;
      const rg = raw.g || {};
      for (const k in DEFG) {
        if (k === 'bypass' || rg[k] === undefined) continue;
        if (k === 'ease') { if (EASE[rg[k]]) S.g.ease = rg[k]; continue; }
        if (k === 'snap' || k === 'blink') { S.g[k] = rg[k] ? 1 : 0; continue; }
        const sc = GSCHEMA[k]; if (sc && typeof +rg[k] === 'number' && isFinite(+rg[k])) S.g[k] = clamp(+rg[k], sc[0], sc[1]);
      }
      const rc = raw.c || {}; let nk = 0;
      for (const id in rc) {
        const cl = CLIPS[id]; if (!cl || !rc[id] || typeof rc[id] !== 'object') continue;
        const o = {}, r = rc[id];
        if (isFinite(+r.a) && r.a !== undefined) o.a = clamp(+r.a, 0, 2.5);
        if (isFinite(+r.s) && r.s !== undefined) o.s = clamp(+r.s, 0.2, 3);
        if (EASE[r.e]) o.e = r.e;
        if (Array.isArray(r.kf)) {
          const kf = [];
          for (const k of r.kf.slice(0, 10)) {
            if (!Array.isArray(k) || !isFinite(+k[0])) continue; if (++nk > 70) break;
            const pp = {}; const src = k[1] || {};
            for (const nm in src) { if (PI[nm] === undefined || !Array.isArray(src[nm])) continue; pp[nm] = src[nm].slice(0, 5).map((v, c) => { v = isFinite(+v) ? +v : (c > 2 ? 1 : 0); return c < 2 ? clamp(v, -9, 9) : c === 2 ? clamp(v, -400, 400) : clamp(v, 0.4, 1.8); }); }
            kf.push([clamp(+k[0], 0, 1), pp, EASE[k[2]] ? k[2] : undefined]);
          }
          if (kf.length >= 2) o.kf = kf;
        }
        if (Object.keys(o).length) S.c[id] = o;
      }
      return S;
    };
    const r2 = (v) => Math.round(v * 100) / 100;
    // compact JSON for the wire / export. only values that differ from the defaults. capped by dropping the heaviest pieces first.
    const compact = (S, cap) => {
      const o = { g: {}, c: {} };
      for (const k in DEFG) if (k !== 'bypass' && S.g[k] !== DEFG[k]) o.g[k] = typeof S.g[k] === 'number' ? r2(S.g[k]) : S.g[k];
      for (const id in S.c) { const c = S.c[id], q = {}; if (c.a !== undefined && c.a !== 1) q.a = r2(c.a); if (c.s !== undefined && c.s !== 1) q.s = r2(c.s); if (c.e) q.e = c.e; if (c.kf) q.kf = c.kf.map((k) => [r2(k[0]), Object.fromEntries(Object.entries(k[1]).map(([n, a]) => [n, a.map(r2)])), k[2]].filter((v, i) => i < 2 || v)); if (Object.keys(q).length) o.c[id] = q; }
      if (!Object.keys(o.g).length) delete o.g; if (!Object.keys(o.c).length) delete o.c;
      const nm = S.name;
      let s = JSON.stringify(o);
      if (cap) {
        const ids = Object.keys(o.c || {});
        for (const id of ids.slice().reverse()) { if (s.length <= cap) break; if (o.c[id].kf) { delete o.c[id].kf; s = JSON.stringify(o); } }
        for (const id of ids.slice().reverse()) { if (s.length <= cap) break; delete o.c[id]; s = JSON.stringify(o); }
        if (s.length > cap) { delete o.c; s = JSON.stringify(o); }
      }
      return { s, name: nm };
    };
    const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); };

    // ================================================================= MY STYLE (account + localStorage)
    const LS = 'mpanim_v1';
    const blankAnim = () => ({ style: 'classic', custom: [null, null, null, null, null] });
    const normAnim = (a) => {
      const o = blankAnim(); if (!a || typeof a !== 'object') return o;
      o.style = (PRESETS[a.style] || /^c[0-4]$/.test(a.style)) ? a.style : 'classic';
      if (Array.isArray(a.custom)) for (let i = 0; i < 5; i++) { const c = a.custom[i]; if (c && typeof c === 'object') { const S = sanitize(c, c.name); o.custom[i] = { name: S.name, g: S.g, c: S.c }; } }
      return o;
    };
    let MYA = null, MYU = null, MYV = 0;
    const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } };
    const lsSet = (a) => { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) { /* private mode */ } };
    const curUser = () => { try { return typeof currentUserData !== 'undefined' ? currentUserData : null; } catch (e) { return null; } };
    const mine = () => {   // the live anim record (shared object with the account doc so save() carries it)
      const u = curUser();
      if (u !== MYU || !MYA) {
        MYU = u; MYV++;
        const src = (u && u.anim) ? u.anim : lsGet();
        MYA = normAnim(src);
        if (u) u.anim = MYA;
      }
      return MYA;
    };
    let saveT = 0;
    const persist = () => {
      MYV++; const a = mine(); lsSet(a);
      clearTimeout(saveT);
      saveT = setTimeout(() => { try { const u = curUser(); if (u && typeof save === 'function') save({ anim: a }); } catch (e) { /* offline */ } }, 700);
    };
    const customToStyle = (i) => { const c = mine().custom[i]; if (!c) return null; const S = mkStyle('c' + i, c.name || 'Custom', '', c.g, c.c); return S; };
    let MYS = null, MYSK = '';
    const myStyle = () => {
      const a = mine(), k = a.style + '|' + MYV;
      if (k === MYSK && MYS) return MYS;
      MYSK = k; MYS = PRESETS[a.style] || (/^c\d$/.test(a.style) ? customToStyle(+a.style[1]) : null) || PRESETS.classic;
      return MYS;
    };
    // ----- the wire: lookOut() adds `an`, cleanLook() sanitises it. Presets travel as an id; a custom style travels as capped JSON.
    const WIRE_CAP = 420;
    let wireK = '', wireV = null;
    const lk = (u) => {
      try {
        if (!u || u !== curUser()) return {};
        const S = myStyle(), key = S.id + '|' + MYV;
        if (key === wireK) return wireV;
        wireK = key;
        if (S.id === 'classic') wireV = {};
        else if (PRESETS[S.id]) wireV = { an: { s: S.id } };
        else { const c = compact(S, WIRE_CAP); wireV = { an: { s: 'c', n: c.name, p: c.s } }; }
        return wireV;
      } catch (e) { return {}; }
    };
    const WCACHE = new Map();
    const clean = (raw) => {
      try {
        if (!raw || typeof raw !== 'object') return undefined;
        const s = raw.s;
        if (PRESETS[s] && s !== 'classic') return { s };
        if (s !== 'c' || typeof raw.p !== 'string' || raw.p.length > 520) return undefined;
        let h = WCACHE.get(raw.p);
        if (!h) {
          let j = null; try { j = JSON.parse(raw.p); } catch (e) { return undefined; }
          const S = sanitize(j, raw.n); S.id = 'c:' + hash(raw.p);
          h = { out: { s: 'c', n: S.name, p: raw.p }, S };
          if (WCACHE.size > 60) WCACHE.clear();
          WCACHE.set(raw.p, h);
        }
        return h.out;
      } catch (e) { return undefined; }
    };
    const styleFromAn = (an) => {
      if (!an || typeof an !== 'object') return null;
      if (PRESETS[an.s]) return PRESETS[an.s];
      if (an.s === 'c' && typeof an.p === 'string') { clean(an); const h = WCACHE.get(an.p); return h ? h.S : null; }
      return null;
    };

    // ================================================================= SPRITE PARTS (cut the baked sprite into body parts)
    const PART_ORDER = ['hat', 'head', 'torso', 'aL', 'aR', 'lL', 'lR', 'back'];
    const classify = (x, y) => (y <= 1 ? 'hat' : y <= 4 ? 'head' : y <= 8 ? ((y >= 6 && y <= 7 && x <= 1) ? 'aL' : (y >= 6 && y <= 7 && x >= 8) ? 'aR' : 'torso') : (x <= 4 ? 'lL' : 'lR'));
    const PCACHE = new WeakMap();   // base sprite canvas -> {base:{}, flash:{}, blink: canvas, bk: backType}
    const keyOfCanvas = (cv) => { try { for (const k in SPR) if (SPR[k] === cv && (k[1] === ':' )) return k; } catch (e) { /* */ } return ''; };
    const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const getParts = (cv) => {
      let P = PCACHE.get(cv); if (P) return P;
      const W = cv.width, H = cv.height; if (W !== 10 || H !== 12) return null;
      const key = keyOfCanvas(cv); let backMask = null, eyes = null, bk = 'none';
      if (key && key[0] === 'p') {
        const f = key.slice(2).split('|'); const L = Object.assign({}, DEFAULT_LOOK, { hat: f[0], hair: f[1], skin: f[2], shirt: f[3], pants: f[4], shoes: f[5], trim: f[6], eyes: f[7], top: f[8], back: f[9], acc: f[10], mouth: f[11] });
        eyes = hex2rgb(L.eyes); bk = L.back || 'none';
        if (bk !== 'none') {
          try { const hat = HATS[L.hat] || HATS.hair, A = buildLookRows(L, hat), B = buildLookRows(Object.assign({}, L, { back: 'none' }), hat); backMask = new Uint8Array(120); for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) if (A[y][x] !== B[y][x]) backMask[y * 10 + x] = 1; } catch (e) { backMask = null; }
        }
      }
      const cut = (src) => {
        const id = src.getContext('2d').getImageData(0, 0, 10, 12).data, out = {};
        PART_ORDER.forEach((n) => { const c = document.createElement('canvas'); c.width = 10; c.height = 12; out[n] = { c, d: c.getContext('2d').createImageData(10, 12) }; });
        for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) {
          const o = (y * 10 + x) * 4; if (id[o + 3] === 0) continue;
          const nm = (backMask && backMask[y * 10 + x]) ? 'back' : classify(x, y), d = out[nm].d.data;
          d[o] = id[o]; d[o + 1] = id[o + 1]; d[o + 2] = id[o + 2]; d[o + 3] = id[o + 3];
        }
        const r = {}; PART_ORDER.forEach((n) => { out[n].c.getContext('2d').putImageData(out[n].d, 0, 0); r[n] = out[n].c; }); return r;
      };
      P = { base: cut(cv), flash: null, blink: null, bk, key };
      // blink: eye pixels painted skin-coloured
      try {
        const id = cv.getContext('2d').getImageData(0, 0, 10, 12).data, skin = [id[(2 * 10 + 4) * 4], id[(2 * 10 + 4) * 4 + 1], id[(2 * 10 + 4) * 4 + 2]];
        const bc = document.createElement('canvas'); bc.width = 10; bc.height = 12; const bx = bc.getContext('2d'); bx.drawImage(P.base.head, 0, 0);
        const bd = bx.getImageData(0, 0, 10, 12); let hit = 0;
        for (let y = 2; y <= 4; y++) for (let x = 0; x < 10; x++) { const o = (y * 10 + x) * 4; if (bd.data[o + 3] && eyes && bd.data[o] === eyes[0] && bd.data[o + 1] === eyes[1] && bd.data[o + 2] === eyes[2]) { bd.data[o] = skin[0]; bd.data[o + 1] = skin[1]; bd.data[o + 2] = skin[2]; hit++; } }
        if (hit) { bx.putImageData(bd, 0, 0); P.blink = bc; }
      } catch (e) { /* blink is optional */ }
      PCACHE.set(cv, P);
      return P;
    };
    const flashParts = (P, cv) => {   // the white hit-flash sprite, cut the same way (lazy)
      if (P.flash) return P.flash;
      try { const key = P.key; const fl = key && SPR_FLASH[key] ? SPR_FLASH[key] : (cv === SPR.player && SPR_FLASH.player) || null; if (fl) { const tmp = getParts(fl); P.flash = tmp ? tmp.base : P.base; } } catch (e) { /* */ }
      return P.flash || P.base;
    };
    const PIV = { root: [5, 12], torso: [5, 9], head: [5, 5], hat: [5, 2], aL: [1, 6], aR: [8, 6], lL: [3, 9], lR: [6, 9], back: [5, 5] };

    // ================================================================= ENTITY STATE + SOLVER
    const ENTS = new Map(); let ENT_GC = 0;
    const newEnt = (id) => ({
      id, pose: new Float32Array(IDENT0), t: 0, x: 0, y: 0, vx: 0, vy: 0, sp: 0, fresh: true, loco: 'idle', lph: 0, prev: null, pph: 0, bl: 1, layers: [], kdir: [0, 1], aim: 0, sc: 3,
      idleT: 0, nextIdle: 3 + Math.random() * 3, blinkT: 0, nextBlink: 1.5 + Math.random() * 3, hat: { x: 0, y: 0, r: 0, ok: 0 }, bk: 0, dust: [], trail: [], lastFoot: 0, seen: 0, walkDir: 1, mem: {}, lift: 0, hx: 0, hy: 0, hr: 0, hsc: 3, face: 1
    });
    const QA = new Float32Array(NV), QB = new Float32Array(NV), QT = new Float32Array(NV), QU = new Float32Array(NV);
    const effDur = (S, cl) => cl.dur / ((S.g.spd || 1) * ((S.c[cl.id] && S.c[cl.id].s) || 1));

    // one clip at normalised time ph in [0,1] -> out, with the style applied (amp, easing, steps, anticipation, follow-through)
    const clipPose = (S, cl, ph, out) => {
      const cc = S.c[cl.id], g = S.g, K = kfOf(cl, cc), se = (cc && cc.e) || g.ease || '';
      let t = ph;
      if (g.steps > 0) { const n = cl.loop ? g.steps : Math.max(2, Math.round(g.steps * Math.max(0.3, cl.dur) / 0.6)); t = ph >= 1 ? 1 : cl.loop ? Math.floor(ph * n) / n : (Math.floor(ph * n) + 0.5) / n; }
      evalKeys(K, t, se, out);
      if (!cl.loop && !cl.hold) {
        if (g.ant > 0) { const w = t < 0.3 ? Math.sin(Math.PI * t / 0.3) : 0; if (w > 0) { evalKeys(K, 0.45, se, QU); for (let j = 0; j < NV; j++) out[j] += (QU[j] - IDENT0[j]) * (-g.ant * 0.45 * w); } }
        if (g.fol > 0 && t > 0.55) { const u = t - 0.55, w = Math.sin(u * 22) * Math.exp(-u * 6) * g.fol * 0.4; evalKeys(K, 0.55, se, QU); for (let j = 0; j < NV; j++) out[j] += (QU[j] - IDENT0[j]) * w; }
      }
      const a = ((cc && cc.a !== undefined) ? cc.a : 1) * g.amp, sa = g.sq * (0.5 + 0.5 * a);   // squash follows the style's squash setting, only half-tied to amplitude
      for (let p = 0; p < NP; p++) { const o = p * 5; for (let c = 0; c < NCH; c++) { const j = o + c, dv = out[j] - IDENT0[j]; out[j] = IDENT0[j] + dv * (c < 3 ? a : sa); if (c > 2) out[j] = clamp(out[j], 0.68, 1.38); } }
    };
    const loopPh = (cl, ph) => { if (ph < 1) return ph; if (!cl.loop) return 1; const lp = cl.lp || 0; return lp + ((ph - lp) % (1 - lp)); };

    const fire = (ent, id, o) => {
      const cl = CLIPS[id]; if (!cl) return; o = o || {};
      let L = null; for (const l of ent.layers) if (l.id === id) { L = l; break; }
      if (L && (cl.hold || cl.loop)) { L.target = 1; if (o.sign) L.sign = o.sign; return L; }
      if (L) { L.t = 0; L.dead = false; if (o.sign) L.sign = o.sign; } else { L = { id, t: 0, w: cl.hold ? 0 : 1, target: 1, sign: o.sign || 1, dead: false }; ent.layers.push(L); }
      if (o.dir) ent.kdir = o.dir;
      if (cl.fx === 'heal') ent.heal = 1;
      return L;
    };
    const release = (ent, id) => { for (const l of ent.layers) if (l.id === id) l.target = 0; };

    const solve = (ent, S, dt, ctl) => {
      const g = S.g, P = ent.pose;
      ent.t += dt;
      // ---- locomotion
      let want = ctl.loco || 'idle';
      if (want !== ent.loco) { ent.prev = { id: ent.loco, ph: ent.lph }; ent.bl = 0; ent.loco = want; if (want === 'idle' || ent.prev.id === 'idle') ent.lph = 0; }
      const stepPh = (id, ph) => { const cl = CLIPS[id], cc = S.c[id], cs = (g.spd || 1) * ((cc && cc.s) || 1); const r = cl.gait ? clamp(ctl.sp / cl.gait, 0.3, 5) * cs : 1 / effDur(S, cl); return (ph + dt * r) % 1; };
      ent.lph = stepPh(ent.loco, ent.lph);
      const cl0 = CLIPS[ent.loco];
      if (cl0.gait && ctl.sp > 20) { const f = Math.floor(ent.lph * 2); if (f !== ent.lastFoot) { ent.lastFoot = f; ctl.foot && ctl.foot(ent, f); } }
      clipPose(S, cl0, ent.lph, QA);
      if (ent.prev && ent.bl < 1) {
        ent.prev.ph = stepPh(ent.prev.id, ent.prev.ph);
        clipPose(S, CLIPS[ent.prev.id], ent.prev.ph, QB);
        ent.bl = Math.min(1, ent.bl + dt / Math.max(0.02, g.blend)); const f = EASE.inOut(ent.bl);
        for (let j = 0; j < NV; j++) QA[j] = QB[j] + (QA[j] - QB[j]) * f;
        if (ent.bl >= 1) ent.prev = null;
      }
      P.set(QA);
      // ---- crouch + dynamic lean + wobble (style-level, always on)
      if (g.crouch > 0) { P[PI.root * 5 + 1] += g.crouch * 1.1; P[PI.root * 5 + 4] -= g.crouch * 0.07; P[PI.lL * 5] -= g.crouch * 0.4; P[PI.lR * 5] += g.crouch * 0.4; P[PI.head * 5 + 1] += g.crouch * 0.3; }
      const vxn = clamp(ent.vx / 170, -1, 1), vyn = clamp(ent.vy / 170, -1, 1);
      if (g.lean > 0) { P[PI.root * 5 + 2] += vxn * g.lean * 5 * g.amp; P[PI.torso * 5 + 2] += vxn * g.lean * 2.5 * g.amp; P[PI.root * 5 + 1] += Math.abs(vyn) * 0 ; }
      if (g.wobble > 0) {
        const m = 1 + clamp(ctl.sp / 120, 0, 1) * 0.8, tt = ent.t + ent.seedT;
        P[PI.root * 5 + 2] += g.wobble * m * (3.2 * Math.sin(tt * 2.3) + 2 * Math.sin(tt * 3.9 + 1)); P[PI.root * 5] += g.wobble * m * 0.7 * Math.sin(tt * 1.9 + 2);
        P[PI.head * 5 + 2] += g.wobble * m * 4 * Math.sin(tt * 3.1 + 0.5); P[PI.torso * 5 + 2] += g.wobble * m * 2 * Math.sin(tt * 2.7);
      }
      // ---- layers (one-shots, holds, emotes)
      ent.kx = 0;
      for (let i = ent.layers.length - 1; i >= 0; i--) {
        const L = ent.layers[i], cl = CLIPS[L.id];
        if (!cl) { ent.layers.splice(i, 1); continue; }
        const dur = effDur(S, cl);
        let w;
        if (cl.hold) {
          L.t += dt; w = L.w + (L.target - L.w) * Math.min(1, dt / Math.max(0.03, cl.bi + 0.07)); L.w = w;
          if (L.target === 0 && w < 0.01) { ent.layers.splice(i, 1); continue; }
          if (cl.holdEnd && L.t >= dur) { L.t = dur; }
        } else {
          L.t += dt;
          if (L.t >= dur) { ent.layers.splice(i, 1); continue; }
          w = Math.min(1, cl.bi > 0 ? L.t / cl.bi : 1, cl.bo > 0 ? (dur - L.t) / cl.bo : 1); w = w < 0 ? 0 : w;
          w = w * w * (3 - 2 * w);
        }
        let ph = L.t / dur; ph = cl.holdEnd ? Math.min(1, ph) : loopPh(cl, cl.loop ? ph : Math.min(1, ph));
        clipPose(S, cl, ph, QT);
        if (L.sign < 0) for (let p = 0; p < NP; p++) { QT[p * 5] = IDENT0[p * 5] - (QT[p * 5] - IDENT0[p * 5]); QT[p * 5 + 2] = -QT[p * 5 + 2]; }
        const mk = cl.mask;
        for (let mi = 0; mi < mk.length; mi++) {
          const p = mk[mi], o = p * 5;
          if (cl.add) for (let c = 0; c < NCH; c++) P[o + c] += (QT[o + c] - IDENT0[o + c]) * w;
          else for (let c = 0; c < NCH; c++) P[o + c] += (QT[o + c] - P[o + c]) * w;
        }
      }
      // ---- secondary motion: hat lags the head, back item sways
      const hz = ent.hat, rx = P[PI.root * 5] + P[PI.head * 5], ry = P[PI.root * 5 + 1] + P[PI.head * 5 + 1] + P[PI.torso * 5 + 1], rr = P[PI.root * 5 + 2] + P[PI.torso * 5 + 2] + P[PI.head * 5 + 2];
      if (!hz.ok) { hz.x = rx; hz.y = ry; hz.r = rr; hz.ok = 1; }
      const k = 1 - Math.exp(-dt * 14); hz.x += (rx - hz.x) * k; hz.y += (ry - hz.y) * k; hz.r += (rr - hz.r) * k;
      if (g.hatLag > 0) { const hl = g.hatLag; P[PI.hat * 5] += (hz.x - rx) * hl * 1.3 - vxn * 0.3 * hl; P[PI.hat * 5 + 1] += (hz.y - ry) * hl * 1.3; P[PI.hat * 5 + 2] += (hz.r - rr) * hl * 0.9 + vxn * 4 * hl; }
      if (g.backSway > 0) {
        const tgt = -vxn * 14 - (ctl.sp > 20 ? 3 : 0) * (vyn > 0 ? 1 : 0); ent.bk += (tgt - ent.bk) * (1 - Math.exp(-dt * 7));
        P[PI.back * 5 + 2] += (ent.bk + Math.sin(ent.t * 2.2 + ent.seedT) * 2) * g.backSway; P[PI.back * 5 + 1] += (hz.y - ry) * 0.5 * g.backSway;
      }
      ent.kx = P[PI.dk * 5];
      return P;
    };

    // ================================================================= DRAWING A POSE
    const drawPose = (c, parts, P, x, y, sc, g, alpha) => {
      const snap = g.snap, rq = g.rq;
      const o = (v) => (snap ? Math.round(v) * sc : Math.round(v * sc));
      const rot = (r) => { if (rq > 0) r = Math.round(r / rq) * rq; return r * 0.017453293; };
      const ch = (n, i) => P[PI[n] * 5 + i];
      const dkx = P[PI.dk * 5];
      c.save(); c.translate(x, y);
      if (alpha !== undefined) c.globalAlpha *= alpha;
      c.imageSmoothingEnabled = false;
      // root: offset + squash/rotate about the feet
      c.translate(o(ch('root', 0)) + (P.__dx || 0), o(ch('root', 1)) + (P.__dy || 0));
      c.translate(0, 6 * sc); c.rotate(rot(ch('root', 2))); c.scale(ch('root', 3), ch('root', 4));   // origin = the feet pivot
      const W = 10 * sc, H = 12 * sc;
      // legs hang from the hips, torso from the root pivot; children draw inside their parent's transform
      c.save();
      const drawChild = (nm, par, pre, post) => {
        const pv = PIV[nm], pp = PIV[par];
        c.save(); c.translate((pv[0] - pp[0]) * sc + o(ch(nm, 0)), (pv[1] - pp[1]) * sc + o(ch(nm, 1)));
        const r = ch(nm, 2); if (r) c.rotate(rot(r)); const sx = ch(nm, 3), sy = ch(nm, 4); if (sx !== 1 || sy !== 1) c.scale(sx, sy);
        if (pre) pre();
        c.drawImage(parts[nm], -pv[0] * sc, -pv[1] * sc, W, H);
        if (post) post();
        c.restore();
      };
      drawChild('lL', 'root'); drawChild('lR', 'root');
      drawChild('torso', 'root', () => { drawChild('back', 'torso'); }, () => {
        drawChild('aL', 'torso'); drawChild('aR', 'torso');
        drawChild('head', 'torso', null, () => { drawChild('hat', 'head'); });
      });
      c.restore();
      c.restore();
    };

    // ================================================================= SPRITE SOURCES (adapters turn game state into triggers)
    const pnames = { 0: 'emote0', 1: 'emote1', 2: 'emote2', 3: 'emote3' };
    const EMQ = [];   // party emotes seen on the wire: {pid, i}
    const EMSEEN = new Set(); let emPoll = 0;
    const pollEmotes = () => {
      const n = performance.now(); if (n - emPoll < 30) return; emPoll = n;
      try {
        if (typeof PARTY_debug !== 'function') return;
        const d = PARTY_debug(); if (!d) return;
        const guest = typeof MP !== 'undefined' && MP.role === 'guest', list = guest ? (d.GST && d.GST.fx) : (d.P && d.P.fx);
        if (!list) return;
        for (const f of list) {
          if (f.k !== 'e') continue; const kk = f.id + ':' + f.t0 + ':' + f.i; if (EMSEEN.has(kk)) continue; EMSEEN.add(kk);
          if (f.t0 >= (typeof g !== 'undefined' ? g.tick : 0) - 30) EMQ.push({ pid: f.id, i: f.i, at: n, me: guest ? f.id === d.GST.me : f.id === 'host' });
        }
        if (EMSEEN.size > 200) EMSEEN.clear();
      } catch (e) { /* no party */ }
    };
    const wtype = (id) => {
      id = String(id || ''); let m = null; try { m = WEAPON_DATA[id]; } catch (e) { /* */ }
      const s = ((m && m.label) || '') + ' ' + id;
      if (id === 'HOSE') return 'Beam'; if (id === 'MINES' || id === 'TURRET' || id === 'SUMMON' || id === 'DRONE') return 'Throw'; if (id === 'RAIL') return 'Rifle';
      if (/sword|blade|\bbat\b|axe|knife|hammer|\bsaw|club|spoon|scythe|mace|katana|melee|slash|crowbar|wrench|machete/i.test(s)) return 'Melee';
      if (/shotgun|scatter|blunder|boomstick|cannon|spread/i.test(s)) return 'Shotgun';
      if (/beam|laser|flame|\bray\b|stream|spray|hose|plasma/i.test(s)) return 'Beam';
      if (/rifle|sniper|smg|\bak|machine|gatling|minigun|assault|carbine/i.test(s)) return 'Rifle';
      return 'Pistol';
    };
    const nearestDir = (x, y) => {
      try { const t = nearest(x, y); if (t && Math.hypot(t.x - x, t.y - y) < 260) { const a = Math.atan2(t.y - y, t.x - x); return [Math.cos(a), Math.sin(a), a]; } } catch (e) { /* */ }
      return null;
    };
    const footFx = (ent, f, S, local) => {
      const g = S.g;
      if (g.dust > 0 && ent.sp > 60 && Math.random() < Math.min(1, g.dust)) for (let i = 0; i < 2; i++) ent.dust.push({ x: ent.x + (Math.random() - 0.5) * 8, y: ent.y + 16, vx: (Math.random() - 0.5) * 30 - ent.vx * 0.05, vy: -8 - Math.random() * 14, life: 0.35 + Math.random() * 0.2, max: 0.5, sz: 2 + (Math.random() * 2 | 0) * Math.max(1, ent.sc / 3), k: 'd' });
      if (local && g.stomp > 0 && ent.sp > 60) { try { const G = GG(); G.shake = Math.max(G.shake || 0, 1.4 * g.stomp * (ent.loco === 'run' ? 1.3 : 0.8)); } catch (e) { /* */ } }
    };
    // local player
    const srcLocal = (ent, S, dt, p, G) => {
      const m = ent.mem; const hp = T0(p.hp), mx = T0(p.maxHp) || 100;
      if (m.tick !== undefined && (G.tick < m.tick - 5 || !G.active)) { ent.layers.length = 0; m.dead = 0; m.down = 0; m.hp = hp; m.rec = 0; m.wave = G.wave; m.pk = G.pickups ? G.pickups.length : 0; }
      m.tick = G.tick;
      const tgt = nearestDir(p.x, p.y), aim = T0(G.lastAim);
      if (tgt) ent.kdir = [tgt[0], tgt[1]]; ent.aim = aim; const wt = wtype(G.heldId || (curUser() && curUser().loadout && curUser().loadout[0]));
      const downed = G.downT > 0 || (typeof MP !== 'undefined' && MP.down) || !!G.dying;
      const dead = hp <= 0 && !G.dying;
      if (m.hp !== undefined) {
        if (hp < m.hp - 1 && !downed && !dead) fire(ent, 'hurt', { sign: tgt ? (tgt[0] >= 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1), dir: tgt ? [tgt[0], tgt[1]] : null });
        else if (hp > m.hp) { m.heal = (m.heal || 0) + (hp - m.hp); }
      }
      m.heal = (m.heal || 0) * Math.max(0, 1 - dt * 2); if (m.heal >= 5 && !downed) { fire(ent, 'heal'); m.heal = 0; }
      m.hp = hp;
      // shots
      const rec = T0(G.recoil);
      const par = G.parry && G.parry.t > 0;
      if (par && !m.par) fire(ent, 'parry', { dir: [Math.cos(aim), Math.sin(aim)] });
      m.par = par;
      if (wt === 'Beam') { if (rec > 0.3) m.beamT = 0.25; m.beamT = Math.max(0, (m.beamT || 0) - dt); if (m.beamT > 0 && !downed) fire(ent, 'shootBeam'); else release(ent, 'shootBeam'); }
      else if (rec > (m.rec || 0) + 0.12 && !par && !downed) { m.shotAt = NOW(); fire(ent, 'shoot' + wt, { dir: [Math.cos(aim), Math.sin(aim)] }); }
      m.rec = rec;
      if (G.abilityTimeLeft > 0 && !m.ab) fire(ent, 'cast'); m.ab = G.abilityTimeLeft > 0;
      const bu = G.hb && G.hb.bu; if (m.bu !== undefined && bu !== undefined && bu < m.bu) fire(ent, 'overdrive'); m.bu = bu;
      if (G.paused && !m.paused && G.zombies && G.zombies.length === 0 && G.wave > 0 && hp > 0) fire(ent, 'victory'); m.paused = G.paused;
      const pk = G.pickups ? G.pickups.length : 0;
      if (pk < m.pk && !downed) fire(ent, 'grab'); m.pk = pk;
      // holds
      if (downed) { fire(ent, 'down'); m.down = 1; } else { if (m.down) { release(ent, 'down'); if (hp > 0) fire(ent, 'revive'); m.down = 0; } else release(ent, 'down'); }
      if (dead) { if (!m.dead) { fire(ent, 'death'); m.dead = 1; } } else if (m.dead) { m.dead = 0; release(ent, 'death'); ent.layers = ent.layers.filter((l) => l.id !== 'death'); }
      if (G.buffs && G.buffs.speed > 0 && ent.sp > 30) fire(ent, 'boost', { sign: ent.vx >= 0 ? 1 : -1 }); else release(ent, 'boost');
      let sh = false; try { sh = isHeld('SHIELD'); } catch (e) { /* */ }
      if (sh && !downed) fire(ent, 'brace'); else release(ent, 'brace');
      const bl = ent.layers.find((l) => l.id === 'boost'); if (bl) bl.sign = ent.vx >= 0 ? 1 : -1;
      // emotes
      for (let i = EMQ.length - 1; i >= 0; i--) { const q = EMQ[i]; if (performance.now() - q.at > 800) { EMQ.splice(i, 1); continue; } if (q.me) { fire(ent, pnames[q.i] || 'emote1'); EMQ.splice(i, 1); } }
      return { limp: hp / mx < 0.3 && hp > 0, downed, dead };
    };
    // another player (party peer, guest view of others)
    const srcRemote = (ent, S, dt, o) => {
      const m = ent.mem, hp = T0(o.hp), mx = T0(o.maxHp) || 100, down = !!o.down;
      const tgt = o.noAim ? null : nearestDir(o.x, o.y); if (tgt) { ent.kdir = [tgt[0], tgt[1]]; ent.aim = tgt[2]; } else ent.aim = Math.atan2(ent.vy, ent.vx || 1e-3);
      if (m.hp !== undefined) {
        if (hp < m.hp - 1 && !down) fire(ent, 'hurt', { sign: tgt ? (tgt[0] >= 0 ? 1 : -1) : 1, dir: tgt ? [tgt[0], tgt[1]] : null });
        else if (hp > m.hp) m.heal = (m.heal || 0) + (hp - m.hp);
      }
      m.heal = (m.heal || 0) * Math.max(0, 1 - dt * 2); if (m.heal >= 5 && !down) { fire(ent, 'heal'); m.heal = 0; }
      m.hp = hp;
      if (down) { fire(ent, 'down'); m.down = 1; } else { release(ent, 'down'); if (m.down) { m.down = 0; fire(ent, 'revive'); } }
      // bullets this player owns (host view): a new one means a shot
      try {
        const G = GG(); if (G && G.bullets && ent.pid !== undefined) { let n = 0; for (const b of G.bullets) if (b.o === ent.pid) n++; if (n > (m.nb || 0) && !down) fire(ent, 'shoot' + wtype(o.hw), { dir: tgt ? [tgt[0], tgt[1]] : null }); m.nb = n; }
      } catch (e) { /* */ }
      for (let i = EMQ.length - 1; i >= 0; i--) { const q = EMQ[i]; if (performance.now() - q.at > 800) { EMQ.splice(i, 1); continue; } if (ent.pid !== undefined && q.pid === ent.pid && !q.me) { fire(ent, pnames[q.i] || 'emote1'); EMQ.splice(i, 1); } }
      return { limp: hp / mx < 0.3 && hp > 0, downed: down, dead: false };
    };

    // ================================================================= THE HOOK: drawSprite -> sprite()
    const SRC = new WeakMap();   // source object (g.player, a peer/other) -> ent, so drawHeldAt can find the hand offset
    const drawDust = (c, ent) => {
      if (!ent.dust.length) return;
      for (const q of ent.dust) { const a = clamp(q.life / q.max, 0, 1); c.globalAlpha = a * (q.k === 'd' ? 0.5 : 1); c.fillStyle = q.col || '#a8946e'; c.fillRect(Math.round(q.x), Math.round(q.y), q.sz, q.sz); if (q.k === 'p') { c.fillRect(Math.round(q.x) - q.sz, Math.round(q.y), q.sz * 3, q.sz); } }
      c.globalAlpha = 1;
    };
    const stepDust = (ent, dt) => { for (let i = ent.dust.length - 1; i >= 0; i--) { const q = ent.dust[i]; q.life -= dt; if (q.life <= 0) { ent.dust.splice(i, 1); continue; } q.x += q.vx * dt; q.y += q.vy * dt; if (q.k === 'd') { q.vy *= 0.92; q.vx *= 0.92; } } };

    // velocity over a short sliding window (the sim ticks at 60Hz, frames come at any rate, so per-frame deltas are spiky)
    const motion = (ent, x, y, dt) => {
      const now = NOW(), h = ent.hist || (ent.hist = []);
      if (h.length && Math.abs(x - h[h.length - 1][1]) + Math.abs(y - h[h.length - 1][2]) > 140) h.length = 0;   // teleport
      h.push([now, x, y]); while (h.length > 2 && now - h[0][0] > 0.14) h.shift();
      const a = h[0], el = now - a[0];
      let vx = 0, vy = 0; if (el > 0.03) { vx = (x - a[1]) / el; vy = (y - a[2]) / el; }
      const k = 1 - Math.exp(-dt * 14); ent.vx += (vx - ent.vx) * k; ent.vy += (vy - ent.vy) * k;
      ent.x = x; ent.y = y; ent.sp = Math.hypot(ent.vx, ent.vy); if (ent.sp < 12) ent.sp = 0;
    };
    // update motion + run the right adapter + solve; returns pose
    const advance = (ent, S, x, y, o, local, sc) => {
      const now = NOW();
      let dt = ent.fresh ? 0.016 : now - ent.tn; ent.tn = now; if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0.016;
      if (ent.fresh) { ent.x = x; ent.y = y; ent.fresh = false; ent.seedT = Math.random() * 10; }
      ent.sc = sc;
      if (dt < 0.0015) return ent.pose;   // same frame, drawn twice
      motion(ent, x, y, dt);
      const ctl = { sp: ent.sp, loco: 'idle', foot: (e, f) => footFx(e, f, S, local) };
      const info = local ? srcLocal(ent, S, dt, o, GG()) : srcRemote(ent, S, dt, o);
      // pick locomotion
      if (info.dead || info.downed) { ctl.loco = 'idle'; ctl.sp = 0; }
      else if (ent.sp > 14) {
        let strafe = false;
        if (local) { const ax = Math.cos(ent.aim), ay = Math.sin(ent.aim); const cosA = (ent.vx * ax + ent.vy * ay) / (ent.sp || 1); strafe = Math.abs(cosA) < 0.4 && ent.sp < 170 && (NOW() - (ent.mem.shotAt || -9)) < 1.2; }
        ctl.loco = info.limp ? 'limp' : strafe ? 'strafe' : (ent.sp > 235 ? 'run' : 'walk');
      }
      // dash: a sudden big speed spike
      if (ent.sp > 420 && !(ent.mem.dashCd > 0) && !info.downed) { fire(ent, 'dash', { sign: ent.vx >= 0 ? 1 : -1 }); ent.mem.dashCd = 0.6; if (S.g.dust > 0) for (let i = 0; i < 6; i++) ent.dust.push({ x: x + (Math.random() - 0.5) * 8, y: y + 16, vx: -ent.vx * 0.1 + (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 18, life: 0.4, max: 0.4, sz: 3, k: 'd' }); }
      ent.mem.dashCd = Math.max(0, (ent.mem.dashCd || 0) - dt);
      // idle variants + blink
      if (ctl.loco === 'idle' && !info.downed && !info.dead) {
        ent.idleT += dt; if (ent.idleT > ent.nextIdle) { ent.idleT = 0; ent.nextIdle = 4 + Math.random() * 5; fire(ent, Math.random() < 0.5 ? 'idleLook' : 'idleTwirl'); }
      } else ent.idleT = 0;
      ent.nextBlink -= dt; if (ent.blinkT > 0) ent.blinkT -= dt;
      if (ent.nextBlink <= 0) { ent.blinkT = 0.11; ent.nextBlink = 2 + Math.random() * 3.5; }
      if (ent.heal) { ent.heal = 0; for (let i = 0; i < 6; i++) ent.dust.push({ x: x + (Math.random() - 0.5) * 22, y: y + 6 - Math.random() * 6, vx: (Math.random() - 0.5) * 14, vy: -26 - Math.random() * 20, life: 0.8, max: 0.8, sz: 2, k: 'p', col: '#8fe08a' }); }
      stepDust(ent, dt);
      return solve(ent, S, dt, ctl);
    };

    const draw = (c, ent, S, P, parts, x, y, sc, flash, shadowAlpha, noFx) => {
      const g = S.g;
      // shadow: classic static ellipse, or one that shrinks / squashes with the jump when the style asks for it
      const lift = Math.max(0, -P[PI.root * 5 + 1]) * (g.shadow || 0), sx = P[PI.root * 5 + 3], shr = g.shadow ? 1 - Math.min(0.5, lift * 0.07) : 1;
      if (shadowAlpha !== 0) {
        c.fillStyle = 'rgba(0,0,0,' + (0.35 * (g.shadow ? 1 - Math.min(0.5, lift * 0.05) : 1) * (shadowAlpha === undefined ? 1 : shadowAlpha)) + ')';
        c.beginPath(); c.ellipse(x, y + 6 * sc - 2, 10 * sc * 0.38 * shr * (g.shadow ? 0.5 + 0.5 * sx : 1), Math.max(3, sc * 1.4) * shr, 0, 0, 6.283); c.fill();
      }
      // dust sits under the sprite
      if (!noFx) drawDust(c, ent);
      // afterimages (only when moving fast)
      if (!noFx && g.trail > 0 && ent.sp > 90) {
        const n = ent.trail.length;
        for (let i = 0; i < n; i++) { const tr = ent.trail[i]; drawPose(c, parts, tr.P, tr.x, tr.y, sc, g, 0.28 * g.trail * (i + 1) / (n + 1)); }
      }
      if (!noFx && g.trail > 0) { const tn = NOW(); if (!ent.trailT || tn - ent.trailT > 0.045) { ent.trailT = tn; ent.trail.push({ x, y, P: new Float32Array(P) }); if (ent.trail.length > 3) ent.trail.shift(); } if (ent.sp < 40 && ent.trail.length) ent.trail.length = 0; } else if (ent.trail.length) ent.trail.length = 0;
      const bp = (ent.blinkT > 0 && parts.__blink) ? Object.assign({}, parts, { head: parts.__blink }) : parts;
      drawPose(c, bp, P, x, y, sc, g);
    };

    let fr = 0;
    const sprite = (key, x, y, sc, opts) => {
      const o = opts.anim; if (!o) return 0;
      const local = o === 'me';
      const S = local ? myStyle() : (styleFromAn(o.look && o.look.an) || PRESETS.classic);
      if (!S || S.g.bypass) { if (local) ENTS.delete('me'); return 0; }
      const cv = (typeof SPR !== 'undefined') && SPR[key]; if (!cv) return 0;
      let parts = getParts(cv); if (!parts) return 0;
      const base = opts.flash ? flashParts(parts, cv) : parts.base;
      const pb = Object.assign({}, base); if (parts.blink) pb.__blink = parts.blink;
      const id = local ? 'me' : String(o.id !== undefined ? o.id : o.name);
      let ent = ENTS.get(id); if (!ent) { ent = newEnt(id); ENTS.set(id, ent); }
      ent.seen = performance.now();
      const src = local ? GG().player : o;
      if (!local) ent.pid = o.id;
      pollEmotes();
      SRC.set(src, ent);
      const P = advance(ent, S, x, y, src, local, sc);
      if (++ENT_GC % 600 === 0) { const t = performance.now(); ENTS.forEach((e, k) => { if (t - e.seen > 4000) ENTS.delete(k); }); }
      const kd = ent.kdir, dkx = ent.kx || 0;
      // push along the facing direction (dk) lives in screen space so it works for any aim
      const ox = dkx * kd[0] * sc, oy = dkx * kd[1] * sc * 0.7;
      P.__dx = S.g.snap ? Math.round(ox / sc) * sc : Math.round(ox); P.__dy = S.g.snap ? Math.round(oy / sc) * sc : Math.round(oy);
      draw(CTX(), ent, S, P, pb, x, y, sc, opts.flash);
      // hand data for drawHeldAt
      const wx = P[PI.wep * 5], wy = P[PI.wep * 5 + 1], wr = P[PI.wep * 5 + 2];
      ent.hx = (P[PI.root * 5] + P[PI.torso * 5]) * sc + P.__dx; ent.hy = (P[PI.root * 5 + 1] + P[PI.aR * 5 + 1] * 0.5) * sc + P.__dy; ent.hwx = wx * sc; ent.hwy = wy * sc; ent.hr = wr; ent.hsc = sc;
      return 12 * sc;
    };
    const hand = (p, a) => {
      const ent = SRC.get(p); if (!ent || performance.now() - ent.seen > 200) return null;
      const ca = Math.cos(a), sa = Math.sin(a);
      return [ent.hx + ca * ent.hwx - sa * ent.hwy, ent.hy + sa * ent.hwx + ca * ent.hwy, (((ent.hr % 360) + 360) % 360) * 0.017453293];
    };

    // ================================================================= LOBBY / LOCKER AVATAR (idle with style + now and then a show-off emote)
    const AVS = new WeakMap();
    const avatar = (c, img, cx, gy, w, h, sc, t, cv, skip) => {
      if (skip) return false;
      const S = myStyle(); if (!S || S.g.bypass) return false;
      const parts = getParts(img); if (!parts) return false;
      const pb = Object.assign({}, parts.base); if (parts.blink) pb.__blink = parts.blink;
      let AV = AVS.get(cv || c.canvas); if (!AV) { AV = newEnt('avatar'); AVS.set(cv || c.canvas, AV); }
      AV.seen = performance.now();
      const cy = gy - h / 2 + sc * 0.8;
      const P = advance(AV, S, cx, cy, { x: cx, y: cy, hp: 100, maxHp: 100, noAim: 1 }, false, sc);
      if (AV.mem.showT === undefined) AV.mem.showT = NOW() + 6;
      if (NOW() > AV.mem.showT) { AV.mem.showT = NOW() + 7 + Math.random() * 6; fire(AV, ['dance', 'flex', 'salute', 'laugh', 'victory', 'hop'][Math.random() * 6 | 0]); }
      P.__dx = 0; P.__dy = 0;
      c.save(); draw(c, AV, S, P, pb, cx, cy, sc, false, 0); c.restore();
      return true;
    };

    // ================================================================= PvP: wrap ctx.drawImage (mp-pvp.js draws players with a raw drawImage; this animates them without touching that file)
    const PLIMG = new WeakMap(); let pvpHooked = false;
    const isPlayerImg = (img) => {
      let r = PLIMG.get(img); if (r !== undefined) return r;
      r = false;
      try { for (const k in SPR) if ((k[1] === ':' || k === 'player') && (SPR[k] === img || SPR_FLASH[k] === img)) { r = { key: k, flash: SPR_FLASH[k] === img && SPR[k] !== img }; break; } } catch (e) { /* */ }
      PLIMG.set(img, r); return r;
    };
    const pvpState = () => { try { const S = window.PVP && window.PVP.S; return S && S.pl ? S : null; } catch (e) { return null; } };
    const BOTSTYLE = ['bouncy', 'heavy', 'sneaky', 'robotic', 'smooth', 'dramatic', 'drunk', 'retro'];
    const pvpDraw = (c, img, a, b, w, h) => {
      const S = pvpState(); if (!S) return false;
      const info = isPlayerImg(img); if (!info) return false;
      const m = c.getTransform(), tx = m.e, ty = m.f;
      if (Math.abs(a + w / 2) > 0.6 || Math.abs(b + h / 2) > 0.6) return false;   // only the centred body draw, not the dash ghost
      let pl = null, bd = 6;
      for (const p of S.pl) { if (!p || !p.alive) continue; const d = Math.abs(p.dx - tx) + Math.abs((p.dy - 4) - ty); if (d < bd) { bd = d; pl = p; } }
      if (!pl) return false;
      let st;
      if (pl.i === S.me) st = myStyle(); else st = styleFromAn(pl.look && pl.look.an) || (pl.bot ? PRESETS[BOTSTYLE[(pl.i * 7 + 3) % BOTSTYLE.length]] : PRESETS.classic);
      if (!st || st.g.bypass) return false;
      const parts = getParts(SPR[info.key]); if (!parts) return false;
      const base = info.flash ? flashParts(parts, SPR[info.key]) : parts.base; const pb = Object.assign({}, base); if (parts.blink) pb.__blink = parts.blink;
      const id = 'pv' + pl.i; let ent = ENTS.get(id); if (!ent) { ent = newEnt(id); ENTS.set(id, ent); }
      ent.seen = performance.now(); ent.pvp = pl;
      const sc = w / 10, flip = m.a < 0;
      const P = pvpAdvance(ent, st, pl, pl.dx, pl.dy, sc, S);
      P.__dx = 0; P.__dy = 0;
      const ox = (ent.kx || 0) * ent.kdir[0] * sc; P.__dx = Math.round(ox) * (flip ? -1 : 1);
      // draw into the existing (already translated / flipped) transform, and leave the root offset applied so the weapon follows the body
      c.save(); c.imageSmoothingEnabled = false;
      draw(c, ent, st, P, pb, 0, 0, sc, false, 0, true);
      c.restore();
      c.translate(Math.round((P[PI.root * 5] + P[PI.torso * 5]) * sc * 0.6), Math.round(P[PI.root * 5 + 1] * sc * 0.6));
      return true;
    };
    const pvpAdvance = (ent, st, pl, x, y, sc, S) => {
      // adapter for PvP players: movement from position, hurt flash, dash flag, shot = cooldown reset
      const m = ent.mem;
      const fake = { x, y, hp: T0(pl.hp), maxHp: T0(pl.maxHp) || 100, down: false, hw: null };
      const now = NOW(); let dt = ent.fresh ? 0.016 : now - ent.tn; if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0.016;
      ent.tn = now;
      if (ent.fresh) { ent.x = x; ent.y = y; ent.fresh = false; ent.seedT = Math.random() * 10; }
      ent.sc = sc; if (dt < 0.0015) return ent.pose;
      motion(ent, x, y, dt);
      const aim = T0(pl.aim); ent.aim = aim; ent.kdir = [Math.cos(aim), Math.sin(aim)];
      if (m.hit !== undefined && pl.hitF > 0 && !(m.hit > 0)) fire(ent, 'hurt', { sign: Math.cos(aim) > 0 ? -1 : 1, dir: [Math.cos(aim + 3.14), Math.sin(aim + 3.14)] }); m.hit = pl.hitF;
      if (m.hit === undefined) m.hit = 0;
      const cd = pl.cds ? T0(pl.cds[pl.wi]) : 0; if (m.cd !== undefined && cd > m.cd + 1 && !(pl.dashing)) { let t = 'Pistol'; try { const w = window.PVP_DATA.wdef(pl.wi === 3 ? 'ROCKET' : (pl.loadout[pl.wi] || pl.loadout[0])); t = w.t === 'melee' ? 'Melee' : w.t === 'beam' ? 'Beam' : /shotgun|spread|scatter/i.test(w.id || '') ? 'Shotgun' : w.t === 'rail' || w.t === 'proj' ? 'Rifle' : 'Pistol'; } catch (e) { /* */ } if (t !== 'Beam') fire(ent, 'shoot' + t, { dir: ent.kdir }); } m.cd = cd;
      if (pl.dashT > 0 || pl.dashing) { if (!m.dash) { fire(ent, 'dash', { sign: ent.vx >= 0 ? 1 : -1 }); m.dash = 1; } } else m.dash = 0;
      if (pl.shielding) fire(ent, 'brace'); else release(ent, 'brace');
      const ctl = { sp: ent.sp, loco: ent.sp > 14 ? (ent.sp > 235 ? 'run' : 'walk') : 'idle', foot: (e, f) => footFx(e, f, st, false) };
      if (ent.sp <= 14) { ent.idleT += dt; if (ent.idleT > ent.nextIdle) { ent.idleT = 0; ent.nextIdle = 4 + Math.random() * 5; fire(ent, Math.random() < 0.5 ? 'idleLook' : 'idleTwirl'); } } else ent.idleT = 0;
      ent.nextBlink -= dt; if (ent.blinkT > 0) ent.blinkT -= dt; if (ent.nextBlink <= 0) { ent.blinkT = 0.11; ent.nextBlink = 2 + Math.random() * 3.5; }
      return solve(ent, st, dt, ctl);
    };
    const hookCanvas = () => {
      if (pvpHooked) return; pvpHooked = true;
      const od = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img, a, b, c, d) {
        const n = arguments.length;
        if (n === 5 && c === d * 10 / 12 && img && img.width === 10 && img.height === 12 && !this.__anIn && window.PVP && window.PVP.S) {
          try { this.__anIn = 1; const done = pvpDraw(this, img, a, b, c, d); this.__anIn = 0; if (done) return; } catch (e) { this.__anIn = 0; }
        }
        return n === 3 ? od.call(this, img, a, b) : n === 5 ? od.call(this, img, a, b, c, d) : od.apply(this, arguments);
      };
    };
    hookCanvas();

    // ================================================================= PUBLIC API
    const API = window.MPANIM = {
      sprite, hand, avatar, lk, clean, styleFromAn, myStyle, mine, persist, PRESETS, PRESET_IDS, CLIPS, CLIP_ORDER, PN, PI, GSCHEMA, GORDER, EASE_NAMES, DEFG, EASE, sanitize, compact, hash, mkStyle, normAnim,
      getParts, newEnt, advance, solve, fire, release, clipPose, drawPose, draw, effDur, evalKeys, ENTS, NV, NP, IDENT0, wtype, WCACHE, lsGet, lsSet, customToStyle,
      bump: () => { MYV++; }, version: () => MYV, loadUserAnim: () => { MYU = null; mine(); },
      debug: () => ({ ents: [...ENTS.keys()], style: myStyle().id })
    };
    window.__MPANIM_CORE = { PIV, PART_ORDER };
    // ---- new emotes: keys 5-8 in a run (dance, flex, salute, laugh)
    window.addEventListener('keydown', (e) => {
      try {
        if (e.repeat) return; const i = { Digit5: 'dance', Digit6: 'flex', Digit7: 'salute', Digit8: 'laugh' }[e.code]; if (!i) return;
        const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
        const G = GG(); if (!G || !G.active) return; const ent = ENTS.get('me'); if (ent) fire(ent, i);
      } catch (x) { /* never break input */ }
    });
    // ================================================================= LOCKER: ANIMATIONS TAB
    try { Object.assign(ICON_ROWS, { lk_anim: ['..........', '.kkkkkkkk.', '.kwkwkwkk.', '.kkkkkkkk.', '.kwwkkwwk.', '.kwwkkwwk.', '.kkkkkkkk.', '.kwkwkwkk.', '.kkkkkkkk.', '..........'] }); } catch (e) { /* icons are cosmetic */ }
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const UI = { on: false, clip: 'walk', speed: 1, onion: false, playing: true, t: 0, selKey: 0, selPart: 'root', selCh: 1, dir: 1, ent: newEnt('preview'), tn: 0, raf: 0, drag: -1, tab: 'clip', hint: '' };
    UI.ent.seenForever = true;
    const CHN = ['x', 'y', 'rot', 'scale x', 'scale y'];
    const CHR = [[-9, 9, 0.1], [-9, 9, 0.1], [-180, 180, 1], [0.4, 1.8, 0.01], [0.4, 1.8, 0.01]];
    const LOCO_SP = { walk: 120, run: 200, strafe: 100, limp: 70 };
    const deep = (o) => JSON.parse(JSON.stringify(o));
    const denseToSrc = (K) => K.map((k) => {
      const pp = {};
      for (let p = 0; p < NP; p++) { let dev = false; for (let c = 0; c < NCH; c++) if (Math.abs(k.d[p * 5 + c] - IDENT0[p * 5 + c]) > 1e-4) dev = true; if (dev) { const a = []; for (let c = 0; c < NCH; c++) a.push(r2(k.d[p * 5 + c])); pp[PN[p]] = a; } }
      return k.e ? [r2(k.t), pp, k.e] : [r2(k.t), pp];
    });
    const baseSrc = (id) => denseToSrc(CLIPS[id].K);
    // making sure a custom slot is being edited (a preset is copied into a free slot the first time you touch it)
    const slotName = (i) => { const c = mine().custom[i]; return c ? c.name : ''; };
    const newSlot = (i, from, name) => {
      const a = mine(), b = from ? deep({ g: from.g, c: from.c }) : { g: {}, c: {} };
      const S = sanitize(b, name || ('Custom ' + (i + 1))); a.custom[i] = { name: S.name, g: S.g, c: S.c }; delete a.custom[i].g.bypass; return a.custom[i];
    };
    const ensureCustom = () => {
      const a = mine();
      if (/^c[0-4]$/.test(a.style) && a.custom[+a.style[1]]) return a.custom[+a.style[1]];
      let i = a.custom.findIndex((c) => !c); if (i < 0) i = 4;
      const from = myStyle(); const slot = newSlot(i, from, from.id === 'classic' ? 'Custom ' + (i + 1) : from.name + ' mod'); a.style = 'c' + i;
      UI.hint = 'Copied "' + from.name + '" into custom slot ' + (i + 1) + ' so you can edit it.';
      return slot;
    };
    const touch = () => { persist(); };
    const getKf = (create) => {
      const cc = (create ? (ensureCustom().c[UI.clip] = ensureCustom().c[UI.clip] || {}) : (curSlotC()[UI.clip] || {}));
      if (create && !cc.kf) cc.kf = baseSrc(UI.clip);
      return cc.kf || null;
    };
    const curSlotC = () => { const a = mine(); if (/^c[0-4]$/.test(a.style) && a.custom[+a.style[1]]) return a.custom[+a.style[1]].c; return myStyle().c || {}; };
    const dispKf = () => { const cc = curSlotC()[UI.clip]; return (cc && cc.kf) || baseSrc(UI.clip); };
    const invalidate = (kf) => { try { KFC.delete(kf); } catch (e) { /* */ } };

    // ---------------------------------------------------------------- the live preview
    const pvParts = () => { const cv = (typeof SPR !== 'undefined') && SPR.player; return cv ? getParts(cv) : null; };
    const setHand = (ent, P, sc) => { ent.hx = (P[PI.root * 5] + P[PI.torso * 5]) * sc; ent.hy = (P[PI.root * 5 + 1] + P[PI.aR * 5 + 1] * 0.5) * sc; ent.hwx = P[PI.wep * 5] * sc; ent.hwy = P[PI.wep * 5 + 1] * sc; ent.hr = P[PI.wep * 5 + 2]; };
    const poseAt = (S, cl, t, out) => {   // one clip on its own, as a full pose (loco clips replace, others add on top of the identity)
      clipPose(S, cl, t, out); return out;
    };
    const gunAt = (c, ent, P, x, y, sc) => {
      setHand(ent, P, sc);
      const hx = x + sc * 3.4 + ent.hx + ent.hwx, hy = y + sc * 0.6 + ent.hy + ent.hwy;
      c.save(); c.translate(hx, hy); c.rotate((ent.hr || 0) * 0.017453293);
      c.fillStyle = '#1b1b1f'; c.fillRect(-sc * 0.4, -sc * 0.35, sc * 2.2, sc * 0.8); c.fillStyle = '#8a8f98'; c.fillRect(sc * 0.1, -sc * 0.2, sc * 1.8, sc * 0.4); c.restore();
    };
    const pvFrame = () => {
      UI.raf = 0;
      const cv = $('an-prev'), modal = $('look-modal');
      if (!UI.on || !cv || !modal || modal.classList.contains('hidden')) return;
      UI.raf = requestAnimationFrame(pvFrame);
      const parts = pvParts(); if (!parts) return;
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height);
      const S = myStyle(), eng = S.g.bypass ? PRESETS.bouncy && sanitize({ g: {}, c: {} }, 'Engine') : S;
      const now = NOW(); let dt = UI.tn ? Math.min(0.05, now - UI.tn) : 0.016; UI.tn = now;
      const cl = CLIPS[UI.clip], ent = UI.ent, sc = 14, x = cv.width / 2, y = cv.height - 6 * sc - 26;
      const pb = Object.assign({}, parts.base); if (parts.blink) pb.__blink = parts.blink;
      // ground line
      c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, y + 6 * sc, cv.width, 2);
      if (S.g.bypass) { // Classic: show the plain sprite and say so
        const img = SPR.player, w = img.width * sc, h = img.height * sc;
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y + 6 * sc - 2, w * 0.38, sc * 1.4, 0, 0, 6.283); c.fill(); c.drawImage(img, x - w / 2, y - h / 2, w, h);
        c.fillStyle = '#9a8e7a'; c.font = '13px monospace'; c.textAlign = 'center'; c.fillText('Classic = no extra animation. Pick another style to preview clips.', x, 22, cv.width - 20); return;
      }
      const sp = LOCO_SP[UI.clip] || 0;
      ent.vx = sp * UI.dir * 0.8; ent.vy = 0; ent.sp = sp; ent.x = x; ent.y = y; ent.sc = sc; ent.fresh = false; ent.seen = performance.now(); ent.kdir = [UI.dir, 0]; ent.aim = UI.dir > 0 ? 0 : Math.PI; ent.seedT = ent.seedT || 1;
      ent.nextIdle = 1e9;
      let ctl = { sp, loco: LOCO_SP[UI.clip] !== undefined || UI.clip === 'idle' ? UI.clip : 'idle', foot: (e, f) => footFx(e, f, S, false) };
      if (UI.playing) {
        const pdt = dt * UI.speed;
        if (!cl.loop && !cl.hold && UI.clip !== 'idle' && !LOCO_SP[UI.clip]) {
          const L = ent.layers.find((l) => l.id === UI.clip);
          if (!L) { UI.gap = (UI.gap || 0) + pdt; if (UI.gap > 0.35) { UI.gap = 0; fire(ent, UI.clip, { sign: UI.dir, dir: [UI.dir, 0] }); } }
        } else if (cl.hold) { fire(ent, UI.clip, { sign: UI.dir, dir: [UI.dir, 0] }); }
        // drop layers that are not the chosen clip
        ent.layers = ent.layers.filter((l) => l.id === UI.clip);
        stepDust(ent, pdt);
        solve(ent, eng === S ? S : S, pdt, ctl);
        if (cl.loop || LOCO_SP[UI.clip] || UI.clip === 'idle') UI.t = LOCO_SP[UI.clip] || UI.clip === 'idle' ? ent.lph : (ent.layers[0] ? loopPh(cl, ent.layers[0].t / effDur(S, cl)) : UI.t);
        else { const L = ent.layers[0]; if (L) UI.t = Math.min(1, L.t / effDur(S, cl)); }
      } else {
        // paused: show the clip frozen at the playhead
        const Q = new Float32Array(IDENT0); const T = new Float32Array(NV);
        if (LOCO_SP[UI.clip] || UI.clip === 'idle') { clipPose(S, cl, UI.t, Q); }
        else { clipPose(S, cl, UI.t, T); for (let j = 0; j < NV; j++) Q[j] = cl.add ? IDENT0[j] + (T[j] - IDENT0[j]) : T[j]; }
        ent.pose.set(Q);
      }
      const P = ent.pose;
      // onion skin: ghosts of the clip at earlier phases
      if (UI.onion) {
        for (let n = 4; n >= 1; n--) {
          const T = new Float32Array(NV), G = new Float32Array(IDENT0); let ph = UI.t - n * 0.07; if (ph < 0) ph = cl.loop || LOCO_SP[UI.clip] ? ph + 1 : 0;
          clipPose(S, cl, ph, T); for (let j = 0; j < NV; j++) G[j] = IDENT0[j] + (T[j] - IDENT0[j]);
          G.__dx = 0; G.__dy = 0; drawPose(c, pb, G, x, y, sc, S.g, 0.07 + (4 - n) * 0.05);
        }
      }
      const kx = P[PI.dk * 5] * sc * UI.dir; P.__dx = Math.round(kx); P.__dy = 0;
      draw(c, ent, S, P, pb, x, y, sc, false);
      gunAt(c, ent, P, x, y, sc);
      drawTimeline();
    };

    // ---------------------------------------------------------------- timeline canvas
    const TLW = 560, TLH = 96;
    const drawTimeline = () => {
      const cv = $('an-tl'); if (!cv) return; const c = cv.getContext('2d'), kf = dispKf(), S = myStyle();
      c.clearRect(0, 0, TLW, TLH); c.fillStyle = '#14100c'; c.fillRect(0, 0, TLW, TLH);
      c.strokeStyle = '#2d261e'; c.lineWidth = 1; for (let i = 0; i <= 10; i++) { const xx = 10 + (TLW - 20) * i / 10; c.beginPath(); c.moveTo(xx, 4); c.lineTo(xx, TLH - 4); c.stroke(); }
      // curve of the selected channel (after the style is applied)
      const pi = PI[UI.selPart], ch = UI.selCh, T = new Float32Array(NV), cl = CLIPS[UI.clip];
      let lo = 1e9, hi = -1e9; const ys = [];
      for (let i = 0; i <= 56; i++) { clipPose(S.g.bypass ? sanitize({}, 'e') : S, cl, i / 56, T); const v = T[pi * 5 + ch]; ys.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (hi - lo < 0.2) { const m = (hi + lo) / 2; lo = m - 0.1; hi = m + 0.1; }
      const X = (t) => 10 + (TLW - 20) * t, Y = (v) => TLH - 14 - (TLH - 28) * (v - lo) / (hi - lo);
      c.strokeStyle = '#a58bc2'; c.lineWidth = 2; c.beginPath(); ys.forEach((v, i) => { const xx = X(i / 56), yy = Y(v); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }); c.stroke();
      kf.forEach((k, i) => {
        const xx = X(k[0]); const v = (k[1][UI.selPart] || [])[ch]; const yy = TLH - 8; const sel = i === UI.selKey;
        c.fillStyle = sel ? '#d9a441' : '#e8dec6'; c.beginPath(); c.moveTo(xx, yy - 6); c.lineTo(xx + 6, yy); c.lineTo(xx, yy + 6); c.lineTo(xx - 6, yy); c.closePath(); c.fill();
        if (sel) { c.strokeStyle = '#d9a441'; c.lineWidth = 1; c.beginPath(); c.moveTo(xx, 4); c.lineTo(xx, yy - 7); c.stroke(); }
      });
      c.strokeStyle = '#ff6a4a'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(UI.t), 2); c.lineTo(X(UI.t), TLH - 2); c.stroke();
      c.fillStyle = '#9a8e7a'; c.font = '11px monospace'; c.textAlign = 'left'; c.fillText(UI.selPart + ' ' + CHN[ch], 12, 12);
    };
    const tlPos = (e) => { const cv = $('an-tl'), r = cv.getBoundingClientRect(); return clamp((((e.clientX - r.left) / r.width) * TLW - 10) / (TLW - 20), 0, 1); };
    const tlDown = (e) => {
      const t = tlPos(e), kf = dispKf(); let best = -1, bd = 0.03;
      kf.forEach((k, i) => { const d = Math.abs(k[0] - t); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { UI.selKey = best; UI.drag = best; UI.playing = false; UI.t = kf[best][0]; $('an-tl').setPointerCapture && $('an-tl').setPointerCapture(e.pointerId); }
      else { UI.playing = false; UI.t = t; }
      refreshPlay(); fillKeyPanel(); e.preventDefault();
    };
    const tlMove = (e) => {
      if (UI.drag < 0) return; const kf = getKf(true), i = UI.drag; if (i <= 0 || i >= kf.length - 1) return;
      const t = clamp(tlPos(e), kf[i - 1][0] + 0.01, kf[i + 1][0] - 0.01); kf[i][0] = r2(t); UI.t = kf[i][0]; invalidate(kf); touch();
    };
    const tlUp = () => { UI.drag = -1; };

    // ---------------------------------------------------------------- panel HTML
    const pct = (v) => Math.round(v * 100) / 100;
    const sliderRow = (id, label, min, max, step, val, cls) => `<label class="an-row ${cls || ''}"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><b id="${id}-v">${pct(val)}</b></label>`;
    const clipOptions = () => { const cats = {}; CLIP_ORDER.forEach((id) => { (cats[CLIPS[id].cat] = cats[CLIPS[id].cat] || []).push(id); }); return Object.keys(cats).map((k) => `<optgroup label="${k}">` + cats[k].map((id) => `<option value="${id}" ${id === UI.clip ? 'selected' : ''}>${esc(CLIPS[id].name)}</option>`).join('') + '</optgroup>').join(''); };
    const stageHTML = () => `<div class="an-stage" id="an-stage"><canvas id="an-prev" width="320" height="300"></canvas>
      <select id="an-clip" class="an-sel">${clipOptions()}</select>
      <div class="an-ctl"><button class="btn btn-sm" id="an-play">${UI.playing ? 'Pause' : 'Play'}</button><button class="btn btn-sm ${UI.onion ? 'btn-primary' : ''}" id="an-onion">Onion skin</button><button class="btn btn-sm" id="an-dir">${UI.dir > 0 ? 'Facing right' : 'Facing left'}</button></div>
      <label class="an-row"><span>Preview speed</span><input type="range" id="an-pspeed" min="0.1" max="2" step="0.05" value="${UI.speed}"><b id="an-pspeed-v">${UI.speed}x</b></label></div>`;
    const panelHTML = () => {
      const a = mine(), S = myStyle(), cur = a.style;
      const presetBtns = PRESET_IDS.map((id) => `<button class="an-style ${cur === id ? 'sel' : ''}" data-an-style="${id}" title="${esc(PRESETS[id].desc)}"><b>${esc(PRESETS[id].name)}</b><small>${esc(PRESETS[id].desc)}</small></button>`).join('');
      const slotBtns = a.custom.map((c, i) => `<button class="an-style custom ${cur === 'c' + i ? 'sel' : ''}" data-an-style="c${i}"><b>${c ? esc(c.name) : 'Slot ' + (i + 1)}</b><small>${c ? 'custom' : 'empty: tap to start'}</small></button>`).join('');
      const isC = /^c[0-4]$/.test(cur) && a.custom[+cur[1]];
      return `<div class="an">
        <div class="an-h">Style <span class="dim">applies in-game instantly; friends see it too</span></div>
        <div class="an-styles">${presetBtns}${slotBtns}</div>
        <div class="an-hint" id="an-hint">${esc(UI.hint)}</div>
        <div class="an-tabs"><button data-an-tab="clip" class="${UI.tab === 'clip' ? 'on' : ''}">Clip + timeline</button><button data-an-tab="style" class="${UI.tab === 'style' ? 'on' : ''}">Style settings</button><button data-an-tab="tools" class="${UI.tab === 'tools' ? 'on' : ''}">Slots + share</button></div>
        <div id="an-body">${bodyHTML(S, isC)}</div></div>`;
    };
    const bodyHTML = (S, isC) => {
      if (UI.tab === 'clip') {
        const cc = S.c[UI.clip] || {}, kf = dispKf(), k = kf[clamp(UI.selKey, 0, kf.length - 1)] || kf[0], arr = (k[1][UI.selPart] || [0, 0, 0, 1, 1]).slice(); while (arr.length < 5) arr.push(arr.length > 2 ? 1 : 0);
        return `<div class="an-h">Clip: ${esc(CLIPS[UI.clip].name)}</div>
        <label class="an-row"><span>Clip amplitude</span><input type="range" id="an-ca" min="0" max="2.5" step="0.05" value="${cc.a !== undefined ? cc.a : 1}"><b id="an-ca-v">${pct(cc.a !== undefined ? cc.a : 1)}</b></label>
        <label class="an-row"><span>Clip speed</span><input type="range" id="an-cs" min="0.2" max="3" step="0.05" value="${cc.s !== undefined ? cc.s : 1}"><b id="an-cs-v">${pct(cc.s !== undefined ? cc.s : 1)}</b></label>
        <label class="an-row"><span>Clip easing</span><select id="an-ce" class="an-sel"><option value="">style / default</option>${EASE_NAMES.map((e) => `<option ${cc.e === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
        <canvas id="an-tl" width="${TLW}" height="${TLH}"></canvas>
        <div class="an-keys"><span>Keyframe ${UI.selKey + 1}/${kf.length} at ${Math.round(k[0] * 100)}%</span>
          <select id="an-kpart" class="an-sel">${PN.map((p) => `<option ${p === UI.selPart ? 'selected' : ''}>${p}</option>`).join('')}</select>
          <select id="an-kease" class="an-sel" title="easing from this key to the next">${['', ...EASE_NAMES].map((e) => `<option value="${e}" ${(k[2] || '') === e ? 'selected' : ''}>${e || 'ease: default'}</option>`).join('')}</select>
          <button class="btn btn-sm" id="an-kadd">+ Key at playhead</button><button class="btn btn-sm" id="an-kdel">Delete key</button><button class="btn btn-sm" id="an-kreset">Reset clip</button></div>
        ${CHN.map((n, c) => sliderRow('an-k' + c, n, CHR[c][0], CHR[c][1], CHR[c][2], arr[c], 'an-kc')).join('')}`;
      }
      if (UI.tab === 'style') {
        return `<div class="an-h">${esc(S.name)} <span class="dim">${isC ? 'custom' : 'preset: editing makes a copy'}</span></div>` +
          GORDER.map((k) => sliderRow('an-g-' + k, GSCHEMA[k][3], GSCHEMA[k][0], GSCHEMA[k][1], GSCHEMA[k][2], S.g[k], 'an-gp')).join('') +
          `<label class="an-row"><span>Default easing</span><select id="an-gease" class="an-sel"><option value="">per clip</option>${EASE_NAMES.map((e) => `<option ${S.g.ease === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
           <label class="an-row"><span>Snap offsets to sprite pixels</span><input type="checkbox" id="an-gsnap" ${S.g.snap ? 'checked' : ''}></label>
           <label class="an-row"><span>Blink</span><input type="checkbox" id="an-gblink" ${S.g.blink ? 'checked' : ''}></label>`;
      }
      const a = mine(), cur = a.style, slot = /^c[0-4]$/.test(cur) ? a.custom[+cur[1]] : null;
      return `<div class="an-h">Slots + sharing</div>
        <div class="an-tools"><label>Name <input id="an-name" maxlength="14" value="${slot ? esc(slot.name) : ''}" ${slot ? '' : 'disabled'} placeholder="pick a custom slot"></label>
        <div><select id="an-copysrc" class="an-sel">${PRESET_IDS.map((id) => `<option value="${id}">${esc(PRESETS[id].name)}</option>`).join('')}</select><button class="btn btn-sm" id="an-copy">Copy from preset</button></div>
        <div><button class="btn btn-sm" id="an-rand">Randomize</button><button class="btn btn-sm" id="an-reset">Reset style</button></div>
        <div><select id="an-saveto" class="an-sel">${[0, 1, 2, 3, 4].map((i) => `<option value="${i}">Slot ${i + 1}${a.custom[i] ? ' (' + esc(a.custom[i].name) + ')' : ''}</option>`).join('')}</select><button class="btn btn-sm" id="an-save">Save copy here</button></div>
        <textarea id="an-json" rows="5" spellcheck="false" placeholder="Export puts JSON here. Paste JSON and press Import to load it into the current slot."></textarea>
        <div><button class="btn btn-sm" id="an-export">Export JSON</button><button class="btn btn-sm" id="an-import">Import JSON</button></div></div>`;
    };
    const refreshPlay = () => { const b = $('an-play'); if (b) b.textContent = UI.playing ? 'Pause' : 'Play'; };
    const fillKeyPanel = () => { if (UI.tab !== 'clip') return; const body = $('an-body'); if (body) { body.innerHTML = bodyHTML(myStyle(), true); wireTimeline(); } };
    const wireTimeline = () => { const t = $('an-tl'); if (!t) return; t.addEventListener('pointerdown', tlDown); t.addEventListener('pointermove', tlMove); t.addEventListener('pointerup', tlUp); t.addEventListener('pointercancel', tlUp); };

    const CSS = `.an{padding:10px 12px 14px;font-size:13px;color:#e8dec6}.an-h{font-family:'Special Elite',monospace;color:#d9a441;font-size:15px;margin:8px 0 6px}.an-h .dim{font-family:inherit;font-size:11px;color:#9a8e7a;margin-left:6px}
    .an-styles{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}.an-style{font:inherit;text-align:left;padding:6px 8px;background:#1f1a14;border:2px solid #3a3228;border-radius:4px;color:#e8dec6;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-height:48px}
    .an-style b{font-size:12px}.an-style small{font-size:10px;color:#9a8e7a;line-height:1.2}.an-style:hover{border-color:#a58bc2}.an-style.sel{border-color:#d9a441;background:linear-gradient(180deg,#4a3d22,#2a2214)}.an-style.custom{border-style:dashed}
    .an-hint{min-height:16px;font-size:11px;color:#8fd16a;margin:4px 0}.an-tabs{display:flex;gap:4px;margin:6px 0;border-bottom:2px solid #3a3228}.an-tabs button{font:inherit;font-size:12px;font-weight:700;color:#9a8e7a;background:none;border:0;padding:6px 10px;cursor:pointer}.an-tabs button.on{color:#a58bc2;box-shadow:inset 0 -3px 0 #a58bc2}
    .an-row{display:grid;grid-template-columns:minmax(110px,170px) 1fr 44px;align-items:center;gap:8px;margin:3px 0}.an-row span{font-size:12px;color:#c9bfa8}.an-row input[type=range]{width:100%;min-width:0}.an-row b{font-size:11px;text-align:right;color:#d9a441}
    .an-sel,.an-tools input,.an-tools textarea{font:inherit;font-size:12px;background:#14100c;color:#e8dec6;border:2px solid #3a3228;border-radius:4px;padding:4px 6px;min-height:30px}.an-tools textarea{width:100%;box-sizing:border-box;font-family:monospace;font-size:11px}
    #an-tl{width:100%;height:auto;max-width:560px;display:block;background:#14100c;border:2px solid #3a3228;border-radius:4px;margin:8px 0 4px;touch-action:none;cursor:pointer}.an-keys{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0 6px}.an-keys span{font-size:11px;color:#9a8e7a}
    .an-tools{display:flex;flex-direction:column;gap:8px}.an-tools>div{display:flex;gap:6px;flex-wrap:wrap}
    .an-stage{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}#an-prev{width:100%;max-width:320px;height:auto;image-rendering:pixelated;background:radial-gradient(circle at 50% 45%,#3a3226,#17130f 75%);border:2px solid #3a3228;border-radius:6px}.an-ctl{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}.an-stage .an-row{width:100%;grid-template-columns:100px 1fr 40px}.an-stage .an-sel{width:100%;max-width:320px}
    @media(max-width:640px){#an-prev{max-width:240px}.an-row{grid-template-columns:96px 1fr 38px}}`;
    const injectCss = () => { if ($('an-css')) return; const s = document.createElement('style'); s.id = 'an-css'; s.textContent = CSS; document.head.appendChild(s); };

    // ---------------------------------------------------------------- hooking the Locker
    const decorate = () => {
      const cats = $('lk-cats'), rows = $('look-rows'); if (!cats || !rows) return;
      injectCss();
      if (!cats.querySelector('[data-an]')) cats.insertAdjacentHTML('beforeend', `<button data-an="1">${typeof iconImg === 'function' ? iconImg('lk_anim', 'icn') : ''}<span>Animate</span></button>`);
      const tab = cats.querySelector('[data-an]'); if (tab) tab.classList.toggle('on', UI.on);
      const stage = document.querySelector('#look-modal .lk-stage'), pre = $('look-preview'), poses = $('lk-poses'), tools = document.querySelector('#look-modal .lk-tools');
      if (UI.on) {
        cats.querySelectorAll('[data-cat]').forEach((b) => b.classList.remove('on'));
        if (pre) pre.style.display = 'none'; if (poses) poses.style.display = 'none'; if (tools) tools.style.display = 'none';
        if (stage && !$('an-stage')) stage.insertAdjacentHTML('afterbegin', stageHTML());
        rows.innerHTML = panelHTML(); const sp = $('look-spoon'); if (sp) sp.innerHTML = '';
        wireTimeline();
        if (!UI.raf) { UI.tn = 0; UI.raf = requestAnimationFrame(pvFrame); }
      } else {
        const st = $('an-stage'); if (st) st.remove();
        if (pre) pre.style.display = ''; if (poses) poses.style.display = ''; if (tools) tools.style.display = '';
      }
    };
    const rerender = () => { if (typeof window.mpRenderLook === 'function') window.mpRenderLook(); else decorate(); };
    const setStyle = (id) => {
      const a = mine();
      if (/^c[0-4]$/.test(id) && !a.custom[+id[1]]) newSlot(+id[1], null, 'Custom ' + (+id[1] + 1));
      a.style = id; UI.hint = ''; persist(); UI.ent.layers.length = 0; ENTS.delete('me'); rerender();
    };
    const afterSliderChange = () => { touch(); };
    const onInput = (e) => {
      const el = e.target; if (!el || !el.id || !UI.on) return;
      const out = $(el.id + '-v');
      if (el.id === 'an-pspeed') { UI.speed = +el.value; out.textContent = UI.speed + 'x'; return; }
      if (el.id === 'an-ca' || el.id === 'an-cs') { const cc = (ensureCustom().c[UI.clip] = ensureCustom().c[UI.clip] || {}); cc[el.id === 'an-ca' ? 'a' : 's'] = +el.value; out.textContent = pct(+el.value); touch(); hintUpdate(); return; }
      if (/^an-g-/.test(el.id)) { const k = el.id.slice(5), slot = ensureCustom(); slot.g[k] = k === 'steps' || k === 'rq' ? Math.round(+el.value) : +el.value; out.textContent = pct(slot.g[k]); touch(); hintUpdate(); return; }
      if (/^an-k[0-4]$/.test(el.id)) {
        const ch = +el.id[4], kf = getKf(true); const k = kf[clamp(UI.selKey, 0, kf.length - 1)]; const arr = k[1][UI.selPart] = (k[1][UI.selPart] || [0, 0, 0, 1, 1]).slice(); while (arr.length < 5) arr.push(arr.length > 2 ? 1 : 0);
        arr[ch] = +el.value; k[1][UI.selPart] = arr; out.textContent = pct(+el.value); invalidate(kf); touch(); hintUpdate(); UI.selCh = ch; return;
      }
    };
    const hintUpdate = () => { const h = $('an-hint'); if (h) h.textContent = UI.hint; const name = $('an-name'); if (name && name.disabled && /^c/.test(mine().style)) rerender(); const sel = document.querySelectorAll('.an-style'); sel.forEach((b) => b.classList.toggle('sel', b.dataset.anStyle === mine().style)); };
    const onChange = (e) => {
      const el = e.target; if (!el || !el.id || !UI.on) return;
      if (el.id === 'an-clip') { UI.clip = el.value; UI.selKey = 0; UI.t = 0; UI.ent.layers.length = 0; UI.ent.loco = 'idle'; fillKeyPanel(); return; }
      if (el.id === 'an-ce') { const cc = (ensureCustom().c[UI.clip] = ensureCustom().c[UI.clip] || {}); if (el.value) cc.e = el.value; else delete cc.e; touch(); hintUpdate(); return; }
      if (el.id === 'an-gease') { const s = ensureCustom(); if (el.value) s.g.ease = el.value; else delete s.g.ease; touch(); hintUpdate(); return; }
      if (el.id === 'an-gsnap') { ensureCustom().g.snap = el.checked ? 1 : 0; touch(); return; }
      if (el.id === 'an-gblink') { ensureCustom().g.blink = el.checked ? 1 : 0; touch(); return; }
      if (el.id === 'an-kpart') { UI.selPart = el.value; fillKeyPanel(); return; }
      if (el.id === 'an-kease') { const kf = getKf(true), k = kf[UI.selKey]; if (el.value) k[2] = el.value; else k.length = 2; invalidate(kf); touch(); return; }
      if (el.id === 'an-name') { const a = mine(), s = a.custom[+a.style[1]]; if (s) { s.name = String(el.value).replace(/[<>&"'`\\]/g, '').slice(0, 14) || 'Custom'; persist(); rerender(); } return; }
    };
    const onClick = (e) => {
      const t = e.target.closest('button,[data-an-style],[data-an-tab]'); if (!t) return;
      if (t.dataset.anStyle) { setStyle(t.dataset.anStyle); return; }
      if (t.dataset.anTab) { UI.tab = t.dataset.anTab; rerender(); return; }
      if (t.id === 'an-play') { UI.playing = !UI.playing; refreshPlay(); return; }
      if (t.id === 'an-onion') { UI.onion = !UI.onion; t.classList.toggle('btn-primary', UI.onion); return; }
      if (t.id === 'an-dir') { UI.dir = -UI.dir; t.textContent = UI.dir > 0 ? 'Facing right' : 'Facing left'; return; }
      if (t.id === 'an-kadd') {
        const kf = getKf(true), K = compile(kf, CLIPS[UI.clip].loop, true), T = new Float32Array(NV); evalKeys(K, UI.t, '', T);
        const at = r2(clamp(UI.t, 0.01, 0.99)); if (kf.some((k) => Math.abs(k[0] - at) < 0.015)) { UI.hint = 'There is already a key there. Move the playhead first.'; hintUpdate(); return; }
        kf.push(denseToSrc([{ t: at, e: '', d: T }])[0]); kf.sort((a, b) => a[0] - b[0]); UI.selKey = kf.findIndex((k) => k[0] === at); invalidate(kf); touch(); fillKeyPanel(); return;
      }
      if (t.id === 'an-kdel') { const kf = getKf(true); if (UI.selKey > 0 && UI.selKey < kf.length - 1) { kf.splice(UI.selKey, 1); UI.selKey = Math.max(0, UI.selKey - 1); invalidate(kf); touch(); fillKeyPanel(); } else { UI.hint = 'The first and last keys stay.'; hintUpdate(); } return; }
      if (t.id === 'an-kreset') { const s = ensureCustom(); delete s.c[UI.clip]; UI.selKey = 0; touch(); rerender(); return; }
      if (t.id === 'an-copy') { const id = $('an-copysrc').value, a = mine(); let i = /^c[0-4]$/.test(a.style) ? +a.style[1] : a.custom.findIndex((c) => !c); if (i < 0) i = 4; newSlot(i, PRESETS[id], a.custom[i] ? a.custom[i].name : PRESETS[id].name + ' copy'); a.style = 'c' + i; UI.hint = 'Copied ' + PRESETS[id].name + ' into slot ' + (i + 1) + '.'; persist(); rerender(); return; }
      if (t.id === 'an-rand') { const s = ensureCustom(), R = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100; s.g = Object.assign({}, DEFG, { spd: R(0.7, 1.5), amp: R(0.7, 1.7), sq: R(0, 2), ant: R(0, 1.2), fol: R(0, 1.2), hatLag: R(0, 1.6), backSway: R(0, 1.6), lean: R(0, 1.5), crouch: Math.random() < 0.3 ? R(0.3, 1) : 0, wobble: Math.random() < 0.25 ? R(0.3, 1.2) : 0, stomp: Math.random() < 0.3 ? R(0.3, 1.2) : 0, dust: R(0, 1.5), trail: Math.random() < 0.4 ? R(0.1, 0.8) : 0, shadow: R(0, 1.5), steps: Math.random() < 0.3 ? [2, 3, 4, 6][Math.random() * 4 | 0] : 0, snap: Math.random() < 0.3 ? 1 : 0, ease: Math.random() < 0.6 ? EASE_NAMES[Math.random() * (EASE_NAMES.length - 1) | 0] : '' }); delete s.g.bypass; if (!s.g.ease) delete s.g.ease; s.c = {}; ['walk', 'run', 'idle', 'shootPistol', 'hurt', 'dash'].forEach((id) => { s.c[id] = { a: R(0.5, 1.8), s: R(0.6, 1.6) }; }); UI.hint = 'Randomized. Not happy? Press again.'; touch(); rerender(); return; }
      if (t.id === 'an-reset') { const s = ensureCustom(); s.g = Object.assign({}, DEFG); delete s.g.bypass; s.c = {}; UI.hint = 'Style reset to engine defaults.'; touch(); rerender(); return; }
      if (t.id === 'an-save') { const a = mine(), i = +$('an-saveto').value, src = myStyle(); newSlot(i, src, src.name + (src.id === 'classic' ? '' : '')); a.style = 'c' + i; UI.hint = 'Saved to slot ' + (i + 1) + '.'; persist(); rerender(); return; }
      if (t.id === 'an-export') { const s = myStyle(), c = compact(s, 0); $('an-json').value = JSON.stringify({ mpanim: 1, name: s.name, g: JSON.parse(c.s).g || {}, c: JSON.parse(c.s).c || {} }); $('an-json').select(); try { document.execCommand('copy'); } catch (er) { /* */ } return; }
      if (t.id === 'an-import') { try { const j = JSON.parse($('an-json').value), a = mine(); if (!j || typeof j !== 'object') throw 0; let i = /^c[0-4]$/.test(a.style) ? +a.style[1] : a.custom.findIndex((c) => !c); if (i < 0) i = 4; const S = sanitize(j, j.name); a.custom[i] = { name: S.name, g: S.g, c: S.c }; delete a.custom[i].g.bypass; a.style = 'c' + i; UI.hint = 'Imported into slot ' + (i + 1) + '.'; persist(); rerender(); } catch (er) { UI.hint = 'That is not valid animation JSON.'; hintUpdate(); } return; }
    };
    const origRender = window.mpRenderLook;
    if (typeof origRender === 'function' && !origRender.__an) {
      window.mpRenderLook = function () { const r = origRender.apply(this, arguments); try { decorate(); } catch (e) { console.warn('[anim] locker', e); } return r; };
      window.mpRenderLook.__an = true;
    }
    const origOpen = window.openLook;
    if (typeof origOpen === 'function' && !origOpen.__an) {
      window.openLook = function () { UI.on = false; const r = origOpen.apply(this, arguments); try { mine(); } catch (e) { /* */ } return r; };
      window.openLook.__an = true;
    }
    (() => {
      const lm = $('look-modal'), cats = $('lk-cats'); if (!lm) return;
      if (cats) cats.addEventListener('click', (e) => { const an = e.target.closest('[data-an]'); if (an) { e.stopPropagation(); UI.on = true; rerender(); return; } if (e.target.closest('[data-cat]')) { UI.on = false; } }, true);
      lm.addEventListener('click', onClick); lm.addEventListener('input', onInput); lm.addEventListener('change', onChange);
      new MutationObserver(() => { if (lm.classList.contains('hidden')) UI.on = false; }).observe(lm, { attributes: true, attributeFilter: ['class'] });
    })();
    Object.assign(API, { UI, setStyle, ensureCustom, rerender });
  } catch (err) { console.error('[anim] init failed', err); }
})();
