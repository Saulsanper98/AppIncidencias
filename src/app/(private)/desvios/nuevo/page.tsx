import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DesvioForm } from "@/components/desvios/DesvioForm";
import { prisma } from "@/lib/prisma";
import { canManageDesvios, parseUserRole } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NuevoDesvioPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required&next=/desvios/nuevo");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    redirect("/login?auth=required&next=/desvios/nuevo");
  }
  const role = parseUserRole(user.role);
  if (!canManageDesvios(role)) {
    // Conductor: no puede crear desvios. Lo devolvemos al listado.
    redirect("/desvios?error=forbidden");
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <DesvioForm mode="create" onCancelHref="/desvios" />
    </div>
  );
}
