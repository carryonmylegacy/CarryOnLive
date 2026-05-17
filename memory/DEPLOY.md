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
After `pip install -r requirements.txt`, **also run**:
```
bash /app/scripts/install_emergent.sh
```
This installs `emergentintegrations` from Emergent's private index with
`--no-deps`, so its bundled `openai==1.99.9` pin doesn't override the
patched `openai==2.30.0` / `litellm==1.83.7` in requirements.txt. Without
this step, 4+ litellm CVEs remain unpatched. Idempotent — safe to re-run.

## Important Railway Env Vars
- STRIPE_API_KEY
- RAILWAY_PUBLIC_URL=https://carryon-api-production.up.railway.app
