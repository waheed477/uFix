/**
 * Sound System suite (2026-08-23 REDESIGN) — multiple candidate tones, dedup, anti-stacking.
 * Previous single-guess tones were rejected; each category now has candidate A/B functions.
 * Wired defaults (2026-08-23): general=playNotificationB (pop - UNTOUCHED, liked),
 * new-request=playNewRequestA (knock), booking=playBookingConfirmedA (cha-ching).
 * Swap = one line in lib/sound.ts delegates.
 *
 * THREE layers, no browser needed:
 *  STATIC (S1-S6): wiring guards — correct function at every call site, exclusions intact,
 *                  no legacy notifyAlert/playAlert outside lib/sound.ts, no audio files.
 *  UNIT (U1-U8): the REAL compiled sound.ts executed in node with a mock AudioContext —
 *                scheduled oscillators/gains are captured, so we assert frequencies,
 *                durations, note counts, per-id dedup and the global anti-stacking gap.
 *  LIVE (L1-L4): real two-user socket flow on the running backend; REAL captured payloads
 *                (offer:accepted accepted offer id, notification:new offer_accepted, chat
 *                new_message...) are fed through the compiled module exactly as store.tsx
 *                would — proving only the intended single tone would sound per event.
 *
 * Audio itself cannot be heard in node; this validates everything up to the speaker.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { io } = require('../node_modules/socket.io-client');

const BASE = 'http://localhost:5000';
const uniq = String(Date.now()).slice(-6);
let pass = 0, fail = 0, skipped = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${JSON.stringify(detail)}`}`); };
const skip = (name, why) => { skipped++; console.log(`  SKIP  ${name}  (${why})`); };

const api = (p, { method = 'GET', body, token, headers = {} } = {}) =>
  fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

/* ---------- build the real frontend module to ESM + mock browser audio ---------- */
const SOUND_ESM = path.join(__dirname, '.sound-test-build.mjs');
const soundSrcPath = path.join(__dirname, '../../frontend/src/lib/sound.ts');

// ---- mock Web Audio surfaces (captured by the compiled module) ----------------------
// Precise note/gain capture is installed in the UNIT section (AC.prototype redefined there);
// these globals only back vibration + a fallback so early module evaluation never crashes.
let vibes = [];   // vibrate patterns

global.window = {
  AudioContext: class {
    constructor() { this.state = 'running'; this.currentTime = 1000; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, start() {}, stop() {},
      };
    }
    createGain() {
      return {
        connect() {},
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      };
    }
  },
};
global.navigator = { vibrate: (p) => vibes.push(p) };

async function waitFor(fn, timeout = 8000, step = 150) {
  const t0 = Date.now();
  for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t0 > timeout) return null; await new Promise((r2) => setTimeout(r2, step)); }
}

(async () => {
  console.log('=== STATIC wiring guards ===');
  const soundSrc = fs.readFileSync(soundSrcPath, 'utf8');
  const storeSrc = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/store.tsx'), 'utf8');
  const providerSrc = fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/provider.tsx'), 'utf8');

  check('S1 sound.ts exports the three named tones + reset hook, no external audio files (no fetch/url/mp3/wav)',
    /export function playNotificationTone/.test(soundSrc) && /export function playNewRequestTone/.test(soundSrc) &&
    /export function playBookingConfirmedTone/.test(soundSrc) && /export function resetSoundGuardsForTests/.test(soundSrc) &&
    !/\.mp3|\.wav|\.ogg|new Audio\(|fetch\(/.test(soundSrc));
  check('S2 booking tone wired at BOTH accept moments: offer:accepted socket handler AND acceptOffer success',
    /Received offer:accepted[\s\S]{0,900}playBookingConfirmedTone/.test(storeSrc) &&
    /Booking confirmation tone at the exact accept-success moment[\s\S]{0,220}playBookingConfirmedTone\(String\(offer\.id/.test(storeSrc));
  check('S3 notification:new plays ONE standardized ping and EXCLUDES offer_accepted + request_new (dedicated tones own them)',
    /ntype !== 'offer_accepted' && ntype !== 'request_new'[\s\S]{0,160}playNotificationTone/.test(storeSrc));
  check('S4 request:new socket + provider poll both call playNewRequestTone WITH an id (cross-source dedup)',
    /Received request:new|BUG 2 FIX/.test(storeSrc) && /playNewRequestTone\(String\(backendRequest/.test(storeSrc) &&
    /fresh\.forEach\(\(id\) => playNewRequestTone\(id\)\)/.test(providerSrc));
  check('S5 no audible legacy chirps left at wired sites (decline/completed are vibration-only; ping via persisted notification)',
    !/notifyAlert\(/.test(storeSrc + providerSrc) && !/playAlert\(/.test(storeSrc + providerSrc));
  check('S6 anti-stack gap + per-id claim guards present in sound.ts (MIN_TONE_GAP_MS + claimAudible TTL keys)',
    /MIN_TONE_GAP_MS/.test(soundSrc) && /claimAudible\(/.test(soundSrc) && /MIN_TONE_GAP_MS\s*=\s*\d{3,}/.test(soundSrc));
  check('S7 all six candidates exported; NEW delegates (knock + cha-ching defaults); notification candidates UNTOUCHED; preview panel lists the new options',
    /export function playNotificationA/.test(soundSrc) && /export function playNotificationB/.test(soundSrc) &&
    /export function playNewRequestA/.test(soundSrc) && /export function playNewRequestB/.test(soundSrc) &&
    /export function playBookingConfirmedA/.test(soundSrc) && /export function playBookingConfirmedB/.test(soundSrc) &&
    /WIRED DEFAULT \(candidate A - knock\)/.test(soundSrc) && /WIRED DEFAULT \(candidate A - cha-ching\)/.test(soundSrc) &&
    /playNotificationB\(\); \/\/ <-- WIRED DEFAULT \(candidate B\)/.test(soundSrc) &&
    (() => { const panel = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/SoundPreview.tsx'), 'utf8');
      return /Knock|knock/.test(panel) && /Cha-ching|cha-ching/i.test(panel) && /Marimba|marimba/.test(panel) && /vibrato|shimmer/i.test(panel) &&
        /REPLACED 2026-08-23/.test(panel); })() &&
    /import\.meta\.env\.DEV/.test(fs.readFileSync(path.join(__dirname, '../../frontend/src/screens/profile.tsx'), 'utf8')));

  console.log('\n=== UNIT — real compiled sound.ts under mock AudioContext ===');
  cp.execSync(`${path.join(__dirname, '../../frontend/node_modules/.bin/esbuild')} ${soundSrcPath} --format=esm --outfile=${SOUND_ESM}`, { stdio: 'pipe' });
  const sound = await import(`file://${SOUND_ESM}`);

  // instrument: capture scheduled notes precisely (freq at setValueAtTime, start/stop offsets)
  const notes = [];
  const gains = [];
  {
    const AC = global.window.AudioContext;
    AC.prototype.createOscillator = function () {
      const self = this; const rec = { freq: null, start: 0, stop: 0 };
      return {
        type: 'sine',
        frequency: { setValueAtTime(f, t) { rec.freq = f; }, exponentialRampToValueAtTime(f, t) { rec.sweepTo = f; rec.sweepAt = t - self.currentTime; } },
        connect() {},
        start(t) { rec.start = t - self.currentTime; },
        stop(t) { rec.stop = t - self.currentTime; notes.push(rec); },
      };
    };
    AC.prototype.createGain = function () {
      const self = this;
      return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime(v, t) { gains.push({ peak: v, at: t - self.currentTime }); }, exponentialRampToValueAtTime(v, t) { gains.push({ expTo: v, at: t - self.currentTime }); } } };
    };
  }

  // U1 notification ping: DEFAULT = candidate B pop — 1 bubble note, quick upward pitch bend
  sound.resetSoundGuardsForTests(); notes.length = 0; gains.length = 0; vibes.length = 0;
  sound.playNotificationTone('n-u1');
  {
    const span = Math.max(...notes.map((n) => n.stop), 0);
    const peaks = gains.filter((g) => g.peak !== undefined).map((g) => g.peak);
    check('U1 general ping = 1 soft pop note with quick upward bend (520->900), <=0.25s span, peak<=0.12, NO vibration',
      notes.length === 1 && Math.abs(notes[0].freq - 520) < 2 && Math.abs(notes[0].sweepTo - 900) < 2 &&
      notes[0].sweepAt <= 0.1 && span <= 0.25 && Math.max(...peaks) <= 0.12 && vibes.length === 0,
      { notes: notes.length, freq: notes[0]?.freq, sweepTo: notes[0]?.sweepTo, span, peaks, vibes: vibes.length });
  }

  // U2 same notification id cannot sound twice
  { const before = notes.length; sound.resetSoundGuardsForTests(); sound.playNotificationTone('dup-n'); sound.playNotificationTone('dup-n'); check('U2 same notificationId twice -> exactly ONE ping (per-id dedup)', notes.length - before === 1, notes.length - before); }

  // U3 burst of 3 DIFFERENT notifications collapses to 1 audible (global 550ms anti-stack gap)
  sound.resetSoundGuardsForTests(); notes.length = 0;
  sound.playNotificationTone('b1'); sound.playNotificationTone('b2'); sound.playNotificationTone('b3');
  check('U3 three rapid distinct notifications -> exactly ONE audible ping (anti-stacking gap, no overlap)', notes.length === 1, notes.length);

  // U4 booking tone: DEFAULT (2026-08-23) = candidate A cha-ching — two clean bright notes
  //     (E6 ~1318.5 then G6 ~1568, ~60ms apart), <=0.4s total, success vibration
  sound.resetSoundGuardsForTests(); notes.length = 0; gains.length = 0; vibes.length = 0;
  sound.playBookingConfirmedTone('offer-u4');
  {
    const span = Math.max(...notes.map((n) => n.stop), 0);
    check('U4 booking tone = cha-ching double-tone (E6->G6, 60ms apart), <=0.4s, double-pulse success vibration',
      notes.length === 2 && Math.abs(notes[0].freq - 1318.51) < 2 && Math.abs(notes[1].freq - 1567.98) < 2 &&
      Math.abs(notes[1].start - 0.06) < 0.02 && span <= 0.4 &&
      JSON.stringify(vibes[0]) === JSON.stringify([120, 60, 120]),
      { n: notes.length, f0: notes[0]?.freq, f1: notes[1]?.freq, gap: notes[1]?.start, span, vibes });
  }

  // U5 booking dedup: action path AND socket event for the SAME offer -> one arpeggio; different offer -> second plays
  sound.resetSoundGuardsForTests(); notes.length = 0;
  sound.playBookingConfirmedTone('offer-x'); sound.playBookingConfirmedTone('offer-x');
  const afterDup = notes.length;
  sound.resetSoundGuardsForTests(); sound.playBookingConfirmedTone('offer-y');
  check('U5 same offerId twice -> 1 booking tone (2 oscs); a DIFFERENT offerId still plays', afterDup === 2 && notes.length === 4, { afterDup, total: notes.length });

  // U6 new-request: DEFAULT (2026-08-23) = candidate A knock — low thump (150->110 Hz pitch
  //     fall, sharp attack) + faint 900 Hz tick; id-deduped, vibrates even when a burst collapses
  sound.resetSoundGuardsForTests(); notes.length = 0; vibes.length = 0;
  sound.playNewRequestTone('req-1'); sound.playNewRequestTone('req-1');
  const notesOne = notes.length;
  const knock = notesOne === 2 && Math.abs(notes[0].freq - 150) < 2 && Math.abs(notes[0].sweepTo - 110) < 2 &&
    Math.abs(notes[1].freq - 900) < 2 && notes[1].stop <= 0.06;
  sound.playNewRequestTone('req-2'); // inside gap -> not audible BUT still vibrates (independent haptic)
  check('U6 new-request = knock (low thump 150->110 + tick; percussive, NOT a melodic run); same id muted; NEW id still vibrates in-gap',
    notesOne === 2 && knock && notes.length === 2 &&
    vibes.length === 2 && JSON.stringify(vibes[0]) === JSON.stringify([200, 100, 200]), { notesOne, totalNotes: notes.length, vibes });

  // U7 cross-tone stacking guard: booking within 550ms of a ping is suppressed (no overlap), ping id still claimable later
  sound.resetSoundGuardsForTests(); notes.length = 0;
  sound.playNotificationTone('cross-1'); sound.playBookingConfirmedTone('cross-offer');
  const suppressed = notes.length === 1;
  sound.resetSoundGuardsForTests(); sound.playBookingConfirmedTone('cross-offer');
  check('U7 tones never overlap (booking inside ping gap suppressed; after reset same offer claimable again)', suppressed && notes.length === 3, notes.length);

  // U8 legacy exports still function (back-compat) without crashing headless
  { let threw = false; try { sound.resetSoundGuardsForTests(); sound.notifyAlert('positive'); sound.playAlert('negative'); sound.vibrateAlert('new-request'); } catch { threw = true; } check('U8 legacy playAlert/notifyAlert/vibrateAlert remain safe (no throw, gap-applied)', !threw); }

  // U9 the NON-default candidates are real, distinct and correctly shaped (A/B panel must not lie)
  sound.resetSoundGuardsForTests(); notes.length = 0; vibes.length = 0;
  sound.playNotificationA();
  const okNA = notes.length === 2 && notes[0].freq < notes[1].freq && Math.abs(notes[0].freq - 783.99) < 2 && vibes.length === 0;
  sound.resetSoundGuardsForTests(); notes.length = 0; vibes.length = 0;
  sound.playNewRequestB();
  const okRB = notes.length === 2 && Math.abs(notes[0].freq - 880) < 2 && Math.abs(notes[1].freq - 1760) < 2 &&
    Math.max(...notes.map((n) => n.stop)) <= 0.4 && vibes.length === 1;
  sound.resetSoundGuardsForTests(); notes.length = 0; vibes.length = 0;
  sound.playBookingConfirmedB();
  const okBA = notes.length === 1 && Math.abs(notes[0].freq - 659.25) < 2 && Math.abs(notes[0].sweepTo - 659.25) < 2 &&
    notes[0].stop <= 0.7 && JSON.stringify(vibes[0]) === JSON.stringify([120, 60, 120]);
  check('U9 alternate candidates real + distinct (2026-08-23 set): A ping=2-note chime (untouched), B newreq=marimba pluck A5+octave, B booking=warm E5 hold with end vibrato',
    okNA && okRB && okBA, { okNA, okRB, okBA });

  console.log('\n=== LIVE — real payloads through the compiled module (backend :5000) ===');
  // Real two-user flow: customer + provider (same city/category), request, offer, accept, chat.
  const cph = `+92370${uniq}1`, pph = `+92370${uniq}2`;
  const mk = async (phone, role, name) => { const r = await api('/api/auth/phone/send-otp', { method: 'POST', body: { phone } }); const v = await api('/api/auth/phone/verify-otp', { method: 'POST', body: { phone, otp: r.data.otp, name, role, city: 'Lahore' } }); return { token: v.data.token, user: v.data.user }; };
  const customer = await mk(cph, 'customer', 'Sound Cust');
  const provider = await mk(pph, 'provider', 'Sound Prov');
  await api('/api/users/location', { method: 'PATCH', token: provider.token, body: { lng: 74.35, lat: 31.52, city: 'Lahore' } });
  await api('/api/users/location', { method: 'PATCH', token: customer.token, body: { lng: 74.351, lat: 31.521, city: 'Lahore' } });
  await api('/api/providers/setup', { method: 'PATCH', token: provider.token, body: { category: 'plumber', radiusKm: 10 } });
  await api('/api/providers/dev/verify-me', { method: 'POST', token: provider.token });
  await api('/api/users/profile', { method: 'PATCH', token: provider.token, body: { isOnline: true } });

  const sockEvts = { offerAccepted: null, notifs: [], requestNew: null, all: [] };
  const psock = io(BASE, { auth: { token: provider.token }, transports: ['websocket'] });
  const csock = io(BASE, { auth: { token: customer.token }, transports: ['websocket'] });
  await waitFor(() => psock.connected && csock.connected);
  psock.onAny((ev, d) => { sockEvts.all.push(ev); if (ev !== 'request:new') void d; });
  console.log('  [diag] sockets connected:', psock.connected, csock.connected);
  psock.on('offer:accepted', (d) => { sockEvts.offerAccepted = d; });
  psock.on('notification:new', (d) => { sockEvts.notifs.push(d); });
  psock.on('request:new', (d) => { sockEvts.requestNew = d; });
  csock.on('notification:new', (d) => { /* customer counter-party feed below */ (sockEvts.cNotifs ??= []).push(d); });

  // request -> provider gets request:new (with the id store.tsx would pass)
  const preq = await api('/api/requests', { method: 'POST', token: customer.token, body: { category: 'plumber', description: 'Sound test leak fix needed urgently', lng: 74.351, lat: 31.521, address: 'Sound Test St', city: 'Lahore' } });
  const reqId = preq.data.request?._id || preq.data.request?.id || preq.data._id || preq.data.id;
  const seenReq = await waitFor(() => sockEvts.requestNew);
  if (!seenReq) console.log('  [diag] request create status:', preq.status, 'events seen:', JSON.stringify(sockEvts.all));
  const seenReqId = seenReq && ((seenReq.request && (seenReq.request.id ?? seenReq.request._id)) ?? seenReq.id ?? seenReq._id);
  check('L1 request:new arrives nested as {request:{id,...}} (the same field store.tsx reads) -> feeds playNewRequestTone id-dedup',
    !!seenReq && String(seenReqId) === String(reqId), { seenReqId, reqId });

  // offer -> accept: provider gets offer:accepted AND notification:new(offer_accepted); customer gets the socket event too
  const pcoffer = await api(`/api/requests/${reqId}/offers`, { method: 'POST', token: provider.token, body: { visitingCharge: 700, etaMinutes: 15 } });
  const offerId = pcoffer.data.offer?._id || pcoffer.data.offer?.id || pcoffer.data._id || pcoffer.data.id;
  const accepted = await api(`/api/offers/${offerId}/accept`, { method: 'PATCH', token: customer.token });
  check('L1b offer accepted via real API (booking moment reached)', accepted.status === 200, accepted.status);
  const gotAcc = await waitFor(() => sockEvts.offerAccepted);
  const gotNotif = await waitFor(() => sockEvts.notifs.find((n) => (n.notification?.type || n.type) === 'offer_accepted'));

  // FEED-THROUGH the real payloads exactly as store.tsx would (both possible paths):
  notes.length = 0; sound.resetSoundGuardsForTests();
  // 1) customer's own accept action success path
  sound.playBookingConfirmedTone(String(offerId));
  // 2) offer:accepted socket handler (real id from the live event payload)
  const sockOfferId = gotAcc?.offer && (gotAcc.offer.id ?? gotAcc.offer._id);
  if (sockOfferId != null) sound.playBookingConfirmedTone(String(sockOfferId));
  // 3) notification:new handler exclusion logic (type offer_accepted -> NO ping)
  const ntype = gotNotif && (gotNotif.notification?.type || gotNotif.type);
  const nid = gotNotif && ((gotNotif.notification && (gotNotif.notification.id ?? gotNotif.notification._id)) || gotNotif.id || gotNotif._id);
  if (ntype && ntype !== 'offer_accepted' && ntype !== 'request_new') sound.playNotificationTone(String(nid));
  check('L2 live accept -> action+socket+notification all fed: exactly ONE booking cha-ching (2 notes), ZERO general pings for offer_accepted',
    notes.length === 2, { notes: notes.length, sockOfferId, ntype });

  // chat message -> new_message persisted ping on counter-party: type not excluded -> ONE ping; burst collapse proven by U3.
  // NOTE: chat is socket-only (chat:send) - there is no REST message POST.
  const jobId = accepted.data.job?.id || accepted.data.job?._id;
  await Promise.race([
    new Promise((resolve) => csock.emit('chat:send', { jobId, text: 'on my way soundcheck' }, () => resolve())),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  const msgNotif = await waitFor(() => sockEvts.notifs.find((n) => (n.notification?.type || n.type) === 'new_message'));
  notes.length = 0; sound.resetSoundGuardsForTests();
  if (msgNotif) { const mtype = msgNotif.notification?.type || msgNotif.type; if (mtype !== 'offer_accepted' && mtype !== 'request_new') sound.playNotificationTone(String((msgNotif.notification && (msgNotif.notification.id ?? msgNotif.notification._id)) || msgNotif.id)); }
  check('L3 new chat message -> provider gets persisted new_message -> exactly ONE general ping (1 soft pop)', !!msgNotif && notes.length === 1, { got: !!msgNotif, notes: notes.length });

  check('L4 request:new id + notification types observed live are consistent with the wired exclusions',
    !!seenReq && ntype === 'offer_accepted', { ntype });

  psock.close(); csock.close();
  fs.existsSync(SOUND_ESM) && fs.unlinkSync(SOUND_ESM);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed, ${skipped} env-limited skip(s) ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
