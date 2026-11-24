-- Core marketplace schema.
--
-- Money is always stored as integer cents next to a currency code.
-- Users live in Supabase Auth; `profiles.id` is the auth user id. There is
-- deliberately no foreign key into auth.users so the same migrations run on a
-- plain Postgres box for local work and CI.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table profiles (
    id          uuid primary key,
    email       text,
    full_name   text,
    avatar_url  text,
    role        text not null default 'customer'
                check (role in ('customer', 'seller', 'rider', 'admin')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table addresses (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references profiles(id) on delete cascade,
    label        text,
    full_name    text not null,
    line1        text not null,
    line2        text,
    city         text not null,
    region       text,
    postal_code  text,
    country      char(2) not null,
    phone        text,
    lat          double precision check (lat between -90 and 90),
    lng          double precision check (lng between -180 and 180),
    is_default   boolean not null default false,
    created_at   timestamptz not null default now()
);
create index addresses_user_idx on addresses(user_id);
create unique index addresses_one_default on addresses(user_id) where is_default;

-- ---------------------------------------------------------------------------
-- Renting space: plans, stores, subscriptions, invoices, placements
-- ---------------------------------------------------------------------------

-- A plan is the "lease" a retailer signs for a storefront on the marketplace.
-- It mixes the two models the big players use: a flat monthly rent
-- (Amazon Professional, Alibaba Gold Supplier) and a referral commission on
-- each sale (Amazon, Shein marketplace). per_item_fee covers the
-- pay-as-you-go tier where rent is zero but every unit sold costs a little.
create table store_plans (
    id                   uuid primary key default gen_random_uuid(),
    code                 text not null unique,
    name                 text not null,
    description          text,
    monthly_price_cents  integer not null default 0 check (monthly_price_cents >= 0),
    currency             char(3) not null default 'USD',
    commission_rate      numeric(5,4) not null check (commission_rate >= 0 and commission_rate < 1),
    per_item_fee_cents   integer not null default 0 check (per_item_fee_cents >= 0),
    product_limit        integer check (product_limit is null or product_limit > 0),
    featured_slots       integer not null default 0,
    features             text[] not null default '{}',
    is_active            boolean not null default true,
    sort                 integer not null default 0,
    created_at           timestamptz not null default now()
);

create table stores (
    id            uuid primary key default gen_random_uuid(),
    owner_id      uuid not null unique references profiles(id) on delete restrict,
    slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name          text not null,
    tagline       text,
    description   text,
    logo_url      text,
    banner_url    text,
    banner_color  text check (banner_color ~ '^#[0-9a-fA-F]{6}$'),
    accent_color  text check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
    country       char(2),
    support_email text,
    -- Where riders collect parcels.
    pickup_address jsonb,
    pickup_lat     double precision check (pickup_lat between -90 and 90),
    pickup_lng     double precision check (pickup_lng between -180 and 180),
    status        text not null default 'pending'
                  check (status in ('pending', 'active', 'suspended', 'rejected')),
    plan_id       uuid not null references store_plans(id),
    application   jsonb not null default '{}'::jsonb,
    review_note   text,
    rating_avg    numeric(3,2) not null default 0,
    rating_count  integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    approved_at   timestamptz
);
create index stores_status_idx on stores(status);

create table store_subscriptions (
    id                    uuid primary key default gen_random_uuid(),
    store_id              uuid not null references stores(id) on delete cascade,
    plan_id               uuid not null references store_plans(id),
    status                text not null default 'active'
                          check (status in ('trialing', 'active', 'past_due', 'canceled')),
    current_period_start  timestamptz not null default now(),
    current_period_end    timestamptz not null default now() + interval '1 month',
    cancel_at_period_end  boolean not null default false,
    created_at            timestamptz not null default now()
);
create unique index store_subscriptions_one_live
    on store_subscriptions(store_id) where status <> 'canceled';

create table rent_invoices (
    id               uuid primary key default gen_random_uuid(),
    store_id         uuid not null references stores(id) on delete cascade,
    subscription_id  uuid references store_subscriptions(id) on delete set null,
    plan_id          uuid references store_plans(id),
    period_start     timestamptz not null,
    period_end       timestamptz not null,
    amount_cents     integer not null,
    currency         char(3) not null default 'USD',
    status           text not null default 'paid' check (status in ('open', 'paid', 'void')),
    created_at       timestamptz not null default now()
);
create index rent_invoices_store_idx on rent_invoices(store_id, created_at desc);

-- Paid placements: the homepage hero, category banners, sponsored search
-- results. Stores book them by the day.
create table placement_slots (
    id                 uuid primary key default gen_random_uuid(),
    code               text not null unique,
    name               text not null,
    description        text,
    location           text not null
                       check (location in ('home_hero', 'home_grid', 'category_top', 'search_top')),
    daily_price_cents  integer not null check (daily_price_cents >= 0),
    currency           char(3) not null default 'USD',
    capacity           integer not null default 1 check (capacity > 0),
    is_active          boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table categories (
    id         uuid primary key default gen_random_uuid(),
    parent_id  uuid references categories(id) on delete set null,
    slug       text not null unique,
    name       text not null,
    image_url  text,
    sort       integer not null default 0
);
create index categories_parent_idx on categories(parent_id);

create table products (
    id               uuid primary key default gen_random_uuid(),
    store_id         uuid not null references stores(id) on delete cascade,
    category_id      uuid references categories(id) on delete set null,
    slug             text not null unique,
    title            text not null,
    description      text not null default '',
    brand            text,
    status           text not null default 'draft'
                     check (status in ('draft', 'active', 'archived', 'blocked')),
    attributes       jsonb not null default '{}'::jsonb,
    tags             text[] not null default '{}',
    currency         char(3) not null default 'USD',
    min_price_cents  integer,
    max_price_cents  integer,
    rating_avg       numeric(3,2) not null default 0,
    rating_count     integer not null default 0,
    sold_count       integer not null default 0,
    search           tsvector generated always as (
                        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                        setweight(to_tsvector('simple', coalesce(brand, '')), 'B') ||
                        setweight(to_tsvector('english', coalesce(description, '')), 'C')
                     ) stored,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index products_store_idx on products(store_id, status);
create index products_category_idx on products(category_id) where status = 'active';
create index products_search_idx on products using gin(search);
create index products_title_trgm on products using gin(title gin_trgm_ops);
create index products_created_idx on products(created_at desc) where status = 'active';

-- Variants carry the price and the stock. tier_prices gives wholesale style
-- volume pricing, e.g. [{"min_qty": 10, "price_cents": 850}].
create table product_variants (
    id                uuid primary key default gen_random_uuid(),
    product_id        uuid not null references products(id) on delete cascade,
    sku               text not null unique,
    title             text not null default 'Default',
    options           jsonb not null default '{}'::jsonb,
    price_cents       integer not null check (price_cents >= 0),
    compare_at_cents  integer check (compare_at_cents is null or compare_at_cents >= 0),
    stock             integer not null default 0 check (stock >= 0),
    min_order_qty     integer not null default 1 check (min_order_qty >= 1),
    tier_prices       jsonb not null default '[]'::jsonb,
    weight_grams      integer,
    is_active         boolean not null default true,
    created_at        timestamptz not null default now()
);
create index product_variants_product_idx on product_variants(product_id);

create table product_images (
    id          uuid primary key default gen_random_uuid(),
    product_id  uuid not null references products(id) on delete cascade,
    url         text not null,
    alt         text,
    sort        integer not null default 0
);
create index product_images_product_idx on product_images(product_id, sort);

create table placement_bookings (
    id            uuid primary key default gen_random_uuid(),
    slot_id       uuid not null references placement_slots(id),
    store_id      uuid not null references stores(id) on delete cascade,
    product_id    uuid references products(id) on delete set null,
    headline      text,
    image_url     text,
    starts_on     date not null,
    ends_on       date not null check (ends_on >= starts_on),
    amount_cents  integer not null,
    credits_used  integer not null default 0,
    currency      char(3) not null default 'USD',
    status        text not null default 'scheduled'
                  check (status in ('scheduled', 'live', 'ended', 'canceled')),
    created_at    timestamptz not null default now()
);
create index placement_bookings_window_idx on placement_bookings(slot_id, starts_on, ends_on);

create table reviews (
    id          uuid primary key default gen_random_uuid(),
    product_id  uuid not null references products(id) on delete cascade,
    user_id     uuid not null references profiles(id) on delete cascade,
    rating      smallint not null check (rating between 1 and 5),
    title       text,
    body        text,
    verified    boolean not null default false,
    created_at  timestamptz not null default now(),
    unique (product_id, user_id)
);
create index reviews_product_idx on reviews(product_id, created_at desc);

create table wishlist_items (
    user_id     uuid not null references profiles(id) on delete cascade,
    product_id  uuid not null references products(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Cart and orders
-- ---------------------------------------------------------------------------

create table carts (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null unique references profiles(id) on delete cascade,
    updated_at  timestamptz not null default now()
);

create table cart_items (
    id          uuid primary key default gen_random_uuid(),
    cart_id     uuid not null references carts(id) on delete cascade,
    variant_id  uuid not null references product_variants(id) on delete cascade,
    quantity    integer not null check (quantity > 0),
    added_at    timestamptz not null default now(),
    unique (cart_id, variant_id)
);

create table coupons (
    code                text primary key check (code = upper(code)),
    kind                text not null check (kind in ('percent', 'fixed')),
    value               integer not null check (value > 0),
    store_id            uuid references stores(id) on delete cascade,
    min_subtotal_cents  integer not null default 0,
    starts_at           timestamptz,
    ends_at             timestamptz,
    max_redemptions     integer,
    redemptions         integer not null default 0,
    is_active           boolean not null default true,
    created_at          timestamptz not null default now()
);

create sequence order_number_seq start 100001;

create table orders (
    id                uuid primary key default gen_random_uuid(),
    number            text not null unique,
    user_id           uuid not null references profiles(id),
    status            text not null default 'pending_payment'
                      check (status in ('pending_payment', 'paid', 'partially_fulfilled',
                                        'fulfilled', 'canceled', 'refunded')),
    currency          char(3) not null default 'USD',
    subtotal_cents    integer not null,
    discount_cents    integer not null default 0,
    shipping_cents    integer not null default 0,
    tax_cents         integer not null default 0,
    total_cents       integer not null,
    coupon_code       text,
    shipping_address  jsonb not null,
    -- cod: cash on delivery. bank_transfer: buyer pays the store directly and
    -- the store confirms. card: online provider, confirmed by webhook.
    payment_method    text not null default 'cod'
                      check (payment_method in ('cod', 'bank_transfer', 'card')),
    payment_provider  text,
    payment_ref       text,
    paid_at           timestamptz,
    canceled_at       timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index orders_user_idx on orders(user_id, created_at desc);
create index orders_status_idx on orders(status, created_at);

-- One sub-order per store. This is what a seller sees and fulfils.
create table store_orders (
    id                uuid primary key default gen_random_uuid(),
    order_id          uuid not null references orders(id) on delete cascade,
    store_id          uuid not null references stores(id),
    status            text not null default 'pending'
                      check (status in ('pending', 'processing', 'shipped', 'delivered',
                                        'canceled', 'returned')),
    subtotal_cents    integer not null,
    discount_cents    integer not null default 0,
    shipping_cents    integer not null default 0,
    commission_cents  integer not null default 0,
    fee_cents         integer not null default 0,
    payout_cents      integer not null default 0,
    payment_status    text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
    paid_at           timestamptz,
    paid_via          text check (paid_via in ('platform', 'store')),
    tracking_carrier  text,
    tracking_number   text,
    shipped_at        timestamptz,
    delivered_at      timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (order_id, store_id)
);
create index store_orders_store_idx on store_orders(store_id, created_at desc);

create table order_items (
    id                uuid primary key default gen_random_uuid(),
    order_id          uuid not null references orders(id) on delete cascade,
    store_order_id    uuid not null references store_orders(id) on delete cascade,
    product_id        uuid references products(id) on delete set null,
    variant_id        uuid references product_variants(id) on delete set null,
    title             text not null,
    variant_title     text,
    sku               text,
    image_url         text,
    unit_price_cents  integer not null,
    quantity          integer not null check (quantity > 0),
    line_total_cents  integer not null
);
create index order_items_order_idx on order_items(order_id);
create index order_items_product_idx on order_items(product_id);

-- ---------------------------------------------------------------------------
-- Money owed to sellers
-- ---------------------------------------------------------------------------

-- Every movement of a store's balance is a signed ledger row. Balance is the
-- sum; "available" is the sum of rows whose hold has elapsed.
create table ledger_entries (
    id            uuid primary key default gen_random_uuid(),
    store_id      uuid not null references stores(id) on delete cascade,
    kind          text not null check (kind in ('sale', 'commission', 'fee', 'rent', 'placement',
                                                'delivery', 'payout', 'refund', 'adjustment')),
    amount_cents  integer not null,
    currency      char(3) not null default 'USD',
    ref_type      text,
    ref_id        uuid,
    memo          text,
    available_at  timestamptz not null default now(),
    created_at    timestamptz not null default now()
);
create index ledger_store_idx on ledger_entries(store_id, created_at desc);

create table payouts (
    id            uuid primary key default gen_random_uuid(),
    store_id      uuid not null references stores(id) on delete cascade,
    amount_cents  integer not null check (amount_cents > 0),
    currency      char(3) not null default 'USD',
    status        text not null default 'requested'
                  check (status in ('requested', 'approved', 'paid', 'rejected')),
    method        jsonb not null default '{}'::jsonb,
    note          text,
    requested_at  timestamptz not null default now(),
    processed_at  timestamptz
);
create index payouts_store_idx on payouts(store_id, requested_at desc);
create index payouts_status_idx on payouts(status);

-- ---------------------------------------------------------------------------
-- Riders and deliveries
-- ---------------------------------------------------------------------------

-- Riders are hired by the marketplace: they apply, an admin approves them,
-- and stores dispatch them to carry orders from the store to the buyer.
create table riders (
    id               uuid primary key references profiles(id) on delete cascade,
    full_name        text not null,
    phone            text not null,
    city             text not null,
    vehicle          text not null check (vehicle in ('bicycle', 'motorbike', 'car', 'van', 'on_foot')),
    licence_number   text,
    status           text not null default 'applicant'
                     check (status in ('applicant', 'active', 'suspended', 'rejected')),
    review_note      text,
    is_online        boolean not null default false,
    last_lat         double precision,
    last_lng         double precision,
    last_accuracy_m  real,
    last_heading     real,
    last_seen_at     timestamptz,
    created_at       timestamptz not null default now(),
    approved_at      timestamptz
);
create index riders_available_idx on riders(status, is_online, last_seen_at desc);

create table deliveries (
    id               uuid primary key default gen_random_uuid(),
    store_order_id   uuid not null references store_orders(id) on delete cascade,
    store_id         uuid not null references stores(id) on delete cascade,
    rider_id         uuid not null references riders(id),
    status           text not null default 'assigned'
                     check (status in ('assigned', 'accepted', 'declined', 'picked_up',
                                       'delivered', 'failed', 'canceled')),
    pickup           jsonb not null,   -- {lat, lng, label}
    dropoff          jsonb not null,   -- {lat, lng, label, address}
    -- The buyer reads this code to the rider at the door. Without it the
    -- rider cannot mark the parcel delivered.
    handover_code    text not null,
    code_attempts    integer not null default 0,
    fee_cents        integer not null default 0,
    currency         char(3) not null default 'USD',
    note             text,
    assigned_at      timestamptz not null default now(),
    accepted_at      timestamptz,
    picked_up_at     timestamptz,
    delivered_at     timestamptz,
    ended_at         timestamptz
);
create unique index deliveries_one_live_per_order
    on deliveries(store_order_id) where status in ('assigned', 'accepted', 'picked_up');
create index deliveries_rider_idx on deliveries(rider_id, assigned_at desc);
create index deliveries_store_idx on deliveries(store_id, assigned_at desc);
create index deliveries_live_idx on deliveries(status) where status in ('assigned', 'accepted', 'picked_up');

-- Breadcrumbs. Kept for a few days for disputes, then pruned by the worker.
create table rider_locations (
    id           bigserial primary key,
    rider_id     uuid not null references riders(id) on delete cascade,
    delivery_id  uuid references deliveries(id) on delete set null,
    lat          double precision not null check (lat between -90 and 90),
    lng          double precision not null check (lng between -180 and 180),
    accuracy_m   real,
    heading      real,
    recorded_at  timestamptz not null default now()
);
create index rider_locations_rider_idx on rider_locations(rider_id, recorded_at desc);
create index rider_locations_delivery_idx on rider_locations(delivery_id, recorded_at desc);

create table rider_earnings (
    id            uuid primary key default gen_random_uuid(),
    rider_id      uuid not null references riders(id) on delete cascade,
    delivery_id   uuid not null unique references deliveries(id) on delete cascade,
    amount_cents  integer not null,
    currency      char(3) not null default 'USD',
    paid_out      boolean not null default false,
    created_at    timestamptz not null default now()
);
create index rider_earnings_rider_idx on rider_earnings(rider_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Site wide switches the admin controls
-- ---------------------------------------------------------------------------

create table app_settings (
    id                   boolean primary key default true check (id),
    maintenance_mode     boolean not null default false,
    maintenance_message  text,
    vendor_signups_open  boolean not null default true,
    rider_signups_open   boolean not null default true,
    updated_at           timestamptz not null default now(),
    updated_by           uuid references profiles(id) on delete set null
);
insert into app_settings default values;
