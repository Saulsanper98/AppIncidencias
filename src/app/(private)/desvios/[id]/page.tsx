import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { DesvioDetalle } from "@/components/desvios/DesvioDetalle";
import { getDesvioById } from "@/lib/desvios/repo";
import { prisma } from "@/lib/prisma";
import {
  canDeleteDesvio,
  canManageDesvios,
  parseUserRole,
} from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DesvioDetallePage({ params }: Props) {
  const { id } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect(`/login?auth=required&next=/desvios/${id}`);
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    redirect(`/login?auth=required&next=/desvios/${id}`);
  }
  const role = parseUserRole(user.role);

  const desvio = await getDesvioById(id);
  if (!desvio) notFound();

  return (
    <div className="mx-auto max-w-[1300px]">
      <DesvioDetalle
        initial={desvio}
        canManage={canManageDesvios(role)}
        canDelete={canDeleteDesvio(role)}
      />
    </div>
  );
}
