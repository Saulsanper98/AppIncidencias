"use client";

import { useReducedMotion } from "framer-motion";

import { DURATION, motionTransition } from "@/lib/motion";
import type { Transition } from "framer-motion";

export function useReducedMotionFramer(defaultDuration: number = DURATION.normal): number {
  const reduce = useReducedMotion();
  return reduce ? 0 : defaultDuration;
}

export function useFramerTransition(defaultDuration: number = DURATION.normal): Transition {
  const reduce = useReducedMotion();
  return reduce ? { duration: 0 } : motionTransition(defaultDuration);
}
