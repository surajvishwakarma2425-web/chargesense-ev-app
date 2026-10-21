'use strict';
// ChargeSense server: static files + JSON API. No npm packages needed (Node 18+).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const CENTER = { lat: 19.033, lng: 73.0297 };           // demo area (Navi Mumbai)
const PLUGS = ['CCS2', 'Type 2', 'CHAdeMO', 'Bharat AC'];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

/* ---------- helpers ---------- */
const rad = x => x * Math.PI / 180;
const off = (n, e) => ({ lat: +(CENTER.lat + n / 111).toFixed(5), lng: +(CENTER.lng + e / (111 * Math.cos(rad(CENTER.lat)))).toFixed(5) });
const uid = () => crypto.randomUUID().slice(0, 8);
const round2 = x => Math.round(x * 100) / 100;
function hashPw(pw) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); }
function checkPw(pw, stored) {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(crypto.scryptSync(pw, salt, 32).toString('hex')), b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- database (JSON file) ---------- */
function seed() {
  const users = [
    { id: 'u1', name: 'Aarav Owner', email: 'owner@demo.com', pw: hashPw('demo1234') },
    { id: 'u2', name: 'Priya Shah', email: 'priya@demo.com', pw: hashPw('demo1234') },
    { id: 'u3', name: 'Rohan Driver', email: 'driver@demo.com', pw: hashPw('demo1234') }];
  const st = (id, n, a, north, east, kw, c, s, p) => ({ id, n, a, ...off(north, east), kw, c, s, p });
  const stations = [
    st('s1', 'Highway Plaza Hub', 'Expressway, Exit 12', 12, 9.6, 60, ['CCS2', 'CHAdeMO'], 'free', 18),
    st('s2', 'Airport Road Fast Charge', 'Airport road', -16, 10, 50, ['CCS2', 'CHAdeMO', 'Type 2'], 'busy', 19),
    st('s3', 'Metro Station Point', 'South side', -14, -12, 7, ['Type 2'], 'off', 10),
    st('s4', 'Mall Parking Chargers', 'East mall', 9, 18, 22, ['Type 2', 'Bharat AC'], 'busy', 14),
    st('s5', 'Tech Park Chargers', 'Tech park', 20, 5, 60, ['CCS2'], 'free', 20),
    st('s6', 'Green Park Chargers', 'North ring road', 25, 0, 120, ['CCS2'], 'free', 21)];
  const ch = (id, ownerId, title, area, address, phone, north, east, plug, kw, price) =>
    ({ id, ownerId, title, area, address, phone, ...off(north, east), plug, kw, price, available: true, createdAt: Date.now() });
  const chargers = [
    ch('c1', 'u1', 'Home wall box', 'Sector 22', 'Plot 14, Sector 22 (gate with blue board)', '+91 98000 00001', 2.5, 1.5, 'Type 2', 7, 12),
    ch('c2', 'u1', 'Villa garage socket', 'Sector 9', 'Villa 6, Sector 9, near garden', '+91 98000 00001', -3, 4, 'Bharat AC', 3, 9),
    ch('c3', 'u2', 'Society fast AC', 'Residency Society', 'Block B parking, Residency Society', '+91 98000 00002', 5, -4, 'Type 2', 11, 14),
    ch('c4', 'u2', 'Shop front CCS2', 'Market Road', 'Shop 3, Market Road', '+91 98000 00002', 6.5, 5, 'CCS2', 25, 20),
    ch('c5', 'u1', 'Farmhouse charger', 'Outer farms', 'Farm gate 2, Outer Farms', '+91 98000 00001', 12, -1, 'Type 2', 7, 11)];
  return { users, stations, chargers, requests: [], sessions: {} };
}
let db;
function load() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { db = seed(); save(); }
  const now = Date.now();
  for (const t of Object.keys(db.sessions)) if (db.sessions[t].exp < now) delete db.sessions[t];
}
function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* ---------- http utils ---------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
const fail = (status, error) => { const e = new Error(error); e.status = status; return e; };
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 100000) { reject(fail(413, 'Request too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(fail(400, 'Invalid JSON')); } });
  });
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const s = db.sessions[h.startsWith('Bearer ') ? h.slice(7) : ''];
  return s && s.exp > Date.now() ? db.users.find(u => u.id === s.uid) || null : null;
}
const needUser = u => { if (!u) throw fail(401, 'Please log in first'); return u; };
const str = (v, min, max, label) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw fail(400, `${label} must be ${min}-${max} characters`);
  return s;
};
const num = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw fail(400, `${label} must be between ${min} and ${max}`);
  return n;
};
const publicCharger = c => {
  const o = db.users.find(u => u.id === c.ownerId);
  return { id: c.id, ownerId: c.ownerId, ownerName: o ? o.name : 'Owner', title: c.title, area: c.area, plug: c.plug, kw: c.kw, price: c.price,
    lat: +c.lat.toFixed(3), lng: +c.lng.toFixed(3) };   // approximate location until the owner approves
};
function reqView(r, viewer) {
  const c = db.chargers.find(x => x.id === r.chargerId) || {};
  const d = db.users.find(x => x.id === r.driverId) || {}, o = db.users.find(x => x.id === r.ownerId) || {};
  const reveal = r.status === 'approved' || r.status === 'completed';
  return { id: r.id, status: r.status, role: viewer.id === r.ownerId ? 'owner' : 'driver', kwhNeeded: r.kwhNeeded, note: r.note,
    createdAt: r.createdAt, kwhDelivered: r.kwhDelivered, fee: r.fee, estimate: round2(r.kwhNeeded * (c.price || 0)),
    chargerTitle: c.title, plug: c.plug, kw: c.kw, price: c.price, driverName: d.name, ownerName: o.name,
    address: reveal ? c.address : undefined, phone: reveal ? c.phone : undefined };
}

/* ---------- API ---------- */
const fails = {};
async function api(req, res, url) {
  const m = req.method, p = url.pathname, user = authUser(req);
  let mt;

  if (m === 'POST' && p === '/api/register') {
    const b = await readBody(req);
    const name = str(b.name, 2, 40, 'Name'), email = str(b.email, 5, 80, 'Email').toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw fail(400, 'Enter a valid email');
    const pw = str(b.password, 8, 100, 'Password');
    if (db.users.some(u => u.email === email)) throw fail(409, 'That email is already registered');
    const u = { id: uid(), name, email, pw: hashPw(pw) };
    db.users.push(u);
    return session(res, u);
  }
  if (m === 'POST' && p === '/api/login') {
    const b = await readBody(req), email = String(b.email || '').trim().toLowerCase();
    const f = fails[email] || { n: 0, t: Date.now() };
    if (Date.now() - f.t > 600000) { f.n = 0; f.t = Date.now(); }
    if (f.n >= 5) throw fail(429, 'Too many attempts. Try again in a few minutes');
    const u = db.users.find(x => x.email === email);
    if (!u || !checkPw(String(b.password || ''), u.pw)) { f.n++; fails[email] = f; throw fail(401, 'Wrong email or password'); }
    delete fails[email];
    return session(res, u);
  }
  if (m === 'POST' && p === '/api/logout') {
    const h = req.headers.authorization || '';
    delete db.sessions[h.slice(7)]; save();
    return send(res, 200, { ok: true });
  }
  if (m === 'GET' && p === '/api/me') return send(res, 200, { user: user && { id: user.id, name: user.name, email: user.email } });
  if (m === 'GET' && p === '/api/stations') return send(res, 200, db.stations);
  if (m === 'GET' && p === '/api/chargers') {
    return send(res, 200, db.chargers.filter(c => c.available).map(publicCharger));
  }
  if (m === 'GET' && p === '/api/chargers/mine') {
    needUser(user);
    return send(res, 200, db.chargers.filter(c => c.ownerId === user.id));
  }
  if (m === 'POST' && p === '/api/chargers') {
    needUser(user);
    const b = await readBody(req);
    if (!PLUGS.includes(b.plug)) throw fail(400, 'Choose a valid plug type');
    const c = { id: uid(), ownerId: user.id, title: str(b.title, 3, 60, 'Title'), area: str(b.area, 2, 60, 'Area'),
      address: str(b.address, 5, 120, 'Address'), phone: str(b.phone, 6, 20, 'Phone'),
      lat: num(b.lat, -90, 90, 'Latitude'), lng: num(b.lng, -180, 180, 'Longitude'), plug: b.plug,
      kw: num(b.kw, 1, 350, 'Power (kW)'), price: num(b.price, 0, 100, 'Price per kWh'), available: true, createdAt: Date.now() };
    db.chargers.push(c); save();
    return send(res, 201, c);
  }
  if ((mt = p.match(/^\/api\/chargers\/(\w+)$/))) {
    needUser(user);
    const c = db.chargers.find(x => x.id === mt[1]);
    if (!c || c.ownerId !== user.id) throw fail(404, 'Charger not found');
    if (m === 'PATCH') {
      const b = await readBody(req);
      if ('available' in b) c.available = !!b.available;
      if ('price' in b) c.price = num(b.price, 0, 100, 'Price per kWh');
      save(); return send(res, 200, c);
    }
    if (m === 'DELETE') {
      if (db.requests.some(r => r.chargerId === c.id && (r.status === 'pending' || r.status === 'approved'))) throw fail(409, 'Finish or decline open requests first');
      db.chargers = db.chargers.filter(x => x.id !== c.id); save();
      return send(res, 200, { ok: true });
    }
  }
  if (m === 'GET' && p === '/api/requests') {
    needUser(user);
    const list = db.requests.filter(r => r.driverId === user.id || r.ownerId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    return send(res, 200, list.map(r => reqView(r, user)));
  }
  if (m === 'POST' && p === '/api/requests') {
    needUser(user);
    const b = await readBody(req);
    const c = db.chargers.find(x => x.id === b.chargerId);
    if (!c || !c.available) throw fail(404, 'This charger is not available');
    if (c.ownerId === user.id) throw fail(400, 'You cannot request your own charger');
    if (db.requests.some(r => r.driverId === user.id && r.chargerId === c.id && (r.status === 'pending' || r.status === 'approved'))) throw fail(409, 'You already have an open request for this charger');
    const r = { id: uid(), chargerId: c.id, driverId: user.id, ownerId: c.ownerId, kwhNeeded: num(b.kwhNeeded, 1, 100, 'Energy needed'),
      note: typeof b.note === 'string' ? b.note.trim().slice(0, 120) : '', status: 'pending', createdAt: Date.now() };
    db.requests.push(r); save();
    return send(res, 201, reqView(r, user));
  }
  if ((mt = p.match(/^\/api\/requests\/(\w+)\/(respond|complete|cancel)$/)) && m === 'POST') {
    needUser(user);
    const r = db.requests.find(x => x.id === mt[1]);
    if (!r || (r.ownerId !== user.id && r.driverId !== user.id)) throw fail(404, 'Request not found');
    const b = await readBody(req), c = db.chargers.find(x => x.id === r.chargerId);
    if (mt[2] === 'respond') {
      if (r.ownerId !== user.id) throw fail(403, 'Only the charger owner can respond');
      if (r.status !== 'pending') throw fail(409, 'This request is already answered');
      if (b.action === 'approve') {
        if (db.requests.some(x => x.chargerId === r.chargerId && x.status === 'approved')) throw fail(409, 'Finish the current session first');
        r.status = 'approved';
      } else if (b.action === 'reject') r.status = 'rejected';
      else throw fail(400, 'Action must be approve or reject');
    } else if (mt[2] === 'complete') {
      if (r.ownerId !== user.id) throw fail(403, 'Only the charger owner can complete a session');
      if (r.status !== 'approved') throw fail(409, 'Approve the request first');
      r.kwhDelivered = num(b.kwhDelivered, 0.1, 100, 'Energy delivered');
      r.fee = round2(r.kwhDelivered * (c ? c.price : 0));
      r.status = 'completed';
    } else {
      if (r.driverId !== user.id) throw fail(403, 'Only the driver can cancel');
      if (r.status !== 'pending' && r.status !== 'approved') throw fail(409, 'This request cannot be cancelled');
      r.status = 'cancelled';
    }
    save();
    return send(res, 200, reqView(r, user));
  }
  throw fail(404, 'Not found');
}
function session(res, u) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { uid: u.id, exp: Date.now() + 7 * 864e5 };
  save();
  send(res, 200, { token, user: { id: u.id, name: u.name, email: u.email } });
}

/* ---------- static files ---------- */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

load();
http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:");
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
    if (!e.status) console.error(e);
  }
}).listen(PORT, () => console.log(`ChargeSense running at http://localhost:${PORT}`));
