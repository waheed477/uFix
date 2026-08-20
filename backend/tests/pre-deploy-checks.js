/**
 * PRE-DEPLOY CHECKS (2026-08-20) - guards for the final pre-deployment fix pass.
 *
 * Item 1 (mandatory): EditProfile phone field is no longer a silent dead-end.
 *   Backend PATCH /api/users/profile ignores phone BY DESIGN (login identity; a real
 *   change needs re-verification). The old UI accepted edits AND desynced local state
 *   (wrote the typed phone into user state + storedUser while the backend kept the
 *   old one). Now the field is read-only with an explanatory note, and updateProfile()
 *   has no phone parameter at all.
 *   P1a: no editable phone input remains in profile.tsx (no setPhone anywhere).
 *   P1b: the read-only note text is present.
 *   P2 : uploadProfilePicture is wired to UI (Item 2: tap-to-change photo on Profile).
 *   P3 LIVE: PATCH /users/profile {phone:X} -> GET /users/profile still shows the
 *        original phone (documents the contract the UI now honestly reflects).
 *
 * Exit 0 = all PASS. Requires backend on :5000.
 */
const fs = require('fs');
const path = require('path');
const API = process.env.API_URL || 'http://localhost:5000';
const SRC = path.join(__dirname, '..', '..', 'frontend', 'src');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, e) => { fail++; console.log(`  FAIL  ${n}${e ? '  -- ' + e : ''}`); };
const assertTrue = (n, c, e) => (c ? ok(n) : bad(n, e));

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

(async () => {
  console.log('\n=== Pre-deploy checks (Item 1 phone dead-end, Item 2 photo upload, live contract) ===');
  const profile = fs.readFileSync(path.join(SRC, 'screens', 'profile.tsx'), 'utf8');
  const store = fs.readFileSync(path.join(SRC, 'lib', 'store.tsx'), 'utf8');
  const ui = fs.readFileSync(path.join(SRC, 'components', 'ui.tsx'), 'utf8');

  assertTrue(
    'P1a EditProfile has NO editable phone input (no setPhone anywhere in profile.tsx)',
    !/setPhone/.test(profile)
  );
  assertTrue(
    'P1b read-only phone note present ("cannot be changed ... used for login")',
    profile.includes('Phone number cannot be changed')
  );
  assertTrue(
    'P1c updateProfile() no longer accepts a phone argument (type + call sites agree)',
    store.includes('updateProfile: (name: string, city?: string) => void') &&
      profile.includes('updateProfile(name.trim(), city.trim())')
  );
  assertTrue(
    'P2 photo upload wired (Profile UI calls uploadProfilePicture; Avatar supports src w/ fallback)',
    profile.includes('uploadProfilePicture') && /src\?: string/.test(ui) && ui.includes('onError')
  );

  // P3 LIVE: backend contract - phone is immutable via PATCH /profile
  const ts = Date.now();
  const phone = `+92377${String(ts).slice(-7)}`;
  const otp = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
  const v = await api('/api/auth/phone/verify-otp', {
    method: 'POST', body: { phone, otp: otp.data.otp, name: 'PreDeploy Phone', role: 'customer', city: 'Lahore' },
  });
  const tok = v.data.token;
  await api('/api/users/profile', { method: 'PATCH', token: tok, body: { phone: '+923000000009' } });
  const after = await api('/api/users/profile', { token: tok });
  assertTrue(
    'P3 LIVE backend phone unchanged after PATCH {phone} (contract: login identity is immutable)',
    after.data?.user?.phone === phone,
    `orig=${phone} now=${after.data?.user?.phone}`
  );

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Pre-deploy check run crashed:', e); process.exit(1); });
