# uFix - Project Context

## Current Status
Phase 9 completed — Site fully functional end-to-end (2026-08-15)

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Socket.io-client, Fetch API client
- **Backend:** Node.js, Express, MongoDB (Mongoose) with 2dsphere indexes, Socket.io, Cloudinary + Multer, JWT (HTTP + WebSocket), Google Auth + Phone OTP
- **Maps:** Custom SVG map + OSM Nominatim - backend provider-agnostic [lng,lat]
- **Real-Time:** Socket.io room-based `user:{id}`, in-memory adapter, events: request:new, offer:new, offer:accepted/rejected, request:closed/cancelled, job:statusUpdate, chat:message/read, notification:new

## Completed Phases
- [x] Phase 0: Project setup & foundation - Express server + MongoDB connection + health check, frontend/backend separate folders
- [x] Phase 1: Authentication & User Model - User model with phone mandatory, role customer/provider, Google Sign-In + Phone OTP simple custom system + JWT, auth middleware + roleCheck
- [x] Phase 2: User Profile & Provider Setup - Profile update, picture upload via Cloudinary (mock mode if creds missing), provider setup category/radiusKm/yearsExperience, document upload, verification status pending/approved/rejected with temporary admin route
- [x] Phase 3: Location & Geospatial Setup - User location GeoJSON Point [lng,lat] with 2dsphere index, PATCH /api/users/location validates -180..180/-90..90, utils/geo.js findNearbyProviders + findNearbyRequests + Haversine, coordinate order [lng,lat] critical
- [x] Phase 4: Core Request & Offer Flow - Request model (customer, category, description, location 2dsphere, address, status pending/active/completed/cancelled, acceptedOffer/Provider), Offer model (request, provider, visitingCharge, etaMinutes, status pending/accepted/rejected, unique compound request+provider), one open request per customer, nearby requests for providers filtered by category/radius/online/verified, offer creation with category match/verified/online/duplicate checks, accept with atomic status check + Job creation
- [x] Phase 5: Real-Time Layer - Socket.io attached to same HTTP server, JWT auth via handshake.auth.token, room auto-join user:{id}, events request:new to nearby providers, offer:new to customer, offer:accepted/rejected/closed/cancelled, in-memory adapter deliberate no Redis
- [x] Phase 6: Job Lifecycle & Contact Unlock + Adapter Layer - Job model (request unique, customer, provider, offer, status on_the_way/arrived/in_progress/completed, statusHistory, completedAt), contact unlock at acceptance via Job creation (GET /api/jobs/:id includes both phones), status progression provider-only forward no skip/backward, GET /my/active, job:statusUpdate to both, adapter layer responseAdapters.js etaMinutes→etaMin, provider.id→providerId, createdAt→timestamp, x/y via coordsToXY
- [x] Phase 7: Chat System - Message model (job indexed, sender, text 1-2000, readAt null), GET /api/jobs/:jobId/messages history oldest-first (REST for history, Socket for sending), socket events chat:send validates participant, saves Message, emits chat:message to both, chat:markRead marks unread not sent by requester as read, emits chat:read for ✓/✓✓, chat:error with codes
- [x] Phase 8: Notification Persistence, Ratings & Order History - Review model (job, fromUser, toUser, rating 1-5 integer, comment max 500, compound unique job+fromUser, aggregation $avg $count for User rating), POST /api/jobs/:jobId/rate (only completed, rates other party auto, duplicate blocked), GET /reviews, GET /api/jobs/history?status=all|completed|cancelled merged completed Jobs + cancelled Requests sorted newest-first paginated (Option B), Notification model (user indexed, type enum, title, body, relatedId, isRead), utility createNotification saves DB + emits notification:new, wired into 7 trigger points (request_new, new_offer, offer_accepted/rejected, request_cancelled, job_status_update, new_message), GET /api/notifications with unreadCount, PATCH /:id/read and /read-all
- [x] Phase 9: Frontend Integration - Real client, no more timers/mock data/auto-replies - API client lib/api.ts fetch wrapper with JWT Bearer + base URL from VITE_API_URL env + 401 logout, socket client lib/socket.ts with JWT auth, auto-join user:{id}, central listeners, auth wired to real POST /api/auth/google + send-otp/verify-otp with localStorage JWT persistence, location handling sends detected coords to PATCH /api/users/location + x/y ↔ lat/lng conversion via coordsToOffset/offsetToCoords frontend-side, customer flow New Request → POST /api/requests + Offers via real GET /api/requests/:id/offers + socket offer:new live + Accept via PATCH /api/offers/:id/accept, provider flow online/offline toggle via PATCH /api/users/profile isOnline (backend fix), incoming requests via GET /api/requests/nearby + socket request:new, Send Offer via POST /api/requests/:id/offers, active job via GET /api/jobs/my/active + job:statusUpdate live, status advance via PATCH /api/jobs/:id/status, call button tel: link with real unlocked phone, chat via GET /api/jobs/:jobId/messages history + chat:send emit + chat:message live + chat:markRead + chat:read ticks, rating via POST /api/jobs/:jobId/rate, notifications via GET /api/notifications + notification:new live + mark read, order history via GET /api/jobs/history with All/Completed/Cancelled filter (Option B merged endpoint), removed dead mock code (staggered offer timers, auto-status progression, chat auto-replies, fake SCATTER/onlineCount)

## API Endpoints (Live)
- Health: GET /, GET /api/health
- Auth: POST /api/auth/google, POST /api/auth/phone/send-otp, POST /api/auth/phone/verify-otp, GET /api/auth/me
- Users: GET /api/users/profile, PATCH /api/users/profile (name, city, profilePicture, isOnline - Phase 9 fix), POST /api/users/profile/picture, PATCH /api/users/location
- Providers: PATCH /api/providers/setup, POST /api/providers/document, GET /api/providers/verification-status, PATCH /api/providers/:id/verify
- Requests: POST /api/requests, GET /api/requests/nearby, GET /api/requests/my, GET /api/requests/:id, PATCH /api/requests/:id/cancel
- Offers: POST /api/requests/:id/offers, GET /api/requests/:id/offers, PATCH /api/offers/:id/accept
- Jobs: GET /api/jobs/:id, PATCH /api/jobs/:id/status, GET /api/jobs/my/active, GET /api/jobs/history?status=all|completed|cancelled, POST /api/jobs/:jobId/rate, GET /api/jobs/:jobId/reviews
- Messages: GET /api/jobs/:jobId/messages
- Notifications: GET /api/notifications, PATCH /api/notifications/:id/read, PATCH /api/notifications/read-all
- Socket.io: ws://localhost:PORT - auth via handshake.auth.token, rooms user:{id}, events: request:new, offer:new, offer:accepted, offer:rejected, request:closed, request:cancelled, job:statusUpdate, chat:send, chat:message, chat:markRead, chat:read, chat:error, notification:new

## Database Schema (Current)
- User: name, email sparse unique, googleId sparse unique, phone unique required, role customer/provider, profilePicture, city, location Point [lng,lat] 2dsphere, isOnline, isVerified, category, radiusKm 2-25, yearsExperience, documentUrl, verificationStatus, rating avg, reviews count
- Otp: phone, otp 6-digit, expiresAt TTL 5min, attempts max5
- Request: customer ref, category plumber/electrician/mechanic, description 10-1000, location Point [lng,lat] 2dsphere required, address, status pending/active/completed/cancelled, acceptedOffer, acceptedProvider
- Offer: request ref, provider ref, visitingCharge >0, etaMinutes >0, status pending/accepted/rejected, unique compound (request,provider)
- Job: request unique ref, customer ref, provider ref, offer ref, status on_the_way/arrived/in_progress/completed, statusHistory {status,timestamp}, completedAt
- Message: job ref indexed, sender ref, text 1-2000 trimmed non-empty, readAt null=unread, job+createdAt index
- Review: job ref, fromUser ref, toUser ref, rating 1-5 integer, comment max 500, compound unique (job,fromUser)
- Notification: user recipient indexed, type enum [new_offer, offer_accepted, offer_rejected, request_new, request_cancelled, job_status_update, new_message], title, body, relatedId, isRead, indexes user+createdAt desc, user+isRead

## Environment Variables
Backend: PORT, MONGO_URI, CLIENT_URL, NODE_ENV, JWT_SECRET, GOOGLE_CLIENT_ID, OTP_EXPIRY_MINUTES, CLOUDINARY_CLOUD_NAME/KEY/SECRET, ADMIN_SECRET
Frontend: VITE_API_URL (http://localhost:5000), VITE_SOCKET_URL (http://localhost:5000) - no hardcoded localhost:5000 in code, all via env, with .env.example

## Folder Structure
```
uFix/
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts (NEW Phase 9 - fetch wrapper Bearer JWT, base URL env, 401 logout, organized endpoints)
│   │   │   ├── socket.ts (NEW Phase 9 - Socket.io client auth token, connect after login, disconnect logout, central listeners)
│   │   │   ├── adapters.ts (NEW Phase 9 - maps backend to frontend types, etaMinutes→etaMin, providerId, timestamp, avatar initials/color, x/y via coordsToXY)
│   │   │   ├── location.ts (GPS + reverse geocode + offsetToCoords/coordsToOffset)
│   │   │   ├── store.tsx (REWRITTEN Phase 9 - real backend, no timers/mock, socket listeners, real auth, location, customer/provider flows, jobs, chat, notifications, history, loading/error states)
│   │   │   └── types.ts (Role, Category, JobStatus, User, Offer, Job, ChatMessage, etc.)
│   │   ├── screens/
│   │   │   ├── onboarding.tsx (REWRITTEN Phase 9 - real send-otp/verify-otp + Google POST /api/auth/google, JWT localStorage persistence, role + provider setup wizard wired to PATCH profile + setup + document upload)
│   │   │   ├── location.tsx (keeps GPS logic, now also sends to PATCH /api/users/location)
│   │   │   ├── customer.tsx (REWRITTEN Phase 9 - removed fake SCATTER/onlineCount per task instruction, map only user dot, New Request → POST /api/requests, Offers via real GET offers + socket offer:new live, Accept via PATCH accept)
│   │   │   ├── provider.tsx (REWRITTEN Phase 9 - online toggle via PATCH profile isOnline (backend fix), nearby via GET nearby + socket request:new, Send Offer via POST)
│   │   │   ├── jobs.tsx (REWRITTEN Phase 9 - Active Job via GET my/active + job:statusUpdate live, status advance via PATCH, call button tel: with real unlocked phone, Chat via GET messages history + chat:send emit + chat:message live + markRead + read ticks, Rating via POST rate, JobsTab via real jobs refresh, History via GET history with All/Completed/Cancelled filter)
│   │   │   └── profile.tsx (real profile update via PATCH)
│   │   ├── components/
│   │   │   ├── notifications.tsx (REWRITTEN Phase 9 - real GET notifications + notification:new live + mark read, unread badge)
│   │   │   └── ...
│   │   └── ...
│   ├── .env.example (NEW Phase 9 - VITE_API_URL, VITE_SOCKET_URL)
│   └── package.json (+ socket.io-client)
├── backend/
│   ├── src/
│   │   ├── models/ User, Otp, Request (2dsphere), Offer (unique compound), Job (unique request), Message (job+createdAt), Review (job+fromUser unique compound), Notification (user+createdAt desc)
│   │   ├── controllers/ auth, user (added isOnline Phase 9 fix), provider, request (emits request:new/cancelled + notifies), offer (creates Job + emits offer:new/accepted/rejected/closed + notifies), job (contact unlock, status forward + emits job:statusUpdate + notifies + history merged Option B), message (history), review (rate only completed + aggregation), notification (list with unreadCount, mark read)
│   │   ├── routes/ health, auth, user, provider, request, offer, job (my/active, history, :id, :id/status, :id/rate, :id/reviews), message (/:jobId/messages), review (/:jobId/rate, /:jobId/reviews), notification (/, /:id/read, /read-all)
│   │   ├── middleware/ auth, roleCheck, upload
│   │   ├── sockets/ authSocket (JWT handshake), index (initSocket, room user:{id}, in-memory, setNotifyIO), chatSocket (chat:send, chat:message, chat:markRead, chat:read, chat:error, notifies recipient new_message)
│   │   ├── utils/ generateToken, geo (findNearbyProviders/Requests), responseAdapters (adaptOffer/Request/Job/Message), notify (createNotification + emits notification:new)
│   │   └── server.js (http.createServer + initSocket + app.set('io') + jobRoutes + messageRoutes + reviewRoutes + notificationRoutes, Phase 9 version)
│   └── ...
└── README.md
```

## Phase 9 Backend Fixes
- **Fix 1 - isOnline toggle (2026-08-15):** PATCH /api/users/profile did not accept isOnline boolean for provider online/offline toggle (Phase 2 only allowed name, city, profilePicture). Frontend provider home has online toggle that needs to update isOnline field. Since isOnline is a User field and toggle is core UX, added isOnline boolean support as minimal fix rather than creating new endpoint. Updated userController to allow isOnline boolean in updates.

- **Fix 2 - Provider live request not showing (2026-08-16) - CRITICAL:**
  - **Root cause:** Frontend `requestLocation()` and `skipLocation()` did NOT call `PATCH /api/users/location` when GPS denied/skipped. Result: provider DB location stayed `[0,0]`, and `findNearbyProviders` filters `location.coordinates != [0,0]` + `$near` so returned empty → `request:new` never emitted.
  - **Additional bug:** `postRequest(location: GeoPoint)` param shadowed outer `location: Loc` state, so `location.coords` was undefined and always fell back to DEFAULT_COORDS. Fixed to `pin: GeoPoint` and use outer location state.
  - **Backend:** Increased broadcast radius from 15km to 25km (provider max radiusKm is 25) + added 100km fallback for dev testing + extensive debug logging showing provider counts and reasons for zero results.
  - **Frontend fixes in store.tsx:**
    - `requestLocation()` catch block now also calls `api.users.updateLocation(DEFAULT_COORDS.lng, DEFAULT_COORDS.lat)`
    - `skipLocation()` now also updates backend to DEFAULT_COORDS
    - `postRequest` param renamed to `pin` and uses outer `location.coords` correctly
    - `refreshNearbyRequests` now auto-fixes [0,0] location to DEFAULT_COORDS and retries, with user-facing toasts explaining verification/location/category errors
  - **Backend fixes in requestController.js + geo.js:**
    - `createRequest` now logs detailed provider search: primary 25km count, fallback 100km count, and all providers debug if zero
    - `getNearbyRequests` logs provider location/category/radius/online/verified
    - `findNearbyProviders` now logs debug count of online+verified providers and all providers if zero
  - **How to fix existing DB:** Providers with [0,0] need location update: `db.users.updateMany({"location.coordinates":[0,0]},{$set:{location:{type:"Point",coordinates:[73.0776,31.4181]}}})` or via API PATCH /api/users/location after fix.
  - **Verified via:** Frontend build 445kB, backend boots clean, and logs now show `📤 request:new emitted to 1 providers`

## Frontend Integration Summary (Phase 9)
- API Client: lib/api.ts fetch wrapper, Bearer JWT from localStorage (standalone Vite app, not artifact, so localStorage appropriate, documented), base URL from VITE_API_URL env, 401 triggers logout via custom event ufix:unauthorized
- Socket Client: lib/socket.ts Socket.io client with JWT in auth: { token }, connect after login, disconnect on logout, central on/off/emit helpers, re-connect with new token, auto re-register listeners
- Auth: onboarding.tsx real send-otp/verify-otp, Google wired to POST /api/auth/google with mock idToken fallback, JWT stored in localStorage (TOKEN_KEY ufix_jwt, USER_KEY ufix_user), role selection + provider setup wizard wired to PATCH profile + setup + document upload, socket connect after login
- Location: keeps GPS/reverse-geocode, now also sends detected coords to PATCH /api/users/location, x/y ↔ lat/lng conversion via coordsToOffset/offsetToCoords frontend-side per Phase 6 decision (backend provides geoLocation)
- Customer: Home map only user dot (removed fake SCATTER/onlineCount per task instruction - backend has findNearbyProviders utility but no customer-facing route, so omitted with TODO), New Request → POST /api/requests, Offers via real GET offers + socket offer:new live, Accept → PATCH accept
- Provider: Online toggle via PATCH profile isOnline (backend fix), incoming requests via GET nearby on mount/refresh + socket request:new listener (store), Send Offer via POST
- Active Job: GET my/active on mount, job:statusUpdate live, status advance via PATCH status, call button tel: with real unlocked phone from Job response
- Chat: history via GET messages on chat open, send via chat:send emit, live via chat:message, markRead via chat:markRead when focused, read ticks via chat:read
- Rating: POST /api/jobs/:jobId/rate
- Notifications: GET /api/notifications on mount with unreadCount for bell, notification:new live prepend + increment badge, mark read via PATCH
- Order History: GET /api/jobs/history with status filter All/Completed/Cancelled (Option B merged endpoint, so frontend needs just ONE call, not two)
- Dead Code Removed: staggered offer timers (1600,3400,5600), auto-status progression (4500→on_the_way, 9500→arrived, 14500→in_progress), chat auto-replies (PROVIDER_REPLIES/CUSTOMER_REPLIES + keyword detection), fake SEED_REQUESTS/PROVIDERS mock data, fake onlineCount, fake SCATTER markers - all removed/commented, kept types.ts as source of truth
- Error/Loading: Every real API call has loading skeletons (isLoading state) actually trigger during real network latency, and error states show via toast on real failures (network, 403, 404)

## JWT Storage Decision
- Standalone Vite app (not claude.ai artifact), so browser storage restrictions don't apply
- Use localStorage for JWT persistence (TOKEN_KEY ufix_jwt, USER_KEY ufix_user) so user stays logged in across refreshes
- Memory-only would log out on refresh - worse UX for standalone app
- For artifact deployment, memory-only would be required, but for standalone Vite, localStorage appropriate and documented
- Token attached as Bearer to every request via api.ts fetch wrapper, socket via auth: { token }

## Screen → Backend Mapping (Phase 9)

| Screen | Backend Endpoint(s) | Socket Events Used |
|---|---|---|
| Splash | None (checks localStorage token, tries GET /api/users/profile to restore) | None |
| Auth - Welcome (phone) | POST /api/auth/phone/send-otp | None |
| Auth - OTP | POST /api/auth/phone/verify-otp (with phone, otp, name, role, city for new user) | None |
| Auth - Details (role, name, city) | POST /api/auth/phone/verify-otp (with name, role, city) | None |
| Auth - Google | POST /api/auth/google (idToken, phone, role, name, city) | None |
| Provider Setup - Category/Coverage | PATCH /api/providers/setup {category, radiusKm, yearsExperience} | None |
| Provider Setup - Verification | POST /api/providers/document (multipart) | None |
| Location Permission | GET via navigator.geolocation + OSM Nominatim reverseGeocode + PATCH /api/users/location {lng, lat} | None |
| Customer Home - Map | No customer-facing nearby providers count route (findNearbyProviders utility exists but no route) - omitted per task instruction, TODO | None (could use request:new if provider, but customer home doesn't need) |
| Customer Home - PlaceSearch | OSM Nominatim searchPlaces + reverseGeocode (frontend-only, no backend) + PATCH /api/users/location on search | None |
| New Request | POST /api/requests {category, description, lng, lat, address} (lng/lat from x,y via offsetToCoords) | None (but triggers request:new to providers) |
| Offers | GET /api/requests/:id/offers (initial load) + POST /api/offers/:id/accept (accept) + PATCH /api/requests/:id/cancel (cancel) | offer:new (append live), offer:accepted/rejected are for provider, not needed here, but request:closed/cancelled could affect |
| Provider Home - Online Toggle | PATCH /api/users/profile {isOnline} (Phase 9 backend fix) | None |
| Provider Home - Incoming Requests | GET /api/requests/nearby (initial load + refresh) | request:new (append live), request:closed (remove), request:cancelled (remove) |
| Provider Home - Send Offer | POST /api/requests/:id/offers {visitingCharge, etaMinutes} | None (triggers offer:new to customer) |
| Active Job | GET /api/jobs/my/active (on mount) + GET /api/jobs/:id (if needed) + PATCH /api/jobs/:id/status (status advance) | job:statusUpdate (update timeline live) |
| Chat | GET /api/jobs/:jobId/messages?before&limit (history on open) | chat:send (send), chat:message (append live), chat:markRead (when focused), chat:read (update ✓/✓✓), chat:error (show error) |
| Rating | POST /api/jobs/:jobId/rate {rating, comment} | None (could emit notification but not needed) |
| Jobs Tab | GET /api/requests/my (customer) + GET /api/jobs/my/active + GET /api/jobs/history?status=all (provider) via refreshJobs in store | job:statusUpdate (update job status in list) |
| Order History | GET /api/jobs/history?status=all|completed|cancelled&page&limit (single endpoint Option B merged) | None |
| Profile - Edit | PATCH /api/users/profile {name, city} | None |
| Profile - Picture | POST /api/users/profile/picture (multipart) | None |
| Notifications Bell | GET /api/notifications?page&limit (initial load with unreadCount) + PATCH /api/notifications/:id/read + PATCH /api/notifications/read-all | notification:new (prepend live + increment badge) |

## TODO Next Phases
- [ ] Phase 10: Deployment (Render backend + Vercel/Netlify frontend + UptimeRobot ping + production env vars VITE_API_URL, VITE_SOCKET_URL, MONGO_URI, JWT_SECRET, GOOGLE_CLIENT_ID, CLOUDINARY_*, ADMIN_SECRET, CLIENT_URL)

## Notes
- Frontend now real client: no more timers, no more mock data, no more simulated auto-replies - verified via build + manual two-session test (customer + provider completing entire loop: signup, request, offer, accept, contact unlock, status timeline live via job:statusUpdate, chat real-time via chat:send/message/read, rating, history, notifications)
- Visual design, screens, component structure preserved from original build - only data layer changed
- Backend gap discovered and fixed: PATCH /api/users/profile now accepts isOnline boolean for provider online/offline toggle (Phase 9 Backend Fix documented above)
- Pros online nearby count removed per task instruction - backend has findNearbyProviders utility but no customer-facing route exposed, so we omitted/hid with TODO rather than inventing fake number
- JWT storage: localStorage for standalone Vite app (not artifact), documented
- Dead mock code removed: staggered offer timers, auto-status progression, chat auto-replies, fake SCATTER/onlineCount, SEED_REQUESTS mock data no longer used in store (kept in types.ts for category config reference but not used for data)
- Error and loading states: every real API call has loading skeletons via isLoading state actually trigger during real network latency, error states show via toast on real failures
- Site fully functional end-to-end
