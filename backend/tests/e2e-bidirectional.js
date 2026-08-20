/**
 * E2E Bidirectional Activity Sync & Workflow Completion Test
 * ==========================================================
 * Simulates TWO REAL SESSIONS (customer + providers) against the live dev server:
 * REST calls with Bearer JWT + Socket.io clients with handshake.auth.token —
 * exactly what the two browser tabs do.
 *
 * Covers the FINAL SANITY CHECK from the workflow-completion brief:
 * customer posts request → provider notified (request:new) → provider sends offer with
 * edited price → customer sees it (offer:new) and DECLINES it → provider gets
 * offer:declined + persisted offer_declined notification → provider sends a SECOND
 * offer (revived) → customer accepts → provider details unlock (GET /api/jobs/:id has
 * name/rating/phone) → provider advances status live (job:statusUpdate each stage) →
 * provider marks complete → customer notified + rating prompt moment → BOTH rate each
 * other → each gets a "You received a new rating" (new_rating) notification →
 * both see the completed job in order history.
 *
 * Plus: request CANCEL with a pending offer (request:cancelled + request_cancelled
 * notification), other-provider "Not selected" (offer:rejected) on accept, and decline
 * guard rails (403 wrong role, 400 already-settled).
 *
 * Run: node tests/e2e-bidirectional.js   (backend must be running on :5000)
 */

const { io } = require('socket.io-client');

const API = process.env.API_URL || 'http://localhost:5000';
const LAHORE = { lng: 74.3587, lat: 31.5204 };

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
    console.log(`  ❌ ${name}${extra ? ' :: ' + JSON.stringify(extra) : ''}`);
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
  const events = {}; // event -> array of payloads
  const waiters = [];  // {event, filter, resolve, timer}
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
   'request:closed', 'request:cancelled', 'job:statusUpdate', 'notification:new', 'chat:message']
    .forEach(ev => s.on(ev, p => record(ev, p)));

  const waitFor = (event, { timeout = 6000, filter } = {}) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = waiters.findIndex(w => w.resolve === resolve);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error(`${label}: timed out waiting for ${event}`));
      }, timeout);
      waiters.push({ event, filter, resolve, timer });
    });

  const connected = new Promise((resolve, reject) => {
    s.on('connect', resolve);
    s.on('connect_error', reject);
  });

  return { socket: s, events, waitFor, connected, label };
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

async function main() {
  console.log(`\n🧪 Bidirectional Sync E2E against ${API}\n`);

  // ---------- Setup: three users, all Lahore ----------
  console.log('— Setup: customer + 2 providers (Lahore, plumber) —');
  const customer = await registerUser({ phone: `+92300${uniq}0`, name: 'Ali Customer', role: 'customer', city: 'Lahore' });
  const providerA = await registerUser({ phone: `+92301${uniq}1`, name: 'Bilal Plumber', role: 'provider', city: 'Lahore' });
  const providerB = await registerUser({ phone: `+92302${uniq}2`, name: 'Danish Plumber', role: 'provider', city: 'Lahore' });

  for (const p of [providerA, providerB]) {
    await api('/api/users/location', { method: 'PATCH', token: p.token, body: LAHORE });
    await api('/api/providers/setup', { method: 'PATCH', token: p.token, body: { category: 'plumber', radiusKm: 15, yearsExperience: 5, defaultVisitingCharge: 450 } });
    await api('/api/providers/dev/verify-me', { method: 'POST', token: p.token });
    await api('/api/users/profile', { method: 'PATCH', token: p.token, body: { isOnline: true } });
  }
  await api('/api/users/location', { method: 'PATCH', token: customer.token, body: LAHORE });
  check('3 users registered & providers online+verified (Lahore plumber)', true);

  // Connect sockets (= two real app sessions)
  const scC = connectSocket(customer.token, 'customer');
  const scA = connectSocket(providerA.token, 'providerA');
  const scB = connectSocket(providerB.token, 'providerB');
  await Promise.all([scC.connected, scA.connected, scB.connected]);
  check('3 socket sessions connected (JWT handshakes)', true);

  // ---------- 1. Customer posts request → provider notified ----------
  console.log('\n— 1. Customer posts request → provider A gets request:new —');
  const pReqNew = scA.waitFor('request:new');
  const create = await api('/api/requests', {
    method: 'POST', token: customer.token,
    body: { category: 'plumber', description: 'Kitchen pipe leaking badly under the sink', ...LAHORE, address: 'Model Town, Lahore', city: 'Lahore' },
  });
  check('Request created (201)', create.status === 201, create);
  const reqId = create.data.request.id.toString();
  const reqNew = await pReqNew;
  check('Provider A received request:new (live, matching city+category)', reqNew.request?.id?.toString() === reqId, reqNew);

  // ---------- 2. Provider A sends offer with EDITED price → customer sees it ----------
  console.log('\n— 2. Provider A sends offer 550 → customer gets offer:new —');
  const pOfferNew1 = scC.waitFor('offer:new');
  const offer1 = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: providerA.token, body: { visitingCharge: 550, etaMinutes: 20 } });
  check('Offer 1 created at EDITED price 550 (201)', offer1.status === 201 && offer1.data.offer.visitingCharge === 550, offer1);
  const offer1Id = offer1.data.offer.id.toString();
  const gotOffer1 = await pOfferNew1;
  check('Customer received offer:new for offer 1', gotOffer1.offer?.id?.toString() === offer1Id, gotOffer1);

  // ---------- 3. Customer DECLINES offer 1 → provider A gets offer:declined + notification ----------
  console.log('\n— 3. Customer declines offer 1 → provider A gets offer:declined + persisted notification —');
  const pDeclined = scA.waitFor('offer:declined');
  // Guard: provider is not allowed to decline (roleCheck customer)
  const declineAsProvider = await api(`/api/offers/${offer1Id}/decline`, { method: 'PATCH', token: providerA.token });
  check('Guard: provider cannot decline (403)', declineAsProvider.status === 403);
  const decline = await api(`/api/offers/${offer1Id}/decline`, { method: 'PATCH', token: customer.token });
  check('Decline succeeds (200), request stays pending', decline.status === 200 && decline.data.requestStatus === 'pending', decline);
  const declinedEvt = await pDeclined;
  check('Provider A received offer:declined with matching offerId', declinedEvt.offerId?.toString() === offer1Id, declinedEvt);
  check('Provider B did NOT receive offer:declined (targeted room)', (scB.events['offer:declined'] || []).length === 0);

  // Decline again → 400 (already settled)
  const declineTwice = await api(`/api/offers/${offer1Id}/decline`, { method: 'PATCH', token: customer.token });
  check('Guard: re-declining settled offer rejected (400)', declineTwice.status === 400);

  // ---------- 4. Provider A sends SECOND offer (revive after decline) ----------
  console.log('\n— 4. Provider A sends SECOND offer 500 (re-offer after decline) —');
  const pOfferNew2 = scC.waitFor('offer:new');
  const offer2 = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: providerA.token, body: { visitingCharge: 500, etaMinutes: 15 } });
  check('Second offer allowed after decline (201, revived with new price 500)', offer2.status === 201 && offer2.data.offer.visitingCharge === 500, offer2);
  const offer2Id = offer2.data.offer.id.toString();
  const gotOffer2 = await pOfferNew2;
  check('Customer received offer:new for second offer', gotOffer2.offer?.id?.toString() === offer2Id, gotOffer2);
  check('Second offer is the SAME document revived (unique request+provider)', offer2Id === offer1Id, { offer1Id, offer2Id });

  // Customer offers list shows two PENDING offers (declined one hidden by frontend; both pending here)
  const pOfferB = scC.waitFor('offer:new');
  const offerB = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: providerB.token, body: { visitingCharge: 700, etaMinutes: 25 } });
  check('Provider B offer 700 created (201)', offerB.status === 201);
  await pOfferB;
  const offersList = await api(`/api/requests/${reqId}/offers`, { token: customer.token });
  const pendingOnes = (offersList.data.offers || []).filter(o => o.status === 'pending');
  check('Customer sees 2 pending offers (A-revised + B), declined one settled', pendingOnes.length === 2, offersList.data);

  // ---------- 5. Customer accepts offer 2 → unlock + accepted/rejected to A/B ----------
  console.log('\n— 5. Customer accepts offer 2 → job created, details unlock, B gets offer:rejected —');
  const pAcceptedA = scA.waitFor('offer:accepted');
  const pRejectedB = scB.waitFor('offer:rejected');
  const accept = await api(`/api/offers/${offer2Id}/accept`, { method: 'PATCH', token: customer.token });
  check('Accept succeeds (200) with job created on_the_way', accept.status === 200 && accept.data.job && accept.data.job.status === 'on_the_way', accept);
  const jobId = accept.data.job.id.toString();
  const acceptedEvt = await pAcceptedA;
  check('Provider A received offer:accepted', acceptedEvt.offer?.id?.toString() === offer2Id, acceptedEvt);
  const rejectedEvt = await pRejectedB;
  check('Provider B received offer:rejected ("Not selected")', rejectedEvt.requestId?.toString() === reqId, rejectedEvt);

  // Decline after accept → 400 (already settled/accepted)
  const declineAfterAccept = await api(`/api/offers/${offerB.data.offer.id}/decline`, { method: 'PATCH', token: customer.token });
  check('Guard: decline after accept rejected (400)', declineAfterAccept.status === 400);

  // PART A: customer-side provider details unlock
  const jobView = await api(`/api/jobs/${jobId}`, { token: customer.token });
  check('Customer GET /api/jobs/:id → provider name + rating + PHONE unlocked',
    !!jobView.data?.job?.provider?.name && !!jobView.data?.job?.provider?.phone && jobView.data.job.provider.rating !== undefined,
    jobView.data?.job?.provider);
  check('Job starts on_the_way with contactUnlocked flag', jobView.data?.job?.status === 'on_the_way' && jobView.data?.job?.contactUnlocked === true);

  // ---------- 6. Provider advances status live → customer sees each stage ----------
  console.log('\n— 6. Provider advances status live → customer gets job:statusUpdate per stage —');
  for (const next of ['arrived', 'in_progress']) {
    const pStatus = scC.waitFor('job:statusUpdate', { filter: d => d.newStatus === next });
    const upd = await api(`/api/jobs/${jobId}/status`, { method: 'PATCH', token: providerA.token, body: { status: next } });
    check(`Status → ${next} (200)`, upd.status === 200);
    const evt = await pStatus;
    check(`Customer live job:statusUpdate ${next}`, evt.newStatus === next, evt);
  }

  // Backward guard
  const backward = await api(`/api/jobs/${jobId}/status`, { method: 'PATCH', token: providerA.token, body: { status: 'arrived' } });
  check('Guard: backward status rejected (400)', backward.status === 400);

  // ---------- 7. Provider marks complete → customer notified + rating moment ----------
  console.log('\n— 7. Provider completes → customer gets job:statusUpdate completed + job_status_update notification —');
  const pCompletedC = scC.waitFor('job:statusUpdate', { filter: d => d.newStatus === 'completed' });
  const pCompletedP = scA.waitFor('job:statusUpdate', { filter: d => d.newStatus === 'completed' });
  const done = await api(`/api/jobs/${jobId}/status`, { method: 'PATCH', token: providerA.token, body: { status: 'completed' } });
  check('Status → completed (200)', done.status === 200);
  await pCompletedC;
  await pCompletedP;
  check('BOTH sides received job:statusUpdate completed (rating prompt moment)', true);

  // Rating blocked before... allowed after completion — customer rates provider, provider rates customer
  const pRatingNotif = scA.waitFor('notification:new', { filter: d => d.notification?.type === 'new_rating' });
  const rate1 = await api(`/api/jobs/${jobId}/rate`, { method: 'POST', token: customer.token, body: { rating: 5, comment: 'Fixed fast, very professional' } });
  check('Customer rates provider (201)', rate1.status === 201, rate1);
  const ratingEvtA = await pRatingNotif;
  check('Provider got new_rating notification live ("You received a new rating")', ratingEvtA.notification?.type === 'new_rating', ratingEvtA);

  const pRatingNotifC = scC.waitFor('notification:new', { filter: d => d.notification?.type === 'new_rating' });
  const rate2 = await api(`/api/jobs/${jobId}/rate`, { method: 'POST', token: providerA.token, body: { rating: 4, comment: 'Good customer' } });
  check('Provider rates customer (201)', rate2.status === 201, rate2);
  await pRatingNotifC;
  check('Customer got new_rating notification live', true);

  const dupRate = await api(`/api/jobs/${jobId}/rate`, { method: 'POST', token: customer.token, body: { rating: 3 } });
  check('Guard: duplicate rating blocked (400)', dupRate.status === 400);

  // Overall average updated (5 from customer)
  const providerProfile = await api('/api/users/profile', { token: providerA.token });
  check('Provider rating aggregated to 5.0 with 1 review', providerProfile.data?.user?.rating === 5 && providerProfile.data?.user?.reviews === 1, providerProfile.data?.user);

  // ---------- 8. Both see it in order history ----------
  console.log('\n— 8. Order history reflects the completed job on both sides —');
  const histC = await api('/api/jobs/history?status=completed', { token: customer.token });
  const histP = await api('/api/jobs/history?status=all', { token: providerA.token });
  check('Customer history has completed job', (histC.data?.history || []).some(h => h.id?.toString() === jobId && h.status === 'completed'), histC.data);
  check('Provider history has completed job', (histP.data?.history || []).some(h => h.id?.toString() === jobId && h.status === 'completed'), histP.data);

  // ---------- 9. Notifications persisted on both sides ----------
  console.log('\n— 9. Notification persistence check (bell contents) —');
  const notifsC = await api('/api/notifications?limit=50', { token: customer.token });
  const notifsA = await api('/api/notifications?limit=50', { token: providerA.token });
  const notifsB = await api('/api/notifications?limit=50', { token: providerB.token });
  const typesOf = r => new Set((r.data?.notifications || []).map(n => n.type));
  check('Provider A bell contains offer_declined (from step 3)', typesOf(notifsA).has('offer_declined'), [...typesOf(notifsA)]);
  check('Provider A bell contains offer_accepted + job_status_update + new_rating',
    typesOf(notifsA).has('offer_accepted') && typesOf(notifsA).has('job_status_update') && typesOf(notifsA).has('new_rating'));
  check('Customer bell contains new_offer + job_status_update + new_rating',
    typesOf(notifsC).has('new_offer') && typesOf(notifsC).has('job_status_update') && typesOf(notifsC).has('new_rating'));
  check('Provider B bell contains offer_rejected ("Not selected")', typesOf(notifsB).has('offer_rejected'), [...typesOf(notifsB)]);

  // ---------- 10. Request CANCEL with pending offer → provider notified + badge data ----------
  console.log('\n— 10. Customer posts 2nd request, provider offers, customer cancels → request:cancelled + persisted notification —');
  const pReqNew2 = scA.waitFor('request:new');
  const create2 = await api('/api/requests', {
    method: 'POST', token: customer.token,
    body: { category: 'plumber', description: 'Bathroom tap needs replacement soon please', ...LAHORE, address: 'DHA Phase 3, Lahore', city: 'Lahore' },
  });
  check('Second request created (201)', create2.status === 201, create2);
  const req2Id = create2.data.request.id.toString();
  await pReqNew2;

  const pOfferNew3 = scC.waitFor('offer:new');
  const offer3 = await api(`/api/requests/${req2Id}/offers`, { method: 'POST', token: providerA.token, body: { visitingCharge: 400, etaMinutes: 10 } });
  check('Provider A offer on 2nd request created', offer3.status === 201);
  await pOfferNew3;

  const pCancelled = scA.waitFor('request:cancelled');
  const cancel = await api(`/api/requests/${req2Id}/cancel`, { method: 'PATCH', token: customer.token });
  check('Customer cancels 2nd request (200)', cancel.status === 200, cancel);
  const cancelEvt = await pCancelled;
  check('Provider A received request:cancelled', cancelEvt.requestId?.toString() === req2Id, cancelEvt);

  const notifsA2 = await api('/api/notifications?limit=50', { token: providerA.token });
  check('Provider A bell contains request_cancelled (persisted)', (notifsA2.data?.notifications || []).some(n => n.type === 'request_cancelled'));

  // Pending offer on cancelled request got auto-rejected server-side
  const req2View = await api(`/api/requests/${req2Id}`, { token: customer.token });
  const settled = (req2View.data?.request?.offers || []).every(o => o.status !== 'pending');
  check('Cancelled request has no dangling pending offers', settled, req2View.data?.request?.offers);

  // Cancelled request appears in customer order history (cancelled filter)
  const histCanC = await api('/api/jobs/history?status=cancelled', { token: customer.token });
  check('Customer history (cancelled) shows 2nd request', (histCanC.data?.history || []).some(h => h.id?.toString() === req2Id), histCanC.data);

  // ---------- Done ----------
  scC.socket.close(); scA.socket.close(); scB.socket.close();
  console.log(`\n========================================`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('Failed checks:', failures);
    process.exit(1);
  }
  console.log('🎉 Full bidirectional lifecycle verified end-to-end\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\n💥 E2E crashed:', err.message);
  process.exit(1);
});
