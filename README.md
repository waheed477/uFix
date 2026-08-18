# uFix — On-Demand Home & Vehicle Services Marketplace

> A premium, mobile-first service marketplace for plumbers, electricians and mechanics — **Phase 9 Complete, Site Fully Functional End-to-End.**

**Flow now fully real:** Customer signup via Phone OTP (real POST /api/auth/phone/send-otp + verify-otp, JWT localStorage) → Location permission + PATCH /api/users/location (GPS + reverse geocode + x/y ↔ lat/lng via coordsToOffset/offsetToCoords frontend-side) → Customer Home map (only user dot, removed fake SCATTER/onlineCount per task instruction) → New Request POST /api/requests (x,y→lat,lng conversion) → Nearby providers get request:new live via Socket.io + notification:new (request_new) → Provider Home shows real nearby requests via GET /api/requests/nearby + socket request:new live, online/offline toggle via PATCH /api/users/profile isOnline (Phase 9 backend fix), Send Offer via POST /api/requests/:id/offers → Customer gets offer:new live + notification:new (new_offer) → Offers screen real GET /api/requests/:id/offers + socket offer:new live, Accept via PATCH /api/offers/:id/accept → Job auto-created on_the_way with phones unlocked + offer:accepted/rejected/closed + notifications → Active Job via GET /api/jobs/my/active + job:statusUpdate live, status advance via PATCH /api/jobs/:id/status provider-only forward no skip/backward, call button tel: with real unlocked phone from Job response, Chat via GET /api/jobs/:jobId/messages history + chat:send emit + chat:message live + chat:markRead + chat:read ticks, Rating via POST /api/jobs/:jobId/rate, Order History via GET /api/jobs/history?status=all|completed|cancelled (Option B merged endpoint), Notifications bell via GET /api/notifications + notification:new live + mark read.

---

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Socket.io-client, Fetch API client (lib/api.ts), Socket client (lib/socket.ts), Adapters (lib/adapters.ts)
- **Backend:** Node.js, Express, MongoDB (Mongoose 2dsphere), Socket.io (room user:{id}, in-memory adapter no Redis deliberate), Cloudinary + Multer, JWT (HTTP Bearer + Socket handshake.auth.token), Google Auth + Phone OTP, Review (compound unique job+fromUser + aggregation $avg), Notification (persistence + notification:new live)

## Completed Phases (Site Complete)
- [x] Phase 0: Setup & foundation
- [x] Phase 1: Auth & User Model - phone mandatory, role customer/provider, Google + Phone OTP + JWT, auth middleware
- [x] Phase 2: Profile & Provider Setup - picture upload Cloudinary mock, setup category/radiusKm/yearsExperience, document upload, verification status
- [x] Phase 3: Location & Geospatial - User location GeoJSON Point [lng,lat] 2dsphere index, PATCH /api/users/location, findNearbyProviders/Requests, Haversine, [lng,lat] order critical
- [x] Phase 4: Core Request & Offer Flow - Request (customer, category, description, location 2dsphere, address, status pending/active/completed/cancelled), Offer (request, provider, visitingCharge, etaMinutes, status pending/accepted/rejected, unique compound request+provider), one open request per customer, nearby for providers filtered by category/radius/online/verified, offer creation checks, accept atomic status=pending + Job creation
- [x] Phase 5: Real-Time - Socket.io attached to same HTTP server, JWT auth via handshake.auth.token, room auto-join user:{id}, events request:new (nearby 15km), offer:new (to customer), offer:accepted/rejected/closed/cancelled, in-memory adapter no Redis deliberate
- [x] Phase 6: Job Lifecycle & Contact Unlock + Adapter Layer - Job (request unique, customer, provider, offer, status on_the_way/arrived/in_progress/completed, statusHistory, completedAt), contact unlock at acceptance via Job creation (GET /api/jobs/:id includes both phones), status forward only no skip/backward provider-only, my/active both roles, job:statusUpdate to both, adapters etaMinutes→etaMin, providerId, timestamp, avatar initials/color, x/y via coordsToXY, geoLocation preserved, decision x/y frontend-side via coordsToOffset
- [x] Phase 7: Chat System - Message (job indexed, sender, text 1-2000, readAt null), GET /api/jobs/:jobId/messages history oldest-first with before+limit, only participants, socket chat:send validates participant text, saves Message, emits chat:message to both + notifies recipient new_message, chat:markRead marks unread not sent by requester as read, emits chat:read for ✓/✓✓, chat:error codes
- [x] Phase 8: Notification Persistence, Ratings & Order History - Review (job, fromUser, toUser, rating 1-5 integer, comment max 500, compound unique job+fromUser, aggregation $avg $count rounded 1 decimal), POST /api/jobs/:jobId/rate only completed rates other party auto, duplicate blocked, GET reviews, Order History GET /api/jobs/history?status=all|completed|cancelled merged completed Jobs + cancelled Requests sorted newest-first paginated Option B (single endpoint), Notification (user indexed, type enum [new_offer, offer_accepted, offer_rejected, request_new, request_cancelled, job_status_update, new_message], title, body, relatedId, isRead), utility createNotification saves DB + emits notification:new to user:{id}, wired into 7 trigger points, GET /api/notifications with unreadCount, PATCH read/read-all
- [x] Phase 9: Frontend Integration - Real client, no more timers/mock/auto-replies - lib/api.ts fetch wrapper Bearer JWT base URL from VITE_API_URL env + 401 logout, lib/socket.ts Socket.io client auth token connect after login disconnect logout, lib/adapters.ts maps backend to frontend types, onboarding real send-otp/verify-otp + Google + JWT localStorage persistence (standalone Vite app, not artifact), location sends coords to PATCH /api/users/location + x/y ↔ lat/lng via coordsToOffset/offsetToCoords frontend-side, customer flow New Request POST /api/requests + Offers via real GET + socket offer:new live + Accept via PATCH accept, provider flow online toggle via PATCH profile isOnline (backend fix), nearby via GET nearby + socket request:new, Send Offer via POST, active job via GET my/active + job:statusUpdate live + status advance via PATCH + call tel: real unlocked phone, chat via GET messages history + chat:send emit + chat:message live + markRead + read ticks, rating via POST rate, notifications via GET notifications + notification:new live + mark read, order history via GET history with All/Completed/Cancelled filter (Option B), removed dead mock code (staggered timers, auto-status, auto-replies, fake SCATTER/onlineCount), preserved visual design, error/loading skeletons trigger on real network latency

## API Endpoints
- Health: GET /, GET /api/health
- Auth: POST /api/auth/google, POST /api/auth/phone/send-otp, POST /api/auth/phone/verify-otp, GET /api/auth/me
- Users: GET /api/users/profile, PATCH /api/users/profile (name, city, profilePicture, isOnline - Phase 9 fix), POST /api/users/profile/picture, PATCH /api/users/location
- Providers: PATCH /api/providers/setup, POST /api/providers/document, GET /api/providers/verification-status, PATCH /api/providers/:id/verify
- Requests: POST /api/requests, GET /api/requests/nearby, GET /api/requests/my, GET /api/requests/:id, PATCH /api/requests/:id/cancel
- Offers: POST /api/requests/:id/offers, GET /api/requests/:id/offers, PATCH /api/offers/:id/accept
- Jobs: GET /api/jobs/:id, PATCH /api/jobs/:id/status, GET /api/jobs/my/active, GET /api/jobs/history?status=all|completed|cancelled, POST /api/jobs/:jobId/rate, GET /api/jobs/:jobId/reviews
- Messages: GET /api/jobs/:jobId/messages
- Notifications: GET /api/notifications, PATCH /api/notifications/:id/read, PATCH /api/notifications/read-all
- Socket.io: ws://localhost:PORT, auth JWT via handshake.auth.token, rooms user:{id}, events: request:new, offer:new, offer:accepted, offer:rejected, request:closed, request:cancelled, job:statusUpdate, chat:send, chat:message, chat:markRead, chat:read, chat:error, notification:new

## Environment Variables
Backend: PORT, MONGO_URI, CLIENT_URL, NODE_ENV, JWT_SECRET, GOOGLE_CLIENT_ID, OTP_EXPIRY_MINUTES, CLOUDINARY_CLOUD_NAME/KEY/SECRET, ADMIN_SECRET
Frontend: VITE_API_URL (http://localhost:5000), VITE_SOCKET_URL (http://localhost:5000) - no hardcoded localhost:5000 in code, all via env, .env.example provided

## Folder Structure (Simplified)
```
uFix/
├── frontend/
│   ├── src/lib/
│   │   ├── api.ts (fetch wrapper Bearer JWT, base URL env, 401 logout, organized endpoints)
│   │   ├── socket.ts (Socket.io client auth token, connect after login, central listeners)
│   │   ├── adapters.ts (maps backend to frontend types, etaMinutes→etaMin, providerId, timestamp, avatar initials/color, x/y via coordsToXY)
│   │   ├── location.ts (GPS + reverse geocode + offsetToCoords/coordsToOffset)
│   │   ├── store.tsx (REWRITTEN Phase 9 - real backend, no timers/mock, socket listeners, real auth, location, customer/provider flows, jobs, chat, notifications, history, loading/error)
│   │   └── types.ts
│   ├── src/screens/
│   │   ├── onboarding.tsx (real send-otp/verify-otp + Google + JWT localStorage + role + provider setup wizard)
│   │   ├── location.tsx (GPS + PATCH location)
│   │   ├── customer.tsx (removed fake SCATTER/onlineCount, New Request POST, Offers real GET + socket offer:new)
│   │   ├── provider.tsx (online toggle via PATCH isOnline backend fix, nearby via GET nearby + socket request:new)
│   │   ├── jobs.tsx (Active Job via GET my/active + job:statusUpdate live, Chat via GET history + socket send/message/read, Rating via POST rate, JobsTab + History via GET history with filter)
│   │   └── profile.tsx
│   ├── src/components/notifications.tsx (real GET notifications + notification:new live)
│   ├── .env.example (VITE_API_URL, VITE_SOCKET_URL)
│   └── package.json (+ socket.io-client)
├── backend/
│   ├── src/models/ User (2dsphere, rating avg), Otp, Request (2dsphere), Offer (unique), Job (unique request), Message (job+createdAt), Review (job+fromUser unique), Notification (user+createdAt desc)
│   ├── src/controllers/ auth, user (added isOnline Phase 9 fix), provider, request (emits + notifies), offer (creates Job + emits + notifies), job (contact unlock + status + emits + notifies + history Option B), message, review (aggregation), notification
│   ├── src/routes/ health, auth, user, provider, request, offer, job (my/active, history, :id, :id/status, :id/rate, :id/reviews), message, review, notification
│   ├── src/sockets/ authSocket (JWT handshake), index (initSocket, room user:{id}, setNotifyIO), chatSocket (chat:send, chat:message + notifies, markRead, read)
│   ├── src/utils/ generateToken, geo (findNearbyProviders/Requests), responseAdapters, notify (createNotification + emits notification:new)
│   └── src/server.js (http.createServer + initSocket + Phase 9 version)
└── project_context.md (simplified per request - only phases mention up to complete site)
```

## Phase 9 Backend Fixes
- PATCH /api/users/profile did not accept isOnline boolean for provider online/offline toggle (Phase 2 only allowed name, city, profilePicture). Added isOnline support as minimal fix in backend userController. Documented.

## Frontend Integration Summary
- API Client: lib/api.ts fetch wrapper, Bearer JWT from localStorage (standalone Vite app, not artifact, so localStorage appropriate), base URL from VITE_API_URL env, 401 triggers logout via custom event
- Socket Client: lib/socket.ts Socket.io client auth token, connect after login, disconnect logout, central on/off/emit helpers, re-connect with new token
- JWT Storage: localStorage TOKEN_KEY ufix_jwt + USER_KEY ufix_user, stays logged in across refreshes, for artifact would be memory-only but for standalone Vite localStorage appropriate
- Auth: onboarding real send-otp/verify-otp + Google POST /api/auth/google, JWT localStorage, role + provider setup wired, socket connect after login
- Location: GPS + reverseGeocode + PATCH /api/users/location + x/y ↔ lat/lng via coordsToOffset/offsetToCoords frontend-side per Phase 6 decision (backend provides geoLocation)
- Customer: Home map only user dot (removed fake SCATTER/onlineCount per task instruction - backend has findNearbyProviders utility but no customer-facing route, omitted with TODO), New Request POST /api/requests with x,y→lat,lng conversion, Offers via real GET + socket offer:new live, Accept via PATCH accept
- Provider: Online toggle via PATCH profile isOnline (backend fix), nearby via GET nearby on mount/refresh + socket request:new live + request:closed/cancelled removal, Send Offer via POST
- Active Job: GET my/active on mount + job:statusUpdate live, status advance via PATCH, call tel: with real unlocked phone
- Chat: GET messages history on open + chat:send emit + chat:message live + markRead when focused + read ticks via chat:read
- Rating: POST /api/jobs/:jobId/rate
- Notifications: GET /api/notifications with unreadCount + notification:new live + mark read
- Order History: GET /api/jobs/history?status=all|completed|cancelled (Option B merged)
- Dead Code Removed: staggered offer timers (1600,3400,5600), auto-status progression (4500→on_the_way, 9500→arrived, 14500→in_progress), chat auto-replies (PROVIDER_REPLIES/CUSTOMER_REPLIES + keyword detection), fake SCATTER/onlineCount, SEED_REQUESTS mock no longer used in store (kept in types.ts for category config reference)
- Error/Loading: Every real API call has loading skeletons via isLoading state during real network latency, error states via toast on real failures

## Screen → Backend Mapping
| Screen | Backend Endpoint(s) | Socket Events Used |
|---|---|---|
| Splash | None (checks localStorage token, tries GET /api/users/profile) | None |
| Auth Welcome (phone) | POST /api/auth/phone/send-otp | None |
| Auth OTP | POST /api/auth/phone/verify-otp (phone, otp, name, role, city) | None |
| Auth Details (role, name, city) | POST /api/auth/phone/verify-otp (with name, role, city) | None |
| Auth Google | POST /api/auth/google | None |
| Provider Setup Category/Coverage | PATCH /api/providers/setup {category, radiusKm, yearsExperience} | None |
| Provider Setup Verification | POST /api/providers/document | None |
| Location Permission | navigator.geolocation + OSM reverseGeocode + PATCH /api/users/location {lng,lat} | None |
| Customer Home Map | No customer-facing nearby providers count route - omitted, TODO | None |
| Customer PlaceSearch | OSM searchPlaces + reverseGeocode + PATCH /api/users/location | None |
| New Request | POST /api/requests {category, description, lng, lat, address} (x,y→lat,lng via offsetToCoords) | None (triggers request:new to providers) |
| Offers | GET /api/requests/:id/offers + POST /api/offers/:id/accept + PATCH /api/requests/:id/cancel | offer:new (append live) |
| Provider Home Online Toggle | PATCH /api/users/profile {isOnline} (Phase 9 fix) | None |
| Provider Home Nearby | GET /api/requests/nearby + refresh button | request:new (append), request:closed/cancelled (remove) |
| Provider Send Offer | POST /api/requests/:id/offers {visitingCharge, etaMinutes} | None (triggers offer:new to customer) |
| Active Job | GET /api/jobs/my/active + GET /api/jobs/:id | job:statusUpdate (update timeline live) |
| Active Job Status Advance | PATCH /api/jobs/:id/status {status} | None (triggers job:statusUpdate to both) |
| Chat | GET /api/jobs/:jobId/messages?before&limit + chat:send emit + chat:markRead | chat:message (append live), chat:read (update ✓/✓✓), chat:error |
| Rating | POST /api/jobs/:jobId/rate {rating, comment} | None |
| Jobs Tab | GET /api/requests/my (customer) + GET /api/jobs/my/active + GET /api/jobs/history?status=all (provider) via refreshJobs | job:statusUpdate |
| Order History | GET /api/jobs/history?status=all|completed|cancelled&page&limit (Option B merged) | None |
| Profile Edit | PATCH /api/users/profile {name, city} | None |
| Profile Picture | POST /api/users/profile/picture | None |
| Notifications Bell | GET /api/notifications?page&limit + PATCH /:id/read + PATCH /read-all | notification:new (prepend live + increment badge) |

## TODO Next Phases
- [ ] Phase 10: Deployment (Render backend + Vercel/Netlify frontend + UptimeRobot ping + production env vars)

## Notes
- Frontend now real client: no more timers, no more mock data, no more simulated auto-replies - verified via build + manual two-session test (customer + provider completing entire loop)
- Visual design, screens, component structure preserved from original build - only data layer changed
- Backend gap fixed: PATCH /api/users/profile now accepts isOnline for online/offline toggle
- Pros online nearby count removed per task instruction - no backing route, omitted with TODO rather than fake number
- JWT storage: localStorage for standalone Vite app (not artifact)
- Site fully functional end-to-end
