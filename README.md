# Herb (jsDelivr bundle)

This repo holds the prebuilt files that the Herb launcher loads through [jsDelivr](https://www.jsdelivr.com/):

- `dist/herb.js`, `dist/herb.css`: the Herb desktop
- `shows.json`: the Shows catalog
- `dist/herb-jsdelivr.html`: a tiny launcher. Save it and open it. It fetches the files above from
  `https://cdn.jsdelivr.net/gh/copperbatish/Herb@main/` on every load and keeps the last working copy as an offline fallback.

jsDelivr serves JS, CSS and JSON but not web pages, so the launcher itself stays a local file. Apps that need a service worker
(the proxy browser, games, Mineplacer) still load from the Herb site.

This webpage also links to herb supported html files, it works anywhere that supports html files.
