import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { KbAdminPanel } from "@/components/kb/KbAdminPanel";
import { prisma } from "@/lib/prisma";
import { canManageKnowledge } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminKbPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user?.isActive || !canManageKnowledge(user.role)) {
    redirect("/dashboard");
  }

  return <KbAdminPanel />;
}
