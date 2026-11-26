"""Shopping: browse, product pages, the bag, checkout, orders and live tracking."""

from __future__ import annotations

from django.contrib import messages
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .. import auth
from ..api import Api, ApiError, seg
from ..forms import FormError, integer, text
from .common import is_htmx, page_number, problem

SORTS = [("relevance", "Best match"), ("newest", "Newest"), ("price_asc", "Price: low to high"),
         ("price_desc", "Price: high to low"), ("popular", "Most popular"), ("rating", "Top rated")]


def _browse_context(request: HttpRequest, api: Api) -> dict:
    sort = request.GET.get("sort") if request.GET.get("sort") in dict(SORTS) else "relevance"
    params = {
        "q": (request.GET.get("q") or "").strip()[:120],
        "category": (request.GET.get("category") or "").strip()[:80],
        "sort": sort,
        "page": page_number(request),
        "page_size": 24,
    }
    try:
        page = api.products(**params)
    except ApiError as exc:
        return {"products": [], "total": 0, "browse_error": exc.message, "params": params, "sorts": SORTS}
    pages = max(1, -(-page["total"] // page["page_size"]))
    return {
        "products": page["items"], "total": page["total"], "params": params, "sorts": SORTS,
        "page": page["page"], "pages": pages,
        "has_prev": page["page"] > 1, "has_next": page["page"] < pages,
    }


@require_GET
def home(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    me = auth.current_user(request)
    ctx = _browse_context(request, api)
    if is_htmx(request):
        return render(request, "bazaar/shop/_results.html", ctx)
    try:
        ctx["categories"] = api.get("/categories")
    except ApiError:
        ctx["categories"] = []
    ctx["me"] = me
    return render(request, "bazaar/shop/home.html", ctx)


@require_GET
def product(request: HttpRequest, slug: str) -> HttpResponse:
    api = auth.api_for(request)
    try:
        item = api.product(slug)
    except ApiError as exc:
        if exc.status == 404:
            raise Http404 from None
        raise
    variants = [v for v in item["variants"]]
    saved = False
    if auth.current_user(request):
        try:
            saved = any(p["id"] == item["id"] for p in api.get("/wishlist", page_size=100)["items"])
        except ApiError:
            pass
    return render(request, "bazaar/shop/product.html", {
        "product": item, "variants": variants, "saved": saved,
        "default_variant": next((v for v in variants if v["in_stock"]), variants[0] if variants else None),
    })


def _remember_bag(request: HttpRequest, cart: dict | None) -> None:
    if cart is not None:
        request.session["bag_count"] = cart.get("item_count", 0)


def _cart_response(request: HttpRequest, cart: dict, template: str = "bazaar/shop/_cart.html") -> HttpResponse:
    _remember_bag(request, cart)
    return render(request, template, {"cart": cart, "oob_messages": True})


@require_POST
@auth.role_required()
def add_to_cart(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    try:
        variant = seg(request.POST.get("variant_id", ""))
        qty = integer(request.POST, "quantity", required=True, lo=1, hi=999) or 1
        cart = api.post("/cart/items", {"variant_id": variant, "quantity": qty})
        messages.success(request, "Added to your bag.")
    except (ApiError, FormError) as exc:
        problem(request, exc)
        cart = None
    _remember_bag(request, cart)
    if is_htmx(request):
        return render(request, "bazaar/shop/_added.html", {"cart": cart, "oob_messages": True})
    return redirect("shop:cart")


@require_GET
@auth.role_required()
def cart(request: HttpRequest) -> HttpResponse:
    cart = auth.api_for(request).cart()
    _remember_bag(request, cart)
    return render(request, "bazaar/shop/cart.html", {"cart": cart})


@require_http_methods(["POST"])
@auth.role_required()
def cart_item(request: HttpRequest, item_id: str) -> HttpResponse:
    api = auth.api_for(request)
    try:
        if request.POST.get("remove"):
            api.delete(f"/cart/items/{seg(item_id)}")
            cart = api.cart()
        else:
            qty = integer(request.POST, "quantity", required=True, lo=1, hi=999)
            cart = api.patch(f"/cart/items/{seg(item_id)}", {"quantity": qty})
    except (ApiError, FormError) as exc:
        problem(request, exc)
        cart = api.cart()
    if is_htmx(request):
        return _cart_response(request, cart)
    return redirect("shop:cart")


def _picked(request: HttpRequest, cart: dict) -> tuple[list[dict], list[dict]]:
    """Splits the bag into what the shopper chose to buy now and the rest.
    No choice at all means everything."""
    source = request.POST if request.method == "POST" else request.GET
    ids = set(source.getlist("pick"))
    if not ids:
        # Unticking every box is a choice too, and it means nothing.
        return ([], cart["items"]) if source.get("picking") else (cart["items"], [])
    chosen = [i for i in cart["items"] if i["id"] in ids]
    return chosen, [i for i in cart["items"] if i["id"] not in ids]


@require_http_methods(["GET", "POST"])
@auth.role_required()
def checkout(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    cart = api.cart()
    if not cart["items"]:
        messages.info(request, "Your bag is empty.")
        return redirect("shop:home")
    chosen, later = _picked(request, cart)
    if not chosen:
        messages.info(request, "Tick at least one item to check out.")
        return redirect("shop:cart")
    addresses = api.get("/me/addresses")
    try:
        pay = api.get("/status").get("payment")
    except ApiError:
        pay = None
    subtotal = sum(i["line_total_cents"] for i in chosen)
    ctx: dict = {"cart": cart, "chosen": chosen, "later": later, "subtotal": subtotal,
                 "addresses": addresses, "values": request.POST, "errors": {}, "pay": pay}
    if request.method == "POST":
        try:
            body: dict = {
                "shipping_method": "express" if request.POST.get("shipping_method") == "express" else "standard",
                "payment_method": "bank_transfer" if request.POST.get("payment_method") == "bank_transfer" else "cod",
                "coupon_code": text(request.POST, "coupon_code", max_len=40),
            }
            if later:
                # Only the ticked lines are bought; the API leaves the rest
                # in the bag as they are.
                body["cart_item_ids"] = [i["id"] for i in chosen]
            if request.POST.get("address_id"):
                body["address_id"] = seg(request.POST["address_id"])
            else:
                address = {
                    "full_name": text(request.POST, "full_name", required=True, max_len=120, label="Name"),
                    "line1": text(request.POST, "line1", required=True, max_len=200, label="Address"),
                    "line2": text(request.POST, "line2", max_len=200),
                    "city": text(request.POST, "city", required=True, max_len=80, label="City"),
                    "region": text(request.POST, "region", max_len=80),
                    "postal_code": text(request.POST, "postal_code", max_len=20),
                    "country": (text(request.POST, "country", required=True, max_len=2, label="Country") or "").upper(),
                    "phone": text(request.POST, "phone", required=True, max_len=40, label="Phone"),
                    "is_default": not addresses,
                }
                lat, lng = request.POST.get("lat"), request.POST.get("lng")
                if lat and lng:
                    try:
                        flat, flng = float(lat), float(lng)
                        if -90 <= flat <= 90 and -180 <= flng <= 180:
                            address["lat"], address["lng"] = flat, flng
                    except ValueError:
                        pass
                body["shipping_address"] = address
            out = api.post("/checkout", body)
            kept = sum(i["quantity"] for i in later)
            request.session["bag_count"] = kept
            messages.success(request, f"Order {out['order_number']} placed."
                             + (f" {kept} item{'s' if kept != 1 else ''} stayed in your bag for later." if kept else ""))
            return redirect("shop:order", order_id=out["order_id"])
        except FormError as exc:
            ctx["errors"] = {exc.field: exc.message}
        except ApiError as exc:
            problem(request, exc)
    return render(request, "bazaar/shop/checkout.html", ctx)


@require_GET
@auth.role_required()
def wishlist(request: HttpRequest) -> HttpResponse:
    data = auth.api_for(request).get("/wishlist", page=page_number(request), page_size=48)
    return render(request, "bazaar/shop/wishlist.html", {"products": data["items"], "total": data["total"]})


@require_POST
@auth.role_required()
def wishlist_toggle(request: HttpRequest) -> HttpResponse:
    api = auth.api_for(request)
    product_id = seg(request.POST.get("product_id", ""))
    saved = request.POST.get("saved") == "1"
    try:
        # Moving from the bag: the API takes the line out of the bag and
        # onto the saved list in one go.
        if request.POST.get("from_cart"):
            cart = api.post(f"/cart/items/{seg(request.POST['from_cart'])}/save-for-later", {})
            messages.success(request, "Moved to your saved items.")
            _remember_bag(request, cart)
            if is_htmx(request):
                return render(request, "bazaar/shop/_cart.html", {"cart": cart, "oob_messages": True})
            return redirect("shop:cart")
        if saved:
            api.delete(f"/wishlist/{product_id}")
            messages.success(request, "Removed from your saved items.")
        else:
            api.post("/wishlist", {"product_id": product_id})
            messages.success(request, "Saved for later.")
        saved = not saved
    except ApiError as exc:
        problem(request, exc)
    if is_htmx(request):
        return render(request, "bazaar/shop/_save_button.html",
                      {"product_id": product_id, "saved": saved, "oob_messages": True,
                       "slug": request.POST.get("slug", ""), "back": request.POST.get("back", "")})
    if request.POST.get("back") == "wishlist":
        return redirect("shop:wishlist")
    slug = request.POST.get("slug")
    return redirect("shop:product", slug=seg(slug)) if slug else redirect("shop:home")


@require_GET
@auth.role_required()
def orders(request: HttpRequest) -> HttpResponse:
    data = auth.api_for(request).get("/orders", page=page_number(request), page_size=20)
    return render(request, "bazaar/shop/orders.html", {"orders": data["items"], "total": data["total"]})


@require_GET
@auth.role_required()
def order(request: HttpRequest, order_id: str) -> HttpResponse:
    api = auth.api_for(request)
    try:
        data = api.get(f"/orders/{seg(order_id)}")
    except ApiError as exc:
        if exc.status in (403, 404):
            raise Http404 from None
        raise
    try:
        tracking = api.get(f"/orders/{seg(order_id)}/tracking")
    except ApiError:
        tracking = None
    pay = None
    if not data.get("paid_at") and data.get("status") not in ("canceled", "cancelled"):
        try:
            pay = api.get("/status").get("payment")
        except ApiError:
            pay = None
    return render(request, "bazaar/shop/order.html", {"order": data, "tracking": tracking, "pay": pay})


@require_POST
@auth.role_required()
def cancel_order(request: HttpRequest, order_id: str) -> HttpResponse:
    try:
        auth.api_for(request).post(f"/orders/{seg(order_id)}/cancel", {})
        messages.success(request, "Order cancelled.")
    except ApiError as exc:
        problem(request, exc)
    return redirect("shop:order", order_id=order_id)


@require_GET
@auth.role_required()
def tracking_json(request: HttpRequest, order_id: str) -> JsonResponse:
    """Polled by the map every few seconds. Only the fields the map draws."""
    try:
        t = auth.api_for(request).get(f"/orders/{seg(order_id)}/tracking")
    except ApiError as exc:
        return JsonResponse({"error": exc.message}, status=exc.status if exc.status < 500 else 502)
    markers = []
    for d in t.get("deliveries") or [t]:
        if d.get("pickup"):
            markers.append({"kind": "store", "lat": d["pickup"]["lat"], "lng": d["pickup"]["lng"],
                            "label": d.get("store_name") or "Shop"})
        if d.get("rider_position"):
            name = (d.get("rider") or {}).get("name") or "Rider"
            markers.append({"kind": "rider", "lat": d["rider_position"]["lat"], "lng": d["rider_position"]["lng"],
                            "label": name})
        if d.get("dropoff"):
            markers.append({"kind": "home", "lat": d["dropoff"]["lat"], "lng": d["dropoff"]["lng"], "label": "You"})
    return JsonResponse({
        "status": t.get("status"), "eta_minutes": t.get("eta_minutes"), "markers": markers,
    })
