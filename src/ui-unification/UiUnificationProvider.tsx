"use client";

import { useEffect } from "react";

import { isUiUnificationEnabled } from "@/ui-unification/feature";

import "@/ui-unification/unification.css";

export function UiUnificationProvider({ children }: { children: React.ReactNode }) {
  const enabled = isUiUnificationEnabled();

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.dataset.uiUnification = "1";
    return () => {
      delete document.documentElement.dataset.uiUnification;
    };
  }, [enabled]);

  return <>{children}</>;
}
