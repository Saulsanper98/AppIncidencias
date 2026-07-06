import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  Boxes,
  ChevronRight,
  Inbox,
  Megaphone,
  MessageSquareHeart,
  Signal,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserCircle2,
  Users,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { KpiPill } from "@/components/ui/kpi-pill";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { activeAnnouncementWhere } from "@/lib/announcements";
import { prisma } from "@/lib/prisma";
import {
  canManageCatalog,
  canManageKnowledge,
  canManageUsers,
  canPublishAnnouncements,
  canReviewFeedback,
} from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

type SectionTone = "users" | "catalog" | "feedback" | "kb" | "novedades" | "analytics";

const TONE_STYLES: Record<
  SectionTone,
  { ring: string; iconBg: string; iconText: string; accentBar: string; glow: string }
> = {
  users: {
    ring: "hover:border-violet-400/35",
    iconBg: "bg-violet-500/12",
    iconText: "text-violet-300",
    accentBar: "bg-violet-400/70",
    glow: "from-violet-500/10",
  },
  catalog: {
    ring: "hover:border-emerald-400/35",
    iconBg: "bg-emerald-500/12",
    iconText: "text-emerald-300",
    accentBar: "bg-emerald-400/70",
    glow: "from-emerald-500/10",
  },
  feedback: {
    ring: "hover:border-amber-400/35",
    iconBg: "bg-amber-500/12",
    iconText: "text-amber-300",
    accentBar: "bg-amber-400/70",
    glow: "from-amber-500/10",
  },
  kb: {
    ring: "hover:border-sky-400/35",
    iconBg: "bg-sky-500/12",
    iconText: "text-sky-300",
    accentBar: "bg-sky-400/70",
    glow: "from-sky-500/10",
  },
  novedades: {
    ring: "hover:border-rose-400/35",
    iconBg: "bg-rose-500/12",
    iconText: "text-rose-300",
    accentBar: "bg-rose-400/70",
    glow: "from-rose-500/10",
  },
  analytics: {
    ring: "hover:border-cyan-400/35",
    iconBg: "bg-cyan-500/12",
    iconText: "text-cyan-300",
    accentBar: "bg-cyan-400/70",
    glow: "from-cyan-500/10",
  },
};

export default async function AdminHomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, name: true },
  });
  if (!user || !user.isActive) {
    redirect("/login?auth=required");
  }

  const showUsers = canManageUsers(user.role);
  const showCatalog = canManageCatalog(user.role);
  const showFeedback = canReviewFeedback(user.role);
  const showKb = canManageKnowledge(user.role);
  const showAnnouncements = canPublishAnnouncements(user.role);
  // Analytics está reservado al mismo permiso que gestionar usuarios (gestores).
  const showAnalytics = canManageUsers(user.role);

  if (!showUsers && !showCatalog && !showFeedback && !showKb && !showAnnouncements && !showAnalytics) {
    redirect("/dashboard");
  }

  // KPIs en vivo (en paralelo para no bloquear)
  const [
    totalUsers,
    activeUsers,
    gestoresActivos,
    totalBuses,
    operadorasRows,
    busesSinLineas,
    feedbackPendiente,
    feedbackUltimos7,
    kbPublicados,
    kbBorradores,
    kbViewsAgg,
    avisosActivos,
    novedadesPublicadas,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, role: { in: ["gestor_centro_control"] } } }),
    prisma.bus.count(),
    prisma.bus.groupBy({ by: ["operator"], _count: { _all: true } }),
    prisma.bus.count({ where: { lineas: "" } }),
    prisma.userFeedback.count({ where: { status: "pendiente" } }),
    prisma.userFeedback.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.kbArticle.count({ where: { status: "publicado" } }),
    prisma.kbArticle.count({ where: { status: "borrador" } }),
    prisma.kbArticle.aggregate({ _sum: { views: true } }),
    prisma.announcement.count({ where: { ...activeAnnouncementWhere(), kind: "aviso" } }),
    prisma.announcement.count({ where: { status: "publicado", kind: "novedad" } }),
  ]);

  // Telemetría: dos contadores rápidos para la card de Analytics. Usamos raw
  // query para tolerar arranques recién migrados donde el cliente Prisma
  // pueda no tener el modelo todavía. Si la tabla no existe, capturamos y
  // devolvemos 0 silenciosamente.
  let uxEventsLast24h = 0;
  let uxSessionsLast24h = 0;
  let clientErrors24h = 0;
  if (showAnalytics) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [rows, errRows] = await Promise.all([
      prisma.$queryRawUnsafe<
        { events: bigint; sessions: bigint }[]
      >(
        `SELECT COUNT(*) AS events, COUNT(DISTINCT sessionId) AS sessions
           FROM "UxEvent" WHERE createdAt >= ?`,
        since,
      ),
      prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n
           FROM "UxEvent"
          WHERE eventName = 'client_error' AND createdAt >= ?`,
        since,
      ),
      ]);
      uxEventsLast24h = Number(rows[0]?.events ?? 0);
      uxSessionsLast24h = Number(rows[0]?.sessions ?? 0);
      clientErrors24h = Number(errRows[0]?.n ?? 0);
    } catch {
      /* tabla aún no migrada o sin datos */
    }
  }

  const inactiveUsers = totalUsers - activeUsers;
  const operadorasCount = operadorasRows.length;
  const kbViews = kbViewsAgg._sum.views ?? 0;

  const fmtNow = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Atlantic/Canary",
  });

  return (
    <div className="space-y-5">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[color-mix(in_oklab,var(--hero-accent-admin)_12%,transparent)] p-4 shadow-sm sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--hero-accent-admin)]/15 blur-3xl"
        />
        {/* En movil apilamos vertical (col): titulo arriba, KPIs debajo.
            En tablet+ volvemos al layout horizontal con flex-wrap. Esto
            evita que los KPIs colapsen el ancho del titulo a 0 y rompan
            el texto palabra-por-palabra. */}
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/20">
              <ShieldCheck size={18} strokeWidth={1.7} className="text-[var(--color-accent)]" aria-hidden />
            </div>
            <div className="min-w-0">
              <SectionEyebrow pulse dotColor="var(--hero-accent-admin)">
                Administración
              </SectionEyebrow>
              <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]">
                Administración
              </h1>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                Gestión de usuarios, catálogo de flota, feedback del equipo y base de conocimiento.
                {user.name ? (
                  <>
                    {" "}
                    Conectado como{" "}
                    <span className="text-[var(--color-text-2)]">{user.name}</span>.
                  </>
                ) : null}
              </p>
              <p className="mt-1 text-[10.5px] text-[var(--color-text-3)]">
                {fmtNow.format(new Date())} {"\u00B7"} hora del Centro
              </p>
            </div>
          </div>

          {/* KPIs globales en vivo */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <KpiPill
              layout="stacked"
              icon={<Users size={11} strokeWidth={1.7} aria-hidden />}
              label="Activos"
              value={activeUsers}
              hint={inactiveUsers > 0 ? `${inactiveUsers} inactivos` : "0 inactivos"}
            />
            <KpiPill
              layout="stacked"
              icon={<Boxes size={11} strokeWidth={1.7} aria-hidden />}
              label="Buses"
              value={totalBuses}
              hint={`${operadorasCount} operadora${operadorasCount === 1 ? "" : "s"}`}
            />
            <KpiPill
              layout="stacked"
              icon={<Inbox size={11} strokeWidth={1.7} aria-hidden />}
              label="Pendientes"
              value={feedbackPendiente}
              hint={`${feedbackUltimos7} en 7d`}
              tone={feedbackPendiente > 0 ? "warning" : "neutral"}
            />
            <KpiPill
              layout="stacked"
              icon={<BookOpenCheck size={11} strokeWidth={1.7} aria-hidden />}
              label="Artículos"
              value={kbPublicados}
              hint={`${kbViews} lecturas`}
            />
          </div>
        </div>
      </header>

      <section className="grid gap-2 sm:grid-cols-2">
        <Link
          href="/admin/analytics"
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 hover:border-cyan-400/40"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Salud · errores cliente
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-2)]">
                Revisa errores de frontend agrupados y su tendencia.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-200">
              <TriangleAlert size={12} aria-hidden />
              {clientErrors24h} / 24h
            </span>
          </div>
        </Link>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Salud · cola offline
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-2)]">
                Si hay pendientes offline, el indicador aparecerá en la esquina inferior.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-200">
              <Signal size={12} aria-hidden />
              Indicador activo
            </span>
          </div>
        </div>
      </section>

      {/* ── CARDS DE SECCIÓN ─────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {showUsers ? (
          <SectionCard
            href="/admin/users"
            tone="users"
            icon={<UserCircle2 size={20} strokeWidth={1.6} aria-hidden />}
            title="Usuarios"
            description="Alta, edición, roles y estado de cuentas del equipo."
            stats={[
              { label: "Activos", value: activeUsers, accent: true },
              { label: "Inactivos", value: inactiveUsers },
              { label: "Gestores", value: gestoresActivos },
            ]}
          />
        ) : null}
        {showCatalog ? (
          <SectionCard
            href="/admin/catalog"
            tone="catalog"
            icon={<Boxes size={20} strokeWidth={1.6} aria-hidden />}
            title="Catálogo de flota"
            description="Buses, operadoras, líneas y municipio de cada activo."
            stats={[
              { label: "Buses", value: totalBuses, accent: true },
              { label: "Operadoras", value: operadorasCount },
              ...(busesSinLineas > 0
                ? [{ label: "Sin líneas", value: busesSinLineas, warn: true }]
                : []),
            ]}
          />
        ) : null}
        {showFeedback ? (
          <SectionCard
            href="/admin/feedback"
            tone="feedback"
            icon={<MessageSquareHeart size={20} strokeWidth={1.6} aria-hidden />}
            title="Feedback"
            description="Ideas, errores y mejoras propuestas por el equipo."
            stats={[
              {
                label: "Pendientes",
                value: feedbackPendiente,
                accent: true,
                warn: feedbackPendiente > 0,
              },
              { label: "Últimos 7 días", value: feedbackUltimos7 },
            ]}
          />
        ) : null}
        {showKb ? (
          <SectionCard
            href="/admin/kb"
            tone="kb"
            icon={<BookOpenCheck size={20} strokeWidth={1.6} aria-hidden />}
            title="Base de conocimiento"
            description="Manuales operativos, FAQs y casos resueltos para el equipo."
            stats={[
              { label: "Publicados", value: kbPublicados, accent: true },
              { label: "Borradores", value: kbBorradores },
              { label: "Lecturas", value: kbViews },
            ]}
          />
        ) : null}
        {showAnnouncements ? (
          <SectionCard
            href="/novedades"
            tone="novedades"
            icon={<Megaphone size={20} strokeWidth={1.6} aria-hidden />}
            title="Gestionar avisos"
            description="Publica avisos operativos y novedades de producto para el equipo."
            stats={[
              { label: "Avisos activos", value: avisosActivos, accent: true, warn: avisosActivos > 0 },
              { label: "Novedades", value: novedadesPublicadas },
            ]}
          />
        ) : null}
        {showAnalytics ? (
          <SectionCard
            href="/admin/analytics"
            tone="analytics"
            icon={<BarChart3 size={20} strokeWidth={1.6} aria-hidden />}
            title="Analítica de uso"
            description="Tiempos de creación, secciones más usadas, ranking, errores y actividad por turno."
            stats={[
              { label: "Eventos 24h", value: uxEventsLast24h, accent: true },
              { label: "Sesiones 24h", value: uxSessionsLast24h },
            ]}
          />
        ) : null}
      </div>

      {/* ── PIE INFORMATIVO ──────────────────────────────────────────────── */}
      <footer className="flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--color-text-3)]">
        <Sparkles size={11} strokeWidth={1.6} aria-hidden />
        <span>
          Las cifras se calculan en cada visita. Si necesitas estadísticas más profundas,
          revisa el módulo <Link href="/dashboard" className="text-[var(--color-accent)] hover:underline">Dashboard</Link>.
        </span>
      </footer>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

function SectionCard({
  href,
  tone,
  icon,
  title,
  description,
  stats,
}: {
  href: string;
  tone: SectionTone;
  icon: React.ReactNode;
  title: string;
  description: string;
  stats: Array<{ label: string; value: number; accent?: boolean; warn?: boolean }>;
}) {
  const t = TONE_STYLES[tone];
  return (
    <Link
      href={href}
      className={`group admin-hub-card-glow relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition-all duration-200 ${t.ring} hover:-translate-y-0.5 hover:shadow-md hover:shadow-[color-mix(in_oklab,var(--hero-accent-admin)_8%,transparent)]`}
    >
      {/* Acento lateral */}
      <span aria-hidden className={`absolute inset-y-3 left-0 w-0.5 rounded-r ${t.accentBar}`} />
      {/* Glow esquina */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl opacity-50 transition-[opacity,transform] duration-300 group-hover:scale-110 group-hover:opacity-100`}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText}`}>
            {icon}
          </div>
          <ArrowUpRight
            size={15}
            strokeWidth={1.6}
            className="shrink-0 text-[var(--color-text-3)] opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
            aria-hidden
          />
        </div>
        <h2 className="mt-3 text-[15px] font-semibold text-[var(--color-text-1)] group-hover:text-[var(--color-text-1)]">
          {title}
        </h2>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-text-3)]">{description}</p>

        {/* Stats inline */}
        <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--color-border)] pt-2.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1">
              <dt className="text-[9.5px] uppercase tracking-wide text-[var(--color-text-3)]">{s.label}</dt>
              <dd
                className={`num-tabular text-[13px] font-semibold ${
                  s.warn
                    ? "text-[var(--color-warning)]"
                    : s.accent
                      ? "text-[var(--color-text-1)]"
                      : "text-[var(--color-text-2)]"
                }`}
              >
                {s.value}
              </dd>
            </div>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--color-text-3)] transition-colors group-hover:text-[var(--color-text-1)]">
            Abrir <ChevronRight size={11} strokeWidth={1.7} aria-hidden />
          </span>
        </dl>
      </div>
    </Link>
  );
}
