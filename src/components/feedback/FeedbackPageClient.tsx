"use client";

/**
 * Cliente que orquesta la página /feedback en layout de DOS PANELES:
 *   ┌────────────────────────────┬───────────────────────────┐
 *   │  Formulario nuevo (izq)    │  Mis envíos (der)         │
 *   │  - Wizard 2 pasos          │  - Lista con estado       │
 *   │  - Tipo, urgencia, rating  │  - Respuestas del admin   │
 *   └────────────────────────────┴───────────────────────────┘
 *
 * Cuando el form envía con éxito, dispara un refreshKey++ que recarga
 * el listado de Mis envíos sin tocar el form.
 *
 * En mobile (< lg), los paneles se apilan: form arriba, mis envíos abajo.
 */

import { Inbox } from "lucide-react";
import { useState } from "react";

import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { MyFeedbackList } from "@/components/feedback/MyFeedbackList";

export function FeedbackPageClient() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* Panel izquierdo: formulario */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <FeedbackForm onSuccess={() => setRefreshKey((k) => k + 1)} />
      </section>

      {/* Panel derecho: mis envíos */}
      <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
        <header className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
              <Inbox size={13} strokeWidth={1.7} className="text-[var(--color-text-3)]" />
            </div>
            <h2 className="text-[13.5px] font-semibold text-[var(--color-text-1)]">
              Mis envíos
            </h2>
          </div>
          <span className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-3)]">
            Últimos 30
          </span>
        </header>

        <p className="mb-3 text-[11px] text-[var(--color-text-3)]">
          Aquí ves el estado de cada feedback que has enviado. Si el equipo deja una
          respuesta, aparece dentro del envío.
        </p>

        <MyFeedbackList refreshKey={refreshKey} />
      </aside>
    </div>
  );
}
