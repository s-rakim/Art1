from __future__ import annotations

from typing import Any

from django.contrib import messages
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from ..api import ApiError
from ..forms import FormError


def page_number(request: HttpRequest) -> int:
    try:
        return max(1, min(int(request.GET.get("page", 1)), 10_000))
    except ValueError:
        return 1


def is_htmx(request: HttpRequest) -> bool:
    return request.headers.get("HX-Request") == "true"


def problem(request: HttpRequest, exc: ApiError | FormError) -> None:
    messages.error(request, exc.message)


def field_errors(exc: ApiError) -> dict[str, str]:
    """FastAPI validation details as {field: message}, for showing errors next to inputs."""
    out: dict[str, str] = {}
    details = exc.details
    if isinstance(details, list):
        for item in details:
            if isinstance(item, dict) and item.get("loc"):
                # price_cents in the API is the "price" box on the form.
                out[str(item["loc"][-1]).removesuffix("_cents")] = str(item.get("msg", "Check this value."))
    return out


def hx_toast(request: HttpRequest, template: str, ctx: dict[str, Any], status: int = 200) -> HttpResponse:
    """Renders a fragment plus any queued messages (as an out-of-band toast)."""
    ctx = {**ctx, "oob_messages": True}
    return render(request, template, ctx, status=status)
