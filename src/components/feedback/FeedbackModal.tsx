"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";

import { FeedbackForm, type FeedbackPrefillTarget } from "@/components/feedback/FeedbackForm";

type Props = {
  /** Si true, el modal se muestra (con o sin `target`). */
  open: boolean;
  /**
   * Si se pasa un target el form aparece con un banner "Feedback sobre: X".
   * Si es null, se abre como modal genérico (lo usa el FAB / atajo global).
   */
  target?: FeedbackPrefillTarget | null;
  onClose: () => void;
};

export function FeedbackModal({ open, target, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const isOpen = open;
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const backdropMotion = reduceMotion
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };

  const panelMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96, y: 8 },
        transition: { duration: 0.2 },
      };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            ref={overlayRef}
            {...backdropMotion}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <div className="pointer-events-none fixed inset-0 z-[201] flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              key="panel"
              {...panelMotion}
              role="dialog"
              aria-modal="true"
              aria-label="Enviar feedback"
              className="pointer-events-auto w-full max-w-lg rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:rounded-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
                <h2 className="text-sm font-semibold text-[var(--color-text-1)]">Enviar feedback</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                  aria-label="Cerrar"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Body */}
              <div className="max-h-[80dvh] overflow-y-auto p-4 sm:p-5">
                <FeedbackForm
                  prefillTarget={target ?? undefined}
                  onSuccess={onClose}
                />
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
