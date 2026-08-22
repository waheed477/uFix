/**
 * NOTIFICATION-SEMANTICS + VIEW-COUNT + PROVIDER-HOME LAYOUT suite (2026-08-21).
 *
 * Issue 1 (UI): incoming requests are the PRIMARY content of Provider Home
 *   (option a chosen — see project_context.md): compact status/stats on top, the
 *   full-width request list owns the scroll region, "Your offers · live" moved below it.
 *   Static checks assert the layout invariants without touching the app logic.
 *
 * Issue 2 (logic): (a) posting a request must NOT persist a 'request_new' bell
 *   notification on every nearby provider — the request:new SOCKET event (and the
 *   client sound/vibration cue) stays, the persisted noise is gone; (b) the customer
 *   gets a live "X providers viewing your request" indicator — seeded in the create
 *   response and kept live via the request:viewCount socket (re-emitted on provider
 *   online/offline), count == the exact eligible-provider set used for fan-out
 *   (busy providers excluded — they're hidden from the request, so they aren't viewing).
 *
 * Exit 0 = all PASS. Requires backend on :5000.
 */
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const API = process.env.API_URL || 'http://localhost:5000';

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, e) => { fail++; console.log(`  FAIL  ${n}${e !== undefined ? '  -- ' + JSON.stringify(e).slice(0, 220) : ''}`); };
const check = (n, c, e) => (c ? ok(n) : bad(n, e));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = (v) => (v === undefined || v === null ? '' : v.toString());
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

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
  return { token: v.data.token, id: S(v.data.user.id) };
}
async function setupProvider(u, loc, category = 'plumber') {
  await api('/api/providers/setup', { method: 'PATCH', token: u.token, body: { category, radiusKm: 15, yearsExperience: 3, defaultVisitingCharge: 500 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: u.token });
  await api('/api/users/profile', { method: 'PATCH', token: u.token, body: { isOnline: true } });
  await api('/api/users/location', { method: 'PATCH', token: u.token, body: loc });
}
function session(token) {
  const events = [];
  const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
  ['request:new', 'request:viewCount', 'notification:new', 'offer:accepted'].forEach((ev) => s.on(ev, (d) => events.push({ ev, d })));
  const connected = new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); setTimeout(() => rej(new Error('socket timeout')), 9000); });
  const count = (ev, f) => events.filter((e) => e.ev === ev && (!f || f(e.d))).length;
  return { s, events, connected, count };
}
const FSD = { lng: 73.0776, lat: 31.4181, city: 'Faisalabad' };
const ROOT = path.join(__dirname, '..', '..');

(async () => {
  const uniq = String(Date.now()).slice(-7);

  console.log('\n=== STATIC: Issue 1 layout (option a) wiring intact ===');
  const prov = fs.readFileSync(path.join(ROOT, 'frontend/src/screens/provider.tsx'), 'utf8');
  const iReq = prov.indexOf('Requests in {location.city}');
  const iOffers = prov.indexOf('Your offers · live');
  const iScrollOpen = prov.indexOf('flex-1 overflow-y-auto px-4 pb-4');
  check('L1 incoming-requests block is INSIDE the primary scroll region, and "Your offers · live" moved BELOW it',
    iScrollOpen !== -1 && iReq > iScrollOpen && iOffers > iReq, { iScrollOpen, iReq, iOffers });
  check('L2 compact fixed top (slim toggle card p-4, compact stats p-2.5) — requests own the screen',
    prov.includes('overflow-hidden rounded-3xl p-4 text-white') && prov.includes('rounded-2xl bg-white p-2.5 shadow-card'));
  check('L3 ID-based no-repeat notification tracking preserved (knownRequestIdsRef still wired)',
    prov.includes('knownRequestIdsRef') && (prov.includes('notifyAlert') || prov.includes('playNewRequestTone(')));
  check('L4 busy-lock focus-mode + offline states preserved in the scroll region',
    prov.includes('Focus mode: one job at a time') && prov.includes("You're offline"));

  console.log('\n=== STATIC: Issue 2 semantics ===');
  const rc = strip(fs.readFileSync(path.join(ROOT, 'backend/src/controllers/requestController.js'), 'utf8'));
  check('N1 createRequest persists NO request_new notification (comment-stripped source clean)',
    !/createNotification\([^)]*request_new/s.test(rc) && !rc.includes("'request_new'"));
  check('N2 createRequest still emits LIVE request:new + emits request:viewCount to the customer',
    rc.includes("emit('request:new'") && rc.includes("emit('request:viewCount'"));
  const uc = strip(fs.readFileSync(path.join(ROOT, 'backend/src/controllers/userController.js'), 'utf8'));
  check('N3 provider online/offline toggle re-emits view counts (reemitViewCountsForProvider wired)',
    uc.includes('reemitViewCountsForProvider') && uc.includes("req.app.get('io')"));
  const store = fs.readFileSync(path.join(ROOT, 'frontend/src/lib/store.tsx'), 'utf8');
  check('N4 frontend store: request:viewCount listener + viewCounts state + cleanup on settle + create-response seed',
    store.includes("'request:viewCount'") && store.includes('viewCounts') && store.includes('viewingProviders') && store.includes('offRequestViewCount();'));
  const cust = fs.readFileSync(path.join(ROOT, 'frontend/src/screens/customer.tsx'), 'utf8');
  check('N5 UI: "viewing your request" pill exists and is rendered on Offers + AvailableProviders screens',
    cust.includes('viewing your request') && cust.includes('ViewingPill') && cust.match(/<ViewingPill/g)?.length >= 2);

  console.log('\n=== LIVE: 1 customer + 2 matching plumbers + 1 electrician (non-matching) ===');
  const C = await register(`+92350${uniq}`, 'VC Customer', 'customer', 'Faisalabad');
  await api('/api/users/location', { method: 'PATCH', token: C.token, body: FSD });
  const P1 = await register(`+92351${uniq}`, 'VC Plumber One', 'provider', 'Faisalabad');
  const P2 = await register(`+92352${uniq}`, 'VC Plumber Two', 'provider', 'Faisalabad');
  const P3 = await register(`+92353${uniq}`, 'VC Electrician', 'provider', 'Faisalabad');
  await setupProvider(P1, FSD); await setupProvider(P2, FSD);
  await setupProvider(P3, FSD, 'electrician');
  const scC = session(C.token), scP1 = session(P1.token), scP2 = session(P2.token), scP3 = session(P3.token);
  await Promise.all([scC.connected, scP1.connected, scP2.connected, scP3.connected]);
  ok('3 providers + 1 customer registered, sockets connected');

  // Shared-DB safe baseline: how many eligible (online+verified, non-busy) plumbers exist
  // in Faisalabad right now = what the fan-out/view count must equal.
  const E = (await api('/api/providers/available?city=Faisalabad&category=plumber', { token: C.token })).data?.count ?? 2;
  console.log(`  (live baseline: ${E} eligible plumbers currently in Faisalabad)`);
  const r = await api('/api/requests', { method: 'POST', token: C.token, body: { category: 'plumber', description: 'View count semantics test request post', ...FSD, address: 'Susan Rd, Faisalabad' } });
  const RID = S(r.data?.request?.id);
  await sleep(1000);
  check(`V1 create 201 + viewingProviders {count:${E}, category:plumber} IN RESPONSE (all matching plumbers; electrician excluded)`,
    r.status === 201 && r.data?.request?.viewingProviders?.count === E && r.data?.request?.viewingProviders?.category === 'plumber', r.data?.request?.viewingProviders);
  check(`V2 customer got request:viewCount LIVE {requestId, count:${E}, category:plumber}`,
    scC.count('request:viewCount', (d) => S(d?.requestId) === RID && d?.count === E && d?.category === 'plumber') === 1,
    scC.events.filter((e) => e.ev === 'request:viewCount').map((e) => e.d));
  check('V3 both matching plumbers still got the LIVE request:new event; electrician did NOT',
    scP1.count('request:new') === 1 && scP2.count('request:new') === 1 && scP3.count('request:new') === 0);
  const p1Bell = (await api('/api/notifications', { token: P1.token })).data?.notifications || [];
  const p2Bell = (await api('/api/notifications', { token: P2.token })).data?.notifications || [];
  check('V4 ZERO persisted request_new entries on either provider bell (seeing is not a notification)',
    !p1Bell.some((n) => n.type === 'request_new') && !p2Bell.some((n) => n.type === 'request_new'),
    { p1: p1Bell.map((n) => n.type), p2: p2Bell.map((n) => n.type) });

  console.log('\n--- live count updates on provider online/offline ---');
  await api('/api/users/profile', { method: 'PATCH', token: P2.token, body: { isOnline: false } });
  await sleep(1000);
  check(`V5 plumber #2 goes OFFLINE -> customer re-pinged count ${E}-1`,
    scC.count('request:viewCount', (d) => S(d?.requestId) === RID && d?.count === E - 1) === 1,
    scC.events.filter((e) => e.ev === 'request:viewCount' && S(e.d?.requestId) === RID).map((e) => e.d?.count));
  await api('/api/users/profile', { method: 'PATCH', token: P2.token, body: { isOnline: true } });
  await sleep(1000);
  check(`V6 plumber #2 back ONLINE -> customer re-pinged count ${E} (2nd full-count ping)`,
    scC.count('request:viewCount', (d) => S(d?.requestId) === RID && d?.count === E) === 2,
    scC.events.filter((e) => e.ev === 'request:viewCount' && S(e.d?.requestId) === RID).map((e) => e.d?.count));

  console.log('\n--- busy-lock parity: busy provider is NOT counted as viewing ---');
  const C2 = await register(`+92354${uniq}`, 'VC Customer Two', 'customer', 'Faisalabad');
  await api('/api/users/location', { method: 'PATCH', token: C2.token, body: FSD });
  const r2 = await api('/api/requests', { method: 'POST', token: C2.token, body: { category: 'plumber', description: 'Busy parity setup request for job', ...FSD, address: 'Gulistan Colony, Faisalabad' } });
  const R2 = S(r2.data?.request?.id);
  await sleep(600);
  const o = await api(`/api/requests/${R2}/offers`, { method: 'POST', token: P1.token, body: { visitingCharge: 500, etaMinutes: 10 } });
  const acc = await api(`/api/offers/${S(o.data?.offer?.id)}/accept`, { method: 'PATCH', token: C2.token });
  check('V7 setup: P1 now BUSY (offer 201 + accept 200)', o.status === 201 && acc.status === 200, { o: o.status, acc: acc.status });
  const C3 = await register(`+92355${uniq}`, 'VC Customer Three', 'customer', 'Faisalabad');
  await api('/api/users/location', { method: 'PATCH', token: C3.token, body: FSD });
  const scC3 = session(C3.token); await scC3.connected;
  const r3 = await api('/api/requests', { method: 'POST', token: C3.token, body: { category: 'plumber', description: 'View count busy exclusion test post', ...FSD, address: 'Satiana Rd, Faisalabad' } });
  await sleep(1000);
  check(`V8 new request while P1 busy -> viewingProviders count ${E}-1 (busy excluded - matches fan-out exactly)`,
    r3.data?.request?.viewingProviders?.count === E - 1 &&
    scC3.count('request:viewCount', (d) => S(d?.requestId) === S(r3.data?.request?.id) && d?.count === E - 1) === 1,
    { resp: r3.data?.request?.viewingProviders, live: scC3.events.filter((e) => e.ev === 'request:viewCount').map((e) => e.d?.count) });
  check('V9 busy P1 got NO request:new for that request (fan-out parity re-confirmed)',
    scP1.count('request:new', (d) => S(d?.request?.id || d?.requestId) === S(r3.data?.request?.id)) === 0);

  // tidy: release P1's busy lock (V7 job) so suites after this one on the same shared
  // dev-inmemory DB see realistic availability again
  const activeJob = await api('/api/jobs/my/active', { token: P1.token });
  const AJ = S(activeJob.data?.job?.id);
  if (AJ) for (const st of ['arrived', 'in_progress', 'completed']) { await api(`/api/jobs/${AJ}/status`, { method: 'PATCH', token: P1.token, body: { status: st } }); }

  [scC, scP1, scP2, scP3, scC3].forEach((x) => x.s.close());
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Suite crashed:', e); process.exit(1); });
