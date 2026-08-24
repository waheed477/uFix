/**
 * Work-Location Pinning + Location Privacy (2026-08-24, user-reported screenshot bug)
 *
 * Screenshot case: provider city = Gujranwala but device GPS reported ~Okara (73.03E/31.37N,
 * 180km away). The 50km plausibility cap then honestly showed "Distance unavailable" on every
 * card - correct but undiagnosable for a normal user. Fixes shipped:
 *
 *  P1 Provider can PIN their work location on a real map (Leaflet + OpenStreetMap) from Profile.
 *     A MANUAL pin always wins over drifting GPS (backend enforcement in updateLocation).
 *  P2 Provider Home warns when live GPS is 50km+ away from the matching city, with a
 *     one-tap path to Profile -> pin. Distance fallback uses the pin automatically.
 *  P3 Pre-acceptance, providers get AREA-LEVEL customer coordinates (snapped to a ~0.004 deg
 *     / ~400m grid), never the exact doorstep. Exact coords unlock only after acceptance
 *     (job payload) - privacy-safe, Uber/Careem style. Distance math impact <= ~0.3km.
 *
 * Run: node tests/work-location.js   (backend must be running on :5000 - dev-inmemory)
 */

const API = process.env.API_URL || 'http://localhost:5000';
const uniq = String(Date.now()).slice(-6);

let passed = 0; let failed = 0; const failures = [];
function check(name, cond, diag) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ❌ ${name}${diag !== undefined ? ' :: ' + JSON.stringify(diag) : ''}`); }
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Gujranwala centre (matches frontend PAKISTAN_CITIES) vs the screenshot's drifting GPS (~Okara)
const GUJRANWALA = { lng: 74.1945, lat: 32.1877 };
const OKARA_DRIFT = { lng: 73.0336, lat: 31.3709 };
const CUSTOMER_POINT = { lng: 74.1810, lat: 32.1620 }; // ~3.3km from centre, inside Gujranwala

async function registerUser({ phone, name, role, city }) {
  const send = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
  const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: send.data.otp, name, role, city } });
  if (!v.data?.token) throw new Error(`register failed for ${phone}: ${JSON.stringify(v.data)}`);
  return { token: v.data.token, id: (v.data.user.id || v.data.user._id).toString() };
}

async function main() {
  console.log(`\n🧪 Work-Location Pinning + Location Privacy against ${API}\n`);

  // ---------------- STATIC ----------------
  console.log('=== STATIC: backend model/controller enforcement ===');
  const userModel = read('backend/src/models/User.js');
  check('S1 User model has locationSource (gps|manual) + pinnedLocation + gpsLocation',
    /locationSource:\s*\{[\s\S]*?enum:\s*\['gps',\s*'manual'\][\s\S]*?default:\s*'gps'/.test(userModel) &&
    userModel.includes('pinnedLocation') && userModel.includes('gpsLocation'));

  // comment-stripped so explanatory comments can't trick the guard
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  const uc = strip(read('backend/src/controllers/userController.js'));
  check('S2 updateLocation: manual pin writes pinnedLocation+locationSource; GPS with pin does NOT overwrite location',
    /source\s*===\s*'manual'/.test(uc) &&
    /locationSource\s*=\s*'manual'/.test(uc) &&
    /user\.pinnedLocation\s*=\s*gpsPoint/.test(uc) &&
    /locationSource\s*===\s*'manual'[\s\S]{0,220}pinPreserved\s*=\s*true/.test(uc));

  const profileGet = read('backend/src/controllers/userController.js');
  check('S3 Profile GET exposes locationSource + pinnedLocation (chip needs it)',
    profileGet.includes('locationSource: (user.locationSource') && profileGet.includes('pinnedLocation: user.pinnedLocation'));

  const reqCtl = strip(read('backend/src/controllers/requestController.js'));
  check('S4 nearby requests snap customer coords to privacy grid (0.004 deg ~ 400-450m) pre-acceptance',
    /Math\.round\(Number\(v\)\s*\/\s*0\.004\)\s*\*\s*0\.004/.test(reqCtl));

  console.log('\n=== STATIC: frontend wiring ===');
  const picker = read('frontend/src/components/WorkLocationPicker.tsx');
  check('S5 picker = real map (Leaflet + OpenStreetMap tiles, draggable pin, saves source:manual)',
    picker.includes('from "leaflet"') &&
    picker.includes('tile.openstreetmap.org') &&
    picker.includes('draggable: true') &&
    picker.includes('"manual"'));

  const profile = read('frontend/src/screens/profile.tsx');
  check('S6 Profile Work-location card: source chip + Set on map + Use live GPS + reload after save',
    profile.includes('🗺️ Work location') &&
    profile.includes('Pinned by you') &&
    profile.includes('Set on map') &&
    profile.includes('Use live GPS') &&
    profile.includes('reloadProfile()'));

  const prov = read('frontend/src/screens/provider.tsx');
  check('S7 Provider Home: manual pin wins distance math (pinnedCoords) + GPS-mismatch banner routes to Profile',
    /pinnedCoords \|\| liveCoords \|\| location\.coords/.test(prov) &&
    prov.includes('locationSource === "manual"') &&
    /d > 50 \? d : null/.test(prov) &&
    prov.includes('setTab("profile")'));

  // ---------------- LIVE ----------------
  console.log('\n=== LIVE: the screenshot scenario, end-to-end ===');
  const provider = await registerUser({ phone: `+92340${uniq}1`, name: 'Guj PinProvider', role: 'provider', city: 'Gujranwala' });
  await api('/api/users/location', { method: 'PATCH', token: provider.token, body: { ...OKARA_DRIFT, city: 'Gujranwala' } });
  await api('/api/providers/setup', { method: 'PATCH', token: provider.token, body: { category: 'plumber', radiusKm: 15 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: provider.token });
  await api('/api/users/profile', { method: 'PATCH', token: provider.token, body: { isOnline: true } });

  // GPS drifted to Okara but city stayed Gujranwala (the screenshot state)
  const drifted = await api('/api/users/profile', { token: provider.token });
  const driftCoords = drifted.data.user.location.coordinates;
  check('L1 screenshot state reproducible: stored coords = drifting GPS (Okara), city = Gujranwala',
    Math.abs(driftCoords[0] - OKARA_DRIFT.lng) < 0.001 && Math.abs(driftCoords[1] - OKARA_DRIFT.lat) < 0.001 &&
    drifted.data.user.city === 'Gujranwala' && drifted.data.user.locationSource === 'gps',
    { driftCoords, city: drifted.data.user.city, src: drifted.data.user.locationSource });

  // Manual pin at Gujranwala centre -> pin becomes authoritative
  const pinRes = await api('/api/users/location', { method: 'PATCH', token: provider.token, body: { ...GUJRANWALA, city: 'Gujranwala', source: 'manual' } });
  check('L2 manual pin saved: locationSource=manual, location = pinned coords',
    pinRes.status === 200 && pinRes.data.locationSource === 'manual' &&
    Math.abs(pinRes.data.user.location.coordinates[0] - GUJRANWALA.lng) < 0.001,
    { st: pinRes.status, src: pinRes.data.locationSource });

  // Drifting GPS returns (as the app's silent background sync would) -> pin must SURVIVE
  const gpsAgain = await api('/api/users/location', { method: 'PATCH', token: provider.token, body: { lng: 73.1089, lat: 30.6666, city: 'Sahiwal', source: 'gps' } });
  const afterGps = await api('/api/users/profile', { token: provider.token });
  const c2 = afterGps.data.user.location.coordinates;
  check('L3 manual pin ALWAYS WINS: later GPS patch (even with a different city) cannot hijack location or city',
    gpsAgain.status === 200 && gpsAgain.data.pinPreserved === true &&
    Math.abs(c2[0] - GUJRANWALA.lng) < 0.001 && Math.abs(c2[1] - GUJRANWALA.lat) < 0.001 &&
    afterGps.data.user.locationSource === 'manual' && afterGps.data.user.city === 'Gujranwala',
    { pinPreserved: gpsAgain.data.pinPreserved, c2, city: afterGps.data.user.city });

  // A Gujranwala customer request now matches on the PIN (not the drifted GPS)
  const customer = await registerUser({ phone: `+92340${uniq}2`, name: 'Guj Customer', role: 'customer', city: 'Gujranwala' });
  await api('/api/users/location', { method: 'PATCH', token: customer.token, body: { ...CUSTOMER_POINT, city: 'Gujranwala' } });
  const reqRes = await api('/api/requests', { method: 'POST', token: customer.token, body: { category: 'plumber', description: 'Kitchen sink leak - work-location privacy test request', address: 'Satellite Town, Gujranwala', city: 'Gujranwala', lng: CUSTOMER_POINT.lng, lat: CUSTOMER_POINT.lat } });
  const reqId = (reqRes.data.request?.id || reqRes.data.request?._id || '').toString();
  check('L4 request created in Gujranwala', reqRes.status === 201 && !!reqId, { st: reqRes.status });

  const near = await api('/api/requests/nearby', { token: provider.token });
  const mine = (near.data?.requests || []).find((r) => String(r.id || r._id) === String(reqId));
  check('L5 pinned provider SEES the same-city request again (nearby works off the pin, not the drifted GPS)',
    near.status === 200 && near.data.hasActiveJob === false && !!mine, { st: near.status, count: near.data?.count });

  // P3 privacy: provider sees AREA-LEVEL coords (grid-snapped), not the exact doorstep
  const snap = (v) => Math.round(Number(v) / 0.004) * 0.004;
  const seenLng = Number(mine?.location?.coordinates?.[0]);
  const seenLat = Number(mine?.location?.coordinates?.[1]);
  check('L6 PRIVACY: pre-acceptance coords are grid-snapped (~400m), never exact doorstep',
    !!mine && Math.abs(seenLng - snap(CUSTOMER_POINT.lng)) < 1e-9 && Math.abs(seenLat - snap(CUSTOMER_POINT.lat)) < 1e-9 &&
    (Math.abs(seenLng - CUSTOMER_POINT.lng) > 1e-9 || Math.abs(seenLat - CUSTOMER_POINT.lat) > 1e-9) &&
    Math.abs(seenLng - CUSTOMER_POINT.lng) <= 0.004 && Math.abs(seenLat - CUSTOMER_POINT.lat) <= 0.004,
    { seenLng, seenLat, exact: CUSTOMER_POINT });

  // Distance surfaced from (possibly rounded) coords is still honest (<0.4km deviation tolerated)
  const hav = (la1, lo1, la2, lo2) => { const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180; const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };
  const exactKm = hav(GUJRANWALA.lat, GUJRANWALA.lng, CUSTOMER_POINT.lat, CUSTOMER_POINT.lng);
  const seenKm = hav(GUJRANWALA.lat, GUJRANWALA.lng, seenLat, seenLng);
  check('L7 rounded-coords distance stays within honesty tolerance (<=0.4km drift)',
    Math.abs(seenKm - exactKm) <= 0.4, { exactKm: exactKm.toFixed(3), seenKm: seenKm.toFixed(3) });

  // Post-acceptance: EXACT customer location unlocks (job payload) - the promised escalation
  const offer = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: provider.token, body: { visitingCharge: 400, etaMinutes: 15 } });
  const offerId = (offer.data?.offer?.id || offer.data?.offer?._id || offer.data?.id || '').toString();
  const accept = await api(`/api/offers/${offerId}/accept`, { method: 'PATCH', token: customer.token });
  const jobId = (accept.data?.job?.id || accept.data?.job?._id || accept.data?.jobId || '').toString();
  check('L8 offer accept -> job created', !!jobId, { st: accept.status, offerId });

  const job = await api(`/api/jobs/${jobId}`, { token: provider.token });
  const jobLoc = job.data?.job?.request?.location?.coordinates || job.data?.request?.location?.coordinates;
  check('L9 POST-ACCEPTANCE unlock: job payload carries the EXACT customer coordinates (not snapped)',
    Array.isArray(jobLoc) &&
    Math.abs(Number(jobLoc[0]) - CUSTOMER_POINT.lng) < 1e-9 && Math.abs(Number(jobLoc[1]) - CUSTOMER_POINT.lat) < 1e-9,
    jobLoc);

  // "Use my live GPS" EXPLICIT unpin path (Profile button sends unpin:true): only explicit
  // unpin returns control to GPS - silent background GPS syncs never clear a pin (L3 proved).
  const unpin = await api('/api/users/location', { method: 'PATCH', token: provider.token, body: { lng: 73.1089, lat: 30.6666, city: 'Sahiwal', source: 'gps', unpin: true } });
  const unpinned = await api('/api/users/profile', { token: provider.token });
  const c3 = unpinned.data.user.location.coordinates;
  check('L10 explicit unpin (Use my live GPS) returns GPS control: source=gps, location+city update',
    unpin.status === 200 && unpin.data.pinPreserved === false &&
    unpinned.data.user.locationSource === 'gps' && unpinned.data.user.city === 'Sahiwal' &&
    Math.abs(c3[0] - 73.1089) < 0.001,
    { st: unpin.status, src: unpinned.data.user.locationSource, city: unpinned.data.user.city });

  console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================`);
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(` - ${f}`)); }
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('Suite crashed:', e); process.exit(1); });
