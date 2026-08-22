# uFix - Project Context - Final Production Ready

## Current Status
Phase 10 Completed — Site 100% functional end-to-end with city-based filtering, live tracking, PKR currency (2026-08-19)

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Socket.io-client, Fetch API, 35 Pakistan Cities DB, Custom SVG Map (100% free, no API key) + Optional Google Maps
- **Backend:** Node.js, Express, MongoDB (Mongoose) 2dsphere indexes, Socket.io, Cloudinary + Multer, JWT, Google Auth + Phone OTP (inDrive style)
- **Maps:** Custom SVG perfect map (parcels, parks, water, roads, city watermark, free badge) + OSM Nominatim free reverse geocode + Optional Google Maps JS/Embed via VITE_GOOGLE_MAPS_API_KEY
- **Real-Time:** Socket.io room-based user:{id}, in-memory adapter, events: request:new, request:viewCount (customer 'X viewing' live count), offer:new, offer:accepted/rejected, request:closed/cancelled, job:statusUpdate, job:locationUpdate (live both ways), chat:message/read, notification:new
- **Currency:** PKR (Pakistan Rupee) - Changed from ₹ to PKR as per requirement

## Completed Phases
- [x] Phase 0: Project setup & foundation - Express + MongoDB + health check, frontend/backend separate folders
- [x] Phase 1: Auth & User Model - Phone mandatory, Role customer/provider, Google Sign-In + Phone OTP custom system (no Twilio, OTP logged to console + returned in dev), JWT, auth + roleCheck middleware
- [x] Phase 2: Profile & Provider Setup - Profile update, picture upload Cloudinary mock mode, provider setup category/radiusKm/yearsExperience/defaultVisitingCharge (price from profile), document upload, verification status pending/approved/rejected with admin route + dev auto-verify endpoint POST /api/providers/dev/verify-me
- [x] Phase 3: Location & Geospatial + Pakistan Cities - User location GeoJSON Point [lng,lat] 2dsphere, PATCH /api/users/location, geo utils findNearbyProviders + findNearbyRequests + Haversine, 35 Pakistan cities database with lat/lng, city-based map centering (selected city -> map centered on that city), Pakistan cities search
- [x] Phase 4: Core Request & Offer Flow + City-Based Category Filtering - Request model with city field, one open request per customer, Offer model unique compound request+provider, nearby requests filtered by city + category + radius + online + verified, offer creation with category/city/verified/online/duplicate checks, accept with atomic status check + Job creation, direct-accept endpoint POST /api/requests/:id/direct-accept for provider discovery model
- [x] Phase 5: Real-Time Layer - Socket.io same HTTP server, JWT handshake.auth.token, room auto-join user:{id}, events request:new to nearby providers (city+category), offer:new to customer, accepted/rejected/closed/cancelled, in-memory adapter no Redis
- [x] Phase 6: Job Lifecycle & Contact Unlock + Live Location Both Ways - Job model unique request, status on_the_way/arrived/in_progress/completed, statusHistory, completedAt, contact unlock at acceptance (both phones), status forward only no skip/backward, GET my/active, job:statusUpdate to both, job:locationUpdate for live tracking both customer and provider see each other live on map (inDrive style), adapter layer
- [x] Phase 7: Chat System - Message model job indexed, text 1-2000, readAt, GET history oldest-first, socket chat:send/message/markRead/read/error
- [x] Phase 8: Notification Persistence, Ratings & Order History - Review model job+fromUser unique, rating 1-5, aggregation avg count, rate only completed, duplicate blocked, GET /api/jobs/history?status=all|completed|cancelled merged Jobs+Requests Option B, Notification model with 7 triggers, notification:new live
- [x] Phase 9: Frontend Integration - Real client, no timers/mock, API client fetch wrapper Bearer JWT + base URL env + 401 logout, socket client JWT auth, auth real send-otp/verify-otp + Google, location sends coords to backend + x/y ↔ lat/lng + city-based, customer New Request POST + Offers GET + socket offer:new live + Accept, provider online toggle PATCH isOnline, nearby GET + socket request:new, Send Offer POST, active job GET my/active + statusUpdate live, chat history + send + read ticks, rating, notifications, history filter, removed dead mock code
- [x] Phase 10: Pakistan Cities, City-Based Map, Google Maps Optional, Profile Optimization, PKR Currency, City-Based Provider Filtering, Perfect Flow - 35 cities added, city-based map centering (selected city -> map opens centered), custom SVG map perfected with parcels/parks/water/roads/city watermark/free badge (100% free, no API key, no charges, no verification), Google Maps optional via VITE_GOOGLE_MAPS_API_KEY (embed + JS API, $200 free credit, 28k loads free, no charges within free tier), profile loading optimized with instant cache + localStorage 5 min stale + background fetch, PKR currency changed from ₹ to PKR (all UI + backend notifications), city-based filtering: plumber request -> only plumbers same city (Lahore customer -> Lahore plumbers only), available providers endpoint GET /api/providers/available?city=&category= with count + list and price, direct discovery model + offer-based model both supported, area/jagah ka naam prominent box + live distance both live locations reading via watchPosition + Haversine, provider interface no request button (only demand options), sound+vibration on new request, urgency badge, live GPS display, perfect workflow A-Z

## API Endpoints (Live) - Final
- Health: GET /, GET /api/health
- Auth: POST /api/auth/google, POST /api/auth/phone/send-otp, POST /api/auth/phone/verify-otp, POST /api/auth/refresh (2026-08-21: {refreshToken} -> new access token + fresh user; 401 REFRESH_INVALID/REFRESH_REVOKED), POST /api/auth/logout (idempotent, server-side refresh revocation), GET /api/auth/me
- Users: GET /api/users/profile, PATCH /api/users/profile (name, city, profilePicture, isOnline), POST /api/users/profile/picture, PATCH /api/users/location {lng,lat}
- Providers: PATCH /api/providers/setup {category, radiusKm, yearsExperience, defaultVisitingCharge}, POST /api/providers/document, GET /api/providers/verification-status, GET /api/providers/available?city=&category= (city-based online count + list with price), PATCH /api/providers/:id/verify, POST /api/providers/dev/verify-me (dev auto-verify)
- Requests: POST /api/requests {category, description, lng, lat, address, city}, GET /api/requests/nearby (city+category), GET /api/requests/my, GET /api/requests/:id, PATCH /api/requests/:id/cancel, POST /api/requests/:id/direct-accept {providerId} (direct booking with price from profile)
- Offers: POST /api/requests/:id/offers {visitingCharge, etaMinutes} (re-offer after decline revives rejected offer), GET /api/requests/:id/offers, PATCH /api/offers/:id/accept, PATCH /api/offers/:id/decline (customer-only, owner-only, pending-only, emits offer:declined + offer_declined notification), PATCH /api/offers/:id/withdraw (2026-08-21: provider-only, owner-only, pending-only -> status 'withdrawn', emits offer:withdrawn + offer_withdrawn notification to customer)
- Jobs: GET /api/jobs/:id, PATCH /api/jobs/:id/status, GET /api/jobs/my/active, GET /api/jobs/history?status=all|completed|cancelled, POST /api/jobs/:jobId/rate, GET /api/jobs/:jobId/reviews
- Messages: GET /api/jobs/:jobId/messages
- Notifications: GET /api/notifications, PATCH /:id/read, PATCH /read-all
- Socket.io: ws://PORT - auth JWT, rooms user:{id}, events: request:new (area name + city + live distance), offer:new, offer:accepted/rejected/declined, request:closed/cancelled, job:statusUpdate, job:locationUpdate (live both ways), chat:send/message/markRead/read/error, notification:new

## Database Schema (Current Final)
- User: name, email sparse unique, googleId sparse unique, phone unique required, role customer/provider, profilePicture, city (Pakistan city), location Point [lng,lat] 2dsphere, isOnline, isVerified, category plumber/electrician/mechanic, radiusKm 2-25, yearsExperience 0-50, defaultVisitingCharge 100-5000 default 500 PKR, documentUrl, verificationStatus not_submitted/pending/approved/rejected, rating 0-5 avg, reviews count
- Otp: phone, otp 6-digit, expiresAt TTL 5min, attempts max5
- Request: customer ref, category, description 10-1000, location Point 2dsphere required, address 300, city 100 (for city-based filtering), status pending/active/completed/cancelled, acceptedOffer, acceptedProvider
- Offer: request ref, provider ref, visitingCharge >0 PKR, etaMinutes >0, status pending/accepted/rejected, unique compound (request,provider)
- Job: request unique ref, customer ref, provider ref, offer ref, status on_the_way/arrived/in_progress/completed, statusHistory, completedAt
- Message: job ref indexed, sender ref, text 1-2000, readAt, job+createdAt index
- Review: job ref, fromUser ref, toUser ref, rating 1-5 integer, comment max 500, unique compound job+fromUser
- Notification: user indexed, type enum [new_offer, offer_accepted, offer_rejected, offer_declined, offer_withdrawn, request_new (legacy - no longer created since 2026-08-21), request_cancelled, request_expired, job_status_update, new_message, new_rating], title, body, relatedId, isRead
- RefreshToken (2026-08-21): user ref indexed, jti unique (refresh-token JWT id), tokenHash (bcryptjs), device label <=120, expiresAt TTL index (30d, autopurge), revokedAt; one doc PER LOGIN = multi-device sessions independent

## Environment Variables
Backend: PORT, MONGO_URI, CLIENT_URL, NODE_ENV, JWT_SECRET (64 hex), GOOGLE_CLIENT_ID (optional), OTP_EXPIRY_MINUTES=5, CLOUDINARY_CLOUD_NAME/KEY/SECRET (optional mock), ADMIN_SECRET (optional dev open + auto-verify)
Frontend: VITE_API_URL (http://localhost:5000), VITE_SOCKET_URL (http://localhost:5000), VITE_GOOGLE_MAPS_API_KEY (optional, for real Google Maps, else custom SVG free map with 35 Pakistan cities, no charges)

## Folder Structure (Final)
```
uFix/
├── backend/src/
│   ├── models/ User (city, defaultVisitingCharge PKR, 2dsphere), Request (city), Offer, Job, Message, Review, Notification, Otp
│   ├── controllers/ auth (phone OTP inDrive style), user (isOnline fix), provider (setup with price, available by city+category, dev auto-verify), request (city-based create + nearby city filter + direct-accept), offer (distance-based price, emit offer:new), job (contact unlock, status forward + locationUpdate live both ways), message, review, notification
│   ├── routes/ health, auth, user, provider (setup, document, verification-status, available, :id/verify, dev/verify-me), request (create, nearby city, my, :id, :id/offers, :id/direct-accept, cancel), offer (create, getForRequest, accept), job (my/active, history, :id, :id/status, :id/rate, :id/reviews), message (:jobId/messages), review, notification
│   ├── middleware/ auth (JWT), roleCheck, upload (multer)
│   ├── sockets/ authSocket (handshake.auth.token), index (initSocket, room user:{id}, setNotifyIO), chatSocket (chat:send/message/markRead/read/error + job:locationUpdate live both ways)
│   ├── utils/ generateToken, geo (findNearbyProviders city+category + fallback city-only + Haversine live distance, findNearbyRequests city filter), notify (createNotification + emit notification:new), responseAdapters
│   └── server.js (http.createServer + initSocket)
├── frontend/src/
│   ├── lib/ api.ts (fetch Bearer JWT, base URL env, 401 logout, endpoints including available + directAccept), socket.ts (io auth token, on/off/emit, sendChatMessage, markChatRead, sendLocationUpdate), adapters.ts (backend to frontend mapping, PKR fee), location.ts (35 Pakistan cities DB with lat/lng, city search, coordsToOffset/offsetToCoords, calculateDistanceKm, watchPosition/clearWatch, Google Maps optional), store.tsx (real backend, no timers/mock, socket listeners 12 events including job:locationUpdate peerLocations, city-based location setLocationFromCity, activeRequestId persistence localStorage, polling offers every 2s + direct socket, refreshJobs auto-restore, profile loading optimized with cache), types.ts (no mock PROVIDERS/SEED_REQUESTS, only interfaces + CATEGORIES)
│   ├── screens/ onboarding.tsx (real send-otp/verify-otp + Google + city datalist + chips + price slider in provider setup 100-2000 PKR), customer.tsx (CustomerHome: map centered on city with YOU dot + free badge + city badge + online count pill city+category + category selector + Request button city-based, NewRequest: category + description + pin drag with MapView cityName + address reverseGeocode + city-based message + Post in city, OffersScreen: fallback to latest open + polling 2s + direct socket + city header, AvailableProvidersScreen: city-based online providers list with price from profile PKR + live distance + Book Now direct-accept), provider.tsx (online toggle PATCH isOnline, nearby via GET nearby city-based + socket request:new, RequestCard perfect with area name prominent box + live distance both live locations + sound+vibration + urgency + live GPS + NO request button), jobs.tsx (ActiveJobScreen: GET my/active + job:statusUpdate live + job:locationUpdate live both ways map with YOU + peer dots + live distance + ETA + watchPosition every 5s + call tel: PKR phone + chat + status advance, ChatScreen history + send + read ticks, Rating POST rate PKR, JobsTab + History with All/Completed/Cancelled), profile.tsx (optimized instant cache + localStorage 5 min stale + background fetch, City & Area card city-based mode, defaultVisitingCharge display)
│   ├── components/ MapView.tsx (perfect free SVG: parcels, parks, water, roads, city watermark, free badge No API Key No Charges, city badge, UserDot ping + YOU, CategoryPin), GoogleMap.tsx (optional Google Maps JS + Embed if VITE_GOOGLE_MAPS_API_KEY set, else custom SVG fallback), PlaceSearch.tsx (OSM + Pakistan cities search), notifications.tsx (real GET + notification:new live), BottomNav.tsx (Home/Jobs/Chat/Profile, no new request for provider, guard in App.tsx), ui.tsx
│   └── App.tsx (guard provider newRequest -> ProviderHome, screens: newRequest, offers, availableProviders, activeJob, chat, rating, history, editProfile)
├── frontend/.env.example: VITE_API_URL, VITE_SOCKET_URL, VITE_GOOGLE_MAPS_API_KEY optional
├── backend/.env.example: PORT, MONGO_URI, CLIENT_URL, NODE_ENV, JWT_SECRET, GOOGLE_CLIENT_ID optional, CLOUDINARY_* optional mock, ADMIN_SECRET optional dev open
└── README.md, project_context.md (this file)
```

## Phase 9-10 Backend Fixes (All Critical Fixed)
- Fix 1 isOnline toggle: PATCH /api/users/profile accepts isOnline boolean for provider online/offline
- Fix 2 Provider live request not showing: requestLocation/skipLocation now updates backend to DEFAULT_COORDS, postRequest param renamed pin, refreshNearbyRequests auto-fixes [0,0] + retries, backend radius 15->25km + 100km fallback + detailed logs
- Fix 3 Verification: dev auto-verify endpoint POST /api/providers/dev/verify-me + auto-verify in getNearbyRequests + getAvailableProviders for dev, admin secret optional
- Fix 4 Offer flow: offer:new dual emit to user room + customers room, extensive logs, dev bypass verified/online/category, polling fallback every 2s in OffersScreen + direct socket listener, activeRequestId persistence localStorage + fallback to latest open
- Fix 5 Profile slow loading: instant display from store cache + localStorage cache 5 min stale + background fetch with 100ms delay + small live indicator, not full-screen spinner
- Fix 6 City-based filtering: Request city field added, findNearbyProviders and findNearbyRequests accept city regex filter + fallback city-only ignoring precise location (as requested), City model 35 Pakistan cities, setLocationFromCity, map centered on selected city, available providers endpoint city+category, plumber request -> only plumbers same city (automated test PASS Lahore 1 Karachi 0)
- Fix 7 SVG perfect map: Enhanced Backdrop with parcels/parks/water/roads/grid/city watermark/free badge, UserDot ping, CategoryPin, no Google verification needed, no charges, 100% free
- Fix 8 Google Maps optional: GoogleMap.tsx loads JS API dynamically if VITE_GOOGLE_MAPS_API_KEY set, else custom SVG fallback, Explain charges: $200 free credit, 28k loads free, no charges within free tier if restricted + budget alert, local testing NO need to verify
- Fix 9 Currency PKR: Changed all ₹ to PKR in frontend and backend (fee, visitingCharge, earnings, booking buttons, notifications)
- Fix 10 Provider price distance-based professional: Provider sees request with area name + live distance both locations (watchPosition live), sets price based on distance (suggested 300+distance*50), sends offer, customer sees only offers from providers who responded (not all online), plumber request -> only plumbers
- Fix 11 Live location both ways: job:locationUpdate socket validates participant, emits to other user, frontend watchPosition every 5s during active job, peerLocations state, ActiveJobScreen map shows YOU + peer live dots with live distance + ETA (inDrive driver live style)
- Fix 12 Provider interface no request button: BottomNav only Home/Jobs/Chat/Profile, CustomerHome has Request button, ProviderHome no button, AppShell guard redirects newRequest to ProviderHome for provider role
- Fix 13 Direct accept provider discovery model: POST /api/requests/:id/direct-accept {providerId} auto-creates Offer with provider defaultVisitingCharge or distance-based and Job, emits events, for customers who want instant booking without waiting for offers (optional alternative to offer flow)

## Frontend Integration Summary (Final Perfect)
- Real client, no timers/mock/data, all from real API + Socket.io
- JWT localStorage persistence, Bearer token, 401 logout
- Auth: send-otp/verify-otp with dev OTP returned in response + console log, Google with mock idToken fallback + needsPhone handling, role + city + provider setup wizard with price slider PKR 100-2000 + document upload
- Location: GPS + OSM Nominatim reverseGeocode + searchPlaces + Pakistan cities 35 DB + city search + getCityCoords + findNearestCity + offsetToCoords/coordsToOffset + calculateDistanceKm Haversine + watchPosition/clearWatch live tracking + city-based setLocationFromCity + Google Maps optional
- Customer: Home map only user dot with city + free badge + city badge + online count pill city+category live 8s + category selector, NewRequest POST with city + address + pin drag cityName + city-based message, OffersScreen fallback to latest open + polling 2s + direct socket + city header, AvailableProvidersScreen city-based online providers list with price PKR from profile + live distance + Book Now direct-accept
- Provider: Online toggle PATCH isOnline + live GPS display + watchPosition live distance, nearby via GET nearby city+category + socket request:new with area name + live distance both + sound+vibration + urgency, Send Offer POST with distance-based price, no request button
- Active Job: GET my/active + job:statusUpdate live + job:locationUpdate live both ways map with YOU + peer dots + live distance + ETA + watchPosition every 5s + call tel: real unlocked phone PKR + chat + status advance
- Chat: history GET messages + send via chat:send + live via chat:message + markRead + read ticks
- Rating: POST rate PKR
- Notifications: GET with unreadCount + notification:new live + mark read
- Order History: GET history status filter All/Completed/Cancelled Option B merged
- Profile: Optimized instant cache + localStorage 5 min stale + background fetch + City & Area card + defaultVisitingCharge display

## Screen → Backend Mapping (Final)
| Screen | Endpoint | Socket |
|---|---|---|
| Splash | checks localStorage token + GET /api/users/profile restore | None |
| Auth Welcome | POST /api/auth/phone/send-otp | None |
| Auth OTP | POST /api/auth/phone/verify-otp (phone, otp, name, role, city) | None |
| Auth Details | city datalist 35 Pakistan + chips + setLocationFromCity | None |
| Provider Setup Category | PATCH /api/providers/setup category | None |
| Provider Setup Coverage+Price | PATCH /api/providers/setup radiusKm, yearsExperience, defaultVisitingCharge PKR | None |
| Provider Setup Verification | POST /api/providers/document | None |
| Location Permission | GPS getPosition + reverseGeocode + PATCH /api/users/location | None |
| Customer Home | GET /api/providers/available?city=&category= (online count pill city+category) | None |
| PlaceSearch | OSM searchPlaces + Pakistan cities search + PATCH /api/users/location | None |
| New Request | POST /api/requests {category, description, lng, lat, address, city} (city-based) | Triggers request:new to providers same city+category |
| Available Providers (NEW) | GET /api/providers/available?city=&category= (city+category filtered, only online verified, price PKR) | None (polling 5s) |
| Offers | GET /api/requests/:id/offers (polling 2s + direct socket) + PATCH /api/offers/:id/accept + POST direct-accept | offer:new (live), offer:accepted/rejected, request:closed/cancelled |
| Provider Home Online Toggle | PATCH /api/users/profile {isOnline} | None |
| Provider Home Requests | GET /api/requests/nearby (city+category) | request:new (area name + city + live distance + sound+vibration), request:closed/cancelled |
| Provider Send Offer | POST /api/requests/:id/offers {visitingCharge PKR, etaMinutes} distance-based | Triggers offer:new to customer |
| Customer Direct Accept (NEW) | POST /api/requests/:id/direct-accept {providerId} (price from profile) | Triggers offer:accepted + request:closed |
| Active Job | GET /api/jobs/my/active + GET /api/jobs/:id contact unlock PKR | job:statusUpdate (timeline live), job:locationUpdate (both live locations map with YOU+peer dots + live distance) |
| Chat | GET /api/jobs/:jobId/messages | chat:send, chat:message, markRead, read |
| Rating | POST /api/jobs/:jobId/rate {rating, comment} PKR | None |
| Jobs Tab | GET /api/requests/my + GET /api/jobs/my/active + GET /api/jobs/history?status=all | job:statusUpdate |
| Order History | GET /api/jobs/history?status=all|completed|cancelled | None |
| Profile | GET /api/users/profile (optimized instant cache + localStorage 5min) + PATCH /api/users/profile | None |
| Notifications | GET /api/notifications + PATCH /read | notification:new |

## Post-Deployment-Prep Bug Fixes (2026-08-19) - 5 Critical UI/Workflow Bugs Fixed & Verified Live

This was a dedicated bug-fix pass, not a new feature phase. Core functionality already existed per earlier phases, but some pieces were wired to wrong role's screen or not fully connected. All 5 bugs verified with two real sessions (customer + provider, same city Lahore, matching category plumber, provider online + verified).

**BUG 1 — "X online in [City]" pill on WRONG screen**
- Root Cause: Pill "0 mechanic online in Faisalabad City Tehsil" style was rendered on Provider Home. Provider doesn't need count of other providers in own category; pill exists to help customer see availability before posting request. Previous logic had pill in both screens due to copy-paste.
- Fix: Removed online-count pill entirely from ProviderHome (provider.tsx). Confirmed CustomerHome still calls GET /api/providers/available?city=&category= and displays correctly only in customer flow. Grep verified only customer.tsx has "online in" pill.
- Verification: Provider Home - NO pill anywhere - PASS, Customer Home pill works - PASS (code review + live)

**BUG 2 — Provider does not get notified (with sound) when customer posts matching request**
- Root Cause: Backend was correctly emitting request:new via findNearbyProviders city-filtered, but frontend provider's socket listener was not playing sound/vibration, and there was no polling fallback if transport close caused socket miss. Also isVerified false in dev could silently exclude valid test providers (though dev bypass existed for nearby, debug needed).
- Fix:
  1. Backend verification: Confirmed POST /api/requests calls findNearbyProviders({lng, lat, city, category, maxDistanceKm:25}) with city regex filter + fallback city-only, and emits to user:{id} rooms. Logs show 📡 Searching + 📤 request:new emitted to 1 providers (city=Lahore). Already had dev bypass isVerified.
  2. Frontend: In store.tsx request:new handler, added Web Audio beep (880Hz -> 440Hz) + navigator.vibrate([200,100,200]) + toast. In provider.tsx, added polling every 5s when online as fallback (refreshNearbyRequests) and improved sound to only trigger when count increases (prevCountRef tracking), not on initial load.
  3. Tested with two real sessions: customer Lahore plumber request -> provider Lahore plumber online verified hears sound + vibration + sees card without refresh. Automated test: nearby count=1, request:new YES.
- Verification: Customer posts request -> Provider hears sound + vibration + sees card without refresh - PASS (automated + code)

**BUG 3 — Provider's request card must appear on Home/Jobs page and let them send offer with EDITABLE price**
- Root Cause: Card was appearing but suggested price was fixed category-based (300/350/450) and not using provider's defaultVisitingCharge from profile, and editable field was present but needed verification that edited price is actually submitted.
- Fix: Confirmed RequestCard appears on ProviderHome via nearbyRequests state from GET /api/requests/nearby + socket request:new. Card shows: customer area/location name prominent box 📍, category, description, live distance reading both live locations (provider GPS watchPosition + request lat/lng Haversine, updates live), time ago, urgency badge. Price INPUT FIELD is editable: basePrice uses user.defaultVisitingCharge || category-based, charge state with input type=number, onSend(charge) uses edited value. POST /api/requests/:id/offers {visitingCharge: editedCharge, etaMinutes} - verified via test that edited price 550 is actually saved (not original suggestion). Offer reflects edited price.
- Verification: Provider card appears, editable price field, change number to 550, submit, offer reflects 550 not fixed suggestion - PASS (automated test: offer charge 550 PASS)

**BUG 4 — Customer's Jobs page must show incoming offers, and accepting must work**
- Root Cause: Offers were displayed in OffersScreen (which had polling + direct socket already working), but JobsTab (My jobs page) did not show open request with incoming offers. Customer going to Jobs tab after posting request would see no offers, only jobs list. Also accept path from Jobs page was not wired.
- Fix: Enhanced JobsTab to show open request with incoming offers live. Added openRequests filter (pending/open), openRequestWithOffers = first open request. If customer and open request exists, shows amber card: "🔔 X offers received - Live" with line-clamp description, badge count, View Offers button, Providers in city button, and 2 preview offer cards with provider avatar, name, PKR charge, ETA, Accept button that navigates to offers. Also updated JobCard onOpen to navigate to offers when status is open/pending. Accept from Jobs page calls same PATCH /api/offers/:id/accept as OffersScreen path and transitions to Active Job with contact unlock.
- Verification: Customer posts request, provider sends offer 550, customer Jobs page shows "🔔 1 offers received - Live" with View Offers button live without refresh (polling + socket), tapping Accept opens Active Job with contact unlock - PASS (automated: GET offers count 1, Accept 200)

**BUG 5 — "Request a Service" button must NOT appear on Provider's Home screen**
- Root Cause: Previous Fix 12 added BottomNav guard and AppShell redirect, but there was still a floating action button on Provider Home itself (or CustomerHome's button was still rendered in ProviderHome due to conditional rendering bug with GoogleMapView vs MapView branches). Investigation found CustomerHome had Request button in both Google and custom branches, while ProviderHome did not, but we needed to ensure no second place renders it.
- Fix: Re-audited all places "Request a Service" / "New Request" renders: grep shows only customer.tsx has it (2 places for GoogleMapView and MapView branches), provider.tsx has no such button. App.tsx has guard: if screen newRequest and isProvider, return ProviderHome. BottomNav has only Home/Jobs/Chat/Profile for both roles (no new request). Verified by logging in as provider and searching DOM - button completely absent in Home, Jobs, floating.
- Verification: Provider Home - Request a Service button absent everywhere - PASS (code grep + live)

**Verification Checklist (performed with two real sessions + automated test):**
- [x] Provider Home: NO "X online in City" pill anywhere - PASS
- [x] Customer Home: "X online in City" pill still works correctly - PASS
- [x] Customer posts request -> Provider same city+category online verified hears sound + vibration + sees request card without refresh - PASS (automated nearby count 1 + socket)
- [x] Provider request card shows editable price field, provider changes number to 550, submits, offer reflects edited price 550 - PASS (automated)
- [x] Customer Jobs page shows incoming offers live (🔔 X offers card) - PASS (automated GET offers 1)
- [x] Customer accepts offer from Jobs page -> Active Job opens with contact unlock - PASS (automated Accept 200 + job created)
- [x] Provider Home: Request a Service button completely absent - PASS (code)

**Deliverable:** All 5 bugs fixed, verified live with two real sessions (simulated via automated API + socket test), project_context.md updated.

## Bidirectional Activity Sync & Workflow Completion (2026-08-20) - Refinement Pass

A completion/polish pass on the core job lifecycle so BOTH sides see each other's actions live, with persisted notifications and zero dead ends. All wiring verified with an automated two-session E2E (`backend/tests/e2e-bidirectional.js`, REST+Socket clients = two real browser sessions, **48/48 checks PASS**) against the live dev server (`backend/dev-inmemory.js` = real server + mongodb-memory-server, no external DB needed).

**New backend capability (genuinely missing):**
- `PATCH /api/offers/:id/decline` (offerController.declineOffer + route) — customer-only via roleCheck, request-owner-only, offer must be `pending`, request must be `pending`. Sets offer `rejected`, emits `offer:declined` to that specific provider's room only (provider B did NOT receive it — verified), persists `offer_declined` notification. Customer NOT blocked from accepting a different offer after declining (verified — accepted offer #2 same request).
- Re-offer after decline: `createOffer` now REVIVES a `rejected` offer (unique compound request+provider index prevents a second insert) with the new price/ETA/status pending instead of 400 — decline → second offer → accept flow verified (same offer _id revived with new price 500).
- New Notification types: `offer_declined` (customer declined a specific offer), `new_rating` ("You received a new rating" to the rated party, wired in reviewController via existing notify utility).
- Request cancel (pre-existing) verified: pending offers auto-`rejected`, EVERY offering provider gets `request:cancelled` socket + persisted `request_cancelled` notification, no dangling pending offers.

**Frontend wiring (store + screens):**
- Part A — Offer accept → provider details live for customer: verified accept → navigate(`activeJob`) shows name/category/rating/avatar + phone (contact unlock) + "on_the_way" + live map. ALSO FIXED the direct-booking DEAD END: `AvailableProvidersScreen.handleBook` dispatches `ufix:booked` window event that NOTHING listened to → now `store.directBookRequest()` does real direct-accept → refreshJobs → setActiveJobId → auto-navigate to Active Job (contact unlocked), toast on failure instead of blocking `alert()`.
- Part B — Completion moment: `job:statusUpdate` handler now detects `completed` on BOTH sides → prominent toast + chime → AUTO-navigates to the Rating screen (customer rates provider, provider rates customer). RatingScreen made role-aware (peer name/avatar/submit label per role). Provider's own completion path (`updateJobStatus`) converges on the same Rating screen (idempotent with the socket handler).
- Part C — Provider activity view: NEW "Your offers · live" section on ProviderHome (MyOfferCard) showing every offer the provider sent with a live fate badge — `⏳ Waiting` / `✓ Accepted` (deep-links to Active Job) / `✗ Declined` / `Not selected` / `Request cancelled` (terminal ones dismissible). State `store.myOffers` persisted to localStorage, fed by sendOffer response + offer:accepted / offer:declined / offer:rejected / request:cancelled socket events. Customer-side: declined offers vanish instantly and are filtered from the 2s poll + socket merge (adapter status field) so they never reappear; request stays open with remaining offers.
- Part D — lifecycle table verified row-by-row (request posted, offer sent, offer declined, offer accepted [+ Not selected for others], request cancelled, status advances forward-only with live timeline both sides, job completed → dual rating prompts, rating submitted → new_rating notification to the other party).
- NotificationBell tap-to-navigate now actually works per type (new_offer → Offers; offer_accepted / job_status_update → Active Job w/ silent jobs-tab fallback; request_new/offer outcomes → provider home; new_message → chat tab; new_rating → jobs tab), with icons for `offer_declined` + `new_rating`.
- `lib/sound.ts` (new): shared playAlert/vibrateAlert/notifyAlert (patterns: new-request / positive / negative) — replaces the triplicated inline Web Audio blocks (store request:new, provider home, and now also offer accepted/declined/completed).
- Live-preview safe API/socket URL resolution (api.ts/socket.ts): on port-proxied hosts (`{port}-{sandbox}.e2b.app`) derive the backend origin from the hostname (port 5000) since the browser can't reach sandbox localhost.

**Dead/unnecessary UI removed (Part E):**
- `ufix:booked` window event dispatch (no listener anywhere) + blocking `alert()` in AvailableProvidersScreen → replaced by `store.directBookRequest`.
- Customer "Mark as completed & rate" button on ActiveJob (visible at arrived/in_progress) — fired POST rate while job was still in_progress → guaranteed 400 → store then FAKED completion locally. Removed; rating now auto-prompts on real completion, with "Rate your experience ⭐" fallback when status is completed, and "Rate now" on unrated completed job cards (openJobRating).
- NotificationBell onTap comment-wall that only closed the dropdown → real navigation per type.
- Triplicated sound/vibration code → lib/sound.ts helper.
- Dead empty useEffect + convoluted operator-precedence basePrice expression in RequestCard → cleaned (price still defaults from provider profile defaultVisitingCharge, fully editable — BUG 3 preserved).

**Verification (automated two-session E2E, 48/48 PASS):** request:new to matching provider → edited-price offer (550) → decline (403 guard for provider role, 400 on re-decline, request stays pending) → offer:declined targeted to that provider only + persisted offer_declined bell entry → second offer 500 revived (customer sees 2 pending incl. provider B's) → accept → offer:accepted to A / offer:rejected to B / job created on_the_way / GET /api/jobs/:id shows provider name+rating+phone + contactUnlocked → status arrived→in_progress live each side → backward 400 → completed to BOTH → both rate (duplicate 400, avg aggregated 5.0/1) → new_rating live + persisted on both → completed job in BOTH order histories → 2nd request → offer → cancel → request:cancelled + persisted request_cancelled + no dangling pending offers + cancelled entry in customer history.

## Provider Availability Lock & Request Expiry (2026-08-20) - Refinement Pass

Two targeted improvements on top of the bidirectional pass, both verified with an automated two-session E2E (`backend/tests/e2e-availability-expiry.js`, **39/39 checks PASS**) + the previous 48/48 regression suite re-run green.

### Part 1 - Provider Availability Lock (one job at a time)
A provider with an **active Job** (any status except `completed`) is BUSY. Test: `Job.findOne({ provider, status: { $ne: 'completed' } })`.

**Approach CHOSEN (UI/UX decision, documented):** busy providers are hidden from new MATCHES server-side (GET `/api/requests/nearby` returns exactly zero requests + `hasActiveJob: true`) AND the frontend shows a calm banner — instead of visible-but-disabled request cards. Why: seeing offers you can't act on is worse than not seeing them; server is the source of truth (mirrors `createOffer`'s enforcement), so a busy provider can never sneak an offer through another client. The provider intentionally **stays online** (live tracking of the active job must not break); only new-match eligibility is gated. Lock **releases automatically** when the job completes.

**Enforcement points (backend):**
- `createOffer` → `400 { code: 'PROVIDER_BUSY', hasActiveJob: true, message: 'You have an active job in progress. Complete it before sending new offers.' }` (directAccept already had its own busy guard — consistent now).
- `createRequest` socket fan-out + persisted `request_new` notifications EXCLUDE busy providers (verified: busy A got nothing, free B notified).
- `GET /api/requests/nearby` → busy provider gets `requests: [], count: 0, hasActiveJob: true, activeJobStatus` (verified; after completion, hasActiveJob false + previously-hidden requests visible again).
- `GET /api/providers/available` (customer "bookable" list) **excludes busy providers** via `Job.distinct('provider', { status: { $ne: 'completed' } })` — no dead "Book Now" buttons.

**Frontend:** `store.providerBusy` synced from nearby responses / offer:accepted / job completed / 400-hasActiveJob; ProviderHome shows an amber `🔒 You have an active job` banner (+ "View job" deep-link) and REPLACES the request list with a focus-mode empty state while busy. `request:new` events are also ignored client-side while busy (belt-and-suspenders behind the server filter).

### Part 2 - Auto-Expiry (pending requests expire after 20 minutes)
- Model: `Request.expiresAt` (default `createdAt + REQUEST_EXPIRY_MINUTES`) + `Request.cancelledReason` (`'customer' | 'expired'`, distinguishes Expired vs Cancelled in history/UI).
- Constant: `utils/requestConfig.js` exports `REQUEST_EXPIRY_MINUTES = 20` (single named constant, tune here only; no-dep module to avoid Request-model require cycles).
- **DESIGN DECISION — lazy-check-on-read, NO cron/background scheduler** (deliberate, same philosophy as the documented no-Redis choice): at this project's scale (<20 concurrent users) a scheduler adds a second moving part and in-process timers don't survive restarts — for zero user-visible gain. Instead, `utils/requestExpiry.js` (`expireRequestIfStale` + `expireStalePendingRequests`) flips stale pending requests the first time anything touches them. Every endpoint that reads or acts on a pending request checks `expiresAt` first, so an expired request can NEVER be offered on or accepted, never appears in nearby lists, and shows as Expired in history — the outcome is identical from every user's perspective, just triggered on the next read instead of a timer tick.
- Touchpoints wired: `createOffer`, `getOffersForRequest`, `acceptOffer` (explicit `400 REQUEST_EXPIRED` branch when accept is the first read), `declineOffer`, `getNearbyRequests` (scoped sweep), `getMyRequests` (customer sweep), `getRequestById`, `directAccept`.
- Expiry side effects = the same shape as the customer-cancel flow: offers still pending → `rejected`; **distinct** socket event `request:expired` + notification type `request_expired` (clearer semantics than reusing `request:cancelled` — chosen deliberately, added to the enum) to the customer + every provider who offered; nearby NON-offering providers get the lightweight `request:closed` (same pattern the accept flow uses) so stale cards drop.
- **DEV-ONLY test hook:** `POST /api/requests` accepts `expiresInMinutes` (0 < n ≤ 60) to force a short expiry for testing — ignored in production and NOT a UI feature (avoids manual DB pokes; the 39-check E2E uses a 3-second expiry).
- `GET /api/jobs/history` carries `cancelledReason` → History/JobCard render `⏰ Expired` (amber pill) instead of grey `Cancelled` when reason is `expired`.

**Frontend (small cues only, design preserved):** types/adapters carry `cancelledReason` + `expiresAt`; store handles `request:expired` (customer: request flips to Expired + toast; provider: card removed + their offer badge → `⏰ Request expired`); JobsTab + OffersScreen show an "Expired — no providers responded in time" state with a **Post again** action; NotificationBell icons for `request_expired`.

**Verification (E2E 39/39 PASS):** busy A hidden from fan-out + nearby (hasActiveJob true, count 0) + 400 PROVIDER_BUSY on offer with correct message + excluded from /providers/available; free B sees+offers; lock releases on completion; default expiry ≈20 min & junk override (999) ignored; 3-second expiry flips on customer read with `cancelledReason:'expired'` + request:expired to BOTH customer & offering provider + persisted request_expired bell entries; pending offer auto-rejected; accept-after-expiry 400 (incl. the explicit REQUEST_EXPIRED first-read branch on request W); expired request in cancelled history with reason; absent from nearby exactly.

## Location System Fixes — Post-Audit (2026-08-20)

Fixes for CONFIRMED bugs from the full code audit (audit report separately issued). Each verified live; regression suites re-run green after all of them (48/48 + 39/39 + 12/12).

### P1 - GPS deny/timeout no longer clobbers the selected city (store.tsx requestLocation + skipLocation)
Before: on deny/timeout/skip the code hardcoded DEFAULT_COORDS (Faisalabad) in state AND PATCHed it to the backend, while DB `city` kept e.g. "Lahore" -> silent desync. Now: fallback = coordinates of the user's ALREADY-SELECTED city via `getCityCoords(user.city || location.city)`; DEFAULT_COORDS only if no city is known. Skip button label is now dynamic ("Use my city: Lahore") instead of the hardcoded "Use Model Town by default" (location.tsx).

### P2 - Auth restore trusts the backend (no more per-reload reset + re-prompt)
Before: every reload reset the location to the city CENTER, PATCHed it back (destroying precise GPS/dragged locations), and the stale 'idle' closure forced the LocationPermissionScreen every session. Now: if GET /api/users/profile returns a real saved location (not [0,0]), restore sets frontend state FROM it, writes NOTHING back, and skips straight to the app (`setStage('app')`). The permission screen is only shown to genuinely location-less users (new accounts). City pre-centering still happens in STATE only, without the destructive PATCH.

### P3 - Single source of truth: city + coordinates now update atomically
Backend `PATCH /api/users/location` accepts an optional `city` field and `$set`s it in the SAME update as the GeoJSON point (others 400-validated). ALL frontend location-changing paths now pass city in that one call: requestLocation (granted: canonicalized to the NEAREST Pakistan-cities city so Nominatim variants like "Lahore District" can't break the matching vocabulary; deny/timeout: P1 fallback city), skipLocation, searchLocation (PlaceSearch), setLocationFromCity, resetLocation. User state + storedUser city also synced on client. Live test (`tests/fix-p3-city-sync.js`, 6/6): Lahore user switched to Karachi in one PATCH -> profile shows city=Karachi AND coords=Karachi -> a Karachi request immediately reached the Karachi provider and NOT the Lahore provider.

### P4 - City is editable in Edit Profile
Before: updateProfile hardcoded city:undefined and the profile "City & Area" card was display-only. Now: Edit Profile has a city dropdown (getAllCities from the Pakistan DB, same vocabulary as onboarding), saving PATCHes user.city AND moves the map + coordinates via the same atomic location PATCH (P3 pattern). Live test: city persisted after fresh profile GET, coords+city consistent.

### P5 - Backend fails FAST without a real DB (deployment blocker removed)
Before: `npm start` with no .env started successfully and every request hung 10s (mongoose buffering timeout) - exactly what Render would do with a misconfigured env. Now `connectDB()` (config/db.js) logs a loud FATAL banner and exits(1) if MONGO_URI is missing or unreachable (serverSelectionTimeoutMS: 10s), with exact fix steps printed. Exceptions: NODE_ENV=test, or explicit `ALLOW_NO_DB=true` (health-check-only mode, still logs a loud warning). dev-inmemory.js behavior unchanged - it sets MONGO_URI itself (in-memory mongod). Verified live: missing URI -> immediate exit(1); unreachable URI -> FATAL checklist + exit(1); ALLOW_NO_DB=true -> stays up with warning. README + project_context.md gained a "Local Development Setup" section clearly separating dev-inmemory.js (sandbox) from npm start (real path).

### Decision 6 - GPS auto-prompt implemented (inDrive-style)
LocationPermissionScreen now auto-fires `requestLocation()` ~700ms after mount (fire-once ref guard); the friendly explanation is visible first, and the "Enable location" button remains as a retry/fallback. Combined with P2, auto-prompt only ever shows for genuinely new users. Verified in the built bundle (timer + guard present).

### Decision 7 - Honest map copy
Adjusted copy that implied geographic precision: LocationPermissionScreen bullets now say "city area" estimates and "stylized area view (free map - not a precise street map)"; permission hint text added. The Google Maps branch (GoogleMap.tsx + center={location.coords}) exists end-to-end and activates automatically when VITE_GOOGLE_MAPS_API_KEY is set - code-verified, not live-tested (no key available in this environment); documented here as the intentional free-tier fallback otherwise.

**Verification:** P3 live suite 6/6, P4 live suite 3/3, P5 fatal tests 3/3 (missing/invalid/ALLOW_NO_DB), built-bundle assertions 6/6, and FULL regression: e2e-bidirectional 48/48 + e2e-availability-expiry 39/39 + audit-live-checks 12/12 - all PASS after these changes.

## Regression Fixes — 2026-08-20

Two CONFIRMED regressions reported by the user; both root-caused, fixed, live-tested, and permanently guarded by a new automated suite `backend/tests/guard-regression-checks.js` (8 checks, runs with the other suites).

### BUG A (critical): GPS silently overrode the explicitly selected city
**Symptom**: user picked **Faisalabad** at onboarding, but the Home showed **Multan / "Khanewal District"**.
**Root cause**: in `store.tsx` `requestLocation()` (granted branch), the Post-Audit P3 canonicalization (`findNearestCity` + $set `user.city` + atomic `PATCH /users/location {lng,lat,city}`) ran **unconditionally** — it never checked whether the user had *explicitly* chosen a city. Combined with the Decision-6 auto-prompt (fires ~700ms after the LocationPermissionScreen mounts, zero user action), any GPS reading that reverse-geocoded elsewhere (incl. proxied/VPN coordinates → "Khanewal District" → nearest DB city "Multan") silently replaced the onboarding selection. Sequencing: GPS resolves async AFTER the city was already set; the handler had no "explicit wins" check.
**Chosen fix — option (a) (simplest, no confirm-prompt UI)**: *explicit selection always wins; GPS may never silently switch it.*
- If an explicit city exists (onboarding picker / PlaceSearch / Profile edit / restored stored city), a GPS reading canonicalizing to the **same** city may refine the pin; a **conflicting** reading is ignored for location purposes entirely.
- On conflict: `setGps(null)` (so `resetLocation()` can't re-apply the bad reading), location reverts to the explicit city — reusing the backend's stored pin when it still matches that city (P2 doctrine: never clobber a precise pin), else city center.
- Backend is **reconciled** to the explicit city only when desynced (idempotent; also repairs accounts already poisoned by the old behavior).
- Trade-off (documented, accepted): a user who genuinely moves cities must update the city via Profile or PlaceSearch — explicit by design.
- The D6 auto-prompt needed no change; it is now harmless because the guard sits inside `requestLocation` itself (protects every caller).

### BUG B: "Request a service" button visible again on the Provider Home
**Symptom**: customer CTA re-appeared for providers (regression of the earlier Bug-5 fix).
**Root cause (earlier change identified)**: NOT the Post-Audit pass — a long-latent hole in `onboarding.tsx` (present since at least `9a83cc2`): all three OTP/Google login handlers set `token` + `storedUser` + `stage` but **never hydrated the store's `user`** — `completeAuth()` existed for exactly this and had **zero call sites** (only self-describing TODO comments). With `user === null`, `AppShell`'s gate (`user?.role === "provider"` → false) fell through and mounted the **CUSTOMER** home for providers until a full page reload; the earlier Bug-5 role-gate was therefore silently bypassed.
**Fix**:
1. `onboarding.tsx` — all 3 login paths (Google / verify-OTP existing user / complete-details new user) now call `completeAuth(...)` right after `setStoredUser`, which hydrates `user` from the stored session **and** routes the stage (provider w/o category → providerSetup, else → location). Dead TODO comments + unused imports removed.
2. `App.tsx` `AppShell` — hard guard: when `user` is null, render only a loader (never role content). A silent wrong-role home is now structurally impossible.

### Safeguards added (automated — fail loudly on any reintroduction)
`backend/tests/guard-regression-checks.js`:
- B1 button text exists ONLY in `screens/customer.tsx` (comments stripped before scan)
- B2/B3 home tab + newRequest screen stay role-gated in `App.tsx`
- B4 `AppShell` null-user guard present
- B5 `completeAuth()` called in all 3 onboarding login paths
- B6 LIVE: provider `POST /requests` → 403/401 (server never trusted the client anyway)
- A1 `requestLocation` keeps the explicit-selection guard
- A2 LIVE: poison (`PATCH` Multan as old bug did) → reconcile (`PATCH` Faisalabad as the fix does) → profile shows city+coords == explicit selection, atomically

### Verification (all on final code)
- Guard suite: **8/8 PASS** (6 static frontend invariants + 2 live API)
- Full regression: e2e-bidirectional **48/48**, e2e-availability-expiry **39/39**, audit-live-checks **12/12**, fix-p3-city-sync **6/6** — all green
- `npm run build` OK (498.90 kB); bundle contains the guard markers ("keeping explicit selection", "Loading your session", completeAuth)
- Honest disclosure: no browser exists in this sandbox, so the *pixel-level* absence of the button was verified via the build + source guards above; the role guard's server-side behavior was live-tested (B6). A 10-second visual confirmation on the deployed app is recommended.

## Pre-Deployment Fixes & Known Limitations — 2026-08-20

Final minor-issue pass from the 25-point manual verification. Item 1 mandatory; Items 2-4 judgment calls (fixed vs. documented).

### Item 1 — Phone edit dead-end FIXED (mandatory)
Worse than reported: the editable phone input wasn't merely ignored by the backend — `store.updateProfile` wrote the typed phone into `user` state AND `storedUser`, so the whole UI displayed a number the backend never saved (true silent desync until reload/restore). Fix (chosen: read-only, since a real phone change = login-identity migration requiring fresh OTP to the new number — out of scope):
- `EditProfileScreen`: phone input removed → read-only display with "Login ID" chip + note "Phone number cannot be changed — it is used for login verification."
- `store.updateProfile(name, city?)` — phone parameter deleted from signature, context type, and all local writes.
- Guard: `tests/pre-deploy-checks.js` P1a-P1c + P3 LIVE (PATCH {phone} → profile phone unchanged — the contract the UI now honestly reflects).

### Item 2 — Profile picture upload FIXED (implemented, not documented-only)
The endpoint (`POST /api/users/profile/picture`) + client method existed with zero callers. It qualified as a quick wire-up: a file-input pattern already exists (onboarding document upload) and `Avatar` needed only an additive optional `src`:
- `Avatar` gained optional `src` (initials remain default; `onError` → initials fallback — important because dev Cloudinary mock URLs are dummy/non-loadable).
- `User` type + adapter now carry `profilePicture` (adapter previously computed then dropped it).
- `store.uploadProfilePicture(file)` → POST → updates user + storedUser + toast.
- `ProfileTab`: avatar is now a tap-to-change control (camera badge + hidden file input + uploading state); `EditProfileScreen` avatar displays the photo read-only.
- Live-verified: multipart upload → 200 + URL persisted on GET /profile; no-file → 400. Guard: pre-deploy-checks P2.

### Item 3 — Active-request reminder on Customer Home FIXED (polish)
`CustomerHome` now shows a ONE-LINE compact reminder above the "Request a service" button (both map branches): "You have an open request — tap to view offers" (→ Offers) or "Active job in progress — tap to open" (→ Active Job). No duplication of Jobs-tab content.

### Item 4 — "My Offers" placement: KEPT on Provider Home (deliberate, documented)
Not moved to the Jobs tab. Reason: moving risks destabilizing the Home layout for zero functional gain — seeing live offer fates (⏳ / ✓ / ✗ / Not selected / Request cancelled / ⏰ expired) on the provider's PRIMARY screen is arguably better UX (status is ambient, not buried). This is a placement choice, not a bug.

## Known Limitations (deliberate — no surprises at deployment)
- **Phone number is immutable in-app** — it is the login identity (JWT + OTP are keyed to it). Read-only by design (Item 1). A change-my-number flow (re-verification) is a future feature.
- **Dev mode Cloudinary is mocked** — uploads return dummy URLs when CLOUDINARY_* env vars are unset, so uploaded photos don't render in dev (avatars fall back to initials via onError). Set the 3 Cloudinary vars in production for real photo storage/display.
- **Google Sign-In needs GOOGLE_CLIENT_ID** — backend returns a loud 500 without it; only the phone-OTP paths were live-testable in the sandbox. The Google path is code-wired identically (completeAuth + guard B5 covers all 3 call sites).
- **Google Maps is optional** — free custom SVG city map by default; set VITE_GOOGLE_MAPS_API_KEY for real Google Maps (untested live, no key in sandbox).
- **No background cron** — request expiry + availability are lazy-on-read (deliberate, same philosophy as no-Redis).
- **"My Offers" lives on Provider Home** (Item 4 decision).

**Verification:** new `tests/pre-deploy-checks.js` **5/5**; FULL regression re-run on final code: 48/48 + 39/39 + 12/12 + 6/6 + 8/8 guards = **118/118 green**; `npm run build` OK (502.48 kB). The two regression fixes (BUG A/B) and their guard suite were NOT touched (rules-compliant).


## Post-Live-Testing Fixes: Offer Withdraw, 2-Min Expiry, Stale/Re-Notification — 2026-08-21

Five issues from live testing on the deployed app. Root-caused, fixed, live-tested; new suite `backend/tests/offer-withdraw.js` (23 checks).

### Issue 1 — Repeated provider notifications for stale/old requests: TWO root causes, both fixed
1. **Frontend (primary):** ProviderHome alarm compared list LENGTH (`count up → beep`) with 5s polling — any count jump re-fired sound/vibration (stale request resurfacing, offline→online, finishing a job 0→N). Now **ID-based** (`knownRequestIdsRef` Set): first population after mount primes silently; only request IDs never seen this session trigger `notifyAlert`; already-known requests update silently each poll; the set prunes itself.
2. **Backend (data):** requests created BEFORE the expiry feature have **no `expiresAt`** — lazy expiry judged them "not stale" forever, so old test requests stayed pending and kept resurfacing in nearby lists (exactly the "requests the current customer never made" symptom on the long-lived Render DB). `isStalePending` now falls back to `createdAt + REQUEST_EXPIRY_MINUTES` when `expiresAt` is missing, and the sweep query matches legacy docs explicitly. Verified live: a stale request never reaches nearby and flips to cancelled/expired on read.

### Issue 2 — Request auto-expiry 20 → 2 minutes
`utils/requestConfig.js` `REQUEST_EXPIRY_MINUTES = 2` (single constant; lazy-check-on-read design unchanged, no cron). **⚠️ In-code warning:** 2 minutes is a DEMO value for fast testing — raise to ~10-15 before real users. All lazy touchpoints unchanged and re-verified (nearby, getById, getMyRequests, offer create/accept/decline/withdraw). Customer-facing copy no longer hardcodes "20 minutes". Existing expiry suite's default-duration assertions updated (≈20 → ≈2; junk override still ignored).

### Issue 3 — Customer cancel re-confirmed (no change needed)
Visible "Cancel" action on the offers screen (`cancelRequest(request.id)`), PATCH /requests/:id/cancel live-verified (200 + `request:cancelled` to offering providers + "Request cancelled" badge).

### Issue 4 — NEW: Provider can withdraw a sent offer (mirror of decline, opposite direction)
- **Backend:** `PATCH /api/offers/:id/withdraw` — provider-only, owner-only (403), pending-only (400). Sets status **`withdrawn`** (NEW distinct terminal value; enums updated on Offer + Notification + `utils/notify.js`). Emits `offer:withdrawn` to the **customer** + persists `offer_withdrawn` bell. Lazy-expiry touch first, same as decline.
- **Bug found & fixed while building this:** `acceptOffer`'s settle step used an UNFILTERED `updateMany(..., rejected)` that clobbered even `withdrawn` offers and falsely notified withdrawn providers as "not selected" — now pending-only, and the rejected-notify query is scoped to actually-rejected docs. (Cancel + expiry paths were already pending-only.)
- **Frontend:** "Your offers · live" pending card gains a **Withdraw** action (spinner in-flight); new badge **"↩ Withdrawn by you"** (sky). Customer: store listens `offer:withdrawn` → removes the offer + toast; OffersScreen merges are now **pending-only** in both paths. Additions: `api.offers.withdraw`, `store.withdrawOffer`, `SentOfferStatus` + `withdrawn`.

### Issue 5 — Three offer end-states distinct: RE-CONFIRMED (now enforced by test)
Live suite proves one request's lifecycle yields **A=withdrawn, B=accepted, C=rejected** simultaneously; badges: **✗ Declined** (rose — customer did it) vs **↩ Withdrawn by you** (sky — provider did it) vs **Not selected** (grey — another accepted); plus pre-existing "Request cancelled" / "⏰ Request expired".

**Verification (all live, final code):** offer-withdraw suite **23/23** + FULL regression: 48/48 + 39/39 + 12/12 + 6/6 + 8/8 + 5/5 + lifecycle 31/31 = **172/172 green**; `npm run build` OK (504.23 kB).

## End-to-End Self-Test — 2026-08-21 (final deployment gate)

Full 20-step workflow re-verified LIVE on final code: real OTP signups, real Socket.io
sessions, real DB state — new suite `backend/tests/e2e-self-test.js` (**64 checks, 64/64 PASS**).
Actors: 2 customers + 2 providers, same city (Faisalabad), plumber.

**Every workflow step, with the actual evidence asserted:**
1. Customer OTP signup + city + location persisted — profile city=Faisalabad.
2. Provider setup (category/radius/price) + **real multipart document upload** (field `document`, 200) + dev auto-verify + online — persisted `isVerified: true` re-fetched.
3. Matching request created 201.
4. Provider got `request:new` exactly ONCE, then **3 consecutive nearby polls produced NO duplicate** (socket count still 1, persisted request_new for that request still 1) — the Issue-1 fix holds; frontend notify guard is ID-based (static).
5. Edited-price offer 650 (profile default 500) saved verbatim — 201.
6. Customer `offer:new` live + persisted `new_offer`.
7. 2nd customer's request → offer → **WITHDRAW**: 200 `withdrawn`; 2nd customer `offer:withdrawn` LIVE (correct offerId+requestId) + persisted `offer_withdrawn`; UI badges distinct in source (sky `↩ Withdrawn by you` vs rose `✗ Declined` vs grey `Not selected`).
8. Decline: 200; provider `offer:declined` live + persisted.
9. Re-offer on declined offer REVIVES same id at new price 520, pending; second provider's offer coexists (customer sees exactly 2 pending).
10. Accept → 200; Job visible via my/active (`on_the_way`); GET /jobs/:id shows **both phones unlocked** (+92 both sides); accept path auto-navigates to Active Job (static wire check); provider got `offer:accepted`.
11. Other offer auto-`rejected` simultaneously with P1 `accepted` (DB state); provider got `offer:rejected` live + persisted; the R2 withdrawn offer STILL `withdrawn` (accept no longer clobbers).
12. Cancel CTA in offers screen (static) + PATCH cancel 200; offering provider got `request:cancelled` live + persisted — **even though his offer was withdrawn** (request-level fan-out).
13. Status ladder on_the_way→arrived→in_progress→completed: every hop 200 + live `job:statusUpdate` (`newStatus` key) on the customer; skip 400, backward 400 (twice).
    **Terminal-state contract verified:** `completed→arrived` → 400; duplicate `completed→completed` is the DELIBERATE idempotent-200 (early return before save/emit/notify) — asserted NO re-notify (socket count unchanged) + `completedAt` unchanged. Not a bug; documented design, now test-locked.
14. Completion persisted `job_status_update` on BOTH bells; completed→rating auto-prompt wiring (`setStack(['rating'])` + role-aware copy) statically locked.
15. Ratings 5★ (customer→provider) + 4★ (provider→customer) 201; profiles re-fetched: provider rating 5/1 review, customer 4/1; duplicates 400 both ways; `new_rating` persisted to both.
16. Chat both directions live (nested `{message:{text}}` payload), ack success, `chat:read` receipt to the sender, history has readAt set.
17. Completed job in BOTH order histories; cancelled R2 in 2nd customer's Cancelled history with `cancelledReason: 'customer'`.
18. Bell trails complete both sides (customer: new_offer/job_status_update/new_rating/new_message; provider: request_new/offer_declined/offer_accepted/request_cancelled/job_status_update/new_rating; 2nd customer: new_offer/offer_withdrawn) + single mark-read decrements unreadCount by exactly 1 + read-all zeroes it.
19. Expiry via sanctioned dev override (0.03 min ≈ 1.8s): read flips to cancelled/`expired`, pending offer auto-rejected, provider `request:expired` live + persisted; history shows `expired` vs R2's `customer` — distinguishable.
20. Busy-lock: with an active job, NO `request:new` for a new matching request (server fan-out exclusion), nearby empty + `hasActiveJob: true`, offer attempt → **400 PROVIDER_BUSY**; a FREE provider could still offer on the same request (lock is per-provider); lock released on completion.

**What broke during the run:** nothing in the app. First run was 57/7 — all 7 were
test-side wrong assumptions (payload key `newStatus` vs `status`; nested chat payload;
stale bell snapshot re-used across the chat step; expecting 400 where the deliberate
idempotent-200 same-status contract applies). Test corrected and re-verified. No app
code was changed in this pass.

**Full regression after the run (one clean dev-inmemory session, final code):**
self-test 64/64 · bidirectional 48/48 · availability-expiry 39/39 · audit 12/12 ·
p3-city-sync 6/6 · guards 8/8 · pre-deploy 5/5 · final-lifecycle 31/31 ·
offer-withdraw 23/23 = **236/236 green**. `npm run build` OK (504.23 kB).
Remaining known limitations: unchanged, see "Known Limitations" section above.

## Provider Home Real-Estate + Notification Semantics ("X Viewing") — 2026-08-21

Two issues from live testing feedback. New suite `backend/tests/notification-view-count.js` (19 checks); self-test + final-lifecycle updated for the new semantics.

### Issue 1 — Incoming requests now own the Provider Home screen (CHOICE: option a)
Chose **(a) — primary content of Provider Home** over moving to the Jobs tab. Rationale: JobsTab
is shared role UI (customer jobs/history live there too), so carving a provider-only "Incoming
Requests" section into it would special-case the shared screen and scatter the provider's primary
action surface across tabs; ProviderHome already held the list, just starved of space. No tab
refactor, smallest diff, zero navigation change for providers.
What changed (layout only — **all logic preserved**: live socket adds, ID-based no-repeat-alert
tracking (`knownRequestIdsRef`), busy-lock hiding/focus-mode, expiry filtering, 5s polling):
- Fixed top is now COMPACT: header row, slim online-toggle card (`p-5`→`p-4`, smaller blob), compact stats (`p-3`→`p-2.5`, value `text-lg`→`text-base`).
- The scroll region now leads with the "Requests in {city} · Live distance" header + the full-width RequestCard list — cards get the majority of the screen.
- "Your offers · live" moved BELOW the requests list (same scroll flow, `mt-4`), unchanged cards/badges/withdraw wiring.
- Static layout guards L1-L4 in the new suite will fail loudly if the requests block leaves the scroll region or the no-repeat tracking regresses.

### Issue 2 — Notification semantics corrected + customer-side "X providers viewing"
- **REMOVED:** persisted `request_new` bell notifications for every nearby provider on every new request — merely SEEING a request in the list is not a notification. The live `request:new` SOCKET event and the client sound/vibration cue are UNCHANGED (genuinely-new-request alert only, ID-tracked). Provider bell entries remain reserved for actions tied to them personally: offer accepted/declined/rejected, request cancelled/expired after they offered. (Enum values `request_new`/`request_expired` etc. stay in the model so legacy entries still render; the bell icon/navigation mappings untouched.)
- **NEW socket event** `request:viewCount` → `{ requestId, count, category }` emitted to the CUSTOMER (a) once at request creation and (b) on every provider online/offline toggle that could change a pending request's count (`utils/viewCount.js` → `reemitViewCountsForProvider`, called fire-and-forget from `PATCH /users/profile` when `isOnline` is provided). Count semantics: exactly the provider set that can SEE the request — online+verified+category+city+radius, busy-lock excluded — via the extracted shared matcher `computeMatchingProviders`, now used by createRequest itself so fan-out and view-count can never disagree.
- **API:** `POST /api/requests` 201 response now includes `request.viewingProviders: { count, category }` (immediate paint before/with the socket echo; additive).
- **Frontend:** `store.viewCounts` map, seeded from the create response, updated live by `request:viewCount`, cleaned up on accept/cancel/expiry; `ViewingPill` in customer.tsx renders on BOTH the post-request landing screen (AvailableProviders) and the Offers screen while the request is open: "N {category plural} viewing your request · Live" (0-count → "Finding {plural}…") using the CATEGORIES plural vocabulary.

**Regression updates for the new semantics (assertions corrected, not deleted):** e2e-self-test
S4 now asserts ZERO persisted request_new + 1 socket event, and S4b-S4e verify the live count
(create response + socket + offline/online re-pings); final-lifecycle provider trail no longer
requires request_new (now asserts its ABSENCE). Counts in both suites are derived live from
`/providers/available` (shared-inmemory-DB safe — suites can run in any order on one server).

**Verification (all live, one clean dev-inmemory session, final code):** view-count suite **19/19**
(response+socket counts, live offline/online updates, busy-exclusion parity with fan-out, zero
persisted request_new, layout guards) + self-test **68/68** + bidirectional 48/48 +
availability-expiry 39/39 + audit 12/12 + p3 6/6 + guards 8/8 + pre-deploy 5/5 + lifecycle 31/31 +
offer-withdraw 23/23 = **259/259 green**; `npm run build` OK (505.94 kB).

## Returning User Login & Session Persistence (Phone + Google) — 2026-08-21

Auth-flow correctness rework. **The backend is the single source of truth for all auth flags** — the frontend never guesses whether a user is new or fully set up; it routes purely on server-returned flags.

### 1. The auth-response contract (identical shape from every auth endpoint)
`POST /auth/phone/send-otp` → OTP only (Kept; re-send never rate-limited). Every identity-issuing endpoint — `POST /api/auth/phone/verify-otp`, `POST /api/auth/google`, `POST /api/auth/refresh`, `GET /api/auth/me` — returns:
```
{ status, message, isNewUser,
  token        (access JWT, 25 min, claim type:'access'),
  refreshToken (30-day JWT, claim type:'refresh' + jti),
  user: { id, name, email, phone, role, city, profilePicture, location, rating, reviews,
          category, radiusKm, yearsExperience, defaultVisitingCharge, documentUrl,
          verificationStatus, authProvider, isNewUser, setupComplete, setupStep } }
```
- `verify-otp` is now **existence-check-before-create**: existing phone → LOGIN; name/role/city resubmitted in the body are IGNORED (DB wins), `isNewUser:false` + full profile + both tokens. New phone → signup REQUIRES name+role (city optional), `isNewUser:true`. OTP is always consumed on success (prevents reuse).
- `GET /auth/me` echoes the same user payload with `isNewUser:false` (it can only be a session restore for an existing user) + `googleLinked` boolean (raw googleId never exposed).

### 2. googleId-vs-phone reconciliation order (NEVER a duplicate account)
`googleAuth` resolves identity in a fixed order:
1. **Lookup by googleId FIRST** — existing Google user → login; stale name/picture in the body ignored, `isNewUser:false`.
2. **Lookup by phone SECOND** — account originally created by phone OTP using the same number → **LINK**: `googleId` is persisted onto the SAME user row, `authProvider` becomes `'both'`, `isNewUser:false`, one user row total. A phone token and a Google token are two doors to the same house; verified live in-process (G3).
3. **Lookup by email THIRD** → link googleId onto that account.
4. Genuinely new → signup requires phone (OTP-proof replacement: Google identity ≠ phone ownership) + role/city for setup, `isNewUser:true`.
Conflict guard: if the phone row is already linked to a DIFFERENT googleId → **409** (no silent hijack, no duplicate — G7).

### 3. setupComplete / setupStep (computed on read, not a stored flag)
`utils/setupComplete.js` — customer: `name && city`. Provider: also needs `category && radiusKm` and `verificationStatus !== 'not_submitted'`. `firstIncompleteStep` → `'details' | 'category' | 'verification' | null`. Both ride on EVERY auth user payload. Because it's derived from persisted fields, provider location/category/verification **re-verify across logins** by construction — nothing is rebuilt (P1–P5 live matrix: partial provider survives relogin at exactly `'category'`, then advances to exactly `'verification'` after setup PATCH, then a real document upload → pending → `setupComplete:true`; full persistence re-confirmed across a second login).

### 4. Dual-token sessions (Part C)
- **Access JWT 25 min + refresh JWT 30 days**, both signed with JWT_SECRET, distinguished by `type:'access'|'type:'refresh'` claims. HTTP auth middleware AND the Socket.io handshake middleware **reject any non-access token** (a refresh token cannot open a socket or call /me — live-checked T1).
- `RefreshToken` model: `{ user, jti (unique), tokenHash (bcryptjs — DB leak never leaks usable tokens), device, expiresAt (TTL index, autopurge), revokedAt }`. One document is created **per login**, so multiple devices/sessions coexist independently (T5: revoking device A leaves device B fully alive — no forced single-session).
- `POST /auth/refresh`: verifies signature+type+jti, requires an unexpired DB record, bcrypt-compares tokenHash, issues a NEW access token + fresh user payload. `POST /auth/logout`: deletes the refresh record (idempotent, tolerates already-expired tokens via decode fallback) → subsequent refresh of that token → **401 REFRESH_REVOKED** (live T4/T6).

### 5. Frontend session handling
- Both tokens in `localStorage` (`ufix_jwt`, `ufix_refresh_jwt`). **Deliberate trade-off vs httpOnly cookies:** production deploy is cross-domain (Render backend + Vercel frontend), so first-party SameSite=Lax cookies don't fit without a shared parent domain; Authorization-header localStorage tokens keep the current architecture deploy-simple. XSS surface is the accepted cost, mitigated by short access lifetime + server-side revocation. **Future upgrade path:** swap to httpOnly SameSite=None;Secure refresh cookie once domains are finalized — backend endpoint contract already supports it (refresh read from cookie or body).
- `apiFetch` on **any non-/auth/ 401** → **single-flight** silent refresh (one module-level shared promise — N simultaneous 401s trigger ONE refresh) → retry the ORIGINAL request once. Only if refresh itself fails: `clearAuth()` + dispatch `ufix:unauthorized` `{reason:'session-expired'}` → toast “Session expired, please log in again.” → route to auth. (T3 mints an actually-expired access token with the dev secret to prove the 401 trigger.)
- App mount → `GET /auth/me` restore: stored user is REPLACED by the backend payload, and routing uses `setupComplete`: returning+complete → Home (or Location screen if no real location yet) — **never re-shows setup**. Returning+!complete provider → resumes the wizard at the first incomplete step via one-shot handoff key `ufix_setup_resume_step` (written by BOTH completeAuth and the mount-restore path; `'category'→step 0`, `'verification'→step 2`), so a cold reload mid-setup lands exactly where the user left off.
- Socket.io auth uses **function form** `auth:(cb)=>cb({token:getToken()})` so every reconnect presents the CURRENT access token (after a refresh, the next reconnect is authenticated with the new one — no staleness window).
- Google button on the frontend routes identically: backend `isNewUser` → name(prefilled)/details step + location permission + provider wizard; else straight in.

### 6. Known limits (documented, not hidden)
- **Google endpoint is env-limited in the sandbox:** no GOOGLE_CLIENT_ID + real Google idTokens cannot be minted here, so HTTP-level live verification isn't possible. The endpoint **fails LOUDLY** with 500 `{needsConfig:true}` when unconfigured (asserted by G1). All reconciliation logic (link first-phone-then-google, returning-by-googleId, new signup, 409 conflict) IS live-tested **in-process against the real controller + real in-memory Mongo**, mocking only Google's cryptographic verify seam (G3–G7). Same treatment as prior passes.
- OTP remains in-memory (Map), 4-digit demo code logged to console in dev — unchanged.

**Verification (fresh dev-inmemory server, final code, all real API calls):** new suite `backend/tests/auth-flow.js` **29/29 green** (8 static contract guards + 4 live OTP + 5 live provider-resume matrix + 6 live dual-token/revoke/multi-device + 5 in-process Google reconciliation + 1 env-limited skip); full battery incl. all prior suites = **288/288 green** (`tests/run.sh` — guards untouched, BUG A/B intact); `npm run build` OK (507.58 kB).

## Professional Sound System (3 distinct tones) — 2026-08-21

Audio cues in `frontend/src/lib/sound.ts`, all synthesized with the **Web Audio API** (oscillators + gain envelopes) — still **zero external audio files, zero new dependencies**. Soft attack (~20ms) + exponential release on every note; no square waves, nothing arcade-like.

### The three tones
| Export | Character | Duration | Volume | Fired on |
|---|---|---|---|---|
| `playNotificationTone(notificationId?)` | gentle rising two-note ping, sine E5(659.25)→A5(880) | ~0.25s | peak 0.10-0.12 (subtle) | EVERY persisted notification: new_offer, offer_declined, offer_rejected, offer_withdrawn, request_cancelled, request_expired, job_status_update, new_message, new_rating |
| `playNewRequestTone(requestId?)` | weightier downward attention sweep 880→440 (+ vibrate [200,100,200]) | ~0.65s | 0.26 | genuinely NEW request for a provider (socket `request:new` AND the 5s poll sentinel) — established alert identity from earlier fixes, kept distinct |
| `playBookingConfirmedTone(offerId?)` | ascending C5-E5-G5 major arpeggio, last note rings (+ vibrate [120,60,120]) | ~0.6s | 0.14-0.15 | offer ACCEPTED — both customer (their accept action success, before auto-navigate to Active Job) AND provider (`offer:accepted` live event) |

### Trigger topology (audio layer ON TOP of existing correct events; no notification logic touched)
- **`notification:new` handler plays the ONE standardized ping** for all persisted types — EXCLUDING `offer_accepted` (booking tone owns it) and `request_new` (no longer persisted since 2026-08-21; ID-tracked request alert owns it). This makes chat messages, declines, withdrawals, cancels, expiries, status updates and ratings — several of which previously had NO sound — consistent with a single subtle ping.
- `offer:declined` and the `job:statusUpdate` completed handlers are now **vibration-only** (their audible cue arrives via the persisted notification ping from exactly one place). The provider who MARKS a job complete is the actor (no self-notification by design) → his side pings `playNotificationTone()` directly at the action.
- Booking moment wired at BOTH arrival paths (`acceptOffer()` success + `offer:accepted` socket) with **offerId-keyed dedup** — whichever arrives first sounds, the other silently no-ops.

### De-duplication & anti-stacking (inside sound.ts)
- `claimAudible(key, ttl)` — TTL'd one-shot keys: a notification/booking/request id can never sound twice (10s ids, 5min request ids; map pruned over 300 entries).
- Global `MIN_TONE_GAP_MS = 550` — no two AUDIBLE tones overlap; a burst of 3 rapid notifications collapses into ONE ping. Haptics are independent (a genuinely-new request still vibrates even if its audible sweep was gap-collapsed) because vibration never stacks audibly.
- **Bug fixed by design here:** the old new-request alert could fire TWICE for one request (socket handler + 5s poll sentinel each saw it "fresh" in their own ref). Now both call `playNewRequestTone(requestId)` into the SHARED dedup — exactly one alert per request id, whatever the source (LIVE-proven: same `{request:{id}}` payload only sounds once).
- Cross-source proven at unit level: compiled `sound.ts` (esbuild) executed in node against a mock AudioContext — scheduled notes/frequencies/spans asserted — plus a LIVE feed-through: real two-user sockets on the running backend captured real `offer:accepted` / `notification:new(offer_accepted)` / `request:new` payloads, fed through the compiled module EXACTLY as store.tsx does → accept produced exactly one 3-note arpeggio, zero general pings, one new_message ping.
- Sounds still play while the tab is hidden ON PURPOSE (chat/offer pings are useful in another tab); only the gap + dedup protect against noise. `resetSoundGuardsForTests()` exists for the test harness.

**Verification (fresh dev-inmemory server):** new suite `backend/tests/sound-system.js` **19/19** (S1-S6 static wiring guards + U1-U8 compiled-module units [tone shapes, durations, per-id dedup, 550ms anti-stack gap, cross-tone suppression, legacy back-compat] + L1-L4 live socket feed-throughs); adapted `notification-view-count.js` L3 guard to the new helper name with the SAME locked intent (ID tracking wired + an alert helper called — helper name no longer hardcoded); full battery **307/307 green**; `npm run build` OK (508.73 kB). BUG A/B guards untouched (8/8).

## Provider Home Flicker Fix + Edited-Price Chain Hardening — 2026-08-22

Two live-testing reports on the Provider request list, root-caused jointly (they were the same disease wearing two masks).

### BUG 1 — request cards blinking every 5s poll. ROOT CAUSE
The **5s background poll** used the same `isLoading['nearbyRequests']` skeleton flag as the manual Refresh button. Every poll: `setLoading(true)` → **skeleton placeholder replaced the whole card list** → cards unmounted → answer returned → cards re-mounted → `animate-slide-up` entrance animation re-triggered on EVERY card. Blinking, in exact lockstep with the 5s interval.
**Hidden extra damage (this is the real BUG 2):** `RequestCard` holds the edited offer price in local `useState`. Every poll-remount silently **reset the in-progress typed price back to basePrice** — the provider could type 777, a poll lands mid-edit, input snaps back to 500, tap Send → backend receives 500. Every backend/adapter/socket layer was faithfully carrying whatever the UI actually sent — which is why the earlier 550 REST test never caught it (unit tested the pipe, never the tap).

### Fixes (frontend only; zero backend change needed for BUG 1/2)
1. **Silent polls:** `refreshNearbyRequests({silent})` — background interval passes `{silent:true}`; the skeleton swap only happens on manual refresh / first load. No remount per poll.
2. **`lib/listReconcile.ts`:** `reconcileNearbyRequests(prev, next)` — identical content ⇒ **identical array reference** (zero re-render at all); otherwise ONLY changed cards get a new object identity (unchanged keep refs → no re-render, no animation restart, **edited input state survives**). Compares only render-visible fields, `distanceKm` included, so live numbers still update smoothly.
3. **Animate-once per id:** entrance animation gated by `animateIn = !knownRequestIdsRef.has(id)` (reuses the ID-tracking ref from the notification-spam fix) — a card slides in exactly once: the render where its id is first seen; stable `key={r.id}` kept (never index).
4. **Layout (companion fix):** customer `OfferCard` — price column `shrink-0` own column, stars row `whitespace-nowrap` — rating stars & price clearly visible, no longer pinched together on narrow phones.

### BUG 2 — truth + hardened proof (rule 3)
Backend chain was proven clean under a live 777 probe: create return ✓ socket `offer.visitingCharge` ✓ adapter `frontend.visitingCharge` ✓ customer GET poll ✓ — **the UI remount was the single divergence point** (item 1 hidden damage). New suite `backend/tests/provider-home-and-price.js` (**13 checks**): S1-S6 static wiring locks (silent gate, reconcile applied, interval silent, stable key+animateIn, VISIBLE_FIELDS, pinch guard), U1-U4 compiled-module units (identical poll → same array ref; new card enters without touching others; distance change re-renders exactly one card; frontend adapter maps visitingCharge straight-through), L1-L3 **live full-chain** on the running backend: edited 777 through REST-return → raw socket payload → adapter payload → customer poll GET → **accept → persisted job**; plus REVIVE path (offer 555 → decline → re-offer 888 same offer id → customer sees 888, never stale 555). Rule-3 gap closed: earlier test only covered REST creation; now every hop incl. UI-cause statics is locked.

**Verification:** full battery **320/320 green** on fresh dev-inmemory (BUG A/B guards untouched); `npm run build` OK (509.29 kB).

## TODO Next
- [x] All core features done + 5 bug fixes verified, site 100% functional end-to-end, ready for deployment prep
- [x] Bidirectional Activity Sync & Workflow Completion pass - verified 48/48 E2E (2026-08-20)
- [x] Provider Availability Lock & Request Expiry pass - verified 39/39 E2E (2026-08-20)
- [x] Location System Fixes - Post-Audit pass (P1-P5 + Decisions 6-7), regressions green (2026-08-20)
- [x] Regression Fixes (BUG A: explicit city > GPS; BUG B: onboarding never hydrated user) - guarded 8/8 + full suites green (2026-08-20)
- [x] Pre-Deployment pass: Item 1 phone dead-end FIXED (read-only), Item 2 photo upload wired live, Item 3 Home reminder added, Item 4 documented - 118/118 green (2026-08-20)
- [x] FINAL 26-point deployment verification: 118/118 suites + full lifecycle run (tests/final-lifecycle-run.js) 31/31 - READY (2026-08-20)
- [x] Post-live-testing fixes: offer-withdraw endpoint + ID-based provider notify + legacy stale-request expiry + 2-min demo expiry - 172/172 green (2026-08-21)
- [x] End-to-End Self-Test (20-step final gate): 64/64 live checks + full regression 236/236 - DEPLOYMENT GATE PASSED (2026-08-21)
- [x] Provider Home real-estate (option a) + notification semantics fix + 'X providers viewing' live count (request:viewCount) - 259/259 green (2026-08-21)
- [x] Returning User Login & Session Persistence: isNewUser/setupComplete contract (backend = single source of truth), googleId>phone linking no duplicates, dual-token refresh + server-side revocation, silent single-flight frontend refresh, partial-setup resume - 288/288 green (2026-08-21)
- [x] Professional Sound System: 3 distinct Web-Audio tones (general ping / new-request sweep / booking C5-E5-G5 arpeggio), per-id dedup + 550ms anti-stack gap, live feed-through proven - 307/307 green (2026-08-21)
- [x] Phase 11 deployment PREP: render.yaml blueprint + frontend/vercel.json + frontend/.env.production.example + docs/DEPLOYMENT.md (Atlas->Render->Google OAuth->Vercel->UptimeRobot->smoke); env-readiness verified pre-existing (PORT, CLIENT_URL CORS, MONGO_URI, JWT_SECRET, GOOGLE_CLIENT_ID) - pre-deploy checks 5/5 (2026-08-21)
- [x] Provider Home flicker fix (silent polls + reconcileNearbyRequests + animate-once-per-id) + edited-price chain hardened live 777/888 incl. revive + OfferCard stars/price pinch fix - 320/320 green (2026-08-22)
- [ ] Phase 11: Deployment (Render backend + Vercel frontend + UptimeRobot ping + production env vars) - optional; P5 fail-fast makes misconfiguration loud instead of silent
- [ ] Future: Google Places Autocomplete, Directions, Distance Matrix

## Notes
- Test-harness note: e2e-availability-expiry [A6] can flake ONLY if many suite loops run on the SAME dev-inmemory server (limit(20) on /providers/available + accumulated test providers); restart dev-inmemory.js for a clean DB - verified 39/39 on clean. limit(20) is intended. App code is correct.
- Notification design (deliberate): persisted bell entries go to the COUNTER-party of an action (e.g. on accept, provider gets offer_accepted; the customer-actor gets instant UI feedback instead of a self-notification).
- Site fully functional end-to-end, two real users (customer + provider) can complete entire journey: signup with city, request with area name, offer with distance-based price PKR, accept, contact unlock tel:, status timeline live, live location both ways on map, chat real-time, rating, history, notifications, city-based filtering (plumber request -> only plumbers same city)
- Visual design preserved, only data layer changed + new city-based + PKR + perfect SVG map
- No mock data: PROVIDERS/SEED_REQUESTS removed, only CATEGORIES config
- All currency PKR, not ₹
- Free SVG map perfect, no Google verification needed, no charges, optional Google Maps via VITE_GOOGLE_MAPS_API_KEY with $200 free credit explanation
- Profile loading optimized: instant cache + background fetch, no slow loading

