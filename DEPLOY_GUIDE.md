# CarryOn™ — How to Launch Your App (Plain English)

This guide walks you through launching CarryOn™ on the internet, step by step. No coding knowledge needed.

You'll need about **30-45 minutes** and a credit card (for free-tier signups — you won't be charged).

---

## What You're Setting Up

Think of it like launching a restaurant:
- **Render** = the building where your app lives (free to start)
- **MongoDB Atlas** = the filing cabinet where user data is stored (free tier)
- **Grok (xAI)** = the Estate Guardian AI brain (you need an API key)
- **Your domain** (carryon.us) = the sign on the door

---

## STEP 1: Get Your Database Ready (MongoDB Atlas)

This is where all your user accounts, documents, and estate data will be stored.

### 1a. Create an Account
1. Open your browser and go to: **https://www.mongodb.com/cloud/atlas/register**
2. Sign up with your email (or use Google sign-in)
3. Choose the **FREE** plan when asked

### 1b. Create Your Database
1. After signing up, you'll see a page that says "Deploy your database"
2. Choose **M0 FREE** (the free option)
3. For "Provider", pick **AWS**
4. For "Region", pick **Virginia (us-east-1)** — this is closest to most US users
5. Under "Cluster Name", type: **CarryOn**
6. Click **"Create Deployment"**

### 1c. Set Up a Database User
1. A popup will appear asking you to create a database user
2. Username: **carryon_admin**
3. Click **"Autogenerate Secure Password"**
4. **COPY THIS PASSWORD AND SAVE IT SOMEWHERE SAFE** (you'll need it in a minute)
5. Click **"Create Database User"**

### 1d. Allow Connections
1. Next you'll see "Where would you like to connect from?"
2. Click **"Allow Access from Anywhere"** (adds 0.0.0.0/0)
3. Click **"Finish and Close"**

### 1e. Get Your Connection String
1. You should now see your cluster on the main page
2. Click the **"Connect"** button on your cluster
3. Choose **"Drivers"**
4. You'll see a connection string that looks like:
   ```
   mongodb+srv://carryon_admin:<password>@carryon.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. **Replace `<password>` with the password you saved in step 1c**
6. **Copy this entire string** — this is your `MONGO_URL`

---

## STEP 2: Get Your Grok API Key (for Estate Guardian AI)

This powers the AI features in your app.

### 2a. Create an xAI Account
1. Go to: **https://console.x.ai**
2. Sign in with your X (Twitter) account, or create one
3. You may need an X Premium subscription for API access

### 2b. Get Your API Key
1. Once signed in, look for **"API Keys"** in the left sidebar
2. Click **"Create API Key"**
3. Name it: **CarryOn Production**
4. **Copy the key** that appears — it starts with `xai-...`
5. **Save it somewhere safe** — you won't see it again

---

## STEP 3: Save Your Code to GitHub

You need your code on GitHub so Render can access it.

1. In your Emergent chat (where you're reading this), look at the bottom of the chat input
2. You'll see a **"Save to GitHub"** button
3. Click it and follow the prompts to push your code to a GitHub repository
4. Note the repository name (e.g., `yourusername/carryon`)

---

## STEP 4: Deploy to Render

### 4a. Create a Render Account
1. Go to: **https://render.com**
2. Click **"Get Started for Free"**
3. Sign up with your **GitHub** account (this makes connecting your code easier)

### 4b. Deploy the Backend (the engine)
1. Once logged in, click the **"+ New"** button at the top
2. Select **"Web Service"**
3. Connect your GitHub repo (the one from Step 3)
4. Fill in these settings:
   - **Name**: `carryon-api`
   - **Region**: **Oregon (US West)** or **Ohio (US East)**
   - **Root Directory**: `backend`
   - **Runtime**: **Docker**
   - **Instance Type**: Choose **Starter** ($7/month) or **Free** (spins down after inactivity)
5. Click **"Advanced"** to expand the environment variables section
6. Add these **Environment Variables** one by one (click "Add Environment Variable" for each):

| Key | Value |
|-----|-------|
| `MONGO_URL` | The connection string from Step 1e |
| `DB_NAME` | `carryon_db` |
| `JWT_SECRET` | Make up a long random string (e.g., mash your keyboard: `kj4h5kjh345kjh345kj3h45`) |
| `ENCRYPTION_KEY` | Make up another long random string (different from above) |
| `CORS_ORIGINS` | `https://carryon-web.onrender.com` (update later with your actual frontend URL) |
| `RESEND_API_KEY` | Your Resend API key (from your current setup) |
| `SENDER_EMAIL` | `noreply@carryon.us` |
| `TWILIO_ACCOUNT_SID` | Your Twilio SID (from your current setup) |
| `TWILIO_AUTH_TOKEN` | Your Twilio token |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number |
| `STRIPE_API_KEY` | Your Stripe key |
| `XAI_API_KEY` | The Grok API key from Step 2b |
| `EMERGENT_LLM_KEY` | Your Emergent key (still needed for voice features) |
| `VAPID_PRIVATE_KEY` | See Step 5 below |
| `VAPID_CLAIMS_EMAIL` | `mailto:support@carryon.us` |

7. Click **"Deploy Web Service"**
8. Wait for it to deploy (this takes about 5-10 minutes)
9. Once it says **"Live"**, you'll see a URL like `https://carryon-api-xxxx.onrender.com`
10. **Copy this URL** — this is your backend URL

### 4c. Deploy the Frontend (what users see)
1. Click **"+ New"** again
2. Select **"Static Site"**
3. Connect the same GitHub repo
4. Fill in:
   - **Name**: `carryon-web`
   - **Root Directory**: `frontend`
   - **Build Command**: `yarn install && yarn build`
   - **Publish Directory**: `build`
5. Add these **Environment Variables**:

| Key | Value |
|-----|-------|
| `REACT_APP_BACKEND_URL` | The backend URL from step 4b (e.g., `https://carryon-api-xxxx.onrender.com`) |
| `REACT_APP_VAPID_PUBLIC_KEY` | See Step 5 below |

6. Under **Redirects/Rewrites**, add one rule:
   - Source: `/*`
   - Destination: `/index.html`
   - Type: **Rewrite**
7. Click **"Deploy Static Site"**
8. Once live, you'll get a URL like `https://carryon-web.onrender.com`

### 4d. Update CORS (connect frontend to backend)
1. Go back to your **carryon-api** service in Render
2. Click **"Environment"** on the left
3. Find `CORS_ORIGINS` and update it to your actual frontend URL from step 4c
4. Click **"Save Changes"** — the backend will redeploy automatically

---

## STEP 5: Generate Push Notification Keys (VAPID)

You need these for push notifications to work. Do this **before** deploying (or update the variables after).

### Option A: Ask Someone with a Computer (Easiest)
Ask someone tech-savvy to run this command on their computer:
```
npx web-push generate-vapid-keys
```
It will output a **Public Key** and a **Private Key**. Use them in the deployment steps above.

### Option B: Use an Online Generator
1. Go to: **https://vapidkeys.com**
2. Click **Generate**
3. Copy the **Public Key** → use as `REACT_APP_VAPID_PUBLIC_KEY` (frontend) and `VAPID_PUBLIC_KEY`
4. Copy the **Private Key** → use as `VAPID_PRIVATE_KEY` (backend)

---

## STEP 6: Connect Your Domain (carryon.us)

### 6a. Point Your Domain to the Frontend
1. In Render, go to your **carryon-web** static site
2. Click **"Settings"** → **"Custom Domains"**
3. Click **"Add Custom Domain"**
4. Type: `carryon.us`
5. Render will show you DNS records to add
6. Go to wherever you bought your domain (GoDaddy, Namecheap, etc.)
7. Find **DNS Settings** and add the records Render shows you
8. Wait 5-30 minutes for it to take effect

### 6b. (Optional) Point API to a Subdomain
1. In Render, go to your **carryon-api** web service
2. Click **"Settings"** → **"Custom Domains"**
3. Add: `api.carryon.us`
4. Add the DNS records Render shows you
5. Update `CORS_ORIGINS` in your backend to `https://carryon.us`
6. Update `REACT_APP_BACKEND_URL` in your frontend to `https://api.carryon.us`

---

## STEP 7: Create Your Admin Account

Once everything is live:
1. Go to your app URL (e.g., `https://carryon.us`)
2. Click **"Create Account"**
3. Use: `founder@carryon.us` / `CarryOntheWisdom!`
4. This will be your admin account

---

## You're Live!

Your app is now running on the internet. Here's what you have:

| What | Where |
|------|-------|
| Your app | `https://carryon.us` (or the Render URL) |
| Backend API | `https://api.carryon.us` (or the Render URL) |
| Database | MongoDB Atlas (free tier) |
| AI Brain | Grok by xAI |
| Hosting | Render |

### Monthly Costs (Estimate)
| Service | Cost |
|---------|------|
| MongoDB Atlas | **Free** (up to 512MB) |
| Render (backend) | **$7/month** (or free with sleep) |
| Render (frontend) | **Free** |
| Grok API | Pay-per-use (~$0.20-3 per 1M tokens) |
| **Total** | **~$7-15/month** to start |

---

## If Something Goes Wrong

### "My app shows a blank page"
→ Check that `REACT_APP_BACKEND_URL` is set correctly in your frontend environment variables

### "Login doesn't work"
→ Check that `CORS_ORIGINS` matches your frontend URL exactly (with `https://`)

### "AI Guardian doesn't respond"
→ Check that `XAI_API_KEY` is set correctly in backend environment variables

### "I can't receive OTP emails"
→ Your Resend API key domain must match your sending email domain. If sending from `noreply@carryon.us`, your Resend account needs to have `carryon.us` verified.

### Need help?
Come back to Emergent and ask — I'm here to help debug any issues!
