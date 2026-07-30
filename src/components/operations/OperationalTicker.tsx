"use client";

import {
  AlertTriangle,
  ChevronDown,
  Mail,
  Route,
  Timer,
  Ticket,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { useSseEvent } from "@/hooks/use-sse-event";
import type { TickerItem, TickerItemKind, TickerSnapshot } from "@/lib/operations/ticker-types";
import { cn } from "@/lib/utils";

import "./operational-ticker.css";

const DEFAULT_REFRESH_MS = 90_000;
const DISMISS_KEY = "ccmgc_ops_ticker_dismiss";
const SSE_DEBOUNCE_MS = 600;

const TONE_CLASS: Record<TickerItem["tone"], string> = {
  critical: "ops-ticker-item--critical",
  warning: "ops-ticker-item--warning",
  info: "ops-ticker-item--info",
};

const KIND_ICON: Record<TickerItemKind, typeof Timer> = {
  sla_summary: Timer,
  desvio_summary: Route,
  desvio_pendiente: Route,
  ticket_critical: AlertTriangle,
  today_summary: Ticket,
  poller_error: Mail,
};

function readDismissedSignature(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function TickerSegment({
  item,
  separator,
}: {
  item: TickerItem;
  separator?: boolean;
}) {
  const Icon = KIND_ICON[item.kind];
  const tooltip = item.title ?? item.label;
  const content = (
    <>
      {separator ? <span className="ops-ticker-sep" aria-hidden>◆</span> : null}
      <span className={cn("ops-ticker-item", TONE_CLASS[item.tone])}>
        <Icon size={11} strokeWidth={2} className="ops-ticker-icon" aria-hidden />
        <span className="ops-ticker-item-text" title={tooltip}>
          {item.label}
        </span>
      </span>
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="ops-ticker-link" title={tooltip}>
        {content}
      </Link>
    );
  }

  return (
    <span className="ops-ticker-link ops-ticker-link--static" title={tooltip}>
      {content}
    </span>
  );
}

function TickerSummaryRow({ data, className }: { data: TickerSnapshot; className?: string }) {
  if (data.summaryParts.length === 0) return null;
  return (
    <div className={cn("ops-ticker-summary", className)} aria-label="Resumen operativo">
      {data.summaryParts.map((part, index) => (
        <span key={part.id} className="ops-ticker-summary-part">
          {index > 0 ? <span className="ops-ticker-summary-sep" aria-hidden>·</span> : null}
          {part.href ? (
            <Link href={part.href} className="ops-ticker-summary-link">
              {part.label}
            </Link>
          ) : (
            <span>{part.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Franja operativa global (estilo ticker). Aparece en todas las páginas privadas
 * cuando hay señales relevantes: desvíos, SLA, tickets críticos, etc.
 * Oculta en /dashboard (ya tiene «Operación ahora»).
 */
export function OperationalTicker() {
  const pathname = usePathname();
  const [data, setData] = useState<TickerSnapshot | null>(null);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sseTimerRef = useRef<number | null>(null);

  const onDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  useEffect(() => {
    setDismissedSignature(readDismissedSignature());
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, data?.signature]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/operations/ticker", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as TickerSnapshot;
      setData(json);
    } catch {
      /* ignore */
    }
  }, []);

  const scheduleLoad = useCallback(() => {
    if (sseTimerRef.current !== null) {
      window.clearTimeout(sseTimerRef.current);
    }
    sseTimerRef.current = window.setTimeout(() => {
      sseTimerRef.current = null;
      void load();
    }, SSE_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), DEFAULT_REFRESH_MS);
    return () => {
      window.clearInterval(t);
      if (sseTimerRef.current !== null) window.clearTimeout(sseTimerRef.current);
    };
  }, [load]);

  useSseEvent("ticket_created", scheduleLoad);
  useSseEvent("ticket_updated", scheduleLoad);
  useSseEvent("ticket_status_changed", scheduleLoad);
  useSseEvent("ticket_assigned", scheduleLoad);
  useSseEvent("ticket_deleted", scheduleLoad);
  useSseEvent("desvio_nuevo", scheduleLoad);
  useSseEvent("desvio_actualizado", scheduleLoad);

  const dismiss = () => {
    if (!data?.signature) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, data.signature);
    } catch {
      /* ignore */
    }
    setDismissedSignature(data.signature);
    setMobileOpen(false);
  };

  if (onDashboard) return null;
  if (!data?.items.length) return null;
  if (dismissedSignature && dismissedSignature === data.signature) return null;

  const isCalm = data.items.every((item) => item.tone === "info");
  const scroll = data.items.length > 1;
  const trackItems = scroll ? [...data.items, ...data.items] : data.items;

  return (
    <div className="ops-ticker-wrap">
      <div
        className={cn(
          "ops-ticker",
          data.hasPulse && "ops-ticker--pulse",
          isCalm && "ops-ticker--calm",
        )}
        role="region"
        aria-label="Situación operativa en vivo"
      >
        <button
          type="button"
          className="ops-ticker-label ops-ticker-label--button sm:cursor-default"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="ops-ticker-mobile-panel"
          title="Ver detalle operativo"
        >
          <span className="ops-ticker-dot" aria-hidden />
          <span className="ops-ticker-live">En vivo</span>
          <ChevronDown
            size={12}
            className={cn("ops-ticker-mobile-chevron sm:hidden", mobileOpen && "ops-ticker-mobile-chevron--open")}
            aria-hidden
          />
        </button>

        <div className={cn("ops-ticker-viewport", scroll && "ops-ticker-viewport--scroll")}>
          <div
            className={cn("ops-ticker-track", scroll && "ops-ticker-track--animate")}
            style={
              scroll
                ? ({
                    ["--ops-ticker-duration" as string]: `${Math.max(28, data.items.length * 9)}s`,
                  } as CSSProperties)
                : undefined
            }
            aria-live="polite"
          >
            {trackItems.map((item, index) => (
              <TickerSegment key={`${item.id}-${index}`} item={item} separator={index > 0} />
            ))}
          </div>
        </div>

        <TickerSummaryRow data={data} className="hidden sm:flex" />

        <button
          type="button"
          className="ops-ticker-dismiss"
          onClick={dismiss}
          aria-label="Ocultar franja operativa hasta que cambie la situación"
          title="Ocultar hasta novedad"
        >
          <X size={12} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {mobileOpen ? (
        <div id="ops-ticker-mobile-panel" className="ops-ticker-mobile-panel sm:hidden">
          <ul className="ops-ticker-mobile-list">
            {data.items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const tooltip = item.title ?? item.label;
              const row = (
                <span className={cn("ops-ticker-item", TONE_CLASS[item.tone])}>
                  <Icon size={11} strokeWidth={2} className="ops-ticker-icon" aria-hidden />
                  <span className="ops-ticker-item-text" title={tooltip}>
                    {item.label}
                  </span>
                </span>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="ops-ticker-mobile-link"
                      title={tooltip}
                      onClick={() => setMobileOpen(false)}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="ops-ticker-mobile-link">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <TickerSummaryRow data={data} className="ops-ticker-mobile-summary" />
        </div>
      ) : null}
    </div>
  );
}
