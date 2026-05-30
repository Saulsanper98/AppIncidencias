import type { AssetType, Ticket, TicketStatus, UserRole } from "@/lib/domain";
import type { NivelImpacto, TipologiaItem } from "@/lib/tipologia";

export type TicketAttachmentView = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  downloadUrl?: string | null;
};

export type TicketView = Ticket & {
  operator: string;
  municipio: string;
  assetType: AssetType;
  attachments: TicketAttachmentView[];
  comments: { id: string; author: string; body: string; createdAt: string }[];
};

export type CatalogBus = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
  assets: { id: string; type: AssetType; serialNumber: string; slaMinutes?: number | null }[];
};

export type CatalogPayload = {
  buses: CatalogBus[];
  tipologias: TipologiaItem[];
};

export type FormState = {
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
  /** Línea/ruta operativa (autocomplete catálogo Linea + texto libre). */
  lineaLabel: string;
  /** Etiqueta libre del servicio/turno/recorrido (texto libre puro). */
  servicioLabel: string;
  /** Nombre del conductor (texto libre) en el momento de la incidencia. */
  conductorLabel: string;
};

export type CreateTicketPayload = {
  form: FormState;
  stagedUploadFiles: File[];
  /**
   * Bus seleccionado del catálogo. Si el usuario tecleó un bus nuevo que no
   * existe (sugerencia de Pedro: combobox con texto libre), llega `null` y el
   * backend lo creará al vuelo a partir de `form.busId`.
   */
  selectedBus: CatalogBus | null;
  /**
   * Activo del bus. Si el bus es nuevo o el usuario no seleccionó un activo
   * concreto, llega `null` y el backend usará el primero del bus (o creará un
   * `SAE-DEFAULT` si el bus también es nuevo).
   */
  selectedAsset: CatalogBus["assets"][number] | null;
  selectedTipologia: TipologiaItem;
  /**
   * Sugerencias del campo (Ibrahim):
   *  - `assignToMe`: el técnico/gestor que crea el ticket se asigna a sí
   *    mismo (default `true` para técnicos/gestores).
   *  - `createAsResolved`: nace ya cerrado (caso resuelto in situ).
   *  - `resolutionNote`: nota de cierre opcional (solo si createAsResolved).
   * El backend ignora estos flags si el rol no tiene permiso para ellos.
   */
  assignToMe?: boolean;
  createAsResolved?: boolean;
  resolutionNote?: string;
  /** Limpia borrador local y secciones tras crear con éxito. */
  onTicketCreated?: () => void;
};

export type InventorySummaryItem = {
  assetType: AssetType;
  partCode: string;
  partName: string;
  totalAvailable: number;
  totalReserved: number;
  minimumLevel: number;
  status: "ok" | "bajo" | "agotado";
  ticketCount?: number;
};

export type LocalUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type AuditEventView = {
  id: string;
  action: string;
  detail: string | null;
  ticketId: string | null;
  createdAt: string;
  actor: string;
  actorRole: UserRole | null;
};

export type MaintenanceAlertView = {
  busId: string;
  assetType: AssetType;
  operator: string;
  municipio: string;
  failuresLast30Days: number;
  severity: "warning" | "critical";
  hasOpenPreventiveTask: boolean;
  preventiveTaskId: string | null;
};

export type PreventiveTaskView = {
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

export const defaultForm = (busId = ""): FormState => ({
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
  lineaLabel: "",
  servicioLabel: "",
  conductorLabel: "",
});

export const statusMap: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_proceso: "En Proceso",
  esperando_repuesto: "Esperando Repuesto",
  resuelto: "Resuelto",
};

export const preventiveTaskTone = {
  pendiente: "bg-amber-400/20 text-amber-100",
  programada: "bg-cyan-400/20 text-cyan-100",
  completada: "bg-emerald-400/20 text-emerald-100",
  cancelada: "bg-slate-400/20 text-slate-200",
};

export const TICKETS_EMPTY_SHELL =
  "flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-10 text-center";

export const TICKET_FORM_DRAFT_KEY = "ccmgc_ticket_new_form_draft_v1";
export const TICKETS_BANDEJA_COMPACT_KEY = "ccmgc_tickets_bandeja_compact_v1";
export const TICKETS_UI_HINT_KEY = "ccmgc_tickets_ui_hint_dismissed_v1";
/**
 * Política de adjuntos en cliente. Debe coincidir con `src/lib/ticket-uploads.ts`.
 * Si cambias un valor, ajusta también el servidor para evitar errores 413.
 */
export const TICKET_ATTACH_MAX_FILES = 6;
/** Por archivo de imagen (5 MB). */
export const TICKET_ATTACH_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Por archivo de vídeo (40 MB). */
export const TICKET_ATTACH_MAX_VIDEO_BYTES = 40 * 1024 * 1024;
/** Tamaño combinado total por subida (120 MB). */
export const TICKET_ATTACH_MAX_TOTAL_BYTES = 120 * 1024 * 1024;
/** Atributo `accept` para inputs de subida (imagen + vídeo). */
export const TICKET_ATTACH_ACCEPT =
  "image/*,video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv";

export type TicketAttachKind = "image" | "video";

/** Clasifica un `File` del navegador como imagen, vídeo o descarte. */
export function classifyAttachFile(file: File): TicketAttachKind | null {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  // Fallback por extensión: Safari móvil envía MIME vacío al adjuntar
  // grabaciones de cámara.
  const ext = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if ([".mp4", ".webm", ".mov", ".mkv"].includes(ext)) return "video";
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return "image";
  return null;
}

/** Devuelve el tope por archivo en bytes según el tipo. */
export function attachByteLimit(kind: TicketAttachKind): number {
  return kind === "video" ? TICKET_ATTACH_MAX_VIDEO_BYTES : TICKET_ATTACH_MAX_IMAGE_BYTES;
}

export type TicketFormSectionId = "equipment" | "tipologia" | "detail" | "attachments";

export const TICKET_FORM_SECTION_ORDER: TicketFormSectionId[] = ["equipment", "tipologia", "detail", "attachments"];

export function normalizeAccordionOpen(
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

export type TicketFormDraftPayload = {
  form: FormState;
  openSections: Record<TicketFormSectionId, boolean>;
};
