"use client";

import type { ReactNode } from "react";

import { LoginSkipLink } from "@/app/login/login-card-shell";
import { useLoginChrono } from "@/app/login/use-login-chrono";

export function LoginAmbientShell({ children }: { children: ReactNode }) {
  const chrono = useLoginChrono();
  return (
    <div
      data-login-chrono={chrono}
      data-login-page
      className="relative min-h-screen overflow-hidden bg-[var(--color-bg)]"
    >
      <LoginSkipLink />
      <div className="login-ambient-gradient-a pointer-events-none absolute inset-0" />
      <div className="login-ambient-gradient-b pointer-events-none absolute inset-0" />
      <div className="login-ambient-gradient-c pointer-events-none absolute inset-0" />
      <div className="login-ambient-gradient-d pointer-events-none absolute inset-0" />
      <div className="login-grain pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="ccmgc-login-pattern pointer-events-none absolute inset-0 opacity-[0.06] motion-reduce:opacity-[0.04]"
        aria-hidden
      />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:py-12">{children}</div>
    </div>
  );
}
