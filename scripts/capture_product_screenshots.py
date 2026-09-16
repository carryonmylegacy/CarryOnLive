"""Capture real product screenshots from a live CarryOn account for the marketing preview.
Run: SHOT_USER=... SHOT_PASS=... [SHOT_MODE=mobile] /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
"""
import os
import sys
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SHOT_BASE_URL", "https://www.carryon.us")
USER = os.environ["SHOT_USER"]
PASS = os.environ["SHOT_PASS"]
MOBILE = os.environ.get("SHOT_MODE") == "mobile"
OUT = "/app/frontend/public/screenshots"
PREFIX = "m-" if MOBILE else ""
# Account-specific nudges hidden before shooting (onboarding wizard, push prompt, section-lock setup banners)
HIDE_SELECTORS = '[data-testid="onboarding-wizard"], [data-testid="push-notification-prompt"], [data-testid^="lock-banner-"]'
# Mirrors the responsive fix shipped in ChecklistPage.renderItemCard (actions wrap under the title on phones)
CHECKLIST_MOBILE_CSS = """@media (max-width: 639px) {
  [data-testid^="iac-item-"] > div { flex-wrap: wrap; }
  [data-testid^="iac-item-"] > div > div:last-child { width: 100%; justify-content: flex-end; padding-left: 3rem; margin-top: 0.5rem; }
}"""
PAGES = [
    ("dashboard", "/dashboard", None),
    ("vault", "/vault", None),
    ("contacts", "/beneficiaries", None),
    ("checklist", "/checklist", "Critical"),
]

os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    if MOBILE:
        dev = dict(p.devices["iPhone 14"])
        dev.pop("default_browser_type", None)
        ctx = browser.new_context(**dev)
        vw, vh = dev["viewport"]["width"], dev["viewport"]["height"]
        out_size = (vw * 2, vh * 2)
    else:
        vw, vh = 1440, 900
        ctx = browser.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2)
        out_size = (2160, 1350)
    page = ctx.new_page()
    page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
    page.fill('[data-testid="login-email-input"]', USER)
    page.fill('[data-testid="login-password-input"]', PASS)
    page.click('[data-testid="login-submit-button"]')
    page.wait_for_url(lambda u: "/login" not in u, timeout=60000)
    page.wait_for_timeout(2500)
    print("logged in ->", page.url, "viewport", vw, vh)
    for name, path, click_text in PAGES:
        page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(3500)
        page.add_style_tag(content=CHECKLIST_MOBILE_CSS)
        if click_text:
            page.get_by_text(click_text, exact=False).first.click()
            page.wait_for_timeout(800)
        hidden = page.evaluate(f"(() => {{ const els = document.querySelectorAll('{HIDE_SELECTORS}'); els.forEach(e => e.style.display = 'none'); return els.length; }})()")
        page.wait_for_timeout(500)
        out = f"{OUT}/{PREFIX}{name}.png"
        page.screenshot(path=out, full_page=False)
        im = Image.open(out).convert("RGB").resize(out_size, Image.LANCZOS)
        im.save(f"{OUT}/{PREFIX}{name}.webp", "WEBP", quality=80, method=6)
        os.remove(out)
        print("saved", f"{OUT}/{PREFIX}{name}.webp", "hidden:", hidden, page.url)
    browser.close()
print("done", file=sys.stderr)
