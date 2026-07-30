import { Settings2 } from "lucide-react";
import { redirect } from "next/navigation";

import { AdminSubpageHero } from "@/components/admin/AdminSubpageHero";
import { OperacionAutomaticaPanel } from "@/components/admin/OperacionAutomaticaPanel";
import { canManageCatalog } from "@/lib/rbac";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function AdminOperacionPage() {
  const session = await requireActiveUser("/admin/operacion");
  if (!canManageCatalog(session.role)) {
    redirect("/admin");
  }

  return (
    <div className="space-y-5">
      <AdminSubpageHero
        tone="operacion"
        icon={Settings2}
        title="Operación automática"
        subtitle="Reglas de asignación y umbrales de escalado para el centro de control."
      />
      <OperacionAutomaticaPanel />
    </div>
  );
}
