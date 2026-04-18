"""CarryOn™ Estate Chat Package.
All implementation lives in _impl.py — future splits welcome.
"""

from ._impl import router  # noqa: F401
from ._impl import serve_chat_file  # noqa: F401 — used by routes/downloads.py

__all__ = ["router", "serve_chat_file"]
