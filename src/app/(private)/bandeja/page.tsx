import { Suspense } from "react";

import { TicketsModule } from "@/components/tickets-module";

/**
 * /bandeja — Bandeja de tickets como pagina propia.
 *
 * Promovida desde "una columna mas dentro de /tickets" (junio 2026) a
 * entrada de primer nivel del sidebar. El centro de control usa esta
 * vista mas que ninguna otra: tenerla a 1 click reduce roce diario.
 *
 * Comparte el modulo `TicketsModule` con /tickets (ver el prop `view`):
 * en esta pagina cargamos solo el listado + filtros, sin el formulario
 * de "Nuevo ticket" ni la operativa secundaria (alertas y tareas
 * preventivas), que viven en /tickets.
 */
export default function BandejaPage() {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl bg-white/5" />}>
      <TicketsModule view="bandeja" />
    </Suspense>
  );
}
