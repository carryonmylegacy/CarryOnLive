"""CarryOn™ Share Cards Package — assembles all sub-modules into one router.

server.py imports: from routes.share_cards import router as share_cards_router
schedulers.py imports: from routes.share_cards import send_voices_digest, send_voices_social_brief
Both paths are identical to how they imported from the old single-file routes/share_cards.py.
"""

from ._helpers import router  # noqa: F401 — defines router and all shared utilities

# Import sub-modules so their @router.xxx decorators register on the shared router.
from . import cards  # noqa: F401
from . import voices  # noqa: F401
from . import digest  # noqa: F401

# Re-export scheduler functions so schedulers.py can do:
# from routes.share_cards import send_voices_digest, send_voices_social_brief
from .digest import send_voices_digest, send_voices_social_brief  # noqa: F401

__all__ = ["router", "send_voices_digest", "send_voices_social_brief"]
