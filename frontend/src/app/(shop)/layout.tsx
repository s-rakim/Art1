import { AppFrame } from "@/components/app-frame";
import { Tag } from "@/components/icons";
import { api } from "@/lib/api";
import { HELP_LINK, SELL_LINKS, SHOP_LINKS, YOU_LINKS, type NavSection } from "@/lib/nav";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await api.categories().catch(() => []);
  const roots = categories.filter((c) => !c.parent_id);
  const nav: NavSection[] = [
    { items: SHOP_LINKS },
    { caption: "Departments", items: roots.map((c) => ({ href: `/c/${c.slug}`, label: c.name, icon: <Tag /> })) },
    { caption: "You", items: YOU_LINKS },
  ];
  return <AppFrame nav={nav} navFooter={{ items: [SELL_LINKS[0], HELP_LINK] }} navLabel="Shop">{children}</AppFrame>;
}
