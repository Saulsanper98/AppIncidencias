"use client";

/**
 * FeedbackFAB — Botón Flotante de Feedback (Fase 4).
 *
 * Es la entrada rápida al formulario de feedback desde CUALQUIER pantalla
 * de la app. Tres facetas:
 *
 *   1. Botón flotante fijo abajo a la derecha con icono y texto "Feedback"
 *      que se expande en hover (estilo "tooltip permanente").
 *   2. Atajo de teclado global: Ctrl/Cmd + Shift + F → abre el modal.
 *   3. Tooltip de descubrimiento la primera vez que un usuario lo ve
 *      (persistido en localStorage para no agobiar después).
 *
 * No renderiza el modal directamente: dispara el evento global
 * `ccmgc-open-feedback` (sin payload) que ya escucha el layout privado y
 * abre el `FeedbackModal` compartido. Así reutilizamos la lógica que
 * usaban los modales contextuales (botón "Reportar" desde un ticket o un
 * bus), y se evita tener dos modales montados a la vez.
 *
 * Se oculta cuando el usuario está dentro de /feedback porque allí ya
 * tiene el form a pantalla completa: ofrecer el FAB encima sería redundante.
 */

import { motion } from "framer-motion";
import { MessageSquarePlus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const STORAGE_HINT_KEY = "ccmgc:feedback-fab:hint-seen";

/** Detecta si el foco está en un input/textarea para no robarles teclas. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function FeedbackFAB() {
  const pathname = usePathname();
  const [showHint, setShowHint] = useState(false);

  // Mostrar la pista la primera vez tras 4 s; persistir que ya se vio.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_HINT_KEY) === "1") return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setShowHint(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    try {
      localStorage.setItem(STORAGE_HINT_KEY, "1");
    } catch {
      // Sin localStorage: no es crítico, simplemente no recordamos.
    }
  };

  const openModal = () => {
    dismissHint();
    window.dispatchEvent(new CustomEvent("ccmgc-open-feedback", { detail: {} }));
  };

  // Atajo Ctrl/Cmd + Shift + F → abrir modal.
  // Si el usuario está escribiendo, igualmente lo permitimos: este atajo es
  // explícito (con Shift) y poco ambiguo, así que es razonable que funcione
  // mientras escribe (puede haber detectado un bug en un campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCtrlMeta = e.ctrlKey || e.metaKey;
      if (!isCtrlMeta || !e.shiftKey) return;
      if (e.key !== "f" && e.key !== "F") return;
      // Evitamos colisionar con búsquedas avanzadas internas si en algún input
      // se ha registrado el mismo atajo: si estás escribiendo, no abrimos.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      openModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // No mostrar el FAB si estamos en /feedback (la página completa ya tiene el form).
  if (pathname?.startsWith("/feedback")) return null;

  return (
    // z-40: por debajo del header (z-20) y del sidebar drawer (z-40, sin
    // chocar porque el sidebar cubre toda la izquierda) pero permite que
    // otros FABs especificos (scroll-top de la vista de lectura) puedan
    // posicionarse encima con z-50 sin que el feedback los oculte.
    // Variables env() para respetar el "safe area" del iPhone con notch /
    // home bar sin tapar el FAB.
    <div
      className="pointer-events-none fixed z-40 flex flex-col items-end gap-2"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
        right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
      }}
    >
      {/* Tooltip de descubrimiento la primera vez */}
      {showHint ? (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="pointer-events-auto relative max-w-[260px] rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] px-3.5 py-2.5 pr-9 text-[12px] leading-snug text-[var(--color-text-1)] shadow-[0_18px_42px_-20px_rgba(0,0,0,0.6)]"
        >
          <p className="font-semibold text-[var(--color-accent)]">¿Una idea o un fallo?</p>
          <p className="mt-0.5 text-[var(--color-text-2)]">
            Pulsa este botón o usa{" "}
            <span className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 py-px font-mono text-[10.5px] text-[var(--color-text-2)]">
              Ctrl + Shift + F
            </span>{" "}
            desde cualquier sitio.
          </p>
          <button
            type="button"
            onClick={dismissHint}
            aria-label="Cerrar pista"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
          >
            <X size={12} />
          </button>
          {/* Pico apuntando al FAB */}
          <span className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-[var(--color-accent)]/30 bg-[var(--color-surface)]" />
        </motion.div>
      ) : null}

      {/* Botón flotante */}
      <button
        type="button"
        onClick={openModal}
        aria-label="Enviar feedback"
        title="Enviar feedback (Ctrl+Shift+F)"
        className={cn(
          "feedback-fab-expand pointer-events-auto group flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-4 text-sm font-semibold text-white shadow-[0_18px_42px_-12px_rgba(37,99,235,0.55)] transition-all duration-200",
          "hover:bg-[var(--color-accent-hover)] hover:shadow-[0_22px_50px_-12px_rgba(37,99,235,0.7)] hover:scale-[1.04]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
        )}
      >
        <MessageSquarePlus size={18} strokeWidth={2.2} aria-hidden />
        <span className="hidden sm:inline">Feedback</span>
      </button>
    </div>
  );
}
