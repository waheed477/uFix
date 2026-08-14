import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/lib/store";
import { categoryById } from "@/lib/types";
import {
  BanknoteIcon,
  BellIcon,
  BriefcaseIcon,
  ChatIcon,
  CheckCircleIcon,
  NavigateIcon,
  timeAgo,
} from "./ui";

type IconKey = "offer" | "check" | "request" | "message" | "navigate";

interface Notif {
  id: string;
  icon: IconKey;
  title: string;
  body: string;
  time: number;
  jobId?: string;
}

const ICON: Record<IconKey, { Icon: typeof BellIcon; cls: string }> = {
  offer: { Icon: BanknoteIcon, cls: "bg-accent-100 text-accent-600" },
  check: { Icon: CheckCircleIcon, cls: "bg-emerald-100 text-emerald-600" },
  request: { Icon: BriefcaseIcon, cls: "bg-brand-100 text-brand-700" },
  message: { Icon: ChatIcon, cls: "bg-sky-100 text-sky-600" },
  navigate: { Icon: NavigateIcon, cls: "bg-brand-100 text-brand-700" },
};

export function NotificationBell() {
  const { jobs, nearbyRequests, messages, user, openChat, activeRequestId, navigate } = useApp();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);
  const isProvider = user?.role === "provider";

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const items: Notif[] = [];
  jobs.forEach((j) => {
    const peerId = isProvider ? j.customerId : j.providerId;
    const peerName = isProvider ? j.customerName : j.providerName;
    const msgs = messages[j.id] ?? [];
    const unread = msgs.filter((m) => m.senderId === peerId && !m.read);
    if (unread.length) {
      const last = unread[unread.length - 1];
      items.push({ id: `m-${j.id}`, icon: "message", title: `Message from ${peerName}`, body: last.text, time: last.timestamp, jobId: j.id });
    }

    if (isProvider) {
      if (j.status === "accepted" && j.customerName) {
        items.push({ id: `acc-${j.id}`, icon: "check", title: "Offer accepted 🎉", body: `${j.customerName} accepted your offer`, time: j.createdAt, jobId: j.id });
      }
    } else {
      j.offers.forEach((o) =>
        items.push({ id: o.id, icon: "offer", title: `New offer · ${o.providerName}`, body: `₹${o.visitingCharge} visiting charge · ETA ${o.etaMin} min`, time: o.timestamp })
      );
      if (j.status === "accepted" && j.providerName) {
        items.push({ id: `acc-${j.id}`, icon: "check", title: "Offer accepted", body: `${j.providerName} is on the way`, time: j.createdAt, jobId: j.id });
      }
      if (j.status === "on_the_way" && j.providerName) {
        items.push({ id: `otw-${j.id}`, icon: "navigate", title: "On the way", body: `${j.providerName} is heading to you`, time: j.createdAt });
      }
    }
  });

  if (isProvider) {
    nearbyRequests.forEach((r) =>
      items.push({
        id: `r-${r.id}`,
        icon: "request",
        title: `New ${categoryById(r.category).label.toLowerCase()} request`,
        body: `${r.customerName} · ${r.distanceKm} km away`,
        time: r.createdAt,
      })
    );
  }

  items.sort((a, b) => b.time - a.time);
  const list = items.slice(0, 8);
  const unreadCount = list.filter((i) => !seen[i.id]).length;

  const onTap = (n: Notif) => {
    setSeen((s) => ({ ...s, [n.id]: true }));
    if (n.icon === "message" && n.jobId) {
      setOpen(false);
      openChat(n.jobId);
    } else if (n.icon === "offer" && activeRequestId) {
      setOpen(false);
      navigate("offers");
    }
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
              onClick={() => setSeen(Object.fromEntries(list.map((n) => [n.id, true])))}
              className="text-xs font-semibold text-brand-600"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-[58vh] overflow-y-auto">
            {list.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <BellIcon className="mb-2 h-6 w-6 text-ink-300" />
                <p className="text-sm font-medium text-ink-500">You're all caught up</p>
                <p className="text-xs text-ink-400">Offers, requests & messages appear here.</p>
              </div>
            ) : (
              list.map((n) => {
                const cfg = ICON[n.icon];
                return (
                  <button
                    key={n.id}
                    onClick={() => onTap(n)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-ink-50 px-4 py-3 text-left transition-colors hover:bg-ink-50",
                      !seen[n.id] && "bg-brand-50/50"
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
                    {!seen[n.id] && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
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
