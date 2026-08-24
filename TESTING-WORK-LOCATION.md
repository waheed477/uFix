# 🧪 Work-Location Pinning — Testing Workflow Guide (2026-08-24)

Tariqa 3 hisson me: **(A)** 30-second automated proof → **(B)** manual screenshot-bug reproduction + fix → **(C)** privacy test (area vs exact). Sab kuch live servers par.

---

## 0. Servers (abhi live hain)

| Kya | Port | Note |
|---|---|---|
| Frontend (Vite) | **5173** | Preview window = app |
| Backend (dev-inmemory) | **5000** | Data RAM me — server restart = sab users reset |

> Dev mode pe OTP screen par **amber box me code khud dikh jata hai** (SMS nahi jata) — sign-up 10 second ka hai.
> Provider account dev me **auto-verify** ho jata hai (koi admin approval ka wait nahi).

---

## A. Fast Automated Proof (optional, 30 seconds)

Terminal me:
```bash
cd uFix/backend
node tests/work-location.js    # 17/17 expected
```
Ye suite tumhara **exact screenshot scenario** khud simulate karti hai (Gujranwala city + Okara GPS drift → pin → fix → privacy) — manual testing se pehle confidence ke liye.

---

## B. MANUAL: Screenshot Bug Reproduce Karo, Phir Fix Dekho

### Setup
1. Preview (:5173) **2 windows** me kholo — ek normal, ek **Incognito** (dono alag users banenge).
2. Dono me **F12** (DevTools) kholo → phone icon (**Ctrl+Shift+M**) → size **375×812** select karo (mobile viewport).
3. GPS control ke liye: DevTools me **Ctrl+Shift+P** → type **"Sensors"** → Enter.
   - **Location: Custom** → **Add location**:
     - Name: `Okara Drift` · Lat `31.3709` · Lng `73.0336`  ← tumhare screenshot wale coords
     - Name: `Gujranwala` · Lat `32.1877` · Lng `74.1945`

### Step B1 — Bug reproduce (screenshot state)
1. **Provider window**: sign up (phone `+923401111111`) → role **Provider** → city **Gujranwala** → Plumber setup → online toggle ON.
2. DevTools Sensors me `Okara Drift` select karo (GPS ab "jhoot bol raha" = screenshot state).
3. **Customer window**: sign up (`+923402222222`) → city **Gujranwala** → sensors me `Gujranwala` → **New Request** bhejo (Plumber, description likh ke).
4. Provider window par dekho:
   - ✅ **EXPECTED (naya behavior)**: amber banner — **"⚠️ Aap ka GPS Gujranwala se ~180 km door lag raha hai"** + purple button.
   - Cards par "Distance unavailable" — *pehle ye silently hota tha, ab reason samajh aa rahi hai.*

### Step B2 — Fix: Map par pin lagao
1. Banner ke button se (ya bottom tab se) **Profile** kholо → **"🗺️ Work location"** card.
2. **"📌 Set on map"** dabao → map khule ga. **City: Gujranwala** select karo → map Gujranwala pe zoom hoga.
3. Apni shop wali jagah **tap** karo (ya pin drag karo) → **"Save pinned location"**.
4. Profile card dekho: chip ab **"📌 Pinned by you"** (green) + coords naye dikh rahe.
5. **Home tab** par wapas jao → **Refresh** dabao:
   - ✅ **EXPECTED**: banner gaya, request card par **sahi distance** (e.g. `📍 3.2 km · ~11 min`).
6. Ab Sensors me `Okara Drift` hi rakho — **GPS ab bhi ghalat hai lekin distances theek hain** = manual pin GPS par win kar gaya. (Live-proof.)

### Step B3 — Customer side bhi check
1. Customer window → **Available Providers** (ya offer milte hi card):
   - ✅ Provider ki distance bhi **pin se sahi** dikhe gi (`~3.2 km`).
2. Provider offer bhejo → customer accept karo:
   - ✅ Active Job me **exact customer location + live map** unlock (post-acceptance).

---

## C. Privacy Test (Area vs Exact) — 2 minute

| Stage | Provider ko kya dikhta hai | Kyun |
|---|---|---|
| Offer bhejne se **pehle** | Sirf **area name** ("Satellite Town") + distance. API bhi sirf **~400m rounded** coords deti hai | Stalking/cherry-picking proof |
| Accept ke **baad** | **Exact pin + live tracking** dono taraf | Kaam ke liye zaroori, contract ka part |

Check karne ka tariqa: provider window me request card dekho — area text hai, exact **gali/ghar ka address accept se pehle kahin nahi dikhta**. Accept ke baad Active Job screen par exact map khul jata hai.

## D. Unpin Test ("Use my live GPS")
1. Provider Profile → **"📡 Use live GPS"** dabao → GPS permission allow.
2. Sensors me `Okara Drift` ho to city auto nearest-listed banegi → chip wapas **"📡 Live GPS (auto)"**.
3. ✅ Pin clear — silent background GPS sync pin kabhi clear **nahi** karti; sirf YE button karta hai (by design).

---

## ⚡ Quick Expectation Table

| Test | Pass condition |
|---|---|
| B1 | Amber banner + reason visible (silent nahi) |
| B2 | Pin ke baad banner gaya, distance sahi, ghalat GPS ka koi asar nahi |
| B3 | Customer side distance = pin se computed; post-accept exact map |
| C | Pre-accept: area-only (text), post-accept: exact map |
| D | Unpin ke baad chip "📡 Live GPS (auto)" |

## 🔧 Troubleshooting
- **Map par tiles nahi dikh rahi (grey grid)?** Sandbox preview me external network block hai — pin/tap phir bhi kaam karta hai; real browser/deployment me tiles aa jati hain.
- **"Distance unavailable" ab bhi?** Provider ka GPS + city dono check karo (Sensors) — pin nahi lagaya to banner batayega kyun.
- **Request nahi dikh rahi?** Provider online? same city? category same? (plumber ↔ plumber) Backend restart hua to users dobara banana honge (in-memory DB).
- **Aap Gojra me ho:** "Use my live GPS" Gojra ko nearest listed city (Jhang/Faisalabad) se map karega — deterministic test ke liye Sensors override hi use karo.

---
*Run order tip: pehle A (automated 17/17), phir B1→B2 (hero demo), phir C (privacy), phir D.*
