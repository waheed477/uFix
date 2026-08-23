/**
 * SoundPreviewScreen — TEMPORARY developer-only sound candidate A/B panel (2026-08-23).
 *
 * REMOVE BEFORE PRODUCTION DEPLOYMENT (or keep the import.meta.env.DEV gate in place —
 * the entry button in profile.tsx is only rendered when `import.meta.env.DEV` is true, so
 * it cannot appear in a production build; this screen itself is also gated below).
 *
 * Purpose: tap each candidate function directly to listen and compare, without triggering
 * real app events. Candidates live in frontend/src/lib/sound.ts; the WIRED default per
 * category is marked "DEFAULT ★" — to swap it, change the one inner line of
 * playNotificationTone / playNewRequestTone / playBookingConfirmedTone in lib/sound.ts.
 *
 * Note: candidates share the real anti-stacking gap (550ms) so rapid taps collapse — wait
 * ~0.6s between taps (this panel resets the test guard between taps so A/B within a category
 * is still instant).
 */

import { useState } from "react";
import { useApp } from "@/lib/store";
import { ChevronLeftIcon } from "@/components/ui";
import {
  playNotificationA,
  playNotificationB,
  playNewRequestA,
  playNewRequestB,
  playBookingConfirmedA,
  playBookingConfirmedB,
  resetSoundGuardsForTests,
} from "@/lib/sound";

type Candidate = { name: string; fn: () => void; desc: string; isDefault: boolean };
type Row = { title: string; subtitle: string; candidates: Candidate[] };

const ROWS: Row[] = [
  {
    title: "1 — General notification",
    subtitle: "new offer · chat message · status update · decline · rating",
    candidates: [
      { name: "playNotificationA", fn: playNotificationA, desc: "Soft two-note ding-dong chime rise (G5→B5), ~230ms", isDefault: false },
      { name: "playNotificationB", fn: playNotificationB, desc: "Short soft pop / bubble with quick pitch bend, ~170ms", isDefault: true },
    ],
  },
  {
    title: "2 — New-request alert (provider)",
    subtitle: "the “you might earn work” signal + vibration · candidates REPLACED 2026-08-23 (ascending run / double-ping retired)",
    candidates: [
      { name: "playNewRequestA", fn: playNewRequestA, desc: "Knock: low sharp-attack thump with pitch fall + faint tick (~0.25s)", isDefault: true },
      { name: "playNewRequestB", fn: playNewRequestB, desc: "Marimba pluck: woody A5 mallet note + quiet octave shimmer (~0.35s)", isDefault: false },
    ],
  },
  {
    title: "3 — Booking / accept confirmation",
    subtitle: "offer accepted — customer action + provider offer:accepted · candidates REPLACED 2026-08-23 (arpeggio / swoosh retired)",
    candidates: [
      { name: "playBookingConfirmedA", fn: playBookingConfirmedA, desc: "Cha-ching: clean E6→G6 double-tone 60ms apart, payment-app feel (~0.35s)", isDefault: true },
      { name: "playBookingConfirmedB", fn: playBookingConfirmedB, desc: "Warm sustained E5 hold with gentle end vibrato/shimmer (~0.65s)", isDefault: false },
    ],
  },
];

export function SoundPreviewScreen() {
  const { back } = useApp();
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);

  // Hard gate: dead UI even if something ever navigates here in a production bundle.
  if (!import.meta.env.DEV) return null;

  const play = (c: Candidate) => {
    resetSoundGuardsForTests(); // preview-only: bypass the real dedup/gap so A/B is instant
    c.fn();
    setLastPlayed(c.name);
    setTimeout(() => setLastPlayed((cur) => (cur === c.name ? null : cur)), 900);
  };

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
        <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 active:scale-95">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-display text-lg font-bold text-ink-900">🎧 Sound Preview</h1>
          <p className="text-xs text-ink-500">DEV ONLY — remove before production (see project_context.md)</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">DEV</span>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          Tap a candidate to hear it. ★ marks the wired default used by the real app events. To change a default, edit the single marked line in <span className="font-mono">lib/sound.ts</span> (playNotificationTone / playNewRequestTone / playBookingConfirmedTone).
        </div>
        {ROWS.map((row) => (
          <div key={row.title} className="rounded-2xl bg-white p-4 shadow-card">
            <h2 className="font-display text-sm font-bold text-ink-900">{row.title}</h2>
            <p className="mt-0.5 text-[11px] text-ink-400">{row.subtitle}</p>
            <div className="mt-3 space-y-2">
              {row.candidates.map((c) => (
                <button
                  key={c.name}
                  onClick={() => play(c)}
                  className={`tap-highlight-none flex w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left active:scale-[0.98] ${lastPlayed === c.name ? "border-brand-500 bg-brand-50" : "border-ink-100 bg-white"}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-950 text-white">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" /></svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-ink-900">{c.name}()</span>
                      {c.isDefault && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">DEFAULT ★</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-400">{c.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="pb-2 text-center text-[10px] text-ink-300">Candidates share the production dedup + 550ms anti-stack gap; this panel resets guards between taps for quick comparison only.</p>
      </div>
    </div>
  );
}
