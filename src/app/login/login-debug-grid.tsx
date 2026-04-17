"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Overlay de retícula baseline (4px) para auditoría visual.
 * Activa con `?login_debug=grid` o `NEXT_PUBLIC_LOGIN_DEBUG_GRID=1`.
 */
export function LoginDebugGrid() {
  const searchParams = useSearchParams();
  const byQuery = searchParams.get("login_debug") === "grid";
  const byEnv = process.env.NEXT_PUBLIC_LOGIN_DEBUG_GRID === "1";
  const show = byQuery || byEnv;

  useEffect(() => {
    if (!show) return;
    document.documentElement.setAttribute("data-login-debug-grid", "1");
    return () => {
      document.documentElement.removeAttribute("data-login-debug-grid");
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="login-baseline-grid pointer-events-none fixed inset-0 z-[100]"
      role="img"
      aria-label="Retícula de baseline (depuración visual)"
    />
  );
}
