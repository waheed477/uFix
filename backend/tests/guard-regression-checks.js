/**
 * REGRESSION GUARDS (2026-08-20) - permanent safeguards for the two confirmed regressions.
 *
 * BUG B: "Request a service" button re-appeared for providers.
 *   Root cause: onboarding login handlers set token+stage but never hydrated the
 *   store's `user` (completeAuth existed but had zero call sites). A null user fell
 *   through AppShell's role gate and mounted the CUSTOMER home until a page reload.
 *   Guards: (B1) the button text exists ONLY in customer.tsx; (B2) home is role-gated;
 *   (B3) newRequest screen is role-gated; (B4) AppShell bails to a loader when user is
 *   null; (B5) all 3 onboarding login paths call completeAuth; (B6) LIVE: backend
 *   rejects provider POST /requests with 403 (server never trusts the client either).
 *
 * BUG A: GPS silently overwrote an explicitly selected city (Faisalabad -> Multan).
 *   Root cause: requestLocation's granted branch unconditionally canonicalized the
 *   reverse-geocoded city, $set user.city and PATCHed the backend - and the 700ms
 *   auto-prompt made it fire with no user action at all.
 *   Guards: (A1) store.tsx keeps the explicit-selection guard; (A2) LIVE: the backend
 *   primitives the fix relies on behave atomically (poison -> reconcile -> city+coords
 *   match the explicit selection).
 *
 * Exit code 0 = all PASS, 1 = any FAIL. Requires the repo tree + backend on :5000.
 */
const fs = require('fs');
const path = require('path');
const API = process.env.API_URL || 'http://localhost:5000';
const SRC = path.join(__dirname, '..', '..', 'frontend', 'src');

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  PASS  ${name}`); };
const bad = (name, extra) => { fail++; console.log(`  FAIL  ${name}${extra ? '  -- ' + extra : ''}`); };
const assertTrue = (name, cond, extra) => (cond ? ok(name) : bad(name, extra));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function registerUser(phone, name, role, city) {
  const otp = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
  const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: otp.data.otp, name, role, city } });
  return { token: v.data.token, id: v.data.user.id.toString() };
}

// Faisalabad center, must match frontend/src/lib/location.ts
const FAISALABAD = { lng: 73.0776, lat: 31.4181 };

(async () => {
  console.log('\n=== BUG B guards: provider must never see "Request a service" (static) ===');

  // B1: the customer-only CTA text lives exclusively in customer.tsx
  // (comments stripped first - only actual rendered UI strings count)
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const offenders = walk(SRC)
    .filter((f) => stripComments(fs.readFileSync(f, 'utf8')).includes('Request a service'))
    .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));
  assertTrue(
    'B1 "Request a service" exists ONLY in screens/customer.tsx',
    offenders.length === 1 && offenders[0] === 'screens/customer.tsx',
    `found in: ${JSON.stringify(offenders)}`
  );

  const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
  // B2: home tab role-gated (provider -> ProviderHome, customer -> CustomerHome)
  assertTrue(
    'B2 home tab role-gated (isProvider ? ProviderHome : CustomerHome)',
    /isProvider\s*\?\s*<ProviderHome\s*\/>\s*:\s*<CustomerHome\s*\/>/.test(app)
  );
  // B3: newRequest screen guarded for providers
  assertTrue(
    'B3 newRequest screen provider-guarded',
    /screen\s*===\s*"newRequest"\s*&&\s*isProvider/.test(app)
  );
  // B4: AppShell never renders role content with a null user
  assertTrue(
    'B4 AppShell null-user guard (loader, not CustomerHome)',
    /if \(!user\) \{/.test(app) && app.includes('BUG B')
  );

  // B5: all onboarding login paths hydrate the store user via completeAuth
  const ob = fs.readFileSync(path.join(SRC, 'screens', 'onboarding.tsx'), 'utf8');
  const callSites = (ob.match(/completeAuth\(/g) || []).length;
  assertTrue(
    'B5 completeAuth() called in all 3 onboarding login paths (google/verify/details)',
    callSites >= 3,
    `only ${callSites} call site(s)`
  );

  console.log('\n=== BUG A guards: explicit city is never GPS-overwritten (static) ===');
  const store = fs.readFileSync(path.join(SRC, 'lib', 'store.tsx'), 'utf8');
  // A1: the explicit-selection guard exists in requestLocation
  assertTrue(
    'A1 requestLocation keeps "explicit selection wins" guard (BUG A)',
    store.includes('Regression Fix (BUG A') &&
      store.includes('keeping explicit selection (no silent override)')
  );

  console.log('\n=== LIVE API guards (backend on ' + API + ') ===');
  const ts = Date.now();
  // B6: provider can NEVER create a request server-side
  const prov = await registerUser(`+92300${String(ts).slice(-7)}`, 'Guard Provider', 'provider', 'Lahore');
  const asProv = await api('/api/requests', {
    method: 'POST',
    token: prov.token,
    body: { category: 'plumber', description: 'should be rejected' },
  });
  assertTrue(
    'B6 LIVE provider POST /requests rejected (403/401)',
    asProv.status === 403 || asProv.status === 401,
    `got ${asProv.status}`
  );

  // A2: poison (old bug wrote GPS city) -> reconcile (fix writes explicit city) -> verify
  const cust = await registerUser(`+92311${String(ts).slice(-7)}`, 'Guard Customer', 'customer', 'Faisalabad');
  await api('/api/users/location', {
    method: 'PATCH', token: cust.token,
    body: { lng: 71.5249, lat: 30.1575, city: 'Multan' }, // simulated old GPS clobber
  });
  const poisoned = await api('/api/users/profile', { token: cust.token });
  const reconcile = await api('/api/users/location', {
    method: 'PATCH', token: cust.token,
    body: { lng: FAISALABAD.lng, lat: FAISALABAD.lat, city: 'Faisalabad' }, // what the fixed frontend does
  });
  const after = await api('/api/users/profile', { token: cust.token });
  const u = after.data && after.data.user;
  const coords = u && u.location && u.location.coordinates;
  assertTrue(
    'A2 LIVE poison+reconcile: explicit city restored atomically (city + coords)',
    reconcile.status === 200 &&
      u && u.city === 'Faisalabad' &&
      Array.isArray(coords) &&
      Math.abs(coords[0] - FAISALABAD.lng) < 1e-6 &&
      Math.abs(coords[1] - FAISALABAD.lat) < 1e-6,
    `poisoned.city=${poisoned.data?.user?.city}, after.city=${u && u.city}, coords=${JSON.stringify(coords)}`
  );

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('Guard run crashed:', e);
  process.exit(1);
});
