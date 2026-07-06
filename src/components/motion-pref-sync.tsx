"use client";

import { useEffect } from "react";

import { syncReduceMotionDom } from "@/lib/motion-pref";

/** Sincroniza preferencia reduce-motion al montar el layout. */
export function MotionPrefSync() {
  useEffect(() => {
    syncReduceMotionDom();
  }, []);
  return null;
}
