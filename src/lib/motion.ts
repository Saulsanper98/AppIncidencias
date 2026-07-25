/**
 * Catálogo de motion unificado (visual p23 / Ola 3 z41).
 *
 * Matriz de decisión:
 * | Caso                    | Usar                          | Evitar                    |
 * |-------------------------|-------------------------------|---------------------------|
 * | Listas >50 filas        | CSS .ccmgc-stagger-in         | framer por fila           |
 * | Modales/overlays        | fadeScale/slideUp + ModalShell| fixed inset-0 ad-hoc      |
 * | Micro UI (press, focus) | CSS globals                   | framer                    |
 * | SSR / hidratación       | CSS stagger en hijos          | initial={{ opacity: 0 }} |
 * | Popovers/menús          | fadeScale + portal            | ModalShell                |
 * | Datos vivos (SSE)       | .ccmgc-row-enter + CountUp    | re-mount lista entera     |
 */

import type { Transition, Variants } from "framer-motion";

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DURATION = {
  fast: 0.16,
  normal: 0.22,
  slow: 0.32,
} as const;

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
};

export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

export const slideFromRight: Variants = {
  initial: { opacity: 0, x: "100%" },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: "100%" },
};

export const slideRight: Variants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 8 },
};

export const slideUpPanel: Variants = {
  initial: { opacity: 0, y: "100%" },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: "100%" },
};

export function motionTransition(duration: number = DURATION.normal): Transition {
  return { duration, ease: EASE_OUT };
}

/** Variants sin animación inicial (seguro para hidratación). */
export function staticMotion(variants: Variants): Variants {
  return {
    ...variants,
    initial: false,
  } as unknown as Variants;
}

export function hapticLight(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(10);
    } catch {
      /* ignore */
    }
  }
}

/** Confirmaciones / acciones medias (z41 #337). */
export function hapticMedium(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([12, 40, 12]);
    } catch {
      /* ignore */
    }
  }
}

/** Éxito compuesto: haptic + chime opt-in (z41 #338). */
export function hapticSuccess(): void {
  hapticLight();
  try {
    // Lazy import evita circular deps en SSR.
    void import("@/lib/ui-chime").then(({ playUiChime }) => playUiChime("success"));
  } catch {
    /* ignore */
  }
}
