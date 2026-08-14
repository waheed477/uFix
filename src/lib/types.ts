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
  x: number; // normalized 0..100
  y: number; // normalized 0..100
  label: string;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  city?: string;
  role: Role;
  avatar: string; // initials or emoji fallback
  color: string; // tailwind-safe hex for avatar bg
  rating: number;
  reviews: number;
  category?: Category;
  radiusKm?: number;
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
  distanceKm: number;
  timestamp: number;
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
}

/* ---------------- Category config ---------------- */

export interface CategoryMeta {
  id: Category;
  label: string;
  plural: string;
  tagline: string;
  color: string; // hex
  soft: string; // soft bg (hex)
  gradient: string; // tailwind gradient classes
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

/* ---------------- Status config ---------------- */

export interface StatusMeta {
  label: string;
  color: string; // tailwind text color
  bg: string; // tailwind bg
  dot: string; // hex dot color
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

/* ---------------- Seed providers (peers) ---------------- */

export const PROVIDERS: Record<Category, User[]> = {
  plumber: [
    { id: "p1", name: "Ramesh Kumar", phone: "+92 321 0444 321", role: "provider", avatar: "RK", color: "#167a6c", rating: 4.9, reviews: 412, category: "plumber", yearsExperience: 11, jobsCompleted: 1680 },
    { id: "p2", name: "Suresh Yadav", phone: "+92 333 2211 410", role: "provider", avatar: "SY", color: "#7c3aed", rating: 4.7, reviews: 288, category: "plumber", yearsExperience: 8, jobsCompleted: 940 },
    { id: "p3", name: "Imran Shaikh", phone: "+92 301 1122 340", role: "provider", avatar: "IS", color: "#e0495b", rating: 4.6, reviews: 177, category: "plumber", yearsExperience: 6, jobsCompleted: 610 },
  ],
  electrician: [
    { id: "e1", name: "Arjun Nair", phone: "+92 300 5551 112", role: "provider", avatar: "AN", color: "#0d8cd0", rating: 4.9, reviews: 521, category: "electrician", yearsExperience: 12, jobsCompleted: 2100 },
    { id: "e2", name: "Vikram Singh", phone: "+92 312 3300 444", role: "provider", avatar: "VS", color: "#0e7c5b", rating: 4.8, reviews: 356, category: "electrician", yearsExperience: 9, jobsCompleted: 1320 },
    { id: "e3", name: "Deepak Mehta", phone: "+92 341 7788 100", role: "provider", avatar: "DM", color: "#7c3aed", rating: 4.5, reviews: 143, category: "electrician", yearsExperience: 5, jobsCompleted: 480 },
  ],
  mechanic: [
    { id: "m1", name: "Farhan Ali", phone: "+92 315 9912 300", role: "provider", avatar: "FA", color: "#e0495b", rating: 4.8, reviews: 433, category: "mechanic", yearsExperience: 10, jobsCompleted: 1750 },
    { id: "m2", name: "Karthik Raja", phone: "+92 322 6677 890", role: "provider", avatar: "KR", color: "#167a6c", rating: 4.7, reviews: 299, category: "mechanic", yearsExperience: 7, jobsCompleted: 890 },
    { id: "m3", name: "Nitin Gupta", phone: "+92 333 4455 600", role: "provider", avatar: "NG", color: "#0d8cd0", rating: 4.4, reviews: 121, category: "mechanic", yearsExperience: 4, jobsCompleted: 350 },
  ],
};

export const providerByCategory = (cat: Category) => PROVIDERS[cat];

/* ---------------- Seed nearby requests (for provider demo) ---------------- */

export interface IncomingRequest {
  id: string;
  customerName: string;
  customerAvatar: string;
  customerColor: string;
  category: Category;
  description: string;
  location: GeoPoint;
  address: string;
  distanceKm: number;
  createdAt: number;
  fee?: string;
}

export const SEED_REQUESTS: IncomingRequest[] = [
  {
    id: "rq1",
    customerName: "Meera Shah",
    customerAvatar: "MS",
    customerColor: "#0d8cd0",
    category: "plumber",
    description: "Kitchen sink is leaking badly under the cabinet. Water pooling on the floor since this morning.",
    location: { x: 56, y: 42, label: "A-14, Lake View Residency" },
    address: "A-14, Lake View Residency, 3rd floor",
    distanceKm: 1.2,
    createdAt: Date.now() - 1000 * 60 * 4,
    fee: "₹400–600",
  },
  {
    id: "rq2",
    customerName: "Rohan Kapoor",
    customerAvatar: "RK",
    customerColor: "#7c3aed",
    category: "electrician",
    description: "No power in the bedroom — main switch trips every time I switch on the AC.",
    location: { x: 38, y: 68, label: "B-22, Greenfield Apartments" },
    address: "B-22, Greenfield Apartments",
    distanceKm: 2.4,
    createdAt: Date.now() - 1000 * 60 * 12,
    fee: "₹500–700",
  },
  {
    id: "rq3",
    customerName: "Anita Desai",
    customerAvatar: "AD",
    customerColor: "#e0495b",
    category: "mechanic",
    description: "Car won't start in the parking lot. Dashboard lights flicker, possibly battery or starter.",
    location: { x: 66, y: 30, label: "Basement P2, Central Mall" },
    address: "Central Mall, Basement P2",
    distanceKm: 3.1,
    createdAt: Date.now() - 1000 * 60 * 22,
    fee: "₹800–1200",
  },
  {
    id: "rq4",
    customerName: "Sanjay Iyer",
    customerAvatar: "SI",
    customerColor: "#167a6c",
    category: "plumber",
    description: "Geyser is leaking from the bottom joint. Need urgent fix before it damages the wall.",
    location: { x: 22, y: 52, label: "C-9, Palm Grove Society" },
    address: "C-9, Palm Grove Society",
    distanceKm: 4.6,
    createdAt: Date.now() - 1000 * 60 * 35,
    fee: "₹350–500",
  },
];

export const categoryTone: Record<Category, string> = {
  plumber: "text-sky-600",
  electrician: "text-amber-600",
  mechanic: "text-rose-600",
};
