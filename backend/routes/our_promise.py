"""CarryOn™ — Our Promise (public Prime Directive endpoint).

Surfaces the founder's Prime Directive verbatim at a public, no-auth
URL so the lawyers, CPAs, estate planners, and wealth managers a user
hands a CarryOn-generated PDF to can read the exact contract the
platform was built on. The endpoint is intentionally GET-only and
public — there is nothing sensitive here and link-shareability is
the point.

The response shape mirrors the constants in
``services.prime_directive`` so the rendering frontend never has to
parse prose. Pre-push invariants lock the constants to PRD.md so the
contract pitched here can never drift from the contract pitched
internally.
"""

from fastapi import APIRouter

from services.prime_directive import prime_directive_payload

router = APIRouter()


@router.get("/our-promise")
async def get_our_promise():
    """Public — the Prime Directive verbatim. Safe to share, safe to
    cache, safe to scrape. No auth, no PII, no telemetry."""
    return prime_directive_payload()
