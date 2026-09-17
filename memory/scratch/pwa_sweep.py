"""PWA safe-area sweep — iPhone width, standalone emulation, status-bar collision detection.

Usage: cd /app/backend && BASE=<preview url> python3 /app/memory/scratch/pwa_sweep.py [--shots]
Emulates env(safe-area-inset-top)=59px / bottom=34px by rewriting stylesheet + inline declarations,
then reports any text / interactive element whose box intrudes into the top 59px band
(at scrollY=0 and after scrolling 600px). Writes /tmp/sweep/report.json (+ PNGs with --shots).
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")

import httpx  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

BASE = os.environ["BASE"].rstrip("/")
SAFE_TOP, SAFE_BOTTOM = 59, 34
SHOTS = "--shots" in sys.argv
OUT = "/tmp/sweep"
os.makedirs(OUT, exist_ok=True)

INIT_JS = """
Object.defineProperty(navigator, 'standalone', { get: () => true });
try { sessionStorage.setItem('carryon_quickstart_skipped_session', '1'); } catch (e) {}
try { sessionStorage.setItem('carryon_quickstart_skipped_session', '1'); } catch (e) {}
const _mm = window.matchMedia.bind(window);
window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, onchange: null, dispatchEvent(){ return false; } } : _mm(q));
"""

EMULATE_JS = """
([top, bottom]) => {
  const re = /env\\(\\s*safe-area-inset-(top|bottom|left|right)\\s*(,[^)]*)?\\)/g;
  const sub = (v) => v.replace(re, (m, side) => side === 'top' ? top + 'px' : side === 'bottom' ? bottom + 'px' : '0px');
  let touched = 0;
  const fixDecl = (style) => {
    for (let i = style.length - 1; i >= 0; i--) {
      const prop = style[i]; const val = style.getPropertyValue(prop);
      if (val && val.includes('safe-area-inset')) { style.setProperty(prop, sub(val), style.getPropertyPriority(prop)); touched++; }
    }
  };
  const walk = (rules) => { for (const r of rules) { if (r.style) fixDecl(r.style); if (r.cssRules) { try { walk(r.cssRules); } catch (e) {} } } };
  for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch (e) {} }
  document.querySelectorAll('[style*="safe-area-inset"]').forEach((el) => fixDecl(el.style));
  return touched;
}
"""

DETECT_JS = """
([top, fixedOnly]) => {
  const pinned = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const vw = window.innerWidth; const out = new Map();
  const alpha = (c) => { const m = c && c.match(/rgba?\\(([^)]+)\\)/); if (!m) return 0; const p = m[1].split(',').map((s) => parseFloat(s)); return p.length === 4 ? p[3] : 1; };
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const ownText = (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const interactive = (el) => el.matches('button, a, input, select, textarea, [role=button], [role=tab], svg, img, video, iframe');
  const opaque = (el) => { const cs = getComputedStyle(el); return alpha(cs.backgroundColor) > 0.5 || (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient\\([^)]*rgba\\([^)]*,\\s*0(\\.\\d+)?\\)/.test(cs.backgroundImage) && cs.backgroundImage.includes('url')); };
  for (let y = 4; y < top; y += 8) {
    for (let x = 6; x < vw; x += 12) {
      for (const el of document.elementsFromPoint(x, y)) {
        if (!(el instanceof Element) || el === document.documentElement || el === document.body) continue;
        if (!visible(el)) continue;
        if (ownText(el) || interactive(el)) {
          if (fixedOnly && !pinned(el)) break;
          const t = el.closest('button, a, [role=button], [role=tab]') || el;
          if (t.matches('svg, img') && !t.closest('button, a')) { /* decorative media: keep reporting but tag */ }
          const r = t.getBoundingClientRect();
          if (t.matches('img, video') && r.width >= vw - 2 && r.height >= 400 && !t.closest('button, a')) break;
          const key = t.tagName + '|' + (t.getAttribute('data-testid') || '') + '|' + (t.textContent || t.getAttribute('alt') || t.getAttribute('aria-label') || '').trim().slice(0, 40);
          if (!out.has(key)) out.set(key, { tag: t.tagName.toLowerCase(), testid: t.getAttribute('data-testid') || '', text: (t.textContent || t.getAttribute('alt') || t.getAttribute('aria-label') || '').trim().slice(0, 60), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), cls: (typeof t.className === 'string' ? t.className : '').slice(0, 90) });
          break;
        }
        if (opaque(el)) break;
      }
    }
  }
  return Array.from(out.values());
}
"""

PUBLIC = [
    "/", "/home", "/login", "/signup", "/start", "/start?plan=premium&cycle=annual", "/pricing", "/about", "/founder-about",
    "/customers", "/changelog", "/security", "/vs", "/vs/trustworthy", "/privacy", "/terms", "/accessibility",
    "/wind-down-promise", "/our-promise", "/get-started", "/speak-with-us", "/partner-brief", "/quickstart/try",
    "/landing-consumer", "/voices", "/p/harbor-test", "/p/does-not-exist", "/partner", "/manager", "/founders-circle",
]
BENEFACTOR = [
    "/dashboard", "/vault", "/messages", "/beneficiaries", "/guardian", "/checklist", "/trustee", "/ffn", "/transition",
    "/digital-wallet", "/financial", "/entities", "/timeline", "/estate-chat", "/connected-protocol", "/settings",
    "/subscription", "/security-settings", "/support", "/share", "/onboarding", "/create-estate", "/financial-portal",
]
BENEFICIARY = [
    "/beneficiary", "/beneficiary/dashboard", "/beneficiary/vault", "/beneficiary/messages", "/beneficiary/checklist",
    "/beneficiary/digital-wallet", "/beneficiary/guardian", "/beneficiary/milestone", "/beneficiary/settings",
    "/beneficiary/concierge", "/beneficiary/estate-chat", "/beneficiary/financial", "/beneficiary/upload-certificate",
]
ADMIN = ["/admin", "/admin/primitives", "/ops"]
ONLY = os.environ.get("ONLY")  # e.g. "benefactor:/guardian,/ffn"


async def login(email, password):
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{BASE}/api/auth/login", json={"email": email, "password": password, "force_login": True})
        return r.json().get("access_token")


def mint_beneficiary():
    from utils import create_token
    return create_token("5a4939be-0ade-487f-9d85-c7e2de4a8a5c", "ben@test.com", "beneficiary", dev_session=True)


async def sweep(browser, paths, token, label, report):
    ctx = await browser.new_context(
        viewport={"width": 393, "height": 852}, device_scale_factor=3, is_mobile=True, has_touch=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    )
    await ctx.add_init_script(INIT_JS)
    if token:
        await ctx.add_init_script(f"localStorage.setItem('carryon_token', {json.dumps(token)});")
    page = await ctx.new_page()
    page_errors = []
    page.on("pageerror", lambda e: page_errors.append(str(e)[:300]))
    for path in paths:
        entry = {"group": label, "path": path, "final_url": "", "offenders_top": [], "offenders_scrolled": [], "error": "", "page_errors": []}
        page_errors.clear()
        try:
            await page.goto(BASE + path, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3500)
            if any('ChunkLoadError' in e or 'Loading chunk' in e for e in page_errors) or await page.query_selector('iframe#webpack-dev-server-client-overlay'):
                page_errors.clear()
                await page.goto(BASE + path, wait_until="networkidle", timeout=45000)
                await page.wait_for_timeout(3500)
            if any('ChunkLoadError' in e or 'Loading chunk' in e for e in page_errors) or await page.query_selector('iframe#webpack-dev-server-client-overlay'):
                page_errors.clear()
                await page.goto(BASE + path, wait_until="networkidle", timeout=45000)
                await page.wait_for_timeout(3500)
            entry["final_url"] = page.url.replace(BASE, "")
            await page.evaluate(EMULATE_JS, [SAFE_TOP, SAFE_BOTTOM])
            await page.wait_for_timeout(400)
            entry["offenders_top"] = await page.evaluate(DETECT_JS, [SAFE_TOP, False])
            if SHOTS and entry["offenders_top"]:
                await page.screenshot(path=f"{OUT}/{label}_{path.strip('/').replace('/', '_').replace('?', '_') or 'root'}_top.png", clip={"x": 0, "y": 0, "width": 393, "height": 200})
            await page.evaluate("window.scrollTo(0, 600)")
            await page.wait_for_timeout(700)
            await page.evaluate(EMULATE_JS, [SAFE_TOP, SAFE_BOTTOM])
            await page.wait_for_timeout(200)
            entry["offenders_scrolled"] = await page.evaluate(DETECT_JS, [SAFE_TOP, True])
            if SHOTS and entry["offenders_scrolled"]:
                await page.screenshot(path=f"{OUT}/{label}_{path.strip('/').replace('/', '_').replace('?', '_') or 'root'}_scrolled.png", clip={"x": 0, "y": 0, "width": 393, "height": 200})
        except Exception as e:  # noqa: BLE001
            entry["error"] = str(e)[:200]
        entry["page_errors"] = list(page_errors)
        report.append(entry)
        n = len(entry["offenders_top"]) + len(entry["offenders_scrolled"])
        print(f"[{label}] {path:38s} -> {entry['final_url'][:40]:40s} {'OK' if n == 0 and not entry['error'] else f'{n} offenders'} {entry['error']}", flush=True)
    await ctx.close()


async def main():
    report = []
    benefactor_tok = await login("info@carryon.us", "Demo1234!")
    admin_tok = await login("founder@carryon.us", "CarryOntheWisdom!")
    ben_tok = mint_beneficiary()
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        if ONLY:
            grp, lst = ONLY.split(":", 1)
            tok = {"public": None, "benefactor": benefactor_tok, "beneficiary": ben_tok, "admin": admin_tok}[grp]
            await sweep(browser, lst.split(","), tok, grp, report)
            await browser.close()
            json.dump(report, open(f"{OUT}/report_only.json", "w"), indent=1)
            return
        await sweep(browser, PUBLIC, None, "public", report)
        await sweep(browser, BENEFACTOR, benefactor_tok, "benefactor", report)
        await sweep(browser, BENEFICIARY, ben_tok, "beneficiary", report)
        await sweep(browser, ADMIN, admin_tok, "admin", report)
        await browser.close()
    json.dump(report, open(f"{OUT}/report.json", "w"), indent=1)
    bad = [r for r in report if r["offenders_top"] or r["offenders_scrolled"] or r["error"]]
    print(f"\n{len(report)} pages swept, {len(bad)} with findings")


asyncio.run(main())
