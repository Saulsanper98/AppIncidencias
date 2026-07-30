"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Loader2,
  MessageSquare,
  RefreshCw,
  Ticket,
  UserRound,
} from "lucide-react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { HeroShell } from "@/components/ui/hero-shell";
import { KpiPill } from "@/components/ui/kpi-pill";
import { FilterPills } from "@/components/ui/ticket-filter-bar";
import { cn } from "@/lib/utils";

type CaseRow = {
  id: string;
  title: string;
  description: string | null;
  status: "abierto" | "en_proceso" | "cerrado";
  ticketCountAtOpen: number;
  windowDays: number;
  conductorId: string;
  conductorName: string;
  conductorOperator: string | null;
  assignedToUserName: string | null;
  commentCount: number;
  updatedAt: string;
};

type Threshold = { minTickets: number; windowDays: number };

const STATUS_LABEL: Record<CaseRow["status"], string> = {
  abierto: "Abierto",
  en_proceso: "En proceso",
  cerrado: "Cerrado",
};

const STATUS_ACCENT: Record<CaseRow["status"], string> = {
  abierto: "var(--color-warning)",
  en_proceso: "var(--color-accent)",
  cerrado: "var(--color-text-3)",
};

function StatusBadge({ status }: { status: CaseRow["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        status === "cerrado" && "bg-[var(--color-surface-2)] text-[var(--color-text-3)] ring-1 ring-[var(--color-border)]",
        status === "en_proceso" && "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/25",
        status === "abierto" && "bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/30",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function PreventivoPageClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [threshold, setThreshold] = useState<Threshold>({ minTickets: 5, windowDays: 30 });
  const [statusFilter, setStatusFilter] = useState<"abiertos" | "cerrado" | "todos">("abiertos");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = statusFilter === "todos" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`/api/conductor-preventive${q}`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Error al cargar");
      const data = JSON.parse(text) as { cases: CaseRow[]; threshold: Threshold };
      setCases(data.cases ?? []);
      if (data.threshold) setThreshold(data.threshold);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar preventivos");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const abierto = cases.filter((c) => c.status === "abierto").length;
    const enProceso = cases.filter((c) => c.status === "en_proceso").length;
    return { activos: abierto + enProceso, enProceso };
  }, [cases]);

  return (
    <div className="space-y-3">
      <HeroShell
        variant="ccmgc-hero"
        className="!mb-3"
        dotColor="var(--hero-accent-operacion)"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <GraduationCap size={12} strokeWidth={1.8} aria-hidden />
            Operación · Formación
          </span>
        }
        title="Preventivo de conductores"
        subtitle={`Casos al acumular ≥ ${threshold.minTickets} tickets de origen conductor en ${threshold.windowDays} días.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FeedbackTargetButton id="preventivo/conductores" label="Preventivo conductores" />
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]"
              title="Actualizar"
            >
              <RefreshCw size={13} aria-hidden />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        }
        kpis={
          <>
            <KpiPill label="Activos" value={counts.activos} tone="warning" compact />
            <KpiPill label="En proceso" value={counts.enProceso} tone="accent" compact />
            <KpiPill label="Umbral" value={threshold.minTickets} tone="neutral" compact />
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterPills
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { v: "abiertos", label: "Abiertos" },
            { v: "cerrado", label: "Cerrados" },
            { v: "todos", label: "Todos" },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-sm text-[var(--color-text-3)]">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Cargando casos…
        </div>
      ) : error ? (
        <ErrorState
          icon={AlertTriangle}
          title="No se pudo cargar"
          hint={error}
          onRetry={() => void load()}
        />
      ) : cases.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Sin casos en este filtro"
          hint="Cuando un conductor acumule bastantes tickets de origen conductor, aparecerá aquí."
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                href={`/preventivo/${c.id}`}
                className="group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--color-surface-2)]/55 sm:px-4"
                style={{ borderLeft: `3px solid ${STATUS_ACCENT[c.status]}` }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-2)] ring-1 ring-[var(--color-border)]">
                  <UserRound size={16} strokeWidth={1.7} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-[14px] font-bold tracking-tight text-[var(--color-text-1)]">
                      {c.conductorName}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--color-text-3)]">
                    <span className="inline-flex items-center gap-1">
                      <Ticket size={11} aria-hidden />
                      {c.ticketCountAtOpen} tickets · {c.windowDays}d
                    </span>
                    {c.commentCount > 0 ? (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <MessageSquare size={11} aria-hidden />
                        {c.commentCount}
                      </span>
                    ) : null}
                    {c.assignedToUserName ? (
                      <span className="ml-2 hidden sm:inline">· {c.assignedToUserName}</span>
                    ) : null}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-[var(--color-accent)] opacity-80 group-hover:opacity-100">
                  Abrir
                  <ArrowRight size={12} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
