"use client";

import {
  ChevronRight,
  LayoutDashboard,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ChartTypeIcon } from "@/components/dashboard-builder/chart-type-icon";
import { SectionTabs } from "@/components/ui/section-tabs";
import "./dashboard-builder.css";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiPill } from "@/components/ui/kpi-pill";
import { DashboardViewSkeleton } from "@/components/ui/view-skeletons";
import type { SessionUser, UserRole } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboard/templates";
import {
  getWidgetChipKey,
  getWidgetChipLabel,
} from "@/lib/dashboard/widget-data-helpers";

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
  const router = useRouter();
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

  const handleCreateFromTemplate = async (templateId: string) => {
    if (creating) return;
    try {
      setCreating(true);
      setError(null);
      const response = await fetch("/api/dashboards/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const payload = (await response.json()) as { message?: string; dashboard?: { id: string } };
      if (!response.ok || !payload.dashboard?.id) {
        throw new Error(payload.message ?? "No se pudo crear el panel desde plantilla");
      }
      router.push(`/dashboards/${payload.dashboard.id}`);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "No se pudo crear desde plantilla");
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
        <DashboardViewSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionTabs preset="dashboard" />
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[color-mix(in_oklab,var(--hero-accent-admin)_10%,transparent)] p-4 shadow-sm sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--hero-accent-admin)]/15 blur-3xl"
        />
        {/* Movil: titulo + KPIs apilados; tablet+: layout horizontal. */}
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--hero-accent-admin)_12%,transparent)] text-[color-mix(in_oklab,var(--hero-accent-admin)_75%,white)] ring-1 ring-[color-mix(in_oklab,var(--hero-accent-admin)_28%,transparent)]">
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
                Cuadros personalizados
              </h1>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                Paneles con KPIs operativos, tendencias de tickets, SLA y vistas embebidas. Marca uno como principal para
                que se abra al pulsar &quot;Dashboard&quot;.
              </p>
            </div>
          </div>

          {/* KPIs en vivo */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <KpiPill
              layout="stacked"
              icon={<LayoutDashboard size={11} strokeWidth={1.7} aria-hidden />}
              label="Paneles"
              value={kpis.totalDashboards}
            />
            <KpiPill
              layout="stacked"
              icon={<ChartTypeIcon type="bar" size={11} strokeWidth={1.9} />}
              label="Widgets"
              value={kpis.totalWidgets}
              hint={kpis.totalDashboards > 0 ? `${kpis.avg} por panel` : undefined}
            />
            <KpiPill
              layout="stacked"
              icon={<Star size={11} strokeWidth={1.7} aria-hidden />}
              label="Tu inicio"
              textValue={kpis.preferredName ?? "Estándar"}
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

      {isManager ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--color-accent)]" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-1)]">Plantillas listas para usar</h2>
                <p className="text-[11px] text-[var(--color-text-3)]">
                  Un clic y tienes un panel completo con layout optimizado. También puedes crear uno vacío en{" "}
                  <strong className="font-medium text-[var(--color-text-2)]">Tus paneles</strong> y añadir widgets en
                  modo <strong className="font-medium text-[var(--color-text-2)]">Editar</strong>.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {DASHBOARD_TEMPLATES.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  type="button"
                  disabled={creating}
                  onClick={() => void handleCreateFromTemplate(template.id)}
                  className="dashboard-template-card group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-left shadow-sm hover:border-[color-mix(in_oklab,var(--color-border)_60%,var(--color-accent)_40%)] disabled:opacity-60"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-60 transition-opacity group-hover:opacity-100"
                    style={{ background: `color-mix(in oklab, ${template.accentColor} 25%, transparent)` }}
                  />
                  <div
                    className="relative mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
                    style={{ color: template.accentColor }}
                  >
                    <Icon size={18} strokeWidth={1.7} aria-hidden />
                  </div>
                  <p className="relative font-medium text-[var(--color-text-1)]">{template.name}</p>
                  <p className="relative mt-1 line-clamp-2 text-[12px] leading-snug text-[var(--color-text-3)]">
                    {template.description}
                  </p>
                  <p className="relative mt-3 text-[11px] font-medium" style={{ color: template.accentColor }}>
                    {template.widgets.length} widgets · Crear ahora
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3 border-b border-[var(--color-border)]/70 pb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--hero-accent-admin)_12%,transparent)] text-[color-mix(in_oklab,var(--hero-accent-admin)_75%,white)]">
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

          {dashboards.length === 0 ? (
            <EmptyDashboardListState isManager embedded />
          ) : (
            <>
              <div className="mb-4 mt-4 flex items-center gap-2">
                <LayoutDashboard size={15} className="text-[var(--color-text-3)]" aria-hidden />
                <h2 className="text-sm font-semibold text-[var(--color-text-1)]">Tus paneles</h2>
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-text-3)]">
                  {dashboards.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {dashboards.map((dashboard, idx) => (
                  <DashboardCard
                    key={dashboard.id}
                    dashboard={dashboard}
                    staggerIndex={(idx % 6) + 1}
                    isPreferred={preferredDashboardId === dashboard.id}
                    isManager={isManager}
                    onTogglePreferred={() =>
                      void patchPreferredDashboard(preferredDashboardId === dashboard.id ? null : dashboard.id)
                    }
                    onDelete={() => void handleDelete(dashboard.id, dashboard.name)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      ) : dashboards.length === 0 ? (
        <EmptyDashboardListState isManager={false} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dashboards.map((dashboard, idx) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              staggerIndex={(idx % 6) + 1}
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
  staggerIndex,
  isPreferred,
  isManager,
  onTogglePreferred,
  onDelete,
}: {
  dashboard: DashboardListItem;
  staggerIndex: number;
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
    const counts = new Map<string, { count: number; dataSource?: string }>();
    for (const w of dashboard.widgets) {
      const key = getWidgetChipKey(w);
      const prev = counts.get(key);
      counts.set(key, {
        count: (prev?.count ?? 0) + 1,
        dataSource: prev?.dataSource ?? w.dataSource,
      });
    }
    return Array.from(counts.entries())
      .map(([key, meta]) => ({ key, ...meta }))
      .sort((a, b) => b.count - a.count);
  }, [dashboard.widgets]);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-[var(--color-surface)] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md kpi-card-glow",
        `ccmgc-stagger-in ccmgc-stagger-in-${staggerIndex}`,
        isPreferred
          ? "border-[var(--color-accent)]/45 ring-1 ring-[var(--color-accent)]/20"
          : "border-[var(--color-border)] hover:border-[color-mix(in_oklab,var(--hero-accent-admin)_35%,var(--color-border))]",
      )}
    >
      {/* Accent lateral */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-3 left-0 w-0.5 rounded-r",
          isPreferred ? "bg-[var(--color-accent)]" : "bg-[var(--hero-accent-admin)]/60",
        )}
      />
      {/* Glow esquina */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl opacity-50 transition-opacity duration-300 group-hover:opacity-90",
          isPreferred ? "bg-[var(--color-accent)]/20" : "bg-[var(--hero-accent-admin)]/12",
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
            <div className="flex flex-wrap items-center gap-1.5">
              {typeCounts.slice(0, 5).map(({ key, count, dataSource }) => (
                <span
                  key={key}
                  className="dashboard-widget-type-chip inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[10.5px] font-medium text-[var(--color-text-2)]"
                  title={`${count} × ${getWidgetChipLabel(key, dataSource)}`}
                >
                  <ChartTypeIcon type={key} size={12} strokeWidth={1.9} className="text-[var(--color-text-3)]" />
                  <span className="num-tabular text-[var(--color-text-1)]">{count}</span>
                  <span className="max-w-[7rem] truncate text-[var(--color-text-3)]">
                    {getWidgetChipLabel(key, dataSource)}
                  </span>
                </span>
              ))}
              {typeCounts.length > 5 ? (
                <span className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[10.5px] text-[var(--color-text-3)]">
                  +{typeCounts.length - 5}
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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[var(--color-text-3)] opacity-70 transition-all hover:border-[var(--color-error)]/30 hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)] focus:opacity-100 md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100"
          >
            <Trash2 size={13} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyDashboardListState({ isManager, embedded = false }: { isManager: boolean; embedded?: boolean }) {
  return (
    <EmptyState
      icon={LayoutDashboard}
      title="Sin dashboards todavía"
      hint={
        isManager
          ? "Escribe un nombre arriba y pulsa Crear panel."
          : "El gestor aún no ha publicado paneles personalizados."
      }
      className={cn(
        embedded
          ? "mt-4 border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/50"
          : "border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]",
      )}
    />
  );
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
