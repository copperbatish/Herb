// Herb icon set: hand-drawn 24px glyphs rendered on gradient squircles.
(function () {
  var G = {
    browser: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    vm: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    movies: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>',
    games: '<path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 3.4a2 2 0 0 1-3.4.9L15 15H9l-2 1.8a2 2 0 0 1-3.4-.9L3 12.5A4 4 0 0 1 7 8z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13" r=".6" fill="currentColor"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h3M11 12h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><circle cx="9" cy="12" r="0"/>',
    leaf: '<path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15z"/><path d="M5 19c3-5 6-8 10-10"/>',
    appearance: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
    proxy: '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>', min: '<path d="M6 12h12"/>', max: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    code: '<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
    home: '<path d="M4 11l8-7 8 7M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6"/>',
    admin: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8.5l1.1 2.3 2.5.3-1.9 1.7.5 2.5-2.2-1.3-2.2 1.3.5-2.5-1.9-1.7 2.5-.3z"/>',
    mineplacer: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    cloud: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.6 4.5 4.5 0 0 1 17.5 18z"/>',
    ui: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    store: '<path d="M5 8h14l-1 11H6z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
    shows: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M10.5 8.5v4l3.5-2z" fill="currentColor"/>',
    apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  };
  var COLORS = {
    browser: ['#34d399', '#0d9488'], chat: ['#60a5fa', '#4f46e5'], vm: ['#fb923c', '#e11d48'],
    movies: ['#f472b6', '#9333ea'], cloud: ['#38bdf8', '#4f46e5'], games: ['#a3e635', '#16a34a'], settings: ['#94a3b8', '#475569'],
    ai: ['#6ee7b7', '#0f766e'], admin: ['#fbbf24', '#dc2626'], mineplacer: ['#a78bfa', '#6d28d9'], store: ['#38bdf8', '#2563eb'], shows: ['#f87171', '#b91c1c'],
  };
  window.HerbIcons = {
    glyph: function (name, size, stroke) {
      return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (stroke || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + (G[name] || '') + '</svg>';
    },
    // gradient squircle with white glyph
    tile: function (name, px, c) {
      c = c || COLORS[name] || ['#34d399', '#0d9488']; px = px || 56;
      return '<span class="hicon" style="width:' + px + 'px;height:' + px + 'px;border-radius:' + Math.round(px * .27) + 'px;background:linear-gradient(145deg,' + c[0] + ',' + c[1] + ');color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.35)">' + HerbIcons.glyph(name, Math.round(px * .54), 1.7) + '</span>';
    },
    letter: function (ch, px, c) {
      c = c || ['#34d399', '#0d9488']; px = px || 56;
      return '<span class="hicon" style="width:' + px + 'px;height:' + px + 'px;border-radius:' + Math.round(px * .27) + 'px;background:linear-gradient(145deg,' + c[0] + ',' + c[1] + ');color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:' + Math.round(px * .42) + 'px;box-shadow:0 6px 16px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.3)">' + ch + '</span>';
    },
    colors: COLORS,
  };
})();
