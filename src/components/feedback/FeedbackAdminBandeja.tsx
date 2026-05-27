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
  Loader2,
  MapPin,
  Search,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { MenuSelect, type MenuSelectOption } from "@/components/ui/menu-select";
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
  color: string; bg: string; borderColor: string; pill: string;
}> = {
  idea:   { label: "Idea",   icon: Lightbulb,   color: "text-[#f59e0b]",              bg: "bg-[rgba(245,158,11,0.14)]",    borderColor: "#f59e0b",             pill: "bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border border-[rgba(245,158,11,0.3)]" },
  error:  { label: "Error",  icon: AlertCircle, color: "text-[var(--color-error)]",   bg: "bg-[var(--color-error-light)]", borderColor: "var(--color-error)",  pill: "bg-[var(--color-error-light)] text-[var(--color-error)] border border-[rgba(220,38,38,0.3)]" },
  mejora: { label: "Mejora", icon: TrendingUp,  color: "text-[var(--color-success)]", bg: "bg-[var(--color-success-light)]",borderColor: "var(--color-success)",pill: "bg-[var(--color-success-light)] text-[var(--color-success)] border border-[rgba(5,150,105,0.3)]" },
};

const STATUS_META: Record<FeedbackStatus, { label: string; color: string; dot: string; ring: string }> = {
  pendiente:    { label: "Pendiente",    color: "text-[var(--color-text-2)]",  dot: "bg-[var(--color-text-3)]",   ring: "border-[var(--color-border)] bg-[var(--color-surface-2)]" },
  en_revision:  { label: "En revisión", color: "text-[#f59e0b]",              dot: "bg-[#f59e0b]",               ring: "border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)]" },
  planificado:  { label: "Planificado", color: "text-[var(--color-accent)]",  dot: "bg-[var(--color-accent)]",   ring: "border-[rgba(37,99,235,0.4)] bg-[var(--color-accent-light)]" },
  implementado: { label: "Implementado",color: "text-[var(--color-success)]", dot: "bg-[var(--color-success)]",  ring: "border-[rgba(5,150,105,0.4)] bg-[var(--color-success-light)]" },
  descartado:   { label: "Descartado",  color: "text-[var(--color-text-3)]",  dot: "bg-[var(--color-surface-3)]",ring: "border-[var(--color-border)] bg-[var(--color-surface-3)]" },
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

const TINT: Record<string, { icon: string; iconBg: string; bar: string; glow: string }> = {
  blue:    { icon: "text-[var(--color-accent)]",   iconBg: "bg-[var(--color-accent-light)]",  bar: "bg-[var(--color-accent)]",  glow: "rgba(37,99,235,0.07)" },
  amber:   { icon: "text-[#f59e0b]",               iconBg: "bg-[rgba(245,158,11,0.14)]",      bar: "bg-[#f59e0b]",              glow: "rgba(245,158,11,0.07)" },
  red:     { icon: "text-[var(--color-error)]",    iconBg: "bg-[var(--color-error-light)]",   bar: "bg-[var(--color-error)]",   glow: "rgba(220,38,38,0.07)" },
  green:   { icon: "text-[var(--color-success)]",  iconBg: "bg-[var(--color-success-light)]", bar: "bg-[var(--color-success)]", glow: "rgba(5,150,105,0.07)" },
  neutral: { icon: "text-[var(--color-text-2)]",   iconBg: "bg-[var(--color-surface-2)]",     bar: "bg-[var(--color-text-3)]",  glow: "transparent" },
};

const ROLE_AVATAR: Record<string, string> = {
  gestor_centro_control: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  tecnico_campo:         "bg-[var(--color-success-light)] text-[var(--color-success)]",
  conductor:             "bg-[rgba(245,158,11,0.15)] text-[#f59e0b]",
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
          className={s <= value ? "text-[#f59e0b]" : "text-[var(--color-surface-3)]"}
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
    { value: "",       label: "Todos",   icon: null,        color: "" },
    { value: "idea",   label: "Ideas",   icon: Lightbulb,   color: "#f59e0b" },
    { value: "error",  label: "Errores", icon: AlertCircle, color: "var(--color-error)" },
    { value: "mejora", label: "Mejoras", icon: TrendingUp,  color: "var(--color-success)" },
  ] as const;

  return (
    <div className="flex gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
      {TABS.map(({ value: v, label, icon: Icon, color }) => {
        const active = v === value;
        const count = v === "" ? undefined : counts[v];
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              active
                ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-text-1)]"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
            }`}
          >
            {Icon && <Icon size={12} style={{ color: active ? color : undefined }} className="transition-colors" />}
            {label}
            {count !== undefined && count > 0 && (
              <span className={`min-w-[18px] rounded-full px-1 py-px text-center text-[10px] tabular-nums leading-none ${
                active ? "bg-[var(--color-surface-2)] text-[var(--color-text-2)]" : "bg-[var(--color-surface-3)] text-[var(--color-text-3)]"
              }`}>{count}</span>
            )}
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
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
              isActive ? `border ${sm.ring} ${sm.color}` :
              isPast ? "text-[var(--color-text-3)] opacity-50" :
              "text-[var(--color-text-3)] opacity-30"
            }`}>
              {isActive && <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />}
              {sm.label}
            </span>
            {i < STATUS_PIPELINE.length - 1 && (
              <ChevronRight size={10} className={`shrink-0 ${isPast ? "text-[var(--color-text-3)] opacity-50" : "text-[var(--color-border)]"}`} />
            )}
          </Fragment>
        );
      })}
      {isDiscarded && (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_META.descartado.ring} ${STATUS_META.descartado.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META.descartado.dot}`} />
          Descartado
        </span>
      )}
    </div>
  );
}

// KPI card
type KpiCardProps = { label: string; value: string | number; sub?: string; icon: React.ElementType; tint: "blue" | "amber" | "red" | "green" | "neutral" };

function KpiCard({ label, value, sub, icon: Icon, tint }: KpiCardProps) {
  const t = TINT[tint];
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[var(--color-border)] p-4"
      style={{ background: `radial-gradient(ellipse at 80% 0%, ${t.glow} 0%, transparent 60%), var(--color-surface)` }}
    >
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${t.bar}`} />
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.iconBg}`}>
          <Icon size={14} className={t.icon} />
        </div>
      </div>
      <p className="text-3xl font-bold tabular-nums text-[var(--color-text-1)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--color-text-3)]">{sub}</p>}
    </div>
  );
}

// Skeleton row
function SkeletonRow() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
        <div className="flex-1 space-y-2.5">
          <div className="flex gap-2">
            <div className="h-5 w-14 animate-pulse rounded-md bg-[var(--color-surface-2)]" />
            <div className="h-5 w-20 animate-pulse rounded-md bg-[var(--color-surface-2)]" />
          </div>
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--color-surface-2)]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-surface-2)]" />
        </div>
        <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
      </div>
    </div>
  );
}

// ─── Feedback row ──────────────────────────────────────────────────────────────

function FeedbackRow({ item, onUpdated }: { item: UserFeedback; onUpdated: (u: UserFeedback) => void }) {
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
      setTimeout(() => setSaved(false), 2500);
    } catch { /* silencio */ }
    finally { setSaving(false); }
  };

  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-[border-color,box-shadow] duration-150 hover:border-[var(--color-border-hover)] hover:shadow-lg hover:shadow-black/20"
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
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tm?.pill ?? ""}`}>
              <Icon size={10} />
              {tm?.label}
            </span>
            <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-3)]">
              {CATEGORY_LABEL[item.category as FeedbackCategory] ?? item.category}
            </span>
            {item.urgency === "alta" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-error)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-error)]" />
                Urgente
              </span>
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
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${sm.color} ${sm.ring}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
            {sm.label}
          </span>
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
                    <textarea
                      value={localNotes}
                      onChange={(e) => setLocalNotes(e.target.value)}
                      placeholder="Apuntes para el equipo…"
                      rows={2}
                      maxLength={1000}
                      className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] transition-colors focus:border-[var(--color-accent)] focus:outline-none"
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
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !hasChanges}
                    className="inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving && <Loader2 size={13} className="animate-spin" />}
                    Guardar cambios
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 260);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const p = new URLSearchParams({ page: String(page) });
        if (typeFilter) p.set("type", typeFilter);
        if (statusFilter) p.set("status", statusFilter);
        if (debouncedSearch) p.set("q", debouncedSearch);
        const res = await fetch(`/api/feedback?${p}`);
        if (!res.ok) throw new Error();
        setData((await res.json()) as ApiResponse);
      } catch { setError("No se pudo cargar el feedback"); }
      finally { setLoading(false); }
    };
    void load();
  }, [page, typeFilter, statusFilter, debouncedSearch]);

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

  const hasFilters = typeFilter || statusFilter || search;

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total" value={data?.total ?? "—"} sub="recibidos" icon={ClipboardList} tint="blue" />
        <KpiCard label="Pendientes" value={pendingCount} sub="sin revisar" icon={AlertCircle} tint={pendingCount > 0 ? "amber" : "neutral"} />
        <KpiCard label="Ideas" value={kpiByType.idea} icon={Lightbulb} tint="amber" />
        <KpiCard label="Errores" value={kpiByType.error} icon={AlertCircle} tint="red" />
        <KpiCard label="Satisfacción" value={data?.avgRating ? `${data.avgRating.toFixed(1)} ★` : "—"} sub="valoración media" icon={Star} tint="green" />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <TypeTabs value={typeFilter} onChange={setTypeFilter} counts={tabCounts} />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Buscar en título o descripción…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2 pl-9 pr-8 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors focus:border-[var(--color-accent)] focus:outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] hover:text-[var(--color-text-1)]">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="w-44 shrink-0">
            <MenuSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} aria-label="Filtrar por estado" />
          </div>

          {hasFilters && (
            <button type="button" onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); }}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-xs font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]">
              <X size={12} /> Limpiar
            </button>
          )}

          <button type="button" onClick={exportCsv} disabled={!data?.items.length}
            title="Exportar a CSV"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)] disabled:opacity-40">
            <Download size={14} /> CSV
          </button>
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
        <div className="space-y-2.5">
          <SkeletonRow /><SkeletonRow /><SkeletonRow />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-error-light)] p-4 text-sm text-[var(--color-error)]">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
            <ClipboardList size={26} className="text-[var(--color-text-3)]" />
          </div>
          <p className="font-medium text-[var(--color-text-2)]">
            {hasFilters ? "Sin resultados para estos filtros" : "Aún no hay feedback"}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-3)]">
            {hasFilters ? "Prueba a cambiar los filtros" : "Los feedbacks de los usuarios aparecerán aquí"}
          </p>
          {hasFilters && (
            <button type="button" onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); }}
              className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-xs font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {data.items.map((item) => (
            <FeedbackRow key={item.id} item={item} onUpdated={handleUpdated} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-1.5 text-sm text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)] disabled:opacity-40">
            ← Anterior
          </button>
          <span className="min-w-[6rem] text-center text-sm text-[var(--color-text-2)]">
            Página {page} de {data.pages}
          </span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-1.5 text-sm text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)] disabled:opacity-40">
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
