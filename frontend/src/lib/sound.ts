/**
 * Sound & Vibration helpers - shared UI feedback utilities (2026-08-21 sound system)
 *
 * Professional audio cues, all synthesized with the Web Audio API (oscillators + gain
 * envelopes) - no external audio files, no dependencies. Three distinct, tasteful tones:
 *
 *  1. playNotificationTone()   - GENERAL notification ping (new offer, chat message, status
 *                                update, decline, withdraw, cancel, expiry, rating...).
 *                                Soft two-note rising chime, ~0.25s, quiet - fires often,
 *                                must never feel intrusive.
 *  2. playNewRequestTone(id?)  - NEW-REQUEST alert (provider side). Slightly weightier
 *                                downward attention sweep (~0.65s, established from the
 *                                earlier new-request fixes) + vibration - a provider needs
 *                                to notice this to earn work, but it is not alarm-like.
 *  3. playBookingConfirmedTone(offerId?)
 *                              - BOOKING confirmation (offer accepted - customer action AND
 *                                provider's offer:accepted event). Three-note ascending major
 *                                arpeggio (C5-E5-G5), ~0.6s - satisfying "a real thing just
 *                                happened" without being cheesy/game-like.
 *
 * GUARANTEES on top of the pure tones:
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
/* De-duplication + anti-stacking                                      */
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

/* ------------------------------------------------------------------ */
/* The three public tones                                              */
/* ------------------------------------------------------------------ */

/**
 * 1) GENERAL notification ping - fresh, subtle rising two-note chime (~0.24s).
 *    Plays from exactly one place (the persisted-notification socket handler) so every
 *    standard notification event sounds identical and consistent.
 */
export function playNotificationTone(notificationId?: string) {
  try {
    if (notificationId && !claimAudible(`notif:${notificationId}`, 10_000)) return;
    const ctx = getAudioContext();
    if (!ctx || !gapAllows()) return;
    const t0 = ctx.currentTime;
    scheduleNote(ctx, 659.25, t0, 0.16, 0.12);          // E5
    scheduleNote(ctx, 880.0, t0 + 0.09, 0.18, 0.10);    // A5 (gentle rise)
  } catch (e) {
    console.warn("[Sound] playNotificationTone failed", e);
  }
}

/**
 * 2) NEW-REQUEST alert (provider) - established downward attention sweep (880 -> 440,
 *    ~0.65s) - deliberately a bit weightier + vibrates, because this alert earns work.
 *    requestId enables cross-source dedup (socket event AND the 5s polling sentinel can
 *    observe the same request - it must alert exactly once).
 */
export function playNewRequestTone(requestId?: string) {
  try {
    if (requestId && !claimAudible(`newreq:${requestId}`, 5 * 60_000)) return;
    const ctx = getAudioContext();
    const audible = !!ctx && gapAllows();
    if (audible) {
      const t0 = ctx!.currentTime;
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(440, t0 + 0.49); // calm sweep down
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.26, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.65);
      osc.start(t0);
      osc.stop(t0 + 0.65);
    }
    // Haptic is independent - even if the audible gap collapsed a burst, a NEW request id
    // still deserves its vibration tap (vibration never stacks audibly).
    vibrateAlert("new-request");
  } catch (e) {
    console.warn("[Sound] playNewRequestTone failed", e);
  }
}

/**
 * 3) BOOKING confirmed (offer accepted) - ascending C5-E5-G5 major arpeggio (~0.6s) + a
 *    success vibration. offerId dedups the two arrival paths (the customer's own accept
 *    action AND the shared offer:accepted socket event both fire for the same offer).
 */
export function playBookingConfirmedTone(offerId?: string) {
  try {
    if (offerId && !claimAudible(`booking:${offerId}`, 10_000)) return;
    const ctx = getAudioContext();
    if (!ctx || !gapAllows()) return;
    const t0 = ctx.currentTime;
    scheduleNote(ctx, 523.25, t0, 0.2, 0.14);           // C5
    scheduleNote(ctx, 659.25, t0 + 0.1, 0.22, 0.14);    // E5
    scheduleNote(ctx, 783.99, t0 + 0.2, 0.38, 0.15);    // G5 (rings out, ~0.6s total)
    vibrateAlert("positive");
  } catch (e) {
    console.warn("[Sound] playBookingConfirmedTone failed", e);
  }
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
 * playBookingConfirmedTone). Retained so older call sites keep working; sounds identical to
 * the new-request sweep / generic positive / negative chirps without dedup guarantees.
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
