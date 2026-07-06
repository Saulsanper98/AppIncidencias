"use client";



import { AnimatePresence, motion } from "framer-motion";

import { X } from "lucide-react";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";



import { useFramerTransition } from "@/hooks/use-reduced-motion-framer";

import { fadeScale, slideUpPanel } from "@/lib/motion";

import { cn } from "@/lib/utils";



const MODAL_SIZE_WIDTH = {

  sm: "24rem",

  md: "28rem",

  lg: "32rem",

} as const;



export type ModalSize = keyof typeof MODAL_SIZE_WIDTH;



type ModalShellProps = {

  open: boolean;

  onClose: () => void;

  title: ReactNode;

  children: ReactNode;

  footer?: ReactNode;

  /** Preset de ancho; `maxWidth` lo sobreescribe si se indica. */

  size?: ModalSize;

  maxWidth?: string;

  className?: string;

  /** Shake en error de validación (p9/p17). */

  shake?: boolean;

  /** `sheet` = panel inferior móvil (w26). */

  variant?: "dialog" | "sheet";

  /** Oculta la X y bloquea cierre por overlay/Escape (wizards). */

  hideClose?: boolean;

  /** Foco inicial al abrir; por defecto el primer control enfocable. */

  initialFocusRef?: RefObject<HTMLElement | null>;

};



function trapFocus(panel: HTMLElement, e: KeyboardEvent) {
  if (e.key !== "Tab") return;

  const focusable = panel.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );

  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function getInitialFocusTarget(
  panel: HTMLElement,
  initialFocusRef?: RefObject<HTMLElement | null>,
): HTMLElement | null {
  if (initialFocusRef?.current) return initialFocusRef.current;

  const focusable = panel.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );

  for (const el of focusable) {
    if (!el.closest(".ccmgc-modal-header")) return el;
  }

  return focusable[0] ?? null;
}



/**

 * Modal unificado sobre .ccmgc-modal-* (p6/w26).

 */

export function ModalShell({

  open,

  onClose,

  title,

  children,

  footer,

  size = "md",

  maxWidth,

  className,

  shake = false,

  variant = "dialog",

  hideClose = false,

  initialFocusRef,

}: ModalShellProps) {

  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  const wasOpenRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  onCloseRef.current = onClose;
  openRef.current = open;

  const transition = useFramerTransition();

  const isSheet = variant === "sheet";

  const resolvedMaxWidth = maxWidth ?? MODAL_SIZE_WIDTH[size];

  useEffect(() => {
    setMounted(true);
  }, []);



  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    const previousFocus = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !hideClose) onCloseRef.current();
      if (panelRef.current) trapFocus(panelRef.current, e);
    };

    document.addEventListener("keydown", onKey);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let focusTimer: number | undefined;
    if (justOpened) {
      focusTimer = window.setTimeout(() => {
        const panel = panelRef.current;
        if (!panel) return;
        getInitialFocusTarget(panel, initialFocusRef)?.focus();
      }, 50);
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      if (!openRef.current) previousFocus?.focus();
    };
  }, [open, hideClose, initialFocusRef]);



  const panelVariants = isSheet ? slideUpPanel : fadeScale;



  const handleOverlayClick = hideClose ? undefined : onClose;



  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className={cn("ccmgc-modal-overlay", isSheet && "ccmgc-modal-overlay--sheet")}

          initial={{ opacity: 0 }}

          animate={{ opacity: 1 }}

          exit={{ opacity: 0 }}

          transition={transition}

          onClick={handleOverlayClick}

          role="presentation"

        >

          <motion.div

            ref={panelRef}

            role="dialog"

            aria-modal="true"

            aria-labelledby="ccmgc-modal-title"

            className={cn(

              "ccmgc-modal-panel",

              isSheet && "ccmgc-modal-panel--sheet",

              shake && "ccmgc-shake",

              className,

            )}

            style={isSheet ? undefined : { maxWidth: resolvedMaxWidth }}

            variants={panelVariants}

            initial="initial"

            animate="animate"

            exit="exit"

            transition={transition}

            onClick={(e) => e.stopPropagation()}

          >

            <div className="ccmgc-modal-header flex items-start justify-between gap-3">

              <div id="ccmgc-modal-title" className="min-w-0 flex-1 text-subheading font-semibold text-[var(--color-text-1)]">

                {title}

              </div>

              {!hideClose ? (

                <button

                  type="button"

                  onClick={onClose}

                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"

                  aria-label="Cerrar"

                >

                  <X size={16} />

                </button>

              ) : null}

            </div>

            <div className="px-5 py-4">{children}</div>

            {footer ? <div className="ccmgc-modal-footer">{footer}</div> : null}

          </motion.div>

        </motion.div>

      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

