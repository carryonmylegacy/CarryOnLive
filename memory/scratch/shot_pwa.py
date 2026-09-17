"""Screenshot pages at iPhone width with emulated safe-area (59px) for visual review.
Usage: cd /app/backend && python3 shot_pwa.py <BASE> <who: public|benefactor|beneficiary> <path> [<path>...]"""
import asyncio, json, sys
import httpx
from playwright.async_api import async_playwright
sys.path.insert(0, '/app/backend')
src = open('/app/memory/scratch/pwa_sweep.py').read()
INIT_JS = src.split('INIT_JS = """')[1].split('"""')[0]
EMULATE_JS = src.split('EMULATE_JS = """')[1].split('"""')[0]
BASE, WHO, PATHS = sys.argv[1], sys.argv[2], sys.argv[3:]

async def main():
    tok = None
    if WHO == "benefactor":
        async with httpx.AsyncClient(timeout=60) as c:
            tok = (await c.post(f"{BASE}/api/auth/login", json={"email": "info@carryon.us", "password": "Demo1234!", "force_login": True})).json()["access_token"]
    elif WHO == "beneficiary":
        from dotenv import load_dotenv; load_dotenv('/app/backend/.env')
        from utils import create_token
        tok = create_token("5a4939be-0ade-487f-9d85-c7e2de4a8a5c", "ben@test.com", "beneficiary", dev_session=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.add_init_script(INIT_JS)
        if tok: await ctx.add_init_script(f"localStorage.setItem('carryon_token', {json.dumps(tok)});")
        page = await ctx.new_page()
        for path in PATHS:
            await page.goto(BASE + path, wait_until="domcontentloaded"); await page.wait_for_timeout(4000)
            await page.evaluate(EMULATE_JS, [59, 34]); await page.wait_for_timeout(500)
            # draw the status bar band so the review image shows what iOS would cover
            await page.evaluate("() => { const d = document.createElement('div'); d.style.cssText='position:fixed;top:0;left:0;right:0;height:59px;background:rgba(255,0,0,0.25);z-index:99999;pointer-events:none;border-bottom:1px solid red'; document.body.appendChild(d); }")
            name = path.strip('/').replace('/', '_').replace('?', '_') or 'root'
            await page.screenshot(path=f"/tmp/sweep/shot_{WHO}_{name}.png")
            print("shot", path, page.url)
        await b.close()
asyncio.run(main())
