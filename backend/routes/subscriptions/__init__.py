"""CarryOn™ Backend — Subscriptions Package

Split from monolithic subscriptions.py into:
- plans.py: Plan definitions, settings, trial calc, Stripe payment methods
- checkout.py: Stripe checkout, webhooks, plan changes, admin settings
- verification_and_lifecycle.py: Tier verification, B2B codes, family plans, beneficiary lifecycle
"""

# Re-export shared constants and functions for external imports
from routes.subscriptions.plans import (  # noqa: F401
    router,
    DEFAULT_PLANS,
    BENEFICIARY_PLANS,
    get_subscription_settings,
    calculate_trial_status,
    get_price_for_cycle,
)

# These modules register their routes on the shared router
import routes.subscriptions.checkout  # noqa: F401
import routes.subscriptions.verification_and_lifecycle  # noqa: F401
