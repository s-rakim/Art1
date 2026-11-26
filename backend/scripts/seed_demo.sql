-- Demo catalogue so the storefront has something to show on day one.
-- Loaded by scripts/migrate.sh when SEED_DEMO=true. Safe to run twice.
-- The demo store owners are profiles without a Supabase login, so nobody
-- can sign in as them. Delete the demo stores before you go live:
--   delete from stores where slug like 'demo-%';

insert into profiles (id, email, full_name, role) values
  ('00000000-0000-4000-8000-000000000001', 'demo-owner-1@example.invalid', 'Demo Owner One', 'seller'),
  ('00000000-0000-4000-8000-000000000002', 'demo-owner-2@example.invalid', 'Demo Owner Two', 'seller'),
  ('00000000-0000-4000-8000-000000000003', 'demo-owner-3@example.invalid', 'Demo Owner Three', 'seller')
on conflict (id) do nothing;

insert into stores (id, owner_id, slug, name, tagline, description, status, plan_id, country,
                    banner_color, accent_color, pickup_lat, pickup_lng, pickup_address, approved_at)
select x.id::uuid, x.owner::uuid, x.slug, x.name, x.tagline, x.descr, 'active',
       (select id from store_plans where code = x.plan), 'GH', x.banner, x.accent, x.lat, x.lng,
       jsonb_build_object('label', x.name, 'city', 'Accra'), now()
  from (values
    ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'demo-osu-atelier',
     'Osu Atelier', 'Linen and cotton, cut in Accra', 'Small batch clothing made from natural fabrics.',
     'boutique', '#1f3a2e', '#d9a441', 5.5560, -0.1820),
    ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'demo-tech-hub',
     'Tech Hub', 'Gadgets that actually last', 'Audio, chargers and phone accessories with a one year warranty.',
     'flagship', '#13202b', '#3fa7d6', 5.6037, -0.1870),
    ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'demo-home-and-clay',
     'Home & Clay', 'Handmade pieces for everyday use', 'Ceramics, baskets and kitchenware from local makers.',
     'starter', '#4a2c20', '#c96f4a', 5.6145, -0.2050)
  ) as x(id, owner, slug, name, tagline, descr, plan, banner, accent, lat, lng)
on conflict (id) do nothing;

insert into store_subscriptions (store_id, plan_id)
select s.id, s.plan_id from stores s
 where s.slug like 'demo-%'
   and not exists (select 1 from store_subscriptions ss where ss.store_id = s.id and ss.status <> 'canceled');

with p(store_slug, category, slug, title, brand, descr, price, compare_at, tags) as (values
  ('demo-osu-atelier', 'women-dresses', 'demo-linen-wrap-dress', 'Linen wrap dress', 'Osu Atelier',
   'Midi length wrap dress in washed linen. Breathable, relaxed, gets softer with every wash.', 4500, 5900, array['linen','summer']),
  ('demo-osu-atelier', 'women-tops', 'demo-cotton-poplin-shirt', 'Cotton poplin shirt', 'Osu Atelier',
   'Oversized shirt in crisp cotton poplin with a curved hem.', 2800, null, array['cotton','shirt']),
  ('demo-osu-atelier', 'men-tops', 'demo-kente-trim-tee', 'Kente trim tee', 'Osu Atelier',
   'Heavyweight cotton tee with a woven kente pocket trim.', 1900, 2400, array['tee','kente']),
  ('demo-osu-atelier', 'men-bottoms', 'demo-drawstring-linen-trousers', 'Drawstring linen trousers', 'Osu Atelier',
   'Wide leg trousers in mid weight linen with an elastic drawstring waist.', 3600, null, array['linen','trousers']),
  ('demo-tech-hub', 'electronics-audio', 'demo-wireless-earbuds', 'Wireless earbuds with charging case', 'Soundwave',
   'Thirty hours of playback with the case, sweat resistant, quick pairing.', 3900, 4900, array['bluetooth','audio']),
  ('demo-tech-hub', 'electronics-audio', 'demo-portable-speaker', 'Portable speaker, waterproof', 'Soundwave',
   'Palm sized speaker with surprisingly full sound and a twelve hour battery.', 2900, null, array['speaker','bluetooth']),
  ('demo-tech-hub', 'electronics-phone', 'demo-fast-charger-20w', '20W fast charger', 'Voltline',
   'USB-C power delivery charger. Fills most phones to half in thirty minutes.', 1200, 1500, array['charger','usb-c']),
  ('demo-tech-hub', 'electronics-phone', 'demo-braided-usb-c-cable', 'Braided USB-C cable, 2m', 'Voltline',
   'Nylon braided cable rated for ten thousand bends.', 600, null, array['cable','usb-c']),
  ('demo-home-and-clay', 'home-kitchen', 'demo-stoneware-mug-set', 'Stoneware mug set of four', 'Home & Clay',
   'Hand thrown mugs with a speckled glaze. Dishwasher safe.', 3200, null, array['ceramic','mug']),
  ('demo-home-and-clay', 'home-decor', 'demo-bolga-basket', 'Bolga market basket', 'Home & Clay',
   'Woven elephant grass basket with leather handles, made in Bolgatanga.', 2700, 3200, array['basket','handmade']),
  ('demo-home-and-clay', 'home-kitchen', 'demo-clay-cooking-pot', 'Clay cooking pot', 'Home & Clay',
   'Unglazed clay pot for slow cooked stews and soups.', 2200, null, array['clay','cookware']),
  ('demo-home-and-clay', 'home-decor', 'demo-indigo-cushion-cover', 'Indigo cushion cover', 'Home & Clay',
   'Hand dyed indigo cotton, 45 by 45 cm, hidden zip.', 1500, null, array['cushion','indigo'])
)
insert into products (store_id, category_id, slug, title, description, brand, status, tags, currency)
select s.id, c.id, p.slug, p.title, p.descr, p.brand, 'active', p.tags, 'USD'
  from p join stores s on s.slug = p.store_slug left join categories c on c.slug = p.category
on conflict (slug) do nothing;

insert into product_variants (product_id, sku, title, options, price_cents, compare_at_cents, stock, tier_prices)
select pr.id, upper(replace(pr.slug, 'demo-', 'DM-')) || '-' || v.code, v.title, v.options,
       pv.price, pv.compare_at, v.stock,
       case when pv.price > 1000 then jsonb_build_array(jsonb_build_object('min_qty', 6, 'price_cents', (pv.price * 0.85)::int))
            else '[]'::jsonb end
  from products pr
  join (values
    ('demo-linen-wrap-dress', 4500, 5900), ('demo-cotton-poplin-shirt', 2800, null),
    ('demo-kente-trim-tee', 1900, 2400), ('demo-drawstring-linen-trousers', 3600, null),
    ('demo-wireless-earbuds', 3900, 4900), ('demo-portable-speaker', 2900, null),
    ('demo-fast-charger-20w', 1200, 1500), ('demo-braided-usb-c-cable', 600, null),
    ('demo-stoneware-mug-set', 3200, null), ('demo-bolga-basket', 2700, 3200),
    ('demo-clay-cooking-pot', 2200, null), ('demo-indigo-cushion-cover', 1500, null)
  ) as pv(slug, price, compare_at) on pv.slug = pr.slug
  cross join lateral (
    select * from (values
      ('S', 'Small', '{"size": "S"}'::jsonb, 12),
      ('M', 'Medium', '{"size": "M"}'::jsonb, 20),
      ('L', 'Large', '{"size": "L"}'::jsonb, 8)
    ) sized(code, title, options, stock)
    where pr.slug in ('demo-linen-wrap-dress', 'demo-cotton-poplin-shirt', 'demo-kente-trim-tee',
                      'demo-drawstring-linen-trousers')
    union all
    select 'STD', 'Standard', '{}'::jsonb, 30
    where pr.slug not in ('demo-linen-wrap-dress', 'demo-cotton-poplin-shirt', 'demo-kente-trim-tee',
                          'demo-drawstring-linen-trousers')
  ) v
on conflict (sku) do nothing;

insert into product_images (product_id, url, alt, sort)
select pr.id, 'https://picsum.photos/seed/' || pr.slug || '/800/1000', pr.title, 0
  from products pr
 where pr.slug like 'demo-%'
   and not exists (select 1 from product_images i where i.product_id = pr.id);
