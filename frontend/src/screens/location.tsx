import { useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import { DEFAULT_CITY } from "@/lib/location";
import { Button, ClockIcon, LocateIcon, MapPinIcon } from "@/components/ui";

export function LocationPermissionScreen() {
  const { requestLocation, skipLocation, location, user } = useApp();
  const requesting = location.status === "requesting";

  // Post-Audit Decision 6: inDrive-style AUTO-PROMPT. The friendly explanation is already
  // on screen; shortly after mount the native browser permission prompt fires automatically.
  // The button remains as a retry/fallback action (browsers ignore duplicate concurrent
  // geolocation calls, and re-prompting is allowed if the user didn't hard-block).
  const autoPromptFiredRef = useRef(false);
  useEffect(() => {
    if (autoPromptFiredRef.current) return;
    autoPromptFiredRef.current = true;
    const t = window.setTimeout(() => requestLocation(), 700);
    return () => window.clearTimeout(t);
  }, [requestLocation]);

  const fallbackCity = user?.city || location.city || DEFAULT_CITY;

  const bullets = [
    {
      Icon: LocateIcon,
      title: "See pros near you",
      desc: "Get real-time offers from providers in your city area.",
    },
    {
      Icon: ClockIcon,
      title: "Faster arrival estimates",
      desc: "ETAs and distances are estimated from your city area.",
    },
    {
      Icon: MapPinIcon,
      title: "Pin your area",
      desc: "Drag the pin on our stylized area view (free map - not a precise street map).",
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950">
      {/* hero */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-8 text-center">
        <div className="pointer-events-none absolute -left-16 top-10 h-64 w-64 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-accent-500/15 blur-3xl" />

        <div className="relative flex h-44 w-44 items-center justify-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-brand-400/50" />
          <span
            className="absolute inset-5 animate-pulse-ring rounded-full border-2 border-brand-400/40"
            style={{ animationDelay: "0.5s" }}
          />
          <span
            className="absolute inset-10 animate-pulse-ring rounded-full border-2 border-brand-400/30"
            style={{ animationDelay: "1s" }}
          />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
            <LocateIcon className="h-9 w-9" />
          </span>
        </div>

        <h1 className="mt-6 font-display text-[26px] font-extrabold text-white">
          Find help near you
        </h1>
        <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-ink-300">
          uFix uses your location to show nearby pros, accurate arrival times
          and let you pin the exact spot.
        </p>
      </div>

      {/* bottom sheet */}
      <div className="rounded-t-3xl bg-white p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <ul className="space-y-3.5">
          {bullets.map((b) => (
            <li key={b.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <b.Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-900">{b.title}</span>
                <span className="block text-xs leading-relaxed text-ink-500">{b.desc}</span>
              </span>
            </li>
          ))}
        </ul>

        <Button full size="lg" className="mt-6" onClick={requestLocation} disabled={requesting}>
          {requesting ? (
            <span className="flex items-center gap-2">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Locating you…
            </span>
          ) : (
            "Enable location"
          )}
        </Button>
        <p className="mt-2 text-center text-[11px] text-ink-400">
          Your browser should ask for location permission automatically — allow it for the best matches.
        </p>
        <button
          onClick={skipLocation}
          className="mt-3 w-full text-center text-sm font-semibold text-ink-400 transition-colors hover:text-ink-600"
        >
          Use my city: {fallbackCity}
        </button>
      </div>
    </div>
  );
}
