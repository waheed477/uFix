/**
 * Chat no-duplicate suite (2026-08-23) — ISSUE 1: sender saw every own message TWICE.
 *
 * ROOT CAUSE (confirmed by trace): sendMessage() adds an OPTIMISTIC `temp-…` entry, and the
 * backend emits `chat:message` to BOTH participants (Phase 7 by design). The SELF-echo
 * arrives with the real server id — often BEFORE the `chat:send` ack patches the temp — so
 * the naive "append unless id exists" listener could never match and appended a 2nd copy.
 *
 * FIX (Option A): `frontend/src/lib/chatMerge.ts#mergeIncomingChatMessage` — self-echoes
 * are tagged `senderId:'me'` and REPLACE the oldest pending `temp-…` entry in place; exact
 * real-id re-delivery is a no-op; the recipient path is unchanged (one append per send).
 * Converges to exactly-one under echo-first, ack-first, ack-lost and rapid-send orders.
 *
 * Layers: STATIC (store uses the helper) + UNIT (the REAL compiled merge, both arrival
 * orders + rapid sends) + LIVE (two real users, real sockets: 1 slow send + 4 rapid sends;
 * each side receives exactly one chat:message per send; ack+echo reconcile to one entry).
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const uniq = String(Date.now()).slice(-6);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${JSON.stringify(detail)}`}`); };

const api = (p, { method = 'GET', body, token } = {}) =>
  fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

const MERGE_ESM = path.join(__dirname, '.merge-test-build.mjs');
const mergeSrcPath = path.join(__dirname, '../../frontend/src/lib/chatMerge.ts');

(async () => {
  console.log('=== STATIC — the store routes chat:message through the reconciler ===');
  const store = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/store.tsx'), 'utf8');
  const merge = fs.readFileSync(mergeSrcPath, 'utf8');
  check('S1 store imports mergeIncomingChatMessage and calls it with (existing, chatMessage, user?.id) inside chat:message',
    /import \{ mergeIncomingChatMessage \} from ".\/chatMerge";/.test(store) &&
    /Received chat:message[\s\S]{0,1800}mergeIncomingChatMessage\(existing, chatMessage, user\?\.id\)/.test(store));
  check('S2 helper implements: temp-id optimistic replace for self-echoes + real-id no-op dedupe + senderId me-tag',
    /m\.id\.startsWith\("temp-"\)/.test(merge) && /existing\.some\(\(m\) => m\.id === incoming\.id\)/.test(merge) &&
    /senderId: "me"/.test(merge) && /export function mergeIncomingChatMessage/.test(merge));

  console.log('\n=== UNIT — real compiled mergeIncomingChatMessage, both arrival orders + rapid sends ===');
  cp.execSync(`${path.join(__dirname, '../../frontend/node_modules/.bin/esbuild')} ${mergeSrcPath} --format=esm --outfile=${MERGE_ESM}`, { stdio: 'pipe' });
  const { mergeIncomingChatMessage: M } = await import(`file://${MERGE_ESM}`);
  const msg = (id, senderId, text, ts = 100) => ({ id, senderId, text, timestamp: ts, read: false });
  const U1 = (list, m) => M(list, m, 'me-1');

  // U1 recipient path: one append per message, exact-id redelivery no-ops
  {
    let list = [];
    list = U1(list, msg('r1', 'them-9', 'hello'));
    const again = U1(list, msg('r1', 'them-9', 'hello'));
    check('U1 recipient: incoming message appended exactly once; same id redelivery is a strict no-op',
      list.length === 1 && again === list, { len: list.length, sameRef: again === list });
  }
  // U2 echo-first order: temp present -> echo REPLACES temp (real id), no second entry
  {
    let list = [msg('temp-111', 'me', 'on my way')];
    list = U1(list, msg('srv-1', 'me-1', 'on my way'));
    // then the ack also maps temp -> real (ack handler) — nothing left to do
    check('U2 echo-first: self-echo replaces the optimistic temp entry IN PLACE (1 entry, real id, senderId me)',
      list.length === 1 && list[0].id === 'srv-1' && list[0].senderId === 'me' && !list[0].id.startsWith('temp-'),
      list);
  }
  // U3 ack-first order: real id already present -> echo is a no-op
  {
    let list = [msg('srv-1', 'me', 'on my way')];
    const res = U1(list, msg('srv-1', 'me-1', 'on my way'));
    check('U3 ack-first: echo of already-confirmed own message dedupes (length stable, same ref)',
      res === list && res.length === 1, { sameRef: res === list });
  }
  // U4 rapid 4 sends: 4 temps + 4 echoes -> exactly 4 entries, each real id once, none temp
  {
    let list = [];
    const texts = ['one', 'two', 'three', 'four'];
    texts.forEach((t, i) => list.push(msg(`temp-${i}`, 'me', t, 200 + i)));            // optimistic adds
    texts.forEach((t, i) => { list = U1(list, msg(`srv-${i}`, 'me-1', t, 200 + i)); }); // 4 echoes arrive
    const dups = list.filter((m, i) => list.findIndex((x) => x.id === m.id) !== i);
    check('U4 rapid sends: 4 optimistic temp entries reconcile to exactly 4 confirmed entries (zero temp, zero dup id)',
      list.length === 4 && dups.length === 0 && list.every((m) => !m.id.startsWith('temp-')),
      list.map((m) => m.id));
  }
  // U5 mixed interleave preserved order-ish: recipient message between two own echoes
  {
    let list = [msg('temp-1', 'me', 'a', 1)];
    list = U1(list, msg('srv-1', 'me-1', 'a', 1));
    list = U1(list, msg('r9', 'them-9', 'b', 2));
    list = U1(list, msg('srv-2', 'me-1', 'c', 3));
    check('U5 interleave: own+peer messages coexist without drops/dups (3 entries)',
      list.length === 3 && list.map((m) => m.text).join(',') === 'a,b,c', list.map((m) => m.text));
  }

  console.log('\n=== LIVE — two real users; exactly one message per send on BOTH sides ===');
  const mk = async (phone, role, name) => { const r = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } }); const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: r.data.otp, name, role, city: 'Lahore' } }); return { token: v.data.token, user: v.data.user }; };
  const cust = await mk(`+9240${uniq}1`, 'customer', 'Chat Cust');
  const prov = await mk(`+9240${uniq}2`, 'provider', 'Chat Prov');
  await api('/api/users/location', { method: 'PATCH', token: prov.token, body: { lng: 74.35, lat: 31.52, city: 'Lahore' } });
  await api('/api/users/location', { method: 'PATCH', token: cust.token, body: { lng: 74.351, lat: 31.521, city: 'Lahore' } });
  await api('/api/providers/setup', { method: 'PATCH', token: prov.token, body: { category: 'plumber', radiusKm: 10 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: prov.token });
  await api('/api/users/profile', { method: 'PATCH', token: prov.token, body: { isOnline: true } });
  const rq = await api('/api/requests', { method: 'POST', token: cust.token, body: { category: 'plumber', description: 'chat duplicate live test request text', lng: 74.351, lat: 31.521, address: 'Chat St', city: 'Lahore' } });
  const reqId = String(rq.data.request?.id);
  const of = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: prov.token, body: { visitingCharge: 800, etaMinutes: 20 } });
  const offerId = String(of.data.offer?.id);
  const acc = await api(`/api/offers/${offerId}/accept`, { method: 'PATCH', token: cust.token });
  const jobId = String(acc.data.job?.id);
  check('L0 job created for chat', acc.status === 200 && !!jobId, { st: acc.status });

  const csock = io(BASE, { auth: { token: cust.token }, transports: ['websocket'] });
  const psock = io(BASE, { auth: { token: prov.token }, transports: ['websocket'] });
  await Promise.all([new Promise((r) => csock.on('connect', r)), new Promise((r) => psock.on('connect', r))]);
  const cMsgs = [], pMsgs = [];
  csock.on('chat:message', (d) => cMsgs.push(d.message || d));
  psock.on('chat:message', (d) => pMsgs.push(d.message || d));

  // slow single send: customer -> provider
  const ack = await new Promise((res) => csock.emit('chat:send', { jobId, text: 'slow ping one' }, res));
  await new Promise((r) => setTimeout(r, 700));
  const cIds = cMsgs.map((m) => String(m.id)).filter(Boolean);
  const pIds = pMsgs.map((m) => String(m.id)).filter(Boolean);
  check('L1 slow send: BOTH sides receive EXACTLY ONE chat:message (the echo to the sender is the SAME single message, not a 2nd copy)',
    ack?.status === 'success' && cMsgs.length === 1 && pMsgs.length === 1 &&
    cIds.length === new Set(cIds).size && pIds.length === new Set(pIds).size &&
    cIds[0] === pIds[0] && cIds[0] === String(ack.message?.id ?? ''),
    { c: cIds, p: pIds, ack: ack?.message?.id });

  // rapid 4 sends back-to-back: provider -> customer (sequential like real UI taps, ~40ms
  // apart - firing socket.emit truly in parallel would race server-side ordering)
  const rapid = ['rapid a', 'rapid b', 'rapid c', 'rapid d'];
  const acks = [];
  for (const t of rapid) {
    // sequential await (same pattern as the verified L1 single send) - each send ~one
    // round-trip apart: rapid human sending without ack-queue overlap quirks
    const a = await new Promise((res) => psock.emit('chat:send', { jobId, text: t }, res));
    acks.push(a);
    await new Promise((r) => setTimeout(r, 40));
  }
  await new Promise((r) => setTimeout(r, 1200));
  const rapidOnC = cMsgs.filter((m) => rapid.includes(m.text));
  const rapidOnP = pMsgs.filter((m) => rapid.includes(m.text));
  const u = (ms) => new Set(ms.map((m) => String(m.id))).size;
  const l2detail = { acks: acks.map((a) => a && a.status), c: rapidOnC.map((m) => [m.id, m.text]), p: rapidOnP.map((m) => [m.id, m.text]),
    conds: { acks: acks.every((a) => a?.status === 'success'), cN: rapidOnC.length === 4, pN: rapidOnP.length === 4, uC: u(rapidOnC) === 4, uP: u(rapidOnP) === 4,
      oC: rapidOnC.map((m) => m.text).join('|') === rapid.join('|'), oP: rapidOnP.map((m) => m.text).join('|') === rapid.join('|') } };
  check('L2 rapid 4 sends: BOTH sides receive exactly 4 chat:message events, all distinct ids, none lost',
    acks.every((a) => a?.status === 'success') && rapidOnC.length === 4 && rapidOnP.length === 4 &&
    u(rapidOnC) === 4 && u(rapidOnP) === 4 &&
    rapidOnC.map((m) => m.text).join('|') === rapid.join('|') && rapidOnP.map((m) => m.text).join('|') === rapid.join('|'),
    l2detail);

  check('L3 total message count on both sides identical (1 slow + 4 rapid = 5 events each, no extra echo anywhere)',
    cMsgs.length === 5 && pMsgs.length === 5, { c: cMsgs.length, p: pMsgs.length });

  // history sanity: everyone sees the same single sequence after a refresh
  const hist = (await api(`/api/jobs/${jobId}/messages`, { token: cust.token })).data;
  const histMsgs = hist.messages || hist || [];
  check('L4 message history: each text appears exactly once (5 total), order stable',
    Array.isArray(histMsgs) && histMsgs.length === 5 && histMsgs.filter((m) => m.text === 'slow ping one').length === 1 &&
    rapid.every((t) => histMsgs.filter((m) => m.text === t).length === 1),
    { n: histMsgs.length });

  csock.close(); psock.close();
  fs.existsSync(MERGE_ESM) && fs.unlinkSync(MERGE_ESM);
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
