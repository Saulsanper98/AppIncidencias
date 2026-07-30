import { Activity } from "lucide-react";
import { redirect } from "next/navigation";

import { AdminSubpageHero } from "@/components/admin/AdminSubpageHero";
import { OperationsHealthPanel } from "@/components/admin/OperationsHealthPanel";
import { canManageCatalog } from "@/lib/rbac";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function AdminSaludPage() {
  const session = await requireActiveUser("/admin/salud");
  if (!canManageCatalog(session.role)) {
    redirect("/admin");
  }

  return (
    <div className="space-y-5">
      <AdminSubpageHero
        tone="salud"
        icon={Activity}
        title="Salud del sistema"
        subtitle="Poller de desvíos, scheduler, variables de entorno y espacio en disco."
      />
      <OperationsHealthPanel />
    </div>
  );
}
