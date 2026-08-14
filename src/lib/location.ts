export interface Coords {
  lat: number;
  lng: number;
}

export interface PlaceResult {
  label: string;
  name: string;
  city: string;
  region: string;
  coords: Coords;
}

/* Faisalabad, Pakistan — reference location for the demo */
export const DEFAULT_COORDS: Coords = { lat: 31.4181, lng: 73.0776 };
export const DEFAULT_ADDRESS = "Model Town, Faisalabad";
export const DEFAULT_CITY = "Faisalabad";
export const DEFAULT_REGION = "Punjab, Pakistan";

const LOCALITIES = [
  "Model Town",
  "Peoples Colony",
  "D Ground",
  "Madina Town",
  "Gulberg",
  "Jinnah Colony",
  "Susan Road",
  "Canal Road",
];

function mockAddress(lat: number, lng: number): string {
  const idx =
    Math.abs(Math.round(lat * 7 + lng * 13)) % LOCALITIES.length;
  return `${LOCALITIES[idx]}, Faisalabad`;
}

async function fetchJson<T>(url: string, timeoutMs = 6500): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("bad response");
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

interface OsmAddress {
  road?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  country?: string;
}

function parseAddress(a?: OsmAddress) {
  const city =
    a?.city || a?.town || a?.village || a?.suburb || a?.county || DEFAULT_CITY;
  const region = a?.state || a?.country || DEFAULT_REGION;
  return { city, region };
}

/* Reverse-geocode real coordinates via OpenStreetMap (free, no key),
   with a deterministic local fallback for offline/denied cases. */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ address: string; city: string; region: string }> {
  try {
    const j = await fetchJson<{ display_name?: string; address?: OsmAddress }>(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=en`
    );
    if (j?.display_name) {
      const { city, region } = parseAddress(j.address);
      const road = j.address?.road;
      const sub = j.address?.suburb || j.address?.neighbourhood;
      const short = [road, sub, city].filter(Boolean).join(", ");
      return { address: short || j.display_name, city, region };
    }
  } catch {
    /* fall through to mock */
  }
  return { address: mockAddress(lat, lng), city: DEFAULT_CITY, region: DEFAULT_REGION };
}

/* Places-style autocomplete (OpenStreetMap search, biased to Faisalabad). */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const j = await fetchJson<
      {
        display_name: string;
        lat: string;
        lon: string;
        name?: string;
        address?: OsmAddress;
      }[]
    >(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        q
      )}&limit=6&addressdetails=1&accept-language=en&viewbox=72.5,31.9,73.7,30.9&bounded=0`
    );
    return (j || []).map((r) => {
      const { city, region } = parseAddress(r.address);
      const name =
        r.address?.road ||
        r.address?.suburb ||
        r.address?.neighbourhood ||
        r.address?.city ||
        r.name ||
        "";
      return {
        label: r.display_name || name,
        name: name || r.display_name,
        city,
        region,
        coords: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
      };
    });
  } catch {
    return [];
  }
}

/* Coordinate mapping between the stylised map (0..100) and real lat/lng.
   100 units ≈ 3 km around a base point. */
const METERS_PER_UNIT = 30;

export function offsetToCoords(x: number, y: number, base: Coords): Coords {
  const dxM = (x - 50) * METERS_PER_UNIT;
  const dyM = (50 - y) * METERS_PER_UNIT;
  const lat = base.lat + dyM / 111320;
  const lng =
    base.lng + dxM / (111320 * Math.cos((base.lat * Math.PI) / 180));
  return { lat, lng };
}

export function coordsToOffset(
  coords: Coords,
  base: Coords
): { x: number; y: number } {
  const dxM =
    (coords.lng - base.lng) * 111320 * Math.cos((base.lat * Math.PI) / 180);
  const dyM = (coords.lat - base.lat) * 111320;
  return { x: 50 + dxM / METERS_PER_UNIT, y: 50 - dyM / METERS_PER_UNIT };
}

export function getPosition(): Promise<{
  coords: Coords;
  accuracy: number | null;
}> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("geolocation unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy ?? null,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
