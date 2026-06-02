import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ReadOnlyHero } from "@/components/read-only/ReadOnlyHero";
import { ReadOnlyTicketsViewer } from "@/components/read-only/ReadOnlyTicketsViewer";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

/**
 * Página /lectura — Visor de incidencias en SOLO LECTURA.
 *
 * Diseñada como "wallboard" del centro de control. La cuenta
 * `read@movilidadgc.org` (marcada con `isReadOnly`) solo puede ver esta
 * pantalla y `/account`. El resto de usuarios también pueden entrar a
 * mirar, pero ven el resto de la app con normalidad.
 *
 * Ver: src/lib/auth-context.ts (bloqueo de mutaciones para readOnly)
 *      src/app/(private)/layout.tsx (redirección de readOnly aquí)
 */
export default async function LecturaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, isActive: true },
  });
  if (!user || !user.isActive) redirect("/login?auth=required");

  return (
    <div className="space-y-4 sm:space-y-5">
      <ReadOnlyHero userName={user.name} />
      <ReadOnlyTicketsViewer />
    </div>
  );
}
