# Railway: Install Chromium for /render-pdf Endpoint

## Status After Today's Fix (May 19, 2026)
- Backend boots cleanly on Railway even without Chromium ✓
- All other features work as expected ✓
- `POST /api/financial/entities/<id>/render-pdf` returns **503**: 
  *"PDF render service is not fully configured on this pod (Chromium binary missing)."*
- E&S "Refresh" pill in the Binder modal will alert the user with that 503 message
  on production until Chromium is installed.
- On the **preview pod** Chromium IS installed → Refresh works perfectly there.

## To Enable Server-Side E&S Render on Production

You have two paths:

### Option 1 — Add a Nixpacks build hook (simplest)
Edit `/app/railway.toml`:

```toml
[build]
builder = "nixpacks"

[build.nixpacks]
plan_path = "backend"
aptPkgs = ["ffmpeg", "libsndfile1", "curl", "fonts-liberation", "fontconfig"]

# NEW: install Chromium for Playwright after pip install completes
[build.nixpacks.phases.install]
cmds = [
    "pip install -r requirements.txt",
    "playwright install --with-deps chromium"
]

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
```

**Caveats:**
- Adds ~2-3 min to build time (Chromium binary is ~150 MB).
- `--with-deps` tries `apt-get install` of GTK/font libs — usually works on
  Nixpacks Ubuntu base, but may need additional `aptPkgs` if Playwright
  complains about missing libs (libnss3, libatk-bridge2.0-0, libxss1, etc.).
- Adds ~250 MB to the final image — confirm your Railway plan has room.

### Option 2 — Custom Dockerfile (most control)
Replace Nixpacks with a `backend/Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

And in `railway.toml`:
```toml
[build]
builder = "dockerfile"
dockerfilePath = "backend/Dockerfile"
```

The Microsoft Playwright image ships with Chromium + every system dep
pre-installed. Build will be faster (no Chromium download step) and
deterministic.

### Verification After Either Path
After deploy goes green, hit:
```
curl -X POST -H "Authorization: Bearer <token>" \
  https://app.carryon.us/api/financial/entities/<estate_id>/render-pdf
```
Expected: 200 with `{"ok":true,"size_bytes":>5000,"source":"server_render"}`

## When To Do This
Post-pitch. The current 503 is graceful; users won't crash. They can still
generate E&S PDFs via the browser's native `window.print()` (the toolbar
Print button on /print/entities) — that's been working forever.
