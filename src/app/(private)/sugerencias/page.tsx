import { Vote } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SugerenciasBoard } from "@/components/feedback/SugerenciasBoard";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

/**
 * Página /sugerencias — Board público de votación.
 *
 * Es el tablón comunitario donde todo el equipo puede ver las ideas y
 * mejoras propuestas por sus compañeros y darles un upvote para que el
 * equipo de desarrollo sepa qué priorizar.
 *
 * No mostramos los reportes de tipo "error": los errores no se votan,
 * se arreglan. Tampoco las propuestas descartadas: ya pasaron de moda.
 */
export default async function SugerenciasPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) redirect("/login?auth=required");

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5"
        style={{
          background:
            "radial-gradient(ellipse at 15% 30%, rgba(139,92,246,0.10) 0%, transparent 55%), radial-gradient(ellipse at 90% 70%, rgba(37,99,235,0.08) 0%, transparent 50%), var(--color-surface)",
        }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-inset ring-violet-500/30">
            <Vote size={22} className="text-violet-300" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-[var(--color-text-1)]">Sugerencias del equipo</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-[var(--color-text-2)]">
              Ideas y mejoras propuestas por compañeros. Dale al pulgar a las que más te
              ayudarían en el día a día: las más votadas suben primero en la lista de
              prioridades del equipo de desarrollo.
            </p>
          </div>
        </div>
      </div>

      <SugerenciasBoard currentUserId={user.id} />
    </div>
  );
}
