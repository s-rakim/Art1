"""The books: read-only ledger sheets and the vendor's own editable entries.

Vendors see only their own stall; the API enforces that, the portal just
never asks for anything else. Admins see every stall and confirm vendor
entries by matching the key on the entry (a transaction code or reference).
"""

from __future__ import annotations

import re

from django.contrib import messages
from django.http import Http404, HttpRequest, HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .. import auth
from ..api import ApiError, seg
from ..forms import FormError, cents, integer, text
from .common import page_number, problem

SHEETS = [("ledger", "Ledger"), ("sales", "Sales"), ("payments", "Payments"),
          ("inventory", "Stock sold"), ("entries", "Confirmed entries")]
KINDS = [("sale", "Sale"), ("expense", "Expense"), ("stock_in", "Stock in"), ("stock_out", "Stock out"),
         ("payment", "Payment"), ("other", "Other")]
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

vendor_only = auth.role_required("seller")
admin_only = auth.role_required("admin")


def _filters(request: HttpRequest) -> dict:
    out = {}
    for key in ("from", "to"):
        value = (request.GET.get(key) or "").strip()
        if _DATE.match(value):
            out[key] = value
    return out


def _sheet_name(request: HttpRequest) -> str:
    name = request.GET.get("sheet") or "ledger"
    if name not in dict(SHEETS):
        raise Http404
    return name


def _csv(content: bytes, name: str) -> HttpResponse:
    resp = HttpResponse(content, content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="{name}.csv"'
    return resp


# ---- Read-only sheets ------------------------------------------------------------

@require_GET
@vendor_only
def vendor_sheets(request: HttpRequest) -> HttpResponse:
    sheet = _sheet_name(request)
    filters = _filters(request)
    api = auth.api_for(request)
    if request.GET.get("format") == "csv":
        content, _ = api.download(f"/seller/sheets/{sheet}", format="csv", **filters)
        return _csv(content, f"bazaar-{sheet}")
    data = api.get(f"/seller/sheets/{sheet}", page=page_number(request), page_size=100, **filters)
    return render(request, "bazaar/books/sheets.html", {
        "data": data, "sheet": sheet, "sheets": SHEETS, "filters": filters, "admin": False,
    })


@require_GET
@admin_only
def admin_sheets(request: HttpRequest) -> HttpResponse:
    sheet = _sheet_name(request)
    filters = _filters(request)
    store_id = request.GET.get("store_id") or ""
    if store_id:
        filters["store_id"] = seg(store_id)
    api = auth.api_for(request)
    if request.GET.get("format") == "csv":
        content, _ = api.download(f"/admin/sheets/{sheet}", format="csv", **filters)
        return _csv(content, f"bazaar-{sheet}")
    data = api.get(f"/admin/sheets/{sheet}", page=page_number(request), page_size=100, **filters)
    stores = api.get("/admin/stores", page_size=100)["items"]
    return render(request, "bazaar/books/sheets.html", {
        "data": data, "sheet": sheet, "sheets": SHEETS, "filters": filters, "admin": True,
        "stores": stores, "store_id": store_id,
    })


# ---- The vendor's editable sheet ---------------------------------------------------

def _entry_body(request: HttpRequest) -> dict:
    kind = request.POST.get("kind")
    if kind not in dict(KINDS):
        raise FormError("kind", "Pick what kind of entry this is.")
    entry_date = (request.POST.get("entry_date") or "").strip()
    if not _DATE.match(entry_date):
        raise FormError("entry_date", "Pick the date.")
    return {
        "entry_date": entry_date,
        "kind": kind,
        "description": text(request.POST, "description", required=True, max_len=300, label="What happened"),
        "quantity": integer(request.POST, "quantity", lo=-1_000_000, hi=1_000_000),
        "amount_cents": cents(request.POST, "amount"),
        "reference": text(request.POST, "reference", required=True, max_len=80,
                          label="Transaction code or reference"),
    }


@require_http_methods(["GET", "POST"])
@vendor_only
def entries(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    errors: dict = {}
    if request.method == "POST":
        try:
            api.post("/seller/sheet-entries", _entry_body(request))
            messages.success(request, "Added. It shows in your books once the market office confirms it.")
            return redirect("books:entries")
        except FormError as exc:
            errors = {exc.field: exc.message}
        except ApiError as exc:
            problem(request, exc)
    status = request.GET.get("status") if request.GET.get("status") in {"pending", "confirmed", "rejected"} else None
    data = api.get("/seller/sheet-entries", status=status, page=page_number(request), page_size=50)
    return render(request, "bazaar/books/entries.html", {
        "entries": data["items"], "total": data["total"], "status": status, "kinds": KINDS,
        "values": request.POST if errors else {}, "errors": errors,
    })


@require_http_methods(["GET", "POST"])
@vendor_only
def entry(request: HttpRequest, entry_id: str) -> HttpResponse:
    api = auth.api_for(request)
    eid = seg(entry_id)
    errors: dict = {}
    if request.method == "POST":
        try:
            if request.POST.get("delete"):
                api.delete(f"/seller/sheet-entries/{eid}")
                messages.success(request, "Entry removed.")
            else:
                api.patch(f"/seller/sheet-entries/{eid}", _entry_body(request))
                messages.success(request, "Saved. It goes back to the market office to confirm.")
            return redirect("books:entries")
        except FormError as exc:
            errors = {exc.field: exc.message}
        except ApiError as exc:
            problem(request, exc)
    found = next((e for e in api.get("/seller/sheet-entries", page_size=100)["items"] if e["id"] == eid), None)
    if not found:
        raise Http404
    return render(request, "bazaar/books/entry.html", {
        "entry": found, "kinds": KINDS, "errors": errors,
        "history": api.get(f"/seller/sheet-entries/{eid}/history"),
        "values": request.POST if errors else {
            **found, "amount": "" if found.get("amount_cents") is None else f"{found['amount_cents'] / 100:.2f}",
            "quantity": "" if found.get("quantity") is None else found["quantity"],
        },
    })


# ---- Admin: confirming entries -------------------------------------------------------

@require_GET
@admin_only
def admin_entries(request: HttpRequest) -> HttpResponse:
    status = request.GET.get("status") if request.GET.get("status") in {"pending", "confirmed", "rejected"} else "pending"
    store_id = request.GET.get("store_id") or ""
    api = auth.api_for(request)
    data = api.get("/admin/sheet-entries", status=status, store_id=seg(store_id) if store_id else None,
                   page=page_number(request), page_size=50)
    return render(request, "bazaar/books/admin_entries.html", {
        "entries": data["items"], "total": data["total"], "status": status, "store_id": store_id,
        "stores": api.get("/admin/stores", page_size=100)["items"], "kinds": dict(KINDS),
    })


@require_POST
@admin_only
def admin_entry_action(request: HttpRequest, entry_id: str) -> HttpResponse:
    api = auth.api_for(request)
    eid = seg(entry_id)
    try:
        if request.POST.get("action") == "confirm":
            key = (request.POST.get("key") or "").strip()[:80]
            if not key:
                raise FormError("key", "Type the transaction code or reference to confirm.")
            api.post(f"/admin/sheet-entries/{eid}/confirm", {"key": key,
                     "note": (request.POST.get("note") or "").strip()[:300] or None})
            messages.success(request, "Confirmed. It's now in the stall's read-only books.")
        elif request.POST.get("action") == "reject":
            note = (request.POST.get("note") or "").strip()[:300]
            if not note:
                raise FormError("note", "Say why, so the stall can fix it.")
            api.post(f"/admin/sheet-entries/{eid}/reject", {"note": note})
            messages.success(request, "Sent back to the stall.")
        else:
            raise Http404
    except FormError as exc:
        messages.error(request, exc.message)
    except ApiError as exc:
        messages.error(request, "That key doesn't match the entry's reference." if exc.code in {"key_mismatch", "wrong_key"}
                       else exc.message)
    return redirect("books:admin_entries")
