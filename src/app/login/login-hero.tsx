"use client";

import { useMemo } from "react";

import { loginCopy } from "@/app/login/login-i18n";
import { useLoginLocale } from "@/app/login/use-login-locale";
import { CcmgcLogo } from "@/components/ccmgc-logo";

/** Cabecera compacta del login, alineada con los heroes del resto de la app. */
export function LoginHero() {
  const locale = useLoginLocale();
  const t = useMemo(() => loginCopy(locale), [locale]);

  return (
    <header className="mb-4 flex items-center gap-3 border-b border-[var(--color-border)] pb-3">
      <CcmgcLogo className="h-7 w-[5.75rem] shrink-0 text-[var(--color-text-1)]" align="start" />
      <div className="min-w-0 flex-1 border-l border-[var(--color-border)] pl-3">
        <div className="ccmgc-eyebrow dashboard-pretitle">
          <span
            className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse"
            aria-hidden
          />
          CCMGC · Operación
        </div>
        <h1 className="mt-0.5 text-[17px] font-semibold leading-tight tracking-tight text-[var(--color-text-1)]">
          {t.heroTitle}
        </h1>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-text-3)]">{t.heroLead}</p>
      </div>
    </header>
  );
}
