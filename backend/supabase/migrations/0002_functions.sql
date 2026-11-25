-- Business logic that has to be atomic lives in the database: placing an
-- order, marking it paid, cancelling, and the monthly rent run. The API calls
-- these functions inside a transaction and maps the custom SQLSTATEs below
-- onto HTTP errors.
--
--   MK404  something referenced does not exist
--   MK409  the request conflicts with current state (stock, status, ...)
--   MK422  the request is well formed but not acceptable (coupon rules, ...)

-- ---------------------------------------------------------------------------
-- Small helpers and triggers
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end $$;

create trigger profiles_touch     before update on profiles     for each row execute function touch_updated_at();
create trigger stores_touch       before update on stores       for each row execute function touch_updated_at();
create trigger products_touch     before update on products     for each row execute function touch_updated_at();
create trigger orders_touch       before update on orders       for each row execute function touch_updated_at();
create trigger store_orders_touch before update on store_orders for each row execute function touch_updated_at();

-- Volume pricing: the highest tier whose min_qty fits wins.
create or replace function variant_unit_price(p_price integer, p_tiers jsonb, p_qty integer)
returns integer language sql immutable as $$
    select coalesce(
        (select (t->>'price_cents')::integer
           from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) t
          where (t->>'min_qty')::integer <= p_qty
          order by (t->>'min_qty')::integer desc
          limit 1),
        p_price)
$$;

-- Keep products.min/max_price_cents in step with their variants so listing
-- queries never need to aggregate.
create or replace function refresh_product_price(p_product uuid) returns void
language sql as $$
    update products p
       set min_price_cents = agg.lo,
           max_price_cents = agg.hi
      from (select min(price_cents) lo, max(price_cents) hi
              from product_variants
             where product_id = p_product and is_active) agg
     where p.id = p_product
$$;

create or replace function variants_changed() returns trigger
language plpgsql as $$
begin
    if tg_op in ('UPDATE', 'DELETE') then
        perform refresh_product_price(old.product_id);
        perform pg_notify('catalog_changed', 'product:' || old.product_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.product_id <> old.product_id) then
        perform refresh_product_price(new.product_id);
        perform pg_notify('catalog_changed', 'product:' || new.product_id);
    end if;
    return null;
end $$;

create trigger product_variants_changed
    after insert or update or delete on product_variants
    for each row execute function variants_changed();

-- Tell the search service something moved. Payload is "product:<id>" or
-- "store:<id>"; it reloads just that slice of the index.
create or replace function products_changed() returns trigger
language plpgsql as $$
begin
    perform pg_notify('catalog_changed', 'product:' || coalesce(new.id, old.id));
    return null;
end $$;

create trigger products_notify
    after insert or update or delete on products
    for each row execute function products_changed();

create or replace function stores_changed() returns trigger
language plpgsql as $$
begin
    if new.status is distinct from old.status or new.name is distinct from old.name then
        perform pg_notify('catalog_changed', 'store:' || new.id);
    end if;
    return null;
end $$;

create trigger stores_notify
    after update on stores
    for each row execute function stores_changed();

-- Ratings roll up to the product and to the store.
create or replace function reviews_changed() returns trigger
language plpgsql as $$
declare
    v_product uuid := coalesce(new.product_id, old.product_id);
    v_store   uuid;
begin
    update products p
       set rating_avg   = coalesce(r.avg, 0),
           rating_count = r.cnt
      from (select round(avg(rating)::numeric, 2) avg, count(*) cnt
              from reviews where product_id = v_product) r
     where p.id = v_product
    returning p.store_id into v_store;

    if v_store is not null then
        update stores s
           set rating_avg   = coalesce(r.avg, 0),
               rating_count = r.cnt
          from (select round(avg(rv.rating)::numeric, 2) avg, count(*) cnt
                  from reviews rv join products p on p.id = rv.product_id
                 where p.store_id = v_store) r
         where s.id = v_store;
    end if;
    return null;
end $$;

create trigger reviews_rollup
    after insert or update or delete on reviews
    for each row execute function reviews_changed();

-- An order's status follows its store orders: paid once every live store
-- order is paid, partially fulfilled once anything is on the road, fulfilled
-- when everything has arrived.
create or replace function store_orders_changed() returns trigger
language plpgsql as $$
declare
    v_total     integer;
    v_done      integer;
    v_moving    integer;
    v_canceled  integer;
    v_paid      integer;
begin
    if new.status is not distinct from old.status
       and new.payment_status is not distinct from old.payment_status then
        return null;
    end if;

    select count(*),
           count(*) filter (where status in ('delivered', 'returned')),
           count(*) filter (where status in ('shipped', 'delivered', 'returned')),
           count(*) filter (where status = 'canceled'),
           count(*) filter (where status <> 'canceled' and payment_status = 'paid')
      into v_total, v_done, v_moving, v_canceled, v_paid
      from store_orders where order_id = new.order_id;

    if v_canceled = v_total then
        return null;   -- cancel_order() owns that transition
    end if;

    update orders
       set status = case
               when v_done + v_canceled = v_total then 'fulfilled'
               when v_moving > 0 then 'partially_fulfilled'
               when v_paid = v_total - v_canceled then 'paid'
               else status end,
           paid_at = case when v_paid = v_total - v_canceled then coalesce(paid_at, now()) else paid_at end
     where id = new.order_id
       and status not in ('canceled', 'refunded');
    return null;
end $$;

create trigger store_orders_rollup
    after update on store_orders
    for each row execute function store_orders_changed();

-- ---------------------------------------------------------------------------
-- Balances
-- ---------------------------------------------------------------------------

create or replace view store_balances as
select s.id as store_id,
       coalesce(sum(l.amount_cents), 0)::bigint as balance_cents,
       coalesce(sum(l.amount_cents) filter (where l.available_at <= now()), 0)::bigint as available_cents,
       coalesce(sum(l.amount_cents) filter (where l.available_at > now()), 0)::bigint as pending_cents
  from stores s
  left join ledger_entries l on l.store_id = s.id
 group by s.id;

-- ---------------------------------------------------------------------------
-- Checkout
-- ---------------------------------------------------------------------------

create or replace function place_order(
    p_user            uuid,
    p_address         jsonb,
    p_coupon          text    default null,
    p_shipping_flat   integer default 0,
    p_free_ship_over  integer default 0,
    p_tax_rate        numeric default 0,
    p_payment_method  text    default 'cod'
) returns uuid
language plpgsql as $$
declare
    v_cart       uuid;
    v_order      uuid;
    v_currency   char(3);
    v_bad        record;
    v_coupon     coupons%rowtype;
    v_subtotal   integer;
    v_discount   integer := 0;
    v_shipping   integer;
    v_tax        integer;
    v_base       integer;
begin
    select id into v_cart from carts where user_id = p_user;
    if v_cart is null or not exists (select 1 from cart_items where cart_id = v_cart) then
        raise exception 'cart_empty' using errcode = 'MK409', detail = 'Your cart is empty.';
    end if;

    -- Lock every variant in the cart in a stable order so two checkouts that
    -- share items cannot deadlock or oversell.
    perform 1 from product_variants
      where id in (select variant_id from cart_items where cart_id = v_cart)
      order by id
      for update;

    select ci.quantity, v.stock, v.min_order_qty, v.is_active, v.sku,
           p.title, p.status as product_status, s.status as store_status
      into v_bad
      from cart_items ci
      join product_variants v on v.id = ci.variant_id
      join products p on p.id = v.product_id
      join stores s on s.id = p.store_id
     where ci.cart_id = v_cart
       and (not v.is_active or p.status <> 'active' or s.status <> 'active'
            or ci.quantity > v.stock or ci.quantity < v.min_order_qty)
     limit 1;

    if found then
        if not v_bad.is_active or v_bad.product_status <> 'active' or v_bad.store_status <> 'active' then
            raise exception 'item_unavailable' using errcode = 'MK409',
                detail = format('%s is no longer available.', v_bad.title);
        elsif v_bad.quantity > v_bad.stock then
            raise exception 'out_of_stock' using errcode = 'MK409',
                detail = format('Only %s left of %s.', v_bad.stock, v_bad.title);
        else
            raise exception 'below_minimum' using errcode = 'MK422',
                detail = format('%s has a minimum order of %s.', v_bad.title, v_bad.min_order_qty);
        end if;
    end if;

    select min(p.currency) into v_currency
      from cart_items ci
      join product_variants v on v.id = ci.variant_id
      join products p on p.id = v.product_id
     where ci.cart_id = v_cart
    having count(distinct p.currency) = 1;
    if v_currency is null then
        raise exception 'mixed_currency' using errcode = 'MK422',
            detail = 'All items in one checkout must share a currency.';
    end if;

    if p_coupon is not null and length(trim(p_coupon)) > 0 then
        select * into v_coupon from coupons where code = upper(trim(p_coupon)) for update;
        if not found or not v_coupon.is_active
           or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
           or (v_coupon.ends_at is not null and v_coupon.ends_at < now())
           or (v_coupon.max_redemptions is not null and v_coupon.redemptions >= v_coupon.max_redemptions) then
            raise exception 'coupon_invalid' using errcode = 'MK422',
                detail = 'That coupon code is not valid right now.';
        end if;
    end if;

    if p_payment_method not in ('cod', 'bank_transfer', 'card') then
        raise exception 'bad_payment_method' using errcode = 'MK422', detail = 'Unknown payment method.';
    end if;

    insert into orders (number, user_id, currency, subtotal_cents, total_cents, shipping_address, coupon_code,
                        payment_method)
    values ('BZ-' || to_char(now(), 'YYMMDD') || '-' || nextval('order_number_seq'),
            p_user, v_currency, 0, 0, p_address, v_coupon.code, p_payment_method)
    returning id into v_order;

    -- One store order per seller. Cash on delivery orders go straight to
    -- the store to pack; the others wait for payment.
    insert into store_orders (order_id, store_id, subtotal_cents, shipping_cents, status)
    select v_order, p.store_id,
           sum(variant_unit_price(v.price_cents, v.tier_prices, ci.quantity) * ci.quantity),
           0,
           case when p_payment_method = 'cod' then 'processing' else 'pending' end
      from cart_items ci
      join product_variants v on v.id = ci.variant_id
      join products p on p.id = v.product_id
     where ci.cart_id = v_cart
     group by p.store_id;

    update store_orders
       set shipping_cents = case when p_free_ship_over > 0 and subtotal_cents >= p_free_ship_over
                                 then 0 else p_shipping_flat end
     where order_id = v_order;

    insert into order_items (order_id, store_order_id, product_id, variant_id, title, variant_title,
                             sku, image_url, unit_price_cents, quantity, line_total_cents)
    select v_order, so.id, p.id, v.id, p.title, v.title, v.sku,
           (select url from product_images i where i.product_id = p.id order by sort limit 1),
           variant_unit_price(v.price_cents, v.tier_prices, ci.quantity),
           ci.quantity,
           variant_unit_price(v.price_cents, v.tier_prices, ci.quantity) * ci.quantity
      from cart_items ci
      join product_variants v on v.id = ci.variant_id
      join products p on p.id = v.product_id
      join store_orders so on so.order_id = v_order and so.store_id = p.store_id
     where ci.cart_id = v_cart;

    select sum(subtotal_cents) into v_subtotal from store_orders where order_id = v_order;

    -- Coupons. A store coupon is funded by that store and comes off its
    -- payout. A marketplace coupon is funded by the platform.
    if v_coupon.code is not null then
        if v_coupon.store_id is not null then
            select subtotal_cents into v_base from store_orders
             where order_id = v_order and store_id = v_coupon.store_id;
            v_base := coalesce(v_base, 0);
        else
            v_base := v_subtotal;
        end if;

        if v_base = 0 or v_base < v_coupon.min_subtotal_cents then
            raise exception 'coupon_not_applicable' using errcode = 'MK422',
                detail = 'Your cart does not qualify for that coupon.';
        end if;

        v_discount := least(v_base,
            case v_coupon.kind when 'percent' then round(v_base * least(v_coupon.value, 100) / 100.0)::integer
                               else v_coupon.value end);

        if v_coupon.store_id is not null then
            update store_orders set discount_cents = v_discount
             where order_id = v_order and store_id = v_coupon.store_id;
        end if;

        update coupons set redemptions = redemptions + 1 where code = v_coupon.code;
    end if;

    -- What the marketplace keeps from each store order.
    update store_orders so
       set commission_cents = round((so.subtotal_cents - so.discount_cents) * pl.commission_rate)::integer,
           fee_cents        = pl.per_item_fee_cents * q.units
      from stores s
      join store_plans pl on pl.id = s.plan_id,
           (select store_order_id, sum(quantity)::integer units
              from order_items where order_id = v_order group by store_order_id) q
     where so.order_id = v_order and s.id = so.store_id and q.store_order_id = so.id;

    update store_orders
       set payout_cents = subtotal_cents - discount_cents + shipping_cents - commission_cents - fee_cents
     where order_id = v_order;

    select sum(shipping_cents) into v_shipping from store_orders where order_id = v_order;
    v_tax := round((v_subtotal - v_discount) * coalesce(p_tax_rate, 0))::integer;

    update orders
       set subtotal_cents = v_subtotal,
           discount_cents = v_discount,
           shipping_cents = v_shipping,
           tax_cents      = v_tax,
           total_cents    = v_subtotal - v_discount + v_shipping + v_tax
     where id = v_order;

    -- Reserve the stock now; an unpaid order gives it back when it expires.
    update product_variants v
       set stock = v.stock - ci.quantity
      from cart_items ci
     where ci.cart_id = v_cart and ci.variant_id = v.id;

    delete from cart_items where cart_id = v_cart;
    return v_order;
end $$;

-- Records that one store's share of an order has been paid.
--
--   p_via = 'platform'  the money reached the marketplace (card, or an
--                       admin confirming a transfer). The store is credited
--                       the sale and debited commission and fees.
--   p_via = 'store'     the store collected it itself (cash on delivery,
--                       transfer to the store's account). The store already
--                       holds the money, so only commission and fees are
--                       debited from its balance.
--
-- Idempotent: returns false if it was already paid.
create or replace function mark_store_order_paid(
    p_store_order  uuid,
    p_via          text,
    p_hold_days    integer default 7
) returns boolean
language plpgsql as $$
declare
    v_so    store_orders%rowtype;
    v_o     orders%rowtype;
    v_hold  timestamptz := now() + make_interval(days => greatest(p_hold_days, 0));
begin
    if p_via not in ('platform', 'store') then
        raise exception 'bad_payment_source' using errcode = 'MK422', detail = 'Unknown payment source.';
    end if;

    select * into v_so from store_orders where id = p_store_order for update;
    if not found then
        raise exception 'order_not_found' using errcode = 'MK404', detail = 'Order not found.';
    end if;
    select * into v_o from orders where id = v_so.order_id;
    if v_so.payment_status = 'paid' then
        return false;
    end if;
    if v_so.status = 'canceled' or v_o.status in ('canceled', 'refunded') then
        raise exception 'order_canceled' using errcode = 'MK409', detail = 'This order was canceled.';
    end if;

    update store_orders
       set payment_status = 'paid', paid_at = now(), paid_via = p_via,
           status = case when status = 'pending' then 'processing' else status end
     where id = p_store_order;

    insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo, available_at)
    select v_so.store_id, x.kind, x.amount, v_o.currency, 'store_order', v_so.id, x.memo,
           case when p_via = 'store' then now() else v_hold end
      from (values
          ('sale',       case when p_via = 'platform'
                              then v_so.subtotal_cents - v_so.discount_cents + v_so.shipping_cents
                              else 0 end,            'Order ' || v_o.number),
          ('commission', -v_so.commission_cents,     'Commission on ' || v_o.number),
          ('fee',        -v_so.fee_cents,            'Per item fees on ' || v_o.number)
      ) as x(kind, amount, memo)
     where x.amount <> 0;

    update products p
       set sold_count = p.sold_count + q.units
      from (select product_id, sum(quantity) units from order_items
             where store_order_id = p_store_order and product_id is not null group by product_id) q
     where p.id = q.product_id;

    return true;
end $$;

-- The whole order was paid to the marketplace (card webhook, admin).
-- Idempotent: a second webhook delivery for the same order is a no-op.
create or replace function mark_order_paid(
    p_order      uuid,
    p_provider   text,
    p_ref        text,
    p_hold_days  integer default 7
) returns boolean
language plpgsql as $$
declare
    v_so     uuid;
    v_any    boolean := false;
    v_status text;
begin
    select status into v_status from orders where id = p_order for update;
    if v_status is null or v_status in ('canceled', 'refunded') then
        return false;
    end if;

    update orders set payment_provider = p_provider, payment_ref = coalesce(p_ref, payment_ref)
     where id = p_order;

    for v_so in select id from store_orders where order_id = p_order and status <> 'canceled' order by id loop
        if mark_store_order_paid(v_so, 'platform', p_hold_days) then
            v_any := true;
        end if;
    end loop;
    return v_any;
end $$;

-- Cancels an order that has not left any store yet, and reverses whatever
-- money moved. Returns the order's status before cancelling.
create or replace function cancel_order(p_order uuid) returns text
language plpgsql as $$
declare
    v_status text;
begin
    select status into v_status from orders where id = p_order for update;
    if v_status is null then
        raise exception 'order_not_found' using errcode = 'MK404', detail = 'Order not found.';
    end if;
    if v_status not in ('pending_payment', 'paid') then
        raise exception 'order_not_cancelable' using errcode = 'MK409',
            detail = 'This order can no longer be canceled.';
    end if;
    if exists (select 1 from store_orders where order_id = p_order
                and status not in ('pending', 'processing'))
       or exists (select 1 from deliveries d join store_orders so on so.id = d.store_order_id
                   where so.order_id = p_order and d.status = 'picked_up') then
        raise exception 'order_already_shipped' using errcode = 'MK409',
            detail = 'Part of this order is already on its way.';
    end if;

    update deliveries d set status = 'canceled', ended_at = now()
      from store_orders so
     where so.id = d.store_order_id and so.order_id = p_order
       and d.status in ('assigned', 'accepted');

    update product_variants v
       set stock = v.stock + oi.quantity
      from order_items oi
     where oi.order_id = p_order and oi.variant_id = v.id;

    -- Undo every ledger movement tied to this order's store orders.
    insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
    select l.store_id, 'refund', -sum(l.amount_cents), min(l.currency), 'store_order', l.ref_id,
           'Reversal for canceled order'
      from ledger_entries l
      join store_orders so on so.id = l.ref_id
     where so.order_id = p_order and l.ref_type = 'store_order'
     group by l.store_id, l.ref_id
    having sum(l.amount_cents) <> 0;

    update products p
       set sold_count = greatest(p.sold_count - q.units, 0)
      from (select oi.product_id, sum(oi.quantity) units
              from order_items oi join store_orders so on so.id = oi.store_order_id
             where oi.order_id = p_order and oi.product_id is not null and so.payment_status = 'paid'
             group by oi.product_id) q
     where p.id = q.product_id;

    update store_orders
       set status = 'canceled',
           payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end
     where order_id = p_order;
    update orders
       set status = case when v_status = 'paid' then 'refunded' else 'canceled' end,
           canceled_at = now()
     where id = p_order;

    update coupons c set redemptions = greatest(c.redemptions - 1, 0)
      from orders o where o.id = p_order and o.coupon_code = c.code;

    return v_status;
end $$;

-- ---------------------------------------------------------------------------
-- Rent and placements
-- ---------------------------------------------------------------------------

-- Charges every subscription whose period has ended, rolls it forward one
-- month and debits the store's balance. Safe to run as often as you like.
create or replace function bill_rent(p_now timestamptz default now()) returns integer
language plpgsql as $$
declare
    v_sub   record;
    v_count integer := 0;
    v_inv   uuid;
begin
    for v_sub in
        select ss.*, pl.monthly_price_cents, pl.currency
          from store_subscriptions ss
          join store_plans pl on pl.id = ss.plan_id
         where ss.status in ('active', 'trialing', 'past_due')
           and ss.current_period_end <= p_now
         order by ss.current_period_end
         for update of ss skip locked
    loop
        if v_sub.cancel_at_period_end then
            update store_subscriptions set status = 'canceled' where id = v_sub.id;
            continue;
        end if;

        if v_sub.monthly_price_cents > 0 then
            insert into rent_invoices (store_id, subscription_id, plan_id, period_start, period_end,
                                       amount_cents, currency, status)
            values (v_sub.store_id, v_sub.id, v_sub.plan_id, v_sub.current_period_end,
                    v_sub.current_period_end + interval '1 month',
                    v_sub.monthly_price_cents, v_sub.currency, 'paid')
            returning id into v_inv;

            insert into ledger_entries (store_id, kind, amount_cents, currency, ref_type, ref_id, memo)
            values (v_sub.store_id, 'rent', -v_sub.monthly_price_cents, v_sub.currency,
                    'rent_invoice', v_inv, 'Storefront rent');
        end if;

        update store_subscriptions
           set status = 'active',
               current_period_start = v_sub.current_period_end,
               current_period_end = v_sub.current_period_end + interval '1 month'
         where id = v_sub.id;
        v_count := v_count + 1;
    end loop;
    return v_count;
end $$;

create or replace function refresh_placements(p_today date default current_date) returns void
language sql as $$
    update placement_bookings set status = 'live'
     where status = 'scheduled' and starts_on <= p_today and ends_on >= p_today;
    update placement_bookings set status = 'ended'
     where status in ('scheduled', 'live') and ends_on < p_today;
$$;

-- Unpaid orders hold stock. Release it after a while. Cash on delivery
-- orders are never expired: they are paid at the door.
create or replace function expire_unpaid_orders(
    p_card_ttl  interval default interval '60 minutes',
    p_bank_ttl  interval default interval '72 hours'
) returns integer
language plpgsql as $$
declare
    v_id    uuid;
    v_count integer := 0;
begin
    for v_id in
        select id from orders
         where status = 'pending_payment'
           and ((payment_method = 'card' and created_at < now() - p_card_ttl)
             or (payment_method = 'bank_transfer' and created_at < now() - p_bank_ttl))
           and not exists (select 1 from store_orders so where so.order_id = orders.id and so.payment_status = 'paid')
         for update skip locked
    loop
        perform cancel_order(v_id);
        v_count := v_count + 1;
    end loop;
    return v_count;
end $$;

-- Drop breadcrumbs older than the retention window.
create or replace function prune_rider_locations(p_keep interval default interval '14 days') returns integer
language plpgsql as $$
declare
    v_count integer;
begin
    delete from rider_locations where recorded_at < now() - p_keep;
    get diagnostics v_count = row_count;
    update riders set is_online = false
     where is_online and (last_seen_at is null or last_seen_at < now() - interval '15 minutes');
    return v_count;
end $$;
