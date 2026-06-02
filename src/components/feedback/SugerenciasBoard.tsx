"use client";

/**
 * SugerenciasBoard — tablón de votación pública de ideas/mejoras (Fase 5).
 *
 * UX inspirada en boards tipo Canny / Upvoty:
 *   - Filtros laterales tipo chip (Top / Pendientes / Recientes / Implementadas / Mías).
 *   - Cada tarjeta tiene un BOTÓN-VOTO grande a la izquierda con el contador.
 *   - Tipo (idea / mejora) en color, estado pill, y autor / fecha.
 *   - Filtro por tipo y búsqueda libre opcional.
 *   - Optimistic update al votar: ajustamos el contador antes de la respuesta
 *     del servidor para sentir la app responsiva, y revertimos si falla.
 *
 * Se carga de /api/sugerencias (board) y vota en /api/sugerencias/{id}/vote.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  CheckCircle2,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
  UserCircle2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type SugerenciaType = "idea" | "mejora";
type SugerenciaStatus = "pendiente" | "en_revision" | "planificado" | "implementado" | "descartado";

type Sugerencia = {
  id: string;
  type: SugerenciaType;
  category: string;
  title: string;
  description: string;
  status: SugerenciaStatus;
  urgency: string;
  currentPage: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
  voteCount: number;
  userHasVoted: boolean;
  attachmentCount: number;
  isMine: boolean;
};

type ApiResponse = {
  items: Sugerencia[];
  stats: {
    totalIdeas: number;
    totalMejoras: number;
    totalImplementadas: number;
    totalPlanificadas: number;
  };
};

type FilterKey = "top" | "pendientes" | "recientes" | "implementadas" | "mias";

const FILTER_OPTIONS: { value: FilterKey; label: string; icon: typeof Trophy }[] = [
  { value: "top", label: "Más votadas", icon: Trophy },
  { value: "pendientes", label: "En estudio", icon: Sparkles },
  { value: "recientes", label: "Recientes", icon: TrendingUp },
  { value: "implementadas", label: "Implementadas", icon: CheckCircle2 },
  { value: "mias", label: "Mías", icon: UserCircle2 },
];

const TYPE_META: Record<
  SugerenciaType,
  { label: string; color: string; bg: string; ring: string; Icon: typeof Lightbulb }
> = {
  idea: {
    label: "Idea",
    color: "text-[#f59e0b]",
    bg: "bg-[rgba(245,158,11,0.10)]",
    ring: "ring-[rgba(245,158,11,0.35)]",
    Icon: Lightbulb,
  },
  mejora: {
    label: "Mejora",
    color: "text-[var(--color-success)]",
    bg: "bg-[var(--color-success-light)]",
    ring: "ring-[rgba(5,150,105,0.35)]",
    Icon: TrendingUp,
  },
};

const STATUS_META: Record<SugerenciaStatus, { label: string; cls: string }> = {
  pendiente: {
    label: "Pendiente",
    cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  },
  en_revision: {
    label: "En revisión",
    cls: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  },
  planificado: {
    label: "Planificado",
    cls: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  },
  implementado: {
    label: "Implementado",
    cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  },
  descartado: {
    label: "Descartado",
    cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  },
};

export function SugerenciasBoard({ currentUserId: _currentUserId }: { currentUserId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("top");
  const [typeFilter, setTypeFilter] = useState<"" | SugerenciaType>("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [votingId, setVotingId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("filter", filter);
      if (typeFilter) params.set("type", typeFilter);
      if (debounced) params.set("q", debounced);
      const res = await fetch(`/api/sugerencias?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      console.warn("Error cargando sugerencias:", err);
      setData({ items: [], stats: { totalIdeas: 0, totalMejoras: 0, totalImplementadas: 0, totalPlanificadas: 0 } });
    } finally {
      setLoading(false);
    }
  }, [filter, typeFilter, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Toggle de voto con optimistic update. Si el POST falla revertimos.
   * El servidor envía la cuenta real, así que tras éxito sincronizamos
   * el valor exacto por si hubo un voto concurrente de otro usuario.
   */
  const handleVote = async (item: Sugerencia) => {
    if (votingId) return;
    setVotingId(item.id);

    const optimistic: Sugerencia = {
      ...item,
      userHasVoted: !item.userHasVoted,
      voteCount: item.voteCount + (item.userHasVoted ? -1 : 1),
    };
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) => (it.id === item.id ? optimistic : it)),
          }
        : prev,
    );

    try {
      const res = await fetch(`/api/sugerencias/${encodeURIComponent(item.id)}/vote`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("vote failed");
      const json = (await res.json()) as { voteCount: number; userHasVoted: boolean };
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === item.id
                  ? { ...it, voteCount: json.voteCount, userHasVoted: json.userHasVoted }
                  : it,
              ),
            }
          : prev,
      );
    } catch {
      // Revertir
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) => (it.id === item.id ? item : it)),
            }
          : prev,
      );
    } finally {
      setVotingId(null);
    }
  };

  const items = data?.items ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Ideas" value={stats.totalIdeas} icon={Lightbulb} tone="amber" />
          <Kpi label="Mejoras" value={stats.totalMejoras} icon={TrendingUp} tone="green" />
          <Kpi label="Planificadas" value={stats.totalPlanificadas} icon={Sparkles} tone="violet" />
          <Kpi label="Implementadas" value={stats.totalImplementadas} icon={CheckCircle2} tone="emerald" />
        </div>
      ) : null}

      {/* Controles */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  active
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-sm"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]",
                )}
              >
                <opt.icon size={12} strokeWidth={2} />
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de tipo */}
          <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5">
            {([
              { v: "", label: "Todo" },
              { v: "idea", label: "Ideas" },
              { v: "mejora", label: "Mejoras" },
            ] as const).map((opt) => {
              const active = typeFilter === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTypeFilter(opt.v)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors",
                    active
                      ? "bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm"
                      : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Búsqueda */}
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="w-44 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-3 text-[12px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState onCreate={() => window.dispatchEvent(new CustomEvent("ccmgc-open-feedback", { detail: {} }))} />
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <SugerenciaCard
                  item={item}
                  voting={votingId === item.id}
                  onVote={() => void handleVote(item)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Trophy;
  tone: "amber" | "green" | "violet" | "emerald";
}) {
  const toneCls = {
    amber: "from-[rgba(245,158,11,0.18)] to-transparent text-[#f59e0b]",
    green: "from-[var(--color-success-light)] to-transparent text-[var(--color-success)]",
    violet: "from-[rgba(139,92,246,0.18)] to-transparent text-violet-300",
    emerald: "from-emerald-500/15 to-transparent text-emerald-300",
  }[tone];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br p-3",
        toneCls,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
          {label}
        </p>
        <Icon size={14} strokeWidth={2} className="opacity-80" />
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--color-text-1)]">{value}</p>
    </div>
  );
}

function SugerenciaCard({
  item,
  voting,
  onVote,
}: {
  item: Sugerencia;
  voting: boolean;
  onVote: () => void;
}) {
  const t = TYPE_META[item.type];
  const s = STATUS_META[item.status];
  const isImplemented = item.status === "implementado";
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={cn(
        "group flex items-stretch gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-all",
        "hover:border-[var(--color-border-hover)] hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)]",
        isImplemented && "opacity-90",
      )}
    >
      {/* Botón voto */}
      <button
        type="button"
        onClick={onVote}
        disabled={voting || isImplemented}
        aria-pressed={item.userHasVoted}
        aria-label={item.userHasVoted ? "Quitar voto" : "Votar"}
        className={cn(
          "flex w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1.5 py-2 transition-all",
          item.userHasVoted
            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-[0_8px_18px_-8px_rgba(37,99,235,0.6)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]",
          (voting || isImplemented) && "cursor-not-allowed opacity-70",
        )}
      >
        {voting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ArrowUp size={16} strokeWidth={2.4} />
        )}
        <span className="text-[13.5px] font-bold tabular-nums leading-none">{item.voteCount}</span>
      </button>

      {/* Contenido */}
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="min-w-0 flex-1 text-left"
          >
            <h3 className="text-sm font-semibold text-[var(--color-text-1)] hover:text-[var(--color-accent)]">
              {item.title}
            </h3>
          </button>
        </header>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset",
              t.bg,
              t.color,
              t.ring,
            )}
          >
            <t.Icon size={9} strokeWidth={2.2} />
            {t.label}
          </span>
          <span
            className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium", s.cls)}
          >
            {s.label}
          </span>
          {item.attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[var(--color-text-2)]">
              <ImageIcon size={9} strokeWidth={2.2} />
              {item.attachmentCount}
            </span>
          ) : null}
          {item.isMine ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[var(--color-accent)]">
              <UserCircle2 size={9} strokeWidth={2.2} />
              Tuya
            </span>
          ) : null}
          <span className="ml-auto truncate text-[var(--color-text-3)]">
            {item.userName ? `${item.userName} · ` : ""}
            {relativeShort(item.createdAt)}
          </span>
        </div>

        {/* Descripción colapsable */}
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="desc"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <p className="mt-2.5 whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2 text-[12.5px] leading-relaxed text-[var(--color-text-2)]">
                {item.description}
              </p>
            </motion.div>
          ) : (
            <p
              className="mt-1.5 line-clamp-1 cursor-pointer text-[12px] text-[var(--color-text-3)]"
              onClick={() => setExpanded(true)}
            >
              {item.description}
            </p>
          )}
        </AnimatePresence>
      </div>
    </article>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-light)]">
        <Lightbulb size={20} className="text-[var(--color-accent)]" />
      </span>
      <p className="text-sm font-medium text-[var(--color-text-1)]">No hay sugerencias todavía</p>
      <p className="mt-1 max-w-sm text-[12px] text-[var(--color-text-3)]">
        Sé el primero en proponer una idea o una mejora. El equipo de desarrollo prioriza por
        votos del centro.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[12.5px] font-semibold text-white transition-all hover:bg-[var(--color-accent-hover)]"
      >
        <MessageSquarePlus size={13} />
        Proponer ahora
      </button>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeShort(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "ayer";
  if (diffD < 30) return `hace ${diffD} d.`;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}
