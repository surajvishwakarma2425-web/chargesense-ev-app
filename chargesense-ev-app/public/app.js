(function () {
'use strict';
var ROAD = 1.3;                                   // straight-line to road distance factor
var DEF = { lat: 19.033, lng: 73.0297 };
var loc = { lat: DEF.lat, lng: DEF.lng, demo: true };
var stations = [], chargers = [], mine = [], reqs = [], me = null, token = '', cur = null, authMode = 'login';
try { token = localStorage.getItem('cs_token') || ''; } catch (e) {}

function $(i) { return document.getElementById(i); }
function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }
function toast(m) {
  var t = $('toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 3400);
}
function api(p, o) {
  o = o || {};
  var h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return fetch(p, { method: o.method || 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
}
function dist(a, b, c, d) {
  var R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180;
  var q = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) * Math.sin(y / 2);
  return 2 * R * Math.asin(Math.sqrt(q));
}
function road(lat, lng) { return dist(loc.lat, loc.lng, lat, lng) * ROAD; }
function money(n) { return '₹' + Number(n).toFixed(2).replace(/\.00$/, ''); }

/* ---------- location and public stations ---------- */
function setLoc(lat, lng, demo) {
  loc = { lat: lat, lng: lng, demo: demo };
  $('locTxt').textContent = demo ? 'Using the demo location (Navi Mumbai).' : 'Using your location (' + lat.toFixed(3) + ', ' + lng.toFixed(3) + ').';
  syncStations();
}
function syncStations() {
  S.length = 0;                                   // S and render() come from insights.js
  stations.forEach(function (s) {
    S.push({ n: s.n, a: s.a, km: +road(s.lat, s.lng).toFixed(1), kw: s.kw, c: s.c, s: s.s, p: s.p });
  });
  render();
}
$('useLoc').onclick = function () {
  if (!navigator.geolocation) { toast('Location is not available in this browser'); return; }
  navigator.geolocation.getCurrentPosition(function (p) { setLoc(p.coords.latitude, p.coords.longitude, false); check(); },
    function () { toast('Could not get your location. Using the demo location.'); });
};
$('demoLoc').onclick = function () { setLoc(DEF.lat, DEF.lng, true); check(); };

/* ---------- Range Rescue ---------- */
var reach = {};
function check() {
  var range = parseFloat($('rng').value);
  if (!(range > 0)) { toast('Enter your range in km'); return; }
  var usable = range * 0.9;                       // keep a 10% safety buffer
  var st = stations.map(function (s) { return { s: s, d: road(s.lat, s.lng) }; }).sort(function (a, b) { return a.d - b.d; });
  var cs = chargers.filter(function (c) { return !me || c.ownerId !== me.id; })
    .map(function (c) { return { c: c, d: road(c.lat, c.lng) }; }).sort(function (a, b) { return a.d - b.d; });
  var ok = cs.filter(function (x) { return x.d <= usable; });
  var near = st[0], msg;
  if (!near) msg = 'No public stations found.';
  else if (near.d <= usable) msg = near.s.n + ' is about ' + near.d.toFixed(1) + ' km away, inside your safe range of ' + usable.toFixed(1) + ' km. You can reach it.';
  else msg = 'Nearest public charger: ' + near.s.n + ', about ' + near.d.toFixed(1) + ' km away. Your safe range is ' + usable.toFixed(1) + ' km, so you may not reach it. ' +
    (ok.length ? ok.length + (ok.length > 1 ? ' citizen chargers are' : ' citizen charger is') + ' within reach.' : 'No citizen chargers are within reach. Drive gently, switch off air conditioning and call roadside help.');
  $('rescueOut').textContent = msg;
  reach = {};
  var el = $('cList');
  if (!ok.length) el.innerHTML = '<li class="empty">No citizen chargers within ' + usable.toFixed(1) + ' km.</li>';
  else el.innerHTML = ok.map(function (x) {
    reach[x.c.id] = x.d;
    return '<li class="st"><div><h3>' + esc(x.c.title) + '</h3><div class="meta">' + esc(x.c.area) + ' · ' + x.d.toFixed(1) + ' km away (estimated) · owner ' + esc(x.c.ownerName) +
      '</div><div class="meta">' + esc(x.c.plug) + ' · ' + x.c.kw + ' kW · ' + money(x.c.price) + '/kWh</div></div>' +
      '<button class="btn sm" data-act="request" data-id="' + esc(x.c.id) + '">Request</button></li>';
  }).join('');
  radar(range, usable, st, cs);
}
function radar(range, usable, st, cs) {
  var C = 180, sr = range / ROAD, far = st.length ? st[0].d / ROAD : 0;
  var k = 150 / (Math.max(sr, far) * 1.15), kx = 111 * Math.cos(loc.lat * Math.PI / 180);
  function pos(lat, lng) { return [C + (lng - loc.lng) * kx * k, C - (lat - loc.lat) * 111 * k]; }
  function inside(p) { return Math.abs(p[0] - C) < 172 && Math.abs(p[1] - C) < 172; }
  var h = '<circle cx="180" cy="180" r="150" class="r0"/><circle cx="180" cy="180" r="75" class="r0"/>' +
    '<circle cx="180" cy="180" r="' + (usable / ROAD * k).toFixed(1) + '" class="rr"/>';
  st.forEach(function (x) {
    var p = pos(x.s.lat, x.s.lng); if (!inside(p)) return;
    h += '<rect x="' + (p[0] - 5).toFixed(1) + '" y="' + (p[1] - 5).toFixed(1) + '" width="10" height="10" class="' + (x.d <= usable ? 'sOn' : 'sOff') + '"><title>' + esc(x.s.n) + '</title></rect>';
  });
  cs.forEach(function (x) {
    var p = pos(x.c.lat, x.c.lng); if (!inside(p)) return;
    h += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="6" class="' + (x.d <= usable ? 'cOn' : 'cOff') + '"><title>' + esc(x.c.title) + '</title></circle>';
  });
  h += '<circle cx="180" cy="180" r="6" class="me"><title>You</title></circle>';
  $('radar').innerHTML = h;
}
$('check').onclick = check;

/* ---------- auth ---------- */
function renderAuth() {
  $('authArea').innerHTML = me
    ? '<span class="meta">Hi, ' + esc(me.name) + '</span><button class="chip" data-act="logout">Log out</button>'
    : '<button class="chip" data-act="login">Log in</button><button class="chip" data-act="register">Sign up</button>';
}
function openAuth(mode) {
  authMode = mode;
  $('authTitle').textContent = mode === 'login' ? 'Log in' : 'Create account';
  $('nameRow').hidden = mode === 'login';
  $('swapAuth').textContent = mode === 'login' ? 'Create account instead' : 'I already have an account';
  $('aPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('aErr').textContent = '';
  $('authDlg').showModal();
}
$('swapAuth').onclick = function () { openAuth(authMode === 'login' ? 'register' : 'login'); };
$('closeAuth').onclick = function () { $('authDlg').close(); };
$('authForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var body = { email: $('aEmail').value, password: $('aPass').value };
  if (authMode === 'register') body.name = $('aName').value;
  api('/api/' + authMode, { method: 'POST', body: body }).then(function (r) {
    token = r.token; me = r.user;
    try { localStorage.setItem('cs_token', token); } catch (x) {}
    $('authDlg').close(); $('authForm').reset(); afterAuth(); toast('Welcome, ' + me.name);
  }).catch(function (err) { $('aErr').textContent = err.message; });
});
function afterAuth() {
  renderAuth(); renderShare(); renderReqs();
  api('/api/chargers').then(function (c) { chargers = c; check(); });
  loadMine();
}
function logout() {
  api('/api/logout', { method: 'POST' }).catch(function () {}).then(function () {
    token = ''; me = null; mine = []; reqs = [];
    try { localStorage.removeItem('cs_token'); } catch (x) {}
    afterAuth(); toast('Logged out');
  });
}

/* ---------- owner: share a charger ---------- */
function renderShare() {
  var b = $('shareBody');
  if (!me) { b.innerHTML = '<div class="card"><p>Log in to list your charger and manage requests.</p><button class="btn" data-act="login">Log in</button></div>'; return; }
  b.innerHTML = '<div class="card"><h3>List a charger</h3><form id="chForm" class="fgrid">' +
    '<label>Name<input name="title" required maxlength="60" placeholder="Home wall box"></label>' +
    '<label>Area (shown to drivers)<input name="area" required maxlength="60" placeholder="Sector 22"></label>' +
    '<label>Exact address (shown only after you approve)<input name="address" required maxlength="120"></label>' +
    '<label>Phone (shown only after you approve)<input name="phone" required maxlength="20"></label>' +
    '<label>Plug<select name="plug"><option>Type 2</option><option>CCS2</option><option>CHAdeMO</option><option>Bharat AC</option></select></label>' +
    '<label>Power (kW)<input name="kw" type="number" required min="1" max="350" value="7"></label>' +
    '<label>Price per kWh (₹)<input name="price" type="number" required min="0" max="100" step="0.5" value="12"></label>' +
    '<label>Latitude<input name="lat" type="number" step="any" required value="' + loc.lat.toFixed(5) + '"></label>' +
    '<label>Longitude<input name="lng" type="number" step="any" required value="' + loc.lng.toFixed(5) + '"></label>' +
    '<div class="row"><button class="btn" type="submit">List charger</button><button class="chip" type="button" data-act="fillLoc">Use my location</button></div>' +
    '</form></div><ul class="list" id="myList"></ul>';
  $('chForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var o = {}; new FormData(e.target).forEach(function (v, k) { o[k] = v; });
    api('/api/chargers', { method: 'POST', body: o }).then(function () {
      toast('Charger listed'); e.target.reset(); loadMine(); api('/api/chargers').then(function (c) { chargers = c; });
    }).catch(function (err) { toast(err.message); });
  });
  renderMine();
}
function renderMine() {
  var el = $('myList'); if (!el) return;
  el.innerHTML = mine.length ? mine.map(function (c) {
    return '<li class="st"><div><h3>' + esc(c.title) + '</h3><div class="meta">' + esc(c.area) + ' · ' + esc(c.plug) + ' · ' + c.kw + ' kW · ' + (c.available ? 'visible to drivers' : 'hidden') + '</div>' +
      '<div class="row" style="margin:8px 0 0"><label class="meta" for="pr-' + esc(c.id) + '">₹/kWh</label><input class="sm" type="number" id="pr-' + esc(c.id) + '" value="' + c.price + '" min="0" max="100" step="0.5">' +
      '<button class="chip" data-act="price" data-id="' + esc(c.id) + '">Save price</button></div></div>' +
      '<div class="col"><button class="chip" data-act="toggle" data-id="' + esc(c.id) + '">' + (c.available ? 'Hide' : 'Show') + '</button>' +
      '<button class="chip" data-act="del" data-id="' + esc(c.id) + '">Delete</button></div></li>';
  }).join('') : '<li class="empty">You have not listed a charger yet.</li>';
}
function loadMine() {
  if (!me) return;
  Promise.all([api('/api/chargers/mine'), api('/api/requests')]).then(function (r) {
    mine = r[0]; reqs = r[1]; renderMine(); renderReqs();
  }).catch(function () {});
}

/* ---------- requests ---------- */
function reqItem(r) {
  var owner = r.role === 'owner', h = '<li class="st"><div><h3>' + esc(r.chargerTitle) + ' <span class="pill ' + esc(r.status) + '">' + esc(r.status) + '</span></h3>';
  h += '<div class="meta">' + (owner ? 'Driver: ' + esc(r.driverName) : 'Owner: ' + esc(r.ownerName)) + ' · needs ' + r.kwhNeeded + ' kWh · estimate ' + money(r.estimate) + '</div>';
  if (r.note) h += '<div class="meta">Note: ' + esc(r.note) + '</div>';
  if (r.address) h += '<div class="meta">Address: ' + esc(r.address) + ' · Phone: ' + esc(r.phone) + '</div>';
  if (r.status === 'completed') h += '<div class="meta"><b>Delivered ' + r.kwhDelivered + ' kWh. Fee ' + money(r.fee) + '.</b> ' + (owner ? 'Collect this from the driver.' : 'Pay the owner directly.') + '</div>';
  h += '</div><div class="col">';
  if (owner && r.status === 'pending') h += '<button class="btn sm" data-act="approve" data-id="' + esc(r.id) + '">Approve</button><button class="chip" data-act="reject" data-id="' + esc(r.id) + '">Decline</button>';
  if (owner && r.status === 'approved') h += '<input class="sm" type="number" id="kw-' + esc(r.id) + '" min="0.1" max="100" step="0.1" value="' + r.kwhNeeded + '" aria-label="kWh delivered"><button class="btn sm" data-act="complete" data-id="' + esc(r.id) + '">Finish and charge fee</button>';
  if (!owner && (r.status === 'pending' || r.status === 'approved')) h += '<button class="chip" data-act="cancel" data-id="' + esc(r.id) + '">Cancel</button>';
  return h + '</div></li>';
}
function renderReqs() {
  var b = $('reqBody');
  if (!me) { b.innerHTML = '<div class="card"><p>Log in to see your requests.</p></div>'; return; }
  function list(a) { return a.length ? '<ul class="list">' + a.map(reqItem).join('') + '</ul>' : '<p class="hint">Nothing here yet.</p>'; }
  b.innerHTML = '<h3 class="sub">Requests to my chargers</h3>' + list(reqs.filter(function (r) { return r.role === 'owner'; })) +
    '<h3 class="sub">My requests</h3>' + list(reqs.filter(function (r) { return r.role === 'driver'; }));
}
function openReq(id) {
  if (!me) { toast('Log in to request a charger'); openAuth('login'); return; }
  cur = chargers.filter(function (c) { return c.id === id; })[0]; if (!cur) return;
  $('reqInfo').textContent = cur.title + ' · ' + cur.plug + ' · ' + cur.kw + ' kW · ' + money(cur.price) + '/kWh · owner ' + cur.ownerName;
  $('rErr').textContent = ''; estimate(); $('reqDlg').showModal();
}
function estimate() {
  var k = parseFloat($('rKwh').value) || 0;
  $('rEst').textContent = 'Estimated cost: ' + money(k * cur.price) + '. The final fee is based on the energy actually delivered.';
}
$('rKwh').addEventListener('input', function () { if (cur) estimate(); });
$('closeReq').onclick = function () { $('reqDlg').close(); };
$('reqForm').addEventListener('submit', function (e) {
  e.preventDefault();
  api('/api/requests', { method: 'POST', body: { chargerId: cur.id, kwhNeeded: $('rKwh').value, note: $('rNote').value } }).then(function () {
    $('reqDlg').close(); toast('Request sent. The owner must approve it.'); loadMine();
    document.getElementById('requests').scrollIntoView({ behavior: 'smooth' });
  }).catch(function (err) { $('rErr').textContent = err.message; });
});

/* ---------- click actions ---------- */
function act(a, id) {
  var fail = function (err) { toast(err.message); }, done = function (m) { return function () { toast(m); loadMine(); api('/api/chargers').then(function (c) { chargers = c; }); }; };
  if (a === 'login' || a === 'register') openAuth(a);
  else if (a === 'logout') logout();
  else if (a === 'request') openReq(id);
  else if (a === 'fillLoc') { var f = $('chForm'); f.lat.value = loc.lat.toFixed(5); f.lng.value = loc.lng.toFixed(5); toast('Filled with your current location'); }
  else if (a === 'toggle') { var c = mine.filter(function (x) { return x.id === id; })[0]; api('/api/chargers/' + id, { method: 'PATCH', body: { available: !c.available } }).then(done('Updated')).catch(fail); }
  else if (a === 'price') api('/api/chargers/' + id, { method: 'PATCH', body: { price: $('pr-' + id).value } }).then(done('Price saved')).catch(fail);
  else if (a === 'del') { if (confirm('Delete this charger?')) api('/api/chargers/' + id, { method: 'DELETE' }).then(done('Deleted')).catch(fail); }
  else if (a === 'approve' || a === 'reject') api('/api/requests/' + id + '/respond', { method: 'POST', body: { action: a } }).then(done(a === 'approve' ? 'Approved. The driver can now see your address.' : 'Declined')).catch(fail);
  else if (a === 'complete') api('/api/requests/' + id + '/complete', { method: 'POST', body: { kwhDelivered: $('kw-' + id).value } }).then(done('Session finished and fee recorded')).catch(fail);
  else if (a === 'cancel') api('/api/requests/' + id + '/cancel', { method: 'POST', body: {} }).then(done('Request cancelled')).catch(fail);
}
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('[data-act]') : null;
  if (t) act(t.getAttribute('data-act'), t.getAttribute('data-id'));
});

/* ---------- start ---------- */
setLoc(DEF.lat, DEF.lng, true);
Promise.all([api('/api/stations'), api('/api/chargers')]).then(function (r) {
  stations = r[0]; chargers = r[1]; syncStations(); check();
}).catch(function () { toast('Could not reach the server. Start it with: node server.js'); });
if (token) api('/api/me').then(function (r) { me = r.user; if (!me) token = ''; afterAuth(); }).catch(function () { afterAuth(); });
else afterAuth();
setInterval(loadMine, 15000);
})();
