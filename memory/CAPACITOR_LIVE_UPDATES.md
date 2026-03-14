# Capacitor Live Updates — Post-App Store Approval

## Status: PLANNED (waiting for App Store approval)

## What This Is
After the CarryOn iOS app is approved on the App Store, implement **Capacitor Live Updates** so that web code changes (JS/CSS/HTML) can be pushed to iOS users WITHOUT requiring a new App Store submission.

## Why
Currently, iOS/Capacitor users only get frontend updates when they download a new app version from the App Store. Web users already have auto-update via `/version.json` cache-busting (implemented March 2026). iOS users should have the same experience.

## Current Auto-Update (Web Only)
- **How it works:** Each `yarn build` generates a unique hash in `public/version.json`. On app mount (5s delay), `utils/versionCheck.js` fetches `/version.json` with a cache-busting query. If the hash differs from `localStorage`, it does a hard refresh (once per session).
- **Safety:** sessionStorage guard prevents infinite refresh loops. All failures are silent.
- **Files:** `frontend/src/utils/versionCheck.js`, `frontend/src/App.js` (line ~352), `frontend/package.json` (build script)

## Implementation Plan for Capacitor Live Updates

### Option A: Capgo (already partially integrated)
The app already imports `@capgo/capacitor-updater` in `App.js` and calls `CapacitorUpdater.notifyAppReady()`. To enable live updates:
1. Create a Capgo account and get the API key
2. Set the channel (production/staging)
3. Configure `capacitor.config.ts` with the Capgo plugin settings
4. After each web build, run `npx @capgo/cli upload` to push the bundle
5. The Capgo SDK in the app will detect and download the new bundle on next launch

### Option B: Appflow (Ionic's official solution)
1. Set up Ionic Appflow account
2. Connect to GitHub repo
3. Configure deploy channels
4. SDK handles OTA updates

### Key Considerations
- **Apple Guidelines:** OTA updates of web content in a WebView are allowed. You CANNOT change native code (Swift/Objective-C) via OTA — only web assets.
- **Rollback:** Both Capgo and Appflow support rollback if a bad update is pushed
- **Testing:** Push to a staging channel first, verify on a test device, then promote to production
- **User Experience:** Updates happen silently in the background. On next app launch, the new version loads.

## Files to Modify
- `frontend/capacitor.config.ts` — Add live update plugin config
- `frontend/src/App.js` — Already has `CapacitorUpdater.notifyAppReady()`, may need channel config
- CI/CD pipeline — Add `npx @capgo/cli upload` step after build

## Priority
P1 — Implement immediately after App Store approval to close the iOS update gap.
