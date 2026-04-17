"use client";

import { CalendarClock, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type AgendaTask = {
  id: string;
  busId: string;
  assetType: string;
  reason: string;
  scheduledAt: string | null;
  technician: string;
};

export function DashboardPreventiveAgenda() {
  const router = useRouter();
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const getUrgencyBorder = (scheduledAt: string | null) => {
    if (!scheduledAt) return "border-l-[var(--color-success)]";
    const now = Date.now();
    const scheduled = new Date(scheduledAt).getTime();
    if (scheduled < now) return "border-l-[var(--color-error)]";
    if (Math.abs(scheduled - now) <= 2 * 60 * 60 * 1000) return "border-l-[var(--color-warning)]";
    return "border-l-[var(--color-success)]";
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const response = await fetch("/api/maintenance/today", { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) {
        if (response.status === 401) {
          setMessage("Inicia sesion para ver la agenda preventiva de hoy.");
        } else {
          setMessage("No se pudo cargar agenda preventiva.");
        }
        setLoading(false);
        return;
      }
      const data = JSON.parse(text) as { tasks: AgendaTask[] };
      setTasks(data.tasks);
      setMessage(null);
      setLoading(false);
    };

    load();
  }, []);

  return (
    <article className="min-h-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-[var(--color-text-3)]" />
        <h3 className="text-subheading">Agenda preventiva de hoy</h3>
      </div>

      {loading ? (
        <div className="mt-4 h-32 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
      ) : message ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-3)]">
          <Info size={14} />
          <span>{message}</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CalendarClock size={36} className="mb-3 text-[var(--color-text-3)]" />
          <p className="text-sm font-medium text-[var(--color-text-2)]">Agenda libre hoy</p>
          <p className="mt-1 text-caption">Sin mantenimientos programados</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {tasks.slice(0, 4).map((task) => (
            <div
              key={task.id}
              className={`rounded-lg border border-[var(--color-border)] border-l-4 bg-[var(--color-surface-2)] p-3 text-sm ${getUrgencyBorder(task.scheduledAt)}`}
            >
              <p className="font-medium text-[var(--color-text-1)]">
                {task.busId} — {task.assetType}
              </p>
              <p className="text-caption">{task.technician}</p>
              <p className="text-caption">
                {task.scheduledAt ? new Date(task.scheduledAt).toLocaleTimeString("es-ES") : "Sin hora"} —{" "}
                {task.reason}
              </p>
              <div className="mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/tickets?busId=${encodeURIComponent(task.busId)}`)}
                >
                  Ir a tarea
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
