import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AnalyticsBoard } from "@/components/admin/AnalyticsBoard";
import { prisma } from "@/lib/prisma";
import { canManageUsers, parseUserRole } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

/**
 * Página /admin/analytics — Cuadro de mando de uso de la app.
 *
 * Solo accesible para gestores del centro de control. Combina datos de la
 * tabla `UxEvent` (telemetría del cliente) con datos operativos (tickets,
 * usuarios) para responder preguntas como:
 *   - ¿Cuánto tarda cada usuario en crear un ticket?
 *   - ¿Qué secciones se usan más?
 *   - ¿Cuándo se trabaja más (turno M/T/N)?
 *   - ¿Quién está creando/resolviendo más tickets?
 *   - ¿Hay errores cliente frecuentes?
 */
export default async function AnalyticsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, role: true },
  });
  if (!user || !user.isActive) redirect("/login?auth=required");
  if (!canManageUsers(parseUserRole(user.role))) {
    redirect("/dashboard?denied=analytics");
  }

  return (
    <div className="space-y-5">
      <AnalyticsBoard />
    </div>
  );
}
