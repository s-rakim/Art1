import Link from "next/link";
import type { ReactNode } from "react";
import { STORE_NAME } from "@/lib/config";
import { WallpaperCredit } from "./footer";

/** Nextcloud's guest pages (login, errors, maintenance): a single white box centred on the wallpaper, with the logo on top. */
export function GuestFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 text-background-plain-text sm:py-12">
      <main id="main" className={`w-full ${wide ? "max-w-[560px]" : "max-w-[420px]"} rounded-large bg-main-background p-5 text-main-text shadow-modal sm:p-7`}>
        <Link href="/" className="mx-auto mb-4 block w-fit" aria-label={`${STORE_NAME} home`}>
          <Logo width={190} />
        </Link>
        {children}
      </main>
      <div className="mt-auto pt-10 text-center [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]">
        <p className="text-[13px]">Independent shops, one checkout.</p>
        <p className="mt-1 text-[12px]"><WallpaperCredit /></p>
      </div>
    </div>
  );
}

/** The full logo: awning, bag and the name. Drawn on white, so keep it on a light surface. */
export function Logo({ width = 190 }: { width?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/img/logo.png" alt={STORE_NAME} width={width} height={Math.round((width * 278) / 480)} className="block h-auto" />;
}

/** The awning-and-bag mark on a white rounded tile, used in the header like an app icon. */
export function LogoTile({ size = 30 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/img/logo-tile.png" alt="" width={size} height={size} className="block shrink-0" />;
}
