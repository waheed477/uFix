/**
 * RETURNING-USER LOGIN & SESSION PERSISTENCE suite (2026-08-21).
 *
 * PART A (backend contract): isNewUser / setupComplete / setupStep decided server-side,
 * identical shape for phone OTP and Google; existing-account login ignores stale body fields;
 * googleId -> phone -> email account reconciliation (linking, never duplicates).
 * PART C (dual-token): access (25min, type:'access') + refresh (30d, type:'refresh', jti,
 * bcrypt-hashed server-side => revocable); /refresh issues fresh access; /logout revokes;
 * API middleware AND socket middleware accept access-type ONLY.
 * PART B/D: setupComplete-aware routing wired in frontend (static checks); provider partial-
 * setup resume matrix via setupStep; multi-device sessions independent.
 *
 * Google NOTE: no GOOGLE_CLIENT_ID is configured in this sandbox and real Google idTokens
 * cannot be minted outside a browser, so the Google path is verified by (a) the live
 * needsConfig contract and (b) strict source-trace checks of the reconciliation order -
 * the same env-limited treatment previous passes documented.
 *
 * Exit 0 = all PASS. Requires backend on :5000 (dev-inmemory).
 */
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const API = process.env.API_URL || 'http://localhost:5000';
// dev-inmemory's fallback JWT secret - used ONLY to mint tampered/expired probe tokens
const DEV_SECRET = process.env.JWT_SECRET || '9f1b3c2d4e5a6f708192a3b4c5d6e7f809182a3b4c5d6e7f8091a2b3c4d5e6f7a';

let pass = 0, fail = 0, skipped = 0;
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, e) => { fail++; console.log(`  FAIL  ${n}${e !== undefined ? '  -- ' + JSON.stringify(e).slice(0, 220) : ''}`); };
const check = (n, c, e) => (c ? ok(n) : bad(n, e));
const skip = (n, why) => { skipped++; console.log(`  SKIP  ${n}  (${why})`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = (v) => (v === undefined || v === null ? '' : v.toString());
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const dec = (t) => jwt.decode(t);

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function otp(phone) { // returns the dev OTP (verify deletes it, so re-sends are never rate-limited)
  const o = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
  return o.data?.otp;
}
function trySocket(token, timeout = 6000) {
  return new Promise((resolve) => {
    const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 });
    const done = (okVal, err) => { try { s.close(); } catch {} resolve({ ok: okVal, err }); };
    s.on('connect', () => done(true));
    s.on('connect_error', (e) => done(false, String(e?.message || e)));
    setTimeout(() => done(false, 'timeout'), timeout);
  });
}

(async () => {
  const uniq = String(Date.now()).slice(-7);
  const ROOT = path.join(__dirname, '..', '..');

  console.log('\n=== STATIC: contract + plumbing (both auth methods) ===');
  const ac = strip(fs.readFileSync(path.join(ROOT, 'backend/src/controllers/authController.js'), 'utf8'));
  const iGid = ac.indexOf('User.findOne({ googleId })');
  const iPhone = ac.indexOf('User.findOne({ phone: phone.trim() })');
  const iEmail = ac.indexOf('User.findOne({ email })');
  check('A1 reconciliation order is googleId -> phone -> email (documented sequence)',
    iGid !== -1 && iPhone !== -1 && iEmail !== -1 && iGid < iPhone && iPhone < iEmail, [iGid, iPhone, iEmail]);
  check('A2 google LINK writes googleId onto the existing account (no duplicate User creation on that path)',
    /user\.googleId = googleId/.test(ac) && ac.includes('authProvider') && ac.includes('409'));
  check('A3 dual-token utils: access type-claim + refresh jti + RefreshToken model (hashed, revocable)',
    strip(fs.readFileSync(path.join(ROOT, 'backend/src/utils/generateToken.js'), 'utf8')).includes("type: 'access'") &&
    strip(fs.readFileSync(path.join(ROOT, 'backend/src/models/RefreshToken.js'), 'utf8')).includes('tokenHash'));
  check('A4 HTTP + Socket middlewares hard-reject non-access tokens',
    strip(fs.readFileSync(path.join(ROOT, 'backend/src/middleware/auth.js'), 'utf8')).includes("decoded.type !== 'access'") &&
    strip(fs.readFileSync(path.join(ROOT, 'backend/src/sockets/authSocket.js'), 'utf8')).includes("decoded.type !== 'access'"));
  const st = fs.readFileSync(path.join(ROOT, 'frontend/src/lib/store.tsx'), 'utf8');
  const ob = fs.readFileSync(path.join(ROOT, 'frontend/src/screens/onboarding.tsx'), 'utf8');
  const ap = fs.readFileSync(path.join(ROOT, 'frontend/src/lib/api.ts'), 'utf8');
  const sk = fs.readFileSync(path.join(ROOT, 'frontend/src/lib/socket.ts'), 'utf8');
  check('B1 frontend routes STRICTLY on backend setupComplete/setupStep (store + restore), no category-guessing left',
    st.includes('setupComplete === false') && st.includes('ufix_setup_resume_step') &&
    !/if \(role === 'provider'\) \{\s*const backendUser = getStoredUser\(\);/.test(st));
  check('B2 session restore calls /auth/me; completeAuth funnel reads stored flags for BOTH methods',
    st.includes('api.auth.me()') && (ob.match(/setAuthSession\(response\)/g) || []).length === 3 &&
    ob.includes('completeAuth('));
  check('B3 api client: single-flight refresh (shared promise) + retry-once + session-expired event only on double failure',
    ap.includes('refreshPromise') && ap.includes('refreshSessionOnce') && ap.includes("detail: { reason: 'session-expired' }"));
  check('B4 socket auth uses function form (fresh token on every reconnect)',
    /auth: \(cb/.test(sk));

  console.log('\n=== LIVE phone OTP: new signup -> returning login (stale body ignored) ===');
  const ph = `+92360${uniq}`;
  const otp1 = await otp(ph);
  const v1 = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: ph, otp: otp1, name: 'Flow Customer', role: 'customer', city: 'Faisalabad' } });
  check('L1 NEW signup: 201, isNewUser:true, setupComplete:true (name+city), both tokens issued',
    v1.status === 201 && v1.data?.isNewUser === true && v1.data?.user?.setupComplete === true && !!v1.data?.token && !!v1.data?.refreshToken,
    { isNewUser: v1.data?.isNewUser, sc: v1.data?.user?.setupComplete });
  const a1 = dec(v1.data.token), r1 = dec(v1.data.refreshToken);
  check('L2 token claims: access type + ~25min expiry; refresh type + jti + 30d expiry',
    a1?.type === 'access' && a1.exp - a1.iat <= 26 * 60 && r1?.type === 'refresh' && !!r1?.jti && Math.round((r1.exp - r1.iat) / 86400) === 30,
    { a: [a1?.type, a1 && (a1.exp - a1.iat)], r: [r1?.type, r1?.jti, r1 && Math.round((r1.exp - r1.iat) / 86400)] });

  const otp2 = await otp(ph);
  const v2 = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: ph, otp: otp2, name: 'Forged Name', role: 'provider', city: 'Karachi' } });
  check('L3 RETURNING login: 200, isNewUser:false, and junk name/role/city in body IGNORED (DB wins)',
    v2.status === 200 && v2.data?.isNewUser === false && v2.data?.user?.name === 'Flow Customer' &&
    v2.data?.user?.role === 'customer' && v2.data?.user?.city === 'Faisalabad',
    { st: v2.status, u: [v2.data?.user?.name, v2.data?.user?.role, v2.data?.user?.city] });
  const me1 = await api('/api/auth/me', { token: v2.data.token });
  check('L4 GET /auth/me: isNewUser:false + setupComplete:true + full profile (restore contract)',
    me1.status === 200 && me1.data?.isNewUser === false && me1.data?.user?.setupComplete === true && me1.data?.user?.setupStep === null,
    me1.data && { isNewUser: me1.data.isNewUser, sc: me1.data.user?.setupComplete });

  console.log('\n=== LIVE provider partial-setup resume matrix (Part B/D, phone method) ===');
  const php = `+92361${uniq}`;
  const po1 = await otp(php);
  const p1 = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: php, otp: po1, name: 'Partial Provider', role: 'provider', city: 'Faisalabad' } });
  check('P1 new provider: setupComplete:false, setupStep "category" (nothing set yet)',
    p1.status === 201 && p1.data?.user?.setupComplete === false && p1.data?.user?.setupStep === 'category', p1.data?.user);
  // log back in -> must STILL be incomplete at the SAME step (resume, not restart)
  const po2 = await otp(php);
  const p2 = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: php, otp: po2 } });
  check('P2 returning partial provider: isNewUser:false, NOT reset - still setupStep "category"',
    p2.status === 200 && p2.data?.isNewUser === false && p2.data?.user?.setupStep === 'category', p2.data?.user?.setupStep);
  await api('/api/providers/setup', { method: 'PATCH', token: p2.data.token, body: { category: 'plumber', radiusKm: 10, yearsExperience: 5, defaultVisitingCharge: 500 } });
  const meP = await api('/api/auth/me', { token: p2.data.token });
  check('P3 after category+radius: setupStep advances EXACTLY to "verification" (not complete, not scratch)',
    meP.data?.user?.setupComplete === false && meP.data?.user?.setupStep === 'verification', meP.data?.user?.setupStep);
  const fd = new FormData();
  fd.append('document', new Blob([Buffer.from('%PDF-1.4 doc')], { type: 'application/pdf' }), 'd.pdf');
  const up = await fetch(`${API}/api/providers/document`, { method: 'POST', headers: { Authorization: `Bearer ${p2.data.token}` }, body: fd });
  const meP2 = await api('/api/auth/me', { token: p2.data.token });
  check('P4 document uploaded -> verificationStatus pending -> setupComplete:true (resume finished)',
    up.status === 200 && meP2.data?.user?.setupComplete === true && meP2.data?.user?.setupStep === null,
    [up.status, meP2.data?.user?.verificationStatus]);
  const po3 = await otp(php);
  const p3 = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: php, otp: po3 } });
  check('P5 FULL provider persistence across login: category/radiusKm/verificationStatus all survive',
    p3.data?.user?.category === 'plumber' && p3.data?.user?.radiusKm === 10 &&
    p3.data?.user?.verificationStatus === 'pending' && p3.data?.user?.setupComplete === true,
    [p3.data?.user?.category, p3.data?.user?.radiusKm, p3.data?.user?.verificationStatus]);

  console.log('\n=== LIVE dual-token: refresh / revoke / type enforcement / multi-device ===');
  const rfBad = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: 'garbage.token.here' } });
  const rfMe = await api('/api/auth/me', { token: v2.data.refreshToken });
  const rfSocket = await trySocket(v2.data.refreshToken);
  const acSocket = await trySocket(v2.data.token);
  check('T1 refresh-GARBAGE 401; refresh-token on /me 401 (middleware); socket rejects refresh, accepts access',
    rfBad.status === 401 && rfMe.status === 401 && rfSocket.ok === false && acSocket.ok === true,
    { rfBad: rfBad.status, rfMe: rfMe.status, rfSock: rfSocket.err, acSock: acSocket.ok });
  const rf1 = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: v2.data.refreshToken } });
  // NOTE: identical claims signed in the same second can produce an identical JWT string, so
  // prove freshness via iat (>= signup iat) + liveness, not strict string inequality (flaky).
  check('T2 /refresh -> 200 + NEW working access token (iat>=signup iat) + fresh user payload',
    rf1.status === 200 && !!rf1.data?.token && dec(rf1.data.token).iat >= dec(v2.data.token).iat && rf1.data?.user?.phone === ph &&
    (await api('/api/auth/me', { token: rf1.data.token })).status === 200, rf1.status);
  // expired access token (minted with the dev secret) must 401
  const expiredAccess = jwt.sign({ id: dec(v2.data.token).id, role: 'customer', type: 'access' }, DEV_SECRET, { expiresIn: -10 });
  check('T3 expired access token -> 401 (the real-world trigger for the silent frontend refresh)',
    (await api('/api/auth/me', { token: expiredAccess })).status === 401);
  const lo1 = await api('/api/auth/logout', { method: 'POST', body: { refreshToken: v2.data.refreshToken } });
  const rf2 = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: v2.data.refreshToken } });
  check('T4 logout REVOKES server-side: same refresh token now 401 (record deleted, not just client-cleared)',
    lo1.status === 200 && rf2.status === 401 && rf2.data?.code === 'REFRESH_REVOKED', { lo: lo1.status, rf: rf2.status, code: rf2.data?.code });

  // multi-device: two independent sessions, invalidating one leaves the other alive
  const oA = await otp(ph); const sA = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: ph, otp: oA, device: 'device-A' } });
  const oB = await otp(ph); const sB = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: ph, otp: oB, device: 'device-B' } });
  const bothLive = (await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: sA.data?.refreshToken } })).status === 200 &&
                   (await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: sB.data?.refreshToken } })).status === 200;
  await api('/api/auth/logout', { method: 'POST', body: { refreshToken: sA.data?.refreshToken } });
  const aDead = (await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: sA.data?.refreshToken } })).status;
  const bAlive = (await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: sB.data?.refreshToken } })).status;
  check('T5 multi-device: two sessions refresh independently; revoking A leaves B fully alive (no forced single-session)',
    bothLive && aDead === 401 && bAlive === 200, { bothLive, aDead, bAlive });
  check('T6 logout is idempotent (unknown/already-revoked token still returns success)',
    (await api('/api/auth/logout', { method: 'POST', body: { refreshToken: sA.data?.refreshToken } })).status === 200);

  console.log('\n=== GOOGLE: env-limited live contract + static reconciliation trace ===');
  if (!process.env.GOOGLE_CLIENT_ID) {
    const g = await api('/api/auth/google', { method: 'POST', body: { idToken: 'sandbox-cannot-mint-real-google-token' } });
    check('G1 Google endpoint reachable; without GOOGLE_CLIENT_ID it fails LOUDLY with needsConfig: true (documented env limit)',
      g.status === 500 && g.data?.needsConfig === true, g.status);
    skip('G2 live googleId-link + returning-Google login', 'no GOOGLE_CLIENT_ID + real idTokens cannot be minted in a sandbox - covered by A1/A2 static trace, same treatment as prior passes');
  } else {
    skip('G1 needsConfig contract', 'GOOGLE_CLIENT_ID configured in env');
    const gLive = await api('/api/auth/google', { method: 'POST', body: { idToken: 'invalid-token' } });
    check('G2 invalid idToken -> 401 (verification wiring live)', gLive.status === 401, gLive.status);
  }

  console.log('\n=== GOOGLE reconciliation: IN-PROCESS run of the REAL controller (real Mongo, mocked Google verify seam) ===');
  // GOOGLE_CLIENT_ID is unset + real idTokens can't be minted in a sandbox, so HTTP-level
  // verification is env-limited. The CONTROLLER's reconciliation logic, however, is fully
  // testable: stub ONLY Google's cryptographic verify seam, then invoke the real exported
  // googleAuth against a real in-memory Mongo (same code path the server runs).
  {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongoose = require('mongoose');
    const mem = await MongoMemoryServer.create();
    process.env.GOOGLE_CLIENT_ID = 'sandbox-test-client';
    await mongoose.connect(mem.getUri('ufix-g'));

    // Mock ONLY the Google token-verification seam (env limit - documented):
    let nextPayload = null;
    const { OAuth2Client } = require('google-auth-library');
    OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => nextPayload });
    const { googleAuth } = require('../src/controllers/authController');
    const User = require('../src/models/User');

    const run = (body) => new Promise((resolve, reject) => {
      const res = {
        statusCode: 200, body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; resolve({ status: this.statusCode, data: b }); return this; },
      };
      googleAuth({ body, app: { get: () => null } }, res).catch(reject);
    });

    // (a) phone-registered user later signs in via Google with the SAME phone -> LINK, no duplicate
    const seeded = await User.create({ name: 'Phone First', phone: `+92362${uniq}`, role: 'customer', city: 'Lahore', authProvider: 'phone' });
    nextPayload = { sub: `g-sub-${uniq}`, email: `g${uniq}@example.com`, name: 'Phone First', picture: null };
    const link = await run({ idToken: 'fake', phone: seeded.phone });
    const afterLink = await User.find({ phone: seeded.phone });
    const linkedDoc = await User.findById(seeded._id);
    check('G3 google-same-phone LINKS existing account: 200, isNewUser:false, SAME user id, googleId persisted, authProvider both, exactly ONE user row',
      link.status === 200 && link.data?.isNewUser === false && S(link.data?.user?.id) === S(seeded._id) &&
      afterLink.length === 1 && linkedDoc?.googleId === nextPayload.sub && linkedDoc?.authProvider === 'both',
      { st: link.status, isNew: link.data?.isNewUser, rows: afterLink.length });

    // (b) returning login purely by googleId (no phone in body) -> same account
    const ret = await run({ idToken: 'fake2' });
    check('G4 returning GOOGLE login by googleId: 200, isNewUser:false, same account',
      ret.status === 200 && ret.data?.isNewUser === false && S(ret.data?.user?.id) === S(seeded._id), [ret.status, ret.data?.isNewUser]);

    // (c) genuinely new Google account -> signup contract (role+phone required), isNewUser:true
    nextPayload = { sub: `g-new-${uniq}`, email: `n${uniq}@example.com`, name: 'Fresh Google User', picture: null };
    const needsPh = await run({ idToken: 'fake3' });
    check('G5 new Google account without phone -> 400 needsPhone (Google replaces identity proof, not setup)',
      needsPh.status === 400 && needsPh.data?.needsPhone === true, needsPh.status);
    const created = await run({ idToken: 'fake3', phone: `+92363${uniq}`, role: 'provider', city: 'Lahore' });
    check('G6 new Google PROVIDER signup: 201, isNewUser:true, setupComplete:false, setupStep category',
      created.status === 201 && created.data?.isNewUser === true && created.data?.user?.setupComplete === false &&
      created.data?.user?.setupStep === 'category' && created.data?.user?.authProvider === 'both', created.data?.user && { sc: created.data.user.setupComplete, step: created.data.user.setupStep });

    // (d) phone already linked to a DIFFERENT googleId -> 409, never a silent hijack
    nextPayload = { sub: `g-other-${uniq}`, email: `o${uniq}@example.com`, name: 'Other', picture: null };
    const conflict = await run({ idToken: 'fake4', phone: seeded.phone });
    check('G7 phone already linked to another Google account -> 409 conflict (no hijack, no duplicate)',
      conflict.status === 409, conflict.status);

    await mongoose.disconnect();
    await mem.stop();
    delete process.env.GOOGLE_CLIENT_ID;
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed, ${skipped} env-limited skip(s) ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Auth-flow suite crashed:', e); process.exit(1); });
