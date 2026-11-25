"""Types for the Bazaar API 1.0.0, generated from backend/openapi.json.

Do not edit by hand: run python scripts/gen_api_types.py.
"""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict


class Address(TypedDict):
    id: str
    label: str | None
    full_name: str
    line1: str
    line2: str | None
    city: str
    region: str | None
    postal_code: str | None
    country: str
    phone: str | None
    lat: float | None
    lng: float | None
    is_default: bool


class AddressIn(TypedDict):
    label: NotRequired[str | None]
    lat: NotRequired[float | None]
    lng: NotRequired[float | None]
    full_name: str
    line1: str
    line2: NotRequired[str | None]
    city: str
    region: NotRequired[str | None]
    postal_code: NotRequired[str | None]
    country: str
    phone: NotRequired[str | None]
    is_default: NotRequired[bool]


class AddressUpdate(TypedDict):
    label: NotRequired[str | None]
    lat: NotRequired[float | None]
    lng: NotRequired[float | None]
    full_name: NotRequired[str | None]
    line1: NotRequired[str | None]
    line2: NotRequired[str | None]
    city: NotRequired[str | None]
    region: NotRequired[str | None]
    postal_code: NotRequired[str | None]
    country: NotRequired[str | None]
    phone: NotRequired[str | None]
    is_default: NotRequired[bool | None]


class AdminOrder(TypedDict):
    id: str
    number: str
    status: str
    currency: str
    total_cents: int
    item_count: int
    created_at: str
    customer_email: str | None
    stores: int


class AdminPayout(TypedDict):
    id: str
    amount_cents: int
    currency: str
    status: str
    method: dict[str, Any]
    note: str | None
    requested_at: str
    processed_at: str | None
    store: "StoreRef"


class AdminPayoutUpdate(TypedDict):
    status: Literal["approved", "paid", "rejected"]
    note: NotRequired[str | None]


class AdminProductUpdate(TypedDict):
    status: Literal["active", "blocked", "archived"]


class AdminRider(TypedDict):
    id: str
    full_name: str
    email: str | None
    phone: str
    city: str
    vehicle: str
    licence_number: str | None
    status: str
    review_note: str | None
    is_online: bool
    last_lat: float | None
    last_lng: float | None
    last_heading: float | None
    last_seen_at: str | None
    active_deliveries: int
    completed_deliveries: int
    created_at: str
    approved_at: str | None


class AdminRiderDetail(TypedDict):
    id: str
    full_name: str
    email: str | None
    phone: str
    city: str
    vehicle: str
    licence_number: str | None
    status: str
    review_note: str | None
    is_online: bool
    last_lat: float | None
    last_lng: float | None
    last_heading: float | None
    last_seen_at: str | None
    active_deliveries: int
    completed_deliveries: int
    created_at: str
    approved_at: str | None
    unpaid_earnings_cents: int
    jobs: list["RiderJob"]


class AdminRiderUpdate(TypedDict):
    status: Literal["active", "suspended", "rejected"]
    review_note: NotRequired[str | None]


class AdminStats(TypedDict):
    currency: str
    gmv_cents_30d: int
    orders_30d: int
    commission_cents_30d: int
    fees_cents_30d: int
    rent_cents_30d: int
    placement_cents_30d: int
    rent_mrr_cents: int
    active_stores: int
    pending_stores: int
    pending_riders: int
    customers: int
    active_products: int
    payouts_requested_cents: int


class AdminStore(TypedDict):
    id: str
    slug: str
    name: str
    status: str
    plan_code: str
    owner_email: str | None
    country: str | None
    support_email: str | None
    application: dict[str, Any]
    review_note: str | None
    product_count: int
    created_at: str
    approved_at: str | None


class AdminStoreUpdate(TypedDict):
    status: NotRequired[Literal["active", "suspended", "rejected"] | None]
    plan_code: NotRequired[str | None]
    review_note: NotRequired[str | None]


class AdminUserUpdate(TypedDict):
    role: Literal["customer", "seller", "admin"]


class ApplicationDecision(TypedDict):
    note: NotRequired[str | None]


class AuditRow(TypedDict):
    id: int
    entity: str
    entity_id: str
    store_id: str | None
    action: str
    actor_id: str | None
    actor_name: str | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    at: str


class AvailableRider(TypedDict):
    id: str
    name: str
    vehicle: str
    distance_km: float | None
    eta_to_store_minutes: int | None
    active_deliveries: int
    last_seen_at: str | None


class Balance(TypedDict):
    balance_cents: int
    available_cents: int
    pending_cents: int
    currency: str


class BillingRunOut(TypedDict):
    subscriptions_billed: int
    orders_expired: int


class Body_add_image_api_v1_seller_products__product_id__images_post(TypedDict):
    file: str
    alt: NotRequired[str | None]


class Body_replace_image_api_v1_seller_products__product_id__images__image_id__put(TypedDict):
    file: str
    alt: NotRequired[str | None]


class Body_set_video_api_v1_seller_products__product_id__video_put(TypedDict):
    file: str
    poster: NotRequired[str | None]
    caption: NotRequired[str | None]


class BusinessInfo(TypedDict):
    legal_name: str
    registration_number: NotRequired[str | None]
    tax_id: NotRequired[str | None]
    website: NotRequired[str | None]
    phone: NotRequired[str | None]


class Cart(TypedDict):
    id: str | None
    items: list["CartItem"]
    item_count: int
    subtotal_cents: int
    shipping_estimate_cents: int
    currency: str


class CartItem(TypedDict):
    id: str
    variant_id: str
    product_id: str
    product_slug: str
    title: str
    variant_title: str
    options: dict[str, str]
    image_url: str | None
    unit_price_cents: int
    compare_at_cents: int | None
    quantity: int
    line_total_cents: int
    stock: int
    min_order_qty: int
    available: bool
    store: "StoreRef"


class CartItemIn(TypedDict):
    variant_id: str
    quantity: NotRequired[int]


class CartItemUpdate(TypedDict):
    quantity: int


class Category(TypedDict):
    id: str
    parent_id: str | None
    slug: str
    name: str
    image_url: NotRequired[str | None]
    children: NotRequired[list["Category"]]


class CategoryIn(TypedDict):
    slug: str
    name: str
    parent_id: NotRequired[str | None]
    image_url: NotRequired[str | None]
    sort: NotRequired[int]


class CategoryRef(TypedDict):
    id: str
    slug: str
    name: str


class CategoryUpdate(TypedDict):
    name: NotRequired[str | None]
    parent_id: NotRequired[str | None]
    image_url: NotRequired[str | None]
    sort: NotRequired[int | None]


class CheckoutIn(TypedDict):
    items: NotRequired[list["CheckoutLine"] | None]
    cart_item_ids: NotRequired[list[str] | None]
    address_id: NotRequired[str | None]
    shipping_address: NotRequired["AddressIn" | None]
    shipping_method: NotRequired[Literal["standard", "express"]]
    payment_method: NotRequired[Literal["cod", "bank_transfer", "card"]]
    coupon_code: NotRequired[str | None]


class CheckoutLine(TypedDict):
    product_id: NotRequired[str | None]
    variant_id: str
    quantity: int


class CheckoutOut(TypedDict):
    order_id: str
    order_number: str
    status: str
    total_cents: int
    currency: str
    payment_url: NotRequired[str | None]
    client_secret: NotRequired[str | None]


class Column(TypedDict):
    key: str
    label: str
    type: Literal["text", "date", "money", "number"]


class ConfirmIn(TypedDict):
    key: str
    note: NotRequired[str | None]


class Coupon(TypedDict):
    code: str
    kind: str
    value: int
    store_id: str | None
    min_subtotal_cents: int
    starts_at: str | None
    ends_at: str | None
    max_redemptions: int | None
    redemptions: int
    is_active: bool


class CouponIn(TypedDict):
    code: str
    kind: Literal["percent", "fixed"]
    value: int
    store_id: NotRequired[str | None]
    min_subtotal_cents: NotRequired[int]
    starts_at: NotRequired[str | None]
    ends_at: NotRequired[str | None]
    max_redemptions: NotRequired[int | None]


class DailyPoint(TypedDict):
    date: str
    sales_cents: int
    orders: int


class DeliveryActionIn(TypedDict):
    action: Literal["accept", "decline", "picked_up", "delivered", "failed"]
    code: NotRequired[str | None]
    note: NotRequired[str | None]


class DeliveryTrack(TypedDict):
    delivery_id: str | None
    store_name: str
    status: str
    eta_minutes: int | None
    rider: "RiderPublic" | None
    rider_position: "RiderPosition" | None
    pickup: "MapPoint" | None
    dropoff: "MapPoint" | None
    handover_code: str | None


class DispatchIn(TypedDict):
    rider_id: NotRequired[str | None]
    note: NotRequired[str | None]


class DropoffIn(TypedDict):
    lat: float
    lng: float
    note: NotRequired[str | None]


class Earning(TypedDict):
    id: str
    delivery_id: str
    amount_cents: int
    currency: str
    paid_out: bool
    created_at: str


class Entry(TypedDict):
    id: str
    store_id: str
    store_name: NotRequired[str | None]
    entry_date: str
    kind: str
    description: str
    quantity: int | None
    amount_cents: int | None
    reference: str | None
    status: Literal["pending", "confirmed", "rejected"]
    admin_note: str | None
    created_at: str
    updated_at: str
    confirmed_at: str | None


class EntryIn(TypedDict):
    entry_date: str
    kind: Literal["sale", "expense", "stock_in", "stock_out", "payment", "other"]
    description: str
    quantity: NotRequired[int | None]
    amount_cents: NotRequired[int | None]
    reference: str


class EntryUpdate(TypedDict):
    entry_date: NotRequired[str | None]
    kind: NotRequired[Literal["sale", "expense", "stock_in", "stock_out", "payment", "other"] | None]
    description: NotRequired[str | None]
    quantity: NotRequired[int | None]
    amount_cents: NotRequired[int | None]
    reference: NotRequired[str | None]


class Facet(TypedDict):
    value: str
    label: str
    count: int


class HTTPValidationError(TypedDict):
    detail: NotRequired[list["ValidationError"]]


class Image(TypedDict):
    id: str
    url: str
    alt: str | None


class ImageAltIn(TypedDict):
    alt: NotRequired[str | None]


class ImageIn(TypedDict):
    url: str
    alt: NotRequired[str | None]


class ImageOrderIn(TypedDict):
    image_ids: list[str]


class ImportIn(TypedDict):
    text: str
    commit: NotRequired[bool]


class ImportOut(TypedDict):
    rows: list["ImportedRow"]
    stored: int
    failed: list[str]


class ImportedRow(TypedDict):
    id: str | None
    provider: Literal["mpesa", "bank"]
    code: str
    payer_name: str | None
    payer_phone: str | None
    amount_cents: int
    currency: str
    received_at: str
    account_ref: str | None
    matched_order_number: str | None
    duplicate: bool


class Income(TypedDict):
    currency: str
    period_days: int
    rent_cents: int
    commission_cents: int
    fee_cents: int
    placement_cents: int
    delivery_fee_cents: int
    rider_cost_cents: int
    total_cents: int
    daily: list["IncomeDay"]


class IncomeDay(TypedDict):
    date: str
    rent_cents: int
    commission_cents: int
    fee_cents: int
    placement_cents: int
    delivery_fee_cents: int


class InventoryAdjustment(TypedDict):
    id: str
    variant_id: str
    product_id: str
    product_title: str
    sku: str
    stock_before: int
    stock_after: int
    reason: str | None
    by: str | None
    created_at: str


class InventoryRow(TypedDict):
    variant_id: str
    product_id: str
    product_title: str
    product_status: str
    sku: str
    title: str
    options: dict[str, str]
    price_cents: int
    stock: int
    low_stock: bool
    reserved: int
    sold_30d: int


class InventoryUpdateIn(TypedDict):
    items: list["StockChange"]


class InventoryUpdateOut(TypedDict):
    items: list["StockLevel"]


class LedgerEntry(TypedDict):
    id: str
    kind: str
    amount_cents: int
    currency: str
    memo: str | None
    available_at: str
    created_at: str


class LiveDelivery(TypedDict):
    id: str
    status: str
    store_name: str
    order_number: str
    rider_id: str
    rider_name: str
    rider_position: "RiderPosition" | None
    pickup: "MapPoint" | None
    dropoff: "MapPoint" | None
    assigned_at: str


class LiveMap(TypedDict):
    deliveries: list["LiveDelivery"]
    riders: list["LiveRider"]


class LiveRider(TypedDict):
    id: str
    name: str
    vehicle: str
    lat: float | None
    lng: float | None
    last_seen_at: str | None
    busy: bool


class LocationIn(TypedDict):
    lat: float
    lng: float
    accuracy_m: NotRequired[float | None]
    heading: NotRequired[float | None]
    speed_mps: NotRequired[float | None]


class MapPoint(TypedDict):
    lat: float
    lng: float
    label: NotRequired[str | None]


class Me(TypedDict):
    id: str
    email: str | None
    full_name: str | None
    first_name: str | None
    avatar_url: str | None
    role: Literal["customer", "seller", "rider", "admin", "rider_applicant"]
    signup_as: Literal["customer", "rider"]
    home: str
    rider_status: Literal["applicant", "active", "suspended", "rejected"] | None
    store: "MyStoreRef" | None


class MeUpdate(TypedDict):
    full_name: NotRequired[str | None]
    avatar_url: NotRequired[str | None]


class Message(TypedDict):
    ok: NotRequired[bool]


class MyStoreRef(TypedDict):
    id: str
    slug: str
    name: str
    status: str


class OpenJob(TypedDict):
    id: str
    delivery_id: NotRequired[str | None]
    offered: bool
    offer_expires_at: str | None
    order_number: str
    placed_at: str
    store: "RiderStore"
    pickup: "Point"
    dropoff: "Point" | None
    area: str | None
    earning_cents: int
    amount_due_cents: int
    currency: str
    items: int
    distance_km: float | None
    trip_km: float | None
    batchable: bool
    blocked_reason: Literal["batch_full", "pickup_far", "on_run_far"] | None


class OpenJobs(TypedDict):
    items: list["OpenJob"]
    ride_status: Literal["offline", "idle", "delivering"]
    rules: "RiderRules"


class Order(TypedDict):
    id: str
    number: str
    status: str
    currency: str
    subtotal_cents: int
    discount_cents: int
    shipping_cents: int
    tax_cents: int
    total_cents: int
    coupon_code: str | None
    shipping_address: dict[str, Any]
    payment_provider: str | None
    paid_at: str | None
    created_at: str
    shipments: list["Shipment"]


class OrderItem(TypedDict):
    id: str
    product_id: str | None
    product_slug: str | None
    variant_id: str | None
    title: str
    variant_title: str | None
    sku: str | None
    image_url: str | None
    unit_price_cents: int
    quantity: int
    line_total_cents: int


class OrderSummary(TypedDict):
    id: str
    number: str
    status: str
    currency: str
    total_cents: int
    item_count: int
    created_at: str


class Page_AdminOrder_(TypedDict):
    items: list["AdminOrder"]
    total: int
    page: int
    page_size: int


class Page_AdminPayout_(TypedDict):
    items: list["AdminPayout"]
    total: int
    page: int
    page_size: int


class Page_AdminRider_(TypedDict):
    items: list["AdminRider"]
    total: int
    page: int
    page_size: int


class Page_AdminStore_(TypedDict):
    items: list["AdminStore"]
    total: int
    page: int
    page_size: int


class Page_AuditRow_(TypedDict):
    items: list["AuditRow"]
    total: int
    page: int
    page_size: int


class Page_Earning_(TypedDict):
    items: list["Earning"]
    total: int
    page: int
    page_size: int


class Page_Entry_(TypedDict):
    items: list["Entry"]
    total: int
    page: int
    page_size: int


class Page_InventoryAdjustment_(TypedDict):
    items: list["InventoryAdjustment"]
    total: int
    page: int
    page_size: int


class Page_InventoryRow_(TypedDict):
    items: list["InventoryRow"]
    total: int
    page: int
    page_size: int


class Page_LedgerEntry_(TypedDict):
    items: list["LedgerEntry"]
    total: int
    page: int
    page_size: int


class Page_OrderSummary_(TypedDict):
    items: list["OrderSummary"]
    total: int
    page: int
    page_size: int


class Page_PaymentReceipt_(TypedDict):
    items: list["PaymentReceipt"]
    total: int
    page: int
    page_size: int


class Page_Payout_(TypedDict):
    items: list["Payout"]
    total: int
    page: int
    page_size: int


class Page_ProductCard_(TypedDict):
    items: list["ProductCard"]
    total: int
    page: int
    page_size: int


class Page_RentInvoice_(TypedDict):
    items: list["RentInvoice"]
    total: int
    page: int
    page_size: int


class Page_Review_(TypedDict):
    items: list["Review"]
    total: int
    page: int
    page_size: int


class Page_RiderDelivery_(TypedDict):
    items: list["RiderDelivery"]
    total: int
    page: int
    page_size: int


class Page_SellerProductRow_(TypedDict):
    items: list["SellerProductRow"]
    total: int
    page: int
    page_size: int


class Page_StoreDelivery_(TypedDict):
    items: list["StoreDelivery"]
    total: int
    page: int
    page_size: int


class Page_StoreOrder_(TypedDict):
    items: list["StoreOrder"]
    total: int
    page: int
    page_size: int


class Page_Store_(TypedDict):
    items: list["Store"]
    total: int
    page: int
    page_size: int


class PaymentCheck(TypedDict):
    due_cents: int
    paid_cents: int
    payment_confirmed: bool
    currency: str
    matches: NotRequired[list["PaymentMatch"]]


class PaymentDetails(TypedDict):
    """Where shoppers pay. Shown at checkout and when the rider arrives."""
    mpesa_till: str | None
    mpesa_paybill: str | None
    account_name: str | None
    bank_name: str | None
    bank_account_name: str | None
    bank_account_number: str | None
    instructions: str | None


class PaymentIn(TypedDict):
    code: NotRequired[str | None]
    receipt_id: NotRequired[str | None]


class PaymentMatch(TypedDict):
    receipt_id: str
    code: str
    payer_name: str | None
    amount_cents: int | None
    currency: str | None
    received_at: str | None
    used: bool
    enough: bool


class PaymentReceipt(TypedDict):
    id: str
    provider: str
    source: str
    code: str
    amount_cents: int
    currency: str
    payer_name: str | None
    payer_phone: str | None
    account_ref: str | None
    received_at: str
    status: Literal["unconfirmed", "confirmed", "expired", "void"]
    expires_at: str
    order_id: str | None
    order_number: str | None
    confirmed_at: str | None
    confirmed_by_name: str | None
    confirmed_role: str | None
    note: str | None
    created_at: str


class PaymentUpdate(TypedDict):
    order_id: NotRequired[str | None]
    order_number: NotRequired[str | None]
    status: NotRequired[Literal["void"] | None]
    note: NotRequired[str | None]


class Payout(TypedDict):
    id: str
    amount_cents: int
    currency: str
    status: str
    method: dict[str, Any]
    note: str | None
    requested_at: str
    processed_at: str | None


class PayoutIn(TypedDict):
    amount_cents: int
    method: "PayoutMethod"


class PayoutMethod(TypedDict):
    type: Literal["bank_transfer", "paypal", "mobile_money"]
    account_name: str
    account_last4: str
    provider: NotRequired[str | None]


class PickupIn(TypedDict):
    lat: float
    lng: float
    label: NotRequired[str | None]
    line1: NotRequired[str | None]
    city: NotRequired[str | None]


class Placement(TypedDict):
    id: str
    slot_code: str
    location: str
    headline: str | None
    image_url: str | None
    store: "StoreRef"
    product: "ProductCard" | None


class PlacementBooking(TypedDict):
    id: str
    slot_code: str
    slot_name: str
    starts_on: str
    ends_on: str
    amount_cents: int
    credits_used: int
    currency: str
    status: str
    product_id: str | None
    headline: str | None


class PlacementBookingIn(TypedDict):
    slot_code: str
    starts_on: str
    ends_on: str
    product_id: NotRequired[str | None]
    headline: NotRequired[str | None]
    image_url: NotRequired[str | None]


class PlacementSlot(TypedDict):
    id: str
    code: str
    name: str
    description: str | None
    location: str
    daily_price_cents: int
    currency: str
    capacity: int


class Plan(TypedDict):
    id: str
    code: str
    name: str
    description: str | None
    monthly_price_cents: int
    currency: str
    commission_rate: float
    per_item_fee_cents: int
    product_limit: int | None
    featured_slots: int
    features: list[str]


class PlanChangeIn(TypedDict):
    plan_code: str
    cancel_at_period_end: NotRequired[bool]


class PlanIn(TypedDict):
    code: str
    name: str
    description: NotRequired[str | None]
    monthly_price_cents: int
    commission_rate: float
    per_item_fee_cents: NotRequired[int]
    product_limit: NotRequired[int | None]
    featured_slots: NotRequired[int]
    features: NotRequired[list[str]]
    sort: NotRequired[int]


class PlanUpdate(TypedDict):
    name: NotRequired[str | None]
    description: NotRequired[str | None]
    monthly_price_cents: NotRequired[int | None]
    commission_rate: NotRequired[float | None]
    per_item_fee_cents: NotRequired[int | None]
    product_limit: NotRequired[int | None]
    featured_slots: NotRequired[int | None]
    features: NotRequired[list[str] | None]
    is_active: NotRequired[bool | None]
    sort: NotRequired[int | None]


class Point(TypedDict):
    lat: float
    lng: float
    label: NotRequired[str | None]


class ProductCard(TypedDict):
    id: str
    slug: str
    title: str
    brand: str | None
    image_url: str | None
    price_cents: int | None
    compare_at_cents: int | None
    currency: str
    rating: float
    review_count: int
    sold_count: int
    store: "StoreRef"
    category_slug: str | None
    sponsored: NotRequired[bool]


class ProductDetail(TypedDict):
    id: str
    slug: str
    title: str
    description: str
    brand: str | None
    attributes: dict[str, Any]
    tags: list[str]
    currency: str
    price_cents: int | None
    max_price_cents: int | None
    rating: float
    review_count: int
    sold_count: int
    variants: list["Variant"]
    images: list["Image"]
    video: NotRequired["Video" | None]
    store: "StoreSummary"
    category: "CategoryRef" | None


class ProductIn(TypedDict):
    title: str
    description: NotRequired[str]
    brand: NotRequired[str | None]
    category_id: NotRequired[str | None]
    status: NotRequired[Literal["draft", "active", "archived"]]
    attributes: NotRequired[dict[str, str]]
    tags: NotRequired[list[str]]
    variants: list["VariantIn"]
    images: NotRequired[list["ImageIn"]]


class ProductPage(TypedDict):
    items: list["ProductCard"]
    total: int
    page: int
    page_size: int
    facets: NotRequired[dict[str, list["Facet"]]]


class ProductUpdate(TypedDict):
    title: NotRequired[str | None]
    description: NotRequired[str | None]
    brand: NotRequired[str | None]
    category_id: NotRequired[str | None]
    status: NotRequired[Literal["draft", "active", "archived"] | None]
    attributes: NotRequired[dict[str, str] | None]
    tags: NotRequired[list[str] | None]
    images: NotRequired[list["ImageIn"] | None]
    video: NotRequired[None]


class PublicPlan(TypedDict):
    """A stall plan as the public sees it: what it includes, not what it"""
    id: str
    code: str
    name: str
    description: str | None
    product_limit: int | None
    featured_slots: int
    features: list[str]
    price_on_request: NotRequired[bool]


class RejectIn(TypedDict):
    note: str


class RentInvoice(TypedDict):
    id: str
    period_start: str
    period_end: str
    amount_cents: int
    currency: str
    status: str
    plan_name: str | None
    created_at: str


class Review(TypedDict):
    id: str
    rating: int
    title: str | None
    body: str | None
    verified: bool
    author_name: str
    created_at: str


class ReviewIn(TypedDict):
    rating: int
    title: NotRequired[str | None]
    body: NotRequired[str | None]


class RiderApplicationIn(TypedDict):
    full_name: str
    phone: str
    city: str
    vehicle: Literal["bicycle", "motorbike", "car", "van", "on_foot"]
    licence_number: NotRequired[str | None]


class RiderDelivery(TypedDict):
    id: str
    status: str
    order_number: str
    placed_at: str
    store: "RiderStore"
    pickup: "Point" | None
    dropoff: "Point" | None
    dropoff_address: dict[str, Any] | None
    customer_name: str | None
    customer_phone: str | None
    customer_note: str | None
    amount_due_cents: int
    cash_to_collect_cents: int
    payment_confirmed: bool
    earning_cents: int
    fee_cents: int
    currency: str
    items: int
    run_id: str | None
    assigned_at: str
    accepted_at: str | None
    picked_up_at: str | None
    arrived_at: str | None
    delivered_at: str | None


class RiderJob(TypedDict):
    delivery_id: str
    order_number: str
    status: str
    assigned_at: str
    delivered_at: NotRequired[str | None]


class RiderMe(TypedDict):
    id: str
    full_name: str
    phone: str
    city: str
    vehicle: str
    licence_number: str | None
    status: str
    review_note: str | None
    is_online: bool
    last_seen_at: str | None
    active_deliveries: int
    completed_deliveries: int
    earnings_cents: int
    unpaid_earnings_cents: int
    currency: str
    ride_status: Literal["offline", "idle", "delivering"]
    rules: "RiderRules"


class RiderPayoutOut(TypedDict):
    rider_id: str
    paid_cents: int


class RiderPosition(TypedDict):
    lat: float
    lng: float
    heading: NotRequired[float | None]
    at: str | None


class RiderPublic(TypedDict):
    name: str
    phone_masked: str | None
    vehicle: str


class RiderRules(TypedDict):
    """The admin's rules for riders, so the app can explain what's locked."""
    pool_radius_km: float
    batch_radius_km: float
    pickup_radius_km: float
    max_batch: int
    commission_rate: float
    rider_fee_cents: int


class RiderRun(TypedDict):
    run_id: str | None
    stops: list["RiderDelivery"]
    route: list["Waypoint"]


class RiderStore(TypedDict):
    id: str
    slug: str
    name: str


class SellerMe(TypedDict):
    store: "SellerStore"
    plan: "Plan"
    subscription: "Subscription" | None
    balance: "Balance"
    product_limit: int | None
    active_products: int


class SellerProduct(TypedDict):
    id: str
    slug: str
    title: str
    description: str
    brand: str | None
    category_id: str | None
    status: str
    attributes: dict[str, Any]
    tags: list[str]
    currency: str
    price_cents: int | None
    rating: float
    review_count: int
    sold_count: int
    variants: list["SellerVariant"]
    images: list["Image"]
    video: NotRequired["Video" | None]
    created_at: str
    updated_at: str


class SellerProductRow(TypedDict):
    id: str
    slug: str
    title: str
    status: str
    image_url: str | None
    price_cents: int | None
    stock: int
    sold_count: int
    updated_at: str


class SellerStats(TypedDict):
    currency: str
    sales_cents_30d: int
    orders_30d: int
    units_30d: int
    average_order_cents: int
    to_ship: int
    active_products: int
    rating: float
    review_count: int
    balance: "Balance"
    daily: list["DailyPoint"]
    top_products: list["TopProduct"]


class SellerStore(TypedDict):
    id: str
    slug: str
    name: str
    tagline: str | None
    description: str | None
    logo_url: str | None
    banner_url: str | None
    banner_color: str | None
    accent_color: str | None
    country: str | None
    support_email: str | None
    rating: float
    review_count: int
    product_count: NotRequired[int]
    created_at: str
    status: str
    review_note: str | None
    pickup_address: dict[str, Any] | None
    pickup_lat: float | None
    pickup_lng: float | None


class SellerVariant(TypedDict):
    id: str
    sku: str
    title: str
    options: dict[str, str]
    price_cents: int
    compare_at_cents: int | None
    stock: int
    in_stock: bool
    min_order_qty: int
    tier_prices: list["TierPrice"]
    is_active: bool
    weight_grams: int | None


class SettleIn(TypedDict):
    amount_cents: NotRequired[int | None]
    reference: str
    note: NotRequired[str | None]
    force: NotRequired[bool]


class Settlement(TypedDict):
    store_id: str
    store_name: str
    store_slug: str
    currency: str
    owed_cents: int
    held_cents: int
    sales_cents: int
    commission_cents: int
    fees_cents: int
    delivery_cents: int
    rent_cents: int
    paid_out_cents: int
    net_cents: int
    books_balanced: bool
    blockers: list[str]
    last_payout_at: str | None
    next_payout_at: str


class SheetOut(TypedDict):
    sheet: str
    columns: list["Column"]
    rows: list[dict[str, Any]]
    total: int
    page: int
    page_size: int


class ShiftIn(TypedDict):
    online: bool


class Shipment(TypedDict):
    id: str
    store: "StoreRef"
    status: str
    subtotal_cents: int
    shipping_cents: int
    discount_cents: int
    tracking_carrier: str | None
    tracking_number: str | None
    shipped_at: str | None
    delivered_at: str | None
    items: list["OrderItem"]


class SiteSettings(TypedDict):
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    contact_whatsapp: str | None
    contact_note: str | None
    currency: str
    standard_shipping_cents: int
    express_shipping_cents: int
    free_shipping_over_cents: int | None
    rider_fee_cents: int
    rider_commission_rate: float
    tax_rate: float
    maintenance_mode: bool
    maintenance_message: str | None
    payment: "PaymentDetails"
    vendor_signups_open: bool
    rider_signups_open: bool
    rider_pool_radius_km: float
    rider_batch_radius_km: float
    rider_pickup_radius_km: float
    rider_max_batch: int
    payout_interval_days: int
    payment_code_ttl_hours: int
    mpesa_till: str | None
    mpesa_paybill: str | None
    payment_account_name: str | None
    bank_name: str | None
    bank_account_name: str | None
    bank_account_number: str | None
    payment_instructions: str | None
    updated_at: str


class SiteSettingsUpdate(TypedDict):
    maintenance_mode: NotRequired[bool | None]
    maintenance_message: NotRequired[str | None]
    vendor_signups_open: NotRequired[bool | None]
    rider_signups_open: NotRequired[bool | None]
    standard_shipping_cents: NotRequired[int | None]
    express_shipping_cents: NotRequired[int | None]
    free_shipping_over_cents: NotRequired[int | None]
    rider_fee_cents: NotRequired[int | None]
    tax_rate: NotRequired[float | None]
    contact_name: NotRequired[str | None]
    contact_email: NotRequired[str | None]
    contact_phone: NotRequired[str | None]
    contact_whatsapp: NotRequired[str | None]
    contact_note: NotRequired[str | None]
    rider_commission_rate: NotRequired[float | None]
    rider_pool_radius_km: NotRequired[float | None]
    rider_batch_radius_km: NotRequired[float | None]
    rider_pickup_radius_km: NotRequired[float | None]
    rider_max_batch: NotRequired[int | None]
    payout_interval_days: NotRequired[int | None]
    payment_code_ttl_hours: NotRequired[int | None]
    mpesa_till: NotRequired[str | None]
    mpesa_paybill: NotRequired[str | None]
    payment_account_name: NotRequired[str | None]
    bank_name: NotRequired[str | None]
    bank_account_name: NotRequired[str | None]
    bank_account_number: NotRequired[str | None]
    payment_instructions: NotRequired[str | None]


class SiteStatus(TypedDict):
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    contact_whatsapp: str | None
    contact_note: str | None
    currency: str
    standard_shipping_cents: int
    express_shipping_cents: int
    free_shipping_over_cents: int | None
    rider_fee_cents: int
    rider_commission_rate: float
    tax_rate: float
    maintenance_mode: bool
    maintenance_message: str | None
    payment: "PaymentDetails"


class SlotUpdate(TypedDict):
    daily_price_cents: NotRequired[int | None]
    capacity: NotRequired[int | None]
    is_active: NotRequired[bool | None]


class SmsIn(TypedDict):
    text: NotRequired[str | None]
    message: NotRequired[str | None]
    body: NotRequired[str | None]


class StockChange(TypedDict):
    """Set `stock` to a count, or move it by `adjust_by` (a delivery in, a"""
    variant_id: str
    stock: NotRequired[int | None]
    adjust_by: NotRequired[int | None]
    reason: NotRequired[str | None]


class StockLevel(TypedDict):
    variant_id: str
    product_id: str
    sku: str
    stock_before: int
    stock: int


class Store(TypedDict):
    id: str
    slug: str
    name: str
    tagline: str | None
    description: str | None
    logo_url: str | None
    banner_url: str | None
    banner_color: str | None
    accent_color: str | None
    country: str | None
    support_email: str | None
    rating: float
    review_count: int
    product_count: NotRequired[int]
    created_at: str


class StoreApplicationIn(TypedDict):
    store_name: str
    slug: NotRequired[str | None]
    tagline: NotRequired[str | None]
    description: NotRequired[str | None]
    country: str
    support_email: str
    plan_code: NotRequired[str]
    business: "BusinessInfo"
    message: NotRequired[str | None]


class StoreDelivery(TypedDict):
    id: str
    status: str
    order_number: str
    rider_name: str
    rider_vehicle: str
    assigned_at: str
    picked_up_at: str | None
    delivered_at: str | None
    note: str | None
    pickup: NotRequired["MapPoint" | None]
    dropoff: NotRequired["MapPoint" | None]
    rider_position: NotRequired["RiderPosition" | None]


class StoreOrder(TypedDict):
    id: str
    order_id: str
    order_number: str
    status: str
    subtotal_cents: int
    discount_cents: int
    shipping_cents: int
    commission_cents: int
    fee_cents: int
    payout_cents: int
    currency: str
    paid: bool
    payment_method: str
    payment_status: str
    ship_to: dict[str, Any]
    delivery: NotRequired["StoreDelivery" | None]
    tracking_carrier: str | None
    tracking_number: str | None
    shipped_at: str | None
    delivered_at: str | None
    created_at: str
    items: list["OrderItem"]


class StoreOrderUpdate(TypedDict):
    status: NotRequired[Literal["processing", "shipped", "delivered"] | None]
    tracking_carrier: NotRequired[str | None]
    tracking_number: NotRequired[str | None]


class StoreRef(TypedDict):
    slug: str
    name: str


class StoreRider(TypedDict):
    """A rider as a store sees them. `relation` says why they're listed:"""
    id: str
    relation: Literal["on_job", "recent", "nearby"]
    name: str
    phone: str | None
    vehicle: str
    status: str
    on_shift: bool
    lat: float | None
    lng: float | None
    heading: float | None
    last_seen_at: str | None
    distance_km: float | None
    eta_to_store_minutes: int | None
    active_deliveries: int
    completed_deliveries: int
    jobs: list["RiderJob"]


class StoreSummary(TypedDict):
    id: str
    slug: str
    name: str
    logo_url: str | None
    rating: float
    review_count: int


class StoreUpdate(TypedDict):
    name: NotRequired[str | None]
    pickup: NotRequired["PickupIn" | None]
    tagline: NotRequired[str | None]
    description: NotRequired[str | None]
    logo_url: NotRequired[str | None]
    banner_url: NotRequired[str | None]
    banner_color: NotRequired[str | None]
    accent_color: NotRequired[str | None]
    support_email: NotRequired[str | None]


class Subscription(TypedDict):
    status: str
    current_period_start: str
    current_period_end: str
    cancel_at_period_end: bool


class Suggestion(TypedDict):
    text: str
    slug: NotRequired[str | None]
    kind: NotRequired[Literal["product", "category", "store", "query"]]


class TierPrice(TypedDict):
    min_qty: int
    price_cents: int


class TopProduct(TypedDict):
    id: str
    slug: str
    title: str
    units: int
    sales_cents: int


class Tracking(TypedDict):
    order_status: str
    delivery_id: str | None
    status: str
    eta_minutes: int | None
    rider: "RiderPublic" | None
    rider_position: "RiderPosition" | None
    pickup: "MapPoint" | None
    dropoff: "MapPoint" | None
    handover_code: str | None
    deliveries: list["DeliveryTrack"]


class UploadIn(TypedDict):
    filename: str
    content_type: Literal["image/jpeg", "image/png", "image/webp", "image/avif"]


class UploadOut(TypedDict):
    upload_url: str
    public_url: str
    path: str


class ValidationError(TypedDict):
    loc: list[str | int]
    msg: str
    type: str
    input: NotRequired[Any]
    ctx: NotRequired[dict[str, Any]]


class Variant(TypedDict):
    id: str
    sku: str
    title: str
    options: dict[str, str]
    price_cents: int
    compare_at_cents: int | None
    stock: int
    in_stock: bool
    min_order_qty: int
    tier_prices: list["TierPrice"]


class VariantIn(TypedDict):
    sku: str
    title: NotRequired[str]
    options: NotRequired[dict[str, str]]
    price_cents: int
    compare_at_cents: NotRequired[int | None]
    stock: NotRequired[int]
    min_order_qty: NotRequired[int]
    tier_prices: NotRequired[list["TierPrice"]]
    weight_grams: NotRequired[int | None]
    is_active: NotRequired[bool]


class VariantUpdate(TypedDict):
    title: NotRequired[str | None]
    options: NotRequired[dict[str, str] | None]
    price_cents: NotRequired[int | None]
    compare_at_cents: NotRequired[int | None]
    stock: NotRequired[int | None]
    min_order_qty: NotRequired[int | None]
    tier_prices: NotRequired[list["TierPrice"] | None]
    weight_grams: NotRequired[int | None]
    is_active: NotRequired[bool | None]


class Video(TypedDict):
    id: str
    url: str
    poster_url: str | None
    content_type: str
    duration_s: float | None
    caption: str | None


class Waypoint(TypedDict):
    kind: Literal["rider", "pickup", "dropoff"]
    lat: float
    lng: float
    label: str | None
    delivery_ids: list[str]


class WishlistIn(TypedDict):
    product_id: str


# Every operation in the contract, for reference and for tests.
OPERATIONS = (
    "DELETE /api/v1/admin/categories/{category_id}",
    "DELETE /api/v1/admin/coupons/{code}",
    "DELETE /api/v1/cart",
    "DELETE /api/v1/cart/items/{item_id}",
    "DELETE /api/v1/me/addresses/{address_id}",
    "DELETE /api/v1/seller/products/{product_id}",
    "DELETE /api/v1/seller/products/{product_id}/images/{image_id}",
    "DELETE /api/v1/seller/products/{product_id}/video",
    "DELETE /api/v1/seller/sheet-entries/{entry_id}",
    "DELETE /api/v1/seller/variants/{variant_id}",
    "DELETE /api/v1/wishlist/{product_id}",
    "GET /api/v1/admin/audit",
    "GET /api/v1/admin/coupons",
    "GET /api/v1/admin/deliveries",
    "GET /api/v1/admin/income",
    "GET /api/v1/admin/orders",
    "GET /api/v1/admin/orders/{order_id}",
    "GET /api/v1/admin/payments",
    "GET /api/v1/admin/payouts",
    "GET /api/v1/admin/placement-slots",
    "GET /api/v1/admin/plans",
    "GET /api/v1/admin/rider-applications",
    "GET /api/v1/admin/riders",
    "GET /api/v1/admin/riders/{rider_id}",
    "GET /api/v1/admin/settings",
    "GET /api/v1/admin/settlements",
    "GET /api/v1/admin/sheet-entries",
    "GET /api/v1/admin/sheets/{sheet}",
    "GET /api/v1/admin/stats",
    "GET /api/v1/admin/stores",
    "GET /api/v1/admin/stores/{store_id}",
    "GET /api/v1/cart",
    "GET /api/v1/categories",
    "GET /api/v1/me",
    "GET /api/v1/me/addresses",
    "GET /api/v1/orders",
    "GET /api/v1/orders/{order_id}",
    "GET /api/v1/orders/{order_id}/tracking",
    "GET /api/v1/placement-slots",
    "GET /api/v1/placements",
    "GET /api/v1/plans",
    "GET /api/v1/products",
    "GET /api/v1/products/{slug}",
    "GET /api/v1/products/{slug}/reviews",
    "GET /api/v1/rider/deliveries",
    "GET /api/v1/rider/deliveries/{delivery_id}",
    "GET /api/v1/rider/deliveries/{delivery_id}/payment",
    "GET /api/v1/rider/earnings",
    "GET /api/v1/rider/me",
    "GET /api/v1/rider/open-jobs",
    "GET /api/v1/rider/run",
    "GET /api/v1/search/suggest",
    "GET /api/v1/seller/deliveries",
    "GET /api/v1/seller/inventory",
    "GET /api/v1/seller/inventory/history",
    "GET /api/v1/seller/invoices",
    "GET /api/v1/seller/ledger",
    "GET /api/v1/seller/me",
    "GET /api/v1/seller/orders",
    "GET /api/v1/seller/orders/{store_order_id}",
    "GET /api/v1/seller/payouts",
    "GET /api/v1/seller/placements",
    "GET /api/v1/seller/products",
    "GET /api/v1/seller/products/{product_id}",
    "GET /api/v1/seller/riders",
    "GET /api/v1/seller/riders/available",
    "GET /api/v1/seller/riders/{rider_id}",
    "GET /api/v1/seller/sheet-entries",
    "GET /api/v1/seller/sheet-entries/{entry_id}/history",
    "GET /api/v1/seller/sheets/{sheet}",
    "GET /api/v1/seller/stats",
    "GET /api/v1/status",
    "GET /api/v1/stores",
    "GET /api/v1/stores/{slug}",
    "GET /api/v1/stores/{slug}/products",
    "GET /api/v1/wishlist",
    "PATCH /api/v1/admin/categories/{category_id}",
    "PATCH /api/v1/admin/payments/{receipt_id}",
    "PATCH /api/v1/admin/payouts/{payout_id}",
    "PATCH /api/v1/admin/placement-slots/{slot_id}",
    "PATCH /api/v1/admin/plans/{plan_id}",
    "PATCH /api/v1/admin/products/{product_id}",
    "PATCH /api/v1/admin/riders/{rider_id}",
    "PATCH /api/v1/admin/settings",
    "PATCH /api/v1/admin/stores/{store_id}",
    "PATCH /api/v1/admin/users/{user_id}",
    "PATCH /api/v1/cart/items/{item_id}",
    "PATCH /api/v1/me",
    "PATCH /api/v1/me/addresses/{address_id}",
    "PATCH /api/v1/rider/deliveries/{delivery_id}",
    "PATCH /api/v1/seller/inventory",
    "PATCH /api/v1/seller/me",
    "PATCH /api/v1/seller/orders/{store_order_id}",
    "PATCH /api/v1/seller/products/{product_id}",
    "PATCH /api/v1/seller/products/{product_id}/images/{image_id}",
    "PATCH /api/v1/seller/sheet-entries/{entry_id}",
    "PATCH /api/v1/seller/variants/{variant_id}",
    "POST /api/v1/admin/billing/run",
    "POST /api/v1/admin/categories",
    "POST /api/v1/admin/coupons",
    "POST /api/v1/admin/orders/{order_id}/cancel",
    "POST /api/v1/admin/orders/{order_id}/mark-paid",
    "POST /api/v1/admin/payments/import",
    "POST /api/v1/admin/plans",
    "POST /api/v1/admin/rider-applications/{rider_id}/approve",
    "POST /api/v1/admin/rider-applications/{rider_id}/reject",
    "POST /api/v1/admin/riders/{rider_id}/settle",
    "POST /api/v1/admin/settlements/{store_id}",
    "POST /api/v1/admin/sheet-entries/{entry_id}/confirm",
    "POST /api/v1/admin/sheet-entries/{entry_id}/reject",
    "POST /api/v1/cart",
    "POST /api/v1/cart/items",
    "POST /api/v1/cart/items/{item_id}/save-for-later",
    "POST /api/v1/checkout",
    "POST /api/v1/me/addresses",
    "POST /api/v1/orders/{order_id}/cancel",
    "POST /api/v1/payments/sms/{token}",
    "POST /api/v1/products/{slug}/reviews",
    "POST /api/v1/rider/applications",
    "POST /api/v1/rider/deliveries/{delivery_id}/arrived",
    "POST /api/v1/rider/deliveries/{delivery_id}/payment",
    "POST /api/v1/rider/location",
    "POST /api/v1/rider/open-jobs/{store_order_id}/claim",
    "POST /api/v1/rider/open-jobs/{store_order_id}/skip",
    "POST /api/v1/rider/shift",
    "POST /api/v1/seller/applications",
    "POST /api/v1/seller/deliveries/{delivery_id}/cancel",
    "POST /api/v1/seller/orders/{store_order_id}/confirm-payment",
    "POST /api/v1/seller/orders/{store_order_id}/dispatch",
    "POST /api/v1/seller/payouts",
    "POST /api/v1/seller/placements",
    "POST /api/v1/seller/plan",
    "POST /api/v1/seller/products",
    "POST /api/v1/seller/products/{product_id}/images",
    "POST /api/v1/seller/products/{product_id}/variants",
    "POST /api/v1/seller/sheet-entries",
    "POST /api/v1/seller/uploads",
    "POST /api/v1/wishlist",
    "PUT /api/v1/orders/{order_id}/dropoff",
    "PUT /api/v1/seller/products/{product_id}/image-order",
    "PUT /api/v1/seller/products/{product_id}/images/{image_id}",
    "PUT /api/v1/seller/products/{product_id}/video",
)
