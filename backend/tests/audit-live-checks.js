/**
 * AUDIT-ONLY one-off live checks (NOT a fix pass):
 * A. Location API order: PATCH /users/location {lng,lat} -> verify stored GeoJSON [lng,lat]
 *    and that POST /requests stores the same order.
 * B. Matching negative test: Karachi electrician provider must NOT get a Lahore plumber
 *    request:new; isVerified:true production-mode check (dev bypass noted separately).
 * C. Chat: send both directions + read receipts (chat:read after chat:markRead).
 */
const { io } = require('socket.io-client');
const API = 'http://localhost:5000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function registerUser(phone, name, role, city) {
  const otp = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
  const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: otp.data.otp, name, role, city } });
  return { token: v.data.token, id: v.data.user.id.toString() };
}
function connectSocket(token, label) {
  const events = [];
  const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
  ['request:new','offer:new','offer:accepted','job:statusUpdate','chat:message','chat:read','chat:error','notification:new']
    .forEach(ev => s.on(ev, p => events.push({ ev, p })));
  const connected = new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
  return { s, events, connected, label };
}

(async () => {
  let p = 0, f = 0;
  const check = (n, c, x) => { if (c) { p++; console.log(`  PASS ${n}`); } else { f++; console.log(`  FAIL ${n} ::`, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };
  const u = Date.now().toString().slice(-6);

  // --- A. Location coordinate-order live test ---
  console.log('\n-- A. Location API order --');
  const cust = await registerUser(`+92331${u}1`, 'Audit Cust', 'customer', 'Lahore');
  const LAHORE = { lng: 74.3587, lat: 31.5204 };
  const up = await api('/api/users/location', { method: 'PATCH', token: cust.token, body: LAHORE });
  check('A1 PATCH /users/location accepts {lng,lat} (200)', up.status === 200, up);
  check('A2 backend stored GeoJSON [lng,lat] = [74.3587, 31.5204] (NOT flipped)',
    up.data?.location?.coordinates?.[0] === 74.3587 && up.data?.location?.coordinates?.[1] === 31.5204, up.data?.location);
  const prof = await api('/api/users/profile', { token: cust.token });
  check('A3 GET profile echoes [lng,lat] persisted', prof.data?.user?.location?.coordinates?.[0] === 74.3587, prof.data?.user?.location);
  const req = await api('/api/requests', { method: 'POST', token: cust.token, body: { category: 'plumber', description: 'Audit request location order test', ...LAHORE, address: 'Audit Town', city: 'Lahore' } });
  check('A4 request saved with coordinates [lng,lat] order intact',
    req.data?.request?.location?.coordinates?.[0] === 74.3587 && req.data?.request?.location?.coordinates?.[1] === 31.5204, req.data?.request?.location);
  const reqId = req.data?.request?.id?.toString();

  // --- B. Matching negative test ---
  console.log('\n-- B. Matching filters (live) --');
  const pLah = await registerUser(`+92332${u}2`, 'Lhr Plumber', 'provider', 'Lahore');
  const pKar = await registerUser(`+92333${u}3`, 'Karachi Electrician', 'provider', 'Karachi');
  for (const [pr, coords, cat] of [[pLah, LAHORE, 'plumber'], [pKar, { lng: 67.0011, lat: 24.8607 }, 'electrician']]) {
    await api('/api/users/location', { method: 'PATCH', token: pr.token, body: coords });
    await api('/api/providers/setup', { method: 'PATCH', token: pr.token, body: { category: cat, radiusKm: 15, yearsExperience: 5, defaultVisitingCharge: 500 } });
    await api('/api/providers/dev/verify-me', { method: 'POST', token: pr.token });
    await api('/api/users/profile', { method: 'PATCH', token: pr.token, body: { isOnline: true } });
  }
  const sLah = connectSocket(pLah.token, 'lhr'); const sKar = connectSocket(pKar.token, 'khi'); const sCust = connectSocket(cust.token, 'cust');
  await Promise.all([sLah.connected, sKar.connected, sCust.connected]);
  // cust still has open request from A (created above). use second customer for a fresh one:
  const cust2 = await registerUser(`+92334${u}4`, 'Audit Cust2', 'customer', 'Lahore');
  await api('/api/users/location', { method: 'PATCH', token: cust2.token, body: LAHORE });
  await api('/api/requests', { method: 'POST', token: cust2.token, body: { category: 'plumber', description: 'Second audit request for matching', ...LAHORE, address: 'Audit2', city: 'Lahore' } });
  await sleep(1500);
  check('B1 Lahore plumber ONLINE got request:new', sLah.events.some(e => e.ev === 'request:new'), sLah.events.map(e=>e.ev));
  check('B2 Karachi electrician did NOT get Lahore plumber request (city+category filter)', !sKar.events.some(e => e.ev === 'request:new'), sKar.events.map(e=>e.ev));

  // --- C. Chat ---
  console.log('\n-- C. Chat send/receive/read --');
  // Build a job: pLah offers on cust2's request, cust2 accepts
  const reqs = await api('/api/requests/my', { token: cust2.token });
  const r2 = reqs.data.requests[0].id.toString();
  const off = await api(`/api/requests/${r2}/offers`, { method: 'POST', token: pLah.token, body: { visitingCharge: 700, etaMinutes: 20 } });
  const acc = await api(`/api/offers/${off.data.offer.id.toString()}/accept`, { method: 'PATCH', token: cust2.token });
  check('C1 job created via accept (200)', acc.status === 200 && !!acc.data.job, acc.data && acc.status);
  const jobId = acc.data.job.id.toString();
  const sCust2 = connectSocket(cust2.token, 'cust2');
  await sCust2.connected;
  // Provider -> customer
  sLah.s.emit('chat:send', { jobId, text: 'Audit msg provider->customer' });
  await sleep(800);
  const custMsg = sCust2.events.find(e => e.ev === 'chat:message');
  check('C2 customer received chat:message live', !!custMsg && (custMsg.p.text === 'Audit msg provider->customer' || custMsg.p.message?.text === 'Audit msg provider->customer'), sCust2.events.filter(e=>e.ev.startsWith('chat')));
  // Customer -> provider + markRead -> read receipt to provider
  sCust2.s.emit('chat:send', { jobId, text: 'Audit reply customer->provider' });
  await sleep(800);
  const provMsg = sLah.events.find(e => e.ev === 'chat:message' && (e.p.text === 'Audit reply customer->provider' || e.p.message?.text === 'Audit reply customer->provider'));
  check('C3 provider received reply live', !!provMsg, sLah.events.filter(e=>e.ev.startsWith('chat')));
  check('C4 no chat:error emitted anywhere', ![sLah, sCust2].some(x => x.events.some(e => e.ev === 'chat:error')));
  sLah.s.emit('chat:markRead', { jobId });
  await sleep(800);
  check('C5 read receipt (chat:read) reached customer', sCust2.events.some(e => e.ev === 'chat:read'), sCust2.events.filter(e=>e.ev.startsWith('chat')));
  const hist = await api(`/api/jobs/${jobId}/messages`, { token: pLah.token });
  check('C6 message history persisted (>=2 msgs, oldest-first)', hist.status === 200 && hist.data.messages.length >= 2 && hist.data.messages[0].text.includes('provider->customer'), hist.data && hist.data.messages && hist.data.messages.length);

  [sLah, sKar, sCust, sCust2].forEach(x => x.s.disconnect());
  console.log(`\nAUDIT LIVE EXTRA: ${p} passed, ${f} failed`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.error('crashed', e); process.exit(1); });
