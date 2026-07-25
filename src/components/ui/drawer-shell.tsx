"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { useFramerTransition } from "@/hooks/use-reduced-motion-framer";
import { cn } from "@/lib/utils";

type DrawerSide = "left" | "right";

type DrawerShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  side?: DrawerSide;
  className?: string;
  /** Ancho del panel (default 18rem left / 20rem right). */
  width?: string;
};

const slideVariants = {
  left: {
    initial: { x: "-100%" },
    animate: { x: 0 },
    exit: { x: "-100%" },
  },
  right: {
    initial: { x: "100%" },
    animate: { x: 0 },
    exit: { x: "100%" },
  },
};

/** Drawer lateral unificado (sidebar móvil, filtros mapa, etc.). Ola 4 #530. */
export function DrawerShell({
  open,
  onClose,
  children,
  title,
  side = "left",
  className,
  width,
}: DrawerShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const transition = useFramerTransition();
  const resolvedWidth = width ?? (side === "left" ? "min(18rem, 85vw)" : "min(20rem, 90vw)");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const v = slideVariants[side];

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="ccmgc-drawer-overlay fixed inset-0 z-[80] bg-black/50 backdrop-blur-[var(--modal-backdrop-blur,6px)] sm:bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
            role="presentation"
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : "Panel lateral"}
            className={cn(
              "ccmgc-drawer-panel fixed inset-y-0 z-[90] flex flex-col border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl",
              side === "left" ? "left-0 border-r" : "right-0 border-l",
              className,
            )}
            style={{ width: resolvedWidth, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            initial={v.initial}
            animate={v.animate}
            exit={v.exit}
            transition={transition}
            onClick={(e) => e.stopPropagation()}
          >
            {title ? (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
                <div className="text-sm font-semibold text-[var(--color-text-1)]">{title}</div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)]"
                  aria-label="Cerrar panel"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
