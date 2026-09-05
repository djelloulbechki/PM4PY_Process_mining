"""Stripe Billing Service — Pay-As-You-Go Credits System.

Design principles:
- All Stripe calls go through this module (single source of truth)
- Idempotency keys on every mutating call
- Structured errors that the API layer can translate to HTTP responses
- No Stripe SDK imports outside this file (easy to swap/mock)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import stripe
from stripe import StripeError

from app.config import get_settings

logger = logging.getLogger(__name__)


class StripeServiceError(RuntimeError):
    """Base error for Stripe service failures."""

    def __init__(self, message: str, *, code: str = "stripe_error", detail: str | None = None):
        super().__init__(message)
        self.code = code
        self.detail = detail


class CustomerNotFoundError(StripeServiceError):
    def __init__(self):
        super().__init__("Stripe customer not found", code="customer_not_found")


@dataclass
class CheckoutResult:
    checkout_url: str
    session_id: str


@dataclass
class PortalResult:
    portal_url: str


class StripeService:
    """Thin, safe wrapper around the Stripe SDK for one-time payments."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.stripe_configured:
            raise StripeServiceError(
                "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
                code="stripe_not_configured",
            )
        stripe.api_key = settings.stripe_secret_key
        # Pin API version for stability
        stripe.api_version = "2024-11-20.acacia"
        self.settings = settings

    # ──────────────────────────────────────────────────────────────
    # Customers
    # ──────────────────────────────────────────────────────────────
    def get_or_create_customer(
        self,
        *,
        organization_id: str,
        email: str | None,
        name: str | None = None,
    ) -> str:
        """Return the Stripe customer_id for an organization, creating if needed."""
        from app.db import worker_supabase

        result = (
            worker_supabase.table("billing_accounts")
            .select("stripe_customer_id")
            .eq("organization_id", organization_id)
            .limit(1)
            .execute()
        )
        row = result.data[0] if result.data else None
        if row and row.get("stripe_customer_id"):
            return row["stripe_customer_id"]

        try:
            customer = stripe.Customer.create(
                email=email,
                name=name,
                metadata={"organization_id": organization_id},
                idempotency_key=f"cust-create-{organization_id}",
            )
        except StripeError as exc:
            logger.exception("Failed to create Stripe customer for org %s", organization_id)
            raise StripeServiceError(
                "Could not create billing customer",
                code="customer_create_failed",
                detail=str(exc),
            ) from exc

        worker_supabase.table("billing_accounts").update(
            {"stripe_customer_id": customer.id}
        ).eq("organization_id", organization_id).execute()

        return customer.id

    # ──────────────────────────────────────────────────────────────
    # Checkout (One-Time Payments)
    # ──────────────────────────────────────────────────────────────
    def create_checkout_session(
        self,
        *,
        organization_id: str,
        tier: str,
        success_url: str,
        cancel_url: str,
        customer_email: str | None = None,
        customer_id: str | None = None,
    ) -> CheckoutResult:
        price_id = self.settings.price_id_for_tier(tier)
        if not price_id:
            raise StripeServiceError(
                f"No price configured for tier: {tier}",
                code="invalid_tier",
            )

        if not customer_id:
            customer_id = self.get_or_create_customer(
                organization_id=organization_id,
                email=customer_email,
            )

        try:
            session = stripe.checkout.Session.create(
                customer=customer_id,
                mode="payment",
                line_items=[{"price": price_id, "quantity": 1}],
                success_url=success_url,
                cancel_url=cancel_url,
                allow_promotion_codes=True,
                payment_intent_data={
                    "metadata": {
                        "organization_id": organization_id,
                        "tier": tier,
                        "credits": str(self.settings.tier_definitions[tier]["credits"]),
                    },
                },
                metadata={
                    "organization_id": organization_id,
                    "tier": tier,
                },
                idempotency_key=f"checkout-{organization_id}-{tier}-{price_id}",
            )
        except StripeError as exc:
            logger.exception("Checkout session creation failed")
            raise StripeServiceError(
                "Could not create checkout session",
                code="checkout_failed",
                detail=str(exc),
            ) from exc

        if not session.url:
            raise StripeServiceError("Stripe returned a checkout session without a URL")

        return CheckoutResult(checkout_url=session.url, session_id=session.id)

    # ──────────────────────────────────────────────────────────────
    # Customer Portal
    # ──────────────────────────────────────────────────────────────
    def create_portal_session(
        self,
        *,
        customer_id: str,
        return_url: str,
    ) -> PortalResult:
        try:
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )
        except StripeError as exc:
            logger.exception("Portal session creation failed")
            raise StripeServiceError(
                "Could not create billing portal session",
                code="portal_failed",
                detail=str(exc),
            ) from exc
        return PortalResult(portal_url=session.url)

    # ──────────────────────────────────────────────────────────────
    # Webhook signature verification
    # ──────────────────────────────────────────────────────────────
    def verify_webhook(self, payload: bytes, sig_header: str) -> stripe.Event:
        try:
            return stripe.Webhook.construct_event(
                payload, sig_header, self.settings.stripe_webhook_secret
            )
        except stripe.error.SignatureVerificationError as exc:
            raise StripeServiceError(
                "Invalid webhook signature", code="webhook_signatures_invalid"
            ) from exc
        except ValueError as exc:
            raise StripeServiceError(
                "Malformed webhook payload", code="webhook_payload_invalid"
            ) from exc

    # ──────────────────────────────────────────────────────────────
    # Payment lookup helpers
    # ──────────────────────────────────────────────────────────────
    def get_payment_intent(self, payment_intent_id: str) -> stripe.PaymentIntent:
        try:
            return stripe.PaymentIntent.retrieve(payment_intent_id)
        except StripeError as exc:
            raise StripeServiceError(
                "Could not retrieve payment intent",
                code="payment_retrieve_failed",
                detail=str(exc),
            ) from exc


def get_stripe_service() -> StripeService:
    """Lazy factory — raises only if Stripe is actually used."""
    return StripeService()
