/* mp-modes-core.js: the shared game-mode registry. Loaded BEFORE every other mp-*.js file.
   A mode is { id, name, desc, icon (emoji or sprite name), tags: ['pvp'|'pve'|'party'], players: '1' | '2-8' | '2-4' ..., launch(opts), stop?() , tick?(), draw?(ctx), onWave?() }.
   Register with MODES.register(def) (or push onto window.MODE_QUEUE if this file might not have run yet).
   While MODES.active === def the main loop calls:
     MODES.hookUpdate()  at the very top of update()   (return true from def.tick() to skip the normal wave simulation for that tick)
     MODES.hookDraw(ctx) at the very top of draw()      (return true from def.draw(ctx) to skip the normal drawing for that frame)
     MODES.hookWave()    at the top of spawnWave()      (return true from def.onWave() to replace the normal wave spawning)
   A mode starts itself in launch() and MUST call MODES.stop() when it ends (it clears MODES.active; the mode then returns the player to the lobby with enterLobby()). */
(function () {
  try {
    const M = window.MODES = window.MODES || {};
    M.list = {}; M.order = []; M.active = null;
    M.register = (def) => { if (!def || !def.id) return; if (!M.list[def.id]) M.order.push(def.id); M.list[def.id] = def; if (M.isOpen && M.isOpen()) M.paint(); };
    (window.MODE_QUEUE || []).forEach(M.register); window.MODE_QUEUE = { push: M.register };
    M.hookUpdate = () => { const a = M.active; try { return !!(a && a.tick && a.tick() === true); } catch (e) { console.error('[mode tick]', e); return false; } };
    M.hookDraw = (ctx) => { const a = M.active; try { return !!(a && a.draw && a.draw(ctx) === true); } catch (e) { console.error('[mode draw]', e); return false; } };
    M.hookWave = () => { const a = M.active; try { return !!(a && a.onWave && a.onWave() === true); } catch (e) { console.error('[mode wave]', e); return false; } };
    M.stop = () => { const a = M.active; M.active = null; try { if (a && a.stop) a.stop(); } catch (e) { console.error('[mode stop]', e); } };
    M.launch = (id, opts) => { const d = M.list[id]; if (!d) return; M.close(); M.stop(); M.active = d; try { d.launch(opts || {}); } catch (e) { console.error('[mode launch]', e); M.active = null; if (window.toast) toast('That mode could not start.'); } };

    const css = document.createElement('style');
    css.textContent = `#modes-modal{position:fixed;inset:0;z-index:300;background:rgba(6,5,4,.92);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px}
#modes-modal.hidden{display:none}
#modes-modal .mm-panel{width:min(760px,100%);margin:auto;background:#14110e;border:3px solid #4d4235;border-radius:6px;padding:16px;box-shadow:4px 4px 0 #0a0908}
#modes-modal h2{margin:0 0 4px;font-family:'Special Elite',monospace;color:#d9a441;font-size:24px}
#modes-modal .mm-sub{color:#9a8e7a;font-size:13px;margin-bottom:12px}
#modes-modal .mm-tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
#modes-modal .mm-tab{padding:6px 12px;border:2px solid #4d4235;background:#1d1812;color:#e8dec6;cursor:pointer;font:inherit;border-radius:4px}
#modes-modal .mm-tab.on{background:#d9a441;color:#14110e;border-color:#d9a441}
#modes-modal .mm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
#modes-modal .mm-card{background:#1d1812;border:2px solid #4d4235;border-radius:6px;padding:12px;display:flex;flex-direction:column;gap:6px}
#modes-modal .mm-card h3{margin:0;font-size:16px;color:#e8dec6;display:flex;align-items:center;gap:6px}
#modes-modal .mm-card p{margin:0;font-size:12px;color:#9a8e7a;flex:1}
#modes-modal .mm-tag{font-size:10px;text-transform:uppercase;letter-spacing:.08em;padding:2px 6px;border-radius:3px;background:#3a2f22;color:#d9a441;align-self:flex-start}
#modes-modal .mm-tag.pvp{background:#4a1f1a;color:#ff8a7a}
#modes-modal .mm-play{padding:8px;border:2px solid #8aa04a;background:#2a3318;color:#e8dec6;cursor:pointer;font:inherit;font-weight:700;border-radius:4px}
#modes-modal .mm-close{float:right;padding:4px 10px;border:2px solid #4d4235;background:#1d1812;color:#e8dec6;cursor:pointer;font:inherit;border-radius:4px}`;
    document.head.appendChild(css);
    const box = document.createElement('div'); box.id = 'modes-modal'; box.className = 'hidden';
    box.innerHTML = '<div class="mm-panel"><button class="mm-close" onclick="MODES.close()">Close</button><h2>Game modes</h2><div class="mm-sub">Pick a mode. Co-op and PvP modes can be played with a party.</div><div class="mm-tabs" id="mm-tabs"></div><div class="mm-grid" id="mm-grid"></div></div>';
    document.body.appendChild(box);
    let tab = 'all';
    M.isOpen = () => !box.classList.contains('hidden');
    M.paint = () => {
      const tabs = [['all', 'All'], ['pve', 'Co-op / Solo'], ['pvp', 'PvP']];
      document.getElementById('mm-tabs').innerHTML = tabs.map(([k, n]) => `<button class="mm-tab ${tab === k ? 'on' : ''}" onclick="MODES.tab('${k}')">${n}</button>`).join('');
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const ids = M.order.filter((id) => tab === 'all' || (M.list[id].tags || []).includes(tab));
      document.getElementById('mm-grid').innerHTML = ids.map((id) => { const d = M.list[id], pvp = (d.tags || []).includes('pvp');
        return `<div class="mm-card"><span class="mm-tag ${pvp ? 'pvp' : ''}">${pvp ? 'PvP' : 'Co-op / Solo'} · ${esc(d.players || '1')} players</span><h3>${esc(d.icon || '')} ${esc(d.name)}</h3><p>${esc(d.desc || '')}</p><button class="mm-play" onclick="MODES.launch('${id}')">Play</button></div>`; }).join('') || '<p style="color:#9a8e7a">No modes here yet.</p>';
    };
    M.tab = (k) => { tab = k; M.paint(); };
    M.open = () => { M.paint(); box.classList.remove('hidden'); };
    M.close = () => box.classList.add('hidden');
    window.openModes = () => M.open();
    // the classic wave mode is a mode too, so the picker is complete
    M.register({ id: 'waves', name: 'Wave survival', icon: '🧟', desc: 'The classic: survive endless waves, pick perks, beat bosses. Solo or co-op with up to 4.', tags: ['pve'], players: '1-4', launch() { M.active = null; if (window.realStart) realStart(); } });
  } catch (e) { console.error('[modes-core]', e); }
})();
