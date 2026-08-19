/**
 * Jobs Screens - Phase 9 Real Backend Integration
 * 
 * Changes from mock:
 * - ActiveJobScreen: fetch via GET /api/jobs/my/active on mount (via store refreshJobs), listen for job:statusUpdate live via socket (handled in store), status advance wired to real PATCH /api/jobs/:id/status, call button uses real unlocked phone from Job response, contact unlock always included since Job only exists after acceptance
 * - ChatScreen: replace auto-reply simulation - load history via GET /api/jobs/:jobId/messages on chat screen open (via store openChat which calls api.messages.history), send via chat:send socket emit (store sendMessage), listen for chat:message to append live (store handles), call chat:markRead when chat screen focused (store markRead), listen for chat:read to update ✓/✓✓ ticks (store handles)
 * - RatingScreen: wired to real POST /api/jobs/:jobId/rate via store completeJob
 * - JobsTab: uses real jobs from store (fetched via my requests + history + active job), no mock seed data
 * - HistoryScreen: wired to real GET /api/jobs/history with status filter param matching All/Completed/Cancelled UI filter (Phase 8 Option B - single endpoint merges completed Jobs + cancelled Requests)
 * 
 * Preserved visual design: status timeline, peer card, call button tel: link, chat UI with timestamps and read receipts, rating 5-star input, job cards with status badges, etc.
 * Only data layer changed from timers/mock to real API + socket
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
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

/* ---------------- status helpers ---------------- */

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
      <div
        className="absolute left-2 top-[13px] h-0.5 rounded bg-brand-500 transition-all duration-700"
        style={{ width: `calc(${(idx / 3) * 100}% - 16px)` }}
      />
      <div className="relative flex justify-between">
        {steps.map((label, i) => {
          const done = i < idx || (status === "completed" && i === 3);
          const active = i === idx && status !== "completed";
          return (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-300",
                  done
                    ? "border-brand-600 bg-brand-600 text-white"
                    : active
                    ? "border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100"
                    : "border-ink-200 bg-white text-ink-300"
                )}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("text-[11px] font-semibold", active || done ? "text-ink-800" : "text-ink-400")}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   ACTIVE JOB - REAL BACKEND
   ============================================================ */

export function ActiveJobScreen() {
  const { activeJob, back, navigate, user, updateJobStatus, isLoading, refreshJobs } = useApp();
  
  // Fetch active job on mount if not present
  useEffect(() => {
    if (!activeJob) {
      refreshJobs();
    }
  }, []);

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

  const nextProviderStep = (): { label: string; status: JobStatus } | null => {
    switch (activeJob.status) {
      case "accepted":
        return { label: "Start heading to customer", status: "on_the_way" };
      case "on_the_way":
        return { label: "Mark as arrived", status: "arrived" };
      case "arrived":
        return { label: "Start the work", status: "in_progress" };
      case "in_progress":
        return { label: "Mark as completed", status: "completed" };
      default:
        return null;
    }
  };
  const providerStep = nextProviderStep();
  const isUpdatingStatus = isLoading['updateJobStatus'];

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <ScreenHeader onBack={back} title="Active job" right={<StatusBadge status={activeJob.status} />} />

      <div className="flex-1 overflow-y-auto">
        {/* map */}
        <div className="relative h-44 overflow-hidden">
          <MapView
            className="absolute inset-0"
            markers={[
              { x: 50, y: 52, kind: "user" },
              { x: Math.min(90, siteX + 8), y: Math.max(10, siteY - 8), kind: "provider", category: activeJob.category },
            ]}
          >
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-soft">
              <ClockIcon className="h-3.5 w-3.5 text-brand-600" />
              {isCustomer ? "Pro is on the way" : "Heading to customer"}
            </div>
          </MapView>
        </div>

        <div className="space-y-3 p-4">
          {/* peer card */}
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
                  {peerRating && (
                    <>
                      <span className="text-ink-300">·</span>
                      <Stars value={peerRating} size={13} />
                      <span className="font-semibold text-ink-700">{peerRating}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* unlocked phone - contact unlock at acceptance via Job creation, phone numbers always included in GET /api/jobs/:id */}
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <CheckIcon className="h-3.5 w-3.5" /> Contact unlocked
                </p>
                <p className="mt-0.5 font-display text-[15px] font-bold text-ink-900">{peerPhone ?? "—"}</p>
                <p className="text-[11px] text-emerald-600">Unlocked at acceptance - per product spec</p>
              </div>
              <a
                href={`tel:${(peerPhone ?? "").replace(/\s/g, "")}`}
                className="tap-highlight-none flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-[0_10px_24px_-8px_rgba(16,185,129,0.6)] transition-transform active:scale-95"
                aria-label="Call"
              >
                <PhoneIcon className="h-5 w-5" />
              </a>
            </div>

            {/* actions */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`tel:${(peerPhone ?? "").replace(/\s/g, "")}`}
                className="tap-highlight-none flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-600 font-semibold text-white shadow-glow transition-transform active:scale-[0.98]"
              >
                <PhoneIcon className="h-5 w-5" /> Call
              </a>
              <Button variant="outline" size="md" onClick={() => navigate("chat")}>
                <SendIcon className="h-4 w-4" /> Chat
              </Button>
            </div>
          </div>

          {/* status timeline - real backend, listens for job:statusUpdate via socket for live updates */}
          <div className="animate-slide-up rounded-3xl bg-white p-5 shadow-card" style={{ animationDelay: "80ms" }}>
            <h3 className="mb-4 font-display text-sm font-bold text-ink-900">Live status</h3>
            <Timeline status={activeJob.status} />
            <p className="mt-3 text-center text-[11px] text-ink-400">Status updates live via Socket.io job:statusUpdate</p>
          </div>

          {/* role-specific CTA */}
          <div className="pb-2">
            {isCustomer ? (
              activeJob.status === "in_progress" || activeJob.status === "arrived" ? (
                <Button full size="lg" onClick={() => navigate("rating")}>
                  Mark as completed & rate
                </Button>
              ) : (
                <p className="rounded-2xl bg-white px-4 py-3 text-center text-xs text-ink-500 shadow-card">
                  Your pro will update the status here live via Socket.io. You can call or chat anytime.
                </p>
              )
            ) : providerStep ? (
              <Button full size="lg" onClick={() => updateJobStatus(activeJob.id, providerStep.status)} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  providerStep.label
                )}
              </Button>
            ) : activeJob.status === "completed" ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-center text-xs font-semibold text-emerald-700">
                Job completed! Waiting for customer rating.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenHeader({ onBack, title, right }: { onBack: () => void; title: string; right?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
      <button onClick={onBack} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 active:scale-95">
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <h1 className="flex-1 font-display text-lg font-bold text-ink-900">{title}</h1>
      {right}
    </header>
  );
}

/* ============================================================
   CHAT - REAL BACKEND via Socket.io
   ============================================================ */

export function ChatScreen() {
  const { activeJob, messages, sendMessage, markRead, back, user, isLoading } = useApp();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = activeJob ? messages[activeJob.id] ?? [] : [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length]);

  // Mark read when chat screen focused/opened - real backend via socket chat:markRead
  useEffect(() => {
    if (activeJob && msgs.length > 0) {
      const peerId = user?.role === "customer" ? activeJob.providerId : activeJob.customerId;
      if (peerId) {
        // In real backend, markRead sends socket event chat:markRead which marks all unread NOT sent by requester as read
        // and emits chat:read to other participant for ✓/✓✓ ticks
        markRead(activeJob.id, peerId);
      }
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
    // Real backend via socket chat:send, not mock auto-replies
    sendMessage(activeJob.id, t, { id: peerId ?? "peer", isProvider: isCustomer });
  };

  const isLoadingChat = isLoading['chatHistory'];

  return (
    <div className="flex h-full flex-col bg-ink-50">
      {/* header */}
      <header className="flex items-center gap-3 bg-white px-3 py-3 shadow-sm">
        <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 active:scale-95">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <Avatar initials={peerInitials} color={peerColor} size={40} online />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-display text-[15px] font-bold text-ink-900">{peerName}</p>
          <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online now - real-time via Socket.io
          </p>
        </div>
        <a
          href={`tel:${(activeJob.providerPhone ?? activeJob.customerPhone ?? "").replace(/\s/g, "")}`}
          className="tap-highlight-none flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 active:scale-95"
          aria-label="Call"
        >
          <PhoneIcon className="h-5 w-5" />
        </a>
      </header>

      {/* messages - real history from GET /api/jobs/:jobId/messages + live via chat:message socket */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoadingChat ? (
          <div className="flex h-full flex-col items-center justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
            <p className="mt-3 text-sm text-ink-500">Loading chat history...</p>
            <p className="text-xs text-ink-400">GET /api/jobs/:jobId/messages</p>
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-card">
              <SendIcon className="h-6 w-6" />
            </div>
            <p className="font-semibold text-ink-700">Say hello 👋</p>
            <p className="mt-1 max-w-[220px] text-xs text-ink-400">Start the conversation to coordinate the job details. Real-time via Socket.io chat:send/message.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="pb-1 text-center text-[11px] font-medium text-ink-400">Today - loaded via REST history + live via Socket.io</p>
            {msgs.map((m) => {
              const mine = m.senderId === "me";
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm",
                      mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-ink-800"
                    )}
                  >
                    <p>{m.text}</p>
                    <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", mine ? "text-white/70" : "text-ink-400")}>
                      {fmtClock(m.timestamp)}
                      {mine && (
                        <span className={cn("text-[13px] leading-none", m.read ? "text-accent-300" : "text-white/60")}>
                          {m.read ? "✓✓" : "✓"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* input - real backend via socket chat:send, not mock auto-replies */}
      <div className="border-t border-ink-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message… (real-time via Socket.io)"
            className="h-12 flex-1 rounded-2xl border-2 border-ink-100 bg-ink-50 px-4 text-[15px] text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400 focus:bg-white"
          />
          <button
            onClick={send}
            disabled={!text.trim()}
            className="tap-highlight-none flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow transition-all active:scale-95 disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-ink-400">Real-time via Socket.io chat:send/message, read receipts via chat:markRead/read (✓/✓✓)</p>
      </div>
    </div>
  );
}

/* ============================================================
   RATING - REAL BACKEND
   ============================================================ */

const TAGS = ["Punctual", "Fair price", "Expert work", "Tidy & clean", "Friendly"];

export function RatingScreen() {
  const { activeJob, completeJob, back, isLoading } = useApp();
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

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const submit = () => {
    if (rating === 0) return;
    const finalReview = review.trim() || tags.join(" · ");
    completeJob(activeJob.id, rating, finalReview);
  };

  const isSubmitting = isLoading['completeJob'];

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <ScreenHeader onBack={back} title="Rate your experience" />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="animate-scale-in flex flex-col items-center rounded-3xl bg-white p-6 text-center shadow-card">
          <Avatar
            initials={activeJob.providerAvatarInitials ?? "P"}
            color={activeJob.providerAvatarColor ?? "#167a6c"}
            size={72}
          />
          <h2 className="mt-4 font-display text-xl font-bold text-ink-900">{activeJob.providerName}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {categoryById(activeJob.category).label} · completed
          </p>

          <div className="mt-5">
            <StarInput value={rating} onChange={setRating} />
          </div>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            {rating === 0 ? "Tap a star to rate" : ["", "Poor", "Fair", "Good", "Great", "Excellent!"][rating]}
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {TAGS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95",
                  tags.includes(t) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="Share a few words about the work (optional)…"
            className="mt-5 w-full resize-none rounded-2xl border-2 border-ink-100 bg-ink-50 p-3.5 text-sm text-ink-900 outline-none placeholder:text-ink-300 focus:border-brand-400 focus:bg-white"
          />
          <p className="mt-2 text-[11px] text-ink-400">Wired to real POST /api/jobs/:jobId/rate (rating 1-5 integer, comment max 500)</p>
        </div>
      </div>

      <div className="border-t border-ink-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button full size="lg" onClick={submit} disabled={rating === 0 || isSubmitting}>
          {isSubmitting ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            "Submit rating & complete"
          )}
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   JOBS LIST (shared by Jobs tab + History) - REAL BACKEND
   ============================================================ */

function JobCard({ job, onOpen }: { job: Job; onOpen?: () => void }) {
  const meta = categoryById(job.category);
  return (
    <button
      onClick={onOpen}
      className={cn(
        "animate-slide-up flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-card transition-transform",
        onOpen && "active:scale-[0.99]"
      )}
    >
      <CategoryIcon category={job.category} size={46} soft />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-1 font-display text-sm font-bold text-ink-900">{job.description}</p>
          <StatusBadge status={job.status} className="shrink-0" />
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
          <MapPinIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{job.address}</span>
          <span className="text-ink-300">·</span>
          <span className="shrink-0">{timeAgo(job.createdAt)}</span>
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </span>
          {job.rating && (
            <span className="flex items-center gap-1">
              <Stars value={job.rating} size={12} />
            </span>
          )}
          {job.fee && <span className="ml-auto text-xs font-bold text-emerald-600">{job.fee}</span>}
        </div>
      </div>
      {onOpen && <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-300" />}
    </button>
  );
}

export function JobsTab() {
  const { jobs, navigate, refreshJobs, isLoading } = useApp();
  const sorted = [...jobs].sort((a, b) => b.createdAt - a.createdAt);
  const active = sorted.find((j) => ["accepted", "on_the_way", "arrived", "in_progress"].includes(j.status));

  useEffect(() => {
    refreshJobs();
  }, []);

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-ink-900">My jobs</h1>
            <p className="text-xs text-ink-500">Track requests, jobs & history - real backend via GET /api/requests/my + GET /api/jobs/history</p>
          </div>
          <button
            onClick={() => refreshJobs()}
            disabled={isLoading['jobs']}
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-600 shadow-card"
          >
            {isLoading['jobs'] ? '...' : 'Refresh'}
          </button>
        </div>
      </header>

      {sorted.length === 0 ? (
        isLoading['jobs'] ? (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-2.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<BriefcaseIcon className="h-9 w-9" />}
            title="No jobs yet"
            subtitle="Your service requests and completed jobs will show up here from real backend."
          />
        )
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {active && (
            <div
              onClick={() => navigate("activeJob")}
              className="mb-3 flex cursor-pointer items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 p-4 text-white shadow-glow active:scale-[0.99]"
            >
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-300" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold">Active job in progress - real-time via job:statusUpdate</p>
                <p className="truncate text-xs text-white/70">{active.description}</p>
              </div>
              <ChevronRightIcon className="h-5 w-5 text-white/70" />
            </div>
          )}
          <div className="space-y-2.5">
            {sorted.map((j) => (
              <JobCard key={j.id} job={j} onOpen={active?.id === j.id ? () => navigate("activeJob") : undefined} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function HistoryScreen() {
  const { back, isLoading } = useApp();
  const [filter, setFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [history, setHistory] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (statusFilter: "all" | "completed" | "cancelled") => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.jobs.history({ status: statusFilter, page: 1, limit: 50 });
      const backendHistory = data.history || [];
      
      // Map backend history (which has type job/request merged) to frontend Job shape
      const mapped: Job[] = backendHistory.map((item: any) => {
        // If item already has frontend field (from backend adapter), use it
        if (item.frontend) {
          // frontend field is already adapted to frontend Job shape in backend history endpoint
          // But we need to ensure it has required fields for JobCard
          const f = item.frontend;
          return {
            id: f.id || item.id,
            description: f.description || item.description || 'Past job',
            category: f.category || item.category || 'plumber',
            address: f.address || item.address || '',
            status: (f.status === 'completed' ? 'completed' : f.status === 'cancelled' ? 'cancelled' : f.status) as any,
            createdAt: f.createdAt || toTimestamp(item.createdAt),
            fee: f.fee,
            rating: f.rating,
          } as Job;
        }

        // Fallback mapping for direct backend shape
        const isJob = item.type === 'job';
        return {
          id: item.id?.toString() || item._id?.toString(),
          description: item.description || (isJob ? 'Completed job' : 'Cancelled request'),
          category: item.category || 'plumber',
          address: item.address || '',
          status: (item.status === 'completed' ? 'completed' : item.status === 'cancelled' ? 'cancelled' : item.status) as any,
          createdAt: item.completedAt ? new Date(item.completedAt).getTime() : (item.createdAt ? new Date(item.createdAt).getTime() : Date.now()),
          fee: item.offer ? `PKR ${item.offer.visitingCharge}` : undefined,
        } as Job;
      });

      setHistory(mapped);
    } catch (err: any) {
      console.error('Failed to fetch history', err);
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(filter);
  }, [filter]);

  const shown = history; // Already filtered by backend via status param

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <ScreenHeader onBack={back} title="Order history" />
      <div className="px-4 pt-2">
        <div className="flex rounded-full bg-ink-100 p-0.5">
          {(["all", "completed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 rounded-full py-1.5 text-xs font-semibold capitalize transition-all",
                filter === f ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-400">Real backend via GET /api/jobs/history?status={filter} - Phase 8 Option B merged completed Jobs + cancelled Requests</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm font-medium text-rose-500">{error}</p>
            <button onClick={() => fetchHistory(filter)} className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold shadow-card">
              Retry
            </button>
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<BriefcaseIcon className="h-9 w-9" />}
            title={`No ${filter} jobs`}
            subtitle={filter === 'all' ? 'Completed and cancelled jobs will appear here from real backend.' : `No ${filter} jobs yet.`}
          />
        ) : (
          <div className="space-y-2.5">
            {shown.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function toTimestamp(date: any): number {
  if (!date) return Date.now();
  if (typeof date === 'number') return date;
  return new Date(date).getTime();
}
