/**
 * Types - 100% Clean, No Mock Data
 * Only real interfaces and category config - no PROVIDERS, no SEED_REQUESTS
 * All data comes from real backend API + Socket.io
 */

import type { Coords } from "@/lib/location";
export type Role = "customer" | "provider";
export type Category = "plumber" | "electrician" | "mechanic";

export type JobStatus =
  | "open"
  | "accepted"
  | "on_the_way"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface GeoPoint {
  x: number; // normalized 0..100 for map display
  y: number;
  label: string;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  city?: string;
  role: Role;
  avatar: string;
  profilePicture?: string;
  color: string;
  rating: number;
  reviews: number;
  category?: Category;
  radiusKm?: number;
  // Work-location pinning (2026-08-24): 'manual' = pinned on map in Profile (always wins over GPS)
  locationSource?: 'gps' | 'manual';
  // Effective stored work coordinates (GeoJSON [lng,lat] unwrapped) - set when known
  coords?: Coords;
  verified?: boolean;
  isOnline?: boolean;
  yearsExperience?: number;
  jobsCompleted?: number;
}

export interface Offer {
  id: string;
  providerId: string;
  providerName: string;
  providerRating: number;
  providerReviews: number;
  avatarColor: string;
  avatarInitials: string;
  category: Category;
  visitingCharge: number;
  etaMin: number;
  distanceKm: number | null;
  timestamp: number;
  /** Backend offer status (pending/accepted/rejected) - set by adapter, used to filter declined offers */
  status?: string;
}

/**
 * Provider-side view of an offer THEY sent - tracked in store.myOffers
 * so a provider can see the live fate of every offer without a refresh:
 * pending (waiting on customer) → accepted / declined / not selected / request cancelled.
 */
export type SentOfferStatus = "pending" | "accepted" | "declined" | "rejected" | "cancelled" | "expired" | "withdrawn";

export interface SentOffer {
  id: string;
  requestId: string;
  category: Category;
  description: string;
  address: string;
  city?: string;
  visitingCharge: number;
  etaMin: number;
  status: SentOfferStatus;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string; // "me" or peer id
  text: string;
  timestamp: number;
  read: boolean;
}

export interface Job {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerAvatarColor?: string;
  customerAvatarInitials?: string;
  category: Category;
  description: string;
  location: GeoPoint;
  address: string;
  status: JobStatus;
  createdAt: number;
  offers: Offer[];
  acceptedOfferId?: string;
  providerId?: string;
  providerName?: string;
  providerPhone?: string;
  providerAvatarColor?: string;
  providerAvatarInitials?: string;
  providerRating?: number;
  rating?: number;
  review?: string;
  fee?: string;
  /** 'customer' = user-initiated cancel, 'expired' = auto-expired after REQUEST_EXPIRY_MINUTES pending (currently 2 - demo value) */
  cancelledReason?: 'customer' | 'expired' | string;
  /** ms timestamp - only while the request is pending */
  expiresAt?: number;
}

/* Category config - Real, not mock */

export interface CategoryMeta {
  id: Category;
  label: string;
  plural: string;
  tagline: string;
  color: string;
  soft: string;
  gradient: string;
  examples: string[];
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "plumber",
    label: "Plumber",
    plural: "Plumbers",
    tagline: "Leaks, fittings & drainage",
    color: "#0d8cd0",
    soft: "#e8f4fb",
    gradient: "from-sky-500 to-blue-600",
    examples: ["Leaking pipe", "Blocked drain", "Tap fitting"],
  },
  {
    id: "electrician",
    label: "Electrician",
    plural: "Electricians",
    tagline: "Wiring, switches & faults",
    color: "#e08b00",
    soft: "#fdf3e0",
    gradient: "from-amber-400 to-orange-500",
    examples: ["Power outage", "Switch repair", "Fan install"],
  },
  {
    id: "mechanic",
    label: "Mechanic",
    plural: "Mechanics",
    tagline: "Breakdowns & vehicle service",
    color: "#e0495b",
    soft: "#fbeaec",
    gradient: "from-rose-500 to-red-600",
    examples: ["Flat tyre", "Engine noise", "Battery jump"],
  },
];

export const categoryById = (id?: Category): CategoryMeta =>
  CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

/* Status config */

export interface StatusMeta {
  label: string;
  color: string;
  bg: string;
  dot: string;
  ring: string;
}

export const STATUS: Record<JobStatus, StatusMeta> = {
  open: { label: "Awaiting offers", color: "text-accent-700", bg: "bg-accent-100", dot: "#f98f07", ring: "ring-accent-200" },
  accepted: { label: "Offer accepted", color: "text-brand-700", bg: "bg-brand-100", dot: "#229786", ring: "ring-brand-200" },
  on_the_way: { label: "On the way", color: "text-brand-700", bg: "bg-brand-100", dot: "#229786", ring: "ring-brand-200" },
  arrived: { label: "Arrived", color: "text-sky-700", bg: "bg-sky-100", dot: "#0284c7", ring: "ring-sky-200" },
  in_progress: { label: "In progress", color: "text-violet-700", bg: "bg-violet-100", dot: "#7c3aed", ring: "ring-violet-200" },
  completed: { label: "Completed", color: "text-emerald-700", bg: "bg-emerald-100", dot: "#059669", ring: "ring-emerald-200" },
  cancelled: { label: "Cancelled", color: "text-rose-600", bg: "bg-rose-100", dot: "#e11d48", ring: "ring-rose-200" },
};

/* IncomingRequest - Real, from backend, not SEED */

export interface IncomingRequest {
  id: string;
  customerName: string;
  customerAvatar: string;
  customerColor: string;
  category: Category;
  description: string;
  location: GeoPoint;
  address: string;
  distanceKm: number | null;
  createdAt: number;
  fee?: string;
}

export const categoryTone: Record<Category, string> = {
  plumber: "text-sky-600",
  electrician: "text-amber-600",
  mechanic: "text-rose-600",
};
