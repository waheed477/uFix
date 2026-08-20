/**
 * Jobs Screens - Phase 9 Real Backend Integration - BUG FIXES 1-5
 * 
 * BUG 4 FIX: Customer's Jobs page must show incoming offers live
 * - JobsTab now shows open request with offers count and View Offers button
 * - Offers appear live via offer:new socket (no refresh needed)
 * - Accept from Jobs page navigates to Active Job with contact unlock
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/lib/store";
import { categoryById, type Job, type JobStatus } from "@/lib/types";
import { MapView } from "@/components/MapView";
import { GoogleMapView } from "@/components/GoogleMap";
import {
  Avatar,
  BriefcaseIcon,
  Button,
  CategoryIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EmptyState,
  MapPinIcon,
  PhoneIcon,
  SendIcon,
  ShieldIcon,
  StarInput,
  Stars,
  StatusBadge,
  clock as fmtClock,
  timeAgo,
} from "@/components/ui";
import { api } from "@/lib/api";
import { adaptBackendJobToFrontendJob } from "@/lib/adapters";
import { DEFAULT_COORDS, calculateDistanceKm, watchPosition, clearWatch, isGoogleMapsAvailable, type Coords } from "@/lib/location";
import { socketClient } from "@/lib/socket";

function statusIndex(s: JobStatus) {
  if (s === "arrived") return 1;
  if (s === "in_progress") return 2;
  if (s === "completed") return 3;
  return 0;
}

function Timeline({ status }: { status: JobStatus }) {
  const idx = statusIndex(status);
  const steps = ["On the way", "Arrived", "In progress", "Completed"];
  return (
    <div className="relative px-2">
      <div className="absolute left-2 right-2 top-[13px] h-0.5 rounded bg-ink-100" />
      <div className="absolute left-2 top-[13px] h-0.5 rounded bg-brand-500 transition-all duration-700" style={{ width: `calc(${(idx / 3) * 100}% - 16px)` }} />
      <div className="relative flex justify-between">
        {steps.map((label, i) => {
          const done = i < idx || (status === "completed" && i === 3);
          const active = i === idx && status !== "completed";
          return (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-300", done ? "border-brand-600 bg-brand-600 text-white" : active ? "border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100" : "border-ink-200 bg-white text-ink-300")}>
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("text-[11px] font-semibold", active || done ? "text-ink-800" : "text-ink-400")}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActiveJobScreen() {
  const { activeJob, back, navigate, user, updateJobStatus, isLoading, refreshJobs, location } = useApp();
  const [peerLocation, setPeerLocation] = useState<Coords | null>(null);
  const [myLocation, setMyLocation] = useState<Coords | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeJob) refreshJobs();
  }, []);

  // Live location sharing for active job - both customer and provider see each other live
  useEffect(() => {
    if (!activeJob) return;

    // Start watching own live position and send via socket
    const id = watchPosition(
      (coords) => {
        setMyLocation(coords);
        socketClient.sendLocationUpdate(activeJob.id, coords.lat, coords.lng, { accuracy: null });
      },
      (err) => console.warn('[ActiveJob] Live location watch error', err.message)
    );
    if (id !== null) watchIdRef.current = id;

    // Listen for peer location updates
    const offLocation = socketClient.on('job:locationUpdate', (data: any) => {
      if (data.jobId === activeJob.id) {
        console.log('[ActiveJob] Received peer location', data);
        setPeerLocation({ lat: data.lat, lng: data.lng });
      }
    });

    return () => {
      if (watchIdRef.current !== null) {
        clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      offLocation();
    };
  }, [activeJob?.id]);

  if (!activeJob) {
    return (
      <div className="flex h-full flex-col bg-ink-50">
        <ScreenHeader onBack={back} title="Active job" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          {isLoading['jobs'] ? (
            <>
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
              <p className="mt-3 text-sm text-ink-500">Loading active job...</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink-500">No active job.</p>
              <p className="mt-1 text-xs text-ink-400">Your active job will appear here after an offer is accepted.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isCustomer = user?.role === "customer";
  const peerName = isCustomer ? activeJob.providerName : activeJob.customerName;
  const peerPhone = isCustomer ? activeJob.providerPhone : activeJob.customerPhone;
  const peerColor = isCustomer ? activeJob.providerAvatarColor ?? "#167a6c" : activeJob.customerAvatarColor ?? "#167a6c";
  const peerInitials = isCustomer ? activeJob.providerAvatarInitials ?? "P" : activeJob.customerAvatarInitials ?? "C";
  const peerRating = activeJob.providerRating;
  const meta = categoryById(activeJob.category);
  const siteX = activeJob.location?.x ?? 50;
  const siteY = activeJob.location?.y ?? 50;

  const liveDistance = (() => {
    if (!myLocation || !peerLocation) return null;
    try {
      const dist = calculateDistanceKm(myLocation.lat, myLocation.lng, peerLocation.lat, peerLocation.lng);
      return Math.round(dist * 10) / 10;
    } catch { return null; }
  })();

  const nextProviderStep = (): { label: string; status: JobStatus } | null => {
    switch (activeJob.status) {
      case "accepted": return { label: "Start heading to customer", status: "on_the_way" };
      case "on_the_way": return { label: "Mark as arrived", status: "arrived" };
      case "arrived": return { label: "Start the work", status: "in_progress" };
      case "in_progress": return { label: "Mark as completed", status: "completed" };
      default: return null;
    }
  };
  const providerStep = nextProviderStep();
  const isUpdatingStatus = isLoading['updateJobStatus'];

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <ScreenHeader onBack={back} title="Active job" right={<StatusBadge status={activeJob.status} />} />
      <div className="flex-1 overflow-y-auto">
        <div className="relative h-56 overflow-hidden">
          <MapView
            className="absolute inset-0"
            cityName={location.city}
            markers={[
              { x: 50, y: 52, kind: "user" },
              ...(peerLocation ? [{ x: Math.min(90, siteX + 8), y: Math.max(10, siteY - 8), kind: "provider" as const, category: activeJob.category }] : []),
            ]}
          >
            <div className="absolute left-3 top-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-soft">
                <ClockIcon className="h-3.5 w-3.5 text-brand-600" />
                {isCustomer ? "Pro is on the way - Live" : "Heading to customer - Live"}
              </div>
              {liveDistance !== null && (
                <div className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-soft">
                  📍 Live: {liveDistance} km away
                </div>
              )}
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex justify-between">
              <span className="rounded-full bg-ink-900/80 px-2.5 py-1 text-[10px] text-white">You ● Live GPS</span>
              {peerLocation && <span className="rounded-full bg-brand-600/90 px-2.5 py-1 text-[10px] text-white">Peer ● Live</span>}
            </div>
          </MapView>
        </div>

        <div className="space-y-3 p-4">
          <div className="animate-slide-up rounded-3xl bg-white p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Avatar initials={peerInitials} color={peerColor} size={56} online />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-display text-base font-bold text-ink-900">{peerName}</span>
                  <ShieldIcon className="h-4 w-4 shrink-0 text-brand-600" />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                  <CategoryIcon category={activeJob.category} size={18} className="rounded-md" soft />
                  <span>{meta.label}</span>
                  {peerRating && <><span className="text-ink-300">·</span><Stars value={peerRating} size={13} /><span className="font-semibold text-ink-700">{peerRating}</span></>}
                </div>
                {liveDistance !== null && <p className="mt-1 text-xs font-medium text-emerald-600">📡 Live distance: {liveDistance} km • Both live locations</p>}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><CheckIcon className="h-3.5 w-3.5" /> Contact unlocked</p>
                <p className="mt-0.5 font-display text-[15px] font-bold text-ink-900">{peerPhone ?? "—"}</p>
                <p className="text-[11px] text-emerald-600">Unlocked at acceptance</p>
              </div>
              <a href={`tel:${(peerPhone ?? "").replace(/\s/g, "")}`} className="tap-highlight-none flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-[0_10px_24px_-8px_rgba(16,185,129,0.6)] active:scale-95"><PhoneIcon className="h-5 w-5" /></a>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={`tel:${(peerPhone ?? "").replace(/\s/g, "")}`} className="tap-highlight-none flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-600 font-semibold text-white shadow-glow active:scale-[0.98]"><PhoneIcon className="h-5 w-5" /> Call</a>
              <Button variant="outline" size="md" onClick={() => navigate("chat")}><SendIcon className="h-4 w-4" /> Chat</Button>
            </div>
          </div>

          <div className="animate-slide-up rounded-3xl bg-white p-5 shadow-card" style={{ animationDelay: "80ms" }}>
            <h3 className="mb-4 font-display text-sm font-bold text-ink-900">Live status</h3>
            <Timeline status={activeJob.status} />
            <p className="mt-3 text-center text-[11px] text-ink-400">Status updates live via Socket.io job:statusUpdate</p>
          </div>

          <div className="pb-2">
            {isCustomer ? (
              activeJob.status === "completed" ? (
                // Fallback entry only - normally the customer is AUTO-navigated to the Rating
                // screen the moment the provider marks complete (job:statusUpdate socket handler).
                <Button full size="lg" onClick={() => navigate("rating")}>Rate your experience ⭐</Button>
              ) : (
                // Only the PROVIDER drives the timeline. Removed the old "Mark as completed & rate"
                // customer button - it fired POST rate while the job was still in_progress, got a
                // guaranteed 400, and then faked completion locally. Dead-end UI (Part E).
                <p className="rounded-2xl bg-white px-4 py-3 text-center text-xs text-ink-500 shadow-card">Your pro will update status live. You can call or chat anytime. Live location both ways via job:locationUpdate</p>
              )
            ) : providerStep ? (
              <Button full size="lg" onClick={() => updateJobStatus(activeJob.id, providerStep.status)} disabled={isUpdatingStatus}>{isUpdatingStatus ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : providerStep.label}</Button>
            ) : activeJob.status === "completed" ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-center text-xs font-semibold text-emerald-700">Job completed! 🎉 You'll be prompted to rate your customer.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenHeader({ onBack, title, right }: { onBack: () => void; title: string; right?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
      <button onClick={onBack} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 active:scale-95"><ChevronLeftIcon className="h-5 w-5" /></button>
      <h1 className="flex-1 font-display text-lg font-bold text-ink-900">{title}</h1>
      {right}
    </header>
  );
}

export function ChatScreen() {
  const { activeJob, messages, sendMessage, markRead, back, user, isLoading } = useApp();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = activeJob ? messages[activeJob.id] ?? [] : [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs.length]);

  useEffect(() => {
    if (activeJob && msgs.length > 0) {
      const peerId = user?.role === "customer" ? activeJob.providerId : activeJob.customerId;
      if (peerId) markRead(activeJob.id, peerId);
    }
  }, [activeJob?.id, msgs.length]);

  if (!activeJob) {
    return (
      <div className="flex h-full flex-col bg-ink-50">
        <ScreenHeader onBack={back} title="Chat" />
        <div className="flex flex-1 items-center justify-center text-sm text-ink-500">No conversation.</div>
      </div>
    );
  }

  const isCustomer = user?.role === "customer";
  const peerName = isCustomer ? activeJob.providerName : activeJob.customerName;
  const peerColor = isCustomer ? activeJob.providerAvatarColor ?? "#167a6c" : activeJob.customerAvatarColor ?? "#167a6c";
  const peerInitials = isCustomer ? activeJob.providerAvatarInitials ?? "P" : activeJob.customerAvatarInitials ?? "C";
  const peerId = isCustomer ? activeJob.providerId : activeJob.customerId;

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    sendMessage(activeJob.id, t, { id: peerId ?? "peer", isProvider: isCustomer });
  };

  const isLoadingChat = isLoading['chatHistory'];

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="flex items-center gap-3 bg-white px-3 py-3 shadow-sm">
        <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 active:scale-95"><ChevronLeftIcon className="h-5 w-5" /></button>
        <Avatar initials={peerInitials} color={peerColor} size={40} online />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-display text-[15px] font-bold text-ink-900">{peerName}</p>
          <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online now - real-time</p>
        </div>
        <a href={`tel:${(activeJob.providerPhone ?? activeJob.customerPhone ?? "").replace(/\s/g, "")}`} className="tap-highlight-none flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 active:scale-95"><PhoneIcon className="h-5 w-5" /></a>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoadingChat ? (
          <div className="flex h-full flex-col items-center justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" /><p className="mt-3 text-sm text-ink-500">Loading chat history...</p></div>
        ) : msgs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-card"><SendIcon className="h-6 w-6" /></div>
            <p className="font-semibold text-ink-700">Say hello 👋</p>
            <p className="mt-1 max-w-[220px] text-xs text-ink-400">Start the conversation to coordinate the job details.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="pb-1 text-center text-[11px] font-medium text-ink-400">Today - real-time via Socket.io</p>
            {msgs.map((m) => {
              const mine = m.senderId === "me";
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm", mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-ink-800")}>
                    <p>{m.text}</p>
                    <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", mine ? "text-white/70" : "text-ink-400")}>{fmtClock(m.timestamp)}{mine && <span className={cn("text-[13px] leading-none", m.read ? "text-accent-300" : "text-white/60")}>{m.read ? "✓✓" : "✓"}</span>}</p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="border-t border-ink-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…" className="h-12 flex-1 rounded-2xl border-2 border-ink-100 bg-ink-50 px-4 text-[15px] text-ink-900 outline-none placeholder:text-ink-300 focus:border-brand-400 focus:bg-white" />
          <button onClick={send} disabled={!text.trim()} className="tap-highlight-none flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow active:scale-95 disabled:opacity-40"><SendIcon className="h-5 w-5" /></button>
        </div>
      </div>
    </div>
  );
}

const TAGS = ["Punctual", "Fair price", "Expert work", "Tidy & clean", "Friendly"];

export function RatingScreen() {
  const { activeJob, completeJob, back, isLoading, user } = useApp();
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  if (!activeJob) {
    return (
      <div className="flex h-full flex-col bg-ink-50">
        <ScreenHeader onBack={back} title="Rate" />
        <div className="flex flex-1 items-center justify-center text-sm text-ink-500">No job to rate.</div>
      </div>
    );
  }

  // Bidirectional Sync (Part B.4): BOTH sides rate each other - the screen must be role-aware.
  // Customer rates the provider; provider rates the customer (backend auto-derives toUser).
  const isCustomer = user?.role === "customer";
  const peerName = isCustomer ? activeJob.providerName : activeJob.customerName;
  const peerInitials = isCustomer ? activeJob.providerAvatarInitials ?? "P" : activeJob.customerAvatarInitials ?? "C";
  const peerColor = isCustomer ? activeJob.providerAvatarColor ?? "#167a6c" : activeJob.customerAvatarColor ?? "#167a6c";
  const peerRoleLine = isCustomer ? `${categoryById(activeJob.category).label} · completed` : `Customer · completed`;

  const toggleTag = (t: string) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const submit = () => { if (rating === 0) return; const finalReview = review.trim() || tags.join(" · "); completeJob(activeJob.id, rating, finalReview); };
  const isSubmitting = isLoading['completeJob'];

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <ScreenHeader onBack={back} title="Rate your experience" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="animate-scale-in flex flex-col items-center rounded-3xl bg-white p-6 text-center shadow-card">
          <Avatar initials={peerInitials} color={peerColor} size={72} />
          <h2 className="mt-4 font-display text-xl font-bold text-ink-900">{peerName}</h2>
          <p className="mt-1 text-sm text-ink-500">{peerRoleLine}</p>
          <div className="mt-5"><StarInput value={rating} onChange={setRating} /></div>
          <p className="mt-2 text-sm font-semibold text-ink-600">{rating === 0 ? "Tap a star to rate" : ["", "Poor", "Fair", "Good", "Great", "Excellent!"][rating]}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {TAGS.map((t) => (<button key={t} onClick={() => toggleTag(t)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", tags.includes(t) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500")}>{t}</button>))}
          </div>
          <textarea value={review} onChange={(e) => setReview(e.target.value)} rows={3} maxLength={200} placeholder={isCustomer ? "Share a few words about the pro…" : "Share a few words about the customer…"} className="mt-5 w-full resize-none rounded-2xl border-2 border-ink-100 bg-ink-50 p-3.5 text-sm text-ink-900 outline-none placeholder:text-ink-300 focus:border-brand-400 focus:bg-white" />
        </div>
      </div>
      <div className="border-t border-ink-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button full size="lg" onClick={submit} disabled={rating === 0 || isSubmitting}>{isSubmitting ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : `Submit rating${isCustomer ? "" : " for customer"}`}</Button>
        <p className="mt-2 text-center text-[11px] text-ink-400">The other party gets a live "You received a new rating" notification.</p>
      </div>
    </div>
  );
}

function JobCard({ job, onOpen }: { job: Job; onOpen?: () => void }) {
  const meta = categoryById(job.category);
  const isExpired = job.status === "cancelled" && job.cancelledReason === "expired";
  return (
    <button onClick={onOpen} className={cn("animate-slide-up flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-card", onOpen && "active:scale-[0.99]")}>
      <CategoryIcon category={job.category} size={46} soft />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-1 font-display text-sm font-bold text-ink-900">{job.description}</p>
          {/* Expired (auto, no providers in 20 min) is distinguished from user-cancelled (Part 2) */}
          {isExpired
            ? <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">⏰ Expired</span>
            : <StatusBadge status={job.status} className="shrink-0" />}
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-400"><MapPinIcon className="h-3 w-3 shrink-0" /><span className="truncate">{job.address}</span><span className="text-ink-300">·</span><span className="shrink-0">{timeAgo(job.createdAt)}</span></p>
        <div className="mt-1.5 flex items-center gap-2"><span className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>{job.rating && <span className="flex items-center gap-1"><Stars value={job.rating} size={12} /></span>}{job.fee && <span className="ml-auto text-xs font-bold text-emerald-600">{job.fee}</span>}</div>
      </div>
      {onOpen && <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-300" />}
    </button>
  );
}

export function JobsTab() {
  const { jobs, navigate, refreshJobs, isLoading, activeRequestId, user, acceptOffer, openJobRating } = useApp();
  const sorted = [...jobs].sort((a, b) => b.createdAt - a.createdAt);
  const active = sorted.find((j) => ["accepted", "on_the_way", "arrived", "in_progress"].includes(j.status));
  const openRequests = sorted.filter((j: any) => j._originalStatus === 'pending' || j.status === 'open');
  const isCustomer = user?.role === 'customer';
  const hasPending = isCustomer && openRequests.length > 0;
  // Expiry pass: most recent auto-expired request -> highlight with a "Post again" action
  const latestExpired = useMemo(() =>
    !isCustomer ? null : jobs.filter((j: any) => j.status === 'cancelled' && j.cancelledReason === 'expired').sort((a, b) => b.createdAt - a.createdAt)[0] || null
  , [jobs, isCustomer]);
  const openRequestWithOffers = openRequests.length > 0 ? openRequests[0] : null;

  useEffect(() => { refreshJobs(); }, []);

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div><h1 className="font-display text-xl font-bold text-ink-900">My jobs</h1><p className="text-xs text-ink-500">Track requests, jobs & history - real backend</p></div>
          <button onClick={() => refreshJobs()} disabled={isLoading['jobs']} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-600 shadow-card">{isLoading['jobs'] ? '...' : 'Refresh'}</button>
        </div>
      </header>

      {sorted.length === 0 ? (
        isLoading['jobs'] ? <div className="flex-1 overflow-y-auto px-4 pb-4"><div className="space-y-2.5">{[0, 1, 2].map(i => (<div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />))}</div></div> : <EmptyState icon={<BriefcaseIcon className="h-9 w-9" />} title="No jobs yet" subtitle="Your service requests and completed jobs will show up here." />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Expired request - offer to post again (Part 2). Shown only when nothing else is open. */}
          {isCustomer && !hasPending && latestExpired && (
            <div className="mb-4 animate-slide-up flex items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-card">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-lg">⏰</div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-ink-900">Request expired</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-600">No providers responded in 20 minutes — post it again to get fresh offers.</p>
              </div>
              <button
                onClick={() => navigate("newRequest")}
                className="tap-highlight-none shrink-0 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-card active:scale-95"
              >
                Post again
              </button>
            </div>
          )}

          {isCustomer && openRequestWithOffers && (
            <div className="mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4 shadow-card">
              <div className="flex items-center justify-between">
                <div><p className="font-display text-sm font-bold text-ink-900">🔔 {openRequestWithOffers.offers?.length || 0} offers received - Live</p><p className="mt-1 text-xs text-ink-600 line-clamp-1">“{openRequestWithOffers.description}” • {openRequestWithOffers.address}</p><p className="mt-1 text-[11px] text-amber-700">Live via Socket.io offer:new - offers appear here without refresh</p></div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-sm">{openRequestWithOffers.offers?.length || 0}</span>
              </div>
              <div className="mt-3 flex gap-2"><Button size="sm" className="flex-1" onClick={() => navigate('offers')}>View Offers ({openRequestWithOffers.offers?.length || 0}) - Live</Button><Button size="sm" variant="outline" onClick={() => navigate('availableProviders')}>Providers in {(openRequestWithOffers as any).city || 'city'}</Button></div>
              {openRequestWithOffers.offers && openRequestWithOffers.offers.length > 0 && (
                <div className="mt-3 space-y-2">
                  {openRequestWithOffers.offers.slice(0,2).map((offer: any) => (
                    <div key={offer.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-2"><Avatar initials={offer.avatarInitials || 'P'} color={offer.avatarColor || '#167a6c'} size={32} /><div><p className="text-xs font-bold text-ink-900">{offer.providerName}</p><p className="text-[11px] text-ink-500">PKR {offer.visitingCharge} • ETA {offer.etaMin} min</p></div></div>
                      {/* Real inline accept (same PATCH /api/offers/:id/accept path as the Offers screen) -
                          previously this button only navigated, a duplicate/fake entry point (Part E) */}
                      <Button size="sm" disabled={isLoading['acceptOffer']} onClick={() => acceptOffer(openRequestWithOffers.id, offer)}>Accept</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {active && (
            <div onClick={() => navigate("activeJob")} className="mb-3 flex cursor-pointer items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 p-4 text-white shadow-glow active:scale-[0.99]">
              <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-300" /></span>
              <div className="min-w-0 flex-1"><p className="font-display text-sm font-bold">Active job in progress</p><p className="truncate text-xs text-white/70">{active.description}</p></div>
              <ChevronRightIcon className="h-5 w-5 text-white/70" />
            </div>
          )}
          <div className="space-y-2.5">{sorted.map((j) => (<JobCard key={j.id} job={j} onOpen={active?.id === j.id ? () => navigate("activeJob") : (j as any)._originalStatus === 'pending' || j.status === 'open' ? () => navigate("offers") : j.status === 'completed' && !j.rating ? () => openJobRating(j.id) : undefined} />))}</div>
        </div>
      )}
    </div>
  );
}

export function HistoryScreen() {
  const { back } = useApp();
  const [filter, setFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [history, setHistory] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (statusFilter: "all" | "completed" | "cancelled") => {
    try {
      setLoading(true); setError(null);
      const data = await api.jobs.history({ status: statusFilter, page: 1, limit: 50 });
      const backendHistory = data.history || [];
      const mapped: Job[] = backendHistory.map((item: any) => {
        if (item.frontend) {
          const f = item.frontend;
          return { id: f.id || item.id, description: f.description || item.description || 'Past job', category: f.category || item.category || 'plumber', address: f.address || item.address || '', status: (f.status === 'completed' ? 'completed' : f.status === 'cancelled' ? 'cancelled' : f.status) as any, cancelledReason: f.cancelledReason || item.cancelledReason || undefined, createdAt: f.createdAt || toTimestamp(item.createdAt), fee: f.fee, rating: f.rating } as Job;
        }
        const isJob = item.type === 'job';
        return { id: item.id?.toString() || item._id?.toString(), description: item.description || (isJob ? 'Completed job' : (item.cancelledReason === 'expired' ? 'Expired request' : 'Cancelled request')), category: item.category || 'plumber', address: item.address || '', status: (item.status === 'completed' ? 'completed' : item.status === 'cancelled' ? 'cancelled' : item.status) as any, cancelledReason: item.cancelledReason || undefined, createdAt: item.completedAt ? new Date(item.completedAt).getTime() : (item.createdAt ? new Date(item.createdAt).getTime() : Date.now()), fee: item.offer ? `PKR ${item.offer.visitingCharge}` : undefined } as Job;
      });
      setHistory(mapped);
    } catch (err: any) { setError(err.message || 'Failed to load history'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchHistory(filter); }, [filter]);

  const shown = history;

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <ScreenHeader onBack={back} title="Order history" />
      <div className="px-4 pt-2">
        <div className="flex rounded-full bg-ink-100 p-0.5">
          {(["all", "completed", "cancelled"] as const).map((f) => (<button key={f} onClick={() => setFilter(f)} className={cn("flex-1 rounded-full py-1.5 text-xs font-semibold capitalize", filter === f ? "bg-white text-ink-900 shadow-sm" : "text-ink-500")}>{f}</button>))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? <div className="space-y-2.5">{[0, 1, 2].map(i => (<div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />))}</div> : error ? <div className="flex flex-col items-center justify-center py-10 text-center"><p className="text-sm font-medium text-rose-500">{error}</p><button onClick={() => fetchHistory(filter)} className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold shadow-card">Retry</button></div> : shown.length === 0 ? <EmptyState icon={<BriefcaseIcon className="h-9 w-9" />} title={`No ${filter} jobs`} subtitle={filter === 'all' ? 'Completed and cancelled jobs will appear here.' : `No ${filter} jobs yet.`} /> : <div className="space-y-2.5">{shown.map((j) => (<JobCard key={j.id} job={j} />))}</div>}
      </div>
    </div>
  );
}

function toTimestamp(date: any): number {
  if (!date) return Date.now();
  if (typeof date === 'number') return date;
  return new Date(date).getTime();
}
