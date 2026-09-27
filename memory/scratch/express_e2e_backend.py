"""Express signup backend E2E: register(express) -> /auth/me gate -> checkout -> complete-signup -> gate cleared."""
import json
import os
import sys
import time

import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
stamp = int(time.time())
email = f"qa.express.{stamp}@carryon-qa.org"
payload = {
    "email": email,
    "password": "ExpressQa!2026x",
    "first_name": "Express",
    "last_name": f"Qa{stamp}",
    "username": f"expressqa{stamp}",
    "role": "benefactor",
    "sms_consent": True,
    "signup_flow": "express",
}


def show(label, r):
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text[:300]
    print(f"\n== {label}: {r.status_code}")
    print(json.dumps(body, indent=1)[:1200] if isinstance(body, (dict, list)) else body)
    return body


r = requests.post(f"{BASE}/auth/register", json=payload)
reg = show("register(express)", r)
assert r.status_code in (200, 201), "register failed"
token = reg.get("access_token")
if not token:
    print("OTP path? keys:", list(reg.keys()))
    sys.exit(1)
h = {"Authorization": f"Bearer {token}"}
user_id = reg.get("user", {}).get("id") or reg.get("id")
print("user_id", user_id, "profile_pending(reg):", reg.get("user", {}).get("profile_pending"))

me = show("auth/me (before)", requests.get(f"{BASE}/auth/me", headers=h))
assert me["profile_pending"] is True, "profile_pending should be True after express register"
assert me["role"] == "benefactor"
assert me["is_also_benefactor"] is True, "estate should exist"

sub = show("subscriptions/status", requests.get(f"{BASE}/subscriptions/status", headers=h))

co = requests.post(f"{BASE}/subscriptions/checkout", json={"plan_id": "standard", "billing_cycle": "annual", "origin_url": BASE.rsplit("/api", 1)[0]}, headers=h)
cob = show("checkout", co)
url = cob.get("checkout_url") or cob.get("url") or ""
assert "stripe.com" in url, f"expected stripe url, got {url!r}"

bad = requests.post(f"{BASE}/auth/complete-signup", json={"date_of_birth": "2015-01-01"}, headers=h)
show("complete-signup minor (expect 400)", bad)
assert bad.status_code == 400

done = show(
    "complete-signup",
    requests.post(
        f"{BASE}/auth/complete-signup",
        json={"middle_name": "M", "suffix": "Jr", "gender": "male", "date_of_birth": "1955-06-15", "special_status": ["veteran"]},
        headers=h,
    ),
)
assert done["ok"] is True
assert done["eligible_tier"] in ("veteran", "seniors"), done["eligible_tier"]
assert done["user"]["profile_pending"] is False

me2 = show("auth/me (after)", requests.get(f"{BASE}/auth/me", headers=h))
assert me2["profile_pending"] is False
assert me2["name"] == f"Express M Qa{stamp} Jr", me2["name"]
assert me2["date_of_birth"] == "1955-06-15"

# Compare stored doc against a standard signup's field set
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")
from pymongo import MongoClient  # noqa: E402

db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
doc = db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
print("\n== stored user doc keys:", sorted(doc.keys()))
print({k: doc.get(k) for k in ("eligible_tier", "special_status", "profile_pending", "signup_flow", "profile_completed_at", "gender", "name", "subscription_status", "trial_ends_at")})
print("\nQA_USER_ID", user_id)
