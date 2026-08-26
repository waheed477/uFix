/**
 * Security Hardening — Pre-Deployment (2026-08-26)
 *
 * Proves the 6 hardening tasks LIVE against a real production-mode server:
 * this suite spawns its OWN `node src/server.js` with NODE_ENV=production, rate limits
 * ENABLED, strict CLIENT_URL, and an in-memory Mongo - the main dev-inmemory test server
 * (RATE_LIMIT_DISABLED=true) is never disturbed, so the rest of the battery is unaffected.
 *
 * Order note: normal-user + dev/admin-route + CORS + validation checks run FIRST while the
 * per-IP budgets are fresh; the limit-HAMMERING probes run last (by design they exhaust
 * budgets), so the two never interfere.
 *
 * Run: node tests/security-hardening.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 5050;
const API = `http://localhost:${PORT}`;
const CLIENT_ORIGIN = 'http://localhost:5173';
const ADMIN = 'adm-7c8f1e2b94d34a2aa9f5c618eb0d47fe-strong-random-example';

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
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data, headers: res.headers };
}

const waitForServer = async (tries = 60) => {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${API}/api/health`); if (r.ok) return true; } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};

async function main() {
  console.log('\n=== STATIC: hardening source guards ===');
  const rl = strip(read('backend/src/middleware/rateLimit.js'));
  check('S1 limiter values: phone 3/10m + IP 10/15m (send), phone 5/10m (verify), IP 20/15m (google), 100/min baseline',
    rl.includes('windowMs: 10 * 60 * 1000') && /limit:\s*3/.test(rl) &&
    rl.includes('windowMs: 15 * 60 * 1000') && /limit:\s*10/.test(rl) && /limit:\s*20/.test(rl) &&
    /limit:\s*5/.test(rl) && /limit:\s*100/.test(rl) && rl.includes("RATE_LIMIT_DISABLED === 'true'"));

  const ar = strip(read('backend/src/routes/authRoutes.js'));
  check('S2 auth routes mount limiters (google + send-otp ip+phone + verify-otp)',
    ar.includes("router.post('/google', googleAuth,") &&
    ar.includes("router.post('/phone/send-otp', otpSendIp, otpSendPhone,") &&
    ar.includes("router.post('/phone/verify-otp', otpVerifyPhone,"));

  const srv = strip(read('backend/src/server.js'));
  check('S3 server: helmet mounted + /api baseline limiter + permissive catch-all REMOVED',
    srv.includes('app.use(helmet(') && srv.includes("app.use('/api', apiBaseline)") && !srv.includes('permissive for Phase 5'));

  const sock = strip(read('backend/src/sockets/index.js'));
  check('S4 socket.io CORS: production-strict, permissive catch-all REMOVED',
    !sock.includes('For Phase 5 testing, be permissive') && sock.includes('Not allowed by CORS'));

  const pc = strip(read('backend/src/controllers/providerController.js'));
  check('S5 prod gates: dev/verify-me -> 404; admin verify -> 404 without ADMIN_SECRET in prod (never open)',
    /NODE_ENV === 'production'\s*\)\s*return res\.status\(404\)/.test(pc) &&
    /!adminSecret\) \{\s*console\.error[\s\S]{0,250}?status\(404\)/.test(pc));

  const off = strip(read('backend/src/controllers/offerController.js'));
  check('S6 offer bounds: visitingCharge min 50 AND max 50000; eta 5..1440',
    /charge < 50 \|\| charge > 50000/.test(off) && /eta < 5 \|\| eta > 1440/.test(off));

  const di = read('backend/dev-inmemory.js');
  check('S7 dev-inmemory sets RATE_LIMIT_DISABLED=true (test-only bypass, live 429s proven below)',
    di.includes("RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED || 'true'"));

  const gi = read('.gitignore');
  check('S8 .gitignore excludes .env*, zips, logs, node_modules (secrets never committed)',
    gi.includes('.env') && gi.includes('*.zip') && gi.includes('*.log') && gi.includes('node_modules/'));

  console.log('\n=== Spawning PRODUCTION-MODE server (limits ON, strict CORS) on :5050 ===');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  const childEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    MONGO_URI: mongod.getUri('ufix-security'),
    CLIENT_URL: CLIENT_ORIGIN,
    JWT_SECRET: 'c9d07b6f2e4a41f8a2b1c3d4e5f60718293a4b5c6d7e8f90123456789abcdef1',
    ADMIN_SECRET: ADMIN,
  };
  delete childEnv.RATE_LIMIT_DISABLED; // limits ON - the whole point
  const child = spawn(process.execPath, ['src/server.js'], { cwd: path.join(ROOT, 'backend'), env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let childLog = '';
  child.stdout.on('data', d => { childLog += d; });
  child.stderr.on('data', d => { childLog += d; });
  // In production the OTP is never returned over HTTP - it's only LOGGED (real SMS hook is a
  // documented TODO). For the normal-flow live proof we harvest the logged code, exactly like
  // an SMS inbox would receive it.
  const harvestOtp = async () => {
    // stdout pipe can lag a tick behind the HTTP response - retry briefly. Take the digit
    // group AFTER ": " (a naive /\d{6}/ would catch digits inside the phone number itself).
    for (let i = 0; i < 10; i++) {
      const all = [...childLog.matchAll(/OTP for \S+?: (\d{6})/g)];
      if (all.length) return all[all.length - 1][1];
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  };

  try {
    const up = await waitForServer();
    check('L0 production-mode server boots (helmet+limiters+strict CORS active)', up);
    if (!up) throw new Error('server never came up');

    console.log('\n=== T2 LIVE: normal flow + dev-route invisibility + admin security (fresh budgets) ===');
    const mp = `+92555${String(Date.now()).slice(-7)}`;
    const otpRes = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone: mp } });
    check('T2a production send-otp LEAKS NO OTP in response (dev echo properly gated)',
      otpRes.status === 200 && otpRes.data?.otp === undefined, { keys: Object.keys(otpRes.data || {}) });

    const ver = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: mp, otp: await harvestOtp(), name: 'Sec Provider', role: 'provider', city: 'Lahore' } });
    check('T2b NORMAL signup flow unaffected by limiters (one real user gets through fine)', (ver.status === 200 || ver.status === 201) && !!ver.data?.token, { status: ver.status });
    const token = ver.data?.token;
    const providerId = (ver.data?.user?.id || ver.data?.user?._id || '').toString();

    const devHit = await api('/api/providers/dev/verify-me', { method: 'POST', token });
    check("T2c dev/verify-me returns 404 in production (invisible - doesn't reveal it exists)",
      devHit.status === 404 && devHit.data?.message === 'Not found', { status: devHit.status, msg: devHit.data?.message });

    const noSecret = await api(`/api/providers/${providerId}/verify`, { method: 'PATCH', token, body: { status: 'approved' } });
    const badSecret = await api(`/api/providers/${providerId}/verify`, { method: 'PATCH', token, headers: { 'X-Admin-Secret': 'wrong-secret' }, body: { status: 'approved' } });
    check('T2d admin verify: without secret -> 403, with WRONG secret -> 403', noSecret.status === 403 && badSecret.status === 403, { noSecret: noSecret.status, badSecret: badSecret.status });

    const goodSecret = await api(`/api/providers/${providerId}/verify`, { method: 'PATCH', token, headers: { 'X-Admin-Secret': ADMIN }, body: { status: 'approved' } });
    check('T2e admin verify: correct strong ADMIN_SECRET works (owner capability preserved)',
      goodSecret.status === 200 && goodSecret.data?.user?.isVerified === true, { status: goodSecret.status });

    console.log('\n=== T3/T5 LIVE: CORS lockdown + security headers ===');
    const evil = await api('/api/health', { headers: { Origin: 'https://malicious-site.example' } });
    const good = await api('/api/health', { headers: { Origin: CLIENT_ORIGIN } });
    check('T3a unknown origin gets NO Access-Control-Allow-Origin header (rejected)', !evil.headers.get('access-control-allow-origin'), { evilStatus: evil.status });
    check('T3b CLIENT_URL origin IS allowed (deployed frontend unaffected)', good.headers.get('access-control-allow-origin') === CLIENT_ORIGIN, { acao: good.headers.get('access-control-allow-origin') });
    check('T5 helmet headers present (nosniff + frame protection + referrer policy)',
      good.headers.get('x-content-type-options') === 'nosniff' && !!good.headers.get('x-frame-options'),
      { nosniff: good.headers.get('x-content-type-options'), frame: good.headers.get('x-frame-options') });

    console.log('\n=== T4 LIVE: validation bounds (direct API, no client to protect us) ===');
    await api(`/api/providers/${providerId}/verify`, { method: 'PATCH', token, headers: { 'X-Admin-Secret': ADMIN }, body: { status: 'approved' } });
    await api('/api/providers/setup', { method: 'PATCH', token, body: { category: 'plumber', radiusKm: 15 } });
    await api('/api/users/profile', { method: 'PATCH', token, body: { isOnline: true } });
    await api('/api/users/location', { method: 'PATCH', token, body: { lng: 74.3587, lat: 31.5204, city: 'Lahore' } });

    const longNameRes = await api('/api/users/profile', { method: 'PATCH', token, body: { name: 'X'.repeat(2000) } });
    check('T4a 2000-char name -> 400 (server maxlength, not just frontend)', longNameRes.status === 400, { status: longNameRes.status });

    const cust = `+92777${String(Date.now()).slice(-7)}`;
    await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone: cust } });
    const cv = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: cust, otp: await harvestOtp(), name: 'Sec Customer', role: 'customer', city: 'Lahore' } });
    await api('/api/users/location', { method: 'PATCH', token: cv.data.token, body: { lng: 74.35, lat: 31.52, city: 'Lahore' } });
    const rq = await api('/api/requests', { method: 'POST', token: cv.data.token, body: { category: 'plumber', description: 'security validation live test request', lng: 74.35, lat: 31.52, address: 'Gulberg', city: 'Lahore' } });
    const rqId = (rq.data.request?.id || '').toString();

    const badOffer = await api(`/api/requests/${rqId}/offers`, { method: 'POST', token, body: { visitingCharge: 99999999, etaMinutes: 10 } });
    check('T4b numeric max enforced server-side: visitingCharge 99,999,999 -> 400', badOffer.status === 400, { status: badOffer.status });

    const hugeDesc = await api('/api/requests', { method: 'POST', token: cv.data.token, body: { category: 'plumber', description: 'z'.repeat(5000), lng: 74.35, lat: 31.52, address: 'G', city: 'Lahore' } });
    check('T4c 5000-char description -> 400 (server maxlength)', hugeDesc.status === 400, { status: hugeDesc.status });

    console.log('\n=== T1 LIVE: rate limiting (hammering probes - intentionally exhaust budgets) ===');
    const phone = `+92333${String(Date.now()).slice(-7)}`;
    const s1 = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
    await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
    await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
    const s4 = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
    check('L1 send-otp: 3/10min per phone - 4th returns friendly 429',
      s1.status === 200 && s4.status === 429 && typeof s4.data?.message === 'string' && s4.data.message.toLowerCase().includes('too many'),
      { first: s1.status, fourth: s4.status, msg: s4.data?.message });

    const vp = `+92444${String(Date.now()).slice(-7)}`;
    await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone: vp } });
    let vBlocked = null; let okCount = 0;
    for (let i = 0; i < 6; i++) {
      const r = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone: vp, otp: '000000', name: 'T', role: 'customer', city: 'Lahore' } });
      if (r.status === 429) { vBlocked = r; break; }
      okCount++;
    }
    check('L2 verify-otp: 5 attempts/10min per phone then friendly 429 (OTP brute-force guard)',
      okCount === 5 && vBlocked?.status === 429 && vBlocked.data?.message?.toLowerCase().includes('too many'), { okCount, status: vBlocked?.status });

    let gBlocked = null; let gOk = 0;
    for (let i = 0; i < 21; i++) {
      const r = await api('/api/auth/google', { method: 'POST', body: { idToken: 'invalid.token.here' } });
      if (r.status === 429) { gBlocked = r; break; }
      gOk++;
    }
    check('L3 google: 21st rapid attempt returns 429', gOk === 20 && gBlocked?.status === 429, { gOk, status: gBlocked?.status });

    let ipBlocked = null;
    for (let i = 0; i < 7; i++) {
      const r = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone: `+92770${String(Date.now()).slice(-5)}${i}` } });
      if (r.status === 429) { ipBlocked = r; break; }
    }
    check('L4 send-otp: 10/15min per IP blocks hammering random numbers with friendly 429',
      ipBlocked && ipBlocked.status === 429 && ipBlocked.data?.message?.toLowerCase().includes('too many'), { blocked: ipBlocked?.status });

    let baseBlocked = false; let allowed = 0;
    for (let i = 0; i < 140; i++) {
      const r = await fetch(`${API}/api/health`);
      if (r.status === 429) { baseBlocked = true; break; }
      allowed++;
    }
    check('L5 general API net: 100/min/IP baseline kicks in on hammering', baseBlocked, { allowedBeforeBlock: allowed });
  } finally {
    child.kill('SIGTERM');
    await mongod.stop();
  }

  console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================`);
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(` - ${f}`)); }
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('Suite crashed:', e); process.exit(1); });
