import type { AssetType, SessionUser, Ticket, TicketPriority, TicketStatus, UserRole } from "@/lib/domain";
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
};

export type CreateTicketPayload = {
  form: FormState;
  stagedUploadFiles: File[];
  selectedBus: CatalogBus;
  selectedAsset: CatalogBus["assets"][number];
  selectedTipologia: TipologiaItem;
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
export const TICKET_ATTACH_MAX_FILES = 8;
export const TICKET_ATTACH_MAX_BYTES = 5 * 1024 * 1024;

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
