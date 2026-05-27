import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CatalogAdminPanel } from "@/components/catalog-admin-panel";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export default async function AdminCatalogPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive || !canManageCatalog(user.role)) {
    redirect("/dashboard");
  }

  return <CatalogAdminPanel />;
}
