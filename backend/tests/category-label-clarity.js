/**
 * Category-Label Clarity — "request type" vs "person's specialty" (2026-08-29)
 *
 * UI CLARITY FIX (no backend change): a customer's posted request showed its category using
 * the SAME visual language as a provider's specialty - a colored word directly beside the
 * customer's name ("Ali · Plumber") and a trade-icon glued onto their avatar. On provider
 * surfaces this read as "the CUSTOMER is a plumber" - inverted meaning.
 *
 * New language split (both preserved, now distinct):
 *   PERSON SPECIALTY  (unchanged): CategoryIcon colored gradient/soft tile + word in
 *     meta.color -> ONLY used attached to providers (their profile, their cards, rating
 *     screen where the peer IS the provider, customer-side active-job header).
 *   REQUEST TYPE (new): ServiceNeededBadge - NEUTRAL outline pill + verb phrase
 *     "Looking for: {label}", placed with the request details, never on the customer's name.
 *
 * Applied at: provider RequestCard (avatar overlay + under-name word removed, badge moved
 * to the description block), provider MyOfferCard, customer Offers-header request block,
 * active-job peer header (conditional on role), order-history JobCard.
 * Provider-side apples unchanged: provider profile specialty chip + rating screen
 * "Plumber · completed" for providers.
 *
 * Notifications were audited: all bodies read "your {category} request" / "a {category}
 * request" - already request-type phrasing, so no change needed (asserted below).
 *
 * Run: node tests/category-label-clarity.js
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 5057;
const API = `http://localhost:${PORT}`;

let passed = 0; let failed = 0; const failures = [];
function check(name, cond, diag) {
  if (cond) { passed++; console.log(`  \u2705 ${name}`); }
  else { failed++; failures.push(name); console.log(`  \u274c ${name}${diag !== undefined ? ' :: ' + JSON.stringify(diag) : ''}`); }
}

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

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

/** Slice from `function Name` to the NEXT top-level `function ` declaration (window view;
    avoids brace-counting issues with destructured props). */
function fnBody(src, name) {
  const i = src.indexOf(`function ${name}`);
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j > 0 ? j : src.length);
}

async function main() {
  console.log('\n=== STATIC: request-type vs specialty language ===');
  const ui = read('frontend/src/components/ui.tsx');
  check('S1 ServiceNeededBadge exists: neutral outline pill + explicit "Looking for:" verb phrase',
    ui.includes('export function ServiceNeededBadge') && ui.includes('Looking for:') &&
    /ServiceNeededBadge[\s\S]*?rounded-full border border-ink-200 bg-ink-50/.test(strip(ui)) &&
    !/ServiceNeededBadge[\s\S]{0,400}linear-gradient/.test(strip(ui)));

  const prov = strip(read('frontend/src/screens/provider.tsx'));
  const reqCard = fnBody(prov, 'RequestCard');
  check('S2 Provider RequestCard: NO trade icon on the customer avatar anymore',
    !reqCard.includes('absolute -bottom-1 -right-1'));
  check('S3 Provider RequestCard: NO category word beside the customer name; badge sits with the request description',
    !/font-semibold" style=\{\{ color: meta\.color \}\}/.test(reqCard) &&
    reqCard.includes('<ServiceNeededBadge category={req.category} />'),
    { hasBadge: reqCard.includes('ServiceNeededBadge') });

  const myOffer = fnBody(prov, 'MyOfferCard');
  check('S4 Provider MyOffers: colored specialty word replaced by neutral request badge',
    !/text-\[10px\] font-medium" style=\{\{ color: meta\.color \}\}/.test(myOffer) && myOffer.includes('ServiceNeededBadge'));

  const jobs = strip(read('frontend/src/screens/jobs.tsx'));
  check('S5 Active-job header: peer=customer gets request badge; peer=provider KEEPS specialty chip (role-conditional)',
    jobs.includes('isCustomer ? (') &&
    /isCustomer \? \([\s\S]{0,300}CategoryIcon[\s\S]{0,300}\) : \([\s\S]{0,150}ServiceNeededBadge/.test(jobs));
  const jobCard = fnBody(jobs, 'JobCard');
  check('S6 Order-history JobCard: request badge replaces colored category word',
    jobCard.includes('ServiceNeededBadge') && !/style=\{\{ color: meta\.color \}\}/.test(jobCard));

  const cust = strip(read('frontend/src/screens/customer.tsx'));
  check('S7 Customer offers header: category removed from address line; badge added next to description',
    !cust.includes('font-semibold text-brand-700">{meta.label}') && cust.includes('<ServiceNeededBadge category={request.category} />'));

  const prof = read('frontend/src/screens/profile.tsx');
  check('S8 Provider specialty language UNTOUCHED: profile keeps CategoryIcon tile + meta.label/tagline rows',
    prof.includes('CategoryIcon') && prof.includes('{meta.label}') && prof.includes('{meta.tagline}'));

  check('S9 Rating screen UNTOUCHED: provider still shows "{Category} · completed" (correct specialty semantics)',
    jobs.includes('`${categoryById(activeJob.category).label} · completed`') &&
    jobs.includes('`Customer · completed`'));

  const reqC = read('backend/src/controllers/requestController.js');
  const offC = read('backend/src/controllers/offerController.js');
  const notifBodies = [...reqC.matchAll(/body: `([^`]+)`/g), ...offC.matchAll(/body: `([^`]+)`/g)].map(m => m[1]);
  const bad = notifBodies.filter(b => /your (plumber|electrician|mechanic)( |$)/.test(b) && !/request/.test(b));
  check('S10 Notifications audit: every category mention reads as the REQUEST type (no customer-as-tradesperson wording)',
    bad.length === 0 && notifBodies.length > 0, { checked: notifBodies.length, bad });

  console.log('\n=== LIVE: functional flow intact (display-only change) ===');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  const URI = mongod.getUri('ufix-category-label');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(ROOT, 'backend'),
    env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), MONGO_URI: URI, CLIENT_URL: 'http://localhost:5173', JWT_SECRET: 'cl-' + 'a'.repeat(64), RATE_LIMIT_DISABLED: 'true' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(`${API}/api/health`); up = r.ok; } catch { /* retry */ }
      if (!up) await new Promise(r => setTimeout(r, 500));
    }
    check('L0 dev server up', up);
    if (!up) throw new Error('server down');

    const ph = (s) => `+92833${s.replace(/\D/g, '').slice(-7)}`;
    const mk = async (phone, name, role, city, category, defCharge) => {
      const so = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } });
      const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: so.data.otp, name, role, city } });
      if (role === 'provider') {
        await api('/api/providers/setup', { method: 'PATCH', token: v.data.token, body: { category, radiusKm: 25, yearsExperience: 5, defaultVisitingCharge: defCharge } });
        await api('/api/users/location', { method: 'PATCH', token: v.data.token, body: { lng: 74.3501, lat: 31.5245 } });
        await api('/api/users/profile', { method: 'PATCH', token: v.data.token, body: { isOnline: true } });
      }
      return v.data.token;
    };
    const custT = await mk(ph('1000001'), 'Ali Customer', 'customer', 'Lahore', null, null);
    const provT = await mk(ph('1000002'), 'Bilal Ustaad', 'provider', 'Lahore', 'plumber', 500);

    const created = await api('/api/requests', { method: 'POST', token: custT, body: { category: 'plumber', description: 'Leaking pipe in kitchen', lng: 74.3587, lat: 31.5204, address: 'DHA Phase 5', city: 'Lahore' } });
    check('L1 request posts fine (category carries in data - only DISPLAY changed)', created.status === 201 && created.data?.request?.category === 'plumber', { status: created.status });

    const nearby = await api('/api/requests/nearby', { token: provT });
    const found = (nearby.data?.requests || []).find(r => r.category === 'plumber');
    check('L2 provider nearby list delivers the request with customerName + category (data feeds the fixed card)',
      !!found && !!found.customer?.name, { count: (nearby.data?.requests || []).length });

    const my = await api('/api/requests/my', { token: custT });
    check('L3 customer own-request view data intact', my.status === 200 && (my.data?.requests || []).length >= 1);
  } finally {
    child.kill('SIGTERM');
    await mongod.stop();
  }

  console.log('\n=== PROD-BUILD: new wording ships; specialty pattern intact ===');
  try {
    execSync('npm run build', { cwd: path.join(ROOT, 'frontend'), stdio: 'pipe' });
    const files = [];
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const fp = path.join(d, f); const st = fs.statSync(fp); if (st.isDirectory()) walk(fp); else files.push(fp); } };
    walk(path.join(ROOT, 'frontend/dist'));
    const bundle = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    check('L4 production bundle ships "Looking for:" request wording', bundle.includes('Looking for:'));
    check('L5 production bundle still contains the specialty tooltip distinction (device-free static proof)',
      bundle.includes('Service type requested by the customer'));
  } catch (e) {
    check('L4/L5 production build failed', false, String(e.message).slice(0, 160));
  }

  console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================`);
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(` - ${f}`)); }
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('Suite crashed:', e); process.exit(1); });
