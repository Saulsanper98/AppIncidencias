"use client";

import { useEffect } from "react";

import { CcmgcLogo } from "@/components/ccmgc-logo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CCMGC error boundary:", error);
  }, [error]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-bg)] px-4 py-12 text-center">
      <CcmgcLogo className="h-12 w-auto opacity-90" />
      <div>
        <p className="text-eyebrow text-[var(--color-error)]">Error 500</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[var(--color-text-1)]">Algo no funciono</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--color-text-3)]">
          Se ha producido un error inesperado. Se ha registrado el incidente; puedes intentarlo de nuevo o volver al
          dashboard.
        </p>
        {error.digest ? (
          <p className="mt-3 num-tabular text-[11px] text-[var(--color-text-3)]/70">ID: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
        >
          Reintentar
        </button>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]"
        >
          Ir al dashboard
        </a>
      </div>
    </div>
  );
}
