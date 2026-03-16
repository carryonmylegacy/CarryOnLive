# CarryOn Infrastructure & Integration Audit
## Date: March 15, 2026
## Status: COMPLETE — All integrations verified

---

## PRODUCTION ARCHITECTURE

| Layer | Service | Plan | URL |
|---|---|---|---|
| Frontend | Vercel | Pro | app.carryon.us |
| Backend | Railway | Pro | carryon-api-production.up.railway.app |
| Database | MongoDB Atlas | M10 (Dedicated) | AWS / N. Virginia (us-east-1) |
| File Storage | AWS S3 | Pay-as-you-go | carryon-vault / us-east-2 |

---

## ALL INTEGRATIONS — VERIFIED

### 1. RAILWAY (Backend Hosting)
- **Plan:** Pro ($20/mo base, includes $20 free usage)
- **Resource Limits:** 32 vCPU / 32 GB RAM (plan max)
- **Region:** US East (Virginia)
- **Replicas:** 1
- **Billing History:**
  - Mar 2026: $9.46
  - Feb 2026: $5.00
  - Jan 2026: $0.00
  - Dec 2025: $20.00
  - Nov 2025: $15.00
  - Oct 2025: $20.00
- **Average monthly cost: ~$12/mo** (the $20 free credit covers most usage)
- **Scales to 10K?** YES — Railway Pro auto-scales. Cost will increase with load but the plan supports it. Expect ~$50-80/mo at 10K users.

### 2. VERCEL (Frontend Hosting)
- **Plan:** Pro ($20/mo base, includes $20 credit)
- **Current cycle (with 11 days remaining):**
  - Included Credit: $20/$20 (fully used)
  - On-Demand Charges: $115.20
  - Build Minutes Total: $135.20
- **ALERT:** You're spending ~$135/mo on Vercel, mostly on BUILD MINUTES. Every GitHub push from Emergent triggers a full Vercel rebuild. This is your highest unexpected cost.
- **Scales to 10K?** YES — Vercel handles static frontend serving very well. But build costs need optimization.
- **Cost reduction options:**
  1. Reduce unnecessary builds (only deploy from production branch)
  2. Consider Vercel's build minute add-on packages for better rates
  3. Use "Ignored Build Step" setting to skip builds when only backend files change

### 3. MONGODB ATLAS (Database)
- **Plan:** M10 (Dedicated) — $57/mo
- **Cluster:** CarryOnPreBeta
- **Specs:** 2 GB RAM, 2 vCPU, 10 GB storage
- **Current Usage:** 2.21 GB / 10 GB (22%), ~95 connections
- **Version:** MongoDB 8.0.20, Replica Set (3 nodes)
- **Region:** AWS / N. Virginia (us-east-1)
- **Backups:** Active
- **Scales to 10K?** NO.
  - 2 GB RAM will cause slow queries under concurrent load
  - 10 GB storage will fill up with documents, photos metadata, audit logs
  - **Upgrade to M30 ($394/mo)** before reaching ~1,000 active users
  - **Upgrade to M40 ($759/mo)** at 10K-25K users

### 4. RESEND (Transactional Email)
- **Plan:** Transactional Pro — $20/mo
- **Limit:** 50,000 emails/month
- **Renewal:** March 30, 2026
- **Scales to 10K?** NO — will hit ceiling around 5,000 users.
  - Daily billing reminders + weekly digests + trial reminders + OTPs = 50K+ emails/mo at scale
  - **Upgrade to Scale ($90/mo, 100K emails)** before 5K users
  - Overage: $0.90 per 1,000 extra emails

### 5. xAI GROK (Estate Guardian AI)
- **Plan:** No credits purchased (fresh console setup)
- **Models configured:** Grok-4 (main) + Grok-3-mini (light/keepalive)
- **API Key:** Active in backend
- **Current cost:** $0/mo
- **Scales to 10K?** BLOCKED — no credits means AI won't work for real users.
  - **Grok-4 pricing:** $3.00/1M input tokens, $15.00/1M output tokens
  - At 10% user adoption (1K daily conversations): ~$650/mo
  - At 25% adoption: ~$1,600/mo
  - **ACTION REQUIRED:** Purchase credits at https://console.x.ai

### 6. STRIPE (Payment Processing — Web/Android)
- **Plan:** Standard (no monthly fee)
- **Key type:** Live (sk_live_...)
- **Cost:** 2.9% + $0.30 per transaction
- **At 10K subscribers × ~$8/mo avg:** ~$80K/mo revenue → ~$5,300/mo in fees
- **Scales to 10K?** YES — no changes needed.

### 7. APPLE APP STORE / STOREKIT 2 (iOS In-App Purchases)
- **Plan:** Apple Developer Program ($99/year)
- **Commission:** 15% (Small Business Program, <$1M/year) or 30% (>$1M)
- **Shared Secret:** Configured for server-to-server notifications
- **At 10K iOS subscribers × $8/mo:** ~$960K/year → 15% = ~$12,000/mo
- **Scales to 10K?** YES — no changes needed.

### 8. AWS S3 (Document & Photo Storage)
- **Plan:** Standard pay-as-you-go
- **Bucket:** carryon-vault (us-east-2)
- **Features:** SSE-S3 encryption (on top of app-layer AES-256-GCM)
- **Current cost:** ~$5/mo (estimated)
- **At 10K users (est. 500GB):** ~$57/mo
- **Scales to 10K?** YES — S3 is virtually unlimited.

### 9. TWILIO (SMS/OTP)
- **Plan:** Standard pay-as-you-go
- **Status:** INACTIVE — blocked on A2P 10DLC registration
- **Credentials:** Configured but not functional
- **When activated (10K users):** ~$159/mo (20K SMS/mo × $0.0079 + $1 phone number)
- **Scales to 10K?** YES once A2P is approved.

### 10. GOOGLE PLACES API (Address Autocomplete)
- **Plan:** Standard Google Cloud (pay-as-you-go + $200/mo free credit)
- **Usage:** REST-based autocomplete (no session tokens)
- **Current cost:** ~$0/mo (within free credit)
- **At 10K users:** ~$0-50/mo (low-frequency usage, covered by credit)
- **Scales to 10K?** YES.

### 11. WEB PUSH NOTIFICATIONS (VAPID/pywebpush)
- **Plan:** Self-hosted (no external service)
- **Cost:** $0/mo forever
- **Scales to 10K?** YES.

### 12. WEBAUTHN / FIDO2 (Passkey Authentication)
- **Plan:** Self-hosted (py-webauthn library)
- **Cost:** $0/mo forever
- **Scales to 10K?** YES.

### 13. CAPACITOR (Native iOS/Android Wrapper)
- **Plan:** Open source (free)
- **Plugins:** Camera, Biometrics, Push, Share, Filesystem
- **Cost:** $0/mo
- **Scales to 10K?** YES.

### 14. CAPGO (Live OTA Updates)
- **Status:** NOT SET UP — library installed in code but no account exists
- **Impact:** Every code change requires full App Store review/submission
- **If wanted:** Maker plan ($33/mo) for up to 10K MAU
- **Decision needed:** Sign up or remove unused code

### 15. VOICE BIOMETRICS (librosa/scipy/numpy)
- **Plan:** Self-hosted, open-source libraries
- **Cost:** $0/mo (CPU cost absorbed by Railway)
- **Note:** CPU-intensive; Railway auto-scales to handle load
- **Scales to 10K?** YES (Railway handles compute).

### 16. PDF TOOLS (fpdf2, pdfplumber, Pillow)
- **Plan:** Self-hosted, open-source
- **Cost:** $0/mo
- **Scales to 10K?** YES.

### 17. EMERGENT INTEGRATIONS (Stripe Checkout helper)
- **Plan:** Bundled with Emergent platform
- **Cost:** $0 additional
- **Scales to 10K?** YES.

---

## COST SUMMARY

### Current Monthly Spend (Verified)

| Service | Monthly Cost |
|---|---|
| Railway (Backend) | ~$12/mo (avg, after $20 credit) |
| Vercel (Frontend) | ~$135/mo (high due to build minutes) |
| MongoDB Atlas M10 | $57/mo |
| Resend Pro | $20/mo |
| xAI Grok | $0/mo (no credits) |
| AWS S3 | ~$5/mo |
| Apple Developer | $8/mo ($99/yr) |
| Stripe | $0/mo base |
| Twilio | $0/mo (inactive) |
| Google Places | $0/mo (within credit) |
| All self-hosted | $0/mo |
| **TOTAL** | **~$237/mo** |

### Projected Cost at 10,000 Subscribers

| Service | Monthly Cost | Change Needed |
|---|---|---|
| Railway | ~$50-80/mo | No action — auto-scales |
| Vercel | ~$135-200/mo | Optimize build minutes |
| MongoDB Atlas M30 | $394/mo | UPGRADE REQUIRED before 1K users |
| Resend Scale | $90/mo | UPGRADE REQUIRED before 5K users |
| xAI Grok | ~$650/mo | BUY CREDITS NOW |
| AWS S3 | ~$57/mo | No action |
| Apple Developer | $8/mo | No action |
| Twilio (when active) | ~$159/mo | Activate after A2P approval |
| Google Places | ~$0-50/mo | No action |
| Capgo (if wanted) | $33/mo | Optional |
| **INFRASTRUCTURE TOTAL** | **~$1,575-1,700/mo** | |

### Revenue-Based Costs (Not Infrastructure)

| Service | At 10K Subscribers |
|---|---|
| Stripe (2.9% + $0.30) | ~$5,300/mo |
| Apple IAP (15%) | ~$12,000/mo |
| **Revenue costs** | **~$17,300/mo** |

---

## SCALING MILESTONES — WHEN TO ACT

| Milestone | Actions Required |
|---|---|
| NOW (pre-launch) | Buy xAI credits, optimize Vercel builds |
| 500 users | Monitor MongoDB performance closely |
| 1,000 users | Upgrade MongoDB M10 → M30 |
| 2,500 users | Monitor Resend email volume |
| 5,000 users | Upgrade Resend Pro → Scale |
| 10,000 users | Consider MongoDB M40, monitor Railway costs |
| $1M annual iOS revenue | Apple commission jumps from 15% → 30% |

---

## CRITICAL ISSUES (Must Fix Before Launch)

1. **xAI Grok has no credits** — Estate Guardian AI will fail for real users
2. **Vercel build costs are high** — $135/mo mostly from build minutes; optimize deployment triggers
3. **MongoDB M10 is entry-level** — adequate for launch but must upgrade early

## DECISIONS NEEDED

1. **Capgo:** Sign up for OTA updates ($33/mo) or remove unused code?
2. **Vercel builds:** Want me to investigate reducing build costs?
