/* [studio] Runtime for the Studio page (admin-studio.html). Loaded LAST, shares the main script's global lexical scope.
   - reads siteconfig/shop + siteconfig/theme from the CopperChat project (public read), caches the last good copy in localStorage
   - applies theme (CSS variables, fonts, hidden tiles, sanitised custom CSS) and shop overrides (prices, hidden/disabled items, pinned deal, features)
   - answers the Studio page's live preview (postMessage, same-origin parent only)
   - adds ADMIN_PERMS.studio and an "Open Studio" button to the admin panel
   Hooks in Mineplacer2.html: dealId (pinned deal), bmItems (market stock), admSetAdmin (writes the studio flag onto mp_admins). */
(function () {
    'use strict';
    try {
        const LS = 'mp_studio_cfg_v1';
        const S = window.STUDIO = window.STUDIO || {};
        S.hidden = new Set(); S.disabled = new Set(); S.deal = ''; S.mktN = 3; S.features = {}; S.shop = null; S.theme = null;

        // ---------------------------------------------------------------- permission label (shows in the co-admin permission editor)
        try { if (typeof ADMIN_PERMS === 'object' && ADMIN_PERMS && !ADMIN_PERMS.studio) ADMIN_PERMS.studio = 'Access the Studio page (leaderboard, shop and UI editing)'; } catch (e) { /* ok */ }

        // ---------------------------------------------------------------- validation helpers (a bad config must never break the game)
        const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
        const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
        const KINDS = { W: 'WEAPON_DATA', A: 'ABILITY_DATA', B: 'BOOST_DATA', S: 'SUPPLY_DATA', K: 'SKILLS' };
        const PRICE_FIELD = { W: 'unlock', A: 'cost', B: 'scraps', S: 'price', K: 'c' };
        const tbl = (k) => { try { return ({ W: () => WEAPON_DATA, A: () => ABILITY_DATA, B: () => BOOST_DATA, S: () => SUPPLY_DATA, K: () => SKILLS })[k](); } catch (e) { return null; } };
        const keyOk = (k) => typeof k === 'string' && /^[WABSK]:[A-Za-z0-9_\-]{1,40}$/.test(k);
        const FEATURES = ['forge', 'modes', 'market'];
        const cleanShop = (c) => {
            const o = { mult: 1, skillMult: 1, prices: {}, hidden: [], disabled: [], deal: '', mktN: 3, features: {} };
            if (!isObj(c)) return o;
            o.mult = num(c.mult, 0.1, 10, 1); o.skillMult = num(c.skillMult, 0.1, 10, 1);
            if (isObj(c.prices)) Object.keys(c.prices).slice(0, 600).forEach((k) => { if (keyOk(k)) { const n = Number(c.prices[k]); if (Number.isFinite(n) && n >= 1 && n <= 1e9) o.prices[k] = Math.round(n); } });
            ['hidden', 'disabled'].forEach((f) => { if (Array.isArray(c[f])) o[f] = c[f].filter(keyOk).slice(0, 600); });
            if (typeof c.deal === 'string' && /^[A-Za-z0-9_\-]{1,40}$/.test(c.deal)) o.deal = c.deal;
            o.mktN = Math.round(num(c.mktN, 1, 6, 3));
            if (isObj(c.features)) FEATURES.forEach((f) => { if (c.features[f] === false) o.features[f] = false; });
            return o;
        };

        const FONTS = {
            special: "'Special Elite','Courier New',monospace", courier: "'Courier Prime','Courier New',monospace", mono: "'Courier New',Courier,monospace",
            system: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", serif: "Georgia,'Times New Roman',serif",
            press: "'Press Start 2P','Courier New',monospace", vt323: "'VT323','Courier New',monospace", silkscreen: "'Silkscreen','Courier New',monospace"
        };
        const GFONT = { press: 'Press+Start+2P', vt323: 'VT323', silkscreen: 'Silkscreen' };
        const VARS = ['--bg', '--panel', '--panel-2', '--line', '--ink', '--dim', '--mustard', '--rust', '--olive', '--blood', '--violet', '--steel', '--card-1', '--card-2', '--glow'];
        const TILES = {
            party: '.tile[onclick*="openParty"]', forge: '.tile[onclick*="openForge"]', modes: '.tile[onclick*="openModes"]', skills: '.tile[onclick*="openSkills"]',
            locker: '.tile[onclick*="openLook"]', friends: '.tile[onclick*="openFriends"]', daily: '.tile[onclick*="openChallenges"]', horde: '.tile[onclick*="openMutator"]', news: '.tile[onclick*="openNews"]'
        };
        const NAV = { shop: 'openShop', forge: 'openForge', modes: 'openModes', skills: 'openSkills', locker: 'openLook', friends: 'openFriends', settings: 'openSettings', admin: 'openAdmin' };
        const PATTERNS = {
            none: '',
            grid: 'linear-gradient(rgba(255,244,214,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,244,214,.035) 1px,transparent 1px)',
            dots: 'radial-gradient(rgba(255,244,214,.07) 1px,transparent 1.5px)',
            stripes: 'repeating-linear-gradient(45deg,rgba(0,0,0,.18) 0 8px,transparent 8px 16px)',
            noise: 'radial-gradient(rgba(255,244,214,.05) 1px,transparent 1px),radial-gradient(rgba(0,0,0,.25) 1px,transparent 1px)'
        };
        const PSIZE = { grid: '28px 28px', dots: '16px 16px', stripes: 'auto', noise: '7px 7px,11px 11px' };
        const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|[a-zA-Z]{3,20})$/;

        // custom CSS sanitiser: strips @import, expression(), javascript:, behaviour hooks, and every url() that is not https or an inline image
        const sanitizeCss = (css) => {
            css = String(css == null ? '' : css).slice(0, 20480);
            css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<\/?\s*style[^>]*>/gi, '').replace(/[<>]/g, '').replace(/\\/g, '');
            css = css.replace(/@import[^;]*;?/gi, '').replace(/@charset[^;]*;?/gi, '').replace(/expression\s*\(/gi, '(').replace(/javascript\s*:/gi, '').replace(/vbscript\s*:/gi, '')
                .replace(/-moz-binding\s*:[^;}]*/gi, '').replace(/behavior\s*:[^;}]*/gi, '');
            css = css.replace(/url\(\s*(['"]?)\s*([^)'"]*)\1\s*\)/gi, (m, q, u) => (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u) || /^https:\/\/[^\s]+$/i.test(u)) ? m : 'none');
            return css;
        };
        const cleanTheme = (c) => {
            const o = { vars: {}, font: '', headFont: '', radius: null, scale: 100, density: 'comfy', navPos: 'bottom', pattern: 'none', hideTiles: [], navOrder: [], css: '' };
            if (!isObj(c)) return o;
            if (isObj(c.vars)) VARS.forEach((k) => { const v = c.vars[k]; if (typeof v === 'string' && COLOR_RE.test(v.trim())) o.vars[k] = v.trim(); });
            if (FONTS[c.font]) o.font = c.font; if (FONTS[c.headFont]) o.headFont = c.headFont;
            if (c.radius !== null && c.radius !== undefined && c.radius !== '') o.radius = Math.round(num(c.radius, 0, 16, 6));
            o.scale = Math.round(num(c.scale, 90, 115, 100));
            o.density = c.density === 'compact' ? 'compact' : 'comfy';
            o.navPos = c.navPos === 'top' ? 'top' : 'bottom';
            o.pattern = PATTERNS[c.pattern] !== undefined ? c.pattern : 'none';
            if (Array.isArray(c.hideTiles)) o.hideTiles = c.hideTiles.filter((k) => TILES[k]).slice(0, 12);
            if (Array.isArray(c.navOrder)) o.navOrder = c.navOrder.filter((k) => NAV[k]).slice(0, 12);
            o.css = sanitizeCss(c.css);
            return o;
        };
        const themeCss = (t) => {
            let css = '';
            const v = Object.assign({}, t.vars);
            if (t.radius !== null) { v['--r'] = t.radius + 'px'; v['--r-sm'] = Math.max(0, Math.round(t.radius / 2)) + 'px'; }
            const vk = Object.keys(v); if (vk.length) css += ':root{' + vk.map((k) => k + ':' + v[k]).join(';') + '}\n';
            if (t.font) css += 'body,input,select,textarea,button{font-family:' + FONTS[t.font] + '}\n';
            if (t.headFont) css += 'h1,h2,h3,.head,.brand,.pill,.btn,.tile .nl,#deploy-btn,.item-name,.rib{font-family:' + FONTS[t.headFont] + ' !important}\n';
            if (t.pattern !== 'none') css += 'body{background-image:' + PATTERNS[t.pattern] + ';background-size:' + PSIZE[t.pattern] + ';background-attachment:fixed}\n';
            if (t.scale !== 100) css += 'body #lobby-screen,body .overlay>.panel{zoom:' + (t.scale / 100) + '}\n';
            if (t.density === 'compact') css += 'body .navbar{padding:4px;gap:4px;margin-top:8px}body .tile.nav{min-height:48px;padding:4px 2px}body .item{padding-top:22px;gap:3px}body .hud{padding-top:2px;padding-bottom:2px}body .overlay>.panel{padding:12px}\n';
            if (t.navPos === 'top') css += 'body #lobby-screen:not(.hidden){display:flex;flex-direction:column}body #lobby-screen .hud{order:0}body #lobby-screen .navbar{order:1;margin:8px 0}body #lobby-screen .lobby-grid{order:2}\n';
            if (t.hideTiles.length) css += t.hideTiles.map((k) => TILES[k]).join(',') + '{display:none !important}\n';
            t.navOrder.forEach((k, i) => { css += '.navbar .tile[onclick*="' + NAV[k] + '"]{order:' + (i + 1) + '}\n'; });
            if (t.css) css += t.css + '\n';
            return css;
        };

        // ---------------------------------------------------------------- applying the theme
        let styleEl = null, linkEl = null;
        const applyTheme = (raw) => {
            try {
                const t = cleanTheme(raw); S.theme = t;
                if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'studio-theme'; (document.head || document.documentElement).appendChild(styleEl); }
                styleEl.textContent = themeCss(t);
                const gf = [t.font, t.headFont].filter((f) => GFONT[f]).map((f) => 'family=' + GFONT[f]);
                if (gf.length) {
                    const href = 'https://fonts.googleapis.com/css2?' + gf.join('&') + '&display=swap';
                    if (!linkEl) { linkEl = document.createElement('link'); linkEl.rel = 'stylesheet'; document.head.appendChild(linkEl); }
                    if (linkEl.getAttribute('href') !== href) linkEl.setAttribute('href', href);
                } else if (linkEl) { linkEl.remove(); linkEl = null; }
            } catch (e) { console.warn('[studio] theme', e); }
        };

        // ---------------------------------------------------------------- applying shop overrides (originals are remembered so every apply starts clean)
        const ORIG = {};   // 'W:ID' -> original price
        const origOf = (k) => {
            const kind = k[0], id = k.slice(2), T = tbl(kind); if (!T || !T[id]) return null;
            if (!(k in ORIG)) ORIG[k] = T[id][PRICE_FIELD[kind]];
            return ORIG[k];
        };
        const priceNow = (k) => { const T = tbl(k[0]); return T && T[k.slice(2)] ? T[k.slice(2)][PRICE_FIELD[k[0]]] : null; };
        const setPrice = (k, n) => { const T = tbl(k[0]); if (T && T[k.slice(2)]) T[k.slice(2)][PRICE_FIELD[k[0]]] = n; };
        const featureCss = () => {
            let css = '';
            if (S.features.forge === false) css += TILES.forge + '{display:none !important}\n';
            if (S.features.modes === false) css += TILES.modes + '{display:none !important}\n';
            if (S.features.market === false) css += '#tab-market{display:none !important}\n';
            return css;
        };
        const applyShop = (raw) => {
            try {
                const c = cleanShop(raw); S.shop = c;
                ['W', 'A', 'B', 'S', 'K'].forEach((kind) => {
                    const T = tbl(kind); if (!T) return;
                    Object.keys(T).forEach((id) => {
                        const k = kind + ':' + id, o = origOf(k); if (o === null || typeof o !== 'number') return;
                        let n = o;
                        if (kind === 'W' && o <= 0) n = o;   // starter weapons stay free
                        else if (k in c.prices) n = c.prices[k];
                        else if (kind === 'K') n = Math.max(1, Math.round(o * c.skillMult));
                        else n = Math.max(1, Math.round(o * c.mult));
                        if (kind === 'W' && o <= 0) n = o;
                        setPrice(k, n);
                    });
                });
                S.hidden = new Set(c.hidden); S.disabled = new Set(c.disabled); S.deal = c.deal; S.mktN = c.mktN; S.features = c.features;
                let fe = document.getElementById('studio-feat');
                if (!fe) { fe = document.createElement('style'); fe.id = 'studio-feat'; document.head.appendChild(fe); }
                fe.textContent = featureCss();
                refreshUi();
            } catch (e) { console.warn('[studio] shop', e); }
        };
        const refreshUi = () => {
            try { const sh = document.getElementById('shop-screen') || document.getElementById('shop-modal'); if (typeof renderShop === 'function' && sh && !sh.classList.contains('hidden') && typeof currentUserData !== 'undefined' && currentUserData) renderShop(); } catch (e) { /* not ready */ }
            try { if (typeof refreshLobbyStats === 'function' && typeof currentUserData !== 'undefined' && currentUserData) refreshLobbyStats(); } catch (e) { /* not ready */ }
        };

        // hide/disable cards after the shop renders (the renderers stay untouched)
        const BUYFN = /\b(buyWeapon|buyAbility|buyBoost|buySupply|buyMarket)\('([^']+)'\)/;
        const BUYKEY = { buyWeapon: 'W:', buyAbility: 'A:', buyBoost: 'B:', buySupply: 'S:', buyMarket: '' };
        const keyOfCall = (fn, id) => BUYKEY[fn] + id;
        const REVOKED = new Set();   // weapon ids the studio has taken away from everybody: they cannot be bought back
        const isHiddenKey = (k) => S.hidden.has(k) || (k[0] === 'W' && k[1] === ':' && (REVOKED.has(k.slice(2)) || !!(BAL.w[k.slice(2)] && BAL.w[k.slice(2)].off)));
        const isBlockedKey = (k) => isHiddenKey(k) || S.disabled.has(k);
        const postShop = () => {
            const grid = document.getElementById('shop-grid'); if (!grid) return;
            grid.querySelectorAll('[onclick]').forEach((b) => {
                const m = BUYFN.exec(b.getAttribute('onclick') || ''); if (!m) return;
                const key = keyOfCall(m[1], m[2]), card = b.closest('.item');
                if (isHiddenKey(key)) { if (card) card.remove(); }
                else if (S.disabled.has(key)) { b.disabled = true; b.removeAttribute('onclick'); b.title = 'Unavailable right now'; if (card && !card.querySelector('.lock-ov')) { card.insertAdjacentHTML('beforeend', '<div class="lock-ov">UNAVAILABLE</div>'); } }
            });
        };
        const wrapShop = () => {
            const o = window.mpRenderShop;
            if (typeof o === 'function' && !o.__studio) { const w = function () { const r = o.apply(this, arguments); try { postShop(); } catch (e) { /* ok */ } return r; }; w.__studio = true; window.mpRenderShop = w; }
            ['buyWeapon', 'buyAbility', 'buyBoost', 'buySupply', 'buyMarket'].forEach((fn) => {
                const f = window[fn]; if (typeof f !== 'function' || f.__studio) return;
                const w = function (id) {
                    const k = keyOfCall(fn, id);
                    if (isBlockedKey(k)) { try { toast('That item is not available right now.'); } catch (e) { /* ok */ } return; }
                    return f.apply(this, arguments);
                };
                w.__studio = true; window[fn] = w;
            });
            { const f = window.toggleEquip; if (typeof f === 'function' && !f.__studio) { const w = function (id) { const x = BAL.w[id]; if (x && x.off && !(currentUserData && (currentUserData.loadout || []).includes(id))) { try { toast('That weapon is disabled right now.'); } catch (e) { /* ok */ } return; } return f.apply(this, arguments); }; w.__studio = true; window.toggleEquip = w; } }
            [['openForge', 'forge'], ['openModes', 'modes']].forEach(([fn, feat]) => {
                const f = window[fn]; if (typeof f !== 'function' || f.__studio) return;
                const w = function () { if (S.features[feat] === false) { try { toast('That is closed for now.'); } catch (e) { /* ok */ } return; } return f.apply(this, arguments); };
                w.__studio = true; window[fn] = w;
            });
        };

        // ---------------------------------------------------------------- admin panel button
        const addAdminButton = () => {
            const panel = document.querySelector('#admin-modal .adm-panel'); if (!panel || document.getElementById('adm-studio-bar')) return;
            const bar = document.createElement('div'); bar.id = 'adm-studio-bar'; bar.setAttribute('data-perm', 'studio');
            bar.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px';
            bar.innerHTML = '<a class="btn btn-primary btn-sm" style="width:auto;text-decoration:none;display:inline-block" href="admin-studio.html" target="_blank" rel="noopener">Open Studio</a><span class="small dim">Edit the leaderboard, shop prices and the look of the game.</span>';
            panel.insertBefore(bar, document.getElementById('adm-tabs') || panel.querySelector('.adm-cols'));
            if (typeof applyAdminPerms === 'function') { try { applyAdminPerms(); } catch (e) { /* ok */ } }
        };


        // ---------------------------------------------------------------- weapon balance: multipliers from remembered originals, hit cap + PvP flags for other scripts
        const WM = new WeakMap();   // weapon object -> { orig:{dmg,cooldown,radius,count}, set:{...last values we wrote} }
        const BID = /^[A-Za-z0-9_]{1,40}$/;
        const cleanBalance = (c) => {
            const o = { w: {} }; if (!isObj(c) || !isObj(c.w)) return o;
            Object.keys(c.w).slice(0, 800).forEach((id) => {
                if (!BID.test(id) || !isObj(c.w[id])) return; const r = c.w[id], x = {};
                const m = (k, lo, hi) => { const v = Number(r[k]); if (Number.isFinite(v) && Math.abs(v - 1) > 1e-6) x[k] = Math.min(hi, Math.max(lo, v)); };
                m('dmg', 0, 10); m('cd', 0.1, 10); m('rad', 0.1, 5); m('cnt', 1, 10);
                const cap = Number(r.cap); if (Number.isFinite(cap) && cap >= 1 && cap <= 100) x.cap = Math.round(cap);
                if (r.pvpOff === true) x.pvpOff = true; if (r.off === true) x.off = true;
                if (Object.keys(x).length) o.w[id] = x;
            });
            return o;
        };
        let BAL = { w: {} };
        const wd = () => { try { return WEAPON_DATA; } catch (e) { return null; } };
        const FIELDS = [['dmg', 'dmg'], ['cooldown', 'cd'], ['radius', 'rad'], ['count', 'cnt']];
        const origW = (obj) => {
            let r = WM.get(obj); if (!r) { r = { orig: {}, set: {} }; WM.set(obj, r); }
            FIELDS.forEach(([f]) => { if (typeof obj[f] === 'number' && (!(f in r.orig) || (f in r.set && obj[f] !== r.set[f]))) r.orig[f] = obj[f]; });   // something else changed it: that is the new original
            return r;
        };
        const applyBalance = (raw) => {
            try {
                if (raw !== undefined) { BAL = cleanBalance(raw); S.balanceCfg = BAL; }
                const T = wd(); if (!T) return;
                Object.keys(T).forEach((id) => {
                    const obj = T[id]; if (!isObj(obj)) return;
                    const x = BAL.w[id], r = origW(obj);
                    if (!x && !Object.keys(r.set).length) return;
                    const mul = { dmg: x ? (x.off ? 0 : (x.dmg === undefined ? 1 : x.dmg)) : 1, cooldown: x && x.cd || 1, radius: x && x.rad || 1, count: x && x.cnt || 1 };
                    FIELDS.forEach(([f]) => {
                        if (!(f in r.orig)) return;
                        let v = r.orig[f] * mul[f]; if (f === 'count') v = Math.max(1, Math.round(v)); else v = Math.round(v * 100) / 100;
                        if (obj[f] !== v) obj[f] = v; r.set[f] = v;
                    });
                    if (!x) r.set = {};
                });
            } catch (e) { console.warn('[studio] balance', e); }
        };
        S.balance = {
            hitCap: (id) => { const x = BAL.w[id]; return x && x.cap ? x.cap / 100 : 0; },        // fraction of the target's max HP one hit may do (0 = no studio cap)
            pvpOff: (id) => !!(BAL.w[id] && BAL.w[id].pvpOff),
            off: (id) => !!(BAL.w[id] && BAL.w[id].off),
            has: (id) => !!BAL.w[id],                                                           // true when the studio has an override for this weapon (it then beats the default instant-kill nerf, even for CW_*)
            mult: (id) => { const x = BAL.w[id] || {}; return { dmg: x.off ? 0 : (x.dmg === undefined ? 1 : x.dmg), cd: x.cd || 1, rad: x.rad || 1, cnt: x.cnt || 1 }; }
        };

        // ---------------------------------------------------------------- revoking weapons (single player via cmds, everybody via siteconfig/revoked)
        let REV = { ids: [], vers: {}, ref: {}, restored: {} };
        const cleanRevoked = (c) => {
            const o = { ids: [], vers: {}, ref: {}, restored: {} }; if (!isObj(c)) return o;
            if (Array.isArray(c.ids)) o.ids = c.ids.filter((i) => typeof i === 'string' && BID.test(i)).slice(0, 100);
            ['vers', 'restored'].forEach((f) => { if (isObj(c[f])) Object.keys(c[f]).slice(0, 200).forEach((i) => { const n = Number(c[f][i]); if (BID.test(i) && Number.isFinite(n) && n >= 0 && n < 1e9) o[f][i] = Math.floor(n); }); });
            if (isObj(c.ref)) Object.keys(c.ref).slice(0, 200).forEach((i) => { if (BID.test(i)) o.ref[i] = c.ref[i] === 'sell' ? 'sell' : 'none'; });
            return o;
        };
        const starter = (id) => { const T = wd(); return !/^CW_/.test(id) && T && T[id] && origOf('W:' + id) <= 0; };
        // returns { had, refund } and changes the in-memory account; the caller saves
        const takeWeapon = (u, id, refundMode, scraps) => {
            const had = Array.isArray(u.unlocked) && u.unlocked.includes(id);
            u.unlocked = (u.unlocked || []).filter((x) => x !== id);
            u.loadout = (u.loadout || []).filter((x) => x !== id);
            if (u.weaponLevels) delete u.weaponLevels[id];
            if (!u.loadout.length && u.unlocked.includes('MINES')) u.loadout.push('MINES');
            let refund = 0;
            if (had && refundMode === 'sell') { const p = origOf('W:' + id); refund = Math.floor((typeof p === 'number' ? p : 0) * 0.4); u.cash = (u.cash || 0) + refund; }
            else if (had && refundMode === 'scraps') { refund = Math.max(0, Math.min(100000, Math.floor(Number(scraps) || 0))); u.scraps = (u.scraps || 0) + refund; }
            return { had, refund };
        };
        const afterAccountChange = () => {
            try { const sh = document.getElementById('shop-modal') || document.getElementById('shop-screen'); if (typeof renderShop === 'function' && sh && !sh.classList.contains('hidden')) renderShop(); } catch (e) { /* ok */ }
            try { refreshLobbyStats(); } catch (e) { /* ok */ }
        };
        try {
            if (typeof CMDS === 'object' && CMDS) {
                CMDS.revoke = (a) => {
                    const u = currentUserData; if (!u || !isObj(a) || !BID.test(String(a.id || '')) || starter(a.id)) return;
                    const r = takeWeapon(u, a.id, a.refund === 'sell' || a.refund === 'scraps' ? a.refund : 'none', a.scraps);
                    save({ unlocked: u.unlocked, loadout: u.loadout, weaponLevels: u.weaponLevels || {}, cash: u.cash, scraps: u.scraps }); afterAccountChange();
                    if (r.had) toast('An admin removed a weapon from your account' + (r.refund ? ' (refunded ' + r.refund + ')' : '') + '.');
                };
                CMDS.restore = (a) => {
                    const u = currentUserData; if (!u || !isObj(a) || !BID.test(String(a.id || ''))) return;
                    if (!u.unlocked.includes(a.id)) u.unlocked.push(a.id);
                    save({ unlocked: u.unlocked }); afterAccountChange(); toast('An admin gave a weapon back to you.');
                };
            }
        } catch (e) { console.warn('[studio] cmds', e); }
        let rvBusy = false;
        const applyRevoked = () => {
            try {
                const u = typeof currentUserData !== 'undefined' ? currentUserData : null;
                if (rvBusy || !u || !Array.isArray(u.unlocked) || (typeof g !== 'undefined' && g && g.active)) return;
                if (!REV.ids.length && !Object.keys(REV.restored).length) return;
                rvBusy = true;
                if (!isObj(u.rvk)) u.rvk = {};
                let changed = false, refunded = 0, lost = 0, back = 0;
                REV.ids.forEach((id) => {
                    const v = REV.vers[id] || 1, st = u.rvk[id] || {}; if ((st.v || 0) >= v || starter(id)) return;
                    const r = takeWeapon(u, id, REV.ref[id] || 'none'); refunded += r.refund; if (r.had) lost++;
                    u.rvk[id] = { v, lost: r.had ? 1 : 0, r: st.r || 0 }; changed = true;
                });
                Object.keys(REV.restored).forEach((id) => {
                    const rv = REV.restored[id], st = u.rvk[id]; if (!st || !st.lost || (st.r || 0) >= rv) return;
                    if (!u.unlocked.includes(id)) u.unlocked.push(id); st.lost = 0; st.r = rv; changed = true; back++;
                });
                if (changed) {
                    save({ unlocked: u.unlocked, loadout: u.loadout, weaponLevels: u.weaponLevels || {}, cash: u.cash, scraps: u.scraps, rvk: u.rvk }); afterAccountChange();
                    if (lost) toast('An admin removed ' + lost + ' weapon' + (lost > 1 ? 's' : '') + ' from your account' + (refunded ? ' (refunded $' + refunded + ')' : '') + '.');
                    if (back) toast('A weapon was given back to you.');
                }
            } catch (e) { console.warn('[studio] revoked', e); }
            rvBusy = false;
        };
        const applyRevokedDoc = (raw) => { REV = cleanRevoked(raw); REVOKED.clear(); REV.ids.forEach((i) => REVOKED.add(i)); applyRevoked(); refreshUi(); };

        // ---------------------------------------------------------------- layout (Designer): presentation-only overrides keyed by stable element ids + added blocks
        const L = S.layout = { cfg: { ov: {}, blocks: [] }, NODE: new Map(), onApplied: null };
        const SIDK = /^(?:[a-z0-9]{3,12}|blk:[a-z0-9]{1,10})$/;
        const ACTS = { shop: 'openShop', forge: 'openForge', modes: 'openModes', skills: 'openSkills', locker: 'openLook', friends: 'openFriends', settings: 'openSettings', party: 'openParty', daily: 'openChallenges', news: 'openNews', horde: 'openMutator', play: 'startMission' };
        const BTYPES = ['text', 'button', 'image', 'banner', 'countdown', 'ticker', 'clone'];
        const SHADOWS = { none: 'none', soft: '0 4px 12px rgba(0,0,0,.45)', hard: '4px 4px 0 #0a0908', glow: '0 0 14px rgba(217,164,65,.6)' };
        const colOk = (v) => typeof v === 'string' && COLOR_RE.test(v.trim());
        const nz = (v, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : null; };
        const str = (v, n) => String(v == null ? '' : v).replace(/[<>\u0000-\u001f]/g, '').slice(0, n);
        const urlOk = (u) => typeof u === 'string' && u.length <= 400 && (/^https:\/\/[^\s"'<>()]+$/i.test(u) || /^data:image\/(png|gif|webp|jpeg);base64,[A-Za-z0-9+\/=]{1,9000}$/.test(u));
        const cleanLayout = (c) => {
            const o = { ov: {}, blocks: [] }; if (!isObj(c)) return o;
            try { if (JSON.stringify(c).length > 50000) return o; } catch (e) { return o; }
            if (Array.isArray(c.blocks)) c.blocks.slice(0, 40).forEach((b) => {
                if (!isObj(b) || !/^[a-z0-9]{1,10}$/.test(b.id || '') || BTYPES.indexOf(b.type) < 0 || o.blocks.some((x) => x.id === b.id)) return;
                const x = { id: b.id, type: b.type };
                if (b.type === 'text' || b.type === 'button' || b.type === 'banner' || b.type === 'ticker') x.text = str(b.text, 200);
                if (b.type === 'button') { x.action = ACTS[b.action] || b.action === 'link' ? b.action : 'shop'; if (x.action === 'link') x.url = /^https:\/\/[^\s"'<>]{1,300}$/i.test(b.url || '') ? b.url : ''; }
                if (b.type === 'image') { x.src = urlOk(b.src) ? b.src : (/^[a-z_]{2,24}$/.test(b.src || '') ? b.src : ''); x.alt = str(b.alt, 60); }
                if (b.type === 'countdown') { x.label = str(b.label, 60); x.until = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(b.until || '') ? b.until : ''; }
                if (b.type === 'clone') { if (!SIDK.test(b.of || '')) return; x.of = b.of; }
                o.blocks.push(x);
            });
            if (isObj(c.ov)) Object.keys(c.ov).slice(0, 400).forEach((k) => {
                if (!SIDK.test(k) || !isObj(c.ov[k])) return; const r = c.ov[k], x = {};
                if (typeof r.t === 'string') x.t = str(r.t, 200);
                if (typeof r.hd === 'string') x.hd = r.hd.replace(/[^dtp]/g, '').slice(0, 3);
                if (isObj(r.st)) {
                    const s = r.st, y = {};
                    ['c', 'bg', 'bc'].forEach((p) => { if (colOk(s[p])) y[p] = s[p].trim(); });
                    [['bw', 0, 8], ['fs', 8, 90], ['br', 0, 64], ['pd', 0, 80], ['mg', -40, 80], ['w', 8, 1400], ['h', 8, 1400], ['rot', -45, 45], ['ls', -2, 12]].forEach(([p, lo, hi]) => { const n = nz(s[p], lo, hi); if (n !== null) y[p] = n; });
                    if (s.op !== undefined) { const n = Number(s.op); if (Number.isFinite(n)) y.op = Math.min(1, Math.max(0, Math.round(n * 100) / 100)); }
                    if (FONTS[s.ff]) y.ff = s.ff; if (SHADOWS[s.sh]) y.sh = s.sh;
                    if (['left', 'center', 'right'].indexOf(s.ta) >= 0) y.ta = s.ta; if (s.fw === 'bold' || s.fw === 'normal') y.fw = s.fw;
                    if (Object.keys(y).length) x.st = y;
                }
                if (isObj(r.mv) && SIDK.test(r.mv.to || '')) { x.mv = { to: r.mv.to, i: nz(r.mv.i, 0, 100000) || 0 }; if (SIDK.test(r.mv.before || '')) x.mv.before = r.mv.before; }
                if (isObj(r.fr)) { const f = { x: nz(r.fr.x, -2000, 4000), y: nz(r.fr.y, -2000, 4000), w: nz(r.fr.w, 8, 2000), h: nz(r.fr.h, 8, 2000) }; if (f.x !== null && f.y !== null) { x.fr = { x: f.x, y: f.y }; if (f.w !== null) x.fr.w = f.w; if (f.h !== null) x.fr.h = f.h; } }
                if (Object.keys(x).length) o.ov[k] = x;
            });
            return o;
        };
        const hashS = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return 's' + h.toString(36); };
        const PATH = new WeakMap(), ORDER = new Map(), OT = new Map(), TOUCHED = new Set();
        const SKIPSEL = 'canvas,svg,script,style,#leaderboard-list';
        const lroot = () => document.getElementById('lobby-screen');
        const tnode = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return n; return null; };
        // gives every element of the lobby a stable id (hash of its structural path); safe to call again, only new nodes get ids
        const scan = () => {
            const root = lroot(); if (!root) return 0; let added = 0;
            if (!root.hasAttribute('data-sid')) { root.setAttribute('data-sid', 'root'); PATH.set(root, 'L'); L.NODE.set('root', root); }
            const walk = (el) => {
                const base = PATH.get(el) || 'L', cnt = {}, kids = Array.from(el.children);
                if (!ORDER.has(el)) ORDER.set(el, kids.filter((k) => !k.classList.contains('stu-block')));
                kids.forEach((k) => {
                    if (k.classList.contains('stu-block') || k.id === 'stu-ov') return;
                    const t = k.tagName.toLowerCase(); cnt[t] = (cnt[t] || 0) + 1;
                    if (!k.hasAttribute('data-sid')) {
                        const p = base + '>' + (k.id ? '#' + k.id : t + ':' + cnt[t]); let sid = hashS(p); while (L.NODE.has(sid) && L.NODE.get(sid) !== k && L.NODE.get(sid).isConnected) sid = hashS(sid + 'x');
                        k.setAttribute('data-sid', sid); PATH.set(k, p); L.NODE.set(sid, k); added++;
                    } else if (!PATH.has(k)) PATH.set(k, base + '>' + t + ':' + cnt[t]);
                    if (!k.matches(SKIPSEL)) walk(k);
                });
            };
            walk(root); return added;
        };
        const NAMED = { hud: '.hud', brand: '.hud .brand', deploy: '#deploy-btn', stage: '.stage', side: '.side', board: '.side .box', widgets: '.widgets', navbar: '.navbar', herosub: '.hero-sub', nameplate: '#nameplate', herorank: '.hero-rank', grid: '.lobby-grid' };
        const named = () => { const o = {}, r = lroot(); if (!r) return o; Object.keys(NAMED).forEach((k) => { const el = r.querySelector(NAMED[k]); if (el && el.getAttribute('data-sid')) o[k] = el.getAttribute('data-sid'); }); return o; };
        const REGISTER_ACTION = (b) => {
            if (S.editMode) return;
            if (b.action === 'link') { if (/^https:\/\//i.test(b.url || '')) window.open(b.url, '_blank', 'noopener,noreferrer'); return; }
            const fn = window[ACTS[b.action]];
            if (typeof fn === 'function') { try { fn(); } catch (e) { console.warn('[studio] action', e); } } else { try { toast('That is not available right now.'); } catch (e) { /* ok */ } }
        };
        const buildBlock = (b) => {
            let el;
            if (b.type === 'text') { el = document.createElement('div'); el.className = 'stu-text'; el.textContent = b.text || 'Text'; }
            else if (b.type === 'button') { el = document.createElement('button'); el.type = 'button'; el.className = 'btn stu-btn'; el.textContent = b.text || 'Button'; el.addEventListener('click', () => REGISTER_ACTION(b)); }
            else if (b.type === 'banner') { el = document.createElement('div'); el.className = 'stu-banner'; el.textContent = b.text || 'Banner'; }
            else if (b.type === 'ticker') { el = document.createElement('div'); el.className = 'stu-tick'; const s = document.createElement('span'); s.textContent = b.text || 'Announcement'; el.appendChild(s); }
            else if (b.type === 'countdown') { el = document.createElement('div'); el.className = 'stu-count'; el.setAttribute('data-until', b.until || ''); el.setAttribute('data-label', b.label || 'Countdown'); el.textContent = b.label || 'Countdown'; }
            else if (b.type === 'image') {
                el = document.createElement('div'); el.className = 'stu-img';
                if (urlOk(b.src)) { const i = document.createElement('img'); i.src = b.src; i.alt = b.alt || ''; i.draggable = false; el.appendChild(i); }
                else if (b.src) { try { if (typeof ICON_ROWS === 'object' && ICON_ROWS[b.src] && typeof iconImg === 'function') el.innerHTML = iconImg(b.src, 'icn big'); } catch (e) { /* ok */ } }
            } else if (b.type === 'clone') {
                const src = L.NODE.get(b.of); if (!src) return null;
                el = src.cloneNode(true); el.removeAttribute('id'); el.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id')); el.removeAttribute('data-sid'); el.querySelectorAll('[data-sid]').forEach((n) => n.removeAttribute('data-sid'));
            }
            return el;
        };
        const DEVQ = { d: '(min-width:1025px)', t: '(min-width:601px) and (max-width:1024px)', p: '(max-width:600px)' };
        const layoutCss = (c) => {
            let css = '.stu-text{padding:6px;color:var(--ink)}.stu-banner{padding:12px;text-align:center;background:var(--mustard);color:#14110e;border:2px solid var(--line);border-radius:var(--r);font-family:\'Special Elite\',monospace;font-size:18px}' +
                '.stu-count{padding:8px;text-align:center;border:2px dashed var(--line);border-radius:var(--r);font-family:\'Special Elite\',monospace}.stu-tick{overflow:hidden;white-space:nowrap;border:2px solid var(--line);border-radius:var(--r);background:var(--panel);padding:4px 0}' +
                '.stu-tick span{display:inline-block;padding-left:100%;animation:stu-mq 16s linear infinite}@keyframes stu-mq{to{transform:translateX(-100%)}}@media (prefers-reduced-motion:reduce){.stu-tick span{animation:none;padding-left:8px}}' +
                '.stu-img img,.stu-img .icn{max-width:100%;height:auto;display:block;margin:0 auto}\n';
            Object.keys(c.ov).forEach((k) => {
                const o = c.ov[k], sel = '[data-sid="' + k + '"]', d = [];
                const s = o.st || {};
                if (s.c) d.push('color:' + s.c); if (s.bg) d.push('background:' + s.bg); if (s.bc) d.push('border-color:' + s.bc);
                if (s.bw !== undefined) d.push('border-width:' + s.bw + 'px;border-style:solid');
                if (s.fs) d.push('font-size:' + s.fs + 'px'); if (s.ff) d.push('font-family:' + FONTS[s.ff]); if (s.br !== undefined) d.push('border-radius:' + s.br + 'px');
                if (s.sh) d.push('box-shadow:' + SHADOWS[s.sh]); if (s.pd !== undefined) d.push('padding:' + s.pd + 'px'); if (s.mg !== undefined) d.push('margin:' + s.mg + 'px');
                if (s.w) d.push('width:' + s.w + 'px;box-sizing:border-box'); if (s.h) d.push('height:' + s.h + 'px;box-sizing:border-box');
                if (s.op !== undefined) d.push('opacity:' + s.op); if (s.ta) d.push('text-align:' + s.ta); if (s.ls !== undefined) d.push('letter-spacing:' + s.ls + 'px');
                if (s.fw) d.push('font-weight:' + s.fw); if (s.rot) d.push('transform:rotate(' + s.rot + 'deg)');
                if (o.fr) d.push('position:absolute;left:' + o.fr.x + 'px;top:' + o.fr.y + 'px;margin:0;z-index:6;box-sizing:border-box' + (o.fr.w ? ';width:' + o.fr.w + 'px' : '') + (o.fr.h ? ';height:' + o.fr.h + 'px' : ''));
                if (d.length) css += sel + '{' + d.join(' !important;') + ' !important}\n';
                (o.hd || '').split('').forEach((dv) => { if (DEVQ[dv]) css += '@media ' + DEVQ[dv] + '{' + sel + '{display:none !important}}\n'; });
            });
            return css;
        };
        let lStyle = null;
        const applyLayout = (raw) => {
            try {
                const c = cleanLayout(raw); L.cfg = c; const root = lroot(); if (!root) return;
                scan();
                TOUCHED.forEach((p) => { (ORDER.get(p) || []).forEach((k) => { if (k.isConnected !== false) p.appendChild(k); }); }); TOUCHED.clear();
                Array.from(document.querySelectorAll('.stu-block')).forEach((b) => { L.NODE.delete(b.getAttribute('data-sid')); b.remove(); });
                OT.forEach((o) => { try { o.node.nodeValue = o.text; } catch (e) { /* ok */ } });
                // added blocks
                const side = root.querySelector('.side'), defPar = side || root;
                c.blocks.forEach((b) => {
                    const el = buildBlock(b); if (!el) return;
                    el.classList.add('stu-block'); el.setAttribute('data-sid', 'blk:' + b.id); L.NODE.set('blk:' + b.id, el);
                    defPar.insertBefore(el, defPar.firstChild);
                });
                // moves and free placement (ordered, so "before" references resolve the same way every time)
                Object.keys(c.ov).filter((k) => c.ov[k].mv || c.ov[k].fr).sort((a, b) => ((c.ov[a].mv || {}).i || 0) - ((c.ov[b].mv || {}).i || 0)).forEach((k) => {
                    const el = L.NODE.get(k); if (!el || !el.isConnected) return;
                    const o = c.ov[k], par = o.mv ? L.NODE.get(o.mv.to) : (o.fr ? root : null);
                    if (!par || par === el || el.contains(par)) return;
                    if (!el.classList.contains('stu-block') && el.parentNode) TOUCHED.add(el.parentNode);
                    const bf = o.mv && o.mv.before ? L.NODE.get(o.mv.before) : null;
                    par.insertBefore(el, bf && bf.parentNode === par ? bf : null); if (!el.classList.contains('stu-block')) TOUCHED.add(par);
                });
                // text overrides
                Object.keys(c.ov).forEach((k) => {
                    const o = c.ov[k]; if (o.t === undefined) return; const el = L.NODE.get(k); if (!el) return;
                    const n = tnode(el); if (!n) return; if (!OT.has(k)) OT.set(k, { node: n, text: n.nodeValue }); n.nodeValue = o.t;
                });
                if (!lStyle) { lStyle = document.createElement('style'); lStyle.id = 'studio-layout'; document.head.appendChild(lStyle); }
                lStyle.textContent = layoutCss(c);
                tickCount();
                if (typeof L.onApplied === 'function') L.onApplied();
            } catch (e) { console.warn('[studio] layout', e); }
        };
        const tickCount = () => {
            document.querySelectorAll('.stu-count').forEach((el) => {
                const u = el.getAttribute('data-until'), lab = el.getAttribute('data-label') || '';
                if (!u) { el.textContent = lab; return; }
                const ms = new Date(u).getTime() - Date.now(); if (!Number.isFinite(ms)) { el.textContent = lab; return; }
                if (ms <= 0) { el.textContent = lab + ' - now!'; return; }
                const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), p2 = (n) => String(n).padStart(2, '0');
                el.textContent = lab + ' ' + (d ? d + 'd ' : '') + p2(Math.floor(s % 86400 / 3600)) + ':' + p2(Math.floor(s % 3600 / 60)) + ':' + p2(s % 60);
            });
        };
        setInterval(tickCount, 1000);
        L.apply = applyLayout; L.scan = scan; L.named = named; L.clean = cleanLayout;
        L.label = (el) => { const n = named(), sid = el.getAttribute('data-sid'); for (const k in n) if (n[k] === sid) return k; const t = (tnode(el) || {}).nodeValue; return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : '') + (t ? ' "' + t.trim().slice(0, 18) + '"' : ''); };
        // keep up when the game re-renders pieces of the lobby
        try {
            let mt = 0;
            new MutationObserver((recs) => {
                if (recs.some((r) => { const t = r.target; return t.nodeType === 1 && !t.closest(SKIPSEL + ',.stu-block,#stu-ov') && Array.from(r.addedNodes).some((n) => n.nodeType === 1 && !n.hasAttribute('data-sid') && !(n.classList && n.classList.contains('stu-block')) && n.id !== 'stu-ov'); })) {
                    clearTimeout(mt); mt = setTimeout(() => { if (scan()) applyLayout(L.cfg); }, 250);
                }
            }).observe(document.getElementById('lobby-screen') || document.body, { childList: true, subtree: true });
        } catch (e) { /* ok */ }

        // ---------------------------------------------------------------- loading + live updates
        let previewing = false, cache = {};
        const loadCache = () => { try { const j = JSON.parse(localStorage.getItem(LS) || '{}'); if (isObj(j)) cache = j; } catch (e) { cache = {}; } };
        const saveCache = () => { try { localStorage.setItem(LS, JSON.stringify(cache)); } catch (e) { /* ok */ } };
        loadCache();
        S.editMode = /[?&]edit=1(&|$)/.test(location.search) && window.parent !== window;
        const applyOne = (name, cfg) => { if (name === 'theme') applyTheme(cfg); else if (name === 'shop') applyShop(cfg); else if (name === 'balance') applyBalance(cfg); else if (name === 'layout' && !S.editMode) applyLayout(cfg); else if (name === 'revoked') applyRevokedDoc(cfg); };
        if (cache.theme) applyTheme(cache.theme);
        if (cache.shop) applyShop(cache.shop);
        if (cache.balance) applyBalance(cache.balance);
        if (cache.revoked) applyRevokedDoc(cache.revoked);
        if (cache.layout && !S.editMode) applyLayout(cache.layout);
        wrapShop(); addAdminButton();
        setInterval(() => { try { if (Object.keys(BAL.w).length || wd()) applyBalance(); applyRevoked(); } catch (e) { /* ok */ } }, 2500);

        const onDoc = (name, cfg) => {
            if (!isObj(cfg)) return;
            cache[name] = cfg; saveCache();
            if (previewing) return;
            applyOne(name, cfg);
        };
        const listen = () => {
            if (typeof ccDb === 'undefined' || !ccDb) return;
            ['shop', 'theme', 'balance', 'layout', 'revoked'].forEach((name) => {
                const ref = ccDb.collection('siteconfig').doc(name), pick = (d) => (name === 'revoked' ? d.data() : d.data().cfg);
                const first = Promise.race([ref.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))])
                    .then((d) => { if (d.exists) onDoc(name, pick(d)); }).catch(() => { /* offline or rules not live yet: the cache already applied */ });
                first.then(() => { try { ref.onSnapshot((d) => { if (d.exists) onDoc(name, pick(d)); }, () => { /* ok */ }); } catch (e) { /* ok */ } });
            });
        };
        if (!S.editMode) listen();

        // ---------------------------------------------------------------- catalog for the Studio page + live preview (same-origin parent only)
        const catalog = () => {
            const out = [];
            ['W', 'A', 'B', 'S', 'K'].forEach((kind) => {
                const T = tbl(kind); if (!T) return;
                Object.keys(T).forEach((id) => {
                    const d = T[id], k = kind + ':' + id, o = origOf(k); if (typeof o !== 'number') return;
                    const it = { k, kind, id, label: String(d.label || d.name || id).slice(0, 40), icon: typeof d.icon === 'string' ? d.icon.slice(0, 8) : '', base: o, fused: !!d.fused };
                    if (kind === 'W') {
                        const r = origW(d), og = r.orig;
                        it.cw = /^CW_/.test(id); it.scrap = d.scrap === true; it.dmg = og.dmg || 0; it.cd = og.cooldown || 0; it.rad = og.radius || 0; it.cnt = typeof og.count === 'number' ? og.count : null; it.starter = !it.cw && o <= 0;
                    }
                    out.push(it);
                });
            });
            return out;
        };
        window.addEventListener('message', (e) => {
            try {
                if (window.parent === window || e.source !== window.parent || e.origin !== location.origin) return;
                const m = e.data; if (!isObj(m) || m.studio !== 1) return;
                if (m.type === 'catalog') window.parent.postMessage({ studio: 1, type: 'catalog', items: catalog() }, location.origin);
                else if (m.type === 'preview') { previewing = true; ['theme', 'shop', 'balance', 'layout'].forEach((n) => { if (m[n] !== undefined && !(n === 'layout' && S.editMode)) applyOne(n, m[n]); }); }
                else if (m.type === 'layout') { previewing = true; applyLayout(m.cfg); }
                else if (m.type === 'clear') { previewing = false; applyTheme(cache.theme || {}); applyShop(cache.shop || {}); applyBalance(cache.balance || {}); applyLayout(cache.layout || {}); }
            } catch (err) { console.warn('[studio] message', err); }
        });
        if (window.parent !== window) { try { window.parent.postMessage({ studio: 1, type: 'ready', edit: !!S.editMode }, location.origin); } catch (e) { /* ok */ } }
        if (S.editMode) { try { const s = document.createElement('script'); s.src = 'mp-studio-edit.js'; document.body.appendChild(s); } catch (e) { /* ok */ } }
        S.apply = { theme: applyTheme, shop: applyShop, balance: applyBalance, layout: applyLayout };
    } catch (e) { console.warn('[studio] failed to start', e); }
})();
