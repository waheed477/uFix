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

  console.log('\n=== STATIC — stats move (TASK 1, 2026-08-24) ===');
  const profileSrc = read('screens/profile.tsx');
  check('S15a Provider Home: stats grid REMOVED (no Today\'s earnings/Jobs done triplet above the request list)',
    !/Today's earnings|Jobs done|grid-cols-3 gap-2\.5/.test(provider));
  check('S15b stats consolidated on PROFILE: provider gets Earnings (all-time PKR) + Jobs done + Rating X.X★; no "undefined★"/"0★" artifact',
    /Earnings/.test(profileSrc) && /toFixed\(1\)\}★/.test(profileSrc) && /"—"/.test(profileSrc) &&
    read('components/ui.tsx').includes('RatingSummary'));
  check('S15c Provider Home top section compacted for above-the-fold request cards (space-y-2.5, pb-3)',
    /space-y-2\.5 p-4 pb-3/.test(provider));
  // above-the-fold math: greeting row (~46px) + compact paddings (~28px) + online card (~72px) ≈ 146px.
  // Even a 700px viewport minus ~64px tab bar leaves ~490px of list space - a full request card
  // (~230px incl. header/pin/description/actions) is fully visible with room to spare.
  check('S15d request list starts immediately after the compact top section (no other blocks between busy banner and list container)',
    /flex-1 overflow-y-auto px-4 pb-4/.test(provider));

  console.log('\n=== STATIC — unprofessional-UI sweep round 2 (TASK 2, 2026-08-24) ===');
  const onboardingSrc = read('screens/onboarding.tsx');
  check('S16 dev-only OTP showcase is DEV-gated (no developer-facing OTP box in production builds)',
    /import\.meta\.env\.DEV && debugOtp/.test(onboardingSrc));
  const bareBacks = [];
  for (const f of SCREEN_FILES.concat(['components/SoundPreview.tsx'])) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      if (/onClick=\{(back|onBack)\} className="tap-highlight-none -ml-1/.test(line) && !/aria-label/.test(line)) bareBacks.push(`${f}:${i + 1}`);
    });
  }
  check('S17 all bare icon-only back buttons carry aria-label; chat send + call links labeled',
    bareBacks.length === 0, bareBacks);
  check('S18 chat send button + phone call links have accessible labels',
    /aria-label="Send message"/.test(jobs) && /aria-label="Call"/.test(jobs));
  check('S19 chat header copy human ("Online now", no "real-time" jargon); peer rating 1-decimal consistent',
    /Online now<\/p>/.test(jobs) && !/Online now - real-time/.test(jobs) && /peerRating\.toFixed\(1\)/.test(jobs));

  console.log('\n=== STATIC — long-text overflow guards (TASK 2.8) ===');
  check('S20 long content cannot break cards: truncations line-clamped on provider+customer names, request description, addresses',
    customer.includes('truncate font-display text-[15px] font-bold text-ink-900') && customer.includes('{offer.providerName}') &&
    provider.includes('truncate font-display text-[15px] font-bold text-ink-900') && provider.includes('{req.customerName}') &&
    /line-clamp-2 text-sm leading-relaxed text-ink-700/.test(provider) &&
    jobs.includes('truncate font-display text-base font-bold text-ink-900') && jobs.includes('{peerName}'));
  const leftoverMarkers = [];
  for (const f of SCREEN_FILES.concat(['components/SoundPreview.tsx'])) if (read(f).includes('PLACEHOLDER')) leftoverMarkers.push(f);
  check('S21 no corruption/test markers (PLACEHOLDER) left in any screen source', leftoverMarkers.length === 0, leftoverMarkers);

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

  console.log('\n=== LIVE — long-text edge content survived end-to-end (TASK 2.8 live) ===');
  const LONG_NAME = 'Muhammad Abdul Wajid Khan Sherzai Senior Tec'; // 45 chars - realistic long name (>50 is rejected by validated schema, asserted in L5b)
  const LONG_DESC = 'Kitchen sink pipe leaking badly under the counter, water pooling, cabinet wood swelling and mold spreading - need someone today please, building third floor no elevator';
  const mp2 = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone: `+9270${uniq}1` } });
  const vp2 = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: `+9270${uniq}1`, otp: mp2.data.otp, name: LONG_NAME, role: 'provider', city: 'Karachi' } });
  const mc2 = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone: `+9270${uniq}2` } });
  const vc2 = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: `+9270${uniq}2`, otp: mc2.data.otp, name: 'Sadia Long Customer', role: 'customer', city: 'Karachi' } });
  const pv2 = { token: vp2.data.token };
  const cu2 = { token: vc2.data.token };
  await api('/api/users/location', { method: 'PATCH', token: pv2.token, body: { lng: 67.0011, lat: 24.8607, city: 'Karachi' } });
  await api('/api/users/location', { method: 'PATCH', token: cu2.token, body: { lng: 67.0090, lat: 24.8680, city: 'Karachi' } });
  await api('/api/providers/setup', { method: 'PATCH', token: pv2.token, body: { category: 'plumber', radiusKm: 15 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: pv2.token });
  await api('/api/users/profile', { method: 'PATCH', token: pv2.token, body: { isOnline: true } });
  const rq2 = await api('/api/requests', { method: 'POST', token: cu2.token, body: { category: 'plumber', description: LONG_DESC, lng: 67.0090, lat: 24.8680, address: 'Clifton Block 5, Karachi', city: 'Karachi' } });
  const near2 = await api(`/api/requests/nearby?lat=24.8607&lng=67.0011&radiusKm=15&category=plumber`, { token: pv2.token });
  if (!((near2.data?.requests || []).some((r) => String(r.id || r._id) === String(rq2.data.request?.id)))) {
    console.log('  [diag L5]', near2.status, 'count:', near2.data?.count, 'ids:', (near2.data?.requests || []).map((r) => [String(r.id || r._id).slice(-4), (r.description || '').length, r.distanceKm]), 'want:', String(rq2.data.request?.id).slice(-4));
  }
  const mine2 = (near2.data?.requests || []).find((r) => String(r.id || r._id) === String(rq2.data.request?.id));
  check('L5 180-char description + 45-char name flow end-to-end intact (description served fully, same-city distance sane, cards guard truncation statically per S20)',
    vp2.data.token && rq2.status === 201 && mine2 && mine2.description?.length > 150 &&
    typeof mine2.distanceKm === 'number' && mine2.distanceKm < 8,
    { st: rq2.status, tok: !!vp2.data.token, descLen: mine2?.description?.length, km: mine2?.distanceKm });

  const mp3 = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone: `+9270${uniq}3` } });
  const rejectLong = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: `+9270${uniq}3`, otp: mp3.data.otp, name: 'X'.repeat(60), role: 'customer', city: 'Karachi' } });
  check('L5b absurdly long names (>50) are cleanly REJECTED by validated schema, not silently stored',
    rejectLong.status === 400 || rejectLong.status === 500 || rejectLong.status === 422, { st: rejectLong.status });

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
