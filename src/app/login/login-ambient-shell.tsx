"use client";

import type { ReactNode } from "react";

import { LoginSkipLink } from "@/app/login/login-card-shell";
import { useLoginChrono } from "@/app/login/use-login-chrono";

/** Cáscara full-viewport del login: atmósfera + rejilla de etapa. */
export function LoginAmbientShell({ children }: { children: ReactNode }) {
  const chrono = useLoginChrono();
  return (
    <div
      data-login-chrono={chrono}
      data-login-page
      className="login-stage relative min-h-[100dvh] overflow-hidden bg-[var(--color-bg)]"
    >
      <LoginSkipLink />
      <div className="login-stage-ambient" aria-hidden>
        <div className="login-ambient-gradient-a absolute inset-0" />
        <div className="login-ambient-gradient-b absolute inset-0" />
        <div className="login-ambient-gradient-c absolute inset-0" />
        <div className="login-grain absolute inset-0" />
        <div className="login-ambient-vignette" />
      </div>
      <div className="login-stage-grid relative z-[1]">{children}</div>
    </div>
  );
}
