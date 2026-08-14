import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { searchPlaces, type PlaceResult } from "@/lib/location";
import { ChevronDownIcon, CloseIcon, LocateIcon, MapPinIcon, SearchIcon } from "./ui";

export function PlaceSearch() {
  const { location, resetLocation, searchLocation } = useApp();
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setActive(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchPlaces(query);
      setResults(r);
      setLoading(false);
    }, 380);
    return () => {
      clearTimeout(t);
      setLoading(false);
    };
  }, [query]);

  const select = (p: PlaceResult) => {
    searchLocation(p);
    setQuery("");
    setActive(false);
  };

  return (
    <div ref={ref} className="relative z-30">
      {!active ? (
        <div className="flex w-full items-center gap-1 rounded-2xl bg-white p-1.5 pl-2 shadow-soft backdrop-blur">
          <button
            onClick={() => setActive(true)}
            className="tap-highlight-none flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-1.5 text-left active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <MapPinIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-ink-400">Service location</span>
              <span className="block truncate text-sm font-semibold text-ink-900">
                📍 {location.address}
              </span>
            </span>
            <ChevronDownIcon className="h-5 w-5 shrink-0 text-ink-400" />
          </button>
          {location.custom && (
            <button
              onClick={resetLocation}
              className="tap-highlight-none flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-glow active:scale-95"
              aria-label="Use my current location"
            >
              <LocateIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-float">
          <div className="flex items-center gap-2 px-3.5">
            <SearchIcon className="h-5 w-5 shrink-0 text-ink-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search area, street or landmark"
              className="h-12 w-full bg-transparent text-[15px] font-medium text-ink-900 outline-none placeholder:text-ink-300"
            />
            <button
              onClick={() => {
                setQuery("");
                setActive(false);
              }}
              className="tap-highlight-none -mr-1 rounded-lg p-1 text-ink-400 hover:bg-ink-100"
              aria-label="Close search"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="border-t border-ink-100">
            <button
              onClick={() => {
                resetLocation();
                setActive(false);
              }}
              className="tap-highlight-none flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-ink-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <LocateIcon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-ink-800">Use my current location</span>
            </button>

            {loading && (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-ink-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
                Searching…
              </div>
            )}

            {!loading && query && results.length === 0 && (
              <div className="px-4 py-5 text-center text-sm text-ink-400">
                No places found for “{query}”.
              </div>
            )}

            {!loading && results.length > 0 && (
              <ul className="max-h-72 overflow-y-auto">
                {results.map((p, i) => (
                  <li key={i}>
                    <button
                      onClick={() => select(p)}
                      className="tap-highlight-none flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-ink-50"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                        <MapPinIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink-800">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-ink-400">{p.label}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
