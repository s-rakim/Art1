-- Locking the database down.
--
-- The FastAPI service connects as the database owner and does its own
-- authorisation. Everything else that can reach this database (supabase-js
-- with the anon key, PostgREST, Studio users with limited roles) gets the
-- least we can give:
--
--   * row level security is ON for every table, everywhere. With no policy a
--     non-owner role sees nothing and can write nothing.
--   * on Supabase, a handful of read-only policies open exactly what a shopper
--     could see on the website anyway, plus "your own rows" for signed in
--     users. There are no insert/update/delete policies at all: every write
--     goes through the API.
--   * anon/authenticated lose INSERT/UPDATE/DELETE grants as a second fence.
--   * none of our functions are executable by anyone but the owner. Without
--     this, PostgREST would expose place_order() and friends at /rpc/ and
--     anyone could place orders as anyone else.
--   * the balance view runs with the caller's permissions, so it can't be
--     used to read around RLS.
--
-- This file is idempotent and scripts/migrate.sh re-runs it after every
-- migration batch, so tables added later are covered automatically.

do $lock$
declare
    t text;
    f record;
    has_auth boolean := exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'auth' and p.proname = 'uid');
    has_supabase_roles boolean := exists (select 1 from pg_roles where rolname = 'anon')
                              and exists (select 1 from pg_roles where rolname = 'authenticated');
    pol record;
begin
    -- 0. Start from a clean slate so re-running never duplicates or keeps a
    --    stale policy.
    for pol in select policyname, tablename from pg_policies where schemaname = 'public' loop
        execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
    end loop;

    -- 1. RLS on every table in public that we own (not extension tables).
    for t in
        select c.relname
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    loop
        execute format('alter table public.%I enable row level security', t);
    end loop;

    -- 2. Functions: owner only. Trigger functions still fire, they run as the
    --    table owner.
    for f in
        select p.oid::regprocedure as sig
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    loop
        execute format('revoke all on function %s from public', f.sig);
        if has_supabase_roles then
            execute format('revoke all on function %s from anon, authenticated', f.sig);
        end if;
    end loop;
    execute 'alter default privileges in schema public revoke execute on functions from public';

    -- 3. The balance view must not bypass RLS.
    execute 'alter view store_balances set (security_invoker = true)';
    execute 'revoke all on store_balances from public';
    revoke all on sequence order_number_seq from public;

    if not has_supabase_roles then
        raise notice 'Supabase roles not found, skipping grants and policies';
        return;
    end if;

    -- 4. Supabase hands anon/authenticated full table privileges by default.
    --    Take back everything but SELECT, and SELECT on the private bits.
    execute 'revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated';
    execute 'alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated';
    execute 'revoke all on all sequences in schema public from anon, authenticated';
    execute 'revoke all on store_balances from anon, authenticated';
    -- Signed out visitors have no business with any of these.
    execute 'revoke all on profiles, addresses, carts, cart_items, wishlist_items, orders, store_orders,
                           order_items, ledger_entries, payouts, coupons, rent_invoices, store_subscriptions,
                           riders, deliveries, rider_locations, rider_earnings, app_settings,
                           inventory_adjustments from anon';
    -- Riders and deliveries hold phone numbers and live locations. They are
    -- served only through the API, which applies the per-delivery rules.
    execute 'revoke all on riders, deliveries, rider_locations, rider_earnings, app_settings, coupons,
                           inventory_adjustments from authenticated';
    -- Store rows are public once active, but the application (tax ids,
    -- phone numbers), the admin's note and the owner id are not.
    execute 'revoke select on stores from anon, authenticated';
    execute 'grant select (id, slug, name, tagline, description, logo_url, banner_url, banner_color, accent_color, country,
                           support_email, status, plan_id, rating_avg, rating_count, created_at)
             on stores to anon, authenticated';
    if to_regclass('public.schema_migrations') is not null then
        execute 'revoke all on schema_migrations from anon, authenticated';
    end if;

    if not has_auth then
        raise notice 'auth.uid() not found, skipping policies';
        return;
    end if;

    -- 5. Read policies. Note what is NOT here: profiles of other people,
    --    store applications, anyone else's orders, coupons.
    execute $p$create policy "plans are public" on store_plans for select using (is_active)$p$;
    execute $p$create policy "slots are public" on placement_slots for select using (is_active)$p$;
    execute $p$create policy "categories are public" on categories for select using (true)$p$;
    execute $p$create policy "active stores are public" on stores for select using (status = 'active')$p$;
    execute $p$create policy "active products are public" on products for select
                using (status = 'active' and exists (select 1 from stores s where s.id = store_id and s.status = 'active'))$p$;
    execute $p$create policy "variants of active products" on product_variants for select
                using (is_active and exists (select 1 from products p join stores s on s.id = p.store_id
                                              where p.id = product_id and p.status = 'active' and s.status = 'active'))$p$;
    execute $p$create policy "images of active products" on product_images for select
                using (exists (select 1 from products p join stores s on s.id = p.store_id
                                where p.id = product_id and p.status = 'active' and s.status = 'active'))$p$;
    execute $p$create policy "videos of active products" on product_videos for select
                using (exists (select 1 from products p join stores s on s.id = p.store_id
                                where p.id = product_id and p.status = 'active' and s.status = 'active'))$p$;
    execute $p$create policy "reviews are public" on reviews for select using (true)$p$;
    execute $p$create policy "live placements are public" on placement_bookings for select using (status = 'live')$p$;

    execute $p$create policy "own profile" on profiles for select to authenticated using (id = auth.uid())$p$;
    execute $p$create policy "own addresses" on addresses for select to authenticated using (user_id = auth.uid())$p$;
    execute $p$create policy "own wishlist" on wishlist_items for select to authenticated using (user_id = auth.uid())$p$;
    execute $p$create policy "own cart" on carts for select to authenticated using (user_id = auth.uid())$p$;
    execute $p$create policy "own cart items" on cart_items for select to authenticated
                using (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()))$p$;
    execute $p$create policy "own orders" on orders for select to authenticated using (user_id = auth.uid())$p$;
    execute $p$create policy "own order items" on order_items for select to authenticated
                using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()))$p$;

    execute $p$create policy "own store" on stores for select to authenticated using (owner_id = auth.uid())$p$;
    execute $p$create policy "own store orders" on store_orders for select to authenticated
                using (exists (select 1 from stores s where s.id = store_id and s.owner_id = auth.uid()))$p$;
    execute $p$create policy "own ledger" on ledger_entries for select to authenticated
                using (exists (select 1 from stores s where s.id = store_id and s.owner_id = auth.uid()))$p$;
    execute $p$create policy "own payouts" on payouts for select to authenticated
                using (exists (select 1 from stores s where s.id = store_id and s.owner_id = auth.uid()))$p$;
    execute $p$create policy "own invoices" on rent_invoices for select to authenticated
                using (exists (select 1 from stores s where s.id = store_id and s.owner_id = auth.uid()))$p$;
    execute $p$create policy "own subscription" on store_subscriptions for select to authenticated
                using (exists (select 1 from stores s where s.id = store_id and s.owner_id = auth.uid()))$p$;
    execute $p$create policy "own bookings" on placement_bookings for select to authenticated
                using (exists (select 1 from stores s where s.id = store_id and s.owner_id = auth.uid()))$p$;
end
$lock$;
