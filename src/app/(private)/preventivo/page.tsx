"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bus,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  MapPin,
  RotateCcw,
  Save,
  Wrench,
  X,
} from "lucide-react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { SectionTabs } from "@/components/ui/section-tabs";
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

export default function PreventivoPage() {
  const [cursorYear, setCursorYear] = useState(() => new Date().getUTCFullYear());
  const [cursorMonth, setCursorMonth] = useState(() => new Date().getUTCMonth());
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

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

  /** Agrupamos las tareas programadas por día (ISO yyyy-mm-dd). */
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of data?.scheduled ?? []) {
      if (!t.scheduledAt) continue;
      const key = t.scheduledAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [data?.scheduled]);

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
      <SectionTabs preset="inventory" />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-[var(--color-accent)]" aria-hidden />
          <h1 className="text-heading">Calendario preventivo</h1>
          <FeedbackTargetButton id="preventivo/calendario" label="Calendario preventivo" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-[var(--color-text-1)]">
            {MONTH_LABELS[cursorMonth]} {cursorYear}
          </span>
          <button
            type="button"
            onClick={goNext}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2 py-1 text-xs font-medium text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
            title="Volver a hoy"
          >
            <RotateCcw size={11} className="mr-1 inline" aria-hidden />
            Hoy
          </button>
        </div>
      </header>

      {error ? (
        <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Calendario */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
            {DAY_LABELS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {loading && !data ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 42 }, (_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-md bg-[var(--color-surface-2)]/60"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {grid.map(({ date, inMonth }) => {
                const key = ymd(date);
                const dayTasks = tasksByDay.get(key) ?? [];
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex h-24 flex-col rounded-md border p-1.5 transition-colors",
                      inMonth
                        ? "border-[var(--color-border)] bg-[var(--color-surface)]"
                        : "border-transparent bg-[var(--color-surface-2)]/30 text-[var(--color-text-3)]",
                      isToday && "ring-2 ring-[var(--color-accent)]/60",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "text-[11px] font-semibold tabular-nums",
                          isToday
                            ? "rounded-full bg-[var(--color-accent)] px-1.5 text-white"
                            : inMonth
                              ? "text-[var(--color-text-2)]"
                              : "text-[var(--color-text-3)]",
                        )}
                      >
                        {date.getUTCDate()}
                      </span>
                      {dayTasks.length > 0 ? (
                        <span className="text-[9px] font-semibold text-[var(--color-text-3)]">
                          {dayTasks.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-0.5 overflow-hidden">
                      {dayTasks.slice(0, 2).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => {
                            setActiveTask(task);
                            setRescheduleValue(task.scheduledAt?.slice(0, 10) ?? "");
                          }}
                          className={cn(
                            "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ring-1 transition-colors hover:opacity-90",
                            statusColor(task.status),
                          )}
                          title={`${task.busId} · ${ASSET_LABEL[task.assetType]} · ${task.reason}`}
                        >
                          {task.busId} · {ASSET_LABEL[task.assetType]}
                        </button>
                      ))}
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
        </section>

        {/* Backlog: tareas sin fecha asignada */}
        <aside className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-1)]">
            <Inbox size={14} className="text-[var(--color-text-3)]" aria-hidden />
            Sin fecha ({data?.backlog.length ?? 0})
          </h2>
          {loading && !data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-[var(--color-surface-2)]/60" />
              ))}
            </div>
          ) : (data?.backlog.length ?? 0) === 0 ? (
            <p className="text-xs text-[var(--color-text-3)]">
              Todo lo pendiente tiene fecha asignada.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data!.backlog.map((task) => (
                <li
                  key={task.id}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTask(task);
                      setRescheduleValue("");
                    }}
                    className="block w-full text-left"
                  >
                    <p className="flex items-center gap-1 text-xs font-semibold text-[var(--color-text-1)]">
                      <Bus size={11} className="text-[var(--color-text-3)]" aria-hidden />
                      {task.busId} · {ASSET_LABEL[task.assetType]}
                    </p>
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
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Dialogo de detalle / reprogramación. */}
      {activeTask ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="prev-task-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3
                id="prev-task-title"
                className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-1)]"
              >
                <Wrench size={16} className="text-[var(--color-accent)]" aria-hidden />
                {activeTask.busId} · {ASSET_LABEL[activeTask.assetType]}
              </h3>
              <button
                type="button"
                onClick={() => setActiveTask(null)}
                className="rounded p-1 text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)]"
                aria-label="Cerrar"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <p className="mb-2 text-sm text-[var(--color-text-2)]">{activeTask.reason}</p>
            <dl className="mb-3 space-y-1 text-xs text-[var(--color-text-3)]">
              <div className="flex items-center gap-1.5">
                <Bus size={11} aria-hidden /> {activeTask.busId}
                {activeTask.operator ? <span>· {activeTask.operator}</span> : null}
              </div>
              {activeTask.municipio ? (
                <div className="flex items-center gap-1.5">
                  <MapPin size={11} aria-hidden /> {activeTask.municipio}
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <Clock size={11} aria-hidden />
                {activeTask.scheduledAt
                  ? `Programada para ${new Date(activeTask.scheduledAt).toLocaleString("es-ES")}`
                  : "Sin fecha asignada"}
              </div>
              <div>
                Estado:{" "}
                <span
                  className={cn(
                    "ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1",
                    statusColor(activeTask.status),
                  )}
                >
                  {activeTask.status}
                </span>
              </div>
              {activeTask.assignedToUserName ? (
                <div>Técnico: {activeTask.assignedToUserName}</div>
              ) : null}
            </dl>
            <label className="block text-xs font-medium text-[var(--color-text-2)]">
              Reprogramar fecha
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="date"
                  value={rescheduleValue}
                  onChange={(e) => setRescheduleValue(e.target.value)}
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-text-1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                />
                <button
                  type="button"
                  onClick={() => handleReschedule(activeTask, rescheduleValue)}
                  disabled={rescheduling || rescheduleValue === (activeTask.scheduledAt?.slice(0, 10) ?? "")}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                >
                  {rescheduling ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                  ) : (
                    <Save size={12} aria-hidden />
                  )}
                  Guardar
                </button>
                {activeTask.scheduledAt ? (
                  <button
                    type="button"
                    onClick={() => handleReschedule(activeTask, "")}
                    disabled={rescheduling}
                    className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                    title="Quitar fecha (volver al backlog)"
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
