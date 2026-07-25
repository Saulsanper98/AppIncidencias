"use client";

/**
 * SugerenciasBoard — tablón de votación pública de ideas/mejoras (Fase 5).
 *
 * Versión "premium":
 *   - KPIs con micro-barras de tendencia y badge contextual
 *   - "Featured card" XL para la sugerencia #1 cuando filtro=top y no hay
 *     búsqueda ni filtro de tipo (es el caso en el que el top tiene sentido)
 *   - Cards con podio (oro/plata/bronce), badge 🔥 Hot para virales y
 *     borde con gradiente en hover (via mask)
 *   - Botón de voto con ripple + counter animado al votar (optimistic)
 *   - Filtros con contador y CTA "Proponer" siempre visible
 *
 * Endpoints:
 *   - GET  /api/sugerencias?filter=…&type=…&q=…
 *   - POST /api/sugerencias/{id}/vote (toggle)
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Check,
  CheckCircle2,
  ClipboardList,
  Flame,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  UserCircle2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { KpiPill } from "@/components/ui/kpi-pill";
import { Skeleton } from "@/components/ui/skeleton";

type SugerenciaType = "idea" | "mejora";
type SugerenciaStatus =
  | "pendiente"
  | "en_revision"
  | "planificado"
  | "implementado"
  | "descartado";

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
  { value: "pendientes", label: "En estudio", icon: ClipboardList },
  { value: "recientes", label: "Recientes", icon: Sparkles },
  { value: "implementadas", label: "Implementadas", icon: CheckCircle2 },
  { value: "mias", label: "Mías", icon: UserCircle2 },
];

const TYPE_META: Record<
  SugerenciaType,
  { label: string; color: string; bg: string; ring: string; Icon: typeof Lightbulb }
> = {
  idea: {
    label: "Idea",
    color: "text-amber-300",
    bg: "bg-amber-500/15",
    ring: "ring-amber-500/30",
    Icon: Lightbulb,
  },
  mejora: {
    label: "Mejora",
    color: "text-emerald-300",
    bg: "bg-emerald-500/15",
    ring: "ring-emerald-500/30",
    Icon: TrendingUp,
  },
};

const STATUS_META: Record<
  SugerenciaStatus,
  { label: string; cls: string; Icon: typeof Check }
> = {
  pendiente: {
    label: "Pendiente",
    cls: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
    Icon: ClipboardList,
  },
  en_revision: {
    label: "En revisión",
    cls: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
    Icon: Search,
  },
  planificado: {
    label: "Planificado",
    cls: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
    Icon: Sparkles,
  },
  implementado: {
    label: "Implementado",
    cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
    Icon: Check,
  },
  descartado: {
    label: "Descartado",
    cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30",
    Icon: Check,
  },
};

const HOT_THRESHOLD = 5;

export function SugerenciasBoard({
  currentUserId: _currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserName?: string | null;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("top");
  const [typeFilter, setTypeFilter] = useState<"" | SugerenciaType>("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [votingId, setVotingId] = useState<string | null>(null);
  const [justVotedId, setJustVotedId] = useState<string | null>(null);

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
      setData({
        items: [],
        stats: { totalIdeas: 0, totalMejoras: 0, totalImplementadas: 0, totalPlanificadas: 0 },
      });
    } finally {
      setLoading(false);
    }
  }, [filter, typeFilter, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVote = async (item: Sugerencia) => {
    if (votingId) return;
    setVotingId(item.id);

    const wasVoted = item.userHasVoted;
    const optimistic: Sugerencia = {
      ...item,
      userHasVoted: !wasVoted,
      voteCount: item.voteCount + (wasVoted ? -1 : 1),
    };
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) => (it.id === item.id ? optimistic : it)),
          }
        : prev,
    );

    if (!wasVoted) {
      setJustVotedId(item.id);
      window.setTimeout(() => setJustVotedId(null), 600);
    }

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

  const openCreate = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("ccmgc-open-feedback", { detail: { defaultType: "idea" } }),
    );
  }, []);

  const items = data?.items ?? [];
  const stats = data?.stats;

  // El "featured" sólo tiene sentido en el modo "Más votadas" sin filtros
  // adicionales y cuando la primera tiene al menos un voto.
  const isCanonicalTop = filter === "top" && !typeFilter && !debounced;
  const featured =
    isCanonicalTop && items[0] && items[0].voteCount > 0 && items[0].status !== "implementado"
      ? items[0]
      : null;
  const restItems = featured ? items.slice(1) : items;

  // Ranking de top 3 (excluyendo el featured si existe).
  const rankByIdMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!isCanonicalTop) return m;
    const startIdx = featured ? 1 : 0;
    items
      .slice(startIdx)
      .filter((it) => it.status !== "implementado" && it.voteCount > 0)
      .slice(0, 3)
      .forEach((it, idx) => m.set(it.id, idx));
    return m;
  }, [isCanonicalTop, featured, items]);

  const totalIdeasMejoras = (stats?.totalIdeas ?? 0) + (stats?.totalMejoras ?? 0);
  const implementadasPct =
    totalIdeasMejoras > 0
      ? Math.round(((stats?.totalImplementadas ?? 0) / totalIdeasMejoras) * 100)
      : 0;
  const ideasPct =
    totalIdeasMejoras > 0
      ? Math.round(((stats?.totalIdeas ?? 0) / totalIdeasMejoras) * 100)
      : 0;
  const mejorasPct =
    totalIdeasMejoras > 0
      ? Math.round(((stats?.totalMejoras ?? 0) / totalIdeasMejoras) * 100)
      : 0;
  const planificadasPct =
    totalIdeasMejoras > 0
      ? Math.round(((stats?.totalPlanificadas ?? 0) / totalIdeasMejoras) * 100)
      : 0;

  const maxVotes = useMemo(
    () => Math.max(1, ...items.map((it) => it.voteCount)),
    [items],
  );

  return (
    <div className="space-y-4">
      {/* ───── KPIs ───── */}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiPill
            layout="stacked"
            label="Ideas"
            value={stats.totalIdeas}
            tone="warning"
            icon={<Lightbulb size={12} strokeWidth={2.2} />}
            hint={`${ideasPct}% del total`}
            animateValue
          />
          <KpiPill
            layout="stacked"
            label="Mejoras"
            value={stats.totalMejoras}
            tone="success"
            icon={<TrendingUp size={12} strokeWidth={2.2} />}
            hint={`${mejorasPct}% del total`}
            animateValue
          />
          <KpiPill
            layout="stacked"
            label="Planificadas"
            value={stats.totalPlanificadas}
            tone="violet"
            icon={<Sparkles size={12} strokeWidth={2.2} />}
            hint={`${planificadasPct}% en cola`}
            animateValue
          />
          <KpiPill
            layout="stacked"
            label="Implementadas"
            value={stats.totalImplementadas}
            tone="success"
            icon={<CheckCircle2 size={12} strokeWidth={2.2} />}
            hint={
              totalIdeasMejoras > 0
                ? `${implementadasPct}% entregado`
                : "ya en producción"
            }
            animateValue
          />
        </div>
      ) : null}

      {/* ───── Controles ───── */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            const isMine = opt.value === "mias";
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={cn(
                  "filter-chip gap-1.5 font-semibold",
                  active
                    ? isMine
                      ? "border-fuchsia-400 bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-md shadow-fuchsia-500/20"
                      : "filter-chip--active border-violet-400 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md shadow-violet-500/20"
                    : undefined,
                )}
              >
                <opt.icon size={12} strokeWidth={2.2} />
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de tipo */}
          <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5">
            {(
              [
                { v: "", label: "Todo" },
                { v: "idea", label: "Ideas" },
                { v: "mejora", label: "Mejoras" },
              ] as const
            ).map((opt) => {
              const active = typeFilter === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTypeFilter(opt.v)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all",
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
              className="w-44 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-3 text-[12px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-text-3)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
              >
                ×
              </button>
            ) : null}
          </div>

          {/* CTA crear */}
          <button
            type="button"
            onClick={openCreate}
            className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/40"
          >
            <MessageSquarePlus
              size={13}
              strokeWidth={2.4}
              className="transition-transform group-hover:rotate-12"
            />
            Proponer
          </button>
        </div>
      </div>

      {/* ───── Lista ───── */}
      {loading ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState onCreate={openCreate} filter={filter} hasSearch={debounced.length > 0} />
      ) : (
        <div className="space-y-3">
          {/* Featured */}
          {featured ? (
            <FeaturedCard
              item={featured}
              voting={votingId === featured.id}
              pop={justVotedId === featured.id}
              isCurrentUser={
                currentUserName != null && featured.userName === currentUserName
              }
              second={items[1] ?? null}
              onVote={() => void handleVote(featured)}
            />
          ) : null}

          {/* Resto */}
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {restItems.map((item) => (
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
                    pop={justVotedId === item.id}
                    rank={rankByIdMap.get(item.id)}
                    votePct={(item.voteCount / maxVotes) * 100}
                    isCurrentUser={
                      currentUserName != null && item.userName === currentUserName
                    }
                    onVote={() => void handleVote(item)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {/* Footer count */}
          <p className="px-1 pt-1 text-[11px] text-[var(--color-text-3)]">
            Mostrando {items.length} {items.length === 1 ? "propuesta" : "propuestas"}
            {debounced ? <> para "<strong>{debounced}</strong>"</> : null}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

const PODIUM_META = [
  {
    ring: "ring-amber-400/60",
    glow: "shadow-[0_0_30px_-8px_rgba(251,191,36,0.55)]",
    medal: "🥇",
    label: "1ª más votada",
  },
  {
    ring: "ring-slate-300/50",
    glow: "shadow-[0_0_24px_-10px_rgba(203,213,225,0.55)]",
    medal: "🥈",
    label: "2ª más votada",
  },
  {
    ring: "ring-orange-500/50",
    glow: "shadow-[0_0_24px_-10px_rgba(234,88,12,0.55)]",
    medal: "🥉",
    label: "3ª más votada",
  },
];

function FeaturedCard({
  item,
  voting,
  pop,
  isCurrentUser,
  second,
  onVote,
}: {
  item: Sugerencia;
  voting: boolean;
  pop: boolean;
  isCurrentUser: boolean;
  second: Sugerencia | null;
  onVote: () => void;
}) {
  const t = TYPE_META[item.type];
  const s = STATUS_META[item.status];
  const [expanded, setExpanded] = useState(true);
  const gap = second ? item.voteCount - second.voteCount : item.voteCount;
  const isHot = item.voteCount >= HOT_THRESHOLD;

  return (
    <article
      className="group relative overflow-hidden rounded-3xl border border-amber-400/30 ring-1 ring-inset ring-amber-400/30 shadow-[0_22px_70px_-30px_rgba(251,191,36,0.55)]"
      style={{
        background:
          "radial-gradient(ellipse at 0% 0%, rgba(251,191,36,0.16) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(168,85,247,0.16) 0%, transparent 55%), linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)",
      }}
    >
      {/* Cinta superior */}
      <div className="flex items-center justify-between gap-2 border-b border-amber-400/20 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-200">
        <span className="inline-flex items-center gap-1.5">
          <Star size={12} strokeWidth={2.4} className="fill-amber-300 text-amber-300" />
          Propuesta nº 1 del centro
        </span>
        {gap > 0 && second ? (
          <span className="hidden text-[10px] font-semibold normal-case tracking-normal text-amber-200/80 sm:inline">
            +{gap} voto{gap === 1 ? "" : "s"} sobre la siguiente
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:p-5">
        {/* Botón voto XL */}
        <motion.button
          type="button"
          onClick={onVote}
          disabled={voting}
          aria-pressed={item.userHasVoted}
          aria-label={item.userHasVoted ? "Quitar voto" : "Votar"}
          animate={pop ? { scale: [1, 1.18, 1] } : { scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={cn(
            "relative flex w-full shrink-0 flex-row items-center justify-center gap-2 self-stretch rounded-2xl border-2 px-3 py-3 transition-all sm:w-24 sm:flex-col sm:py-4",
            item.userHasVoted
              ? "border-violet-400 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_18px_44px_-16px_rgba(168,85,247,0.85)]"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-2)] hover:-translate-y-0.5 hover:border-violet-400/60 hover:bg-violet-500/10 hover:text-violet-300",
            voting && "cursor-not-allowed opacity-70",
          )}
        >
          {voting ? (
            <Loader2 size={22} className="animate-spin" />
          ) : (
            <ArrowUp size={22} strokeWidth={2.6} />
          )}
          <span className="font-mono text-[22px] font-bold tabular-nums leading-none sm:text-[26px]">
            {item.voteCount}
          </span>
          <span className="hidden text-[9.5px] font-bold uppercase tracking-widest opacity-80 sm:block">
            votos
          </span>

          <AnimatePresence>
            {pop ? (
              <motion.span
                initial={{ scale: 0.5, opacity: 0.55 }}
                animate={{ scale: 1.7, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 rounded-2xl bg-violet-400/70"
              />
            ) : null}
          </AnimatePresence>
        </motion.button>

        {/* Contenido */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest ring-1 ring-inset",
                t.bg,
                t.color,
                t.ring,
              )}
            >
              <t.Icon size={9} strokeWidth={2.4} />
              {t.label}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                s.cls,
              )}
            >
              <s.Icon size={9} strokeWidth={2.4} />
              {s.label}
            </span>
            {isHot ? <HotBadge /> : null}
            {item.attachmentCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-3)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-2)]">
                <ImageIcon size={9} strokeWidth={2.4} />
                {item.attachmentCount}
              </span>
            ) : null}
            {item.isMine ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-300 ring-1 ring-inset ring-violet-500/30">
                <UserCircle2 size={9} strokeWidth={2.4} />
                Tuya
              </span>
            ) : null}
          </div>

          <h2 className="mt-2 text-lg font-bold leading-tight tracking-tight text-[var(--color-text-1)] sm:text-xl">
            {item.title}
          </h2>

          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.p
                key="d"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="mt-2 overflow-hidden whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text-2)]"
              >
                {item.description}
              </motion.p>
            ) : (
              <p
                className="mt-1.5 line-clamp-2 cursor-pointer text-[12.5px] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
                onClick={() => setExpanded(true)}
              >
                {item.description}
              </p>
            )}
          </AnimatePresence>

          <footer className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--color-text-3)]">
            <AuthorAvatar name={item.userName} highlight={isCurrentUser} size="md" />
            <span className="font-semibold text-[var(--color-text-2)]">
              {item.userName ?? "Anónimo"}
            </span>
            <span>·</span>
            <span>{relativeShort(item.createdAt)}</span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto text-[11.5px] font-semibold text-violet-300 hover:underline"
            >
              {expanded ? "Ocultar detalle" : "Ver detalle"}
            </button>
          </footer>
        </div>
      </div>
    </article>
  );
}

function SugerenciaCard({
  item,
  voting,
  pop,
  rank,
  votePct,
  isCurrentUser,
  onVote,
}: {
  item: Sugerencia;
  voting: boolean;
  pop: boolean;
  rank: number | undefined;
  votePct: number;
  isCurrentUser: boolean;
  onVote: () => void;
}) {
  const t = TYPE_META[item.type];
  const s = STATUS_META[item.status];
  const isImplemented = item.status === "implementado";
  const isHot = !isImplemented && item.voteCount >= HOT_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const podium = rank != null ? PODIUM_META[rank] : null;

  return (
    <article
      className={cn(
        "group relative flex items-stretch gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-all sm:p-4",
        "hover:-translate-y-0.5 hover:border-violet-400/40 hover:shadow-[0_18px_42px_-18px_rgba(168,85,247,0.45)]",
        isImplemented &&
          "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.04] to-transparent",
        podium && "ring-1 ring-inset",
        podium?.ring,
        podium?.glow,
      )}
    >
      {/* Podium medal */}
      {podium ? (
        <div
          className="pointer-events-none absolute -left-2 -top-2 select-none text-2xl drop-shadow-md"
          title={podium.label}
          aria-label={podium.label}
        >
          {podium.medal}
        </div>
      ) : null}

      {/* Botón voto */}
      <motion.button
        type="button"
        onClick={onVote}
        disabled={voting || isImplemented}
        aria-pressed={item.userHasVoted}
        aria-label={item.userHasVoted ? "Quitar voto" : "Votar"}
        animate={pop ? { scale: [1, 1.15, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={cn(
          "relative flex w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1.5 py-2.5 transition-all sm:w-16",
          item.userHasVoted
            ? "border-violet-500 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_10px_24px_-10px_rgba(168,85,247,0.75)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-violet-400/60 hover:bg-violet-500/10 hover:text-violet-300",
          (voting || isImplemented) && "cursor-not-allowed opacity-70",
        )}
      >
        {voting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ArrowUp size={18} strokeWidth={2.6} />
        )}
        <span className="font-mono text-[14px] font-bold tabular-nums leading-none sm:text-[15px]">
          {item.voteCount}
        </span>

        <AnimatePresence>
          {pop ? (
            <motion.span
              initial={{ scale: 0.4, opacity: 0.6 }}
              animate={{ scale: 1.6, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 rounded-xl bg-violet-400/60"
            />
          ) : null}
        </AnimatePresence>
      </motion.button>

      {/* Contenido */}
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="min-w-0 flex-1 text-left"
          >
            <h3
              className={cn(
                "text-[14px] font-bold leading-snug text-[var(--color-text-1)] transition-colors hover:text-violet-300 sm:text-[15px]",
                isImplemented && "text-[var(--color-text-2)] line-through decoration-emerald-500/40",
              )}
            >
              {item.title}
            </h3>
          </button>
        </header>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase tracking-widest ring-1 ring-inset",
              t.bg,
              t.color,
              t.ring,
            )}
          >
            <t.Icon size={9} strokeWidth={2.4} />
            {t.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset",
              s.cls,
            )}
          >
            <s.Icon size={9} strokeWidth={2.4} />
            {s.label}
          </span>
          {isHot ? <HotBadge /> : null}
          {item.attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-3)] px-2 py-0.5 font-semibold text-[var(--color-text-2)]">
              <ImageIcon size={9} strokeWidth={2.4} />
              {item.attachmentCount}
            </span>
          ) : null}
          {item.isMine ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 font-semibold text-violet-300 ring-1 ring-inset ring-violet-500/30">
              <UserCircle2 size={9} strokeWidth={2.4} />
              Tuya
            </span>
          ) : null}
        </div>

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
              className="mt-1.5 line-clamp-1 cursor-pointer text-[12.5px] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
              onClick={() => setExpanded(true)}
            >
              {item.description}
            </p>
          )}
        </AnimatePresence>

        <footer className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-3)]">
          <AuthorAvatar name={item.userName} highlight={isCurrentUser} />
          <span className="font-medium text-[var(--color-text-2)]">
            {item.userName ?? "Anónimo"}
          </span>
          <span>·</span>
          <span>{relativeShort(item.createdAt)}</span>
          {expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ml-auto text-[11px] font-semibold text-violet-300 hover:underline"
            >
              Ocultar
            </button>
          ) : null}
        </footer>
        <div className="sugerencia-vote-bar mt-2">
          <div
            className="sugerencia-vote-bar-fill"
            style={{ width: `${Math.max(votePct, item.voteCount > 0 ? 4 : 0)}%` }}
            aria-hidden
          />
        </div>
      </div>
    </article>
  );
}

function HotBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500/25 to-red-500/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-orange-200 ring-1 ring-inset ring-orange-500/40">
      <Flame size={9} strokeWidth={2.4} className="ccmgc-pulse-dot" />
      Hot
    </span>
  );
}

function AuthorAvatar({
  name,
  highlight,
  size = "sm",
}: {
  name: string | null;
  highlight?: boolean;
  size?: "sm" | "md";
}) {
  const initials = initialsOf(name);
  const hue = hashHue(name ?? "?");
  const sizeCls = size === "md" ? "h-7 w-7 text-[11px]" : "h-5 w-5 text-[8.5px]";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-inset shadow-sm",
        highlight ? "ring-violet-400" : "ring-white/10",
        sizeCls,
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 65% 45%) 0%, hsl(${(hue + 40) % 360} 65% 35%) 100%)`,
      }}
    >
      {initials}
    </span>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="relative h-[88px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <Skeleton className="absolute inset-0 rounded-none" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  onCreate,
  filter,
  hasSearch,
}: {
  onCreate: () => void;
  filter: FilterKey;
  hasSearch: boolean;
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-6 py-12 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface-3)] text-[var(--color-text-3)]">
          <Search size={20} />
        </span>
        <p className="text-base font-bold text-[var(--color-text-1)]">
          Sin resultados para tu búsqueda
        </p>
        <p className="mt-1 max-w-sm text-[12.5px] text-[var(--color-text-3)]">
          Prueba con otras palabras o cambia el filtro. También puedes
          proponer una nueva sugerencia.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/30"
        >
          <MessageSquarePlus size={13} strokeWidth={2.4} />
          Proponer ahora
        </button>
      </div>
    );
  }

  const msg: Record<FilterKey, { title: string; sub: string }> = {
    top: {
      title: "Aún no hay sugerencias para votar",
      sub: "Sé el primero en proponer una idea o una mejora. El equipo de desarrollo prioriza por votos del centro.",
    },
    pendientes: {
      title: "Nada en estudio por ahora",
      sub: "Cuando alguien proponga una idea o mejora aparecerá aquí mientras se valora.",
    },
    recientes: {
      title: "Sin novedades recientes",
      sub: "Las últimas ideas o mejoras propuestas aparecerán aquí.",
    },
    implementadas: {
      title: "Nada implementado todavía",
      sub: "Cuando el equipo de desarrollo cierre una propuesta como implementada aparecerá aquí.",
    },
    mias: {
      title: "Aún no has propuesto nada",
      sub: "Cuéntanos qué te ayudaría en tu día a día. ¡Es la mejor forma de mejorar la app!",
    },
  };
  const m = msg[filter];
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-6 py-16 text-center">
      <div
        className="pointer-events-none absolute -top-12 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.6) 0%, transparent 70%)",
        }}
      />
      <span className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/25 ring-1 ring-inset ring-violet-500/30">
        <Lightbulb size={28} className="text-violet-300" />
      </span>
      <p className="relative text-base font-bold text-[var(--color-text-1)]">{m.title}</p>
      <p className="relative mt-1 max-w-sm text-[12.5px] text-[var(--color-text-3)]">{m.sub}</p>
      <button
        type="button"
        onClick={onCreate}
        className="relative mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 px-5 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/40"
      >
        <MessageSquarePlus size={14} strokeWidth={2.4} />
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

function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
