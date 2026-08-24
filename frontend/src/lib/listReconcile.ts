/**
 * listReconcile — provider request-list render stability helper (2026-08-22)
 *
 * The 5s polling rebuilds the nearby-request array from scratch each cycle. If we hand
 * React a brand-new array of brand-new objects every poll (even when NOTHING changed),
 * keyed cards technically re-render — and any reorder/remount risk re-triggers the
 * entrance animation ("cards blinking on every poll").
 *
 * reconcileNearbyRequests(prev, next) returns:
 *  - the EXACT SAME `prev` array reference when length + order + visible content are
 *    identical (=> zero re-render of the whole list), or
 *  - a new array that REUSES the previous item object references for every card whose
 *    visible content is unchanged (=> a genuinely new card enters at its position,
 *    removed cards unmount, an updated live-distance value re-renders THAT card only —
 *    no unrelated cards ever lose component state, e.g. the edited price input).
 *
 * Content comparison is a shallow field check on the fields the card actually renders
 * (live distance included, so distance still updates the number smoothly).
 */

export interface ReconcilableRequest {
  id: string;
  description?: string;
  address?: string;
  category?: string;
  customerName?: string;
  distanceKm?: number | null;
  createdAt?: number;
  status?: string;
  [key: string]: any;
}

const VISIBLE_FIELDS: (keyof ReconcilableRequest)[] = [
  'id', 'description', 'address', 'category', 'customerName', 'distanceKm', 'createdAt', 'status',
];

function sameContent<T extends ReconcilableRequest>(a: T, b: T): boolean {
  for (const f of VISIBLE_FIELDS) {
    if (a[f] !== b[f]) return false;
  }
  return true;
}

export function reconcileNearbyRequests<T extends ReconcilableRequest>(prev: T[], next: T[]): T[] {
  if (!prev || prev.length === 0) return next;
  if (prev.length === next.length && prev.every((p, i) => sameContent(p, next[i]))) {
    return prev; // nothing meaningfully changed -> identical array, zero re-render
  }
  const prevById = new Map(prev.map((p) => [p.id, p]));
  return next.map((n) => {
    const old = prevById.get(n.id);
    return old && sameContent(old, n) ? old : n; // unchanged card keeps its old object identity
  });
}
