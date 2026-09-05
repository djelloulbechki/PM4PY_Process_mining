"""Stripe Webhooks Handler — Production-grade with idempotency.

Security:
- Signature verification is mandatory
- Idempotency via UNIQUE constraint on stripe_payment_id
- Atomic credit addition via RPC

Reliability:
- Rejects events older than 5 minutes (replay protection)
- Logs all events for observability
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException, Request, status

from app.services.stripe_service import StripeServiceError, get_stripe_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["billing-webhooks"])

# Reject events older than 5 minutes (replay protection)
MAX_EVENT_AGE_SECONDS = 300


@router.post("/webhooks", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not sig_header:
        logger.warning("Webhook received without signature header")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing stripe-signature header",
        )

    try:
        service = get_stripe_service()
        event = service.verify_webhook(payload, sig_header)
    except StripeServiceError as exc:
        logger.warning("Webhook signature verification failed: %s", exc.code)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.code,
        )

    # Replay protection: reject old events
    event_created = event.get("created", 0)
    if time.time() - event_created > MAX_EVENT_AGE_SECONDS:
        logger.warning(
            "Rejecting old webhook event: id=%s, created=%d",
            event["id"],
            event_created,
        )
        return {"received": True, "ignored": "event_too_old"}

    event_type = event["type"]
    logger.info("Received Stripe webhook: %s (id=%s)", event_type, event["id"])

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(event)
    elif event_type == "payment_intent.succeeded":
        logger.info(
            "Payment succeeded (redundant): %s",
            event["data"]["object"].get("id"),
        )
    elif event_type == "payment_intent.payment_failed":
        payment_intent = event["data"]["object"]
        logger.warning(
            "Payment failed: %s (org=%s, error=%s)",
            payment_intent.get("id"),
            payment_intent.get("metadata", {}).get("organization_id"),
            payment_intent.get("last_payment_error", {}).get("message"),
        )
    else:
        logger.info("Ignoring unhandled webhook event: %s", event_type)

    return {"received": True}


async def _handle_checkout_completed(event: dict) -> None:
    """Add credits to billing account after successful checkout.

    Idempotency: UNIQUE constraint on stripe_payment_id prevents double-crediting.
    Atomicity: RPC handles both balance update and transaction log in one transaction.
    """
    from app.db import worker_supabase
    from app.config import get_settings

    session = event["data"]["object"]
    payment_intent_id = session.get("payment_intent")
    organization_id = session.get("metadata", {}).get("organization_id")
    tier = session.get("metadata", {}).get("tier")

    if not payment_intent_id or not organization_id or not tier:
        logger.warning(
            "Checkout session missing required metadata: payment_intent=%s, org=%s, tier=%s",
            payment_intent_id,
            organization_id,
            tier,
        )
        return

    settings = get_settings()
    tier_def = settings.tier_definitions.get(tier)
    if not tier_def:
        logger.error("Unknown tier in checkout: %s", tier)
        return

    credits_to_add = tier_def["credits"]

    # Get user_id from org owner
    owner_result = (
        worker_supabase.table("organization_members")
        .select("user_id")
        .eq("organization_id", organization_id)
        .eq("role", "owner")
        .limit(1)
        .execute()
    )
    user_id = owner_result.data[0]["user_id"] if owner_result.data else None

    # Atomic credit addition via RPC
    result = worker_supabase.rpc(
        "add_credits_atomic",
        {
            "p_organization_id": organization_id,
            "p_user_id": user_id,
            "p_credits": credits_to_add,
            "p_stripe_payment_id": payment_intent_id,
            "p_stripe_price_id": session.get("metadata", {}).get("price_id"),
            "p_tier_name": tier_def["name"],
            "p_metadata": {
                "stripe_session_id": session.get("id"),
                "tier": tier,
                "amount_total": session.get("amount_total"),
                "currency": session.get("currency"),
            },
        },
    ).execute()

    if result.data and result.data[0].get("success"):
        logger.info(
            "Added %d credits to org %s (tier=%s, payment=%s, new_balance=%d)",
            credits_to_add,
            organization_id,
            tier,
            payment_intent_id,
            result.data[0]["new_balance"],
        )
    else:
        error_msg = result.data[0].get("error_message") if result.data else "unknown"
        logger.error(
            "Failed to add credits for org %s: %s",
            organization_id,
            error_msg,
        )
