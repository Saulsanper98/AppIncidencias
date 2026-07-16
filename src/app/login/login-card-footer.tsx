"use client";

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

export function LoginCardFooter() {
  const locale = useLoginLocale();
  const t = useMemo(() => loginCopy(locale), [locale]);
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? pkg.version;
  const legal = process.env.NEXT_PUBLIC_LEGAL_URL ?? null;
  const supportMail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const support = process.env.NEXT_PUBLIC_SUPPORT_URL ?? (supportMail ? `mailto:${supportMail}` : null);

  return (
    <footer className="login-access-footer mt-8 text-[11px] leading-snug text-[var(--color-text-3)]">
      <p>
        v{version} · {envLabel(locale)}
        {legal || support ? (
          <>
            {" · "}
            {legal ? (
              <a href={legal} className="login-focusable hover:text-[var(--color-text-1)] hover:underline">
                {t.legal}
              </a>
            ) : null}
            {legal && support ? " · " : null}
            {support ? (
              <a href={support} className="login-focusable hover:text-[var(--color-text-1)] hover:underline">
                {t.support}
              </a>
            ) : null}
          </>
        ) : null}
      </p>
    </footer>
  );
}
