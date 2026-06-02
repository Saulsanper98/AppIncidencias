import {
  CheckCircle2,
  Lightbulb,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Vote,
} from "lucide-react";
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
 *
 * El hero hace un primer fetch en servidor para mostrar 3 micro-stats
 * dentro del propio título (votos hoy, propuestas activas, % entregado)
 * que dan sensación de "panel vivo" sin esperar al client-fetch.
 */
export default async function SugerenciasPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, name: true },
  });
  if (!user || !user.isActive) redirect("/login?auth=required");

  // Pequeñas estadísticas para el hero. Las dejamos en SQL crudo para
  // no acoplar el hero al schema concreto del módulo de sugerencias —
  // si renombran tablas el hero degrada con ceros sin romper la página.
  const hero = await loadHeroStats();

  return (
    <div className="space-y-5">
      {/* ───── HERO ───── */}
      <header
        className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] px-6 py-6 sm:px-8 sm:py-7"
        style={{
          background:
            "radial-gradient(ellipse at 10% 0%, rgba(139,92,246,0.28) 0%, transparent 55%), radial-gradient(ellipse at 95% 100%, rgba(244,114,182,0.18) 0%, transparent 55%), linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)",
        }}
      >
        {/* Patrón de puntos */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        {/* Aurora sutil */}
        <div
          className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(168,85,247,0.55) 0%, transparent 70%)",
          }}
        />

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/30">
                <Vote size={26} className="text-white" strokeWidth={2.4} />
                <span className="absolute -right-1 -top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-fuchsia-500" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-1)] sm:text-3xl">
                    Sugerencias del equipo
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-widest text-violet-300 ring-1 ring-inset ring-violet-500/30">
                    <Sparkles size={9} />
                    Comunidad
                  </span>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm text-[var(--color-text-2)]">
                  Ideas y mejoras propuestas por compañeros. Vota las que más te
                  ayudarían en el día a día: las más votadas suben en la lista de
                  prioridades del equipo de desarrollo.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-3)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Votación abierta
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <ThumbsUp size={11} className="text-violet-300" />
                    1 voto por persona y propuesta
                  </span>
                  <span>·</span>
                  <span>Anónimo en el ranking</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mini stats inline */}
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            <HeroPill
              label="Votos hoy"
              value={hero.votesToday}
              tone="violet"
              Icon={ThumbsUp}
            />
            <HeroPill
              label="Activas"
              value={hero.activeProposals}
              tone="amber"
              Icon={Lightbulb}
            />
            <HeroPill
              label="Entregado"
              value={`${hero.deliveredPct}%`}
              tone="emerald"
              Icon={CheckCircle2}
            />
          </div>
        </div>
      </header>

      <SugerenciasBoard currentUserId={user.id} currentUserName={user.name ?? null} />
    </div>
  );
}

function HeroPill({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string | number;
  tone: "violet" | "amber" | "emerald";
  Icon: typeof Vote;
}) {
  const cls = {
    violet:
      "from-violet-500/20 via-violet-500/5 to-transparent ring-violet-500/25 text-violet-200",
    amber:
      "from-amber-500/20 via-amber-500/5 to-transparent ring-amber-500/25 text-amber-200",
    emerald:
      "from-emerald-500/20 via-emerald-500/5 to-transparent ring-emerald-500/25 text-emerald-200",
  }[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-gradient-to-br px-3 py-2 ring-1 ring-inset ${cls}`}
    >
      <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-widest opacity-90">
        <Icon size={11} strokeWidth={2.4} />
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[18px] font-bold tabular-nums text-[var(--color-text-1)]">
        {value}
      </div>
    </div>
  );
}

type HeroStats = {
  votesToday: number;
  activeProposals: number;
  deliveredPct: number;
};

async function loadHeroStats(): Promise<HeroStats> {
  try {
    const [votesToday, totals, delivered] = await Promise.all([
      prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM "FeedbackVote" WHERE createdAt >= datetime('now','start of day')`,
      ),
      prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM "UserFeedback"
         WHERE type IN ('idea','mejora') AND status NOT IN ('implementado','descartado')`,
      ),
      prisma.$queryRawUnsafe<{ done: bigint; total: bigint }[]>(
        `SELECT
           SUM(CASE WHEN status = 'implementado' THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN status NOT IN ('descartado') THEN 1 ELSE 0 END) AS total
         FROM "UserFeedback"
         WHERE type IN ('idea','mejora')`,
      ),
    ]);
    const done = Number(delivered[0]?.done ?? 0);
    const total = Number(delivered[0]?.total ?? 0);
    return {
      votesToday: Number(votesToday[0]?.n ?? 0),
      activeProposals: Number(totals[0]?.n ?? 0),
      deliveredPct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  } catch (e) {
    return { votesToday: 0, activeProposals: 0, deliveredPct: 0 };
  }
}
