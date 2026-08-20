# uFix - COMBINED Changes (2026-08-20)

2 updates ek saath — **Bidirectional Sync** + **Availability Lock & Request Expiry**.
27 files changed/added (backend + frontend + project_context.md + 2 E2E test files).

## Apply
Repo root mein extract karo — sab files apni jagah overwrite ho jayengi.

## Run
```bash
# Backend (no external MongoDB needed - in-memory)
cd backend && npm install && node dev-inmemory.js

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

## Test (2 browser tabs)
Tab 1: CUSTOMER (Lahore) | Tab 2 (incognito): PROVIDER (plumber, Lahore, online)
Dev OTP screen par hi nazar aata hai (debug mode).

### Workflow test (Bidirectional Sync)
1. Customer: request post → Provider tab: sound + card LIVE
2. Provider: price edit (550) → Send offer → Customer: offer LIVE (Jobs/Offers)
3. Customer: ❌ Decline → Provider: "Declined" badge + bell notification
4. Provider: dobara offer (500) bhejo → Customer: nayi offer aayi
5. Customer: Accept → dono Active Job (phone unlocked)
6. Provider: status advance (arrived → in progress → completed) → Customer timeline LIVE
7. Complete hote hi DONO ko Rating screen auto-milegi → dono rate karo → bell mein "You received a new rating" ⭐
8. Jobs → History: completed job dono side
9. Cancel test: naya request + offer → customer cancel → provider "Cancelled" badge + notification

### NEW: Availability Lock (busy provider)
Setup: 2 provider accounts chahiye (Provider A + Provider B — dono plumber, Lahore, online). 3 tabs seedha karo (customer, A, B).
1. Customer request post → A accept kar leta hai → **A ab BUSY**
2. Customer doosra request post karo → sirf B ko card aayega; A ki Home par: amber banner 🔒 "You have an active job" + request cards gayab
3. A agar offer bhejne ki koshish bhi kare (kisi aur device se) → error: "You have an active job in progress."
4. Customer ke Available Providers list mein bhi A nahi dikhta (dead "Book Now" nahi)
5. A job COMPLETE kare → banner gayab, requests waapis aane lagti hain (lock release)

### NEW: Request Auto-Expiry (20 min)
Default: request 20 minute pending rahi aur koi offer accept nahi hui → auto-EXPIRE.
- History mein "⏰ Expired" (amber) badge — "Cancelled" se alag
- Customer ko Offers/Jobs par: "Expired — no providers responded in time" + **"Post again"** button
- Jis provider ne offer bheji thi uska badge: "⏰ Request expired" + bell notification

**Quick test (bina 20 minute wait ke):** dev mode mein request create karne waali API call mein `expiresInMinutes: 1` bhej do (1 minute), ya:
```bash
node tests/e2e-availability-expiry.js
```
Yeh script khud hi 3-second expiry se poora flow verify karti hai.

## Automated checks (backend chal raha ho to)
```bash
node tests/e2e-bidirectional.js        # expect: 48 passed, 0 failed
node tests/e2e-availability-expiry.js  # expect: 39 passed, 0 failed
```
