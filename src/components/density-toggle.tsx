"use client";

/**
 * Toggle de densidad global comoda / compacta.
 *
 * Aplica `data-density="compact"` al `<html>` y lo persiste en localStorage.
 * Cualquier componente puede leerlo con CSS:
 *
 *   html[data-density="compact"] .my-card { padding: 8px; }
 */

import { AnimatePresence, motion } from "framer-motion";
import { Rows3, Rows2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useFramerTransition } from "@/hooks/use-reduced-motion-framer";
import { cn } from "@/lib/utils";

type Density = "comfortable" | "compact";

const STORAGE_KEY = "ccmgc_density";

function applyDensity(value: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = value;
}

export function DensityToggle() {
  const [density, setDensity] = useState<Density>("comfortable");
  const transition = useFramerTransition();

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Density | null;
    const next: Density = saved === "compact" ? "compact" : "comfortable";
    setDensity(next);
    applyDensity(next);
  }, []);

  const toggle = () => {
    setDensity((current) => {
      const next: Density = current === "comfortable" ? "compact" : "comfortable";
      window.localStorage.setItem(STORAGE_KEY, next);
      applyDensity(next);
      return next;
    });
  };

  const isCompact = density === "compact";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isCompact ? "Densidad: compacta (cambiar a comoda)" : "Densidad: comoda (cambiar a compacta)"}
      aria-label={isCompact ? "Cambiar a densidad comoda" : "Cambiar a densidad compacta"}
      aria-pressed={isCompact}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-2)] transition-colors",
        "hover:bg-[var(--color-surface-2)]/70 hover:text-[var(--color-text-1)]",
        isCompact && "bg-[var(--color-accent-light)]/80 text-[var(--color-accent)]",
      )}
    >
      <span className="relative inline-flex h-[15px] w-[15px] items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isCompact ? "compact" : "comfortable"}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={transition}
            className="absolute inset-0 flex items-center justify-center"
          >
            {isCompact ? (
              <Rows2 size={15} strokeWidth={1.6} aria-hidden />
            ) : (
              <Rows3 size={15} strokeWidth={1.6} aria-hidden />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}
