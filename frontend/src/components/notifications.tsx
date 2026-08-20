/**
 * NotificationBell - Phase 9 Real Backend Integration
 * 
 * Previously generated notifications from mock jobs, nearbyRequests, messages
 * Now uses real notifications from backend via GET /api/notifications + live via notification:new socket
 * 
 * - Load initial state via GET /api/notifications on mount (handled in store)
 * - Listen for notification:new already handled in store (store adds to notifications state and increments unreadCount)
 * - Mark-as-read wired to PATCH /api/notifications/:id/read and /read-all
 * - Tap-to-navigate uses relatedId to open relevant screen (job, request, etc.)
 * 
 * Preserves existing visual design (bell icon, badge, dropdown, icons, timeAgo)
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/lib/store";
import {
  BanknoteIcon,
  BellIcon,
  BriefcaseIcon,
  ChatIcon,
  CheckCircleIcon,
  CloseIcon,
  NavigateIcon,
  StarIcon,
  timeAgo,
} from "./ui";

type IconKey = "offer" | "check" | "request" | "message" | "navigate" | "decline" | "star";

interface FrontendNotif {
  id: string;
  icon: IconKey;
  title: string;
  body: string;
  time: number;
  isRead: boolean;
  type: string;
  relatedId?: string;
}

const ICON: Record<IconKey, { Icon: typeof BellIcon; cls: string }> = {
  offer: { Icon: BanknoteIcon, cls: "bg-accent-100 text-accent-600" },
  check: { Icon: CheckCircleIcon, cls: "bg-emerald-100 text-emerald-600" },
  request: { Icon: BriefcaseIcon, cls: "bg-brand-100 text-brand-700" },
  message: { Icon: ChatIcon, cls: "bg-sky-100 text-sky-600" },
  navigate: { Icon: NavigateIcon, cls: "bg-brand-100 text-brand-700" },
  decline: { Icon: CloseIcon, cls: "bg-rose-100 text-rose-500" },
  star: { Icon: StarIcon as typeof BellIcon, cls: "bg-amber-100 text-amber-500" },
};

// Map backend notification type to icon
const typeToIcon = (type: string): IconKey => {
  switch (type) {
    case 'new_offer':
      return 'offer';
    case 'offer_accepted':
    case 'offer_rejected':
      return 'check';
    case 'offer_declined':
      return 'decline';
    case 'request_new':
      return 'request';
    case 'request_cancelled':
      return 'request';
    case 'job_status_update':
      return 'navigate';
    case 'new_message':
      return 'message';
    case 'new_rating':
      return 'star';
    default:
      return 'check';
  }
};

export function NotificationBell() {
  const {
    notifications: realNotifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    navigate,
    setTab,
    openActiveJob,
  } = useApp();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Map real notifications to frontend display format
  const items: FrontendNotif[] = (realNotifications || []).slice(0, 20).map((n: any) => ({
    id: n.id,
    icon: typeToIcon(n.type),
    title: n.title,
    body: n.body,
    time: n.timestamp || n.createdAt,
    isRead: !!n.isRead,
    type: n.type,
    relatedId: n.relatedId,
  }));

  // Bidirectional Sync (Part E): tap-to-navigate now actually navigates for every type -
  // previously this handler was a stack of comments that just closed the dropdown (dead UI).
  const onTap = async (notif: FrontendNotif) => {
    if (!notif.isRead) {
      await markNotificationRead(notif.id);
    }
    setOpen(false);

    switch (notif.type) {
      case 'new_offer':
        // Customer: an offer arrived on their open request
        navigate('offers');
        break;
      case 'offer_accepted':
      case 'job_status_update': {
        // Either party: jump straight into the live job; if it already completed, land on the jobs tab
        const ok = await openActiveJob();
        if (!ok) setTab('jobs');
        break;
      }
      case 'request_new':
        // Provider: new request in their city - the card lives on their home tab
        setTab('home');
        break;
      case 'new_message':
        setTab('chat');
        break;
      case 'new_rating':
        // Job is complete by now - the completed card (and their own pending rate prompt) is on jobs tab
        setTab('jobs');
        break;
      case 'offer_declined':
      case 'offer_rejected':
      case 'request_cancelled':
        // Provider: outcome of an offer they sent (badge lives on home "Your offers", history on jobs)
        setTab('home');
        break;
      default:
        break;
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="tap-highlight-none relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 text-ink-700 shadow-soft backdrop-blur active:scale-95"
        aria-label="Notifications"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right animate-scale-in overflow-hidden rounded-3xl bg-white shadow-float ring-1 ring-ink-100">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <span className="font-display text-sm font-bold text-ink-900">Notifications</span>
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-brand-600"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-[58vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <BellIcon className="mb-2 h-6 w-6 text-ink-300" />
                <p className="text-sm font-medium text-ink-500">You're all caught up</p>
                <p className="text-xs text-ink-400">Offers, requests & messages appear here.</p>
              </div>
            ) : (
              items.map((n) => {
                const cfg = ICON[n.icon];
                return (
                  <button
                    key={n.id}
                    onClick={() => onTap(n)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-ink-50 px-4 py-3 text-left transition-colors hover:bg-ink-50",
                      !n.isRead && "bg-brand-50/50"
                    )}
                  >
                    <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", cfg.cls)}>
                      <cfg.Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink-900">{n.title}</span>
                        <span className="shrink-0 text-[10px] font-medium text-ink-400">{timeAgo(n.time)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-500">{n.body}</span>
                    </span>
                    {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
