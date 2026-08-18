import { useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/lib/store";
import { categoryById } from "@/lib/types";
import {
  Avatar,
  Button,
  CategoryIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  GearIcon,
  HistoryIcon,
  LogoutIcon,
  ShieldIcon,
  Stars,
  WalletIcon,
} from "@/components/ui";

function MenuItem({
  icon,
  label,
  value,
  danger,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="tap-highlight-none flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-ink-50 active:bg-ink-100"
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          danger ? "bg-rose-50 text-rose-500" : "bg-ink-100 text-ink-600"
        )}
      >
        {icon}
      </span>
      <span className={cn("flex-1 text-[15px] font-semibold", danger ? "text-rose-600" : "text-ink-800")}>{label}</span>
      {value && <span className="text-xs text-ink-400">{value}</span>}
      {!danger && <ChevronRightIcon className="h-5 w-5 text-ink-300" />}
    </button>
  );
}

export function ProfileTab() {
  const { user, navigate, logout, jobs } = useApp();
  if (!user) return null;
  const isProvider = user.role === "provider";
  const meta = user.category ? categoryById(user.category) : null;
  const completed = jobs.filter((j) => j.status === "completed").length;

  return (
    <div className="h-full overflow-y-auto bg-ink-50">
      <header className="px-4 pb-3 pt-4">
        <h1 className="font-display text-xl font-bold text-ink-900">Profile</h1>
      </header>

      <div className="space-y-4 px-4 pb-6">
        {/* hero card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 p-5 text-white shadow-float">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <Avatar initials={user.avatar} color={user.color} size={64} className="ring-4 ring-white/20" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate font-display text-lg font-bold">{user.name}</h2>
                {user.verified && <ShieldIcon className="h-4 w-4 shrink-0 text-accent-300" />}
              </div>
              <p className="text-sm text-white/70">
                {user.phone}
                {user.city ? ` · ${user.city}` : ""}
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                  isProvider ? "bg-white/15 text-white" : "bg-accent-400 text-ink-950"
                )}
              >
                {isProvider && meta && <CategoryIcon category={meta.id} size={16} className="rounded" />}
                {isProvider ? meta?.label ?? "Provider" : "Customer"}
              </span>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
            {[
              { label: "Rating", value: `${user.rating}★` },
              { label: "Reviews", value: `${user.reviews}` },
              { label: isProvider ? "Jobs done" : "Jobs", value: isProvider ? `${user.jobsCompleted ?? 0}` : `${completed}` },
            ].map((s, i) => (
              <div key={i}>
                <p className="font-display text-lg font-extrabold">{s.value}</p>
                <p className="text-[11px] text-white/60">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {isProvider && meta && (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card">
            <CategoryIcon category={meta.id} size={44} />
            <div className="flex-1">
              <p className="font-display text-sm font-bold text-ink-900">{meta.label}</p>
              <p className="text-xs text-ink-500">{meta.tagline}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-sm font-bold text-ink-900">{user.radiusKm} km</p>
              <p className="text-[11px] text-ink-400">Service radius</p>
            </div>
          </div>
        )}

        {/* menu */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-card">
          <MenuItem icon={<EditIcon className="h-5 w-5" />} label="Edit profile" onClick={() => navigate("editProfile")} />
          <div className="h-px bg-ink-100" />
          <MenuItem icon={<HistoryIcon className="h-5 w-5" />} label="Order history" value={`${jobs.length} jobs`} onClick={() => navigate("history")} />
          {isProvider && (
            <>
              <div className="h-px bg-ink-100" />
              <MenuItem icon={<WalletIcon className="h-5 w-5" />} label="Earnings & payouts" value="Cash" onClick={() => {}} />
            </>
          )}
          <div className="h-px bg-ink-100" />
          <MenuItem icon={<GearIcon className="h-5 w-5" />} label="Settings" onClick={() => {}} />
        </div>

        <button
          onClick={logout}
          className="tap-highlight-none flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 font-semibold text-rose-500 shadow-card transition-transform active:scale-[0.99]"
        >
          <LogoutIcon className="h-5 w-5" /> Log out
        </button>

        <p className="pb-2 text-center text-[11px] text-ink-400">uFix · v1.0 · Made with care</p>
      </div>
    </div>
  );
}

export function EditProfileScreen() {
  const { user, updateProfile, back } = useApp();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const isProvider = user?.role === "provider";
  const meta = user?.category ? categoryById(user.category) : null;

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
        <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="flex-1 font-display text-lg font-bold text-ink-900">Edit profile</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col items-center py-4">
          <Avatar initials={user?.avatar ?? "?"} color={user?.color ?? "#167a6c"} size={80} online={isProvider ? user?.isOnline : undefined} />
          <p className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-400">
            <Stars value={user?.rating ?? 4.8} size={13} /> {user?.rating} · {user?.reviews} reviews
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-700">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-14 w-full rounded-2xl border-2 border-ink-200 bg-white px-4 text-[15px] font-medium text-ink-900 outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-700">Phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="h-14 w-full rounded-2xl border-2 border-ink-200 bg-white px-4 text-[15px] font-medium text-ink-900 outline-none focus:border-brand-500"
            />
          </div>

          {isProvider && meta && (
            <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
              <CategoryIcon category={meta.id} size={44} soft />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-ink-800">{meta.label}</p>
                <p className="text-xs text-ink-400">Service category (set during signup)</p>
              </div>
              <ShieldIcon className="h-5 w-5 text-brand-600" />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-ink-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          full
          size="lg"
          disabled={!name.trim()}
          onClick={() => {
            updateProfile(name.trim(), phone.trim());
            back();
          }}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}
