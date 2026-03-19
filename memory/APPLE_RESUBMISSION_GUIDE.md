# CarryOn iOS App — Apple App Store Resubmission Guide

**Why you were rejected:** Apple Guideline 3.1.1 — your Subscribe buttons were going to Stripe instead of Apple In-App Purchase. The code fix is already done (iOS now blocks Stripe entirely). You just need to verify a few things in Apple's portals and push to GitHub.

---

## STEP 1: Verify In-App Purchase is Enabled on Your App ID

This is the most likely root cause — if IAP isn't enabled on the App ID, StoreKit can't initialize, and the app falls back to showing an error instead of Stripe (with the new code fix).

1. Open your browser and go to: **https://developer.apple.com/account**
2. Sign in with your Apple Developer account
3. In the left sidebar, click **"Certificates, Identifiers & Profiles"**
4. Click **"Identifiers"** in the left sidebar
5. Find and click on **"us.carryon.app"** (your app's Bundle ID)
6. Scroll down the list of capabilities
7. Find **"In-App Purchase"** — it should have a checkmark next to it
   - If it does NOT have a checkmark: **check the box**, then click **"Save"** at the top right
   - If it already has a checkmark: you're good, move to Step 2
8. If you made any changes, Apple may ask you to regenerate your provisioning profile — click **"Confirm"** if prompted

**Why this matters:** Without this capability enabled, the StoreKit framework can't talk to Apple's servers, so `isBillingSupported()` returns false, and your app can't offer IAP.

---

## STEP 2: Verify Your 38 Subscription Products in App Store Connect

Your subscription tiers are already created — you don't need to redo them. But you need to make sure they're in the right state.

1. Go to: **https://appstoreconnect.apple.com**
2. Click on **"My Apps"** → select **"CarryOn"**
3. In the left sidebar, click **"Subscriptions"** (under "Features" or "In-App Purchases" depending on your view)
4. You should see your subscription groups listed
5. Click into each subscription group and verify that each product shows one of these statuses:
   - **"Ready to Submit"** — this is what you want
   - **"Approved"** — also fine (already reviewed)
   - **"Waiting for Review"** — fine (will be reviewed with your app)
   
   If any show **"Missing Metadata"** or **"Developer Action Needed"**:
   - Click on that product
   - Fill in any missing fields (usually: display name, description, or screenshot)
   - Each subscription needs at least one **localization** (English) with a display name and description
   - Save your changes

6. Make sure every subscription has a **price** set:
   - Click on the subscription → "Subscription Prices" section
   - Verify a price tier is selected (e.g., $9.99/month)

**Important:** The product IDs in App Store Connect must EXACTLY match what's in the code. Your code uses IDs like:
- `us.carryon.app.premium_monthly`
- `us.carryon.app.ben_standard_annual`
- etc.

Verify these match by comparing with the full list in your codebase at `frontend/src/services/iap.js`.

---

## STEP 3: Check Your Review Information in App Store Connect

Since Apple needs to TEST your IAP during review, you need to give them a test account.

1. In App Store Connect, go to **"My Apps"** → **"CarryOn"**
2. Click on the **app version** that was rejected (should be version 1.0)
3. Scroll down to **"App Review Information"** section
4. Make sure you have filled in:
   - **Sign-in required:** Yes
   - **Username:** A test account email (e.g., `info@carryon.us`)
   - **Password:** The password for that account (e.g., `Demo1234!`)
   - **Notes:** Add a note like:
     > "To test In-App Purchase: Sign in with the provided credentials. Navigate to Settings (hamburger menu → Settings) and scroll to the Subscription section. Tap any 'Subscribe' button to initiate an Apple In-App Purchase. The app uses StoreKit 2 for all subscription purchases on iOS — no external payment methods are presented."

5. **Review Contact Information** — make sure your phone number and email are current so Apple can reach you if they have questions

---

## STEP 4: Set Up a Sandbox Test Account (For YOUR Testing)

Before submitting, you should test IAP yourself using Apple's sandbox.

1. In App Store Connect, click **"Users and Access"** (top navigation)
2. Click **"Sandbox"** tab (top of page)
3. Click the **"+"** button to create a sandbox tester account
4. Fill in:
   - First Name, Last Name: anything (e.g., "Test User")
   - Email: use a REAL email you have access to (it can't be your Apple ID email). Apple sends a verification email.
   - Password: something you'll remember
   - App Store Territory: United States
5. Click **"Create"**
6. Check your email and verify the sandbox account

**To test on your physical iPhone:**
1. Go to **Settings → App Store → Sandbox Account** (at the very bottom)
2. Sign in with your sandbox tester credentials
3. Open CarryOn on your phone
4. Try subscribing — it should show Apple's payment sheet with "[Environment: Sandbox]" at the top
5. The sandbox won't charge real money

---

## STEP 5: Push Your Code to GitHub

The code fixes are already done. You just need to push to GitHub which will trigger CodeMagic.

1. In the Emergent chat, use the **"Save to GitHub"** button to push your latest changes
2. This push includes:
   - iOS never falls through to Stripe (shows error if IAP unavailable)
   - All payment paths (subscribe, upgrade, change billing) use IAP on iOS
   - Restore Purchases button (Apple requires this)
   - Apple-required subscription disclosure text
   - Font size improvements
   - Family tree color coding fixes

---

## STEP 6: Monitor Your CodeMagic Build

After the GitHub push, CodeMagic will automatically trigger the `ios-build` workflow.

1. Go to: **https://codemagic.io** and sign in
2. Find the **"CarryOn iOS Build"** workflow
3. Watch the build progress — it takes about 15-30 minutes on a Mac Mini M2
4. The key steps to watch for:
   - **"Sync Capacitor"** — should succeed (runs `npx cap sync ios`)
   - **"Install CocoaPods"** — should succeed (installs `CapgoNativePurchases` pod)
   - **"Build iOS app"** — this is where the IPA is created
5. If the build **succeeds**: it will automatically upload to TestFlight (because of `submit_to_testflight: true` in your config)
6. If the build **fails**: check the logs. Common issues:
   - Signing errors → your `CarryOn-ASC-Key` integration or `signing_key.pem` may need updating
   - Pod install fails → clear cache and retry
   - Build errors → check the Xcode build log artifact

---

## STEP 7: Verify the Build on TestFlight

Once CodeMagic uploads to TestFlight, you'll receive an email from Apple saying the build is processing.

1. Wait about 10-30 minutes for Apple to process the build
2. Open **TestFlight** on your iPhone
3. Find **"CarryOn"** and install the latest build
4. Sign in with your regular account
5. Go to Settings → Subscription section
6. Tap **"Subscribe"** on any plan
7. **What you should see:**
   - Apple's native payment sheet appears (NOT a Stripe checkout page)
   - It says "[Environment: Sandbox]" at the top
   - It shows the subscription price and terms
8. You can complete or cancel the purchase — sandbox doesn't charge real money
9. If you see an error toast saying "In-App Purchase is not available" instead of Stripe buttons, that means IAP capability isn't enabled (go back to Step 1)

---

## STEP 8: Submit for App Review

Once you've verified IAP works on TestFlight:

1. Go to **App Store Connect** → **My Apps** → **CarryOn**
2. Click on the **rejected version (1.0)**
3. Since the status is "Rejected," you need to create a **new build submission**:
   - In the "Build" section, click the **"+"** button next to "Build"
   - Select the new build that CodeMagic just uploaded (it'll have a higher build number)
   - Click **"Done"**
4. Review all your metadata:
   - Screenshots — make sure they're still there (they persist across rejections)
   - Description — still there
   - Keywords — still there
   - App Review Information — update the notes (see Step 3 above)
5. In the **"Version Release"** section, choose:
   - "Automatically release this version" (recommended) OR
   - "Manually release this version" (if you want to control the exact release moment)
6. Click **"Save"** at the top right
7. Click **"Add for Review"** (blue button, top right)
8. On the confirmation page, click **"Submit to App Review"**

---

## STEP 9: Wait for Review

- Apple's review typically takes **24-48 hours**, sometimes less
- You'll get an email notification when the review is complete
- Check App Store Connect for the status:
  - **"In Review"** — Apple is looking at it right now
  - **"Approved"** / **"Ready for Distribution"** — you're live!
  - **"Rejected"** — read their feedback and address it (reply in App Store Connect if you need clarification)

---

## Quick Checklist Before You Submit

- [ ] In-App Purchase capability is checked ON for `us.carryon.app` in Apple Developer Portal
- [ ] All 38 subscription products are "Ready to Submit" in App Store Connect
- [ ] All subscription products have prices set
- [ ] All subscription product IDs match the code (check `frontend/src/services/iap.js`)
- [ ] App Review test credentials are filled in (email + password + notes about IAP)
- [ ] Code is pushed to GitHub (Emergent → "Save to GitHub")
- [ ] CodeMagic build succeeded and uploaded to TestFlight
- [ ] You tested IAP on TestFlight with a sandbox account — Apple payment sheet appeared
- [ ] New build is selected in App Store Connect
- [ ] Submitted for review

---

## If Apple Rejects Again

Don't panic. Read their exact feedback carefully and reply in App Store Connect to ask for clarification if needed. Common follow-up issues:
- **"Restore Purchases" missing** — your app already has this button (both in Paywall and Settings)
- **Subscription terms not visible** — your app already shows the Apple-required disclosure text
- **Demo account doesn't work** — make sure the test credentials you provided are valid and the account has trial days remaining
