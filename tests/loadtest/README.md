# CarryOn™ — Load Testing

## Smoke test (50 VUs × 60s)

Validates that the platform's 10 hottest endpoints stay under their p95 latency budget at representative load. **Run this before any deploy** to a new environment, or after any structural change.

### One-time install (k6)

```bash
# macOS
brew install k6

# Linux
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Authenticate once and capture a token

```bash
API_URL=https://preview-or-prod-api.example.com

TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"info@carryon.us","password":"Demo1234!","force_login":true}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token") or d.get("token") or "")')

ESTATE_ID=$(curl -s "$API_URL/api/estates" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["id"] if d else "")')
```

### Run the smoke test

```bash
API_URL="$API_URL" TOKEN="$TOKEN" ESTATE_ID="$ESTATE_ID" \
  k6 run /app/tests/loadtest/smoke.js
```

### Latency budgets

| Metric | Threshold | Why |
|---|---|---|
| p95 latency | < 800 ms | User perception target |
| p99 latency | < 2000 ms | Tail latency ceiling |
| Error rate | < 1% | 5xx + network errors combined |

Anything outside these budgets at 50 VUs warrants investigation **before** a partner pilot launches.

### Scaling tests

To validate the 200-connection Mongo pool ceiling, ramp to 200 VUs:

```bash
VUS=200 DURATION=2m k6 run /app/tests/loadtest/smoke.js
```

### CI integration (post-pitch)

When the partner pilot rolls out, add k6 to `codemagic.yaml` as a gate:

```yaml
- name: load-test
  script: |
    k6 run --quiet --summary-export=/tmp/k6.json /app/tests/loadtest/smoke.js
    p95=$(python3 -c 'import json;d=json.load(open("/tmp/k6.json"));print(d["metrics"]["http_req_duration"]["values"]["p(95)"])')
    if (( $(echo "$p95 > 800" | bc -l) )); then echo "❌ p95 budget violated"; exit 1; fi
```
