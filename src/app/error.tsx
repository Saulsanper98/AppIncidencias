"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { CcmgcLogo } from "@/components/ccmgc-logo";
import { Button } from "@/components/ui/button";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";

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
    <div className="ccmgc-page-enter flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-bg)] px-4 py-12 text-center">
      <div className="ccmgc-stagger-in ccmgc-stagger-in-1">
        <CcmgcLogo className="mx-auto h-12 w-auto opacity-90" />
      </div>
      <div className="ccmgc-stagger-in ccmgc-stagger-in-2 ccmgc-shake max-w-md space-y-3">
        <SectionEyebrow pulse dotColor="var(--color-error)">
          Error inesperado
        </SectionEyebrow>
        <h1 className="dashboard-hero-title flex items-center justify-center gap-2 text-[28px]">
          <AlertTriangle size={24} className="text-[var(--color-error)]" aria-hidden />
          Algo no funcionó
        </h1>
        <p className="text-sm text-[var(--color-text-3)]">
          Se ha producido un error inesperado. Puedes intentarlo de nuevo o volver al dashboard.
        </p>
        {error.digest ? (
          <p className="num-tabular text-[11px] text-[var(--color-text-3)]/70">ID: {error.digest}</p>
        ) : null}
      </div>
      <div className="ccmgc-stagger-in ccmgc-stagger-in-3 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="primary" onClick={reset}>
          Reintentar
        </Button>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]"
        >
          Ir al dashboard
        </a>
      </div>
    </div>
  );
}
