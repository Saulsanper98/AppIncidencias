"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertOctagon,
  Bus,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ClipboardList,
  Inbox,
  Loader2,
  MapPin,
  Monitor,
  Radio,
  RotateCcw,
  Router,
  ScanLine,
  Save,
  User,
  Wrench,
  X,
} from "lucide-react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { AnomalousBusesBanner } from "@/components/inventory/AnomalousBusesBanner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { InlineCalendar } from "@/components/ui/inline-calendar";
import { KpiPill } from "@/components/ui/kpi-pill";
import { ModalShell } from "@/components/ui/modal-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Calendario de revisiones preventivas (mantenimiento programado).
 *
 * Vista mensual clásica (Lun-Dom × 6 filas = 42 celdas). Cada celda muestra
 * el día, una banda con el número de tareas y hasta 2 chips de tareas con
 * resumen rápido. Más de 2 tareas → enlace "Ver N tareas" abre un popover.
 *
 * Lateral derecho: backlog = tareas pendientes sin fecha asignada. Permite
 * reasignar fecha desde la propia página (PATCH a /api/maintenance/tasks).
 *
 * No usamos librerías de calendario; basta `Date` + UTC. El sistema soporta
 * navegar entre meses (← / →) y volver a "Hoy".
 */

type Task = {
  id: string;
  busId: string;
  operator: string | null;
  municipio: string | null;
  assetType: "validadora" | "sae" | "router" | "pantalla";
  reason: string;
  status: "pendiente" | "programada" | "completada" | "cancelada";
  scheduledAt: string | null;
  createdAt: string;
  assignedToUserId: string | null;
  assignedToUserName: string | null;
};

type CalendarResponse = {
  from: string;
  to: string;
  scheduled: Task[];
  backlog: Task[];
};

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function statusColor(status: Task["status"]): string {
  switch (status) {
    case "completada":
      return "bg-[var(--color-success-light)] text-[var(--color-success)] ring-[var(--color-success)]/30";
    case "cancelada":
      return "bg-[var(--color-surface-2)] text-[var(--color-text-3)] ring-[var(--color-border)] line-through";
    case "programada":
      return "bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-[var(--color-accent)]/30";
    default:
      return "bg-[var(--color-warning-light)] text-[var(--color-warning)] ring-[var(--color-warning)]/30";
  }
}

const ASSET_LABEL: Record<Task["assetType"], string> = {
  validadora: "Validadora",
  sae: "SAE",
  router: "Router",
  pantalla: "Pantalla",
};

const ASSET_ICON: Record<Task["assetType"], typeof Wrench> = {
  validadora: ScanLine,
  sae: Radio,
  router: Router,
  pantalla: Monitor,
};

const ASSET_TONE: Record<Task["assetType"], { dot: string; chip: string; header: string }> = {
  validadora: {
    dot: "bg-sky-400",
    chip: "border-sky-400/30 bg-sky-500/10 text-sky-300",
    header: "from-sky-500/20 via-sky-500/5 to-transparent",
  },
  sae: {
    dot: "bg-violet-400",
    chip: "border-violet-400/30 bg-violet-500/10 text-violet-300",
    header: "from-violet-500/20 via-violet-500/5 to-transparent",
  },
  router: {
    dot: "bg-emerald-400",
    chip: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    header: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  pantalla: {
    dot: "bg-amber-400",
    chip: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    header: "from-amber-500/20 via-amber-500/5 to-transparent",
  },
};

const ALL_ASSETS: Task["assetType"][] = ["validadora", "sae", "router", "pantalla"];
const ALL_STATUSES: Task["status"][] = ["pendiente", "programada", "completada", "cancelada"];

type AssetFilter = Task["assetType"] | "all";
type StatusFilter = Task["status"] | "all";

export default function PreventivoPage() {
  const [viewMode, setViewMode] = useState<"mes" | "semana">("mes");
  const [cursorYear, setCursorYear] = useState(() => new Date().getUTCFullYear());
  const [cursorMonth, setCursorMonth] = useState(() => new Date().getUTCMonth());
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [dayOverflowPopoverKey, setDayOverflowPopoverKey] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const monthParam = useMemo(
    () => `${cursorYear}-${String(cursorMonth + 1).padStart(2, "0")}`,
    [cursorYear, cursorMonth],
  );
  const monthKey = monthParam;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/preventive/calendar?month=${monthParam}`, { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudo cargar el calendario");
        return;
      }
      setData((await res.json()) as CalendarResponse);
    } catch {
      setError("No se pudo cargar el calendario");
    } finally {
      setLoading(false);
    }
  }, [monthParam]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedDayKey(null);
    setDayOverflowPopoverKey(null);
  }, [monthKey]);

  /** Genera la rejilla de 42 días (6 semanas, comenzando en lunes). */
  const grid = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(cursorYear, cursorMonth, 1));
    // Día de la semana 0=Domingo .. 6=Sábado. Lo convertimos a base lunes:
    // 0=Lunes, 6=Domingo.
    const dow = (firstOfMonth.getUTCDay() + 6) % 7;
    const start = new Date(firstOfMonth);
    start.setUTCDate(firstOfMonth.getUTCDate() - dow);
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      days.push({ date: d, inMonth: d.getUTCMonth() === cursorMonth });
    }
    return days;
  }, [cursorYear, cursorMonth]);

  /** Aplica los filtros activos (por tipo de activo y estado). */
  const applyFilters = useCallback(
    (list: Task[]) =>
      list.filter(
        (t) =>
          (assetFilter === "all" || t.assetType === assetFilter) &&
          (statusFilter === "all" || t.status === statusFilter),
      ),
    [assetFilter, statusFilter],
  );

  /** Agrupamos las tareas programadas por día (ISO yyyy-mm-dd), ya filtradas. */
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    const filtered = applyFilters(data?.scheduled ?? []);
    for (const t of filtered) {
      if (!t.scheduledAt) continue;
      const key = t.scheduledAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [data?.scheduled, applyFilters]);

  const filteredBacklog = useMemo(
    () => applyFilters(data?.backlog ?? []),
    [data?.backlog, applyFilters],
  );

  const weekDays = useMemo(() => {
    const baseDate = selectedDayKey ? new Date(`${selectedDayKey}T00:00:00Z`) : new Date();
    const start = new Date(baseDate);
    const dow = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - dow);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      days.push(d);
    }
    return days;
  }, [selectedDayKey]);

  /** KPIs del mes (sobre los datos sin filtros, para no mentir al usuario). */
  const monthKpis = useMemo(() => {
    const scheduled = data?.scheduled ?? [];
    const backlog = data?.backlog ?? [];
    const todayKey = ymd(new Date());
    const overdue = scheduled.filter(
      (t) =>
        t.scheduledAt &&
        t.scheduledAt.slice(0, 10) < todayKey &&
        (t.status === "pendiente" || t.status === "programada"),
    ).length;
    const completed = scheduled.filter((t) => t.status === "completada").length;
    const upcoming = scheduled.filter(
      (t) =>
        t.scheduledAt &&
        t.scheduledAt.slice(0, 10) >= todayKey &&
        (t.status === "pendiente" || t.status === "programada"),
    ).length;
    return {
      scheduled: scheduled.length,
      backlog: backlog.length,
      completed,
      overdue,
      upcoming,
    };
  }, [data]);

  const filtersDirty = assetFilter !== "all" || statusFilter !== "all";

  /** Pico de carga (tareas/día) en el mes visible — usado por el heatmap. */
  const maxLoad = useMemo(() => {
    let max = 0;
    tasksByDay.forEach((arr) => {
      if (arr.length > max) max = arr.length;
    });
    return max;
  }, [tasksByDay]);

  const handleReschedule = useCallback(
    async (task: Task, isoDate: string) => {
      setRescheduling(true);
      try {
        const res = await fetch("/api/maintenance/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: task.id,
            scheduledAt: isoDate ? new Date(`${isoDate}T09:00:00.000Z`).toISOString() : null,
            status: task.status === "pendiente" && isoDate ? "programada" : task.status,
          }),
        });
        if (res.ok) {
          await load();
          setActiveTask(null);
          setRescheduleValue("");
        }
      } finally {
        setRescheduling(false);
      }
    },
    [load],
  );

  /** Cambia el estado de una tarea (completar / cancelar / reabrir). */
  const handleStatusChange = useCallback(
    async (task: Task, nextStatus: Task["status"]) => {
      setRescheduling(true);
      try {
        const res = await fetch("/api/maintenance/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: task.id, status: nextStatus }),
        });
        if (res.ok) {
          await load();
          setActiveTask(null);
          setRescheduleValue("");
        }
      } finally {
        setRescheduling(false);
      }
    },
    [load],
  );

  const handleDayDrop = useCallback(
    async (isoDate: string) => {
      if (!draggingTaskId) return;
      const task = filteredBacklog.find((t) => t.id === draggingTaskId);
      setDraggingTaskId(null);
      if (!task) return;
      await handleReschedule(task, isoDate);
    },
    [draggingTaskId, filteredBacklog, handleReschedule],
  );

  const goPrev = () => {
    const m = cursorMonth - 1;
    if (m < 0) {
      setCursorMonth(11);
      setCursorYear((y) => y - 1);
    } else {
      setCursorMonth(m);
    }
  };
  const goNext = () => {
    const m = cursorMonth + 1;
    if (m > 11) {
      setCursorMonth(0);
      setCursorYear((y) => y + 1);
    } else {
      setCursorMonth(m);
    }
  };
  const goToday = () => {
    const now = new Date();
    setCursorYear(now.getUTCFullYear());
    setCursorMonth(now.getUTCMonth());
  };

  const todayKey = ymd(new Date());

  return (
    <div className="space-y-4">
      <div className="ccmgc-slide-down">
        <AnomalousBusesBanner />
      </div>
      {/* HERO del mes */}
      <section className="tickets-hero-glow relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-accent-light)]/30 p-4 shadow-sm sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/25">
              <CalendarDays size={20} className="text-[var(--color-accent)]" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="ccmgc-eyebrow dashboard-pretitle">
                <span className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
                Mantenimiento programado
              </div>
              <h1 className="dashboard-hero-title mt-1 flex items-center gap-2">
                Calendario preventivo
                <FeedbackTargetButton id="preventivo/calendario" label="Calendario preventivo" />
              </h1>
              <p className="mt-1 text-[12.5px] text-[var(--color-text-3)]">
                Planifica las revisiones recurrentes y rebalancea cargas entre técnicos.
              </p>
            </div>
          </div>

          {/* Navegación de mes */}
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-1 shadow-sm backdrop-blur-sm">
            <div className="mr-1 inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/70 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("mes")}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                  viewMode === "mes"
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                Mes
              </button>
              <button
                type="button"
                onClick={() => setViewMode("semana")}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                  viewMode === "semana"
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                Semana
              </button>
            </div>
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={14} aria-hidden />
            </button>
            <span className="min-w-[140px] text-center text-[13px] font-semibold capitalize text-[var(--color-text-1)]">
              {MONTH_LABELS[cursorMonth]} {cursorYear}
            </span>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={14} aria-hidden />
            </button>
            <span className="mx-1 h-5 w-px bg-[var(--color-border)]" aria-hidden />
            <button
              type="button"
              onClick={goToday}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)]"
              title="Volver a hoy"
            >
              <RotateCcw size={11} aria-hidden />
              Hoy
            </button>
          </div>
        </div>

        {/* KPIs del mes */}
        <dl className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiPill
            layout="stacked"
            icon={<ClipboardList size={12} aria-hidden />}
            label="Programadas"
            value={monthKpis.scheduled}
            tone="accent"
          />
          <KpiPill
            layout="stacked"
            icon={<Inbox size={12} aria-hidden />}
            label="Sin fecha"
            value={monthKpis.backlog}
            tone={monthKpis.backlog > 0 ? "warning" : "neutral"}
          />
          <KpiPill
            layout="stacked"
            icon={<AlertOctagon size={12} aria-hidden />}
            label="Vencidas"
            value={monthKpis.overdue}
            tone={monthKpis.overdue > 0 ? "error" : "neutral"}
            hint={monthKpis.overdue > 0 ? "Sin completar en su fecha" : undefined}
          />
          <KpiPill
            layout="stacked"
            icon={<CheckCircle2 size={12} aria-hidden />}
            label="Completadas"
            value={monthKpis.completed}
            tone="success"
          />
        </dl>
      </section>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            Tipo
          </span>
          <FilterChip
            label="Todos"
            active={assetFilter === "all"}
            onClick={() => setAssetFilter("all")}
          />
          {ALL_ASSETS.map((a) => {
            const Icon = ASSET_ICON[a];
            return (
              <FilterChip
                key={a}
                label={ASSET_LABEL[a]}
                icon={<Icon size={11} aria-hidden />}
                tone={a}
                active={assetFilter === a}
                onClick={() => setAssetFilter(a)}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            Estado
          </span>
          <FilterChip
            label="Todos"
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          {ALL_STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              capitalize
            />
          ))}
          {filtersDirty ? (
            <button
              type="button"
              onClick={() => {
                setAssetFilter("all");
                setStatusFilter("all");
              }}
              className="filter-chip filter-chip--active"
              title="Quitar filtros"
            >
              <X size={10} aria-hidden /> Limpiar
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <ErrorState
          icon={AlertCircle}
          title="No se pudo cargar el calendario"
          hint={error}
          onRetry={() => void load()}
          compact
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Calendario */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 sm:p-3">
          {viewMode === "semana" ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                Agenda semanal (arrastra desde "Sin fecha")
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                {weekDays.map((date) => {
                  const key = ymd(date);
                  const tasks = tasksByDay.get(key) ?? [];
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => void handleDayDrop(key)}
                      className={cn(
                        "min-h-[8rem] rounded-lg border p-2",
                        isToday
                          ? "border-[var(--color-accent)]/55 bg-[var(--color-accent-light)]/35"
                          : "border-[var(--color-border)] bg-[var(--color-surface-2)]/35",
                      )}
                    >
                      <p className="text-[11px] font-semibold text-[var(--color-text-2)]">
                        {DAY_LABELS[(date.getUTCDay() + 6) % 7]} {date.getUTCDate()}
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {tasks.length === 0 ? (
                          <li className="rounded border border-dashed border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-text-3)]">
                            Suelta aquí una tarea
                          </li>
                        ) : (
                          tasks.slice(0, 4).map((task) => (
                            <li key={task.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTask(task);
                                  setRescheduleValue(task.scheduledAt?.slice(0, 10) ?? "");
                                }}
                                className={cn(
                                  "w-full truncate rounded px-2 py-1 text-left text-[10.5px] font-medium ring-1",
                                  statusColor(task.status),
                                )}
                              >
                                {task.busId} · {ASSET_LABEL[task.assetType]}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Vista AGENDA para movil: lista vertical de los dias con tareas
              del mes en curso. Mucho mas legible que un grid 7x6 a 320px. */}
          <ul
            key={monthKey}
            className={cn("preventivo-calendar-month space-y-2 md:hidden", viewMode !== "mes" && "hidden")}
          >
            {(() => {
              const days = grid
                .filter((d) => d.inMonth)
                .map((d) => ({
                  ...d,
                  tasks: tasksByDay.get(ymd(d.date)) ?? [],
                  key: ymd(d.date),
                }));
              const withTasks = days.filter((d) => d.tasks.length > 0);
              if (loading && !data) {
                return Array.from({ length: 5 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="h-20 rounded-lg" />
                  </li>
                ));
              }
              if (withTasks.length === 0) {
                return (
                  <li>
                    <EmptyState
                      compact
                      icon={CalendarDays}
                      title="Sin revisiones este mes"
                      hint="No hay revisiones programadas en el calendario actual."
                      className="rounded-lg border border-dashed border-[var(--color-border)]"
                    />
                  </li>
                );
              }
              return withTasks.map(({ date, tasks, key }) => {
                const isToday = key === todayKey;
                const isSelected = selectedDayKey === key;
                const dia = date.getUTCDate();
                const dow = (date.getUTCDay() + 6) % 7;
                return (
                  <li
                    key={key}
                    className={cn(
                      "rounded-xl border bg-[var(--color-surface)] p-2.5 transition-[box-shadow,ring-color] duration-300",
                      isSelected
                        ? "border-[var(--color-accent)]/55 ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface)]"
                        : isToday
                          ? "border-[var(--color-accent)]/55 bg-[var(--color-accent-light)]/40 ring-1 ring-[var(--color-accent)]/30"
                          : "border-[var(--color-border)]",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold tabular-nums",
                            isToday
                              ? "bg-[var(--color-accent)] text-white"
                              : "bg-[var(--color-surface-2)] text-[var(--color-text-1)]",
                          )}
                        >
                          {dia}
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                            {DAY_LABELS[dow]} {MONTH_LABELS[date.getUTCMonth()].slice(0, 3)}
                          </p>
                          <p className="text-[12.5px] font-semibold text-[var(--color-text-1)]">
                            {tasks.length} revisi{tasks.length === 1 ? "ón" : "ones"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {tasks.map((task) => {
                        const tone = ASSET_TONE[task.assetType];
                        return (
                          <li key={task.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTask(task);
                                setRescheduleValue(task.scheduledAt?.slice(0, 10) ?? "");
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium ring-1 transition-all active:scale-[0.98]",
                                statusColor(task.status),
                              )}
                            >
                              <span
                                className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-semibold">{task.busId}</span>{" "}
                                <span className="text-[var(--color-text-3)]">
                                  · {ASSET_LABEL[task.assetType]}
                                </span>
                              </span>
                              <ChevronRight
                                size={13}
                                className="shrink-0 text-[var(--color-text-3)]"
                                aria-hidden
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              });
            })()}
          </ul>

          {/* Cabecera de dias - solo desktop. */}
          <div
            className={cn(
              "mb-2 hidden grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-widest md:grid",
              viewMode !== "mes" && "md:hidden",
            )}
          >
            {DAY_LABELS.map((d, i) => {
              const isWeekendCol = i === 5 || i === 6;
              return (
                <span
                  key={d}
                  className={cn(
                    isWeekendCol ? "text-[var(--color-accent)]/70" : "text-[var(--color-text-3)]",
                  )}
                >
                  {d}
                </span>
              );
            })}
          </div>
          {loading && !data ? (
            <div className={cn("hidden grid-cols-7 gap-1 md:grid", viewMode !== "mes" && "md:hidden")}>
              {Array.from({ length: 42 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-md" />
              ))}
            </div>
          ) : (
            <div
              key={monthKey}
              className={cn(
                "preventivo-calendar-month hidden grid-cols-7 gap-1 md:grid",
                viewMode !== "mes" && "md:hidden",
              )}
            >
              {grid.map(({ date, inMonth }, idx) => {
                const key = ymd(date);
                const dayTasks = tasksByDay.get(key) ?? [];
                const isToday = key === todayKey;
                const isSelected = selectedDayKey === key;
                const colInWeek = idx % 7;
                const isWeekendCol = colInWeek === 5 || colInWeek === 6;
                // Heatmap suave: 0..maxLoad → opacity 0..18%
                const load = dayTasks.length;
                const heatOpacity = maxLoad > 0 ? Math.min(0.22, (load / maxLoad) * 0.22) : 0;
                const heatBg =
                  inMonth && load > 0
                    ? `linear-gradient(180deg, color-mix(in srgb, var(--color-accent) ${Math.round(
                        heatOpacity * 100,
                      )}%, transparent), color-mix(in srgb, var(--color-accent) ${Math.round(
                        heatOpacity * 60,
                      )}%, transparent))`
                    : undefined;
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={inMonth ? 0 : -1}
                    onDragOver={(e) => {
                      if (!inMonth) return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!inMonth) return;
                      e.preventDefault();
                      void handleDayDrop(key);
                    }}
                    onClick={() => {
                      if (!inMonth) return;
                      setSelectedDayKey(key);
                      setDayOverflowPopoverKey(null);
                    }}
                    onKeyDown={(e) => {
                      if (!inMonth) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDayKey(key);
                        setDayOverflowPopoverKey(null);
                      }
                    }}
                    className={cn(
                      "group relative flex h-24 flex-col rounded-md border p-1.5 transition-[box-shadow,ring-color,ring-width] duration-300",
                      load > 0 && `ccmgc-stagger-in ccmgc-stagger-in-${(idx % 6) + 1}`,
                      inMonth
                        ? "cursor-pointer border-[var(--color-border)] bg-[var(--color-surface)]"
                        : "border-transparent bg-[var(--color-surface-2)]/30 text-[var(--color-text-3)]",
                      inMonth && isWeekendCol && "bg-[var(--color-surface-2)]/50",
                      isSelected &&
                        "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface)] shadow-[0_0_0_3px_var(--color-accent-light)]",
                      isToday &&
                        !isSelected &&
                        "preventivo-today-ring-pulse ring-2 ring-[var(--color-accent)]/60 ring-offset-2 ring-offset-[var(--color-surface)]",
                    )}
                    style={heatBg ? { backgroundImage: heatBg } : undefined}
                  >
                    {/* Encabezado de la celda */}
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-[20px] items-center justify-center text-[11px] font-semibold tabular-nums",
                          isToday
                            ? "rounded-full bg-[var(--color-accent)] px-1.5 text-white shadow"
                            : inMonth
                              ? isWeekendCol
                                ? "text-[var(--color-text-1)]"
                                : "text-[var(--color-text-2)]"
                              : "text-[var(--color-text-3)]",
                        )}
                      >
                        {date.getUTCDate()}
                      </span>
                      {load > 0 ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 text-[9px] font-bold tabular-nums leading-4",
                            load >= Math.max(3, maxLoad)
                              ? "bg-[var(--color-accent)] text-white"
                              : "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
                          )}
                          title={`${load} tarea${load === 1 ? "" : "s"} en este día`}
                        >
                          {load}
                        </span>
                      ) : null}
                    </div>

                    {/* Lista de chips por tarea */}
                    <div className="space-y-0.5 overflow-hidden">
                      {dayTasks.slice(0, 2).map((task) => {
                        const tone = ASSET_TONE[task.assetType];
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTask(task);
                              setRescheduleValue(task.scheduledAt?.slice(0, 10) ?? "");
                            }}
                            className={cn(
                              "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ring-1 transition-all hover:-translate-y-px hover:shadow-sm",
                              statusColor(task.status),
                            )}
                            title={`${task.busId} · ${ASSET_LABEL[task.assetType]} · ${task.reason}`}
                          >
                            <span
                              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)}
                              aria-hidden
                            />
                            <span className="truncate">
                              {task.busId} · {ASSET_LABEL[task.assetType]}
                            </span>
                          </button>
                        );
                      })}
                      {dayTasks.length > 2 ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDayOverflowPopoverKey((prev) => (prev === key ? null : key));
                            }}
                            className="block text-[10px] font-medium text-[var(--color-accent)] hover:underline"
                            aria-expanded={dayOverflowPopoverKey === key}
                          >
                            +{dayTasks.length - 2} más
                          </button>
                          {dayOverflowPopoverKey === key ? (
                            <div
                              role="menu"
                              className="absolute bottom-full left-0 z-30 mb-1 min-w-[10rem] max-w-[14rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                                {dayTasks.slice(2).map((task) => {
                                  const tone = ASSET_TONE[task.assetType];
                                  return (
                                    <li key={task.id}>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          setActiveTask(task);
                                          setRescheduleValue(task.scheduledAt?.slice(0, 10) ?? "");
                                          setDayOverflowPopoverKey(null);
                                        }}
                                        className={cn(
                                          "flex w-full items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[10px] font-medium transition-colors hover:bg-[var(--color-surface-2)]",
                                          statusColor(task.status),
                                        )}
                                        title={`${task.busId} · ${ASSET_LABEL[task.assetType]} · ${task.reason}`}
                                      >
                                        <span
                                          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)}
                                          aria-hidden
                                        />
                                        <span className="truncate">
                                          {task.busId} · {ASSET_LABEL[task.assetType]}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Leyenda — solo desktop: en movil cada chip de la agenda ya
              lleva su propio color y la del calendario clasico no aplica. */}
          <div
            className={cn(
              "mt-3 hidden flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2 text-[10px] text-[var(--color-text-3)] md:flex",
              viewMode !== "mes" && "md:hidden",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold uppercase tracking-widest">Activos</span>
              {ALL_ASSETS.map((a) => (
                <span key={a} className="inline-flex items-center gap-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full", ASSET_TONE[a].dot)} aria-hidden />
                  {ASSET_LABEL[a]}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold uppercase tracking-widest">Carga</span>
              <span className="text-[9px]">menos</span>
              <span className="inline-flex gap-0.5">
                {[0.05, 0.1, 0.15, 0.2, 0.25].map((op) => (
                  <span
                    key={op}
                    className="h-2.5 w-3 rounded-[2px] border border-[var(--color-border)]"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--color-accent) ${Math.round(op * 100)}%, transparent)`,
                    }}
                    aria-hidden
                  />
                ))}
              </span>
              <span className="text-[9px]">más</span>
            </div>
          </div>
        </section>

        {/* Backlog: tareas sin fecha asignada, agrupadas por tipo y ordenadas por antigüedad */}
        <aside className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-1)]">
              <Inbox size={14} className="text-[var(--color-text-3)]" aria-hidden />
              Sin fecha
              <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--color-text-2)]">
                {filteredBacklog.length}
              </span>
              {filtersDirty && filteredBacklog.length !== (data?.backlog.length ?? 0) ? (
                <span className="text-[10px] font-normal text-[var(--color-text-3)]">
                  de {data?.backlog.length ?? 0}
                </span>
              ) : null}
            </h2>
            <span
              className="text-[10px] text-[var(--color-text-3)]"
              title="Más antigua primero"
            >
              ↑ Antigüedad
            </span>
          </div>

          {loading && !data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : filteredBacklog.length === 0 ? (
            <EmptyState
              compact
              icon={CheckCircle2}
              title={
                filtersDirty
                  ? "Ningún backlog coincide con los filtros."
                  : "Todo lo pendiente tiene fecha asignada."
              }
              hint={filtersDirty ? "Prueba con otros filtros o quítalos." : "El backlog está al día."}
              actionLabel={filtersDirty ? "Quitar filtros" : undefined}
              onAction={
                filtersDirty
                  ? () => {
                      setAssetFilter("all");
                      setStatusFilter("all");
                    }
                  : undefined
              }
              className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30"
            />
          ) : (
            <div className="space-y-3">
              <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/25 px-2 py-1 text-[10px] text-[var(--color-text-3)]">
                Arrastra una tarea y suéltala sobre un día del calendario o de la agenda semanal.
              </p>
              {(() => {
                const groups = new Map<Task["assetType"], Task[]>();
                ALL_ASSETS.forEach((a) => groups.set(a, []));
                for (const t of filteredBacklog) {
                  groups.get(t.assetType)?.push(t);
                }
                groups.forEach((arr) =>
                  arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
                );
                return ALL_ASSETS.map((assetType) => {
                  const arr = groups.get(assetType) ?? [];
                  if (arr.length === 0) return null;
                  const Icon = ASSET_ICON[assetType];
                  const tone = ASSET_TONE[assetType];
                  return (
                    <div key={assetType}>
                      <div className="mb-1 flex items-center gap-1.5 px-0.5">
                        <span
                          className={cn(
                            "inline-flex h-5 w-5 items-center justify-center rounded ring-1",
                            tone.chip,
                          )}
                        >
                          <Icon size={11} aria-hidden />
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-2)]">
                          {ASSET_LABEL[assetType]}
                        </span>
                        <span className="text-[10px] tabular-nums text-[var(--color-text-3)]">
                          ({arr.length})
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {arr.map((task) => {
                          const ageDays = daysSinceIso(task.createdAt);
                          const ageTone =
                            ageDays >= 30
                              ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)] text-[var(--color-error)]"
                              : ageDays >= 14
                                ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                                : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]";
                          return (
                            <li
                              key={task.id}
                              draggable
                              onDragStart={() => setDraggingTaskId(task.id)}
                              onDragEnd={() => setDraggingTaskId(null)}
                              className={cn(
                                "group rounded-lg border bg-[var(--color-surface-2)]/60 p-2 transition-all hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-surface-2)]",
                                "border-[var(--color-border)]",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTask(task);
                                  setRescheduleValue("");
                                }}
                                className="block w-full text-left"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="flex items-center gap-1 text-xs font-semibold text-[var(--color-text-1)]">
                                    <Bus
                                      size={11}
                                      className="text-[var(--color-text-3)]"
                                      aria-hidden
                                    />
                                    {task.busId}
                                  </p>
                                  <span
                                    className={cn(
                                      "shrink-0 rounded-full border px-1.5 py-px text-[9.5px] font-semibold",
                                      ageTone,
                                    )}
                                    title={`Creada el ${new Date(task.createdAt).toLocaleDateString("es-ES")}`}
                                  >
                                    {ageDays === 0 ? "Hoy" : `${ageDays} d`}
                                  </span>
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--color-text-3)]">
                                  {task.reason}
                                </p>
                                {task.assignedToUserName ? (
                                  <p className="mt-0.5 text-[10px] text-[var(--color-text-3)]">
                                    Asignado a {task.assignedToUserName}
                                  </p>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </aside>
      </div>

      {/* Modal premium de detalle / acciones. */}
      {activeTask ? (() => {
        const Icon = ASSET_ICON[activeTask.assetType];
        const tone = ASSET_TONE[activeTask.assetType];
        const closed = activeTask.status === "completada" || activeTask.status === "cancelada";
        const currentIso = activeTask.scheduledAt?.slice(0, 10) ?? "";
        const safePickerValue = rescheduleValue || currentIso || ymd(new Date());
        const dirty = rescheduleValue && rescheduleValue !== currentIso;
        return (
          <ModalShell
            open
            onClose={() => setActiveTask(null)}
            variant="sheet"
            maxWidth="32rem"
            className="overflow-hidden shadow-2xl"
            title={
              <PreventivoTaskModalTitle
                task={activeTask}
                icon={<Icon size={20} strokeWidth={1.6} aria-hidden />}
                tone={tone}
              />
            }
            footer={
              <>
                {closed ? (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(activeTask, "pendiente")}
                    disabled={rescheduling}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                  >
                    <RotateCcw size={12} aria-hidden /> Reabrir
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(activeTask, "completada")}
                      disabled={rescheduling}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-success)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      <CheckCircle2 size={12} aria-hidden /> Completar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(activeTask, "cancelada")}
                      disabled={rescheduling}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                    >
                      <X size={12} aria-hidden /> Cancelar
                    </button>
                    {activeTask.scheduledAt ? (
                      <button
                        type="button"
                        onClick={() => handleReschedule(activeTask, "")}
                        disabled={rescheduling}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                        title="Quitar fecha (vuelve al backlog)"
                      >
                        <Inbox size={12} aria-hidden /> Al backlog
                      </button>
                    ) : null}
                  </div>
                )}
                {!closed ? (
                  <button
                    type="button"
                    onClick={() => handleReschedule(activeTask, rescheduleValue)}
                    disabled={rescheduling || !dirty}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                  >
                    {rescheduling ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : (
                      <Save size={12} aria-hidden />
                    )}
                    {currentIso ? "Reprogramar" : "Programar"}
                  </button>
                ) : null}
              </>
            }
          >
            <div className="space-y-4">
              {/* Motivo / contexto */}
              <div
                className={cn(
                  "relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-gradient-to-br p-3.5",
                  tone.header,
                )}
              >
                <p className="text-[13px] leading-relaxed text-[var(--color-text-1)]">{activeTask.reason}</p>
              </div>

              {/* Ficha rápida */}
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoCell icon={<Bus size={12} aria-hidden />} label="Bus">
                  <span className="font-semibold text-[var(--color-text-1)]">{activeTask.busId}</span>
                  {activeTask.operator ? (
                    <span className="text-[var(--color-text-3)]"> · {activeTask.operator}</span>
                  ) : null}
                </InfoCell>
                {activeTask.municipio ? (
                  <InfoCell icon={<MapPin size={12} aria-hidden />} label="Municipio">
                    {activeTask.municipio}
                  </InfoCell>
                ) : null}
                <InfoCell icon={<User size={12} aria-hidden />} label="Técnico">
                  {activeTask.assignedToUserName ?? (
                    <span className="text-[var(--color-text-3)]">Sin asignar</span>
                  )}
                </InfoCell>
                <InfoCell icon={<Clock size={12} aria-hidden />} label="Programada">
                  {activeTask.scheduledAt
                    ? new Date(activeTask.scheduledAt).toLocaleString("es-ES", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Sin fecha"}
                </InfoCell>
              </dl>

                {!closed ? (
                  <>
                    {/* Selección de fecha (InlineCalendar + quick pills) */}
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-2.5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                          Reprogramar
                        </span>
                        <div className="flex flex-wrap gap-1">
                          <QuickPill onClick={() => setRescheduleValue(ymd(new Date()))} label="Hoy" />
                          <QuickPill
                            onClick={() => setRescheduleValue(addDaysIso(1))}
                            label="Mañana"
                          />
                          <QuickPill
                            onClick={() => setRescheduleValue(addDaysIso(7))}
                            label="+7 d"
                          />
                          <QuickPill
                            onClick={() => setRescheduleValue(addDaysIso(15))}
                            label="+15 d"
                          />
                        </div>
                      </div>
                      <InlineCalendar
                        value={safePickerValue}
                        onChange={(iso) => setRescheduleValue(iso)}
                        allowFuture
                        dotColor="violet"
                        dotsMap={(() => {
                          const m: Record<string, number> = {};
                          tasksByDay.forEach((arr, k) => {
                            m[k] = arr.length;
                          });
                          return m;
                        })()}
                      />
                      {dirty ? (
                        <p className="mt-2 text-[11px] text-[var(--color-accent)]">
                          Nueva fecha:{" "}
                          <strong>
                            {new Date(`${rescheduleValue}T00:00:00`).toLocaleDateString("es-ES", {
                              weekday: "long",
                              day: "2-digit",
                              month: "long",
                            })}
                          </strong>
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2 text-[12px] text-[var(--color-text-3)]">
                    Esta tarea ya está <strong className="capitalize">{activeTask.status}</strong>. Puedes reabrirla si necesitas volver a programarla.
                  </p>
                )}
            </div>
          </ModalShell>
        );
      })() : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponentes locales

function PreventivoTaskModalTitle({
  task,
  icon,
  tone,
}: {
  task: Task;
  icon: React.ReactNode;
  tone: (typeof ASSET_TONE)[Task["assetType"]];
}) {
  return (
    <div className="flex w-full min-w-0 items-start gap-3 pr-1">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1",
          tone.chip,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
          <span>Preventivo</span>
          <span aria-hidden className="text-[var(--color-text-3)]/60">
            ·
          </span>
          <span className={cn("rounded-full border px-1.5 py-px normal-case tracking-normal", tone.chip)}>
            {ASSET_LABEL[task.assetType]}
          </span>
        </p>
        <p className="mt-1 break-words text-[17px] font-semibold leading-tight tracking-tight text-[var(--color-text-1)]">
          {task.busId}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
          statusColor(task.status),
        )}
      >
        {task.status}
      </span>
    </div>
  );
}

function InfoCell({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
        <span className="text-[var(--color-text-3)]">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-[12.5px] leading-snug text-[var(--color-text-2)]">{children}</dd>
    </div>
  );
}

function QuickPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
    >
      {label}
    </button>
  );
}

function addDaysIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Días transcurridos desde un ISO (string) hasta hoy, sin tener en cuenta horas. */
function daysSinceIso(iso: string): number {
  const a = new Date(iso);
  const b = new Date();
  const ad = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bd = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.max(0, Math.round((bd - ad) / 86_400_000));
}

function FilterChip({
  label,
  icon,
  active,
  capitalize,
  tone,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  capitalize?: boolean;
  tone?: Task["assetType"];
  onClick: () => void;
}) {
  const assetTone = tone ? ASSET_TONE[tone] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        active
          ? assetTone
            ? cn(assetTone.chip, "ring-1 ring-inset")
            : "border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-sm"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]",
        capitalize && "capitalize",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
