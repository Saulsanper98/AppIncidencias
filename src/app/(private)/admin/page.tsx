import { Boxes, UserCircle2 } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { canManageCatalog, canManageUsers } from "@/lib/rbac";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export default async function AdminHomePage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!userId) {
    redirect("/login?auth=required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    redirect("/login?auth=required");
  }

  const showUsers = canManageUsers(user.role);
  const showCatalog = canManageCatalog(user.role);

  if (!showUsers && !showCatalog) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-subheading">Administración</h1>
        <p className="mt-1 text-sm text-[var(--color-text-3)]">Accesos restringidos según tu rol.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {showUsers ? (
          <Link
            href="/admin/users"
            className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-border-hover)]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)]">
              <UserCircle2 size={22} />
            </div>
            <div>
              <p className="font-medium text-[var(--color-text-1)]">Usuarios</p>
              <p className="text-caption text-[var(--color-text-3)]">Alta, roles y estado de cuentas</p>
            </div>
          </Link>
        ) : null}
        {showCatalog ? (
          <Link
            href="/admin/catalog"
            className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-border-hover)]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)]">
              <Boxes size={22} />
            </div>
            <div>
              <p className="font-medium text-[var(--color-text-1)]">Catálogo</p>
              <p className="text-caption text-[var(--color-text-3)]">Buses y activos del catálogo operativo</p>
            </div>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
