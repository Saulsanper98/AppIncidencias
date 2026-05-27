"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Handshake,
  Loader2,
  Mail,
  Send,
  Sunrise,
  Sunset,
  Trash2,
  UserCheck,
} from "lucide-react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SectionTabs } from "@/components/ui/section-tabs";
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
};

const SHIFT_LABEL: Record<Handover["shift"], string> = {
  M: "Mañana",
  T: "Tarde",
  N: "Noche",
};
const SHIFT_ICON: Record<Handover["shift"], typeof Sunrise> = {
  M: Sunrise,
  T: Sunset,
  N: Mail, // placeholder noche
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/handover?take=20", { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudieron cargar los pases");
        return;
      }
      const data = (await res.json()) as { items: Handover[] };
      setItems(data.items ?? []);
    } catch {
      setError("No se pudieron cargar los pases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      // Limpiamos los campos editables; mantenemos fecha/turno para entradas seguidas.
      setSummary("");
      setAlerts("");
      setPendingActions("");
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAck = async (h: Handover) => {
    const ok = window.confirm(
      `¿Confirmas que has leído el pase de ${SHIFT_LABEL[h.shift]} del ${h.shiftDate}? Esta firma queda registrada.`,
    );
    if (!ok) return;
    const res = await fetch(`/api/handover/${h.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge" }),
    });
    if (res.ok) await load();
  };

  const handleDelete = async (h: Handover) => {
    const ok = window.confirm("¿Eliminar este pase de turno?");
    if (!ok) return;
    const res = await fetch(`/api/handover/${h.id}`, { method: "DELETE" });
    if (res.ok) await load();
  };

  const unacked = useMemo(
    () => (items ?? []).filter((h) => !h.acknowledgedAt),
    [items],
  );

  return (
    <div className="space-y-5">
      <SectionTabs preset="tickets" />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <Handshake size={20} className="text-[var(--color-accent)]" aria-hidden />
          <h1 className="text-heading">Pase de turno</h1>
          <FeedbackTargetButton id="handover" label="Pase de turno" />
        </div>
        {unacked.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">
            <AlertTriangle size={11} aria-hidden /> {unacked.length} pendiente(s) de firmar
          </span>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-1)]">
          <Send size={14} className="text-[var(--color-accent)]" aria-hidden />
          Entregar turno saliente
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
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
            <label className="flex items-end gap-2 pb-2 text-xs font-medium text-[var(--color-text-2)]">
              <input
                type="checkbox"
                checked={includeSnapshot}
                onChange={(e) => setIncludeSnapshot(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border)]"
              />
              Incluir snapshot de tickets abiertos
            </label>
          </div>
          <Textarea
            label="Resumen del turno"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={4}
            placeholder="Qué ha pasado, decisiones tomadas, contexto general…"
            maxLength={8000}
            required
          />
          <Textarea
            label="Alertas (cosas a vigilar)"
            value={alerts}
            onChange={(e) => setAlerts(e.target.value)}
            rows={2}
            placeholder="Ej. Bus 1023 con avería intermitente; conductor X reincidente…"
            maxLength={4000}
          />
          <Textarea
            label="Acciones pendientes"
            value={pendingActions}
            onChange={(e) => setPendingActions(e.target.value)}
            rows={2}
            placeholder="Tareas concretas que debe atender el turno entrante."
            maxLength={4000}
          />
          <div className="flex justify-end">
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

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-1)]">
          <ClipboardList size={14} className="text-[var(--color-text-3)]" aria-hidden />
          Últimos pases
        </h2>
        {loading && !items ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-md bg-[var(--color-surface-2)]/60" />
            ))}
          </div>
        ) : (items ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-text-3)]">Todavía no hay pases registrados.</p>
        ) : (
          <ul className="space-y-2">
            {(items ?? []).map((h) => {
              const Icon = SHIFT_ICON[h.shift];
              return (
                <li
                  key={h.id}
                  className={cn(
                    "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3",
                    !h.acknowledgedAt && "ring-1 ring-[var(--color-warning)]/40",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-1)]">
                        <Icon size={13} className="text-[var(--color-accent)]" aria-hidden />
                        {SHIFT_LABEL[h.shift]} · {h.shiftDate}
                        <span className="text-[10px] font-normal text-[var(--color-text-3)]">
                          por {h.authorName ?? "—"}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text-2)]">
                        {h.summary}
                      </p>
                      {h.alerts ? (
                        <div className="mt-2 rounded border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)] p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-warning)]">
                            <AlertTriangle size={10} className="mr-1 inline" aria-hidden />
                            Alertas
                          </p>
                          <p className="whitespace-pre-line text-xs text-[var(--color-text-2)]">{h.alerts}</p>
                        </div>
                      ) : null}
                      {h.pendingActions ? (
                        <div className="mt-2 rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-accent)]">
                            <Clock size={10} className="mr-1 inline" aria-hidden />
                            Acciones pendientes
                          </p>
                          <p className="whitespace-pre-line text-xs text-[var(--color-text-2)]">
                            {h.pendingActions}
                          </p>
                        </div>
                      ) : null}
                      {h.openTickets && h.openTickets.length > 0 ? (
                        <details className="mt-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                            Snapshot tickets abiertos ({h.openTickets.length})
                          </summary>
                          <ul className="mt-1 space-y-0.5">
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
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {h.acknowledgedAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                          <CheckCircle2 size={10} aria-hidden /> Firmado por {h.acknowledgedByName ?? "—"}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAck(h)}
                          title="Confirmar lectura del pase"
                        >
                          <UserCheck size={12} className="mr-1" aria-hidden /> Firmar recepción
                        </Button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(h)}
                        className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-3)] hover:text-[var(--color-error)]"
                        title="Eliminar pase"
                      >
                        <Trash2 size={10} aria-hidden /> Eliminar
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
