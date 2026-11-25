// Demo catalogue. Used only when the API can't be reached and NEXT_PUBLIC_DEMO_DATA isn't "off",
// so the storefront is browsable before the backend is up. Deterministic, so server and client agree.
import type {
  AdminStats, ArtShape, Category, Order, PlacementSlot, Plan, Product, Review, SellerStats, Store,
} from "../types";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const categories: Category[] = [
  { id: "c1", slug: "women", name: "Women", parent_id: null },
  { id: "c2", slug: "men", name: "Men", parent_id: null },
  { id: "c3", slug: "shoes", name: "Shoes", parent_id: null },
  { id: "c4", slug: "bags", name: "Bags & Accessories", parent_id: null },
  { id: "c5", slug: "home", name: "Home & Living", parent_id: null },
  { id: "c6", slug: "kitchen", name: "Kitchen", parent_id: null },
  { id: "c7", slug: "electronics", name: "Electronics", parent_id: null },
  { id: "c8", slug: "beauty", name: "Beauty", parent_id: null },
  { id: "c11", slug: "dresses", name: "Dresses", parent_id: "c1" },
  { id: "c12", slug: "tops", name: "Tops & Tees", parent_id: "c1" },
  { id: "c13", slug: "outerwear", name: "Outerwear", parent_id: "c2" },
  { id: "c14", slug: "audio", name: "Audio", parent_id: "c7" },
  { id: "c15", slug: "lighting", name: "Lighting", parent_id: "c5" },
];

export const plans: Plan[] = [
  {
    id: "plan-stall",
    code: "stall",
    name: "Stall",
    monthly_price_cents: 1900,
    commission_rate: 0.12,
    product_limit: 50,
    features: [
      "Up to 50 live listings",
      "Your own storefront page",
      "Weekly payouts",
      "Standard search placement",
    ],
  },
  {
    id: "plan-shopfront",
    code: "shopfront",
    name: "Shopfront",
    monthly_price_cents: 7900,
    commission_rate: 0.08,
    product_limit: 1000,
    highlighted: true,
    features: [
      "Up to 1,000 live listings",
      "Custom banner, colours and store sections",
      "Bulk pricing tiers for wholesale buyers",
      "Twice-weekly payouts",
      "One free homepage shelf week per month",
      "Sales and traffic analytics",
    ],
  },
  {
    id: "plan-flagship",
    code: "flagship",
    name: "Flagship",
    monthly_price_cents: 29900,
    commission_rate: 0.05,
    product_limit: null,
    features: [
      "Unlimited listings",
      "Everything in Shopfront",
      "Daily payouts",
      "Priority in search and category pages",
      "Dedicated account manager",
      "API access for inventory sync",
    ],
  },
];

export const placements: PlacementSlot[] = [
  { id: "pl1", code: "home_shelf", name: "Homepage shelf", location: "Home, below the fold", daily_price_cents: 2100, capacity: 6, booked: 4, description: "A row of your products under your store name, seen by every visitor to the homepage." },
  { id: "pl2", code: "category_banner", name: "Category banner", location: "Top of a category page", daily_price_cents: 1300, capacity: 16, booked: 9, description: "Full-width banner on one category of your choice, linking to your storefront or a collection." },
  { id: "pl3", code: "deal_spot", name: "Flash deal spot", location: "Daily deals strip", daily_price_cents: 700, capacity: 24, booked: 20, description: "Put one product into the countdown deals strip. Requires at least 20% off your usual price." },
  { id: "pl4", code: "search_boost", name: "Search boost", location: "Search results, top three", daily_price_cents: 400, capacity: 40, booked: 12, description: "Your listing marked as sponsored in the top three for the keywords you pick." },
];

const storeSeeds: Array<Omit<Store, "rating" | "product_count" | "id">> = [
  { slug: "northline-studio", name: "Northline Studio", verified: true, plan: "flagship", tagline: "Quiet clothes for loud cities", description: "Small-batch womenswear cut in Porto. We make fewer pieces and keep them in stock longer.", banner_color: "#1f3b2d", accent_color: "#e8c547", country: "Portugal", joined_at: "2023-03-11", response_rate: 0.98, on_time_rate: 0.97, follower_count: 18400, status: "active" },
  { slug: "kiln-and-co", name: "Kiln & Co", verified: true, plan: "shopfront", tagline: "Stoneware, thrown by hand", description: "A four-person pottery in Stoke making mugs, bowls and planters that survive the dishwasher.", banner_color: "#b5562f", accent_color: "#f1e3cf", country: "United Kingdom", joined_at: "2024-01-20", response_rate: 0.94, on_time_rate: 0.95, follower_count: 6200, status: "active" },
  { slug: "volt-depot", name: "Volt Depot", verified: true, plan: "flagship", tagline: "Factory-direct audio and gadgets", description: "Shenzhen manufacturer selling direct. Bulk pricing from 10 units, OEM on request.", banner_color: "#111418", accent_color: "#3ad1b0", country: "China", joined_at: "2022-08-02", response_rate: 0.91, on_time_rate: 0.93, follower_count: 41200, status: "active" },
  { slug: "pace-athletic", name: "Pace Athletic", verified: false, plan: "stall", tagline: "Run shoes, no hype tax", description: "Independent running shop. Last-season colourways at honest prices.", banner_color: "#e4e1d6", accent_color: "#d7361e", country: "United States", joined_at: "2025-06-14", response_rate: 0.88, on_time_rate: 0.9, follower_count: 1300, status: "active" },
  { slug: "marrow-leather", name: "Marrow Leather", verified: true, plan: "shopfront", tagline: "Bags that get better with age", description: "Vegetable-tanned leather goods from a family workshop in León.", banner_color: "#4a2c1d", accent_color: "#d9a066", country: "Mexico", joined_at: "2023-11-05", response_rate: 0.96, on_time_rate: 0.94, follower_count: 9100, status: "active" },
  { slug: "dew-apothecary", name: "Dew Apothecary", verified: true, plan: "shopfront", tagline: "Skincare with short ingredient lists", description: "Fragrance-free basics made in Seoul. Every formula has fewer than twelve ingredients.", banner_color: "#dfe7df", accent_color: "#2f5d50", country: "South Korea", joined_at: "2024-04-30", response_rate: 0.99, on_time_rate: 0.98, follower_count: 22800, status: "active" },
  { slug: "lumen-works", name: "Lumen Works", verified: false, plan: "stall", tagline: "Lamps for reading rooms", description: "Brass and linen lighting assembled in Lyon.", banner_color: "#f3d36b", accent_color: "#16130f", country: "France", joined_at: "2025-09-01", response_rate: 0.9, on_time_rate: 0.92, follower_count: 840, status: "active" },
  { slug: "harbor-menswear", name: "Harbor Menswear", verified: true, plan: "shopfront", tagline: "Workwear for people who don't work outside", description: "Chore coats, heavy tees and waxed jackets from a mill town in Lancashire.", banner_color: "#25324a", accent_color: "#e9e2cf", country: "United Kingdom", joined_at: "2023-07-19", response_rate: 0.93, on_time_rate: 0.96, follower_count: 12700, status: "active" },
];

type Template = { title: string; shape: ArtShape; cat: string; store: string; base: number; sizes?: string[]; colors: Array<[string, string]> };

const apparel = ["XS", "S", "M", "L", "XL"];
const shoeSizes = ["6", "7", "8", "9", "10", "11"];

const templates: Template[] = [
  { title: "Linen slip dress", shape: "dress", cat: "dresses", store: "northline-studio", base: 6800, sizes: apparel, colors: [["Sand", "#d9c7a6"], ["Ink", "#22252b"], ["Moss", "#5b6b45"]] },
  { title: "Tiered poplin midi dress", shape: "dress", cat: "dresses", store: "northline-studio", base: 7400, sizes: apparel, colors: [["Chalk", "#efeadf"], ["Rust", "#b4532a"]] },
  { title: "Ribbed tank, pack of two", shape: "tee", cat: "tops", store: "northline-studio", base: 2400, sizes: apparel, colors: [["White", "#f4f1ea"], ["Black", "#1b1b1b"], ["Clay", "#c07a5a"]] },
  { title: "Boxy organic cotton tee", shape: "tee", cat: "tops", store: "northline-studio", base: 2900, sizes: apparel, colors: [["Bone", "#e9e3d5"], ["Navy", "#1d2a44"]] },
  { title: "Wrap satin dress", shape: "dress", cat: "dresses", store: "northline-studio", base: 8900, sizes: apparel, colors: [["Emerald", "#1d5c48"], ["Wine", "#5c1d2b"]] },
  { title: "Heavyweight pocket tee", shape: "tee", cat: "men", store: "harbor-menswear", base: 3200, sizes: apparel, colors: [["Oat", "#d8ccb2"], ["Forest", "#26402f"], ["Black", "#191919"]] },
  { title: "Canvas chore coat", shape: "jacket", cat: "outerwear", store: "harbor-menswear", base: 12800, sizes: apparel, colors: [["Ochre", "#b7862f"], ["Navy", "#1f2b45"]] },
  { title: "Waxed field jacket", shape: "jacket", cat: "outerwear", store: "harbor-menswear", base: 18900, sizes: apparel, colors: [["Olive", "#4b5233"], ["Tobacco", "#5a3e26"]] },
  { title: "Quilted liner vest", shape: "jacket", cat: "outerwear", store: "harbor-menswear", base: 7900, sizes: apparel, colors: [["Charcoal", "#33363a"]] },
  { title: "Loopback crew sweatshirt", shape: "tee", cat: "men", store: "harbor-menswear", base: 5900, sizes: apparel, colors: [["Grey marl", "#9a9a96"], ["Navy", "#1d2a44"]] },
  { title: "Daily trainer 4", shape: "sneaker", cat: "shoes", store: "pace-athletic", base: 8900, sizes: shoeSizes, colors: [["Signal", "#d7361e"], ["Glacier", "#cfdde3"]] },
  { title: "Tempo racer", shape: "sneaker", cat: "shoes", store: "pace-athletic", base: 11900, sizes: shoeSizes, colors: [["Volt", "#c9e14a"], ["Black", "#151515"]] },
  { title: "Trail grip low", shape: "sneaker", cat: "shoes", store: "pace-athletic", base: 9900, sizes: shoeSizes, colors: [["Mud", "#6b5a44"], ["Slate", "#4b5560"]] },
  { title: "Court classic leather", shape: "sneaker", cat: "shoes", store: "pace-athletic", base: 7400, sizes: shoeSizes, colors: [["White", "#f2f0ea"]] },
  { title: "Saddle crossbody", shape: "bag", cat: "bags", store: "marrow-leather", base: 9600, colors: [["Tan", "#b97a45"], ["Black", "#1a1715"], ["Oxblood", "#5a1f1f"]] },
  { title: "Market tote, large", shape: "bag", cat: "bags", store: "marrow-leather", base: 13400, colors: [["Natural", "#c9a27a"], ["Chocolate", "#4a2c1d"]] },
  { title: "Card wallet", shape: "bag", cat: "bags", store: "marrow-leather", base: 3800, colors: [["Tan", "#b97a45"], ["Forest", "#26402f"]] },
  { title: "Acetate round sunglasses", shape: "glasses", cat: "bags", store: "marrow-leather", base: 5400, colors: [["Tortoise", "#6b3f1f"], ["Black", "#151515"]] },
  { title: "Field watch, 38mm", shape: "watch", cat: "bags", store: "marrow-leather", base: 16500, colors: [["Steel/Tan", "#b97a45"], ["Steel/Black", "#1a1715"]] },
  { title: "Speckled stoneware mug", shape: "mug", cat: "kitchen", store: "kiln-and-co", base: 2200, colors: [["Oatmeal", "#e2d6bf"], ["Sea", "#5f8a8b"], ["Rust", "#b5562f"]] },
  { title: "Pour-over set", shape: "mug", cat: "kitchen", store: "kiln-and-co", base: 5800, colors: [["Oatmeal", "#e2d6bf"], ["Charcoal", "#3a3a3a"]] },
  { title: "Glass carafe, 1L", shape: "bottle", cat: "kitchen", store: "kiln-and-co", base: 3400, colors: [["Clear", "#cfe0dc"]] },
  { title: "Hanging planter", shape: "plant", cat: "home", store: "kiln-and-co", base: 4200, colors: [["Terracotta", "#c06b45"], ["White", "#efeae0"]] },
  { title: "Low bowl planter", shape: "plant", cat: "home", store: "kiln-and-co", base: 3600, colors: [["Sage", "#9aa98a"]] },
  { title: "Brass reading lamp", shape: "lamp", cat: "lighting", store: "lumen-works", base: 14900, colors: [["Brass", "#c49a3b"], ["Black", "#1c1c1c"]] },
  { title: "Pleated linen table lamp", shape: "lamp", cat: "lighting", store: "lumen-works", base: 8900, colors: [["Natural", "#e5dac3"], ["Terracotta", "#c06b45"]] },
  { title: "Bentwood side chair", shape: "chair", cat: "home", store: "lumen-works", base: 21900, colors: [["Oak", "#c8a675"], ["Walnut", "#5b3b26"]] },
  { title: "Wireless over-ear headphones", shape: "headphones", cat: "audio", store: "volt-depot", base: 5900, colors: [["Graphite", "#2b2e33"], ["Mint", "#a9d8c7"], ["Sand", "#d6c8ae"]] },
  { title: "Studio monitor headphones", shape: "headphones", cat: "audio", store: "volt-depot", base: 8400, colors: [["Black", "#151515"]] },
  { title: "Rugged phone, 6.1\"", shape: "phone", cat: "electronics", store: "volt-depot", base: 21900, colors: [["Black", "#151515"], ["Orange", "#e07a2e"]] },
  { title: "Smart band 3", shape: "watch", cat: "electronics", store: "volt-depot", base: 2900, colors: [["Black", "#151515"], ["Teal", "#3ad1b0"]] },
  { title: "Power bank, 20,000mAh", shape: "phone", cat: "electronics", store: "volt-depot", base: 2400, colors: [["White", "#efefef"], ["Black", "#151515"]] },
  { title: "Insulated bottle, 750ml", shape: "bottle", cat: "kitchen", store: "volt-depot", base: 1600, colors: [["Steel", "#a3a8ad"], ["Signal", "#d7361e"], ["Forest", "#26402f"]] },
  { title: "Barrier cream, 60ml", shape: "bottle", cat: "beauty", store: "dew-apothecary", base: 2600, colors: [["Unscented", "#e9efe6"]] },
  { title: "Gel cleanser, 150ml", shape: "bottle", cat: "beauty", store: "dew-apothecary", base: 1800, colors: [["Unscented", "#dfe7df"]] },
  { title: "Mineral sunscreen SPF 50", shape: "bottle", cat: "beauty", store: "dew-apothecary", base: 2400, colors: [["Untinted", "#f2ede2"], ["Tinted", "#d9b892"]] },
  { title: "Overnight lip mask", shape: "bottle", cat: "beauty", store: "dew-apothecary", base: 1400, colors: [["Clear", "#f1d9d6"]] },
];

const backdrops = ["#e9e3d6", "#dcd6c7", "#e5ddd0", "#d8ddd4", "#e8dfd2", "#dfe1dc"];

const storeById: Record<string, Store> = {};
export const stores: Store[] = storeSeeds.map((s, i) => {
  const store: Store = { ...s, id: `s${i + 1}`, rating: 0, product_count: 0 };
  storeById[s.slug] = store;
  return store;
});

const reviewers = ["Amara O.", "Jonas K.", "Priya S.", "Leo M.", "Hana T.", "Diego R.", "Chloe B.", "Sam W.", "Ife A.", "Mei L.", "Tom H.", "Nadia F."];
const reviewLines: Array<[number, string, string]> = [
  [5, "Better than the photos", "Fabric is heavier than I expected in a good way. Ordered my usual size and it fits."],
  [5, "Second time buying", "Bought one for my sister after the first. Shipping took six days."],
  [4, "Nice, runs a little small", "Quality is there. I'd size up if you're between sizes."],
  [4, "Solid for the price", "Not luxury, but nothing about it feels cheap either. Seller answered my question within an hour."],
  [3, "Okay", "Colour is darker than the listing. Keeping it but wouldn't buy the same shade again."],
  [5, "Exactly what I wanted", "Packaged well, no plastic. Will check out the rest of the store."],
  [2, "Arrived late", "The product is fine but delivery took almost three weeks."],
  [5, "Great seller", "Wrong size the first time, exchange was painless."],
];

export const products: Product[] = [];
const r = rng(42);
const now = Date.UTC(2026, 10, 24);
let pid = 1;
for (let round = 0; round < 2; round++) {
  for (const t of templates) {
    const store = storeById[t.store];
    const title = round === 0 ? t.title : `${t.title}, ${["limited run", "seconds", "bundle", "new season"][pid % 4]}`;
    const price = Math.round((t.base * (round === 0 ? 1 : 0.7 + r() * 0.5)) / 100) * 100 - 1;
    const onSale = r() < 0.38;
    const compare = onSale ? Math.round((price * (1.2 + r() * 0.5)) / 100) * 100 - 1 : null;
    const rating = Math.round((3.6 + r() * 1.4) * 10) / 10;
    const reviewCount = Math.floor(r() * 2400) + 3;
    const sold = Math.floor(reviewCount * (3 + r() * 9));
    const created = new Date(now - Math.floor(r() * 120) * 86400000).toISOString();
    const slug = `${t.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + (round ? `-${pid}` : "");
    const variants = t.colors.flatMap(([color, hex], ci) =>
      (t.sizes ?? ["One size"]).map((size, si) => ({
        id: `v${pid}-${ci}-${si}`,
        sku: `${store.slug.slice(0, 3).toUpperCase()}-${pid}-${ci}${si}`,
        color, color_hex: hex, size,
        price_cents: price,
        compare_at_cents: compare,
        stock: Math.floor(r() * 40),
      })),
    );
    const bulk = store.slug === "volt-depot" || store.slug === "kiln-and-co";
    const badges: string[] = [];
    if (Date.parse(created) > now - 14 * 86400000) badges.push("New");
    if (sold > 9000) badges.push("Bestseller");
    if (bulk) badges.push("Bulk pricing");
    const five = Math.round(reviewCount * (rating - 3) / 2 * 0.8);
    products.push({
      id: `p${pid}`,
      slug,
      title,
      price_cents: price,
      compare_at_cents: compare,
      currency: "USD",
      image_url: null,
      art: { shape: t.shape, bg: backdrops[pid % backdrops.length], fg: t.colors[0][1] },
      rating,
      review_count: reviewCount,
      sold_count: sold,
      store: { id: store.id, slug: store.slug, name: store.name, verified: store.verified, rating: 0, plan: store.plan },
      category_slug: t.cat,
      badges,
      colors: t.colors.map((c) => c[1]),
      created_at: created,
      description: `${t.title} from ${store.name}. ${store.description} Every order ships in recycled packaging, and returns are free within 30 days.`,
      images: [],
      variants,
      price_tiers: bulk
        ? [
            { min_qty: 1, price_cents: price },
            { min_qty: 10, price_cents: Math.round(price * 0.88) },
            { min_qty: 50, price_cents: Math.round(price * 0.76) },
            { min_qty: 200, price_cents: Math.round(price * 0.64) },
          ]
        : undefined,
      specs: {
        "Sold by": store.name,
        "Ships from": store.country,
        SKU: variants[0].sku,
        ...(t.sizes ? { "Size range": `${t.sizes[0]}–${t.sizes[t.sizes.length - 1]}` } : {}),
      },
      ships_from: store.country,
      delivery_days: store.country === "United States" ? [3, 5] : [6, 12],
      rating_breakdown: {
        5: five,
        4: Math.round(reviewCount * 0.22),
        3: Math.round(reviewCount * 0.08),
        2: Math.round(reviewCount * 0.03),
        1: Math.max(0, reviewCount - five - Math.round(reviewCount * 0.33)),
      },
    });
    store.product_count++;
    pid++;
  }
}

for (const s of stores) {
  const own = products.filter((p) => p.store.slug === s.slug);
  s.rating = Math.round((own.reduce((a, p) => a + p.rating, 0) / Math.max(own.length, 1)) * 10) / 10;
}
for (const p of products) p.store.rating = storeById[p.store.slug].rating;

// Two stores waiting on review so the admin queue has something in it.
stores.push(
  { id: "s9", slug: "atelier-oumou", name: "Atelier Oumou", verified: false, plan: "shopfront", tagline: "Wax print, tailored", description: "Made-to-measure pieces from Dakar.", banner_color: "#e07a2e", accent_color: "#1d2a44", country: "Senegal", joined_at: "2026-11-20", response_rate: 0, on_time_rate: 0, follower_count: 0, status: "pending", rating: 0, product_count: 0 },
  { id: "s10", slug: "gridline-tools", name: "Gridline Tools", verified: false, plan: "stall", tagline: "Hand tools for small workshops", description: "Japanese saws, chisels and marking gauges.", banner_color: "#2b2e33", accent_color: "#e3b23c", country: "Japan", joined_at: "2026-11-22", response_rate: 0, on_time_rate: 0, follower_count: 0, status: "pending", rating: 0, product_count: 0 },
);

export function reviewsFor(productId: string): Review[] {
  const rr = rng(Number(productId.replace(/\D/g, "")) * 7);
  return Array.from({ length: 6 }, (_, i) => {
    const [rating, title, body] = reviewLines[Math.floor(rr() * reviewLines.length)];
    return {
      id: `${productId}-r${i}`,
      author: reviewers[Math.floor(rr() * reviewers.length)],
      rating, title, body,
      created_at: new Date(now - Math.floor(rr() * 90) * 86400000).toISOString(),
      verified_purchase: rr() > 0.15,
    };
  });
}

export const sellerStats: SellerStats = (() => {
  const rs = rng(7);
  const daily = Array.from({ length: 30 }, (_, i) => {
    const orders = Math.floor(8 + rs() * 22 + i * 0.4);
    return { date: new Date(now - (29 - i) * 86400000).toISOString().slice(0, 10), orders, sales_cents: orders * Math.floor(4200 + rs() * 2600) };
  });
  const sales = daily.reduce((a, d) => a + d.sales_cents, 0);
  const orders = daily.reduce((a, d) => a + d.orders, 0);
  const own = products.filter((p) => p.store.slug === "northline-studio");
  return {
    daily,
    sales_cents_30d: sales,
    orders_30d: orders,
    units_30d: Math.round(orders * 1.4),
    average_order_cents: Math.round(sales / Math.max(orders, 1)),
    to_ship: 7,
    active_products: own.length,
    rating: 4.6,
    review_count: 1840,
    balance: { balance_cents: 412_960, available_cents: 284_310, pending_cents: 128_650 },
    top_products: own.slice(0, 5).map((p, i) => ({ id: p.id, slug: p.slug, title: p.title, units: 120 - i * 17, sales_cents: (120 - i * 17) * p.price_cents })),
  };
})();

export const adminStats: AdminStats = {
  gmv_cents_30d: 48_210_400,
  orders_30d: 6_204,
  commission_cents_30d: 3_904_000,
  fees_cents_30d: 412_300,
  rent_cents_30d: 1_286_400,
  placement_cents_30d: 1_769_023,
  rent_mrr_cents: 1_286_400,
  active_stores: stores.filter((s) => s.status === "active").length,
  pending_stores: stores.filter((s) => s.status === "pending").length,
  customers: 21_480,
  active_products: products.length,
  payouts_requested_cents: 612_000,
};

export function demoOrders(): Order[] {
  const statuses = ["paid", "fulfilled", "paid", "fulfilled", "canceled"];
  return statuses.map((status, i) => {
    const picks = [products[i * 3], products[i * 5 + 1]].filter(Boolean);
    const lines = picks.map((p, j) => ({
      id: `l${i}${j}`,
      product_id: p.id,
      variant_id: p.variants[0].id,
      slug: p.slug,
      title: p.title,
      variant_label: [p.variants[0].color, p.variants[0].size].filter(Boolean).join(" / "),
      unit_price_cents: p.price_cents,
      quantity: j + 1,
      store_slug: p.store.slug,
      store_name: p.store.name,
      art: p.art,
    }));
    const subtotal = lines.reduce((a, l) => a + l.unit_price_cents * l.quantity, 0);
    const created = now - (i * 6 + 2) * 86400000;
    const flow = status === "canceled" ? ["pending_payment", "canceled"] : ["pending_payment", "paid", "shipped", "fulfilled"];
    const upto = status === "paid" ? 2 : flow.indexOf(status);
    return {
      id: `o${1040 + i}`,
      number: `SR-${(20481 + i * 37).toString()}`,
      status,
      created_at: new Date(created).toISOString(),
      subtotal_cents: subtotal,
      shipping_cents: subtotal > 5000 ? 0 : 499,
      tax_cents: Math.round(subtotal * 0.07),
      total_cents: subtotal + (subtotal > 5000 ? 0 : 499) + Math.round(subtotal * 0.07),
      currency: "USD",
      item_count: lines.reduce((a, l) => a + l.quantity, 0),
      lines,
      payment_provider: i % 2 ? "bank_transfer" : "cod",
      customer_email: ["ada@example.com", "ben@example.com", "cleo@example.com", "dev@example.com", "eli@example.com"][i],
      shipping_address: { full_name: "Demo Shopper", line1: "12 Market Row", city: "Austin", region: "TX", postal_code: "78701", country: "US" },
      events: flow.slice(0, upto + 1).map((s, k) => ({ status: s, at: new Date(created + k * 36 * 3600000).toISOString() })),
    };
  });
}
