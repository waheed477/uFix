import { useEffect, useState, useMemo, type ReactNode } from "react";
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
import { api } from "@/lib/api";
import { getCityByName, getAllCities } from "@/lib/location";

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
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", danger ? "bg-rose-50 text-rose-500" : "bg-ink-100 text-ink-600")}>
        {icon}
      </span>
      <span className={cn("flex-1 text-[15px] font-semibold", danger ? "text-rose-600" : "text-ink-800")}>{label}</span>
      {value && <span className="text-xs text-ink-400">{value}</span>}
      {!danger && <ChevronRightIcon className="h-5 w-5 text-ink-300" />}
    </button>
  );
}

export function ProfileTab() {
  const { user, navigate, logout, jobs, location, uploadProfilePicture, isLoading } = useApp();
  const [fullProfile, setFullProfile] = useState<any>(null);

  // Optimized: Show user immediately from store (no loading spinner for whole screen)
  // fullProfile fetched in background, cached, non-blocking
  const displayUser = fullProfile || user;

  // Fetch full profile optimized: only once, background, with cache
  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      // If we already have fullProfile with city, don't refetch unless user id changes
      if (fullProfile && fullProfile.id === user?.id) return;
      try {
        // Use AbortController for fast cancel on unmount
        const data = await api.users.getProfile();
        if (!cancelled) {
          setFullProfile(data.user);
        }
      } catch (e) {
        // Silently fail, we already have user from store to display
        console.warn('[Profile] Background fetch failed, using cached user', e);
      }
    };
    // Fetch with small delay to allow instant render first (perceived performance)
    const t = setTimeout(fetchProfile, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [user?.id]); // Only refetch when user id changes

  if (!displayUser) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-50">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
          <p className="text-sm text-ink-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  const isProvider = displayUser.role === "provider";
  const meta = displayUser.category ? categoryById(displayUser.category) : null;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const displayCity = fullProfile?.city || displayUser.city || location.city || "Not set";
  const cityInfo = getCityByName(displayCity);

  return (
    <div className="h-full overflow-y-auto bg-ink-50">
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-ink-900">Profile</h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-emerald-600 font-medium">● Live</span>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 pb-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 p-5 text-white shadow-float">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            {/* Pre-Deploy Item 2: tap-to-change photo. Reuses the existing hidden file-input
                pattern (onboarding document upload) + the long-existing POST /profile/picture
                endpoint. Initials remain the fallback if the uploaded URL can't load. */}
            <label className="relative flex shrink-0 cursor-pointer flex-col items-center gap-1" title="Tap to change photo">
              <Avatar initials={displayUser.avatar} color={displayUser.color} size={64} className="ring-4 ring-white/20" src={displayUser.profilePicture} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] shadow-md">
                {isLoading?.['picture'] ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" /> : '📷'}
              </span>
              <span className="text-[10px] font-medium text-white/70">{isLoading?.['picture'] ? 'Uploading…' : 'Change photo'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!isLoading?.['picture']}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadProfilePicture(f);
                  e.target.value = '';
                }}
              />
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate font-display text-lg font-bold">{displayUser.name}</h2>
                {(displayUser.verified || fullProfile?.isVerified) && <ShieldIcon className="h-4 w-4 shrink-0 text-accent-300" />}
              </div>
              <p className="text-sm text-white/70">{displayUser.phone}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-300" />
                {displayCity} {cityInfo ? `· ${cityInfo.province}` : ''} {fullProfile?.isVerified ? '· Verified ✓' : isProvider ? '· Pending' : ''}
              </p>
              <span className={cn("mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", isProvider ? "bg-white/15 text-white" : "bg-accent-400 text-ink-950")}>
                {isProvider && meta && <CategoryIcon category={meta.id} size={16} className="rounded" />}
                {isProvider ? meta?.label ?? "Provider" : "Customer"} · {displayCity}
              </span>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
            {[
              { label: "Rating", value: `${displayUser.rating}★` },
              { label: "Reviews", value: `${displayUser.reviews}` },
              { label: isProvider ? "Jobs done" : "Jobs", value: isProvider ? `${displayUser.jobsCompleted ?? 0}` : `${completed}` },
            ].map((s, i) => (
              <div key={i}>
                <p className="font-display text-lg font-extrabold">{s.value}</p>
                <p className="text-[11px] text-white/60">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">📍 Your City & Area</h3>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{displayCity}</span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">City:</span><span className="font-semibold text-ink-900">{displayCity}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">Map Center:</span><span className="text-xs font-medium text-ink-700">{location.city} · {location.address.substring(0,28)}...</span></div>
            <div className="flex justify-between"><span className="text-ink-500">Mode:</span><span className="text-xs font-medium text-emerald-600">City-based (precise ignored)</span></div>
            <p className="pt-2 text-[11px] leading-relaxed text-ink-400">
              {isProvider ? `You see requests only from ${displayCity}. Customer in ${displayCity} → you get LIVE.` : `You see online ${displayCity} providers only. Requests go to ${displayCity} pros.`}
            </p>
          </div>
        </div>

        {isProvider && meta && (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card">
            <CategoryIcon category={meta.id} size={44} />
            <div className="flex-1">
              <p className="font-display text-sm font-bold text-ink-900">{meta.label}</p>
              <p className="text-xs text-ink-500">{meta.tagline} · {displayCity} · Rs {fullProfile?.defaultVisitingCharge || displayUser.defaultVisitingCharge || 500} default</p>
            </div>
            <div className="text-right">
              <p className="font-display text-sm font-bold text-ink-900">{displayUser.radiusKm} km</p>
              <p className="text-[11px] text-ink-400">Radius</p>
            </div>
          </div>
        )}

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

        <button onClick={logout} className="tap-highlight-none flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 font-semibold text-rose-500 shadow-card">
          <LogoutIcon className="h-5 w-5" /> Log out
        </button>

        <p className="pb-2 text-center text-[11px] text-ink-400">uFix · v1.0 · {displayCity} · 35 Pakistan cities · Fast profile</p>
      </div>
    </div>
  );
}

export function EditProfileScreen() {
  const { user, updateProfile, back, location } = useApp();
  const [name, setName] = useState(user?.name ?? "");
  // Post-Audit Fix P4: city is now editable here (same Pakistan-cities vocabulary as onboarding)
  const [city, setCity] = useState(user?.city ?? location.city ?? "");
  const isProvider = user?.role === "provider";
  const meta = user?.category ? categoryById(user.category) : null;
  const allCities = useMemo(() => getAllCities(), []);
  const cityChanged = city !== (user?.city ?? "");

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
          <Avatar initials={user?.avatar ?? "?"} color={user?.color ?? "#167a6c"} size={80} online={isProvider ? user?.isOnline : undefined} src={user?.profilePicture} />
          <p className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-400">
            <Stars value={user?.rating ?? 4.8} size={13} /> {user?.rating} · {user?.reviews} reviews
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-700">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-14 w-full rounded-2xl border-2 border-ink-200 bg-white px-4 text-[15px] font-medium text-ink-900 outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-700">Phone number</label>
            {/* Pre-Deploy Fix (Item 1): phone is the LOGIN IDENTITY. The backend deliberately
                ignores it in PATCH /profile (a real change needs a fresh OTP to the NEW number -
                out of scope). Previously this was an editable input whose value was silently
                accepted-and-discarded (worse: it desynced local state from the backend until
                reload). Now: honest read-only display, no dead-end editing. */}
            <div className="flex h-14 w-full items-center justify-between rounded-2xl border-2 border-ink-100 bg-ink-50 px-4">
              <span className="text-[15px] font-medium text-ink-600">{user?.phone ?? "—"}</span>
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">Login ID</span>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">Phone number cannot be changed — it is used for login verification.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-700">City</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-14 w-full rounded-2xl border-2 border-ink-200 bg-white px-4 text-[15px] font-medium text-ink-900 outline-none focus:border-brand-500"
            >
              {!allCities.some(c => c.name === city) && city && <option value={city}>{city}</option>}
              {allCities.map(c => (
                <option key={c.name} value={c.name}>{c.name} · {c.province}</option>
              ))}
            </select>
            {cityChanged && (
              <p className="mt-1.5 text-[11px] text-ink-400">
                Saving will move your map + matching to <span className="font-semibold text-ink-700">{city}</span> (coordinates update automatically).
              </p>
            )}
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
        <Button full size="lg" disabled={!name.trim() || !city.trim()} onClick={() => { updateProfile(name.trim(), city.trim()); back(); }}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
