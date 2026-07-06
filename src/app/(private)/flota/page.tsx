import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FlotaIndex } from "@/components/flota/FlotaIndex";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function FlotaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) redirect("/login?auth=required");

  return <FlotaIndex canManage={canManageCatalog(user.role)} />;
}
