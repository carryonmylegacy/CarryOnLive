"""CarryOn™ Financial Portal Package — assembles all sub-modules into one router."""

from ._core import router  # noqa: F401 — defines router + models + helpers

# Import sub-modules; their @router decorators register routes on the shared router.
from . import categories  # noqa: F401
from . import bills  # noqa: F401
from . import debts  # noqa: F401
from . import accounts  # noqa: F401
from . import property  # noqa: F401
from . import designations  # noqa: F401
from . import summary  # noqa: F401
from . import portal_aggregate  # noqa: F401
from . import entities  # noqa: F401

__all__ = ["router"]
