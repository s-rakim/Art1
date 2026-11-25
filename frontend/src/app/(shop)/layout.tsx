import { AppFrame } from "@/components/app-frame";
import type { NavSection } from "@/components/app-navigation";
import { Archive, Fire, Heart, Help, Home, Receipt, Sparkle, Store, Tag, User } from "@/components/icons";
import { api } from "@/lib/api";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await api.categories().catch(() => []);
  const roots = categories.filter((c) => !c.parent_id);
  const nav: NavSection[] = [
    {
      items: [
        { href: "/", label: "Home", icon: <Home />, exact: true },
        { href: "/deals", label: "Today's deals", icon: <Fire /> },
        { href: "/search?sort=newest", label: "New in", icon: <Sparkle /> },
        { href: "/stores", label: "All stores", icon: <Store /> },
        { href: "/wholesale", label: "Wholesale", icon: <Archive /> },
      ],
    },
    { caption: "Departments", items: roots.map((c) => ({ href: `/c/${c.slug}`, label: c.name, icon: <Tag /> })) },
    {
      caption: "You",
      items: [
        { href: "/orders", label: "Orders", icon: <Receipt /> },
        { href: "/wishlist", label: "Wishlist", icon: <Heart /> },
        { href: "/account", label: "Account", icon: <User /> },
      ],
    },
  ];
  const footer: NavSection = {
    items: [
      { href: "/sell", label: "Rent a stall", icon: <Store /> },
      { href: "/help/shipping", label: "Help", icon: <Help /> },
    ],
  };
  return <AppFrame nav={nav} navFooter={footer} navLabel="Shop">{children}</AppFrame>;
}
