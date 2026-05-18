#!/usr/bin/env python3
"""One-shot installer: apply S3 bucket lifecycle rules to the storage bucket.

Why
───
`carryon-vault` has S3 versioning **enabled**, which silently keeps every
old version of every PDF when our app overwrites the `(user_id, pdf_type)`
slot. Application logic only ever reads the current version, so versioning
exists purely as a safety-net against accidental corruption — but without
a lifecycle policy, noncurrent versions accumulate forever.

This script installs three rules:

1. **expire-noncurrent-pdfs** — delete noncurrent versions of objects under
   `latest-pdfs/` after 30 days. Storage savings + alignment with the
   user's intent that we only ever store the latest copy.
2. **expire-noncurrent-everything-else** — same rule, applied bucket-wide
   for any future namespace we add. 30-day window gives us a month-long
   safety net against bugs.
3. **abort-incomplete-uploads** — clean up failed multipart uploads after
   7 days (storage cost + tidiness).

Idempotent: rerunning replaces the entire lifecycle config. Run from any
host that has the same `boto3` credentials the backend uses.

Usage
─────
    python3 /app/scripts/install_s3_lifecycle.py             # apply
    python3 /app/scripts/install_s3_lifecycle.py --dry-run   # print only
"""

from __future__ import annotations

import argparse
import json
import os
import sys

LIFECYCLE_RULES = {
    "Rules": [
        {
            "ID": "expire-noncurrent-pdfs-30d",
            "Status": "Enabled",
            "Filter": {"Prefix": "latest-pdfs/"},
            "NoncurrentVersionExpiration": {"NoncurrentDays": 30},
        },
        {
            "ID": "expire-noncurrent-everything-else-30d",
            "Status": "Enabled",
            "Filter": {"Prefix": ""},
            "NoncurrentVersionExpiration": {"NoncurrentDays": 30},
        },
        {
            "ID": "abort-incomplete-multipart-7d",
            "Status": "Enabled",
            "Filter": {"Prefix": ""},
            "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7},
        },
    ]
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        import boto3
    except ImportError:
        print("ERROR: boto3 not installed. `pip install boto3`.", file=sys.stderr)
        return 2

    # Allow either backend .env or shell env.
    try:
        from dotenv import load_dotenv

        load_dotenv("/app/backend/.env")
    except ImportError:
        pass

    bucket = os.environ.get("S3_BUCKET_NAME")
    region = os.environ.get("S3_REGION", "us-east-2")
    if not bucket:
        print("ERROR: S3_BUCKET_NAME not in env.", file=sys.stderr)
        return 2

    if args.dry_run:
        print(f"[DRY RUN] would PUT lifecycle on s3://{bucket} (region={region}):")
        print(json.dumps(LIFECYCLE_RULES, indent=2))
        return 0

    s3 = boto3.client("s3", region_name=region)
    try:
        s3.put_bucket_lifecycle_configuration(
            Bucket=bucket,
            LifecycleConfiguration=LIFECYCLE_RULES,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: lifecycle PUT failed: {exc}", file=sys.stderr)
        return 1

    # Read back to confirm.
    lc = s3.get_bucket_lifecycle_configuration(Bucket=bucket)
    print(f"OK: installed {len(lc.get('Rules', []))} rules on s3://{bucket}:")
    for r in lc.get("Rules", []):
        ncv = r.get("NoncurrentVersionExpiration", {}).get("NoncurrentDays", "—")
        ami = r.get("AbortIncompleteMultipartUpload", {}).get("DaysAfterInitiation", "—")
        print(f"  - {r['ID']}  status={r['Status']}  noncurrent_days={ncv}  abort_mpu_days={ami}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
