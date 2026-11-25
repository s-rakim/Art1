-- Rider runs with batching, central payments confirmed by transaction code,
-- and the ledger sheets.
--
-- Payments: shoppers pay The Bazaar's M-Pesa till or bank account on
-- arrival, quoting the order number. The till's and bank's messages are fed
-- in (pasted by an admin, forwarded by a phone, or posted by Daraja) and
-- each becomes a row in payment_receipts. At the door the rider looks the
-- payment up by code or name and uses it against the order. A receipt can be
-- used once, ever: the status moves from unconfirmed to confirmed under a row
-- lock and never goes back.

-- ---------------------------------------------------------------------------
-- Settings the admin controls
-- ---------------------------------------------------------------------------

alter table app_settings
    add column if not exists rider_commission_rate  numeric(5, 4) not null default 0
        check (rider_commission_rate >= 0 and rider_commission_rate <= 1),
    add column if not exists rider_pool_radius_km   numeric(6, 2) not null default 15
        check (rider_pool_radius_km > 0 and rider_pool_radius_km <= 200),
    add column if not exists rider_batch_radius_km  numeric(6, 2) not null default 8
        check (rider_batch_radius_km > 0 and rider_batch_radius_km <= 50),
    add column if not exists rider_pickup_radius_km numeric(6, 2) not null default 2
        check (rider_pickup_radius_km >= 0 and rider_pickup_radius_km <= 50),
    add column if not exists rider_max_batch        integer not null default 3
        check (rider_max_batch between 1 and 10),
    add column if not exists payout_interval_days   integer not null default 7
        check (payout_interval_days between 0 and 90),
    add column if not exists payment_code_ttl_hours integer not null default 72
        check (payment_code_ttl_hours between 1 and 2160),
    add column if not exists mpesa_till             text,
    add column if not exists mpesa_paybill          text,
    add column if not exists payment_account_name   text,
    add column if not exists bank_name              text,
    add column if not exists bank_account_name      text,
    add column if not exists bank_account_number    text,
    add column if not exists payment_instructions   text;

-- ---------------------------------------------------------------------------
-- Distance, and the one rule for who may carry what
-- ---------------------------------------------------------------------------

create or replace function km(lat1 double precision, lng1 double precision,
                              lat2 double precision, lng2 double precision)
returns double precision language sql immutable parallel safe as $$
    select 6371 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- Why rider p_rider can't add a job picked up at (plat, plng) and dropped at
-- (dlat, dlng) to what they already carry, or null if they can. Used by the
-- job board, by claiming and by automatic dispatch, so all three agree.
--   batch_full   already carrying the most the admin allows
--   pickup_far   the shop isn't the same as, or close to, every current shop
--   on_run_far   the drop-off isn't close to every current drop-off
create or replace function rider_batch_block(p_rider uuid, p_store uuid,
                                             plat double precision, plng double precision,
                                             dlat double precision, dlng double precision)
returns text language plpgsql stable as $$
declare
    s       app_settings%rowtype;
    v_live  integer;
begin
    select * into s from app_settings;
    select count(*) into v_live from deliveries
     where rider_id = p_rider and status in ('accepted', 'picked_up');
    if v_live = 0 then
        return null;
    end if;
    if v_live >= s.rider_max_batch then
        return 'batch_full';
    end if;
    if exists (select 1 from deliveries d
                where d.rider_id = p_rider and d.status in ('accepted', 'picked_up')
                  and d.store_id <> p_store
                  and (plat is null
                       or km((d.pickup->>'lat')::float8, (d.pickup->>'lng')::float8, plat, plng)
                          > s.rider_pickup_radius_km)) then
        return 'pickup_far';
    end if;
    if dlat is null or exists (
            select 1 from deliveries d
             where d.rider_id = p_rider and d.status in ('accepted', 'picked_up')
               and (d.dropoff->>'lat' is null
                    or km((d.dropoff->>'lat')::float8, (d.dropoff->>'lng')::float8, dlat, dlng)
                       > s.rider_batch_radius_km)) then
        return 'on_run_far';
    end if;
    return null;
end $$;

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------

alter table riders add column if not exists current_run_id uuid;
alter table deliveries
    add column if not exists run_id     uuid,
    add column if not exists arrived_at timestamptz;
create index if not exists deliveries_run_idx on deliveries(run_id) where run_id is not null;

-- A rider who passes on a job doesn't see it again or get it offered.
create table if not exists rider_job_skips (
    rider_id        uuid not null references riders(id) on delete cascade,
    store_order_id  uuid not null references store_orders(id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (rider_id, store_order_id)
);

-- The job board: tell every rider on shift when a job opens or is taken.
create or replace function live_job_board() returns trigger language plpgsql as $$
declare
    v_open  boolean;
    v_so    uuid;
begin
    if tg_table_name = 'store_orders' then
        if tg_op = 'UPDATE' and new.status is not distinct from old.status then
            return null;
        end if;
        v_so := new.id;
    else
        if tg_op = 'UPDATE' and new.status is not distinct from old.status then
            return null;
        end if;
        v_so := new.store_order_id;
    end if;
    select so.status = 'processing'
           and not exists (select 1 from deliveries d where d.store_order_id = so.id
                            and d.status in ('assigned', 'accepted', 'picked_up'))
      into v_open
      from store_orders so where so.id = v_so;
    perform live_emit(array['riders'],
        jsonb_build_object('type', 'jobs', 'store_order_id', v_so,
                           'change', case when v_open then 'open' else 'taken' end, 'at', now()));
    return null;
end $$;

drop trigger if exists store_orders_job_board on store_orders;
create trigger store_orders_job_board
    after insert or update of status on store_orders
    for each row execute function live_job_board();
drop trigger if exists deliveries_job_board on deliveries;
create trigger deliveries_job_board
    after insert or update of status on deliveries
    for each row execute function live_job_board();

-- ---------------------------------------------------------------------------
-- Payments bank
-- ---------------------------------------------------------------------------

create table if not exists payment_receipts (
    id              uuid primary key default gen_random_uuid(),
    provider        text not null check (provider in ('mpesa', 'bank')),
    source          text not null check (source in ('paste', 'sms_forward', 'daraja', 'manual')),
    -- Upper case, no spaces. Unique per provider: the same code can never be
    -- stored twice, so it can never be used twice.
    code            text not null check (code ~ '^[A-Z0-9]{6,24}$'),
    amount_cents    bigint not null check (amount_cents > 0),
    currency        char(3) not null,
    payer_name      text,
    payer_phone     text,
    account_ref     text,
    received_at     timestamptz not null,
    status          text not null default 'unconfirmed'
                    check (status in ('unconfirmed', 'confirmed', 'expired', 'void')),
    expires_at      timestamptz not null,
    order_id        uuid references orders(id) on delete set null,
    confirmed_at    timestamptz,
    confirmed_by    uuid references profiles(id) on delete set null,
    confirmed_role  text check (confirmed_role in ('rider', 'admin')),
    delivery_id     uuid references deliveries(id) on delete set null,
    note            text,
    raw_text        text check (length(raw_text) <= 2000),
    created_by      uuid references profiles(id) on delete set null,
    created_at      timestamptz not null default now(),
    unique (provider, code),
    check ((status = 'confirmed') = (confirmed_at is not null and order_id is not null))
);
create index if not exists payment_receipts_status_idx on payment_receipts(status, received_at desc);
create index if not exists payment_receipts_order_idx on payment_receipts(order_id);
create index if not exists payment_receipts_name_idx on payment_receipts(lower(payer_name));

-- A used receipt is spent for good: no going back to unconfirmed, no moving
-- it to another order, no changing the amount. Void is only for receipts
-- nobody has used.
create or replace function payment_receipts_guard() returns trigger language plpgsql as $$
begin
    if tg_op = 'DELETE' then
        if old.status = 'confirmed' then
            raise exception 'receipt_used' using errcode = 'MK409', detail = 'A used payment can''t be deleted.';
        end if;
        return old;
    end if;
    if old.status = 'confirmed' then
        raise exception 'receipt_used' using errcode = 'MK409', detail = 'This payment code has already been used.';
    end if;
    if new.code <> old.code or new.provider <> old.provider or new.amount_cents <> old.amount_cents
       or new.currency <> old.currency then
        raise exception 'receipt_locked' using errcode = 'MK409', detail = 'A payment''s code and amount can''t change.';
    end if;
    return new;
end $$;

drop trigger if exists payment_receipts_guard on payment_receipts;
create trigger payment_receipts_guard
    before update or delete on payment_receipts
    for each row execute function payment_receipts_guard();

-- Admins see new money arrive.
create or replace function live_payment_receipts() returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
        return null;
    end if;
    perform live_emit(array['ops'],
        jsonb_build_object('type', 'payment', 'receipt_id', new.id, 'status', new.status,
                           'amount_cents', new.amount_cents, 'currency', new.currency,
                           'order_id', new.order_id, 'at', now()));
    return null;
end $$;

drop trigger if exists payment_receipts_live on payment_receipts;
create trigger payment_receipts_live
    after insert or update of status on payment_receipts
    for each row execute function live_payment_receipts();

-- ---------------------------------------------------------------------------
-- The vendor's editable sheet
-- ---------------------------------------------------------------------------

create table if not exists sheet_entries (
    id            uuid primary key default gen_random_uuid(),
    store_id      uuid not null references stores(id) on delete cascade,
    entry_date    date not null,
    kind          text not null check (kind in ('sale', 'expense', 'stock_in', 'stock_out', 'payment', 'other')),
    description   text not null check (length(description) between 1 and 500),
    quantity      integer check (quantity between -1000000 and 1000000),
    amount_cents  bigint check (amount_cents between -100000000000 and 100000000000),
    reference     text check (length(reference) <= 64),
    status        text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
    admin_note    text,
    created_by    uuid references profiles(id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    confirmed_by  uuid references profiles(id) on delete set null,
    confirmed_at  timestamptz,
    check ((status = 'confirmed') = (confirmed_at is not null))
);
create index if not exists sheet_entries_store_idx on sheet_entries(store_id, entry_date desc);
create index if not exists sheet_entries_status_idx on sheet_entries(status, created_at);

-- Confirmed rows are final.
create or replace function sheet_entries_guard() returns trigger language plpgsql as $$
begin
    if old.status = 'confirmed' then
        raise exception 'entry_locked' using errcode = 'MK409', detail = 'Confirmed entries can''t be changed.';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    if new.store_id <> old.store_id then
        raise exception 'entry_locked' using errcode = 'MK409', detail = 'An entry can''t move to another store.';
    end if;
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists sheet_entries_guard on sheet_entries;
create trigger sheet_entries_guard
    before update or delete on sheet_entries
    for each row execute function sheet_entries_guard();

-- ---------------------------------------------------------------------------
-- Audit log: append only
-- ---------------------------------------------------------------------------

create table if not exists audit_log (
    id         bigint generated always as identity primary key,
    entity     text not null,
    entity_id  uuid not null,
    store_id   uuid,
    action     text not null,
    actor_id   uuid,
    before     jsonb,
    after      jsonb,
    at         timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on audit_log(entity, entity_id, at);
create index if not exists audit_log_store_idx on audit_log(store_id, at desc);

create or replace function audit_log_readonly() returns trigger language plpgsql as $$
begin
    raise exception 'audit_log_readonly' using errcode = 'MK409', detail = 'The audit log can only be added to.';
end $$;

drop trigger if exists audit_log_readonly on audit_log;
create trigger audit_log_readonly
    before update or delete or truncate on audit_log
    for each statement execute function audit_log_readonly();

-- The API sets app.actor to the signed in user for the transaction.
create or replace function audit_row() returns trigger language plpgsql as $$
declare
    v_actor  uuid := nullif(current_setting('app.actor', true), '')::uuid;
    v_old    jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'raw_text' end;
    v_new    jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'raw_text' end;
    v_row    jsonb := coalesce(v_new, v_old);
    v_action text := lower(tg_op);
begin
    if tg_op = 'UPDATE' then
        if v_new - 'updated_at' = v_old - 'updated_at' then
            return null;
        end if;
        if v_new->>'status' is distinct from v_old->>'status' then
            v_action := v_new->>'status';
        end if;
    end if;
    insert into audit_log (entity, entity_id, store_id, action, actor_id, before, after)
    values (tg_table_name, (v_row->>'id')::uuid, (v_row->>'store_id')::uuid, v_action, v_actor, v_old, v_new);
    return null;
end $$;

drop trigger if exists sheet_entries_audit on sheet_entries;
create trigger sheet_entries_audit
    after insert or update or delete on sheet_entries
    for each row execute function audit_row();
drop trigger if exists payment_receipts_audit on payment_receipts;
create trigger payment_receipts_audit
    after insert or update or delete on payment_receipts
    for each row execute function audit_row();
