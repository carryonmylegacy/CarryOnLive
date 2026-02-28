FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Copy application code
COPY . .

# Railway/Render set PORT automatically; default to 8001
ENV PORT=8001

EXPOSE ${PORT}

# Health check — Render uses healthCheckPath in render.yaml,
# but this helps Docker/docker-compose deployments too
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT} --workers 2
