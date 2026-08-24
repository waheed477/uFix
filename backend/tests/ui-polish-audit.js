/**
 * UI polish + dead-end audit suite (2026-08-23) — Bugs 1-6 of the screenshot polish pass.
 *
 * BUG 1 (distance honesty): DistanceDisplay renders "Distance unavailable" for null/invalid /
 *   implausibly-large (>50km) values; no fake fallbacks anywhere (adapter 1.5/1.2 removed);
 *   provider card live distance = BOTH real coords or nothing; ONE distance+time source per
 *   offer card (ETA chip + duplicate km chip removed, single DistanceDisplay).
 * BUG 2 (jargon): no Socket.io / event-name / "old flow" text in user-visible copy.
 * BUG 3 (raw coords): provider Home shows a human label; raw coords DEV-gated only.
 * BUG 4 (rating): one clean format via RatingSummary everywhere; no fake 4.8 defaults.
 * BUG 5 (decline): labeled "Decline" + inline 2-step confirm; cancel link upgraded to a button.
 * BUG 6 (dead-end audit): navigate() targets all exist in Screen union + App.tsx cases; zero
 *   noop handlers / href="#"; live: cancel endpoint, providers-in-city endpoint, same-city
 *   distance sanity end-to-end.
 */
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const FE = path.join(__dirname, '../../frontend/src');
const BASE = 'http://localhost:5000';
const uniq = String(Date.now()).slice(-6);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 500)}`}`); };
const read = (f) => fs.readFileSync(path.join(FE, f), 'utf8');
const api = (p, { method = 'GET', body, token } = {}) =>
  fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

(async () => {
  console.log('=== STATIC — distance honesty (BUG 1) ===');
  const ui = read('components/ui.tsx');
  const adapters = read('lib/adapters.ts');
  const provider = read('screens/provider.tsx');
  const customer = read('screens/customer.tsx');
  const jobs = read('screens/jobs.tsx');
  const locationTs = read('lib/location.ts');

  check('S1 DistanceDisplay shows "Distance unavailable" for null/invalid AND caps implausible >50km values (never presents garbage as real)',
    /Distance unavailable/.test(ui) && /MAX_PLAUSIBLE_DISTANCE_KM/.test(ui) && /MAX_PLAUSIBLE_DISTANCE_KM = 50/.test(locationTs));
  check('S2 adapters carry NO fake distance fallbacks (no ?? 1.5 offer fake, no ?? 1.2 request fake)', !/\?\? 1\.5|\?\? 1\.2/.test(adapters));
  check('S3 provider request card: liveDistance uses BOTH live coords, else null (no req.distanceKm fallback left)',
    /const liveDistance = useMemo\(\(\) => \{\s*if \(!providerCoords\) return null;\s*const rc = requestCoords\(req\);\s*if \(!rc\) return null;/.test(provider) &&
    !/return req\.distanceKm/.test(provider));

  console.log('\n=== STATIC — single ETA source (BUG 1.3) ===');
  check('S4 offer card has the single DistanceDisplay and NO separate "ETA {etaMin}" chip or duplicate km chip',
    !/ETA \{offer\.etaMin\} min/.test(customer) && !customer.includes('offer.distanceKm.toFixed(1)} km · ~') &&
    /<DistanceDisplay km=\{offer\.distanceKm\} size=\{12\}/.test(customer));
  check('S5 jobs-screen offer summary uses the SAME distance-derived estimate (estimateTravelMinutes), not declared etaMin',
    /estimateTravelMinutes\(offer\.distanceKm\)/.test(jobs) && !/ETA \{offer\.etaMin\}/.test(jobs));

  const SCREEN_FILES = fs.readdirSync(path.join(FE, 'screens')).filter((f) => f.endsWith('.tsx'))
    .map((f) => 'screens/' + f).concat(['components/notifications.tsx']);
  console.log('\n=== STATIC — user-visible jargon (BUG 2) ===');
  const screenFiles = SCREEN_FILES;
  const jargonHits = [];
  // code-level event names (switch cases, n.type comparisons, handlers) are NOT user-visible -
  // only flag jargon inside JSX display text: a line containing >...text outside of {...} braces
  const jargonRe = [/Socket\.io/i, /old flow/i, /via Socket/i];
  const eventNames = ['chat:message', 'offer:new', 'job:statusUpdate', 'request:new', 'notification:new'];
  for (const f of screenFiles) {
    if (!fs.existsSync(path.join(FE, f))) continue;
    const src = read(f);
    for (const line of src.split('\n')) {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue; // code comments are not UI
      const jsxText = line.replace(/\/\/.*$/gm, '').replace(/\{[^}]*\}/g, ''); // strip inline comments + code braces
      for (const re of jargonRe) if (re.test(jsxText)) jargonHits.push(`${f}:${re.source.slice(0, 30)}`);
      for (const ev of eventNames) if (jsxText.includes('>' + ev) || jsxText.includes('· ' + ev + ' ') || jsxText.includes(ev + ' ') && /'/.test(line) === false && /[a-z]/.test(jsxText.split(ev)[1] || '')) jargonHits.push(`${f}:display:${ev}`);
      // also catch plain quoted UI copy containing an event name that ISN'T a comparison/case
      if (/("|')\s*(chat:message|offer:new|job:statusUpdate)\s*\1/.test(line) && !/case |===|!==|type|on\(|of\(|emit\(|filter/.test(line)) jargonHits.push(`${f}:${ev}`);
    }
  }
  check('S6 zero Socket.io/event-name/"old flow" strings in USER-VISIBLE copy (code-level event names are fine)', jargonHits.length === 0, jargonHits);

  console.log('\n=== STATIC — raw coords + rating format (BUGS 3-4) ===');
  check('S7 provider Home shows a human 📍 label for location; raw coords only under import.meta.env.DEV',
    /📍 \{\(user\?\.city \|\| location\.city \|\| "—"\)\}/.test(provider) && /import\.meta\.env\.DEV[\s\S]{0,200}?dev coords/.test(provider) &&
    !/Live GPS: \{effectiveCoords/.test(provider));
  const fakeRatings = [];
  for (const f of screenFiles) {
    if (!fs.existsSync(path.join(FE, f))) continue;
    if (/\|\| 4\.8/.test(read(f))) fakeRatings.push(f);
  }
  check('S8 zero fake `|| 4.8` rating defaults across screens', fakeRatings.length === 0, fakeRatings);
  check('S9 RatingSummary component exported and used at OfferCard + availableProviders + profile (one clean format: stars + "2.0 (1 review)")',
    /export function RatingSummary/.test(ui) && /toFixed\(1\).*review/.test(ui.replace(/\s+/g, ' ')) &&
    (customer.match(/RatingSummary/g) || []).length >= 2 && read('screens/profile.tsx').includes('RatingSummary'));

  console.log('\n=== STATIC — decline + cancel affordances (BUGS 5, 6.1) ===');
  check('S10 Decline is a LABELED button with inline two-step confirm ("Yes, decline"/"No, keep"), not a bare ✕',
    />Decline<\/button>/.test(customer) && /confirmingDecline/.test(customer) && /Yes, decline/.test(customer) && /No, keep/.test(customer));
  check('S11 cancel request is a clearly-tappable button (rose chip "Cancel request", not a bare text link)',
    />Cancel request<\/button>/.test(customer) && /border-rose-200/.test(customer));

  console.log('\n=== STATIC — dead-end audit (BUG 6.3) ===');
  // every navigate('x') in screens must exist in the Screen union type AND have an App.tsx case
  const store = read('lib/store.tsx');
  const app = read('App.tsx');
  const unionMatch = store.match(/\| "[a-zA-Z]+"/g) || [];
  const navTargets = new Set();
  for (const f of screenFiles) {
    if (!fs.existsSync(path.join(FE, f))) continue;
    const src = read(f);
    for (const m of src.matchAll(/navigate\(["']([a-zA-Z]+)["']\)|setTabState\(["']([a-zA-Z]+)["']\)/g)) navTargets.add(m[1] || m[2]);
  }
  const missingUnion = [...navTargets].filter((t) => !unionMatch.some((u) => u === `| "${t}"`));
  const missingCase = [...navTargets].filter((t) => !app.includes(`case "${t}"`) && !['home', 'post', 'jobs', 'providers', 'map', 'offers', 'chat', 'activeJob'].includes(t));
  check(`S12 every navigate()/tab target (${navTargets.size}) exists in Screen union`, missingUnion.length === 0, missingUnion);
  check('S13 every stack-screen navigate target renders somewhere in App.tsx', missingCase.length === 0, missingCase);
  const noopHotspots = [];
  for (const f of screenFiles) {
    if (!fs.existsSync(path.join(FE, f))) continue;
    const src = read(f);
    if (/onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(src)) noopHotspots.push(`${f}:noop onClick`);
    const hrefs = src.match(/href="#(\w*)"/g);
    if (hrefs) noopHotspots.push(`${f}:${hrefs[0]}`);
  }
  check('S14 zero noop onClick / href="#" dead handlers in screens', noopHotspots.length === 0, noopHotspots);

  console.log('\n=== LIVE — same-city distance sanity + single truth (BUG 1 live) ===');
  const mk = async (phone, role, name) => { const r = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } }); const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: r.data.otp, name, role, city: 'Faisalabad' } }); return { token: v.data.token, user: v.data.user }; };
  const cust = await mk(`+9260${uniq}1`, 'customer', 'Audit Cust');
  const prov = await mk(`+9260${uniq}2`, 'provider', 'Audit Prov');
  await api('/api/users/location', { method: 'PATCH', token: cust.token, body: { lng: 73.081, lat: 31.418, city: 'Faisalabad' } });
  await api('/api/users/location', { method: 'PATCH', token: prov.token, body: { lng: 73.095, lat: 31.431, city: 'Faisalabad' } });
  await api('/api/providers/setup', { method: 'PATCH', token: prov.token, body: { category: 'electrician', radiusKm: 12 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: prov.token });
  await api('/api/users/profile', { method: 'PATCH', token: prov.token, body: { isOnline: true } });
  const rq = await api('/api/requests', { method: 'POST', token: cust.token, body: { category: 'electrician', description: 'audit polish live request text here', lng: 73.081, lat: 31.418, address: 'Audit Town', city: 'Faisalabad' } });
  const reqId = String(rq.data.request?.id);
  const near = await api(`/api/requests/nearby?lat=31.431&lng=73.095&radiusKm=12&category=electrician`, { token: prov.token });
  const nearReqs = near.data?.requests || near.data || [];
  const mine = ((nearReqs)).find((r) => String(r.id || r._id) === reqId);
  const cardKm = mine?.distanceKm;
  const haversine = (la1, lo1, la2, lo2) => { const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180; const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const real = haversine(31.431, 73.095, 31.418, 73.081);
  check('L1 provider nearby-request card distance is a REALISTIC same-city value (<8km, matches Haversine ±0.4, NOT a fallback like 934/999)',
    typeof cardKm === 'number' && cardKm < 8 && Math.abs(cardKm - real) < 0.4, { cardKm, real: +real.toFixed(2) });

  const of = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: prov.token, body: { visitingCharge: 700, etaMinutes: 20 } });
  const offerId = String(of.data.offer?.id);
  const offersList = await api(`/api/requests/${reqId}/offers`, { token: cust.token });
  const snapKm = (offersList.data.offers || []).find((o) => String(o.id) === offerId)?.distanceKm;
  check('L2 offer-card snapshot distance ~= card distance one source (~same value, no contradiction on one card)',
    typeof snapKm === 'number' && Math.abs(snapKm - cardKm) < 0.3 && snapKm > 0, { snapKm, cardKm });

  console.log('\n=== LIVE — cancel + providers-in-city endpoints (BUG 6.1/6.2) ===');
  const psock = io(BASE, { auth: { token: prov.token }, transports: ['websocket'] });
  await new Promise((r) => psock.on('connect', r));
  const pCancel = new Promise((res) => psock.on('request:cancelled', res));
  const cancel = await api(`/api/requests/${reqId}/cancel`, { method: 'PATCH', token: cust.token });
  const cancelEvt = await Promise.race([pCancel, new Promise((r) => setTimeout(() => r('TIMEOUT'), 6000))]);
  check('L3 Cancel request WORKS live (200 + provider receives request:cancelled event)',
    cancel.status === 200 && cancelEvt !== 'TIMEOUT', { st: cancel.status, evt: cancelEvt === 'TIMEOUT' ? null : cancelEvt });
  psock.close();

  const avail = await api(`/api/providers/available?city=Faisalabad&category=electrician`, { token: cust.token });
  check('L4 "Providers in city" screen backend endpoint responds meaningfully (200 + array), so the button navigates to a working screen',
    avail.status === 200 && Array.isArray(avail.data.providers), { st: avail.status, count: avail.data.count });

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
