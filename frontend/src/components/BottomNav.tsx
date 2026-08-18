import { cn } from "@/utils/cn";
import type { Tab } from "@/lib/store";
import { BriefcaseIcon, ChatIcon, HomeIcon, UserIcon } from "./ui";

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "jobs", label: "Jobs", Icon: BriefcaseIcon },
  { id: "chat", label: "Chat", Icon: ChatIcon },
  { id: "profile", label: "Profile", Icon: UserIcon },
];

export function BottomNav({
  active,
  onChange,
  unread,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  unread: number;
}) {
  return (
    <nav className="relative z-30 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="grid grid-cols-4">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="tap-highlight-none group relative flex flex-col items-center gap-1 py-2.5"
              aria-label={label}
            >
              <span
                className={cn(
                  "relative flex h-8 w-14 items-center justify-center rounded-full transition-all duration-300",
                  isActive ? "bg-brand-50 text-brand-600" : "text-ink-400 group-hover:text-ink-600"
                )}
              >
                <Icon className="h-[22px] w-[22px] transition-transform duration-300 group-active:scale-90" />
                {id === "chat" && unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium transition-colors",
                  isActive ? "font-semibold text-brand-700" : "text-ink-400"
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
