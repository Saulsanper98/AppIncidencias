"use client";

import { Check, Link2, Printer } from "lucide-react";
import { useState } from "react";

type Props = {
  shareUrl?: string;
};

/**
 * Acciones rapidas para la cabecera del articulo:
 * - Copiar enlace permanente al portapapeles.
 * - Imprimir la pagina (window.print).
 *
 * Se mantienen compactas y discretas. Si mas adelante anadimos
 * "marcar util" persistente, se sumara aqui.
 */
export function ArticleActions({ shareUrl }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = shareUrl ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]"
        aria-label={"Copiar enlace al art\u00EDculo"}
      >
        {copied ? (
          <>
            <Check size={12} strokeWidth={1.7} aria-hidden className="text-[var(--color-success)]" />
            <span className="text-[var(--color-success)]">Copiado</span>
          </>
        ) : (
          <>
            <Link2 size={12} strokeWidth={1.7} aria-hidden />
            Copiar enlace
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)] print:hidden"
        aria-label={"Imprimir art\u00EDculo"}
      >
        <Printer size={12} strokeWidth={1.7} aria-hidden />
        Imprimir
      </button>
    </div>
  );
}
