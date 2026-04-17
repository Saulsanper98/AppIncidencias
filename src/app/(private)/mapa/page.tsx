"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const MapaView = dynamic(
  () => import("@/components/mapa/mapa-view").then((m) => ({ default: m.MapaView })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <p className="text-sm text-[var(--color-text-2)]">Cargando mapa…</p>
      </div>
    ),
  },
);

export default function MapaPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <p className="text-sm text-[var(--color-text-2)]">Preparando vista…</p>
          </div>
        }
      >
        <MapaView />
      </Suspense>
    </div>
  );
}
