"""The vendor's side: products with photos and video, stock, orders, riders."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.contrib import messages
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .. import auth
from ..api import ApiError, seg
from ..forms import FormError, cents, integer, text
from .common import field_errors, is_htmx, page_number, problem

vendor_only = auth.role_required("seller")

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}


@require_GET
@vendor_only
def dashboard(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    me = api.get("/seller/me")
    stats = api.get("/seller/stats")
    to_do = api.get("/seller/orders", status="pending", page_size=5)
    return render(request, "bazaar/vendor/dashboard.html", {
        "seller": me, "stats": stats, "to_do": to_do["items"],
    })


@require_GET
@vendor_only
def products(request: HttpRequest) -> HttpResponse:
    q = (request.GET.get("q") or "").strip()[:120]
    status = request.GET.get("status") if request.GET.get("status") in {"draft", "active", "archived"} else None
    data = auth.api_for(request).get("/seller/products", q=q, status=status, page=page_number(request), page_size=25)
    ctx = {"products": data["items"], "total": data["total"], "q": q, "status": status}
    if is_htmx(request):
        return render(request, "bazaar/vendor/_product_rows.html", ctx)
    return render(request, "bazaar/vendor/products.html", ctx)


def _categories(api) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []

    def walk(nodes, depth=0):
        for n in nodes:
            out.append((n["id"], ("— " * depth) + n["name"]))
            walk(n.get("children") or [], depth + 1)

    try:
        walk(api.get("/categories"))
    except ApiError:
        pass
    return out


@require_http_methods(["GET", "POST"])
@vendor_only
def product_new(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    ctx: dict = {"values": request.POST, "errors": {}, "categories": _categories(api)}
    if request.method == "POST":
        try:
            body = {
                "title": text(request.POST, "title", required=True, max_len=200, label="Title"),
                "description": text(request.POST, "description", max_len=8000) or "",
                "brand": text(request.POST, "brand", max_len=120),
                "category_id": request.POST.get("category_id") or None,
                "status": "draft",
                "tags": [t.strip() for t in (request.POST.get("tags") or "").split(",") if t.strip()][:20],
                "variants": [{
                    "sku": text(request.POST, "sku", max_len=64) or f"SKU-{uuid.uuid4().hex[:8].upper()}",
                    "title": text(request.POST, "variant_title", max_len=120) or "Default",
                    "options": {},
                    "price_cents": cents(request.POST, "price", required=True, allow_zero=False),
                    "stock": integer(request.POST, "stock", required=True),
                }],
            }
            product = api.post("/seller/products", body)
            messages.success(request, "Product saved as a draft. Add photos, then publish it.")
            return redirect("vendor:product", product_id=product["id"])
        except FormError as exc:
            ctx["errors"] = {exc.field: exc.message}
        except ApiError as exc:
            ctx["errors"] = field_errors(exc)
            problem(request, exc)
    return render(request, "bazaar/vendor/product_new.html", ctx)


@require_http_methods(["GET", "POST"])
@vendor_only
def product(request: HttpRequest, product_id: str) -> HttpResponse:
    api = auth.api_for(request)
    pid = seg(product_id)
    try:
        item = api.get(f"/seller/products/{pid}")
    except ApiError as exc:
        if exc.status in (403, 404):
            raise Http404 from None
        raise
    errors: dict = {}
    if request.method == "POST":
        try:
            status = request.POST.get("status")
            body = {
                "title": text(request.POST, "title", required=True, max_len=200, label="Title"),
                "description": text(request.POST, "description", max_len=8000) or "",
                "brand": text(request.POST, "brand", max_len=120),
                "category_id": request.POST.get("category_id") or None,
                "tags": [t.strip() for t in (request.POST.get("tags") or "").split(",") if t.strip()][:20],
            }
            if status in {"draft", "active", "archived"}:
                body["status"] = status
            item = api.patch(f"/seller/products/{pid}", body)
            messages.success(request, "Saved.")
            return redirect("vendor:product", product_id=pid)
        except FormError as exc:
            errors = {exc.field: exc.message}
        except ApiError as exc:
            errors = field_errors(exc)
            problem(request, exc)
    return render(request, "bazaar/vendor/product.html", {
        "product": item, "errors": errors, "categories": _categories(api),
        "max_image_mb": settings.MAX_IMAGE_BYTES // 1_000_000, "max_video_mb": settings.MAX_VIDEO_BYTES // 1_000_000,
    })


def _media_response(request: HttpRequest, product: dict) -> HttpResponse:
    if is_htmx(request):
        return render(request, "bazaar/vendor/_media.html", {
            "product": product, "oob_messages": True,
            "max_image_mb": settings.MAX_IMAGE_BYTES // 1_000_000, "max_video_mb": settings.MAX_VIDEO_BYTES // 1_000_000,
        })
    return redirect("vendor:product", product_id=product["id"])


@require_POST
@vendor_only
def images_add(request: HttpRequest, product_id: str) -> HttpResponse:
    api = auth.api_for(request)
    pid = seg(product_id)
    files = request.FILES.getlist("images")
    product = None
    if not files:
        messages.error(request, "Choose one or more photos first.")
    for f in files[:10]:
        if f.content_type not in IMAGE_TYPES:
            messages.error(request, f"{f.name} isn't a photo we can use (JPEG, PNG, WebP, AVIF or GIF).")
            continue
        if f.size > settings.MAX_IMAGE_BYTES:
            messages.error(request, f"{f.name} is too big. Keep photos under {settings.MAX_IMAGE_BYTES // 1_000_000} MB.")
            continue
        try:
            product = api.post(
                f"/seller/products/{pid}/images",
                files={"file": (f.name, f.file, f.content_type)},
                data={"alt": (request.POST.get("alt") or "")[:200]},
            )
        except ApiError as exc:
            problem(request, exc)
    if product:
        messages.success(request, "Photos added.")
    return _media_response(request, product or api.get(f"/seller/products/{pid}"))


@require_POST
@vendor_only
def image_action(request: HttpRequest, product_id: str, image_id: str) -> HttpResponse:
    api = auth.api_for(request)
    pid, iid = seg(product_id), seg(image_id)
    action = request.POST.get("action")
    try:
        if action == "delete":
            api.delete(f"/seller/products/{pid}/images/{iid}")
            product = api.get(f"/seller/products/{pid}")
            messages.success(request, "Photo removed.")
        elif action in {"left", "right", "first"}:
            product = api.get(f"/seller/products/{pid}")
            ids = [img["id"] for img in product["images"]]
            if iid in ids:
                i = ids.index(iid)
                ids.pop(i)
                j = 0 if action == "first" else max(0, i - 1) if action == "left" else min(len(ids), i + 1)
                ids.insert(j, iid)
                product = api.put(f"/seller/products/{pid}/image-order", {"image_ids": ids})
        elif action == "alt":
            product = api.patch(f"/seller/products/{pid}/images/{iid}",
                                {"alt": (request.POST.get("alt") or "").strip()[:200] or None})
            messages.success(request, "Description saved.")
        else:
            raise Http404
    except ApiError as exc:
        problem(request, exc)
        product = api.get(f"/seller/products/{pid}")
    return _media_response(request, product)


@require_POST
@vendor_only
def video(request: HttpRequest, product_id: str) -> HttpResponse:
    api = auth.api_for(request)
    pid = seg(product_id)
    try:
        if request.POST.get("action") == "delete":
            api.delete(f"/seller/products/{pid}/video")
            messages.success(request, "Video removed.")
            product = api.get(f"/seller/products/{pid}")
        else:
            f = request.FILES.get("video")
            if not f:
                raise FormError("video", "Choose a video first.")
            if f.content_type not in VIDEO_TYPES:
                raise FormError("video", "Use an MP4, WebM or MOV video.")
            if f.size > settings.MAX_VIDEO_BYTES:
                raise FormError("video", f"Keep videos under {settings.MAX_VIDEO_BYTES // 1_000_000} MB.")
            files = {"file": (f.name, f.file, f.content_type)}
            poster = request.FILES.get("poster")
            if poster and poster.content_type in IMAGE_TYPES and poster.size <= settings.MAX_IMAGE_BYTES:
                files["poster"] = (poster.name, poster.file, poster.content_type)
            product = api.put(f"/seller/products/{pid}/video", files=files,
                              data={"caption": (request.POST.get("caption") or "")[:200]})
            messages.success(request, "Video uploaded.")
    except (ApiError, FormError) as exc:
        problem(request, exc)
        product = api.get(f"/seller/products/{pid}")
    return _media_response(request, product)


@require_POST
@vendor_only
def variant(request: HttpRequest, product_id: str, variant_id: str) -> HttpResponse:
    api = auth.api_for(request)
    pid, vid = seg(product_id), seg(variant_id)
    try:
        if request.POST.get("action") == "delete":
            api.delete(f"/seller/variants/{vid}")
            messages.success(request, "Option removed.")
        else:
            body = {
                "title": text(request.POST, "title", required=True, max_len=120, label="Name"),
                "price_cents": cents(request.POST, "price", required=True, allow_zero=False),
                "compare_at_cents": cents(request.POST, "compare_at"),
                "stock": integer(request.POST, "stock", required=True),
            }
            api.patch(f"/seller/variants/{vid}", body)
            messages.success(request, "Option saved.")
    except (ApiError, FormError) as exc:
        problem(request, exc)
    return redirect("vendor:product", product_id=pid)


@require_POST
@vendor_only
def variant_add(request: HttpRequest, product_id: str) -> HttpResponse:
    api = auth.api_for(request)
    pid = seg(product_id)
    try:
        api.post(f"/seller/products/{pid}/variants", {
            "sku": text(request.POST, "sku", max_len=64) or f"SKU-{uuid.uuid4().hex[:8].upper()}",
            "title": text(request.POST, "title", required=True, max_len=120, label="Name"),
            "options": {},
            "price_cents": cents(request.POST, "price", required=True, allow_zero=False),
            "stock": integer(request.POST, "stock", required=True),
        })
        messages.success(request, "Option added.")
    except (ApiError, FormError) as exc:
        problem(request, exc)
    return redirect("vendor:product", product_id=pid)


@require_GET
@vendor_only
def inventory(request: HttpRequest) -> HttpResponse:
    low = request.GET.get("low") == "1"
    q = (request.GET.get("q") or "").strip()[:120]
    data = auth.api_for(request).get("/seller/inventory", low_stock=str(low).lower() if low else None, q=q,
                                     page=page_number(request), page_size=50)
    ctx = {"rows": data["items"], "total": data["total"], "low": low, "q": q}
    if is_htmx(request):
        return render(request, "bazaar/vendor/_inventory_rows.html", ctx)
    return render(request, "bazaar/vendor/inventory.html", ctx)


@require_POST
@vendor_only
def inventory_set(request: HttpRequest, variant_id: str) -> HttpResponse:
    """Inline stock edit: one row in, the same row back out."""
    api = auth.api_for(request)
    vid = seg(variant_id)
    row = None
    try:
        stock = integer(request.POST, "stock", required=True)
        out = api.patch("/seller/inventory", {"items": [{"variant_id": vid, "stock": stock, "reason": "portal edit"}]})
        level = out["items"][0]
        messages.success(request, f"{level['sku']}: {level['stock_before']} → {level['stock']}")
        row = {**{k: request.POST.get(k, "") for k in ("product_title", "title", "sku", "price_cents")},
               "variant_id": vid, "stock": level["stock"], "low_stock": level["stock"] <= 3,
               "product_id": level["product_id"], "reserved": request.POST.get("reserved", 0)}
    except (ApiError, FormError) as exc:
        problem(request, exc)
    if row is None:
        return render(request, "bazaar/_messages.html", {"oob_messages": True}, status=422)
    return render(request, "bazaar/vendor/_inventory_row.html", {"r": row, "oob_messages": True})


@require_GET
@vendor_only
def orders(request: HttpRequest) -> HttpResponse:
    status = (request.GET.get("status") or "").strip()[:30] or None
    data = auth.api_for(request).get("/seller/orders", status=status, page=page_number(request), page_size=20)
    return render(request, "bazaar/vendor/orders.html", {"orders": data["items"], "total": data["total"], "status": status})


@require_POST
@vendor_only
def order_action(request: HttpRequest, store_order_id: str) -> HttpResponse:
    api = auth.api_for(request)
    oid = seg(store_order_id)
    action = request.POST.get("action")
    try:
        if action == "processing":
            api.patch(f"/seller/orders/{oid}", {"status": "processing"})
            messages.success(request, "Marked as being packed.")
        elif action == "dispatch":
            rider = request.POST.get("rider_id") or None
            api.post(f"/seller/orders/{oid}/dispatch", {
                "rider_id": seg(rider) if rider else None,
                "note": (request.POST.get("note") or "").strip()[:300] or None,
            })
            messages.success(request, "Sent to a rider." if not rider else "Offered to the rider you picked.")
        else:
            raise Http404
    except ApiError as exc:
        problem(request, exc)
    return redirect("vendor:dashboard" if request.POST.get("back") == "dashboard" else "vendor:orders")


@require_GET
@vendor_only
def riders(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    return render(request, "bazaar/vendor/riders.html", {
        "riders": api.get("/seller/riders"),
        "available": api.get("/seller/riders/available"),
    })


@require_GET
@vendor_only
def live_json(request: HttpRequest) -> JsonResponse:
    api = auth.api_for(request)
    try:
        seller = api.get("/seller/me")["store"]
        riders = api.get("/seller/riders")
        deliveries = api.get("/seller/deliveries", active="true", page_size=50)["items"]
    except ApiError as exc:
        return JsonResponse({"error": exc.message}, status=502)
    markers = []
    if seller.get("pickup_lat") is not None:
        markers.append({"kind": "store", "lat": seller["pickup_lat"], "lng": seller["pickup_lng"], "label": seller["name"]})
    for r in riders:
        if r.get("lat") is not None:
            markers.append({"kind": "rider", "lat": r["lat"], "lng": r["lng"],
                            "label": f"{r['name']} · {r['vehicle']}" + (" · on a job" if r["active_deliveries"] else "")})
    for d in deliveries:
        if d.get("dropoff"):
            markers.append({"kind": "home", "lat": d["dropoff"]["lat"], "lng": d["dropoff"]["lng"],
                            "label": f"Order {d['order_number']}"})
    return JsonResponse({"markers": markers, "count": len(deliveries)})


@require_http_methods(["GET", "POST"])
@auth.role_required("customer")
def apply(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    try:
        plans = api.get("/plans")
    except ApiError:
        plans = []
    ctx: dict = {"plans": plans, "values": request.POST, "errors": {}}
    if request.method == "POST":
        try:
            plan = request.POST.get("plan_code") or (plans[0]["code"] if plans else "starter")
            api.post("/seller/applications", {
                "store_name": text(request.POST, "store_name", required=True, max_len=80, label="Store name"),
                "country": (text(request.POST, "country", required=True, max_len=2, label="Country") or "").upper(),
                "support_email": text(request.POST, "support_email", required=True, max_len=254, label="Support email"),
                "plan_code": plan if plan in {p["code"] for p in plans} else "starter",
                "business": {
                    "legal_name": text(request.POST, "legal_name", required=True, max_len=160, label="Business name"),
                    "phone": text(request.POST, "phone", max_len=40),
                },
                "message": text(request.POST, "message", max_len=1000),
            })
            auth.current_user(request, fresh=True)
            messages.success(request, "Application sent. An admin will review it and get back to you.")
            return redirect("shop:home")
        except FormError as exc:
            ctx["errors"] = {exc.field: exc.message}
        except ApiError as exc:
            ctx["errors"] = field_errors(exc)
            problem(request, exc)
    return render(request, "bazaar/vendor/apply.html", ctx)
