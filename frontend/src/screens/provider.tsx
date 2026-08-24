/**
 * Provider Home - 100% Perfect, City-Based, Live Distance, Area Name, No Request Option
 * 
 * Perfect Flow for Provider Card:
 * - Customer area/jagah ka naam: request.address + city (e.g., "Model Town, Lahore")
 * - Exact live distance reading both live locations: provider GPS watchPosition + request lat/lng via Haversine, updates live
 * - Customer name, avatar, category, description, time ago, rating
 * - No request creation option - only incoming requests, send offers, jobs, chat, profile
 * - Sound + vibration on new request for smoothness
 */

import { useEffect, useState, useMemo, useRef } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/lib/store";
import { categoryById, type IncomingRequest, type SentOffer } from "@/lib/types";
import { NotificationBell } from "@/components/notifications";
import { calculateDistanceKm, watchPosition, clearWatch, type Coords } from "@/lib/location";
import { playNewRequestTone } from "@/lib/sound";
import {
  Avatar,
  BriefcaseIcon,
  Button,
  CategoryIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  MapPinIcon,
  PowerIcon,
  SendIcon,
  Stars,
  timeAgo,
  DistanceDisplay,
} from "@/components/ui";

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "tap-highlight-none relative h-8 w-[54px] shrink-0 rounded-full transition-colors duration-300",
        on ? "bg-white/30" : "bg-ink-200"
      )}
      aria-label="Toggle online status"
    >
      <span className={cn("absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md transition-all duration-300", on ? "left-[26px]" : "left-1")}>
        <PowerIcon className={cn("h-3.5 w-3.5", on ? "text-emerald-500" : "text-ink-400")} />
      </span>
    </button>
  );
}

/* Extract a request's real coordinates (shared by the card's live Haversine + the list's
 * nearest-first sorter). */
function requestCoords(req: any): { lat: number; lng: number } | null {
  const reqGeo = req?._geoLocation || req?._backend?.location || req?._backend?.geoLocation || req?.location;
  if (reqGeo?.coordinates) return { lng: reqGeo.coordinates[0], lat: reqGeo.coordinates[1] };
  if (reqGeo?.lat && reqGeo?.lng) return { lat: reqGeo.lat, lng: reqGeo.lng };
  return null;
}

function RequestCard({ 
  req, 
  onSend, 
  isSending, 
  providerCoords,
  animateIn = true,
}: { 
  req: IncomingRequest; 
  onSend: (charge: number) => void; 
  isSending?: boolean;
  providerCoords?: Coords | null;
  // 2026-08-22 flicker fix: entrance animation plays ONLY when this request id was just
  // seen (parent derives it from the ID-tracking set). Previously every card re-animated
  // whenever a poll remounted the list -> visible blinking on each 5s cycle.
  animateIn?: boolean;
}) {
  const meta = categoryById(req.category);
  const { user } = useApp();
  // Suggested price = provider's own defaultVisitingCharge from profile (falls back to a
  // category-based suggestion). The field stays fully editable - whatever number is in the
  // box when "Send offer" is tapped is the price the backend receives (BUG 3 kept working).
  const profilePrice = (user as any)?.defaultVisitingCharge;
  const basePrice = typeof profilePrice === "number"
    ? profilePrice
    : (req.category === "mechanic" ? 450 : req.category === "electrician" ? 350 : 300);
  const [charge, setCharge] = useState(basePrice);

  // Live distance calculation reading both live locations
  // Live distance from BOTH live locations (2026-08-23, BUG 1): if either side's real
  // coordinates are not available at render time, return null (UI shows "Distance
  // unavailable") - NEVER fall back to a stale snapshot or a default-coords artifact
  // (the old req.distanceKm fallback could be a bogus DEFAULT_COORDS-based value like
  // 934.5 km for two users in the SAME city, shown as if real). Data layer still keeps
  // r.distanceKm = null (adapter no longer fakes it) so the sorter below just orders
  // unknowns last.
  const liveDistance = useMemo(() => {
    if (!providerCoords) return null;
    const rc = requestCoords(req);
    if (!rc) return null;
    try {
      const dist = calculateDistanceKm(providerCoords.lat, providerCoords.lng, rc.lat, rc.lng);
      return Math.round(dist * 10) / 10; // 1 decimal for precision
    } catch {
      return null;
    }
  }, [providerCoords, req]);

  // Area name - precise jagah
  const areaName = useMemo(() => {
    // Use request address which comes from reverseGeocode: road, suburb, city
    const addr = req.address || "";
    const city = (req as any)._backend?.city || (req as any).city || "";
    if (addr && city && !addr.toLowerCase().includes(city.toLowerCase())) {
      return `${addr}, ${city}`;
    }
    return addr || city || "Nearby area";
  }, [req]);

  // Time urgency - if request older than 10 min, show expiring
  const isUrgent = useMemo(() => {
    const ageMinutes = (Date.now() - req.createdAt) / 60000;
    return ageMinutes > 8;
  }, [req.createdAt]);

  return (
    <div className={cn(animateIn && "animate-slide-up", "rounded-2xl bg-white p-4 shadow-card border border-transparent hover:border-brand-200 transition-all")}>
      {/* Header: Customer + Time + Urgency */}
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar initials={req.customerAvatar} color={req.customerColor} size={44} />
          <CategoryIcon category={req.category} size={22} className="absolute -bottom-1 -right-1 rounded-lg ring-2 ring-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-[15px] font-bold text-ink-900">{req.customerName}</span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-400">
              <ClockIcon className="h-3.5 w-3.5" /> {timeAgo(req.createdAt)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            <span className="shrink-0 font-semibold" style={{ color: meta.color }}>{meta.label}</span>
            <span className="shrink-0 text-ink-300">·</span>
            <DistanceDisplay km={liveDistance} live />
            {isUrgent && <span className="ml-1 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Expiring soon</span>}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-700">“{req.description}”</p>

      {/* Area / Jagah ka naam - Prominent */}
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50/70 px-3 py-2.5 border border-brand-100">
        <MapPinIcon className="h-4 w-4 shrink-0 text-brand-600 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-brand-800">📍 {areaName}</p>
          <p className="mt-0.5 text-[11px] text-brand-600">Customer location • { (req as any).city || (req as any)._backend?.city || "Same city"}</p>
        </div>
      </div>

      {/* Distance (consistent live pattern) + Area */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-xs">
          <DistanceDisplay km={liveDistance} live size={12} />
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2">
          <MapPinIcon className="h-3.5 w-3.5 text-ink-400" />
          <span className="text-xs font-medium text-ink-600 truncate">{areaName.split(',')[0]}</span>
        </div>
      </div>

      {/* Offer Input */}
      <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3">
        <div className="flex h-11 items-center rounded-xl border-2 border-ink-200 bg-white px-3 focus-within:border-brand-500">
          <span className="text-sm font-bold text-ink-400">PKR </span>
          <input
            type="number"
            value={charge}
            onChange={(e) => setCharge(Math.max(0, +e.target.value))}
            className="w-16 bg-transparent text-center text-[15px] font-bold text-ink-900 outline-none"
            aria-label="Visiting charge"
          />
        </div>
        <Button size="sm" className="h-11 flex-1" onClick={() => onSend(charge)} disabled={isSending}>
          {isSending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <><SendIcon className="h-4 w-4" /> Send offer</>}
        </Button>
      </div>

      <p className="mt-2 text-center text-[10px] text-ink-400">Distance calculated live from your GPS + customer location • Updates as you move</p>
    </div>
  );
}

/**
 * MyOfferCard - Bidirectional Sync (Part C & D)
 * The provider's "activity view": every offer they send stays visible with a live-updating
 * fate badge, driven by socket events (offer:accepted / offer:declined / offer:rejected /
 * request:cancelled). No refresh needed, and an accepted offer deep-links into the Active Job.
 */
const SENT_BADGE: Record<SentOffer["status"], { label: string; cls: string }> = {
  pending: { label: "⏳ Waiting for customer", cls: "bg-amber-100 text-amber-700" },
  accepted: { label: "✓ Accepted", cls: "bg-emerald-100 text-emerald-700" },
  declined: { label: "✗ Declined", cls: "bg-rose-100 text-rose-600" },
  rejected: { label: "Not selected", cls: "bg-ink-100 text-ink-500" },
  cancelled: { label: "Request cancelled", cls: "bg-ink-100 text-ink-500" },
  withdrawn: { label: "↩ Withdrawn by you", cls: "bg-sky-100 text-sky-600" },
  expired: { label: "⏰ Request expired", cls: "bg-amber-100 text-amber-700" },
};

function MyOfferCard({ offer, onOpenJob, onDismiss, onWithdraw, isWithdrawing }: { offer: SentOffer; onOpenJob: () => void; onDismiss: () => void; onWithdraw?: () => void; isWithdrawing?: boolean }) {
  const meta = categoryById(offer.category);
  const badge = SENT_BADGE[offer.status];
  const isAccepted = offer.status === "accepted";
  const isPending = offer.status === "pending";
  const isTerminal = offer.status === "declined" || offer.status === "rejected" || offer.status === "cancelled" || offer.status === "expired" || offer.status === "withdrawn";
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card", isAccepted && "ring-2 ring-emerald-400")}>
      <CategoryIcon category={offer.category} size={40} soft />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-1 font-display text-[13px] font-bold text-ink-900">{offer.description}</p>
          <span className="shrink-0 font-display text-sm font-extrabold text-accent-600">PKR {offer.visitingCharge}</span>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-400">
          <MapPinIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{offer.address || offer.city || "Customer location"}</span>
          <span className="text-ink-300">·</span>
          <span className="shrink-0">{timeAgo(offer.createdAt)}</span>
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold", badge.cls)}>{badge.label}</span>
          <span className="text-[10px] font-medium" style={{ color: meta.color }}>{meta.label}</span>
        </div>
      </div>
      {isAccepted ? (
        <button onClick={onOpenJob} className="tap-highlight-none flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white active:scale-95" aria-label="Open active job">
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      ) : isTerminal ? (
        <button onClick={onDismiss} className="tap-highlight-none flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-400 active:scale-95" aria-label="Dismiss">
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      ) : isPending ? (
        // 2026-08-21: provider can pull back a still-waiting offer (offer:withdrawn flow).
        <button onClick={onWithdraw} disabled={isWithdrawing} className="tap-highlight-none flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl border-2 border-rose-100 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-500 active:scale-95 disabled:opacity-50" aria-label="Withdraw offer">
          {isWithdrawing ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" /> : <><CloseIcon className="h-3 w-3" /> Withdraw</>}
        </button>
      ) : null}
    </div>
  );
}

export function ProviderHome() {
  const { user, nearbyRequests, toggleOnline, sendOffer, jobs, refreshNearbyRequests, isLoading, location, myOffers, dismissMyOffer, openActiveJob, providerBusy, withdrawOffer } = useApp();
  const online = user?.isOnline ?? false;
  const firstName = user?.name.split(" ")[0] ?? "there";
  const [liveCoords, setLiveCoords] = useState<Coords | null>(null);
  const watchIdRef = useRef<number | null>(null);



  // Distance UX (2026-08-23): provider list defaults to NEAREST FIRST, using the same live
  // Haversine the cards show (falls back to the request's snapshot distanceKm). No backend
  // change - client-side ordering of already-fetched data, per task scope.
  const sortedRequests = useMemo(() => {
    const dist = (r: any) => {
      if (liveCoords) {
        const rc = requestCoords(r);
        if (rc) { try { return calculateDistanceKm(liveCoords.lat, liveCoords.lng, rc.lat, rc.lng); } catch {} }
      }
      return Number(r.distanceKm ?? 9999);
    };
    return [...nearbyRequests].sort((a, b) => dist(a) - dist(b));
  }, [nearbyRequests, liveCoords]);

  // Live location tracking for provider - updates distance live on cards
  useEffect(() => {
    if (!online) {
      if (watchIdRef.current !== null) {
        clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    // Start watching live position for live distance
    const id = watchPosition(
      (coords) => {
        setLiveCoords(coords);
        // console.log('[Provider] Live coords update', coords);
      },
      (err) => {
        console.warn('[Provider] Live location watch error', err.message);
      }
    );
    if (id !== null) watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [online]);

  // Refresh nearby on mount and when online, plus polling every 5s when online (BUG 2 fallback)
  useEffect(() => {
    if (online) {
      // Background polls are SILENT (no skeleton swap) - first load right here still shows
      // the skeleton because it is not silent.
      refreshNearbyRequests();
      const interval = setInterval(() => {
        refreshNearbyRequests({ silent: true });
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [online, refreshNearbyRequests]);

  useEffect(() => {
    if (user?.role === 'provider') refreshNearbyRequests();
  }, []);

  // Sound + Vibration on GENUINELY NEW requests only (2026-08-21 fix).
  // Old logic compared list LENGTHS (count up => beep). With 5s polling that re-fired
  // whenever the count jumped for ANY reason: a stale request re-surfacing, going
  // offline->online, finishing a job (0 -> N), or one request expiring while an older
  // one appeared. Now we track WHICH request IDs this session has already seen:
  //  - first population after mount/online = silent prime (no alarm for what was
  //    already waiting when you opened the screen),
  //  - later polls/updates beep ONLY for request IDs never seen before.
  //  Already-known requests update silently (distance/age refresh each poll).
  const knownRequestIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = nearbyRequests.map((r: any) => String(r.id ?? r._id ?? ''));
    if (knownRequestIdsRef.current === null) {
      // Prime: everything visible right now is "already seen" - no sound on load.
      knownRequestIdsRef.current = new Set(ids);
      return;
    }
    const known = knownRequestIdsRef.current;
    const fresh = ids.filter((id) => id && !known.has(id));
    if (fresh.length > 0) {
      console.log(`[Provider] ${fresh.length} genuinely NEW request(s) (${fresh.join(', ')}) - sound+vibration`);
      if (online && !providerBusy) {
        // Per-id play so the shared dedup in sound.ts marks them heard (the request:new
        // socket handler can't double-alert the same id, and vice versa). The global
        // min-gap collapses a multi-request burst into ONE audible tone.
        fresh.forEach((id) => playNewRequestTone(id));
      }
      fresh.forEach((id) => known.add(id));
    }
    // Prune ids that vanished so unbounded growth of the set doesn't matter over long sessions
    if (known.size > ids.length + 40) knownRequestIdsRef.current = new Set(ids);
  }, [nearbyRequests, online, providerBusy]);

  const isLoadingNearby = isLoading['nearbyRequests'];
  const isSendingOffer = isLoading['sendOffer'];
  const effectiveCoords = liveCoords || location.coords;

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <div className="space-y-2.5 p-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar initials={user?.avatar ?? "?"} color={user?.color ?? "#167a6c"} size={46} online={online} />
            <div className="leading-tight">
              <p className="text-xs font-medium text-ink-500">Welcome back 👋 {location.city ? `· ${location.city}` : ''}</p>
              <p className="font-display text-base font-bold text-ink-900">{firstName}</p>
              {/* BUG 3 (2026-08-23): human-readable area/city label, never raw coordinates.
                  Raw lat/lng kept ONLY in dev builds for debugging. */}
              {effectiveCoords && (
                <p className="text-[10px] text-emerald-600">📍 {(user?.city || location.city || "—")}</p>
              )}
              {import.meta.env.DEV && effectiveCoords && (
                <p className="text-[9px] text-ink-300">dev coords: {effectiveCoords.lat.toFixed(4)}, {effectiveCoords.lng.toFixed(4)}</p>
              )}
            </div>
          </div>
          <NotificationBell />
        </div>

        <div className={cn("relative overflow-hidden rounded-3xl p-4 text-white transition-colors duration-500", online ? "bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800" : "bg-gradient-to-br from-ink-800 to-ink-900")}>
          <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={cn("relative flex h-2.5 w-2.5", online && "animate-pulse")}><span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", online ? "bg-emerald-300" : "bg-ink-500")} /><span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", online ? "bg-emerald-300" : "bg-ink-500")} /></span>
                <span className="font-display text-sm font-bold">{online ? "You're online" : "You're offline"}</span>
              </div>
              <p className="mt-1 text-xs text-white/70">
                {online ? `${user?.category === "plumber" ? "Plumbing" : user?.category === "electrician" ? "Electrical" : "Mechanic"} requests in ${location.city} within ${user?.radiusKm ?? 8} km • Live location tracking` : "Go online to receive requests"}
              </p>
            </div>
            <Toggle on={online} onChange={toggleOnline} />
          </div>
        </div>

        {/* Availability lock banner - non-intrusive. Provider stays online for the active job's
            live tracking; only NEW matches are gated until completion (Part 1). */}
        {providerBusy && (
          <div className="animate-slide-up flex items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-lg text-white">🔒</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-ink-900">You have an active job</p>
              <p className="mt-0.5 text-xs text-ink-600">New requests will appear here once you complete it.</p>
            </div>
            <button onClick={openActiveJob} className="tap-highlight-none shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white active:scale-95">View job</button>
          </div>
        )}

        {/* TASK 1 (2026-08-24): the earnings/jobs/rating stats row MOVED to Profile so the
            incoming-requests list gets maximum above-the-fold space on mobile. */}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!providerBusy && (
          <div className="mb-2.5 mt-1 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-ink-900">Requests in {location.city} · Live distance</h2>
            <div className="flex items-center gap-2">
              {online && nearbyRequests.length > 0 && <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">{nearbyRequests.length} new</span>}
              {online && <button onClick={() => refreshNearbyRequests()} disabled={isLoadingNearby} className="tap-highlight-none rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-600 shadow-card active:scale-95 disabled:opacity-50">{isLoadingNearby ? "..." : "Refresh"}</button>}
            </div>
          </div>
        )}

        {providerBusy ? (
          // Availability lock: cards hidden entirely (server returns none anyway) - seeing
          // offers you can't act on would be confusing (documentation: project_context Part 1)
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-amber-200 bg-white px-8 py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-3xl">🧰</div>
            <h3 className="font-display text-base font-bold text-ink-900">Focus mode: one job at a time</h3>
            <p className="mt-1 max-w-[260px] text-sm text-ink-500">You're handling an active job in {location.city}. New matching requests appear automatically once it's completed.</p>
          </div>
        ) : !online ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-ink-200 bg-white px-8 py-14 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-400"><PowerIcon className="h-7 w-7" /></div>
            <h3 className="font-display text-base font-bold text-ink-900">You're offline</h3>
            <p className="mt-1 max-w-[240px] text-sm text-ink-500">Go online to receive {location.city} requests with live distance tracking.</p>
          </div>
        ) : isLoadingNearby ? (
          <div className="space-y-3">{[0,1,2].map(i=><div key={i} className="animate-pulse rounded-2xl bg-white p-4 shadow-card"><div className="h-4 w-3/4 rounded bg-ink-100" /><div className="mt-3 h-3 w-full rounded bg-ink-100" /><div className="mt-3 h-10 w-full rounded bg-ink-100" /></div>)}</div>
        ) : nearbyRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white px-8 py-14 text-center shadow-card">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><BriefcaseIcon className="h-7 w-7" /></div>
            <h3 className="font-display text-base font-bold text-ink-900">All caught up in {location.city} 🎉</h3>
            <p className="mt-1 max-w-[240px] text-sm text-ink-500">No pending {location.city} requests. New jobs will appear live with exact area name and live distance.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedRequests.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                onSend={(charge) => sendOffer(r.id, charge)}
                isSending={isSendingOffer}
                providerCoords={effectiveCoords}
                // Animate ONLY on first appearance: id not yet in the session-seen set at
                // render time = genuinely new; next render it has been marked known.
                animateIn={!(knownRequestIdsRef.current?.has(String((r as any).id ?? (r as any)._id ?? '')))}
              />
            ))}
          </div>
        )}

        {/* Your offers - live fate of every offer this provider sent (Bidirectional Sync Part D) */}
        {myOffers.length > 0 && (
          <div className="mt-4 animate-slide-up">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="font-display text-sm font-bold text-ink-900">Your offers · live</h2>
              <span className="text-[11px] font-medium text-ink-400">
                {myOffers.filter(o => o.status === 'pending').length} waiting
              </span>
            </div>
            <div className="space-y-2.5">
              {myOffers.slice(0, 4).map((o) => (
                <MyOfferCard key={o.id} offer={o} onOpenJob={openActiveJob} onDismiss={() => dismissMyOffer(o.id)} onWithdraw={() => withdrawOffer(o.id)} isWithdrawing={!!isLoading['withdrawOffer']} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
