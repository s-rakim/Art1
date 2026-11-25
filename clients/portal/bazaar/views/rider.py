"""The rider's side: shift on/off, sharing location, jobs and earnings."""

from __future__ import annotations

import json

from django.contrib import messages
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .. import auth
from ..api import ApiError, seg
from ..forms import FormError, text
from .account import VEHICLES
from .common import is_htmx, problem

rider_only = auth.role_required("rider")


BLOCKED = {
    "batch_full": "Your run is full. Finish a drop first.",
    "on_run_far": "Too far from the drops on your run.",
    "pickup_far": "The shop is too far from your other pickups.",
}


def _open_jobs(api) -> dict:
    data = api.get("/rider/open-jobs")
    for j in data["items"]:
        j["blocked_text"] = BLOCKED.get(j.get("blocked_reason") or "", "")
    return data


@require_GET
@rider_only
def dashboard(request: HttpRequest) -> HttpResponse:
    """One page for the whole shift: the map on top, the run in the order
    the orders came in, then the jobs up for grabs."""
    api = auth.api_for(request)
    rider = api.get("/rider/me")
    if is_htmx(request):
        return render(request, "bazaar/rider/_open_jobs.html", {"rider": rider, "open": _open_jobs(api)})
    try:
        run = api.get("/rider/run")
    except ApiError as exc:
        run = {"stops": [], "route": [], "error": exc.message}
    return render(request, "bazaar/rider/dashboard.html", {
        "rider": rider, "open": _open_jobs(api), "run": run, "blocked": BLOCKED,
    })


@require_GET
@rider_only
def map_json(request: HttpRequest) -> JsonResponse:
    """The rider's own map: where they are, the shops still to visit, their
    drops in red with the line to follow, open jobs in yellow (faded when
    they can't be added to this run) and today's finished drops in green.
    No other riders."""
    api = auth.api_for(request)
    try:
        run = api.get("/rider/run")
        open_jobs = api.get("/rider/open-jobs")
        done = api.get("/rider/deliveries", scope="history", page_size=20)["items"]
    except ApiError as exc:
        return JsonResponse({"error": exc.message}, status=exc.status if exc.status < 500 else 502)
    markers: list[dict] = []
    route: list[list[float]] = []
    stop_no = {d["id"]: n for n, d in enumerate(run["stops"], start=1)}
    for w in run["route"]:
        route.append([w["lat"], w["lng"]])
        if w["kind"] == "rider":
            markers.append({"kind": "rider", "lat": w["lat"], "lng": w["lng"], "label": "You"})
        elif w["kind"] == "pickup":
            markers.append({"kind": "store", "lat": w["lat"], "lng": w["lng"],
                            "label": f"Pick up: {w.get('label') or 'shop'}"})
        else:
            ids = w.get("delivery_ids") or []
            n = stop_no.get(ids[0]) if ids else None
            markers.append({"kind": "taken", "lat": w["lat"], "lng": w["lng"], "n": n,
                            "label": f"Drop {n}: {w.get('label') or 'buyer'}" if n else (w.get("label") or "Drop"),
                            "target": f"stop-{ids[0]}" if ids else None})
    for j in open_jobs["items"]:
        spot = j.get("dropoff") or j.get("pickup")
        if not spot:
            continue
        label = f"Order {j['order_number']} · {j['store']['name']}"
        if j.get("area"):
            label += f" → {j['area']}"
        markers.append({"kind": "open", "lat": spot["lat"], "lng": spot["lng"], "label": label,
                        "dim": not j["batchable"], "target": f"open-{j['id']}"})
    today = timezone.localdate()
    for d in done:
        if d["status"] != "delivered" or not d.get("dropoff") or not d.get("delivered_at"):
            continue
        when = parse_datetime(d["delivered_at"])
        if not when or timezone.localdate(when) != today:
            continue
        markers.append({"kind": "done", "lat": d["dropoff"]["lat"], "lng": d["dropoff"]["lng"],
                        "label": f"Delivered: order {d['order_number']}"})
    return JsonResponse({
        "markers": markers, "route": route if len(route) > 1 else [],
        "status": open_jobs.get("ride_status"),
        "count": len(run["stops"]),
    })


@require_POST
@rider_only
def claim(request: HttpRequest) -> HttpResponse:
    """Take one job, or several ticked at once. They are claimed one by one in
    the order shown, so the API can check each against the run so far."""
    only = request.POST.get("only")
    ids = [seg(only)] if only else [seg(i) for i in request.POST.getlist("job")][:20]
    if not ids:
        messages.info(request, "Tick the jobs you want first.")
        return redirect("rider:dashboard")
    api = auth.api_for(request)
    taken = 0
    for job_id in ids:
        try:
            api.post(f"/rider/open-jobs/{job_id}/claim", {})
            taken += 1
        except ApiError as exc:
            reason = BLOCKED.get(exc.code) or exc.message
            messages.warning(request, f"Couldn't take one of them: {reason}")
            break
    if taken:
        messages.success(request, f"{taken} job{'s' if taken != 1 else ''} added to your run. Pick up from the red route.")
    return redirect("rider:dashboard")


@require_POST
@rider_only
def skip(request: HttpRequest, job_id: str) -> HttpResponse:
    try:
        auth.api_for(request).post(f"/rider/open-jobs/{seg(job_id)}/skip", {})
        messages.success(request, "Skipped. You won't be offered that one again.")
    except ApiError as exc:
        problem(request, exc)
    if is_htmx(request):
        api = auth.api_for(request)
        return render(request, "bazaar/rider/_open_jobs.html",
                      {"rider": api.get("/rider/me"), "open": _open_jobs(api), "oob_messages": True})
    return redirect("rider:dashboard")


@require_GET
@rider_only
def payment_lookup(request: HttpRequest, delivery_id: str) -> HttpResponse:
    """The rider types the buyer's name or the transaction code and sees
    what has come in for this order."""
    q = (request.GET.get("q") or "").strip()[:60]
    ctx: dict = {"delivery_id": delivery_id, "q": q, "check": None, "error": None}
    if len(q) < 3:
        ctx["error"] = "Type at least 3 letters of the name, or the code."
    else:
        try:
            ctx["check"] = auth.api_for(request).get(f"/rider/deliveries/{seg(delivery_id)}/payment", q=q)
        except ApiError as exc:
            ctx["error"] = exc.message
    return render(request, "bazaar/rider/_payment.html", ctx)


@require_POST
@rider_only
def payment_confirm(request: HttpRequest, delivery_id: str) -> HttpResponse:
    body: dict = {}
    if request.POST.get("receipt_id"):
        body["receipt_id"] = seg(request.POST["receipt_id"])
    else:
        code = "".join(ch for ch in (request.POST.get("code") or "").upper() if ch.isalnum())[:20]
        if len(code) < 6:
            messages.error(request, "Enter the full transaction code from the buyer's message.")
            return redirect("rider:dashboard")
        body["code"] = code
    try:
        check = auth.api_for(request).post(f"/rider/deliveries/{seg(delivery_id)}/payment", body)
        if check["payment_confirmed"]:
            messages.success(request, "Payment confirmed. Ask for the handover code and finish the drop.")
        else:
            left = check["due_cents"] - check["paid_cents"]
            messages.warning(request, f"Part paid. {left / 100:,.2f} {check['currency']} still to come.")
    except ApiError as exc:
        messages.error(request, {
            "code_used": "That code has already been used. A code only counts once.",
            "not_found": "No payment with that code yet. Check the code, or wait a minute for it to come in.",
            "currency_mismatch": "That payment is in a different currency.",
        }.get(exc.code, exc.message))
    return redirect(f"{reverse('rider:dashboard')}#stop-{seg(delivery_id)}")


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
    if action not in {"accept", "decline", "picked_up", "arrived", "delivered", "failed"}:
        raise Http404
    if action == "arrived":
        try:
            auth.api_for(request).post(f"/rider/deliveries/{seg(delivery_id)}/arrived", {})
            messages.success(request, "The buyer has been told you're at the door, with how to pay.")
        except ApiError as exc:
            problem(request, exc)
        return redirect(f"{reverse('rider:dashboard')}#stop-{seg(delivery_id)}")
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
        auth.api_for(request).patch(f"/rider/deliveries/{seg(delivery_id)}", body)
        messages.success(request, {
            "accept": "Job accepted. Head to the shop.", "decline": "Job passed on.",
            "picked_up": "Picked up. Head to the buyer.", "delivered": "Delivered. Nice work.",
            "failed": "Marked as failed. The shop has been told.",
        }[action])
    except ApiError as exc:
        if exc.code == "payment_not_confirmed":
            messages.error(request, "Confirm the payment first: look it up by the buyer's name or code.")
        else:
            problem(request, exc)
    return redirect(f"{reverse('rider:dashboard')}#stop-{seg(delivery_id)}")


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
