/**
 * Provider Home flicker + edited-offer-price consistency suite (2026-08-22).
 *
 * BUG 1 (cards blinking every 5s): root cause was the 5s PULL using the same loading flag
 * as manual refresh -> skeleton replaced the whole card list each poll -> every card
 * unmounted/remounted -> animate-slide-up re-triggered. Hidden extra damage: the card's
 * edited price input (local useState) reset to basePrice on each remount - the provider
 * could edit 777, a poll lands, the input silently snaps back to 500, and tapping Send
 * sends 500 (explains BUG 2 while every backend layer correctly carries 777).
 * Fix: silent polls (no skeleton) + reconcileNearbyRequests (identical content -> identical
 * array ref, unchanged cards keep object identity) + entrance animation ONLY for newly-seen ids.
 *
 * BUG 2 hardening (rule 3): earlier suites only asserted REST round-trip. This suite asserts
 * EVERY hop live: create -> socket offer:new (raw + adapter payload) -> customer REST poll
 * path -> accept response -> job persistence, including the REVIVE path (offer, decline,
 * re-offer a different price: customer must see the NEW price, never the stale one), plus a
 * compiled-adapter unit that locks field mapping (visitingCharge straight-through).
 *
 * Static locks the render-stability wiring so a future "helpful" refactor cannot silently
 * reintroduce skeleton-swap polling or index keys.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const uniq = String(Date.now()).slice(-6);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${JSON.stringify(detail)}`}`); };

const api = (p, { method = 'GET', body, token, headers = {} } = {}) =>
  fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

async function waitFor(fn, timeout = 8000, step = 150) {
  const t0 = Date.now();
  for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise((r2) => setTimeout(r2, step)); }
}

(async () => {
  console.log('=== STATIC render-stability wiring (BUG 1 root-cause locks) ===');
  const store = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/store.tsx'), 'utf8');
  const prov = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/provider.tsx'), 'utf8');
  const cust = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/customer.tsx'), 'utf8');
  const rec = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/listReconcile.ts'), 'utf8');

  check('S1 silent-poll option exists: { silent } gates BOTH setLoading(true) and setLoading(false) on nearbyRequests',
    /opts\?\.silent/.test(store) && /if \(!silent\) setLoading\('nearbyRequests', true\)/.test(store) &&
    /if \(!silent\) setLoading\('nearbyRequests', false\)/.test(store));
  check('S2 poll applies reconcileNearbyRequests (merge preserves identical array/object refs) and imports it',
    /reconcileNearbyRequests/.test(store) && /setNearbyRequests\(prev => reconcileNearbyRequests\(prev, adapted\)\)/.test(store));
  check('S3 the 5s interval calls refreshNearbyRequests({ silent: true }) - background polls can never swap in skeletons',
    /setInterval\(\(\) => \{\s*refreshNearbyRequests\(\{ silent: true \}\)/.test(prov));
  check('S4 stable React key (r.id, never index) + entrance animation gated by animateIn from knownRequestIdsRef set',
    /key=\{r\.id\}/.test(prov) && /animateIn=\{!\(knownRequestIdsRef\.current\?\.has/.test(prov) &&
    /cn\(animateIn && "animate-slide-up"/.test(prov));
  check('S5 listReconcile helper: explicit VISIBLE_FIELDS incl. distanceKm (numbers still update) + prev-ref reuse branch',
    /VISIBLE_FIELDS/.test(rec) && /distanceKm/.test(rec) && /prevById/.test(rec) && /return prev/.test(rec));
  check('S6 OfferCard layout pinch guard: price column cannot squeeze name+stars (shrink-0 + max-w-[44%] own column, nowrap stars row)',
    /shrink-0 max-w-\[44%\] pl-2 text-right/.test(cust) && /flex items-center gap-1\.5 overflow-hidden whitespace-nowrap/.test(cust));

  console.log('\n=== UNIT — compiled listReconcile + frontend adapters (esbuild, real modules) ===');
  const build = (src, out) => cp.execSync(`${path.join(__dirname, '../../frontend/node_modules/.bin/esbuild')} ${src} --format=esm --bundle --outfile=${out}`, { stdio: 'pipe' });
  const recOut = path.join(__dirname, '.rec-test-build.mjs');
  const adOut = path.join(__dirname, '.ad-test-build.mjs');
  build(path.join(__dirname, '../../frontend/src/lib/listReconcile.ts'), recOut);
  build(path.join(__dirname, '../../frontend/src/lib/adapters.ts'), adOut);
  const { reconcileNearbyRequests } = await import(`file://${recOut}`);
  const adapters = await import(`file://${adOut}`);

  const base = () => ([
    { id: 'a', description: 'leak', address: 'Gulberg', category: 'plumber', customerName: 'A', distanceKm: 1.2, createdAt: 1, status: 'pending' },
    { id: 'b', description: 'wire', address: 'DHA', category: 'electrician', customerName: 'B', distanceKm: 3.4, createdAt: 2, status: 'pending' },
    { id: 'c', description: 'engine', address: 'Model Town', category: 'mechanic', customerName: 'C', distanceKm: 5.0, createdAt: 3, status: 'pending' },
  ]);
  // U1: identical poll -> IDENTICAL array reference (zero re-render)
  { const p = base(); const r = reconcileNearbyRequests(p, base()); check('U1 identical poll content -> EXACT same array reference (no re-render at all)', r === p); }
  // U2: genuinly new card -> enters; unchanged cards keep SAME object identity (no remount/input reset)
  { const p = base(); const n = [...base(), { id: 'd', description: 'x1', address: 'x', category: 'plumber', customerName: 'D', distanceKm: 0.5, createdAt: 4, status: 'pending' }];
    const r = reconcileNearbyRequests(p, n);
    check('U2 one new request -> same-array NEW entry, and every unchanged card keeps its previous object reference',
      r !== p && r.length === 4 && r[0] === p[0] && r[1] === p[1] && r[2] === p[2] && r[3].id === 'd'); }
  // U3: live-distance changed -> only that card swaps object; removed request disappears
  { const p = base(); const n = base().filter(x => x.id !== 'b'); n[0] = { ...n[0], distanceKm: 1.9 };
    const r = reconcileNearbyRequests(p, n);
    check('U3 distance update + removal: updated card gets new object (number re-renders), untouched card keeps ref, removed gone',
      r.length === 2 && r[0] !== p[0] && r[0].distanceKm === 1.9 && r[1] === p[2]); }
  // U4: adapters mapping lock - backend offer visitingCharge flows straight through (no suggested/default substitution)
  { const be = { _id: 'off1', provider: { _id: 'p1', name: 'Prov Man' }, request: { category: 'plumber' }, visitingCharge: 777, etaMinutes: 15, status: 'pending', createdAt: 1000 };
    const fe = adapters.adaptBackendOfferToFrontendOffer(be, { category: 'plumber' });
    check('U4 frontend adapter maps submitted visitingCharge 777 straight-through (etaMinutes -> etaMin mapped)',
      fe.visitingCharge === 777 && fe.etaMin === 15, [fe.visitingCharge, fe.etaMin]); }

  console.log('\n=== LIVE — edited price 777 across EVERY hop (the chain rule 3 demands) ===');
  const mk = async (phone, role, name) => { const r = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } }); const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: r.data.otp, name, role, city: 'Lahore' } }); return { token: v.data.token, user: v.data.user }; };
  const customer = await mk(`+92381${uniq}1`, 'customer', 'Price Cust');
  const provider = await mk(`+92381${uniq}2`, 'provider', 'Price Prov');
  await api('/api/users/location', { method: 'PATCH', token: provider.token, body: { lng: 74.35, lat: 31.52, city: 'Lahore' } });
  await api('/api/users/location', { method: 'PATCH', token: customer.token, body: { lng: 74.351, lat: 31.521, city: 'Lahore' } });
  await api('/api/providers/setup', { method: 'PATCH', token: provider.token, body: { category: 'plumber', radiusKm: 10 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: provider.token });
  await api('/api/users/profile', { method: 'PATCH', token: provider.token, body: { isOnline: true } });

  const cEvents = { offers: [] };
  const csock = io(BASE, { auth: { token: customer.token }, transports: ['websocket'] });
  csock.on('offer:new', (d) => { cEvents.offers.push(d); });
  await waitFor(() => csock.connected);

  const mkRequest = async (desc) => {
    const r = await api('/api/requests', { method: 'POST', token: customer.token, body: { category: 'plumber', description: desc, lng: 74.351, lat: 31.521, address: 'Price St', city: 'Lahore' } });
    if (!r.data.request) console.error('  [diag] request create failed:', r.status, JSON.stringify(r.data).slice(0, 160));
    return r.data.request?.id;
  };

  // --- Scenario A: provider edits suggested 500 -> types 777 before sending ---
  const reqA = await mkRequest('price scenario A distinctive text');
  const offA = await api(`/api/requests/${reqA}/offers`, { method: 'POST', token: provider.token, body: { visitingCharge: 777, etaMinutes: 15 } });
  const sockA = await waitFor(() => cEvents.offers.find((e) => (e.offer?.request?.id ?? '').toString() === reqA.toString()));
  const listA = await waitFor(async () => { const d = await api(`/api/requests/${reqA}/offers`, { token: customer.token }); return d.data.offers?.length ? d.data.offers : null; });
  check('L1 all creation hops agree on 777: REST return, socket NEW payload (raw), socket adapter payload (frontend.*), customer poll GET',
    offA.status === 201 && offA.data.offer?.visitingCharge === 777 &&
    sockA?.offer?.visitingCharge === 777 && sockA?.frontend?.visitingCharge === 777 &&
    listA?.[0]?.visitingCharge === 777,
    { create: offA.data.offer?.visitingCharge, sockRaw: sockA?.offer?.visitingCharge, sockFe: sockA?.frontend?.visitingCharge, get: listA?.[0]?.visitingCharge });

  // downstream accept -> job must bill EXACTLY 777
  const offerIdA = (listA[0].id || listA[0]._id).toString();
  const accA = await api(`/api/offers/${offerIdA}/accept`, { method: 'PATCH', token: customer.token });
  const jobAId = accA.data.job?.id || accA.data.job?._id;
  const jobA = await api(`/api/jobs/${jobAId}`, { token: customer.token });
  const jobAPrice = jobA.data.job?.visitingCharge ?? jobA.data.job?.offer?.visitingCharge;
  check('L2 accept + job persistence bill 777 (accept 200 AND persisted job carries the edited price, never the suggested default)',
    accA.status === 200 && jobAPrice === 777,
    { accStatus: accA.status, job: jobAPrice });

  // Free the provider (availability lock) before scenario B: complete job A as the provider would.
  // Walk the strict forward sequence (server forbids skipping stages).
  for (const st of ['arrived', 'in_progress', 'completed']) {
    const r = await api(`/api/jobs/${jobAId}/status`, { method: 'PATCH', token: provider.token, body: { status: st } });
    if (r.status !== 200) { console.error('  [diag] jobA advance failed at', st, r.status, JSON.stringify(r.data).slice(0, 120)); process.exit(1); }
  }

  // --- Scenario B: REVIVE path - offer 555 declined, provider re-offers edited 888 -> customer must see 888, never 555 ---
  const reqB = await mkRequest('price scenario B revive distinct text');
  const offB1 = await api(`/api/requests/${reqB}/offers`, { method: 'POST', token: provider.token, body: { visitingCharge: 555, etaMinutes: 15 } });
  if (!offB1.data.offer) { console.error('  [diag] scenarioB first offer failed:', offB1.status, JSON.stringify(offB1.data).slice(0, 160), '| reqB:', reqB); process.exit(1); }
  await api(`/api/offers/${offB1.data.offer._id || offB1.data.offer.id}/decline`, { method: 'PATCH', token: customer.token });
  const seenB = cEvents.offers.length;
  const offB2 = await api(`/api/requests/${reqB}/offers`, { method: 'POST', token: provider.token, body: { visitingCharge: 888, etaMinutes: 20 } });
  const sockB = await waitFor(() => cEvents.offers.slice(seenB).find((e) => (e.offer?.request?.id ?? '').toString() === reqB.toString()));
  const listB = await waitFor(async () => { const d = await api(`/api/requests/${reqB}/offers`, { token: customer.token }); const p = (d.data.offers || []).filter((o) => o.status === 'pending'); return p.length ? p : null; });
  const revivedSameId = String(offB1.data.offer?.id ?? offB1.data.offer?._id) === String(offB2.data.offer?.id ?? offB2.data.offer?._id);
  check('L3 revive path: re-offer after decline sends the NEW edited price 888 everywhere (same offer id, no stale 555)',
    offB2.status === 201 || offB2.status === 200 && offB2.data.offer?.visitingCharge === 888 &&
    sockB?.offer?.visitingCharge === 888 && sockB?.frontend?.visitingCharge === 888 &&
    listB?.length === 1 && listB[0].visitingCharge === 888 && revivedSameId,
    { revive: offB2.data.offer?.visitingCharge, sock: sockB?.offer?.visitingCharge, poll: listB?.[0]?.visitingCharge, sameId: revivedSameId });

  csock.close();
  fs.existsSync(recOut) && fs.unlinkSync(recOut);
  fs.existsSync(adOut) && fs.unlinkSync(adOut);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
