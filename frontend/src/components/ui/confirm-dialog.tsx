"use client";

import type { ReactNode } from "react";
import { Modal } from "./modal";

/** A yes/no question before something that can't be undone, on the app's one modal. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirm,
  cancel = "Cancel",
  tone = "error",
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirm: string;
  cancel?: string;
  tone?: "error" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      busy={busy}
      footer={
        <>
          <button type="button" autoFocus disabled={busy} onClick={onClose} className="btn btn-tertiary">{cancel}</button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`btn ${tone === "error" ? "btn-error" : "btn-primary"}`}>
            {busy ? "Working…" : confirm}
          </button>
        </>
      }
    >
      {children ? <div className="px-4 pb-4 text-[14px] text-maxcontrast text-pretty">{children}</div> : null}
    </Modal>
  );
}
