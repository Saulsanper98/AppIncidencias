"use client";

import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode } from "react";

import { loginCopy } from "@/app/login/login-i18n";
import { useLoginLocale } from "@/app/login/use-login-locale";

const LOGIN_EASE = [0.22, 1, 0.36, 1] as const;

export function LoginSkipLink() {
  const locale = useLoginLocale();
  const t = loginCopy(locale);
  return (
    <a
      href="#login-main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[var(--color-surface)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--color-text-1)] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
    >
      {t.skipToContent}
    </a>
  );
}

/** Entrada del plano de marca (antes que el form). */
export function LoginBrandMotion({ children }: { children: ReactNode }) {
  // Fail-closed: null (SSR/hydration) = sin motion hasta conocer preferencia.
  const reduce = useReducedMotion() ?? true;
  return (
    <motion.div
      className="login-brand-motion-root"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.36,
        ease: LOGIN_EASE,
      }}
    >
      {children}
    </motion.div>
  );
}

/** Entrada del plano de acceso (ligeramente retardada respecto al brand). */
export function LoginCardMotion({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion() ?? true;
  return (
    <motion.div
      className="login-card-motion-root"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.4,
        delay: reduce ? 0 : 0.12,
        ease: LOGIN_EASE,
      }}
    >
      {children}
    </motion.div>
  );
}
