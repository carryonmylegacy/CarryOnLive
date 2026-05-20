# CarryOn API — Render production image
# ------------------------------------------------------------------
# Base: Microsoft's official Playwright Python image with Chromium +
# every system dep pre-installed. Saves ~3 minutes per build vs
# `pip install playwright && playwright install --with-deps chromium`
# on a vanilla Python image, and avoids the apt-get failures that
# can break Nixpacks builds.
#
# Playwright 1.58.0 (matching backend/requirements.txt) is included.
# Chromium binary is at /ms-playwright/chromium-* — Playwright finds
# it automatically via the bundled env vars in the base image.
# ------------------------------------------------------------------
FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy

# Extra apt packages we needed on Railway's Nixpacks (ffmpeg, libsndfile1,
# fonts-liberation, fontconfig). The Playwright base already ships
# fontconfig + most fonts; we just add ffmpeg + libsndfile1 for any
# audio-processing paths.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user is fine — the Playwright base image already creates
# `pwuser`, but uvicorn binding to $PORT (any > 1024) doesn't need root,
# so we just stay with the default for simplicity.

WORKDIR /app

# Install Python deps first so Docker can cache this layer on
# unchanged requirements.txt.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Now copy the rest of the backend source. Anything in `.dockerignore`
# (node_modules, .git, *.pem, etc.) is excluded.
COPY . .

# Entrypoint handles:
#   - Materializing the VAPID private PEM from VAPID_PRIVATE_KEY_PEM env
#     var if the path doesn't already contain a key (gitignored secret).
#   - Binding uvicorn to Render's dynamic $PORT (defaults to 10000).
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Render passes PORT via env. uvicorn binds 0.0.0.0:$PORT.
EXPOSE 10000

# Healthcheck — `/api/health` returns 200 with DB status. Render
# uses its own external healthcheck via render.yaml, but baking one
# here lets `docker run` locally verify quickly.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-10000}/api/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
