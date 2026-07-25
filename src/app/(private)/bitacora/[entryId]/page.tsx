import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { BitacoraDetailView } from "@/components/bitacora/BitacoraDetailView";
import { serializeBitacoraEntry } from "@/lib/bitacora-shared";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BitacoraEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect(`/login?auth=required&next=/bitacora/${entryId}`);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  if (!user?.isActive) redirect(`/login?auth=required&next=/bitacora/${entryId}`);

  const row = await prisma.bitacoraEntry.findUnique({ where: { id: entryId } });
  if (!row) notFound();

  const entry = serializeBitacoraEntry(row);
  return <BitacoraDetailView entry={entry} />;
}
