-- Prices the admin controls, the contact shown instead of stall rent, and
-- product videos.

-- ---------------------------------------------------------------------------
-- Admin-set prices and the rental contact
-- ---------------------------------------------------------------------------
--
-- Shipping, the rider fee and tax used to be environment variables. They
-- now live here and the admin changes them from the console; the values
-- below are only where a fresh install starts. A null free-shipping
-- threshold means shipping is never free. Stall rent stays on the plans
-- (admins edit those too) but is no longer published: the public plan list
-- shows what a plan includes and who to talk to about the price.

alter table app_settings
    add column standard_shipping_cents  integer not null default 499 check (standard_shipping_cents between 0 and 10000000),
    add column express_shipping_cents   integer not null default 1499 check (express_shipping_cents between 0 and 10000000),
    add column free_shipping_over_cents integer default 4900 check (free_shipping_over_cents between 0 and 100000000),
    add column rider_fee_cents          integer not null default 300 check (rider_fee_cents between 0 and 10000000),
    add column tax_rate                 numeric(6,4) not null default 0 check (tax_rate between 0 and 1),
    add column contact_name             text,
    add column contact_email            text,
    add column contact_phone            text,
    add column contact_whatsapp         text,
    add column contact_note             text;

-- ---------------------------------------------------------------------------
-- Product videos
-- ---------------------------------------------------------------------------

-- One video per product, uploaded through the API (see app/media.py).
create table product_videos (
    id            uuid primary key default gen_random_uuid(),
    product_id    uuid not null unique references products(id) on delete cascade,
    url           text not null,
    poster_url    text,
    content_type  text not null check (content_type in ('video/mp4', 'video/webm')),
    size_bytes    bigint not null check (size_bytes > 0),
    duration_s    numeric(8,2),
    caption       text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create trigger product_videos_live
    after insert or update or delete on product_videos
    for each row execute function live_catalog_images();

-- Videos get their own bucket so the image bucket's small size limit stays.
do $$
begin
    if to_regclass('storage.buckets') is not null then
        insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        values ('product-videos', 'product-videos', true, 52428800, array['video/mp4', 'video/webm'])
        on conflict (id) do update
           set public = true,
               file_size_limit = excluded.file_size_limit,
               allowed_mime_types = excluded.allowed_mime_types;
    end if;
end $$;
