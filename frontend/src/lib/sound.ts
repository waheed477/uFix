/**
 * Sound & Vibration helpers - shared UI feedback utilities.
 *
 * REDESIGN (2026-08-23): the previous single-guess tones (E5→A5 ping, 880→440 down sweep,
 * C5-E5-G5 arpeggio) were REJECTED by the user. All tones are still synthesized 100% with
 * the Web Audio API (oscillators + gain envelopes) - zero external audio files, zero new
 * dependencies - but each of the 3 categories now ships MULTIPLE distinct, listenable
 * CANDIDATES as separate exported functions, so a human can A/B compare them in the dev
 * Sound Preview panel (gated to non-production, see frontend/src/components/SoundPreview.tsx
 * and project_context.md) and pick.
 *
 * Categories & candidates:
 *
 *  1) GENERAL notification (new offer, chat message, status update, decline, rating...)
 *     - playNotificationA()  soft two-note "ding-dong" chime rise (G5 -> B5), ~230ms total,
 *                            gentle attack, quiet - the classic calm chime family.
 *     - playNotificationB()  short soft "pop" - a single bubble-like tone with a quick
 *                            upward pitch bend (520 -> 900 Hz, ~170ms). Modern, light,
 *                            minimal. DEFAULT (see pick rationale at delegate below).
 *
 *  2) NEW-REQUEST alert (provider side - "you might earn work", must be noticeably more
 *     attention-getting than the general ping):
 *     - playNewRequestA()    brief 3-note ascending run C5-E5-G5, quick, clean triangle
 *                            wave, no harsh edges (~0.45s) + haptic. DEFAULT.
 *     - playNewRequestB()    double-knock - two quick repeats of one clear tone (D6),
 *                            spaced ~150ms apart (~0.35s) + haptic.
 *
 *  3) BOOKING / ACCEPT confirmation (genuine success moment):
 *     - playBookingConfirmedA() clean 4-note ascending major arpeggio C5-E5-G5-C6, warm
 *                            sine, soft envelope, ~570ms total - payment-success style.
 *     - playBookingConfirmedB() "swoosh-to-chime" - a quick upward frequency sweep that
 *                            resolves into a short held clean tone (with a soft octave
 *                            shimmer), ~600ms - a sense of completion. DEFAULT.
 *
 * WIRING (unchanged from the previous system - same call sites, same dedup keys):
 *  - playNotificationTone()    -> delegates to the chosen general candidate.
 *  - playNewRequestTone(id?)   -> delegates to the chosen new-request candidate.
 *  - playBookingConfirmedTone(id?) -> delegates to the chosen booking candidate.
 *  To swap a default after comparing in the preview panel, change exactly ONE line in the
 *  "Wired defaults" section below - the dedup keys, gap guard and all call sites follow.
 *
 * GUARANTEES on top of the pure tones (UNCHANGED, kept intact per task rules):
 *  - Per-event de-duplication: a booking/request/notification ID cannot sound twice (TTL'd
 *    key set; sockets may deliver the same logical moment via more than one path).
 *  - No stacking: a global minimum gap between ANY two audible tones collapses bursts
 *    (3 rapid events -> one tone, not three overlapped ones).
 *  - Haptics stay event-specific but are vibration-only (never audible stacking).
 *  - Gracefully no-ops where AudioContext / vibration are unavailable or blocked
 *    (autoplay policies, SSR, tests). Sounds still play while the tab is hidden ON PURPOSE
 *    (chat/offer pings are useful when the user is in another tab); only the global gap +
 *    dedup protect against noise.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") {
      // Browsers block audio until a user gesture - attempt resume, ignore failure
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* De-duplication + anti-stacking (UNCHANGED from the previous system) */
/* ------------------------------------------------------------------ */

/** TTL'd one-shot keys: the same event id cannot sound twice. */
const audibleKeys = new Map<string, number>(); // key -> timestamp seen
function claimAudible(key: string, ttlMs: number): boolean {
  try {
    const now = Date.now();
    // lazy prune so long sessions never grow the map unbounded
    if (audibleKeys.size > 300) {
      for (const [k, t] of audibleKeys) if (now - t > 5 * 60_000) audibleKeys.delete(k);
    }
    const seen = audibleKeys.get(key);
    if (seen !== undefined && now - seen < ttlMs) return false;
    audibleKeys.set(key, now);
    return true;
  } catch {
    return true; // never let guard code break audio
  }
}

/** Global minimum gap between any two audible tones - prevents burst stacking. */
let lastToneAt = 0;
const MIN_TONE_GAP_MS = 550;
function gapAllows(): boolean {
  const now = Date.now();
  if (now - lastToneAt < MIN_TONE_GAP_MS) return false;
  lastToneAt = now;
  return true;
}
/** Test/view hook. */
export function resetSoundGuardsForTests() {
  audibleKeys.clear();
  lastToneAt = 0;
}

/* ------------------------------------------------------------------ */
/* Tone primitives                                                     */
/* ------------------------------------------------------------------ */

/** One soft note: sine (or mellow triangle) with fast attack + exponential release. */
function scheduleNote(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  peak: number,
  type: OscillatorType = "sine",
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02); // soft attack
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration); // clean release
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** One bubble note: a single tone with a quick pitch bend (freq ramps from -> to). */
function scheduleBendNote(
  ctx: AudioContext,
  freqFrom: number,
  freqTo: number,
  startAt: number,
  bendDuration: number,
  totalDuration: number,
  peak: number,
  type: OscillatorType = "sine",
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, startAt);
  osc.frequency.exponentialRampToValueAtTime(freqTo, startAt + bendDuration);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015); // quick, soft attack
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + totalDuration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + totalDuration + 0.02);
}

/* ------------------------------------------------------------------ */
/* 1) GENERAL notification candidates                                  */
/* ------------------------------------------------------------------ */

/**
 * 1A) Soft two-note "ding-dong" chime - a gentle two-tone rise (G5 -> B5), ~230ms total.
 *     Calm, classic doorbell-family character but very short and soft. No vibration.
 */
export function playNotificationA() {
  try {
    const ctx = getAudioContext();
    if (!ctx || !gapAllows()) return;
    const t0 = ctx.currentTime;
    scheduleNote(ctx, 783.99, t0, 0.13, 0.11);        // G5
    scheduleNote(ctx, 987.77, t0 + 0.07, 0.15, 0.09); // B5 - gentle rise, tails to ~230ms
  } catch (e) {
    console.warn("[Sound] playNotificationA failed", e);
  }
}

/**
 * 1B) Soft "pop" - a single light bubble tone with a quick upward pitch bend
 *     (520 -> 900 Hz over 90ms, rings out to ~170ms). Modern, minimal app-ping character.
 *     No vibration.
 */
export function playNotificationB() {
  try {
    const ctx = getAudioContext();
    if (!ctx || !gapAllows()) return;
    const t0 = ctx.currentTime;
    scheduleBendNote(ctx, 520, 900, t0, 0.09, 0.17, 0.12); // quick bubble bend, soft tail
  } catch (e) {
    console.warn("[Sound] playNotificationB failed", e);
  }
}

/* ------------------------------------------------------------------ */
/* 2) NEW-REQUEST alert candidates (provider)                          */
/* ------------------------------------------------------------------ */

/**
 * 2A) Brief 3-note ascending run C5-E5-G5 - quick, clean triangle wave, ~0.45s total.
 *     Brighter and more alert than the general ping without any harsh edges. + haptic.
 */
export function playNewRequestA() {
  try {
    const ctx = getAudioContext();
    if (ctx && gapAllows()) {
      const t0 = ctx.currentTime;
      scheduleNote(ctx, 523.25, t0, 0.12, 0.17, "triangle");        // C5
      scheduleNote(ctx, 659.25, t0 + 0.1, 0.13, 0.17, "triangle");  // E5
      scheduleNote(ctx, 783.99, t0 + 0.2, 0.2, 0.18, "triangle");   // G5 - tail ~0.45s
    }
    vibrateAlert("new-request");
  } catch (e) {
    console.warn("[Sound] playNewRequestA failed", e);
  }
}

/**
 * 2B) Double-knock - two quick repeats of one clear tone (D6), ~150ms apart, ~0.35s total.
 *     A crisp "knock-knock" urgency cue. + haptic.
 */
export function playNewRequestB() {
  try {
    const ctx = getAudioContext();
    if (ctx && gapAllows()) {
      const t0 = ctx.currentTime;
      scheduleNote(ctx, 1174.66, t0, 0.11, 0.18);        // D6, knock 1
      scheduleNote(ctx, 1174.66, t0 + 0.15, 0.12, 0.18); // D6, knock 2 (150ms later)
    }
    vibrateAlert("new-request");
  } catch (e) {
    console.warn("[Sound] playNewRequestB failed", e);
  }
}

/* ------------------------------------------------------------------ */
/* 3) BOOKING / ACCEPT confirmation candidates                         */
/* ------------------------------------------------------------------ */

/**
 * 3A) Clean 4-note ascending major arpeggio C5-E5-G5-C6 - warm sine, soft envelope,
 *     ~570ms total. Satisfying and professional, payment-success style. + success haptic.
 */
export function playBookingConfirmedA() {
  try {
    const ctx = getAudioContext();
    if (ctx && gapAllows()) {
      const t0 = ctx.currentTime;
      scheduleNote(ctx, 523.25, t0, 0.16, 0.14);           // C5
      scheduleNote(ctx, 659.25, t0 + 0.09, 0.17, 0.14);    // E5
      scheduleNote(ctx, 783.99, t0 + 0.18, 0.18, 0.14);    // G5
      scheduleNote(ctx, 1046.5, t0 + 0.27, 0.3, 0.15);     // C6 - rings to ~570ms
    }
    vibrateAlert("positive");
  } catch (e) {
    console.warn("[Sound] playBookingConfirmedA failed", e);
  }
}

/**
 * 3B) "Swoosh-to-chime" - a quick upward frequency sweep (360 -> 880 Hz, ~0.26s) that
 *     resolves into a short held clean A5 tone with a soft octave shimmer, ~600ms total.
 *     A distinct sense of completion/arrival. + success haptic.
 */
export function playBookingConfirmedB() {
  try {
    const ctx = getAudioContext();
    if (ctx && gapAllows()) {
      const t0 = ctx.currentTime;
      // sweep into A5 and hold ~0.34s
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(360, t0);
      osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.26); // sweep up, resolve
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.15, t0 + 0.03);
      gain.gain.setValueAtTime(0.15, t0 + 0.3);                    // brief sustain at A5
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);     // soft tail
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.62);
      // soft octave shimmer on the resolved tone (kept quiet so it stays warm, not bright)
      scheduleNote(ctx, 1760, t0 + 0.28, 0.22, 0.05);
    }
    vibrateAlert("positive");
  } catch (e) {
    console.warn("[Sound] playBookingConfirmedB failed", e);
  }
}

/* ------------------------------------------------------------------ */
/* Wired defaults - exactly ONE candidate per category is live.        */
/* Swap the ONE inner line to re-pick a candidate after A/B listening  */
/* in the dev Sound Preview panel; dedup keys/gap/call sites follow.   */
/* ------------------------------------------------------------------ */

/**
 * GENERAL notification ping - plays from exactly one place (the persisted-notification
 * socket handler) so every standard notification event sounds identical and consistent.
 * DEFAULT = B (pop): the rejected previous tone was a two-note rising chime (the family
 * of candidate A), so the default deliberately picks the OTHER family - the lighter,
 * shorter, more modern bubble pop. playNotificationA() remains one edit away.
 */
export function playNotificationTone(notificationId?: string) {
  if (notificationId && !claimAudible(`notif:${notificationId}`, 10_000)) return;
  playNotificationB(); // <-- WIRED DEFAULT (candidate B)
}

/**
 * NEW-REQUEST alert (provider). requestId enables cross-source dedup (socket event AND the
 * 5s polling sentinel can observe the same request - it must alert exactly once).
 * DEFAULT = A (3-note ascending run): brighter and clearly more attention-getting than the
 * quiet general pop, without the rejected downward sweep. playNewRequestB() (double-knock)
 * remains one edit away.
 */
export function playNewRequestTone(requestId?: string) {
  if (requestId && !claimAudible(`newreq:${requestId}`, 5 * 60_000)) return;
  playNewRequestA(); // <-- WIRED DEFAULT (candidate A)
}

/**
 * BOOKING confirmed (offer accepted). offerId dedups the two arrival paths (the customer's
 * own accept action AND the shared offer:accepted socket event both fire for the same
 * offer). DEFAULT = B (swoosh-to-chime): the rejected previous tone was a C-E-G arpeggio
 * (the family of candidate A), so the default picks the other character - the swoosh that
 * resolves into a clean held tone. playBookingConfirmedA() remains one edit away.
 */
export function playBookingConfirmedTone(offerId?: string) {
  if (offerId && !claimAudible(`booking:${offerId}`, 10_000)) return;
  playBookingConfirmedB(); // <-- WIRED DEFAULT (candidate B)
}

/* ------------------------------------------------------------------ */
/* Legacy alert helpers (kept for haptic patterns + back-compat)       */
/* ------------------------------------------------------------------ */

export type AlertKind = "new-request" | "positive" | "negative";

/** Vibrate on supported devices (pattern tuned per event kind). */
export function vibrateAlert(kind: AlertKind = "new-request") {
  try {
    if (!("vibrate" in navigator)) return;
    if (kind === "positive") navigator.vibrate([120, 60, 120]);
    else if (kind === "negative") navigator.vibrate([220]);
    else navigator.vibrate([200, 100, 200]);
  } catch {}
}

/**
 * @deprecated Prefer the named tones above (playNotificationTone / playNewRequestTone /
 * playBookingConfirmedTone). Retained so older call sites keep working; routes to the wired
 * new-request default for "new-request", and a soft generic chirp for the rarer kinds.
 */
export function playAlert(kind: AlertKind = "new-request") {
  if (kind === "new-request") return playNewRequestTone();
  // Generic legacy chirp (only reached by un-wired legacy paths, if any).
  try {
    const ctx = getAudioContext();
    if (!ctx || !gapAllows()) return;
    const t0 = ctx.currentTime;
    const from = kind === "positive" ? 520 : 420;
    const to = kind === "positive" ? 880 : 220;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + 0.3);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.42);
    osc.start(t0);
    osc.stop(t0 + 0.42);
  } catch (e) {
    console.warn("[Sound] playAlert failed", e);
  }
}

/** @deprecated Convenience: tone + vibration together. Prefer the named tones. */
export function notifyAlert(kind: AlertKind = "new-request") {
  playAlert(kind);
  vibrateAlert(kind);
}
