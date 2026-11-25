from django.urls import include, path

from .views import account, console, rider, shop, vendor

auth_urls = ([
    path("login", account.login, name="login"),
    path("logout", account.logout, name="logout"),
    path("signup", account.signup, name="signup"),
    path("signup/rider", account.signup, {"as_rider": True}, name="signup_rider"),
], "auth")

shop_urls = ([
    path("", shop.home, name="home"),
    path("p/<slug:slug>", shop.product, name="product"),
    path("bag", shop.cart, name="cart"),
    path("bag/add", shop.add_to_cart, name="add_to_cart"),
    path("bag/<str:item_id>", shop.cart_item, name="cart_item"),
    path("checkout", shop.checkout, name="checkout"),
    path("saved", shop.wishlist, name="wishlist"),
    path("saved/toggle", shop.wishlist_toggle, name="wishlist_toggle"),
    path("orders", shop.orders, name="orders"),
    path("orders/<str:order_id>", shop.order, name="order"),
    path("orders/<str:order_id>/cancel", shop.cancel_order, name="cancel_order"),
    path("orders/<str:order_id>/tracking.json", shop.tracking_json, name="tracking_json"),
    path("sell", vendor.apply, name="apply"),
], "shop")

vendor_urls = ([
    path("", vendor.dashboard, name="dashboard"),
    path("products", vendor.products, name="products"),
    path("products/new", vendor.product_new, name="product_new"),
    path("products/<str:product_id>", vendor.product, name="product"),
    path("products/<str:product_id>/images", vendor.images_add, name="images_add"),
    path("products/<str:product_id>/images/<str:image_id>", vendor.image_action, name="image_action"),
    path("products/<str:product_id>/video", vendor.video, name="video"),
    path("products/<str:product_id>/variants", vendor.variant_add, name="variant_add"),
    path("products/<str:product_id>/variants/<str:variant_id>", vendor.variant, name="variant"),
    path("inventory", vendor.inventory, name="inventory"),
    path("inventory/<str:variant_id>", vendor.inventory_set, name="inventory_set"),
    path("orders", vendor.orders, name="orders"),
    path("orders/<str:store_order_id>", vendor.order_action, name="order_action"),
    path("riders", vendor.riders, name="riders"),
    path("live.json", vendor.live_json, name="live_json"),
], "vendor")

rider_urls = ([
    path("", rider.dashboard, name="dashboard"),
    path("shift", rider.shift, name="shift"),
    path("location", rider.location, name="location"),
    path("jobs/<str:delivery_id>", rider.job, name="job"),
    path("earnings", rider.earnings, name="earnings"),
    path("application", rider.pending, name="pending"),
], "rider")

console_urls = ([
    path("", console.dashboard, name="dashboard"),
    path("pricing", console.pricing, name="pricing"),
    path("site", console.site, name="site"),
    path("riders", console.riders, name="riders"),
    path("riders/<str:rider_id>", console.rider_action, name="rider_action"),
    path("stores", console.stores, name="stores"),
    path("stores/<str:store_id>", console.store_action, name="store_action"),
    path("live", console.live, name="live"),
    path("live.json", console.live_json, name="live_json"),
], "console")

urlpatterns = [
    path("", include(shop_urls)),
    path("account/", include(auth_urls)),
    path("vendor/", include(vendor_urls)),
    path("rider/", include(rider_urls)),
    path("admin/", include(console_urls)),
]
