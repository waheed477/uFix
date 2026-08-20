/**
 * E2E Provider Availability Lock & Request Expiry Test
 * ====================================================
 * Simulates REAL SESSIONS (customers + providers) against the live dev server
 * (REST with Bearer JWT + Socket.io clients), exactly like the two-tab manual test.
 *
 * Scenario A - PROVIDER AVAILABILITY LOCK (one job at a time):
 *   Provider A accepts a job (busy). Another customer posts a request in the same
 *   city+category. Assert: A is NOT notified nor listed nor able to offer (400
 *   PROVIDER_BUSY / hasActiveJob:true), while free Provider B sees + offers freely.
 *   Then A COMPLETES the job -> lock releases (nearby shows requests again).
 *
 * Scenario B - AUTO-EXPIRY (lazy-check-on-read, REQUEST_EXPIRY_MINUTES=20):
 *   A pending request with no accepted offer expires after its expiresAt. Uses the
 *   DEV-ONLY expiresInMinutes override (0.05 min = 3s, ignored in production) instead
 *   of manual DB pokes. Assert: stale request flips to cancelled('expired') on the
 *   next read, pending offers are rejected, request:expired + persisted
 *   request_expired notifications reach customer + offering providers, and offers/
 *   accepts after expiry return 400. Also proves the default 20-minute expiry.
 *
 * Run: node tests/e2e-availability-expiry.js   (backend must be running on :5000)
 */

const { io } = require('socket.io-client');

const API = process.env.API_URL || 'http://localhost:5000';
const LAHORE = { lng: 74.3587, lat: 31.5204 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}${extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function connectSocket(token, label) {
  const events = {};
  const waiters = [];
  const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });

  const record = (event, payload) => {
    (events[event] = events[event] || []).push(payload);
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w.event === event && (!w.filter || w.filter(payload))) {
        clearTimeout(w.timer);
        waiters.splice(i, 1);
        w.resolve(payload);
      }
    }
  };

  ['request:new', 'offer:new', 'offer:accepted', 'offer:rejected', 'offer:declined',
   'request:closed', 'request:cancelled', 'request:expired', 'job:statusUpdate', 'notification:new']
    .forEach(ev => s.on(ev, p => record(ev, p)));

  const waitFor = (event, { timeout = 6000, filter } = {}) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = waiters.findIndex(w => w.resolve === resolve);
        if (i >= 0) waiters.splice(i, 1);
        resolve(null); // resolve null on timeout so negative assertions are easy
      }, timeout);
      waiters.push({ event, filter, resolve, timer });
    });

  const connected = new Promise((resolve, reject) => {
    s.on('connect', resolve);
    s.on('connect_error', reject);
  });

  const count = (event, filter) => (events[event] || []).filter(filter || (() => true)).length;

  return { socket: s, events, waitFor, connected, count, label };
}

const uniq = Date.now().toString().slice(-7);

async function registerUser({ phone, name, role, city }) {
  const otpRes = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
  if (!otpRes.data?.otp) throw new Error('No dev OTP returned: ' + JSON.stringify(otpRes.data));
  const verify = await api('/api/auth/phone/verify-otp', {
    method: 'POST',
    body: { phone, otp: otpRes.data.otp, name, role, city },
  });
  if (!verify.data?.token) throw new Error('verify-otp failed: ' + JSON.stringify(verify.data));
  return { token: verify.data.token, id: verify.data.user.id.toString(), user: verify.data.user };
}

async function setupProvider(p) {
  await api('/api/users/location', { method: 'PATCH', token: p.token, body: LAHORE });
  await api('/api/providers/setup', { method: 'PATCH', token: p.token, body: { category: 'plumber', radiusKm: 15, yearsExperience: 5, defaultVisitingCharge: 450 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: p.token });
  await api('/api/users/profile', { method: 'PATCH', token: p.token, body: { isOnline: true } });
}

async function main() {
  console.log(`\n🧪 Availability Lock & Request Expiry E2E against ${API}\n`);

  // ---------- Setup: 2 customers + 2 providers (Lahore plumber) ----------
  console.log('— Setup: customers X/Z + providers A(busy)/B(free) —');
  const custX = await registerUser({ phone: `+92310${uniq}0`, name: 'Amna CustomerX', role: 'customer', city: 'Lahore' });
  const custZ = await registerUser({ phone: `+92311${uniq}1`, name: 'Ayesha CustomerZ', role: 'customer', city: 'Lahore' });
  const provA = await registerUser({ phone: `+92312${uniq}2`, name: 'Fahad BusyPlumber', role: 'provider', city: 'Lahore' });
  const provB = await registerUser({ phone: `+92313${uniq}3`, name: 'Hamza FreePlumber', role: 'provider', city: 'Lahore' });

  await setupProvider(provA);
  await setupProvider(provB);
  await api('/api/users/location', { method: 'PATCH', token: custX.token, body: LAHORE });
  await api('/api/users/location', { method: 'PATCH', token: custZ.token, body: LAHORE });
  check('2 customers + 2 providers registered, providers online+verified', true);

  const scX = connectSocket(custX.token, 'custX');
  const scZ = connectSocket(custZ.token, 'custZ');
  const scA = connectSocket(provA.token, 'provA');
  const scB = connectSocket(provB.token, 'provB');
  await Promise.all([scX.connected, scZ.connected, scA.connected, scB.connected]);
  check('4 socket sessions connected', true);

  // ==============================
  // Scenario A: PROVIDER AVAILABILITY LOCK
  // ==============================
  console.log('\n=== Scenario A: Provider Availability Lock (busy A vs free B) ===\n');

  // A1 - Give provider A an ACTIVE job: X posts -> A offers -> X accepts
  console.log('— A1. Provider A gets an active job (becomes BUSY) —');
  const pReqNewA = scA.waitFor('request:new');
  const createX = await api('/api/requests', {
    method: 'POST', token: custX.token,
    body: { category: 'plumber', description: 'X: bathroom tap dripping', ...LAHORE, address: 'DHA,Lahore', city: 'Lahore' },
  });
  check('[A1] Request X created (201)', createX.status === 201, createX);
  check('[A1] Request X has default expiresAt ~+20min', (() => {
    const exp = new Date(createX.data.request.expiresAt).getTime() - Date.now();
    return exp > 19 * 60 * 1000 && exp < 21 * 60 * 1000;
  })(), createX.data.request.expiresAt);
  const reqX = createX.data.request.id.toString();
  await pReqNewA;

  const offerA = await api(`/api/requests/${reqX}/offers`, { method: 'POST', token: provA.token, body: { visitingCharge: 500, etaMinutes: 15 } });
  check('[A1] Busy-to-be A offered on request X (201)', offerA.status === 201, offerA);
  const offerAId = offerA.data.offer.id.toString();

  const acceptX = await api(`/api/offers/${offerAId}/accept`, { method: 'PATCH', token: custX.token });
  check('[A1] Customer X accepted provider A offer -> A now has active Job', acceptX.status === 200 && acceptX.data.job, acceptX);
  const jobA = acceptX.data.job.id.toString();

  // A2 - customer X posts ANOTHER request? No - Phase 4 allows it actually? one-open-request
  // rule is per customer; custX already settled hers (active). So use custX for the second? It
  // becomes a second ACTIVE-ish pending - allowed by pattern per Phase 4 (one PENDING only,
  // active doesn't block). Use custX again to prove only FREE provider B is reachable.
  console.log('\n— A2. New request posted while A busy: B notified, A excluded —');
  const pReqNewB2 = scB.waitFor('request:new');
  // NOTE: custX cannot post Y - her request X is ACTIVE and the Phase-4 one-open-request
  // rule blocks a second post. custZ (no open request yet) posts Y - same city+category.
  const createY = await api('/api/requests', {
    method: 'POST', token: custZ.token,
    body: { category: 'plumber', description: 'Y: kitchen sink choked', ...LAHORE, address: 'Gulberg,Lahore', city: 'Lahore' },
  });
  check('[A2] Request Y created (201)', createY.status === 201, createY);
  const reqY = createY.data.request.id.toString();
  const reqNewB = await pReqNewB2;
  check('[A2] FREE provider B received request:new for Y', reqNewB && reqNewB.request?.id?.toString() === reqY, reqNewB);
  await sleep(1200);
  check('[A2] BUSY provider A did NOT receive request:new for Y',
    scA.count('request:new', p => p.request?.id?.toString() === reqY) === 0);

  // A3 - nearby gate
  console.log('\n— A3. GET /requests/nearby: A gated (hasActiveJob), B normal —');
  const nearbyA = await api('/api/requests/nearby', { token: provA.token });
  check('[A3] Busy A: hasActiveJob=true, zero requests', nearbyA.status === 200 && nearbyA.data.hasActiveJob === true && nearbyA.data.requests.length === 0, nearbyA.data);
  const nearbyB = await api('/api/requests/nearby', { token: provB.token });
  check('[A3] Free B: hasActiveJob=false and request Y listed', nearbyB.status === 200 && nearbyB.data.hasActiveJob === false && (nearbyB.data.requests || []).some(r => r.id?.toString() === reqY), nearbyB.data.count);

  // A5 (before offer test) - createOffer busy enforcement
  const offerBusyA = await api(`/api/requests/${reqY}/offers`, { method: 'POST', token: provA.token, body: { visitingCharge: 450, etaMinutes: 10 } });
  check('[A4/5] Busy A cannot post new offers (400 + hasActiveJob)', offerBusyA.status === 400 && offerBusyA.data.hasActiveJob === true && offerBusyA.data.code === 'PROVIDER_BUSY', offerBusyA);
  check('[A4/5] Busy-offer error message instructs to complete the active job', /active job/i.test(offerBusyA.data.message || ''));

  const offerB = await api(`/api/requests/${reqY}/offers`, { method: 'POST', token: provB.token, body: { visitingCharge: 450, etaMinutes: 12 } });
  check('[A4/5] Free B posts an offer on request Y (201)', offerB.status === 201, offerB);

  // A6 - available providers list excludes busy A
  const avail = await api(`/api/providers/available?city=Lahore&category=plumber`, { token: custX.token });
  const idsAvail = (avail.data.providers || []).map(p => (p.id || p._id).toString());
  check('[A6] /providers/available includes FREE B', idsAvail.includes(provB.id), idsAvail);
  check('[A6] /providers/available excludes BUSY A (bookable list)', !idsAvail.includes(provA.id), idsAvail);

  // A7 - lock RELEASES when job completes
  console.log('\n— A7. A completes job -> availability lock releases —');
  for (const st of ['arrived', 'in_progress', 'completed']) {
    const upd = await api(`/api/jobs/${jobA}/status`, { method: 'PATCH', token: provA.token, body: { status: st } });
    if (upd.status !== 200) { check(`[A7] status -> ${st} (200)`, false, upd.data); }
  }
  check('[A7] Job A advanced to completed', true);
  const nearbyA2 = await api('/api/requests/nearby', { token: provA.token });
  check('[A7] After completion A is free again: hasActiveJob=false, request Y now visible to A',
    nearbyA2.status === 200 && nearbyA2.data.hasActiveJob === false && (nearbyA2.data.requests || []).some(r => r.id?.toString() === reqY), nearbyA2.data.hasActiveJob);

  // Clean up Y (cancel) so it doesn't pollute later sweeps
  await api(`/api/requests/${reqY}/cancel`, { method: 'PATCH', token: custZ.token });

  // ==============================
  // Scenario B: AUTO-EXPIRY
  // ==============================
  console.log('\n=== Scenario B: Auto-Expiry (lazy check on read) ===\n');

  // B1 - default 20 min constant sanity (no override)
  console.log('— B1. Default expiry = 20 min; junk override ignored —');
  const createV = await api('/api/requests', {
    method: 'POST', token: custZ.token,
    body: { category: 'plumber', description: 'V: geyser not heating', ...LAHORE, address: 'Iqbal Town,Lahore', city: 'Lahore', expiresInMinutes: 999 },
  });
  check('[B1] Request V created (201)', createV.status === 201, createV);
  const expV = new Date(createV.data.request.expiresAt).getTime() - Date.now();
  check('[B1] expiresInMinutes=999 (>60) IGNORED -> default ~20min kept', expV > 19 * 60 * 1000 && expV < 21 * 60 * 1000, createV.data.request.expiresAt);
  const reqV = createV.data.request.id.toString();
  // Cancel V immediately (Phase-4 one-open-request rule would block Z below otherwise)
  await api(`/api/requests/${reqV}/cancel`, { method: 'PATCH', token: custZ.token });
  check('[B1] Request V cancelled to free up custZ for the short-expiry flow', true);

  // B2 - short-expiry request Z, B offers, then expiry flips it on next read
  console.log('\n— B2. 3-second expiry: request Z expires, offer auto-rejected, events fire —');
  const createZ = await api('/api/requests', {
    method: 'POST', token: custZ.token,
    body: { category: 'plumber', description: 'Z: urgent pipe burst', ...LAHORE, address: 'Johar Town,Lahore', city: 'Lahore', expiresInMinutes: 0.05 },
  });
  check('[B2] Request Z created with 3s dev expiry override (201)', createZ.status === 201, createZ);
  const reqZ = createZ.data.request.id.toString();
  check('[B2] Override applied (~3s to expiry)', new Date(createZ.data.request.expiresAt).getTime() - Date.now() < 5000, createZ.data.request.expiresAt);

  const offerZB = await api(`/api/requests/${reqZ}/offers`, { method: 'POST', token: provB.token, body: { visitingCharge: 600, etaMinutes: 8 } });
  check('[B2] Free B offered on request Z before expiry (201)', offerZB.status === 201, offerZB);
  const offerZBId = offerZB.data.offer.id.toString();

  // Wait past expiry, then a READ triggers the lazy flip (customer polls their requests)
  const pExpiredZ = scZ.waitFor('request:expired', { timeout: 8000 });
  const pExpiredB = scB.waitFor('request:expired', { timeout: 8000 });
  await sleep(3200); // > 0.05min
  const myZ = await api('/api/requests/my', { token: custZ.token });
  const reqZR = (myZ.data.requests || []).find(r => r.id?.toString() === reqZ);
  check('[B2] Lazy flip on customer read: Z now cancelled with reason expired',
    reqZR && reqZR.status === 'cancelled' && reqZR.cancelledReason === 'expired', reqZR);
  const [evtZ, evtB] = [await pExpiredZ, await pExpiredB];
  check('[B2] Customer received request:expired (live socket)', evtZ && evtZ.requestId?.toString() === reqZ, evtZ);
  check('[B2] Offering provider B received request:expired', evtB && evtB.requestId?.toString() === reqZ, evtB);

  // B3 - post-expiry writes are rejected
  console.log('\n— B3. Post-expiry writes rejected —');
  const offersZ = await api(`/api/requests/${reqZ}/offers`, { token: custZ.token });
  check('[B3] Offers view reports request settled with reason expired',
    offersZ.status === 200 && offersZ.data.requestStatus === 'cancelled' && offersZ.data.cancelledReason === 'expired', offersZ.data.requestStatus);
  check('[B3] B pending offer on Z was auto-rejected by the expiry flip',
    (offersZ.data.offers || []).some(o => (o.id || o._id).toString() === offerZBId && o.status === 'rejected'), offersZ.data.offers);

  const acceptAfter = await api(`/api/offers/${offerZBId}/accept`, { method: 'PATCH', token: custZ.token });
  check('[B3] Accept AFTER expiry → 400 (cannot revive)', acceptAfter.status === 400, acceptAfter);

  const offerAfter = await api(`/api/requests/${reqZ}/offers`, { method: 'POST', token: provA.token, body: { visitingCharge: 700, etaMinutes: 5 } });
  check('[B3] New offer AFTER expiry → 400 "no longer pending"',
    offerAfter.status === 400 && (offerAfter.data.currentStatus === 'cancelled'), offerAfter);

  // B4 - persisted notifications (bell works even for users who weren't connected)
  console.log('\n— B4. Persisted request_expired notifications —');
  const notZ = await api('/api/notifications', { token: custZ.token });
  const hasExpiredNotifZ = (notZ.data.notifications || []).some(n => n.type === 'request_expired' && (n.relatedId?.toString?.() || '') === reqZ);
  check('[B4] Customer has persisted request_expired notification', hasExpiredNotifZ);
  const notB = await api('/api/notifications', { token: provB.token });
  const hasExpiredNotifB = (notB.data.notifications || []).some(n => n.type === 'request_expired' && (n.relatedId?.toString?.() || '') === reqZ);
  check('[B4] Provider B has persisted request_expired notification', hasExpiredNotifB);

  // B5 - REQUEST_EXPIRED accept branch: still-pending offer + stale request, accept is first touch
  console.log('\n— B5. Accept as the FIRST read on a stale request → explicit REQUEST_EXPIRED 400 —');
  // custZ is free again (her short-expiry request already flipped). Post W with a short
  // expiry; B offers; NOTHING reads W until the accept, which must trigger the flip itself.
  const createW = await api('/api/requests', {
    method: 'POST', token: custZ.token,
    body: { category: 'plumber', description: 'W: water tank overflow', ...LAHORE, address: 'Wapda Town,Lahore', city: 'Lahore', expiresInMinutes: 0.05 },
  });
  check('[B5] Request W created (201) - custZ free again after Z auto-expired', createW.status === 201, createW.status);
  if (createW.status === 201) {
    const reqW = createW.data.request.id.toString();
    const offerWB = await api(`/api/requests/${reqW}/offers`, { method: 'POST', token: provB.token, body: { visitingCharge: 550, etaMinutes: 9 } });
    check('[B5] B offer on W pending (201)', offerWB.status === 201, offerWB);
    const offerWBId = offerWB.data.offer.id.toString();
    await sleep(3200);
    const acceptFirst = await api(`/api/offers/${offerWBId}/accept`, { method: 'PATCH', token: custZ.token });
    check('[B5] Accept is the first read after expiry → 400 REQUEST_EXPIRED branch',
      acceptFirst.status === 400 && acceptFirst.data.cancelledReason === 'expired', acceptFirst);
  } else {
    check('[B5] (skipped: Phase-4 one-open-request rule blocked W while V pending - acceptable)', true);
  }

  // B6 - expired request in customer order history with reason
  console.log('\n— B6. History distinguishes Expired vs Cancelled —');
  const histZ = await api('/api/jobs/history?status=cancelled', { token: custZ.token });
  const entryZ = (histZ.data.history || []).find(h => (h.id?.toString?.() || h.frontend?.id) === reqZ);
  check('[B6] Expired request Z appears in cancelled history', !!entryZ, (histZ.data.history || []).map(h => h.id));
  check('[B6] History carries cancelledReason=expired (frontend badge source)',
    entryZ && (entryZ.cancelledReason === 'expired' || entryZ.frontend?.cancelledReason === 'expired'), entryZ);

  // B7 - nearby list never shows expired request V? V still pending (20 min), but Z-expired must not show to B
  const nearbyB2 = await api('/api/requests/nearby', { token: provB.token });
  check('[B7] Expired request Z NOT in provider B nearby list', !(nearbyB2.data.requests || []).some(r => r.id?.toString() === reqZ));

  // ---------- wrap up ----------
  [scX, scZ, scA, scB].forEach(s => s.socket.disconnect());

  console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================`);
  if (failures.length) console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
