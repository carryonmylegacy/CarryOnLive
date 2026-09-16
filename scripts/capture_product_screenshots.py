"""Capture real product screenshots from a live CarryOn account for the marketing preview.
Run: SHOT_USER=... SHOT_PASS=... /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
"""
import os
import sys
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SHOT_BASE_URL", "https://www.carryon.us")
USER = os.environ["SHOT_USER"]
PASS = os.environ["SHOT_PASS"]
OUT = "/app/frontend/public/screenshots"
# (name, path, texts-to-hide [(text, minWidth)], text-to-click)
PAGES = [
    ("dashboard", "/dashboard", [("Enable Notifications", 380), ("Welcome to Your Estate", 1100), ("Get Started with CarryOn", 1100)], None),
    ("vault", "/vault", [("Section Unlocked", 700)], None),
    ("contacts", "/beneficiaries", [("Section Unlocked", 700)], None),
    ("checklist", "/checklist", [("Section Unlocked", 700)], "Critical"),
]

HIDE_JS = """([text, minWidth]) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; const hits = [];
  while ((n = walker.nextNode())) { if (n.textContent.trim() === text) hits.push(n.parentElement); }
  for (let el of hits) {
    while (el && el.parentElement && el.getBoundingClientRect().width < minWidth) el = el.parentElement;
    if (el && el !== document.body) el.style.display = 'none';
  }
  return hits.length;
}"""

os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
    page.fill('[data-testid="login-email-input"]', USER)
    page.fill('[data-testid="login-password-input"]', PASS)
    page.click('[data-testid="login-submit-button"]')
    page.wait_for_url(lambda u: "/login" not in u, timeout=60000)
    page.wait_for_timeout(2500)
    print("logged in ->", page.url)
    for name, path, hides, click_text in PAGES:
        page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(3500)
        if click_text:
            page.get_by_text(click_text, exact=False).first.click()
            page.wait_for_timeout(800)
        for text, min_w in hides:
            print("  hid", text, page.evaluate(HIDE_JS, [text, min_w]))
        page.wait_for_timeout(500)
        out = f"{OUT}/{name}.png"
        page.screenshot(path=out, full_page=False)
        im = Image.open(out).convert("RGB").resize((2160, 1350), Image.LANCZOS)
        im.save(f"{OUT}/{name}.webp", "WEBP", quality=80, method=6)
        os.remove(out)
        print("saved", f"{OUT}/{name}.webp", page.url)
    browser.close()
print("done", file=sys.stderr)
