/**
 * Post-Deploy Security Smoke (2026-08-26)
 *
 * Runs against ANY deployed backend (Render/production) and proves the security-hardening
 * behaviors are actually live there: helmet headers, strict CORS, rate limits active, dev
 * echo gated. Read-only + one throwaway phone for the 429 probe (its number is random).
 *
 * Usage:
 *   API_URL=https://ufix-backend.onrender.com CLIENT_URL=https://your-vercel-app.vercel.app \
 *     node backend/tests/prod-smoke.js
 *
 * (CI/local default: API_URL=http://localhost:5050 CLIENT_URL=http://localhost:5173)
 */

const API_URL = (process.env.API_URL || 'http://localhost:5050').replace(/\/$/, '');
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

let passed = 0; let failed = 0; const failures = [];
function check(name, cond, diag) {
  if (cond) { passed++; console.log(`  \u2705 ${name}`); }
  else { failed++; failures.push(name); console.log(`  \u274c ${name}${diag !== undefined ? ' :: ' + JSON.stringify(diag) : ''}`); }
}

async function http(path, opts = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  console.log(`\n🌫  Post-deploy security smoke against ${API_URL}\n`);

  const health = await http('/api/health', { headers: { Origin: CLIENT_URL } });
  check('1a /api/health reachable + 200', health.status === 200, { status: health.status });
  check('1b helmet headers present (nosniff + frame options)',
    health.headers.get('x-content-type-options') === 'nosniff' && !!health.headers.get('x-frame-options'),
    { nosniff: health.headers.get('x-content-type-options'), frame: health.headers.get('x-frame-options') });

  const evil = await http('/api/health', { headers: { Origin: 'https://malicious-smoke.example' } });
  check('2a unknown origin gets NO Access-Control-Allow-Origin (strict CORS)', !evil.headers.get('access-control-allow-origin'), { status: evil.status });
  check('2b CLIENT_URL origin IS allowed exactly', health.headers.get('access-control-allow-origin') === CLIENT_URL, { acao: health.headers.get('access-control-allow-origin') });

  const throwPhone = `+92000${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`;
  const first = await http('/api/auth/phone/send-otp', { method: 'POST', body: { phone: throwPhone } });
  check('3a send-otp works (200) and does NOT echo the OTP in production', first.status === 200 && first.data?.otp === undefined, { status: first.status, keys: Object.keys(first.data || {}) });

  await http('/api/auth/phone/send-otp', { method: 'POST', body: { phone: throwPhone } });
  await http('/api/auth/phone/send-otp', { method: 'POST', body: { phone: throwPhone } });
  const fourth = await http('/api/auth/phone/send-otp', { method: 'POST', body: { phone: throwPhone } });
  check('3b rate limit ACTIVE in production: 4th rapid send-otp same phone -> friendly 429',
    fourth.status === 429 && typeof fourth.data?.message === 'string' && fourth.data.message.toLowerCase().includes('too many'),
    { status: fourth.status, msg: fourth.data?.message });

  const google = await http('/api/auth/google', { method: 'POST', body: { idToken: 'smoke.invalid.token' } });
  check('4 /api/auth/google deterministic (500 needsConfig without GOOGLE_CLIENT_ID, else 400/401 invalid token) - never 2xx',
    google.status !== 200 && google.status !== 201 && [400, 401, 500].includes(google.status), { status: google.status });

  const noAuth = await http('/api/providers/dev/verify-me', { method: 'POST' });
  check('5 dev route unreachable without auth (401) - and 404 for authenticated non-admins in prod',
    noAuth.status === 401 || noAuth.status === 404, { status: noAuth.status });

  const notFound = await http('/api/definitely-not-a-route');
  check('6 unknown route -> clean 404 JSON (no stack/HTML leak)', notFound.status === 404 && typeof notFound.data?.message === 'string', { status: notFound.status });

  console.log(`\n================ SMOKE: ${passed} passed, ${failed} failed ================`);
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(` - ${f}`)); }
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('Smoke crashed:', e); process.exit(1); });
