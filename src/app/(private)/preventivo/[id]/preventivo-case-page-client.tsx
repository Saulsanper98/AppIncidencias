"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  GraduationCap,
  Loader2,
  MessageSquare,
  Send,
  Ticket,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Textarea } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

type CaseDetail = {
  id: string;
  title: string;
  description: string | null;
  status: "abierto" | "en_proceso" | "cerrado";
  ticketCountAtOpen: number;
  windowDays: number;
  conductorId: string;
  conductorName: string;
  conductorOperator: string | null;
  assignedToUserId: string | null;
  assignedToUserName: string | null;
  comments: { id: string; body: string; authorName: string; createdAt: string }[];
  relatedTickets: {
    id: string;
    title: string;
    status: string;
    priority: string;
    busId: string;
    createdAt: string;
  }[];
};

const STATUS_OPTIONS: { value: CaseDetail["status"]; label: string }[] = [
  { value: "abierto", label: "Abierto" },
  { value: "en_proceso", label: "En proceso" },
  { value: "cerrado", label: "Cerrado" },
];

function StatusBadge({ status }: { status: CaseDetail["status"] }) {
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        status === "cerrado" && "bg-[var(--color-surface-2)] text-[var(--color-text-3)] ring-1 ring-[var(--color-border)]",
        status === "en_proceso" && "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/25",
        status === "abierto" && "bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/30",
      )}
    >
      {label}
    </span>
  );
}

export default function PreventivoCasePageClient({ caseId }: { caseId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CaseDetail | null>(null);
  const [status, setStatus] = useState<CaseDetail["status"]>("abierto");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conductor-preventive/${caseId}`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Error");
      const json = JSON.parse(text) as { case: CaseDetail };
      setData(json.case);
      setStatus(json.case.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/conductor-preventive/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "No se pudo guardar");
      setComment("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-[var(--color-text-3)]">
        <Loader2 size={16} className="animate-spin" aria-hidden />
        Cargando ficha preventiva…
      </div>
    );
  }

  if (error && !data) {
    return (
      <ErrorState
        icon={AlertTriangle}
        title="No se pudo cargar"
        hint={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!data) return null;

  const dirtyStatus = status !== data.status;

  return (
    <div className="space-y-3">
      <Link
        href="/preventivo"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-text-3)] transition-colors hover:text-[var(--color-accent)]"
      >
        <ArrowLeft size={13} aria-hidden />
        Volver a preventivos
      </Link>

      <header className="preventivo-detail-hero !py-4 !px-4 sm:!px-5">
        <div className="relative z-[1] flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-accent)] ring-1 ring-[var(--color-border)]">
            <UserRound size={18} strokeWidth={1.6} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-text-3)]">
              <GraduationCap size={11} className="text-[var(--color-accent)]" aria-hidden />
              Caso preventivo
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold tracking-tight text-[var(--color-text-1)] sm:text-2xl">
                {data.conductorName}
              </h1>
              <StatusBadge status={data.status} />
            </div>
            <p className="mt-1 truncate text-[13px] text-[var(--color-text-2)]">{data.title}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--color-text-3)]">
              <span className="inline-flex items-center gap-1">
                <Ticket size={11} aria-hidden />
                {data.ticketCountAtOpen} tickets · {data.windowDays}d
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare size={11} aria-hidden />
                {data.comments.length} comentarios
              </span>
              {data.conductorOperator ? <span>{data.conductorOperator}</span> : null}
              <span>{data.assignedToUserName ? data.assignedToUserName : "Sin asignar"}</span>
            </p>
            {data.description ? (
              <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-[var(--color-text-3)] line-clamp-2">
                {data.description}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
          <SectionCard
            title="Actualizar caso"
            icon={GraduationCap}
            subtitle="Estado y notas de formación."
            bodyClassName="space-y-3"
          >
            <div className="space-y-1.5">
              <span className="text-label">Estado</span>
              <div role="radiogroup" aria-label="Estado del caso" className="grid grid-cols-3 gap-1.5">
                {STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStatus(opt.value)}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors",
                        active
                          ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-label">Comentario / acción formativa</span>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                placeholder="Qué se revisó, qué se explicó al conductor, próxima cita…"
                className="min-h-[6rem] resize-y"
              />
            </label>

            {error ? <p className="text-[12px] text-[var(--color-error)]">{error}</p> : null}

            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || (!dirtyStatus && !comment.trim())}
              className="w-full gap-1.5"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Guardar seguimiento
            </Button>
          </SectionCard>
        </aside>

        <div className="space-y-3 lg:col-start-1 lg:row-start-1">
          <SectionCard
            title="Tickets relacionados"
            icon={Ticket}
            flush
            action={
              <Link
                href={`/bandeja?conductor=${encodeURIComponent(data.conductorName)}`}
                className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline"
              >
                Ver en bandeja
              </Link>
            }
          >
            {data.relatedTickets.length === 0 ? (
              <p className="px-2 py-5 text-center text-[12.5px] text-[var(--color-text-3)]">
                Sin tickets en la ventana del caso.
              </p>
            ) : (
              <ul className="space-y-1">
                {data.relatedTickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tickets/${t.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--color-surface-2)]/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-[var(--color-text-1)]">
                          {t.busId} · {t.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[var(--color-text-3)]">
                          {new Date(t.createdAt).toLocaleString("es-ES")} · {t.priority}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 text-[10.5px] font-medium capitalize text-[var(--color-text-2)] ring-1 ring-[var(--color-border)]">
                        {t.status.replaceAll("_", " ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Historial de seguimiento" icon={MessageSquare}>
            {data.comments.length === 0 ? (
              <p className="py-3 text-center text-[12.5px] text-[var(--color-text-3)]">
                Aún no hay comentarios. Usa el panel de actualización para la primera nota.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.comments.map((c) => (
                  <li key={c.id} className="preventivo-timeline-item">
                    <p className="text-[13px] leading-relaxed text-[var(--color-text-1)]">{c.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
                      {c.authorName} · {new Date(c.createdAt).toLocaleString("es-ES")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
