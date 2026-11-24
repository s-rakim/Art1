-- Reference data the marketplace needs before anyone signs up: rental plans,
-- the top level category tree and the placement slots stores can book.
-- Prices are a starting point; change them from the admin API.

insert into store_plans (code, name, description, monthly_price_cents, commission_rate,
                         per_item_fee_cents, product_limit, featured_slots, features, sort)
values
  ('starter', 'Starter Stall',
   'No rent. Pay a small fee per unit sold. Good for testing the water.',
   0, 0.1500, 99, 25, 0,
   array['Up to 25 live products', 'Storefront page', '15% commission + $0.99 per unit',
         'Payouts every 7 days'], 10),
  ('boutique', 'Boutique',
   'A proper storefront with lower commission and room to grow.',
   2900, 0.1000, 0, 500, 1,
   array['Up to 500 live products', 'Custom banner and logo', '10% commission, no per unit fee',
         '1 featured placement credit a month', 'Volume pricing tiers'], 20),
  ('flagship', 'Flagship',
   'For established brands moving real volume.',
   14900, 0.0600, 0, null, 4,
   array['Unlimited products', '6% commission', '4 featured placement credits a month',
         'Priority review of new listings', 'Wholesale minimum order quantities'], 30)
on conflict (code) do nothing;

insert into categories (slug, name, sort) values
  ('women', 'Women', 10),
  ('men', 'Men', 20),
  ('kids', 'Kids', 30),
  ('home', 'Home & Living', 40),
  ('beauty', 'Beauty', 50),
  ('electronics', 'Electronics', 60),
  ('sports', 'Sports & Outdoors', 70),
  ('accessories', 'Bags & Accessories', 80)
on conflict (slug) do nothing;

insert into categories (parent_id, slug, name, sort)
select c.id, x.slug, x.name, x.sort
  from (values
    ('women', 'women-dresses', 'Dresses', 1),
    ('women', 'women-tops', 'Tops', 2),
    ('women', 'women-shoes', 'Shoes', 3),
    ('men', 'men-tops', 'T-shirts & Shirts', 1),
    ('men', 'men-bottoms', 'Trousers & Jeans', 2),
    ('men', 'men-shoes', 'Shoes', 3),
    ('home', 'home-kitchen', 'Kitchen', 1),
    ('home', 'home-decor', 'Decor', 2),
    ('electronics', 'electronics-audio', 'Audio', 1),
    ('electronics', 'electronics-phone', 'Phone Accessories', 2),
    ('beauty', 'beauty-skincare', 'Skincare', 1),
    ('beauty', 'beauty-makeup', 'Makeup', 2)
  ) as x(parent, slug, name, sort)
  join categories c on c.slug = x.parent
on conflict (slug) do nothing;

insert into placement_slots (code, name, description, location, daily_price_cents, capacity) values
  ('home-hero', 'Homepage hero', 'The big banner at the top of the homepage. Rotates between bookings.', 'home_hero', 4900, 3),
  ('home-grid', 'Homepage picks', 'A product tile in the "Picked for you" grid.', 'home_grid', 900, 12),
  ('category-top', 'Category spotlight', 'Pinned at the top of a category page.', 'category_top', 600, 4),
  ('search-top', 'Sponsored search', 'Marked as sponsored above organic search results.', 'search_top', 400, 6)
on conflict (code) do nothing;
