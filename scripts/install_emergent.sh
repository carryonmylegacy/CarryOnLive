#!/usr/bin/env bash
# Install emergentintegrations WITHOUT pulling its bundled deps. The
# bundled deps (openai==1.99.9 etc.) are pinned to versions that block
# four litellm CVE fixes; we manage them ourselves in requirements.txt.
#
# Run AFTER `pip install -r requirements.txt`:
#   bash scripts/install_emergent.sh
#
# This script is idempotent.
set -euo pipefail

pip install --no-deps \
    --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ \
    "emergentintegrations==0.1.2"

echo "✅ emergentintegrations installed (--no-deps)"
