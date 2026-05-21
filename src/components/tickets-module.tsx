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
  PackageSearch,
  Search,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useState } from "react";

import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { StatusChangeModal } from "@/components/status-change-modal";
import { TicketActionMenu } from "@/components/tickets/TicketActionMenu";
import { TicketCreateForm } from "@/components/tickets/TicketCreateForm";
import { TicketsBandeja } from "@/components/tickets/TicketsBandeja";
import type {
  AuditEventView,
  InventorySummaryItem,
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
import { ccmgcNativeSelectClassName } from "@/components/ui/input";
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
  iconSize = 40,
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
      <Icon size={iconSize} className="mb-3 text-[var(--color-text-3)]" />
      <p className="text-subheading text-[var(--color-text-2)]">{title}</p>
      <p className="mx-auto mt-1 max-w-[280px] text-caption text-[var(--color-text-3)]">{hint}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg border border-[var(--color-accent)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-all duration-150 hover:bg-[var(--color-accent-light)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function InventoryPanel({ items }: { items: InventorySummaryItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyStateBlock
        icon={PackageSearch}
        title="Sin repuestos en inventario"
        hint="El catálogo de stock está vacío o aún no se ha sincronizado."
        iconSize={36}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.partCode}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] p-3"
        >
          <div className="mb-1 grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-0">
            <p className="text-sm font-medium leading-tight text-[var(--color-text-1)]">{item.partName}</p>
            <div className="col-start-2 row-start-1 pt-0.5">
              <Badge variant={item.status === "ok" ? "success" : item.status === "bajo" ? "warning" : "error"}>
                {item.status === "ok" ? "OK" : item.status === "bajo" ? "Bajo" : "Agotado"}
              </Badge>
            </div>
          </div>
          <p className="mb-2 text-caption font-mono">{item.partCode}</p>
          <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--color-text-3)]">
            <span>
              Disp: <span className="font-medium text-[var(--color-text-1)]">{item.totalAvailable}</span>
            </span>
            <span>Mín: {item.minimumLevel}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.min(100, (item.totalAvailable / Math.max(item.minimumLevel, 1)) * 100)}%`,
                backgroundColor:
                  item.status === "ok"
                    ? "var(--color-success)"
                    : item.status === "bajo"
                      ? "var(--color-warning)"
                      : "var(--color-error)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
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
  return (
    <div className="space-y-2">
      {events.slice(0, 8).map((event, index) => {
        const expanded = expandedId === event.id;
        const detailText = event.detail ?? "Sin detalle";
        const tsShort = new Date(event.createdAt).toLocaleString("es-ES", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        return (
          <div key={event.id} className="relative flex items-start gap-3">
            {index < Math.min(events.length, 8) - 1 && (
              <div className="absolute left-[7px] top-5 h-[calc(100%-0.25rem)] w-px bg-[var(--color-accent)]/15" />
            )}
            <div className="z-10 mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full border-2 border-[var(--color-accent)]/35 bg-[var(--color-surface)] shadow-[0_0_0_1px_var(--color-border)]" />
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <p className="text-sm font-semibold text-[var(--color-text-1)]">{event.actor}</p>
                <time className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-3)]" dateTime={event.createdAt}>
                  {tsShort}
                </time>
              </div>
              <p className={cn("mt-0.5 text-[12px] leading-snug text-[var(--color-text-2)]", !expanded && "line-clamp-2")} title={event.action}>
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
  onCreateTask,
}: {
  alerts: MaintenanceAlertView[];
  onCreateTask: (alert: MaintenanceAlertView) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className={cn(TICKETS_EMPTY_SHELL, "py-8")}>
        <CheckCircle2 size={36} className="mb-3 text-[var(--color-success)]" />
        <p className="text-subheading text-[var(--color-text-2)]">Todos los activos en buen estado</p>
        <p className="mx-auto mt-1 max-w-[260px] text-caption text-[var(--color-text-3)]">Sin tendencias de fallo en 30 días en el conjunto monitorizado.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.slice(0, 4).map((alert) => (
        <div
          key={`${alert.busId}-${alert.assetType}`}
          className={cn(
            "rounded-r-lg border border-[var(--color-border)] border-l-4 p-3 text-xs",
            alert.severity === "critical"
              ? "border-l-[var(--color-error)] bg-[var(--color-error-light)]"
              : "border-l-[var(--color-warning)] bg-[var(--color-warning-light)]",
          )}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="font-medium text-[var(--color-text-1)]">
              {alert.busId} · {alert.assetType}
            </p>
            <Badge variant={alert.severity === "critical" ? "error" : "warning"}>
              {alert.severity === "critical" ? "Critico" : "Warning"}
            </Badge>
          </div>
          <p className="mb-2 text-[var(--color-text-2)]">
            {alert.failuresLast30Days} fallos en 30 días · {alert.municipio}
          </p>
          {alert.hasOpenPreventiveTask ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)]">
              <CheckCircle2 size={11} />
              Tarea abierta ({alert.preventiveTaskId})
            </span>
          ) : (
            <button
              onClick={() => onCreateTask(alert)}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-2)] transition-all duration-150 hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]"
            >
              + Crear tarea preventiva
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function TicketsModule() {
  const t = useTickets();

  if (t.loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
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
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <TicketCreateForm
          catalog={t.catalog}
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
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-shadow duration-200 hover:shadow-md xl:col-span-7"
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
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent-light)] px-3 py-2.5 text-xs text-[var(--color-text-2)]">
              <p className="min-w-0 flex-1 leading-relaxed">
                <span className="font-medium text-[var(--color-text-1)]">Consejo:</span>{" "}
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1 font-mono">/</kbd>{" "}
                filtro estado,{" "}
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1 font-mono">N</kbd>{" "}
                nuevo ticket,{" "}
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1 font-mono">?</kbd>{" "}
                ayuda. Los filtros se reflejan en la URL para compartir la vista.
              </p>
              <button
                type="button"
                className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]"
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

          <div className="mb-2 flex items-center justify-between">
            <p className="text-label text-[var(--color-text-3)]">Bandeja de tickets</p>
            <FeedbackTargetButton id="tickets/bandeja" label="Bandeja de tickets" />
          </div>

          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 lg:flex-row lg:flex-wrap lg:items-center">
            {t.filtersInUrl ? (
              <div
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-accent)]/25 bg-[var(--color-accent-light)]/35 px-2 py-1.5 text-[10px] font-medium text-[var(--color-text-2)]"
                title="La barra de direcciones incluye filtros; puedes copiar el enlace para compartir esta vista."
              >
                <Link2 size={12} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
                Vista compartible (filtros en URL)
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:flex-wrap md:items-center md:gap-2">
              <div
                className="flex flex-wrap items-center gap-1"
                title="A = Alta, M = Media, B = Baja. Leyenda también en la segunda línea en pantallas estrechas."
              >
                <Badge variant="error" className="px-1.5 py-0 text-[10px] font-semibold" title="Prioridad alta">
                  A:{t.ticketCountByPriority.alta}
                </Badge>
                <Badge variant="warning" className="px-1.5 py-0 text-[10px] font-semibold" title="Prioridad media">
                  M:{t.ticketCountByPriority.media}
                </Badge>
                <Badge variant="success" className="px-1.5 py-0 text-[10px] font-semibold" title="Prioridad baja">
                  B:{t.ticketCountByPriority.baja}
                </Badge>
                <span className="hidden pl-1 text-[11px] leading-snug text-[var(--color-text-3)] sm:inline">
                  · Alta · Media · Baja
                </span>
              </div>
              <p className="w-full pl-0.5 text-balance text-[11px] leading-snug text-[var(--color-text-3)] sm:hidden">
                Alta · Media · Baja
              </p>

              <div className="hidden h-5 w-px shrink-0 bg-[var(--color-border)] sm:block" />

              {canUseFilters(t.role) ? (
                <>
                  <div className="hidden flex-wrap items-center gap-2 md:flex">
                    <div className="relative">
                      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]" aria-hidden />
                      <input
                        type="text"
                        value={t.searchQuery}
                        onChange={(e) => t.setSearchQuery(e.target.value)}
                        placeholder="Buscar tickets…"
                        className="w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] py-1.5 pl-8 pr-7 text-xs text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      />
                      {t.searchQuery && (
                        <button
                          onClick={() => t.setSearchQuery("")}
                          aria-label="Limpiar búsqueda"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
                        >
                          <X size={12} aria-hidden />
                        </button>
                      )}
                    </div>
                    <select
                      ref={t.statusFilterSelectRef}
                      value={t.statusFilter}
                      onChange={(e) => t.setStatusFilter(e.target.value as "todos" | TicketStatus)}
                      className={cn(
                        ccmgcNativeSelectClassName,
                        "w-auto !min-h-9 bg-[var(--color-surface-3)] py-1.5 text-xs focus:ring-2 focus:ring-[var(--color-accent)]",
                      )}
                    >
                      <option value="todos">Todos los estados</option>
                      <option value="abierto">Abierto</option>
                      <option value="en_proceso">En Proceso</option>
                      <option value="esperando_repuesto">Esperando Repuesto</option>
                      <option value="resuelto">Resuelto</option>
                    </select>
                    <select
                      value={t.priorityFilter}
                      onChange={(e) => t.setPriorityFilter(e.target.value as "todos" | TicketPriority)}
                      className={cn(
                        ccmgcNativeSelectClassName,
                        "w-auto !min-h-9 bg-[var(--color-surface-3)] py-1.5 text-xs focus:ring-2 focus:ring-[var(--color-accent)]",
                      )}
                      aria-label="Filtrar por prioridad"
                    >
                      <option value="todos">Todas las prioridades</option>
                      <option value="alta">Prioridad alta</option>
                      <option value="media">Prioridad media</option>
                      <option value="baja">Prioridad baja</option>
                    </select>
                    <select
                      value={t.operatorFilter}
                      onChange={(e) => t.setOperatorFilter(e.target.value)}
                      className={cn(
                        ccmgcNativeSelectClassName,
                        "w-auto !min-h-9 bg-[var(--color-surface-3)] py-1.5 text-xs focus:ring-2 focus:ring-[var(--color-accent)]",
                      )}
                    >
                      <option value="todas">Todas las operadoras</option>
                      {t.operators.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <select
                      value={t.busFilter}
                      onChange={(e) => t.setBusFilter(e.target.value)}
                      className={cn(
                        ccmgcNativeSelectClassName,
                        "w-auto !min-h-9 bg-[var(--color-surface-3)] py-1.5 text-xs focus:ring-2 focus:ring-[var(--color-accent)]",
                      )}
                    >
                      <option value="todas">Todos los buses</option>
                      {t.catalog.map((bus) => (
                        <option key={bus.id} value={bus.id}>
                          {bus.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <details
                    className="group w-full md:hidden"
                    onToggle={(e) => {
                      const root = e.currentTarget;
                      if (!root.open) return;
                      window.requestAnimationFrame(() => {
                        root.querySelector<HTMLSelectElement>("select")?.focus();
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
                      <select
                        value={t.statusFilter}
                        onChange={(e) => t.setStatusFilter(e.target.value as "todos" | TicketStatus)}
                        className={cn(ccmgcNativeSelectClassName, "!min-h-10 bg-[var(--color-surface-3)] py-2 text-xs focus:ring-2 focus:ring-[var(--color-accent)]")}
                      >
                        <option value="todos">Todos los estados</option>
                        <option value="abierto">Abierto</option>
                        <option value="en_proceso">En Proceso</option>
                        <option value="esperando_repuesto">Esperando Repuesto</option>
                        <option value="resuelto">Resuelto</option>
                      </select>
                      <select
                        value={t.priorityFilter}
                        onChange={(e) => t.setPriorityFilter(e.target.value as "todos" | TicketPriority)}
                        className={cn(ccmgcNativeSelectClassName, "!min-h-10 bg-[var(--color-surface-3)] py-2 text-xs focus:ring-2 focus:ring-[var(--color-accent)]")}
                        aria-label="Filtrar por prioridad"
                      >
                        <option value="todos">Todas las prioridades</option>
                        <option value="alta">Prioridad alta</option>
                        <option value="media">Prioridad media</option>
                        <option value="baja">Prioridad baja</option>
                      </select>
                      <select
                        value={t.operatorFilter}
                        onChange={(e) => t.setOperatorFilter(e.target.value)}
                        className={cn(ccmgcNativeSelectClassName, "!min-h-10 bg-[var(--color-surface-3)] py-2 text-xs focus:ring-2 focus:ring-[var(--color-accent)]")}
                      >
                        <option value="todas">Todas las operadoras</option>
                        {t.operators.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                      <select
                        value={t.busFilter}
                        onChange={(e) => t.setBusFilter(e.target.value)}
                        className={cn(ccmgcNativeSelectClassName, "!min-h-10 bg-[var(--color-surface-3)] py-2 text-xs focus:ring-2 focus:ring-[var(--color-accent)]")}
                      >
                        <option value="todas">Todos los buses</option>
                        {t.catalog.map((bus) => (
                          <option key={bus.id} value={bus.id}>
                            {bus.id}
                          </option>
                        ))}
                      </select>
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

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs leading-snug text-[var(--color-text-2)]">
            <span className="min-w-0">
              <span className="hidden min-[1360px]:inline">
                Atajos: <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">/</kbd> estado ·{" "}
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">N</kbd> nuevo ·{" "}
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">?</kbd> ayuda ·{" "}
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">Esc</kbd> cerrar
              </span>
              <span className="inline min-[1360px]:hidden">
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px]">?</kbd> o botón Atajos (lista completa dentro)
              </span>
            </span>
            <button
              type="button"
              onClick={() => t.setShortcutsOpen((v) => !v)}
              title="Atajos: / estado, ? ayuda, N nuevo ticket, Escape cerrar."
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
              aria-expanded={t.shortcutsOpen}
              aria-controls="tickets-shortcuts-panel"
            >
              <Keyboard size={14} className="text-[var(--color-text-3)]" aria-hidden />
              Atajos
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

          <div className="mb-4 grid min-h-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
            <div className="flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[240px]">
              <p className="mb-3 flex h-9 shrink-0 items-center gap-1.5 text-label text-[var(--color-text-2)]">
                <PackageSearch size={14} className="text-[var(--color-text-3)]" aria-hidden />
                Inventario
              </p>
              <div className="min-h-0 flex-1 max-h-52 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
                <InventoryPanel items={t.inventorySummary} />
              </div>
            </div>

            <div className="flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[240px]">
              <p className="mb-3 flex h-9 min-h-9 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-label text-[var(--color-text-2)]">
                <ClipboardList size={14} className="text-[var(--color-text-3)]" aria-hidden />
                Auditoría reciente
                {t.auditEvents.length > 0 ? (
                  <span className="ml-auto text-[10px] font-normal text-[var(--color-text-3)]">
                    {t.auditEvents.length} evento{t.auditEvents.length === 1 ? "" : "s"} recientes
                  </span>
                ) : null}
              </p>
              <div className="relative min-h-0 flex-1">
                <div className="max-h-52 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
                  <AuditPanel events={t.auditEvents} />
                </div>
                {t.auditEvents.length > 3 ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--color-surface-2)] via-[var(--color-surface-2)]/80 to-transparent"
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>

            <div className="flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[240px]">
              <p className="mb-3 flex h-9 shrink-0 items-center gap-1.5 text-label text-[var(--color-text-2)]">
                <AlertTriangle size={14} className="text-[var(--color-text-3)]" aria-hidden />
                Alertas preventivas
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
                <MaintenanceAlertsPanel alerts={t.maintenanceAlerts} onCreateTask={t.handleCreatePreventiveTask} />
              </div>
            </div>

            <div className="flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[240px]">
              <p className="mb-3 flex h-9 shrink-0 items-center gap-1.5 text-label text-[var(--color-text-2)]">
                <CalendarCheck size={14} className="text-[var(--color-text-3)]" aria-hidden />
                Tareas preventivas
              </p>
              <p className="mb-3 shrink-0 text-[10px] text-[var(--color-text-3)]">
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
                        <div className="flex flex-wrap gap-1.5">
                          {(["pendiente", "programada", "cancelada"] as const)
                            .filter((s) => s !== task.status)
                            .map((status) => (
                              <button
                                key={`${task.id}-${status}`}
                                onClick={() => void t.handleUpdatePreventiveTaskStatus(task.id, status)}
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2 py-1 text-[11px] text-[var(--color-text-2)] transition-all duration-150 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                              >
                                {status}
                              </button>
                            ))}
                          {task.status !== "completada" && (
                            <button
                              onClick={() => {
                                t.setCompletingTaskId(t.completingTaskId === task.id ? null : task.id);
                                t.setCompletionNote("");
                              }}
                              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-400 transition-all duration-150 hover:bg-emerald-500/20"
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
                        <select
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
                          className={cn(
                            ccmgcNativeSelectClassName,
                            "!min-h-9 rounded-md px-2 py-1.5 text-[11px] focus:ring-2 focus:ring-[var(--color-accent)]",
                          )}
                        >
                          <option value="">Asignar tecnico</option>
                          {t.technicians.map((technician) => (
                            <option key={technician.id} value={technician.id}>
                              {technician.name}
                            </option>
                          ))}
                        </select>
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
                    iconSize={36}
                  />
                )}
              </div>
            </div>
          </div>
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
                <select
                  id="assign-tech-select"
                  value={t.assignTechnicianId}
                  onChange={(event) => t.setAssignTechnicianId(event.target.value)}
                  className={cn(ccmgcNativeSelectClassName, "mt-1.5 w-full")}
                >
                  <option value="">Sin asignar</option>
                  {t.technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.name}
                    </option>
                  ))}
                </select>
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
