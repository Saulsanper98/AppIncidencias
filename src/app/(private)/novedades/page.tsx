import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { NovedadesPanel } from "@/components/novedades/NovedadesPanel";
import { prisma } from "@/lib/prisma";
import { canPublishAnnouncements } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NovedadesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required&next=/novedades");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, email: true },
  });
  if (!user || !user.isActive) {
    redirect("/login?auth=required&next=/novedades");
  }

  const canEdit = canPublishAnnouncements(user.role);
  // Generador automático de changelog desde `git log`: reservado al
  // propietario de la app por su email exacto (no es un permiso de rol).
  const canAutoDraft = user.email.toLowerCase() === "saul@movilidadgc.org";
  return <NovedadesPanel canEdit={canEdit} canAutoDraft={canAutoDraft} />;
}
