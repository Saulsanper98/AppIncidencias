"use client";

import { useEffect, useRef, useState } from "react";

type UseNewItemIdsOptions = {
  /** Duración del estado "fresh" antes de limpiar el Set (ms). */
  ttlMs?: number;
};

/**
 * Detecta IDs nuevos en una lista para aplicar animación de entrada (w24).
 * Devuelve un Set de IDs que acaban de aparecer (1 ciclo de render).
 */
export function useNewItemIds<T extends { id: string }>(
  items: T[],
  options?: UseNewItemIdsOptions,
): Set<string> {
  const ttlMs = options?.ttlMs ?? 600;
  const prev = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const current = new Set(items.map((i) => i.id));
    const added = new Set<string>();
    for (const id of current) {
      if (!prev.current.has(id)) added.add(id);
    }
    prev.current = current;
    if (added.size > 0) {
      setFresh(added);
      const t = window.setTimeout(() => setFresh(new Set()), ttlMs);
      return () => window.clearTimeout(t);
    }
    setFresh(new Set());
  }, [items, ttlMs]);

  return fresh;
}

export function isFreshItem(fresh: Set<string>, id: string): boolean {
  return fresh.has(id);
}
