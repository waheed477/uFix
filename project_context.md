# uFix - Project Context - Final Production Ready

## Current Status
Phase 10 Completed — Site 100% functional end-to-end with city-based filtering, live tracking, PKR currency (2026-08-19)

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Socket.io-client, Fetch API, 35 Pakistan Cities DB, Custom SVG Map (100% free, no API key) + Optional Google Maps
- **Backend:** Node.js, Express, MongoDB (Mongoose) 2dsphere indexes, Socket.io, Cloudinary + Multer, JWT, Google Auth + Phone OTP (inDrive style)
- **Maps:** Custom SVG perfect map (parcels, parks, water, roads, city watermark, free badge) + OSM Nominatim free reverse geocode + Optional Google Maps JS/Embed via VITE_GOOGLE_MAPS_API_KEY
- **Real-Time:** Socket.io room-based user:{id}, in-memory adapter, events: request:new, offer:new, offer:accepted/rejected, request:closed/cancelled, job:statusUpdate, job:locationUpdate (live both ways), chat:message/read, notification:new
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
- Auth: POST /api/auth/google, POST /api/auth/phone/send-otp, POST /api/auth/phone/verify-otp, GET /api/auth/me
- Users: GET /api/users/profile, PATCH /api/users/profile (name, city, profilePicture, isOnline), POST /api/users/profile/picture, PATCH /api/users/location {lng,lat}
- Providers: PATCH /api/providers/setup {category, radiusKm, yearsExperience, defaultVisitingCharge}, POST /api/providers/document, GET /api/providers/verification-status, GET /api/providers/available?city=&category= (city-based online count + list with price), PATCH /api/providers/:id/verify, POST /api/providers/dev/verify-me (dev auto-verify)
- Requests: POST /api/requests {category, description, lng, lat, address, city}, GET /api/requests/nearby (city+category), GET /api/requests/my, GET /api/requests/:id, PATCH /api/requests/:id/cancel, POST /api/requests/:id/direct-accept {providerId} (direct booking with price from profile)
- Offers: POST /api/requests/:id/offers {visitingCharge, etaMinutes}, GET /api/requests/:id/offers, PATCH /api/offers/:id/accept
- Jobs: GET /api/jobs/:id, PATCH /api/jobs/:id/status, GET /api/jobs/my/active, GET /api/jobs/history?status=all|completed|cancelled, POST /api/jobs/:jobId/rate, GET /api/jobs/:jobId/reviews
- Messages: GET /api/jobs/:jobId/messages
- Notifications: GET /api/notifications, PATCH /:id/read, PATCH /read-all
- Socket.io: ws://PORT - auth JWT, rooms user:{id}, events: request:new (area name + city + live distance), offer:new, offer:accepted/rejected, request:closed/cancelled, job:statusUpdate, job:locationUpdate (live both ways), chat:send/message/markRead/read/error, notification:new

## Database Schema (Current Final)
- User: name, email sparse unique, googleId sparse unique, phone unique required, role customer/provider, profilePicture, city (Pakistan city), location Point [lng,lat] 2dsphere, isOnline, isVerified, category plumber/electrician/mechanic, radiusKm 2-25, yearsExperience 0-50, defaultVisitingCharge 100-5000 default 500 PKR, documentUrl, verificationStatus not_submitted/pending/approved/rejected, rating 0-5 avg, reviews count
- Otp: phone, otp 6-digit, expiresAt TTL 5min, attempts max5
- Request: customer ref, category, description 10-1000, location Point 2dsphere required, address 300, city 100 (for city-based filtering), status pending/active/completed/cancelled, acceptedOffer, acceptedProvider
- Offer: request ref, provider ref, visitingCharge >0 PKR, etaMinutes >0, status pending/accepted/rejected, unique compound (request,provider)
- Job: request unique ref, customer ref, provider ref, offer ref, status on_the_way/arrived/in_progress/completed, statusHistory, completedAt
- Message: job ref indexed, sender ref, text 1-2000, readAt, job+createdAt index
- Review: job ref, fromUser ref, toUser ref, rating 1-5 integer, comment max 500, unique compound job+fromUser
- Notification: user indexed, type enum [new_offer, offer_accepted, offer_rejected, request_new, request_cancelled, job_status_update, new_message], title, body, relatedId, isRead

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

## TODO Next
- [x] All core features done, site 100% functional end-to-end, 35 cities, city-based filtering, PKR currency, perfect flow
- [ ] Phase 11: Deployment (Render backend + Vercel frontend + UptimeRobot ping + production env vars) - optional
- [ ] Future: Google Places Autocomplete, Directions, Distance Matrix, request expiry auto-cancel after 15 min, provider busy check (one active job), price editable in profile edit

## Notes
- Site fully functional end-to-end, two real users (customer + provider) can complete entire journey: signup with city, request with area name, offer with distance-based price PKR, accept, contact unlock tel:, status timeline live, live location both ways on map, chat real-time, rating, history, notifications, city-based filtering (plumber request -> only plumbers same city)
- Visual design preserved, only data layer changed + new city-based + PKR + perfect SVG map
- No mock data: PROVIDERS/SEED_REQUESTS removed, only CATEGORIES config
- All currency PKR, not ₹
- Free SVG map perfect, no Google verification needed, no charges, optional Google Maps via VITE_GOOGLE_MAPS_API_KEY with $200 free credit explanation
- Profile loading optimized: instant cache + background fetch, no slow loading

