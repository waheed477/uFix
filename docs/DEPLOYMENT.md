# uFix — Production Deployment Guide (Phase 11)

**Stack:** Render (backend, Node + Socket.io) · Vercel (frontend, Vite single-file) · MongoDB Atlas (free M0)
**Time:** ~45 min pehli dafaa · **Cost:** $0 (free tiers)

Repo already env-ready hai: `PORT`, `CLIENT_URL` (CORS, Express + Socket.io dono), `MONGO_URI`,
`JWT_SECRET`, `GOOGLE_CLIENT_ID` — koi code change production ke liye zaroori NAHI hai.
Files: `render.yaml` (backend blueprint), `frontend/vercel.json` (SPA build), `frontend/.env.production.example`.

---

## 1 · MongoDB Atlas (database)

1. atlas.mongodb.com → free M0 cluster (region: **Singapore/ap-south-1** — Pakistan ke liye lowest latency)
2. Database User banana (read-write) → password note karo
3. **Network Access → Add IP → `0.0.0.0/0`** (Render ke dynamic IPs; Atlas standard practice)
4. Connect → Drivers → Node.js se URI copy:
   `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/ufix?retryWrites=true&w=majority`

## 2 · Render (backend)

1. Render Dashboard → **New → Blueprint** → repo select → `render.yaml` auto-detect (ya manual Web Service: rootDir `backend`, build `npm install`, start `node src/server.js`, health `/api/health`)
2. Environment variables set karo (table neeche)
3. Deploy → URL milega e.g. `https://ufix-backend.onrender.com`
4. Smoke: `https://<url>/api/health` → `{"status":"success",...}`

### Backend env vars
| Key | Value | Note |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | (Render auto-set) | mat do |
| `MONGO_URI` | Atlas string (§1) | required |
| `JWT_SECRET` | **fresh 64-hex** (cmd neeche) | required — access+refresh dono isi se sign. **Dev wala secret kabhi production me reuse NAHI** |
| `CLIENT_URL` | `https://<vercel-domain>` | **production me wildcard `*` HARAAM** — unknown origins ab reject hoti hain (hardening 2026-08-26). comma-separated multiple domains OK |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID | **required for auth.google** — bina iske Google login LOUDLY 500 `needsConfig` karta hai (designed) |
| `OTP_EXPIRY_MINUTES` | `5` | |
| `CLOUDINARY_*` | (optional) | unset ⇒ mock upload mode (docs) |
| `ADMIN_SECRET` | **strong unique 32-hex+** | provider-verify admin route guard. **Unset ⇒ route production me 404** (by design). JWT_SECRET se juda value |
| ~~RATE_LIMIT_DISABLED~~ | **kabhi set mat karo** | test/battery-only bypass — production me set kiya to rate limits band (security risk) |

**Secrets generate karne ka tareeqa (har value alag, fresh):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_SECRET ke liye
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ADMIN_SECRET ke liye (DOBARA run karo — same NAHI)
```
Secrets sirf Render/Vercel dashboards me paste karo — **kabhi git me commit nahi** (`.env*` ignored hai).

> Cold-start note: free Render tier sleeps after ~15 min idle — pehli request ~30-50s late ho sakti hai. §5 UptimeRobot ping se sleep practically garib hoti hai.

## 3 · Google Cloud Console (OAuth — sirf agar Google login chahiye)

1. console.cloud.google.com → APIs & Services → Credentials → **Create OAuth 2.0 Client (Web)**
2. **Authorized JavaScript origins:** `https://<vercel-domain>` (+ `http://localhost:5173` dev ke liye)
3. Client ID copy → Render `GOOGLE_CLIENT_ID` mein paste
4. (Google Sign-In JavaScript client-side GETs an idToken; sirf yeh ID chahiye — secret ki zaroorat nahi)

## 4 · Vercel (frontend)

1. vercel.com → **Add New → Project** → repo import, **Root Directory = `frontend`**
2. Framework: **Vite** (vercel.json rewrites already theek hain)
3. Env vars (before first deploy):
   - `VITE_API_URL = https://ufix-backend.onrender.com`
   - `VITE_SOCKET_URL = same`
   - (optional) `VITE_GOOGLE_MAPS_API_KEY`
4. Deploy → domain milega → **wohi domain Render `CLIENT_URL` mein daal ke backend REDEPLOY karo** (CORS)
   > Security note (2026-08-26 hardening): production CORS ab **strict** hai — `CLIENT_URL` me type ho ya mismatch ho to frontend se API calls block ho jayengi; domain EXACT match karna (https:// prefix ke saath, trailing slash nahi).

## 5 · UptimeRobot (sleep-proofing)

> Rate-limit note (2026-08-26): monitor ping `/api/health` ko hit karta hai — 1 ping / 5 min `100 req/min per IP` baseline se KAYI gunah kam hai; monitor kabhi 429 nahi khaayega.

1. uptimerobot.com → Add Monitor → **HTTP(s)**, URL: `https://ufix-backend.onrender.com/api/health`, interval **5 min**
2. (Health endpoint free nahi hota Render pe — but called-ping keeps instance awake 24/7 within free limits)

## 6 · Post-deploy live smoke (production pe bhi real API calls)

```
# 1. health
curl https://<backend>/api/health
# 2. phone auth round-trip
curl -X POST https://<backend>/api/auth/phone/send-otp -d '{"phone":"<your-phone>"}' -H 'Content-Type: application/json'
#    (dev/test: otp response me hota; prod pe console.log — Render logs me dikhta)
# 3. browser: https://<vercel-domain> — full smoke:
#    signup customer + provider (2 devices/browsers), request -> offer -> accept
#    (booking tone dono sides pe) -> chat -> complete -> rate -> reload persistence
```
Production flow ke automated suites **in-memory DB pe** green hain (307/307); prod DB pe
`tests/*` mat chalana (test users pollute real data). In-browser hand-smoke sufficient hai.

## Known production notes (documented, no surprises)

- **localStorage tokens** cross-domain (Render+Vercel) — deliberate; upgrade path = same-domain/httpOnly cookie (project_context.md §auth)
- **Refresh tokens** server-side revocable (`RefreshToken` model, TTL autopurge)
- **OTP in-memory** (per-process Map) — Render single instance pe fine; scale-out se pehle Redis (documented as future)
- **Notifications `request_new`** persisted nahi hote (semantics fix) — live socket + ID-tracked alert hi source of truth hai
- **Sounds** Web Audio synth — koi asset hosting nahi chahiye
- **Google Maps** optional — custom SVG map default, free, no key
