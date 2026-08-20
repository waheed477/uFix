/**
 * FINAL LIFECYCLE SANITY RUN (2026-08-20) - last pre-deployment gate (checklist item 26).
 *
 * One complete uninterrupted journey, two live sessions (customer + provider, same
 * city/category), sockets connected both sides:
 *   signup customer -> set city -> signup provider (online+verified) -> post request ->
 *   provider notified live -> offer (edited price) -> customer sees pending+offers state ->
 *   decline -> provider notified + badged (socket + persisted notif) -> 2nd offer (revive)
 *   -> accept -> contact unlock -> status on_the_way->arrived->in_progress (live) ->
 *   backward 400 -> complete -> dual rating (dup 400) -> history both -> notification
 *   bell trail both sides.
 *
 * Prints a step-by-step timeline + a FRICTION/OVERVIEW section at the end.
 * Exit 0 = all steps PASS.
 */
const { io } = require('socket.io-client');
const API = process.env.API_URL || 'http://localhost:5000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n, e) => { fail++; console.log(`  ✗ FAIL ${n}${e !== undefined ? '  -- ' + JSON.stringify(e).slice(0, 220) : ''}`); };
const check = (n, c, e) => (c ? ok(n) : bad(n, e));

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function register(phone, name, role, city) {
  const o = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
  const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: o.data.otp, name, role, city } });
  return { token: v.data.token, id: v.data.user.id.toString(), user: v.data.user };
}
function session(token, label) {
  const events = [];
  const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
  ['request:new', 'offer:new', 'offer:accepted', 'offer:rejected', 'offer:declined', 'request:cancelled', 'request:closed', 'request:expired', 'job:statusUpdate', 'notification:new'].forEach((ev) =>
    s.on(ev, (d) => events.push({ ev, d, t: Date.now() }))
  );
  const connected = new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); setTimeout(() => rej(new Error(label + ' socket timeout')), 9000); });
  const waitFor = (ev, ms = 8000, pred = () => true) => new Promise((res) => {
    const start = Date.now();
    const iv = setInterval(() => {
      const hit = events.find((e) => e.ev === ev && pred(e.d));
      if (hit) { clearInterval(iv); res(hit); }
      else if (Date.now() - start > ms) { clearInterval(iv); res(null); }
    }, 100);
  });
  return { s, events, connected, waitFor };
}
const FSD = { lng: 73.0776, lat: 31.4181, city: 'Faisalabad' };

(async () => {
  const t0 = Date.now();
  const beat = (m) => console.log(`\n[${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5)}s] ${m}`);
  // Photo-upload probe (item 8/16 freshness on this clean DB) is separate; this run is the journey.

  beat('1. Signup customer (Faisalabad) via phone OTP');
  const cust = await register(`+92320${String(Date.now()).slice(-7)}`, 'Sana Customer', 'customer', 'Faisalabad');
  check('customer registered w/ city Faisalabad', !!cust.token && cust.user.city === 'Faisalabad', cust.user.city);

  beat('2. Customer sets precise location (city center coords)');
  const locSet = await api('/api/users/location', { method: 'PATCH', token: cust.token, body: FSD });
  check('location PATCH atomic (city+coords)', locSet.status === 200, locSet.status);

  beat('3. Signup provider (Faisalabad, plumber) + setup + verify + online + location');
  const prov = await register(`+92321${String(Date.now()).slice(-7)}`, 'Bilal Plumber', 'provider', 'Faisalabad');
  const setup = await api('/api/providers/setup', { method: 'PATCH', token: prov.token, body: { category: 'plumber', radiusKm: 15, yearsExperience: 5, defaultVisitingCharge: 500 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: prov.token });
  await api('/api/users/profile', { method: 'PATCH', token: prov.token, body: { isOnline: true } });
  await api('/api/users/location', { method: 'PATCH', token: prov.token, body: FSD });
  const provProfile = await api('/api/users/profile', { token: prov.token });
  check('provider online + verified + setup persisted',
    setup.status === 200 && provProfile.data?.user?.isOnline === true && provProfile.data?.user?.isVerified === true);

  beat('4. Both connect sockets');
  const scC = session(cust.token, 'cust'), scP = session(prov.token, 'prov');
  await Promise.all([scC.connected, scP.connected]); ok('both sockets connected');

  beat('5. Customer posts request (plumber, Faisalabad)');
  const reqCreate = await api('/api/requests', {
    method: 'POST', token: cust.token,
    body: { category: 'plumber', description: 'Kitchen sink pipe leaking under counter', lng: FSD.lng, lat: FSD.lat, address: 'Model Town, Faisalabad', city: 'Faisalabad' },
  });
  const reqId = reqCreate.data?.request?.id?.toString() || reqCreate.data?.request?._id?.toString();
  check('request 201', reqCreate.status === 201 && !!reqId, reqCreate.status);
  const hitNew = await scP.waitFor('request:new', 9000, (d) => (d.request?.id || d.request?._id || d.id)?.toString() === reqId);
  check('provider got request:new LIVE (area+city present)', !!hitNew && !!(hitNew.d.request?.address || hitNew.d.address), hitNew && Object.keys(hitNew.d));
  // Second simultaneous request must be blocked (item 5 re-confirm inside lifecycle)
  const secondReq = await api('/api/requests', { method: 'POST', token: cust.token, body: { category: 'plumber', description: 'Another one while open x', lng: FSD.lng, lat: FSD.lat, address: 'x', city: 'Faisalabad' } });
  check('2nd open request blocked w/ clear message', secondReq.status === 400 && /already have an open request/i.test(secondReq.data?.message || ''), secondReq.data?.message);

  beat('6. Provider sends offer #1 with EDITED price 650 (default was 500)');
  const of1 = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: prov.token, body: { visitingCharge: 650, etaMinutes: 25 } });
  const of1Id = of1.data?.offer?.id?.toString() || of1.data?.offer?._id?.toString();
  check('offer#1 201 w/ edited price persisted', of1.status === 201 && (of1.data?.offer?.visitingCharge === 650), of1.data?.offer?.visitingCharge);
  const hitOffer = await scC.waitFor('offer:new', 9000);
  check('customer got offer:new LIVE w/ 650', !!hitOffer && (hitOffer.d.offer?.visitingCharge === 650 || hitOffer.d.frontend?.visitingCharge === 650));

  beat('7. Customer state: request pending + offer visible (Home-reminder/Jobs-tab data source)');
  const myReqs = await api('/api/requests/my', { token: cust.token });
  const mine = (myReqs.data?.requests || []).find((r) => (r.id || r._id).toString() === reqId);
  const offersNow = await api(`/api/requests/${reqId}/offers`, { token: cust.token });
  check('GET /requests/my shows pending request (drives Home reminder + Jobs card)', !!mine && mine.status === 'pending', mine?.status);
  check('offers list shows 1 pending @650', offersNow.data?.offers?.length === 1 && offersNow.data.offers[0].visitingCharge === 650, offersNow.data?.offers?.map(o => [o.visitingCharge, o.status]));

  beat('8. Customer declines offer #1 (request must stay alive)');
  const dec = await api(`/api/offers/${of1Id}/decline`, { method: 'PATCH', token: cust.token });
  check('decline 200', dec.status === 200, dec.status);
  const hitDec = await scP.waitFor('offer:declined', 9000);
  check('provider got offer:declined LIVE (feeds ✗ Declined badge)', !!hitDec);
  const reqAfterDec = await api(`/api/requests/${reqId}`, { token: cust.token });
  check('request STILL pending after decline', (reqAfterDec.data?.request?.status ?? reqAfterDec.data?.status) === 'pending');
  const offersAfterDec = await api(`/api/requests/${reqId}/offers`, { token: cust.token });
  const pendAfterDec = (offersAfterDec.data?.offers || []).filter((o) => o.status === 'pending');
  check('declined offer filtered from customer view (0 pending now)', pendAfterDec.length === 0, offersAfterDec.data?.offers?.map(o => o.status));

  beat('9. Provider re-offers (revive) @ 600, customer accepts');
  const of2 = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: prov.token, body: { visitingCharge: 600, etaMinutes: 20 } });
  const of2Id = of2.data?.offer?.id?.toString() || of2.data?.offer?._id?.toString();
  check('2nd offer (revived) 201', of2.status === 201, of2.status);
  const acc = await api(`/api/offers/${of2Id}/accept`, { method: 'PATCH', token: cust.token });
  check('accept 200', acc.status === 200, acc.status);
  const hitAcc = await scP.waitFor('offer:accepted', 9000);
  check('provider got offer:accepted LIVE', !!hitAcc);
  const jobId = acc.data?.job?.id?.toString() || acc.data?.job?._id?.toString();
  const job = await api(`/api/jobs/${jobId}`, { token: cust.token });
  const jobAsProv = await api(`/api/jobs/${jobId}`, { token: prov.token });
  check('contact unlocked BOTH sides (real phones present)',
    !!jobId && !!job.data?.job?.provider?.phone && !!jobAsProv.data?.job?.customer?.phone,
    { c: job.data?.job?.provider?.phone, p: jobAsProv.data?.job?.customer?.phone });

  beat('10. Provider advances status live: on_the_way -> arrived -> in_progress (backward must 400)');
  for (const st of ['arrived', 'in_progress']) {
    const upd = await api(`/api/jobs/${jobId}/status`, { method: 'PATCH', token: prov.token, body: { status: st } });
    check(`status -> ${st} (200)`, upd.status === 200, upd.status);
    const hitSt = await scC.waitFor('job:statusUpdate', 6000, (d) => d.status === st || d.job?.status === st);
    check(`customer LIVE job:statusUpdate ${st}`, !!hitSt);
  }
  const back = await api(`/api/jobs/${jobId}/status`, { method: 'PATCH', token: prov.token, body: { status: 'on_the_way' } });
  check('backward move rejected 400', back.status === 400, back.status);
  const busyProbe = await api('/api/requests/nearby', { token: prov.token });
  check('busy while active job: nearby=0 + hasActiveJob (item 13)', busyProbe.data?.hasActiveJob === true && (busyProbe.data?.requests || []).length === 0);

  beat('11. Provider completes job');
  const done = await api(`/api/jobs/${jobId}/status`, { method: 'PATCH', token: prov.token, body: { status: 'completed' } });
  check('completed 200', done.status === 200, done.status);
  const doneC = await scC.waitFor('job:statusUpdate', 6000, (d) => d.status === 'completed' || d.job?.status === 'completed');
  check('customer LIVE completed (drives notification + rating prompt)', !!doneC);

  beat('12. Dual rating (customer->provider, provider->customer) + duplicate guard');
  const r1 = await api(`/api/jobs/${jobId}/rate`, { method: 'POST', token: cust.token, body: { rating: 5, comment: 'Quick and tidy work' } });
  const r2 = await api(`/api/jobs/${jobId}/rate`, { method: 'POST', token: prov.token, body: { rating: 4, comment: 'Clear instructions' } });
  const rDup = await api(`/api/jobs/${jobId}/rate`, { method: 'POST', token: cust.token, body: { rating: 3 } });
  check('both rated (201/200) + duplicate blocked (400)',
    [200, 201].includes(r1.status) && [200, 201].includes(r2.status) && rDup.status === 400, [r1.status, r2.status, rDup.status]);

  beat('13. Order history + notification bell trail, both sides');
  const histC = await api('/api/jobs/history?status=completed', { token: cust.token });
  const histP = await api('/api/jobs/history?status=completed', { token: prov.token });
  const inHistC = (histC.data?.jobs || histC.data?.history || []).some((j) => (j.id || j._id)?.toString() === jobId || j.jobId?.toString() === jobId);
  const inHistP = (histP.data?.jobs || histP.data?.history || []).some((j) => (j.id || j._id)?.toString() === jobId || j.jobId?.toString() === jobId);
  check('completed job in BOTH histories', inHistC && inHistP);
  const notifC = await api('/api/notifications', { token: cust.token });
  const notifP = await api('/api/notifications', { token: prov.token });
  const typesC = (notifC.data?.notifications || []).map((n) => n.type);
  const typesP = (notifP.data?.notifications || []).map((n) => n.type);
  console.log('   customer bell:', typesC.join(' | '));
  console.log('   provider bell:', typesP.join(' | '));
  check('customer trail has new_offer + job_status_update (arrived/in_progress/completed) + new_rating ' +
        '(actor gets no self offer_accepted - deliberate: persisted bells go to counter-parties; ' +
        'the customer IS the accepting actor and gets instant UI feedback instead)',
    ['new_offer', 'job_status_update', 'new_rating'].every((t) => typesC.includes(t)) &&
      typesC.filter((t) => t === 'job_status_update').length >= 3, typesC);
  check('provider trail has request_new + offer_declined + offer_accepted + new_rating',
    ['request_new', 'offer_declined', 'offer_accepted', 'new_rating'].every((t) => typesP.includes(t)), typesP);

  // ---- friction observations ----
  const cOffers = typesC.filter(t => t === 'new_offer').length;
  console.log('\n=== OVERVIEW / FRICTION NOTES ===');
  console.log(`• Steps passed: ${pass}, failed: ${fail} | wall time ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`• customer got ${cOffers}x new_offer (decline+revive cycle -> 2 notifications is expected)`);
  console.log(`• live events observed: provider(request:new=${scP.events.filter(e=>e.ev==='request:new').length}, offer:declined=${scP.events.filter(e=>e.ev==='offer:declined').length}, offer:accepted=${scP.events.filter(e=>e.ev==='offer:accepted').length}) customer(offer:new=${scC.events.filter(e=>e.ev==='offer:new').length}, job:statusUpdate=${scC.events.filter(e=>e.ev==='job:statusUpdate').length})`);

  scC.s.close(); scP.s.close();
  console.log(`\n=== LIFECYCLE RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Lifecycle run crashed:', e); process.exit(1); });
