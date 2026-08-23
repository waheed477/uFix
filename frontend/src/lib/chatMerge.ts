/**
 * Chat message merge — pure, testable reconciliation for incoming `chat:message` events
 * (2026-08-23, chat duplicate-message fix).
 *
 * ROOT CAUSE of the duplicate: the sender's UI adds the message OPTIMISTICALLY with a
 * client-side `temp-…` id at send time, and the backend emits `chat:message` to BOTH
 * participants (by design) with the message's REAL server id. The echo can arrive before
 * the `chat:send` ack callback patches the temp entry, so the naive "append unless id
 * exists" listener could never match the temp id — the sender saw TWO copies.
 *
 * THE FIX (Option A — keeps instant send feel):
 *  - Recipient path: unchanged — append unless we already have that exact message id.
 *  - SELF-echo path (message sent by ME): tag it as `senderId: 'me'` (consistent with the
 *    optimistic entry + ack replacement) and RECONCILE with the pending optimistic entry
 *    instead of appending: the oldest `temp-…` entry is replaced in place. If no temp
 *    entry is pending (e.g. the ack already replaced it, or the message came from my other
 *    device), the real-id dedupe / plain append still leaves exactly one entry.
 *
 * Convergence, either arrival order, rapid sends included:
 *  - echo-first:  echo replaces temp (real id) → ack's temp-map finds nothing → no-op.
 *  - ack-first:   ack replaces temp with real id → echo dedupes on that id → no-op.
 *  - ack-lost:    temp is replaced by the echo anyway → one entry, real id.
 *  - rapid N:     each echo consumes the oldest outstanding temp → N sends = N entries.
 */
import type { ChatMessage } from "./types";

export function mergeIncomingChatMessage(
  existing: ChatMessage[],
  incoming: ChatMessage,
  meId?: string | null,
): ChatMessage[] {
  // Already have the confirmed message (ack-first order or a duplicate delivery) — no-op.
  if (existing.some((m) => m.id === incoming.id)) return existing;

  const mine = !!meId && String(incoming.senderId) === String(meId);
  if (mine) {
    const selfMsg: ChatMessage = { ...incoming, senderId: "me" };
    const tempIdx = existing.findIndex((m) => m.id.startsWith("temp-"));
    if (tempIdx >= 0) {
      const next = existing.slice();
      next[tempIdx] = selfMsg; // replace the oldest pending optimistic entry
      return next;
    }
    return [...existing, selfMsg];
  }

  return [...existing, incoming];
}
