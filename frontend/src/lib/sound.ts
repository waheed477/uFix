/**
 * Sound & Vibration helpers - shared UI feedback utilities
 *
 * Extracted from store.tsx / provider.tsx (previously duplicated Web Audio code in 2 places)
 * so every important live event (new request, offer declined/accepted, job completed)
 * can give consistent audible + haptic feedback with one call.
 *
 * Gracefully no-ops where AudioContext / vibration are unavailable or blocked.
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

export type AlertKind = "new-request" | "positive" | "negative";

const PATTERNS: Record<AlertKind, { from: number; to: number; duration: number }> = {
  "new-request": { from: 880, to: 440, duration: 0.65 },   // attention sweep down
  positive: { from: 520, to: 880, duration: 0.45 },        // happy sweep up (accepted, completed)
  negative: { from: 420, to: 220, duration: 0.4 },         // low sweep (declined/cancelled)
};

/** Play a short two-tone alert beep. Safe to call from socket handlers. */
export function playAlert(kind: AlertKind = "new-request") {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const { from, to, duration } = PATTERNS[kind];
    const t0 = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.setValueAtTime(from, t0);
    oscillator.frequency.exponentialRampToValueAtTime(to, t0 + duration * 0.75);
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.linearRampToValueAtTime(0.28, t0 + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, t0 + duration);
    oscillator.start(t0);
    oscillator.stop(t0 + duration);
  } catch (e) {
    console.warn("[Sound] playAlert failed", e);
  }
}

/** Vibrate on supported devices (pattern tuned per event kind). */
export function vibrateAlert(kind: AlertKind = "new-request") {
  try {
    if (!("vibrate" in navigator)) return;
    if (kind === "positive") navigator.vibrate([120, 60, 120]);
    else if (kind === "negative") navigator.vibrate([220]);
    else navigator.vibrate([200, 100, 200]);
  } catch {}
}

/** Convenience: both at once. */
export function notifyAlert(kind: AlertKind = "new-request") {
  playAlert(kind);
  vibrateAlert(kind);
}
