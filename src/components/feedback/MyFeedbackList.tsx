"use client";

/**
 * MyFeedbackList — columna lateral de la página /feedback (también del modal
 * rápido en fase 4).
 *
 * Muestra los últimos envíos del usuario logueado con:
 *   - Tipo (idea/error/mejora) con icono y color.
 *   - Título + fecha relativa.
 *   - Badge de estado (pendiente / en_revision / planificado / implementado /
 *     descartado) con tono semántico.
 *   - Si el admin dejó adminNotes, se muestran en blockquote.
 *   - Expandir/colapsar para ver descripción + página de origen.
 *
 * Antes el usuario enviaba feedback "a ciegas" sin saber si lo veían o qué
 * pasaba. Esta lista cierra el bucle: respuesta visible cuando el equipo
 * cambia el estado o añade notas.
 */

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
  Lightbulb,
  MessageSquare,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { FeedbackType } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type FeedbackAttachmentDto = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string;
};

type FeedbackStatus = "pendiente" | "en_revision" | "planificado" | "implementado" | "descartado";

type MyFeedback = {
  id: string;
  type: FeedbackType;
  category: string;
  title: string;
  description: string;
  rating: number | null;
  urgency: string;
  currentPage: string | null;
  status: FeedbackStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: FeedbackAttachmentDto[];
};

const TYPE_META: Record<
  FeedbackType,
  { label: string; Icon: typeof Lightbulb; color: string; bg: string }
> = {
  idea: {
    label: "Idea",
    Icon: Lightbulb,
    color: "text-[#f59e0b]",
    bg: "bg-[rgba(245,158,11,0.10)]",
  },
  error: {
    label: "Error",
    Icon: AlertCircle,
    color: "text-[var(--color-error)]",
    bg: "bg-[var(--color-error-light)]",
  },
  mejora: {
    label: "Mejora",
    Icon: TrendingUp,
    color: "text-[var(--color-success)]",
    bg: "bg-[var(--color-success-light)]",
  },
};

const STATUS_META: Record<
  FeedbackStatus,
  { label: string; cls: string; Icon: typeof Sparkles }
> = {
  pendiente: {
    label: "Pendiente",
    cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    Icon: Sparkles,
  },
  en_revision: {
    label: "En revisión",
    cls: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    Icon: MessageSquare,
  },
  planificado: {
    label: "Planificado",
    cls: "bg-violet-500/10 text-violet-300 border-violet-500/30",
    Icon: Sparkles,
  },
  implementado: {
    label: "Implementado",
    cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    Icon: CheckCircle2,
  },
  descartado: {
    label: "Descartado",
    cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    Icon: XCircle,
  },
};

/** "hace X min", "ayer", "hace 3 d.", o dd/mm. */
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

const FLOW_STEPS = ["en_revision", "planificado", "implementado"] as const;

function flowIndex(status: FeedbackStatus): number {
  const idx = FLOW_STEPS.indexOf(status as (typeof FLOW_STEPS)[number]);
  return idx >= 0 ? idx : -1;
}

export function MyFeedbackList({ refreshKey }: { refreshKey?: number }) {
  const [items, setItems] = useState<MyFeedback[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/feedback/mine", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: MyFeedback[] };
        if (alive) setItems(data.items);
      } catch {
        if (alive) setItems([]);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const loading = items === null;

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Aún no has enviado feedback"
        hint="Cuando envíes algo, aparecerá aquí con su estado."
        compact
        className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30"
      />
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((f, idx) => {
        const t = TYPE_META[f.type];
        const s = STATUS_META[f.status];
        const expanded = expandedId === f.id;
        const statusIdx = flowIndex(f.status);
        const canLinkSuggestion =
          f.type !== "error" && (f.status === "en_revision" || f.status === "planificado");
        return (
          <li
            key={f.id}
            className={cn(
              "overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50",
              `ccmgc-stagger-in ccmgc-stagger-in-${(idx % 6) + 1}`,
            )}
          >
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : f.id)}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] ccmgc-card-clickable"
              aria-expanded={expanded}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  t.bg,
                )}
              >
                <t.Icon size={13} className={t.color} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-[12.5px] font-medium text-[var(--color-text-1)]">
                    {f.title}
                  </p>
                  <ChevronDown
                    size={13}
                    className={cn(
                      "mt-0.5 shrink-0 text-[var(--color-text-3)] transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium",
                      s.cls,
                    )}
                  >
                    <s.Icon size={9} strokeWidth={2} />
                    {s.label}
                  </span>
                  <span className="text-[var(--color-text-3)]">
                    {relativeShort(f.createdAt)}
                  </span>
                  {f.attachments && f.attachments.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[var(--color-text-2)]">
                      <ImageIcon size={9} strokeWidth={2} />
                      {f.attachments.length}
                    </span>
                  ) : null}
                  {f.adminNotes ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[var(--color-accent)]">
                      <MessageSquare size={9} strokeWidth={2} />
                      Respuesta
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  {FLOW_STEPS.map((step, stepIdx) => {
                    const active = statusIdx >= stepIdx;
                    const label =
                      step === "en_revision"
                        ? "En revisión"
                        : step === "planificado"
                          ? "Planificado"
                          : "Hecho";
                    return (
                      <div key={step} className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex h-1.5 w-1.5 rounded-full border",
                            active
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                              : "border-[var(--color-border)] bg-transparent",
                          )}
                        />
                        <span
                          className={cn(
                            "text-[9.5px]",
                            active ? "text-[var(--color-text-2)]" : "text-[var(--color-text-3)]",
                          )}
                        >
                          {label}
                        </span>
                        {stepIdx < FLOW_STEPS.length - 1 ? (
                          <span className="h-px w-2 bg-[var(--color-border)]" aria-hidden />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </button>

            {expanded ? (
              <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-text-2)]">
                  {f.description}
                </p>
                {f.attachments && f.attachments.length > 0 ? (
                  <div className="mt-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
                      Capturas
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {f.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group relative block overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)]"
                          title={att.fileName}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.url}
                            alt={att.fileName}
                            className="aspect-square h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
                {f.currentPage ? (
                  <p className="mt-2 text-[10.5px] text-[var(--color-text-3)]">
                    Página: <span className="font-mono">{f.currentPage}</span>
                  </p>
                ) : null}
                {f.adminNotes ? (
                  <div className="mt-3 rounded-lg border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-light)]/40 px-3 py-2">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                      <MessageSquare size={10} strokeWidth={2} />
                      Respuesta del equipo
                    </p>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-text-1)]">
                      {f.adminNotes}
                    </p>
                  </div>
                ) : null}
                {canLinkSuggestion ? (
                  <div className="mt-3">
                    <Link
                      href="/sugerencias"
                      className="inline-flex items-center gap-1 rounded-full border border-violet-400/35 bg-violet-500/10 px-2 py-1 text-[10.5px] font-medium text-violet-200 hover:bg-violet-500/20"
                    >
                      <TrendingUp size={11} strokeWidth={1.9} />
                      Ver sugerencia en el tablero
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
