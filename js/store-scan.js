// Herb App Store safety scan. Used when someone uploads an app and again in the admin queue.
// HONEST NOTE: no scanner can prove a file is safe. This catches the obvious bad stuff (miners, obfuscated loaders,
// phishing forms, redirects). The real protections are (1) an admin reads every app before approving, and (2) approved HTML
// apps run in a locked sandbox: no network, no access to Herb data, no top-level navigation (see apps/community.html).
(function () {
  var MAX_HTML = 300 * 1024;
  var BLOCK = [   // [regex, message]  -> the upload is rejected
    [/coin-?hive|cryptonight|cryptoloot|jsecoin|authedmine|minero\.cc|webminepool|coinimp|stratum\+(tcp|ssl)/i, 'Looks like a crypto miner.'],
    [/\b(eval|Function)\s*\(\s*(atob|unescape|decodeURIComponent|String\.fromCharCode)\b/i, 'Runs hidden (decoded) code.'],
    [/\beval\s*\(\s*(function|\w+\s*\()?\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]/i, 'Packed/obfuscated script (p,a,c,k,e,d).'],
    [/<input[^>]+type\s*=\s*["']?password/i, 'Asks for a password (looks like a phishing page).'],
    [/<form[^>]+action\s*=\s*["']?\s*(https?:)?\/\//i, 'Form that sends data to another site.'],
    [/\b(window\.)?(top|parent)\s*\.\s*location\b/i, 'Tries to redirect the whole page.'],
    [/\b(window\.|document\.|self\.)?location\s*(\.(href|replace|assign)\s*(=|\()|=)\s*\(?\s*["'`]\s*(https?:)?\/\//i, 'Redirects to another website.'],
    [/<meta[^>]+http-equiv\s*=\s*["']?refresh/i, 'Auto-redirects to another page.'],
    [/\bdocument\.cookie\b/i, 'Reads or writes cookies.'],
    [/javascript:\s*(?!void\(0\))/i, 'Uses javascript: links.'],
  ];
  var WARN = [    // shown to the admin, doesn't block
    [/\bnew\s+WebSocket\s*\(|\bXMLHttpRequest\b|\bfetch\s*\(|navigator\.sendBeacon/i, 'Tries to use the network (blocked when the app runs).'],
    [/\bwindow\.open\s*\(/i, 'Opens pop-up windows (blocked when the app runs).'],
    [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/i, 'Uses browser storage (isolated, nothing is saved between runs).'],
    [/<iframe/i, 'Embeds another page (blocked when the app runs).'],
    [/<(object|embed)\b/i, 'Embeds plugin content.'],
    [/\bdownload\s*=/i, 'Tries to start a download (blocked when the app runs).'],
    [/\bnavigator\.(clipboard|geolocation|mediaDevices)\b/i, 'Asks for clipboard, location, camera or microphone.'],
    [/\bdocument\.write\s*\(/i, 'Uses document.write.'],
    [/\beval\s*\(|\bnew\s+Function\s*\(/i, 'Uses eval / new Function.'],
  ];
  function hosts(src) {
    var out = {}, re = /(?:src|href)\s*=\s*["']?(https?:)?\/\/([^\/"'>\s?#]+)/ig, m;
    while ((m = re.exec(src))) out[m[2].toLowerCase()] = 1;
    return Object.keys(out);
  }
  function scanHtml(text, name) {
    var r = { blocked: [], warnings: [], ok: true }, s = String(text || '');
    if (/\.html?$/i.test(name || '') === false && name) r.blocked.push('Only .html files are allowed.');
    if (!s.trim()) r.blocked.push('The file is empty.');
    if (s.length > MAX_HTML) r.blocked.push('File is bigger than ' + Math.round(MAX_HTML / 1024) + ' KB.');
    if (/\u0000/.test(s)) r.blocked.push('Contains binary data, not a normal web page.');
    BLOCK.forEach(function (b) { if (b[0].test(s)) r.blocked.push(b[1]); });
    WARN.forEach(function (w) { if (w[0].test(s)) r.warnings.push(w[1]); });
    var hex = (s.match(/_0x[a-f0-9]{4,}/gi) || []).length; if (hex > 40) r.blocked.push('Heavily obfuscated code (' + hex + ' scrambled names).');
    var esc = (s.match(/\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/gi) || []).length; if (esc > 400) r.warnings.push('Lots of escaped characters: may be hiding something.');
    var longest = s.split('\n').reduce(function (a, l) { return Math.max(a, l.length); }, 0); if (longest > 20000) r.warnings.push('Very long lines: minified or packed code, hard to review.');
    var b64 = (s.match(/[A-Za-z0-9+\/]{3000,}={0,2}/g) || []).length; if (b64) r.warnings.push('Contains big encoded blobs (' + b64 + ').');
    var ext = hosts(s).filter(function (h) { return h !== 'cdnjs.cloudflare.com'; });
    if (ext.length) r.warnings.push('Links to other sites (only cdnjs.cloudflare.com scripts load; everything else is blocked): ' + ext.slice(0, 6).join(', ') + (ext.length > 6 ? '…' : ''));
    r.ok = !r.blocked.length; return r;
  }
  function scanLink(url) {
    var r = { blocked: [], warnings: [], ok: true }, u;
    try { u = new URL(String(url).trim()); } catch (e) { r.blocked.push('That isn’t a valid web address.'); r.ok = false; return r; }
    if (u.protocol !== 'https:') r.blocked.push('Links must start with https://');
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || u.hostname.indexOf(':') >= 0) r.blocked.push('Links to a private or numeric address are not allowed.');
    if (u.username || u.password) r.blocked.push('Links with a username or password inside are not allowed.');
    if (/(^|\.)(herb-games\.(web\.app|firebaseapp\.com)|copperchat-4cb91\.(web\.app|firebaseapp\.com)|jsdelivr\.net)$/i.test(u.hostname)) r.blocked.push('Links to Herb itself aren\u2019t allowed.');
    if (/xn--/i.test(u.hostname)) r.warnings.push('Address uses look-alike (punycode) characters.');
    if (/^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|ow\.ly|cutt\.ly|rb\.gy)$/i.test(u.hostname)) r.blocked.push('Link shorteners hide where a link goes.');
    r.warnings.push('Links can’t be scanned: an admin has to look at the page itself.');
    r.ok = !r.blocked.length; return r;
  }
  window.HerbStoreScan = { scanHtml: scanHtml, scanLink: scanLink, MAX_HTML: MAX_HTML };
})();
