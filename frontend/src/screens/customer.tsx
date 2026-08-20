/**
 * Customer Screens - 100% Real Backend, No Mock, City-Based Providers
 */

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/lib/store";
import { CATEGORIES, categoryById, type Category, type Offer } from "@/lib/types";
import { MapView, type MapMarker } from "@/components/MapView";
import { GoogleMapView } from "@/components/GoogleMap";
import { NotificationBell } from "@/components/notifications";
import { PlaceSearch } from "@/components/PlaceSearch";
import { DEFAULT_COORDS, offsetToCoords, reverseGeocode, isGoogleMapsAvailable } from "@/lib/location";
import {
  Avatar,
  BanknoteIcon,
  Button,
  CategoryIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  EmptyState,
  MapPinIcon,
  NavigateIcon,
  PlusIcon,
  ShieldIcon,
  Skeleton,
  Stars,
} from "@/components/ui";
import { api } from "@/lib/api";
import { adaptBackendOfferToFrontendOffer } from "@/lib/adapters";
import { socketClient } from "@/lib/socket";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function CustomerHome() {
  const { user, navigate, draftCategory, setDraftCategory, location, jobs } = useApp();
  const firstName = user?.name.split(" ")[0] ?? "there";
  const markers: MapMarker[] = useMemo(() => [{ x: 50, y: 52, kind: "user" }], [location.coords]);
  const useGoogle = isGoogleMapsAvailable();
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  // Pre-Deploy Item 3: compact reminder on Home while a request is open / a job is active.
  // One line + tap target only - the full content stays on the Jobs tab / Offers / Active Job.
  const openRequest = useMemo(
    () => jobs.find((j: any) => j._originalStatus === 'pending' || j.status === 'open') || null,
    [jobs]
  );
  const activeJobLike = useMemo(
    () => (openRequest ? null : jobs.find((j: any) => ["accepted", "on_the_way", "arrived", "in_progress"].includes(j.status)) || null),
    [jobs, openRequest]
  );
  const requestReminder = openRequest ? (
    <button
      onClick={() => navigate("offers")}
      className="tap-highlight-none flex w-full items-center gap-2.5 rounded-2xl bg-white/95 px-4 py-3 shadow-soft backdrop-blur active:scale-[0.99]"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" /></span>
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink-900">You have an open request — tap to view offers</span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-400" />
    </button>
  ) : activeJobLike ? (
    <button
      onClick={() => navigate("activeJob")}
      className="tap-highlight-none flex w-full items-center gap-2.5 rounded-2xl bg-white/95 px-4 py-3 shadow-soft backdrop-blur active:scale-[0.99]"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink-900">Active job in progress — tap to open</span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-400" />
    </button>
  ) : null;

  useEffect(() => {
    const fetchOnline = async () => {
      try {
        const city = location.city || user?.city || "";
        if (!city) return;
        const data = await api.providers.available({ city, category: draftCategory });
        setOnlineCount(data.count);
      } catch {}
    };
    fetchOnline();
    const iv = setInterval(fetchOnline, 8000);
    return () => clearInterval(iv);
  }, [location.city, user?.city, draftCategory]);

  return (
    <div className="relative h-full">
      {useGoogle && location.coords ? (
        <GoogleMapView className="absolute inset-0" markers={markers} center={location.coords} cityName={location.city}>
          <div className="absolute inset-x-0 top-0 z-30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white/95 py-2 pl-2 pr-4 shadow-soft backdrop-blur">
                <Avatar initials={user?.avatar ?? "?"} color={user?.color ?? "#167a6c"} size={40} />
                <div className="leading-tight">
                  <p className="text-[11px] font-medium text-ink-500">{greeting()} 👋</p>
                  <p className="font-display text-sm font-bold text-ink-900">{firstName} · {location.city}</p>
                </div>
              </div>
              <NotificationBell />
            </div>
            <div className="mt-3"><PlaceSearch /></div>
            {onlineCount !== null && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-soft">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                {onlineCount} {draftCategory} online in {location.city}
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 top-[190px] z-10 px-4">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((c) => {
                const active = draftCategory === c.id;
                return (
                  <button key={c.id} onClick={() => setDraftCategory(c.id)} className={cn("tap-highlight-none flex shrink-0 items-center gap-2 rounded-full py-2 pl-2 pr-4 text-sm font-semibold shadow-soft active:scale-95", active ? "bg-ink-950 text-white" : "bg-white/95 text-ink-700")}>
                    <CategoryIcon category={c.id} size={26} className="rounded-lg" />{c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-5 z-20 space-y-2.5 px-4">
            {requestReminder}
            <button onClick={() => navigate("newRequest")} className="tap-highlight-none flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-accent-400 to-accent-500 font-display text-base font-bold text-ink-950 shadow-[0_16px_40px_-10px_rgba(249,143,7,0.6)] active:scale-[0.98]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-950 text-accent-400"><PlusIcon className="h-4 w-4" /></span>
              Request a service in {location.city}
            </button>
          </div>
        </GoogleMapView>
      ) : (
        <MapView className="absolute inset-0" markers={markers} cityName={location.city}>
          <div className="absolute inset-x-0 top-0 z-30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white/95 py-2 pl-2 pr-4 shadow-soft backdrop-blur">
                <Avatar initials={user?.avatar ?? "?"} color={user?.color ?? "#167a6c"} size={40} />
                <div className="leading-tight">
                  <p className="text-[11px] font-medium text-ink-500">{greeting()} 👋</p>
                  <p className="font-display text-sm font-bold text-ink-900">{firstName} · {location.city}</p>
                </div>
              </div>
              <NotificationBell />
            </div>
            <div className="mt-3"><PlaceSearch /></div>
            {onlineCount !== null && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-soft">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                {onlineCount} {draftCategory} online in {location.city}
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 top-[190px] z-10 px-4">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((c) => {
                const active = draftCategory === c.id;
                return (
                  <button key={c.id} onClick={() => setDraftCategory(c.id)} className={cn("tap-highlight-none flex shrink-0 items-center gap-2 rounded-full py-2 pl-2 pr-4 text-sm font-semibold shadow-soft active:scale-95", active ? "bg-ink-950 text-white" : "bg-white/95 text-ink-700")}>
                    <CategoryIcon category={c.id} size={26} className="rounded-lg" />{c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-5 z-20 space-y-2.5 px-4">
            {requestReminder}
            <button onClick={() => navigate("newRequest")} className="tap-highlight-none flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-accent-400 to-accent-500 font-display text-base font-bold text-ink-950 shadow-[0_16px_40px_-10px_rgba(249,143,7,0.6)] active:scale-[0.98]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-950 text-accent-400"><PlusIcon className="h-4 w-4" /></span>
              Request a service in {location.city}
            </button>
          </div>
        </MapView>
      )}
    </div>
  );
}

export function NewRequest() {
  const { back, postRequest, draftCategory, setDraftCategory, location, isLoading } = useApp();
  const [category, setCategory] = useState<Category>(draftCategory);
  const [desc, setDesc] = useState("");
  const [loc, setLoc] = useState({ x: 50, y: 50 });
  const [address, setAddress] = useState(location.address);
  const [resolving, setResolving] = useState(false);
  const meta = categoryById(category);
  const base = location.coords ?? DEFAULT_COORDS;

  useEffect(() => { setAddress(location.address); }, [location.address]);
  useEffect(() => {
    setResolving(true);
    const t = setTimeout(async () => {
      try { const c = offsetToCoords(loc.x, loc.y, base); const r = await reverseGeocode(c.lat, c.lng); setAddress(r.address); } finally { setResolving(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [loc.x, loc.y, base.lat, base.lng]);

  const canPost = desc.trim().length >= 8;
  const isPosting = isLoading['postRequest'];
  const submit = () => { if (!canPost || isPosting) return; postRequest(category, desc.trim(), { x: loc.x, y: loc.y, label: address }, address); };

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
        <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 active:scale-95"><ChevronLeftIcon className="h-5 w-5" /></button>
        <div className="flex-1"><h1 className="font-display text-lg font-bold text-ink-900">New request</h1><p className="text-xs text-ink-500">Service in {location.city} · {address.substring(0,30)}</p></div>
        <CategoryIcon category={category} size={38} />
      </header>
      <div className="flex-1 overflow-y-auto p-4 pb-28">
        <div className="animate-slide-up">
          <label className="mb-2 block text-sm font-semibold text-ink-700">Service category</label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (<button key={c.id} onClick={() => { setCategory(c.id); setDraftCategory(c.id); }} className={cn("flex flex-col items-center gap-1.5 rounded-2xl border-2 bg-white py-3 active:scale-95", active ? "border-brand-500" : "border-ink-200")}><CategoryIcon category={c.id} size={40} soft={!active} /><span className={cn("text-xs font-semibold", active ? "text-ink-900" : "text-ink-500")}>{c.label}</span></button>);
            })}
          </div>
        </div>
        <div className="animate-slide-up mt-5" style={{ animationDelay: "60ms" }}>
          <label className="mb-2 block text-sm font-semibold text-ink-700">What's the problem?</label>
          <div className="relative rounded-2xl border-2 border-ink-200 bg-white focus-within:border-brand-500">
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={280} placeholder={`e.g. ${meta.examples[0]}...`} className="w-full resize-none rounded-2xl bg-transparent p-4 text-[15px] font-medium text-ink-900 outline-none placeholder:text-ink-300" />
            <span className="absolute bottom-3 right-4 text-[11px] font-medium text-ink-300">{desc.length}/280</span>
          </div>
        </div>
        <div className="animate-slide-up mt-5" style={{ animationDelay: "120ms" }}>
          <div className="mb-2 flex items-center justify-between"><label className="text-sm font-semibold text-ink-700">Pin your location in {location.city}</label><span className="flex items-center gap-1 text-xs font-medium text-brand-700"><NavigateIcon className="h-3.5 w-3.5" /> Drag</span></div>
          <div className="relative h-52 overflow-hidden rounded-2xl shadow-soft"><MapView className="absolute inset-0" pin={loc} onPinMove={(x, y) => setLoc({ x, y })} cityName={location.city} /></div>
          <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-soft"><MapPinIcon className="h-4 w-4 shrink-0 text-brand-600" /><span className="truncate text-sm font-medium text-ink-700">{address}</span>{resolving && <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />}</div>
          <p className="mt-2 text-[11px] text-emerald-600">✓ Request will go to {location.city} {category} providers only (city-based, precise location ignored as requested)</p>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-ink-100 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button full size="lg" onClick={submit} disabled={!canPost || isPosting}>{isPosting ? <span className="flex items-center gap-2"><span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-900/20 border-t-ink-900" />Posting in {location.city}...</span> : `Post request in ${location.city}`}</Button>
      </div>
    </div>
  );
}

function OfferCard({ offer, onAccept, onDecline, index, isAccepting }: { offer: Offer; onAccept: () => void; onDecline: () => void; index: number; isAccepting?: boolean; }) {
  return (
    <div className="animate-slide-in-right rounded-2xl bg-white p-4 shadow-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-center gap-3">
        <Avatar initials={offer.avatarInitials} color={offer.avatarColor} size={46} online />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><span className="truncate font-display text-[15px] font-bold text-ink-900">{offer.providerName}</span><ShieldIcon className="h-4 w-4 shrink-0 text-brand-600" /></div>
          <div className="mt-0.5 flex items-center gap-1.5"><Stars value={offer.providerRating} size={14} /><span className="text-xs font-semibold text-ink-700">{offer.providerRating}</span><span className="text-xs text-ink-400">({offer.providerReviews})</span></div>
        </div>
        <div className="text-right"><p className="text-[11px] font-medium text-ink-400">Visiting charge</p><p className="font-display text-2xl font-extrabold text-accent-600">PKR {offer.visitingCharge}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2"><ClockIcon className="h-4 w-4 text-brand-600" /><span className="text-xs font-semibold text-ink-700">ETA {offer.etaMin} min</span></div>
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2"><NavigateIcon className="h-4 w-4 text-brand-600" /><span className="text-xs font-semibold text-ink-700">{offer.distanceKm} km</span></div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={onAccept} disabled={isAccepting}>{isAccepting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : "Accept & unlock contact"}</Button>
        <button onClick={onDecline} disabled={isAccepting} className="tap-highlight-none flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500"><CloseIcon className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function OffersScreen() {
  const { back, jobs, activeRequestId, acceptOffer, declineOffer, cancelRequest, isLoading, location, navigate } = useApp();
  const [sort, setSort] = useState<"price" | "eta">("price");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [elapsed, setElapsed] = useState(false);

  const request = useMemo(() => {
    if (activeRequestId) return jobs.find((j) => j.id === activeRequestId);
    const openRequests = jobs.filter((j: any) => j._originalStatus === 'pending' || j.status === 'open' || j.status === 'accepted').sort((a, b) => b.createdAt - a.createdAt);
    return openRequests[0];
  }, [jobs, activeRequestId]);

  const effectiveRequestId = request?.id || activeRequestId;

  useEffect(() => {
    if (!effectiveRequestId) { setLoadingOffers(false); return; }
    let isMounted = true;
    let pollInterval: number | null = null;
    const fetchOffers = async (isInitial = false) => {
      try {
        if (isInitial) setLoadingOffers(true);
        const data = await api.offers.getForRequest(effectiveRequestId);
        const backendOffers = data.offers || [];
        // Bidirectional Sync: hide offers that were declined/rejected - a declined offer must not
        // reappear on the customer's screen via polling (request stays open for the remaining ones)
        const pendingOnly = backendOffers.filter((o: any) => o.status !== 'rejected');
        const adapted: Offer[] = pendingOnly.map((o: any) => adaptBackendOfferToFrontendOffer(o, { category: request?.category }));
        if (isMounted) { setOffers(adapted); console.log(`[OffersScreen] Fetched ${adapted.length} pending offers for ${effectiveRequestId} city ${location.city}`); }
      } catch (err: any) { console.error('Failed to fetch offers', err); } finally { if (isInitial && isMounted) setLoadingOffers(false); }
    };
    fetchOffers(true);
    pollInterval = window.setInterval(() => fetchOffers(false), 2000);
    const handleOfferNew = (data: any) => {
      try {
        const offerData = data.offer || data;
        const reqId = offerData.request?.id || offerData.request?.toString();
        if (reqId && reqId !== effectiveRequestId) return;
        const adapted = data.frontend || adaptBackendOfferToFrontendOffer(offerData, { category: request?.category });
        if (isMounted) setOffers(prev => { if (prev.some(o => o.id === adapted.id)) return prev; return [...prev, adapted]; });
      } catch {}
    };
    const offDirect = socketClient.on('offer:new', handleOfferNew);
    const t = setTimeout(() => setElapsed(true), 7000);
    return () => { isMounted = false; clearTimeout(t); if (pollInterval) clearInterval(pollInterval); offDirect(); };
  }, [effectiveRequestId, request?.category, location.city]);

  useEffect(() => {
    if (request && request.offers && request.offers.length > 0) {
      setOffers(prev => {
        const existingIds = new Set(prev.map(o => o.id));
        const newOffers = request.offers.filter(o => !existingIds.has(o.id) && o.status !== 'rejected');
        if (newOffers.length > 0) return [...prev, ...newOffers];
        return prev;
      });
    }
  }, [request?.offers]);

  // Expiry pass (Part 2): most recent auto-expired request, for the empty state below
  const latestExpired = jobs.filter((j: any) => j.status === 'cancelled' && j.cancelledReason === 'expired')
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;

  if (!request) {
    return (
      <div className="flex h-full flex-col bg-ink-50">
        <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
          <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100"><ChevronLeftIcon className="h-5 w-5" /></button>
          <h1 className="font-display text-lg font-bold text-ink-900">Offers</h1>
        </header>
        {latestExpired ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl">⏰</div>
            <h3 className="font-display text-base font-bold text-ink-900">Expired — no providers responded in time</h3>
            <p className="max-w-[280px] text-sm text-ink-500">Requests stay live for 20 minutes. “{latestExpired.description}” got no accepted offer before it expired.</p>
            <Button size="sm" onClick={() => navigate("newRequest")}>Post again</Button>
            <Button size="sm" variant="outline" onClick={back}>Go to Home</Button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-ink-500">No active request found in {location.city}.</p>
            <Button size="sm" onClick={back}>Go to Home</Button>
          </div>
        )}
      </div>
    );
  }

  const sortedOffers = [...offers].sort((a, b) => (sort === "price" ? a.visitingCharge - b.visitingCharge : a.etaMin - b.etaMin));
  const meta = categoryById(request.category);
  const isAccepting = isLoading['acceptOffer'];

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="bg-white px-4 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100"><ChevronLeftIcon className="h-5 w-5" /></button>
          <div className="flex-1"><h1 className="font-display text-lg font-bold text-ink-900">Incoming offers</h1><p className="text-xs text-ink-500">{location.city} · {offers.length} offers · Live</p></div>
          <CategoryIcon category={request.category} size={38} />
        </div>
        <div className="mt-3 rounded-2xl bg-ink-50 px-4 py-3">
          <p className="line-clamp-2 text-sm font-medium text-ink-700">“{request.description}”</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500"><MapPinIcon className="h-3.5 w-3.5" /> {request.address} · {location.city}<span className="text-ink-300">·</span><span className="font-semibold text-brand-700">{meta.label}</span></div>
        </div>
      </header>
      {sortedOffers.length > 0 && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="text-xs font-medium text-ink-500">Sort by</span>
          <div className="flex rounded-full bg-ink-100 p-0.5">
            {(["price", "eta"] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", sort === s ? "bg-white text-ink-900 shadow-sm" : "text-ink-500")}>{s === "price" ? "Lowest charge" : "Fastest"}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {loadingOffers ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2.5 py-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" /></span><span className="text-sm font-semibold text-ink-600">Finding {meta.plural.toLowerCase()} in {location.city}…</span></div>
            {[0,1,2].map(i=><div key={i} className="rounded-2xl bg-white p-4 shadow-card"><Skeleton className="h-12 w-full" /></div>)}
          </div>
        ) : sortedOffers.length === 0 ? (
          elapsed ? <EmptyState icon={<ClockIcon className="h-9 w-9" />} title={`No offers yet in ${location.city}`} subtitle={`${location.city} pros are being notified. Offers will appear live within 2 seconds.`} /> :
          <div className="flex items-center justify-center gap-2.5 py-4"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" /></span><span className="text-sm font-semibold text-ink-600">Finding {meta.plural.toLowerCase()} in {location.city}…</span></div>
        ) : (
          <div className="space-y-3">{sortedOffers.map((o,i)=><OfferCard key={o.id} offer={o} index={i} isAccepting={isAccepting} onAccept={()=>acceptOffer(request.id,o)} onDecline={()=>{ setOffers(prev=>prev.filter(x=>x.id!==o.id)); declineOffer(request.id,o.id); }} />)}</div>
        )}
      </div>
      <div className="border-t border-ink-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-ink-500"><BanknoteIcon className="h-4 w-4 shrink-0 text-emerald-600" /><span>Fee for {location.city} · pay on site</span></div>
          <button onClick={()=>cancelRequest(request.id)} className="shrink-0 text-xs font-semibold text-rose-500">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function AvailableProvidersScreen() {
  const { back, jobs, activeRequestId, location, draftCategory, isLoading, directBookRequest } = useApp();
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const request = useMemo(() => {
    if (activeRequestId) return jobs.find((j) => j.id === activeRequestId);
    const openRequests = jobs.filter((j: any) => j._originalStatus === 'pending' || j.status === 'open').sort((a,b)=>b.createdAt-a.createdAt);
    return openRequests[0];
  }, [jobs, activeRequestId]);

  const effectiveRequestId = request?.id || activeRequestId;

  const fetchAvailable = async () => {
    try {
      setLoading(true);
      const city = location.city || "";
      const category = request?.category || draftCategory;
      if (!city) { setLoading(false); return; }
      const data = await api.providers.available({ city, category });
      setProviders(data.providers || []);
      console.log(`[AvailableProviders] ${data.count} online ${category} in ${city}`);
    } catch (e) {
      console.error('Failed to fetch available providers', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAvailable(); const iv = setInterval(fetchAvailable, 5000); return () => clearInterval(iv); }, [location.city, draftCategory, effectiveRequestId]);

  const handleBook = async (provider: any) => {
    if (!effectiveRequestId) return;
    // Bidirectional Sync (Part A fix): directBookRequest now performs the full
    // accept → contact-unlock → auto-navigate-to-Active-Job sequence in the store.
    // (Previously this dispatched a `ufix:booked` window event that nothing listened to,
    // plus a blocking alert() on failure — both removed as dead-end UI.)
    try {
      setBookingId(provider.id);
      await directBookRequest(effectiveRequestId, provider.id);
    } finally {
      setBookingId(null);
    }
  };

  if (!request) {
    return (
      <div className="flex h-full flex-col bg-ink-50">
        <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
          <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100"><ChevronLeftIcon className="h-5 w-5" /></button>
          <h1 className="font-display text-lg font-bold text-ink-900">Available Providers</h1>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium text-ink-500">No active request in {location.city}</p>
          <Button size="sm" onClick={back}>Go Home</Button>
        </div>
      </div>
    );
  }

  const meta = categoryById(request.category as any);

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="bg-white px-4 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100"><ChevronLeftIcon className="h-5 w-5" /></button>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-ink-900">Providers in {location.city}</h1>
            <p className="text-xs text-ink-500">{providers.length} {request.category} online • Direct booking with price from profile</p>
          </div>
          <CategoryIcon category={request.category as any} size={38} />
        </div>
        <div className="mt-3 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">📍 {request.address} • {location.city}</p>
          <p className="mt-1 text-xs text-emerald-600">Showing only online verified {request.category} providers in {location.city} with their profile price. No need to wait for offers - book directly!</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            {[0,1,2].map(i=><div key={i} className="rounded-2xl bg-white p-4 shadow-card animate-pulse"><Skeleton className="h-12 w-full" /></div>)}
          </div>
        ) : providers.length === 0 ? (
          <EmptyState icon={<ClockIcon className="h-9 w-9" />} title={`No ${request.category} online in ${location.city}`} subtitle={`No ${request.category} providers online in ${location.city} right now. Try refreshing or wait for offers via old flow.`} />
        ) : (
          <div className="space-y-3">
            {providers.map((p: any, idx: number) => (
              <div key={p.id} className="animate-slide-in-right rounded-2xl bg-white p-4 shadow-card" style={{ animationDelay: `${idx*60}ms` }}>
                <div className="flex items-center gap-3">
                  <Avatar initials={p.name?.split(' ').map((x:string)=>x[0]).slice(0,2).join('').toUpperCase() || 'P'} color={p.name ? `hsl(${p.name.length*40},70%,40%)` : '#167a6c'} size={46} online />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="truncate font-display text-[15px] font-bold text-ink-900">{p.name}</span><ShieldIcon className="h-4 w-4 shrink-0 text-brand-600" /></div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                      <span className="font-semibold" style={{ color: meta.color }}>{p.category}</span>
                      <span className="text-ink-300">·</span><span>{p.city}</span>
                      <span className="text-ink-300">·</span><Stars value={p.rating || 4.8} size={12} /><span className="font-semibold">{p.rating || 4.8}</span>
                    </div>
                  </div>
                  <div className="text-right"><p className="text-[11px] font-medium text-ink-400">Price</p><p className="font-display text-2xl font-extrabold text-accent-600">PKR {p.defaultVisitingCharge || 500}</p></div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2"><MapPinIcon className="h-4 w-4 text-brand-600" /><span className="text-xs font-semibold text-ink-700">{p.city} • Online</span></div>
                  <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2"><ClockIcon className="h-4 w-4 text-brand-600" /><span className="text-xs font-semibold text-ink-700">{p.yearsExperience || 5} yrs exp</span></div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="flex-1" onClick={()=>handleBook(p)} disabled={!!bookingId}>
                    {bookingId===p.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : `Book Now - PKR ${p.defaultVisitingCharge || 500}`}
                  </Button>
                </div>
                <p className="mt-2 text-center text-[10px] text-ink-400">Direct booking with price from provider profile • No offer wait needed • Same city {location.city} only</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-ink-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-500">Showing only online verified {request.category} in {location.city} • Category filter: {request.category} only as requested</p>
          <button onClick={fetchAvailable} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-card">Refresh</button>
        </div>
      </div>
    </div>
  );
}
