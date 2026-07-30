"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getBrushAnimationProps,
  getChartAnimationProps,
  getStaggeredAnimationProps,
  getTooltipAnimationProps,
} from "@/lib/dashboard/chart-theme";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function readReducedMotionPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Respeta `prefers-reduced-motion` para animaciones Recharts. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotionPreference);

  useEffect(() => {
    setReduced(readReducedMotionPreference());
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Props de animación Recharts (activas o desactivadas según accesibilidad). */
export function useChartAnimationProps() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return useMemo(
    () => getChartAnimationProps(prefersReducedMotion),
    [prefersReducedMotion],
  );
}

/** Retorna props con retardo escalonado por índice de serie (60 ms × index). */
export function useStaggeredChartAnimation() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return useCallback(
    (seriesIndex: number) => getStaggeredAnimationProps(prefersReducedMotion, seriesIndex),
    [prefersReducedMotion],
  );
}

/** Animación del brush (entrada retardada tras la serie principal). */
export function useBrushAnimationProps() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return useMemo(() => getBrushAnimationProps(prefersReducedMotion), [prefersReducedMotion]);
}

/** Animación suave del tooltip Recharts (posición/opacidad). */
export function useTooltipAnimationProps() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return useMemo(() => getTooltipAnimationProps(prefersReducedMotion), [prefersReducedMotion]);
}
