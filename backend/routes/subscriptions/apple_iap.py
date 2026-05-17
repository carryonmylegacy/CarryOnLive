"""Apple In-App Purchase receipt validation and sync.

Extracted from checkout.py (Monolith Reduction 3/6, Feb 2026).
Handles client-submitted Apple IAP receipts.

Note: `/webhook/apple` (Apple → backend server-to-server notifications) lives
separately in `apple_webhook.py`. This module owns the user-initiated paths:
  - POST /subscriptions/validate-apple-receipt
  - POST /subscriptions/sync-apple
"""

import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request

from config import db, logger
from utils import get_current_user
from routes.subscriptions.apple_webhook import APPLE_TO_PLAN
from routes.subscriptions.plans import router


async def verify_apple_receipt_with_server(receipt_data: str) -> dict:
    """Verify an Apple IAP receipt with Apple's verifyReceipt endpoint.
    Tries production first, falls back to sandbox (App Store review uses sandbox)."""
    import httpx

    apple_shared_secret = os.environ.get("APPLE_SHARED_SECRET", "")
    payload = {
        "receipt-data": receipt_data,
        "password": apple_shared_secret,
        "exclude-old-transactions": True,
    }

    # Try production first
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            prod_res = await client.post("https://buy.itunes.apple.com/verifyReceipt", json=payload)
            prod_data = prod_res.json()

            # Status 21007 means sandbox receipt sent to production
            if prod_data.get("status") == 21007:
                sandbox_res = await client.post(
                    "https://sandbox.itunes.apple.com/verifyReceipt",
                    json=payload,
                )
                return sandbox_res.json()

            return prod_data
        except Exception as e:
            logger.error(f"Apple receipt verification failed: {e}")
            return {"status": -1, "error": str(e)}


@router.post("/subscriptions/validate-apple-receipt")
async def validate_apple_receipt(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Validate an Apple IAP receipt and activate the subscription."""
    data = await request.json()
    transaction_id = data.get("transaction_id")
    product_id = data.get("product_id")
    receipt_data = data.get("receipt")

    if not transaction_id or not product_id:
        raise HTTPException(status_code=400, detail="Missing transaction_id or product_id")

    plan_id = APPLE_TO_PLAN.get(product_id)
    if not plan_id:
        raise HTTPException(status_code=400, detail=f"Unknown product: {product_id}")

    # Prevent transaction replay attacks — check if already used
    existing_txn = await db.apple_transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if existing_txn:
        if existing_txn.get("user_id") == current_user["id"]:
            return {
                "valid": True,
                "plan_id": plan_id,
                "message": "Transaction already validated for this account",
            }
        raise HTTPException(status_code=400, detail="This transaction has already been used")

    # Server-side receipt verification with Apple
    apple_shared_secret = os.environ.get("APPLE_SHARED_SECRET", "")
    if receipt_data and apple_shared_secret:
        verification = await verify_apple_receipt_with_server(receipt_data)
        apple_status = verification.get("status", -1)
        if apple_status != 0:
            logger.warning(
                f"Apple receipt verification status={apple_status} for user "
                f"{current_user['id']}, product={product_id}, txn={transaction_id}"
            )
            raise HTTPException(
                status_code=400,
                detail="Receipt verification failed with Apple",
            )
        logger.info(f"Apple receipt verified successfully for user {current_user['id']}")
    else:
        # No receipt data or no shared secret — trust the StoreKit 2 transaction
        # (StoreKit 2 transactions are already verified by the OS before delivery)
        logger.info(
            f"Skipping server receipt validation for user {current_user['id']} "
            f"(receipt={'present' if receipt_data else 'empty'}, "
            f"secret={'set' if apple_shared_secret else 'missing'})"
        )

    billing_cycle = "annual" if "annual" in product_id else "quarterly" if "quarterly" in product_id else "monthly"

    now = datetime.now(timezone.utc)
    if billing_cycle == "annual":
        period_end = now + timedelta(days=365)
    elif billing_cycle == "quarterly":
        period_end = now + timedelta(days=90)
    else:
        period_end = now + timedelta(days=30)

    # Record the transaction to prevent replay attacks
    await db.apple_transactions.insert_one(
        {
            "transaction_id": transaction_id,
            "user_id": current_user["id"],
            "product_id": product_id,
            "plan_id": plan_id,
            "validated_at": now.isoformat(),
        }
    )

    # Store the Apple subscription
    await db.user_subscriptions.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "user_id": current_user["id"],
                "plan_id": plan_id,
                "plan_name": plan_id.replace("_", " ").title(),
                "status": "active",
                "billing_cycle": billing_cycle,
                "payment_provider": "apple_iap",
                "apple_transaction_id": transaction_id,
                "apple_product_id": product_id,
                "current_period_start": now.isoformat(),
                "current_period_end": period_end.isoformat(),
                "activated_at": now.isoformat(),
            }
        },
        upsert=True,
    )

    return {
        "valid": True,
        "plan_id": plan_id,
        "billing_cycle": billing_cycle,
        "message": "Subscription activated via Apple In-App Purchase",
    }


@router.post("/subscriptions/sync-apple")
async def sync_apple_subscriptions(
    current_user: dict = Depends(get_current_user),
):
    """Sync/restore Apple IAP subscriptions."""
    active_sub = await db.user_subscriptions.find_one(
        {
            "user_id": current_user["id"],
            "payment_provider": "apple_iap",
            "status": "active",
        },
        {"_id": 0},
    )

    if active_sub:
        return {"has_subscription": True, "plan_id": active_sub.get("plan_id")}

    return {"has_subscription": False}
