"""Billing API — Checkout, Portal, and Account Status.

All endpoints require authentication and organization membership.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.auth import get_current_user, get_user_supabase
from app.config import get_settings
from app.schemas import (
    BillingAccountResponse,
    CheckoutRequest,
    CheckoutResponse,
    PortalRequest,
    PortalResponse,
    TierResponse,
)
from app.services.stripe_service import StripeServiceError, get_stripe_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


def _verify_membership(sb: Client, org_id: str, user_id: str) -> str:
    """Verify user is a member of the organization with sufficient role."""
    result = (
        sb.table("organization_members")
        .select("role")
        .eq("organization_id", org_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=403, detail="Organization access denied.")
    role = result.data[0]["role"]
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role for billing operations.")
    return role


@router.get("/tiers", response_model=list[TierResponse])
def list_tiers(user: dict = Depends(get_current_user)):
    """List available pricing tiers."""
    del user
    settings = get_settings()
    return [
        TierResponse(
            code=tier_code,
            name=tier_def["name"],
            price_usd=tier_def["price_usd"],
            max_rows=tier_def["max_rows"],
            max_file_size_bytes=tier_def["max_file_size_bytes"],
            credits=tier_def["credits"],
        )
        for tier_code, tier_def in settings.tier_definitions.items()
    ]


@router.get("/account", response_model=BillingAccountResponse)
def get_billing_account(
    organization_id: str,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    """Get billing account info (credits balance, etc.)."""
    _verify_membership(sb, organization_id, user["sub"])

    result = (
        sb.table("billing_accounts")
        .select("credits_balance, credits_purchased, created_at, updated_at")
        .eq("organization_id", organization_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Billing account not found.")

    return BillingAccountResponse(
        organization_id=organization_id,
        credits_balance=result.data["credits_balance"],
        credits_purchased=result.data.get("credits_purchased", 0),
        created_at=result.data["created_at"],
        updated_at=result.data["updated_at"],
    )


@router.get("/transactions")
def list_transactions(
    organization_id: str,
    limit: int = 50,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    """List credit transactions (purchases, usage, refunds)."""
    _verify_membership(sb, organization_id, user["sub"])

    limit = min(max(limit, 1), 100)
    result = (
        sb.table("credit_transactions")
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    return {"transactions": result.data or []}


@router.post("/checkout", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
def create_checkout(
    body: CheckoutRequest,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    """Create a Stripe Checkout session for purchasing a pass."""
    _verify_membership(sb, body.organization_id, user["sub"])

    settings = get_settings()
    if not settings.stripe_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not configured.",
        )

    if body.tier not in settings.tier_definitions:
        raise HTTPException(status_code=400, detail=f"Invalid tier: {body.tier}")

    try:
        service = get_stripe_service()

        user_result = sb.auth.get_user(user["access_token"])
        user_email = user_result.user.email if user_result.user else None

        result = service.create_checkout_session(
            organization_id=body.organization_id,
            tier=body.tier,
            success_url=f"{settings.frontend_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.frontend_url}/billing?canceled=true",
            customer_email=user_email,
        )

        return CheckoutResponse(
            checkout_url=result.checkout_url,
            session_id=result.session_id,
        )

    except StripeServiceError as exc:
        logger.exception("Checkout creation failed")
        raise HTTPException(status_code=400, detail=exc.code)


@router.post("/portal", response_model=PortalResponse)
def create_portal(
    body: PortalRequest,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    """Create a Stripe Customer Portal session for payment history."""
    _verify_membership(sb, body.organization_id, user["sub"])

    settings = get_settings()
    if not settings.stripe_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not configured.",
        )

    account = (
        sb.table("billing_accounts")
        .select("stripe_customer_id")
        .eq("organization_id", body.organization_id)
        .single()
        .execute()
    )

    if not account.data or not account.data.get("stripe_customer_id"):
        raise HTTPException(
            status_code=400,
            detail="No billing history found. Please make a purchase first.",
        )

    try:
        service = get_stripe_service()
        result = service.create_portal_session(
            customer_id=account.data["stripe_customer_id"],
            return_url=f"{settings.frontend_url}/billing",
        )

        return PortalResponse(portal_url=result.portal_url)

    except StripeServiceError as exc:
        logger.exception("Portal creation failed")
        raise HTTPException(status_code=400, detail=exc.code)
