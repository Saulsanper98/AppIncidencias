"use client";

import { ArrowRight, CalendarClock, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AgendaTask = {
  id: string;
  busId: string;
  assetType: string;
  reason: string;
  scheduledAt: string | null;
  technician: string;
};

function getUrgency(scheduledAt: string | null): "overdue" | "soon" | "ok" {
  if (!scheduledAt) return "ok";
  const diff = new Date(scheduledAt).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff <= 2 * 60 * 60 * 1000) return "soon";
  return "ok";
}

function formatTime(iso: string | null): string {
  if (!iso) return "Sin hora";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const URGENCY_STYLE = {
  overdue: {
    border: "var(--color-error)",
    dot: "bg-[var(--color-error)] animate-pulse",
    time: "text-[var(--color-error)] font-semibold",
    label: "Vencida",
    labelCls: "text-[var(--color-error)]",
  },
  soon: {
    border: "var(--color-warning)",
    dot: "bg-[var(--color-warning)]",
    time: "text-[var(--color-warning)] font-semibold",
    label: "Próxima",
    labelCls: "text-[var(--color-warning)]",
  },
  ok: {
    border: "var(--color-success)",
    dot: "bg-[var(--color-success)]",
    time: "text-[var(--color-text-2)]",
    label: "",
    labelCls: "",
  },
} as const;

export function DashboardPreventiveAgenda() {
  const router = useRouter();
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await fetch("/api/maintenance/today", { cache: "no-store" });
      if (!res.ok) {
        setMessage(res.status === 401 ? "Inicia sesión para ver la agenda." : "No se pudo cargar la agenda.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { tasks: AgendaTask[] };
      setTasks(data.tasks);
      setLoading(false);
    };
    void load();
  }, []);

  return (
    <article className="ccmgc-card flex min-h-[220px] flex-col p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-light)]">
          <CalendarClock size={14} className="text-[var(--color-accent)]" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Agenda de hoy</h3>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
          ))}
        </div>
      ) : message ? (
        <p className="text-sm text-[var(--color-text-3)]">{message}</p>
      ) : tasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-2 text-center">
          {/* Ilustración minimal: tres trazos curvos representando "día libre",
            * más sobrio que el icono de check anterior. */}
          <svg
            aria-hidden
            viewBox="0 0 80 56"
            className="mb-3 h-12 w-20 text-[var(--color-text-3)]/30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          >
            <path d="M6 12h68" />
            <path d="M6 28h44" opacity="0.6" />
            <path d="M6 44h24" opacity="0.35" />
            <circle cx="64" cy="40" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            <path d="M60 40l3 3 6-7" stroke="var(--color-success)" strokeWidth="1.75" opacity="0.85" />
          </svg>
          <p className="text-sm font-medium text-[var(--color-text-1)]">Agenda libre</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-3)]">No hay mantenimientos programados</p>
          <button
            type="button"
            onClick={() => router.push("/inventory")}
            className="mt-3 inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
          >
            Ver inventario <ArrowRight size={11} strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.slice(0, 4).map((task) => {
            const urgency = getUrgency(task.scheduledAt);
            const s = URGENCY_STYLE[urgency];
            return (
              <div
                key={task.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
                style={{ borderLeftWidth: "3px", borderLeftColor: s.border }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--color-text-1)]">
                      {task.busId} · {task.assetType}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-3)]">{task.technician}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-3)]">{task.reason}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`flex items-center gap-1 text-xs ${s.time}`}>
                      <Clock size={10} />
                      {formatTime(task.scheduledAt)}
                    </span>
                    {s.label && <span className={`text-[10px] font-semibold ${s.labelCls}`}>{s.label}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/tickets?busId=${encodeURIComponent(task.busId)}`)}
                  className="mt-2 flex items-center gap-1 text-xs text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
                >
                  Ver tarea <ArrowRight size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
