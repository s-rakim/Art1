import type { ReactNode } from "react";

/** Nextcloud's guest pages (login, errors, maintenance): a single box centred on the blue background. */
export function GuestFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 text-background-plain-text">
      <GuestLogo />
      <main id="main" className={`mt-8 w-full ${wide ? "max-w-[560px]" : "max-w-[420px]"} rounded-large bg-main-background p-5 text-main-text shadow-modal sm:p-7`}>
        {children}
      </main>
      <p className="mt-auto pt-10 text-center text-[13px] opacity-80">Independent shops, one checkout.</p>
    </div>
  );
}

function GuestLogo() {
  return (
    <a href="/" className="flex flex-col items-center gap-2" aria-label="Back to the shop">
      <LogoMark size={64} />
    </a>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path fill="currentColor" fillRule="evenodd" d="M5 12.5 7.4 6h17.2l2.4 6.5zM5 13.5h22v1.2a3.3 3.3 0 0 1-5.5 2.4 3.3 3.3 0 0 1-5.5 0 3.3 3.3 0 0 1-5.5 0A3.3 3.3 0 0 1 5 14.7zM7 18.6c1.4.5 2.9.4 4.2-.3 1.5.8 3.3.8 4.8 0 1.5.8 3.3.8 4.8 0 1.3.7 2.8.8 4.2.3V26H7zm6.5 2.4V26h5v-5z" />
    </svg>
  );
}
