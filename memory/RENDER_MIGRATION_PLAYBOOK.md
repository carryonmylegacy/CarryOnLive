# CarryOn → Render Migration Playbook

**Goal:** Move the FastAPI backend from Railway (currently down due to a GCP outage) onto Render in ~20 minutes, without touching MongoDB Atlas or S3.

**Files prepped in this commit:**
- `backend/Dockerfile` — Microsoft Playwright base image (Chromium pre-baked, fixes the `/render-pdf` blank-E&S issue too)
- `backend/docker-entrypoint.sh` — materializes the VAPID private key from an env var at boot (key file is gitignored)
- `backend/.dockerignore` — keeps the build context lean + never bakes secrets into image layers
- `render.yaml` — one-click Blueprint with all 27 env vars declared

---

## Step 1: Push these new files to GitHub  (~1 min)

Use Emergent's **Save to GitHub** feature. Make sure the push lands on the `main` branch (that's what `render.yaml` watches).

---

## Step 2: Create the Render service from the Blueprint  (~3 min)

1. Go to https://dashboard.render.com → **New +** (top right) → **Blueprint**.
2. Select your GitHub account → pick the `carryon` (or whatever it's named) repo.
3. Render auto-detects `render.yaml` at repo root → click **Apply**.
4. Render now prompts you for the 23 secret env vars one by one. **Don't sweat it — copy/paste straight from your Railway dashboard's Variables tab.** Open both browser tabs side-by-side.

### Env vars to paste (in order — Render shows you each one):

```
MONGO_URL              ← from Railway → Variables tab
DB_NAME                ← typically "carryon_production" or similar
JWT_SECRET             ← from Railway
ENCRYPTION_KEY         ← from Railway
CORS_ORIGINS           ← from Railway (probably "https://app.carryon.us,https://carryon.us")
FRONTEND_URL           ← from Railway (probably "https://app.carryon.us")

EMERGENT_LLM_KEY       ← from Railway (or get a fresh one from Emergent dashboard)
XAI_API_KEY            ← from Railway
XAI_TEAM_ID            ← from Railway
STRIPE_API_KEY         ← from Railway (sk_live_... if prod)
RESEND_API_KEY         ← from Railway
SENDER_EMAIL           ← typically "team@carryon.us"
TWILIO_ACCOUNT_SID     ← from Railway
TWILIO_AUTH_TOKEN      ← from Railway
TWILIO_PHONE_NUMBER    ← from Railway
APPLE_SHARED_SECRET    ← from Railway (App Store IAP)

AWS_ACCESS_KEY_ID      ← from Railway (Emergent S3 bucket creds)
AWS_SECRET_ACCESS_KEY  ← from Railway

VAPID_PRIVATE_KEY_PEM  ← see Step 3 below
VAPID_PUBLIC_KEY_PEM   ← see Step 3 below
VAPID_CLAIMS_EMAIL     ← typically "mailto:team@carryon.us"

DEMO_REVIEW_EMAIL      ← optional, can leave blank for now
DEMO_REVIEW_OTP        ← optional, can leave blank for now
```

> **Note:** the 4 PUBLIC vars (`PORT`, `VAPID_PRIVATE_KEY_PATH`, `VAPID_PUBLIC_KEY_PATH`, `PYTHONUNBUFFERED`) are auto-filled from the Blueprint — you don't touch those.

---

## Step 3: VAPID keys — paste PEM CONTENTS, not file paths  (~2 min)

Your Railway setup had VAPID keys as files on disk. Render is ephemeral — files don't persist across deploys. The `docker-entrypoint.sh` I wrote materializes the keys from env vars at boot.

**On your local machine** (or wherever you have the key files):

```bash
# Paste the OUTPUT of these into the Render dashboard fields:
cat vapid_private.pem   # → paste into VAPID_PRIVATE_KEY_PEM
cat vapid_public.pem    # → paste into VAPID_PUBLIC_KEY_PEM
```

If you don't have the original files anywhere, you can regenerate (BUT push notifications already issued to users will need to re-subscribe — only do this if you have to):

```bash
openssl ecparam -name prime256v1 -genkey -noout -out vapid_private.pem
openssl ec -in vapid_private.pem -pubout -out vapid_public.pem
```

---

## Step 4: First deploy  (~3-5 min)

Render starts building immediately after you finish pasting env vars. The first build:
- Pulls the Microsoft Playwright image (~250 MB, first time only — cached after)
- `pip install -r requirements.txt`
- Copies the backend source
- Boots `docker-entrypoint.sh` → uvicorn

Watch the **Logs** tab in real time. Success markers:
- `[entrypoint] Materializing VAPID private key to /app/vapid_private.pem`
- `[entrypoint] Starting uvicorn on 0.0.0.0:10000`
- `INFO:     Application startup complete.`
- Render banner flips to **🟢 Live**

If the build fails, scroll the log for the first `ERROR` line — paste it to me and I'll fix it.

---

## Step 5: Smoke test the API  (~1 min)

Render gives you a URL like `https://carryon-api.onrender.com`.

```bash
# 1) Health endpoint should return 200 + JSON
curl -i https://carryon-api.onrender.com/api/health

# 2) Login should work end-to-end (uses MongoDB)
curl -X POST https://carryon-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"info@carryon.us","password":"Demo1234!","force_login":true}'
```

Both should succeed. If health 200 but login fails with a Mongo error, double-check `MONGO_URL` + `DB_NAME` were pasted exactly from Railway.

### Bonus: also test that Playwright works (the original reason we're moving)

```bash
TOKEN=$(curl -s -X POST https://carryon-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"info@carryon.us","password":"Demo1234!","force_login":true}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
ESTATE=$(curl -s -X GET https://carryon-api.onrender.com/api/estates \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print((d if isinstance(d,list) else d.get('estates',[]))[0]['id'])")
curl -X POST "https://carryon-api.onrender.com/api/financial/entities/$ESTATE/render-pdf" \
  -H "Authorization: Bearer $TOKEN" -m 30
```

Should return `{"ok":true,"size_bytes":...,"source":"server_render"}` in ~6 seconds. This is the moment the Estate Binder finally pulls a clean E&S page on production.

---

## Step 6: Point the frontend at Render  (~2 min)

1. Vercel dashboard → your frontend project → **Settings → Environment Variables**.
2. Update `REACT_APP_BACKEND_URL` to your new Render URL (e.g. `https://carryon-api.onrender.com`).
3. **Deployments** tab → ⋮ on latest → **Redeploy**.
4. Wait ~60s for Vercel to rebuild.
5. Open https://app.carryon.us → log in → smoke-test the same Estate Binder flow.

---

## Step 7: (Optional, post-pitch) Move the custom domain  (~10 min)

If you previously had a custom domain on Railway (e.g. `api.carryon.us`), point it at Render:

1. Render service → **Settings → Custom Domains** → **Add Custom Domain** → paste `api.carryon.us` → Render gives you a CNAME target.
2. Your DNS provider (Cloudflare? GoDaddy? wherever your DNS is) → update the `api.carryon.us` CNAME to Render's target.
3. Wait ~60s. Render auto-issues a Let's Encrypt cert.
4. Update Vercel's `REACT_APP_BACKEND_URL` back to `https://api.carryon.us`. Redeploy frontend.

Until you do this, the app works fine via the `.onrender.com` URL — just less branded.

---

## Step 8: (Optional, post-pitch) Tear down Railway

Once you've verified Render works end-to-end:
1. Railway dashboard → carryon-api service → Settings → **Delete Service**.
2. Cancel the Railway subscription if you have one (saves $5–20/mo).

The MongoDB + S3 weren't on Railway, so this only kills the API host.

---

## Rollback plan

If anything goes catastrophically wrong, you can flip back to Railway by:
1. Vercel → revert `REACT_APP_BACKEND_URL` to the Railway URL.
2. Redeploy Vercel.

Render and Railway run in parallel as long as you keep both alive — no destructive cutover happens until you do Step 8.

---

**Time budget:** Steps 1–6 = ~12 minutes total if you're moving fast. You're back on prod for the pitch.
