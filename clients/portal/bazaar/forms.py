"""Small helpers for turning form posts into API bodies."""

from decimal import Decimal, InvalidOperation

from django.http import QueryDict


class FormError(Exception):
    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


def text(data: QueryDict, name: str, *, required: bool = False, max_len: int = 500, label: str = "") -> str | None:
    value = (data.get(name) or "").strip()
    if not value:
        if required:
            raise FormError(name, f"{label or name.replace('_', ' ').capitalize()} is required.")
        return None
    if len(value) > max_len:
        raise FormError(name, f"Keep it under {max_len} characters.")
    return value


def cents(data: QueryDict, name: str, *, required: bool = False, allow_zero: bool = True) -> int | None:
    """An amount typed in the main unit ("12.50") as integer cents."""
    raw = (data.get(name) or "").strip().replace(",", "")
    if not raw:
        if required:
            raise FormError(name, "Enter an amount.")
        return None
    try:
        value = Decimal(raw)
    except InvalidOperation:
        raise FormError(name, "Enter a number like 12.50.") from None
    if value < 0 or (value == 0 and not allow_zero) or value > Decimal("10000000"):
        raise FormError(name, "That amount isn't allowed.")
    if value.as_tuple().exponent < -2:  # type: ignore[operator]
        raise FormError(name, "Use at most two decimal places.")
    return int(value * 100)


def integer(data: QueryDict, name: str, *, required: bool = False, lo: int = 0, hi: int = 1_000_000) -> int | None:
    raw = (data.get(name) or "").strip()
    if not raw:
        if required:
            raise FormError(name, "Enter a whole number.")
        return None
    try:
        value = int(raw)
    except ValueError:
        raise FormError(name, "Enter a whole number.") from None
    if not lo <= value <= hi:
        raise FormError(name, f"Enter a number from {lo} to {hi}.")
    return value


def rate(data: QueryDict, name: str) -> float | None:
    """A percentage typed as "12.5" as the API's fraction 0.125."""
    raw = (data.get(name) or "").strip()
    if not raw:
        return None
    try:
        value = Decimal(raw)
    except InvalidOperation:
        raise FormError(name, "Enter a percentage like 12.5.") from None
    if not 0 <= value <= 100:
        raise FormError(name, "Enter a percentage from 0 to 100.")
    return float(value / 100)


def boolean(data: QueryDict, name: str) -> bool:
    return data.get(name) in {"on", "true", "1", "yes"}
