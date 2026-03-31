# CarryOn — Google Play Launch Checklist

## Status: Ready to build. Needs account setup only.

Your Android project, CodeMagic build pipeline, and auto-publishing are already configured.
Below are the steps YOU need to complete (in order).

---

## Step 1: Google Play Developer Account
**Time: 10 minutes | Cost: $25 one-time**

1. Go to [https://play.google.com/console/signup](https://play.google.com/console/signup)
2. Sign in with your Google account (use a business one if you have it)
3. Pay the $25 registration fee
4. Complete identity verification (may take 1-3 business days)

---

## Step 2: Create the App in Google Play Console
**Time: 15 minutes**

1. In Play Console → **Create app**
2. Fill in:
   - **App name**: `CarryOn — Estate Readiness`
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free (you monetize via in-app subscriptions)
3. Accept the declarations and click **Create app**

---

## Step 3: Store Listing
**Time: 30 minutes**

Go to **Grow → Store presence → Main store listing**:

**Short description** (80 chars max):
```
Secure estate planning for every American family. Plan. Protect. Be ready.
```

**Full description** (4000 chars max):
```
CarryOn™ is a secure estate readiness platform built for modern families.

Whether you're a first responder, a military service member, a parent, or anyone who wants to make sure their family is prepared — CarryOn helps you organize, protect, and communicate what matters most.

FEATURES:
• Encrypted Document Vault — AES-256 per-estate encryption. Your data is never accessed by our team.
• Milestone Messages — Record written, voice, or video messages for life's biggest moments. Weddings, graduations, birthdays, first homes. Delivered when your beneficiary reports the milestone.
• Estate Guardian™ AI — Analyzes your documents within your encrypted vault. Identifies gaps, suggests actions, keeps your estate current.
• Guided Checklist — Step-by-step estate readiness tasks. Track completion, assign priority, add notes.
• Beneficiary Management — Designate who gets what. Add contact info, relationships, and specific asset assignments.
• Family Plan — Link family members. Share readiness status. Stay coordinated.
• Two-Factor Authentication — Every login, every time. With a daily trust option for convenience.
• Transition Verification — When the time comes, a human team verifies the transition. Not an algorithm.

SECURITY:
• AES-256 per-estate encryption
• SOC 2 compliance (in progress)
• Two-factor authentication on every login
• Post-execution record destruction (DTS)
• No data selling. No ads. Ever.

FREE FOR HOSPICE:
CarryOn is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions.

Built by a United Airlines pilot and father of two. Because every family deserves to be ready.
```

**Screenshots**: You need at minimum:
- 2 phone screenshots (1080x1920 or similar)
- Take screenshots of your app on an Android device or emulator:
  1. Login/home screen
  2. Dashboard
  3. Document vault
  4. Milestone messages
  5. Checklist

**Feature Graphic** (1024x500): 
- A banner image. Use the CarryOn logo on navy (#0F1629) background with the tagline.

**App Icon**: Already configured in your Android project (512x512 `ic_launcher-playstore.png`)

---

## Step 4: Content Rating
**Time: 5 minutes**

Go to **Policy → App content → Content rating**:
- Start the IARC questionnaire
- Your app has NO violence, NO sexual content, NO gambling
- It DOES collect personal information (names, emails, documents)
- You'll likely get an **Everyone** rating

---

## Step 5: Privacy Policy
**Time: 5 minutes**

Go to **Policy → App content → Privacy policy**:
- Enter your privacy policy URL (you likely already have one at carryon.us/privacy or similar)
- If you don't have one, you need to create one (required by Google)

---

## Step 6: Data Safety
**Time: 15 minutes**

Go to **Policy → App content → Data safety**:
Answer honestly:
- **Does your app collect or share data?** Yes
- **Data types collected**: Name, email, phone, documents/files, photos
- **Is data encrypted in transit?** Yes (HTTPS)
- **Is data encrypted at rest?** Yes (AES-256)
- **Can users request data deletion?** Yes (you have DTS)
- **Is data shared with third parties?** No (except payment processor)

---

## Step 7: Signing Key Setup in CodeMagic
**Time: 10 minutes**

Your `codemagic.yaml` already references `carryon_keystore`. You need to create it:

1. **Generate a keystore** (run this on your Mac terminal):
   ```bash
   keytool -genkey -v -keystore carryon-release.keystore -alias carryon -keyalg RSA -keysize 2048 -validity 10000
   ```
   - Enter a secure password (SAVE THIS — you can never change it)
   - Fill in: Your name, CarryOn, Arlington, VA, US

2. **Upload to CodeMagic**:
   - Go to [codemagic.io](https://codemagic.io) → Your CarryOn app → Settings
   - Under **Android code signing** → Add keystore
   - Reference name: `carryon_keystore`
   - Upload the `.keystore` file
   - Enter the keystore password, key alias (`carryon`), and key password

**IMPORTANT**: Save the keystore file and passwords somewhere safe (1Password, etc.). If you lose them, you can never update the app on Google Play.

---

## Step 8: Google Play API Access (for auto-publishing)
**Time: 15 minutes**

Your CodeMagic config uses `$GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` for auto-publishing:

1. Go to **Google Play Console → Setup → API access**
2. Link to a Google Cloud project (or create one)
3. Create a **Service Account** with "Release Manager" permissions
4. Download the JSON key file
5. In **CodeMagic → Environment Variables**, add:
   - Key: `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`
   - Value: paste the entire JSON content
   - Group: make it available to the android-build workflow

---

## Step 9: Firebase (Push Notifications)
**Time: 10 minutes**

Your Android project needs `google-services.json` for push notifications:

1. Go to [Firebase Console](https://console.firebase.google.com) → Your CarryOn project
2. Click **Project Settings → General**
3. Under **Your apps**, click **Add app → Android**
4. Package name: `us.carryon.app`
5. Download `google-services.json`
6. Place it at `frontend/android/app/google-services.json`
7. Commit to your repo

---

## Step 10: Build & Submit
**Time: 5 minutes (then ~30 min build)**

1. Push your code to the `main` branch
2. In CodeMagic, trigger the **CarryOn Android Build** workflow
3. CodeMagic will:
   - Build the web app
   - Sync Capacitor
   - Build the signed APK and AAB
   - Auto-publish to Google Play **internal testing** track

4. In Google Play Console:
   - Go to **Testing → Internal testing**
   - You'll see the uploaded build
   - Add yourself as a tester
   - Test the app

5. When ready:
   - Promote from Internal → Production
   - Google review takes 1-7 days (first app reviews take longer)

---

## Payments: Stripe vs Google Play Billing

Your app currently uses Stripe for web payments. On Android, you have two options:

**Option A: Stripe only (recommended to start)**
- Your existing Stripe checkout works in the Android WebView
- No Google Play 15-30% commission
- No additional code needed
- Google technically requires Play Billing for digital goods, but many apps use web checkout

**Option B: Google Play Billing**
- Required if Google enforces their billing policy on your app
- 15% commission (first $1M/year), then 30%
- Requires implementing the Google Play Billing library
- Can be added later if needed

**Recommendation**: Launch with Stripe web checkout. Add Google Play Billing only if Google requires it during review.

---

## Timeline

| Step | Time | Depends on |
|------|------|------------|
| Developer Account | 10 min + 1-3 day verification | Nothing |
| Store Listing | 30 min | Account verified |
| Content/Privacy/Safety | 25 min | Account verified |
| Signing Key | 10 min | Nothing |
| CodeMagic Setup | 15 min | Signing key |
| Firebase google-services.json | 10 min | Nothing |
| Build & Submit | 5 min + 30 min build | Everything above |
| Google Review | 1-7 days | Submitted |

**Total active work: ~2 hours**
**Total calendar time: ~1-2 weeks** (mostly waiting for account verification and app review)

---

## What Your Chief of Staff Can Do

Steps 1-6 (account, listing, content rating, privacy, data safety) can all be done by your CoS. They just need your Google account credentials and the listing copy above. You only need to personally handle Steps 7-8 (signing key and API credentials).
