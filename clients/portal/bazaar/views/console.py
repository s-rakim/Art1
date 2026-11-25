"""The admin console: every price and fee, hiring riders, stores, live map."""

from __future__ import annotations

from django.contrib import messages
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .. import auth
from ..api import ApiError, seg
from ..forms import FormError, boolean, cents, integer, km, rate, text
from .common import field_errors, page_number, problem

admin_only = auth.role_required("admin")


def _given(body: dict) -> dict:
    """Leave out fields left empty, so they keep their current value."""
    return {k: v for k, v in body.items() if v is not None}


@require_GET
@admin_only
def dashboard(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    period = request.GET.get("period") if request.GET.get("period") in {"7d", "30d", "90d", "365d"} else "30d"
    return render(request, "bazaar/console/dashboard.html", {
        "stats": api.get("/admin/stats"),
        "income": api.get("/admin/income", period=period),
        "period": period,
        "applicants": api.get("/admin/rider-applications", page_size=5)["items"],
    })


@require_http_methods(["GET", "POST"])
@admin_only
def pricing(request: HttpRequest) -> HttpResponse:
    """Every amount the shop charges is set here. Nothing is hard-coded."""
    api = auth.api_for(request)
    errors: dict = {}
    if request.method == "POST":
        section = request.POST.get("section")
        try:
            if section == "fees":
                body = {
                    "standard_shipping_cents": cents(request.POST, "standard_shipping", required=True),
                    "express_shipping_cents": cents(request.POST, "express_shipping", required=True),
                    "free_shipping_over_cents": cents(request.POST, "free_shipping_over"),
                    "rider_fee_cents": cents(request.POST, "rider_fee", required=True),
                    "tax_rate": rate(request.POST, "tax_rate") or 0.0,
                }
                api.patch("/admin/settings", body)
            elif section == "plan":
                pid = seg(request.POST.get("plan_id", ""))
                api.patch(f"/admin/plans/{pid}", {
                    "monthly_price_cents": cents(request.POST, "monthly_price", required=True),
                    "commission_rate": rate(request.POST, "commission_rate"),
                    "per_item_fee_cents": cents(request.POST, "per_item_fee"),
                    "product_limit": integer(request.POST, "product_limit", lo=0, hi=1_000_000),
                })
            elif section == "slot":
                sid = seg(request.POST.get("slot_id", ""))
                api.patch(f"/admin/placement-slots/{sid}", {
                    "daily_price_cents": cents(request.POST, "daily_price", required=True),
                    "capacity": integer(request.POST, "capacity", lo=0, hi=100),
                    "is_active": boolean(request.POST, "is_active"),
                })
            elif section == "riders":
                api.patch("/admin/settings", _given({
                    "rider_commission_rate": rate(request.POST, "rider_commission_rate"),
                    "rider_pool_radius_km": km(request.POST, "rider_pool_radius_km"),
                    "rider_batch_radius_km": km(request.POST, "rider_batch_radius_km"),
                    "rider_pickup_radius_km": km(request.POST, "rider_pickup_radius_km"),
                    "rider_max_batch": integer(request.POST, "rider_max_batch", lo=1, hi=20),
                }))
            elif section == "payouts":
                api.patch("/admin/settings", _given({
                    "payout_interval_days": integer(request.POST, "payout_interval_days", lo=1, hi=90),
                    "payment_code_ttl_hours": integer(request.POST, "payment_code_ttl_hours", lo=1, hi=24 * 90),
                }))
            else:
                raise Http404
            messages.success(request, "Prices saved. They apply to new orders and the next billing run.")
            return redirect("console:pricing")
        except FormError as exc:
            errors = {exc.field: exc.message}
            problem(request, exc)
        except ApiError as exc:
            errors = field_errors(exc)
            problem(request, exc)
    return render(request, "bazaar/console/pricing.html", {
        "settings": api.site_settings(),
        "plans": api.get("/admin/plans"),
        "slots": api.get("/admin/placement-slots"),
        "errors": errors,
    })


@require_http_methods(["GET", "POST"])
@admin_only
def site(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    if request.method == "POST":
        try:
            api.patch("/admin/settings", {
                "contact_name": text(request.POST, "contact_name", max_len=120),
                "contact_email": text(request.POST, "contact_email", max_len=254),
                "contact_phone": text(request.POST, "contact_phone", max_len=40),
                "contact_whatsapp": text(request.POST, "contact_whatsapp", max_len=40),
                "contact_note": text(request.POST, "contact_note", max_len=500),
                "vendor_signups_open": boolean(request.POST, "vendor_signups_open"),
                "rider_signups_open": boolean(request.POST, "rider_signups_open"),
                "maintenance_mode": boolean(request.POST, "maintenance_mode"),
                "maintenance_message": text(request.POST, "maintenance_message", max_len=500),
                "mpesa_till": text(request.POST, "mpesa_till", max_len=20),
                "mpesa_paybill": text(request.POST, "mpesa_paybill", max_len=20),
                "payment_account_name": text(request.POST, "payment_account_name", max_len=120),
                "bank_name": text(request.POST, "bank_name", max_len=120),
                "bank_account_name": text(request.POST, "bank_account_name", max_len=120),
                "bank_account_number": text(request.POST, "bank_account_number", max_len=40),
                "payment_instructions": text(request.POST, "payment_instructions", max_len=500),
            })
            messages.success(request, "Site settings saved.")
            return redirect("console:site")
        except (ApiError, FormError) as exc:
            problem(request, exc)
    return render(request, "bazaar/console/site.html", {"settings": api.site_settings()})


@require_GET
@admin_only
def riders(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    status = request.GET.get("status") if request.GET.get("status") in {"active", "suspended", "rejected"} else None
    return render(request, "bazaar/console/riders.html", {
        "applicants": api.get("/admin/rider-applications", page_size=50)["items"],
        "riders": api.get("/admin/riders", status=status, page=page_number(request), page_size=50)["items"],
        "status": status,
    })


@require_POST
@admin_only
def rider_action(request: HttpRequest, rider_id: str) -> HttpResponse:
    api = auth.api_for(request)
    rid = seg(rider_id)
    action = request.POST.get("action")
    note = (request.POST.get("note") or "").strip()[:500] or None
    try:
        if action == "hire":
            api.post(f"/admin/rider-applications/{rid}/approve", {"note": note})
            messages.success(request, "Rider hired. They can sign in and start a shift now.")
        elif action == "reject":
            api.post(f"/admin/rider-applications/{rid}/reject", {"note": note})
            messages.success(request, "Application turned down.")
        elif action in {"suspend", "reinstate"}:
            api.patch(f"/admin/riders/{rid}", {"status": "suspended" if action == "suspend" else "active",
                                               "review_note": note})
            messages.success(request, "Rider suspended." if action == "suspend" else "Rider reinstated.")
        elif action == "settle":
            api.post(f"/admin/riders/{rid}/settle", {})
            messages.success(request, "Rider's unpaid earnings marked as paid.")
        else:
            raise Http404
    except ApiError as exc:
        problem(request, exc)
    return redirect("console:riders")


@require_GET
@admin_only
def stores(request: HttpRequest) -> HttpResponse:
    status = request.GET.get("status") if request.GET.get("status") in {"pending", "active", "suspended", "rejected"} else None
    q = (request.GET.get("q") or "").strip()[:120]
    data = auth.api_for(request).get("/admin/stores", status=status, q=q, page=page_number(request), page_size=50)
    return render(request, "bazaar/console/stores.html", {"stores": data["items"], "status": status, "q": q})


@require_POST
@admin_only
def store_action(request: HttpRequest, store_id: str) -> HttpResponse:
    status = request.POST.get("status")
    if status not in {"active", "suspended", "rejected"}:
        raise Http404
    try:
        auth.api_for(request).patch(f"/admin/stores/{seg(store_id)}", {
            "status": status, "review_note": (request.POST.get("note") or "").strip()[:500] or None,
        })
        messages.success(request, {"active": "Store approved.", "suspended": "Store suspended.",
                                   "rejected": "Store turned down."}[status])
    except ApiError as exc:
        problem(request, exc)
    return redirect("console:stores")


@require_GET
@admin_only
def live(request: HttpRequest) -> HttpResponse:
    return render(request, "bazaar/console/live.html")


@require_GET
@admin_only
def live_json(request: HttpRequest) -> JsonResponse:
    try:
        data = auth.api_for(request).get("/admin/deliveries")
    except ApiError as exc:
        return JsonResponse({"error": exc.message}, status=502)
    markers = []
    for r in data["riders"]:
        if r.get("lat") is not None:
            markers.append({"kind": "rider", "lat": r["lat"], "lng": r["lng"],
                            "label": f"{r['name']} · {r['vehicle']}" + (" · busy" if r["busy"] else " · free")})
    for d in data["deliveries"]:
        if d.get("pickup"):
            markers.append({"kind": "store", "lat": d["pickup"]["lat"], "lng": d["pickup"]["lng"], "label": d["store_name"]})
        if d.get("dropoff"):
            markers.append({"kind": "home", "lat": d["dropoff"]["lat"], "lng": d["dropoff"]["lng"],
                            "label": f"Order {d['order_number']} · {d['status'].replace('_', ' ')}"})
    rows = [{"order": d["order_number"], "store": d["store_name"], "rider": d["rider_name"],
             "status": d["status"]} for d in data["deliveries"]]
    return JsonResponse({"markers": markers, "rows": rows, "count": len(rows)})


# ---- Payments: one till for the whole market ------------------------------------------

PAYMENT_STATUSES = [("unconfirmed", "Not used yet"), ("confirmed", "Confirmed"), ("expired", "Expired"), ("void", "Void")]


@require_http_methods(["GET", "POST"])
@admin_only
def payments(request: HttpRequest) -> HttpResponse:
    """The databank of M-Pesa and bank payments. Paste texts to read them,
    check what was found, then save. Each code can confirm one order, once."""
    api = auth.api_for(request)
    preview = None
    pasted = ""
    if request.method == "POST":
        pasted = (request.POST.get("text") or "")[:200_000]
        commit = request.POST.get("commit") == "1"
        if not pasted.strip():
            messages.error(request, "Paste at least one message.")
        else:
            try:
                out = api.post("/admin/payments/import", {"text": pasted, "commit": commit})
                if commit:
                    messages.success(request, f"{out['stored']} payment{'s' if out['stored'] != 1 else ''} saved. "
                                     "Riders can now confirm them at the door.")
                    return redirect("console:payments")
                preview = out
            except ApiError as exc:
                problem(request, exc)
    status = request.GET.get("status") if request.GET.get("status") in dict(PAYMENT_STATUSES) else None
    q = (request.GET.get("q") or "").strip()[:60]
    data = api.get("/admin/payments", status=status, q=q, page=page_number(request), page_size=50)
    return render(request, "bazaar/console/payments.html", {
        "receipts": data["items"], "total": data["total"], "status": status, "q": q,
        "statuses": PAYMENT_STATUSES, "preview": preview, "pasted": pasted,
    })


@require_POST
@admin_only
def payment_action(request: HttpRequest, receipt_id: str) -> HttpResponse:
    rid = seg(receipt_id)
    try:
        if request.POST.get("action") == "apply":
            number = (request.POST.get("order_number") or "").strip()[:40]
            if not number:
                raise FormError("order_number", "Type the order number to apply this payment to.")
            auth.api_for(request).patch(f"/admin/payments/{rid}", {"order_number": number})
            messages.success(request, f"Applied to order {number}.")
        elif request.POST.get("action") == "void":
            note = (request.POST.get("note") or "").strip()[:300]
            if not note:
                raise FormError("note", "Say why it's being voided.")
            auth.api_for(request).patch(f"/admin/payments/{rid}", {"status": "void", "note": note})
            messages.success(request, "Payment voided. Its code can't be used.")
        else:
            raise Http404
    except FormError as exc:
        messages.error(request, exc.message)
    except ApiError as exc:
        problem(request, exc)
    return redirect("console:payments")


@require_GET
@admin_only
def settlements(request: HttpRequest) -> HttpResponse:
    return render(request, "bazaar/console/settlements.html",
                  {"rows": auth.api_for(request).get("/admin/settlements")})


@require_POST
@admin_only
def settle(request: HttpRequest, store_id: str) -> HttpResponse:
    try:
        reference = text(request.POST, "reference", required=True, max_len=80, label="Reference")
        body = {
            "amount_cents": cents(request.POST, "amount"),
            "reference": reference,
            "note": text(request.POST, "note", max_len=300),
            "force": request.POST.get("force") == "1",
        }
        if body["force"] and not body["note"]:
            raise FormError("note", "Paying before the books balance needs a note saying why.")
        auth.api_for(request).post(f"/admin/settlements/{seg(store_id)}", body)
        messages.success(request, "Payout recorded. It shows in the stall's books.")
    except FormError as exc:
        messages.error(request, exc.message)
    except ApiError as exc:
        problem(request, exc)
    return redirect("console:settlements")
