# FINAL LOCK - Distance-Based Offer Flow - Professional

## Locked Flow (User Confirmed Final)

1. Customer posts request in his city (e.g., Lahore) with category plumber, description, pin, address, city
2. Provider sees request in Requests near you in Lahore section with:
   - Area/Jagah ka naam prominent: Model Town, Block C, Lahore
   - Live distance exact: 1.2 km away • Live reading both live locations (provider GPS watchPosition + request lat/lng)
   - Customer name, time ago, description, category
   - Visiting charge input: Provider sets price based on distance (professional: 1km=300, 3km=500, 6km=750)
   - Send Offer button
   - Sound + vibration, urgency badge, live GPS

3. Provider sets price based on distance and sends offer
4. Customer sees ONLY offers from providers who responded (not all online) - plumber request -> only plumbers who sent offer
5. Customer accepts -> Job created -> Both Active Job -> Contact unlock tel: -> Both live locations on map via job:locationUpdate
6. Job status On The Way -> Arrived -> In Progress -> Completed LIVE
7. After completed, provider still online and visible for next service
8. Offline toggle: provider goes offline -> not visible, no requests

Provider interface: No Request a service button, only demand options: online toggle, earnings, jobs, requests near you, refresh, send offer, jobs, chat, profile

City + Category Filtering: Plumber request -> only plumbers in same city (Lahore plumber request -> Lahore plumbers only, not electrician, not Karachi)

Area name: reverseGeocode road+suburb+city
Live distance: watchPosition + Haversine live

Build: Frontend 478KB, Backend boots clean
E2E: 10 steps PASS + City-based PASS Lahore 1 Karachi 0

This flow is now LOCKED as final professional flow.

