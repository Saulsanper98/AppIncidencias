import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminUsersManager } from "@/components/admin-users-manager";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/rbac";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export default async function AdminUsersPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!userId) {
    redirect("/login?auth=required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive || !canManageUsers(user.role)) {
    redirect("/login?auth=required");
  }

  return (
    <Suspense
      fallback={<div className="h-[28rem] animate-pulse rounded-2xl bg-[var(--color-surface-2)]" aria-busy />}
    >
      <AdminUsersManager />
    </Suspense>
  );
}
