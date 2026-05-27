"use client";

import {
  Activity,
  BarChart3,
  ChevronRight,
  Gauge,
  Layers,
  LayoutDashboard,
  LineChart,
  Plus,
  PieChart,
  Sparkles,
  Star,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SectionTabs } from "@/components/ui/section-tabs";
import type { SessionUser, UserRole } from "@/lib/domain";
import { cn } from "@/lib/utils";

type DashboardWidgetLite = {
  id: string;
  title?: string;
  chartType?: string;
  dataSource?: string;
};

type DashboardListItem = {
  id: string;
  name: string;
  createdAt: string;
  createdByUserId: string | null;
  widgets: DashboardWidgetLite[];
};

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("conductor");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [preferredDashboardId, setPreferredDashboardId] = useState<string | null>(null);
  const [prefMessage, setPrefMessage] = useState<string | null>(null);

  const fetchDashboards = async () => {
    const response = await fetch("/api/dashboards", { cache: "no-store" });
    const payload = (await response.json()) as { dashboards?: DashboardListItem[]; message?: string };
    if (!response.ok) {
      throw new Error(payload.message ?? "No se pudieron cargar los dashboards");
    }
    setDashboards(payload.dashboards ?? []);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const sessionData = (await sessionResponse.json()) as { authenticated: boolean; user?: SessionUser };
        if (sessionData.authenticated && sessionData.user) {
          setRole(sessionData.user.role);
          setPreferredDashboardId(sessionData.user.preferredDashboardId ?? null);
        }

        await fetchDashboards();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los dashboards");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  // Auto-clear de prefMessage
  useEffect(() => {
    if (!prefMessage) return;
    const handle = window.setTimeout(() => setPrefMessage(null), 4000);
    return () => window.clearTimeout(handle);
  }, [prefMessage]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (name.length < 3 || creating) return;
    try {
      setCreating(true);
      setError(null);
      const response = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo crear el dashboard");
      }
      setNewName("");
      await fetchDashboards();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo crear el dashboard");
    } finally {
      setCreating(false);
    }
  };

  const patchPreferredDashboard = async (id: string | null) => {
    try {
      setPrefMessage(null);
      const response = await fetch("/api/auth/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferredDashboardId: id }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo guardar la preferencia");
      }
      setPreferredDashboardId(id);
      setPrefMessage(
        id ? "Este panel se abrirá al ir a Dashboard." : "Se mostrará de nuevo el panel operativo estándar.",
      );
    } catch (prefError) {
      setPrefMessage(prefError instanceof Error ? prefError.message : "No se pudo guardar la preferencia");
    }
  };

  const handleDelete = async (dashboardId: string, name: string) => {
    if (!confirm(`\u00BFEliminar el dashboard "${name}"? Se perderán todos sus widgets.`)) return;
    try {
      setError(null);
      const response = await fetch(`/api/dashboards/${dashboardId}`, { method: "DELETE" });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo borrar el dashboard");
      }
      await fetchDashboards();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo borrar el dashboard");
    }
  };

  // ── KPIs en vivo ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalDashboards = dashboards.length;
    const totalWidgets = dashboards.reduce((acc, d) => acc + d.widgets.length, 0);
    const avg = totalDashboards === 0 ? 0 : Math.round((totalWidgets / totalDashboards) * 10) / 10;
    const preferredName = preferredDashboardId
      ? dashboards.find((d) => d.id === preferredDashboardId)?.name ?? null
      : null;
    return { totalDashboards, totalWidgets, avg, preferredName };
  }, [dashboards, preferredDashboardId]);

  const isManager = role === "gestor_centro_control";

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionTabs preset="dashboard" />
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-fuchsia-500/[0.08] p-5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-fuchsia-500/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/12 text-fuchsia-300 ring-1 ring-fuchsia-500/25">
              <LayoutDashboard size={18} strokeWidth={1.7} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-semibold text-[var(--color-text-3)]">
                  CCMGC
                </span>
                Paneles personalizados
              </div>
              <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]">
                Custom Dashboards
              </h1>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                Crea paneles personalizados para operación y análisis. Marca uno como principal para que se abra al
                pulsar &quot;Dashboard&quot;.
              </p>
            </div>
          </div>

          {/* KPIs en vivo */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <Kpi
              icon={<Layers size={11} strokeWidth={1.7} aria-hidden />}
              label="Paneles"
              value={kpis.totalDashboards}
            />
            <Kpi
              icon={<BarChart3 size={11} strokeWidth={1.7} aria-hidden />}
              label="Widgets"
              value={kpis.totalWidgets}
              hint={kpis.totalDashboards > 0 ? `${kpis.avg} por panel` : undefined}
            />
            <Kpi
              icon={<Star size={11} strokeWidth={1.7} aria-hidden />}
              label="Tu inicio"
              hintBig={kpis.preferredName ?? "Estándar"}
              tone={kpis.preferredName ? "accent" : "neutral"}
            />
          </div>
        </div>
      </header>

      {/* ── Banner panel principal ───────────────────────────────────────── */}
      {preferredDashboardId && kpis.preferredName ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/40 px-3 py-2 text-[12.5px] text-[var(--color-text-2)]">
          <Star size={13} className="text-[var(--color-accent)]" fill="currentColor" aria-hidden />
          <span>
            <span className="font-medium text-[var(--color-text-1)]">{kpis.preferredName}</span> es tu panel de inicio.
          </span>
          <button
            type="button"
            onClick={() => void patchPreferredDashboard(null)}
            className="ml-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-1)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            Restaurar panel estándar
          </button>
        </div>
      ) : null}

      {/* Aviso preferencia */}
      {prefMessage ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-text-2)]"
        >
          <Sparkles size={12} className="mt-0.5 text-[var(--color-accent)]" aria-hidden />
          <span className="flex-1">{prefMessage}</span>
          <button
            type="button"
            onClick={() => setPrefMessage(null)}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
            aria-label="Cerrar"
          >
            <X size={11} aria-hidden />
          </button>
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      {/* ── CREAR DASHBOARD ──────────────────────────────────────────────── */}
      {isManager ? (
        <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <span aria-hidden className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-fuchsia-400/70" />
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/12 text-fuchsia-300">
              <Plus size={16} strokeWidth={1.8} aria-hidden />
            </div>
            <div className="min-w-[240px] flex-1">
              <label className="block text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
                Nuevo panel
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
                placeholder="Ej. KPIs Centro de Control"
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[13px] text-[var(--color-text-1)] outline-none placeholder:text-[var(--color-text-3)] focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                aria-label="Nombre del dashboard"
              />
            </div>
            <button
              onClick={() => void handleCreate()}
              disabled={creating || newName.trim().length < 3}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} aria-hidden />
              {creating ? "Creando…" : "Crear panel"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ── LISTADO ──────────────────────────────────────────────────────── */}
      {dashboards.length === 0 ? (
        <EmptyState isManager={isManager} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dashboards.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              isPreferred={preferredDashboardId === dashboard.id}
              isManager={isManager}
              onTogglePreferred={() =>
                void patchPreferredDashboard(preferredDashboardId === dashboard.id ? null : dashboard.id)
              }
              onDelete={() => void handleDelete(dashboard.id, dashboard.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

function DashboardCard({
  dashboard,
  isPreferred,
  isManager,
  onTogglePreferred,
  onDelete,
}: {
  dashboard: DashboardListItem;
  isPreferred: boolean;
  isManager: boolean;
  onTogglePreferred: () => void;
  onDelete: () => void;
}) {
  const widgetCount = dashboard.widgets.length;
  const created = new Date(dashboard.createdAt);
  const relative = formatRelativeShort(created);

  // Resumen por tipo de widget
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of dashboard.widgets) {
      const key = (w.chartType ?? "otro").toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [dashboard.widgets]);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-[var(--color-surface)] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        isPreferred
          ? "border-[var(--color-accent)]/45 ring-1 ring-[var(--color-accent)]/20"
          : "border-[var(--color-border)] hover:border-fuchsia-400/35",
      )}
    >
      {/* Accent lateral */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-3 left-0 w-0.5 rounded-r",
          isPreferred ? "bg-[var(--color-accent)]" : "bg-fuchsia-400/60",
        )}
      />
      {/* Glow esquina */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl opacity-50 transition-opacity duration-300 group-hover:opacity-90",
          isPreferred ? "bg-[var(--color-accent)]/20" : "bg-fuchsia-500/12",
        )}
      />

      <Link
        href={`/dashboards/${dashboard.id}`}
        prefetch={false}
        className="relative block p-5 pr-16"
      >
        <div className="flex items-start gap-2">
          <h3 className="flex-1 truncate text-[15px] font-semibold text-[var(--color-text-1)]" title={dashboard.name}>
            {dashboard.name}
          </h3>
          {isPreferred ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
              <Star size={9} fill="currentColor" aria-hidden /> Inicio
            </span>
          ) : null}
        </div>

        {/* Mini-preview: chips por tipo de widget */}
        <div className="mt-3 min-h-[1.75rem]">
          {widgetCount === 0 ? (
            <p className="text-[11.5px] italic text-[var(--color-text-3)]">Panel vacío {"\u2014"} sin widgets aún.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {typeCounts.slice(0, 4).map(([type, count]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-text-2)]"
                  title={`${count} \u00D7 ${type}`}
                >
                  <WidgetIcon type={type} />
                  <span className="num-tabular">{count}</span>
                  <span className="capitalize text-[var(--color-text-3)]">{prettyType(type)}</span>
                </span>
              ))}
              {typeCounts.length > 4 ? (
                <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-3)]">
                  +{typeCounts.length - 4}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)]/70 pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-[var(--color-text-3)]">
            <span>
              Creado <span title={created.toLocaleString("es-ES", { timeZone: "Atlantic/Canary" })}>{relative}</span>
            </span>
            <span aria-hidden>{"\u00B7"}</span>
            <span className="num-tabular">
              {widgetCount} {widgetCount === 1 ? "widget" : "widgets"}
            </span>
          </div>
          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--color-text-3)] transition-colors group-hover:text-[var(--color-accent)]">
            Abrir <ChevronRight size={11} strokeWidth={1.7} aria-hidden />
          </span>
        </div>
      </Link>

      {/* Acciones flotantes */}
      <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1">
        <button
          type="button"
          title={isPreferred ? "Es tu panel principal" : "Marcar como panel principal"}
          aria-label={isPreferred ? "Quitar de panel principal" : "Marcar como panel principal"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePreferred();
          }}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md border transition-all",
            isPreferred
              ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
              : "border-transparent text-[var(--color-text-3)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)]",
          )}
        >
          <Star size={13} className={isPreferred ? "fill-current" : undefined} aria-hidden />
        </button>
        {isManager ? (
          <button
            type="button"
            title="Eliminar panel"
            aria-label="Eliminar panel"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[var(--color-text-3)] opacity-0 transition-all hover:border-[var(--color-error)]/30 hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)] group-hover:opacity-100"
          >
            <Trash2 size={13} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ isManager }: { isManager: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/8 blur-3xl"
      />
      <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/12 text-fuchsia-300 ring-1 ring-fuchsia-500/20">
        <LayoutDashboard size={26} strokeWidth={1.5} aria-hidden />
      </div>
      <p className="relative mt-3 text-[15px] font-semibold text-[var(--color-text-1)]">Sin dashboards todavía</p>
      <p className="relative mt-1 text-[12.5px] text-[var(--color-text-3)]">
        {isManager
          ? "Crea el primero usando el formulario de arriba."
          : "El gestor aún no ha publicado paneles personalizados."}
      </p>
    </div>
  );
}

type KpiTone = "neutral" | "accent" | "warning";

function Kpi({
  icon,
  label,
  value,
  hint,
  hintBig,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  hint?: string;
  hintBig?: string;
  tone?: KpiTone;
}) {
  const toneCls =
    tone === "accent"
      ? "ring-[var(--color-accent)]/25 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
      : tone === "warning"
        ? "ring-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : "ring-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]";
  return (
    <div className={`flex min-w-[8.5rem] flex-col rounded-lg px-2.5 py-1.5 ring-1 ${toneCls}`}>
      <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        {value !== undefined ? (
          <span className="num-tabular text-[16px] font-semibold leading-tight text-[var(--color-text-1)]">{value}</span>
        ) : hintBig ? (
          <span className="truncate text-[12.5px] font-semibold leading-tight text-[var(--color-text-1)]" title={hintBig}>
            {hintBig}
          </span>
        ) : null}
        {hint ? (
          <span className="truncate text-[10px] opacity-70" title={hint}>
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WidgetIcon({ type }: { type: string }) {
  const props = { size: 10, strokeWidth: 1.8, "aria-hidden": true } as const;
  switch (type) {
    case "line":
    case "area":
      return <LineChart {...props} />;
    case "pie":
    case "donut":
      return <PieChart {...props} />;
    case "table":
    case "list":
      return <Table2 {...props} />;
    case "kpi":
    case "metric":
    case "number":
      return <Gauge {...props} />;
    case "bar":
    case "column":
      return <BarChart3 {...props} />;
    default:
      return <Activity {...props} />;
  }
}

function prettyType(type: string): string {
  const map: Record<string, string> = {
    line: "líneas",
    area: "área",
    bar: "barras",
    column: "barras",
    pie: "tarta",
    donut: "donut",
    table: "tabla",
    list: "lista",
    kpi: "KPI",
    metric: "métrica",
    number: "número",
  };
  return map[type] ?? type;
}

function formatRelativeShort(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `hace ${diffD} d`;
  // Más viejo: fecha corta
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", timeZone: "Atlantic/Canary" });
}
