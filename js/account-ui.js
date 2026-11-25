// Account button + sign-in dialog for the Herb shell, plus the admin-only Admin app.
(function () {
  if (!window.HerbAuth || !HerbAuth.available()) return;
  var $ = function (id) { return document.getElementById(id); }, I = HerbIcons.glyph;
  var ADMIN = { id: 'admin', title: 'Admin', icon: 'admin', src: '/apps/admin.html', w: 980, h: 660 };

  // ---- account button ----
  var chip = document.createElement('button'); chip.id = 'acctchip'; chip.className = 'tray';
  function place() {
    if (HerbDesktop.ui === 'ipad') { var bar = $('ipbar'); if (bar && bar.lastChild) bar.lastChild.insertBefore(chip, bar.lastChild.firstChild); else document.body.appendChild(chip); }
    else if (HerbDesktop.ui === 'standard') ($('sideacct') || $('taskbar')).appendChild(chip);
    else $('tbtray').insertBefore(chip, $('trayinfo'));
  }
  place();

  // ---- dialog ----
  var dlg = document.createElement('div'); dlg.id = 'acct'; dlg.innerHTML =
    '<div class="box"><button class="x" id="acct-x" title="Close">' + I('close', 16) + '</button>' +
    '<div id="acct-out"><h3>Herb account</h3><p class="sub">Just a username and password. No email.</p>' +
    '<div class="seg"><button data-m="in" class="on">Sign in</button><button data-m="up">Create account</button></div>' +
    '<input id="acct-u" placeholder="Username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20">' +
    '<input id="acct-p" type="password" placeholder="Password (8+ characters)" autocomplete="current-password">' +
    '<input id="acct-p2" type="password" placeholder="Repeat password" autocomplete="new-password" style="display:none">' +
    '<div class="err" id="acct-e"></div><button class="go" id="acct-go">Sign in</button>' +
    '<p class="fine">There is no password reset, because there is no email. Write your password down somewhere safe.</p></div>' +
    '<div id="acct-in" style="display:none"><h3 id="acct-name"></h3><p class="sub" id="acct-role"></p><p class="fine">Your settings (theme, taskbar, search engine and more) sync to every device you sign in on.</p><button class="go alt" id="acct-so">Sign out</button></div></div>';
  document.body.appendChild(dlg);
  var mode = 'in';
  function setMode(m) {
    mode = m; dlg.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === m); });
    $('acct-p2').style.display = m === 'up' ? '' : 'none'; $('acct-go').textContent = m === 'up' ? 'Create account' : 'Sign in';
    $('acct-p').autocomplete = m === 'up' ? 'new-password' : 'current-password'; $('acct-e').textContent = '';
  }
  dlg.querySelectorAll('.seg button').forEach(function (b) { b.onclick = function () { setMode(b.dataset.m); }; });
  function show() { var st = HerbAuth.state(); $('acct-out').style.display = st.user ? 'none' : ''; $('acct-in').style.display = st.user ? '' : 'none'; dlg.classList.add('on'); if (!st.user) setTimeout(function () { $('acct-u').focus(); }, 50); }
  function hide() { dlg.classList.remove('on'); }
  $('acct-x').onclick = hide; dlg.addEventListener('pointerdown', function (e) { if (e.target === dlg) hide(); });
  chip.onclick = function (e) { e.stopPropagation(); show(); };
  var busy = false;
  function go() {
    if (busy) return; var u = $('acct-u').value, p = $('acct-p').value, e = $('acct-e');
    if (mode === 'up' && p !== $('acct-p2').value) { e.textContent = 'Passwords do not match.'; return; }
    busy = true; $('acct-go').disabled = true; e.textContent = '';
    (mode === 'up' ? HerbAuth.signUp(u, p) : HerbAuth.signIn(u, p)).then(function () { $('acct-p').value = $('acct-p2').value = ''; hide(); })
      .catch(function (er) { e.textContent = er.message; }).then(function () { busy = false; $('acct-go').disabled = false; });
  }
  $('acct-go').onclick = go;
  dlg.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); if (e.key === 'Escape') hide(); });
  $('acct-so').onclick = function () { HerbAuth.signOut(); hide(); };

  // start-menu entry
  var foot = document.querySelector('#start .sm-foot');
  if (foot) { var sb = document.createElement('button'); sb.id = 'sm-acct'; sb.innerHTML = I('shield', 16) + 'Account'; sb.onclick = function () { $('start').classList.remove('on'); $('start-btn').classList.remove('on'); show(); }; foot.insertBefore(sb, foot.firstChild); }

  // ---- react to sign-in state ----
  HerbAuth.onChange(function (st) {
    chip.innerHTML = I('user', 14) + '<span class="lbl">' + (st.user ? st.name : 'Sign in') + '</span>';
    chip.title = st.user ? 'Signed in as ' + st.name : 'Sign in or create an account';
    if (st.user) { $('acct-name').textContent = st.name; $('acct-role').textContent = st.owner ? 'Owner' : st.admin ? 'Admin' : 'Member'; }
    if (dlg.classList.contains('on')) show();
    if (st.admin) HerbDesktop.addApp(ADMIN); else HerbDesktop.removeApp('admin');
  });
  HerbAuth.startPresence();
})();
