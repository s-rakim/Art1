-- Accounts that signed up to ride, an audit trail for stock changes, the
-- live event feed, and limits on the image bucket.

-- ---------------------------------------------------------------------------
-- Rider sign-ups
-- ---------------------------------------------------------------------------
--
-- Someone who signs up through the rider link gets the role
-- 'rider_applicant'. The API lets that role do nothing except fill in the
-- hiring form and check on it. An admin hiring them switches the role to
-- 'rider'. If they are later let go they drop back to 'rider_applicant', not
-- to 'customer', because they never signed up to shop.

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
    check (role in ('customer', 'seller', 'rider', 'admin', 'rider_applicant'));
alter table profiles add column signup_as text not null default 'customer'
    check (signup_as in ('customer', 'rider'));

-- ---------------------------------------------------------------------------
-- Stock changes made by a store (sales are already on the order items)
-- ---------------------------------------------------------------------------

create table inventory_adjustments (
    id          uuid primary key default gen_random_uuid(),
    store_id    uuid not null references stores(id) on delete cascade,
    variant_id  uuid not null references product_variants(id) on delete cascade,
    actor_id    uuid references profiles(id) on delete set null,
    stock_before integer not null,
    stock_after  integer not null,
    reason      text,
    created_at  timestamptz not null default now()
);
create index inventory_adjustments_store_idx on inventory_adjustments(store_id, created_at desc);
create index inventory_adjustments_variant_idx on inventory_adjustments(variant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Live events
-- ---------------------------------------------------------------------------
--
-- Every API worker LISTENs on 'live_events' and forwards each event to the
-- websockets subscribed to one of its topics:
--
--   user:<id>      the buyer, the applicant, the store owner as a person
--   store:<id>     the store's back office
--   rider:<id>     the rider's job list
--   delivery:<id>  anyone allowed to watch that delivery on a map
--   ops            admins' activity feed
--   admin          admins' live map (every location fix)
--   catalog        everyone with the site open
--
-- Events are fired from triggers so nothing that changes these rows (API,
-- database functions, the worker, an admin in Studio) can forget to send
-- one. NOTIFY is transactional: a rolled back change never announces itself.
-- Payloads stay small; clients refetch what they show.

create or replace function live_emit(p_to text[], p_event jsonb) returns void
language sql as $$
    select pg_notify('live_events', jsonb_build_object('to', to_jsonb(p_to), 'event', p_event)::text);
$$;

create or replace function live_store_orders() returns trigger language plpgsql as $$
declare
    v_buyer uuid;
begin
    if tg_op = 'UPDATE' and new.status is not distinct from old.status
       and new.payment_status is not distinct from old.payment_status then
        return null;
    end if;
    select user_id into v_buyer from orders where id = new.order_id;
    perform live_emit(
        array['user:' || v_buyer, 'store:' || new.store_id, 'ops'],
        jsonb_build_object('type', 'order', 'order_id', new.order_id, 'store_order_id', new.id,
                           'status', new.status, 'payment_status', new.payment_status, 'at', now()));
    return null;
end $$;

create trigger store_orders_live
    after insert or update of status, payment_status on store_orders
    for each row execute function live_store_orders();

create or replace function live_deliveries() returns trigger language plpgsql as $$
declare
    v_buyer uuid;
begin
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
        return null;
    end if;
    select o.user_id into v_buyer
      from store_orders so join orders o on o.id = so.order_id where so.id = new.store_order_id;
    perform live_emit(
        array['rider:' || new.rider_id, 'store:' || new.store_id, 'user:' || v_buyer, 'ops'],
        jsonb_build_object('type', 'job', 'delivery_id', new.id, 'store_order_id', new.store_order_id,
                           'status', new.status, 'at', now()));
    -- The map stream keeps its original message shape.
    perform live_emit(
        array['delivery:' || new.id, 'admin'],
        jsonb_build_object('type', 'status', 'delivery_id', new.id, 'status', new.status, 'at', now()));
    return null;
end $$;

create trigger deliveries_live
    after insert or update of status on deliveries
    for each row execute function live_deliveries();

create or replace function live_stock() returns trigger language plpgsql as $$
declare
    v_store uuid;
begin
    if tg_op = 'UPDATE' and new.stock = old.stock then
        return null;
    end if;
    select store_id into v_store from products where id = new.product_id;
    perform live_emit(
        array['store:' || v_store],
        jsonb_build_object('type', 'stock', 'product_id', new.product_id, 'variant_id', new.id,
                           'stock', new.stock, 'at', now()));
    return null;
end $$;

create trigger product_variants_live
    after insert or update of stock on product_variants
    for each row execute function live_stock();

-- Public catalogue changes. Only for products a shopper can see (or just
-- could), so drafts never announce themselves, and only for columns a
-- product page shows, so a sale bumping sold_count stays quiet.
create or replace function live_catalog_product() returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' and (
        (new.status <> 'active' and old.status <> 'active')
        or (new.title, new.description, new.brand, new.category_id, new.status, new.attributes, new.tags,
            new.min_price_cents, new.slug)
           is not distinct from
           (old.title, old.description, old.brand, old.category_id, old.status, old.attributes, old.tags,
            old.min_price_cents, old.slug)) then
        return null;
    end if;
    if tg_op = 'DELETE' then
        if old.status = 'active' then
            perform live_emit(array['catalog'],
                jsonb_build_object('type', 'catalog', 'product_id', old.id, 'slug', old.slug, 'at', now()));
        end if;
        return null;
    end if;
    if tg_op = 'INSERT' and new.status <> 'active' then
        return null;
    end if;
    perform live_emit(array['catalog'],
        jsonb_build_object('type', 'catalog', 'product_id', new.id, 'slug', new.slug, 'at', now()));
    return null;
end $$;

create trigger products_live
    after insert or update or delete on products
    for each row execute function live_catalog_product();

create or replace function live_catalog_images() returns trigger language plpgsql as $$
declare
    v_product uuid := coalesce(new.product_id, old.product_id);
    v_slug text;
begin
    select slug into v_slug from products where id = v_product and status = 'active';
    if v_slug is not null then
        perform live_emit(array['catalog'],
            jsonb_build_object('type', 'catalog', 'product_id', v_product, 'slug', v_slug, 'at', now()));
    end if;
    return null;
end $$;

create trigger product_images_live
    after insert or update or delete on product_images
    for each row execute function live_catalog_images();

create or replace function live_rider_applications() returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
        return null;
    end if;
    perform live_emit(
        array['user:' || new.id, 'ops'],
        jsonb_build_object('type', 'application', 'kind', 'rider', 'id', new.id, 'status', new.status, 'at', now()));
    return null;
end $$;

create trigger riders_live
    after insert or update of status on riders
    for each row execute function live_rider_applications();

create or replace function live_store_applications() returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
        return null;
    end if;
    perform live_emit(
        array['user:' || new.owner_id, 'ops'],
        jsonb_build_object('type', 'application', 'kind', 'vendor', 'id', new.id, 'status', new.status, 'at', now()));
    return null;
end $$;

create trigger stores_live
    after insert or update of status on stores
    for each row execute function live_store_applications();

-- ---------------------------------------------------------------------------
-- Image bucket limits (Supabase only)
-- ---------------------------------------------------------------------------
--
-- The API re-encodes every image it stores, but the older signed upload
-- route lets the browser write straight to Storage. The bucket itself
-- refuses anything that isn't a small image.

do $$
begin
    if to_regclass('storage.buckets') is not null then
        insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        values ('product-images', 'product-images', true, 5242880,
                array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
        on conflict (id) do update
           set public = true,
               file_size_limit = excluded.file_size_limit,
               allowed_mime_types = excluded.allowed_mime_types;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- Automatic dispatch
-- ---------------------------------------------------------------------------
--
-- An order ready to go out is offered to the closest free rider to the
-- shop. A store can take an order off automatic dispatch (by pulling a job
-- back from a rider) and pick riders by hand; dispatching with no rider
-- chosen switches it back on.

alter table store_orders add column auto_dispatch boolean not null default true;
create index deliveries_store_order_idx on deliveries(store_order_id, status);
