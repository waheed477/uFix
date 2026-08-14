# uFix — On-Demand Home & Auto Services

> A premium, mobile-first service marketplace for plumbers, electricians and
> mechanics. Built on an inDrive-style "name your price" UX model.

Customers post a service request with their location and problem description.
Nearby pros send **visiting-charge offers** with an estimated arrival time. The
customer compares offers and accepts the best one — then both parties' phone
numbers unlock for direct calling, and an in-app chat opens. Final pricing is
negotiated on site; payment is cash (no online payment flow).

## ✨ Features

- Dual-role dashboards — **Customer** & **Service Provider** (Plumber / Electrician / Mechanic)
- Splash, Auth (Google + Phone OTP), role selection & provider profile setup wizard
- **Live map** with category selector, draggable request pin & places autocomplete
- **Real-time offers** (simulated Socket.io behavior) with sorting & skeletons
- Provider online/offline toggle + incoming request cards with "Send Offer"
- Active job screen with live status timeline + native dialer call + chat
- Chat with read receipts (`✓ / ✓✓`) and auto-replies
- 5-star rating & review, order history with status badges
- Notification bell, empty states, micro-interactions, fully responsive

## 🧱 Tech Stack

- **React 19** + **TypeScript** + **Vite** (single-file build)
- **Tailwind CSS v4** (CSS-based design tokens via `@theme`)
- Custom SVG map (no Google Maps API key needed)
- OpenStreetMap **Nominatim** for reverse geocoding & places autocomplete
- Sora + Inter fonts

## 🚀 Getting Started

```bash
# install dependencies
npm install

# start dev server
npm run dev

# production build (outputs a single dist/index.html)
npm run build
```

## 📁 Structure

```
src/
├── App.tsx               # Root shell, stage router, screen stack, bottom nav
├── index.css             # Design system tokens + animations
├── lib/                  # store (state + real-time sim), types, location
├── components/           # UI kit, map, bottom nav, search, notifications
└── screens/              # onboarding, location, customer, provider, jobs, profile
```

See `frontend_context.md` for the full feature documentation.
