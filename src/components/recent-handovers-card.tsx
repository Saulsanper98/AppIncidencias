"use client";

/**
 * RecentHandoversCard
 * ────────────────────────────────────────────────────────────────────────────
 * Tarjeta del dashboard principal que muestra los últimos pases de turno
 * (M / T / N) publicados por el equipo del centro de control.
 *
 * Para qué sirve al gestor que entra a sala:
 *  - Ver de un vistazo qué se entregó en el turno anterior.
 *  - Detectar pases SIN FIRMAR (badge ámbar) que necesitan acuse.
 *  - Saltar al detalle (/handover) con un clic.
 *
 * Encaja en la fila de cards inferior del dashboard (min-h-[220px], altura
 * coherente con "Mapa de incidencias", "Conocimiento" y "Estados de
 * tickets"). Sustituye a la antigua "Agenda de hoy" (preventivo) porque
 * inventario / preventivo se manejan en su propia sección.
 */

import { ArrowRight, ClipboardList, Moon, Sun, Sunrise } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Shift = "M" | "T" | "N";

type Handover = {
  id: string;
  shiftDate: string;
  shift: Shift;
  authorName: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  createdAt: string;
  openPendingCount?: number;
};

const SHIFT_META: Record<Shift, { label: string; Icon: typeof Sunrise; ring: string; bg: string; text: string }> = {
  M: { label: "Mañana", Icon: Sunrise, ring: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-300" },
  T: { label: "Tarde", Icon: Sun, ring: "border-sky-500/30", bg: "bg-sky-500/10", text: "text-sky-300" },
  N: { label: "Noche", Icon: Moon, ring: "border-indigo-500/30", bg: "bg-indigo-500/10", text: "text-indigo-300" },
};

/** Devuelve "hace 5 min", "hace 2 h", "ayer", o "dd/mm". */
function relativeShort(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "ayer";
  if (diffD < 7) return `hace ${diffD} d.`;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

export function RecentHandoversCard() {
  const [items, setItems] = useState<Handover[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/handover?take=4", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: Handover[] };
        if (!alive) return;
        setItems(data.items);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Error");
        setItems([]);
      }
    };
    void fetchData();
    // Refresco suave cada 90s: los pases no cambian mucho pero queremos que
    // el badge "Sin firmar" se actualice si alguien acaba de firmar.
    const id = window.setInterval(fetchData, 90_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const loading = items === null;

  return (
    <article className="account-section flex min-h-[200px] flex-col transition-shadow hover:shadow-md">
      <header className="account-section-head !mb-3">
        <span className="account-section-icon shrink-0">
          <ClipboardList size={14} strokeWidth={1.6} className="text-[var(--color-text-3)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="account-section-pretitle">
            <span className="account-section-pretitle-dot" aria-hidden />
            Turnos M / T / N
          </p>
          <h3 className="account-section-title !mt-0">Pases de turno</h3>
        </div>
        <Link
          href="/handover"
          className="shrink-0 text-[11px] text-[var(--color-text-3)] transition-colors hover:text-[var(--color-accent)]"
        >
          Ver todos
        </Link>
      </header>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <p className="text-[12px] text-[var(--color-text-3)]">No se pudieron cargar los pases.</p>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <ClipboardList size={20} className="mb-2 text-[var(--color-text-3)]" strokeWidth={1.4} />
          <p className="text-[12px] text-[var(--color-text-2)]">Aún no hay pases publicados.</p>
          <Link
            href="/handover"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline"
          >
            Publicar el primero <ArrowRight size={10} />
          </Link>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col gap-1.5">
          {items.map((h, index) => {
            const meta = SHIFT_META[h.shift];
            const isSigned = Boolean(h.acknowledgedAt);
            const openCount = h.openPendingCount ?? 0;
            const href =
              openCount > 0
                ? `/handover?tab=open_pending&focus=${encodeURIComponent(h.id)}`
                : isSigned
                  ? `/handover?focus=${encodeURIComponent(h.id)}`
                  : `/handover?tab=unacked&focus=${encodeURIComponent(h.id)}`;
            return (
              <li key={h.id} className={`ccmgc-stagger-in ccmgc-stagger-in-${(index % 6) + 1}`}>
                <Link
                  href={href}
                  className="group flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${meta.ring} ${meta.bg}`}
                  >
                    <meta.Icon size={13} strokeWidth={1.6} className={meta.text} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium text-[var(--color-text-1)]">
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-3)]">
                        · {relativeShort(h.createdAt)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-[var(--color-text-3)]">
                      {h.authorName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    {isSigned ? (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-300">
                        Firmado
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-300">
                        Sin firmar
                      </span>
                    )}
                    {openCount > 0 ? (
                      <span className="text-[9.5px] font-semibold text-amber-300/90">
                        {openCount} pend.
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/handover"
        className="mt-3 inline-flex items-center gap-1 text-[11px] text-[var(--color-text-3)] transition-colors hover:text-[var(--color-accent)]"
      >
        Pasar turno <ArrowRight size={10} />
      </Link>
    </article>
  );
}
