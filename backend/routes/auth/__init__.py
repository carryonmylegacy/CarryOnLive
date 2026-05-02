"""CarryOn™ Auth Package — assembles all auth sub-modules into one router.

server.py imports: from routes.auth import router as auth_router
This is identical to how it imported from the old single-file routes/auth.py.
"""

# Import _core first (defines the shared router + utilities)
from ._core import router  # noqa: F401

# Re-export utility functions used by other route modules
# (beneficiaries.py, funnel.py, operators.py all import from routes.auth)
from ._core import (  # noqa: F401
    _user_response,
    create_dev_session_token,
    create_session_token,
    generate_unique_username,
    resolve_user_by_identifier,
    validate_username,
)

# Import sub-modules so their @router.xxx decorators register on the shared router.
from . import login  # noqa: F401
from . import register  # noqa: F401
from . import profile  # noqa: F401
from . import password  # noqa: F401
from . import sessions  # noqa: F401
from . import sms  # noqa: F401
from . import dev  # noqa: F401
from . import offline  # noqa: F401

__all__ = [
    "router",
    "_user_response",
    "create_dev_session_token",
    "create_session_token",
    "generate_unique_username",
    "resolve_user_by_identifier",
    "validate_username",
]
