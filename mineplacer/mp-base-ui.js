/* [baseui] Base camp / Shop / Admin / Locker UI layer. Loaded after the main script, shares its global lexical scope.
   Hooks in Mineplacer2.html: renderShop -> mpRenderShop, renderLook -> mpRenderLook, refreshLobbyStats -> mpBaseRefresh. */
(function () {
    'use strict';
    try {
        const $ = (id) => document.getElementById(id);
        const ico = (n, c) => iconImg(n, c || 'icn sm');

        // ------------------------------------------------------------------ icons
        Object.assign(ICON_ROWS, {
            forge:     ["......o.o.", "...o..o...", ".bbbbbbbb.", "bbwwbbbbbk", ".kbbbbbbk.", "...kbbk...", "...kbbk...", "..kbbbbk..", ".kkkkkkkk.", ".........."],
            mat_shard: ["....b.....", "...bwb....", "..bwbbb...", "..bwbbB...", ".bbwbbbB..", ".bbbbbBB..", "..bbbBB...", "...bBB....", "....B.....", ".........."],
            mat_core:  ["...vvvv...", "..vwwvvv..", ".vwvvvvvv.", ".vwvkkvvv.", ".vvvkkvvv.", ".vvvvvvvv.", "..vvvvvv..", "...vvvv...", "..........", ".........."],
            mat_ember: ["....o.....", "...oo.....", "...ooo.o..", "..ooyoo...", "..oyyyoo..", ".ooyyyyoo.", ".ooyyyyoo.", "..ooyyoo..", "...oooo...", ".........."],
            lk_hat:    ["..........", "....kkkk..", "....krrk..", "....kkkk..", "....kkkk..", ".kkkkkkkkk", "..........", "..........", "..........", ".........."],
            lk_shirt:  ["..kk..kk..", ".kwwkkwwk.", "kwwwwwwwwk", "kwwwwwwwwk", ".kwwwwwwk.", ".kwwwwwwk.", ".kwwwwwwk.", ".kwwwwwwk.", "..kkkkkk..", ".........."],
            lk_cape:   ["..kkkkkk..", ".krrrrrrk.", "krrrrrrrrk", "krrrrrrrrk", "krrrrrrrrk", "krrrrrrrrk", ".krrrrrrk.", ".kr.rr.rk.", "..k.kk.k..", ".........."],
            lk_acc:    ["..........", "..........", "kkkkkkkkkk", ".kwwkkwwk.", ".kwkkkkwk.", ".kkk..kkk.", "..........", "..........", "..........", ".........."],
            lk_face:   ["..kkkkkk..", ".kyyyyyyk.", "kyyyyyyyyk", "kykkyykkyk", "kyyyyyyyyk", "kykyyyykyk", "kyykkkkyyk", ".kyyyyyyk.", "..kkkkkk..", ".........."],
            lk_pal:    ["..kkkkkk..", ".kooorrrk.", "kooyyrrrrk", "koyyyvvvrk", "kobbbvvvk.", "kBBbbk.kk.", ".kBBBk....", "..kkk.....", "..........", ".........."]
        });
        ['forge'].forEach((n) => { delete SPR_CV[n]; delete ICON_URL[n]; });
        // the Forge icon wasn't known when the lobby painted its icons: repaint those tiles
        document.querySelectorAll('[data-ic="forge"]').forEach((el) => { el.innerHTML = ''; delete el.dataset.icDone; });
        try { applyIcons(); } catch (e) { /* ok */ }

        const MAT_DEFS = [['shard', 'Shards', 'mat_shard'], ['core', 'Cores', 'mat_core'], ['ember', 'Embers', 'mat_ember']];
        const matsHtml = (u) => {
            if (!u || !u.mats) return '';
            return MAT_DEFS.map(([k, label, ic]) => `<span class="pill mat mat-${k}" title="${label}">${ico(ic, 'icn sm')}<span>${fmt(u.mats[k] || 0)}</span></span>`).join('');
        };

        // ------------------------------------------------------------------ lobby
        const RANKS = [[0, 'Rookie'], [4, 'Scavenger'], [9, 'Survivor'], [15, 'Veteran'], [25, 'Warlord'], [40, 'Zombie Bane'], [60, 'Legend']];
        window.mpBaseRefresh = () => {
            const u = currentUserData; if (!u) return;
            const hw = u.highWave || 0; let ri = 0; RANKS.forEach((r, i) => { if (hw >= r[0]) ri = i; });
            const nxt = RANKS[ri + 1];
            if ($('hero-rank')) $('hero-rank').innerText = RANKS[ri][1];
            if ($('hero-rank-ic')) $('hero-rank-ic').innerHTML = ico('crown', 'icn sm');
            if ($('hero-rank-sub')) $('hero-rank-sub').innerText = 'best wave ' + hw + (nxt ? ' · next rank at ' + nxt[0] : ' · max rank');
            if ($('stat-mats')) $('stat-mats').innerHTML = matsHtml(u);
            if ($('shop-mats')) $('shop-mats').innerHTML = matsHtml(u);
            if ($('loadout-bar') && screens.shop && !screens.shop.classList.contains('hidden')) renderLoadoutBar();
        };

        // ------------------------------------------------------------------ shop
        const RAR_NAME = { 'r-c': 'Common', 'r-u': 'Uncommon', 'r-r': 'Rare', 'r-e': 'Epic', 'r-l': 'Legendary' };
        const chip = (k, v) => `<span class="chip"><b>${k}</b>${v}</span>`;
        const cashBtn = (fn, price, can) => `<button class="btn price cash ${can ? '' : 'cant'}" onclick="${fn}"><span class="pc">$</span>${fmt(price)}</button>`;
        const scrapBtn = (fn, price, can) => `<button class="btn price scrap ${can ? '' : 'cant'}" onclick="${fn}">🔩 ${fmt(price)}</button>`;
        const wChips = (d) => {
            let h = '';
            if (d.dmg > 0) h += chip('DMG', d.dmg);
            if (d.cooldown > 0) h += chip('CD', (d.cooldown / 1000).toFixed(1) + 's');
            if (d.radius > 0) h += chip('RAD', d.radius);
            if (d.scrap === true) h += `<span class="chip salv" title="kills drop scraps">SALVAGE</span>`;
            if (d.fused) h += `<span class="chip fused">FUSED</span>`;
            return h;
        };
        const card = (o) => {
            const rar = o.rar || 'r-c';
            return `<div class="item ${rar} ${o.eq ? 'equipped' : ''} ${o.cls || ''}">
                ${o.eq ? `<div class="rib">${o.eqText || 'EQUIPPED'}</div>` : ''}
                ${o.badge ? `<div class="rib deal-rib">${o.badge}</div>` : ''}
                <div class="rar-tag">${RAR_NAME[rar] || ''}</div>
                <div class="frame">${o.frame || `<div class="item-icon">${o.icon}</div>`}</div>
                <div class="item-name">${o.name}</div>
                ${o.sub ? `<div class="item-sub">${o.sub}</div>` : ''}
                ${o.chips ? `<div class="chips">${o.chips}</div>` : ''}
                ${o.desc ? `<div class="item-desc">${o.desc}</div>` : ''}
                ${o.lv != null ? `<div class="lvbar" title="level ${o.lv}/${MAX_LV}"><i style="width:${Math.round(o.lv / MAX_LV * 100)}%"></i></div>` : ''}
                <div class="item-actions">${o.actions || ''}</div>
                ${o.locked ? `<div class="lock-ov">${o.locked}</div>` : ''}
            </div>`;
        };
        const SLOT_KEYS = ['O', 'P', 'L'];
        const renderLoadoutBar = () => {
            const u = currentUserData, bar = $('loadout-bar'); if (!u || !bar) return;
            let h = '<div class="lb-label">LOADOUT</div>';
            for (let i = 0; i < 3; i++) {
                const id = u.loadout[i], d = id && WEAPON_DATA[id];
                h += d ? `<button class="lslot on ${rc(d.unlock)}" title="Unequip ${esc(d.label)}" onclick="toggleEquip('${id}')"><span class="k">${SLOT_KEYS[i]}</span><span class="ic">${d.icon}</span><span class="nm">${esc(d.label)}</span><span class="x">x</span></button>`
                    : `<div class="lslot off"><span class="k">${SLOT_KEYS[i]}</span><span class="nm dim">empty</span></div>`;
            }
            const ab = ABILITY_DATA[u.equippedAbility], bo = (typeof BOOST_DATA !== 'undefined') && BOOST_DATA[u.equippedBoost];
            h += `<div class="lslot mini ${ab ? 'on' : 'off'}"><span class="k">G</span>${ab ? `<span class="ic">${ab.icon}</span><span class="nm">${esc(ab.label)}</span>` : '<span class="nm dim">none</span>'}</div>`;
            h += `<div class="lslot mini ${bo ? 'on' : 'off'}"><span class="k">H</span>${bo ? `<span class="ic">${bo.icon}</span><span class="nm">${esc(bo.label)}</span>` : '<span class="nm dim">none</span>'}</div>`;
            bar.innerHTML = h;
        };

        let shopQ = '';
        const searchRow = () => `<div class="shop-search"><input id="shop-q" type="search" placeholder="Filter by name..." value="${esc(shopQ)}" autocomplete="off"></div>`;
        const qMatch = (d) => !shopQ || (d.label + ' ' + (d.desc || '')).toLowerCase().includes(shopQ.toLowerCase());
        window.mpRenderShop = () => {
            const u = currentUserData; if (!u) return false;
            $('shop-scrap-display').innerText = fmt(u.scraps);
            $('shop-cash-display').innerText = fmt(u.cash);
            $('loadout-count').innerText = `${u.loadout.length}/3`;
            if ($('shop-mats')) $('shop-mats').innerHTML = matsHtml(u);
            renderLoadoutBar();
            const grid = $('shop-grid'), tab = currentShopTab, byPrice = (a, b) => a[1].unlock - b[1].unlock;
            let html = '';
            if (tab === 'gear') {
                const mine = Object.entries(WEAPON_DATA).filter(([id, d]) => u.unlocked.includes(id) && qMatch(d)).sort(byPrice);
                html = searchRow() + mine.map(([id, d]) => {
                    const slot = u.loadout.indexOf(id), eq = slot >= 0, lvl = u.weaponLevels[id] || 0;
                    const noUp = id === 'SHIELD' || id === 'SUMMON', canSell = d.unlock > 0;
                    return card({
                        rar: rc(d.unlock), eq, eqText: eq ? 'SLOT ' + SLOT_KEYS[slot] : '', icon: d.icon, name: esc(d.label),
                        sub: noUp ? 'No upgrades' : (lvl >= MAX_LV ? `Lv ${lvl} (max)` : `Lv ${lvl} · next: ${NEXT_UP[lvl % 3]}`),
                        chips: wChips(d), lv: noUp ? null : lvl,
                        actions: `<button class="btn btn-sm ${eq ? 'btn-danger' : 'btn-go'}" onclick="toggleEquip('${id}')">${eq ? 'Unequip' : 'Equip'}</button>` +
                            (noUp || lvl >= MAX_LV ? '' : scrapBtn(`upgradeWeapon('${id}')`, upCost(lvl), u.scraps >= upCost(lvl)).replace('class="btn price', 'class="btn btn-sm price').replace('🔩', 'Upgrade 🔩')) +
                            (canSell ? `<button class="btn btn-sm ghost" onclick="sellWeapon('${id}')">${pendingSell === id ? `Sure? +$${fmt(sellPrice(id))}` : `Sell $${fmt(sellPrice(id))}`}</button>` : '')
                    });
                }).join('') || '<div class="empty">Nothing here.</div>';
            } else if (tab === 'weapons') {
                const shop = Object.entries(WEAPON_DATA).filter(([id, d]) => !u.unlocked.includes(id) && qMatch(d)).sort(byPrice);
                html = searchRow() + shop.map(([id, d]) => card({
                    rar: rc(d.unlock || 1e6), icon: d.icon, name: esc(d.label), chips: wChips(d), desc: d.desc ? esc(d.desc) : '',
                    locked: d.fused ? 'FORGE ONLY' : '',
                    actions: d.fused ? `<button class="btn btn-sm btn-violet" onclick="window.openForge && openForge()">Open Forge</button>` : cashBtn(`buyWeapon('${id}')`, d.unlock, u.cash >= d.unlock)
                })).join('') || '<div class="empty">You own everything. Show-off.</div>';
            } else if (tab === 'abilities') {
                html = Object.entries(ABILITY_DATA).map(([id, d]) => {
                    const owned = (u.unlockedAbilities || []).includes(id), eq = u.equippedAbility === id;
                    return card({
                        rar: rc(d.cost), eq, eqText: 'SLOT G', icon: d.icon, name: esc(d.label), desc: esc(d.desc),
                        chips: d.duration ? chip('TIME', (d.duration / 1000) + 's') : '',
                        actions: owned ? `<button class="btn btn-sm ${eq ? '' : 'btn-go'}" onclick="equipAbility('${id}')">${eq ? 'Equipped' : 'Equip'}</button>` : cashBtn(`buyAbility('${id}')`, d.cost, u.cash >= d.cost)
                    });
                }).join('');
            } else if (tab === 'skins') {
                html = Object.keys(SKINS).filter((id) => skinOwned(u, id) || skinReleased(id)).map((id) => {
                    const k = SKINS[id], owned = skinOwned(u, id), on = !!(u.skinOn || {})[id], pr = k.price;
                    const worth = pr ? (pr.cash || 0) + (pr.scraps || 0) * 20000 : 500000;
                    const btns = pr ? [pr.cash ? cashBtn(`buySkin('${id}')`, pr.cash, u.cash >= pr.cash) : '', pr.scraps ? scrapBtn(`buySkin('${id}')`, pr.scraps, u.scraps >= pr.scraps) : ''].join('') : `<div class="item-sub">${esc(skinHowText(id))}</div>`;
                    return card({
                        rar: rc(worth), eq: on, frame: `<canvas class="skin-prev" data-skin="${id}" width="130" height="66"></canvas>`, name: esc(k.name),
                        sub: `for ${esc(WEAPON_DATA[k.weapon].label)}${u.unlocked.includes(k.weapon) ? '' : ' (not owned yet)'}`,
                        actions: owned ? `<button class="btn btn-sm ${on ? 'btn-go' : ''}" onclick="toggleSkin('${id}')">${on ? 'Equipped' : 'Equip skin'}</button>` : btns
                    });
                }).join('');
                clearInterval(skinAnim); setTimeout(drawSkinPreviews, 0);
                skinAnim = setInterval(() => { if (!document.querySelector('.skin-prev')) { clearInterval(skinAnim); return; } drawSkinPreviews(); }, 50);
            } else if (tab === 'market') {
                const left = 3600 - Math.floor((Date.now() / 1000) % 3600), got = (u.bm && u.bm.h === bmHour()) ? u.bm.ids : [];
                html = `<div class="shop-note">${ico('market')} 3 deals, new ones every hour (next in <b>${Math.floor(left / 60)}m ${left % 60}s</b>). One of each per rotation, same for everybody.</div>` + bmItems().map((it) => {
                    const bought = got.includes(it.key), own = it.owned(u);
                    return card({
                        rar: it.rar, icon: it.icon, name: esc(it.label), desc: esc(it.desc), chips: it.off ? `<span class="chip fused">${esc(it.off)}</span>` : '',
                        locked: bought ? 'SOLD OUT' : (own ? 'OWNED' : ''),
                        actions: `<button class="btn price ${bought || own ? '' : 'cash'}" ${bought || own ? 'disabled' : ''} onclick="buyMarket('${it.key}')">${bought ? 'Sold out' : (own ? 'Owned' : it.priceTxt)}</button>`
                    });
                }).join('');
            } else if (tab === 'boost') {
                html = Object.entries(BOOST_DATA).map(([id, d]) => {
                    const owned = (u.boosts || []).includes(id), eq = u.equippedBoost === id;
                    return card({
                        rar: rc(d.scraps * 200), eq, eqText: 'SLOT H', icon: d.icon, name: esc(d.label), desc: esc(d.desc), sub: `${BOOST_USES} uses every wave · key H`,
                        actions: owned ? `<button class="btn btn-sm ${eq ? '' : 'btn-go'}" onclick="equipBoost('${id}')">${eq ? 'Equipped' : 'Equip'}</button>` : scrapBtn(`buyBoost('${id}')`, d.scraps, u.scraps >= d.scraps)
                    });
                }).join('');
            } else {
                const deal = dealId(), crates = u.inventory.CRATE || 0;
                const crateCard = crates > 0 ? card({ rar: 'r-l', icon: '📦', name: `Supply Crate x${crates}`, desc: 'Cash, scraps or supplies. Surprise.', cls: 'crate', actions: `<button class="btn btn-primary" onclick="openCrate()">Crack it open</button>` }) : '';
                html = crateCard + Object.entries(SUPPLY_DATA).map(([id, d]) => {
                    const n = u.inventory[id] || 0, armed = u.armed.includes(id), pr = supplyPrice(id);
                    return card({
                        rar: rc(d.price), cls: id === deal ? 'deal' : '', badge: id === deal ? '-30% TODAY' : '', icon: d.icon, name: esc(d.label), desc: esc(d.desc),
                        sub: `Owned: <b>${n}</b>${d.gear ? ' · one-use gear' : ''}`,
                        actions: cashBtn(`buySupply('${id}')`, pr, u.cash >= pr) + (n > 0 ? `<button class="btn btn-sm ${armed ? 'btn-go' : ''}" onclick="toggleArm('${id}')">${armed ? 'Bringing it' : 'Leave at camp'}</button>` : '')
                    });
                }).join('');
            }
            const keep = grid.scrollTop, hadFocus = document.activeElement && document.activeElement.id === 'shop-q', caret = hadFocus ? document.activeElement.selectionStart : 0;
            grid.innerHTML = html;
            grid.scrollTop = keep;
            if (hadFocus && $('shop-q')) { $('shop-q').focus(); try { $('shop-q').setSelectionRange(caret, caret); } catch (e) { /* ok */ } }
            return true;
        };

        $('shop-grid').addEventListener('input', (e) => { if (e.target && e.target.id === 'shop-q') { shopQ = e.target.value; window.mpRenderShop(); } });

        // ------------------------------------------------------------------ admin: tabbed sections
        const ADM_TABS = [['live', 'Live', 'boost'], ['give', 'Give', 'supplies'], ['mod', 'Moderation', 'admin'], ['board', 'Board', 'crown'], ['owner', 'Admins', 'friends'], ['upd', 'Updates', 'news']];
        let admTab = 'live';
        const admSections = () => {
            const col = document.querySelector('#admin-modal .adm-cols > div:nth-child(2)');
            return col ? Array.from(col.children).filter((e) => e.classList.contains('adm-sec')) : [];
        };
        const admShow = (id) => {
            admTab = id;
            const secs = admSections();
            secs.forEach((s, i) => s.classList.toggle('adm-off', !ADM_TABS[i] || ADM_TABS[i][0] !== id));
            document.querySelectorAll('#adm-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
        };
        const admBuildTabs = () => {
            const bar = $('adm-tabs'); if (!bar) return;
            const secs = admSections();
            bar.innerHTML = ADM_TABS.map(([id, label, ic], i) => {
                const s = secs[i]; if (!s) return '';
                let vis = !s.classList.contains('hidden');
                if (id === 'mod') vis = Array.from(s.querySelectorAll('[data-perm]')).some((e) => !e.classList.contains('hidden'));
                return vis ? `<button data-t="${id}" onclick="mpAdmTab('${id}')">${ico(ic)}<span>${label}</span></button>` : '';
            }).join('');
            const first = bar.querySelector('button'); const cur = bar.querySelector(`[data-t="${admTab}"]`);
            admShow(cur ? admTab : (first ? first.dataset.t : 'live'));
        };
        window.mpAdmTab = admShow;
        const origOpenAdmin = window.openAdmin;
        if (typeof origOpenAdmin === 'function') {
            const panel = document.querySelector('#admin-modal .adm-panel');
            if (panel && !$('adm-tabs')) {
                const nav = document.createElement('div'); nav.id = 'adm-tabs'; nav.className = 'adm-tabs';
                const cols = panel.querySelector('.adm-cols'); panel.insertBefore(nav, cols);
            }
            window.openAdmin = function () { const r = origOpenAdmin.apply(this, arguments); try { admBuildTabs(); } catch (e) { console.warn('[baseui] admin tabs', e); } return r; };
        }

        // ------------------------------------------------------------------ locker v2
        const CATS = [
            ['hat', 'Hat', 'lk_hat'], ['top', 'Top', 'lk_shirt'], ['back', 'Back', 'lk_cape'], ['acc', 'Accessory', 'lk_acc'],
            ['face', 'Face', 'lk_face'], ['color', 'Colours', 'lk_pal'], ['skins', 'Skins', 'skins']
        ];
        const TBL = { hat: () => HATS, top: () => TOPS, back: () => BACKS, acc: () => ACCS, mouth: () => MOUTHS };
        const CROPS = { hat: [0, 0, 10, 6], top: [0, 3, 10, 7], back: [0, 3, 10, 8], acc: [0, 0, 10, 6], mouth: [0, 0, 10, 6] };
        const CAT_COLORS = { hat: ['hair'], top: ['shirt', 'pants'], back: ['trim'], acc: ['trim'], face: ['eyes', 'skin'], color: ['hair', 'skin', 'shirt', 'pants', 'shoes', 'trim', 'eyes'] };
        const POSES = [['idle', 'Idle'], ['walk', 'Walk'], ['spin', 'Turn'], ['jump', 'Jump'], ['wave', 'Wave']];
        let lkCat = 'hat', lkPose = 'idle', lkSnap = null;

        const thumbs = [];
        const paintThumbs = () => {
            thumbs.forEach(({ cv, L, key, tbl, k }) => {
                const kk = lookKey({ ...L, [key]: k }, true), img = SPR[kk]; if (!img) return;
                const [sx, sy, sw, sh] = CROPS[key], c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height);
                const sc = Math.min(cv.width / sw, cv.height / sh);
                c.drawImage(img, sx, sy, sw, sh, (cv.width - sw * sc) / 2, (cv.height - sh * sc) / 2, sw * sc, sh * sc);
            });
        };
        const optGrid = (key, L, u) => {
            const tbl = TBL[key]();
            return `<div class="lk-grid">` + Object.keys(tbl).map((k) => {
                const name = typeof tbl[k] === 'string' ? tbl[k] : tbl[k].name, locked = tbl[k].need === 'crown' && !(u.crowns > 0);
                return `<button class="lk-opt ${L[key] === k ? 'sel' : ''} ${locked ? 'lock' : ''}" ${locked ? 'disabled' : ''} data-k="${key}" data-v="${k}"><canvas width="60" height="48"></canvas><span>${esc(name)}</span>${locked ? '<i class="lk-lock">locked<br>win a crown</i>' : ''}</button>`;
            }).join('') + `</div>`;
        };
        const swatchRows = (keys, L) => keys.map((k) => `<div class="lk-swl">${LOOK_LABELS[k]}</div><div class="lk-sws">` +
            LOOK_COLORS[k].map((c) => `<div class="sw ${L[k] === c ? 'on' : ''}" data-ck="${k}" data-cv="${c}" style="background:${c}"></div>`).join('') +
            `<label class="sw" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);position:relative" title="any colour"><input type="color" data-ck="${k}" value="${/^#[0-9a-f]{6}$/i.test(L[k]) ? L[k] : '#ffffff'}" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%"></label></div>`).join('');
        const lkSet = (k, v) => { currentUserData.look[k] = v; applyLook(); window.mpRenderLook(); };

        window.mpRenderLook = () => {
            const u = currentUserData; if (!u || !$('look-rows')) return false;
            if (!u.look) u.look = { ...DEFAULT_LOOK };
            const L = { ...DEFAULT_LOOK, ...u.look };
            $('lk-cats').innerHTML = CATS.map(([id, label, ic]) => `<button class="${lkCat === id ? 'on' : ''}" data-cat="${id}">${ico(ic, 'icn')}<span>${label}</span></button>`).join('');
            $('lk-poses').innerHTML = POSES.map(([id, label]) => `<button class="${lkPose === id ? 'on' : ''}" data-pose="${id}">${label}</button>`).join('');
            let h = '';
            if (lkCat === 'face') h += `<div class="lk-swl">Mouth</div>` + optGrid('mouth', L, u);
            else if (lkCat !== 'color' && lkCat !== 'skins') h += optGrid(lkCat, L, u);
            if (lkCat !== 'skins') h += swatchRows(CAT_COLORS[lkCat], L);
            $('look-rows').innerHTML = h;
            thumbs.length = 0;
            $('look-rows').querySelectorAll('.lk-opt').forEach((b) => { thumbs.push({ cv: b.querySelector('canvas'), L, key: b.dataset.k, k: b.dataset.v }); });
            paintThumbs();
            const sp = $('look-spoon');
            if (lkCat === 'skins') {
                const owned = Object.keys(SKINS).filter((id) => skinOwned(u, id));
                sp.innerHTML = (owned.length ? owned.map((id) => `<button class="btn btn-violet lk-skin" onclick="toggleSkin('${id}')">${esc(SKINS[id].name)} skin: ${(u.skinOn || {})[id] ? 'ON' : 'OFF'}</button>`).join('') : '<p class="small dim">No weapon skins yet. Win the weekly board or find them in the shop.</p>') +
                    '<p class="small dim">Skins show up on their weapon in a run, and your party sees them too. Crown hat: win a weekly crown.</p>';
            } else sp.innerHTML = '';
            drawPreview();
            return true;
        };

        const drawPreview = () => {
            const cv = $('look-preview'); if (!cv || !currentUserData) return;
            const t = performance.now() / 1000, img = SPR.player; if (!img) return;
            if (lkPose === 'idle') { drawAvatar(cv, t, 18, firstActiveSkin()); return; }
            const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height);
            const sc = 18, w = img.width * sc, h = img.height * sc, gy = cv.height - 24;
            let x = cv.width / 2, y = gy, sx = 1, rot = 0, sh = 1;
            if (lkPose === 'walk') { x += Math.sin(t * 1.4) * 70; y -= Math.abs(Math.sin(t * 9)) * sc * 0.5; sx = Math.cos(t * 1.4) >= 0 ? 1 : -1; }
            if (lkPose === 'spin') sx = Math.cos(t * 3);
            if (lkPose === 'jump') { const j = Math.abs(Math.sin(t * 3.2)); y -= j * 80; sh = 1 - j * 0.35; }
            if (lkPose === 'wave') rot = Math.sin(t * 9) * 0.07;
            c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(x, gy, w * 0.55 * sh, sc * 1.5, 0, 0, 6.283); c.fill();
            c.save(); c.translate(x, y + sc * 0.8); c.rotate(rot); c.scale(sx, 1); c.drawImage(img, -w / 2, -h, w, h); c.restore();
        };

        const lkDelegate = (e) => {
            const cat = e.target.closest('[data-cat]'); if (cat) { lkCat = cat.dataset.cat; window.mpRenderLook(); return; }
            const pose = e.target.closest('[data-pose]'); if (pose) { lkPose = pose.dataset.pose; window.mpRenderLook(); return; }
            const opt = e.target.closest('.lk-opt'); if (opt && !opt.disabled) { lkSet(opt.dataset.k, opt.dataset.v); return; }
            const sw = e.target.closest('.sw[data-cv]'); if (sw) { lkSet(sw.dataset.ck, sw.dataset.cv); }
        };
        const lm = $('look-modal');
        if (lm) {
            lm.addEventListener('click', lkDelegate);
            lm.addEventListener('input', (e) => { const el = e.target; if (el.matches && el.matches('input[data-ck]')) { currentUserData.look[el.dataset.ck] = el.value; applyLook(); } });
            lm.addEventListener('change', (e) => { const el = e.target; if (el.matches && el.matches('input[data-ck]')) lkSet(el.dataset.ck, el.value); });
        }
        const origOpenLook = window.openLook;
        window.openLook = function () {
            const u = currentUserData; if (u) lkSnap = JSON.parse(JSON.stringify(u.look || {}));
            lkCat = 'hat'; lkPose = 'idle';
            const r = origOpenLook ? origOpenLook.apply(this, arguments) : undefined;
            clearInterval(lookTimer); lookTimer = setInterval(drawPreview, 33);
            return r;
        };
        window.mpLookSave = () => { const u = currentUserData; if (u) { try { save({ look: u.look }); } catch (e) { /* offline sandbox */ } } lkSnap = null; closeLook(); toast('Look saved.'); };
        window.mpLookCancel = () => { const u = currentUserData; if (u && lkSnap) { u.look = lkSnap; applyLook(); } lkSnap = null; closeLook(); };
        window.mpLookReset = () => { const u = currentUserData; if (!u) return; u.look = { ...DEFAULT_LOOK }; applyLook(); window.mpRenderLook(); };
        window.randomLook = () => {
            const u = currentUserData, pick = (a) => a[Math.random() * a.length | 0], L = u.look;
            for (const k of Object.keys(LOOK_COLORS)) L[k] = pick(LOOK_COLORS[k]);
            L.hat = pick(Object.keys(HATS).filter((k) => !(HATS[k].need === 'crown' && !(u.crowns > 0)))); L.top = pick(Object.keys(TOPS)); L.back = pick(Object.keys(BACKS)); L.acc = pick(Object.keys(ACCS)); L.mouth = pick(Object.keys(MOUTHS));
            applyLook(); window.mpRenderLook();
        };

        // keep market countdown fresh etc: the main script already re-renders; nothing else needed
        if (currentUserData) window.mpBaseRefresh();
    } catch (err) { console.error('[baseui] init failed', err); }
})();
