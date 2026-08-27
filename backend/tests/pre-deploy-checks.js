/**
 * PRE-DEPLOY CHECKS (2026-08-20) - guards for the final pre-deployment fix pass.
 *
 * Item 1 (mandatory): EditProfile phone field is no longer a silent dead-end.
 *   Backend PATCH /api/users/profile ignores phone BY DESIGN (login identity; a real
 *   change needs re-verification). The old UI accepted edits AND desynced local state
 *   (wrote the typed phone into user state + storedUser while the backend kept the
 *   old one). The field is read-only for phone-OTP users.
 *   2026-08-26 EVOLUTION (user-directed Task 1): the contract is now "set-once, then locked" -
 *   a Google-sign-in account with NO phone may SET one once (backend enforces; 403 after),
 *   OTP users stay locked as before. The assertions below encode the NEW invariant: the
 *   editable input exists ONLY behind the no-phone gate, and a typed phone can NEVER reach
 *   the API when the account already has one.
 *   P1a: editable phone input exists ONLY in the !hasPhone branch; locked branch intact.
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
    'P1a phone input exists ONLY behind the no-phone gate (hasPhone ternary); locked branch kept',
    profile.includes('hasPhone ? (') && profile.includes('only}') === false &&
      profile.includes('hasPhone ? undefined : (phone.trim() || undefined)')
  );
  assertTrue(
    'P1b read-only phone note present ("cannot be changed ... used for login")',
    profile.includes('Phone number cannot be changed')
  );
  assertTrue(
    'P1c store passes phone to API ONLY when account has none (willSetPhone = !user.phone)',
    store.includes("const willSetPhone = !!phoneTrimmed && !(user as any)?.phone;") &&
      store.includes('willSetPhone ? { phone: phoneTrimmed } : {}')
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
