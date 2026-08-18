/**
 * Customer Screens - 100% Real Backend, No Mock Data
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
  const { user, navigate, draftCategory, setDraftCategory, location } = useApp();
  const firstName = user?.name.split(" ")[0] ?? "there";
  const markers: MapMarker[] = useMemo(() => [{ x: 50, y: 52, kind: "user" }], [location.coords]);
  const useGoogle = isGoogleMapsAvailable();

  return (
    <div className="relative h-full">
      {useGoogle && location.coords ? (
        <GoogleMapView className="absolute inset-0" markers={markers} center={location.coords}>
          <div className="absolute inset-x-0 top-0 z-30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 rounded-2xl bg-white/95 py-2 pl-2 pr-4 shadow-soft backdrop-blur">
                <Avatar initials={user?.avatar ?? "?"} color={user?.color ?? "#167a6c"} size={40} />
                <div className="leading-tight">
                  <p className="text-[11px] font-medium text-ink-500">{greeting()} 👋</p>
                  <p className="font-display text-sm font-bold text-ink-900">{firstName} - {location.city}</p>
                </div>
              </div>
              <NotificationBell />
            </div>
            <div className="mt-3">
              <PlaceSearch />
            </div>
          </div>
          <div className="absolute inset-x-0 top-[160px] z-10 px-4">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((c) => {
                const active = draftCategory === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setDraftCategory(c.id)}
                    className={cn(
                      "tap-highlight-none flex shrink-0 items-center gap-2 rounded-full py-2 pl-2 pr-4 text-sm font-semibold shadow-soft transition-all active:scale-95",
                      active ? "bg-ink-950 text-white" : "bg-white/95 text-ink-700"
                    )}
                  >
                    <CategoryIcon category={c.id} size={26} className="rounded-lg" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-5 z-20 px-4">
            <button
              onClick={() => navigate("newRequest")}
              className="tap-highlight-none flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-accent-400 to-accent-500 font-display text-base font-bold text-ink-950 shadow-[0_16px_40px_-10px_rgba(249,143,7,0.6)] transition-transform active:scale-[0.98]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-950 text-accent-400">
                <PlusIcon className="h-4 w-4" />
              </span>
              Request a service in {location.city}
            </button>
          </div>
        </GoogleMapView>
      ) : (
      <MapView className="absolute inset-0" markers={markers}>
        <div className="absolute inset-x-0 top-0 z-30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 rounded-2xl bg-white/95 py-2 pl-2 pr-4 shadow-soft backdrop-blur">
              <Avatar initials={user?.avatar ?? "?"} color={user?.color ?? "#167a6c"} size={40} />
              <div className="leading-tight">
                <p className="text-[11px] font-medium text-ink-500">{greeting()} 👋</p>
                <p className="font-display text-sm font-bold text-ink-900">{firstName}</p>
              </div>
            </div>
            <NotificationBell />
          </div>
          <div className="mt-3">
            <PlaceSearch />
          </div>
        </div>

        <div className="absolute inset-x-0 top-[160px] z-10 px-4">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => {
              const active = draftCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setDraftCategory(c.id)}
                  className={cn(
                    "tap-highlight-none flex shrink-0 items-center gap-2 rounded-full py-2 pl-2 pr-4 text-sm font-semibold shadow-soft transition-all active:scale-95",
                    active ? "bg-ink-950 text-white" : "bg-white/95 text-ink-700"
                  )}
                >
                  <CategoryIcon category={c.id} size={26} className="rounded-lg" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-5 z-20 px-4">
          <button
            onClick={() => navigate("newRequest")}
            className="tap-highlight-none flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-accent-400 to-accent-500 font-display text-base font-bold text-ink-950 shadow-[0_16px_40px_-10px_rgba(249,143,7,0.6)] transition-transform active:scale-[0.98]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-950 text-accent-400">
              <PlusIcon className="h-4 w-4" />
            </span>
            Request a service
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

  useEffect(() => {
    setAddress(location.address);
  }, [location.address]);

  useEffect(() => {
    setResolving(true);
    const t = setTimeout(async () => {
      try {
        const c = offsetToCoords(loc.x, loc.y, base);
        const r = await reverseGeocode(c.lat, c.lng);
        setAddress(r.address);
      } finally {
        setResolving(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [loc.x, loc.y, base.lat, base.lng]);

  const canPost = desc.trim().length >= 8;
  const isPosting = isLoading['postRequest'];

  const submit = () => {
    if (!canPost || isPosting) return;
    postRequest(category, desc.trim(), { x: loc.x, y: loc.y, label: address }, address);
  };

  return (
    <div className="flex h-full flex-col bg-ink-50">
      <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
        <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100 active:scale-95">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-display text-lg font-bold text-ink-900">New request</h1>
          <p className="text-xs text-ink-500">Describe the issue & set your location</p>
        </div>
        <CategoryIcon category={category} size={38} />
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-28">
        <div className="animate-slide-up">
          <label className="mb-2 block text-sm font-semibold text-ink-700">Service category</label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setDraftCategory(c.id);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl border-2 bg-white py-3 transition-all active:scale-95",
                    active ? "border-brand-500" : "border-ink-200"
                  )}
                >
                  <CategoryIcon category={c.id} size={40} soft={!active} />
                  <span className={cn("text-xs font-semibold", active ? "text-ink-900" : "text-ink-500")}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="animate-slide-up mt-5" style={{ animationDelay: "60ms" }}>
          <label className="mb-2 block text-sm font-semibold text-ink-700">What's the problem?</label>
          <div className="relative rounded-2xl border-2 border-ink-200 bg-white focus-within:border-brand-500">
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              maxLength={280}
              placeholder={`e.g. ${meta.examples[0]} — share a few details...`}
              className="w-full resize-none rounded-2xl bg-transparent p-4 text-[15px] font-medium text-ink-900 outline-none placeholder:text-ink-300"
            />
            <span className="absolute bottom-3 right-4 text-[11px] font-medium text-ink-300">{desc.length}/280</span>
          </div>
        </div>

        <div className="animate-slide-up mt-5" style={{ animationDelay: "120ms" }}>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-semibold text-ink-700">Pin your location</label>
            <span className="flex items-center gap-1 text-xs font-medium text-brand-700">
              <NavigateIcon className="h-3.5 w-3.5" /> Drag to fine-tune
            </span>
          </div>
          <div className="relative h-52 overflow-hidden rounded-2xl shadow-soft">
            <MapView className="absolute inset-0" pin={loc} onPinMove={(x, y) => setLoc({ x, y })} />
          </div>
          <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-soft">
            <MapPinIcon className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="truncate text-sm font-medium text-ink-700">{address}</span>
            {resolving && (
              <span className="ml-auto h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
            )}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-ink-100 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button full size="lg" onClick={submit} disabled={!canPost || isPosting}>
          {isPosting ? (
            <span className="flex items-center gap-2">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-900/20 border-t-ink-900" />
              Posting...
            </span>
          ) : (
            "Post request & receive offers"
          )}
        </Button>
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  onAccept,
  onDecline,
  index,
  isAccepting,
}: {
  offer: Offer;
  onAccept: () => void;
  onDecline: () => void;
  index: number;
  isAccepting?: boolean;
}) {
  return (
    <div className="animate-slide-in-right rounded-2xl bg-white p-4 shadow-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-center gap-3">
        <Avatar initials={offer.avatarInitials} color={offer.avatarColor} size={46} online />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display text-[15px] font-bold text-ink-900">{offer.providerName}</span>
            <ShieldIcon className="h-4 w-4 shrink-0 text-brand-600" />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Stars value={offer.providerRating} size={14} />
            <span className="text-xs font-semibold text-ink-700">{offer.providerRating}</span>
            <span className="text-xs text-ink-400">({offer.providerReviews})</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium text-ink-400">Visiting charge</p>
          <p className="font-display text-2xl font-extrabold text-accent-600">₹{offer.visitingCharge}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2">
          <ClockIcon className="h-4 w-4 text-brand-600" />
          <span className="text-xs font-semibold text-ink-700">ETA {offer.etaMin} min</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2">
          <NavigateIcon className="h-4 w-4 text-brand-600" />
          <span className="text-xs font-semibold text-ink-700">{offer.distanceKm} km away</span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={onAccept} disabled={isAccepting}>
          {isAccepting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : "Accept & unlock contact"}
        </Button>
        <button onClick={onDecline} disabled={isAccepting} className="tap-highlight-none flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function OffersScreen() {
  const { back, jobs, activeRequestId, acceptOffer, declineOffer, cancelRequest, isLoading } = useApp();
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
    if (!effectiveRequestId) {
      setLoadingOffers(false);
      return;
    }
    let isMounted = true;
    let pollInterval: number | null = null;

    const fetchOffers = async (isInitial = false) => {
      try {
        if (isInitial) setLoadingOffers(true);
        const data = await api.offers.getForRequest(effectiveRequestId);
        const backendOffers = data.offers || [];
        const adapted: Offer[] = backendOffers.map((o: any) => adaptBackendOfferToFrontendOffer(o, { category: request?.category }));
        if (isMounted) {
          setOffers(adapted);
          console.log(`[OffersScreen] Fetched ${adapted.length} offers for ${effectiveRequestId}`);
        }
      } catch (err: any) {
        console.error('Failed to fetch offers', err);
      } finally {
        if (isInitial && isMounted) setLoadingOffers(false);
      }
    };

    fetchOffers(true);
    pollInterval = window.setInterval(() => fetchOffers(false), 2000);

    const handleOfferNew = (data: any) => {
      console.log('[OffersScreen] Direct socket offer:new', data);
      try {
        const offerData = data.offer || data;
        const reqId = offerData.request?.id || offerData.request?.toString();
        if (reqId && reqId !== effectiveRequestId) return;
        const adapted = data.frontend || adaptBackendOfferToFrontendOffer(offerData, { category: request?.category });
        if (isMounted) {
          setOffers(prev => {
            if (prev.some(o => o.id === adapted.id)) return prev;
            return [...prev, adapted];
          });
        }
      } catch (e) {
        console.error('Direct offer:new failed', e);
      }
    };

    const offDirect = socketClient.on('offer:new', handleOfferNew);
    const t = setTimeout(() => setElapsed(true), 7000);

    return () => {
      isMounted = false;
      clearTimeout(t);
      if (pollInterval) clearInterval(pollInterval);
      offDirect();
    };
  }, [effectiveRequestId, request?.category]);

  useEffect(() => {
    if (request && request.offers && request.offers.length > 0) {
      setOffers(prev => {
        const existingIds = new Set(prev.map(o => o.id));
        const newOffers = request.offers.filter(o => !existingIds.has(o.id));
        if (newOffers.length > 0) return [...prev, ...newOffers];
        return prev;
      });
    }
  }, [request?.offers]);

  if (!request) {
    return (
      <div className="flex h-full flex-col bg-ink-50">
        <header className="flex items-center gap-3 bg-white px-4 py-3.5 shadow-sm">
          <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100">
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold text-ink-900">Offers</h1>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium text-ink-500">No active request found.</p>
          <Button size="sm" onClick={back}>Go to Home</Button>
        </div>
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
          <button onClick={back} className="tap-highlight-none -ml-1 rounded-xl p-1.5 text-ink-600 hover:bg-ink-100">
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-ink-900">Incoming offers</h1>
            <p className="text-xs text-ink-500">Pros near you are responding live</p>
          </div>
          <CategoryIcon category={request.category} size={38} />
        </div>
        <div className="mt-3 rounded-2xl bg-ink-50 px-4 py-3">
          <p className="line-clamp-2 text-sm font-medium text-ink-700">“{request.description}”</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
            <MapPinIcon className="h-3.5 w-3.5" /> {request.address}
            <span className="text-ink-300">·</span>
            <span className="font-semibold text-brand-700">{meta.label}</span>
          </div>
        </div>
      </header>

      {sortedOffers.length > 0 && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="text-xs font-medium text-ink-500">Sort by</span>
          <div className="flex rounded-full bg-ink-100 p-0.5">
            {(["price", "eta"] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)} className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-all", sort === s ? "bg-white text-ink-900 shadow-sm" : "text-ink-500")}>
                {s === "price" ? "Lowest charge" : "Fastest"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loadingOffers ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2.5 py-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
              </span>
              <span className="text-sm font-semibold text-ink-600">Finding nearby {meta.plural.toLowerCase()}…</span>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl bg-white p-4 shadow-card">
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        ) : sortedOffers.length === 0 ? (
          elapsed ? (
            <EmptyState icon={<ClockIcon className="h-9 w-9" />} title="No offers yet" subtitle="Nearby pros are being notified. Offers will appear live within 2 seconds." />
          ) : (
            <div className="flex items-center justify-center gap-2.5 py-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
              </span>
              <span className="text-sm font-semibold text-ink-600">Finding nearby {meta.plural.toLowerCase()}…</span>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {sortedOffers.map((o, i) => (
              <OfferCard key={o.id} offer={o} index={i} isAccepting={isAccepting} onAccept={() => acceptOffer(request.id, o)} onDecline={() => declineOffer(request.id, o.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-ink-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-ink-500">
            <BanknoteIcon className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>Visiting charge is call-out fee — pay on site.</span>
          </div>
          <button onClick={() => cancelRequest(request.id)} className="shrink-0 text-xs font-semibold text-rose-500">Cancel</button>
        </div>
      </div>
    </div>
  );
}
