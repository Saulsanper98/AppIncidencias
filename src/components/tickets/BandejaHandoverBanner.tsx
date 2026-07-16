"use client";

import { Handshake, X } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

import { motionTransition } from "@/lib/motion";
import {
  currentShiftNow,
  isNearShiftEnd,
  minutesUntilShiftEnd,
  SHIFT_LABEL,
} from "@/lib/shift-utils";

const DISMISS_KEY = "ccmgc_handover_bandeja_banner_v1";

type HandoverLite = {
  id: string;
  shift: string;
  shiftDate: string;
  authorName: string | null;
  acknowledgedAt: string | null;
  openPendingCount?: number;
  wasMine?: boolean;
};

/**
 * Recordatorio de relevo en la Bandeja (donde se trabaja el día a día).
 * Se muestra cerca del fin de turno o si hay pases sin firmar / pendientes abiertos.
 */
export function BandejaHandoverBanner() {
  const [items, setItems] = useState<HandoverLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/handover?take=12", { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: HandoverLite[] };
      setItems(data.items ?? []);
    } catch {
      /* silencioso */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { day?: string; shift?: string };
        const shift = currentShiftNow();
        const day = new Date().toISOString().slice(0, 10);
        if (parsed.day === day && parsed.shift === shift) setDismissed(true);
      }
    } catch {
      /* ignore */
    }
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    void tick;
    const unacked = items.filter((h) => !h.acknowledgedAt);
    const openPending = items.reduce((acc, h) => acc + (h.openPendingCount ?? 0), 0);
    const nearEnd = isNearShiftEnd(60);
    const minsLeft = minutesUntilShiftEnd();
    const shift = currentShiftNow();
    return { unacked, openPending, nearEnd, minsLeft, shift };
  }, [items, tick]);

  const visible =
    loaded &&
    !dismissed &&
    (stats.nearEnd || stats.unacked.length > 0 || stats.openPending > 0);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(
        DISMISS_KEY,
        JSON.stringify({ day: new Date().toISOString().slice(0, 10), shift: currentShiftNow() }),
      );
    } catch {
      /* ignore */
    }
  };

  let message: string;
  if (stats.unacked.length > 0 && stats.openPending > 0) {
    message = `${stats.unacked.length} pase${stats.unacked.length === 1 ? "" : "s"} sin firmar · ${stats.openPending} pendiente${stats.openPending === 1 ? "" : "s"} abiertas`;
  } else if (stats.unacked.length > 0) {
    message = `${stats.unacked.length} pase${stats.unacked.length === 1 ? "" : "s"} de turno pendiente${stats.unacked.length === 1 ? "" : "s"} de firmar`;
  } else if (stats.openPending > 0) {
    message = `${stats.openPending} acción${stats.openPending === 1 ? "" : "es"} pendiente${stats.openPending === 1 ? "" : "s"} del relevo aún abiertas`;
  } else {
    message =
      stats.minsLeft <= 15
        ? `Cierre de ${SHIFT_LABEL[stats.shift]} en ~${stats.minsLeft} min. Deja el pase al turno entrante.`
        : `Quedan ~${stats.minsLeft} min de ${SHIFT_LABEL[stats.shift]}. Prepara el pase de turno.`;
  }

  const ctaHref = useMemo(() => {
    if (stats.unacked.length > 0) {
      const focus = stats.unacked[0]?.id;
      return focus ? `/handover?tab=unacked&focus=${encodeURIComponent(focus)}` : "/handover?tab=unacked";
    }
    if (stats.openPending > 0) {
      const withPending = items.find((h) => (h.openPendingCount ?? 0) > 0);
      return withPending
        ? `/handover?tab=open_pending&focus=${encodeURIComponent(withPending.id)}`
        : "/handover?tab=open_pending";
    }
    return "/handover";
  }, [stats.unacked, stats.openPending, items]);

  const cta =
    stats.unacked.length > 0
      ? "Firmar / ver pases"
      : stats.openPending > 0
        ? "Ver pendientes"
        : "Pasar turno";

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="bandeja-handover-banner"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={motionTransition(0.2)}
          className="overflow-hidden rounded-xl border border-[var(--color-accent)]/30 bg-gradient-to-r from-[var(--color-accent-light)]/80 via-[var(--color-surface)] to-[var(--color-surface)]"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 sm:px-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
              <Handshake size={15} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                Relevo · {SHIFT_LABEL[stats.shift]}
              </p>
              <p className="text-[13px] text-[var(--color-text-1)]">{message}</p>
            </div>
            <Link
              href={ctaHref}
              className="shrink-0 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:brightness-110"
            >
              {cta}
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-md p-1 text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
              aria-label="Ocultar aviso de relevo en este turno"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
