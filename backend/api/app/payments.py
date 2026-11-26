"""Payment providers.

stripe  hosted Stripe Checkout. The order is marked paid only by a signed
        webhook, never by the browser coming back to a success URL.
manual  bank transfer, cash on delivery, etc. An admin marks the order paid.
test    marks the order paid straight away. Refused in production by config.
"""

import asyncio
import logging
import uuid

import stripe

from .config import Settings

log = logging.getLogger("api.payments")


class PaymentError(Exception):
    pass


def _stripe(settings: Settings):
    stripe.api_key = settings.stripe_secret_key
    stripe.max_network_retries = 2
    return stripe


async def create_stripe_checkout(settings: Settings, order: dict, email: str | None) -> tuple[str, str]:
    """Returns (session_id, url). The amount is the order total computed by
    place_order() in the database, nothing the client sent."""
    s = _stripe(settings)
    frontend = settings.frontend_url.rstrip("/")

    def create():
        return s.checkout.Session.create(
            mode="payment",
            customer_email=email or None,
            client_reference_id=str(order["id"]),
            metadata={"order_id": str(order["id"]), "order_number": order["number"]},
            payment_intent_data={"metadata": {"order_id": str(order["id"])}},
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": order["currency"].lower(),
                        "unit_amount": order["total_cents"],
                        "product_data": {"name": f"Order {order['number']}"},
                    },
                }
            ],
            success_url=f"{frontend}/orders/{order['id']}?paid=1",
            cancel_url=f"{frontend}/checkout?canceled={order['id']}",
            idempotency_key=f"order-{order['id']}",
        )

    try:
        session = await asyncio.to_thread(create)
    except stripe.StripeError as exc:
        log.error("stripe checkout failed for %s: %s", order["id"], exc)
        raise PaymentError("Payment provider is unavailable.") from exc
    return session.id, session.url


async def refund_stripe(settings: Settings, payment_ref: str | None, order_id: uuid.UUID) -> None:
    if not payment_ref:
        raise PaymentError("No payment to refund.")
    s = _stripe(settings)

    def refund():
        return s.Refund.create(payment_intent=payment_ref, idempotency_key=f"refund-{order_id}")

    try:
        await asyncio.to_thread(refund)
    except stripe.StripeError as exc:
        log.error("stripe refund failed for %s: %s", order_id, exc)
        raise PaymentError("Refund failed. Nothing was changed.") from exc


def verify_stripe_event(settings: Settings, payload: bytes, signature: str) -> dict:
    return stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret, tolerance=300)
