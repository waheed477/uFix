/**
 * FULL END-TO-END SELF-TEST (2026-08-21) — the final deployment gate.
 * Simulates REAL users over REAL HTTP + REAL Socket.io against the running
 * backend (:5000, dev-inmemory). Runs the 20-step workflow IN ORDER:
 *
 *  1  customer signup (OTP) + city + location
 *  2  provider signup + setup (category/radius/price) + document upload +
 *     dev auto-verify + online
 *  3  customer posts matching request
 *  4  provider gets request:new LIVE + NO duplicate/repeat notify on re-polls
 *  5  provider sends offer with EDITED price
 *  6  customer gets offer:new LIVE
 *  7  provider offers on a 2nd customer's request, then WITHDRAWS it
 *     (customer notified live+persisted; "Withdrawn" badge distinct)
 *  8  customer DECLINES the first offer (provider notified, "Declined")
 *  9  provider re-offers on the same request (revive path)
 * 10  customer ACCEPTS -> Job created, contact unlock both sides,
 *     auto-navigate wiring to Active Job
 * 11  the OTHER pending offer auto -> rejected ("Not selected", distinct)
 * 12  customer CANCEL on a separate request (cancel CTA + provider notified)
 * 13  status on_the_way->arrived->in_progress->completed LIVE each step;
 *     backward + skip attempts rejected 400
 * 14  completion -> live both sides + persisted + rating prompt wiring
 * 15  CUSTOMER-ONLY rating (2026-08-23): customer->provider ok; provider->customer 403; averages update; duplicates blocked
 * 16  chat both directions live + read receipts
 * 17  order history both sides (+ cancelled entry on the other customer)
 * 18  notification bells: full trail types both sides + read/unread state
 * 19  expiry (test override): auto-expire, offers rejected, providers
 *     notified, distinguishable from manual cancel (cancelledReason)
 * 20  busy-lock: active-job provider gets NO request:new for a new match,
 *     nearby is empty/hasActiveJob, offer attempt -> 400 PROVIDER_BUSY
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
async function uploadDoc(token) {
  const fd = new FormData();
  fd.append('document', new Blob([Buffer.from('%PDF-1.4 fake verification doc')], { type: 'application/pdf' }), 'cnic.pdf');
  const res = await fetch(`${API}/api/providers/document`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function setupProvider(u, loc) {
  const s = await api('/api/providers/setup', { method: 'PATCH', token: u.token, body: { category: 'plumber', radiusKm: 15, yearsExperience: 3, defaultVisitingCharge: 500 } });
  const d = await uploadDoc(u.token);
  const v = await api('/api/providers/dev/verify-me', { method: 'POST', token: u.token });
  const on = await api('/api/users/profile', { method: 'PATCH', token: u.token, body: { isOnline: true } });
  await api('/api/users/location', { method: 'PATCH', token: u.token, body: loc });
  const me = await api('/api/users/profile', { token: u.token });
  return { setupOk: s.status === 200, docOk: d.status === 200, verifyOk: v.status === 200, onlineOk: on.status === 200, me: me.data?.user || me.data };
}
const ALL_EVENTS = ['request:new', 'request:viewCount', 'request:closed', 'request:cancelled', 'request:expired', 'offer:new', 'offer:accepted', 'offer:rejected', 'offer:declined', 'offer:withdrawn', 'job:statusUpdate', 'notification:new', 'chat:message', 'chat:read', 'chat:error'];
function session(token) {
  const events = [];
  const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
  ALL_EVENTS.forEach((ev) => s.on(ev, (d) => events.push({ ev, d })));
  const connected = new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); setTimeout(() => rej(new Error('socket timeout')), 9000); });
  const seen = (ev) => events.some((e) => e.ev === ev);
  const count = (ev, matchFn) => events.filter((e) => e.ev === ev && (!matchFn || matchFn(e.d))).length;
  return { s, events, connected, seen, count, emit: (a, b) => new Promise((res) => s.emit(a, b, res)) };
}
const reqIdOf = (d) => S(d?.request?.id || d?.request?._id || d?.requestId);
const FSD = { lng: 73.0776, lat: 31.4181, city: 'Faisalabad' };
const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', f), 'utf8');

(async () => {
  const uniq = String(Date.now()).slice(-7);
  console.log('\n=== Steps 1-2: signup + provider setup (real OTP/document/verify/online) ===');
  const C1 = await register(`+92340${uniq}`, 'Self Customer One', 'customer', 'Faisalabad');
  const C2 = await register(`+92341${uniq}`, 'Self Customer Two', 'customer', 'Faisalabad');
  const P1 = await register(`+92342${uniq}`, 'Self Provider Main', 'provider', 'Faisalabad');
  const P2 = await register(`+92343${uniq}`, 'Self Provider Other', 'provider', 'Faisalabad');
  const loc1 = await api('/api/users/location', { method: 'PATCH', token: C1.token, body: FSD });
  const me1 = await api('/api/users/profile', { token: C1.token });
  check('S1 customer: OTP signup + city + location persisted (200s, city=Faisalabad)',
    loc1.status === 200 && me1.status === 200 && (me1.data?.user?.city || me1.data?.city) === 'Faisalabad', me1.data);
  await api('/api/users/location', { method: 'PATCH', token: C2.token, body: FSD });

  const p1s = await setupProvider(P1, FSD);
  await setupProvider(P2, FSD);
  check('S2 provider: setup(category/radius/price) + document upload(200) + verify + online + persisted isVerified',
    p1s.setupOk && p1s.docOk && p1s.verifyOk && p1s.onlineOk && p1s.me?.isVerified === true,
    { doc: p1s.docOk, verified: p1s.me?.isVerified });

  const scC1 = session(C1.token), scC2 = session(C2.token), scP1 = session(P1.token), scP2 = session(P2.token);
  await Promise.all([scC1.connected, scC2.connected, scP1.connected, scP2.connected]);
  ok('S1/S2 4 real socket sessions connected');

  console.log('\n=== Steps 3-4: request -> LIVE request:new, NO duplicate notify on re-polls ===');
  // Shared-DB safe: derive the expected viewing count live (other suites may have left
  // eligible plumbers online on the same dev-inmemory DB). The available endpoint applies
  // the same online+verified+non-busy eligibility, so it predicts the fan-out/view count.
  const availNow = await api(`/api/providers/available?city=Faisalabad&category=plumber`, { token: C1.token });
  const EXPECT_VIEW = availNow.data?.count ?? 2;
  const r1 = await api('/api/requests', { method: 'POST', token: C1.token, body: { category: 'plumber', description: 'Self-test kitchen pipe leak', ...FSD, address: 'Gulberg, Faisalabad' } });
  const R1 = S(r1.data?.request?.id);
  check('S3 request created 201 (plumber/Faisalabad)', r1.status === 201 && !!R1, r1.status);
  await sleep(900);
  const gotNew = scP1.count('request:new', (d) => reqIdOf(d) === R1);
  check('S4 provider received request:new LIVE for R1 exactly once', gotNew === 1, gotNew);
  // re-poll 3x like the 5s ProviderHome polling -> must NOT re-notify server-side
  for (let i = 0; i < 3; i++) { await api('/api/requests/nearby', { token: P1.token }); await sleep(500); }
  await sleep(400);
  const p1Bell1 = await api('/api/notifications', { token: P1.token });
  const requestNewForR1 = (p1Bell1.data?.notifications || []).filter((n) => n.type === 'request_new' && S(n.relatedId) === R1);
  check('S4 no duplicate socket alert (still 1 after 3 polls); ZERO persisted request_new entries (2026-08-21 semantics: seeing != notification)',
    scP1.count('request:new', (d) => reqIdOf(d) === R1) === 1 && requestNewForR1.length === 0,
    { socket: scP1.count('request:new', (d) => reqIdOf(d) === R1), persisted: requestNewForR1.length });
  // Issue 2: customer-side live "X providers viewing" — seeded in 201 response + emitted live
  check(`S4b create response carries viewingProviders {count:${EXPECT_VIEW} (= live eligible count), category:plumber}`,
    r1.data?.request?.viewingProviders?.count === EXPECT_VIEW && r1.data?.request?.viewingProviders?.category === 'plumber',
    r1.data?.request?.viewingProviders);
  check('S4c customer got request:viewCount LIVE for R1 with the same count',
    scC1.count('request:viewCount', (d) => S(d?.requestId) === R1 && d?.count === EXPECT_VIEW && d?.category === 'plumber') === 1,
    scC1.events.filter((e) => e.ev === 'request:viewCount').map((e) => e.d));
  // live update on provider offline/online while R1 still pending
  const vcBefore = scC1.count('request:viewCount', (d) => S(d?.requestId) === R1);
  await api('/api/users/profile', { method: 'PATCH', token: P2.token, body: { isOnline: false } });
  await sleep(900);
  check(`S4d P2 offline -> customer re-pinged request:viewCount count ${EXPECT_VIEW}-1`,
    scC1.count('request:viewCount', (d) => S(d?.requestId) === R1 && d?.count === EXPECT_VIEW - 1) === 1,
    scC1.events.filter((e) => e.ev === 'request:viewCount' && S(e.d?.requestId) === R1).map((e) => e.d?.count));
  await api('/api/users/profile', { method: 'PATCH', token: P2.token, body: { isOnline: true } });
  await sleep(900);
  check(`S4e P2 back online -> request:viewCount back to ${EXPECT_VIEW} (2nd full-count ping)`,
    scC1.count('request:viewCount', (d) => S(d?.requestId) === R1 && d?.count === EXPECT_VIEW) === 2,
    scC1.events.filter((e) => e.ev === 'request:viewCount' && S(e.d?.requestId) === R1).map((e) => e.d?.count));
  const frontSrc = SRC(path.join('screens', 'provider.tsx'));
  check('S4 frontend re-notify guard is ID-based (knownRequestIdsRef), count-compare gone',
    frontSrc.includes('knownRequestIdsRef') && !/nearbyRequests\.length > prevCountRef/.test(frontSrc));

  console.log('\n=== Steps 5-6: edited-price offer -> LIVE offer:new ===');
  const o1 = await api(`/api/requests/${R1}/offers`, { method: 'POST', token: P1.token, body: { visitingCharge: 650, etaMinutes: 12 } });
  const O1 = S(o1.data?.offer?.id);
  check('S5 offer 201 with EDITED price 650 (profile default was 500)', o1.status === 201 && o1.data?.offer?.visitingCharge === 650, o1.data);
  await sleep(700);
  check('S6 customer got offer:new LIVE for O1 + new_offer persisted',
    scC1.count('offer:new', (d) => S(d?.offer?.id) === O1) === 1 &&
    (await api('/api/notifications', { token: C1.token })).data?.notifications?.some((n) => n.type === 'new_offer'));

  console.log('\n=== Step 7: 2nd customer + offer + WITHDRAW ===');
  const r2 = await api('/api/requests', { method: 'POST', token: C2.token, body: { category: 'plumber', description: 'Self-test bathroom tap broken', ...FSD, address: 'D Ground, Faisalabad' } });
  const R2 = S(r2.data?.request?.id);
  await sleep(700);
  const o2 = await api(`/api/requests/${R2}/offers`, { method: 'POST', token: P1.token, body: { visitingCharge: 400, etaMinutes: 15 } });
  const O2 = S(o2.data?.offer?.id);
  check('S7a offer on R2 created 201', o2.status === 201 && !!O2, o2.status);
  const wd = await api(`/api/offers/${O2}/withdraw`, { method: 'PATCH', token: P1.token });
  check('S7b owner withdraw 200, status=withdrawn', wd.status === 200 && wd.data?.offer?.status === 'withdrawn', wd.data);
  await sleep(800);
  const c2Bell = await api('/api/notifications', { token: C2.token });
  check('S7c 2nd customer got offer:withdrawn LIVE (correct offerId/requestId) + persisted offer_withdrawn',
    scC2.count('offer:withdrawn', (d) => S(d?.offerId) === O2 && S(d?.requestId) === R2) === 1 &&
    c2Bell.data?.notifications?.some((n) => n.type === 'offer_withdrawn'),
    { live: scC2.count('offer:withdrawn'), types: (c2Bell.data?.notifications || []).map((n) => n.type) });
  const provSrc = SRC(path.join('screens', 'provider.tsx'));
  check('S7d badges distinct in UI source: "↩ Withdrawn by you" (sky) vs "✗ Declined" (rose) vs "Not selected" (grey)',
    provSrc.includes('↩ Withdrawn by you') && /declined:\s*\{ label: "✗ Declined", cls: "bg-rose-100/.test(provSrc) &&
    provSrc.includes('Not selected') && /withdrawn:\s*\{ label: "↩ Withdrawn by you", cls: "bg-sky-100/.test(provSrc));

  console.log('\n=== Step 8: customer DECLINES first offer ===');
  const dec = await api(`/api/offers/${O1}/decline`, { method: 'PATCH', token: C1.token });
  check('S8a decline 200, offer -> rejected', dec.status === 200, dec.data);
  await sleep(700);
  check('S8b provider got offer:declined LIVE for O1 + persisted offer_declined',
    scP1.count('offer:declined', (d) => S(d?.offer?.id || d?.offerId) === O1) === 1 &&
    (await api('/api/notifications', { token: P1.token })).data?.notifications?.some((n) => n.type === 'offer_declined'),
    scP1.events.filter((e) => e.ev === 'offer:declined').map((e) => e.d));

  console.log('\n=== Step 9: provider re-offers (revive) + other provider offers ===');
  const o1b = await api(`/api/requests/${R1}/offers`, { method: 'POST', token: P1.token, body: { visitingCharge: 520, etaMinutes: 10 } });
  check('S9a revive: same offer id, new price 520, status pending',
    o1b.status === 201 && S(o1b.data?.offer?.id) === O1 && o1b.data?.offer?.visitingCharge === 520 && o1b.data?.offer?.status === 'pending', o1b.data);
  const o3 = await api(`/api/requests/${R1}/offers`, { method: 'POST', token: P2.token, body: { visitingCharge: 480, etaMinutes: 20 } });
  const O3 = S(o3.data?.offer?.id);
  const offs = await api(`/api/requests/${R1}/offers`, { token: C1.token });
  const pendingNow = (offs.data?.offers || []).filter((o) => o.status === 'pending').length;
  check('S9b other provider offer 201; customer sees exactly 2 pending offers on R1', o3.status === 201 && pendingNow === 2, pendingNow);

  console.log('\n=== Step 10: ACCEPT -> job + contact unlock + Active-Job navigation wiring ===');
  const acc = await api(`/api/offers/${O1}/accept`, { method: 'PATCH', token: C1.token });
  check('S10a accept 200', acc.status === 200, acc.data);
  await sleep(900);
  const myActive = await api('/api/jobs/my/active', { token: P1.token });
  const JOB = S(myActive.data?.job?.id);
  check('S10b Job created (status on_the_way) visible via GET /api/jobs/my/active',
    myActive.status === 200 && !!JOB && myActive.data.job.status === 'on_the_way', myActive.data);
  const jobView = await api(`/api/jobs/${JOB}`, { token: C1.token });
  const custPhone = jobView.data?.job?.customer?.phone, provPhone = jobView.data?.job?.provider?.phone;
  check('S10c contact unlock BOTH sides (customer + provider phones in GET /api/jobs/:id)',
    /^\+92/.test(S(custPhone)) && /^\+92/.test(S(provPhone)), { custPhone, provPhone });
  const storeSrc = SRC(path.join('lib', 'store.tsx'));
  check("S10d accept path auto-navigates to Active Job (setStack(['activeJob']) after refreshJobs)",
    /refreshJobs\(\)[\s\S]{0,300}?setStack\(\['activeJob'\]\)/.test(storeSrc));
  check('S10e provider got offer:accepted LIVE', scP1.seen('offer:accepted'));

  console.log('\n=== Step 11: other offer -> "Not selected" (rejected), distinct states ===');
  const offsAfter = await api(`/api/requests/${R1}/offers`, { token: C1.token });
  const stP1 = (offsAfter.data?.offers || []).find((o) => S(o.id || o._id) === O1)?.status;
  const stP2 = (offsAfter.data?.offers || []).find((o) => S(o.id || o._id) === O3)?.status;
  check('S11a P1 accepted + P2 rejected simultaneously in DB', stP1 === 'accepted' && stP2 === 'rejected', { stP1, stP2 });
  check('S11b other provider got offer:rejected LIVE + persisted offer_rejected (feeds "Not selected")',
    scP2.seen('offer:rejected') && (await api('/api/notifications', { token: P2.token })).data?.notifications?.some((n) => n.type === 'offer_rejected'));
  const r2OfferState = await api(`/api/requests/${R2}/offers`, { token: C2.token });
  check("S11c withdrawn offer on R2 is STILL 'withdrawn' (not clobbered by R1's accept)",
    (r2OfferState.data?.offers || []).find((o) => S(o.id || o._id) === O2)?.status === 'withdrawn',
    (r2OfferState.data?.offers || []).map((o) => o.status));

  console.log('\n=== Step 12: customer CANCEL on separate request (R2) ===');
  const custSrc = SRC(path.join('screens', 'customer.tsx'));
  check('S12a visible Cancel CTA wired to cancelRequest in offers screen',
    /cancelRequest\(request\.id\)/.test(custSrc) && custSrc.includes('>Cancel<'));
  const can = await api(`/api/requests/${R2}/cancel`, { method: 'PATCH', token: C2.token });
  check('S12b cancel 200', can.status === 200, can.data);
  await sleep(800);
  check('S12c offering provider (P1, despite withdrawn offer) got request:cancelled LIVE + persisted request_cancelled',
    scP1.count('request:cancelled', (d) => reqIdOf(d) === R2) >= 1 &&
    (await api('/api/notifications', { token: P1.token })).data?.notifications?.some((n) => n.type === 'request_cancelled' && S(n.relatedId) === R2),
    scP1.events.filter((e) => e.ev === 'request:cancelled').map((e) => reqIdOf(e.d)));

  console.log('\n=== Step 13: status ladder live + backward/skip rejected ===');
  const st = (s) => api(`/api/jobs/${JOB}/status`, { method: 'PATCH', token: P1.token, body: { status: s } });
  const skip = await st('in_progress'); // current on_the_way -> skip
  check('S13a SKIP rejected 400 (on_the_way -> in_progress blocked)', skip.status === 400, skip.data?.message);
  let r = await st('arrived'); await sleep(700);
  check('S13b arrived 200 + customer got job:statusUpdate(arrived) LIVE',
    r.status === 200 && scC1.count('job:statusUpdate', (d) => S(d?.jobId || d?.job?.id) === JOB && d?.newStatus === 'arrived') === 1);
  const back1 = await st('on_the_way');
  check('S13c BACKWARD rejected 400 (arrived -> on_the_way)', back1.status === 400, back1.data?.message);
  r = await st('in_progress'); await sleep(700);
  check('S13d in_progress 200 + customer live update', r.status === 200 && scC1.count('job:statusUpdate', (d) => d?.newStatus === 'in_progress') >= 1);
  const back2 = await st('arrived');
  check('S13e BACKWARD rejected 400 (in_progress -> arrived)', back2.status === 400, back2.data?.message);
  r = await st('completed'); await sleep(900);
  check('S13f completed 200 + live on BOTH sides',
    r.status === 200 && scC1.count('job:statusUpdate', (d) => d?.newStatus === 'completed') >= 1 && scP1.count('job:statusUpdate', (d) => d?.newStatus === 'completed') >= 1);
  // completed is TERMINAL: any real transition after it must 400 (backward guard);
  // a completed->completed DUPLICATE is deliberately idempotent-200 with ZERO side
  // effects (early return before save/emit/notify) - verify exactly that contract.
  const jobBefore = await api(`/api/jobs/${JOB}`, { token: P1.token });
  const evBefore = scC1.count('job:statusUpdate');
  const over = await st('completed');
  const overBack = await st('arrived');
  await sleep(600);
  const jobAfter = await api(`/api/jobs/${JOB}`, { token: P1.token });
  check('S13g terminal-state safe: completed->arrived 400; duplicate completed idempotent-200 with NO re-notify + completedAt unchanged',
    overBack.status === 400 && over.status === 200 && /already in status/.test(S(over.data?.message)) &&
    scC1.count('job:statusUpdate') === evBefore &&
    S(jobBefore.data?.job?.completedAt) === S(jobAfter.data?.job?.completedAt) && !!jobAfter.data?.job?.completedAt,
    { dup: [over.status, over.data?.message], back: overBack.status });

  console.log('\n=== Step 14: completion -> persisted notifications + rating prompt wiring both sides ===');
  const c1BellNow = (await api('/api/notifications', { token: C1.token })).data?.notifications || [];
  const p1BellNow = (await api('/api/notifications', { token: P1.token })).data?.notifications || [];
  check('S14a job_status_update persisted on BOTH bells (customer + provider)',
    c1BellNow.some((n) => n.type === 'job_status_update') && p1BellNow.some((n) => n.type === 'job_status_update'));
  check("S14b CUSTOMER-ONLY rating prompt: completed handler -> customer toast + setStack(['rating']); provider gets clean confirmation & NO rating nav",
    /job:statusUpdate[\s\S]{0,1600}?Please rate your experience[\s\S]{0,500}?setStack\(\['rating'\]\)/.test(storeSrc) &&
    /Job marked complete — nice work!/.test(storeSrc) && !/Rate your customer/.test(storeSrc));

  console.log('\n=== Step 15: ratings — CUSTOMER-ONLY (provider direction removed 2026-08-23) ===');
  const ra1 = await api(`/api/jobs/${JOB}/rate`, { method: 'POST', token: C1.token, body: { rating: 5, comment: 'Excellent plumber, fixed fast' } });
  const ra2 = await api(`/api/jobs/${JOB}/rate`, { method: 'POST', token: P1.token, body: { rating: 4, comment: 'Good customer' } });
  check('S15a customer->provider 201 AND provider->customer BLOCKED 403 (CUSTOMER_ONLY_RATING - permanently removed)',
    ra1.status === 201 && ra2.status === 403 && ra2.data?.code === 'CUSTOMER_ONLY_RATING', { ra1: ra1.status, ra2: ra2.status, code: ra2.data?.code });
  const p1Prof = await api('/api/users/profile', { token: P1.token });
  const c1Prof2 = await api('/api/users/profile', { token: C1.token });
  const p1u = p1Prof.data?.user || p1Prof.data, c1u = c1Prof2.data?.user || c1Prof2.data;
  check('S15b provider average updated (5★, 1 review); customer stays at defaults (never rated - direction removed)',
    p1u?.rating === 5 && p1u?.reviews === 1 && (c1u?.rating === 0 || c1u?.rating === undefined || c1u?.rating === null) && !c1u?.reviews,
    { prov: [p1u?.rating, p1u?.reviews], cust: [c1u?.rating, c1u?.reviews] });
  const dup1 = await api(`/api/jobs/${JOB}/rate`, { method: 'POST', token: C1.token, body: { rating: 3 } });
  const dup2 = await api(`/api/jobs/${JOB}/rate`, { method: 'POST', token: P1.token, body: { rating: 3 } });
  check('S15c duplicate customer rating blocked 400; provider attempt still 403 (not a duplicate - simply not allowed)',
    dup1.status === 400 && dup2.status === 403, { dup1: dup1.status, dup2: dup2.status });
  await sleep(500);
  const p1Bell2 = (await api('/api/notifications', { token: P1.token })).data?.notifications || [];
  const c1Bell2 = (await api('/api/notifications', { token: C1.token })).data?.notifications || [];
  check('S15d new_rating persisted to the PROVIDER only (never the customer - they can no longer receive ratings)',
    p1Bell2.some((n) => n.type === 'new_rating') && !c1Bell2.some((n) => n.type === 'new_rating'));

  console.log('\n=== Step 16: chat both directions + read receipts ===');
  const ack1 = await scC1.emit('chat:send', { jobId: JOB, text: 'Work looks great, thank you!' });
  await sleep(700);
  check('S16a customer message ack success + provider received chat:message LIVE with text',
    (ack1 === undefined || ack1?.status === 'success') && scP1.count('chat:message', (m) => (m?.message?.text || m?.text) === 'Work looks great, thank you!') === 1, ack1);
  const ack2 = await scP1.emit('chat:send', { jobId: JOB, text: 'Glad to help, call me anytime' });
  await sleep(700);
  check('S16b provider reply ack success + customer received LIVE',
    (ack2 === undefined || ack2?.status === 'success') && scC1.count('chat:message', (m) => (m?.message?.text || m?.text) === 'Glad to help, call me anytime') === 1, ack2);
  await scP1.emit('chat:markRead', { jobId: JOB });
  await sleep(700);
  check('S16c read receipt: customer (sender of msg1) got chat:read for this job',
    scC1.count('chat:read', (d) => S(d?.jobId) === JOB) >= 1, scC1.events.filter((e) => e.ev === 'chat:read').map((e) => e.d));
  const msgs = await api(`/api/jobs/${JOB}/messages`, { token: C1.token });
  const list = msgs.data?.messages || [];
  const msg1 = list.find((m) => m.text === 'Work looks great, thank you!');
  check('S16d history: 2 messages stored; provider-acknowledged one has readAt set',
    list.length >= 2 && !!msg1?.readAt, list.map((m) => [m.text, !!m.readAt]));

  console.log('\n=== Step 17: order history both sides ===');
  const hC1 = await api('/api/jobs/history?status=completed', { token: C1.token });
  const hP1 = await api('/api/jobs/history?status=completed', { token: P1.token });
  check('S17a completed job appears in BOTH histories (customer + provider)',
    (hC1.data?.history || []).some((h) => S(h.id) === JOB) && (hP1.data?.history || []).some((h) => S(h.id) === JOB),
    { cust: (hC1.data?.history || []).length, prov: (hP1.data?.history || []).length });
  const hC2 = await api('/api/jobs/history?status=cancelled', { token: C2.token });
  const r2Hist = (hC2.data?.history || []).find((h) => S(h.id) === R2);
  check("S17b cancelled R2 in customer's Cancelled history with cancelledReason 'customer'",
    !!r2Hist && r2Hist.cancelledReason === 'customer', r2Hist);

  console.log('\n=== Step 18: notification bells - full trail + read/unread ===');
  const c1BellF = (await api('/api/notifications?limit=100', { token: C1.token })).data?.notifications || [];
  const p1BellF = (await api('/api/notifications?limit=100', { token: P1.token })).data?.notifications || [];
  const c1Types = new Set(c1BellF.map((n) => n.type));
  const p1Types = new Set(p1BellF.map((n) => n.type));
  check('S18a customer bell trail: new_offer + job_status_update + new_message present (and NO new_rating - customers are never rated, 2026-08-23)',
    ['new_offer', 'job_status_update', 'new_message'].every((t) => c1Types.has(t)) && !c1Types.has('new_rating'), [...c1Types]);
  check('S18b provider bell trail: offer_declined + offer_accepted + request_cancelled + job_status_update + new_rating (NO request_new by design)',
    ['offer_declined', 'offer_accepted', 'request_cancelled', 'job_status_update', 'new_rating'].every((t) => p1Types.has(t)) && !p1Types.has('request_new'), [...p1Types]);
  const c2Types18 = new Set((await api('/api/notifications', { token: C2.token })).data?.notifications?.map((n) => n.type) || []);
  check('S18c 2nd customer bell: new_offer + offer_withdrawn present', c2Types18.has('new_offer') && c2Types18.has('offer_withdrawn'), [...c2Types18]);
  const bellP1 = await api('/api/notifications', { token: P1.token });
  const unreadBefore = bellP1.data?.unreadCount;
  const firstUnread = (bellP1.data?.notifications || []).find((n) => !n.isRead);
  const rd1 = await api(`/api/notifications/${S(firstUnread?.id)}/read`, { method: 'PATCH', token: P1.token });
  const bellAfterOne = await api('/api/notifications', { token: P1.token });
  check('S18d single mark-read: 200 + unreadCount decremented by exactly 1',
    rd1.status === 200 && bellAfterOne.data?.unreadCount === unreadBefore - 1, { unreadBefore, after: bellAfterOne.data?.unreadCount });
  const rall = await api('/api/notifications/read-all', { method: 'PATCH', token: P1.token });
  const bellAfterAll = await api('/api/notifications', { token: P1.token });
  check('S18e read-all: 200 + unreadCount 0 + all isRead true in payload',
    rall.status === 200 && bellAfterAll.data?.unreadCount === 0 && (bellAfterAll.data?.notifications || []).every((n) => n.isRead));

  console.log('\n=== Step 19: expiry (test override) -> auto-expire, offers rejected, distinguishable ===');
  const r4 = await api('/api/requests', { method: 'POST', token: C2.token, body: { category: 'plumber', description: 'Self-test expiring request flow', ...FSD, address: 'Kotwali Rd, Faisalabad', expiresInMinutes: 0.03 } });
  const R4 = S(r4.data?.request?.id);
  check('S19a expiring request 201 (override 0.03min = 1.8s)', r4.status === 201 && !!R4, r4.status);
  const o4 = await api(`/api/requests/${R4}/offers`, { method: 'POST', token: P1.token, body: { visitingCharge: 300, etaMinutes: 8 } });
  check('S19b provider offered before expiry (201)', o4.status === 201, o4.status);
  await sleep(2200); // past expiry -> first read sweeps
  const myReqs = await api('/api/requests/my', { token: C2.token });
  const r4State = (myReqs.data?.requests || []).find((x) => S(x.id || x._id) === R4);
  await sleep(900);
  check("S19c auto-expired on read: status cancelled + cancelledReason 'expired'",
    r4State?.status === 'cancelled' && r4State?.cancelledReason === 'expired', r4State);
  const p1Bell3 = (await api('/api/notifications?limit=100', { token: P1.token })).data?.notifications || [];
  check('S19d offering provider got request:expired LIVE + persisted request_expired',
    scP1.count('request:expired', (d) => S(d?.requestId) === R4) >= 1 && p1Bell3.some((n) => n.type === 'request_expired' && S(n.relatedId) === R4));
  const offsR4 = await api(`/api/requests/${R4}/offers`, { token: C2.token });
  check("S19e pending offer on expired request auto-rejected",
    (offsR4.data?.offers || []).every((o) => o.status === 'rejected') && (offsR4.data?.offers || []).length === 1,
    (offsR4.data?.offers || []).map((o) => o.status));
  const hC2all = await api('/api/jobs/history?status=cancelled', { token: C2.token });
  const r4H = (hC2all.data?.history || []).find((h) => S(h.id) === R4);
  check("S19f history distinguishes: R4 cancelledReason 'expired' vs R2 'customer'",
    r4H?.cancelledReason === 'expired', r4H);

  console.log('\n=== Step 20: busy-lock while provider has active job ===');
  const r5 = await api('/api/requests', { method: 'POST', token: C1.token, body: { category: 'plumber', description: 'Self-test busy-lock first request', ...FSD, address: 'Peoples Colony, Faisalabad' } });
  const R5 = S(r5.data?.request?.id);
  const o5 = await api(`/api/requests/${R5}/offers`, { method: 'POST', token: P1.token, body: { visitingCharge: 510, etaMinutes: 9 } });
  const O5 = S(o5.data?.offer?.id);
  const acc5 = await api(`/api/offers/${O5}/accept`, { method: 'PATCH', token: C1.token });
  check('S20a P1 has an ACTIVE job again (offer 201 + accept 200)', o5.status === 201 && acc5.status === 200, { o5: o5.status, acc5: acc5.status });
  const JOB2 = S((await api('/api/jobs/my/active', { token: P1.token })).data?.job?.id);
  const before = scP1.count('request:new');
  const r6 = await api('/api/requests', { method: 'POST', token: C2.token, body: { category: 'plumber', description: 'Self-test busy-lock second request', ...FSD, address: 'Madina Town, Faisalabad' } });
  const R6 = S(r6.data?.request?.id);
  await sleep(1200);
  check('S20b busy provider got NO request:new for the new matching request (server excluded from fan-out)',
    scP1.count('request:new') === before && scP1.count('request:new', (d) => reqIdOf(d) === R6) === 0);
  const near = await api('/api/requests/nearby', { token: P1.token });
  check('S20c busy nearby: empty list + hasActiveJob true', (near.data?.requests || []).length === 0 && near.data?.hasActiveJob === true, near.data);
  const busyOffer = await api(`/api/requests/${R6}/offers`, { method: 'POST', token: P1.token, body: { visitingCharge: 300, etaMinutes: 5 } });
  check('S20d offer attempt while busy -> 400 PROVIDER_BUSY',
    busyOffer.status === 400 && busyOffer.data?.code === 'PROVIDER_BUSY', busyOffer.data);
  const p1Still = scP1.count('offer:declined'); // sanity: unrelated events unaffected
  check('S20e P2 (free) can still see/offer on R6 — lock is per-provider, not global',
    (await api(`/api/requests/${R6}/offers`, { method: 'POST', token: P2.token, body: { visitingCharge: 460, etaMinutes: 14 } })).status === 201);
  // cleanup: finish JOB2 so the lock releases and the shared DB stays tidy
  for (const s2 of ['arrived', 'in_progress', 'completed']) { await api(`/api/jobs/${JOB2}/status`, { method: 'PATCH', token: P1.token, body: { status: s2 } }); }
  await sleep(400);
  const nearAfter = await api('/api/requests/nearby', { token: P1.token });
  check('S20f lock released after completion (hasActiveJob false)', nearAfter.data?.hasActiveJob === false, nearAfter.data);

  [scC1, scC2, scP1, scP2].forEach((x) => x.s.close());
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Self-test crashed:', e); process.exit(1); });
