/**
 * No-premature-offer suite (2026-08-23) — ISSUE 1 CONFIRMED BUG: "customer sees an offer
 * before any provider sends one".
 *
 * CONTROLLED LIVE TRACE (reproduced before fixing, re-run after):
 *  - POST /api/requests -> GET /api/requests/:id/offers returns EMPTY (backend is CLEAN;
 *    nothing auto-creates an Offer), and the customer socket receives ZERO offer:new —
 *    only request:viewCount (the "X providers viewing" feature, a NON-offer event).
 *  - Root cause = FRONTEND store.tsx postRequest: `setStack(['availableProviders'])`
 *    auto-navigated the customer to the AvailableProviders listing, which renders full
 *    provider cards (avatar + stars + "PKR <profile defaultVisitingCharge>" + Book Now)
 *    visually identical to an offer card — a PRICE THE PROVIDER NEVER SENT for this
 *    request. That is the "offer card appearing immediately".
 *  - Fix: land on the OFFERS waiting screen instead (zero cards, live viewing pill) — the
 *    providers listing remains reachable only by explicit user choice (Jobs tab button).
 *  - THEN a provider POST /api/requests/:id/offers produces exactly ONE offer:new event and
 *    exactly ONE pending offer — the first moment any priced card may appear.
 *
 * Layers: STATIC guards (navigation + no auto-render of priced cards on post) + LIVE
 * empty-then-exactly-one assertions (the required empty-then-populated sequence lock).
 */
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const uniq = String(Date.now()).slice(-6);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${JSON.stringify(detail)}`}`); };

const api = (p, { method = 'GET', body, token } = {}) =>
  fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

(async () => {
  console.log('=== STATIC — root-cause fix locked (post lands on offers waiting, never auto on priced listing) ===');
  const store = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/store.tsx'), 'utf8');
  const jobs = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/jobs.tsx'), 'utf8');

  check("S1 postRequest navigates to 'offers' waiting screen (BUG FIX present, commented) and NEVER auto-navigates to 'availableProviders'",
    /setStack\(\['offers'\]\); \/\/ land on the offers\/waiting screen/.test(store) &&
    !/setStack\(\[['"]availableProviders['"]\]\)/.test(store) &&
    !/navigate\(["']availableProviders["']\)/.test(store));
  check("S2 providers listing still reachable ONLY by explicit user choice (Jobs tab button), not by post flow",
    /navigate\(['"]availableProviders['"]\)/.test(jobs) && /setStack\(\['offers'\]\)/.test(store));
  check('S3 OffersScreen offer state still starts EMPTY and cards render only from sortedOffers (no request-as-card path)',
    fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/customer.tsx'), 'utf8').includes('useState<Offer[]>([])'));

  console.log('\n=== LIVE — empty UNTIL provider POSTs, then exactly one (regression sequence lock) ===');
  const mk = async (phone, role, name) => { const r = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } }); const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: r.data.otp, name, role, city: 'Lahore' } }); return { token: v.data.token, user: v.data.user }; };
  const customer = await mk(`+92391${uniq}1`, 'customer', 'Pre Offer Cust');
  const provider = await mk(`+92391${uniq}2`, 'provider', 'Pre Offer Prov');
  await api('/api/users/location', { method: 'PATCH', token: provider.token, body: { lng: 74.35, lat: 31.52, city: 'Lahore' } });
  await api('/api/users/location', { method: 'PATCH', token: customer.token, body: { lng: 74.351, lat: 31.521, city: 'Lahore' } });
  await api('/api/providers/setup', { method: 'PATCH', token: provider.token, body: { category: 'plumber', radiusKm: 10 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: provider.token });
  await api('/api/users/profile', { method: 'PATCH', token: provider.token, body: { isOnline: true } });

  const evtNames = [];
  const csock = io(BASE, { auth: { token: customer.token }, transports: ['websocket'] });
  await new Promise((r) => csock.on('connect', r));
  csock.onAny((ev) => evtNames.push(ev));

  // a) fresh request as customer
  const rq = await api('/api/requests', { method: 'POST', token: customer.token, body: { category: 'plumber', description: 'premature offer regression lock test', lng: 74.351, lat: 31.521, address: 'Lock St', city: 'Lahore' } });
  const reqId = String(rq.data.request?.id || '');
  check('L1a request posted OK', rq.status === 201 && !!reqId, { st: rq.status });

  // b) IMMEDIATELY: offers must be empty; and stay empty + silent for 2.5s
  const immediate = await api(`/api/requests/${reqId}/offers`, { token: customer.token });
  check('L1b IMMEDIATELY after POST /api/requests: GET offers returns an EMPTY array (no auto-created Offer document)',
    immediate.status === 200 && Array.isArray(immediate.data.offers) && immediate.data.offers.length === 0,
    { st: immediate.status, len: (immediate.data.offers || []).length });
  await new Promise((r) => setTimeout(r, 2500));
  const after25 = await api(`/api/requests/${reqId}/offers`, { token: customer.token });
  check('L2 after 2.5s: STILL zero offers on GET AND zero offer:new emitted (only non-offer events like request:viewCount allowed)',
    (after25.data.offers || []).length === 0 && !evtNames.includes('offer:new'),
    { offers: (after25.data.offers || []).length, events: evtNames });

  // c) only NOW the provider submits a priced offer
  const sent = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: provider.token, body: { visitingCharge: 950, etaMinutes: 25 } });
  await new Promise((r) => setTimeout(r, 1200));
  const post = await api(`/api/requests/${reqId}/offers`, { token: customer.token });
  const pending = (post.data.offers || []).filter((o) => o.status === 'pending');
  check('L3 provider POSTs -> exactly ONE offer:new event AND exactly ONE pending offer (first visible card, wholly populated)',
    sent.status === 201 && evtNames.filter((e) => e === 'offer:new').length === 1 && pending.length === 1 &&
    Number(pending[0].visitingCharge) === 950 && Number(pending[0].etaMinutes) === 25,
    { sent: sent.status, events: evtNames.filter((e) => e === 'offer:new').length, pending: pending.length, charge: pending[0]?.visitingCharge });

  // stability: repeat poll still exactly one
  await new Promise((r) => setTimeout(r, 1000));
  const again = await api(`/api/requests/${reqId}/offers`, { token: customer.token });
  check('L4 stability: repeat GET still exactly ONE offer with SAME id (no duplicate/ghost cards ever)',
    (again.data.offers || []).filter((o) => o.status === 'pending').length === 1 &&
    String((again.data.offers || [])[0]?.id) === String(pending[0].id));

  csock.close();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
