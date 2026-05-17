"""CarryOn™ Backend — Subscriptions Package

Split from monolithic subscriptions.py into:
- plans.py: Plan definitions, settings, trial calc, Stripe payment methods
- status.py: Read-only /subscriptions/plans (public) + /subscriptions/status
- checkout.py: Stripe checkout, webhooks, plan changes, cancellation (LIVE revenue)
- admin.py: Admin subscription settings, user overrides, plan-price endpoints
- apple_iap.py: Apple In-App Purchase receipt validation + sync
- apple_webhook.py: Apple → backend server-to-server notifications
- founders_circle.py: Founders Circle lifetime subscriptions
- verification_and_lifecycle.py: Tier verification, B2B codes, family plans
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

from routes.subscriptions.verification_and_lifecycle import (  # noqa: F401
    check_dob_subscription_events,
)

# These modules register their routes on the shared router
import routes.subscriptions.status  # noqa: F401
import routes.subscriptions.checkout  # noqa: F401
import routes.subscriptions.admin  # noqa: F401
import routes.subscriptions.apple_iap  # noqa: F401
import routes.subscriptions.verification_and_lifecycle  # noqa: F401
import routes.subscriptions.apple_webhook  # noqa: F401
import routes.subscriptions.founders_circle  # noqa: F401
