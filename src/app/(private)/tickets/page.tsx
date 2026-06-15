import { Suspense } from "react";

import { TicketsModule } from "@/components/tickets-module";
import { SectionTabs } from "@/components/ui/section-tabs";

/**
 * /tickets — "Gestion y mantenimiento" de tickets.
 *
 * Tras sacar la bandeja a /bandeja (junio 2026, como entrada propia del
 * sidebar), esta pagina concentra:
 *   - Formulario "Nuevo ticket"
 *   - Alertas preventivas
 *   - Tareas preventivas
 *   - Auditoria reciente (solo gestor)
 *
 * Las pestanas internas siguen para ir al "Pase de turno" (/handover).
 * Ya no listamos "Bandeja" como pestana: vive en /bandeja con su propia
 * entrada de sidebar.
 */
export default function TicketsPage() {
  return (
    <>
      <SectionTabs preset="tickets" />
      <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl bg-white/5" />}>
        <TicketsModule view="manage" />
      </Suspense>
    </>
  );
}
