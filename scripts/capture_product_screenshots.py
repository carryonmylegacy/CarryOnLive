"""Capture real product screenshots from a live CarryOn account for the marketing preview.
Run: SHOT_USER=... SHOT_PASS=... [SHOT_MODE=mobile] /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
"""
import os
import sys
from PIL import Image
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SHOT_BASE_URL", "https://www.carryon.us")
USER = os.environ["SHOT_USER"]
PASS = os.environ["SHOT_PASS"]
MOBILE = os.environ.get("SHOT_MODE") == "mobile"
OUT = "/app/frontend/public/screenshots"
PREFIX = "m-" if MOBILE else ""
# Account-specific nudges hidden before shooting (QuickStart modal, onboarding wizard/action-item group, push prompt, section-lock setup banners)
HIDE_SELECTORS = '[data-testid="quickstart-modal"], [data-testid="onboarding-wizard"], [data-testid="onboarding-prompts-group"], [data-testid="push-notification-prompt"], [data-testid^="lock-banner-"]'
# Mirrors the responsive fix shipped in ChecklistPage.renderItemCard (actions wrap under the title on phones)
CHECKLIST_MOBILE_CSS = """@media (max-width: 639px) {
  [data-testid^="iac-item-"] > div { flex-wrap: wrap; }
  [data-testid^="iac-item-"] > div > div:last-child { width: 100%; justify-content: flex-end; padding-left: 3rem; margin-top: 0.5rem; }
}"""
# Dashboard: start the shot at the Total Family Continuity meter (founder directive, Sep 19 2026) —
# the welcome line, beneficiary vault banner and onboarding group above it stay out of the preview.
METER_SELECTORS = '[data-testid="readiness-card"], [data-testid="readiness-card-side"], [data-testid="core-pillars-card"]'
SCROLL_TO_METER_JS = f"""(() => {{
  const cards = [...document.querySelectorAll('{METER_SELECTORS}')].filter(e => e.offsetParent !== null);
  if (!cards.length) return 'no meter card';
  const el = cards.reduce((a, b) => a.getBoundingClientRect().top <= b.getBoundingClientRect().top ? a : b);
  let scroller = el.parentElement;
  while (scroller && scroller !== document.body) {{
    const cs = getComputedStyle(scroller);
    if (/(auto|scroll)/.test(cs.overflowY) && scroller.scrollHeight > scroller.clientHeight + 4) break;
    scroller = scroller.parentElement;
  }}
  const useWindow = !scroller || scroller === document.body;
  el.scrollIntoView({{ block: 'start' }});
  let headerBottom = 0;
  for (let n = document.elementFromPoint(window.innerWidth / 2, 4); n && n !== document.body; n = n.parentElement) {{
    const pos = getComputedStyle(n).position;
    if (pos === 'fixed' || pos === 'sticky') {{ headerBottom = Math.max(headerBottom, n.getBoundingClientRect().bottom); break; }}
  }}
  const delta = el.getBoundingClientRect().top - headerBottom - 12;
  if (useWindow) window.scrollBy(0, delta); else scroller.scrollTop += delta;
  return `${{el.dataset.testid}} via ${{useWindow ? 'window' : 'container'}} headerBottom=${{Math.round(headerBottom)}}`;
}})()"""
PAGES = [
    ("dashboard", "/dashboard", None, True),
    ("messages", "/messages", None, False),
    ("vault", "/vault", None, False),
    ("contacts", "/beneficiaries", None, False),
    ("checklist", "/checklist", "Critical", False),
]
ONLY = {s for s in os.environ.get("SHOT_ONLY", "").split(",") if s}
if ONLY:
    PAGES = [p for p in PAGES if p[0] in ONLY]

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
    for name, path, click_text, to_meter in PAGES:
        try:
            page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=60000)
        except PlaywrightTimeoutError:
            pass  # a websocket / long-poll keeps the network busy — the page has rendered by now
        page.wait_for_timeout(3500)
        page.add_style_tag(content=CHECKLIST_MOBILE_CSS)
        hide_js = f"(() => {{ const els = document.querySelectorAll('{HIDE_SELECTORS}'); els.forEach(e => e.style.display = 'none'); return els.length; }})()"
        hidden = page.evaluate(hide_js)
        if click_text:
            page.get_by_text(click_text, exact=False).first.click()
            page.wait_for_timeout(800)
        hidden += page.evaluate(hide_js)
        if to_meter:
            print("scroll:", page.evaluate(SCROLL_TO_METER_JS))
            page.wait_for_timeout(700)
        page.wait_for_timeout(500)
        out = f"{OUT}/{PREFIX}{name}.png"
        page.screenshot(path=out, full_page=False)
        im = Image.open(out).convert("RGB").resize(out_size, Image.LANCZOS)
        im.save(f"{OUT}/{PREFIX}{name}.webp", "WEBP", quality=80, method=6)
        os.remove(out)
        print("saved", f"{OUT}/{PREFIX}{name}.webp", "hidden:", hidden, page.url)
    browser.close()
print("done", file=sys.stderr)
