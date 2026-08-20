// P3 live test: atomic city+coords PATCH + matching follows the new city immediately.
const { io } = require('socket.io-client');
const API = 'http://localhost:5000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function reg(phone, name, role, city) {
  const o = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
  const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: o.data.otp, name, role, city } });
  return { token: v.data.token, id: v.data.user.id.toString() };
}
function socketFor(token) {
  const events = [];
  const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
  ['request:new'].forEach(e => s.on(e, p => events.push({ e, p })));
  return { s, events, connected: new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); }) };
}
(async () => {
  let p = 0, f = 0; const check = (n, c, x) => { c ? p++ : f++; console.log(` ${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' :: ' + JSON.stringify(x).slice(0, 200)}`); };
  const u = Date.now().toString().slice(-6);
  const KHI = { lng: 67.0011, lat: 24.8607 }; const LHR = { lng: 74.3587, lat: 31.5204 };

  const cust = await reg(`+92344${u}1`, 'Switchy Cust', 'customer', 'Lahore');
  await api('/api/users/location', { method: 'PATCH', token: cust.token, body: LHR });

  // Switch city atomically, like PlaceSearch/searchLocation now does
  const sw = await api('/api/users/location', { method: 'PATCH', token: cust.token, body: { ...KHI, city: 'Karachi' } });
  check('P3-a one PATCH updates coords to Karachi (200)', sw.status === 200 && sw.data.location.coordinates[0] === 67.0011, sw);
  const prof = await api('/api/users/profile', { token: cust.token });
  check('P3-b profile shows city=Karachi AND coords=Karachi (same place)', prof.data.user.city === 'Karachi' && prof.data.user.location.coordinates[0] === 67.0011, { city: prof.data.user.city, coords: prof.data.user.location.coordinates });

  // Guards
  const bad1 = await api('/api/users/location', { method: 'PATCH', token: cust.token, body: { ...KHI, city: 123 } });
  const bad2 = await api('/api/users/location', { method: 'PATCH', token: cust.token, body: { ...KHI, city: '' } });
  check('P3-c invalid city rejected (400 x2)', bad1.status === 400 && bad2.status === 400, { bad1: bad1.status, bad2: bad2.status });
  check('P3-d rejected PATCHes did NOT clobber city back', (await api('/api/users/profile', { token: cust.token })).data.user.city === 'Karachi');

  // Matching follows new city: Lahore plumber silent, Karachi plumber notified
  const pL = await reg(`+92345${u}2`, 'Lhr P', 'provider', 'Lahore');
  const pK = await reg(`+92346${u}3`, 'Khi P', 'provider', 'Karachi');
  for (const [pr, c] of [[pL, LHR], [pK, KHI]]) {
    await api('/api/users/location', { method: 'PATCH', token: pr.token, body: c });
    await api('/api/providers/setup', { method: 'PATCH', token: pr.token, body: { category: 'plumber', radiusKm: 15, yearsExperience: 3, defaultVisitingCharge: 500 } });
    await api('/api/providers/dev/verify-me', { method: 'POST', token: pr.token });
    await api('/api/users/profile', { method: 'PATCH', token: pr.token, body: { isOnline: true } });
  }
  const sL = socketFor(pL.token), sK = socketFor(pK.token);
  await Promise.all([sL.connected, sK.connected]);
  await api('/api/requests', { method: 'POST', token: cust.token, body: { category: 'plumber', description: 'Post-switch request should reach Karachi only', ...KHI, address: 'KHI area', city: 'Karachi' } });
  await sleep(1500);
  check('P3-e Karachi provider got request:new after customer switched city', sK.events.length > 0, sK.events.length);
  check('P3-f Lahore provider did NOT get the Karachi-city request', sL.events.length === 0, sL.events.length);
  sL.s.disconnect(); sK.s.disconnect();
  console.log(`\nP3 LIVE: ${p} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
