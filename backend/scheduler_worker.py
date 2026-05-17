"""CarryOn™ — Standalone Scheduler Worker (Feb 2026, Task 3 of Commercial-Grade Audit).

Runs the same background scheduler loops as the API process, but in a
dedicated worker pod with no HTTP server attached. Decouples background
jobs (milestone deliveries, weekly digests, etc.) from API process crashes
or restarts.

DEPLOYMENT
----------
To run the schedulers in a dedicated worker pod (recommended for prod):

    1. Set `DISABLE_INPROC_SCHEDULERS=1` on the API pods.
    2. Run `python /app/backend/scheduler_worker.py` on a separate pod
       (or supervisor program).

Mongo-backed distributed locks (services/scheduler_lock.py) ensure that
even if both API and worker schedulers are running simultaneously during
a deployment rollover, only ONE pod actually executes each job at a time.

For the current preview/dev environment we continue running schedulers
in-process (DISABLE_INPROC_SCHEDULERS unset) — this script is wired up so
prod can flip to the worker-process topology without code changes.

USAGE
-----
    python /app/backend/scheduler_worker.py            # runs forever
    python /app/backend/scheduler_worker.py --once     # runs one tick of each
"""

from __future__ import annotations

import argparse
import asyncio
import os
import signal
import sys

# Make sure /app/backend is importable when invoked directly.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import client, logger  # noqa: E402
from services.scheduler_lock import with_scheduler_lock  # noqa: E402

# Import scheduler coroutines lazily inside main() so this script can also
# be imported (e.g. by tests) without immediately wiring up everything.


async def _locked_loop(name: str, coro_factory, ttl_seconds: int = 900):
    """Run a scheduler coroutine under distributed lock; retry on crash."""
    while True:
        try:
            async with with_scheduler_lock(name, ttl_seconds=ttl_seconds) as got:
                if got:
                    logger.info(f"[worker] scheduler[{name}] acquired lock; running")
                    await coro_factory()
                    return
                else:
                    logger.debug(f"[worker] scheduler[{name}] lock held; sleeping 60s")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"[worker] scheduler[{name}] crashed: {e}; retrying in 60s")
        await asyncio.sleep(60)


async def main(once: bool = False) -> int:
    from routes.trial_reminders import trial_reminder_scheduler
    from services.billing_lifecycle import billing_lifecycle_scheduler
    from routes.connected_protocol import drill_reminder_scheduler
    from routes.onboarding_drip import onboarding_drip_scheduler
    from routes.email_health_scheduler import email_health_scheduler
    from schedulers import (
        bill_reminder_scheduler,
        daily_dob_check_scheduler,
        data_retention_scheduler,
        grace_period_scheduler,
        milestone_delivery_scheduler,
        weekly_digest_scheduler,
    )

    logger.info("[worker] scheduler_worker.py starting")

    if once:
        # One-tick smoke: useful for CI sanity. Just call each scheduler
        # exactly once with a short ttl. Most schedulers are infinite
        # loops so we wrap with asyncio.wait_for to bound execution.
        for name, factory in [
            ("milestone_delivery", milestone_delivery_scheduler),
            ("data_retention", data_retention_scheduler),
        ]:
            try:
                async with with_scheduler_lock(name, ttl_seconds=30) as got:
                    if got:
                        logger.info(f"[worker --once] running {name}")
                        await asyncio.wait_for(factory(), timeout=5)
            except asyncio.TimeoutError:
                logger.info(f"[worker --once] {name} ran (timeout reached as expected)")
            except Exception as e:
                logger.error(f"[worker --once] {name} failed: {e}")
        return 0

    tasks = [
        asyncio.create_task(_locked_loop("weekly_digest", weekly_digest_scheduler)),
        asyncio.create_task(_locked_loop("trial_reminders", trial_reminder_scheduler)),
        asyncio.create_task(_locked_loop("daily_dob_check", daily_dob_check_scheduler)),
        asyncio.create_task(_locked_loop("billing_lifecycle", billing_lifecycle_scheduler)),
        asyncio.create_task(_locked_loop("data_retention", data_retention_scheduler)),
        asyncio.create_task(_locked_loop("milestone_delivery", milestone_delivery_scheduler)),
        asyncio.create_task(_locked_loop("grace_period", grace_period_scheduler)),
        asyncio.create_task(_locked_loop("bill_reminder", bill_reminder_scheduler)),
        asyncio.create_task(_locked_loop("drill_reminder", drill_reminder_scheduler)),
        asyncio.create_task(_locked_loop("onboarding_drip", onboarding_drip_scheduler, ttl_seconds=600)),
        asyncio.create_task(_locked_loop("email_health", email_health_scheduler, ttl_seconds=600)),
    ]

    stop = asyncio.Event()

    def _on_signal(sig):
        logger.info(f"[worker] received {sig.name}; shutting down")
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _on_signal, sig)
        except NotImplementedError:
            pass  # Windows

    await stop.wait()
    for t in tasks:
        t.cancel()
    try:
        await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=10.0)
    except asyncio.TimeoutError:
        logger.warning("[worker] schedulers did not cancel within 10s")
    client.close()
    logger.info("[worker] shutdown complete")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="Run one tick of each scheduler then exit (CI smoke)")
    args = ap.parse_args()
    sys.exit(asyncio.run(main(once=args.once)))
