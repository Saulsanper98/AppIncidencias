import type { AssetType, TicketPriority, TicketStatus } from "@/lib/domain";
import { formatCanary } from "@/lib/datetime/canary";
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

const DELIMITER = ";";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  validadora: "Validadora",
  sae: "SAE",
  router: "Router",
  pantalla: "Pantalla",
};

export type TicketCsvExportRow = {
  id: string;
  title: string;
  description: string;
  busId: string;
  operator: string;
  municipio: string;
  assetType: AssetType;
  status: TicketStatus;
  priority: TicketPriority;
  tipo?: string | null;
  subtipo?: string | null;
  subsubtipo?: string | null;
  dominio?: string | null;
  nivelImpacto?: string | null;
  origenTecnico?: string | null;
  lineaLabel?: string | null;
  servicioLabel?: string | null;
  conductorLabel?: string | null;
  assignedToUserName?: string | null;
  slaDeadline: string;
  createdAt: string;
  updatedAt: string;
  incidentOccurredAt?: string | null;
  needsCompletion?: boolean;
  mapPlaceMunicipio?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type TicketCsvExportMeta = {
  exportedAt?: Date;
  filtersSummary?: string;
};

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateCell(value: string | null | undefined): string {
  const date = parseIso(value);
  if (!date) return "";
  return formatCanary(date, { dateStyle: "short", timeStyle: "short" });
}

function formatExportStamp(date: Date): string {
  return formatCanary(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isSlaOverdue(ticket: TicketCsvExportRow, now: Date): boolean {
  if (ticket.status === "resuelto") return false;
  const deadline = parseIso(ticket.slaDeadline);
  return deadline ? deadline.getTime() < now.getTime() : false;
}

const CSV_COLUMNS: { key: keyof TicketCsvExportRow | "_shortId" | "_slaOverdue" | "_place"; header: string }[] = [
  { key: "_shortId", header: "Referencia" },
  { key: "id", header: "ID ticket" },
  { key: "title", header: "Título" },
  { key: "status", header: "Estado" },
  { key: "priority", header: "Prioridad" },
  { key: "operator", header: "Operadora" },
  { key: "busId", header: "Bus" },
  { key: "municipio", header: "Municipio bus" },
  { key: "_place", header: "Lugar mapa" },
  { key: "tipo", header: "Tipo" },
  { key: "subtipo", header: "Subtipo" },
  { key: "subsubtipo", header: "Incidencia" },
  { key: "dominio", header: "Dominio" },
  { key: "nivelImpacto", header: "Impacto" },
  { key: "origenTecnico", header: "Origen técnico" },
  { key: "assetType", header: "Activo" },
  { key: "lineaLabel", header: "Línea" },
  { key: "servicioLabel", header: "Servicio" },
  { key: "conductorLabel", header: "Conductor" },
  { key: "assignedToUserName", header: "Asignado a" },
  { key: "slaDeadline", header: "SLA límite" },
  { key: "_slaOverdue", header: "SLA vencido" },
  { key: "incidentOccurredAt", header: "Hora incidencia" },
  { key: "createdAt", header: "Creado" },
  { key: "updatedAt", header: "Actualizado" },
  { key: "needsCompletion", header: "Pendiente completar" },
  { key: "description", header: "Descripción" },
  { key: "latitude", header: "Latitud" },
  { key: "longitude", header: "Longitud" },
];

function cellValue(ticket: TicketCsvExportRow, key: (typeof CSV_COLUMNS)[number]["key"], now: Date): string {
  switch (key) {
    case "_shortId":
      return `#${ticket.id.slice(-8).toUpperCase()}`;
    case "_place":
      return ticket.mapPlaceMunicipio?.trim() || ticket.municipio || "";
    case "_slaOverdue":
      return isSlaOverdue(ticket, now) ? "Sí" : "No";
    case "status":
      return TICKET_STATUS_LABELS[ticket.status] ?? ticket.status;
    case "priority":
      return TICKET_PRIORITY_LABELS[ticket.priority] ?? ticket.priority;
    case "assetType":
      return ASSET_TYPE_LABELS[ticket.assetType] ?? ticket.assetType;
    case "slaDeadline":
    case "createdAt":
    case "updatedAt":
    case "incidentOccurredAt":
      return formatDateCell(ticket[key]);
    case "needsCompletion":
      return ticket.needsCompletion ? "Sí" : "No";
    case "latitude":
    case "longitude":
      return ticket[key] != null ? String(ticket[key]) : "";
    default: {
      const raw = ticket[key as keyof TicketCsvExportRow];
      return raw == null ? "" : String(raw);
    }
  }
}

export function buildTicketsCsv(tickets: TicketCsvExportRow[], meta?: TicketCsvExportMeta): string {
  const exportedAt = meta?.exportedAt ?? new Date();
  const now = exportedAt;
  const preamble: string[] = [
    [
      escapeCsvCell("CCMGC Ticketing — Exportación de bandeja"),
      escapeCsvCell("Exportado"),
      escapeCsvCell(formatExportStamp(exportedAt)),
      escapeCsvCell("Registros"),
      escapeCsvCell(String(tickets.length)),
    ].join(DELIMITER),
  ];

  if (meta?.filtersSummary?.trim()) {
    preamble.push(
      [escapeCsvCell("Filtros activos"), escapeCsvCell(meta.filtersSummary.trim())].join(DELIMITER),
    );
  }

  preamble.push("");

  const headerLine = CSV_COLUMNS.map((col) => escapeCsvCell(col.header)).join(DELIMITER);
  const dataLines = tickets.map((ticket) =>
    CSV_COLUMNS.map((col) => escapeCsvCell(cellValue(ticket, col.key, now))).join(DELIMITER),
  );

  return [...preamble, headerLine, ...dataLines].join("\n");
}

export function ticketsCsvFilename(exportedAt = new Date()): string {
  const stamp = formatCanary(exportedAt, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .replace(/\//g, "-");
  return `tickets_ccmgc_${stamp}.csv`;
}

export function downloadTicketsCsv(csv: string, filename: string): void {
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
