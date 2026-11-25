"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { X } from "@/components/icons";
import { cn } from "@/lib/utils";

/** The button row along the bottom of a modal. Forms put it inside themselves so Enter submits. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border p-4">{children}</div>;
}

/**
 * Every pop-up window in the app. Base UI's dialog keeps focus inside, closes on Escape or a
 * click outside, stops the page scrolling behind it and puts focus back where it was.
 * On phones it rises from the bottom; from 640px up it sits in the middle.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  busy = false,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons along the bottom edge, right aligned. */
  footer?: ReactNode;
  /** While true, Escape and outside clicks are ignored so a save can't be cut off. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !busy && onClose()} disablePointerDismissal={busy}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop fixed inset-0 z-50 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className={cn(
            "modal fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-b-none text-main-text outline-none",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[min(92vw,32rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-b-[var(--radius-large)]",
            "transition-[opacity,translate,scale] duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            "data-[starting-style]:translate-y-4 data-[ending-style]:translate-y-4 sm:data-[starting-style]:scale-95 sm:data-[ending-style]:scale-95 motion-reduce:transition-none",
            className,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 py-2 pr-2 pl-4">
            <Dialog.Title className="heading min-w-0 text-[18px] text-balance">{title}</Dialog.Title>
            <Dialog.Close disabled={busy} className="btn btn-tertiary btn-icon" aria-label="Close">
              <X />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <ModalFooter>{footer}</ModalFooter>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
