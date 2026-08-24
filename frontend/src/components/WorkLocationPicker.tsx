import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getAllCities, getCityByName, type Coords } from "@/lib/location";
import { api } from "@/lib/api";
import { Button } from "./ui";

const PIN_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" style="filter:drop-shadow(0 4px 8px rgba(17,22,24,0.4))">
    <path d="M12 21.5S4.5 14.6 4.5 9.2a7.5 7.5 0 0 1 15 0c0 5.4-7.5 12.3-7.5 12.3Z" fill="#0d9488"/>
    <circle cx="12" cy="9.2" r="3.1" fill="#fff"/>
  </svg>`;

export interface WorkLocationPickerProps {
  initialCity?: string;
  initialCoords?: Coords;
  onSaved: (result: { lng: number; lat: number; city: string }) => void;
  onClose: () => void;
}

/* Work-location pin picker (2026-08-24 Task) — provider pins their REAL work spot on a
   proper map (Leaflet + free OpenStreetMap tiles, no API key). Saving stores a MANUAL pin:
   the backend then treats pinned coords as the provider's authoritative location and
   drifting/emulator GPS can never silently break city matching or distance display again. */
export function WorkLocationPicker({ initialCity, initialCoords, onSaved, onClose }: WorkLocationPickerProps) {
  const cities = getAllCities();
  const [city, setCity] = useState<string>(initialCity || "");
  const [coords, setCoords] = useState<Coords | null>(initialCoords || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const coordsRef = useRef<Coords | null>(initialCoords || null);

  const placePin = (c: Coords) => {
    coordsRef.current = c;
    setCoords(c);
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      const icon = L.divIcon({ className: "work-location-pin", html: PIN_SVG, iconSize: [40, 40], iconAnchor: [20, 38] });
      const marker = L.marker([c.lat, c.lng], { icon, draggable: true });
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        coordsRef.current = { lat: ll.lat, lng: ll.lng };
        setCoords({ lat: ll.lat, lng: ll.lng });
      });
      marker.addTo(map);
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([c.lat, c.lng]);
    }
  };

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const startCity = getCityByName(initialCity || "");
    const start = initialCoords || (startCity ? { lat: startCity.lat, lng: startCity.lng } : { lat: 31.5204, lng: 74.3587 }); // Lahore fallback
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], startCity || initialCoords ? 13 : 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => placePin({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    if (initialCoords) placePin(initialCoords);
    // Leaflet measures its container on init; inside a freshly-mounted modal the size can
    // still be 0, so poke invalidateSize once mounted frames settle.
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When city dropdown changes -> recenter on that city (seed pin at city center if none yet)
  useEffect(() => {
    const c = getCityByName(city);
    const map = mapRef.current;
    if (!c || !map) return;
    map.setView([c.lat, c.lng], 13);
    if (!coordsRef.current) placePin({ lat: c.lat, lng: c.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const save = async () => {
    if (!city.trim()) { setError("Pehle apna sheher select karein (Select your city)"); return; }
    const pin = coordsRef.current;
    if (!pin) { setError("Map par tap kar ke apni location pin karein"); return; }
    setSaving(true);
    setError(null);
    try {
      await api.users.updateLocation(pin.lng, pin.lat, city.trim(), "manual");
      onSaved({ lng: pin.lng, lat: pin.lat, city: city.trim() });
    } catch (e: any) {
      setError(e?.message || "Save failed - try again");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Set work location on map">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <div>
          <h2 className="font-display text-base font-bold text-ink-900">📌 Set your work location</h2>
          <p className="text-[11px] text-ink-500">Pinned location always wins over GPS - distances isi se calculate hongi</p>
        </div>
        <button onClick={onClose} aria-label="Close map picker" className="tap-highlight-none rounded-xl p-2 text-ink-500 hover:bg-ink-100 active:scale-95">✕</button>
      </div>

      <div className="px-4 pt-3">
        <label className="mb-1 block text-xs font-semibold text-ink-600" htmlFor="work-city">City</label>
        <select
          id="work-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm font-medium text-ink-900 outline-none focus:border-brand-500"
        >
          <option value="" disabled>Select your city…</option>
          {cities.map((c) => (<option key={c.name} value={c.name}>{c.name} · {c.province}</option>))}
        </select>
      </div>

      <div className="relative m-4 flex-1 overflow-hidden rounded-2xl border border-ink-200 shadow-inner">
        <div ref={containerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-ink-600 shadow-card">
          Tap map to move pin · pin ko drag bhi kar sakte hain
        </div>
      </div>

      <div className="border-t border-ink-100 px-4 pb-4 pt-3">
        {coords && (
          <p className="mb-2 text-center text-[11px] font-medium text-ink-500">
            📍 {city || "(city select karein)"} · <span className="font-mono">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
          </p>
        )}
        {error && <p className="mb-2 text-center text-xs font-semibold text-red-600">{error}</p>}
        <Button variant="primary" size="lg" onClick={save} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save pinned location"}
        </Button>
      </div>
    </div>
  );
}
