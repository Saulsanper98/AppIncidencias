"use client";

import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { list, subscribe } from "@/lib/offline-ticket-queue";

export default function OfflinePage() {
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    setQueueCount(list().length);
    const unsub = subscribe(() => setQueueCount(list().length));
    return () => unsub();
  }, []);

  return (
    <div className="offline-page-enter flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-gradient-to-br from-[var(--color-bg)] via-[var(--color-surface)] to-[color-mix(in_oklab,var(--hero-accent-offline)_14%,transparent)] px-6 text-center">
      <div className="ccmgc-stagger-in ccmgc-stagger-in-1 flex flex-col items-center gap-4">
        <SectionEyebrow pulse dotColor="var(--hero-accent-offline)">
          Sin conexión
        </SectionEyebrow>
        <span
          className="offline-indicator-pulse flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--hero-accent-offline)_18%,transparent)] text-[var(--hero-accent-offline)] ring-1 ring-[color-mix(in_oklab,var(--hero-accent-offline)_35%,transparent)]"
          aria-hidden
        >
          <WifiOff size={26} strokeWidth={1.6} />
        </span>
        <h1 className="dashboard-hero-title text-xl">Estás offline</h1>
        <p className="max-w-md text-sm leading-relaxed text-[var(--color-text-2)]">
          No hay red disponible. Comprueba la conexión y vuelve a intentarlo.
        </p>
        {queueCount > 0 ? (
          <p className="rounded-lg border border-[var(--color-warning)]/35 bg-[var(--color-warning-light)] px-3 py-2 text-xs text-[var(--color-warning)]">
            Hay {queueCount} ticket{queueCount === 1 ? "" : "s"} pendiente{queueCount === 1 ? "" : "s"} en cola local.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-medium text-[var(--color-text-1)] transition-colors hover:bg-[var(--color-surface-3)]"
        >
          Reintentar conexión
        </button>
        <Link href="/dashboard" className="ccmgc-primary-cta inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white">
          Ir al panel
        </Link>
      </div>
    </div>
  );
}
