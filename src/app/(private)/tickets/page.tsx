import { Suspense } from "react";

import { TicketsModule } from "@/components/tickets-module";
import { TicketsManageViewSkeleton } from "@/components/ui/view-skeletons";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

/**
 * /tickets — Gestión de tickets. *
 * Apunte express como flujo principal de alta; formulario completo en
 * desplegable. Operativa preventiva y auditoría debajo.
 */
export default async function TicketsPage() {
  await requireActiveUser("/tickets");
  return (
    <Suspense fallback={<TicketsManageViewSkeleton />}>
      <TicketsModule view="manage" />
    </Suspense>
  );
}
