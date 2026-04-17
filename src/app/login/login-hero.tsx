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
      <CcmgcLogo
        align="center"
        className="mb-5 h-[3.55rem] w-full max-w-[18.25rem] text-[color-mix(in_oklab,var(--color-text-1)_92%,white)] sm:h-[3.9rem] sm:max-w-[19.75rem]"
      />
      <h1 className="login-hero-title text-balance">{t.heroTitle}</h1>
      <p className="login-hero-lead mx-auto mt-2 max-w-prose text-pretty text-[var(--color-text-2)]">{t.heroLead}</p>
    </header>
  );
}
