# CarryOn Share Extension — Xcode Setup Guide

## What's Done (Code Side)
- `ShareViewController.swift` — Full Share Extension with category picker UI (CarryOn dark theme, gold accents)
- `Info.plist` — Configured for files (PDFs, images, Word, Excel) up to 5 at a time
- `ShareExtension.entitlements` — App Group `group.us.carryon.app` configured
- `App.entitlements` — Main app already has the matching App Group
- `Info.plist` (main app) — `carryon://` URL scheme registered
- `useShareTarget.js` — Frontend handler that picks up shared files and uploads to SDV

## What You Need to Do in Xcode

### Step 1: Add the Share Extension Target
1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the **App** project in the navigator (blue icon, top of file list)
3. Click **+** at bottom of the targets list → **Share Extension**
4. Name it: `ShareExtension`
5. Bundle ID: `us.carryon.app.ShareExtension`
6. Language: **Swift**
7. When prompted "Activate ShareExtension scheme?", click **Activate**

### Step 2: Replace Generated Files
Xcode will create template files. **Delete them** and use our existing ones:
1. In the ShareExtension group, delete the auto-generated `ShareViewController.swift` and `Info.plist`
2. Right-click the ShareExtension group → **Add Files to "App"**
3. Add these files from `ios/App/ShareExtension/`:
   - `ShareViewController.swift`
   - `Info.plist`
   - `ShareExtension.entitlements`

### Step 3: Configure Signing & Entitlements
1. Select the **ShareExtension** target
2. **Signing & Capabilities** tab:
   - Team: Select your Apple Developer team
   - Bundle ID: `us.carryon.app.ShareExtension`
3. Click **+ Capability** → Add **App Groups**
   - Add: `group.us.carryon.app`
4. Verify the **ShareExtension.entitlements** file is set in Build Settings → Code Signing Entitlements

### Step 4: Verify Main App Has Matching App Group
1. Select the **App** target (main app)
2. **Signing & Capabilities** tab
3. Verify **App Groups** capability exists with `group.us.carryon.app`
4. If not, add it (+ Capability → App Groups → `group.us.carryon.app`)

### Step 5: Set Deployment Target
1. Select **ShareExtension** target → General
2. Set **Minimum Deployments** to match your main app (e.g., iOS 16.0)

### Step 6: Build & Test
1. Select the **ShareExtension** scheme in the toolbar
2. Build (Cmd+B) to verify no compile errors
3. To test:
   - Run the main **App** scheme on your device
   - Open Files/Mail/Safari on the device
   - Tap Share on any PDF/image
   - "CarryOn Vault" should appear in the share sheet
   - Select a category → "Save to Vault"
   - Open CarryOn app → the file should appear in the upload modal

### Step 7: App Store Connect
1. In App Store Connect → your app → **App Information**
2. The Share Extension is bundled inside the main app binary — no separate submission needed
3. Just rebuild and submit a new version

## macOS Support
The same Share Extension works on macOS if you build with Mac Catalyst or have a macOS target. The Swift code is cross-platform. For a macOS-native app, you'd need a separate macOS Share Extension target with the same code.

## Troubleshooting
- **"CarryOn Vault" not in share sheet**: Make sure the extension's Info.plist `NSExtensionActivationRule` matches the file type. Restart the device.
- **Signing errors**: The extension must use the same team as the main app. Create a separate provisioning profile for `us.carryon.app.ShareExtension`.
- **App Group errors**: Both the main app AND the extension must have the same App Group ID in their entitlements AND in the Apple Developer portal.
