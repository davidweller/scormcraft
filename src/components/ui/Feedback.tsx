"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/* ---------- Confirm ---------- */

export interface ConfirmOptions {
  title: string;
  /** What will happen, in a sentence or two. */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletes and overwrites. */
  danger?: boolean;
}

/* ---------- Toast ---------- */

export interface ToastOptions {
  message: string;
  tone?: "success" | "error" | "info";
  /** An optional button, such as Undo. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds on screen. Errors stay longer by default. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const FeedbackContext = createContext<{
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (options: ToastOptions | string) => void;
} | null>(null);

/**
 * Provides `useConfirm()` and `useToast()` to the whole app. These replace
 * the browser's own confirm and alert boxes.
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback((options: ConfirmOptions) => {
    setPending(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(ok: boolean) {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions | string) => {
      const item: ToastItem = {
        id: nextId.current++,
        ...(typeof options === "string" ? { message: options } : options),
      };
      setToasts((prev) => [...prev, item]);
      const duration = item.duration ?? (item.tone === "error" ? 8000 : 4000);
      window.setTimeout(() => dismiss(item.id), duration);
    },
    [dismiss]
  );

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}

      <Dialog
        open={open}
        onClose={() => settle(false)}
        title={pending?.title ?? ""}
        size="sm"
        hideClose
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>
              {pending?.cancelLabel ?? "Cancel"}
            </Button>
            <Button variant={pending?.danger ? "danger" : "primary"} onClick={() => settle(true)}>
              {pending?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <div className="text-sm text-gray-600">{pending?.message}</div>
      </Dialog>

      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-gray-200 bg-surface p-3 text-sm text-gray-800 shadow-lg"
          >
            {t.tone === "error" ? (
              <ExclamationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            ) : (
              <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            )}
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 font-medium text-brand-600 hover:underline"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useConfirm and useToast need a FeedbackProvider above them.");
  return ctx;
}

/** `const confirm = useConfirm(); if (await confirm({ title, message })) …` */
export function useConfirm() {
  return useFeedback().confirm;
}

/** `const toast = useToast(); toast("Saved")` or `toast({ message, tone: "error" })` */
export function useToast() {
  return useFeedback().toast;
}
