/**
 * OFFER-WITHDRAW + STALE-REQUEST/RE-NOTIFY + 2-MIN EXPIRY live suite (2026-08-21).
 *
 * Issue 4 (new feature): PATCH /api/offers/:id/withdraw - provider-only, owner-only,
 *   pending-only -> status 'withdrawn'; customer gets offer:withdrawn live + persisted
 *   offer_withdrawn bell; offer drops out of the customer's pending view; request stays
 *   open for the remaining offers.
 * Issue 5 (re-confirm): three offer end-states stay DISTINGUISHABLE in one request's
 *   lifecycle: withdrawn (A pulled out) vs accepted (B) vs rejected/"Not selected" (C,
 *   auto-settled when B was accepted).
 * Issue 1 (root causes): (a) legacy requests without expiresAt are now stale-judged by
 *   createdAt + REQUEST_EXPIRY_MINUTES (isStalePending unit checks + LIVE nearby sweep
 *   proving stale never reach the provider list); (b) frontend notify is ID-based, not
 *   count-based (static source check), so a 5s poll can never re-alarm on a seen request.
 * Issue 3 (re-confirm): customer cancel reachable in UI (static) + live cancel works and
 *   notifies the offering providers.
 * Issue 2 (re-confirm): default expiry is ~2 minutes and junk overrides are ignored
 *   (full machinery re-verified by e2e-availability-expiry.js).
 *
 * Exit 0 = all PASS. Requires backend on :5000.
 */
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const API = process.env.API_URL || 'http://localhost:5000';

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, e) => { fail++; console.log(`  FAIL  ${n}${e !== undefined ? '  -- ' + JSON.stringify(e).slice(0, 200) : ''}`); };
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
  return { token: v.data.token, id: v.data.user.id.toString() };
}
async function setupProvider(u, loc) {
  await api('/api/providers/setup', { method: 'PATCH', token: u.token, body: { category: 'plumber', radiusKm: 15, yearsExperience: 3, defaultVisitingCharge: 500 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: u.token });
  await api('/api/users/profile', { method: 'PATCH', token: u.token, body: { isOnline: true } });
  await api('/api/users/location', { method: 'PATCH', token: u.token, body: loc });
}
function session(token) {
  const events = [];
  const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
  ['request:new', 'offer:new', 'offer:accepted', 'offer:rejected', 'offer:declined', 'offer:withdrawn', 'request:cancelled', 'request:expired', 'notification:new'].forEach((ev) => s.on(ev, (d) => events.push({ ev, d })));
  const connected = new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); setTimeout(() => rej(new Error('socket timeout')), 9000); });
  const seen = (ev) => events.some((e) => e.ev === ev);
  return { s, events, connected, seen };
}
const FSD = { lng: 73.0776, lat: 31.4181, city: 'Faisalabad' };

(async () => {
  const uniq = String(Date.now()).slice(-7);

  console.log('\n=== Issue 1 static/unit: no re-notify machinery ===');
  const provSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'screens', 'provider.tsx'), 'utf8');
  check('S1 provider notify is ID-based (knownRequestIdsRef), count-based logic gone',
    provSrc.includes('knownRequestIdsRef') && !/nearbyRequests\.length > prevCountRef/.test(provSrc));
  const { isStalePending } = require('../src/utils/requestExpiry');
  check('S2 legacy pending request (NO expiresAt, createdAt 1h ago) is judged STALE',
    isStalePending({ status: 'pending', createdAt: new Date(Date.now() - 3600e3) }) === true);
  check('S3 fresh pending request (expiresAt in future) is NOT stale',
    isStalePending({ status: 'pending', expiresAt: new Date(Date.now() + 60e3) }) === false);

  console.log('\n=== Issue 3 static: customer cancel reachable in UI ===');
  const custSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'screens', 'customer.tsx'), 'utf8');
  check('S4 Offers screen has visible Cancel action wired to cancelRequest',
    /cancelRequest\(request\.id\)/.test(custSrc) && custSrc.includes('>Cancel<'));

  console.log('\n=== LIVE: customer + 3 providers (A withdraws, B accepted, C not-selected) ===');
  const cust = await register(`+92330${uniq}`, 'W Test Customer', 'customer', 'Faisalabad');
  await api('/api/users/location', { method: 'PATCH', token: cust.token, body: FSD });
  const pA = await register(`+92331${uniq}`, 'A Withdrawer', 'provider', 'Faisalabad');
  const pB = await register(`+92332${uniq}`, 'B Acceptor', 'provider', 'Faisalabad');
  const pC = await register(`+92333${uniq}`, 'C Loser', 'provider', 'Faisalabad');
  await setupProvider(pA, FSD); await setupProvider(pB, FSD); await setupProvider(pC, FSD);
  const scC = session(cust.token), scA = session(pA.token), scB = session(pB.token), scC3 = session(pC.token);
  await Promise.all([scC.connected, scA.connected, scB.connected, scC3.connected]);
  ok('registered + 4 sockets connected');

  const req = await api('/api/requests', { method: 'POST', token: cust.token, body: { category: 'plumber', description: 'Withdraw flow test pipe burst', ...FSD, address: 'Jaranwala Rd, Faisalabad' } });
  const reqId = req.data.request.id.toString();
  check('request 201; default expiry ~2min (Issue 2 inline re-confirm)', (() => {
    const d = new Date(req.data.request.expiresAt).getTime() - Date.now();
    return req.status === 201 && d > 1.9 * 60e3 && d < 2.1 * 60e3;
  })(), req.data.request.expiresAt);

  const oA = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: pA.token, body: { visitingCharge: 500, etaMinutes: 10 } });
  const oB = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: pB.token, body: { visitingCharge: 550, etaMinutes: 12 } });
  const oC = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: pC.token, body: { visitingCharge: 450, etaMinutes: 20 } });
  const oAId = oA.data.offer.id.toString(), oBId = oB.data.offer.id.toString();
  check('3 offers pending (A/B/C)', oA.status === 201 && oB.status === 201 && oC.status === 201);

  console.log('\n--- Issue 4: withdraw matrix ---');
  const wrongProv = await api(`/api/offers/${oAId}/withdraw`, { method: 'PATCH', token: pB.token });
  check('non-owner provider withdraw -> 403', wrongProv.status === 403, wrongProv.status);
  const custTry = await api(`/api/offers/${oAId}/withdraw`, { method: 'PATCH', token: cust.token });
  check('customer withdraw -> 403 (role)', custTry.status === 403, custTry.status);
  const wd = await api(`/api/offers/${oAId}/withdraw`, { method: 'PATCH', token: pA.token });
  check('owner provider withdraw -> 200, status=withdrawn', wd.status === 200 && wd.data?.offer?.status === 'withdrawn', wd.data);
  const wd2 = await api(`/api/offers/${oAId}/withdraw`, { method: 'PATCH', token: pA.token });
  check('re-withdraw -> 400 (already withdrawn)', wd2.status === 400, wd2.status);
  await new Promise((r) => setTimeout(r, 800));
  check('customer got offer:withdrawn LIVE', scC.seen('offer:withdrawn'));

  const offersNow = await api(`/api/requests/${reqId}/offers`, { token: cust.token });
  const pend = (offersNow.data?.offers || []).filter((o) => o.status === 'pending');
  const aState = (offersNow.data?.offers || []).find((o) => (o.id || o._id).toString() === oAId);
  check("A's offer is 'withdrawn' in DB and OUT of customer's pending view", pend.length === 2 && aState?.status === 'withdrawn',
    pend.map(o => o.status));
  const reqAfterWd = await api(`/api/requests/${reqId}`, { token: cust.token });
  check('request STILL pending after withdraw (stays open for B/C)', (reqAfterWd.data?.request?.status) === 'pending');
  const notifC = await api('/api/notifications', { token: cust.token });
  check('customer bell has persisted offer_withdrawn entry',
    (notifC.data?.notifications || []).some((n) => n.type === 'offer_withdrawn'));

  console.log('\n--- Issue 5: accept B -> C auto-rejected; 3 end-states distinct ---');
  const acc = await api(`/api/offers/${oBId}/accept`, { method: 'PATCH', token: cust.token });
  check('accept B -> 200 + job created', acc.status === 200 && !!acc.data?.job, acc.status);
  const final = await api(`/api/requests/${reqId}/offers`, { token: cust.token });
  const byId = Object.fromEntries((final.data?.offers || []).map((o) => [(o.id || o._id).toString(), o.status]));
  check('END STATES distinct: A=withdrawn, B=accepted, C=rejected',
    byId[oAId] === 'withdrawn' && byId[oBId] === 'accepted' && byId[oC.data.offer.id.toString()] === 'rejected', byId);
  await new Promise((r) => setTimeout(r, 800));
  check('C got offer:rejected live (feeds "Not selected" badge)', scC3.seen('offer:rejected'));
  const wdTooLate = await api(`/api/offers/${oC.data.offer.id.toString()}/withdraw`, { method: 'PATCH', token: pC.token });
  check('withdraw AFTER request settled -> 400', wdTooLate.status === 400, wdTooLate.status);

  console.log('\n--- Issue 3 live: customer cancel works + offering provider notified ---');
  // fresh customer - the first one has an ACTIVE job and one-open-request blocks pending+active
  const cust3 = await register(`+92335${uniq}`, 'Cancel Test Customer', 'customer', 'Faisalabad');
  await api('/api/users/location', { method: 'PATCH', token: cust3.token, body: FSD });
  const req2 = await api('/api/requests', { method: 'POST', token: cust3.token, body: { category: 'plumber', description: 'Cancel flow test request here', ...FSD, address: 'Canal Rd, Faisalabad' } });
  const req2Id = req2.data.request.id.toString();
  const oA2 = await api(`/api/requests/${req2Id}/offers`, { method: 'POST', token: pA.token, body: { visitingCharge: 520, etaMinutes: 11 } });
  const cancel = await api(`/api/requests/${req2Id}/cancel`, { method: 'PATCH', token: cust3.token });
  check('cancel 200', cancel.status === 200 && req2.status === 201 && oA2.status === 201, cancel.status);
  await new Promise((r) => setTimeout(r, 800));
  check('offering provider got request:cancelled live (feeds "Request cancelled" badge)', scA.seen('request:cancelled'));

  console.log('\n--- Issue 1 live: stale (expired) request never reaches a nearby list ---');
  const cust2 = await register(`+92334${uniq}`, 'Z Expiry Customer', 'customer', 'Faisalabad');
  const reqOld = await api('/api/requests', { method: 'POST', token: cust2.token, body: { category: 'plumber', description: 'Fast-expiry stale request demo', ...FSD, address: 'Old St, Faisalabad', expiresInMinutes: 0.001 } });
  // expiresInMinutes 0.001 (60ms) - valid dev override (0<n<=60); give it a beat to go stale
  await new Promise((r) => setTimeout(r, 1500));
  const nearbyC = await api('/api/requests/nearby', { token: pC.token });
  const idsNear = (nearbyC.data?.requests || []).map((r) => (r.id || r._id).toString());
  check('stale request swept & absent from nearby (legacy+expiry machinery, Issue 1)',
    reqOld.status === 201 && !idsNear.includes(reqOld.data.request.id.toString()), { created: reqOld.data?.request?.id, nearby: idsNear.length });
  const oldAfter = await api(`/api/requests/${reqOld.data.request.id.toString()}`, { token: cust2.token });
  check('stale request flipped to cancelled/expired on read', (oldAfter.data?.request?.status) === 'cancelled' && (oldAfter.data?.request?.cancelledReason) === 'expired',
    oldAfter.data?.request?.status);

  [scC, scA, scB, scC3].forEach((x) => x.s.close());
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Offer-withdraw suite crashed:', e); process.exit(1); });
