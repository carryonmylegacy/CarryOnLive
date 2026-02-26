# CarryOn™ Deployment Guide

Deploy CarryOn™ to production using managed services. This guide covers **Railway** (recommended for simplicity) and **Render** as deployment options.

---

## Prerequisites

Before deploying, you need:

1. **MongoDB Atlas** account (free tier works) — [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. **Railway** or **Render** account
3. Your existing API keys:
   - `EMERGENT_LLM_KEY` — for Estate Guardian AI
   - `RESEND_API_KEY` — for email delivery (must match your sending domain)
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — for SMS OTP
   - `STRIPE_API_KEY` — for payment processing
4. **VAPID keys** for push notifications (generated during setup)

---

## Step 1: Set Up MongoDB Atlas (Free)

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) and create a free account
2. Create a **free M0 cluster** (select a region close to your deployment)
3. Under **Database Access**, create a database user:
   - Username: `carryon_admin`
   - Password: (generate a strong password)
   - Role: `readWriteAnyDatabase`
4. Under **Network Access**, add `0.0.0.0/0` (allow from anywhere) — or whitelist your deployment IP
5. Click **Connect** → **Drivers** → copy the connection string:
   ```
   mongodb+srv://carryon_admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your actual password. This is your `MONGO_URL`.

---

## Step 2: Generate VAPID Keys

Run this locally (requires Node.js):

```bash
npx web-push generate-vapid-keys
```

This outputs:
```
Public Key:  BPxxxxxxx...
Private Key: xxxxxxxxx...
```

Save both — you'll need them as environment variables.

Alternatively, generate them with Python:
```bash
pip install py-vapid
python -c "
from py_vapid import Vapid
v = Vapid()
v.generate_keys()
v.save_key('/tmp/vapid_private.pem')
v.save_public_key('/tmp/vapid_public.pem')
with open('/tmp/vapid_private.pem') as f: print('VAPID_PRIVATE_KEY (PEM content):'); print(f.read())
from cryptography.hazmat.primitives import serialization
import base64
raw = v.public_key.public_bytes(encoding=serialization.Encoding.X962, format=serialization.PublicFormat.UncompressedPoint)
print('VAPID_PUBLIC_KEY:', base64.urlsafe_b64encode(raw).decode().rstrip('='))
"
```

---

## Step 3: Save Code to GitHub

In Emergent, use the **"Save to GitHub"** button in the chat input to push your code to a GitHub repository. You'll connect this repo to your deployment platform.

---

## Option A: Deploy to Railway (Recommended)

Railway is the simplest option — it auto-detects Dockerfiles and handles everything.

### A1. Create Railway Account
1. Go to [railway.app](https://railway.app) and sign up with GitHub

### A2. Deploy Backend
1. Click **"New Project"** → **"Deploy from GitHub Repo"**
2. Select your CarryOn repository
3. Railway will detect the repo. Click the service and go to **Settings**:
   - Set **Root Directory** to `/backend`
   - Railway auto-detects the Dockerfile
4. Go to **Variables** tab and add:

| Variable | Value |
|----------|-------|
| `MONGO_URL` | Your MongoDB Atlas connection string |
| `DB_NAME` | `carryon_db` |
| `JWT_SECRET` | (generate: `openssl rand -hex 32`) |
| `CORS_ORIGINS` | Your frontend URL (set after deploying frontend) |
| `RESEND_API_KEY` | Your Resend API key |
| `SENDER_EMAIL` | `noreply@yourdomain.com` |
| `TWILIO_ACCOUNT_SID` | Your Twilio SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio token |
| `TWILIO_PHONE_NUMBER` | Your Twilio number |
| `STRIPE_API_KEY` | Your Stripe secret key |
| `EMERGENT_LLM_KEY` | Your Emergent LLM key |
| `VAPID_PRIVATE_KEY` | Full PEM content of your VAPID private key |
| `VAPID_CLAIMS_EMAIL` | `mailto:support@carryon.us` |

5. Under **Settings** → **Networking**, click **"Generate Domain"** to get a public URL
6. Note your backend URL (e.g., `https://carryon-api-production.up.railway.app`)

### A3. Deploy Frontend
1. In the same Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the same repo again
3. Go to **Settings**:
   - Set **Root Directory** to `/frontend`
4. Go to **Variables** tab and add:

| Variable | Value |
|----------|-------|
| `REACT_APP_BACKEND_URL` | Your backend Railway URL from step A2 |
| `REACT_APP_VAPID_PUBLIC_KEY` | Your VAPID public key |

5. Generate a domain for the frontend too

### A4. Update CORS
Go back to your **backend** service variables and set `CORS_ORIGINS` to your frontend Railway URL.

### A5. Verify
- Visit your frontend URL — you should see the CarryOn login page
- Test the health endpoint: `curl https://your-backend-url/api/health`

---

## Option B: Deploy to Render

### B1. Create Render Account
1. Go to [render.com](https://render.com) and sign up with GitHub

### B2. Deploy Using Blueprint (Easiest)
1. In Render dashboard, click **"New"** → **"Blueprint"**
2. Connect your GitHub repo
3. Render reads `render.yaml` and creates both services automatically
4. Fill in the environment variables when prompted (same as Railway table above)

### B3. Manual Deploy (Alternative)

**Backend:**
1. Click **"New"** → **"Web Service"**
2. Connect your GitHub repo
3. Set Root Directory to `backend`
4. Environment: **Docker**
5. Add all environment variables from the table above

**Frontend:**
1. Click **"New"** → **"Static Site"**
2. Connect your GitHub repo
3. Build Command: `cd frontend && yarn install && yarn build`
4. Publish Directory: `frontend/build`
5. Add the rewrite rule: `/* → /index.html` (for SPA routing)
6. Add environment variables: `REACT_APP_BACKEND_URL` and `REACT_APP_VAPID_PUBLIC_KEY`

---

## Option C: Deploy with Docker Compose (VPS / Self-Hosted)

For deploying to a VPS (DigitalOcean, Linode, AWS EC2):

### C1. Prepare the Server
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
sudo apt install docker-compose-plugin
```

### C2. Clone and Configure
```bash
git clone https://github.com/your-org/carryon.git
cd carryon

# Create .env file
cat > .env << 'EOF'
MONGO_URL=mongodb://mongo:27017
DB_NAME=carryon_db
JWT_SECRET=your-secret-here
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com
CORS_ORIGINS=https://yourdomain.com
RESEND_API_KEY=your-key
SENDER_EMAIL=noreply@yourdomain.com
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
STRIPE_API_KEY=your-stripe-key
EMERGENT_LLM_KEY=your-key
VAPID_PRIVATE_KEY=your-pem-content
VAPID_PUBLIC_KEY=your-public-key
VAPID_CLAIMS_EMAIL=mailto:support@carryon.us
EOF
```

### C3. Deploy
```bash
docker compose up -d
```

### C4. Set Up Reverse Proxy (Caddy — easiest)
```bash
sudo apt install caddy

cat > /etc/caddy/Caddyfile << 'EOF'
yourdomain.com {
    reverse_proxy localhost:3000
}

api.yourdomain.com {
    reverse_proxy localhost:8001
}
EOF

sudo systemctl restart caddy
```

Caddy automatically handles HTTPS with Let's Encrypt.

---

## Post-Deployment Checklist

- [ ] **Health check**: `curl https://your-backend-url/api/health` returns `{"status": "healthy"}`
- [ ] **Login works**: Sign in with admin account `founder@carryon.us`
- [ ] **Email delivery**: Test OTP sends correctly (check Resend dashboard for errors)
- [ ] **Push notifications**: Enable in Settings and test
- [ ] **Document upload**: Upload a test document to the vault
- [ ] **Estate Guardian AI**: Ask a question and verify AI responds
- [ ] **CORS**: No cross-origin errors in browser console

---

## Seed Admin Account

After first deployment, create the admin account by calling the register endpoint:

```bash
curl -X POST https://your-backend-url/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@carryon.us",
    "password": "CarryOntheWisdom!",
    "first_name": "Admin",
    "last_name": "User",
    "role": "admin"
  }'
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URL` | Yes | MongoDB connection string |
| `DB_NAME` | Yes | Database name (default: `carryon_db`) |
| `JWT_SECRET` | Yes | Secret for JWT tokens |
| `ENCRYPTION_KEY` | Yes | AES encryption key for document vault (32+ chars) |
| `CORS_ORIGINS` | Yes | Allowed origins (comma-separated) |
| `RESEND_API_KEY` | Yes | Resend API key for emails |
| `SENDER_EMAIL` | Yes | From address for emails |
| `EMERGENT_LLM_KEY` | Yes | API key for Estate Guardian AI |
| `STRIPE_API_KEY` | Yes | Stripe secret key |
| `VAPID_PRIVATE_KEY` | Yes | VAPID private key (PEM content) |
| `VAPID_CLAIMS_EMAIL` | Yes | VAPID contact email |
| `TWILIO_ACCOUNT_SID` | No | Twilio SID (for SMS OTP) |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number |
| `REACT_APP_BACKEND_URL` | Yes | Backend URL (frontend build-time) |
| `REACT_APP_VAPID_PUBLIC_KEY` | Yes | VAPID public key (frontend build-time) |

---

## Estimated Costs

| Service | Free Tier | Paid (Starting) |
|---------|-----------|-----------------|
| **MongoDB Atlas** | 512 MB free forever | $9/mo (M2) |
| **Railway** | $5 free/month | ~$10-20/mo |
| **Render** | Free static sites | $7/mo per service |
| **Resend** | 100 emails/day free | $20/mo |
| **Twilio** | $15 trial credit | ~$1/mo + per SMS |
| **Stripe** | No monthly fee | 2.9% + 30c per txn |

**Total estimated: $15-40/month** for a production deployment with low traffic.

---

## Troubleshooting

### Backend won't start
- Check logs in Railway/Render dashboard
- Verify `MONGO_URL` is correct and IP is whitelisted in Atlas

### CORS errors
- Ensure `CORS_ORIGINS` matches your frontend URL exactly (include `https://`)
- No trailing slash

### Emails not sending
- Verify Resend API key domain matches your `SENDER_EMAIL` domain
- Check Resend dashboard for bounced/failed emails

### Push notifications not working
- Ensure VAPID keys match between frontend and backend
- `REACT_APP_VAPID_PUBLIC_KEY` must be set at frontend build time (not runtime)
