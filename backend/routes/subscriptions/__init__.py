"""CarryOn™ Backend — Subscriptions Package

Split from monolithic subscriptions.py for maintainability.
All sub-modules share a single APIRouter.
"""

from fastapi import APIRouter

router = APIRouter()

# Import all sub-modules to register their routes on the shared router
from routes.subscriptions.plans import *  # noqa: F401,F403,E402
from routes.subscriptions.checkout import *  # noqa: F401,F403,E402
from routes.subscriptions.verification import *  # noqa: F401,F403,E402
from routes.subscriptions.b2b import *  # noqa: F401,F403,E402
from routes.subscriptions.lifecycle import *  # noqa: F401,F403,E402
from routes.subscriptions.admin import *  # noqa: F401,F403,E402
