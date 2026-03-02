"""CarryOn™ Backend — Subscriptions Package

Split from monolithic subscriptions.py into:
- plans.py: Plan definitions, settings, trial calc, subscription status
- checkout.py: Stripe checkout, webhooks, plan changes, admin settings
- verification_and_lifecycle.py: Tier verification, B2B codes, family plans, beneficiary lifecycle
"""

from routes.subscriptions.plans import router  # noqa: F401

# These modules register their routes on the same router via import
import routes.subscriptions.checkout  # noqa: F401
import routes.subscriptions.verification_and_lifecycle  # noqa: F401
