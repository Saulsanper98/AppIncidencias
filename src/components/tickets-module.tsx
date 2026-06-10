"use client";

import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Filter,
  Keyboard,
  Link2,
  Lock,
  PackageSearch,
  Search,
  Ticket as TicketIcon,
  Timer,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { StatusChangeModal } from "@/components/status-change-modal";
import { TicketActionMenu } from "@/components/tickets/TicketActionMenu";
import { DeleteTicketDialog } from "@/components/tickets/DeleteTicketDialog";
import { ExcelExportMenu } from "@/components/tickets/ExcelExportMenu";
import { QuickTicketDialog } from "@/components/tickets/QuickTicketDialog";
import { SavedViewsBar } from "@/components/tickets/SavedViewsBar";
import { TicketCreateForm } from "@/components/tickets/TicketCreateForm";
import { TicketsBandeja } from "@/components/tickets/TicketsBandeja";
import type {
  AuditEventView,
  MaintenanceAlertView,
} from "@/components/tickets/tickets-module-types";
import {
  TICKETS_EMPTY_SHELL,
  TICKETS_UI_HINT_KEY,
  preventiveTaskTone,
  statusMap,
} from "@/components/tickets/tickets-module-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useTickets } from "@/hooks/use-tickets";
import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { canUseFilters } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type EmptyIcon = typeof PackageSearch;

function EmptyStateBlock({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
  iconSize = 26,
  compact = false,
}: {
  icon: EmptyIcon;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  iconSize?: number;
  compact?: boolean;
}) {
  return (
    <div className={cn(TICKETS_EMPTY_SHELL, compact && "!py-6")}>
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-text-3)] ring-1 ring-[var(--color-border)]">
        <Icon size={iconSize} strokeWidth={1.5} aria-hidden />
      </span>
      <p className="text-subheading text-[var(--color-text-2)]">{title}</p>
      <p className="mx-auto mt-1 max-w-[280px] text-caption text-[var(--color-text-3)]">{hint}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/40 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-all duration-150 hover:bg-[var(--color-accent-light)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

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
      <EmptyStateBlock
        icon={ClipboardList}
        title="Sin eventos registrados"
        hint="La auditoría del centro aparecerá aquí cuando haya actividad."
        iconSize={36}
      />
    );
  }
  const deduped = dedupeAuditEvents(events.slice(0, 12)).slice(0, 8);
  return (
    <div className="space-y-2">
      {deduped.map((event, index) => {
        const expanded = expandedId === event.id;
        const detailText = event.detail ?? "Sin detalle";
        const rel = relativeTime(event.createdAt);
        return (
          <div key={event.id} className="relative flex items-start gap-3">
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
                  {rel}
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
      <div className={cn(TICKETS_EMPTY_SHELL, "py-8")}>
        <CheckCircle2 size={36} className="mb-3 text-[var(--color-success)]" />
        <p className="text-subheading text-[var(--color-text-2)]">Todos los activos en buen estado</p>
        <p className="mx-auto mt-1 max-w-[260px] text-caption text-[var(--color-text-3)]">
          Sin tendencias de fallo en {windowDays} días en el conjunto monitorizado.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {alerts.slice(0, 4).map((alert) => {
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

function TicketsHeroHeader({
  total,
  abiertos,
  enProceso,
  esperandoRepuesto,
  resueltosHoy,
  slaVencidos,
}: {
  total: number;
  abiertos: number;
  enProceso: number;
  esperandoRepuesto: number;
  resueltosHoy: number;
  slaVencidos: number;
}) {
  return (
    <header className="tickets-hero-glow relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-accent-light)]/30 p-4 shadow-sm sm:p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/25">
            <TicketIcon size={20} strokeWidth={1.7} className="text-[var(--color-accent)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="dashboard-pretitle">
              <span className="dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
              CCMGC · Operación
            </div>
            <h1 className="dashboard-hero-title mt-1 text-[22px] font-semibold leading-tight tracking-tight sm:text-[24px]">
              Bandeja de tickets
            </h1>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
              Incidencias del Centro de Control. Crea, asigna, sigue y cierra tickets con trazabilidad completa.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <KpiPill label="Total" value={total} tone="neutral" />
          <KpiPill label="Abiertos" value={abiertos} tone="info" />
          <KpiPill label="En proceso" value={enProceso} tone="accent" />
          {esperandoRepuesto > 0 ? (
            <KpiPill label="Esperando" value={esperandoRepuesto} tone="warning" />
          ) : null}
          {resueltosHoy > 0 ? (
            <KpiPill label="Resueltos hoy" value={resueltosHoy} tone="success" />
          ) : null}
          {slaVencidos > 0 ? (
            <KpiPill label="SLA vencido" value={slaVencidos} tone="error" pulse icon={<Timer size={11} strokeWidth={1.8} aria-hidden />} />
          ) : null}
        </div>
      </div>
    </header>
  );
}

type KpiTone = "neutral" | "info" | "accent" | "warning" | "success" | "error";

function KpiPill({
  label,
  value,
  tone,
  icon,
  pulse = false,
}: {
  label: string;
  value: number;
  tone: KpiTone;
  icon?: React.ReactNode;
  /** Pulse para urgencia (p.ej. SLA vencido > 0). */
  pulse?: boolean;
}) {
  // Mapa de tone -> variable CSS de color. El tone "neutral"/"info" no
  // tinta (queda gris); el resto pinta dot, borde y glow.
  const TONE_VAR: Record<KpiTone, string | undefined> = {
    neutral: undefined,
    info: undefined,
    accent: "var(--color-accent)",
    warning: "var(--color-warning)",
    success: "var(--color-success)",
    error: "var(--color-error)",
  };
  const toneVar = TONE_VAR[tone];
  return (
    <span
      className={cn("tickets-kpi-pill", pulse && "tickets-kpi-pill--pulse")}
      style={toneVar ? { ["--pill-tone" as string]: toneVar } : undefined}
    >
      {icon ?? (
        <span className="tickets-kpi-pill-dot" aria-hidden />
      )}
      <span className="tickets-kpi-pill-value">{value}</span>
      <span className="tickets-kpi-pill-label">{label}</span>
    </span>
  );
}

export function TicketsModule() {
  const t = useTickets();

  const heroKpis = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    let abiertos = 0;
    let enProceso = 0;
    let esperandoRepuesto = 0;
    let resueltosHoy = 0;
    let slaVencidos = 0;
    for (const tk of t.tickets) {
      if (tk.status === "abierto") abiertos += 1;
      else if (tk.status === "en_proceso") enProceso += 1;
      else if (tk.status === "esperando_repuesto") esperandoRepuesto += 1;
      else if (tk.status === "resuelto") {
        const resAt = (tk as { resolvedAt?: string | null }).resolvedAt ?? tk.updatedAt;
        if (resAt && new Date(resAt).getTime() >= todayMs) resueltosHoy += 1;
      }
      if (
        tk.status !== "resuelto" &&
        tk.slaDeadline &&
        new Date(tk.slaDeadline).getTime() < now
      ) {
        slaVencidos += 1;
      }
    }
    return {
      total: t.tickets.length,
      abiertos,
      enProceso,
      esperandoRepuesto,
      resueltosHoy,
      slaVencidos,
    };
  }, [t.tickets]);

  if (t.loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="h-[min(480px,62vh)] min-h-[360px] animate-pulse rounded-xl bg-[var(--color-surface-2)] xl:col-span-5" />
          <div className="flex h-[min(480px,62vh)] min-h-[360px] flex-col gap-3 animate-pulse rounded-xl bg-[var(--color-surface-2)] p-4 xl:col-span-7">
            <div className="h-10 rounded-lg bg-[var(--color-surface-3)]/80" />
            <div className="min-h-0 flex-1 rounded-lg bg-[var(--color-surface-3)]/50" />
            <div className="h-24 rounded-lg bg-[var(--color-surface-3)]/40" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TicketsHeroHeader
        total={heroKpis.total}
        abiertos={heroKpis.abiertos}
        enProceso={heroKpis.enProceso}
        esperandoRepuesto={heroKpis.esperandoRepuesto}
        resueltosHoy={heroKpis.resueltosHoy}
        slaVencidos={heroKpis.slaVencidos}
      />
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
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

        <motion.article
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1], delay: 0.02 }}
          // En movil reducimos a p-3 para que el contenido respire (el
          // padding del <main> y el de la card interna `ccmgc-card p-4`
          // sumaban 36px laterales y dejaba las cards de tickets pegadas).
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-5 xl:col-span-7"
          aria-describedby="tickets-inbox-hint"
        >
          <p id="tickets-inbox-hint" className="sr-only">
            {t.inboxScreenReaderSummary}
          </p>
          {t.error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]"
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

          {t.showTicketsUiHint ? (
            // Consejo discreto: tono neutro (no accent saturado), texto compacto.
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2 text-[11.5px] text-[var(--color-text-3)]">
              <p className="min-w-0 flex-1 leading-snug">
                <span className="kbd">/</span> filtro,{" "}
                <span className="kbd">N</span> nuevo,{" "}
                <span className="kbd">?</span> ayuda — los filtros viven en la URL para compartir la vista.
              </p>
              <button
                type="button"
                className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-2 py-1 text-[11px] font-medium text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                onClick={() => {
                  try {
                    sessionStorage.setItem(TICKETS_UI_HINT_KEY, "1");
                  } catch {
                    /* ignore */
                  }
                  t.setShowTicketsUiHint(false);
                }}
              >
                Entendido
              </button>
            </div>
          ) : null}

          {/* Feedback button en la esquina superior derecha de la zona de
              filtros (el título "Bandeja de tickets" duplicado se quita: ya
              vive dentro de la propia card TicketsBandeja). */}
          <div className="mb-2 flex items-center justify-end">
            <FeedbackTargetButton id="tickets/bandeja" label="Bandeja de tickets" />
          </div>

          {canUseFilters(t.role) ? (
            <div className="mb-2">
              <SavedViewsBar
                currentQuery={(() => {
                  const q = new URLSearchParams();
                  if (t.statusFilter !== "todos") q.set("status", t.statusFilter);
                  if (t.priorityFilter !== "todos") q.set("priority", t.priorityFilter);
                  if (t.operatorFilter !== "todas") q.set("operator", t.operatorFilter);
                  if (t.busFilter !== "todas") q.set("busId", t.busFilter);
                  if (t.partCodeFromQuery) q.set("partCode", t.partCodeFromQuery);
                  if (t.onlyMine) q.set("mine", "1");
                  return q.toString();
                })()}
                onApply={t.applyView}
              />
            </div>
          ) : null}

          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/55 px-3 py-2.5 lg:flex-row lg:flex-wrap lg:items-center">
            {t.filtersInUrl ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-accent)]/25 bg-[var(--color-accent-light)]/50 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]"
                title="La URL incluye los filtros activos; cópiala para compartir esta vista."
              >
                <Link2 size={10} strokeWidth={1.8} className="shrink-0" aria-hidden />
                Vista compartible
              </span>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:flex-wrap md:items-center md:gap-2">
              {/* Chips de conteo por prioridad con dot del color y label
               *  explicito (no criptico "A:1 / M:2 / B:1"). */}
              <div className="flex flex-wrap items-center gap-1" aria-label="Conteo por prioridad">
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--color-error-light)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--color-error)] ring-1 ring-[var(--color-error)]/25"
                  title={`${t.ticketCountByPriority.alta} de prioridad alta`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-error)]" aria-hidden />
                  Alta <span className="num-tabular">{t.ticketCountByPriority.alta}</span>
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--color-warning-light)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--color-warning)] ring-1 ring-[var(--color-warning)]/25"
                  title={`${t.ticketCountByPriority.media} de prioridad media`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" aria-hidden />
                  Media <span className="num-tabular">{t.ticketCountByPriority.media}</span>
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--color-success-light)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--color-success)] ring-1 ring-[var(--color-success)]/25"
                  title={`${t.ticketCountByPriority.baja} de prioridad baja`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" aria-hidden />
                  Baja <span className="num-tabular">{t.ticketCountByPriority.baja}</span>
                </span>
              </div>

              <div className="hidden h-5 w-px shrink-0 bg-[var(--color-border)] sm:block" />

              {canUseFilters(t.role) ? (
                <>
                  <div className="hidden flex-wrap items-center gap-2 md:flex">
                    <div className="group relative">
                      <Search
                        size={13}
                        strokeWidth={1.8}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] transition-colors group-focus-within:text-[var(--color-accent)]"
                        aria-hidden
                      />
                      <input
                        type="text"
                        value={t.searchQuery}
                        onChange={(e) => t.setSearchQuery(e.target.value)}
                        placeholder={"Buscar t\u00EDtulo, bus, pieza\u2026"}
                        className="w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-8 pr-7 text-xs text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] shadow-sm transition-colors focus:border-[var(--color-accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-light)]"
                      />
                      {t.searchQuery && (
                        <button
                          onClick={() => t.setSearchQuery("")}
                          aria-label="Limpiar búsqueda"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                        >
                          <X size={11} aria-hidden />
                        </button>
                      )}
                    </div>
                    {t.sessionUser ? (
                      <button
                        type="button"
                        onClick={() => t.setOnlyMine((v) => !v)}
                        aria-pressed={t.onlyMine}
                        title={
                          t.onlyMine
                            ? "Mostrando solo tickets asignados a ti"
                            : "Mostrar solo tickets asignados a ti"
                        }
                        className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
                          t.onlyMine
                            ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-sm"
                            : "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                        }`}
                      >
                        <UserCheck size={13} aria-hidden />
                        Mis tickets
                      </button>
                    ) : null}
                    <Select
                      ref={t.statusFilterSelectRef}
                      value={t.statusFilter}
                      onChange={(e) => t.setStatusFilter(e.target.value as "todos" | TicketStatus)}
                      wrapperClassName="w-auto"
                      className="w-auto !min-h-9 bg-[var(--color-surface-3)] py-1.5 text-xs"
                      aria-label="Filtrar por estado"
                    >
                      <option value="todos">Todos los estados</option>
                      <option value="abierto">Abierto</option>
                      <option value="en_proceso">En Proceso</option>
                      <option value="esperando_repuesto">Esperando Repuesto</option>
                      <option value="resuelto">Resuelto</option>
                    </Select>
                    <Select
                      value={t.priorityFilter}
                      onChange={(e) => t.setPriorityFilter(e.target.value as "todos" | TicketPriority)}
                      wrapperClassName="w-auto"
                      className="w-auto !min-h-9 bg-[var(--color-surface-3)] py-1.5 text-xs"
                      aria-label="Filtrar por prioridad"
                    >
                      <option value="todos">Todas las prioridades</option>
                      <option value="alta">Prioridad alta</option>
                      <option value="media">Prioridad media</option>
                      <option value="baja">Prioridad baja</option>
                    </Select>
                    <Select
                      value={t.operatorFilter}
                      onChange={(e) => t.setOperatorFilter(e.target.value)}
                      wrapperClassName="w-auto"
                      className="w-auto !min-h-9 bg-[var(--color-surface-3)] py-1.5 text-xs"
                      aria-label="Filtrar por operadora"
                    >
                      <option value="todas">Todas las operadoras</option>
                      {t.operators.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={t.busFilter}
                      onChange={(e) => t.setBusFilter(e.target.value)}
                      wrapperClassName="w-auto"
                      className="w-auto !min-h-9 bg-[var(--color-surface-3)] py-1.5 text-xs"
                      aria-label="Filtrar por bus"
                    >
                      <option value="todas">Todos los buses</option>
                      {t.catalog.map((bus) => (
                        <option key={bus.id} value={bus.id}>
                          {bus.id}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <details
                    className="group w-full md:hidden"
                    onToggle={(e) => {
                      const root = e.currentTarget;
                      if (!root.open) return;
                      window.requestAnimationFrame(() => {
                        root
                          .querySelector<HTMLButtonElement>('button[role="combobox"]')
                          ?.focus();
                      });
                    }}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2.5 text-xs text-[var(--color-text-2)] [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2 font-medium text-[var(--color-text-1)]">
                        <Filter size={14} className="text-[var(--color-text-3)]" aria-hidden />
                        Filtros de bandeja
                      </span>
                      <ChevronDown
                        size={14}
                        className="shrink-0 text-[var(--color-text-3)] transition-transform duration-200 group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {t.sessionUser ? (
                        <button
                          type="button"
                          onClick={() => t.setOnlyMine((v) => !v)}
                          aria-pressed={t.onlyMine}
                          className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors ${
                            t.onlyMine
                              ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-2)]"
                          }`}
                        >
                          <UserCheck size={14} aria-hidden />
                          Solo mis tickets
                        </button>
                      ) : null}
                      <Select
                        value={t.statusFilter}
                        onChange={(e) => t.setStatusFilter(e.target.value as "todos" | TicketStatus)}
                        className="!min-h-10 bg-[var(--color-surface-3)] py-2 text-xs"
                        aria-label="Filtrar por estado"
                      >
                        <option value="todos">Todos los estados</option>
                        <option value="abierto">Abierto</option>
                        <option value="en_proceso">En Proceso</option>
                        <option value="esperando_repuesto">Esperando Repuesto</option>
                        <option value="resuelto">Resuelto</option>
                      </Select>
                      <Select
                        value={t.priorityFilter}
                        onChange={(e) => t.setPriorityFilter(e.target.value as "todos" | TicketPriority)}
                        className="!min-h-10 bg-[var(--color-surface-3)] py-2 text-xs"
                        aria-label="Filtrar por prioridad"
                      >
                        <option value="todos">Todas las prioridades</option>
                        <option value="alta">Prioridad alta</option>
                        <option value="media">Prioridad media</option>
                        <option value="baja">Prioridad baja</option>
                      </Select>
                      <Select
                        value={t.operatorFilter}
                        onChange={(e) => t.setOperatorFilter(e.target.value)}
                        className="!min-h-10 bg-[var(--color-surface-3)] py-2 text-xs"
                        aria-label="Filtrar por operadora"
                      >
                        <option value="todas">Todas las operadoras</option>
                        {t.operators.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={t.busFilter}
                        onChange={(e) => t.setBusFilter(e.target.value)}
                        className="!min-h-10 bg-[var(--color-surface-3)] py-2 text-xs"
                        aria-label="Filtrar por bus"
                      >
                        <option value="todas">Todos los buses</option>
                        {t.catalog.map((bus) => (
                          <option key={bus.id} value={bus.id}>
                            {bus.id}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </details>
                </>
              ) : (
                <span className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-3)]">
                  Vista simplificada · conductor
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2 md:border-t-0 md:pt-0 md:pl-2">
              <button
                type="button"
                onClick={t.handleExportTicketsCsv}
                disabled={t.tickets.length === 0}
                title="Exportar la bandeja visible a CSV (UTF-8, separador punto y coma)"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-xs text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
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
                  "inline-flex min-h-10 items-center rounded-lg border px-3 py-1.5 text-xs transition-all duration-200 md:min-h-0",
                  t.bandejaCompacta
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]",
                )}
              >
                Compacta
              </button>
              <button
                type="button"
                onClick={t.handleClearFilters}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-xs text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] md:min-h-0"
              >
                <X size={12} aria-hidden />
                Limpiar
              </button>
            </div>
          </div>

          {/* Barra de atajos: en movil hace flex-wrap y los botones tienen
              min-h 36px para target tactil; en desktop mantiene el aspecto
              compacto original. mb mas amplio (4) en movil para separarlo
              visualmente de la card de bandeja que viene debajo. */}
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2 sm:mb-3">
            {(t.role === "tecnico_campo" || t.role === "gestor_centro_control") ? (
              <button
                type="button"
                onClick={() => t.setQuickTicketOpen(true)}
                title="Crear un ticket rápido a partir de una plantilla (atajo: Q)"
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-white sm:min-h-0 sm:text-[11px]"
              >
                <Zap size={12} strokeWidth={1.8} aria-hidden />
                Ticket rápido
                <kbd className="ml-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1 font-mono text-[9px] text-[var(--color-text-3)]">Q</kbd>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => t.setShortcutsOpen((v) => !v)}
              title={"Atajos: / filtra estado \u00B7 N nuevo \u00B7 Q r\u00E1pido \u00B7 ? ayuda \u00B7 Esc cerrar"}
              className={cn(
                "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors sm:min-h-0 sm:text-[11px]",
                t.shortcutsOpen
                  ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
              )}
              aria-expanded={t.shortcutsOpen}
              aria-controls="tickets-shortcuts-panel"
            >
              <Keyboard size={12} strokeWidth={1.8} aria-hidden />
              Atajos
              <kbd className="ml-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1 font-mono text-[9px] text-[var(--color-text-3)]">?</kbd>
            </button>
          </div>

          {t.shortcutsOpen ? (
            <div
              id="tickets-shortcuts-panel"
              role="region"
              aria-label="Atajos de teclado"
              className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 text-[11px] leading-relaxed text-[var(--color-text-2)]"
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
                  Ir al formulario de nuevo ticket y enfocar el primer campo.
                </li>
                <li>
                  <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">Q</kbd>{" "}
                  Abrir el modal de <span className="font-medium">Ticket rápido</span> (plantilla + variables).
                </li>
              </ul>
            </div>
          ) : null}

          <TicketsBandeja
            ticketsCount={t.tickets.length}
            filteredTickets={t.filteredTickets}
            role={t.role}
            bandejaCompacta={t.bandejaCompacta}
            actionMenuTicketId={t.actionMenuTicketId}
            onToggleActionMenu={(ticketId) =>
              t.setActionMenuTicketId((id) => (id === ticketId ? null : ticketId))
            }
            onOpenStatusChange={t.openStatusChangeModal}
            partCodeFromQuery={t.partCodeFromQuery}
            onClearPartCodeFilter={t.clearPartCodeFilter}
            onClearFilters={t.handleClearFilters}
          />

          {/* Operativa secundaria: bloque visual diferenciado del tronco
            * (bandeja + form). Header con título + divider para separar
            * jerarquía. */}
          <div className="mt-6 mb-3 flex items-center gap-3">
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
            <div className="flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[260px]">
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
            <div className="flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[240px]">
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
                  <EmptyStateBlock
                    icon={CalendarCheck}
                    title="Sin tareas preventivas activas"
                    hint="No hay mantenimientos programados."
                    iconSize={26}
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
            <div className="mb-4 flex min-h-[14rem] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-hover)] hover:shadow-md">
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
        </motion.article>
      </section>

      <TicketActionMenu
        ticket={t.actionMenuTicket}
        viewport={t.actionMenuViewport}
        role={t.role}
        onOpenStatusChange={t.openStatusChangeModal}
        onOpenAssign={(ticketId, currentTechnicianId) => {
          t.setAssignTarget(ticketId);
          t.setAssignTechnicianId(currentTechnicianId ?? "");
          t.setActionMenuTicketId(null);
        }}
        onOpenDelete={(ticketId, ticketTitle) => {
          t.setDeleteTarget({ id: ticketId, title: ticketTitle });
          t.setActionMenuTicketId(null);
        }}
      />

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

      {t.assignTarget && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="assign-ticket-title"
              className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  t.setAssignTarget(null);
                  t.setAssignTechnicianId("");
                }
              }}
            >
              <div
                className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id="assign-ticket-title" className="text-sm font-semibold text-[var(--color-text-1)]">
                  Asignar técnico
                </h2>
                <p className="mt-1 text-xs text-[var(--color-text-3)]">Ticket {t.assignTarget}</p>
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
                <div className="mt-5 flex justify-end gap-2">
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
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

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
