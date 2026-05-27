import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DesviosTable } from "@/components/desvios/DesviosTable";
import { prisma } from "@/lib/prisma";
import { canDeleteDesvio, canManageDesvios, parseUserRole } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

/**
 * Listado principal de desvios. Renderiza la tabla (cliente) que carga los
 * datos via API y se suscribe al SSE para actualizar en vivo.
 *
 * El RBAC para crear/borrar se calcula aqui en el servidor a partir del rol
 * del usuario actual; el componente cliente solo decide la visibilidad de
 * los botones, no la autorizacion real (esa la aplica cada route handler).
 */
export const dynamic = "force-dynamic";

export default async function DesviosPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required&next=/desvios");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    redirect("/login?auth=required&next=/desvios");
  }
  const role = parseUserRole(user.role);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <DesviosTable
        canCreate={canManageDesvios(role)}
        canManage={canManageDesvios(role)}
        canDelete={canDeleteDesvio(role)}
      />
      <FooterHint role={role} />
    </div>
  );
}

function FooterHint({ role }: { role: ReturnType<typeof parseUserRole> }) {
  if (!canManageDesvios(role) && !canDeleteDesvio(role)) return null;
  return (
    <p className="px-1 text-[11px] text-[var(--color-text-3)]">
      Los desvios <strong>PENDIENTE</strong> aparecen destacados y pueden confirmarse desde la
      propia fila. Para acciones avanzadas (resolver, cancelar, editar) entra al detalle.
    </p>
  );
}
