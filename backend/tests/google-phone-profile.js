/**
 * Google Phone-Entry (set-once) + Profile Debug Cleanup (2026-08-26)
 *
 * Covers the two tasks:
 *  T1 Phone number for Google Sign-In users
 *     - Signup-time enforcement was ALREADY present (googleAuth 400 needsPhone) - static+doc check.
 *     - NEW: an EXISTING account with NO phone (legacy Google user) can SET ONCE via
 *       PATCH /api/users/profile; afterwards locked forever (403 PHONE_LOCKED), identical to
 *       phone-OTP users. Format = same regex as send-otp; uniqueness enforced (409 PHONE_TAKEN).
 *     - Google OAuth itself is env-limited in this sandbox (no GOOGLE_CLIENT_ID / real idTokens)
 *       — per prior passes, the token-verification seam is out of live scope; the ENTIRE
 *       set-once contract is proven live with minted access JWTs against seeded users.
 *  T2 Profile Settings debug-content cleanup
 *     - Sound Preview panel entry is DEV-gated (import.meta.env.DEV) and eliminated from the
 *       production bundle (live-grepped in dist after a production build below).
 *     - Dev-speak strings removed ("City-based (precise ignored)" -> "Same city only", etc).
 *
 * Spawns its own dev-mode server on :5055 (OTP echo on, rate limits test-bypassed) with its
 * own in-memory Mongo - the regression battery server on :5000 is undisturbed.
 *
 * Run: node tests/google-phone-profile.js
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const PORT = 5055;
const API = `http://localhost:${PORT}`;
const JWT_SECRET = 'gp-secret-1f9c8e7d6b5a4938271f0e9d8c7b6a59483726150eadbeefcafe0123456789ab';

let passed = 0; let failed = 0; const failures = [];
function check(name, cond, diag) {
  if (cond) { passed++; console.log(`  \u2705 ${name}`); }
  else { failed++; failures.push(name); console.log(`  \u274c ${name}${diag !== undefined ? ' :: ' + JSON.stringify(diag) : ''}`); }
}

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

async function api(pathname, opts = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

async function main() {
  console.log('\n=== STATIC: set-once backend + cleanup guards ===');
  const uc = strip(read('backend/src/controllers/userController.js'));
  check('S1 updateProfile: phone accepted ONLY when currently empty; set user -> 403 PHONE_LOCKED',
    /me\.phone && me\.phone\.trim\(\)\.length > 0/.test(uc) && /status\(403\)[\s\S]{0,120}PHONE_LOCKED/.test(uc));
  check('S2 phone validation = same regex as send-otp (+7-20 chars) + 409 PHONE_TAKEN uniqueness + isPhoneVerified=false',
    uc.includes('/^\\+?[0-9\\s\\-()]{7,20}$/') && /status\(409\)/.test(uc) && /PHONE_TAKEN/.test(uc) && /updates\.isPhoneVerified = false/.test(uc));

  const um = read('backend/src/models/User.js');
  check('S3 schema: phone still validated, no longer required (legacy Google accounts), partial-unique index',
    !/phone:\s*\{\s*type:\s*String,\s*required:/.test(um) && um.includes("partialFilterExpression: { phone: { $type: 'string' } }"));

  const gac = strip(read('backend/src/controllers/authController.js'));
  check('S4 Google signup-time enforcement STILL present (needsPhone, untouched)',
    gac.includes('needsPhone') && gac.includes('Phone number is mandatory for all users'));

  const prof = read('frontend/src/screens/profile.tsx');
  check('S5 EditProfile: locked display when phone present; SET-ONCE input when absent',
    prof.includes('hasPhone ? (') && prof.includes('Login ID') && prof.includes('lock ho jayega') &&
    prof.includes('inputMode="tel"'));
  check('S6 EditProfile passes phone only when setting once (hasPhone ? undefined : phone)',
    prof.includes('hasPhone ? undefined : (phone.trim() || undefined)'));

  check('S7 Sound Preview entry DEV-gated (import.meta.env.DEV) - absent in production render',
    /import\.meta\.env\.DEV && \([\s\S]{0,400}Sound Preview/.test(prof));
  check('S8 dev-speak removed from Profile ("precise ignored" / "Map Center" gone)',
    !prof.includes('precise ignored') && !prof.includes('Map Center:'));

  const ob = strip(read('frontend/src/screens/onboarding.tsx'));
  check('S9 onboarding handles needsPhone: prompts for phone with a clear message',
    ob.includes('needsPhone') && ob.includes('phone number is mandatory'));

  console.log('\n=== LIVE: spawned dev server on :5055 (own in-memory Mongo) ===');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongoose = require('mongoose');
  const mongod = await MongoMemoryServer.create();
  const URI = mongod.getUri('ufix-google-phone');
  const childEnv = {
    ...process.env,
    NODE_ENV: 'development', // OTP echo + no prod gates, but real routes/logic
    PORT: String(PORT),
    MONGO_URI: URI,
    CLIENT_URL: 'http://localhost:5173',
    JWT_SECRET,
    RATE_LIMIT_DISABLED: 'true', // test bypass (documented; not a prod behavior)
  };
  const child = spawn(process.execPath, ['src/server.js'], { cwd: path.join(ROOT, 'backend'), env: childEnv, stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(`${API}/api/health`); up = r.ok; } catch { /* retry */ }
      if (!up) await new Promise(r => setTimeout(r, 500));
    }
    check('L0 live server up (set-once code loaded)', up);
    if (!up) throw new Error('server never came up');

    // Suite-side connection for seeding legacy Google users (simulates pre-enforcement accounts)
    await mongoose.connect(URI);
    const User = require('../src/models/User');

    // --- L1: EXISTING phone-OTP user => phone change rejected (pre-existing rule protected) ---
    const ph1 = `+92811${String(Date.now()).slice(-7)}`;
    const so = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone: ph1 } });
    const v1 = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: ph1, otp: so.data.otp, name: 'Otp User', role: 'customer', city: 'Lahore' } });
    const otpToken = v1.data.token;
    check('L1a phone-OTP user registered (control account)', !!otpToken);
    const lockTry = await api('/api/users/profile', { method: 'PATCH', token: otpToken, body: { phone: '+928110000001' } });
    check('L1b phone-OTP user trying to CHANGE phone -> 403 PHONE_LOCKED (rule #1 intact)',
      lockTry.status === 403 && lockTry.data?.code === 'PHONE_LOCKED', { status: lockTry.status });

    // --- L2: legacy Google user with NO phone => can SET ONCE ---
    const g1 = await User.create({ name: 'Legacy Google One', email: 'legacy1@example.com', googleId: `g-${Date.now()}-1`, role: 'customer', city: 'Lahore', authProvider: 'google', isPhoneVerified: false });
    const mint = (user) => jwt.sign({ id: user._id, role: user.role, type: 'access' }, JWT_SECRET);
    const g1Token = mint(g1);
    check('L2a legacy Google account (no phone) seeded — the account type this task repairs', !!g1._id && !g1.phone);
    const set1 = await api('/api/users/profile', { method: 'PATCH', token: g1Token, body: { phone: '+928220000002' } });
    check('L2b first-time SET allowed: 200, phone saved server-side',
      set1.status === 200 && set1.data?.user?.phone === '+928220000002', { status: set1.status, phone: set1.data?.user?.phone });
    const dbUser1 = await User.findById(g1._id);
    check('L2c DB row updated + isPhoneVerified honestly false (set via profile, not OTP)',
      dbUser1?.phone === '+928220000002' && dbUser1?.isPhoneVerified === false,
      { phone: dbUser1?.phone, verified: dbUser1?.isPhoneVerified });

    // --- L3: now locked forever ---
    const set2 = await api('/api/users/profile', { method: 'PATCH', token: g1Token, body: { phone: '+928229999999' } });
    check('L3 after being set, phone is LOCKED: change attempt -> 403 PHONE_LOCKED',
      set2.status === 403 && set2.data?.code === 'PHONE_LOCKED', { status: set2.status });

    // --- L4: uniqueness: another legacy user cannot steal an already-used number ---
    const g2 = await User.create({ name: 'Legacy Google Two', email: 'legacy2@example.com', googleId: `g-${Date.now()}-2`, role: 'customer', city: 'Lahore', authProvider: 'google', isPhoneVerified: false });
    const steal = await api('/api/users/profile', { method: 'PATCH', token: mint(g2), body: { phone: ph1 } }); // control account's number
    check('L4 uniqueness: number already used by another account -> 409 PHONE_TAKEN',
      steal.status === 409 && steal.data?.code === 'PHONE_TAKEN', { status: steal.status });

    // --- L5: format validation (same rule as send-otp) ---
    const badFmt = await api('/api/users/profile', { method: 'PATCH', token: mint(g2), body: { phone: '123' } });
    check('L5 invalid format -> 400 with clear message', badFmt.status === 400 && /format/i.test(badFmt.data?.message || ''), { status: badFmt.status });

    // --- L6: partial-unique index: MULTIPLE phone-less Google accounts can coexist ---
    const g3 = await User.create({ name: 'Legacy Google Three', email: 'legacy3@example.com', googleId: `g-${Date.now()}-3`, role: 'customer', city: 'Karachi', authProvider: 'google', isPhoneVerified: false });
    check('L6 schema/index allows several phone-less legacy accounts (no null-collision crash)', !!g3._id);

    // --- L7: normal profile updates still work alongside (name/city untouched rules) ---
    const nameUpd = await api('/api/users/profile', { method: 'PATCH', token: g1Token, body: { name: 'Legacy One Updated' } });
    check('L7 name/city updates unaffected by the phone rule', nameUpd.status === 200 && nameUpd.data?.user?.name === 'Legacy One Updated', { status: nameUpd.status });

    await mongoose.disconnect();
  } finally {
    child.kill('SIGTERM');
    await mongod.stop();
  }

  console.log('\n=== PROD-BUILD: zero debug trace in shipped bundle ===');
  try {
    execSync('npm run build', { cwd: path.join(ROOT, 'frontend'), stdio: 'pipe' });
    const distFiles = [];
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const fp = path.join(d, f); const st = fs.statSync(fp); if (st.isDirectory()) walk(fp); else distFiles.push(fp); } };
    walk(path.join(ROOT, 'frontend/dist'));
    const corpus = distFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    check('L8 production bundle contains ZERO sound-preview/candidate debug content',
      !corpus.includes('Sound Preview') && !corpus.includes('tone candidates') && !corpus.includes('arpeggio'),
      { files: distFiles.length });
    check('L9 production bundle SHIPS the set-once phone UI (feature present, debug absent)',
      corpus.includes('lock ho jayega') && corpus.includes('Login ID'), { has: corpus.includes('lock ho jayega') });
  } catch (e) {
    check('L8/L9 production build failed', false, String(e.message).slice(0, 200));
  }

  console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================`);
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(` - ${f}`)); }
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('Suite crashed:', e); process.exit(1); });
