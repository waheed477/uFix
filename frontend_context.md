# uFix — Frontend Context

> On-demand home & vehicle services marketplace (plumbers, electricians, mechanics).
> Built on an inDrive-style "name your price" UX model — customers post a request,
> nearby pros send visiting-charge offers, and the customer accepts the best one.

---

## 1. Overview

| | |
|---|---|
| **App name** | **uFix** — premium text logo (lowercase "u" in teal gradient + extrabold "Fix" + amber dot) |
| **Concept** | Service marketplace for home / vehicle services |
| **Core loop** | Post request → receive offers → accept → unlock contact + chat → complete & rate |
| **Payment model** | Cash on completion — visiting charge is a call-out fee; final price agreed on site |
| **Roles** | Customer & Service Provider (Plumber / Electrician / Mechanic) |
| **Reference location** | Faisalabad, Pakistan (demo data uses +92 numbers & local areas) |

---

## 2. Tech Stack

- **React 19** + **TypeScript**
- **Vite** (single-file build via `vite-plugin-singlefile`)
- **Tailwind CSS v4** (CSS-based config via `@theme`)
- **Custom map** — no Google Maps API key required (stylised SVG city backdrop + native-feeling pins)
- **Real-time simulation** — Socket.io-style behavior (offers arrive live, chat auto-replies, status progression) implemented with a lightweight in-memory store + timers
- **Location** — `navigator.geolocation` + **OpenStreetMap Nominatim** (free, no key) for reverse geocoding & places autocomplete
- **Fonts** — Sora (display) + Inter (body) via Google Fonts

---

## 3. Design System

### Color palette
| Token | Role | Notes |
|---|---|---|
| `brand` | Primary — deep teal (#167a6c range) | Trustworthy + energetic |
| `accent` | Honey amber (#f98f07 range) | Pricing warmth & CTA energy |
| `ink` | Warm charcoal neutrals | Surfaces, text, borders |

Category colors (custom-styled icons): Plumber = sky blue, Electrician = amber/orange, Mechanic = rose/red.

Status color coding: green = online/active, amber = pending/awaiting, red = cancelled.

### Typography
- **Sora** — headings, brand marks, emphasis (`.font-display`)
- **Inter** — body text

### Components
- Rounded cards with soft shadows, generous white space
- Custom SVG icon set (~45 icons, consistent 1.8px stroke style)
- Buttons (7 variants), status badges, partial-fill star ratings + interactive star input
- Avatars with online-dot indicator, skeletons (shimmer), empty states, toasts
- 8 micro-animation keyframes (fade, slide-up, scale-in, pulse-ring, shimmer, etc.)

---

## 4. Architecture

```
src/
├── App.tsx                     # Root: device frame, stage router, screen stack, toast, bottom nav
├── index.css                   # Design tokens + animations (@theme)
├── lib/
│   ├── store.tsx               # Global state + simulated real-time engine
│   ├── types.ts                # Types, categories, statuses, seed providers/requests
│   └── location.ts             # GPS, reverse geocode, places autocomplete, coord mapping
├── components/
│   ├── ui.tsx                  # Icons, Logo, Wordmark, Button, Avatar, Stars, Skeleton, etc.
│   ├── MapView.tsx             # Custom map + pins (user dot, provider pin, draggable pin)
│   ├── BottomNav.tsx           # Bottom tab bar (Home / Jobs / Chat / Profile)
│   ├── PlaceSearch.tsx         # Google-Places-style autocomplete + location indicator
│   └── notifications.tsx       # Notification bell + dropdown panel
└── screens/
    ├── onboarding.tsx          # Splash, Auth (Google/OTP + role), Provider setup wizard
    ├── location.tsx            # GPS permission prompt screen
    ├── customer.tsx            # Customer home (map), New Request, Offers
    ├── provider.tsx            # Provider home (online toggle + incoming requests)
    ├── jobs.tsx                # Active job, Chat, Rating, Jobs list, Order history
    └── profile.tsx             # Profile tab + Edit profile
```

**State model:** React Context (`AppProvider`/`useApp`) drives everything — `stage`, `user`, `tab`, screen stack, `jobs`, `nearbyRequests`, `messages`, `location`, toasts.

---

## 5. Screens & Features

### 1. Splash / Onboarding
- Animated logo intro (premium uFix wordmark)
- Auto-advances to auth

### 2. Auth
- **Sign in with Google** (simulated)
- **Continue with Phone Number** → 6-digit OTP flow (auto-focus, backspace navigation)
- **Role selection** (Customer / Provider) during signup
- One-time **city/region** profile field (account reference only)

### 3. Provider profile setup (providers only)
- 3-step wizard: **Category** → **Service radius** (2–25 km slider) + experience → **Document upload** (verification badge)

### 4. Customer Home (map)
- Google-Maps-style map centered on user location
- **Category selector** (Plumber / Electrician / Mechanic icons)
- **Live location indicator** with tap-to-change (see §6)
- "Pros online near you" pill + floating **"Request a service"** button

### 5. New Request
- Problem description (with quick-example chips + char counter)
- Category confirmation
- **Draggable pin** with live reverse-geocoded address (spinner while resolving)

### 6. Offers (customer)
- Live incoming offers: provider name, rating, avatar, **visiting charge**, ETA, distance
- Sort by **lowest charge / fastest**, per-offer **Accept** + **Decline**
- Loading skeletons → thoughtful "No offers yet" empty state
- Cancel request action

### 7. Provider Home
- Prominent **Online/Offline toggle** (animated status card)
- Stats: today's earnings, jobs done, rating
- Incoming request cards (problem + location + distance) with **Send Offer** charge input

### 8. Active Job
- Unlocked contact + **native dialer call** button (`tel:`)
- **Chat** shortcut
- Animated **live status timeline** (On the way / Arrived / In progress / Completed)
- Role-aware CTA (provider advances status; customer rates on completion)

### 9. Chat
- Clean messaging UI, timestamps, **✓/✓✓ read receipts**, simulated auto-replies
- Unread badges flow into bottom-nav + notification bell

### 10. Job Completion & Rating
- 5-star interactive rating, quick tags, review text, "Submit rating & complete"

### 11. Profile
- Gradient hero card (rating, reviews, jobs), city display, edit profile, order history, earnings (provider), logout

### 12. Order History
- Past jobs with status badges (Completed / Cancelled) + **All/Completed/Cancelled** filter

### Notifications
- Bell icon (customer & provider) with live dropdown — offers, acceptance, "on the way", new requests, unread messages — unread counts, mark-all-read, tap-to-navigate

---

## 6. Location Handling (inDrive model)

1. **First-open GPS permission screen** — explains *why* location is needed **before** the native browser prompt (see pros nearby / accurate ETAs / pin exact spot), with a "skip / use default" option.
2. **Auto-center on live location** after grant — reverse-geocoded to a real address via OSM Nominatim.
3. **Places autocomplete search bar** at the top of the map — type an address/area/landmark to jump the map (e.g., "at my parent's house"); idle state doubles as the location indicator showing the detected address with tap-to-change.
4. **Draggable pin** to fine-tune exact location after GPS (GPS is often imprecise).
5. **One-time city/region signup field** — reference/account setup only, not the live mechanism.
6. **Location indicator** showing `📍 detected address` with tap-to-change + "use my current location" reset.

Graceful fallbacks: denied/offline falls back to a deterministic mock address (Model Town, Faisalabad) — never a blank screen.

---

## 7. Real-Time Simulation (store.tsx)

- Offers stream in on **staggered timers** after a request is posted (skeleton → live offer cards).
- On accept: provider status **auto-progresses** (on_the_way → arrived → in_progress) and phone numbers unlock.
- Chat **auto-replies** with context-aware responses (price / location / ETA keywords).
- Provider "send offer" simulates a customer **accepting ~5s later**.
- Timers are guarded (cancelled jobs stop receiving offers) and cleared on logout.

---

## 8. Notable UX Details

- Mobile-first, scales to a **centered phone frame** with ambient gradient on desktop
- Bottom navigation with **unread chat badge**
- Micro-interactions on all taps (`active:scale`, hover states)
- Safe-area insets for notched devices
- Empty states designed for every list (offers, chat, requests, jobs, history)
- Custom map pins: pulsing user dot, category-colored provider pins, draggable request pin

---

## 9. Build

```
npm run build   →  dist/index.html (single file, ~105 kB gzipped)
```

No external API keys required — the map, autocomplete, and reverse-geocoding work out of the box.
