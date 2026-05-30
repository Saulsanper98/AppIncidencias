"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  Wrench,
  X,
} from "lucide-react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { AnomalousBusesBanner } from "@/components/inventory/AnomalousBusesBanner";
import { InlineCalendar } from "@/components/ui/inline-calendar";
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

const ASSET_TONE: Record<Task["assetType"], { dot: string; chip: string }> = {
  validadora: {
    dot: "bg-sky-400",
    chip: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  },
  sae: {
    dot: "bg-violet-400",
    chip: "border-violet-400/30 bg-violet-500/10 text-violet-300",
  },
  router: {
    dot: "bg-emerald-400",
    chip: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  },
  pantalla: {
    dot: "bg-amber-400",
    chip: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  },
};

const ALL_ASSETS: Task["assetType"][] = ["validadora", "sae", "router", "pantalla"];
const ALL_STATUSES: Task["status"][] = ["pendiente", "programada", "completada", "cancelada"];

type AssetFilter = Task["assetType"] | "all";
type StatusFilter = Task["status"] | "all";

export default function PreventivoPage() {
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

  const monthParam = useMemo(
    () => `${cursorYear}-${String(cursorMonth + 1).padStart(2, "0")}`,
    [cursorYear, cursorMonth],
  );

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
      <AnomalousBusesBanner />
      {/* HERO del mes */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-accent-light)]/30 p-5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/25">
              <CalendarDays size={20} className="text-[var(--color-accent)]" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--color-text-3)]">
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-semibold">
                  CCMGC
                </span>
                Mantenimiento programado
              </div>
              <h1 className="mt-0.5 flex items-center gap-2 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]">
                Calendario preventivo
                <FeedbackTargetButton id="preventivo/calendario" label="Calendario preventivo" />
              </h1>
              <p className="text-[12.5px] text-[var(--color-text-3)]">
                Planifica las revisiones recurrentes y rebalancea cargas entre técnicos.
              </p>
            </div>
          </div>

          {/* Navegación de mes */}
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-1 shadow-sm backdrop-blur-sm">
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
          <KpiTile
            icon={<ClipboardList size={12} aria-hidden />}
            label="Programadas"
            value={monthKpis.scheduled}
            tone="accent"
          />
          <KpiTile
            icon={<Inbox size={12} aria-hidden />}
            label="Sin fecha"
            value={monthKpis.backlog}
            tone={monthKpis.backlog > 0 ? "warning" : "neutral"}
          />
          <KpiTile
            icon={<AlertOctagon size={12} aria-hidden />}
            label="Vencidas"
            value={monthKpis.overdue}
            tone={monthKpis.overdue > 0 ? "error" : "neutral"}
            hint={monthKpis.overdue > 0 ? "Sin completar en su fecha" : undefined}
          />
          <KpiTile
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
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10.5px] text-[var(--color-text-3)] transition-colors hover:text-[var(--color-error)]"
              title="Quitar filtros"
            >
              <X size={10} aria-hidden /> Limpiar
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Calendario */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-widest">
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
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 42 }, (_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-md bg-[var(--color-surface-2)]/60"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {grid.map(({ date, inMonth }, idx) => {
                const key = ymd(date);
                const dayTasks = tasksByDay.get(key) ?? [];
                const isToday = key === todayKey;
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
                    className={cn(
                      "group relative flex h-24 flex-col rounded-md border p-1.5 transition-all",
                      inMonth
                        ? "border-[var(--color-border)] bg-[var(--color-surface)]"
                        : "border-transparent bg-[var(--color-surface-2)]/30 text-[var(--color-text-3)]",
                      inMonth && isWeekendCol && "bg-[var(--color-surface-2)]/50",
                      isToday &&
                        "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface)] shadow-[0_0_0_3px_var(--color-accent-light)]",
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
                            onClick={() => {
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
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTask(dayTasks[2]);
                            setRescheduleValue(dayTasks[2].scheduledAt?.slice(0, 10) ?? "");
                          }}
                          className="block text-[10px] font-medium text-[var(--color-accent)] hover:underline"
                        >
                          +{dayTasks.length - 2} más
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Leyenda */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2 text-[10px] text-[var(--color-text-3)]">
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
                <div key={i} className="h-12 animate-pulse rounded-md bg-[var(--color-surface-2)]/60" />
              ))}
            </div>
          ) : filteredBacklog.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-3 py-6 text-center">
              <CheckCircle2
                size={20}
                className="mx-auto mb-1 text-[var(--color-success)]"
                aria-hidden
              />
              <p className="text-[12px] text-[var(--color-text-2)]">
                {filtersDirty
                  ? "Ningún backlog coincide con los filtros."
                  : "Todo lo pendiente tiene fecha asignada."}
              </p>
              {filtersDirty ? (
                <button
                  type="button"
                  onClick={() => {
                    setAssetFilter("all");
                    setStatusFilter("all");
                  }}
                  className="mt-2 text-[11px] font-medium text-[var(--color-accent)] hover:underline"
                >
                  Quitar filtros
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prev-task-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveTask(null);
            }}
          >
            <div className="ccmgc-daily-pop-in w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
              {/* Cabecera con tono del activo */}
              <div
                className={cn(
                  "relative flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3",
                  tone.chip,
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1",
                    tone.chip,
                  )}
                >
                  <Icon size={18} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-80">
                    <span className="font-bold">Preventivo</span>
                    <span aria-hidden>•</span>
                    <span className="capitalize">{ASSET_LABEL[activeTask.assetType]}</span>
                  </div>
                  <h3
                    id="prev-task-title"
                    className="mt-0.5 truncate text-[16px] font-semibold tracking-tight text-[var(--color-text-1)]"
                  >
                    {activeTask.busId}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[var(--color-text-2)]">
                    {activeTask.reason}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTask(null)}
                  className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                  aria-label="Cerrar"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>

              {/* Cuerpo */}
              <div className="space-y-3 px-4 py-3">
                {/* Meta: bus / operador / municipio / estado */}
                <div className="grid grid-cols-1 gap-1.5 text-[12px] sm:grid-cols-2">
                  <MetaRow icon={<Bus size={11} aria-hidden />}>
                    {activeTask.busId}
                    {activeTask.operator ? (
                      <span className="text-[var(--color-text-3)]"> · {activeTask.operator}</span>
                    ) : null}
                  </MetaRow>
                  {activeTask.municipio ? (
                    <MetaRow icon={<MapPin size={11} aria-hidden />}>{activeTask.municipio}</MetaRow>
                  ) : null}
                  <MetaRow icon={<Clock size={11} aria-hidden />}>
                    {activeTask.scheduledAt
                      ? new Date(activeTask.scheduledAt).toLocaleString("es-ES", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "Sin fecha asignada"}
                  </MetaRow>
                  <MetaRow icon={<Wrench size={11} aria-hidden />}>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ring-1",
                        statusColor(activeTask.status),
                      )}
                    >
                      {activeTask.status}
                    </span>
                    {activeTask.assignedToUserName ? (
                      <span className="text-[var(--color-text-3)]">
                        {" "}
                        · {activeTask.assignedToUserName}
                      </span>
                    ) : null}
                  </MetaRow>
                </div>

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

              {/* Footer de acciones */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-4 py-2.5">
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
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                  >
                    {rescheduling ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : (
                      <Save size={12} aria-hidden />
                    )}
                    {currentIso ? "Reprogramar" : "Programar"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponentes locales

type KpiTone = "neutral" | "accent" | "warning" | "success" | "error";

function KpiTile({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: KpiTone;
}) {
  const toneCls =
    tone === "accent"
      ? "ring-[var(--color-accent)]/25 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
      : tone === "warning"
        ? "ring-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : tone === "success"
          ? "ring-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
          : tone === "error"
            ? "ring-[var(--color-error)]/30 bg-[var(--color-error-light)] text-[var(--color-error)]"
            : "ring-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]";
  return (
    <div className={cn("flex flex-col rounded-lg px-3 py-2 ring-1", toneCls)}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest opacity-90">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-1">
        <span className="text-[18px] font-bold tabular-nums text-[var(--color-text-1)]">{value}</span>
        {hint ? (
          <span className="truncate text-[10px] opacity-80" title={hint}>
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MetaRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[var(--color-text-2)]">
      <span className="text-[var(--color-text-3)]">{icon}</span>
      <span className="truncate">{children}</span>
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
