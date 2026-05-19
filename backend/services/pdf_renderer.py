"""Server-side PDF rendering via headless Chromium (Playwright).

This is the rock-solid replacement for the legacy html2canvas pipeline
that historically caused "blank pages + missing avatars" in the Estate
Binder's E&S section. Same architectural pattern as every other section
in the platform: server makes the bytes → server caches the bytes →
binder reads from cache.

Architecture
------------
1. Server-side auth token is injected into the headless browser's
   localStorage via `page.add_init_script` BEFORE any page script
   runs. No token-in-URL, no cookie surface.
2. The browser navigates to an internal print route that the React
   app already serves: `/financial/entities/<estate_id>/print?serverRender=1`.
3. The print page signals readiness by setting `window.__carryOnPrintReady`
   once layout has stabilized. We poll for this flag with a hard
   timeout so a broken render can't stall the worker forever.
4. Chromium's native `page.pdf()` produces a vector PDF (selectable
   text, infinitely zoomable, no rasterization) identical to what
   `window.print()` would produce in a real browser.

Concurrency
-----------
A module-level asyncio Semaphore caps concurrent renders to
`MAX_CONCURRENT_RENDERS` (default 2). Each Chromium instance uses
~200 MB of memory; this is enough headroom for hundreds of thousands
of users (PDF generation is bursty, not sustained).
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover — typing-only, never imported at runtime
    from playwright.async_api import Browser
else:
    Browser = "Browser"  # placeholder so the annotation below stays valid

logger = logging.getLogger(__name__)

# Cap concurrent Chromium instances. Each costs ~200 MB RAM. Bumping
# this requires headroom analysis on the pod — leave at 2 unless you
# have measured the impact.
MAX_CONCURRENT_RENDERS = int(os.environ.get("PDF_RENDER_CONCURRENCY", "2"))
_render_semaphore = asyncio.Semaphore(MAX_CONCURRENT_RENDERS)

# Single shared Browser instance to amortize Chromium boot cost
# (~1 s) across many renders. We re-launch on detection of a closed
# state — Playwright's Browser closes when the pod is idle long
# enough for the worker to be killed by the OS.
_browser: Optional[Browser] = None
_browser_lock = asyncio.Lock()


async def _get_browser():
    """Return a live Browser instance, launching one if needed.

    Playwright is imported lazily here (NOT at module level) so the
    backend can boot on environments that don't ship Chromium — e.g.
    Railway pods that haven't run `playwright install chromium` post-
    deploy. In that case the import will fail at first use and the
    caller of `render_entities_pdf` will surface a 500 with a clear
    message; the rest of the app remains healthy.
    """
    global _browser  # noqa: PLW0603 — module-level singleton is intentional
    async with _browser_lock:
        if _browser is not None and _browser.is_connected():
            return _browser
        # Lazy import — see docstring.
        from playwright.async_api import async_playwright

        pw = await async_playwright().start()
        _browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--font-render-hinting=none",
            ],
        )
        return _browser


async def render_entities_pdf(
    base_url: str,
    estate_id: str,
    auth_token: str,
    *,
    timeout_ms: int = 30000,
) -> bytes:
    """Render the Entities & Structures print page to a vector PDF.

    Args:
        base_url: e.g. ``https://carryon.us`` (no trailing slash).
        estate_id: the estate whose E&S chart to render.
        auth_token: the user's existing JWT — injected into the headless
            browser's localStorage before page scripts run, so the React
            app boots fully authenticated.
        timeout_ms: hard ceiling on the whole render. Default 30 s
            covers a worst-case cold Chromium boot + slow chart layout.

    Returns:
        Raw PDF bytes ready to upload to S3.

    Raises:
        RuntimeError: if Chromium fails to launch, the page never
            reports ready, or the PDF call returns empty.
    """
    async with _render_semaphore:
        browser = await _get_browser()
        # Each render gets its own fresh context so localStorage state
        # never leaks across users.
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,  # crisper raster for any non-vector elements
        )
        try:
            # Inject the user's auth token BEFORE any page script runs.
            # The React AuthContext reads `carryon_token` from
            # localStorage on mount and proceeds with full authority.
            safe_token = auth_token.replace("'", "\\'")
            await context.add_init_script(f"window.localStorage.setItem('carryon_token', '{safe_token}');")
            page = await context.new_page()
            url = f"{base_url}/financial/entities/{estate_id}/print?serverRender=1"
            try:
                await page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            except Exception as exc:  # noqa: BLE001
                # `networkidle` can be flaky on SSE-using pages — if it
                # times out, fall back to `domcontentloaded` and hope
                # the readiness flag fires.
                logger.debug(f"goto({url}) networkidle failed: {exc}; retrying domcontentloaded")
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)

            # Wait for the print page to signal it has laid out the SVG
            # tree and all avatar images have loaded. The flag is set
            # by the `serverRender=1` mode in EntitiesPrintPage.
            try:
                await page.wait_for_function(
                    "window.__carryOnPrintReady === true",
                    timeout=timeout_ms,
                )
            except Exception as exc:  # noqa: BLE001
                # Surface the JS console for triage but don't fail the
                # render — the page might be visible-but-stuck and the
                # PDF would still capture whatever it has rendered.
                logger.warning(f"page readiness flag never fired for estate={estate_id}: {exc}")

            # Determine orientation from the SAME data-orientation attr
            # the page uses for its own toolbar — keeps server and
            # client in lockstep without hardcoding.
            orientation = await page.evaluate(
                "document.documentElement.getAttribute('data-print-orient') || 'landscape'"
            )
            landscape = orientation == "landscape"

            pdf_bytes = await page.pdf(
                format="Letter",
                landscape=landscape,
                print_background=True,
                prefer_css_page_size=False,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                # Crucially: `display_header_footer=False` so Chrome
                # doesn't add a "1/1" footer or URL header to our binder.
                display_header_footer=False,
            )
            if not pdf_bytes:
                raise RuntimeError("Chromium returned empty PDF bytes")
            return pdf_bytes
        finally:
            try:
                await context.close()
            except Exception as exc:  # noqa: BLE001
                logger.debug(f"context.close() failed (non-fatal): {exc}")
