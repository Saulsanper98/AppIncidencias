import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BitacoraComposeView } from "@/components/bitacora/BitacoraComposeView";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BitacoraNuevaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required&next=/bitacora/nueva");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  if (!user?.isActive) redirect("/login?auth=required&next=/bitacora/nueva");

  return <BitacoraComposeView />;
}
