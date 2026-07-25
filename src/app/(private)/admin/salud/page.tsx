import { Activity } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            Administración
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-[var(--color-text-1)]">
            <Activity size={20} strokeWidth={1.6} aria-hidden />
            Salud del sistema
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-3)]">
            Poller de desvíos, scheduler, variables de entorno y espacio en disco.
          </p>
        </div>
        <Link href="/admin" className="text-xs text-[var(--color-accent)] hover:underline">
          ← Volver al panel
        </Link>
      </header>
      <OperationsHealthPanel />
    </div>
  );
}
