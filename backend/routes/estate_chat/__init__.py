"""CarryOn™ Estate Chat Package — assembles all sub-modules into one router."""

from ._core import router  # noqa: F401 — defines router + helpers + models

# Import sub-modules; their @router decorators register routes on the shared router.
from . import contacts  # noqa: F401
from . import channels  # noqa: F401
from . import messages  # noqa: F401
from . import media  # noqa: F401
from . import search  # noqa: F401

# Re-export serve_chat_file so routes/downloads.py can import it:
#   from routes.estate_chat import serve_chat_file
from .media import serve_chat_file  # noqa: F401

__all__ = ["router", "serve_chat_file"]
