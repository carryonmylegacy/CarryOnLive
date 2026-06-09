"""CarryOn™ — Deployment environment detection (single source of truth).

`is_production()` is the canonical check used by the SOC2 production-readiness
gates (docs disable, logging requirements, readiness probe). It mirrors the
env-var convention already used by `seed_e2e_account._looks_like_production`
so "production" means the same thing everywhere.

Production is signalled by ANY of the well-known deploy env vars being set to
a production value (`production` / `prod` / `prod*`). Preview/dev pods set none
of these, so every gate is INERT on preview — no behaviour change locally.
"""

import os

_PROD_ENV_VARS = (
    "ENVIRONMENT",
    "APP_ENV",
    "CARRYON_ENV",
    "DEPLOY_ENV",
    "DEPLOYMENT_ENV",
    "NODE_ENV",
    "RAILWAY_ENVIRONMENT",
    "VERCEL_ENV",
)


def is_production() -> bool:
    """True when any deploy env var signals a production environment."""
    for var in _PROD_ENV_VARS:
        val = (os.environ.get(var) or "").strip().lower()
        if val in ("production", "prod") or val.startswith("prod"):
            return True
    return False
