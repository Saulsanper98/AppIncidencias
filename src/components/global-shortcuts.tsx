"use client";

/**
 * Atajos de teclado de navegacion global.
 *
 *   g d -> /dashboard
 *   g b -> /bandeja        (listado de tickets — vista mas usada)
 *   g t -> /tickets        (gestion / mantenimiento)
 *   g i -> /inventory
 *   g m -> /mapa
 *   g a -> /account
 *
 * El usuario pulsa "g" y, dentro de los 1200ms siguientes, una segunda tecla.
 * No se disparan si esta escribiendo en un input, textarea o select.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const TARGETS: Record<string, string> = {
  d: "/dashboard",
  b: "/bandeja",
  t: "/tickets",
  i: "/inventory",
  m: "/mapa",
  a: "/account",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function GlobalShortcuts() {
  const router = useRouter();
  const gActiveRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (key === "g") {
        gActiveRef.current = window.setTimeout(() => {
          gActiveRef.current = null;
        }, 1200);
        return;
      }

      if (gActiveRef.current && TARGETS[key]) {
        e.preventDefault();
        window.clearTimeout(gActiveRef.current);
        gActiveRef.current = null;
        router.push(TARGETS[key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gActiveRef.current) {
        window.clearTimeout(gActiveRef.current);
        gActiveRef.current = null;
      }
    };
  }, [router]);

  return null;
}
