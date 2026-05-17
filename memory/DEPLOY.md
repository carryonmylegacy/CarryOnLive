# Deployment Info

## Vercel Deploy Hook
URL: https://api.vercel.com/v1/integrations/deploy/prj_YBUIgzUpA79O86xoS488fQ992UvW/BGys5cUdbR
Method: POST
Branch: main

## Railway Backend
URL: https://carryon-api-production.up.railway.app

## Workflow
1. User pushes to GitHub ("Save to GitHub")
2. Agent triggers deploy: `curl -X POST <deploy hook URL>`
3. Vercel builds and deploys to app.carryon.us

## Backend Install (Railway)
Railway uses nixpacks auto-detection — no custom `nixpacks.toml`. `pip install -r requirements.txt` handles everything including `emergentintegrations==0.1.2` via the `--extra-index-url` line at the top of requirements.txt.

⚠️ **Do NOT add a custom `backend/nixpacks.toml` that overrides `[phases.install]`** — doing so bypasses nixpacks' Python venv setup and the build will fail with `exit code 127: command not found` when looking for `pip`. (We tried this Feb 12, 2026; reverted.)

## Important Railway Env Vars
- STRIPE_API_KEY
- RAILWAY_PUBLIC_URL=https://carryon-api-production.up.railway.app
