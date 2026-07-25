import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BusDetailView } from "@/components/flota/BusDetailView";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BusDetailPage({
  params,
}: {
  params: Promise<{ busId: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) redirect("/login?auth=required");

  const { busId } = await params;

  return (
    <BusDetailView
      busId={decodeURIComponent(busId)}
      canEditDetail
      canManageCatalog={canManageCatalog(user.role)}
    />
  );
}
