import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Category,
  ChatMessage,
  IncomingRequest,
  Job,
  JobStatus,
  Offer,
  Role,
  User,
  GeoPoint,
} from "./types";
import { PROVIDERS, SEED_REQUESTS } from "./types";
import {
  DEFAULT_ADDRESS,
  DEFAULT_CITY,
  DEFAULT_COORDS,
  DEFAULT_REGION,
  getPosition,
  reverseGeocode,
  type Coords,
} from "./location";

export type Stage = "splash" | "auth" | "providerSetup" | "location" | "app";
export type Tab = "home" | "jobs" | "chat" | "profile";
export type LocStatus = "idle" | "requesting" | "granted" | "denied";

export interface Loc {
  status: LocStatus;
  coords: Coords | null;
  address: string;
  city: string;
  region: string;
  accuracy: number | null;
  custom: boolean;
}
export type Screen =
  | "newRequest"
  | "offers"
  | "activeJob"
  | "chat"
  | "rating"
  | "history"
  | "editProfile";

interface Toast {
  msg: string;
  icon: "check" | "send" | "info";
}

interface AppContextValue {
  stage: Stage;
  setStage: (s: Stage) => void;
  user: User | null;
  tab: Tab;
  screen: Screen | null;
  jobs: Job[];
  nearbyRequests: IncomingRequest[];
  messages: Record<string, ChatMessage[]>;
  activeRequestId: string | null;
  activeJobId: string | null;
  activeJob: Job | null;
  toast: Toast | null;
  draftCategory: Category;
  setDraftCategory: (c: Category) => void;

  // location
  location: Loc;
  gps: Loc | null;
  requestLocation: () => void;
  skipLocation: () => void;
  searchLocation: (p: { coords: Coords; label: string; city: string; region: string }) => void;
  resetLocation: () => void;

  // auth
  completeAuth: (role: Role, name: string, phone: string, city?: string) => void;
  completeProviderSetup: (category: Category, radiusKm: number) => void;
  updateProfile: (name: string, phone: string) => void;
  toggleOnline: () => void;
  logout: () => void;

  // navigation
  setTab: (t: Tab) => void;
  navigate: (s: Screen) => void;
  back: () => void;

  // customer actions
  postRequest: (
    category: Category,
    description: string,
    location: GeoPoint,
    address: string
  ) => void;
  acceptOffer: (jobId: string, offer: Offer) => void;
  declineOffer: (jobId: string, offerId: string) => void;
  cancelRequest: (jobId: string) => void;
  completeJob: (jobId: string, rating: number, review: string) => void;

  // provider actions
  sendOffer: (requestId: string, charge: number) => void;
  updateJobStatus: (jobId: string, status: JobStatus) => void;

  // chat
  openChat: (jobId: string) => void;
  markRead: (jobId: string, senderId: string) => void;
  sendMessage: (jobId: string, text: string, peer: { id: string; isProvider: boolean }) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const PROVIDER_REPLIES = [
  "Sure, I'm on my way. I'll reach you in about 15 minutes. 🛠️",
  "Got it. Please keep your main gate/entrance open, I'm heading over.",
  "No worries, I'll inspect it on the spot and give you a fair price first.",
  "Almost there — see you shortly.",
  "Understood. Could you share the exact landmark once more?",
  "I can handle that. Please stand by, I'm nearby.",
];

const CUSTOMER_REPLIES = [
  "Yes, please come as soon as possible.",
  "I'm at home now, call me when you reach the gate.",
  "Okay, sounds good. Thanks!",
  "Parking is available in the basement, level P1.",
  "Perfect, see you soon.",
  "Thanks, please be careful with the water line.",
];

function pickReply(isProviderPeer: boolean, text: string): string {
  const lower = text.toLowerCase();
  if (/(price|cost|charge|pay|rate|fee)/.test(lower)) {
    return isProviderPeer
      ? "We'll settle the final price after I inspect the work — cash is fine."
      : "That's fine, let's confirm the final amount after you check it.";
  }
  if (/(where|location|address|landmark)/.test(lower)) {
    return isProviderPeer
      ? "My ETA is updated on the map. Share the gate code if you have one."
      : "I'll share the exact location pin in the app.";
  }
  const pool = isProviderPeer ? PROVIDER_REPLIES : CUSTOMER_REPLIES;
  return pool[Math.floor(Math.random() * pool.length)];
}

let counter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;

function makeOffer(category: Category, provider: User, etaMin: number, distanceKm: number, charge: number): Offer {
  return {
    id: uid("offer"),
    providerId: provider.id,
    providerName: provider.name,
    providerRating: provider.rating,
    providerReviews: provider.reviews,
    avatarColor: provider.color,
    avatarInitials: provider.avatar,
    category,
    visitingCharge: charge,
    etaMin,
    distanceKm,
    timestamp: Date.now(),
  };
}

/* Seed past jobs so the History / Jobs tabs feel alive */
function seedCustomerHistory(user: User): Job[] {
  const now = Date.now();
  return [
    {
      id: uid("job"),
      customerId: user.id,
      customerName: user.name,
      category: "electrician",
      description: "Ceiling fan stopped working and the switch was sparking.",
      location: { x: 50, y: 50, label: "Home" },
      address: "Home",
      status: "completed",
      createdAt: now - 1000 * 60 * 60 * 26,
      offers: [],
      providerId: "e1",
      providerName: "Arjun Nair",
      providerPhone: "+92 300 5551 112",
      providerAvatarColor: "#0d8cd0",
      providerAvatarInitials: "AN",
      providerRating: 4.9,
      rating: 5,
      review: "Very professional, fixed it in 20 minutes.",
      fee: "₹500",
    },
    {
      id: uid("job"),
      customerId: user.id,
      customerName: user.name,
      category: "plumber",
      description: "Bathroom tap was leaking non-stop.",
      location: { x: 50, y: 50, label: "Home" },
      address: "Home",
      status: "completed",
      createdAt: now - 1000 * 60 * 60 * 24 * 6,
      offers: [],
      providerId: "p1",
      providerName: "Ramesh Kumar",
      providerPhone: "+92 321 0444 321",
      providerAvatarColor: "#167a6c",
      providerAvatarInitials: "RK",
      providerRating: 4.9,
      rating: 4,
      review: "Good job, slightly delayed but worth it.",
      fee: "₹400",
    },
  ];
}

function seedProviderHistory(user: User): Job[] {
  const now = Date.now();
  return [
    {
      id: uid("job"),
      customerId: "c1",
      customerName: "Priya Menon",
      customerPhone: "+92 331 2233 400",
      customerAvatarColor: "#7c3aed",
      customerAvatarInitials: "PM",
      category: user.category ?? "plumber",
      description: "Water heater repair",
      location: { x: 48, y: 48, label: "Customer" },
      address: "Customer location",
      status: "completed",
      createdAt: now - 1000 * 60 * 60 * 4,
      offers: [],
      rating: 5,
      review: "Quick and tidy work!",
      fee: "₹550",
    },
    {
      id: uid("job"),
      customerId: "c2",
      customerName: "Alok Verma",
      customerPhone: "+92 300 1122 700",
      customerAvatarColor: "#0d8cd0",
      customerAvatarInitials: "AV",
      category: user.category ?? "plumber",
      description: "Faucet replacement",
      location: { x: 52, y: 52, label: "Customer" },
      address: "Customer location",
      status: "completed",
      createdAt: now - 1000 * 60 * 60 * 27,
      offers: [],
      rating: 4,
      review: "",
      fee: "₹380",
    },
  ];
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>("splash");
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTabState] = useState<Tab>("home");
  const [stack, setStack] = useState<Screen[]>([]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [nearbyRequests, setNearbyRequests] = useState<IncomingRequest[]>(SEED_REQUESTS);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [draftCategory, setDraftCategory] = useState<Category>("plumber");
  const [location, setLocation] = useState<Loc>({
    status: "idle",
    coords: DEFAULT_COORDS,
    address: DEFAULT_ADDRESS,
    city: DEFAULT_CITY,
    region: DEFAULT_REGION,
    accuracy: null,
    custom: false,
  });
  const [gps, setGps] = useState<Loc | null>(null);

  const timersRef = useRef<number[]>([]);
  const timer = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  };
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const showToast = (msg: string, icon: Toast["icon"] = "info") => {
    setToast({ msg, icon });
    timer(2600, () => setToast(null));
  };

  const addMessage = (jobId: string, text: string, senderId: string) => {
    setMessages((prev) => {
      const list = prev[jobId] ?? [];
      return {
        ...prev,
        [jobId]: [
          ...list,
          { id: uid("m"), senderId, text, timestamp: Date.now(), read: false },
        ],
      };
    });
  };

  const markRead = (jobId: string, senderId: string) => {
    setMessages((prev) => {
      const list = prev[jobId] ?? [];
      return {
        ...prev,
        [jobId]: list.map((m) =>
          m.senderId === senderId ? { ...m, read: true } : m
        ),
      };
    });
  };

  const setJobStatus = (jobId: string, status: JobStatus) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status } : j))
    );
  };

  /* ---------------- Auth ---------------- */

  const completeAuth = (role: Role, name: string, phone: string, city?: string) => {
    const newUser: User = {
      id: "me",
      name,
      phone,
      city,
      role,
      avatar: name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      color: role === "provider" ? "#167a6c" : "#0d8cd0",
      rating: 4.8,
      reviews: 23,
      isOnline: true,
    };
    setUser(newUser);
    if (role === "provider") {
      setStage("providerSetup");
    } else {
      setJobs(seedCustomerHistory(newUser));
      setStage("location");
    }
  };

  const completeProviderSetup = (category: Category, radiusKm: number) => {
    setUser((prev) =>
      prev
        ? {
            ...prev,
            category,
            radiusKm,
            verified: true,
            jobsCompleted: 230,
            yearsExperience: 6,
          }
        : prev
    );
    setJobs(seedProviderHistory({ ...(user as User), category }));
    setStage("location");
  };

  const updateProfile = (name: string, phone: string) => {
    setUser((prev) =>
      prev
        ? {
            ...prev,
            name,
            phone,
            avatar: name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase(),
          }
        : prev
    );
    showToast("Profile updated", "check");
  };

  const toggleOnline = () => {
    setUser((prev) => (prev ? { ...prev, isOnline: !prev.isOnline } : prev));
  };

  /* ---------------- Location ---------------- */

  const requestLocation = async () => {
    setLocation((l) => ({ ...l, status: "requesting" }));
    try {
      const { coords, accuracy } = await getPosition();
      let addr = { address: DEFAULT_ADDRESS, city: DEFAULT_CITY, region: DEFAULT_REGION };
      try {
        addr = await reverseGeocode(coords.lat, coords.lng);
      } catch {
        /* keep fallback */
      }
      const next: Loc = {
        status: "granted",
        coords,
        address: addr.address,
        city: addr.city,
        region: addr.region,
        accuracy,
        custom: false,
      };
      setGps(next);
      setLocation(next);
      if (user?.role === "provider") showToast("You're live — ready to receive requests!", "check");
    } catch {
      setGps(null);
      setLocation({
        status: "denied",
        coords: DEFAULT_COORDS,
        address: DEFAULT_ADDRESS,
        city: DEFAULT_CITY,
        region: DEFAULT_REGION,
        accuracy: null,
        custom: false,
      });
    } finally {
      setStage((s) => (s === "location" ? "app" : s));
    }
  };

  const skipLocation = () => {
    setLocation({
      status: "denied",
      coords: DEFAULT_COORDS,
      address: DEFAULT_ADDRESS,
      city: DEFAULT_CITY,
      region: DEFAULT_REGION,
      accuracy: null,
      custom: false,
    });
    setStage("app");
  };

  const searchLocation = (p: { coords: Coords; label: string; city: string; region: string }) => {
    setLocation({
      status: "granted",
      coords: p.coords,
      address: p.label,
      city: p.city || DEFAULT_CITY,
      region: p.region || DEFAULT_REGION,
      accuracy: null,
      custom: true,
    });
  };

  const resetLocation = () => {
    if (gps) {
      setLocation({ ...gps, status: "granted", custom: false });
    } else {
      requestLocation();
    }
  };

  const logout = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    setUser(null);
    setJobs([]);
    setMessages({});
    setActiveJobId(null);
    setActiveRequestId(null);
    setStack([]);
    setTabState("home");
    setStage("auth");
  };

  /* ---------------- Navigation ---------------- */

  const setTab = (t: Tab) => {
    setTabState(t);
    setStack([]);
  };

  const navigate = (s: Screen) => setStack((prev) => [...prev, s]);
  const back = () => setStack((prev) => prev.slice(0, -1));

  /* ---------------- Customer actions ---------------- */

  const postRequest = (
    category: Category,
    description: string,
    location: GeoPoint,
    address: string
  ) => {
    const id = uid("job");
    const job: Job = {
      id,
      customerId: "me",
      customerName: user?.name ?? "You",
      category,
      description,
      location,
      address,
      status: "open",
      createdAt: Date.now(),
      offers: [],
    };
    setJobs((prev) => [job, ...prev]);
    setActiveRequestId(id);
    setStack(["offers"]);

    const providers = PROVIDERS[category];
    const delays = [1600, 3400, 5600];
    delays.forEach((d, i) => {
      const p = providers[i % providers.length];
      const eta = 6 + Math.floor(Math.random() * 22);
      const dist = 0.7 + Math.random() * 4.3;
      const base = category === "mechanic" ? 450 : category === "electrician" ? 350 : 300;
      const charge = base + Math.floor(Math.random() * 250);
      timer(d, () => {
        setJobs((prev) => {
          const target = prev.find((j) => j.id === id);
          if (!target || target.status !== "open") return prev;
          const offer = makeOffer(category, p, eta, +dist.toFixed(1), charge);
          return prev.map((j) =>
            j.id === id ? { ...j, offers: [...j.offers, offer] } : j
          );
        });
      });
    });
  };

  const acceptOffer = (jobId: string, offer: Offer) => {
    const provider = PROVIDERS[offer.category].find(
      (p) => p.id === offer.providerId
    );
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: "accepted",
              acceptedOfferId: offer.id,
              providerId: offer.providerId,
              providerName: offer.providerName,
              providerPhone: provider?.phone,
              providerAvatarColor: offer.avatarColor,
              providerAvatarInitials: offer.avatarInitials,
              providerRating: offer.providerRating,
            }
          : j
      )
    );
    setActiveJobId(jobId);
    setStack(["activeJob"]);
    showToast(`${offer.providerName} is on the way`, "check");
    timer(1300, () =>
      addMessage(
        jobId,
        `Hi, thanks for accepting! I'm on my way — reaching in about ${offer.etaMin} mins. 🛠️`,
        offer.providerId
      )
    );
    timer(4500, () => setJobStatus(jobId, "on_the_way"));
    timer(9500, () => setJobStatus(jobId, "arrived"));
    timer(14500, () => setJobStatus(jobId, "in_progress"));
  };

  const declineOffer = (jobId: string, offerId: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, offers: j.offers.filter((o) => o.id !== offerId) } : j
      )
    );
  };

  const cancelRequest = (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: "cancelled" } : j))
    );
    setActiveRequestId(null);
    setStack([]);
    setTabState("jobs");
    showToast("Request cancelled", "info");
  };

  const completeJob = (jobId: string, rating: number, review: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, status: "completed", rating, review } : j
      )
    );
    setActiveJobId(null);
    setStack([]);
    setTabState("jobs");
    showToast("Job completed — thanks for rating!", "check");
  };

  /* ---------------- Provider actions ---------------- */

  const sendOffer = (requestId: string, charge: number) => {
    const req = nearbyRequests.find((r) => r.id === requestId);
    if (!req) return;
    setNearbyRequests((prev) => prev.filter((r) => r.id !== requestId));

    const job: Job = {
      id: uid("job"),
      customerId: uid("cust"),
      customerName: req.customerName,
      customerPhone: "+92 3XX XXX XXXX",
      customerAvatarColor: req.customerColor,
      customerAvatarInitials: req.customerAvatar,
      category: req.category,
      description: req.description,
      location: req.location,
      address: req.address,
      status: "open",
      createdAt: Date.now(),
      offers: [],
      fee: `₹${charge}`,
    };
    setJobs((prev) => [job, ...prev]);
    showToast(`Offer of ₹${charge} sent to ${req.customerName}`, "send");

    timer(5200, () => {
      setJobStatus(job.id, "accepted");
      setActiveJobId(job.id);
      setStack(["activeJob"]);
      showToast(`${req.customerName} accepted your offer!`, "check");
      timer(900, () =>
        addMessage(
          job.id,
          "Thanks for the offer! Please come as soon as possible. 🙏",
          job.customerId
        )
      );
    });
  };

  const updateJobStatus = (jobId: string, status: JobStatus) => {
    setJobStatus(jobId, status);
    if (status === "completed") {
      showToast("Job marked complete", "check");
      setActiveJobId(null);
      setStack([]);
      setTabState("jobs");
    }
  };

  /* ---------------- Chat ---------------- */

  const openChat = (jobId: string) => {
    setActiveJobId(jobId);
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      const peerId = job.providerId ?? job.customerId;
      markRead(jobId, peerId);
    }
    navigate("chat");
  };

  const sendMessage = (
    jobId: string,
    text: string,
    peer: { id: string; isProvider: boolean }
  ) => {
    addMessage(jobId, text, "me");
    timer(1300, () => markRead(jobId, "me"));
    timer(2400 + Math.random() * 1600, () => {
      addMessage(jobId, pickReply(peer.isProvider, text), peer.id);
    });
  };

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;

  const value: AppContextValue = {
    stage,
    setStage,
    user,
    tab,
    screen: stack[stack.length - 1] ?? null,
    jobs,
    nearbyRequests,
    messages,
    activeRequestId,
    activeJobId,
    activeJob,
    toast,
    draftCategory,
    setDraftCategory,
    location,
    gps,
    requestLocation,
    skipLocation,
    searchLocation,
    resetLocation,
    completeAuth,
    completeProviderSetup,
    updateProfile,
    toggleOnline,
    logout,
    setTab,
    navigate,
    back,
    postRequest,
    acceptOffer,
    declineOffer,
    cancelRequest,
    completeJob,
    sendOffer,
    updateJobStatus,
    openChat,
    markRead,
    sendMessage,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
