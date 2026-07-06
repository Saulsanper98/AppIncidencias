"use client";

import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode } from "react";

import { loginCopy } from "@/app/login/login-i18n";
import { useLoginLocale } from "@/app/login/use-login-locale";

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

export function LoginCardMotion({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="login-card-motion-root"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.48,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
