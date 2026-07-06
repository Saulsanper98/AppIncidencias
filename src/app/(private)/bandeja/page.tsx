import { Suspense } from "react";

import { TicketsModule } from "@/components/tickets-module";
import { BandejaViewSkeleton } from "@/components/ui/view-skeletons";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

/**
 * /bandeja — Bandeja de tickets como pagina propia. *
 * Promovida desde "una columna mas dentro de /tickets" (junio 2026) a
 * entrada de primer nivel del sidebar. El centro de control usa esta
 * vista mas que ninguna otra: tenerla a 1 click reduce roce diario.
 *
 * Comparte el modulo `TicketsModule` con /tickets (ver el prop `view`):
 * en esta pagina cargamos solo el listado + filtros, sin el formulario
 * de "Nuevo ticket" ni la operativa secundaria (alertas y tareas
 * preventivas), que viven en /tickets.
 */
export default async function BandejaPage() {
  await requireActiveUser("/bandeja");
  return (    <Suspense fallback={<BandejaViewSkeleton />}>
      <TicketsModule view="bandeja" />
    </Suspense>
  );
}
