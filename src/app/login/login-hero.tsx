"use client";

import { useMemo } from "react";

import { loginCopy } from "@/app/login/login-i18n";
import { useLoginLocale } from "@/app/login/use-login-locale";
import { CcmgcLogo } from "@/components/ccmgc-logo";

export function LoginHero() {
  const locale = useLoginLocale();
  const t = useMemo(() => loginCopy(locale), [locale]);
  const eyebrowLabel = locale === "en" ? "Operational" : "Operativo";

  return (
    <header className="mb-[var(--login-space-header)] pb-[var(--login-space-header)] text-center">
      {/* Eyebrow: chip con punto pulsante verde para reforzar sensacion
       *  de "centro de control en vivo". Pequeno pero da mucho caracter. */}
      <div className="mb-4 flex justify-center">
        <span className="login-eyebrow">
          <span className="login-eyebrow-dot" aria-hidden />
          {eyebrowLabel}
        </span>
      </div>

      <div className="relative mx-auto mb-5 inline-flex items-center justify-center">
        {/* Halo decorativo detras del logo: dos capas (azul + cyan) con
         *  breathing animation muy suave. */}
        <span aria-hidden className="login-logo-halo" />
        <CcmgcLogo
          align="center"
          className="h-[3.55rem] w-full max-w-[18.25rem] text-[color-mix(in_oklab,var(--color-text-1)_92%,white)] sm:h-[3.9rem] sm:max-w-[19.75rem]"
        />
      </div>
      <h1 className="login-hero-title text-balance">{t.heroTitle}</h1>
      <p className="login-hero-lead mx-auto mt-2 max-w-prose text-pretty text-[var(--color-text-2)]">{t.heroLead}</p>

      {/* Divider con degradado en lugar del border-bottom plano. */}
      <div className="login-divider-gradient mt-[var(--login-space-header)]" aria-hidden />
    </header>
  );
}
