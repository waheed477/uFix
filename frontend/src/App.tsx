import { cn } from "@/utils/cn";
import { AppProvider, useApp } from "@/lib/store";
import type { ChatMessage, Job, Role } from "@/lib/types";
import { AuthScreen, ProviderSetupScreen, SplashScreen } from "@/screens/onboarding";
import { CustomerHome, NewRequest, OffersScreen, AvailableProvidersScreen } from "@/screens/customer";
import { ProviderHome } from "@/screens/provider";
import { ActiveJobScreen, ChatScreen, HistoryScreen, JobsTab, RatingScreen } from "@/screens/jobs";
import { EditProfileScreen, ProfileTab } from "@/screens/profile";
import { LocationPermissionScreen } from "@/screens/location";
import { BottomNav } from "@/components/BottomNav";
import {
  Avatar,
  ChatIcon,
  CheckCircleIcon,
  EmptyState,
  InfoIcon,
  SendIcon,
  timeAgo,
} from "@/components/ui";

/* ---------------- conversation helpers ---------------- */

function conversationList(
  jobs: Job[],
  messages: Record<string, ChatMessage[]>,
  role?: Role
) {
  const isCustomer = role === "customer";
  return jobs
    .map((j) => {
      const peerName = isCustomer ? j.providerName : j.customerName;
      const peerId = isCustomer ? j.providerId : j.customerId;
      const msgs = messages[j.id] ?? [];
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.senderId === peerId && !m.read).length;
      return {
        id: j.id,
        peerName: peerName ?? "Customer",
        peerColor: (isCustomer ? j.providerAvatarColor : j.customerAvatarColor) ?? "#167a6c",
        peerInitials: (isCustomer ? j.providerAvatarInitials : j.customerAvatarInitials) ?? "?",
        lastText: last?.text ?? "No messages yet",
        lastTime: last?.timestamp ?? j.createdAt,
        unread,
        hasChat: msgs.length > 0 || (j.status !== "open" && j.status !== "cancelled"),
      };
    })
    .filter((c) => c.hasChat)
    .sort((a, b) => b.lastTime - a.lastTime);
}

/* ---------------- Chat tab ---------------- */

function ChatTab() {
  const { user, jobs, messages, openChat } = useApp();
  const list = conversationList(jobs, messages, user?.role);

  if (list.length === 0) {
    return (
      <div className="flex h-full flex-col bg-ink-50">
        <header className="px-4 pb-2 pt-4">
          <h1 className="font-display text-xl font-bold text-ink-900">Messages</h1>
        </header>
        <EmptyState
          icon={<ChatIcon className="h-9 w-9" />}
          title="No conversations yet"
          subtitle="Once you accept an offer, your in-app chat opens here."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="px-4 pb-2 pt-4">
        <h1 className="font-display text-xl font-bold text-ink-900">Messages</h1>
        <p className="text-xs text-ink-500">Coordinate jobs in real time</p>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-2">
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => openChat(c.id)}
              className="tap-highlight-none flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-card transition-transform active:scale-[0.99]"
            >
              <Avatar initials={c.peerInitials} color={c.peerColor} size={48} online />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-sm font-bold text-ink-900">{c.peerName}</span>
                  <span className="shrink-0 text-[11px] font-medium text-ink-400">{timeAgo(c.lastTime)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn("truncate text-[13px]", c.unread > 0 ? "font-semibold text-ink-700" : "text-ink-400")}>
                    {c.lastText}
                  </span>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Toast ---------------- */

function ToastView({ toast }: { toast: { msg: string; icon: string } }) {
  const Icon = toast.icon === "check" ? CheckCircleIcon : toast.icon === "send" ? SendIcon : InfoIcon;
  const color = toast.icon === "check" ? "text-emerald-400" : toast.icon === "send" ? "text-accent-400" : "text-sky-400";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center px-6">
      <div className="animate-slide-down flex items-center gap-2 rounded-full bg-ink-900/95 px-4 py-2.5 text-sm font-semibold text-white shadow-float backdrop-blur">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="truncate">{toast.msg}</span>
      </div>
    </div>
  );
}

/* ---------------- App shell ---------------- */

function AppShell() {
  const { user, tab, screen, setTab, jobs, messages, toast } = useApp();

  // Regression Fix (BUG B - 2026-08-20): NEVER render role-specific content while the
  // session user is unresolved. A null user used to fall THROUGH the role gate below
  // (isProvider === false), mounting CustomerHome - with its "Request a service"
  // button - for providers. Root cause was onboarding logins that set token+stage but
  // not the store's `user`; those are fixed to hydrate via completeAuth, and this
  // guard makes a silent wrong-role home impossible here: worst case is a loader.
  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-950">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
          aria-label="Loading your session"
        />
      </div>
    );
  }

  const isProvider = user.role === "provider";
  const unread = conversationList(jobs, messages, user?.role).reduce((s, c) => s + c.unread, 0);

  const renderScreen = () => {
    if (screen === "newRequest" && isProvider) {
      return <ProviderHome />;
    }
    switch (screen) {
      case "newRequest":
        return <NewRequest />;
      case "offers":
        return <OffersScreen />;
      case "availableProviders":
        return <AvailableProvidersScreen />;
      case "activeJob":
        return <ActiveJobScreen />;
      case "chat":
        return <ChatScreen />;
      case "rating":
        return <RatingScreen />;
      case "history":
        return <HistoryScreen />;
      case "editProfile":
        return <EditProfileScreen />;
      default:
        return null;
    }
  };

  const renderTab = () => {
    switch (tab) {
      case "home":
        return isProvider ? <ProviderHome /> : <CustomerHome />;
      case "jobs":
        return <JobsTab />;
      case "chat":
        return <ChatTab />;
      case "profile":
        return <ProfileTab />;
      default:
        return null;
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">{screen ? renderScreen() : renderTab()}</div>
      {!screen && <BottomNav active={tab} onChange={setTab} unread={unread} />}
      {toast && <ToastView toast={toast} />}
    </div>
  );
}

/* ---------------- Ambient desktop backdrop ---------------- */

function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
      <div className="absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-brand-700/30 blur-3xl" />
      <div className="absolute -right-20 bottom-1/4 h-96 w-96 rounded-full bg-accent-600/20 blur-3xl" />
      <div className="absolute left-1/3 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
    </div>
  );
}

function Root() {
  const { stage } = useApp();
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-ink-950 lg:p-6">
      <AmbientBackground />
      <div className="relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white lg:h-[min(880px,94vh)] lg:rounded-[2.5rem] lg:border lg:border-white/10 lg:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)]">
        {stage === "splash" && <SplashScreen />}
        {stage === "auth" && <AuthScreen />}
        {stage === "providerSetup" && <ProviderSetupScreen />}
        {stage === "location" && <LocationPermissionScreen />}
        {stage === "app" && <AppShell />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
