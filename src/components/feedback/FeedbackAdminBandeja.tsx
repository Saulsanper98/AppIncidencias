"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Download,
  FileText,
  Lightbulb,
  MapPin,
  Search,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MenuSelect, type MenuSelectOption } from "@/components/ui/menu-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Textarea } from "@/components/ui/input";
import { KpiPill } from "@/components/ui/kpi-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { hapticLight } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { FeedbackCategory, FeedbackStatus, FeedbackType, FeedbackUrgency, UserFeedback } from "@/lib/domain";

type StatsEntry = { type: string; status: string; _count: { id: number } };
type ApiResponse = {
  items: UserFeedback[];
  total: number;
  page: number;
  pages: number;
  stats: StatsEntry[];
  avgRating: number | null;
};

// ─── Meta ──────────────────────────────────────────────────────────────────────

const TYPE_META: Record<FeedbackType, {
  label: string; icon: React.ElementType;
  badge: "warning" | "error" | "success";
  borderColor: string;
}> = {
  idea:   { label: "Idea",   icon: Lightbulb,   badge: "warning", borderColor: "var(--color-warning)" },
  error:  { label: "Error",  icon: AlertCircle, badge: "error",   borderColor: "var(--color-error)" },
  mejora: { label: "Mejora", icon: TrendingUp,  badge: "success", borderColor: "var(--color-success)" },
};

const STATUS_META: Record<FeedbackStatus, { label: string; badge: "neutral" | "warning" | "info" | "success" }> = {
  pendiente:    { label: "Pendiente",    badge: "neutral" },
  en_revision:  { label: "En revisión", badge: "warning" },
  planificado:  { label: "Planificado", badge: "info" },
  implementado: { label: "Implementado", badge: "success" },
  descartado:   { label: "Descartado",  badge: "neutral" },
};

const _URGENCY_META: Record<FeedbackUrgency, { label: string; color: string; dot: string }> = {
  baja:  { label: "Baja",  color: "text-[var(--color-success)]", dot: "bg-[var(--color-success)]" },
  media: { label: "Media", color: "text-[var(--color-warning)]", dot: "bg-[var(--color-warning)]" },
  alta:  { label: "Alta",  color: "text-[var(--color-error)]",   dot: "bg-[var(--color-error)]" },
};

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  interfaz: "Interfaz", funcionalidad: "Funcionalidad",
  rendimiento: "Rendimiento", documentacion: "Documentación", otro: "Otro",
};

const STATUS_PIPELINE: FeedbackStatus[] = ["pendiente", "en_revision", "planificado", "implementado"];
const ALL_STATUSES: FeedbackStatus[] = ["pendiente", "en_revision", "planificado", "implementado", "descartado"];

const STATUS_OPTIONS: MenuSelectOption[] = [
  { value: "", label: "Todos los estados" },
  ...ALL_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })),
];
const STATUS_EDIT_OPTIONS: MenuSelectOption[] = ALL_STATUSES.map((s) => ({
  value: s, label: STATUS_META[s].label,
}));

const ROLE_AVATAR: Record<string, string> = {
  gestor_centro_control: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  tecnico_campo: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  conductor: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function UserAvatar({ name, role }: { name: string | null | undefined; role: string | null | undefined }) {
  const cls = (role && ROLE_AVATAR[role]) ?? "bg-[var(--color-surface-3)] text-[var(--color-text-2)]";
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold tracking-wide ${cls}`}>
      {getInitials(name)}
    </div>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={10} fill="currentColor"
          className={s <= value ? "text-[var(--color-warning)]" : "text-[var(--color-surface-3)]"}
        />
      ))}
    </span>
  );
}

// Type pill tabs — replaces the type dropdown
function TypeTabs({ value, onChange, counts }: {
  value: string; onChange: (v: string) => void; counts: Record<string, number>;
}) {
  const TABS = [
    { value: "", label: "Todos", icon: null as React.ElementType | null, tone: "neutral" as const },
    { value: "idea", label: "Ideas", icon: Lightbulb, tone: "warning" as const },
    { value: "error", label: "Errores", icon: AlertCircle, tone: "error" as const },
    { value: "mejora", label: "Mejoras", icon: TrendingUp, tone: "success" as const },
  ] as const;

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
      {TABS.map(({ value: v, label, icon: Icon, tone }) => {
        const active = v === value;
        const count = v === "" ? undefined : counts[v];
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "filter-chip",
              active && "filter-chip--active",
              !active && "border-transparent bg-transparent",
            )}
            style={active && tone !== "neutral" ? { ["--dot-color" as string]: `var(--color-${tone})` } : undefined}
          >
            {Icon ? <Icon size={12} aria-hidden /> : null}
            {label}
            {count !== undefined && count > 0 ? (
              <span className="min-w-[18px] rounded-full bg-[var(--color-surface-3)] px-1 py-px text-center text-[10px] tabular-nums leading-none">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// Visual status pipeline (read-only)
function StatusPipeline({ current }: { current: FeedbackStatus }) {
  const isDiscarded = current === "descartado";
  const currentIdx = STATUS_PIPELINE.indexOf(current);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {STATUS_PIPELINE.map((step, i) => {
        const sm = STATUS_META[step];
        const isActive = step === current;
        const isPast = !isDiscarded && i < currentIdx;
        return (
          <Fragment key={step}>
            <Badge
              variant={isActive ? sm.badge : "neutral"}
              className={cn(!isActive && (isPast ? "opacity-50" : "opacity-30"))}
            >
              {sm.label}
            </Badge>
            {i < STATUS_PIPELINE.length - 1 && (
              <ChevronRight size={10} className={cn("shrink-0", isPast ? "text-[var(--color-text-3)] opacity-50" : "text-[var(--color-border)]")} />
            )}
          </Fragment>
        );
      })}
      {isDiscarded ? (
        <Badge variant="neutral">Descartado</Badge>
      ) : null}
    </div>
  );
}

function listStaggerClass(index: number) {
  return `ccmgc-stagger-in ccmgc-stagger-in-${(index % 6) + 1}`;
}

// Skeleton row
function SkeletonRow() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-2.5">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded-md" />
            <Skeleton className="h-5 w-20 rounded-md" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

// ─── Feedback row ──────────────────────────────────────────────────────────────

function FeedbackRow({ item, onUpdated, staggerIndex }: { item: UserFeedback; onUpdated: (u: UserFeedback) => void; staggerIndex: number }) {
  const rm = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localStatus, setLocalStatus] = useState<FeedbackStatus>(item.status as FeedbackStatus);
  const [localNotes, setLocalNotes] = useState(item.adminNotes ?? "");

  const tm = TYPE_META[item.type as FeedbackType];
  const sm = STATUS_META[localStatus];
  const Icon = tm?.icon ?? ClipboardList;
  const hasChanges = localStatus !== item.status || localNotes !== (item.adminNotes ?? "");
  const preview = item.description.length > 110 ? item.description.slice(0, 108) + "…" : item.description;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: localStatus, adminNotes: localNotes }),
      });
      if (!res.ok) throw new Error();
      onUpdated((await res.json()) as UserFeedback);
      setSaved(true);
      hapticLight();
      setTimeout(() => setSaved(false), 2500);
    } catch { /* silencio */ }
    finally { setSaving(false); }
  };

  return (
    <div
      className={cn(
        "ccmgc-card-clickable overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-[border-color,box-shadow] duration-150 hover:border-[var(--color-border-hover)] hover:shadow-lg hover:shadow-black/20",
        listStaggerClass(staggerIndex),
      )}
      style={{ borderLeftWidth: "3px", borderLeftColor: tm?.borderColor }}
    >
      {/* Header (clickable, toggles expand) */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
      >
        <UserAvatar name={item.userName} role={item.userRole} />

        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={tm?.badge ?? "neutral"} className="inline-flex items-center gap-1">
              <Icon size={10} aria-hidden />
              {tm?.label}
            </Badge>
            <Badge variant="neutral">
              {CATEGORY_LABEL[item.category as FeedbackCategory] ?? item.category}
            </Badge>
            {item.urgency === "alta" && (
              <Badge variant="error" className="inline-flex items-center gap-1">
                <span className="ccmgc-pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
                Urgente
              </Badge>
            )}
          </div>

          <p className="font-semibold leading-snug text-[var(--color-text-1)]">{item.title}</p>

          {!expanded && (
            <p className="line-clamp-1 text-xs text-[var(--color-text-3)]">{preview}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-3)]">
            <span className="font-medium text-[var(--color-text-2)]">{item.userName ?? "Desconocido"}</span>
            {item.userRole && <span className="capitalize opacity-70">{item.userRole.replace(/_/g, " ")}</span>}
            <span>·</span>
            <span>{relativeTime(item.createdAt)}</span>
          </div>
        </div>

        {/* Right meta */}
        <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
          {item.rating !== null && <StarDisplay value={item.rating} />}
          <Badge variant={sm.badge}>{sm.label}</Badge>
          {expanded
            ? <ChevronUp size={14} className="text-[var(--color-text-3)]" />
            : <ChevronDown size={14} className="text-[var(--color-text-3)]" />}
        </div>
      </button>

      {/* Expanded panel */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="body"
            initial={rm ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--color-border)]">

              {/* Full description */}
              <div className="px-4 pt-4 pb-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">Descripción completa</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-1)]">{item.description}</p>
              </div>

              {/* Adjuntos (capturas) */}
              {item.attachments && item.attachments.length > 0 ? (
                <div className="border-t border-[var(--color-border)] px-4 py-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                    Capturas adjuntas ({item.attachments.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {item.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="group relative block overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] transition-transform hover:scale-[1.02]"
                        title={`${att.fileName} — abrir en grande`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={att.url}
                          alt={att.fileName}
                          loading="lazy"
                          className="aspect-[4/3] h-full w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                          <p className="truncate text-[10px] font-medium text-white" title={att.fileName}>
                            {att.fileName}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Status pipeline + context chips */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-4 py-3">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">Progreso</p>
                  <StatusPipeline current={localStatus} />
                </div>
                {(item.currentPage ?? item.appVersion) && (
                  <div className="flex flex-wrap gap-2">
                    {item.currentPage && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-2)]">
                        <MapPin size={11} className="shrink-0 text-[var(--color-text-3)]" />
                        {item.currentPage}
                      </span>
                    )}
                    {item.appVersion && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-2)]">
                        <FileText size={11} className="shrink-0 text-[var(--color-text-3)]" />
                        v{item.appVersion}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Admin management */}
              <div className="border-t border-[var(--color-border)] px-4 py-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">Gestión interna</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-label text-[var(--color-text-2)]">Cambiar estado</label>
                    <MenuSelect value={localStatus} onChange={(v) => setLocalStatus(v as FeedbackStatus)} options={STATUS_EDIT_OPTIONS} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-label text-[var(--color-text-2)]">Notas internas</label>
                    <Textarea
                      value={localNotes}
                      onChange={(e) => setLocalNotes(e.target.value)}
                      placeholder="Apuntes para el equipo…"
                      rows={2}
                      maxLength={1000}
                      wrapperClassName="space-y-0"
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end gap-3">
                  <AnimatePresence>
                    {saved && (
                      <motion.span
                        initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-success)]"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                        Guardado
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <Button
                    type="button"
                    onClick={save}
                    disabled={saving || !hasChanges}
                    loading={saving}
                    size="sm"
                  >
                    Guardar cambios
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function KanbanColumn({
  title,
  tone,
  items,
  onUpdated,
}: {
  title: string;
  tone: "neutral" | "warning" | "success";
  items: UserFeedback[];
  onUpdated: (u: UserFeedback) => void;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/35 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--color-text-1)]">{title}</span>
        <Badge variant={tone} className="tabular-nums">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-3)]">
          Sin elementos
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <FeedbackRow key={item.id} item={item} onUpdated={onUpdated} staggerIndex={index} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function FeedbackAdminBandeja() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"lista" | "kanban">("lista");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 260);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ page: String(page) });
      if (typeFilter) p.set("type", typeFilter);
      if (statusFilter) p.set("status", statusFilter);
      if (debouncedSearch) p.set("q", debouncedSearch);
      const res = await fetch(`/api/feedback?${p}`);
      if (!res.ok) throw new Error();
      setData((await res.json()) as ApiResponse);
    } catch {
      setError("No se pudo cargar el feedback");
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpdated = (u: UserFeedback) =>
    setData((prev) => prev ? { ...prev, items: prev.items.map((i) => (i.id === u.id ? u : i)) } : prev);

  const kpiByType = useMemo(() => {
    if (!data?.stats) return { idea: 0, error: 0, mejora: 0 };
    return data.stats.reduce(
      (acc, s) => { if (s.type in acc) acc[s.type as FeedbackType] += s._count.id; return acc; },
      { idea: 0, error: 0, mejora: 0 } as Record<FeedbackType, number>,
    );
  }, [data?.stats]);

  const tabCounts = useMemo(() => {
    if (!data?.stats) return {} as Record<string, number>;
    return data.stats.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] ?? 0) + s._count.id;
      return acc;
    }, {} as Record<string, number>);
  }, [data?.stats]);

  const pendingCount = useMemo(
    () => data?.stats.filter((s) => s.status === "pendiente").reduce((a, s) => a + s._count.id, 0) ?? 0,
    [data?.stats],
  );

  const exportCsv = () => {
    if (!data?.items.length) return;
    const hdr = ["ID","Tipo","Categoría","Título","Estado","Usuario","Rol","Valoración","Urgencia","Sección","Fecha"];
    const rows = data.items.map((i) => [
      i.id, i.type, i.category, `"${i.title.replace(/"/g, '""')}"`,
      i.status, i.userName ?? "", i.userRole ?? "", i.rating ?? "",
      i.urgency, i.currentPage ?? "", i.createdAt,
    ]);
    const csv = [hdr, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: `feedback_${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
  };

  const hasFilters = typeFilter || statusFilter || search;
  const kanbanColumns = useMemo(() => {
    const items = data?.items ?? [];
    return {
      todo: items.filter((i) => i.status === "pendiente"),
      review: items.filter((i) => i.status === "en_revision" || i.status === "planificado"),
      done: items.filter((i) => i.status === "implementado"),
    };
  }, [data?.items]);

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiPill layout="stacked" label="Total" value={data?.total ?? 0} hint="recibidos" tone="accent" icon={<ClipboardList size={12} aria-hidden />} animateValue={!!data} />
        <KpiPill layout="stacked" label="Pendientes" value={pendingCount} hint="sin revisar" tone={pendingCount > 0 ? "warning" : "neutral"} pulse={pendingCount > 0} icon={<AlertCircle size={12} aria-hidden />} animateValue={!!data} />
        <KpiPill layout="stacked" label="Ideas" value={kpiByType.idea} tone="warning" icon={<Lightbulb size={12} aria-hidden />} animateValue={!!data} />
        <KpiPill layout="stacked" label="Errores" value={kpiByType.error} tone="error" icon={<AlertCircle size={12} aria-hidden />} animateValue={!!data} />
        <KpiPill layout="stacked" label="Satisfacción" textValue={data?.avgRating ? `${data.avgRating.toFixed(1)} ★` : "—"} hint="valoración media" tone="success" icon={<Star size={12} aria-hidden />} animateValue={false} />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <TypeTabs value={typeFilter} onChange={setTypeFilter} counts={tabCounts} />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[var(--color-text-3)]" aria-hidden />
            <Input
              ref={searchRef}
              type="search"
              placeholder="Buscar en título o descripción…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
                aria-label="Limpiar búsqueda"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <div className="w-44 shrink-0">
            <MenuSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} aria-label="Filtrar por estado" />
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
            <button
              type="button"
              onClick={() => setViewMode("lista")}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-semibold",
                viewMode === "lista"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-2)]",
              )}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-semibold",
                viewMode === "kanban"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-2)]",
              )}
            >
              Kanban
            </button>
          </div>

          {hasFilters ? (
            <Button type="button" variant="secondary" size="sm" onClick={clearFilters} startIcon={<X size={12} />}>
              Limpiar
            </Button>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={!data?.items.length}
            startIcon={<Download size={14} />}
            className="ml-auto"
          >
            CSV
          </Button>
        </div>
      </div>

      {/* Result count */}
      {!loading && data && (
        <p className="text-xs text-[var(--color-text-3)]">
          {data.total === 0
            ? "Sin resultados"
            : `${data.total} resultado${data.total !== 1 ? "s" : ""}${hasFilters ? " · filtros activos" : ""}`}
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2.5" aria-busy="true">
          <SkeletonRow /><SkeletonRow /><SkeletonRow />
        </div>
      ) : error ? (
        <ErrorState
          icon={AlertCircle}
          title="Error al cargar feedback"
          hint={error}
          onRetry={() => void load()}
        />
      ) : !data?.items.length ? (
        <EmptyState
          icon={ClipboardList}
          title={hasFilters ? "Sin resultados para estos filtros" : "Aún no hay feedback"}
          hint={hasFilters ? "Prueba a cambiar los filtros" : "Los feedbacks de los usuarios aparecerán aquí"}
          actionLabel={hasFilters ? "Limpiar filtros" : undefined}
          onAction={hasFilters ? clearFilters : undefined}
        />
      ) : viewMode === "lista" ? (
        <div className="space-y-2.5">
          {data.items.map((item, index) => (
            <FeedbackRow key={item.id} item={item} onUpdated={handleUpdated} staggerIndex={index} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <KanbanColumn title="Todo" tone="neutral" items={kanbanColumns.todo} onUpdated={handleUpdated} />
          <KanbanColumn title="En revisión" tone="warning" items={kanbanColumns.review} onUpdated={handleUpdated} />
          <KanbanColumn title="Hecho" tone="success" items={kanbanColumns.done} onUpdated={handleUpdated} />
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 ? (
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </Button>
          <span className="min-w-[6rem] text-center text-sm text-[var(--color-text-2)]">
            Página {page} de {data.pages}
          </span>
          <Button type="button" variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </Button>
        </div>
      ) : null}
    </div>
  );
}
