/**
 * Provider Home - Phase 9 Real Backend Integration
 * 
 * Changes from mock:
 * - Online/Offline toggle now wired to real PATCH /api/users/profile {isOnline} (Phase 9 Backend Fix)
 *   Previously Phase 2's updateProfile only allowed name, city, profilePicture - we added isOnline support as minimal fix
 * - Incoming requests: previously SEED_REQUESTS mock + simulated, now real GET /api/requests/nearby on mount/refresh + socket.io request:new listener (handled in store)
 * - Send Offer: wired to real POST /api/requests/:id/offers
 * - Real-time: request:new appends live, request:closed/cancelled removes, offer:accepted navigates to active job
 * - Preserved visual design: online toggle card, stats, request cards, empty states
 */

import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/lib/store";
import { categoryById, type IncomingRequest } from "@/lib/types";
import { NotificationBell } from "@/components/notifications";
import {
  Avatar,
  BanknoteIcon,
  BriefcaseIcon,
  Button,
  CategoryIcon,
  ClockIcon,
  MapPinIcon,
  PowerIcon,
  SendIcon,
  Stars,
  timeAgo,
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
      <span
        className={cn(
          "absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md transition-all duration-300",
          on ? "left-[26px]" : "left-1"
        )}
      >
        <PowerIcon className={cn("h-3.5 w-3.5", on ? "text-emerald-500" : "text-ink-400")} />
      </span>
    </button>
  );
}

function RequestCard({ req, onSend, isSending }: { req: IncomingRequest; onSend: (charge: number) => void; isSending?: boolean }) {
  const meta = categoryById(req.category);
  const suggested = req.category === "mechanic" ? 450 : req.category === "electrician" ? 350 : 300;
  const [charge, setCharge] = useState(suggested);

  return (
    <div className="animate-slide-up rounded-2xl bg-white p-4 shadow-card">
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
          <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
            <span className="font-semibold" style={{ color: meta.color }}>{meta.label}</span>
            <span className="text-ink-300">·</span>
            <span>{req.distanceKm} km</span>
          </div>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">“{req.description}”</p>

      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-brand-600" />
        <span className="truncate">{req.address}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3">
        <div className="flex h-11 items-center rounded-xl border-2 border-ink-200 bg-white px-3 focus-within:border-brand-500">
          <span className="text-sm font-bold text-ink-400">₹</span>
          <input
            type="number"
            value={charge}
            onChange={(e) => setCharge(Math.max(0, +e.target.value))}
            className="w-16 bg-transparent text-center text-[15px] font-bold text-ink-900 outline-none"
            aria-label="Visiting charge"
          />
        </div>
        <Button size="sm" className="h-11 flex-1" onClick={() => onSend(charge)} disabled={isSending}>
          {isSending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <>
              <SendIcon className="h-4 w-4" /> Send offer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function ProviderHome() {
  const { user, nearbyRequests, toggleOnline, sendOffer, jobs, refreshNearbyRequests, isLoading, location } = useApp();
  const online = user?.isOnline ?? false;
  const firstName = user?.name.split(" ")[0] ?? "there";

  const earnings = jobs
    .filter((j) => j.status === "completed")
    .reduce((sum, j) => sum + (Number((j.fee ?? "").replace(/[^0-9]/g, "")) || 0), 0);

  // Refresh nearby requests on mount and when online status changes to online
  useEffect(() => {
    if (online) {
      refreshNearbyRequests();
    }
  }, [online, refreshNearbyRequests]);

  // Initial load
  useEffect(() => {
    if (user?.role === 'provider') {
      refreshNearbyRequests();
    }
  }, []);

  const isLoadingNearby = isLoading['nearbyRequests'];
  const isSendingOffer = isLoading['sendOffer'];

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <div className="space-y-3 p-4">
        {/* header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar initials={user?.avatar ?? "?"} color={user?.color ?? "#167a6c"} size={46} online={online} />
            <div className="leading-tight">
              <p className="text-xs font-medium text-ink-500">Welcome back 👋 {location.city ? `· ${location.city}` : ''}</p>
              <p className="font-display text-base font-bold text-ink-900">{firstName}</p>
            </div>
          </div>
          <NotificationBell />
        </div>

        {/* online toggle card */}
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl p-5 text-white transition-colors duration-500",
            online
              ? "bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800"
              : "bg-gradient-to-br from-ink-800 to-ink-900"
          )}
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={cn("relative flex h-2.5 w-2.5", online && "animate-pulse")}>
                  <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", online ? "bg-emerald-300" : "bg-ink-500")} />
                  <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", online ? "bg-emerald-300" : "bg-ink-500")} />
                </span>
                <span className="font-display text-sm font-bold">{online ? "You're online" : "You're offline"}</span>
              </div>
              <p className="mt-1 text-xs text-white/70">
                {online
                  ? `${user?.category === "plumber" ? "Plumbing" : user?.category === "electrician" ? "Electrical" : "Mechanic"} requests within ${user?.radiusKm ?? 8} km`
                  : "Go online to start receiving nearby requests"}
              </p>
            </div>
            <Toggle on={online} onChange={toggleOnline} />
          </div>
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Today's earnings", value: `₹${earnings}`, icon: <BanknoteIcon className="h-4 w-4" /> },
            { label: "Jobs done", value: `${user?.jobsCompleted ?? 0}`, icon: <BriefcaseIcon className="h-4 w-4" /> },
            { label: "Rating", value: `${user?.rating ?? 4.8}★`, icon: <Stars value={user?.rating ?? 4.8} size={12} /> },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl bg-white p-3 shadow-card">
              <div className="mb-1 flex items-center gap-1.5 text-ink-400">{s.icon}</div>
              <p className="font-display text-lg font-extrabold text-ink-900">{s.value}</p>
              <p className="text-[11px] font-medium text-ink-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* requests heading with refresh */}
      <div className="flex items-center justify-between px-4 pb-2.5">
        <h2 className="font-display text-base font-bold text-ink-900">Requests near you</h2>
        <div className="flex items-center gap-2">
          {online && nearbyRequests.length > 0 && (
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">
              {nearbyRequests.length} new
            </span>
          )}
          {online && (
            <button
              onClick={() => refreshNearbyRequests()}
              disabled={isLoadingNearby}
              className="tap-highlight-none rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-600 shadow-card active:scale-95 disabled:opacity-50"
            >
              {isLoadingNearby ? "..." : "Refresh"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!online ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-ink-200 bg-white px-8 py-14 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <PowerIcon className="h-7 w-7" />
            </div>
            <h3 className="font-display text-base font-bold text-ink-900">You're offline</h3>
            <p className="mt-1 max-w-[240px] text-sm text-ink-500">
              Flip the switch above to go online and start receiving requests in real time via Socket.io.
            </p>
          </div>
        ) : isLoadingNearby ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl bg-white p-4 shadow-card">
                <div className="h-4 w-3/4 rounded bg-ink-100" />
                <div className="mt-3 h-3 w-full rounded bg-ink-100" />
                <div className="mt-3 h-10 w-full rounded bg-ink-100" />
              </div>
            ))}
          </div>
        ) : nearbyRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white px-8 py-14 text-center shadow-card">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <BriefcaseIcon className="h-7 w-7" />
            </div>
            <h3 className="font-display text-base font-bold text-ink-900">All caught up 🎉</h3>
            <p className="mt-1 max-w-[240px] text-sm text-ink-500">
              No pending requests right now. New jobs will appear here live via Socket.io the moment customers post them.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {nearbyRequests.map((r) => (
              <RequestCard key={r.id} req={r} onSend={(charge) => sendOffer(r.id, charge)} isSending={isSendingOffer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
