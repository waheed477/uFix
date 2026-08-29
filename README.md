# uFix — On-Demand Home & Vehicle Services Marketplace

> **A production-grade, real-time two-sided marketplace** that connects customers with nearby
> plumbers, electricians and mechanics — from OTP signup to live offers, job tracking with
> privacy-gated contact unlock, in-job chat, ratings, and full order history.

Built with **React 19 + TypeScript + Vite + Tailwind v4** on the front and
**Node.js + Express + Socket.io + MongoDB (Mongoose, 2dsphere)** on the back.
Deployment-ready on **Render + Vercel** (blueprint included), hardened for production, and
protected by **456 automated checks across 22 test suites — all green.**

---

## Why this project matters to a recruiter

| Dimension | What you will find here |
|---|---|
| **Product thinking** | A complete, opinionated user journey — not a CRUD demo. Privacy is a feature: a customer's phone number is **only unlocked after they accept a provider's offer**, and a provider's exact work location is **never revealed before job acceptance** (coarse pre-acceptance grid instead). |
| **Real-time engineering** | Socket.io with JWT-authenticated handshakes, per-user rooms, live offer/request propagation to nearby participants, chat with read-receipts, and optimistic-UI reconciliation (no duplicate messages, no flicker). |
| **Geospatial depth** | MongoDB 2dsphere indexes, radius/category/availability-filtered matching, Haversine distances with honest ETA math (18 km/h city average), city-based matching rules. |
| **Security posture** | helmet, layered rate limiting (per-route ceilings with friendly 429s), strict allow-list CORS, dual-token JWT (short-lived access + refresh with server-side session revocation), input validation bounds, dev-only routes that return 404 in production, and a dedicated post-deploy smoke tool (`tests/prod-smoke.js`). |
| **Quality discipline** | 22-suite npm script battery (456/456 passing) covering E2E bidirectional flows, auth, chat, offers, distance UX, UI polish, rate limits and security headers. Regression guards freeze fixed bugs (city-override, null-user) against future changes. |
| **Docs as deliverables** | A hardened deployment guide ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) with env catalog, secret hygiene rules, and a verified post-deploy security checklist. Honest engineering notes: known limitations are documented, not hidden. |

---

## The product flow

```
Customer                                    Provider
   │                                            │
   │  Phone OTP / Google Sign-In  ─────────────▶│  Phone OTP / Google Sign-In
   │  (phone mandatory; set-once               │  (same rules — auth method agnostic)
   │   contract for legacy accounts)           │
   │                                            │
   │  GPS location + city                      │  Setup: category, radius, experience,
   ▼                                            ▼  verification document
   │                                            │
   │  Creates service request ─▶ 2dsphere ─▶ Broadcast to nearby, online,
   │                            matching      verified, matching-category providers
   │                                            │
   │  ◀──────── live incoming offers (price, ETA, rating) ────── offers submitted
   │                                            │
   │  Accepts one offer ───── ▶ Job created (on_the_way)
   │  🔓 Contact unlock:                 🔓 Contact unlock:
   │     provider's phone + map pin    ▶    customer's phone + address
   │                                            │
   │  Live status timeline (provider advances: arrived → in_progress → completed)
   │  In-job chat (history, live messages, ✓/✓✓ read receipts)
   │  Rating (1–5 + comment, one per job, aggregated to profile)
   │  Order history (merged completed + cancelled, newest-first)
```

Key rules enforced server-side: one open request per customer, one offer per provider per
request (unique compound index), job status **forward-only** (no skips, no rewinds),
duplicate ratings blocked (compound unique index), phones immutable once set
(`403 PHONE_LOCKED`, set-once only for legacy phone-less accounts).

---

## Architecture

```
┌─────────────────────────┐          ┌──────────────────────────────┐
│  Frontend (Vite/React)   │  HTTPS   │  Backend (Express)            │
│  · lib/api.ts    REST    │─────────▶│  · routes → controllers       │
│  · lib/socket.ts WS      │◀────────▶│  · Socket.io (JWT handshake)  │
│  · lib/adapters.ts DTO   │  WS      │  · services: geo matching,    │
│  · store.tsx  app state  │          │    notifications, tokens      │
└─────────────────────────┘          └──────────────┬───────────────┘
                                                    │ Mongoose
                                        ┌───────────▼───────────────┐
                                        │  MongoDB Atlas (2dsphere) │
                                        └───────────────────────────┘
                            Cloudinary — profile & verification uploads
```

**Design decisions, on purpose:** in-memory Socket.io adapter (no Redis — deliberate for
single-instance deployment), x/y↔lat/lng conversion kept frontend-side, notification
persistence behind a single `createNotification` utility wired into 7 trigger points,
fail-fast boot when `MONGO_URI` is missing in production (loud error over silent hangs).

---

## Feature matrix

| Area | Highlights |
|---|---|
| **Auth** | Phone OTP (6-digit, expiring), Google Sign-In, linking an email-linked Google account, dual-token JWT with refresh + revocation, mandatory phone policy with **set-once-then-locked** repair path for legacy accounts |
| **Requests & matching** | One request per customer, geofenced broadcast, category/radius/online/verified filters |
| **Offers** | Price + ETA, one-per-provider uniqueness, live customer feed, optimistic UI with server reconciliation |
| **Jobs** | Accept → auto-created job, forward-only status machine, contact unlock on acceptance, pre-acceptance location privacy grid |
| **Chat** | History pagination, live delivery, read receipts, per-job scoping, anti-duplicate guards |
| **Ratings** | 1–5 + comment, one per job, `$avg/$count` aggregation on profiles |
| **Notifications** | Persisted + live bell (unread badge), 7 trigger points, mark-read / read-all |
| **Profile** | Edit name/city/photo; set-once phone repair for legacy Google users; provider work-location pinning (manual > GPS) with mismatch banner |
| **Admin hooks** | Provider verification status, document upload, verify endpoint (admin-secret guarded) |

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Socket.io-client, Leaflet (work-location map) |
| Backend | Node.js, Express, Mongoose (2dsphere), Socket.io, JWT (access + refresh), Cloudinary + Multer |
| Security | helmet, express-rate-limit, strict CORS allow-list, validation bounds, prod smoke-tool (`tests/prod-smoke.js`) |
| Testing | 22 custom suites (E2E lifecycle, bidirectional chat, security hardening, sound system, distance UX, UI polish) — `bash backend/tests/run.sh` |
| Deploy | Render (API + WS, `render.yaml` blueprint) + Vercel (frontend), UptimeRobot ping, MongoDB Atlas M0 |

---

## Quick start (≈5 minutes)

```bash
# 1) Backend — zero-config sandbox mode (in-memory MongoDB, OTP printed to console)
cd backend && npm install && node dev-inmemory.js

# 2) Frontend
cd frontend && npm install
cp .env.example .env   # VITE_API_URL=http://localhost:5000, VITE_SOCKET_URL=http://localhost:5000
npm run dev

# 3) Production-like local run
#    fill backend/.env from backend/.env.example (MONGO_URI, JWT_SECRET …) then:
cd backend && npm start

# 4) Full regression battery (spawns isolated in-memory servers)
cd backend && bash tests/run.sh      # 22 suites — expect ALL GREEN
```

---

## Deployment

One-command blueprint: `render.yaml` (web service with health check), steps and every env
variable documented in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — including secret
generation, exact-match CORS, rate-limit etiquette for uptime pings, and a scripted
**post-deploy security smoke**: `API_URL=... CLIENT_URL=... node backend/tests/prod-smoke.js`.

Known next-step (documented, by design before real user rollout): plug a real SMS provider
(Twilio/Firebase) into `/api/auth/phone/send-otp` — OTP currently prints to server logs in
development. Google Sign-In works without it.

---

## Repository structure

```
uFix/
├── frontend/              # React 19 + TS — screens, components, state store, API/socket clients
├── backend/
│   ├── src/               # models / controllers / routes / sockets / utils / middleware
│   ├── tests/             # 22-suite battery + prod-smoke.js — bash tests/run.sh
│   └── dev-inmemory.js    # zero-config sandbox runner (in-memory Mongo)
├── docs/                  # DEPLOYMENT.md (hardened), testing guides
├── render.yaml            # Render blueprint
└── project_context.md     # engineering log: phases, decisions, regression history
```

For the deep-dive on architecture decisions and bug-fix history, see
[project_context.md](project_context.md).

---

## Roadmap

- [ ] Real SMS OTP (Twilio/Firebase) — integration point ready
- [ ] Push notifications (FCM) alongside in-app bell
- [ ] Payments / escrow on job completion
- [ ] Multi-redis Socket.io adapter for horizontal scaling

---

## Author

**Waheed** — [@waheed477](https://github.com/waheed477)

If you're a recruiter or a hiring engineer: the code, the tests and the docs are the
interview — everything above is reproducible locally in minutes. Feedback and questions
are welcome via GitHub.
