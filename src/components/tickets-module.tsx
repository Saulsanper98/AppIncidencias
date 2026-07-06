"use client";

import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Bus as BusIcon,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  Download,
  Inbox,
  Keyboard,
  Link2,
  Lock,
  PackageSearch,
  Plus,
  Search,
  Tags,
  Ticket as TicketIcon,
  Timer,
  UserCheck,
  X,
  Zap,
  ArrowRight,
} from "lucide-react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useMemo, useState, useEffect, useRef, Fragment } from "react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { ModalShell } from "@/components/ui/modal-shell";
import { StatusChangeModal } from "@/components/status-change-modal";
import { TicketActionMenu } from "@/components/tickets/TicketActionMenu";
import { DeleteTicketDialog } from "@/components/tickets/DeleteTicketDialog";
import { RequestTicketDeletionDialog } from "@/components/tickets/RequestTicketDeletionDialog";
import { TicketDeletionRequestsPanel } from "@/components/tickets/TicketDeletionRequestsPanel";
import { DraftCompleteDialog } from "@/components/tickets/DraftCompleteDialog";
import { TicketEditDialog } from "@/components/tickets/TicketEditDialog";
import { ExcelExportMenu } from "@/components/tickets/ExcelExportMenu";
import { QuickTicketDialog } from "@/components/tickets/QuickTicketDialog";
import { SavedViewsBar } from "@/components/tickets/SavedViewsBar";
import { ExpressTicketPanel } from "@/components/tickets/ExpressTicketPanel";
import { TicketCreateForm } from "@/components/tickets/TicketCreateForm";
import { TicketsBandeja } from "@/components/tickets/TicketsBandeja";
import type {
  AuditEventView,
  MaintenanceAlertView,
} from "@/components/tickets/tickets-module-types";
import {
  preventiveTaskTone,
  statusMap,
} from "@/components/tickets/tickets-module-types";
import { ticketNeedsCompletion } from "@/lib/tickets/pending-completion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiPill, kpiToneValueClass, type KpiTone } from "@/components/ui/kpi-pill";
import { Input, Select } from "@/components/ui/input";
import {
  FilterActiveTag,
  FilterDivider,
  FilterLabeledGroup,
  FilterPillToggle,
  FilterPills,
  FilterSelect,
} from "@/components/ui/ticket-filter-bar";
import { SectionTabs } from "@/components/ui/section-tabs";
import { BandejaViewSkeleton, TicketsManageViewSkeleton } from "@/components/ui/view-skeletons";
import { useTickets } from "@/hooks/use-tickets";
import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { canUseFilters, canReviewTicketDeletion } from "@/lib/rbac";
import { toUiPriority } from "@/lib/ticketing";
import { cn } from "@/lib/utils";

/** Tiempo relativo en español, formato uniforme:
 *   - <60s: "ahora"
 *   - <60m: "hace Xm"
 *   - <24h: "hace Xh"
 *   - <7d:  "hace Xd"
 *   - resto: "DD MMM"
 */
function relativeTime(iso: string): string {
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d}d`;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

/** Tiempo relativo solo en cliente (evita React #418 por Date.now en SSR). */
function AuditRelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => setLabel(relativeTime(iso));
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, [iso]);
  return <>{label || "…"}</>;
}

export { TicketsManageViewSkeleton, BandejaViewSkeleton } from "@/components/ui/view-skeletons";
/** @deprecated Usar BandejaViewSkeleton o TicketsManageViewSkeleton */
export { TicketsModuleLoadingSkeleton } from "@/components/ui/view-skeletons";

/**
 * Colapsa eventos consecutivos del mismo actor con la misma acción dentro de
 * una ventana de 5 min en un único item con contador "×N". Evita la
 * sensación de "spam" cuando un usuario realiza la misma operación varias
 * veces seguidas (p. ej. actualizar perfil varias veces).
 */
function dedupeAuditEvents(events: AuditEventView[]): Array<AuditEventView & { repetitions: number }> {
  const WINDOW_MS = 5 * 60 * 1000;
  const result: Array<AuditEventView & { repetitions: number }> = [];
  for (const ev of events) {
    const last = result[result.length - 1];
    if (
      last &&
      last.actor === ev.actor &&
      last.action === ev.action &&
      new Date(last.createdAt).getTime() - new Date(ev.createdAt).getTime() < WINDOW_MS
    ) {
      last.repetitions += 1;
      continue;
    }
    result.push({ ...ev, repetitions: 1 });
  }
  return result;
}

function AuditPanel({ events }: { events: AuditEventView[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (events.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Sin eventos registrados"
        hint="La auditoría del centro aparecerá aquí cuando haya actividad."
      />
    );
  }
  const deduped = dedupeAuditEvents(events.slice(0, 12)).slice(0, 8);
  return (
    <div className="space-y-2">
      {deduped.map((event, index) => {
        const expanded = expandedId === event.id;
        const detailText = event.detail ?? "Sin detalle";
        return (
          <div key={event.id} className={cn("relative flex items-start gap-3", ticketStaggerClass(index))}>
            {index < deduped.length - 1 && (
              <div className="absolute left-[7px] top-5 h-[calc(100%-0.25rem)] w-px bg-[var(--color-accent)]/15" />
            )}
            <div className="z-10 mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 border-[var(--color-accent)]/35 bg-[var(--color-surface)] shadow-[0_0_0_1px_var(--color-border)]" />
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-1)]">
                  {event.actor}
                  {event.repetitions > 1 ? (
                    <span
                      className="num-tabular rounded-full border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0 text-[10px] font-medium text-[var(--color-text-3)]"
                      title={`${event.repetitions} eventos similares agrupados`}
                    >
                      ×{event.repetitions}
                    </span>
                  ) : null}
                </p>
                <time
                  className="num-tabular shrink-0 text-[10px] text-[var(--color-text-3)]"
                  dateTime={event.createdAt}
                  title={new Date(event.createdAt).toLocaleString("es-ES")}
                >
                  <AuditRelativeTime iso={event.createdAt} />
                </time>
              </div>
              <p
                className={cn("mt-0.5 text-[12px] leading-snug text-[var(--color-text-2)]", !expanded && "line-clamp-2")}
                title={event.action}
              >
                {event.action}
              </p>
              <p
                className={cn("mt-1 text-[12px] leading-snug text-[var(--color-text-2)]", !expanded && "line-clamp-2")}
                title={detailText}
              >
                {detailText}
              </p>
              {(event.detail?.length ?? 0) > 80 || event.action.length > 56 ? (
                <button
                  type="button"
                  className="mt-1 text-[10px] font-medium text-[var(--color-accent)] hover:underline"
                  onClick={() => setExpandedId((id) => (id === event.id ? null : event.id))}
                >
                  {expanded ? "Ver menos" : "Ver detalle"}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MaintenanceAlertsPanel({
  alerts,
  windowDays,
  onCreateTask,
}: {
  alerts: MaintenanceAlertView[];
  /**
   * Ventana real en días con la que el backend agrupó los fallos. Antes
   * estaba hardcoded a 30 en los textos; ahora viene de la config
   * (Admin → Buses anómalos) para que el texto del panel coincida con la
   * realidad ("X fallos en N días").
   */
  windowDays: number;
  onCreateTask: (alert: MaintenanceAlertView) => void;
}) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Todos los activos en buen estado"
        hint={`Sin tendencias de fallo en ${windowDays} días en el conjunto monitorizado.`}
        compact
      />
    );
  }
  return (
    <div className="space-y-2.5">
      {alerts.slice(0, 4).map((alert, index) => {
        const isCritical = alert.severity === "critical";
        // Variables CSS para tintar borde lateral, glow y badge segun
        // severidad sin tener que ramificar en el HTML.
        const toneStyle = isCritical
          ? {
              ["--alert-tone" as string]: "var(--color-error)",
              ["--alert-tone-light" as string]: "var(--color-error-light)",
            }
          : {
              ["--alert-tone" as string]: "var(--color-warning)",
              ["--alert-tone-light" as string]: "var(--color-warning-light)",
            };
        return (
          <div
            key={`${alert.busId}-${alert.assetType}`}
            className={cn(
              "tickets-alert-card text-xs",
              ticketStaggerClass(index),
              isCritical && "tickets-alert-card--critical",
            )}
            style={toneStyle}
          >
            <div className="mb-1 flex items-center justify-between gap-2 pl-2">
              <p className="font-semibold text-[var(--color-text-1)]">
                {alert.busId} · {alert.assetType}
              </p>
              <Badge variant={isCritical ? "error" : "warning"}>
                {isCritical ? "Critico" : "Warning"}
              </Badge>
            </div>
            <p className="mb-2 pl-2 text-[var(--color-text-2)]">
              {alert.failuresInWindow} fallos en {windowDays} días · {alert.municipio}
            </p>
            {alert.hasOpenPreventiveTask ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-accent)]">
                <CheckCircle2 size={11} />
                Tarea abierta ({alert.preventiveTaskId})
              </span>
            ) : (
              <button
                onClick={() => onCreateTask(alert)}
                className="tickets-alert-create-cta ml-2"
              >
                <span aria-hidden>+</span> Crear tarea preventiva
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ticketStaggerClass(index: number) {
  return `ccmgc-stagger-in ccmgc-stagger-in-${(index % 6) + 1}`;
}

/** CTA destacado del módulo tickets (hero): icono + título + hint + flecha. */
function TicketsModuleCta({
  href,
  icon: Icon,
  label,
  hint,
  variant = "primary",
}: {
  href: string;
  icon: typeof TicketIcon;
  label: string;
  hint: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "ccmgc-module-cta group",
        variant === "secondary" && "ccmgc-module-cta--secondary",
      )}
    >
      <span className="ccmgc-module-cta__icon" aria-hidden>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="ccmgc-module-cta__body">
        <span className="ccmgc-module-cta__label">{label}</span>
        <span className="ccmgc-module-cta__hint">{hint}</span>
      </span>
      <span className="ccmgc-module-cta__arrow" aria-hidden>
        <ArrowRight size={14} strokeWidth={2.2} />
      </span>
    </Link>
  );
}

/** Resumen compacto para el hero de bandeja: números en línea, sin pastillas con borde. */
function TicketBandejaKpiStrip({
  total,
  borradores,
  abiertos,
  enProceso,
  esperandoRepuesto,
  resueltosHoy,
  slaVencidos,
}: {
  total: number;
  borradores: number;
  abiertos: number;
  enProceso: number;
  esperandoRepuesto: number;
  resueltosHoy: number;
  slaVencidos: number;
}) {
  const items: { value: number; label: string; tone: KpiTone; pulse?: boolean }[] = [
    { value: total, label: "Total", tone: "neutral" },
    { value: borradores, label: "Pend.", tone: "warning" },
    { value: abiertos, label: "Abiertos", tone: "info" },
    { value: enProceso, label: "Proceso", tone: "accent" },
    { value: esperandoRepuesto, label: "Espera", tone: "warning" },
    { value: resueltosHoy, label: "Hoy", tone: "success" },
    { value: slaVencidos, label: "SLA", tone: "error", pulse: slaVencidos > 0 },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--color-border)]/45 pt-2.5 sm:gap-x-3"
      aria-label="Resumen de tickets"
    >
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 ? (
            <span className="hidden h-3 w-px shrink-0 bg-[var(--color-border)]/50 sm:inline" aria-hidden />
          ) : null}
          <span
            className={cn(
              "inline-flex items-baseline gap-1 whitespace-nowrap",
              item.pulse && "animate-pulse",
            )}
            title={`${item.value} ${item.label}`}
          >
            <span
              className={cn(
                "text-[13px] font-bold tabular-nums leading-none sm:text-sm",
                item.value === 0 ? "text-[var(--color-text-3)]" : kpiToneValueClass(item.tone),
              )}
            >
              {item.value}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              {item.label}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function TicketsHeroHeader({
  view,
  total,
  abiertos,
  borradores = 0,
  enProceso,
  esperandoRepuesto,
  resueltosHoy,
  slaVencidos,
  maintenanceAlertsCount = 0,
  preventiveTasksCount = 0,
}: {
  view: TicketsModuleView;
  total: number;
  abiertos: number;
  borradores?: number;
  enProceso: number;
  esperandoRepuesto: number;
  resueltosHoy: number;
  slaVencidos: number;
  maintenanceAlertsCount?: number;
  preventiveTasksCount?: number;
}) {
  const copy =
    view === "manage"
      ? {
          title: "Gestión de tickets",
          subtitle:
            "Apunte express en llamada. Despliega el formulario completo si necesitas tipología, adjuntos o ubicación.",
          showKpis: false,
          showManageKpis: true,
          bandejaCta: true,
          nuevoTicketCta: false,
        }
      : view === "bandeja"
        ? {
            title: "Bandeja de tickets",
            subtitle: "Sigue, asigna y cierra incidencias del centro de control.",
            showKpis: true,
            showManageKpis: false,
            bandejaCta: false,
            nuevoTicketCta: true,
          }
        : {
            title: "Bandeja de tickets",
            subtitle:
              "Incidencias del Centro de Control. Crea, asigna, sigue y cierra tickets con trazabilidad completa.",
            showKpis: true,
            showManageKpis: false,
            bandejaCta: false,
            nuevoTicketCta: false,
          };

  return (
    <header className="tickets-hero-glow relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-accent-light)]/30 p-4 shadow-sm sm:p-5">
      <div
        aria-hidden
        className="ccmgc-hero-parallax pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
      />
      {/* Marca de agua: silueta REAL de Gran Canaria. El path proviene
       *  del fichero "Mapa Canarias Gran Canaria.svg" de Wikimedia
       *  Commons (Julio Reis / CC), normalizado al origen 0,0 con
       *  viewBox 97.29 x 102.80 para encajar limpio.
       *
       *  Se usa `style` inline (no className Tailwind) para position y
       *  size porque `.tickets-hero-glow > *` se redeclara despues que
       *  `.absolute` en el bundle CSS y sin la nueva regla
       *  `:not([aria-hidden])` lo sobreescribia. Inline siempre gana,
       *  asi blindamos contra futuros refactors del orden CSS.
       *
       *  Coherente con CCMGC (Centro de Control de Movilidad de Gran
       *  Canaria) y refuerza la identidad sin distraer (opacidad ~8%).
       *  Anclada a la derecha, sangrada fuera del contenedor: solo
       *  asoma la parte oeste/centro de la isla; el resto queda
       *  oculto por overflow-hidden del header.
       *
       *  Aria-hidden + pointer-events-none -> invisible para lectores
       *  de pantalla y no intercepta clicks. Oculta en mobile (< sm)
       *  para no competir con el contenido en iPhone 13 Pro. */}
      <svg
        aria-hidden
        viewBox="0 0 97.29 102.80"
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none hidden sm:block"
        style={{
          position: "absolute",
          right: "1%",
          top: "50%",
          transform: "translateY(-50%)",
          height: "175%",
          width: "auto",
          color: "#7dd3fc",
          filter: "drop-shadow(0 0 22px rgba(56,189,248,0.55))",
        }}
      >
        {/* Path: contorno REAL de Gran Canaria extraido del SVG oficial
         *  de Wikimedia Commons (Julio Reis, CC). Se pinta con:
         *    - Fill suave (opacity 0.10) para sugerir masa de la isla.
         *    - Stroke marcado (opacity 0.45, width 0.45 unidades del
         *      viewBox de 97 -> ~0.5%) para que la silueta destaque
         *      sobre el azul oscuro del header.
         *  El stroke es lo que la hace reconocible: sin el, el fill
         *  solo se confunde con el gradient del fondo. */}
        <path
          fill="currentColor"
          fillOpacity="0.10"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="0.45"
          strokeLinejoin="round"
          d="M 84.36,0 L 82.38,2.24 L 80.89,2.5 L 80.37,4.21 L 82.38,5.48 L 82.61,7.97 L 79.63,11.44 L 75.15,12.67 L 72.92,9.95 L 71.65,10.44 L 69.42,8.2 L 68.45,8.46 L 65.95,7.19 L 65.43,7.97 L 63.2,5.7 L 61.96,5.96 L 61.48,6.71 L 60.73,6.45 L 60.73,6.97 L 58.98,7.71 L 56.49,7.71 L 52.24,8.2 L 50.52,7.45 L 48.03,8.2 L 46.54,6.97 L 45.27,7.45 L 44.53,5.96 L 43.78,5.96 L 43.04,4.73 L 43.3,3.99 L 41.81,2.24 L 41.55,2.72 L 40.54,1.72 L 39.31,2.5 L 38.31,3.47 L 37.33,3.24 L 34.09,4.73 L 31.6,3.99 L 31.11,1.98 L 29.85,1.98 L 29.1,3.24 L 27.61,3.73 L 25.86,2.98 L 26.12,4.47 L 28.36,6.22 L 26.87,8.46 L 27.61,8.94 L 27.87,10.69 L 26.61,11.18 L 25.86,13.42 L 26.12,13.68 L 26.61,14.19 L 26.12,14.19 L 26.38,16.43 L 25.12,17.18 L 26.12,18.89 L 25.38,21.65 L 23.4,24.89 L 20.64,26.38 L 19.9,28.62 L 18.89,29.1 L 18.15,29.62 L 13.94,30.85 L 13.68,32.6 L 12.67,33.83 L 8.69,36.82 L 5.96,37.56 L 4.21,37.07 L 2.46,37.82 L 3.47,39.83 L 2.24,43.82 L 1.49,44.3 L 1.49,45.53 L 0,48.03 L 1.23,53.76 L 0,59.99 L 0.23,61.96 L 3.24,65.69 L 6.97,73.66 L 9.2,79.14 L 10.95,80.4 L 12.19,82.12 L 13.19,83.13 L 16.43,84.13 L 16.92,85.36 L 17.92,85.62 L 19.41,87.86 L 21.13,87.86 L 21.39,88.86 L 22.65,89.61 L 22.39,90.35 L 24.14,91.58 L 24.63,90.84 L 24.89,91.58 L 25.38,91.33 L 25.12,91.84 L 27.13,93.33 L 27.35,94.34 L 28.13,93.59 L 29.36,94.08 L 30.85,96.8 L 30.59,97.81 L 31.34,97.55 L 32.83,99.3 L 32.83,98.55 L 33.57,97.81 L 35.58,97.32 L 37.82,98.55 L 42.07,100.3 L 43.78,99.3 L 47.28,102.28 L 52.01,102.8 L 53.76,102.05 L 54.74,97.32 L 56.23,96.32 L 61.48,94.57 L 63.94,92.1 L 66.44,92.1 L 70.42,89.35 L 80.14,87.86 L 83.13,86.63 L 84.62,84.13 L 84.1,82.64 L 85.1,78.39 L 86.11,76.9 L 86.37,76.9 L 86.85,76.64 L 87.86,76.64 L 89.09,74.67 L 90.84,75.15 L 91.84,74.41 L 91.58,71.43 L 92.82,70.2 L 91.84,70.42 L 91.1,69.45 L 90.09,66.7 L 90.84,65.46 L 91.58,64.2 L 91.84,60.47 L 92.33,57.98 L 94.57,56.49 L 97.06,57.98 L 97.29,56.75 L 95.31,55.74 L 95.31,54.25 L 93.08,53.51 L 92.82,52.76 L 93.56,52.27 L 92.59,51.53 L 93.33,50.26 L 93.08,49.78 L 92.33,49.78 L 92.33,48.03 L 92.82,47.02 L 93.82,47.28 L 93.33,45.31 L 95.57,43.56 L 95.05,42.29 L 94.08,42.07 L 94.31,41.06 L 93.82,40.32 L 94.31,39.31 L 92.07,37.82 L 91.58,34.84 L 89.83,34.09 L 86.85,32.12 L 85.85,30.59 L 86.11,29.36 L 84.88,27.13 L 86.37,23.88 L 85.62,21.91 L 86.59,17.92 L 84.62,13.68 L 84.1,13.42 L 83.87,13.19 L 82.87,11.7 L 83.87,10.44 L 83.87,10.21 L 82.87,10.21 L 83.35,8.94 L 83.35,7.71 L 84.1,8.72 L 84.1,7.71 L 84.62,7.71 L 85.85,7.71 L 86.85,6.71 L 87.34,4.73 L 87.6,9.69 L 87.86,3.73 L 88.83,3.47 L 87.86,3.24 L 88.34,1.72 L 87.6,0.49 L 84.36,0 Z"
        />
      </svg>
      <div className="relative flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/25">
            <TicketIcon size={20} strokeWidth={1.7} className="text-[var(--color-accent)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="ccmgc-eyebrow dashboard-pretitle">
              <span className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
              CCMGC · Operación
            </div>
            {view === "manage" ? (
              <SectionTabs
                preset="tickets"
                size="sm"
                className="relative z-[1] mb-0 mt-2 border-b-0 pb-0"
              />
            ) : null}
            <h1 className="dashboard-hero-title mt-1 text-[22px] font-semibold leading-tight tracking-tight sm:text-[24px]">
              {copy.title}
            </h1>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
              {copy.subtitle}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {copy.nuevoTicketCta ? (
            <TicketsModuleCta
              href="/tickets"
              icon={Plus}
              label="Nuevo ticket"
              hint="Alta de incidencia"
            />
          ) : null}
          {copy.bandejaCta ? (
            <TicketsModuleCta
              href="/bandeja"
              icon={Inbox}
              label="Abrir bandeja completa"
              hint="Listado operativo en vivo"
              variant="secondary"
            />
          ) : null}
          {copy.showManageKpis ? (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Indicadores de gestión">
              <KpiPill label="Abiertos" value={abiertos} tone="info" compact />
              <KpiPill label="Alertas" value={maintenanceAlertsCount} tone="warning" compact />
              <KpiPill label="Preventivas" value={preventiveTasksCount} tone="accent" compact />
            </div>
          ) : copy.showKpis && view !== "bandeja" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <KpiPill label="Total" value={total} tone="neutral" compact />
              {borradores > 0 ? (
                <KpiPill label="Pend." value={borradores} tone="warning" compact />
              ) : null}
              <KpiPill label="Abiertos" value={abiertos} tone="info" compact />
              <KpiPill label="Proceso" value={enProceso} tone="accent" compact />
              {esperandoRepuesto > 0 ? (
                <KpiPill label="Espera" value={esperandoRepuesto} tone="warning" compact />
              ) : null}
              {resueltosHoy > 0 ? (
                <KpiPill label="Hoy" value={resueltosHoy} tone="success" compact />
              ) : null}
              {slaVencidos > 0 ? (
                <KpiPill label="SLA" value={slaVencidos} tone="error" pulse icon={<Timer size={11} strokeWidth={1.8} aria-hidden />} compact />
              ) : null}
            </div>
          ) : null}
        </div>
        </div>
        {copy.showKpis && view === "bandeja" ? (
          <TicketBandejaKpiStrip
            total={total}
            borradores={borradores}
            abiertos={abiertos}
            enProceso={enProceso}
            esperandoRepuesto={esperandoRepuesto}
            resueltosHoy={resueltosHoy}
            slaVencidos={slaVencidos}
          />
        ) : null}
      </div>
    </header>
  );
}

export type TicketsModuleView = "full" | "bandeja" | "manage";

/**
 * Vista del modulo de tickets. Separa lo que se ve en cada pagina:
 *   - "full"    : todo junto (formulario + bandeja + operativa secundaria).
 *                 Comportamiento legado, util si se quiere recuperar la
 *                 vista combinada en algun punto.
 *   - "bandeja" : solo el listado de tickets (hero KPIs + filtros + tabla).
 *                 La usa la pagina /bandeja, promovida a entrada propia
 *                 del sidebar (junio 2026) para que el equipo del centro
 *                 acceda a la bandeja con 1 click sin perderse entre el
 *                 formulario y la operativa preventiva.
 *   - "manage"  : la "trastienda" — formulario de crear ticket + alertas
 *                 preventivas + tareas preventivas + auditoria. La usa
 *                 la pagina /tickets (de ahi el nombre): es el sitio para
 *                 dar de alta tickets y revisar el contexto preventivo.
 */
export function TicketsModule({ view = "full" }: { view?: TicketsModuleView } = {}) {
  const t = useTickets();
  const [requestDeletionTarget, setRequestDeletionTarget] = useState<{ id: string; title: string } | null>(null);
  const showForm = view !== "bandeja";
  const showInbox = view !== "manage";
  const showSecondary = view !== "bandeja";
  const [nowMs, setNowMs] = useState<number | null>(null);
  const toolbarSentinelRef = useRef<HTMLDivElement>(null);
  const [toolbarStuck, setToolbarStuck] = useState(false);

  useEffect(() => {
    const el = toolbarSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setToolbarStuck(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-1px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showInbox]);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const heroKpis = useMemo(() => {
    const now = nowMs ?? 0;
    const todayStart = new Date(now || Date.now());
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    let abiertos = 0;
    let borradores = 0;
    let enProceso = 0;
    let esperandoRepuesto = 0;
    let resueltosHoy = 0;
    let slaVencidos = 0;
    for (const tk of t.tickets) {
      if (ticketNeedsCompletion(tk)) borradores += 1;
      else if (tk.status === "abierto") abiertos += 1;
      else if (tk.status === "en_proceso") enProceso += 1;
      else if (tk.status === "esperando_repuesto") esperandoRepuesto += 1;
      else if (tk.status === "resuelto") {
        const resAt = (tk as { resolvedAt?: string | null }).resolvedAt ?? tk.updatedAt;
        if (nowMs !== null && resAt && new Date(resAt).getTime() >= todayMs) resueltosHoy += 1;
      }
      if (
        nowMs !== null &&
        tk.status !== "resuelto" &&
        !ticketNeedsCompletion(tk) &&
        tk.status !== "borrador" &&
        tk.slaDeadline &&
        new Date(tk.slaDeadline).getTime() < now
      ) {
        slaVencidos += 1;
      }
    }
    return {
      total: t.tickets.length,
      abiertos,
      borradores,
      enProceso,
      esperandoRepuesto,
      resueltosHoy: nowMs === null ? 0 : resueltosHoy,
      slaVencidos: nowMs === null ? 0 : slaVencidos,
    };
  }, [t.tickets, nowMs]);

  if (t.loading) {
    if (view === "bandeja") return <BandejaViewSkeleton />;
    return <TicketsManageViewSkeleton />;
  }

  return (
    <div className="space-y-4">
      {canReviewTicketDeletion(t.role) ? <TicketDeletionRequestsPanel /> : null}
      <TicketsHeroHeader
        view={view}
        total={heroKpis.total}
        abiertos={heroKpis.abiertos}
        borradores={heroKpis.borradores}
        enProceso={heroKpis.enProceso}
        esperandoRepuesto={heroKpis.esperandoRepuesto}
        resueltosHoy={heroKpis.resueltosHoy}
        slaVencidos={heroKpis.slaVencidos}
        maintenanceAlertsCount={t.maintenanceAlerts.length}
        preventiveTasksCount={t.preventiveTasks.length}
      />
      <section
        className={cn(
          "grid grid-cols-1 gap-4",
          // Solo activamos el grid de 12 columnas cuando se muestran las
          // dos columnas (formulario + bandeja). En vistas individuales
          // dejamos una sola columna para que cada bloque ocupe todo el
          // ancho disponible.
          showForm && showInbox && "xl:grid-cols-12",
        )}
      >
        {showForm ? (
          view === "manage" ? (
            <div className="space-y-4">
              <ExpressTicketPanel
                catalog={t.catalog}
                tipologias={t.tipologias}
                sessionUser={t.sessionUser}
                draftCount={heroKpis.borradores}
                embedded
                onCreated={() => void t.loadData()}
              />
              <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-[var(--color-text-1)] marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-2)] ring-1 ring-[var(--color-border)]">
                      <ClipboardList size={15} strokeWidth={1.7} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block">Ticket completo</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-[var(--color-text-3)]">
                        Tipología, ubicación, adjuntos y todos los campos operativos
                      </span>
                    </span>
                  </span>
                  <ChevronDown
                    size={16}
                    className="shrink-0 text-[var(--color-text-3)] transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="border-t border-[var(--color-border)]/80 px-1 pb-1 pt-2 sm:px-2">
                  <TicketCreateForm
                    catalog={t.catalog}
                    lineas={t.lineas}
                    tipologias={t.tipologias}
                    sessionUser={t.sessionUser}
                    saving={t.saving}
                    onCreateTicket={t.handleCreateTicket}
                    setError={t.setError}
                    setNotice={t.setNotice}
                    setNoticeTone={t.setNoticeTone}
                    setNoticePlacement={t.setNoticePlacement}
                    embedded
                  />
                </div>
              </details>
            </div>
          ) : (
            <TicketCreateForm
              catalog={t.catalog}
              lineas={t.lineas}
              tipologias={t.tipologias}
              sessionUser={t.sessionUser}
              saving={t.saving}
              onCreateTicket={t.handleCreateTicket}
              setError={t.setError}
              setNotice={t.setNotice}
              setNoticeTone={t.setNoticeTone}
              setNoticePlacement={t.setNoticePlacement}
            />
          )
        ) : null}

        {showInbox ? (
        <article
          // En movil reducimos a p-3 para que el contenido respire (el
          // padding del <main> y el de la card interna `ccmgc-card p-4`
          // sumaban 36px laterales y dejaba las cards de tickets pegadas).
          className={cn(
            // En /bandeja un solo marco: article = card; toolbar + tabla van
            // dentro sin ccmgc-card anidada en TicketsBandeja.
            view === "bandeja"
              ? "ccmgc-card overflow-hidden p-0 shadow-sm"
              : "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-5",
            showForm && "xl:col-span-7",
          )}
          aria-describedby="tickets-inbox-hint"
        >
          <p id="tickets-inbox-hint" className="sr-only">
            {t.inboxScreenReaderSummary}
          </p>
          {t.error && (
            <div
              role="alert"
              aria-live="assertive"
              className={cn(
                "mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]",
                view === "bandeja" && "mx-4 mt-4",
              )}
            >
              <AlertCircle size={14} className="flex-shrink-0" />
              {t.error}
            </div>
          )}
          {t.notice && t.noticePlacement === "toast" && typeof document !== "undefined"
            ? createPortal(
                <div
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "pointer-events-none fixed right-4 top-[4.75rem] z-[90] flex max-w-[min(22rem,calc(100vw-2rem))] items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm md:top-5",
                    t.noticeTone === "warning"
                      ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                      : "border-[var(--color-success)]/35 bg-[var(--color-surface)]/95 text-[var(--color-success)]",
                  )}
                >
                  {t.noticeTone === "warning" ? (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  ) : (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 leading-snug">{t.notice}</span>
                </div>,
                document.body,
              )
            : null}
          {t.notice && t.noticePlacement !== "toast" ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "mb-3 rounded-lg border px-4 py-3 text-sm",
                view === "bandeja" && "mx-4 mt-4",
                t.noticePlacement === "center" && "mx-auto flex max-w-lg flex-col items-center gap-1.5 text-center",
                t.noticePlacement === "card" && "flex items-start gap-2 text-left",
                t.noticeTone === "warning" &&
                  "border-[var(--color-warning)]/35 bg-[var(--color-warning-light)] text-[var(--color-warning)]",
                t.noticeTone === "info" &&
                  "border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] text-[var(--color-text-1)]",
                t.noticeTone === "success" &&
                  "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]",
              )}
            >
              {t.noticeTone === "warning" ? (
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              ) : t.noticeTone === "info" ? (
                <PackageSearch size={14} className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 leading-snug">{t.notice}</span>
            </div>
          ) : null}

          <div ref={toolbarSentinelRef} className="h-px w-full shrink-0" aria-hidden />
          <div
            className={cn(
              "bandeja-toolbar-sticky space-y-2",
              toolbarStuck && "is-stuck",
              view === "bandeja" && "bandeja-toolbar-sticky--embedded px-4 pt-4 sm:px-5",
            )}
          >
          <div className="flex items-center justify-end">
            <FeedbackTargetButton id="tickets/bandeja" label="Bandeja de tickets" />
          </div>

          {canUseFilters(t.role) ? (
            <div className="space-y-3">
              <SavedViewsBar
                currentQuery={(() => {
                  const q = new URLSearchParams();
                  if (t.statusFilter !== "todos") q.set("status", t.statusFilter);
                  if (t.priorityFilter !== "todos") q.set("priority", t.priorityFilter);
                  if (t.operatorFilter !== "todas") q.set("operator", t.operatorFilter);
                  if (t.busFilter !== "todas") q.set("busId", t.busFilter);
                  if (t.tipoFilter !== "todos") q.set("tipo", t.tipoFilter);
                  if (t.partCodeFromQuery) q.set("partCode", t.partCodeFromQuery);
                  if (t.onlyMine) q.set("mine", "1");
                  return q.toString();
                })()}
                onApply={t.applyView}
              />

              <div className="space-y-3">
                {/* Búsqueda + KPIs + vista compartible */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 w-full basis-full sm:min-w-[12rem] sm:flex-1">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[var(--color-text-3)]"
                      aria-hidden
                    />
                    <Input
                      ref={t.filterSearchRef}
                      type="search"
                      value={t.searchQuery}
                      onChange={(e) => t.setSearchQuery(e.target.value)}
                      placeholder="Buscar título, bus, tipo, pieza…"
                      className="h-9 w-full rounded-lg border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-9 pr-8 text-[12.5px] shadow-sm"
                      aria-label="Buscar tickets"
                    />
                    {t.searchQuery ? (
                      <button
                        type="button"
                        onClick={() => t.setSearchQuery("")}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {t.filtersInUrl ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--color-accent)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--color-accent)]"
                        title="La URL incluye los filtros activos; cópiala para compartir esta vista."
                      >
                        <Link2 size={10} strokeWidth={1.8} className="shrink-0" aria-hidden />
                        Compartible
                      </span>
                    ) : null}
                    <KpiPill label="Alta" value={t.ticketCountByPriority.alta} tone="error" compact />
                    <KpiPill label="Media" value={t.ticketCountByPriority.media} tone="warning" compact />
                    <KpiPill label="Baja" value={t.ticketCountByPriority.baja} tone="success" compact />
                  </div>
                </div>

                {/* Estado + prioridad + atajos */}
                <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-2">
                  <FilterLabeledGroup label="Estado">
                    <FilterPills
                      value={t.statusFilter}
                      onChange={(v) => t.setStatusFilter(v as "todos" | TicketStatus)}
                      options={[
                        { v: "todos", label: "Todas" },
                        { v: "borrador", label: "Pend. completar" },
                        { v: "abierto", label: "Abiertas" },
                        { v: "en_proceso", label: "En proceso" },
                        { v: "esperando_repuesto", label: "Esp. rep." },
                        { v: "resuelto", label: "Resueltas" },
                      ]}
                    />
                  </FilterLabeledGroup>

                  <FilterDivider className="hidden lg:block" />

                  <FilterLabeledGroup label="Prioridad">
                    <FilterPills
                      value={t.priorityFilter}
                      onChange={(v) => t.setPriorityFilter(v as "todos" | TicketPriority)}
                      options={[
                        { v: "todos", label: "Cualquiera" },
                        { v: "alta", label: "Alta" },
                        { v: "media", label: "Media" },
                        { v: "baja", label: "Baja" },
                      ]}
                    />
                  </FilterLabeledGroup>

                  {t.sessionUser ? (
                    <>
                      <FilterDivider className="hidden lg:block" />
                      <FilterLabeledGroup label="Atajos">
                        <FilterPillToggle pressed={t.onlyMine} onClick={() => t.setOnlyMine((v) => !v)}>
                          <UserCheck size={11} aria-hidden />
                          Mis tickets
                        </FilterPillToggle>
                      </FilterLabeledGroup>
                    </>
                  ) : null}
                </div>

                {/* Refinamiento + acciones */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-[var(--color-surface-2)]/40 px-3 py-2">
                  <FilterSelect
                    Icon={Tags}
                    label="Tipo"
                    value={t.tipoFilter}
                    onChange={t.setTipoFilter}
                    inactiveValue="todos"
                    options={[
                      { value: "todos", label: "Todos los tipos" },
                      ...t.tipoFilterOptions.map((tipo) => ({ value: tipo, label: tipo })),
                    ]}
                  />
                  <FilterSelect
                    Icon={Building2}
                    label="Operadora"
                    value={t.operatorFilter}
                    onChange={t.setOperatorFilter}
                    inactiveValue="todas"
                    options={[
                      { value: "todas", label: "Todas las operadoras" },
                      ...t.operators.map((op) => ({ value: op, label: op })),
                    ]}
                  />
                  <FilterSelect
                    Icon={BusIcon}
                    label="Bus"
                    value={t.busFilter}
                    onChange={t.setBusFilter}
                    inactiveValue="todas"
                    options={[
                      { value: "todas", label: "Todos los buses" },
                      ...t.catalog.map((bus) => ({ value: bus.id, label: bus.id })),
                    ]}
                  />

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-[var(--color-text-3)]">
                      Mostrando{" "}
                      <strong className="font-semibold tabular-nums text-[var(--color-text-1)]">
                        {t.filteredTickets.length}
                      </strong>{" "}
                      de{" "}
                      <span className="tabular-nums text-[var(--color-text-2)]">{t.tickets.length}</span>
                    </span>
                    <button
                      type="button"
                      onClick={t.handleExportTicketsCsv}
                      disabled={t.tickets.length === 0}
                      title="Exportar la bandeja visible a CSV (cabecera CCMGC, fechas legibles, UTF-8)"
                      className="desvios-action-chip !h-7 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download size={12} aria-hidden />
                      CSV
                    </button>
                    <ExcelExportMenu
                      disabled={t.tickets.length === 0}
                      buildBaseQuery={() => {
                        const query = new URLSearchParams();
                        if (t.statusFilter !== "todos") query.set("status", t.statusFilter);
                        if (t.priorityFilter !== "todos") query.set("priority", t.priorityFilter);
                        if (t.operatorFilter !== "todas") query.set("operator", t.operatorFilter);
                        if (t.busFilter !== "todas") query.set("busId", t.busFilter);
                        if (t.tipoFilter !== "todos") query.set("tipo", t.tipoFilter);
                        if (t.partCodeFromQuery) query.set("partCode", t.partCodeFromQuery);
                        if (t.onlyMine) query.set("mine", "1");
                        return query;
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => t.setBandejaCompacta((v) => !v)}
                      aria-pressed={t.bandejaCompacta}
                      title={t.bandejaCompacta ? "Vista detallada" : "Vista compacta (menos padding en tabla)"}
                      className={cn(
                        "desvios-action-chip !h-7",
                        t.bandejaCompacta && "desvios-action-chip--accent",
                      )}
                    >
                      Compacta
                    </button>
                    <button
                      type="button"
                      onClick={t.handleClearFilters}
                      className="desvios-action-chip !h-7"
                    >
                      <X size={12} aria-hidden />
                      Limpiar
                    </button>
                    {(t.role === "tecnico_campo" || t.role === "gestor_centro_control") ? (
                      <button
                        type="button"
                        onClick={() => t.setQuickTicketOpen(true)}
                        title="Crear un ticket rápido a partir de una plantilla (atajo: Q)"
                        className="desvios-action-chip !h-7"
                      >
                        <Zap size={12} aria-hidden />
                        Rápido
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => t.setShortcutsOpen((v) => !v)}
                      title="Atajos de teclado (?)"
                      className={cn(
                        "desvios-action-chip !h-7",
                        t.shortcutsOpen && "desvios-action-chip--accent",
                      )}
                      aria-expanded={t.shortcutsOpen}
                      aria-controls="tickets-shortcuts-panel"
                    >
                      <Keyboard size={12} aria-hidden />
                      Atajos
                    </button>
                  </div>
                </div>

                {/* Tags activos */}
                {t.statusFilter !== "todos" ||
                t.priorityFilter !== "todos" ||
                t.operatorFilter !== "todas" ||
                t.busFilter !== "todas" ||
                t.tipoFilter !== "todos" ||
                t.onlyMine ||
                t.searchQuery.trim() ||
                t.partCodeFromQuery ? (
                  <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros activos">
                    {t.statusFilter !== "todos" ? (
                      <FilterActiveTag
                        label={`Estado: ${statusMap[t.statusFilter]}`}
                        onClear={() => t.setStatusFilter("todos")}
                      />
                    ) : null}
                    {t.priorityFilter !== "todos" ? (
                      <FilterActiveTag
                        label={`Prioridad: ${toUiPriority(t.priorityFilter)}`}
                        onClear={() => t.setPriorityFilter("todos")}
                      />
                    ) : null}
                    {t.operatorFilter !== "todas" ? (
                      <FilterActiveTag
                        label={`Operadora: ${t.operatorFilter}`}
                        onClear={() => t.setOperatorFilter("todas")}
                      />
                    ) : null}
                    {t.busFilter !== "todas" ? (
                      <FilterActiveTag
                        label={`Bus: ${t.busFilter}`}
                        onClear={() => t.setBusFilter("todas")}
                      />
                    ) : null}
                    {t.tipoFilter !== "todos" ? (
                      <FilterActiveTag
                        label={`Tipo: ${t.tipoFilter}`}
                        onClear={() => t.setTipoFilter("todos")}
                      />
                    ) : null}
                    {t.onlyMine ? (
                      <FilterActiveTag
                        label="Mis tickets"
                        icon={<UserCheck size={10} aria-hidden />}
                        onClear={() => t.setOnlyMine(false)}
                      />
                    ) : null}
                    {t.searchQuery.trim() ? (
                      <FilterActiveTag
                        label={`«${t.searchQuery.trim()}»`}
                        icon={<Search size={10} aria-hidden />}
                        onClear={() => t.setSearchQuery("")}
                        title="Limpiar búsqueda"
                      />
                    ) : null}
                    {t.partCodeFromQuery ? (
                      <FilterActiveTag
                        label={`Pieza: ${t.partCodeFromQuery}`}
                        onClear={t.clearPartCodeFilter}
                        title="Quitar filtro de pieza"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {view === "bandeja" ? (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent-light)]/30 px-3 py-2 text-xs text-[var(--color-text-2)]">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--color-accent)]" aria-hidden />
                  <span>
                    Vista de conductor: ves todos los tickets visibles del centro, sin filtros avanzados.
                  </span>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--color-surface-2)]/35 px-3 py-2 text-xs text-[var(--color-text-3)]">
                <span>Vista simplificada · conductor</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <KpiPill label="Alta" value={t.ticketCountByPriority.alta} tone="error" compact />
                  <KpiPill label="Media" value={t.ticketCountByPriority.media} tone="warning" compact />
                  <KpiPill label="Baja" value={t.ticketCountByPriority.baja} tone="success" compact />
                </div>
              </div>
            </div>
          )}

          {t.shortcutsOpen ? (
            <div
              id="tickets-shortcuts-panel"
              role="region"
              aria-label="Atajos de teclado"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 text-[11px] leading-relaxed text-[var(--color-text-2)]"
            >
              <ul className="list-inside list-disc space-y-1.5">
                <li>
                  <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">/</kbd>{" "}
                  Enfoca el filtro &quot;Estado&quot; (no aplica si ya escribes en un campo).
                </li>
                <li>
                  <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">?</kbd>{" "}
                  Abre o cierra esta ayuda.
                </li>
                <li>
                  <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">Escape</kbd>{" "}
                  Cierra la ayuda.
                </li>
                <li>
                  <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">N</kbd>{" "}
                  {view === "bandeja"
                    ? "Ir a Tickets para crear una incidencia nueva."
                    : "Ir al formulario de nuevo ticket y enfocar el primer campo."}
                </li>
                {(t.role === "tecnico_campo" || t.role === "gestor_centro_control") ? (
                <li>
                  <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">Q</kbd>{" "}
                  Abrir el modal de <span className="font-medium">Ticket rápido</span> (plantilla + variables).
                </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          </div>

          <TicketsBandeja
            ticketsCount={t.tickets.length}
            filteredTickets={t.filteredTickets}
            role={t.role}
            bandejaCompacta={t.bandejaCompacta}
            hideCardHeader={view === "bandeja"}
            actionMenuTicketId={t.actionMenuTicketId}
            onToggleActionMenu={(ticketId) =>
              t.setActionMenuTicketId((id) => (id === ticketId ? null : ticketId))
            }
            onOpenStatusChange={t.openStatusChangeModal}
            onOpenEdit={t.openTicketEdit}
            isReadOnly={t.sessionUser?.isReadOnly === true}
            partCodeFromQuery={t.partCodeFromQuery}
            onClearPartCodeFilter={t.clearPartCodeFilter}
            onClearFilters={t.handleClearFilters}
            searchQuery={t.searchQuery}
            onlyMine={t.onlyMine}
            statusFilter={t.statusFilter}
            priorityFilter={t.priorityFilter}
            operatorFilter={t.operatorFilter}
            busFilter={t.busFilter}
            actorUserId={t.sessionUser?.id}
          />
        </article>
        ) : null}
      </section>

      {showSecondary ? (
        <>
          {/* Operativa secundaria: bloque visual diferenciado del tronco
            * (bandeja + form). Header con título + divider para separar
            * jerarquía. */}
          <div className="mt-2 mb-3 flex items-center gap-3">
            <span className="tickets-section-eyebrow">
              <span className="tickets-section-eyebrow-dot" aria-hidden />
              Operativa secundaria
            </span>
            <span className="tickets-section-divider" aria-hidden />
            <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]/70 sm:inline">
              Contexto del centro
            </span>
          </div>
          {/*
           * Distribución del contexto operativo:
           *   - Fila principal: Alertas preventivas + Tareas preventivas, en
           *     pareja (50/50 en desktop) por ser las dos vistas que todo el
           *     personal usa a diario.
           *   - Auditoría: solo visible para `gestor_centro_control`; ocupa el
           *     ancho completo abajo, porque sus filas son más anchas y se
           *     beneficia de hacerse panorámica.
           */}
          <div className="mb-4 grid min-h-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
            {/* Alertas preventivas */}
            <div className="tickets-secondary-panel tickets-secondary-panel--warning flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[260px]">
              <div className="mb-3 flex shrink-0 items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1",
                    t.maintenanceAlerts.length > 0
                      ? "bg-[var(--color-warning-light)] text-[var(--color-warning)] ring-[var(--color-warning)]/25"
                      : "bg-[var(--color-success-light)] text-[var(--color-success)] ring-[var(--color-success)]/25",
                  )}
                >
                  <AlertTriangle size={13} strokeWidth={1.7} aria-hidden />
                </span>
                <h4 className="text-[13px] font-semibold text-[var(--color-text-1)]">Alertas preventivas</h4>
                {t.maintenanceAlerts.length > 0 ? (
                  <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--color-warning-light)] px-1.5 text-[10px] font-semibold text-[var(--color-warning)]">
                    {t.maintenanceAlerts.length}
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
                <MaintenanceAlertsPanel
                  alerts={t.maintenanceAlerts}
                  windowDays={t.maintenanceWindowDays}
                  onCreateTask={t.handleCreatePreventiveTask}
                />
              </div>
            </div>

            {/* Tareas preventivas */}
            <div className="tickets-secondary-panel flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[240px]">
              <div className="mb-1 flex shrink-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
                  <CalendarCheck size={13} strokeWidth={1.7} aria-hidden />
                </span>
                <h4 className="text-[13px] font-semibold text-[var(--color-text-1)]">Tareas preventivas</h4>
                {t.preventiveTasks.length > 0 ? (
                  <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--color-surface)] px-1.5 text-[10px] font-semibold text-[var(--color-text-2)]">
                    {t.preventiveTasks.length}
                  </span>
                ) : null}
              </div>
              <p className="mb-3 ml-[2.375rem] shrink-0 text-[10px] text-[var(--color-text-3)]">
                Mantenimiento programado y seguimiento por bus / activo.
              </p>
              <div className="min-h-0 flex-1 max-h-[min(320px,42vh)] space-y-2 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
                {t.preventiveTasks.slice(0, 6).map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs transition-colors hover:border-[var(--color-border-hover)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[var(--color-text-1)]">
                        {task.busId} · {task.assetType} <span className="text-caption font-normal">({task.creatorName})</span>
                      </p>
                      <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium", preventiveTaskTone[task.status])}>
                        {task.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[var(--color-text-2)]">{task.reason}</p>
                    <p className="mt-1 text-caption text-[var(--color-text-3)]">
                      Técnico: {task.assignedToUserName ?? "Sin asignar"} · Programada:{" "}
                      {task.scheduledAt ? new Date(task.scheduledAt).toLocaleString("es-ES") : "Sin fecha"}
                    </p>
                    {(t.role === "tecnico_campo" || t.role === "gestor_centro_control") && (
                      <div className="mt-2 space-y-2">
                        {/* Acciones de cambio de estado. Antes se renderizaban
                         * como botones con el texto literal del estado
                         * ("pendiente", "programada", "cancelada") y todos
                         * compartian el mismo estilo gris neutro, por lo que
                         * el usuario no entendia que "cancelada" era una
                         * accion (lo confundia con un chip de estado).
                         *
                         * Ahora cada accion tiene:
                         *   - Verbo explicito en la etiqueta ("Cancelar tarea"
                         *     en vez de "cancelada").
                         *   - Tono visual propio (rojo para destructivo, azul
                         *     para programar, neutro para reabrir).
                         *   - Confirmacion al cancelar para evitar clicks
                         *     accidentales sobre acciones destructivas. */}
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              { status: "pendiente" as const, label: "Reabrir como pendiente", tone: "neutral" as const },
                              { status: "programada" as const, label: "Marcar como programada", tone: "accent" as const },
                              { status: "cancelada" as const, label: "Cancelar tarea", tone: "danger" as const },
                            ]
                          )
                            .filter(({ status }) => status !== task.status)
                            .map(({ status, label, tone }) => (
                              <button
                                key={`${task.id}-${status}`}
                                onClick={() => {
                                  if (
                                    tone === "danger" &&
                                    !window.confirm(
                                      `¿Cancelar esta tarea preventiva (${task.busId} · ${task.assetType})? Podrás reabrirla más tarde si fue por error.`,
                                    )
                                  ) {
                                    return;
                                  }
                                  void t.handleUpdatePreventiveTaskStatus(task.id, status);
                                }}
                                className={cn(
                                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-all duration-150",
                                  tone === "neutral" &&
                                    "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-1)]",
                                  tone === "accent" &&
                                    "border-[var(--color-accent)]/35 bg-[var(--color-accent-light)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/15",
                                  tone === "danger" &&
                                    "border-[var(--color-error)]/35 bg-[var(--color-error-light)] text-[var(--color-error)] hover:bg-[var(--color-error)]/15",
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          {task.status !== "completada" && (
                            <button
                              onClick={() => {
                                t.setCompletingTaskId(t.completingTaskId === task.id ? null : task.id);
                                t.setCompletionNote("");
                              }}
                              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-400 transition-all duration-150 hover:bg-emerald-500/20"
                            >
                              Completar…
                            </button>
                          )}
                        </div>
                        {t.completingTaskId === task.id && (
                          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 space-y-2">
                            <textarea
                              value={t.completionNote}
                              onChange={(e) => t.setCompletionNote(e.target.value)}
                              placeholder="Notas de cierre (opcional)…"
                              rows={2}
                              className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => void t.handleCompleteTask(task.id)}
                                className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => {
                                  t.setCompletingTaskId(null);
                                  t.setCompletionNote("");
                                }}
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1 text-[11px] text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface)]"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {t.role === "gestor_centro_control" && (
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <Select
                          value={t.taskPlans[task.id]?.assignedToUserId ?? ""}
                          onChange={(event) =>
                            t.setTaskPlans((prev) => ({
                              ...prev,
                              [task.id]: {
                                assignedToUserId: event.target.value,
                                scheduledAt: prev[task.id]?.scheduledAt ?? "",
                              },
                            }))
                          }
                          className="!min-h-9 rounded-md px-2 py-1.5 text-[11px]"
                          placeholder="Asignar tecnico"
                          aria-label="Asignar tecnico"
                        >
                          <option value="">Asignar tecnico</option>
                          {t.technicians.map((technician) => (
                            <option key={technician.id} value={technician.id}>
                              {technician.name}
                            </option>
                          ))}
                        </Select>
                        <input
                          type="datetime-local"
                          value={t.taskPlans[task.id]?.scheduledAt ?? ""}
                          onChange={(event) =>
                            t.setTaskPlans((prev) => ({
                              ...prev,
                              [task.id]: {
                                assignedToUserId: prev[task.id]?.assignedToUserId ?? "",
                                scheduledAt: event.target.value,
                              },
                            }))
                          }
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2 py-1.5 text-[11px] text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                        />
                        <button
                          onClick={() => void t.handlePlanPreventiveTask(task.id)}
                          className="rounded-md border border-[var(--color-accent)]/35 bg-[var(--color-accent-light)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-accent)] transition-all duration-150 hover:bg-[var(--color-accent)]/15"
                        >
                          Planificar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {t.preventiveTasks.length === 0 && (
                  <EmptyState
                    icon={CalendarCheck}
                    title="Sin tareas preventivas activas"
                    hint="No hay mantenimientos programados."
                    compact
                  />
                )}
              </div>
            </div>
          </div>

          {/*
           * Auditoría reciente: panel reservado a gestores del centro. Va
           * full-width abajo porque sus filas (actor + acción + detalle +
           * fecha relativa) son largas y se benefician de ancho extra.
           */}
          {t.role === "gestor_centro_control" ? (
            <div className="tickets-secondary-panel mb-4 flex min-h-[14rem] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-hover)] hover:shadow-md">
              <div className="mb-3 flex shrink-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-3)] text-[var(--color-text-2)] ring-1 ring-[var(--color-border)]">
                  <ClipboardList size={13} strokeWidth={1.7} aria-hidden />
                </span>
                <h4 className="text-[13px] font-semibold text-[var(--color-text-1)]">Auditoría reciente</h4>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]"
                  title="Sólo visible para gestores del centro de control"
                >
                  <Lock size={9} strokeWidth={1.8} aria-hidden />
                  Gestor
                </span>
                {t.auditEvents.length > 0 ? (
                  <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--color-surface)] px-1.5 text-[10px] font-semibold text-[var(--color-text-2)]">
                    {t.auditEvents.length}
                  </span>
                ) : null}
              </div>
              <p className="mb-3 text-[10.5px] text-[var(--color-text-3)]">
                Trazabilidad del centro: cambios de ticket, accesos y operaciones recientes.
              </p>
              <div className="relative min-h-0 flex-1">
                <div className="max-h-72 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
                  <AuditPanel events={t.auditEvents} />
                </div>
                {t.auditEvents.length > 5 ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--color-surface-2)] via-[var(--color-surface-2)]/80 to-transparent"
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <TicketActionMenu
        ticket={t.actionMenuTicket}
        viewport={t.actionMenuViewport}
        role={t.role}
        isReadOnly={t.sessionUser?.isReadOnly === true}
        onOpenStatusChange={t.openStatusChangeModal}
        onOpenAssign={(ticketId, currentTechnicianId) => {
          t.setAssignTarget(ticketId);
          t.setAssignTechnicianId(currentTechnicianId ?? "");
          t.setActionMenuTicketId(null);
        }}
        onOpenEdit={t.openTicketEdit}
        onOpenCompleteDraft={t.openDraftComplete}
        onOpenDelete={(ticketId, ticketTitle) => {
          t.setDeleteTarget({ id: ticketId, title: ticketTitle });
          t.setActionMenuTicketId(null);
        }}
        onOpenRequestDeletion={(ticketId, ticketTitle) => {
          setRequestDeletionTarget({ id: ticketId, title: ticketTitle });
          t.setActionMenuTicketId(null);
        }}
        actorUserId={t.sessionUser?.id}
      />

      {t.sessionUser && t.draftCompleteTicket ? (
        <DraftCompleteDialog
          open={Boolean(t.draftCompleteId)}
          ticket={t.draftCompleteTicket}
          catalog={t.catalog}
          lineas={t.lineas}
          tipologias={t.tipologias}
          sessionUser={t.sessionUser}
          onClose={() => t.setDraftCompleteId(null)}
          onCompleted={async () => {
            window.dispatchEvent(new Event("ccmgc-ticket-drafts-changed"));
            t.setDraftCompleteId(null);
            t.setNotice("Borrador completado correctamente.");
            t.setNoticeTone("success");
            t.setNoticePlacement("toast");
            await t.loadData();
          }}
        />
      ) : null}

      {t.sessionUser && t.editTargetTicket ? (
        <TicketEditDialog
          ticket={t.editTargetTicket}
          sessionUser={t.sessionUser}
          open={Boolean(t.editTargetId)}
          onClose={() => t.setEditTargetId(null)}
          onSaved={async () => {
            t.setEditTargetId(null);
            t.setNotice("Datos del ticket corregidos correctamente.");
            await t.loadData();
          }}
        />
      ) : null}

      <DeleteTicketDialog
        ticketId={t.deleteTarget?.id ?? null}
        ticketLabel={
          t.deleteTarget
            ? `#${t.deleteTarget.id.slice(-8).toUpperCase()} · ${t.deleteTarget.title}`
            : undefined
        }
        onClose={() => t.setDeleteTarget(null)}
        onDeleted={() => {
          void t.handleTicketDeleted();
        }}
      />

      <RequestTicketDeletionDialog
        ticketId={requestDeletionTarget?.id ?? null}
        ticketLabel={
          requestDeletionTarget
            ? `#${requestDeletionTarget.id.slice(-8).toUpperCase()} · ${requestDeletionTarget.title}`
            : undefined
        }
        onClose={() => setRequestDeletionTarget(null)}
        onSubmitted={() => {
          setRequestDeletionTarget(null);
          t.setNotice("Solicitud enviada. Un gestor la revisará pronto.");
          t.setNoticeTone("success");
          t.setNoticePlacement("toast");
        }}
      />

      <ModalShell
        open={Boolean(t.assignTarget)}
        onClose={() => {
          t.setAssignTarget(null);
          t.setAssignTechnicianId("");
        }}
        title="Asignar técnico"
        maxWidth="28rem"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                t.setAssignTarget(null);
                t.setAssignTechnicianId("");
              }}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={() => void t.handleAssignTicket()}>
              Guardar
            </Button>
          </>
        }
      >
        <p className="text-xs text-[var(--color-text-3)]">Ticket {t.assignTarget}</p>
        <label className="mt-4 block text-xs font-medium text-[var(--color-text-2)]" htmlFor="assign-tech-select">
          Técnico
        </label>
        <Select
          id="assign-tech-select"
          value={t.assignTechnicianId}
          onChange={(event) => t.setAssignTechnicianId(event.target.value)}
          wrapperClassName="mt-1.5"
        >
          <option value="">Sin asignar</option>
          {t.technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.name}
            </option>
          ))}
        </Select>
      </ModalShell>

      <QuickTicketDialog
        open={t.quickTicketOpen}
        onClose={() => t.setQuickTicketOpen(false)}
        catalog={t.catalog}
        lineas={t.lineas}
        tipologias={t.tipologias}
        sessionUser={t.sessionUser}
        saving={t.saving}
        onCreateTicket={t.handleCreateTicket}
      />

      <StatusChangeModal
        open={Boolean(t.statusChangeTarget)}
        title="Confirmar cambio de estado"
        targetLabel={t.statusChangeTarget ? statusMap[t.statusChangeTarget.nextStatus] : ""}
        comment={t.statusChangeComment}
        onCommentChange={(value) => {
          t.setStatusChangeComment(value);
          if (t.statusChangeError) t.setStatusChangeError(null);
        }}
        onConfirm={t.handleStatusChange}
        onCancel={() => {
          t.setStatusChangeTarget(null);
          t.setStatusChangeComment("");
          t.setStatusChangeError(null);
          t.setStatusChangeSubmitting(false);
        }}
        error={t.statusChangeError}
        submitting={t.statusChangeSubmitting}
      />
    </div>
  );
}
