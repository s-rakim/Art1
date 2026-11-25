"""The rider's side: shift on/off, sharing location, jobs and earnings."""

from __future__ import annotations

import json

from django.contrib import messages
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .. import auth
from ..api import ApiError, seg
from ..forms import FormError, text
from .account import VEHICLES
from .common import is_htmx, problem

rider_only = auth.role_required("rider")


@require_GET
@rider_only
def dashboard(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    rider = api.get("/rider/me")
    jobs = api.get("/rider/deliveries", scope="active", page_size=20)["items"]
    ctx = {"rider": rider, "jobs": jobs}
    if is_htmx(request):
        return render(request, "bazaar/rider/_jobs.html", ctx)
    return render(request, "bazaar/rider/dashboard.html", ctx)


@require_POST
@rider_only
def shift(request: HttpRequest) -> HttpResponse:
    online = request.POST.get("online") == "true"
    try:
        auth.api_for(request).post("/rider/shift", {"online": online})
        messages.success(request, "You're on shift. Keep this page open to share your location." if online
                         else "You're off shift.")
    except ApiError as exc:
        problem(request, exc)
    return redirect("rider:dashboard")


@require_POST
@rider_only
def location(request: HttpRequest) -> JsonResponse:
    """The browser posts the rider's GPS fix here; we pass it to the API."""
    try:
        data = json.loads(request.body or b"{}")
        body = {"lat": float(data["lat"]), "lng": float(data["lng"])}
        for key in ("accuracy_m", "heading", "speed_mps"):
            if data.get(key) is not None:
                body[key] = float(data[key])
    except (ValueError, KeyError, TypeError):
        return JsonResponse({"error": "bad position"}, status=400)
    if not (-90 <= body["lat"] <= 90 and -180 <= body["lng"] <= 180):
        return JsonResponse({"error": "bad position"}, status=400)
    try:
        auth.api_for(request).post("/rider/location", body)
    except ApiError as exc:
        return JsonResponse({"error": exc.message}, status=exc.status if exc.status < 500 else 502)
    return JsonResponse({"ok": True})


@require_POST
@rider_only
def job(request: HttpRequest, delivery_id: str) -> HttpResponse:
    action = request.POST.get("action")
    if action not in {"accept", "decline", "picked_up", "delivered", "failed"}:
        raise Http404
    body: dict = {"action": action}
    if action == "delivered":
        code = "".join(ch for ch in request.POST.get("code", "") if ch.isdigit())[:6]
        if len(code) != 6:
            messages.error(request, "Enter the buyer's 6-digit handover code.")
            return redirect("rider:dashboard")
        body["code"] = code
    if action in {"failed", "decline"}:
        body["note"] = (request.POST.get("note") or "").strip()[:300] or None
    try:
        auth.api_for(request).request("PATCH", f"/rider/deliveries/{seg(delivery_id)}", json=body)
        messages.success(request, {
            "accept": "Job accepted. Head to the shop.", "decline": "Job passed on.",
            "picked_up": "Picked up. Head to the buyer.", "delivered": "Delivered. Nice work.",
            "failed": "Marked as failed. The shop has been told.",
        }[action])
    except ApiError as exc:
        problem(request, exc)
    return redirect("rider:dashboard")


@require_GET
@rider_only
def earnings(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    return render(request, "bazaar/rider/earnings.html", {
        "rider": api.get("/rider/me"),
        "earnings": api.get("/rider/earnings", page_size=50)["items"],
        "history": api.get("/rider/deliveries", scope="history", page_size=20)["items"],
    })


@require_http_methods(["GET", "POST"])
@auth.role_required("rider_applicant", "customer", "rider")
def pending(request: HttpRequest) -> HttpResponse:
    """Where applicants wait. If they signed up but never sent the form
    (they had to confirm their email first), they can send it here."""
    me = request.me  # type: ignore[attr-defined]
    if me["role"] == "rider":
        return redirect("rider:dashboard")
    api = auth.api_for(request)
    application = None
    try:
        application = api.get("/rider/me")
    except ApiError as exc:
        if exc.status not in (403, 404):
            raise
    ctx: dict = {"application": application, "vehicles": VEHICLES, "values": request.POST, "errors": {}}
    if request.method == "POST" and not application:
        try:
            api.post("/rider/applications", {
                "full_name": text(request.POST, "full_name", required=True, max_len=120, label="Your name"),
                "phone": text(request.POST, "phone", required=True, max_len=40, label="Phone"),
                "city": text(request.POST, "city", required=True, max_len=80, label="City"),
                "vehicle": request.POST.get("vehicle") if request.POST.get("vehicle") in dict(VEHICLES) else "motorbike",
                "licence_number": text(request.POST, "licence_number", max_len=60),
            })
            auth.current_user(request, fresh=True)
            messages.success(request, "Application sent. We'll let you know once an admin has looked at it.")
            return redirect("rider:pending")
        except FormError as exc:
            ctx["errors"] = {exc.field: exc.message}
        except ApiError as exc:
            problem(request, exc)
    return render(request, "bazaar/rider/pending.html", ctx)
