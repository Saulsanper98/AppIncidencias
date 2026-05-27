"use client";

/**
 * Toggle de densidad global comoda / compacta.
 *
 * Aplica `data-density="compact"` al `<html>` y lo persiste en localStorage.
 * Cualquier componente puede leerlo con CSS:
 *
 *   html[data-density="compact"] .my-card { padding: 8px; }
 */

import { Rows3, Rows2 } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type Density = "comfortable" | "compact";

const STORAGE_KEY = "ccmgc_density";

function applyDensity(value: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = value;
}

export function DensityToggle() {
  const [density, setDensity] = useState<Density>("comfortable");

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
  const Icon = isCompact ? Rows2 : Rows3;
  return (
    <button
      type="button"
      onClick={toggle}
      title={isCompact ? "Densidad: compacta (cambiar a comoda)" : "Densidad: comoda (cambiar a compacta)"}
      aria-label={isCompact ? "Cambiar a densidad comoda" : "Cambiar a densidad compacta"}
      aria-pressed={isCompact}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-2)] transition-all duration-150",
        "hover:bg-[var(--color-surface)]/60 hover:text-[var(--color-text-1)]",
        isCompact && "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
      )}
    >
      <Icon size={15} strokeWidth={1.6} />
    </button>
  );
}
