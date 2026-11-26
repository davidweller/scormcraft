"use client";

import { Fragment } from "react";
import { Dialog as HeadlessDialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

const WIDTHS = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
} as const;

/**
 * The one modal shell: backdrop, focus trap, title bar and close button.
 * Put the body in `children` and any buttons in `footer`.
 */
export function Dialog({
  open,
  onClose,
  title,
  size = "md",
  children,
  footer,
  hideClose,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  size?: keyof typeof WIDTHS;
  children: React.ReactNode;
  footer?: React.ReactNode;
  hideClose?: boolean;
}) {
  return (
    <Transition appear show={open} as={Fragment}>
      <HeadlessDialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <HeadlessDialog.Panel
                className={`w-full ${WIDTHS[size]} overflow-hidden rounded-lg bg-surface shadow-xl`}
              >
                <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-3">
                  <HeadlessDialog.Title className="text-base font-semibold text-gray-900">
                    {title}
                  </HeadlessDialog.Title>
                  {!hideClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
                <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
                {footer && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
                    {footer}
                  </div>
                )}
              </HeadlessDialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}
