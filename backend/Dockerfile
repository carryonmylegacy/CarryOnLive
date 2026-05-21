# CarryOn API — Render production image
# ------------------------------------------------------------------
# Base: Python 3.12 slim. Required because the project pins numpy
# 2.4.2 which needs Python >= 3.11. (The Microsoft Playwright image
# v1.58.0-jammy was tried first but ships Python 3.10 — produced
# `No matching distribution found for numpy==2.4.2` during pip
# install on Render's first build.)
#
# Chromium is installed via `playwright install --with-deps chromium`
# which auto-pulls every system library Chromium needs via apt. Slower
# build than the pre-baked MS image (~2 extra min on first build),
# but it's compatible with our Python version pin AND reliable.
# ------------------------------------------------------------------
FROM python:3.12-slim-bookworm

# Base system deps:
#  - ffmpeg / libsndfile1   → matched the Railway Nixpacks aptPkgs.
#  - curl                   → healthcheck.
#  - fonts-liberation / fontconfig → improves PDF font rendering.
#  - ca-certificates        → outbound HTTPS to S3 / Atlas / Resend / xAI.
# Chromium's own system deps are installed in a later step via
# `playwright install --with-deps`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        curl \
        ca-certificates \
        fonts-liberation \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so Docker can cache this layer on
# unchanged requirements.txt.
#
# `--root-user-action=ignore` silences pip's "Running pip as the 'root'
# user" warning. Inside a Docker container we *want* root for the build
# layer — there's no shared system to corrupt, and switching to a venv
# just adds path-juggling overhead. The flag is the officially-blessed
# way to acknowledge that.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade --root-user-action=ignore pip \
    && pip install --no-cache-dir --root-user-action=ignore -r requirements.txt \
    && pip install --no-cache-dir --root-user-action=ignore emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Install Chromium AFTER the Python deps so pip's playwright package
# is already on disk. `--with-deps` triggers apt-get install of every
# Chromium system lib (libnss3, libatk-bridge2.0-0, libxss1, etc.) —
# Playwright's own subcommand knows the exact list for the version
# pinned in requirements.txt (1.58.0).
RUN playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

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
