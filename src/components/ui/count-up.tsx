"use client";

import { useEffect, useRef, useState } from "react";

import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

type CountUpProps = {
  value: number;
  durationMs?: number;
  className?: string;
  /** Colorea verde/rojo según sube o baja (w24 #182). */
  showDeltaColor?: boolean;
};

/** Animación numérica corta solo en cliente (p11/p8 KPIs). */
export function CountUp({ value, durationMs = 320, className, showDeltaColor = false }: CountUpProps) {
  const mounted = useMounted();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const [delta, setDelta] = useState<"up" | "down" | "none">("none");

  useEffect(() => {
    if (!mounted) return;
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) return;
    if (showDeltaColor) {
      setDelta(to > from ? "up" : "down");
      const t = window.setTimeout(() => setDelta("none"), 800);
      const start = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        const eased = 1 - (1 - Math.min(1, (now - start) / durationMs)) ** 3;
        setDisplay(Math.round(from + (to - from) * eased));
        if ((now - start) / durationMs < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(t);
      };
    }

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, mounted, showDeltaColor]);

  return (
    <span
      className={cn(
        "num-tabular transition-colors duration-300",
        showDeltaColor && delta === "up" && "kpi-delta-flash-up text-[var(--color-success)]",
        showDeltaColor && delta === "down" && "kpi-delta-flash-down text-[var(--color-error)]",
        className,
      )}
      suppressHydrationWarning
    >
      {mounted ? display : value}
    </span>
  );
}
