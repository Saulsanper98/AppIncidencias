"use client";

import { useEffect, useRef, useState } from "react";

/** Flash de borde en KPI cuando el valor cambia (SSE/refresh). Ola 4 #533. */
export function useKpiCardFlash(value: string | number | null | undefined): boolean {
  const prevRef = useRef<string | number | null | undefined>(undefined);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (value === undefined) return;
    const prev = prevRef.current;
    if (prev !== undefined && prev !== value) {
      setFlashing(true);
      const t = window.setTimeout(() => setFlashing(false), 550);
      prevRef.current = value;
      return () => window.clearTimeout(t);
    }
    prevRef.current = value;
  }, [value]);

  return flashing;
}
