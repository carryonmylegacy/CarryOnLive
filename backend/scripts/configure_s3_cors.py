"""
One-time fix: configure CORS on the carryon-vault S3 bucket so the
offline photo cache actually works.

Why this exists: the frontend's offline photo prefetch (see
`frontend/src/offline/imageBlobsRepo.js`) needs to download photos
from S3 into IndexedDB so they're available when the user is offline
(e.g. on a plane). The bucket's CORS policy currently blocks those
downloads, so the cache silently fails and beneficiaries who open
the app cold in airplane mode see broken avatars.

Run once:
    cd /app/backend
    python scripts/configure_s3_cors.py

The script reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and
S3_BUCKET_NAME from /app/backend/.env (already set in production),
applies the CORS rule, then prints back the live config to confirm.

Idempotent — safe to re-run. It overwrites the bucket's CORS rule
with the snippet below.
"""

import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

# Load .env from /app/backend regardless of where this script is run from.
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

BUCKET = os.environ["S3_BUCKET_NAME"]

# Origins allowed to download photos from S3. Includes:
#  - production (carryon.us + www subdomain)
#  - emergent preview pods (used during testing)
#  - the iOS / Android app shells served via Capacitor (capacitor:// and
#    ionic:// schemes — required when the PWA is wrapped as a native app)
CORS_RULE = {
    "CORSRules": [
        {
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedOrigins": [
                "https://carryon.us",
                "https://www.carryon.us",
                "https://app.carryon.us",
                "https://pitch-prep-stable.preview.emergentagent.com",
                "capacitor://localhost",
                "ionic://localhost",
            ],
            "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
            "MaxAgeSeconds": 86400,
        }
    ]
}


def main() -> int:
    region = os.environ.get("AWS_REGION", "us-east-2")
    s3 = boto3.client(
        "s3",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=region,
    )

    print(f"Applying CORS rule to bucket: {BUCKET} (region={region})")
    try:
        s3.put_bucket_cors(Bucket=BUCKET, CORSConfiguration=CORS_RULE)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "Unknown")
        msg = e.response.get("Error", {}).get("Message", str(e))
        print(f"FAILED ({code}): {msg}")
        return 1

    # Read it back to confirm.
    live = s3.get_bucket_cors(Bucket=BUCKET)
    print("\nLive CORS rule on the bucket:")
    for rule in live.get("CORSRules", []):
        print(f"  Origins:  {rule.get('AllowedOrigins')}")
        print(f"  Methods:  {rule.get('AllowedMethods')}")
        print(f"  Headers:  {rule.get('AllowedHeaders')}")
        print(f"  Expose:   {rule.get('ExposeHeaders')}")
        print(f"  MaxAge:   {rule.get('MaxAgeSeconds')}s")

    print("\nDone. Offline photo cache should now populate on the next page load.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
