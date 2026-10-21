'use strict';
// Integration test: starts the server on a temp database and walks through the whole rental flow.
const { spawn } = require('child_process'), os = require('os'), path = require('path'), assert = require('assert');
const PORT = 3999, BASE = `http://localhost:${PORT}`;
const db = path.join(os.tmpdir(), `cs-test-${Date.now()}.json`);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, DB_FILE: db }, stdio: 'ignore' });
const call = async (p, o = {}, t) => {
  const r = await fetch(BASE + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: o.body && JSON.stringify(o.body) });
  return { status: r.status, body: await r.json() };
};
(async () => {
  await new Promise(r => setTimeout(r, 900));
  try {
    const st = await call('/api/stations'); assert.equal(st.body.length, 6);
    const bad = await call('/api/login', { method: 'POST', body: { email: 'driver@demo.com', password: 'wrongpass' } }); assert.equal(bad.status, 401);
    const drv = (await call('/api/login', { method: 'POST', body: { email: 'driver@demo.com', password: 'demo1234' } })).body.token;
    const own = (await call('/api/login', { method: 'POST', body: { email: 'owner@demo.com', password: 'demo1234' } })).body.token;
    const list = (await call('/api/chargers')).body;
    assert(list.length >= 4 && list.every(c => !('address' in c) && !('phone' in c)), 'public list must hide address and phone');
    assert.equal((await call('/api/requests', { method: 'POST', body: { chargerId: 'c1', kwhNeeded: 5 } })).status, 401);
    assert.equal((await call('/api/requests', { method: 'POST', body: { chargerId: 'c1', kwhNeeded: 5 } }, own)).status, 400, 'cannot request own charger');
    const rq = await call('/api/requests', { method: 'POST', body: { chargerId: 'c1', kwhNeeded: 5, note: 'Nexon EV' } }, drv); assert.equal(rq.status, 201);
    assert.equal(rq.body.address, undefined, 'address hidden before approval');
    const id = rq.body.id;
    assert.equal((await call(`/api/requests/${id}/respond`, { method: 'POST', body: { action: 'approve' } }, drv)).status, 403, 'driver cannot approve');
    const ap = await call(`/api/requests/${id}/respond`, { method: 'POST', body: { action: 'approve' } }, own); assert.equal(ap.body.status, 'approved');
    const seen = (await call('/api/requests', {}, drv)).body.find(r => r.id === id); assert(seen.address, 'address visible after approval');
    const done = await call(`/api/requests/${id}/complete`, { method: 'POST', body: { kwhDelivered: 4.5 } }, own);
    assert.equal(done.body.status, 'completed'); assert.equal(done.body.fee, 54, '4.5 kWh x 12 = 54');
    const reg = await call('/api/register', { method: 'POST', body: { name: 'Test User', email: 't@example.com', password: 'longenough1' } }); assert(reg.body.token);
    const add = await call('/api/chargers', { method: 'POST', body: { title: 'Test box', area: 'Test', address: 'Test street 1', phone: '999999', lat: 19.04, lng: 73.03, plug: 'Type 2', kw: 7, price: 10 } }, reg.body.token); assert.equal(add.status, 201);
    console.log('All tests passed');
  } catch (e) { console.error('TEST FAILED:', e.message); process.exitCode = 1; }
  srv.kill();
})();
