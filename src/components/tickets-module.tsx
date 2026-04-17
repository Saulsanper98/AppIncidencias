"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Download,
  Filter,
  Keyboard,
  Link2,
  MapPinned,
  MoreHorizontal,
  PackageSearch,
  Plus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  UploadCloud,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { StatusChangeModal } from "@/components/status-change-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { AssetType, SessionUser, Ticket, TicketPriority, TicketStatus, UserRole } from "@/lib/domain";
import { canUseFilters, getAllowedTransitions } from "@/lib/rbac";
import { calculatePriority, calculateSlaMinutes, formatSlaOverdueLabel, toUiPriority } from "@/lib/ticketing";
import type { NivelImpacto, TipologiaItem } from "@/lib/tipologia";
import {
  priorityBadgeProps,
  slaMinsRemainingTextClass,
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";

const TicketLocationPicker = dynamic(
  () => import("@/components/tickets/ticket-location-picker").then((m) => m.TicketLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[200px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] text-caption text-[var(--color-text-3)]"
        aria-busy="true"
      >
        Cargando selector de mapa…
      </div>
    ),
  },
);

type TicketAttachmentView = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  downloadUrl?: string | null;
};

type TicketView = Ticket & {
  operator: string;
  municipio: string;
  assetType: AssetType;
  attachments: TicketAttachmentView[];
  comments: { id: string; author: string; body: string; createdAt: string }[];
};

type CatalogBus = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
  assets: { id: string; type: AssetType; serialNumber: string }[];
};

type CatalogPayload = {
  buses: CatalogBus[];
  tipologias: TipologiaItem[];
};

type FormState = {
  busId: string;
  assetId: string;
  tipo: string;
  subtipo: string;
  subsubtipo: string;
  dominio: string;
  nivelImpacto: NivelImpacto;
  origenTecnico: string;
  observaciones: string;
  title: string;
  description: string;
  impactedLines: number;
  serviceStopped: boolean;
  comment: string;
  /** WGS84 opcional; ambas vacías o ambas numéricas para el mapa. */
  mapLatitude: string;
  mapLongitude: string;
  /** Municipio o lugar inferido al colocar el pin (geocodificación inversa). */
  mapPlaceMunicipio: string;
};

type InventorySummaryItem = {
  assetType: AssetType;
  partCode: string;
  partName: string;
  totalAvailable: number;
  totalReserved: number;
  minimumLevel: number;
  status: "ok" | "bajo" | "agotado";
  ticketCount?: number;
};

type LocalUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

type AuditEventView = {
  id: string;
  action: string;
  detail: string | null;
  ticketId: string | null;
  createdAt: string;
  actor: string;
  actorRole: UserRole | null;
};

type MaintenanceAlertView = {
  busId: string;
  assetType: AssetType;
  operator: string;
  municipio: string;
  failuresLast30Days: number;
  severity: "warning" | "critical";
  hasOpenPreventiveTask: boolean;
  preventiveTaskId: string | null;
};

type PreventiveTaskView = {
  id: string;
  busId: string;
  assetType: AssetType;
  reason: string;
  status: "pendiente" | "programada" | "completada" | "cancelada";
  assignedToUserId: string | null;
  assignedToUserName: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
};

const defaultForm = (busId = ""): FormState => ({
  busId,
  assetId: "",
  tipo: "",
  subtipo: "",
  subsubtipo: "",
  dominio: "",
  nivelImpacto: "Medio",
  origenTecnico: "",
  observaciones: "",
  title: "",
  description: "",
  impactedLines: 1,
  serviceStopped: false,
  comment: "",
  mapLatitude: "",
  mapLongitude: "",
  mapPlaceMunicipio: "",
});

const statusMap: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_proceso: "En Proceso",
  esperando_repuesto: "Esperando Repuesto",
  resuelto: "Resuelto",
};

const preventiveTaskTone = {
  pendiente: "bg-amber-400/20 text-amber-100",
  programada: "bg-cyan-400/20 text-cyan-100",
  completada: "bg-emerald-400/20 text-emerald-100",
  cancelada: "bg-slate-400/20 text-slate-200",
};

const TICKETS_EMPTY_SHELL =
  "flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-10 text-center";

const TICKET_FORM_DRAFT_KEY = "ccmgc_ticket_new_form_draft_v1";
const TICKETS_BANDEJA_COMPACT_KEY = "ccmgc_tickets_bandeja_compact_v1";
const TICKETS_UI_HINT_KEY = "ccmgc_tickets_ui_hint_dismissed_v1";
const TICKET_ATTACH_MAX_FILES = 8;
const TICKET_ATTACH_MAX_BYTES = 5 * 1024 * 1024;

type TicketFormSectionId = "equipment" | "tipologia" | "detail" | "attachments";

const TICKET_FORM_SECTION_ORDER: TicketFormSectionId[] = ["equipment", "tipologia", "detail", "attachments"];

function normalizeAccordionOpen(
  raw: Partial<Record<TicketFormSectionId, boolean>> | undefined,
  fallback: TicketFormSectionId = "equipment",
): Record<TicketFormSectionId, boolean> {
  const first = raw ? TICKET_FORM_SECTION_ORDER.find((k) => raw[k]) : undefined;
  const key = first ?? fallback;
  return {
    equipment: key === "equipment",
    tipologia: key === "tipologia",
    detail: key === "detail",
    attachments: key === "attachments",
  };
}

type TicketFormDraftPayload = {
  form: FormState;
  openSections: Record<TicketFormSectionId, boolean>;
};

function CollapsibleFormBlock({
  title,
  subtitle,
  stepLabel,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  stepLabel?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 transition-shadow duration-200",
        open && "ring-2 ring-[var(--color-accent)]/30 shadow-[0_0_0_1px_rgba(37,99,235,0.12)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--color-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-label text-[var(--color-text-1)]">
            {stepLabel ? (
              <span className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-text-3)]">
                {stepLabel}
              </span>
            ) : null}
            {title}
          </p>
          {subtitle ? <p className="truncate text-caption text-[var(--color-text-3)]">{subtitle}</p> : null}
        </div>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-[var(--color-text-3)] transition-transform duration-200 ease-out", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="block"
            initial={{ height: 0, opacity: 0.6 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0.6 }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }
            }
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <div className="px-3 py-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const busIdFromQuery = searchParams.get("busId");
  const statusFromQuery = searchParams.get("status");
  const priorityFromQuery = searchParams.get("priority");
  const partCodeFromQuery = searchParams.get("partCode")?.trim() ?? "";

  const [users, setUsers] = useState<LocalUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<UserRole>("conductor");
  const [catalog, setCatalog] = useState<CatalogBus[]>([]);
  const [tipologias, setTipologias] = useState<TipologiaItem[]>([]);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [statusFilter, setStatusFilter] = useState<"todos" | TicketStatus>("todos");
  const [priorityFilter, setPriorityFilter] = useState<"todos" | TicketPriority>("todos");
  const [operatorFilter, setOperatorFilter] = useState<"todas" | string>("todas");
  const [busFilter, setBusFilter] = useState<"todas" | string>("todas");
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "warning" | "info">("success");
  const [noticePlacement, setNoticePlacement] = useState<"card" | "toast" | "center">("card");
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventView[]>([]);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState<MaintenanceAlertView[]>([]);
  const [preventiveTasks, setPreventiveTasks] = useState<PreventiveTaskView[]>([]);
  const [taskPlans, setTaskPlans] = useState<Record<string, { assignedToUserId: string; scheduledAt: string }>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [actionMenuTicketId, setActionMenuTicketId] = useState<string | null>(null);
  const [actionMenuViewport, setActionMenuViewport] = useState<{ top: number; left: number } | null>(null);
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const [stagedUploadFiles, setStagedUploadFiles] = useState<File[]>([]);
  const [statusChangeTarget, setStatusChangeTarget] = useState<{ ticketId: string; nextStatus: TicketStatus } | null>(
    null,
  );
  const [statusChangeComment, setStatusChangeComment] = useState("");
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [statusChangeSubmitting, setStatusChangeSubmitting] = useState(false);
  const statusFilterSelectRef = useRef<HTMLSelectElement>(null);
  const [formSectionOpen, setFormSectionOpen] = useState<Record<TicketFormSectionId, boolean>>(() =>
    normalizeAccordionOpen(undefined, "equipment"),
  );
  const [formDraftHydrated, setFormDraftHydrated] = useState(false);
  const [bandejaCompacta, setBandejaCompacta] = useState(false);
  const [showTicketsUiHint, setShowTicketsUiHint] = useState(false);
  const [mapLocationHint, setMapLocationHint] = useState<string | null>(null);

  const selectedBus = useMemo(() => catalog.find((bus) => bus.id === form.busId), [catalog, form.busId]);
  const availableAssets = selectedBus?.assets ?? [];
  const selectedAsset = availableAssets.find((asset) => asset.id === form.assetId);
  const availableTipos = useMemo(
    () => Array.from(new Set(tipologias.map((item) => item.tipo))).sort((a, b) => a.localeCompare(b)),
    [tipologias],
  );
  const availableSubtipos = useMemo(
    () =>
      Array.from(new Set(tipologias.filter((item) => item.tipo === form.tipo).map((item) => item.subtipo))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [tipologias, form.tipo],
  );
  const availableSubsubtipos = useMemo(
    () =>
      tipologias
        .filter((item) => item.tipo === form.tipo && item.subtipo === form.subtipo)
        .map((item) => item.subsubtipo),
    [tipologias, form.tipo, form.subtipo],
  );
  const selectedTipologia = useMemo(
    () =>
      tipologias.find(
        (item) => item.tipo === form.tipo && item.subtipo === form.subtipo && item.subsubtipo === form.subsubtipo,
      ),
    [tipologias, form.tipo, form.subtipo, form.subsubtipo],
  );

  const computedPriority = useMemo(() => {
    if (!selectedAsset) {
      return "baja";
    }
    return calculatePriority({
      assetType: selectedAsset.type,
      impactedLines: form.impactedLines,
      serviceStopped: form.serviceStopped,
      nivelImpacto: form.nivelImpacto,
    });
  }, [selectedAsset, form.impactedLines, form.serviceStopped, form.nivelImpacto]);

  const computedSla = calculateSlaMinutes(computedPriority);
  const ticketFormProgress = useMemo(() => {
    const checks = [
      Boolean(form.busId && form.assetId),
      Boolean(form.tipo && form.subtipo && form.subsubtipo),
      form.title.trim().length >= 3,
      form.description.trim().length >= 8,
    ];
    const filled = checks.filter(Boolean).length;
    const nextStepIndex = checks.findIndex((c) => !c);
    return {
      pct: Math.round((filled / checks.length) * 100),
      filled,
      total: checks.length,
      checks,
      nextStepIndex: nextStepIndex === -1 ? null : nextStepIndex,
    };
  }, [form]);

  const reduceMotionUi = useReducedMotion();
  const prevFormProgressFilledRef = useRef(ticketFormProgress.filled);
  const [draftStepFlashIndex, setDraftStepFlashIndex] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevFormProgressFilledRef.current;
    if (ticketFormProgress.filled > prev) {
      setDraftStepFlashIndex(ticketFormProgress.filled - 1);
      const t = window.setTimeout(() => setDraftStepFlashIndex(null), 700);
      prevFormProgressFilledRef.current = ticketFormProgress.filled;
      return () => window.clearTimeout(t);
    }
    prevFormProgressFilledRef.current = ticketFormProgress.filled;
  }, [ticketFormProgress.filled]);

  const toggleFormSection = useCallback((id: TicketFormSectionId) => {
    setFormSectionOpen((prev) => {
      if (prev[id]) return { ...prev, [id]: false };
      return {
        equipment: id === "equipment",
        tipologia: id === "tipologia",
        detail: id === "detail",
        attachments: id === "attachments",
      };
    });
  }, []);

  const goToNextIncompleteFormStep = useCallback(() => {
    const idx = ticketFormProgress.nextStepIndex;
    if (idx === null) return;
    const id = TICKET_FORM_SECTION_ORDER[idx];
    setFormSectionOpen({
      equipment: id === "equipment",
      tipologia: id === "tipologia",
      detail: id === "detail",
      attachments: id === "attachments",
    });
    window.setTimeout(() => {
      document.getElementById("tickets-new-form-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [ticketFormProgress.nextStepIndex]);

  const actionMenuTicket = useMemo(
    () => (actionMenuTicketId ? tickets.find((t) => t.id === actionMenuTicketId) ?? null : null),
    [actionMenuTicketId, tickets],
  );

  const operators = useMemo(() => Array.from(new Set(catalog.map((bus) => bus.operator))), [catalog]);
  const technicians = useMemo(
    () => users.filter((user) => user.role === "tecnico_campo" && user.id !== ""),
    [users],
  );

  useEffect(() => {
    if (busIdFromQuery) {
      setBusFilter(busIdFromQuery);
    }
  }, [busIdFromQuery]);

  useEffect(() => {
    if (!statusFromQuery) return;
    const allowed: Array<TicketStatus | "todos"> = [
      "todos",
      "abierto",
      "en_proceso",
      "esperando_repuesto",
      "resuelto",
    ];
    if (allowed.includes(statusFromQuery as TicketStatus | "todos")) {
      setStatusFilter(statusFromQuery as "todos" | TicketStatus);
    }
  }, [statusFromQuery]);

  useEffect(() => {
    if (!priorityFromQuery) return;
    const allowed: Array<TicketPriority | "todos"> = ["todos", "alta", "media", "baja"];
    if (allowed.includes(priorityFromQuery as TicketPriority | "todos")) {
      setPriorityFilter(priorityFromQuery as "todos" | TicketPriority);
    }
  }, [priorityFromQuery]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = Boolean(target?.closest("input, textarea, select, [contenteditable=true]"));

      if (e.key === "Escape" && actionMenuTicketId) {
        e.preventDefault();
        setActionMenuTicketId(null);
        return;
      }

      if (e.key === "Escape" && shortcutsOpen) {
        e.preventDefault();
        setShortcutsOpen(false);
        return;
      }

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        if (inField) return;
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (inField) return;
        e.preventDefault();
        statusFilterSelectRef.current?.focus();
      }

      if (e.key === "n" || e.key === "N") {
        if (inField) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        const root = document.getElementById("tickets-new-form-anchor");
        root?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => {
          const focusable = root?.querySelector<HTMLElement>("select, input, textarea, button");
          focusable?.focus();
        }, 280);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsOpen, actionMenuTicketId]);

  useEffect(() => {
    if (!actionMenuTicketId) setActionMenuViewport(null);
  }, [actionMenuTicketId]);

  useLayoutEffect(() => {
    if (!actionMenuTicketId) return;
    const update = () => {
      const anchor = document.querySelector<HTMLElement>(`[data-ticket-menu-anchor="${actionMenuTicketId}"]`);
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const menuWidth = 176;
      setActionMenuViewport({ top: r.bottom + 4, left: Math.max(8, r.right - menuWidth) });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [actionMenuTicketId]);

  useEffect(() => {
    if (!actionMenuTicketId || !actionMenuViewport) return;
    const id = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-ticket-actions-portal-menu] [role=\"menuitem\"]")?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [actionMenuTicketId, actionMenuViewport]);

  useEffect(() => {
    if (!actionMenuTicketId) return;
    const close = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el?.closest("[data-ticket-actions]") || el?.closest("[data-ticket-actions-portal-menu]")) return;
      setActionMenuTicketId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [actionMenuTicketId]);

  useEffect(() => {
    if (catalog.length === 0 || formDraftHydrated) return;
    try {
      const raw = sessionStorage.getItem(TICKET_FORM_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TicketFormDraftPayload;
        if (parsed?.form) {
          const d = parsed.form;
          const busOk = catalog.some((b) => b.id === d.busId);
          const busId = busOk ? d.busId : catalog[0].id;
          const assets = catalog.find((b) => b.id === busId)?.assets ?? [];
          const assetOk = assets.some((a) => a.id === d.assetId);
          const rawDraft = d as FormState & { photoNames?: unknown };
          const { photoNames, ...draftFields } = rawDraft;
          void photoNames;
          setForm({
            ...draftFields,
            busId,
            assetId: assetOk ? d.assetId : "",
            impactedLines:
              typeof d.impactedLines === "number" && Number.isFinite(d.impactedLines)
                ? Math.min(10, Math.max(1, d.impactedLines))
                : 1,
            serviceStopped: Boolean(d.serviceStopped),
          });
          setStagedUploadFiles([]);
          if (parsed.openSections) {
            setFormSectionOpen(normalizeAccordionOpen(parsed.openSections));
          }
        }
      }
    } catch {
      /* borrador corrupto */
    }
    setFormDraftHydrated(true);
  }, [catalog, formDraftHydrated]);

  useEffect(() => {
    if (!formDraftHydrated || catalog.length === 0) return;
    try {
      const payload: TicketFormDraftPayload = { form, openSections: formSectionOpen };
      sessionStorage.setItem(TICKET_FORM_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* cuota o modo privado */
    }
  }, [form, formSectionOpen, formDraftHydrated, catalog.length]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(TICKETS_BANDEJA_COMPACT_KEY);
      if (raw === "1") setBandejaCompacta(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(TICKETS_BANDEJA_COMPACT_KEY, bandejaCompacta ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [bandejaCompacta]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(TICKETS_UI_HINT_KEY) !== "1") {
        setShowTicketsUiHint(true);
      }
    } catch {
      setShowTicketsUiHint(false);
    }
  }, []);

  useEffect(() => {
    if (!notice) {
      setNoticeTone("success");
      setNoticePlacement("card");
      return;
    }
    const ephemeral =
      noticeTone === "warning" ||
      noticeTone === "info" ||
      noticePlacement === "toast" ||
      notice.startsWith("Exportados") ||
      notice.includes("supera") ||
      notice.includes("archivos") ||
      notice.includes("MB.");
    if (!ephemeral) return;
    const t = window.setTimeout(() => setNotice(null), noticePlacement === "toast" ? 4500 : 6000);
    return () => window.clearTimeout(t);
  }, [notice, noticeTone, noticePlacement]);

  useEffect(() => {
    if (loading || pathname !== "/tickets") return;
    const id = window.setTimeout(() => {
      const desiredStatus = statusFilter === "todos" ? "" : statusFilter;
      const desiredPri = priorityFilter === "todos" ? "" : priorityFilter;
      const desiredOp = operatorFilter === "todas" ? "" : operatorFilter;
      const desiredBus = busFilter === "todas" ? "" : busFilter;
      const curStatus = searchParams.get("status") ?? "";
      const curPri = searchParams.get("priority") ?? "";
      const curOp = searchParams.get("operator") ?? "";
      const curBus = searchParams.get("busId") ?? "";
      const curPart = searchParams.get("partCode")?.trim() ?? "";
      if (curStatus === desiredStatus && curPri === desiredPri && curOp === desiredOp && curBus === desiredBus)
        return;
      const q = new URLSearchParams();
      if (desiredStatus) q.set("status", desiredStatus);
      if (desiredPri) q.set("priority", desiredPri);
      if (desiredOp) q.set("operator", desiredOp);
      if (desiredBus) q.set("busId", desiredBus);
      if (curPart) q.set("partCode", curPart);
      const qs = q.toString();
      router.replace(qs ? `/tickets?${qs}` : "/tickets", { scroll: false });
    }, 0);
    return () => window.clearTimeout(id);
  }, [loading, pathname, statusFilter, priorityFilter, operatorFilter, busFilter, router, searchParams]);

  const fetchCatalog = async () => {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar catalogo");
    }
    const data = JSON.parse(text) as CatalogPayload;
    setCatalog(data.buses);
    setTipologias(data.tipologias ?? []);
    if (data.buses.length > 0) {
      setForm(defaultForm(data.buses[0].id));
    }
  };

  const fetchUsers = useCallback(async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar usuarios");
    }
    const data = JSON.parse(text) as { users: LocalUser[] };
    setUsers(data.users);
    if (data.users.length > 0) {
      setCurrentUserId((prev) => prev || data.users[0].id);
      if (!currentUserId) {
        setRole(data.users[0].role);
      }
    }
  }, [currentUserId]);

  const fetchSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar sesión");
    }
    const data = JSON.parse(text) as { authenticated: boolean; user?: SessionUser };
    if (data.authenticated && data.user) {
      setSessionUser(data.user);
      setCurrentUserId(data.user.id);
      setRole(data.user.role);
    } else {
      setSessionUser(null);
    }
  }, []);

  const fetchTickets = useCallback(
    async (
      status: "todos" | TicketStatus,
      operator: "todas" | string,
      busId: "todas" | string,
      partCode = "",
      priority: "todos" | TicketPriority = "todos",
    ) => {
      const query = new URLSearchParams({ status, operator, busId });
      if (priority !== "todos") {
        query.set("priority", priority);
      }
      if (partCode.trim()) {
        query.set("partCode", partCode.trim());
      }
      const response = await fetch(`/api/tickets?${query.toString()}`, {
        cache: "no-store",
        headers: {
          "x-user-id": currentUserId,
          "x-user-role": role,
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || "Error al cargar tickets");
      }
      const data = JSON.parse(text) as { tickets: TicketView[] };
      setTickets(data.tickets);
    },
    [currentUserId, role],
  );

  const fetchInventorySummary = async () => {
    const response = await fetch("/api/inventory/summary", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar inventario");
    }
    const data = JSON.parse(text) as { summary: InventorySummaryItem[] };
    setInventorySummary(data.summary);
  };

  const fetchAuditEvents = async () => {
    const response = await fetch("/api/audit/recent", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar auditoría");
    }
    const data = JSON.parse(text) as { events: AuditEventView[] };
    setAuditEvents(data.events);
  };

  const fetchMaintenanceAlerts = async () => {
    const response = await fetch("/api/maintenance/alerts", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar alertas preventivas");
    }
    const data = JSON.parse(text) as { alerts: MaintenanceAlertView[] };
    setMaintenanceAlerts(data.alerts);
  };

  const fetchPreventiveTasks = async () => {
    const response = await fetch("/api/maintenance/tasks", { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "Error al cargar tareas preventivas");
    }
    const data = JSON.parse(text) as { tasks: PreventiveTaskView[] };
    setPreventiveTasks(data.tasks);
    setTaskPlans((prev) => {
      const next = { ...prev };
      for (const task of data.tasks) {
        if (!next[task.id]) {
          next[task.id] = {
            assignedToUserId: task.assignedToUserId ?? "",
            scheduledAt: task.scheduledAt ? task.scheduledAt.slice(0, 16) : "",
          };
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchCatalog();
        await fetchUsers();
        await fetchSession();
        await fetchTickets("todos", "todas", busIdFromQuery ?? "todas", partCodeFromQuery);
        await fetchInventorySummary();
        await fetchAuditEvents();
        await fetchMaintenanceAlerts();
        await fetchPreventiveTasks();
      } catch (bootstrapError) {
        console.error(bootstrapError);
        setError("No se pudo inicializar el modulo de tickets.");
      }
      setLoading(false);
    };
    bootstrap();
  }, [fetchTickets, fetchSession, fetchUsers, busIdFromQuery, partCodeFromQuery]);

  useEffect(() => {
    if (!loading) {
      fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter).catch((filterError) => {
        console.error(filterError);
        setError("No se pudo refrescar la bandeja de tickets.");
      });
    }
  }, [statusFilter, priorityFilter, operatorFilter, busFilter, partCodeFromQuery, loading, fetchTickets, role]);

  const mergeStagedUploadFiles = useCallback((prev: File[], added: File[]) => {
    const seen = new Set(prev.map((f) => `${f.name.toLowerCase()}:${f.size}`));
    const next = [...prev];
    for (const file of added) {
      const key = `${file.name.toLowerCase()}:${file.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(file);
      if (next.length >= TICKET_ATTACH_MAX_FILES) break;
    }
    return next.slice(0, TICKET_ATTACH_MAX_FILES);
  }, []);

  const handlePhotoInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (!list?.length) return;
    const accepted: File[] = [];
    const errors: string[] = [];
    for (const file of Array.from(list)) {
      if (file.size > TICKET_ATTACH_MAX_BYTES) {
        errors.push(
          `${file.name} supera ${Math.round(TICKET_ATTACH_MAX_BYTES / (1024 * 1024))} MB.`,
        );
        continue;
      }
      if (!file.type.startsWith("image/")) {
        errors.push(`${file.name}: solo imágenes.`);
        continue;
      }
      if (file.name.trim()) accepted.push(file);
    }
    setStagedUploadFiles((prev) => mergeStagedUploadFiles(prev, accepted));
    if (errors.length) {
      setNotice(errors.slice(0, 2).join(" "));
      setNoticeTone("warning");
      setNoticePlacement("center");
    }
    event.target.value = "";
  };

  const removePhotoAt = (index: number) => {
    setStagedUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateTicket = async () => {
    if (!sessionUser) {
      setError("Debes iniciar sesión para crear tickets.");
      return;
    }
    if (!selectedBus || !selectedAsset || !form.title || !form.description || !selectedTipologia) {
      setError("Debes completar activo, tipología, título y descripción.");
      return;
    }
    if (form.title.trim().length < 3) {
      setError("El título debe tener al menos 3 caracteres.");
      return;
    }
    if (form.description.trim().length < 8) {
      setError("La descripción debe tener al menos 8 caracteres.");
      return;
    }

    const latStr = form.mapLatitude.trim();
    const lngStr = form.mapLongitude.trim();
    if (latStr !== lngStr && (!latStr || !lngStr)) {
      setError("Coordenadas: indica latitud y longitud juntas, o déjalas vacías.");
      return;
    }
    if (latStr && lngStr) {
      const la = Number(latStr.replace(",", "."));
      const lo = Number(lngStr.replace(",", "."));
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        setError("Latitud y longitud deben ser números válidos (WGS84).");
        return;
      }
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    setNoticeTone("success");
    setNoticePlacement("card");

    const ticketJson = {
      busId: selectedBus.id,
      assetId: selectedAsset.id,
      tipo: selectedTipologia.tipo,
      subtipo: selectedTipologia.subtipo,
      subsubtipo: selectedTipologia.subsubtipo,
      dominio: selectedTipologia.dominio,
      nivelImpacto: selectedTipologia.nivelImpacto,
      origenTecnico: selectedTipologia.origenTecnico,
      observaciones: selectedTipologia.observaciones,
      title: form.title,
      description: form.description,
      impactedLines: form.impactedLines,
      serviceStopped: form.serviceStopped,
      photoNames: [] as string[],
      comment: form.comment,
      ...(latStr && lngStr
        ? {
            latitude: Number(latStr.replace(",", ".")),
            longitude: Number(lngStr.replace(",", ".")),
            ...(form.mapPlaceMunicipio.trim()
              ? { mapPlaceMunicipio: form.mapPlaceMunicipio.trim() }
              : {}),
          }
        : {}),
    };

    let response: Response;
    if (stagedUploadFiles.length > 0) {
      const fd = new FormData();
      fd.append("ticket", JSON.stringify(ticketJson));
      for (const file of stagedUploadFiles) {
        fd.append("files", file);
      }
      response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "x-user-role": role, "x-user-id": currentUserId },
        body: fd,
      });
    } else {
      response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
        body: JSON.stringify(ticketJson),
      });
    }
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as
        | {
            message?: string;
            issues?: {
              fieldErrors?: Record<string, string[] | undefined>;
            };
          }
        | null;

      const issueText =
        errorPayload?.issues?.fieldErrors &&
        Object.entries(errorPayload.issues.fieldErrors)
          .flatMap(([field, messages]) => (messages ?? []).map((message) => `${field}: ${message}`))
          .join(" | ");
      setSaving(false);
      setError(issueText || errorPayload?.message || "No se pudo crear el ticket.");
      return;
    }

    const payload = (await response.json()) as {
      inventory?: { status: "reservado" | "sin_stock"; partCode: string; warehouseName?: string };
    };
    if (payload.inventory?.status === "reservado") {
      setNoticeTone("info");
      setNoticePlacement("center");
      setNotice(
        `Repuesto ${payload.inventory.partCode} reservado en ${payload.inventory.warehouseName ?? "almacén"}.`,
      );
    } else if (payload.inventory?.status === "sin_stock") {
      setNoticeTone("warning");
      setNoticePlacement("center");
      setNotice("Sin stock disponible: ticket movido a 'Esperando repuesto'.");
    }

    try {
      sessionStorage.removeItem(TICKET_FORM_DRAFT_KEY);
    } catch {
      /* ignore */
    }

    setForm((prev) => ({ ...defaultForm(prev.busId), busId: prev.busId }));
    setStagedUploadFiles([]);
    setFormSectionOpen(normalizeAccordionOpen(undefined, "equipment"));
    await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter);
    await fetchInventorySummary();
    await fetchAuditEvents();
    await fetchMaintenanceAlerts();
    await fetchPreventiveTasks();
    setSaving(false);
  };

  const openStatusChangeModal = (ticketId: string, nextStatus: TicketStatus) => {
    if (!sessionUser) {
      setError("Debes iniciar sesión para cambiar estados.");
      return;
    }
    setActionMenuTicketId(null);
    setStatusChangeError(null);
    setStatusChangeComment("");
    setStatusChangeTarget({ ticketId, nextStatus });
  };

  const submitStatusChange = async () => {
    if (!statusChangeTarget || !sessionUser) return;
    const comment = statusChangeComment.trim();
    if (comment.length < 3) {
      setStatusChangeError("El comentario debe tener al menos 3 caracteres.");
      return;
    }
    setStatusChangeError(null);
    setStatusChangeSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/tickets/${statusChangeTarget.ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
        body: JSON.stringify({ nextStatus: statusChangeTarget.nextStatus, comment }),
      });

      if (!response.ok) {
        setStatusChangeError("No tienes permiso para esa transición o hubo un error.");
        return;
      }

      setStatusChangeTarget(null);
      setStatusChangeComment("");
      setNoticeTone("success");
      setNoticePlacement("toast");
      setNotice("Estado del ticket actualizado correctamente.");
      await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter);
      await fetchAuditEvents();
      await fetchMaintenanceAlerts();
      await fetchPreventiveTasks();
    } finally {
      setStatusChangeSubmitting(false);
    }
  };

  const handleCreatePreventiveTask = async (alert: MaintenanceAlertView) => {
    if (!sessionUser) {
      setError("Debes iniciar sesión para crear tareas preventivas.");
      return;
    }
    setError(null);
    setNotice(null);
    const response = await fetch("/api/maintenance/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
      body: JSON.stringify({
        busId: alert.busId,
        assetType: alert.assetType,
        reason: `${alert.failuresLast30Days} fallos de ${alert.assetType} en 30 días`,
      }),
    });

    if (!response.ok) {
      const message = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(message?.message ?? "No se pudo crear tarea preventiva.");
      return;
    }

    setNoticeTone("success");
    setNoticePlacement("toast");
    setNotice("Tarea preventiva creada correctamente.");
    await fetchMaintenanceAlerts();
    await fetchAuditEvents();
    await fetchPreventiveTasks();
  };

  const handleUpdatePreventiveTaskStatus = async (
    taskId: string,
    status: "pendiente" | "programada" | "completada" | "cancelada",
  ) => {
    if (!sessionUser) {
      setError("Debes iniciar sesión para actualizar tareas preventivas.");
      return;
    }
    const response = await fetch("/api/maintenance/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
      body: JSON.stringify({ taskId, status }),
    });
    const text = await response.text();
    if (!response.ok) {
      const payload = JSON.parse(text || "{}") as { message?: string };
      setError(payload.message ?? "No se pudo actualizar la tarea preventiva.");
      return;
    }
    setNoticeTone("success");
    setNoticePlacement("toast");
    setNotice("Tarea preventiva actualizada.");
    await fetchPreventiveTasks();
    await fetchAuditEvents();
  };

  const handlePlanPreventiveTask = async (taskId: string) => {
    if (!sessionUser) {
      setError("Debes iniciar sesión para planificar tareas preventivas.");
      return;
    }
    const plan = taskPlans[taskId];
    if (!plan?.assignedToUserId || !plan?.scheduledAt) {
      setError("Selecciona técnico y fecha para planificar.");
      return;
    }

    const response = await fetch("/api/maintenance/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": currentUserId },
      body: JSON.stringify({
        taskId,
        assignedToUserId: plan.assignedToUserId,
        scheduledAt: new Date(plan.scheduledAt).toISOString(),
        status: "programada",
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      const payload = JSON.parse(text || "{}") as { message?: string };
      setError(payload.message ?? "No se pudo planificar la tarea preventiva.");
      return;
    }
    setNoticeTone("success");
    setNoticePlacement("toast");
    setNotice("Tarea preventiva planificada.");
    await fetchPreventiveTasks();
    await fetchAuditEvents();
  };

  const handleLogin = async () => {
    if (!currentUserId) {
      return;
    }
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId }),
    });
    if (!response.ok) {
      setError("No se pudo iniciar sesión.");
      return;
    }
    const data = (await response.json()) as { authenticated: boolean; user: SessionUser };
    setSessionUser(data.user);
    setRole(data.user.role);
    setNoticeTone("success");
    setNoticePlacement("card");
    setNotice(`Sesión iniciada como ${data.user.name}.`);
    await fetchTickets(statusFilter, operatorFilter, busFilter, partCodeFromQuery, priorityFilter);
    await fetchAuditEvents();
  };

  const handleLogout = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    setSessionUser(null);
    setRole("conductor");
    setNoticeTone("success");
    setNoticePlacement("card");
    setNotice("Sesión cerrada.");
  };
  void handleLogin;
  void handleLogout;

  const handleClearFilters = () => {
    setStatusFilter("todos");
    setPriorityFilter("todos");
    setOperatorFilter("todas");
    setBusFilter("todas");
    router.replace("/tickets");
  };

  const clearPartCodeFilter = useCallback(() => {
    const q = new URLSearchParams();
    if (statusFilter !== "todos") q.set("status", statusFilter);
    if (priorityFilter !== "todos") q.set("priority", priorityFilter);
    if (operatorFilter !== "todas") q.set("operator", operatorFilter);
    if (busFilter !== "todas") q.set("busId", busFilter);
    const qs = q.toString();
    router.replace(qs ? `/tickets?${qs}` : "/tickets", { scroll: false });
  }, [statusFilter, priorityFilter, operatorFilter, busFilter, router]);

  const handleExportTicketsCsv = () => {
    const delimiter = ";";
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = [
      "id",
      "título",
      "bus",
      "operadora",
      "estado",
      "prioridad",
      "sla_deadline_iso",
      "activo",
    ];
    const lines = tickets.map((t) =>
      [
        t.id,
        t.title,
        t.busId,
        t.operator,
        statusMap[t.status],
        toUiPriority(t.priority),
        t.slaDeadline,
        t.subsubtipo ?? t.assetType,
      ]
        .map((cell) => escape(String(cell)))
        .join(delimiter),
    );
    const csv = [header.join(delimiter), ...lines].join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const fileStamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
    const downloadName = `tickets_ccmgc_${fileStamp}.csv`;
    anchor.download = downloadName;
    anchor.click();
    URL.revokeObjectURL(url);
    setNoticeTone("success");
    setNoticePlacement("toast");
    setNotice(
      `Exportados ${tickets.length} ticket(s). Archivo: ${downloadName} (zona horaria del navegador en el nombre).`,
    );
  };

  const ticketCountByPriority = useMemo(() => {
    return tickets.reduce(
      (acc, ticket) => {
        acc[ticket.priority] += 1;
        return acc;
      },
      { alta: 0, media: 0, baja: 0 } as Record<TicketPriority, number>,
    );
  }, [tickets]);

  const inboxScreenReaderSummary = useMemo(() => {
    const estado = statusFilter === "todos" ? "Todos los estados" : statusMap[statusFilter];
    const priTxt =
      priorityFilter === "todos"
        ? "todas las prioridades"
        : priorityFilter === "alta"
          ? "prioridad alta"
          : priorityFilter === "media"
            ? "prioridad media"
            : "prioridad baja";
    const operadora = operatorFilter === "todas" ? "Todas las operadoras" : operatorFilter;
    const busTxt = busFilter === "todas" ? "Todos los buses" : busFilter;
    const pieza = partCodeFromQuery ? `, repuesto ${partCodeFromQuery}` : "";
    return `Bandeja: ${tickets.length} ticket(s) visibles. Filtros activos: estado ${estado}, ${priTxt}, operadora ${operadora}, bus ${busTxt}${pieza}.`;
  }, [tickets.length, statusFilter, priorityFilter, operatorFilter, busFilter, partCodeFromQuery]);

  const formSectionLiveMessage = useMemo(() => {
    const id = TICKET_FORM_SECTION_ORDER.find((k) => formSectionOpen[k]);
    if (!id) return "";
    const map: Record<TicketFormSectionId, string> = {
      equipment: "Sección activa: Equipo afectado.",
      tipologia: "Sección activa: Tipología de incidencia.",
      detail: "Sección activa: Detalle del ticket.",
      attachments: "Sección activa: Adjuntos y notas.",
    };
    return map[id];
  }, [formSectionOpen]);

  const bandejaTdPad = bandejaCompacta ? "px-1.5 py-1.5 align-top leading-snug" : "px-2 py-3 align-top";
  const bandejaThPad = bandejaCompacta ? "px-1.5 pb-2 pt-1.5" : "px-2 pb-3 pt-2";

  const filtersInUrl = useMemo(() => {
    const s = searchParams.toString();
    return s.length > 0;
  }, [searchParams]);

  if (loading) {
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
        <motion.article
          id="tickets-new-form-anchor"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex min-h-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-shadow duration-200 hover:shadow-md xl:col-span-5 xl:min-h-[min(520px,68vh)]"
          aria-labelledby="tickets-new-form-title"
          aria-describedby="tickets-new-form-summary"
        >
          <span id="tickets-new-form-summary" className="sr-only">
            Formulario en secciones plegables: equipo afectado, tipología, detalle y adjuntos. El borrador se guarda en esta
            sesión del navegador. Barra de progreso según campos obligatorios completados. Al final, prioridad calculada y
            botón crear ticket.
          </span>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {formSectionLiveMessage}
          </p>
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-light)]">
              <Plus size={16} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <h3 id="tickets-new-form-title" className="text-subheading">
                Nuevo ticket
              </h3>
              <p className="text-sm leading-snug text-[var(--color-text-3)]">Ancla la incidencia a un bus y activo concreto</p>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/60 px-3 py-2.5 text-[12px] leading-snug text-[var(--color-text-2)]">
            <span className="font-mono font-medium text-[var(--color-text-1)]">{selectedBus?.id ?? "—"}</span>
            <span className="text-[var(--color-text-3)]"> · </span>
            <span>
              {selectedAsset
                ? `${selectedAsset.id} (${selectedAsset.type})`
                : selectedBus
                  ? "Selecciona activo"
                  : "Selecciona bus"}
            </span>
            <span className="text-[var(--color-text-3)]"> · </span>
            <span className="tabular-nums font-semibold text-[var(--color-text-1)]">Borrador {ticketFormProgress.pct}%</span>
          </div>

          <div
            className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 py-3"
            aria-label="Progreso del borrador del formulario"
          >
            <div className="mb-2 flex items-center justify-between gap-2 text-caption text-[var(--color-text-2)]">
              <span className="font-medium text-[var(--color-text-1)]">Borrador</span>
              <span className="tabular-nums text-[var(--color-text-1)]">
                {ticketFormProgress.filled}/{ticketFormProgress.total} · {ticketFormProgress.pct}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
              <div
                className="h-3 rounded-full bg-[var(--color-accent)] transition-[width] duration-200 ease-out"
                style={{ width: `${ticketFormProgress.pct}%` }}
              />
            </div>
            <div className="mt-2.5 flex gap-1.5">
              {(["Equipo", "Tipo", "Título", "Desc"] as const).map((label, i) => {
                const done = ticketFormProgress.checks[i];
                const active = !done && ticketFormProgress.nextStepIndex === i;
                const openHere = formSectionOpen[TICKET_FORM_SECTION_ORDER[i]];
                return (
                  <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={label}>
                    <div
                      className={cn(
                        "h-1.5 w-full max-w-[4rem] rounded-full transition-colors duration-200",
                        done && "bg-[var(--color-accent)]",
                        active && "bg-[var(--color-accent)]/45 ring-1 ring-[var(--color-accent)]/60",
                        !done && !active && openHere && "bg-[var(--color-surface-3)] ring-1 ring-[var(--color-text-2)]/45",
                        !done && !active && !openHere && "bg-[var(--color-surface-3)]",
                        draftStepFlashIndex === i && !reduceMotionUi && "ccmgc-draft-step-flash",
                      )}
                    />
                    <span className="hidden w-full truncate text-center text-[9px] text-[var(--color-text-3)] sm:block">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <p className="min-w-0 flex-1 text-[11px] leading-snug text-[var(--color-text-2)]" aria-live="polite">
                {ticketFormProgress.nextStepIndex === null ? (
                  <span className="font-medium text-[var(--color-success)]">Pasos obligatorios completados.</span>
                ) : (
                  <>
                    <span className="font-medium text-[var(--color-text-1)]">Siguiente:</span>{" "}
                    {
                      (["Equipo con activo", "Tipología completa", "Título (min. 3 caracteres)", "Descripción (min. 8)"] as const)[
                        ticketFormProgress.nextStepIndex
                      ]
                    }
                  </>
                )}
              </p>
              {ticketFormProgress.nextStepIndex !== null ? (
                <button
                  type="button"
                  onClick={goToNextIncompleteFormStep}
                  className="shrink-0 self-start rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                >
                  Ir al siguiente paso
                </button>
              ) : null}
            </div>
            <details className="mt-2 rounded-md border border-[var(--color-border)]/70 bg-[var(--color-surface)]/50 px-2 py-1.5">
              <summary className="cursor-pointer list-none text-[11px] font-medium text-[var(--color-text-2)] [&::-webkit-details-marker]:hidden">
                Requisitos del borrador
              </summary>
              <ul className="mt-2 space-y-1.5 text-[11px] text-[var(--color-text-2)]">
                {[
                  { ok: ticketFormProgress.checks[0], label: "Bus y activo seleccionados" },
                  { ok: ticketFormProgress.checks[1], label: "Tipología completa" },
                  { ok: ticketFormProgress.checks[2], label: "Título (mín. 3 caracteres)" },
                  { ok: ticketFormProgress.checks[3], label: "Descripción (mín. 8 caracteres)" },
                ].map((row) => (
                  <li key={row.label} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px]",
                        row.ok
                          ? "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-3)]/60 text-[var(--color-text-3)]",
                      )}
                      aria-hidden
                    >
                      {row.ok ? <Check size={10} strokeWidth={3} /> : ""}
                    </span>
                    <span className={cn(!row.ok && "text-[var(--color-text-3)]")}>{row.label}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3">
            <CollapsibleFormBlock
              title="Equipo afectado"
              stepLabel="1/4"
              subtitle={selectedBus ? `${selectedBus.id} · ${selectedBus.operator}` : "Bus y activo"}
              open={formSectionOpen.equipment}
              onToggle={() => toggleFormSection("equipment")}
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-label">Bus</span>
                  <Select
                    value={form.busId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, busId: event.target.value, assetId: "" }))
                    }
                  >
                    {catalog.map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.id} - {bus.operator}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block space-y-1">
                  <span className="text-label">Activo</span>
                  <Select
                    value={form.assetId}
                    onChange={(event) => setForm((prev) => ({ ...prev, assetId: event.target.value }))}
                  >
                    <option value="">Selecciona un activo</option>
                    {availableAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.id} ({asset.type})
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              {form.busId ? (
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-snug text-[var(--color-text-2)]">
                  <Link
                    href="/inventory"
                    className="shrink-0 font-medium text-[var(--color-accent)] underline-offset-2 transition-colors hover:underline"
                  >
                    Ver inventario
                  </Link>
                  <span className="min-w-0 text-[var(--color-text-3)]">Stock de repuestos (referencia rápida).</span>
                </p>
              ) : null}
            </CollapsibleFormBlock>

            <CollapsibleFormBlock
              title="Tipología de incidencia"
              stepLabel="2/4"
              subtitle={form.subsubtipo ? `${form.tipo} · ${form.subtipo}` : "Tipo, subtipo e incidencia"}
              open={formSectionOpen.tipologia}
              onToggle={() => toggleFormSection("tipologia")}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-label">Tipo</span>
                  <Select
                    value={form.tipo}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        tipo: event.target.value,
                        subtipo: "",
                        subsubtipo: "",
                        dominio: "",
                        nivelImpacto: "Medio",
                        origenTecnico: "",
                        observaciones: "",
                      }))
                    }
                  >
                    <option value="">Selecciona tipo</option>
                    {availableTipos.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block space-y-1">
                  <span className="text-label">Subtipo</span>
                  <Select
                    value={form.subtipo}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        subtipo: event.target.value,
                        subsubtipo: "",
                        dominio: "",
                        nivelImpacto: "Medio",
                        origenTecnico: "",
                        observaciones: "",
                      }))
                    }
                    disabled={!form.tipo}
                  >
                    <option value="">Selecciona subtipo</option>
                    {availableSubtipos.map((subtipo) => (
                      <option key={subtipo} value={subtipo}>
                        {subtipo}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block space-y-1">
                  <span className="text-label">Incidencia</span>
                  <Select
                    value={form.subsubtipo}
                    onChange={(event) => {
                      const chosen = tipologias.find(
                        (item) =>
                          item.tipo === form.tipo &&
                          item.subtipo === form.subtipo &&
                          item.subsubtipo === event.target.value,
                      );
                      setForm((prev) => ({
                        ...prev,
                        subsubtipo: event.target.value,
                        dominio: chosen?.dominio ?? "",
                        nivelImpacto: chosen?.nivelImpacto ?? "Medio",
                        origenTecnico: chosen?.origenTecnico ?? "",
                        observaciones: chosen?.observaciones ?? "",
                      }));
                    }}
                    disabled={!form.subtipo}
                  >
                    <option value="">Selecciona incidencia</option>
                    {availableSubsubtipos.map((subsubtipo) => (
                      <option key={subsubtipo} value={subsubtipo}>
                        {subsubtipo}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              {selectedTipologia ? (
                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-text-2)]">
                  <p>
                    Dominio: <span className="font-medium text-[var(--color-text-1)]">{selectedTipologia.dominio}</span>
                  </p>
                  <p>
                    Origen tecnico:{" "}
                    <span className="font-medium text-[var(--color-text-1)]">{selectedTipologia.origenTecnico}</span>
                  </p>
                  <p>
                    Nivel impacto:{" "}
                    <span className="font-medium text-[var(--color-text-1)]">{selectedTipologia.nivelImpacto}</span>
                  </p>
                </div>
              ) : null}
            </CollapsibleFormBlock>

            <CollapsibleFormBlock
              title="Detalle de la incidencia"
              stepLabel="3/4"
              subtitle={
                form.title.trim()
                  ? `${form.title.trim().slice(0, 48)}${form.title.trim().length > 48 ? "…" : ""}`
                  : "Título, descripción e impacto operativo"
              }
              open={formSectionOpen.detail}
              onToggle={() => toggleFormSection("detail")}
            >
              <label className="block space-y-1">
                <span className="text-label">Título</span>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Ej: Router sin senal LTE"
                />
              </label>

              <Textarea
                label="Descripción técnica"
                placeholder="Incluye síntomas, contexto y pruebas realizadas."
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="min-h-[80px]"
                wrapperClassName="mt-3"
              />

              <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-label">Ubicación en mapa (opcional)</span>
                </div>
                {mapLocationHint ? (
                  <p className="mb-2 text-[12px] text-[var(--color-error)]">{mapLocationHint}</p>
                ) : null}
                <TicketLocationPicker
                  mapLatitude={form.mapLatitude}
                  mapLongitude={form.mapLongitude}
                  mapPlaceMunicipio={form.mapPlaceMunicipio}
                  onMapLatitudeChange={(v) => setForm((prev) => ({ ...prev, mapLatitude: v }))}
                  onMapLongitudeChange={(v) => setForm((prev) => ({ ...prev, mapLongitude: v }))}
                  onMapPlaceMunicipioChange={(v) =>
                    setForm((prev) => ({ ...prev, mapPlaceMunicipio: v?.trim() ? v.trim() : "" }))
                  }
                  busMunicipio={selectedBus?.municipio ?? ""}
                  onNotify={setMapLocationHint}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-label">Líneas afectadas</span>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.impactedLines}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        impactedLines: Number(event.target.value) || 1,
                      }))
                    }
                  />
                </label>
                <div
                  onClick={() => setForm((prev) => ({ ...prev, serviceStopped: !prev.serviceStopped }))}
                  className={cn(
                    "flex h-full cursor-pointer flex-col justify-center rounded-lg border p-3 transition-all duration-200",
                    form.serviceStopped
                      ? "border-[var(--color-warning)] bg-[var(--color-warning-light)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-hover)]",
                  )}
                >
                  <span className="mb-1 text-label">Servicio detenido</span>
                  <span
                    className={cn(
                      "text-sm font-medium transition-colors",
                      form.serviceStopped ? "text-[var(--color-warning)]" : "text-[var(--color-text-3)]",
                    )}
                  >
                    {form.serviceStopped ? "Si — servicio parado" : "No — en servicio"}
                  </span>
                </div>
              </div>
            </CollapsibleFormBlock>

            <CollapsibleFormBlock
              title="Adjuntos y notas"
              stepLabel="4/4"
              subtitle={
                stagedUploadFiles.length || form.comment.trim()
                  ? `${stagedUploadFiles.length} imagen(es) · comentario ${form.comment.trim() ? "rellenado" : "opcional"}`
                  : "Fotos y comentario inicial (opcional)"
              }
              open={formSectionOpen.attachments}
              onToggle={() => toggleFormSection("attachments")}
            >
              <div className="space-y-2">
                <span className="text-label">Fotos adjuntas</span>
                <p className="text-[12px] leading-snug text-[var(--color-text-3)]">
                  Las imágenes se suben al servidor con el ticket (almacén local bajo /uploads). Hasta{" "}
                  {TICKET_ATTACH_MAX_FILES} archivos — max. {Math.round(TICKET_ATTACH_MAX_BYTES / (1024 * 1024))} MB c/u.
                </p>
                <input
                  ref={photoFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-label="Seleccionar imágenes adjuntas"
                  onChange={handlePhotoInputChange}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="!min-h-0 py-2"
                  onClick={() => photoFileInputRef.current?.click()}
                >
                  <UploadCloud size={14} aria-hidden />
                  Elegir archivos
                </Button>
                {stagedUploadFiles.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)]/40 p-2">
                    {stagedUploadFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-text-1)]"
                      >
                        <span className="min-w-0 truncate font-mono" title={file.name}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePhotoAt(index)}
                          className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-2)] transition-colors duration-200 hover:border-[var(--color-error)]/40 hover:text-[var(--color-error)]"
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <Textarea
                label="Comentario inicial"
                placeholder="Notas del operador o técnico."
                value={form.comment}
                onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                className="min-h-[64px]"
                wrapperClassName="mt-3"
              />
            </CollapsibleFormBlock>
            </div>
            <div className="min-h-3 flex-1 xl:min-h-10" aria-hidden />
          </div>

            <div
              className={cn(
                "rounded-lg border-l-4 p-4 transition-all duration-200",
                computedPriority === "alta"
                  ? "border-l-[var(--color-error)] bg-[var(--color-error-light)]"
                  : computedPriority === "media"
                    ? "border-l-[var(--color-warning)] bg-[var(--color-warning-light)]"
                    : "border-l-[var(--color-success)] bg-[var(--color-success-light)]",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-label">Prioridad calculada</span>
                {(() => {
                  const pr = priorityBadgeProps(computedPriority);
                  return (
                    <Badge variant={pr.variant} className={cn("whitespace-nowrap", pr.className)}>
                      {toUiPriority(computedPriority)}
                    </Badge>
                  );
                })()}
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-2)]">
                SLA objetivo: <span className="font-medium text-[var(--color-text-1)]">{computedSla} minutos</span>
              </p>
            </div>

            <div className="-mx-5 -mb-5 mt-2 sticky bottom-0 z-10 rounded-b-xl border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 p-4 shadow-[0_-10px_28px_rgba(0,0,0,0.35)] backdrop-blur-sm">
              <Button
                variant="primary"
                size="lg"
                onClick={handleCreateTicket}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <UploadCloud size={16} />
                    Crear ticket
                  </>
                )}
              </Button>
            </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1], delay: 0.02 }}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-shadow duration-200 hover:shadow-md xl:col-span-7"
          aria-describedby="tickets-inbox-hint"
        >
          <p id="tickets-inbox-hint" className="sr-only">
            {inboxScreenReaderSummary}
          </p>
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-4 py-3 text-sm text-[var(--color-error)]"
            >
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}
          {notice && noticePlacement === "toast" && typeof document !== "undefined"
            ? createPortal(
                <div
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "pointer-events-none fixed right-4 top-[4.75rem] z-[90] flex max-w-[min(22rem,calc(100vw-2rem))] items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm md:top-5",
                    noticeTone === "warning"
                      ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                      : "border-[var(--color-success)]/35 bg-[var(--color-surface)]/95 text-[var(--color-success)]",
                  )}
                >
                  {noticeTone === "warning" ? (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  ) : (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 leading-snug">{notice}</span>
                </div>,
                document.body,
              )
            : null}
          {notice && noticePlacement !== "toast" ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "mb-3 rounded-lg border px-4 py-3 text-sm",
                noticePlacement === "center" && "mx-auto flex max-w-lg flex-col items-center gap-1.5 text-center",
                noticePlacement === "card" && "flex items-start gap-2 text-left",
                noticeTone === "warning" &&
                  "border-[var(--color-warning)]/35 bg-[var(--color-warning-light)] text-[var(--color-warning)]",
                noticeTone === "info" &&
                  "border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] text-[var(--color-text-1)]",
                noticeTone === "success" &&
                  "border-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]",
              )}
            >
              {noticeTone === "warning" ? (
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              ) : noticeTone === "info" ? (
                <PackageSearch size={14} className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 leading-snug">{notice}</span>
            </div>
          ) : null}

          {showTicketsUiHint ? (
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
                  setShowTicketsUiHint(false);
                }}
              >
                Entendido
              </button>
            </div>
          ) : null}

          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 lg:flex-row lg:flex-wrap lg:items-center">
            {filtersInUrl ? (
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
                  A:{ticketCountByPriority.alta}
                </Badge>
                <Badge variant="warning" className="px-1.5 py-0 text-[10px] font-semibold" title="Prioridad media">
                  M:{ticketCountByPriority.media}
                </Badge>
                <Badge variant="success" className="px-1.5 py-0 text-[10px] font-semibold" title="Prioridad baja">
                  B:{ticketCountByPriority.baja}
                </Badge>
                <span className="hidden pl-1 text-[11px] leading-snug text-[var(--color-text-3)] sm:inline">
                  · Alta · Media · Baja
                </span>
              </div>
              <p className="w-full pl-0.5 text-balance text-[11px] leading-snug text-[var(--color-text-3)] sm:hidden">
                Alta · Media · Baja
              </p>

              <div className="hidden h-5 w-px shrink-0 bg-[var(--color-border)] sm:block" />

              {canUseFilters(role) ? (
                <>
                  <div className="hidden flex-wrap items-center gap-2 md:flex">
                    <select
                      ref={statusFilterSelectRef}
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "todos" | TicketStatus)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-xs text-[var(--color-text-1)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    >
                      <option value="todos">Todos los estados</option>
                      <option value="abierto">Abierto</option>
                      <option value="en_proceso">En Proceso</option>
                      <option value="esperando_repuesto">Esperando Repuesto</option>
                      <option value="resuelto">Resuelto</option>
                    </select>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value as "todos" | TicketPriority)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-xs text-[var(--color-text-1)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      aria-label="Filtrar por prioridad"
                    >
                      <option value="todos">Todas las prioridades</option>
                      <option value="alta">Prioridad alta</option>
                      <option value="media">Prioridad media</option>
                      <option value="baja">Prioridad baja</option>
                    </select>
                    <select
                      value={operatorFilter}
                      onChange={(e) => setOperatorFilter(e.target.value)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-xs text-[var(--color-text-1)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    >
                      <option value="todas">Todas las operadoras</option>
                      {operators.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <select
                      value={busFilter}
                      onChange={(e) => setBusFilter(e.target.value)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-xs text-[var(--color-text-1)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    >
                      <option value="todas">Todos los buses</option>
                      {catalog.map((bus) => (
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
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as "todos" | TicketStatus)}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-xs text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      >
                        <option value="todos">Todos los estados</option>
                        <option value="abierto">Abierto</option>
                        <option value="en_proceso">En Proceso</option>
                        <option value="esperando_repuesto">Esperando Repuesto</option>
                        <option value="resuelto">Resuelto</option>
                      </select>
                      <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value as "todos" | TicketPriority)}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-xs text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                        aria-label="Filtrar por prioridad"
                      >
                        <option value="todos">Todas las prioridades</option>
                        <option value="alta">Prioridad alta</option>
                        <option value="media">Prioridad media</option>
                        <option value="baja">Prioridad baja</option>
                      </select>
                      <select
                        value={operatorFilter}
                        onChange={(e) => setOperatorFilter(e.target.value)}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-xs text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      >
                        <option value="todas">Todas las operadoras</option>
                        {operators.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                      <select
                        value={busFilter}
                        onChange={(e) => setBusFilter(e.target.value)}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-xs text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      >
                        <option value="todas">Todos los buses</option>
                        {catalog.map((bus) => (
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
                onClick={handleExportTicketsCsv}
                disabled={tickets.length === 0}
                title="Exportar la bandeja visible a CSV (UTF-8, separador punto y coma)"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-xs text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
              >
                <Download size={12} aria-hidden />
                CSV
              </button>
              <button
                type="button"
                onClick={() => setBandejaCompacta((v) => !v)}
                aria-pressed={bandejaCompacta}
                title={bandejaCompacta ? "Vista detallada" : "Vista compacta (menos padding en tabla)"}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-lg border px-3 py-1.5 text-xs transition-all duration-200 md:min-h-0",
                  bandejaCompacta
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-2)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]",
                )}
              >
                Compacta
              </button>
              <button
                type="button"
                onClick={handleClearFilters}
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
              onClick={() => setShortcutsOpen((v) => !v)}
              title="Atajos: / estado, ? ayuda, N nuevo ticket, Escape cerrar."
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-1)]"
              aria-expanded={shortcutsOpen}
              aria-controls="tickets-shortcuts-panel"
            >
              <Keyboard size={14} className="text-[var(--color-text-3)]" aria-hidden />
              Atajos
            </button>
          </div>

          {shortcutsOpen ? (
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

          <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
              <Filter size={15} className="text-[var(--color-text-3)]" />
              <h3 className="text-subheading text-[var(--color-text-1)]">Bandeja de tickets</h3>
              <span className="text-caption text-[var(--color-text-3)]">({tickets.length})</span>
              <span className="ml-auto hidden text-xs text-[var(--color-text-3)] xl:inline">Bandeja prioritaria; debajo, contexto operativo.</span>
            </div>

            {partCodeFromQuery ? (
              <div
                role="status"
                className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/35 px-3 py-2 text-[12px] text-[var(--color-text-2)]"
              >
                <p>
                  <span className="font-medium text-[var(--color-text-1)]">Filtro por repuesto:</span>{" "}
                  <code className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-1)]">
                    {partCodeFromQuery}
                  </code>{" "}
                  (tickets con reserva activa o consumida de esta pieza).
                </p>
                <button
                  type="button"
                  onClick={clearPartCodeFilter}
                  className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)]"
                >
                  Quitar filtro de pieza
                </button>
              </div>
            ) : null}

            {tickets.length === 0 ? (
              <EmptyStateBlock
                icon={ClipboardList}
                title="Sin tickets"
                hint={
                  partCodeFromQuery
                    ? `No hay tickets vinculados al repuesto «${partCodeFromQuery}» con los filtros actuales (reserva o consumo). Prueba a quitar el filtro de pieza o relajar estado / bus.`
                    : "No hay tickets para los filtros seleccionados. Ajusta estado, operadora o bus, o limpia filtros."
                }
                actionLabel={partCodeFromQuery ? "Quitar filtro de pieza" : "Limpiar filtros"}
                onAction={partCodeFromQuery ? clearPartCodeFilter : handleClearFilters}
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-lg border border-[var(--color-border)] md:block">
                  <div className="max-h-[min(420px,52vh)] overflow-auto">
                    <table className={cn("w-full", bandejaCompacta ? "text-[11px]" : "text-sm")}>
                      <thead className="sticky top-0 z-[1] border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_0_var(--color-border)]">
                        <tr>
                          <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>ID</th>
                          <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>
                            Título
                          </th>
                          <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>
                            Bus · Activo
                          </th>
                          <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>
                            Estado
                          </th>
                          <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>
                            Prioridad
                          </th>
                          <th className={cn("bg-[var(--color-surface)] text-left text-label font-medium", bandejaThPad)}>SLA</th>
                          <th
                            className={cn("w-12 bg-[var(--color-surface)] text-center text-label font-medium", bandejaThPad)}
                            title="Acciones por fila"
                          >
                            <span className="sr-only">Acciones</span>
                            <span className="text-xs text-[var(--color-text-3)]" aria-hidden>
                              ⋮
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="[&>tr:nth-child(even)]:bg-[var(--color-surface-2)]/40">
                        {tickets.map((ticket) => (
                          <tr
                            key={ticket.id}
                            className="align-top border-b border-[var(--color-border)] transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[var(--color-surface-2)]/55 hover:shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.015)] last:border-0"
                          >
                            <td className={bandejaTdPad}>
                              <div className="flex flex-wrap items-center gap-1">
                                <Link
                                  href={`/tickets/${ticket.id}`}
                                  className="font-mono text-caption text-[var(--color-accent)] hover:underline"
                                >
                                  {ticket.id.slice(-8).toUpperCase()}
                                </Link>
                                <Link
                                  href={`/mapa?ticket=${encodeURIComponent(ticket.id)}`}
                                  className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                                  title="Ver en mapa"
                                  aria-label={`Ver ticket ${ticket.id.slice(-8).toUpperCase()} en mapa`}
                                >
                                  <MapPinned size={14} aria-hidden />
                                </Link>
                              </div>
                            </td>
                            <td className={cn("min-w-0 max-w-[min(380px,36vw)] xl:max-w-md", bandejaTdPad)}>
                              <p className="truncate font-medium text-[var(--color-text-1)]">{ticket.title}</p>
                              <p className="truncate text-caption">{ticket.operator}</p>
                            </td>
                            <td className={bandejaTdPad}>
                              <p className="text-[var(--color-text-1)]">{ticket.busId}</p>
                              <p className="text-caption">{ticket.subsubtipo ?? ticket.assetType}</p>
                            </td>
                            <td className={bandejaTdPad}>
                              <Badge
                                className={cn(
                                  "whitespace-nowrap font-semibold",
                                  ticketStatusBadgeClassName(ticket.status),
                                )}
                                variant={ticketStatusBadgeVariant(ticket.status)}
                              >
                                {statusMap[ticket.status]}
                              </Badge>
                            </td>
                            <td className={bandejaTdPad}>
                              <span className="inline-flex items-start gap-1 pt-0.5">
                                {ticket.priority === "alta" ? (
                                  <SignalHigh size={14} className="mt-0.5 shrink-0 text-[var(--color-error)]/90" aria-hidden />
                                ) : ticket.priority === "media" ? (
                                  <SignalMedium size={14} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
                                ) : (
                                  <SignalLow size={14} className="mt-0.5 shrink-0 text-[var(--color-success)]" aria-hidden />
                                )}
                                {(() => {
                                  const pr = priorityBadgeProps(ticket.priority);
                                  return (
                                    <Badge
                                      variant={pr.variant}
                                      className={cn(
                                        "whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold",
                                        pr.className,
                                      )}
                                    >
                                      {toUiPriority(ticket.priority)}
                                    </Badge>
                                  );
                                })()}
                              </span>
                            </td>
                            <td className={bandejaTdPad}>
                              {(() => {
                                const mins = Math.round((new Date(ticket.slaDeadline).getTime() - Date.now()) / 60000);
                                if (mins <= 0) {
                                  const full = `${formatSlaOverdueLabel(mins)} · ${new Date(ticket.slaDeadline).toLocaleString("es-ES", {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`;
                                  return (
                                    <div
                                      className="flex min-w-0 max-w-[7rem] items-start gap-1.5 border-l-2 border-[var(--color-error)]/35 pl-2"
                                      title={full}
                                    >
                                      <Clock3 size={12} className="mt-0.5 shrink-0 text-[var(--color-text-3)]" aria-hidden />
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-medium leading-tight text-[var(--color-error)]">
                                          Vencido
                                        </p>
                                        <p className="truncate text-[10px] leading-tight text-[var(--color-text-3)]">
                                          {formatSlaOverdueLabel(mins)}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }
                                if (mins < 120)
                                  return (
                                    <span className={cn("text-xs tabular-nums", slaMinsRemainingTextClass(mins))}>
                                      {mins}m
                                    </span>
                                  );
                                return <span className="text-xs tabular-nums text-[var(--color-text-3)]">{mins}m</span>;
                              })()}
                            </td>
                            <td className={cn("relative w-12 text-center", bandejaTdPad)}>
                              {getAllowedTransitions(role, ticket.status).length === 0 ? (
                                <span className="text-caption text-[var(--color-text-3)]">—</span>
                              ) : (
                                <div className="flex justify-center" data-ticket-actions>
                                  <button
                                    type="button"
                                    data-ticket-menu-anchor={ticket.id}
                                    className="inline-flex h-10 min-h-10 w-10 min-w-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] md:h-8 md:min-h-0 md:w-8 md:min-w-0"
                                    aria-expanded={actionMenuTicketId === ticket.id}
                                    aria-haspopup="menu"
                                    title={`Acciones · ticket ${ticket.id.slice(-8).toUpperCase()}`}
                                    aria-label={`Acciones para ticket ${ticket.id.slice(-8)}`}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setActionMenuTicketId((id) => (id === ticket.id ? null : ticket.id));
                                    }}
                                  >
                                    <MoreHorizontal size={16} strokeWidth={2} className="shrink-0" aria-hidden />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 md:hidden">
                  {tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className={cn(
                        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] even:bg-[var(--color-surface-2)]/35",
                        bandejaCompacta ? "p-3" : "p-4",
                      )}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-mono text-caption text-[var(--color-text-3)]">{ticket.id.slice(-8).toUpperCase()}</p>
                            <Link
                              href={`/mapa?ticket=${encodeURIComponent(ticket.id)}`}
                              className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                              title="Ver en mapa"
                              aria-label={`Mapa · ${ticket.id.slice(-8).toUpperCase()}`}
                            >
                              <MapPinned size={14} aria-hidden />
                            </Link>
                          </div>
                          <Link href={`/tickets/${ticket.id}`}>
                            <h4 className="mt-0.5 truncate text-sm font-medium text-[var(--color-text-1)] transition-colors hover:text-[var(--color-accent)]">
                              {ticket.title}
                            </h4>
                          </Link>
                          <p className="text-caption">
                            {ticket.busId} · {ticket.operator} · {ticket.subsubtipo ?? ticket.assetType}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end justify-center gap-1.5">
                          <Badge
                            className={cn(
                              "whitespace-nowrap font-semibold",
                              ticketStatusBadgeClassName(ticket.status),
                            )}
                            variant={ticketStatusBadgeVariant(ticket.status)}
                          >
                            {statusMap[ticket.status]}
                          </Badge>
                          <span className="inline-flex items-center justify-end gap-1">
                            {ticket.priority === "alta" ? (
                              <SignalHigh size={14} className="shrink-0 text-[var(--color-error)]/90" aria-hidden />
                            ) : ticket.priority === "media" ? (
                              <SignalMedium size={14} className="shrink-0 text-[var(--color-warning)]" aria-hidden />
                            ) : (
                              <SignalLow size={14} className="shrink-0 text-[var(--color-success)]" aria-hidden />
                            )}
                            {(() => {
                              const pr = priorityBadgeProps(ticket.priority);
                              return (
                                <Badge
                                  variant={pr.variant}
                                  className={cn(
                                    "whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold",
                                    pr.className,
                                  )}
                                >
                                  {toUiPriority(ticket.priority)}
                                </Badge>
                              );
                            })()}
                          </span>
                        </div>
                      </div>
                      <p className="mb-3 line-clamp-2 text-sm text-[var(--color-text-2)]">{ticket.description}</p>
                      <div className="mb-3 flex flex-wrap items-center gap-3 text-caption">
                        <span className="flex min-w-0 flex-1 items-center gap-1">
                          <Clock3 size={11} className="shrink-0" />
                          {(() => {
                            const mins = Math.round((new Date(ticket.slaDeadline).getTime() - Date.now()) / 60000);
                            if (mins <= 0) {
                              const full = `Vencido hace ${formatSlaOverdueLabel(mins)} · ${new Date(ticket.slaDeadline).toLocaleString("es-ES", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`;
                              return (
                                <span className="min-w-0 text-[var(--color-text-2)]" title={full}>
                                  <span className="font-medium text-[var(--color-error)]">Vencido</span>{" "}
                                  <span className="text-[var(--color-text-3)]">
                                    hace {formatSlaOverdueLabel(mins)}
                                  </span>
                                </span>
                              );
                            }
                            const dur = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
                            return (
                              <span className="min-w-0 text-[var(--color-text-2)]">
                                <span className={cn("font-medium tabular-nums", slaMinsRemainingTextClass(mins))}>
                                  SLA · {dur}
                                </span>{" "}
                                <span className="text-[var(--color-text-3)]">
                                  (vence {new Date(ticket.slaDeadline).toLocaleTimeString("es-ES")})
                                </span>
                              </span>
                            );
                          })()}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          {ticket.comments.length} comentarios
                        </span>
                        <span className="flex items-center gap-1">
                          <Camera size={11} />
                          {ticket.attachments.length} adjuntos
                        </span>
                      </div>
                      {getAllowedTransitions(role, ticket.status).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] pt-3">
                          {getAllowedTransitions(role, ticket.status).map((nextStatus) => (
                            <button
                              key={`${ticket.id}-${nextStatus}`}
                              type="button"
                              onClick={() => openStatusChangeModal(ticket.id, nextStatus)}
                              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-2)] transition-all duration-150 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                            >
                              → {statusMap[nextStatus]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="mb-4 grid min-h-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
            <div className="flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[240px]">
              <p className="mb-3 flex h-9 shrink-0 items-center gap-1.5 text-label text-[var(--color-text-2)]">
                <PackageSearch size={14} className="text-[var(--color-text-3)]" aria-hidden />
                Inventario
              </p>
              <div className="min-h-0 flex-1 max-h-52 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
                <InventoryPanel items={inventorySummary} />
              </div>
            </div>

            <div className="flex min-h-[min(220px,32vh)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-border-hover)] hover:shadow-md md:min-h-[240px]">
              <p className="mb-3 flex h-9 min-h-9 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-label text-[var(--color-text-2)]">
                <ClipboardList size={14} className="text-[var(--color-text-3)]" aria-hidden />
                Auditoría reciente
                {auditEvents.length > 0 ? (
                  <span className="ml-auto text-[10px] font-normal text-[var(--color-text-3)]">
                    {auditEvents.length} evento{auditEvents.length === 1 ? "" : "s"} recientes
                  </span>
                ) : null}
              </p>
              <div className="relative min-h-0 flex-1">
                <div className="max-h-52 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
                  <AuditPanel events={auditEvents} />
                </div>
                {auditEvents.length > 3 ? (
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
                <MaintenanceAlertsPanel alerts={maintenanceAlerts} onCreateTask={handleCreatePreventiveTask} />
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
              {preventiveTasks.slice(0, 6).map((task) => (
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
                  {(role === "tecnico_campo" || role === "gestor_centro_control") && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(["pendiente", "programada", "completada", "cancelada"] as const).map((status) => (
                        <button
                          key={`${task.id}-${status}`}
                          onClick={() => handleUpdatePreventiveTaskStatus(task.id, status)}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2 py-1 text-[11px] text-[var(--color-text-2)] transition-all duration-150 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                  {role === "gestor_centro_control" && (
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <select
                        value={taskPlans[task.id]?.assignedToUserId ?? ""}
                        onChange={(event) =>
                          setTaskPlans((prev) => ({
                            ...prev,
                            [task.id]: {
                              assignedToUserId: event.target.value,
                              scheduledAt: prev[task.id]?.scheduledAt ?? "",
                            },
                          }))
                        }
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2 py-1.5 text-[11px] text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      >
                        <option value="">Asignar tecnico</option>
                        {technicians.map((technician) => (
                          <option key={technician.id} value={technician.id}>
                            {technician.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="datetime-local"
                        value={taskPlans[task.id]?.scheduledAt ?? ""}
                        onChange={(event) =>
                          setTaskPlans((prev) => ({
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
                        onClick={() => handlePlanPreventiveTask(task.id)}
                        className="rounded-md border border-[var(--color-accent)]/35 bg-[var(--color-accent-light)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-accent)] transition-all duration-150 hover:bg-[var(--color-accent)]/15"
                      >
                        Planificar
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {preventiveTasks.length === 0 && (
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

      {actionMenuTicket && actionMenuViewport
        ? createPortal(
            <ul
              data-ticket-actions-portal-menu
              role="menu"
              style={{
                position: "fixed",
                top: actionMenuViewport.top,
                left: actionMenuViewport.left,
                minWidth: "11rem",
                zIndex: 90,
              }}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl"
            >
              {getAllowedTransitions(role, actionMenuTicket.status).map((nextStatus) => (
                <li key={`${actionMenuTicket.id}-${nextStatus}`} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-xs text-[var(--color-text-2)] transition-colors duration-200 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                    onClick={() => openStatusChangeModal(actionMenuTicket.id, nextStatus)}
                  >
                    {nextStatus === "esperando_repuesto" ? "Esperar repuesto" : statusMap[nextStatus]}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}

      <StatusChangeModal
        open={Boolean(statusChangeTarget)}
        title="Confirmar cambio de estado"
        targetLabel={statusChangeTarget ? statusMap[statusChangeTarget.nextStatus] : ""}
        comment={statusChangeComment}
        onCommentChange={(value) => {
          setStatusChangeComment(value);
          if (statusChangeError) setStatusChangeError(null);
        }}
        onConfirm={submitStatusChange}
        onCancel={() => {
          setStatusChangeTarget(null);
          setStatusChangeComment("");
          setStatusChangeError(null);
          setStatusChangeSubmitting(false);
        }}
        error={statusChangeError}
        submitting={statusChangeSubmitting}
      />
    </div>
  );
}
