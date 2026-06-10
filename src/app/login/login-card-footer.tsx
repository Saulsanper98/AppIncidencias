"use client";

import { LifeBuoy, ScrollText } from "lucide-react";
import { useMemo } from "react";

import { loginCopy, type LoginLocale } from "@/app/login/login-i18n";
import { useLoginLocale } from "@/app/login/use-login-locale";
import pkg from "../../../package.json";

function envLabel(locale: LoginLocale): string {
  const t = loginCopy(locale);
  const v = process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "development";
  if (v === "production") return t.envProd;
  if (v === "preview") return t.envStaging;
  return t.envDev;
}

function envTone(): string {
  const v = process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "development";
  if (v === "production") return "text-[color-mix(in_oklab,var(--color-success)_64%,white)]";
  if (v === "preview") return "text-[color-mix(in_oklab,var(--color-warning)_70%,white)]";
  return "text-[color-mix(in_oklab,var(--color-accent)_68%,white)]";
}

export function LoginCardFooter() {
  const locale = useLoginLocale();
  const t = useMemo(() => loginCopy(locale), [locale]);
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? pkg.version;
  const legal = process.env.NEXT_PUBLIC_LEGAL_URL ?? null;
  const supportMail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const support = process.env.NEXT_PUBLIC_SUPPORT_URL ?? (supportMail ? `mailto:${supportMail}` : null);
  const statusLabel = locale === "en" ? "All systems operational" : "Sistema operativo";

  return (
    <footer className="mt-[var(--login-space-footer)] pt-6 text-center text-caption text-[color-mix(in_oklab,var(--color-text-2)_80%,white)]">
      <div className="login-divider-gradient mb-5" aria-hidden />
      {/* Pill de estado del servicio: refuerza la sensacion de "centro
       *  de control en vivo". Estatica por ahora; se puede enchufar a un
       *  endpoint /api/health en el futuro sin tocar el layout. */}
      <div className="flex justify-center">
        <span className="login-status-pill" aria-label={statusLabel}>
          <span className="login-status-pill-dot" aria-hidden />
          {statusLabel}
        </span>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-[color-mix(in_oklab,var(--color-text-2)_80%,white)]">
        <span className="font-medium text-[var(--color-text-1)]">{t.versionLabel}</span> {version}
        <span aria-hidden className="mx-2 text-[var(--color-text-3)]">
          ·
        </span>
        <span className="font-medium text-[var(--color-text-1)]">{t.envLabel}</span>{" "}
        <span className={envTone()}>{envLabel(locale)}</span>
      </p>
      <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {legal ? (
          <a
            href={legal}
            className="login-focusable inline-flex items-center gap-1.5 text-[color-mix(in_oklab,var(--color-text-2)_80%,white)] underline-offset-4 transition-colors hover:text-[var(--color-text-1)] hover:underline"
          >
            <ScrollText size={12} aria-hidden strokeWidth={1.8} />
            {t.legal}
          </a>
        ) : null}
        {support ? (
          <a
            href={support}
            className="login-focusable inline-flex items-center gap-1.5 text-[color-mix(in_oklab,var(--color-text-2)_80%,white)] underline-offset-4 transition-colors hover:text-[var(--color-text-1)] hover:underline"
          >
            <LifeBuoy size={12} aria-hidden strokeWidth={1.8} />
            {t.support}
          </a>
        ) : null}
      </nav>
    </footer>
  );
}
