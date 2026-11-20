/* [studio] Design mode for the Designer tab of admin-studio.html. Loaded ONLY by mp-studio.js when the game runs inside the Studio iframe with ?edit=1.
   It never changes the layout config itself: it reports selections and gestures to the parent (same origin) and the parent sends the new config back. */
(function () {
    'use strict';
    try {
        const S = window.STUDIO; if (!S || !S.layout || !S.editMode) return;
        const L = S.layout, ORIGIN = location.origin;
        const send = (o) => { try { window.parent.postMessage(Object.assign({ studio: 1 }, o), ORIGIN); } catch (e) { /* ok */ } };
        const $root = () => document.getElementById('lobby-screen');
        const SKIP = 'canvas,svg,script,style,#leaderboard-list';
        let sel = null, selSid = '', grid = false, drag = null, editing = null;

        // ---------- look of design mode: only the lobby, everything inert
        const st = document.createElement('style');
        st.textContent = 'body.stu-edit #auth-screen,body.stu-edit #loading-screen,body.stu-edit #game-screen,body.stu-edit .overlay{display:none !important}' +
            'body.stu-edit{cursor:default;user-select:none}body.stu-edit *{cursor:inherit}#stu-ov{position:fixed;inset:0;z-index:99999;pointer-events:none;font:12px monospace}' +
            '#stu-ov .box{position:fixed;border:2px solid #d9a441;box-shadow:0 0 0 1px rgba(0,0,0,.6);pointer-events:none}#stu-ov .hov{border:1px dashed #7f9aa6}' +
            '#stu-ov .tag{position:absolute;left:-2px;top:-20px;background:#d9a441;color:#14110e;padding:1px 6px;white-space:nowrap;font-size:11px}' +
            '#stu-ov .h{position:absolute;width:12px;height:12px;background:#d9a441;border:2px solid #14110e;pointer-events:auto;box-sizing:border-box;touch-action:none}' +
            '#stu-ov .gl{position:fixed;background:#ff5599;pointer-events:none}#stu-ov .ind{position:fixed;background:#8aa04a;pointer-events:none;box-shadow:0 0 6px #8aa04a}' +
            '#stu-ov .grid{position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:8px 8px}' +
            '[contenteditable]{outline:2px solid #ff5599 !important;user-select:text !important;cursor:text !important}';
        document.head.appendChild(st);
        document.body.classList.add('stu-edit');
        const ov = document.createElement('div'); ov.id = 'stu-ov';
        ov.innerHTML = '<div class="grid" style="display:none"></div><div class="box hov" style="display:none"></div><div class="box sel" style="display:none"><span class="tag"></span></div>';
        document.body.appendChild(ov);
        const hovB = ov.querySelector('.hov'), selB = ov.querySelector('.sel'), tagB = selB.querySelector('.tag'), gridB = ov.querySelector('.grid');
        const HAND = [['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5]];
        HAND.forEach(([k, fx, fy]) => { const h = document.createElement('div'); h.className = 'h'; h.dataset.h = k; h.style.left = `calc(${fx * 100}% - 7px)`; h.style.top = `calc(${fy * 100}% - 7px)`; h.style.cursor = k + '-resize'; selB.appendChild(h); });

        // keep the lobby on screen whatever the game does
        const force = () => { const r = $root(); if (r) r.classList.remove('hidden'); document.querySelectorAll('.overlay').forEach((o) => o.classList.add('hidden')); };
        force(); setInterval(force, 400);

        const sidOf = (el) => (el && el.getAttribute && el.getAttribute('data-sid')) || '';
        const inLobby = (el) => { const r = $root(); return !!(el && r && r.contains(el) && !el.closest('#stu-ov')); };
        const pickAt = (x, y, skipEl) => {
            const list = document.elementsFromPoint(x, y).filter((el) => inLobby(el) && sidOf(el) && (!skipEl || !(skipEl === el || skipEl.contains(el))));
            return list.find((el) => el !== $root()) || list[0] || null;
        };
        const promote = (el) => { const t = el && el.closest && el.closest('button,.pill,.tile,.btn'); return t && t !== el && inLobby(t) && t !== $root() ? t : el; };   // clicking a label inside a button selects the button; double-click edits the label
        const place = (b, el) => { if (!el || !el.isConnected) { b.style.display = 'none'; return; } const r = el.getBoundingClientRect(); b.style.display = 'block'; b.style.left = r.left + 'px'; b.style.top = r.top + 'px'; b.style.width = r.width + 'px'; b.style.height = r.height + 'px'; };
        const tnode = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return n; return null; };
        const hex = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || ''); if (!m || (m[4] !== undefined && +m[4] === 0)) return ''; return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join(''); };
        const isFree = (sid) => !!(L.cfg.ov[sid] && L.cfg.ov[sid].fr);
        const rel = (el) => { const r = $root().getBoundingClientRect(), b = el.getBoundingClientRect(); return { x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height) }; };

        const resolve = () => { if (selSid && (!sel || !sel.isConnected)) sel = L.NODE.get(selSid) || null; };   // blocks are rebuilt on every apply: find the new element
        const report = () => {
            resolve();
            if (!sel || !sel.isConnected) { send({ type: 'sel', sid: '' }); return; }
            const cs = getComputedStyle(sel), sid = sidOf(sel), tn = tnode(sel), p = sel.parentElement;
            send({ type: 'sel', sid, label: L.label(sel), isBlock: sid.indexOf('blk:') === 0, hasText: !!tn, text: tn ? tn.nodeValue : '', free: isFree(sid), rect: rel(sel), parent: sidOf(p), parentLabel: p ? L.label(p) : '',
                cs: { c: hex(cs.color), bg: hex(cs.backgroundColor), bc: hex(cs.borderTopColor), fs: parseInt(cs.fontSize, 10) || 14, br: parseInt(cs.borderTopLeftRadius, 10) || 0, pd: parseInt(cs.paddingTop, 10) || 0, op: +cs.opacity || 1, ta: cs.textAlign, bw: parseInt(cs.borderTopWidth, 10) || 0 } });
        };
        const tree = () => {
            const out = [], r = $root(); if (!r) return;
            const walk = (el, d) => { Array.from(el.children).forEach((k) => { if (out.length > 320 || k.id === 'stu-ov') return; const sid = sidOf(k); if (!sid) return; out.push({ sid, label: L.label(k), d, hid: getComputedStyle(k).display === 'none' }); if (!k.matches(SKIP)) walk(k, d + 1); }); };
            walk(r, 0); send({ type: 'tree', tree: out, named: L.named() });
        };
        const choose = (el) => { sel = el; selSid = el ? sidOf(el) : ''; report(); frame(); };
        const frame = () => { resolve(); place(selB, sel); if (sel && sel.isConnected) tagB.textContent = L.label(sel) + (isFree(sidOf(sel)) ? ' (free)' : ''); };
        const loop = () => { if (!drag) { frame(); } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
        const prevApplied = L.onApplied;
        L.onApplied = () => { if (prevApplied) prevApplied(); tree(); if (sel) report(); };

        // ---------- block the game, handle the gestures
        const BLOCK = ['click', 'auxclick', 'contextmenu', 'touchstart', 'touchend', 'submit'];
        BLOCK.forEach((t) => document.addEventListener(t, (e) => { if (editing && editing.contains(e.target)) return; if (e.target.closest && e.target.closest('#stu-ov')) return; e.preventDefault(); e.stopImmediatePropagation(); }, true));
        document.addEventListener('mousemove', (e) => { if (drag || editing) return; const el = promote(pickAt(e.clientX, e.clientY)); place(hovB, el && el !== sel ? el : null); }, true);

        const snapGuides = [];
        const clearGuides = () => { ov.querySelectorAll('.gl,.ind').forEach((n) => n.remove()); snapGuides.length = 0; };
        const line = (cls, x, y, w, h) => { const d = document.createElement('div'); d.className = cls; d.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`; ov.appendChild(d); return d; };
        const edges = (skip) => {
            const xs = [], ys = [], rr = $root().getBoundingClientRect();
            xs.push(rr.left, rr.left + rr.width / 2, rr.right); ys.push(rr.top, rr.top + rr.height / 2, rr.bottom);
            document.querySelectorAll('#lobby-screen [data-sid]').forEach((el) => { if (el === skip || (skip && skip.contains(el)) || el.matches('canvas') || el.closest('#leaderboard-list')) return; const b = el.getBoundingClientRect(); if (b.width < 4 || b.height < 4) return; xs.push(b.left, b.left + b.width / 2, b.right); ys.push(b.top, b.top + b.height / 2, b.bottom); });
            return { xs, ys };
        };
        const snap1 = (vals, cands, tol) => { let best = null; vals.forEach((v) => cands.forEach((c) => { const d = c - v; if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, at: c }; })); return best; };
        const G = 8;

        const startDrag = (el, e) => {
            const sid = sidOf(el), free = isFree(sid), fr = free ? (L.cfg.ov[sid].fr) : null;
            drag = { el, sid, x0: e.clientX, y0: e.clientY, started: false, free, fr: fr ? Object.assign({}, fr) : null, rect0: el.getBoundingClientRect(), edges: free ? edges(el) : null, drop: null };
        };
        document.addEventListener('mousedown', (e) => {
            if (editing && editing.contains(e.target)) return;
            if (e.target.closest && e.target.closest('#stu-ov') && !e.target.dataset.h) return;
            e.preventDefault(); e.stopImmediatePropagation();
            if (e.button !== 0) return;
            if (e.target.dataset && e.target.dataset.h) { startResize(e.target.dataset.h, e); return; }
            const el = promote(pickAt(e.clientX, e.clientY)); if (!el) { choose(null); return; }
            if (el !== sel) choose(el);
            if (el !== $root()) startDrag(el, e);
        }, true);
        document.addEventListener('mousemove', (e) => {
            if (!drag) return;
            if (!drag.started) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return; drag.started = true; }
            clearGuides();
            if (drag.resize) return doResize(e);
            if (drag.free) {
                const rr = $root().getBoundingClientRect(); let dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
                const b = drag.rect0, vx = [b.left + dx, b.left + dx + b.width / 2, b.right + dx], vy = [b.top + dy, b.top + dy + b.height / 2, b.bottom + dy];
                const sx = snap1(vx, drag.edges.xs, 6), sy = snap1(vy, drag.edges.ys, 6);
                if (sx) { dx += sx.d; line('gl', sx.at, 0, 1, innerHeight); } else if (grid) dx = Math.round((b.left + dx - rr.left) / G) * G - (b.left - rr.left);
                if (sy) { dy += sy.d; line('gl', 0, sy.at, innerWidth, 1); } else if (grid) dy = Math.round((b.top + dy - rr.top) / G) * G - (b.top - rr.top);
                drag.pos = { x: Math.round(drag.fr.x + dx), y: Math.round(drag.fr.y + dy) };
                drag.el.style.setProperty('left', drag.pos.x + 'px', 'important'); drag.el.style.setProperty('top', drag.pos.y + 'px', 'important');
                return;
            }
            // reorder: find where it would land
            drag.drop = null;
            const cand = pickAt(e.clientX, e.clientY, drag.el); if (!cand) { drag.drop = null; return; }
            const tag = drag.el.tagName, sameIn = (par) => Array.from(par.children).some((k) => k !== drag.el && k.tagName === tag && sidOf(k));
            const horizOf = (par) => { const cs = getComputedStyle(par); return /flex|grid/.test(cs.display) && !/column/.test(cs.flexDirection); };
            let parent = null, before = null;
            if (sameIn(cand) && !cand.matches(SKIP)) {   // pointer is in the gap of a container full of like elements: drop among them
                parent = cand; const kids = Array.from(cand.children).filter((k) => sidOf(k) && k !== drag.el && k.id !== 'stu-ov'), horiz = horizOf(cand);
                before = kids.find((k) => { const b = k.getBoundingClientRect(); return horiz ? (e.clientX < b.left + b.width / 2 && e.clientY < b.bottom) || e.clientY < b.top : e.clientY < b.top + b.height / 2; }) || null;
                const ref = before || kids[kids.length - 1];
                if (ref) { const b = ref.getBoundingClientRect(); if (horiz) line('ind', before ? b.left - 3 : b.right + 1, b.top, 3, b.height); else line('ind', b.left, before ? b.top - 3 : b.bottom + 1, b.width, 3); }
            } else {   // otherwise climb to the nearest element that sits among like siblings, and drop before/after it
                let X = cand; while (X && X !== $root() && !(X.parentElement && sameIn(X.parentElement))) X = X.parentElement;
                if (!X || X === $root() || X === drag.el || drag.el.contains(X)) { drag.drop = null; return; }
                parent = X.parentElement; const b = X.getBoundingClientRect(), horiz = horizOf(parent), after = horiz ? e.clientX > b.left + b.width / 2 : e.clientY > b.top + b.height / 2;
                before = after ? (function nx(n) { while (n && (n === drag.el || !sidOf(n))) n = n.nextElementSibling; return n; })(X.nextElementSibling) : X;
                if (horiz) line('ind', after ? b.right + 1 : b.left - 3, b.top, 3, b.height); else line('ind', b.left, after ? b.bottom + 1 : b.top - 3, b.width, 3);
            }
            if (parent === drag.el || drag.el.contains(parent) || parent.matches(SKIP)) { drag.drop = null; return; }
            drag.drop = { to: sidOf(parent), before: before ? sidOf(before) : null };
            place(hovB, parent);
        }, true);
        const endDrag = (e) => {
            if (!drag) return; const d = drag; drag = null; clearGuides(); hovB.style.display = 'none';
            if (!d.started) return;
            if (d.resize) { send({ type: 'op', op: d.free ? 'free' : 'size', sid: d.sid, x: d.out.x, y: d.out.y, w: d.out.w, h: d.out.h }); return; }
            if (d.free) { d.el.style.removeProperty('left'); d.el.style.removeProperty('top'); if (d.pos) send({ type: 'op', op: 'free', sid: d.sid, x: d.pos.x, y: d.pos.y, w: d.fr.w, h: d.fr.h }); return; }
            if (d.drop) send({ type: 'op', op: 'move', sid: d.sid, to: d.drop.to, before: d.drop.before });
        };
        document.addEventListener('mouseup', endDrag, true);

        // resize: free blocks get x/y/w/h, flow elements get a fixed width/height
        const startResize = (hd, e) => {
            if (!sel) return; const sid = sidOf(sel), b = sel.getBoundingClientRect(), r = $root().getBoundingClientRect();
            drag = { resize: hd, started: true, el: sel, sid, free: isFree(sid), x0: e.clientX, y0: e.clientY, b, r };
        };
        const doResize = (e) => {
            const d = drag, hd = d.resize, dx = e.clientX - d.x0, dy = e.clientY - d.y0; let x = d.b.left, y = d.b.top, w = d.b.width, h = d.b.height;
            if (hd.includes('e')) w += dx; if (hd.includes('s')) h += dy; if (hd.includes('w')) { x += dx; w -= dx; } if (hd.includes('n')) { y += dy; h -= dy; }
            if (grid) { w = Math.round(w / G) * G; h = Math.round(h / G) * G; }
            w = Math.max(16, w); h = Math.max(16, h);
            d.out = { x: Math.round(x - d.r.left), y: Math.round(y - d.r.top), w: Math.round(w), h: Math.round(h) };
            d.el.style.setProperty('width', d.out.w + 'px', 'important'); d.el.style.setProperty('height', d.out.h + 'px', 'important');
            if (d.free) { d.el.style.setProperty('left', d.out.x + 'px', 'important'); d.el.style.setProperty('top', d.out.y + 'px', 'important'); }
        };
        document.addEventListener('mouseup', () => { if (sel) { sel.style.removeProperty('width'); sel.style.removeProperty('height'); sel.style.removeProperty('left'); sel.style.removeProperty('top'); } }, false);

        // ---------- inline text editing
        document.addEventListener('dblclick', (e) => {
            e.preventDefault(); e.stopImmediatePropagation();
            const el = pickAt(e.clientX, e.clientY); if (!el) return; const tn = tnode(el); if (!tn) return;
            choose(el); const sid = sidOf(el), orig = tn.nodeValue; editing = el;
            el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
            el.focus(); const rg = document.createRange(); rg.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
            const done = (commit) => {
                el.removeEventListener('blur', onBlur); el.removeEventListener('keydown', onKey); el.removeAttribute('contenteditable'); editing = null;
                const nn = tnode(el); const val = nn ? nn.nodeValue : orig;
                if (commit && val !== orig) send({ type: 'op', op: 'text', sid, text: val.replace(/\s+/g, ' ').trim() }); else if (nn) nn.nodeValue = orig;
                getSelection().removeAllRanges(); report();
            };
            const onBlur = () => done(true), onKey = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); } else if (ev.key === 'Escape') { ev.preventDefault(); el.removeEventListener('blur', onBlur); done(false); } };
            el.addEventListener('blur', onBlur); el.addEventListener('keydown', onKey);
        }, true);

        document.addEventListener('keydown', (e) => {
            if (editing) return;
            if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) { e.preventDefault(); send({ type: 'key', k: e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo' }); return; }
            if (!sel) return;
            const sid = sidOf(sel);
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); send({ type: 'op', op: 'hide', sid }); }
            else if (e.key === 'Escape') choose(null);
            else if (/^Arrow/.test(e.key) && isFree(sid)) { e.preventDefault(); const f = L.cfg.ov[sid].fr, n = e.shiftKey ? G : 1; send({ type: 'op', op: 'free', sid, x: f.x + (e.key === 'ArrowRight' ? n : e.key === 'ArrowLeft' ? -n : 0), y: f.y + (e.key === 'ArrowDown' ? n : e.key === 'ArrowUp' ? -n : 0), w: f.w, h: f.h }); }
        }, true);

        // ---------- messages from the Studio page
        window.addEventListener('message', (e) => {
            if (e.source !== window.parent || e.origin !== ORIGIN) return; const m = e.data; if (!m || m.studio !== 1) return;
            if (m.type === 'select') { const el = L.NODE.get(m.sid); if (el) choose(el); else choose(null); }
            else if (m.type === 'selparent') { const p = sel && sel.parentElement; if (p && p !== document.body && sidOf(p)) choose(p); }
            else if (m.type === 'grid') { grid = !!m.on; gridB.style.display = grid ? 'block' : 'none'; }
            else if (m.type === 'makefree') { const el = L.NODE.get(m.sid); if (el) { const r = rel(el); send({ type: 'op', op: 'free', sid: m.sid, x: r.x, y: r.y, w: r.w, h: r.h }); } }
            else if (m.type === 'rect') { const el = L.NODE.get(m.sid); if (el) { send({ type: 'rect', sid: m.sid, rect: rel(el) }); } }
        });
        window.addEventListener('resize', () => { frame(); });
        L.scan(); tree(); send({ type: 'editready' });
    } catch (e) { console.warn('[studio] design mode', e); }
})();
