"use client";

import { useMemo } from "react";

import { loginCopy } from "@/app/login/login-i18n";
import { useLoginLocale } from "@/app/login/use-login-locale";
import { CcmgcLogo } from "@/components/ccmgc-logo";

export function LoginHero() {
  const locale = useLoginLocale();
  const t = useMemo(() => loginCopy(locale), [locale]);

  return (
    <header className="mb-[var(--login-space-header)] border-b border-[var(--color-border)] pb-[var(--login-space-header)] text-center">
      <div className="relative mx-auto mb-5 inline-flex items-center justify-center">
        {/* Halo decorativo detrás del logo: degradado suave y blur sutil */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-accent)_38%,transparent),transparent_70%)] blur-2xl motion-safe:animate-pulse"
          style={{ animationDuration: "5.5s" }}
        />
        <CcmgcLogo
          align="center"
          className="h-[3.55rem] w-full max-w-[18.25rem] text-[color-mix(in_oklab,var(--color-text-1)_92%,white)] sm:h-[3.9rem] sm:max-w-[19.75rem]"
        />
      </div>
      <h1 className="login-hero-title text-balance">{t.heroTitle}</h1>
      <p className="login-hero-lead mx-auto mt-2 max-w-prose text-pretty text-[var(--color-text-2)]">{t.heroLead}</p>
    </header>
  );
}
