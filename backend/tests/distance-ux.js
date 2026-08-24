/**
 * Distance UX suite (2026-08-23) — consistent prominent distance + ETA, sorting, Closest badge.
 *
 * TASK 1: ONE shared pattern (<DistanceDisplay km live?/> in ui.tsx) on all 3 surfaces:
 *   - Provider incoming request card   -> LIVE (existing GPS watch + Haversine, unchanged calc)
 *   - Customer offer card              -> SNAPSHOT at offer-creation (computed backend-side via
 *                                         the shared Haversine, stored on the Offer doc, served
 *                                         via GET offers + offer:new payload; provider's precise
 *                                         coords never reach the customer pre-acceptance)
 *   - ActiveJob screen                 -> LIVE (existing both-live-locations tracking)
 *   ETA everywhere = estimateTravelMinutes(km) with the documented 18 km/h urban assumption.
 *
 * TASK 2: customer Offers sort = Newest(default)/Nearest/Cheapest (client-side; provider list
 *   defaults nearest-first, no toggle per task scope). TASK 3: "⚡ Closest" badge when >1 offer.
 *
 * Layers: STATIC guards, UNIT ETA math on the real compiled location.ts, LIVE snapshot proof.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const uniq = String(Date.now()).slice(-6);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${JSON.stringify(detail)}`}`); };

const api = (p, { method = 'GET', body, token } = {}) =>
  fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

const LOC_ESM = path.join(__dirname, '.loc-test-build.mjs');
const locSrcPath = path.join(__dirname, '../../frontend/src/lib/location.ts');

(async () => {
  console.log('=== STATIC — one shared pattern everywhere + sort/badge + backend snapshot ===');
  const ui = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/ui.tsx'), 'utf8');
  const loc = fs.readFileSync(locSrcPath, 'utf8');
  const prov = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/provider.tsx'), 'utf8');
  const cust = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/customer.tsx'), 'utf8');
  const jobs = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/jobs.tsx'), 'utf8');
  const offerModel = fs.readFileSync(path.join(__dirname, '../src/models/Offer.js'), 'utf8');
  const offerCtl = fs.readFileSync(path.join(__dirname, '../src/controllers/offerController.js'), 'utf8');

  check('S1 shared DistanceDisplay: pin + "X.X km" + "~N min away" + optional live qualifier; estimateTravelMinutes documents the 18 km/h urban assumption',
    /export function DistanceDisplay/.test(ui) && /toFixed\(1\)\} km</.test(ui) && /~\{mins\} min away/.test(ui) &&
    /export function estimateTravelMinutes/.test(loc) && /18 km\/h/.test(loc) && /Math\.ceil/.test(loc));
  check('S2 all 3 surfaces use the shared pattern: provider request card + active job = LIVE, customer offer card = snapshot (no live prop)',
    /<DistanceDisplay km=\{liveDistance\} live/.test(prov) && /<DistanceDisplay km=\{liveDistance\} live/.test(jobs) &&
    /<DistanceDisplay km=\{offer\.distanceKm\} size=\{12\} \/>/.test(cust) && !/<DistanceDisplay km=\{offer\.distanceKm\}[^>]*live/.test(cust));
  check('S3 customer Offers sort: 3-way newest(default)/distance/price with "Nearest first" label; NEWEST is the default like before',
    /useState<"newest" \| "price" \| "distance">\("newest"\)/.test(cust) && /Nearest first/.test(cust) &&
    /Cheapest first/.test(cust) && /b\.timestamp - a\.timestamp/.test(cust));
  check('S4 "⚡ Closest" badge: only >1 offers, unique min-distance winner, recompute-safe (derived reduce, not stored state)',
    /⚡ Closest/.test(cust) && /closestOfferId = sortedOffers\.length > 1/.test(cust) &&
    (/reduce\(\(min, o\) => \(\(o\.distanceKm \?\? 9999\) < \(min\.distanceKm \?\? 9999\)/.test(cust) // null-safe form (2026-08-23)
      || /reduce\(\(min, o\) => \(o\.distanceKm < min\.distanceKm/.test(cust)));
  check('S5 provider incoming list: default NEAREST-FIRST ordering via shared requestCoords + live Haversine (no toggle, client-side only)',
    /sortedRequests = useMemo/.test(prov) && /requestCoords/.test(prov) && /dist\(a\) - dist\(b\)/.test(prov) &&
    /\{sortedRequests\.map/.test(prov));
  check('S6 backend snapshot: Offer schema optional distanceKm + controller computes it via shared utils/geo calculateDistanceKm at create (+revive)',
    /distanceKm:\s*\{\s*type: Number,\s*min: 0\s*\}/.test(offerModel.replace(/\s+/g, ' ').replace(/distanceKm: \{ type: Number, min: 0 \}/, 'distanceKm: {type: Number, min: 0}')) &&
    /calculateDistanceKm/.test(offerCtl) && /existingOffer\.distanceKm = offerDistanceKm/.test(offerCtl));

  console.log('\n=== UNIT — real compiled estimateTravelMinutes (18 km/h assumption) ===');
  cp.execSync(`${path.join(__dirname, '../../frontend/node_modules/.bin/esbuild')} ${locSrcPath} --format=esm --outfile=${LOC_ESM}`, { stdio: 'pipe' });
  const locationLib = await import(`file://${LOC_ESM}`);
  const m = locationLib.estimateTravelMinutes;
  check('U1 ETA math: km*60/18 (3.33min per km), ceil, floor 2 min, cap 999 — 7.06km->24, 1.5km->5, 0.3km->2, 0km->1, 500km->999',
    m(7.06) === 24 && m(1.5) === 5 && m(0.3) === 2 && m(0) === 1 && m(500) === 999,
    { a: m(7.06), b: m(1.5), c: m(0.3), d: m(0), e: m(500) });

  console.log('\n=== LIVE — offer-card distance is an accurate SNAPSHOT per offer-creation ===');
  const mk = async (phone, role, name) => { const r = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } }); const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: r.data.otp, name, role, city: 'Lahore' } }); return { token: v.data.token, user: v.data.user }; };
  const customer = await mk(`+92395${uniq}1`, 'customer', 'Dist Cust');
  const near = await mk(`+92395${uniq}2`, 'provider', 'Near Prov');
  const far = await mk(`+92395${uniq}3`, 'provider', 'Far Prov');
  // near provider ~1.4 km from request site; far provider ~7 km (both inside radius 10)
  await api('/api/users/location', { method: 'PATCH', token: near.token, body: { lng: 74.363, lat: 31.528, city: 'Lahore' } });
  await api('/api/users/location', { method: 'PATCH', token: far.token, body: { lng: 74.41, lat: 31.56, city: 'Lahore' } });
  await api('/api/users/location', { method: 'PATCH', token: customer.token, body: { lng: 74.351, lat: 31.521, city: 'Lahore' } });
  for (const p of [near, far]) {
    await api('/api/providers/setup', { method: 'PATCH', token: p.token, body: { category: 'plumber', radiusKm: 15 } });
    await api('/api/providers/dev/verify-me', { method: 'POST', token: p.token });
    await api('/api/users/profile', { method: 'PATCH', token: p.token, body: { isOnline: true } });
  }

  const events = [];
  const csock = io(BASE, { auth: { token: customer.token }, transports: ['websocket'] });
  await new Promise((r) => csock.on('connect', r));
  csock.on('offer:new', (d) => events.push(d));

  const rq = await api('/api/requests', { method: 'POST', token: customer.token, body: { category: 'plumber', description: 'distance snapshot live test description', lng: 74.351, lat: 31.521, address: 'D St', city: 'Lahore' } });
  const reqId = String(rq.data.request?.id || '');
  check('L1 request posted OK', rq.status === 201 && !!reqId, { st: rq.status });

  const s1 = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: near.token, body: { visitingCharge: 600, etaMinutes: 10 } });
  const s2 = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: far.token, body: { visitingCharge: 550, etaMinutes: 30 } });
  check('L2 both providers offered OK (independent offers)', s1.status === 201 && s2.status === 201, { s1: s1.status, s2: s2.status });

  await new Promise((r) => setTimeout(r, 1500));
  const list = await api(`/api/requests/${reqId}/offers`, { token: customer.token });
  const offers = list.data.offers || [];
  const byName = Object.fromEntries(offers.map((o) => [o.provider?.name, o]));
  const expected = (lat1, lng1, lat2, lng2) => {
    const R = 6371, r = (d) => d * Math.PI / 180;
    const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  };
  const expNear = expected(31.528, 74.363, 31.521, 74.351);
  const expFar = expected(31.56, 74.41, 31.521, 74.351);
  const nearKm = byName['Near Prov']?.distanceKm, farKm = byName['Far Prov']?.distanceKm;
  check('L3 GET offers: each offer carries its own ACCURATE snapshot distanceKm matching provider position at offer time (near ~' + expNear + ', far ~' + expFar + ', NOT the old fake 1.5)',
    offers.length === 2 && typeof nearKm === 'number' && typeof farKm === 'number' &&
    Math.abs(nearKm - expNear) <= 0.2 && Math.abs(farKm - expFar) <= 0.3 && nearKm !== 1.5 && farKm !== 1.5 && farKm > nearKm,
    { nearKm, farKm, expNear, expFar });
  check('L4 offer:new frontend payload also carries the same snapshot (socket path = poll path values; sort/badge safe either way)',
    events.length === 2 && events.every((e) => typeof (e.frontend?.distanceKm ?? e.offer?.distanceKm) === 'number') &&
    (() => { const vals = [nearKm, farKm].sort(); const evs = events.map((e) => e.frontend?.distanceKm ?? e.offer?.distanceKm).sort(); return Math.abs(vals[0] - evs[0]) < 0.01 && Math.abs(vals[1] - evs[1]) < 0.01; })(),
    { ev: events.map((e) => e.frontend?.distanceKm) });
  check('L5 snapshot persists unchanged on repeat poll (it is a creation-time fact, not drifting live data)',
    await (async () => { const again = await api(`/api/requests/${reqId}/offers`, { token: customer.token }); const a = Object.fromEntries((again.data.offers || []).map((o) => [o.provider?.name, o])); return a['Near Prov']?.distanceKm === nearKm && a['Far Prov']?.distanceKm === farKm; })());

  csock.close();
  fs.existsSync(LOC_ESM) && fs.unlinkSync(LOC_ESM);
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
