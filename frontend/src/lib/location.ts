/**
 * Location - 100% Real, Pakistan Cities Support + Google Maps Ready
 * 
 * Features:
 * - Pakistan main cities database (35+ cities) with lat/lng
 * - City-based map centering: jab user city select karega to usi city ka map khulega
 * - OSM Nominatim reverse geocode + search (free, no key)
 * - Google Maps ready: optional VITE_GOOGLE_MAPS_API_KEY support via Google Maps component
 * - offsetToCoords / coordsToOffset for custom SVG map (100 units ≈ 3km)
 */

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

export interface PakistanCity {
  name: string;
  lat: number;
  lng: number;
  region: string;
  province: string;
  isMain?: boolean; // top 10 main cities
}

/* Pakistan Main Cities Database - 35+ cities with real coordinates */
/* Source: Real lat/lng from OSM/Google */

export const PAKISTAN_CITIES: PakistanCity[] = [
  // Top 10 Main Cities
  { name: "Karachi", lat: 24.8607, lng: 67.0011, region: "Sindh, Pakistan", province: "Sindh", isMain: true },
  { name: "Lahore", lat: 31.5204, lng: 74.3587, region: "Punjab, Pakistan", province: "Punjab", isMain: true },
  { name: "Islamabad", lat: 33.6844, lng: 73.0479, region: "Islamabad, Pakistan", province: "Islamabad", isMain: true },
  { name: "Rawalpindi", lat: 33.5651, lng: 73.0169, region: "Punjab, Pakistan", province: "Punjab", isMain: true },
  { name: "Faisalabad", lat: 31.4181, lng: 73.0776, region: "Punjab, Pakistan", province: "Punjab", isMain: true },
  { name: "Multan", lat: 30.1575, lng: 71.5249, region: "Punjab, Pakistan", province: "Punjab", isMain: true },
  { name: "Gujranwala", lat: 32.1877, lng: 74.1945, region: "Punjab, Pakistan", province: "Punjab", isMain: true },
  { name: "Peshawar", lat: 34.0150, lng: 71.5249, region: "KPK, Pakistan", province: "KPK", isMain: true },
  { name: "Quetta", lat: 30.1798, lng: 66.9750, region: "Balochistan, Pakistan", province: "Balochistan", isMain: true },
  { name: "Sialkot", lat: 32.4945, lng: 74.5229, region: "Punjab, Pakistan", province: "Punjab", isMain: true },

  // Other Major Cities
  { name: "Bahawalpur", lat: 29.3956, lng: 71.6836, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Sargodha", lat: 32.0740, lng: 72.6861, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Sukkur", lat: 27.7052, lng: 68.8573, region: "Sindh, Pakistan", province: "Sindh" },
  { name: "Larkana", lat: 27.5605, lng: 68.2245, region: "Sindh, Pakistan", province: "Sindh" },
  { name: "Sheikhupura", lat: 31.7131, lng: 73.9850, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Rahim Yar Khan", lat: 28.4202, lng: 70.2989, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Jhang", lat: 31.3057, lng: 72.3259, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Dera Ghazi Khan", lat: 30.0513, lng: 70.6346, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Gujrat", lat: 32.5731, lng: 74.1005, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Sahiwal", lat: 30.6666, lng: 73.1089, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Wah Cantonment", lat: 33.7833, lng: 72.75, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Kasur", lat: 31.1155, lng: 74.4467, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Okara", lat: 30.8081, lng: 73.4458, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Chiniot", lat: 31.7209, lng: 72.9820, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Kamoke", lat: 32.1734, lng: 74.2237, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Hafizabad", lat: 32.0678, lng: 73.6854, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Sadiqabad", lat: 28.3006, lng: 70.1316, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Mardan", lat: 34.1989, lng: 72.0404, region: "KPK, Pakistan", province: "KPK" },
  { name: "Mingora", lat: 34.7717, lng: 72.3604, region: "KPK, Pakistan", province: "KPK" },
  { name: "Abbottabad", lat: 34.1688, lng: 73.2215, region: "KPK, Pakistan", province: "KPK" },
  { name: "Mansehra", lat: 34.3302, lng: 73.1968, region: "KPK, Pakistan", province: "KPK" },
  { name: "Swat", lat: 35.2227, lng: 72.4258, region: "KPK, Pakistan", province: "KPK" },
  { name: "Hyderabad", lat: 25.3960, lng: 68.3578, region: "Sindh, Pakistan", province: "Sindh" },
  { name: "Mirpur Khas", lat: 25.5251, lng: 69.0159, region: "Sindh, Pakistan", province: "Sindh" },
  { name: "Nawabshah", lat: 26.2483, lng: 68.4096, region: "Sindh, Pakistan", province: "Sindh" },
  { name: "Jacobabad", lat: 28.2769, lng: 68.4514, region: "Sindh, Pakistan", province: "Sindh" },
  { name: "Gwadar", lat: 25.1216, lng: 62.3254, region: "Balochistan, Pakistan", province: "Balochistan" },
  { name: "Khuzdar", lat: 27.7384, lng: 66.6434, region: "Balochistan, Pakistan", province: "Balochistan" },
  { name: "Chaman", lat: 30.9177, lng: 66.4520, region: "Balochistan, Pakistan", province: "Balochistan" },
  { name: "Gilgit", lat: 35.9208, lng: 74.3080, region: "Gilgit-Baltistan, Pakistan", province: "Gilgit-Baltistan" },
  { name: "Skardu", lat: 35.2978, lng: 75.6337, region: "Gilgit-Baltistan, Pakistan", province: "Gilgit-Baltistan" },
  { name: "Muzaffarabad", lat: 34.3700, lng: 73.4708, region: "AJK, Pakistan", province: "AJK" },
  { name: "Mirpur", lat: 33.1478, lng: 73.7708, region: "AJK, Pakistan", province: "AJK" },
  { name: "Jhelum", lat: 32.9333, lng: 73.7167, region: "Punjab, Pakistan", province: "Punjab" },
  { name: "Dera Ismail Khan", lat: 31.8313, lng: 70.9012, region: "KPK, Pakistan", province: "KPK" },
];

/* Default still Faisalabad for backward compatibility, but will be overridden by user's selected city */
export const DEFAULT_COORDS: Coords = { lat: 31.4181, lng: 73.0776 };
export const DEFAULT_ADDRESS = "Model Town, Faisalabad";
export const DEFAULT_CITY = "Faisalabad";
export const DEFAULT_REGION = "Punjab, Pakistan";

/* Helper: Get city coords by name - case insensitive */
export function getCityCoords(cityName: string): Coords | null {
  if (!cityName) return null;
  const normalized = cityName.trim().toLowerCase();
  const found = PAKISTAN_CITIES.find(c => c.name.toLowerCase() === normalized);
  if (found) return { lat: found.lat, lng: found.lng };
  // Partial match
  const partial = PAKISTAN_CITIES.find(c => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()));
  if (partial) return { lat: partial.lat, lng: partial.lng };
  return null;
}

export function getCityByName(cityName: string): PakistanCity | null {
  if (!cityName) return null;
  const normalized = cityName.trim().toLowerCase();
  const found = PAKISTAN_CITIES.find(c => c.name.toLowerCase() === normalized);
  if (found) return found;
  const partial = PAKISTAN_CITIES.find(c => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()));
  return partial || null;
}

export function getAllCities(): PakistanCity[] {
  return [...PAKISTAN_CITIES].sort((a, b) => {
    if (a.isMain && !b.isMain) return -1;
    if (!a.isMain && b.isMain) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function getMainCities(): PakistanCity[] {
  return PAKISTAN_CITIES.filter(c => c.isMain);
}

export function searchPakistanCities(query: string, limit = 8): PakistanCity[] {
  if (!query.trim()) return getMainCities().slice(0, limit);
  const q = query.toLowerCase().trim();
  const exact = PAKISTAN_CITIES.filter(c => c.name.toLowerCase().startsWith(q));
  const contains = PAKISTAN_CITIES.filter(c => !exact.includes(c) && c.name.toLowerCase().includes(q));
  const provinceMatch = PAKISTAN_CITIES.filter(c => !exact.includes(c) && !contains.includes(c) && c.province.toLowerCase().includes(q));
  return [...exact, ...contains, ...provinceMatch].slice(0, limit);
}

/* Localities for mock fallback */
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
  const idx = Math.abs(Math.round(lat * 7 + lng * 13)) % LOCALITIES.length;
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
  const city = a?.city || a?.town || a?.village || a?.suburb || a?.county || DEFAULT_CITY;
  const region = a?.state || a?.country || DEFAULT_REGION;
  return { city, region };
}

/* Reverse-geocode real coordinates via OpenStreetMap (free, no key) */
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
  // Try to find nearest Pakistan city for fallback
  const nearest = findNearestCity({ lat, lng });
  if (nearest) {
    return { address: `${nearest.name}, ${nearest.region}`, city: nearest.name, region: nearest.region };
  }
  return { address: mockAddress(lat, lng), city: DEFAULT_CITY, region: DEFAULT_REGION };
}

/* Places-style autocomplete - Now searches Pakistan cities first, then OSM */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];

  // First search Pakistan cities database (instant, no API call)
  const cityMatches = searchPakistanCities(q, 4).map(city => ({
    label: `${city.name}, ${city.region}`,
    name: city.name,
    city: city.name,
    region: city.region,
    coords: { lat: city.lat, lng: city.lng }
  }));

  // Then try OSM for detailed streets (biased to Pakistan)
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
      )}&limit=4&addressdetails=1&accept-language=en&countrycodes=pk&viewbox=60,37,77,23&bounded=0`
    );
    const osmResults = (j || []).map((r) => {
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
    // Merge: cities first, then OSM, deduplicate by label
    const combined = [...cityMatches];
    osmResults.forEach(osm => {
      if (!combined.some(c => c.label === osm.label)) {
        combined.push(osm);
      }
    });
    return combined.slice(0, 8);
  } catch {
    // If OSM fails, return city matches only
    return cityMatches;
  }
}

/* Find nearest Pakistan city to given coords */
export function findNearestCity(coords: Coords): PakistanCity | null {
  let nearest: PakistanCity | null = null;
  let minDist = Infinity;
  for (const city of PAKISTAN_CITIES) {
    const dist = Math.sqrt(
      Math.pow(coords.lat - city.lat, 2) + Math.pow(coords.lng - city.lng, 2)
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  }
  return nearest;
}

/* Coordinate mapping between stylised map (0..100) and real lat/lng - 100 units ≈ 3km */
const METERS_PER_UNIT = 30;

export function offsetToCoords(x: number, y: number, base: Coords): Coords {
  const dxM = (x - 50) * METERS_PER_UNIT;
  const dyM = (50 - y) * METERS_PER_UNIT;
  const lat = base.lat + dyM / 111320;
  const lng = base.lng + dxM / (111320 * Math.cos((base.lat * Math.PI) / 180));
  return { lat, lng };
}

export function coordsToOffset(
  coords: Coords,
  base: Coords
): { x: number; y: number } {
  const dxM = (coords.lng - base.lng) * 111320 * Math.cos((base.lat * Math.PI) / 180);
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

/* Google Maps Integration - Optional */
export const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

export function isGoogleMapsAvailable(): boolean {
  return !!GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'REPLACE_WITH_YOUR_KEY';
}

export function getGoogleMapsEmbedUrl(coords: Coords, zoom = 14): string {
  if (!isGoogleMapsAvailable()) return '';
  // Using Google Maps Embed API (free, no JS load)
  return `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${coords.lat},${coords.lng}&zoom=${zoom}`;
}

export function getGoogleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
