import ExcelJS from "exceljs";

import type { AssetType, TicketPriority, TicketStatus } from "@/lib/domain";
import { formatCanary } from "@/lib/datetime/canary";
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-labels";

const T = {
  brand: "FF1E3A8A",
  brandLight: "FFE8EEF9",
  gold: "FFC9A227",
  ink: "FF0F172A",
  ink2: "FF475569",
  ink3: "FF94A3B8",
  border: "FFE2E8F0",
  paper: "FFF8FAFC",
  zebra: "FFF1F5F9",
  white: "FFFFFFFF",
} as const;

const STATUS_FILL: Partial<Record<TicketStatus, string>> = {
  resuelto: "FFD1FAE5",
  esperando_repuesto: "FFFFEDD5",
  en_proceso: "FFDBEAFE",
  abierto: "FFFEF9C3",
  borrador: "FFF3E8FF",
};

const PRIORITY_FILL: Record<string, string> = {
  Alta: "FFFEE2E2",
  Media: "FFFFEDD5",
  Baja: "FFDCFCE7",
};

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  validadora: "Validadora",
  sae: "SAE",
  router: "Router",
  pantalla: "Pantalla",
};

export type TicketExportRow = {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  operator: string;
  busId: string;
  municipio: string;
  tipo: string;
  subtipo: string;
  subsubtipo: string;
  dominio: string;
  nivelImpacto: string;
  assetType: AssetType;
  linea: string;
  servicio: string;
  serviceStopped: boolean;
  impactedLines: number;
  conductor: string;
  assignedTo: string;
  slaDeadline: Date;
  slaOverdue: boolean;
  incidentOccurredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  needsCompletion: boolean;
  lat: number | "";
  lng: number | "";
};

export type TicketExportFilters = {
  statusLabel: string;
  priorityLabel: string;
  operator: string;
  busId: string;
  partCode: string;
  onlyMine: boolean;
  dateRangeLabel: string;
  dateFrom?: string;
  dateTo?: string;
  exportedBy: string;
  exportedAt: Date;
  totalRows: number;
  maxRows: number;
};

const COLUMNS: { key: keyof TicketExportRow | "shortId"; header: string; width: number }[] = [
  { key: "shortId", header: "Referencia", width: 12 },
  { key: "title", header: "Título", width: 42 },
  { key: "status", header: "Estado", width: 22 },
  { key: "priority", header: "Prioridad", width: 11 },
  { key: "operator", header: "Operadora", width: 14 },
  { key: "busId", header: "Bus", width: 11 },
  { key: "municipio", header: "Municipio", width: 26 },
  { key: "tipo", header: "Tipo", width: 15 },
  { key: "subtipo", header: "Subtipo", width: 18 },
  { key: "subsubtipo", header: "Incidencia", width: 24 },
  { key: "dominio", header: "Dominio", width: 14 },
  { key: "nivelImpacto", header: "Impacto", width: 11 },
  { key: "assetType", header: "Activo", width: 12 },
  { key: "linea", header: "Línea", width: 11 },
  { key: "servicio", header: "Servicio", width: 12 },
  { key: "serviceStopped", header: "Servicio detenido", width: 16 },
  { key: "impactedLines", header: "Líneas impactadas", width: 16 },
  { key: "conductor", header: "Conductor", width: 16 },
  { key: "assignedTo", header: "Asignado a", width: 18 },
  { key: "slaDeadline", header: "SLA límite", width: 18 },
  { key: "slaOverdue", header: "SLA vencido", width: 12 },
  { key: "incidentOccurredAt", header: "Hora incidencia", width: 18 },
  { key: "createdAt", header: "Creado", width: 18 },
  { key: "updatedAt", header: "Actualizado", width: 18 },
  { key: "needsCompletion", header: "Pend. completar", width: 14 },
  { key: "description", header: "Descripción", width: 56 },
  { key: "id", header: "ID ticket", width: 28 },
  { key: "lat", header: "Latitud", width: 11 },
  { key: "lng", header: "Longitud", width: 11 },
];

const HEADER_ROW = 5;
const LAST_COL = COLUMNS.length;

function formatDate(date: Date | null): string {
  if (!date) return "";
  return formatCanary(date, { dateStyle: "short", timeStyle: "short" });
}

function paintRowFill(sheet: ExcelJS.Worksheet, rowNumber: number, color: string) {
  for (let col = 1; col <= LAST_COL; col++) {
    sheet.getCell(rowNumber, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: color },
    };
  }
}

function styleHeaderBand(sheet: ExcelJS.Worksheet, filters: TicketExportFilters) {
  sheet.mergeCells(1, 1, 1, LAST_COL);
  sheet.getRow(1).height = 3;
  sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.gold } };

  sheet.mergeCells(2, 1, 2, LAST_COL);
  const titleCell = sheet.getCell(2, 1);
  titleCell.value = "CCMGC Ticketing — Exportación de bandeja";
  titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: T.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.brand } };
  sheet.getRow(2).height = 30;

  sheet.mergeCells(3, 1, 3, LAST_COL);
  const metaCell = sheet.getCell(3, 1);
  metaCell.value = `Exportado: ${formatDate(filters.exportedAt)}  ·  ${filters.totalRows} ticket(s)  ·  Rango: ${filters.dateRangeLabel}  ·  Por: ${filters.exportedBy}`;
  metaCell.font = { name: "Calibri", size: 10, color: { argb: T.ink2 } };
  metaCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.paper } };
  sheet.getRow(3).height = 22;

  sheet.mergeCells(4, 1, 4, LAST_COL);
  const filterCell = sheet.getCell(4, 1);
  filterCell.value = `Filtros: estado ${filters.statusLabel} · prioridad ${filters.priorityLabel} · operadora ${filters.operator} · bus ${filters.busId}${filters.partCode !== "—" ? ` · pieza ${filters.partCode}` : ""}${filters.onlyMine ? " · solo míos" : ""}`;
  filterCell.font = { name: "Calibri", size: 9, color: { argb: T.ink3 } };
  filterCell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  filterCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.paper } };
  sheet.getRow(4).height = 20;
}

function styleDataHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(HEADER_ROW);
  row.height = 22;
  COLUMNS.forEach((col, index) => {
    const cell = row.getCell(index + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: T.white } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.brand } };
    cell.border = {
      bottom: { style: "thin", color: { argb: T.gold } },
    };
    sheet.getColumn(index + 1).width = col.width;
  });
}

function rowValue(row: TicketExportRow, key: (typeof COLUMNS)[number]["key"]): string | number | boolean {
  switch (key) {
    case "shortId":
      return `#${row.id.slice(-8).toUpperCase()}`;
    case "status":
      return TICKET_STATUS_LABELS[row.status] ?? row.status;
    case "priority":
      return TICKET_PRIORITY_LABELS[row.priority] ?? row.priority;
    case "assetType":
      return ASSET_TYPE_LABELS[row.assetType] ?? row.assetType;
    case "slaDeadline":
    case "incidentOccurredAt":
    case "createdAt":
    case "updatedAt":
      return formatDate(row[key] as Date | null);
    case "slaOverdue":
      return row.slaOverdue ? "Sí" : "No";
    case "needsCompletion":
      return row.needsCompletion ? "Sí" : "No";
    case "title":
    case "description": {
      const raw = String(row[key] ?? "");
      return raw.replace(/\r\n/g, " ").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    }
    default:
      return row[key as keyof TicketExportRow] as string | number;
  }
}

function styleDataRow(sheet: ExcelJS.Worksheet, rowNumber: number, ticket: TicketExportRow) {
  const row = sheet.getRow(rowNumber);
  row.height = 18;

  COLUMNS.forEach((col, index) => {
    const cell = row.getCell(index + 1);
    cell.value = rowValue(ticket, col.key);
    cell.font = { name: "Calibri", size: 10, color: { argb: T.ink } };
    // Sin wrap: evita filas altísimas por descripciones multilínea.
    // El texto completo sigue en la celda (visible en la barra de fórmulas).
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
      wrapText: false,
    };
    cell.border = {
      bottom: { style: "hair", color: { argb: T.border } },
    };
  });

  if (rowNumber % 2 === 0) {
    paintRowFill(sheet, rowNumber, T.zebra);
  }

  const statusCol = COLUMNS.findIndex((c) => c.key === "status") + 1;
  const statusFill = STATUS_FILL[ticket.status];
  if (statusFill) {
    row.getCell(statusCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusFill } };
  }

  const priorityLabel = TICKET_PRIORITY_LABELS[ticket.priority];
  const priorityCol = COLUMNS.findIndex((c) => c.key === "priority") + 1;
  const priorityFill = PRIORITY_FILL[priorityLabel];
  if (priorityFill) {
    row.getCell(priorityCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: priorityFill } };
  }

  if (ticket.slaOverdue) {
    const slaCol = COLUMNS.findIndex((c) => c.key === "slaOverdue") + 1;
    const slaCell = row.getCell(slaCol);
    slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    slaCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFB91C1C" } };
  }

  const idCol = COLUMNS.findIndex((c) => c.key === "id") + 1;
  row.getCell(idCol).font = { name: "Calibri", size: 9, color: { argb: T.ink3 } };
}

function styleFiltersSheet(sheet: ExcelJS.Worksheet, filters: TicketExportFilters) {
  sheet.columns = [
    { key: "k", width: 24 },
    { key: "v", width: 48 },
  ];

  sheet.mergeCells("A1:B1");
  const title = sheet.getCell("A1");
  title.value = "Resumen de exportación";
  title.font = { name: "Calibri", size: 13, bold: true, color: { argb: T.white } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.brand } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 26;

  const header = sheet.getRow(2);
  header.getCell(1).value = "Campo";
  header.getCell(2).value = "Valor";
  header.font = { name: "Calibri", size: 10, bold: true, color: { argb: T.ink } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.brandLight } };
  header.height = 20;

  const rows = [
    { k: "Estado", v: filters.statusLabel },
    { k: "Prioridad", v: filters.priorityLabel },
    { k: "Operadora", v: filters.operator },
    { k: "Bus", v: filters.busId },
    { k: "Código pieza", v: filters.partCode },
    { k: "Solo míos", v: filters.onlyMine ? "Sí" : "No" },
    { k: "Rango fechas", v: filters.dateRangeLabel },
    ...(filters.dateFrom ? [{ k: "Desde", v: filters.dateFrom }] : []),
    ...(filters.dateTo ? [{ k: "Hasta", v: filters.dateTo }] : []),
    { k: "Exportado por", v: filters.exportedBy },
    { k: "Exportado en", v: formatDate(filters.exportedAt) },
    { k: "Total filas", v: String(filters.totalRows) },
    { k: "Límite máximo", v: String(filters.maxRows) },
  ];

  rows.forEach((entry, index) => {
    const row = sheet.addRow(entry);
    const rowNumber = index + 3;
    if (rowNumber % 2 === 1) {
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.zebra } };
      row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.zebra } };
    }
    row.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: T.ink2 } };
    row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: T.ink } };
    row.getCell(2).alignment = { wrapText: true };
    row.height = 18;
  });

  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

export async function buildTicketsExportWorkbook(
  tickets: TicketExportRow[],
  filters: TicketExportFilters,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CCMGC Ticketing";
  workbook.created = filters.exportedAt;

  const sheet = workbook.addWorksheet("Tickets", {
    views: [{ state: "frozen", ySplit: HEADER_ROW, activeCell: "A6" }],
  });

  styleHeaderBand(sheet, filters);
  styleDataHeader(sheet);

  tickets.forEach((ticket, index) => {
    styleDataRow(sheet, HEADER_ROW + 1 + index, ticket);
  });

  if (tickets.length > 0) {
    sheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: HEADER_ROW + tickets.length, column: LAST_COL },
    };
  }

  const filtros = workbook.addWorksheet("Filtros");
  styleFiltersSheet(filtros, filters);

  return workbook;
}

export function ticketsXlsxFilename(exportedAt = new Date(), rangeSuffix = ""): string {
  const stamp = formatCanary(exportedAt, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/\//g, "");
  return `tickets_ccmgc_${stamp}${rangeSuffix}.xlsx`;
}
