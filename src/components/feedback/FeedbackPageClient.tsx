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

import { Inbox, MessageSquarePlus } from "lucide-react";
import { useState } from "react";

import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { MyFeedbackList } from "@/components/feedback/MyFeedbackList";

export function FeedbackPageClient() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* Panel izquierdo: formulario */}
      <section className="account-section">
        <header className="account-section-head">
          <span
            className="account-section-icon"
            style={{ ["--section-tone" as string]: "var(--color-accent)" }}
            aria-hidden
          >
            <MessageSquarePlus size={18} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <p className="account-section-pretitle">
              <span
                className="account-section-pretitle-dot"
                style={{ ["--section-tone" as string]: "var(--color-accent)" }}
                aria-hidden
              />
              Formulario
            </p>
            <h2 className="account-section-title">Nuevo feedback</h2>
          </div>
        </header>
        <FeedbackForm onSuccess={() => setRefreshKey((k) => k + 1)} />
      </section>

      {/* Panel derecho: mis envíos */}
      <aside className="account-section">
        <header className="account-section-head">
          <span
            className="account-section-icon"
            style={{ ["--section-tone" as string]: "var(--color-success)" }}
            aria-hidden
          >
            <Inbox size={18} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="account-section-pretitle">
              <span
                className="account-section-pretitle-dot"
                style={{ ["--section-tone" as string]: "var(--color-success)" }}
                aria-hidden
              />
              Historial
            </p>
            <h2 className="account-section-title">Mis envíos</h2>
          </div>
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-3)]">
            Últimos 30
          </span>
        </header>

        <p className="-mt-2 mb-3 text-[11.5px] text-[var(--color-text-3)]">
          Aquí ves el estado de cada feedback que has enviado. Si el equipo deja una
          respuesta, aparece dentro del envío.
        </p>

        <MyFeedbackList refreshKey={refreshKey} />
      </aside>
    </div>
  );
}
