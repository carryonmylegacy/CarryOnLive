#!/usr/bin/env bash
# CarryOn API entrypoint (Render).
#
# 1) Materialize the VAPID private key on disk if `VAPID_PRIVATE_KEY_PEM`
#    env var is provided AND no file exists at `VAPID_PRIVATE_KEY_PATH`.
#    The PEM is intentionally gitignored (it's a secret), so Render
#    operators paste the contents into a single env var instead of
#    committing the file.
# 2) Bind uvicorn to Render's dynamic `$PORT`.
#
# Safe to run idempotently — re-running this script never overwrites
# an existing key file.

set -euo pipefail

VAPID_PRIVATE_KEY_PATH="${VAPID_PRIVATE_KEY_PATH:-/app/vapid_private.pem}"

if [[ -n "${VAPID_PRIVATE_KEY_PEM:-}" && ! -f "$VAPID_PRIVATE_KEY_PATH" ]]; then
  echo "[entrypoint] Materializing VAPID private key to $VAPID_PRIVATE_KEY_PATH"
  mkdir -p "$(dirname "$VAPID_PRIVATE_KEY_PATH")"
  printf '%s\n' "$VAPID_PRIVATE_KEY_PEM" > "$VAPID_PRIVATE_KEY_PATH"
  chmod 600 "$VAPID_PRIVATE_KEY_PATH"
else
  if [[ -f "$VAPID_PRIVATE_KEY_PATH" ]]; then
    echo "[entrypoint] VAPID private key already present at $VAPID_PRIVATE_KEY_PATH"
  else
    echo "[entrypoint] WARNING: no VAPID_PRIVATE_KEY_PEM env var set and no key file present — push notifications will be disabled."
  fi
fi

# Optional: public key materialization (some setups need it on disk).
VAPID_PUBLIC_KEY_PATH="${VAPID_PUBLIC_KEY_PATH:-/app/vapid_public.pem}"
if [[ -n "${VAPID_PUBLIC_KEY_PEM:-}" && ! -f "$VAPID_PUBLIC_KEY_PATH" ]]; then
  echo "[entrypoint] Materializing VAPID public key to $VAPID_PUBLIC_KEY_PATH"
  mkdir -p "$(dirname "$VAPID_PUBLIC_KEY_PATH")"
  printf '%s\n' "$VAPID_PUBLIC_KEY_PEM" > "$VAPID_PUBLIC_KEY_PATH"
  chmod 644 "$VAPID_PUBLIC_KEY_PATH"
fi

# Render passes PORT. Default to 10000 if running locally without it.
PORT="${PORT:-10000}"

echo "[entrypoint] Starting uvicorn on 0.0.0.0:$PORT"
exec uvicorn server:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers 1 \
    --proxy-headers \
    --forwarded-allow-ips='*'
