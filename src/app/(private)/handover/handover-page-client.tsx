"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  Eraser,
  FileText,
  Handshake,
  Loader2,
  Moon,
  Save,
  Send,
  Sparkles,
  Sunrise,
  Sunset,
  Trash2,
  UserCheck,
} from "lucide-react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { ShiftHeroCard } from "@/components/handover/ShiftHeroCard";
import { isUiUnificationEnabled } from "@/ui-unification/feature";
import { HandoverHeroUnified } from "@/ui-unification/heroes/HandoverHeroUnified";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { SectionTabs } from "@/components/ui/section-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { hapticMedium } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Pase de turno (handover) M / T / N.
 *
 * Dos zonas:
 *  1. Formulario para entregar el turno saliente (resumen, alertas, acciones
 *     pendientes y opcionalmente snapshot de tickets abiertos).
 *  2. Listado cronológico de pases previos. Cada uno se puede firmar
 *     ("acuso de recibo") por el turno entrante o eliminar si aún no se ha
 *     firmado (autor o gestor).
 */

type Handover = {
  id: string;
  shiftDate: string;
  shift: "M" | "T" | "N";
  authorId: string | null;
  authorName: string | null;
  summary: string;
  alerts: string | null;
  pendingActions: string | null;
  openTickets: { id: string; title: string; busId: string; priority: string; status: string }[] | null;
  createdAt: string;
  acknowledgedById: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  wasMine?: boolean;
};

type TimelineTab = "all" | "unacked" | "mine";

const SHIFT_LABEL: Record<Handover["shift"], string> = {
  M: "Mañana",
  T: "Tarde",
  N: "Noche",
};
const SHIFT_ICON: Record<Handover["shift"], typeof Sunrise> = {
  M: Sunrise,
  T: Sunset,
  N: Moon,
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const HANDOVER_DRAFT_KEY = "ccmgc_handover_draft_v1";

type HandoverDraft = {
  shiftDate: string;
  shift: "M" | "T" | "N";
  summary: string;
  alerts: string;
  pendingActions: string;
  includeSnapshot: boolean;
  savedAt: number;
};

function formatRelativeShort(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 5) return "ahora mismo";
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(hours / 24);
  return `hace ${days}d`;
}

function currentShiftFromHour(hour: number): "M" | "T" | "N" {
  if (hour >= 6 && hour < 14) return "M";
  if (hour >= 14 && hour < 22) return "T";
  return "N";
}

export default function HandoverPage() {
  const [items, setItems] = useState<Handover[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shiftDate, setShiftDate] = useState<string>(() => todayYmd());
  const [shift, setShift] = useState<"M" | "T" | "N">(() => currentShiftFromHour(new Date().getHours()));
  const [summary, setSummary] = useState("");
  const [alerts, setAlerts] = useState("");
  const [pendingActions, setPendingActions] = useState("");
  const [includeSnapshot, setIncludeSnapshot] = useState(true);
  const [confirm, setConfirm] = useState<
    | { kind: "ack"; handover: Handover }
    | { kind: "del"; handover: Handover }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [showSavedFlash, setShowSavedFlash] = useState(false);
  const [draftNowTick, setDraftNowTick] = useState<number>(() => Date.now());
  const draftHydratedRef = useRef(false);
  const [actorId, setActorId] = useState<string | null>(null);
  const [tab, setTab] = useState<TimelineTab>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/handover?take=20", { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudieron cargar los pases");
        return;
      }
      const data = (await res.json()) as { items: Handover[]; actorId?: string };
      setItems(data.items ?? []);
      if (data.actorId) setActorId(data.actorId);
    } catch {
      setError("No se pudieron cargar los pases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Hidratar borrador desde localStorage al montar.
  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(HANDOVER_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<HandoverDraft>;
      if (typeof draft.summary === "string") setSummary(draft.summary);
      if (typeof draft.alerts === "string") setAlerts(draft.alerts);
      if (typeof draft.pendingActions === "string") setPendingActions(draft.pendingActions);
      if (typeof draft.includeSnapshot === "boolean") setIncludeSnapshot(draft.includeSnapshot);
      if (draft.shiftDate && /^\d{4}-\d{2}-\d{2}$/.test(draft.shiftDate)) setShiftDate(draft.shiftDate);
      if (draft.shift === "M" || draft.shift === "T" || draft.shift === "N") setShift(draft.shift);
      if (typeof draft.savedAt === "number") setDraftSavedAt(draft.savedAt);
    } catch {
      // ignorar JSON corrupto
    }
  }, []);

  // Auto-save del borrador (debounced 500ms).
  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const isDirty =
      summary.trim().length > 0 ||
      alerts.trim().length > 0 ||
      pendingActions.trim().length > 0;
    if (!isDirty) return;
    const t = window.setTimeout(() => {
      const draft: HandoverDraft = {
        shiftDate,
        shift,
        summary,
        alerts,
        pendingActions,
        includeSnapshot,
        savedAt: Date.now(),
      };
      try {
        window.localStorage.setItem(HANDOVER_DRAFT_KEY, JSON.stringify(draft));
        setDraftSavedAt(draft.savedAt);
        setShowSavedFlash(true);
      } catch {
        // localStorage lleno o no disponible
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [summary, alerts, pendingActions, includeSnapshot, shiftDate, shift]);

  // Tick para refrescar el "Guardado hace…".
  useEffect(() => {
    if (!draftSavedAt) return;
    const t = window.setInterval(() => setDraftNowTick(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [draftSavedAt]);

  useEffect(() => {
    if (!showSavedFlash) return;
    const t = window.setTimeout(() => setShowSavedFlash(false), 2200);
    return () => window.clearTimeout(t);
  }, [showSavedFlash]);

  const clearDraft = useCallback(() => {
    setSummary("");
    setAlerts("");
    setPendingActions("");
    setDraftSavedAt(null);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(HANDOVER_DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      setError("El resumen es obligatorio");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftDate,
          shift,
          summary: summary.trim(),
          alerts: alerts.trim() || null,
          pendingActions: pendingActions.trim() || null,
          includeSnapshot,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "No se pudo entregar el turno");
        return;
      }
      // Limpiamos los campos editables y el borrador; mantenemos fecha/turno
      // para entradas seguidas (p. ej. dos pases en el mismo día).
      setSummary("");
      setAlerts("");
      setPendingActions("");
      setDraftSavedAt(null);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(HANDOVER_DRAFT_KEY);
        } catch {
          /* ignore */
        }
      }
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const runAck = useCallback(
    async (h: Handover) => {
      setConfirmBusy(true);
      try {
        const res = await fetch(`/api/handover/${h.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "acknowledge" }),
        });
        if (res.ok) {
          hapticMedium();
          await load();
          setConfirm(null);
        } else {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          setError(data.message ?? "No se pudo firmar el pase");
        }
      } finally {
        setConfirmBusy(false);
      }
    },
    [load],
  );

  const runDelete = useCallback(
    async (h: Handover) => {
      setConfirmBusy(true);
      try {
        const res = await fetch(`/api/handover/${h.id}`, { method: "DELETE" });
        if (res.ok) {
          await load();
          setConfirm(null);
        } else {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          setError(data.message ?? "No se pudo eliminar el pase");
        }
      } finally {
        setConfirmBusy(false);
      }
    },
    [load],
  );

  const unacked = useMemo(
    () => (items ?? []).filter((h) => !h.acknowledgedAt),
    [items],
  );
  const mine = useMemo(
    () => (items ?? []).filter((h) => (actorId ? h.authorId === actorId : h.wasMine ?? false)),
    [items, actorId],
  );
  const visibleItems = useMemo(() => {
    if (tab === "unacked") return unacked;
    if (tab === "mine") return mine;
    return items ?? [];
  }, [tab, items, unacked, mine]);
  const lastHandoverAuthor = useMemo(() => (items ?? [])[0]?.authorName ?? null, [items]);

  return (
    <div className="space-y-5">
      {isUiUnificationEnabled() ? (
        <HandoverHeroUnified showSavedFlash={showSavedFlash} />
      ) : (
      <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-accent-light)]/30 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="ccmgc-eyebrow dashboard-pretitle">
              <span className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
              CCMGC · Operación
            </div>
            <SectionTabs
              preset="tickets"
              size="sm"
              className="relative z-[1] mb-0 mt-2 border-b-0 pb-0"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="dashboard-hero-title text-[22px] font-semibold leading-tight tracking-tight sm:text-[24px]">
                Pase de turno
              </h1>
              <FeedbackTargetButton id="handover" label="Pase de turno" />
              <AnimatePresence>
                {showSavedFlash ? (
                  <motion.span
                    key="saved"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-light)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-success)]"
                  >
                    <CheckCircle2 size={11} aria-hidden />
                    Guardado
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
              Entrega el turno saliente y consulta el historial de pases entre mañana, tarde y noche.
            </p>
          </div>
        </div>
      </header>
      )}

      <ShiftHeroCard unackedCount={unacked.length} authorOfLastHandover={lastHandoverAuthor} />

      {error ? (
        <ErrorState
          icon={AlertTriangle}
          title={error}
          hint="Revise los datos e inténtelo de nuevo."
          compact
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface-2)]/40 to-[var(--color-surface)] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)]">
              <Send size={15} aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-1)]">Entregar turno saliente</h2>
              <p className="text-[11px] text-[var(--color-text-3)]">
                Resume lo importante para el equipo que entra
              </p>
            </div>
          </div>
          {draftSavedAt ? (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-3)]">
              <Save size={12} className="text-[var(--color-success)]" aria-hidden />
              <span>
                Borrador guardado{" "}
                <span className="text-[var(--color-text-2)]">
                  {formatRelativeShort(draftNowTick - draftSavedAt)}
                </span>
              </span>
              <button
                type="button"
                onClick={clearDraft}
                className="ml-1 inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-error)]"
                title="Eliminar borrador guardado"
              >
                <Eraser size={10} aria-hidden /> Limpiar
              </button>
            </div>
          ) : null}
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {/* Bloque 0 · Fecha + turno + snapshot */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
              <Clock size={11} aria-hidden />
              Cuándo y qué turno
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
              <label className="block text-xs font-medium text-[var(--color-text-2)]">
                Fecha del turno
                <Input
                  type="date"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block text-xs font-medium text-[var(--color-text-2)]">
                Turno
                <Select
                  value={shift}
                  onChange={(e) => setShift(e.target.value as "M" | "T" | "N")}
                  className="mt-1"
                >
                  <option value="M">Mañana (M)</option>
                  <option value="T">Tarde (T)</option>
                  <option value="N">Noche (N)</option>
                </Select>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 self-end rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  includeSnapshot
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]",
                )}
              >
                <input
                  type="checkbox"
                  checked={includeSnapshot}
                  onChange={(e) => setIncludeSnapshot(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[var(--color-border)]"
                />
                <Database size={12} aria-hidden />
                Incluir snapshot tickets abiertos
              </label>
            </div>
          </div>

          {/* Bloque 1 · Resumen */}
          <FormBlock
            icon={<FileText size={14} aria-hidden />}
            tone="accent"
            number={1}
            title="Resumen del turno"
            description="Lo importante en 3-5 líneas. Decisiones tomadas, contexto general, qué ha pasado."
            required
            filled={summary.trim().length > 0}
          >
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="Ej. Tarde tranquila. Resueltos 4 tickets de validadora en Telde. Pendiente cambio de SAE bus 4521 mañana."
              maxLength={8000}
              required
            />
          </FormBlock>

          {/* Bloque 2 · Alertas */}
          <FormBlock
            icon={<AlertTriangle size={14} aria-hidden />}
            tone="warning"
            number={2}
            title="Alertas (cosas a vigilar)"
            description="Avisa al turno entrante de cualquier patrón sospechoso o riesgo activo."
            filled={alerts.trim().length > 0}
          >
            <Textarea
              value={alerts}
              onChange={(e) => setAlerts(e.target.value)}
              rows={2}
              placeholder="Ej. Bus 1023 con avería intermitente; conductor X reincidente con cambios de servicio…"
              maxLength={4000}
            />
          </FormBlock>

          {/* Bloque 3 · Acciones pendientes */}
          <FormBlock
            icon={<Sparkles size={14} aria-hidden />}
            tone="success"
            number={3}
            title="Acciones pendientes"
            description="Tareas concretas que el turno entrante debe atender."
            filled={pendingActions.trim().length > 0}
          >
            <Textarea
              value={pendingActions}
              onChange={(e) => setPendingActions(e.target.value)}
              rows={2}
              placeholder="Ej. Llamar a operadora X a las 16:00; revisar reset de SAE bus 4521 antes de salida; cerrar ticket 28A2."
              maxLength={4000}
            />
          </FormBlock>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
            <p className="text-[11px] text-[var(--color-text-3)]">
              {summary.trim().length === 0
                ? "Necesitas al menos un resumen para entregar el turno."
                : `Se entregará a las ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`}
            </p>
            <Button type="submit" variant="primary" size="sm" disabled={submitting || !summary.trim()}>
              {submitting ? (
                <span className="flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" aria-hidden /> Enviando…
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Send size={12} aria-hidden /> Entregar turno
                </span>
              )}
            </Button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface-2)]/40 to-[var(--color-surface)] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-3)]">
              <ClipboardList size={15} aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-1)]">Historial de pases</h2>
              <p className="text-[11px] text-[var(--color-text-3)]">
                Últimos {(items ?? []).length} registros, del más reciente al más antiguo
              </p>
            </div>
          </div>
          <div
            role="tablist"
            aria-label="Filtrar pases"
            className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5"
          >
            {(
              [
                { id: "all", label: "Todos", count: (items ?? []).length },
                { id: "unacked", label: "Por firmar", count: unacked.length },
                { id: "mine", label: "Mis pases", count: mine.length },
              ] as { id: TimelineTab; label: string; count: number }[]
            ).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                    active
                      ? "bg-[var(--color-accent)] text-white shadow"
                      : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                      active
                        ? "bg-white/20 text-white"
                        : t.id === "unacked" && t.count > 0
                          ? "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                          : "bg-[var(--color-surface-3)] text-[var(--color-text-3)]",
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="px-5 py-4">
          {loading && !items ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title={
                tab === "unacked"
                  ? "Sin pases pendientes"
                  : tab === "mine"
                    ? "Sin pases entregados"
                    : "Sin pases registrados"
              }
              hint={
                tab === "unacked"
                  ? "No hay pases pendientes de firmar."
                  : tab === "mine"
                    ? "Aún no has entregado ningún pase."
                    : tab === "all"
                      ? "Entrega el primero usando el formulario de arriba."
                      : "Todavía no hay pases registrados."
              }
              compact
            />
          ) : (
            <ol className="relative space-y-3">
              {visibleItems.map((h, i) => (
                <motion.li
                  key={h.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.22, ease: "easeOut" }}
                >
                  <HandoverTimelineCard
                    handover={h}
                    isMine={actorId ? h.authorId === actorId : h.wasMine ?? false}
                    onAck={() => setConfirm({ kind: "ack", handover: h })}
                    onDelete={() => setConfirm({ kind: "del", handover: h })}
                  />
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {typeof document !== "undefined" ? (
        <ModalShell
          open={confirm !== null}
          onClose={() => {
            if (!confirmBusy) setConfirm(null);
          }}
          maxWidth="28rem"
          title={
            confirm?.kind === "ack" ? (
              <span className="flex items-center gap-2">
                <UserCheck size={16} className="text-[var(--color-accent)]" aria-hidden />
                Firmar recepción del pase
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-[var(--color-error)]" aria-hidden />
                Eliminar pase de turno
              </span>
            )
          }
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={confirmBusy}
                className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirm) return;
                  if (confirm.kind === "ack") void runAck(confirm.handover);
                  else void runDelete(confirm.handover);
                }}
                disabled={confirmBusy}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-60",
                  confirm?.kind === "ack" ? "bg-[var(--color-accent)]" : "bg-[var(--color-error)]",
                )}
              >
                {confirmBusy ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : confirm?.kind === "ack" ? (
                  <UserCheck size={14} aria-hidden />
                ) : (
                  <Trash2 size={14} aria-hidden />
                )}
                {confirm?.kind === "ack" ? "Firmar" : "Eliminar"}
              </button>
            </>
          }
        >
          {confirm ? (
            <div className="text-[13px] text-[var(--color-text-2)]">
              <p>
                {confirm.kind === "ack"
                  ? "Estás a punto de firmar el pase de "
                  : "Estás a punto de eliminar el pase de "}
                <strong className="text-[var(--color-text-1)]">{SHIFT_LABEL[confirm.handover.shift]}</strong> del{" "}
                <strong className="text-[var(--color-text-1)]">{confirm.handover.shiftDate}</strong>
                {confirm.handover.authorName ? (
                  <>
                    {" "}
                    redactado por{" "}
                    <strong className="text-[var(--color-text-1)]">{confirm.handover.authorName}</strong>
                  </>
                ) : null}
                .
              </p>
              <p className="mt-2 line-clamp-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-2 text-[12px] text-[var(--color-text-3)]">
                {confirm.handover.summary}
              </p>
            </div>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}

const SHIFT_TONE: Record<
  Handover["shift"],
  { bar: string; iconBg: string; iconText: string; chip: string }
> = {
  M: {
    bar: "bg-gradient-to-b from-amber-400 to-yellow-500",
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-300",
    chip: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  },
  T: {
    bar: "bg-gradient-to-b from-orange-400 to-rose-500",
    iconBg: "bg-orange-500/15",
    iconText: "text-orange-300",
    chip: "bg-orange-500/15 text-orange-200 border-orange-400/30",
  },
  N: {
    bar: "bg-gradient-to-b from-indigo-400 to-violet-600",
    iconBg: "bg-indigo-500/15",
    iconText: "text-indigo-300",
    chip: "bg-indigo-500/15 text-indigo-200 border-indigo-400/30",
  },
};

function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeShortEs(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function HandoverTimelineCard({
  handover: h,
  isMine,
  onAck,
  onDelete,
}: {
  handover: Handover;
  isMine: boolean;
  onAck: () => void;
  onDelete: () => void;
}) {
  const Icon = SHIFT_ICON[h.shift];
  const tone = SHIFT_TONE[h.shift];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 transition-all",
        !h.acknowledgedAt && "ring-1 ring-[var(--color-warning)]/40",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", tone.bar)} />
      {/* Movil: avatar+texto arriba, botonera abajo para que las
          acciones no aplasten el resumen del pase. */}
      <div className="flex flex-col gap-3 px-4 py-3 pl-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
          {/* Avatar/Iniciales del autor */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold ring-1",
              tone.iconBg,
              tone.iconText,
              "ring-[var(--color-border)]",
            )}
            title={h.authorName ?? "Autor desconocido"}
          >
            {initialsOf(h.authorName)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
                  tone.chip,
                )}
              >
                <Icon size={11} aria-hidden />
                {SHIFT_LABEL[h.shift]}
              </span>
              <span className="text-[11.5px] font-medium text-[var(--color-text-2)]">{h.shiftDate}</span>
              <span className="text-[10.5px] text-[var(--color-text-3)]">·</span>
              <span className="text-[10.5px] text-[var(--color-text-3)]">
                {relativeShortEs(h.createdAt)}
              </span>
              {isMine ? (
                <span className="rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                  Tuyo
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-3)]">
              por <span className="text-[var(--color-text-2)]">{h.authorName ?? "—"}</span>
            </p>

            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[var(--color-text-1)]">
              {h.summary}
            </p>

            {h.alerts ? (
              <div className="mt-2 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-warning)]">
                  <AlertTriangle size={10} className="mr-1 inline" aria-hidden />
                  Alertas
                </p>
                <p className="mt-0.5 whitespace-pre-line text-[12px] text-[var(--color-text-2)]">
                  {h.alerts}
                </p>
              </div>
            ) : null}
            {h.pendingActions ? (
              <div className="mt-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-accent)]">
                  <Clock size={10} className="mr-1 inline" aria-hidden />
                  Acciones pendientes
                </p>
                <p className="mt-0.5 whitespace-pre-line text-[12px] text-[var(--color-text-2)]">
                  {h.pendingActions}
                </p>
              </div>
            ) : null}
            {h.openTickets && h.openTickets.length > 0 ? (
              <details className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2">
                <summary className="cursor-pointer text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-3)] hover:text-[var(--color-text-1)]">
                  <Database size={10} className="mr-1 inline" aria-hidden />
                  Snapshot tickets abiertos ({h.openTickets.length})
                </summary>
                <ul className="mt-1.5 space-y-0.5">
                  {h.openTickets.slice(0, 30).map((t) => (
                    <li key={t.id} className="text-[12px]">
                      <a
                        href={`/tickets/${t.id}`}
                        className="font-mono text-[var(--color-accent)] hover:underline"
                      >
                        {t.id.slice(-6).toUpperCase()}
                      </a>{" "}
                      <span className="text-[var(--color-text-2)]">· {t.title}</span>{" "}
                      <span className="text-[var(--color-text-3)]">
                        ({t.busId} · {t.priority} · {t.status})
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {h.acknowledgedAt ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]"
              title={`Firmado el ${new Date(h.acknowledgedAt).toLocaleString("es-ES")}`}
            >
              <CheckCircle2 size={10} aria-hidden />
              Firmado por {h.acknowledgedByName ?? "—"}
            </span>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-warning)]/70 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
              </span>
              Pendiente de firmar
            </div>
          )}
          {!h.acknowledgedAt && !isMine ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAck}
              title="Confirmar lectura del pase"
            >
              <UserCheck size={12} className="mr-1" aria-hidden /> Firmar recepción
            </Button>
          ) : null}
          {/* En tactil no hay "hover", asi que en movil mostramos el boton
              siempre con opacidad media para que sea accesible. En desktop
              mantenemos el patron original (aparece al hover de la fila). */}
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-[28px] items-center gap-1 rounded text-[10px] text-[var(--color-text-3)] opacity-70 transition-opacity hover:text-[var(--color-error)] focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            title="Eliminar pase"
          >
            <Trash2 size={10} aria-hidden /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

type FormBlockTone = "accent" | "warning" | "success";

const FORM_BLOCK_TONE: Record<
  FormBlockTone,
  { iconBg: string; iconText: string; ring: string; chip: string }
> = {
  accent: {
    iconBg: "bg-[var(--color-accent-light)]",
    iconText: "text-[var(--color-accent)]",
    ring: "ring-[var(--color-accent)]/15",
    chip: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  },
  warning: {
    iconBg: "bg-[var(--color-warning-light)]",
    iconText: "text-[var(--color-warning)]",
    ring: "ring-[var(--color-warning)]/15",
    chip: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  },
  success: {
    iconBg: "bg-[var(--color-success-light)]",
    iconText: "text-[var(--color-success)]",
    ring: "ring-[var(--color-success)]/15",
    chip: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  },
};

function FormBlock({
  icon,
  tone,
  number,
  title,
  description,
  required,
  filled,
  children,
}: {
  icon: React.ReactNode;
  tone: FormBlockTone;
  number: number;
  title: string;
  description: string;
  required?: boolean;
  filled?: boolean;
  children: React.ReactNode;
}) {
  const t = FORM_BLOCK_TONE[tone];
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 ring-1 transition-all duration-300",
        filled ? t.ring : "ring-transparent",
      )}
    >
      <div className="mb-2 flex items-start gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-300",
            filled
              ? cn("border-current bg-[var(--color-surface)] ring-2", t.iconText, t.ring)
              : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
          )}
          aria-hidden
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
              Paso {number}
            </span>
            {required ? (
              <span className={cn("rounded-full px-1.5 py-0 text-[9.5px] font-semibold", t.chip)}>
                Obligatorio
              </span>
            ) : (
              <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0 text-[9.5px] font-medium text-[var(--color-text-3)]">
                Opcional
              </span>
            )}
            {filled ? (
              <CheckCircle2 size={11} className="text-[var(--color-success)]" aria-hidden />
            ) : null}
          </div>
          <p className="mt-0.5 text-[13px] font-semibold text-[var(--color-text-1)]">{title}</p>
          <p className="text-[11.5px] text-[var(--color-text-3)]">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
