"""Request and response models. These are the API contract the frontend
codes against; the generated spec lives at backend/openapi.json."""

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

T = TypeVar("T")

# ---------------------------------------------------------------------------
# Shared field types
# ---------------------------------------------------------------------------

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean_text(v: str) -> str:
    # Strip control characters (keep tab/newline) so nothing odd ends up in
    # logs, CSV exports or emails.
    return _CONTROL.sub("", v).strip()


def _https_url(v: str) -> str:
    v = v.strip()
    if not re.fullmatch(r"https://[A-Za-z0-9.-]+(:\d{2,5})?(/[^\s<>\"'`]*)?", v):
        raise ValueError("must be an https URL")
    return v


ShortText = Annotated[str, StringConstraints(max_length=120), AfterValidator(_clean_text)]
MediumText = Annotated[str, StringConstraints(max_length=500), AfterValidator(_clean_text)]
LongText = Annotated[str, StringConstraints(max_length=20_000), AfterValidator(_clean_text)]
Name = Annotated[str, StringConstraints(min_length=1, max_length=120), AfterValidator(_clean_text)]
HttpsUrl = Annotated[str, StringConstraints(max_length=2048), AfterValidator(_https_url)]
HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
Slug = Annotated[str, StringConstraints(min_length=2, max_length=80, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
Country = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]
Sku = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")]
Cents = Annotated[int, Field(ge=0, le=100_000_000)]
Quantity = Annotated[int, Field(ge=1, le=999)]


class Strict(BaseModel):
    """Input models reject unknown fields, so a client can't sneak in
    `status`, `store_id`, `price` or `role` and hope something reads it."""

    model_config = ConfigDict(extra="forbid")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Message(BaseModel):
    ok: bool = True


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


class StoreRef(BaseModel):
    slug: str
    name: str


class Category(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    slug: str
    name: str
    image_url: str | None = None
    children: list["Category"] = []


class ProductCard(BaseModel):
    id: uuid.UUID
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
    store: StoreRef
    category_slug: str | None
    sponsored: bool = False


class Facet(BaseModel):
    value: str
    label: str
    count: int


class ProductPage(Page[ProductCard]):
    facets: dict[str, list[Facet]] = {}


class TierPrice(Strict):
    min_qty: Quantity
    price_cents: Cents


class Variant(BaseModel):
    id: uuid.UUID
    sku: str
    title: str
    options: dict[str, str]
    price_cents: int
    compare_at_cents: int | None
    stock: int
    in_stock: bool
    min_order_qty: int
    tier_prices: list[TierPrice]


class Image(BaseModel):
    id: uuid.UUID
    url: str
    alt: str | None


class StoreSummary(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    logo_url: str | None
    rating: float
    review_count: int


class CategoryRef(BaseModel):
    id: uuid.UUID
    slug: str
    name: str


class ProductDetail(BaseModel):
    id: uuid.UUID
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
    variants: list[Variant]
    images: list[Image]
    store: StoreSummary
    category: CategoryRef | None


class Review(BaseModel):
    id: uuid.UUID
    rating: int
    title: str | None
    body: str | None
    verified: bool
    author_name: str
    created_at: datetime


class ReviewIn(Strict):
    rating: Annotated[int, Field(ge=1, le=5)]
    title: ShortText | None = None
    body: Annotated[str, StringConstraints(max_length=4000), AfterValidator(_clean_text)] | None = None


class Suggestion(BaseModel):
    text: str
    slug: str | None = None
    kind: Literal["product", "category", "store", "query"] = "product"


# ---------------------------------------------------------------------------
# Stores and plans
# ---------------------------------------------------------------------------


class Plan(BaseModel):
    id: uuid.UUID
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


class Store(BaseModel):
    id: uuid.UUID
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
    product_count: int = 0
    created_at: datetime


class PlacementSlot(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    location: str
    daily_price_cents: int
    currency: str
    capacity: int


class Placement(BaseModel):
    id: uuid.UUID
    slot_code: str
    location: str
    headline: str | None
    image_url: str | None
    store: StoreRef
    product: ProductCard | None


# ---------------------------------------------------------------------------
# Me
# ---------------------------------------------------------------------------


class MyStoreRef(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    status: str


class Me(BaseModel):
    id: uuid.UUID
    email: str | None
    full_name: str | None
    avatar_url: str | None
    role: str
    store: MyStoreRef | None


class MeUpdate(Strict):
    full_name: Name | None = None
    avatar_url: HttpsUrl | None = None


Lat = Annotated[float, Field(ge=-90, le=90)]
Lng = Annotated[float, Field(ge=-180, le=180)]


class AddressIn(Strict):
    label: ShortText | None = None
    lat: Lat | None = None
    lng: Lng | None = None
    full_name: Name
    line1: Annotated[str, StringConstraints(min_length=1, max_length=200), AfterValidator(_clean_text)]
    line2: Annotated[str, StringConstraints(max_length=200), AfterValidator(_clean_text)] | None = None
    city: Name
    region: ShortText | None = None
    postal_code: Annotated[str, StringConstraints(max_length=20, pattern=r"^[A-Za-z0-9 -]*$")] | None = None
    country: Country
    phone: Annotated[str, StringConstraints(max_length=32, pattern=r"^[0-9+() .-]*$")] | None = None
    is_default: bool = False


class AddressUpdate(Strict):
    label: ShortText | None = None
    lat: Lat | None = None
    lng: Lng | None = None
    full_name: Name | None = None
    line1: Annotated[str, StringConstraints(min_length=1, max_length=200), AfterValidator(_clean_text)] | None = None
    line2: Annotated[str, StringConstraints(max_length=200), AfterValidator(_clean_text)] | None = None
    city: Name | None = None
    region: ShortText | None = None
    postal_code: Annotated[str, StringConstraints(max_length=20, pattern=r"^[A-Za-z0-9 -]*$")] | None = None
    country: Country | None = None
    phone: Annotated[str, StringConstraints(max_length=32, pattern=r"^[0-9+() .-]*$")] | None = None
    is_default: bool | None = None


class Address(BaseModel):
    id: uuid.UUID
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


class WishlistIn(Strict):
    product_id: uuid.UUID


# ---------------------------------------------------------------------------
# Cart and checkout
# ---------------------------------------------------------------------------


class CartItemIn(Strict):
    variant_id: uuid.UUID
    quantity: Quantity = 1


class CartItemUpdate(Strict):
    quantity: Quantity


class CartItem(BaseModel):
    id: uuid.UUID
    variant_id: uuid.UUID
    product_id: uuid.UUID
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
    store: StoreRef


class Cart(BaseModel):
    id: uuid.UUID | None
    items: list[CartItem]
    item_count: int
    subtotal_cents: int
    shipping_estimate_cents: int
    currency: str


class CheckoutLine(Strict):
    # Prices are never accepted from the client; only what and how many.
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    quantity: Quantity


class CheckoutIn(Strict):
    items: Annotated[list[CheckoutLine], Field(min_length=1, max_length=100)] | None = None
    address_id: uuid.UUID | None = None
    shipping_address: AddressIn | None = None
    shipping_method: Literal["standard", "express"] = "standard"
    payment_method: Literal["cod", "bank_transfer", "card"] = "cod"
    coupon_code: Annotated[str, StringConstraints(max_length=40, pattern=r"^[A-Za-z0-9_-]*$")] | None = None

    @model_validator(mode="after")
    def one_address(self):
        if (self.address_id is None) == (self.shipping_address is None):
            raise ValueError("send exactly one of address_id or shipping_address")
        return self


class CheckoutOut(BaseModel):
    order_id: uuid.UUID
    order_number: str
    status: str
    total_cents: int
    currency: str
    payment_url: str | None = None
    client_secret: str | None = None


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


class OrderItem(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    product_slug: str | None
    variant_id: uuid.UUID | None
    title: str
    variant_title: str | None
    sku: str | None
    image_url: str | None
    unit_price_cents: int
    quantity: int
    line_total_cents: int


class Shipment(BaseModel):
    id: uuid.UUID
    store: StoreRef
    status: str
    subtotal_cents: int
    shipping_cents: int
    discount_cents: int
    tracking_carrier: str | None
    tracking_number: str | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    items: list[OrderItem]


class OrderSummary(BaseModel):
    id: uuid.UUID
    number: str
    status: str
    currency: str
    total_cents: int
    item_count: int
    created_at: datetime


class Order(BaseModel):
    id: uuid.UUID
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
    paid_at: datetime | None
    created_at: datetime
    shipments: list[Shipment]


# ---------------------------------------------------------------------------
# Seller
# ---------------------------------------------------------------------------


class BusinessInfo(Strict):
    legal_name: Name
    registration_number: ShortText | None = None
    tax_id: ShortText | None = None
    website: HttpsUrl | None = None
    phone: Annotated[str, StringConstraints(max_length=32, pattern=r"^[0-9+() .-]*$")] | None = None


class StoreApplicationIn(Strict):
    store_name: Name
    slug: Slug | None = None
    tagline: ShortText | None = None
    description: Annotated[str, StringConstraints(max_length=4000), AfterValidator(_clean_text)] | None = None
    country: Country
    support_email: EmailStr
    plan_code: Annotated[str, StringConstraints(max_length=40)] = "starter"
    business: BusinessInfo
    message: MediumText | None = None


class PickupIn(Strict):
    lat: Annotated[float, Field(ge=-90, le=90)]
    lng: Annotated[float, Field(ge=-180, le=180)]
    label: ShortText | None = None
    line1: Annotated[str, StringConstraints(max_length=200), AfterValidator(_clean_text)] | None = None
    city: ShortText | None = None


class StoreUpdate(Strict):
    name: Name | None = None
    pickup: PickupIn | None = None
    tagline: ShortText | None = None
    description: Annotated[str, StringConstraints(max_length=4000), AfterValidator(_clean_text)] | None = None
    logo_url: HttpsUrl | None = None
    banner_url: HttpsUrl | None = None
    banner_color: HexColor | None = None
    accent_color: HexColor | None = None
    support_email: EmailStr | None = None


class Subscription(BaseModel):
    status: str
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool


class Balance(BaseModel):
    balance_cents: int
    available_cents: int
    pending_cents: int
    currency: str


class SellerStore(Store):
    status: str
    review_note: str | None
    pickup_address: dict[str, Any] | None
    pickup_lat: float | None
    pickup_lng: float | None


class SellerMe(BaseModel):
    store: SellerStore
    plan: Plan
    subscription: Subscription | None
    balance: Balance
    product_limit: int | None
    active_products: int


class PlanChangeIn(Strict):
    plan_code: Annotated[str, StringConstraints(max_length=40)]
    cancel_at_period_end: bool = False


class VariantIn(Strict):
    sku: Sku
    title: ShortText = "Default"
    options: Annotated[dict[ShortText, ShortText], Field(max_length=6)] = {}
    price_cents: Cents
    compare_at_cents: Cents | None = None
    stock: Annotated[int, Field(ge=0, le=1_000_000)] = 0
    min_order_qty: Quantity = 1
    tier_prices: Annotated[list[TierPrice], Field(max_length=10)] = []
    weight_grams: Annotated[int, Field(ge=0, le=1_000_000)] | None = None
    is_active: bool = True


class VariantUpdate(Strict):
    title: ShortText | None = None
    options: Annotated[dict[ShortText, ShortText], Field(max_length=6)] | None = None
    price_cents: Cents | None = None
    compare_at_cents: Cents | None = None
    stock: Annotated[int, Field(ge=0, le=1_000_000)] | None = None
    min_order_qty: Quantity | None = None
    tier_prices: Annotated[list[TierPrice], Field(max_length=10)] | None = None
    weight_grams: Annotated[int, Field(ge=0, le=1_000_000)] | None = None
    is_active: bool | None = None


class ImageIn(Strict):
    url: HttpsUrl
    alt: ShortText | None = None


ProductStatusIn = Literal["draft", "active", "archived"]


class ProductIn(Strict):
    title: Annotated[str, StringConstraints(min_length=2, max_length=200), AfterValidator(_clean_text)]
    description: LongText = ""
    brand: ShortText | None = None
    category_id: uuid.UUID | None = None
    status: ProductStatusIn = "draft"
    attributes: Annotated[dict[ShortText, ShortText], Field(max_length=40)] = {}
    tags: Annotated[list[Annotated[str, StringConstraints(min_length=1, max_length=40)]], Field(max_length=20)] = []
    variants: Annotated[list[VariantIn], Field(min_length=1, max_length=100)]
    images: Annotated[list[ImageIn], Field(max_length=12)] = []


class ProductUpdate(Strict):
    title: Annotated[str, StringConstraints(min_length=2, max_length=200), AfterValidator(_clean_text)] | None = None
    description: LongText | None = None
    brand: ShortText | None = None
    category_id: uuid.UUID | None = None
    status: ProductStatusIn | None = None
    attributes: Annotated[dict[ShortText, ShortText], Field(max_length=40)] | None = None
    tags: Annotated[list[Annotated[str, StringConstraints(min_length=1, max_length=40)]], Field(max_length=20)] | None = None
    images: Annotated[list[ImageIn], Field(max_length=12)] | None = None


class SellerVariant(Variant):
    is_active: bool
    weight_grams: int | None


class SellerProduct(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    description: str
    brand: str | None
    category_id: uuid.UUID | None
    status: str
    attributes: dict[str, Any]
    tags: list[str]
    currency: str
    price_cents: int | None
    rating: float
    review_count: int
    sold_count: int
    variants: list[SellerVariant]
    images: list[Image]
    created_at: datetime
    updated_at: datetime


class SellerProductRow(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    status: str
    image_url: str | None
    price_cents: int | None
    stock: int
    sold_count: int
    updated_at: datetime


class StoreOrder(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
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
    delivery: "StoreDelivery | None" = None
    tracking_carrier: str | None
    tracking_number: str | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    created_at: datetime
    items: list[OrderItem]


class StoreDelivery(BaseModel):
    id: uuid.UUID
    status: str
    rider_name: str
    rider_vehicle: str
    assigned_at: datetime
    picked_up_at: datetime | None
    delivered_at: datetime | None
    note: str | None


class InventoryRow(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
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


class AvailableRider(BaseModel):
    id: uuid.UUID
    name: str
    vehicle: str
    distance_km: float | None
    eta_to_store_minutes: int | None
    active_deliveries: int
    last_seen_at: datetime | None


class DispatchIn(Strict):
    rider_id: uuid.UUID
    note: MediumText | None = None


class StoreOrderUpdate(Strict):
    status: Literal["processing", "shipped", "delivered"] | None = None
    tracking_carrier: ShortText | None = None
    tracking_number: Annotated[str, StringConstraints(max_length=64, pattern=r"^[A-Za-z0-9 -]*$")] | None = None


class DailyPoint(BaseModel):
    date: date
    sales_cents: int
    orders: int


class TopProduct(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    units: int
    sales_cents: int


class SellerStats(BaseModel):
    currency: str
    sales_cents_30d: int
    orders_30d: int
    units_30d: int
    average_order_cents: int
    to_ship: int
    active_products: int
    rating: float
    review_count: int
    balance: Balance
    daily: list[DailyPoint]
    top_products: list[TopProduct]


class LedgerEntry(BaseModel):
    id: uuid.UUID
    kind: str
    amount_cents: int
    currency: str
    memo: str | None
    available_at: datetime
    created_at: datetime


class RentInvoice(BaseModel):
    id: uuid.UUID
    period_start: datetime
    period_end: datetime
    amount_cents: int
    currency: str
    status: str
    plan_name: str | None
    created_at: datetime


class PayoutMethod(Strict):
    type: Literal["bank_transfer", "paypal", "mobile_money"]
    account_name: Name
    # Only the last four digits are kept; full details are settled out of band.
    account_last4: Annotated[str, StringConstraints(pattern=r"^[0-9A-Za-z]{4}$")]
    provider: ShortText | None = None


class PayoutIn(Strict):
    amount_cents: Annotated[int, Field(gt=0, le=100_000_000)]
    method: PayoutMethod


class Payout(BaseModel):
    id: uuid.UUID
    amount_cents: int
    currency: str
    status: str
    method: dict[str, Any]
    note: str | None
    requested_at: datetime
    processed_at: datetime | None


class PlacementBookingIn(Strict):
    slot_code: Annotated[str, StringConstraints(max_length=40)]
    starts_on: date
    ends_on: date
    product_id: uuid.UUID | None = None
    headline: ShortText | None = None
    image_url: HttpsUrl | None = None


class PlacementBooking(BaseModel):
    id: uuid.UUID
    slot_code: str
    slot_name: str
    starts_on: date
    ends_on: date
    amount_cents: int
    credits_used: int
    currency: str
    status: str
    product_id: uuid.UUID | None
    headline: str | None


class UploadIn(Strict):
    filename: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    content_type: Literal["image/jpeg", "image/png", "image/webp", "image/avif"]


class UploadOut(BaseModel):
    upload_url: str
    public_url: str
    path: str


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class AdminStore(BaseModel):
    id: uuid.UUID
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
    created_at: datetime
    approved_at: datetime | None


class AdminStoreUpdate(Strict):
    status: Literal["active", "suspended", "rejected"] | None = None
    plan_code: Annotated[str, StringConstraints(max_length=40)] | None = None
    review_note: MediumText | None = None


class AdminStats(BaseModel):
    currency: str
    gmv_cents_30d: int
    orders_30d: int
    commission_cents_30d: int
    fees_cents_30d: int
    rent_cents_30d: int
    placement_cents_30d: int
    active_stores: int
    pending_stores: int
    customers: int
    active_products: int
    payouts_requested_cents: int


class AdminPayoutUpdate(Strict):
    status: Literal["approved", "paid", "rejected"]
    note: MediumText | None = None


class AdminPayout(Payout):
    store: StoreRef


class PlanIn(Strict):
    code: Annotated[str, StringConstraints(min_length=2, max_length=40, pattern=r"^[a-z0-9-]+$")]
    name: Name
    description: MediumText | None = None
    monthly_price_cents: Cents
    commission_rate: Annotated[float, Field(ge=0, lt=1)]
    per_item_fee_cents: Cents = 0
    product_limit: Annotated[int, Field(gt=0)] | None = None
    featured_slots: Annotated[int, Field(ge=0, le=100)] = 0
    features: Annotated[list[ShortText], Field(max_length=20)] = []
    sort: int = 0


class PlanUpdate(Strict):
    name: Name | None = None
    description: MediumText | None = None
    monthly_price_cents: Cents | None = None
    commission_rate: Annotated[float, Field(ge=0, lt=1)] | None = None
    per_item_fee_cents: Cents | None = None
    product_limit: Annotated[int, Field(gt=0)] | None = None
    featured_slots: Annotated[int, Field(ge=0, le=100)] | None = None
    features: Annotated[list[ShortText], Field(max_length=20)] | None = None
    is_active: bool | None = None
    sort: int | None = None


class CategoryIn(Strict):
    slug: Slug
    name: Name
    parent_id: uuid.UUID | None = None
    image_url: HttpsUrl | None = None
    sort: int = 0


class CategoryUpdate(Strict):
    name: Name | None = None
    parent_id: uuid.UUID | None = None
    image_url: HttpsUrl | None = None
    sort: int | None = None


class CouponIn(Strict):
    code: Annotated[str, StringConstraints(min_length=3, max_length=40, pattern=r"^[A-Z0-9_-]+$")]
    kind: Literal["percent", "fixed"]
    value: Annotated[int, Field(gt=0, le=100_000_000)]
    store_id: uuid.UUID | None = None
    min_subtotal_cents: Cents = 0
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_redemptions: Annotated[int, Field(gt=0)] | None = None

    @model_validator(mode="after")
    def percent_range(self):
        if self.kind == "percent" and self.value > 100:
            raise ValueError("percent coupons go up to 100")
        return self


class Coupon(BaseModel):
    code: str
    kind: str
    value: int
    store_id: uuid.UUID | None
    min_subtotal_cents: int
    starts_at: datetime | None
    ends_at: datetime | None
    max_redemptions: int | None
    redemptions: int
    is_active: bool


class AdminProductUpdate(Strict):
    status: Literal["active", "blocked", "archived"]


class AdminUserUpdate(Strict):
    role: Literal["customer", "seller", "admin"]


class AdminOrder(OrderSummary):
    customer_email: str | None
    stores: int


class BillingRunOut(BaseModel):
    subscriptions_billed: int
    orders_expired: int


# ---------------------------------------------------------------------------
# Tracking
# ---------------------------------------------------------------------------


class MapPoint(BaseModel):
    lat: float
    lng: float
    label: str | None = None


class RiderPosition(BaseModel):
    lat: float
    lng: float
    at: datetime | None


class RiderPublic(BaseModel):
    name: str
    phone_masked: str | None
    vehicle: str


class DeliveryTrack(BaseModel):
    delivery_id: uuid.UUID | None
    store_name: str
    status: str
    eta_minutes: int | None
    rider: RiderPublic | None
    rider_position: RiderPosition | None
    pickup: MapPoint | None
    dropoff: MapPoint | None
    handover_code: str | None


class Tracking(BaseModel):
    order_status: str
    delivery_id: uuid.UUID | None
    status: str
    eta_minutes: int | None
    rider: RiderPublic | None
    rider_position: RiderPosition | None
    pickup: MapPoint | None
    dropoff: MapPoint | None
    handover_code: str | None
    deliveries: list[DeliveryTrack]


StoreOrder.model_rebuild()
