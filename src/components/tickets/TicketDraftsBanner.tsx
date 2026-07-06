"use client";

import { ClipboardPen, X } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useSseEvent } from "@/hooks/use-sse-event";
import { motionTransition } from "@/lib/motion";

const DISMISS_KEY = "ccmgc_drafts_banner_dismissed_count";

/**
 * Banda de recordatorio cuando hay tickets en borrador (apuntes sin completar).
 * Complementa el badge numérico del sidebar «Bandeja».
 */
export function TicketDraftsBanner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [count, setCount] = useState(0);
  const [dismissedAtCount, setDismissedAtCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets/drafts-badge", { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      setCount(Math.max(0, data.count ?? 0));
    } catch {
      /* el SSE volverá a intentar */
    }
  }, []);

  useEffect(() => {
    void refresh();
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (raw) setDismissedAtCount(Number(raw));
    } catch {
      /* ignore */
    }
  }, [refresh]);

  useSseEvent("ticket_created", () => void refresh());
  useSseEvent("ticket_updated", () => void refresh());
  useSseEvent("ticket_status_changed", () => void refresh());
  useSseEvent("ticket_deleted", () => void refresh());

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("ccmgc-ticket-drafts-changed", handler);
    return () => window.removeEventListener("ccmgc-ticket-drafts-changed", handler);
  }, [refresh]);

  const hiddenByRoute = pathname.startsWith("/bandeja") && searchParams.get("status") === "borrador";
  const dismissed = dismissedAtCount !== null && dismissedAtCount === count;
  const visible = count > 0 && !hiddenByRoute && !dismissed;

  const dismiss = () => {
    setDismissedAtCount(count);
    try {
      sessionStorage.setItem(DISMISS_KEY, String(count));
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="ticket-drafts-banner"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={motionTransition(0.2)}
          className="overflow-hidden border-b border-amber-500/25 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2 sm:px-6">
            <ClipboardPen size={16} className="shrink-0 text-amber-200" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-amber-50/95">
              <span className="font-semibold tabular-nums">{count}</span>{" "}
              {count === 1 ? "apunte express pendiente" : "apuntes express pendientes"} de completar (tipología, adjuntos…).
            </p>
            <Link
              href="/bandeja?status=borrador"
              className="shrink-0 rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-400/30 transition-colors hover:bg-amber-500/30"
            >
              Ver bandeja
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-md p-1 text-amber-200/80 transition-colors hover:bg-amber-500/15 hover:text-amber-50"
              aria-label="Ocultar aviso hasta que cambie el número de borradores"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
