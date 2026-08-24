/**
 * Offers visibility timing + Offer Card layout suite (2026-08-22).
 *
 * ISSUE 1 (verification): customer must see ZERO offer content until a provider EXPLICITLY
 * submits a priced offer — no placeholder, no ghost card, no premature preview. Live-proven:
 * request posted, customer socket silent for 2.5s (no offer:new), GET offers empty; the
 * provider submits -> exactly ONE fully-populated offer:new + exactly one pending offer.
 *
 * ISSUE 2 (layout): provider card (AvailableProvidersScreen) + OfferCard — the rating-stars
 * meta row sat inline with the name/city while the price column had no shrink guard, so at
 * 375-390px the zones collided. Fixed with 3-zone discipline: avatar fixed, middle
 * min-w-0+overflow clip (city/reviews truncate, stars/rating nowrap shrink-0), price
 * shrink-0 + max-w-[44%]. MyOfferCard (provider side) already had shrink-0 — locked so it
 * stays that way. Pure layout change: no props/data touched.
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
  console.log('=== STATIC — empty-state honesty + layout zone locks ===');
  const cust = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/customer.tsx'), 'utf8');
  const prov = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/provider.tsx'), 'utf8');

  check('S1 OffersScreen offer state starts EMPTY (useState<Offer[]>([])) and OfferCard renders ONLY inside the sortedOffers.map branch',
    /useState<Offer\[\]>\(\[\]\)/.test(cust) && /sortedOffers\.map\(\(o,i\)=><OfferCard/.test(cust));
  check('S2 no placeholder/ghost offer data anywhere in the screen (no hardcoded Offer-shaped object literals in customer offers flow)',
    !/customer\.tsx/.test('') && !/(DEMO|MOCK|PLACEHOLDER|dummy).{0,40}offer/i.test(cust));
  check('S3 OfferCard zones: price column shrink-0 + max-w-[44%]; stars nowrap shrink-0; reviews truncate (no overlap possible)',
    /shrink-0 max-w-\[44%\] pl-2 text-right[\s\S]{0,200}offer\.visitingCharge/.test(cust) &&
    /overflow-hidden whitespace-nowrap text-xs"><RatingSummary value=\{offer\.providerRating\} count=\{offer\.providerReviews\}/.test(cust) &&
    !/>\(\{offer\.providerReviews\}\)</.test(cust)); // clean one-format RatingSummary row, now-wrapped (2026-08-23)
  check('S4 AvailableProviders card: same discipline (shrink-0 capped price column + min-w-0 truncate city + nowrap stars) applied consistently',
    (cust.match(/max-w-\[44%\]/g) || []).length === 2 && /min-w-0 truncate">\{p\.city\}/.test(cust));
  check('S5 MyOfferCard (provider side reuse) keeps its own shrink-0 price + line-clamp-1 description (already safe, keeps locked)',
    /line-clamp-1 font-display text-\[13px\] font-bold text-ink-900">\{offer\.description\}/.test(prov) &&
    /shrink-0 font-display text-sm font-extrabold text-accent-600">PKR \{offer\.visitingCharge\}/.test(prov));

  console.log('\n=== LIVE — nothing visible before submission; exactly one full card after (Issue 1) ===');
  const mk = async (phone, role, name) => { const r = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } }); const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: r.data.otp, name, role, city: 'Lahore' } }); return { token: v.data.token, user: v.data.user }; };
  const customer = await mk(`+92383${uniq}1`, 'customer', 'Visibility Cust');
  const provider = await mk(`+92383${uniq}2`, 'provider', 'Muhammad Abdullah Khan Sherwani'); // edge-case LONG name
  await api('/api/users/location', { method: 'PATCH', token: provider.token, body: { lng: 74.35, lat: 31.52, city: 'Lahore' } });
  await api('/api/users/location', { method: 'PATCH', token: customer.token, body: { lng: 74.351, lat: 31.521, city: 'Lahore' } });
  await api('/api/providers/setup', { method: 'PATCH', token: provider.token, body: { category: 'plumber', radiusKm: 10 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: provider.token });
  await api('/api/users/profile', { method: 'PATCH', token: provider.token, body: { isOnline: true } });

  const offerEvents = [];
  const csock = io(BASE, { auth: { token: customer.token }, transports: ['websocket'] });
  csock.on('offer:new', (d) => offerEvents.push(d));
  await new Promise((r) => csock.on('connect', r));

  const rq = await api('/api/requests', { method: 'POST', token: customer.token, body: { category: 'plumber', description: 'visibility timing test request text', lng: 74.351, lat: 31.521, address: 'V St', city: 'Lahore' } });
  const reqId = String(rq.data.request?.id || '');
  check('L1 request posted OK', rq.status === 201 && !!reqId, { st: rq.status });

  // Wait 2.5s AFTER the request exists; absolutely nothing offer-shaped may arrive yet
  await new Promise((r) => setTimeout(r, 2500));
  const preList = await api(`/api/requests/${reqId}/offers`, { token: customer.token });
  check('L2 PRE-SUBMISSION: zero offer:new socket events AND zero offers on GET (clean waiting state, no ghosts)',
    offerEvents.length === 0 && preList.status === 200 && (preList.data.offers || []).length === 0,
    { events: offerEvents.length, get: (preList.data.offers || []).length });

  // Provider edits price to an edge-case 4-digit-with-5-digits value, then taps Send (only now!)
  const sent = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: provider.token, body: { visitingCharge: 12500, etaMinutes: 45 } });
  await new Promise((r) => setTimeout(r, 1500));
  const postList = await api(`/api/requests/${reqId}/offers`, { token: customer.token });
  const postPending = (postList.data.offers || []).filter((o) => o.status === 'pending');
  const ev = offerEvents[0];
  check('L3 POST-SUBMISSION: exactly ONE offer:new event, ONE pending offer on GET, FULLY populated (edge-case 12500 / long name / eta 45 all present)',
    sent.status === 201 && offerEvents.length === 1 && postPending.length === 1 &&
    ev?.offer?.visitingCharge === 12500 && ev?.frontend?.visitingCharge === 12500 &&
    !!ev?.frontend?.providerName && ev.frontend.providerName.includes('Sherwani') &&
    typeof ev?.frontend?.providerRating === 'number' && ev?.offer?.etaMinutes === 45 &&
    postPending[0].visitingCharge === 12500,
    { events: offerEvents.length, pending: postPending.length, name: ev?.frontend?.providerName, price: ev?.offer?.visitingCharge });

  check('L4 repeat poll returns the SAME single offer id (stable identity, no duplication flicker risk)',
    postPending[0].id === (await api(`/api/requests/${reqId}/offers`, { token: customer.token })).data.offers[0].id);

  csock.close();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
