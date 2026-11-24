import type { ReactNode } from "react";
import { AppNavigation, type NavSection } from "./app-navigation";
import { Footer } from "./footer";
import { Header } from "./header";

/**
 * The Nextcloud page layout: a blue header bar, then a rounded body container
 * inset by 8px, holding the app navigation on the left and the content on the right.
 */
export function AppFrame({
  nav, navFooter, navLabel = "Sections", children, footer = true,
}: { nav?: NavSection[]; navFooter?: NavSection; navLabel?: string; children: ReactNode; footer?: boolean }) {
  return (
    <>
      <Header hasNav={!!nav} />
      <div className="mx-2 mb-2 flex min-h-[calc(100dvh-52px)] overflow-clip rounded-large bg-main-background">
        {nav && <AppNavigation sections={nav} footer={navFooter} label={navLabel} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" className="flex-1">{children}</main>
          {footer && <Footer />}
        </div>
      </div>
    </>
  );
}
