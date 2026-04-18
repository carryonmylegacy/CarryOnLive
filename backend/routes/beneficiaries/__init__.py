"""CarryOn™ Beneficiaries Package — assembles all sub-modules into one router."""

from ._core import router  # noqa: F401 — defines router + _grant_fc_free_access_if_applicable

# Import sub-modules; their @router decorators register routes on the shared router.
from . import management  # noqa: F401
from . import access  # noqa: F401
from . import invitations  # noqa: F401
from . import succession  # noqa: F401

__all__ = ["router"]
