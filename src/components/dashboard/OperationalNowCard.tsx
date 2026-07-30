"use client";

import { AlertTriangle, ArrowRight, Megaphone, Route } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { ActiveIncident } from "@/components/dashboard/dashboard-types";
import { Skeleton } from "@/components/ui/skeleton";
import { isUiUnificationEnabled } from "@/ui-unification/feature";
import { UIU_TONE } from "@/ui-unification/tones";
import { cn } from "@/lib/utils";

type DesvioMini = { id: string; titulo: string; estado: string; lineas_afectadas: string[] };

/** Franja en vivo integrada en el hero del dashboard (no es una card suelta). */
export function OperationalNowCard() {
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [desvios, setDesvios] = useState<DesvioMini[]>([]);
  const [announcements, setAnnouncements] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [kpisRes, desvRes, badgeRes] = await Promise.all([
          fetch("/api/dashboard/kpis", { cache: "no-store" }),
          fetch("/api/desvios?estado=ACTIVO&pageSize=5", { cache: "no-store" }),
          fetch("/api/announcements/badge", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (kpisRes.ok) {
          const data = (await kpisRes.json()) as { incidenciasActivas?: ActiveIncident[] };
          setIncidents((data.incidenciasActivas ?? []).slice(0, 4));
        }
        if (desvRes.ok) {
          const data = (await desvRes.json()) as { items?: DesvioMini[] };
          setDesvios(data.items ?? []);
        }
        if (badgeRes.ok) {
          const data = (await badgeRes.json()) as { unread?: number };
          setAnnouncements(data.unread ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const critical = incidents.filter((t) => t.priority === "alta");
  const desvioLineas = Array.from(new Set(desvios.flatMap((d) => d.lineas_afectadas ?? []))).slice(0, 8);

  if (loading) {
    return (
      <div className="ops-now-strip border-t border-[var(--color-border)]/45 pt-2.5">
        <div className="grid gap-2 sm:grid-cols-3">
          <Skeleton className="h-[3.75rem] rounded-xl" />
          <Skeleton className="h-[3.75rem] rounded-xl" />
          <Skeleton className="h-[3.75rem] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="ops-now-strip border-t border-[var(--color-border)]/45 pt-2.5">
      <div className="grid gap-2 sm:grid-cols-3">
        <OpsTile
          href="/bandeja?priority=alta"
          icon={AlertTriangle}
          title="Críticos SLA"
          count={critical.length}
          tone="error"
          empty="Sin tickets de alta prioridad"
        >
          {critical.slice(0, 2).map((t) => (
            <Link
              key={t.id}
              href={`/tickets/${t.id}`}
              className="group/item flex items-center gap-1 truncate text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
            >
              <span className="truncate">{t.title}</span>
              <ArrowRight
                size={10}
                className="shrink-0 opacity-0 transition-opacity group-hover/item:opacity-70"
                aria-hidden
              />
            </Link>
          ))}
        </OpsTile>

        <OpsTile
          href="/desvios?estado=ACTIVO"
          icon={Route}
          title="Desvíos activos"
          count={desvios.length}
          tone="warning"
          empty="Red sin desvíos activos"
        >
          {desvioLineas.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {desvioLineas.map((linea) => (
                <span
                  key={linea}
                  className={cn(
                    "rounded-full border px-1.5 py-px text-[10px] font-medium",
                    isUiUnificationEnabled() ? UIU_TONE.warning.chip : "border-amber-500/25 bg-amber-500/10 text-amber-100",
                  )}
                >
                  L{linea}
                </span>
              ))}
            </div>
          ) : desvios.length > 0 ? (
            desvios.slice(0, 2).map((d) => (
              <Link key={d.id} href={`/desvios/${d.id}`} className="truncate text-[11px] text-[var(--color-text-2)] hover:underline">
                {d.titulo}
              </Link>
            ))
          ) : null}
        </OpsTile>

        <OpsTile
          href="/novedades"
          icon={Megaphone}
          title="Avisos sin leer"
          count={announcements}
          tone="accent"
          empty="Al día con los avisos"
        >
          {announcements > 0 ? (
            <p className="text-[11px] leading-snug text-[var(--color-text-2)]">
              {announcements === 1 ? "1 novedad pendiente" : `${announcements} novedades pendientes`} en el centro de control.
            </p>
          ) : null}
        </OpsTile>
      </div>
    </div>
  );
}

const LEGACY_TONE_STYLES = {
  error: {
    ring: "border-[rgba(220,38,38,0.28)]",
    bg: "bg-[linear-gradient(135deg,rgba(220,38,38,0.12),transparent_55%)]",
    icon: "bg-[var(--color-error-light)] text-[var(--color-error)]",
    count: "text-[var(--color-error)]",
    glow: "from-[rgba(220,38,38,0.14)]",
  },
  warning: {
    ring: "border-amber-500/25",
    bg: "bg-[linear-gradient(135deg,rgba(245,158,11,0.1),transparent_55%)]",
    icon: "bg-amber-500/15 text-amber-300",
    count: "text-amber-300",
    glow: "from-amber-500/12",
  },
  accent: {
    ring: "border-[var(--color-accent)]/25",
    bg: "bg-[linear-gradient(135deg,var(--color-accent-light),transparent_55%)]",
    icon: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
    count: "text-[var(--color-accent)]",
    glow: "from-[var(--color-accent)]/10",
  },
} as const;

function OpsTile({
  href,
  icon: Icon,
  title,
  count,
  tone,
  empty,
  children,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  count: number;
  tone: keyof typeof UIU_TONE;
  empty: string;
  children?: React.ReactNode;
}) {
  const t = (isUiUnificationEnabled() ? UIU_TONE : LEGACY_TONE_STYLES)[tone];
  const active = count > 0;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex min-h-[4.5rem] flex-col overflow-hidden rounded-xl border p-2.5 transition-all duration-200",
        "hover:-translate-y-px hover:shadow-md hover:shadow-black/10",
        t.ring,
        t.bg,
        !active && "opacity-80",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-2xl transition-opacity group-hover:opacity-100",
          t.glow,
        )}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", t.icon)}>
            <Icon size={14} strokeWidth={1.7} aria-hidden />
          </span>
          <p className="truncate text-[11px] font-semibold text-[var(--color-text-1)]">{title}</p>
        </div>
        <span className={cn("num-tabular text-lg font-bold leading-none", t.count)}>{count}</span>
      </div>

      <div className="relative mt-1.5 min-h-[1.25rem] flex-1 space-y-0.5">
        {active && children ? children : <p className="text-[10.5px] text-[var(--color-text-3)]">{empty}</p>}
      </div>

      <span className="relative mt-1 inline-flex items-center gap-0.5 self-end text-[10px] font-medium text-[var(--color-text-3)] opacity-0 transition-opacity group-hover:opacity-100">
        Ver
        <ArrowRight size={10} aria-hidden />
      </span>
    </Link>
  );
}
