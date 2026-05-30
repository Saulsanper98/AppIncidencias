import { promises as fs } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type { TicketPriority, TicketStatus } from "@/lib/domain";

/** Datos crudos de un ticket que se incluyen en el informe. */
export type DailyReportRow = {
  id: string;
  createdAt: Date;
  busId: string;
  /** Operadora due?a del bus (Global, CCMGC, etc.). */
  operator: string;
  /** L?nea cubierta por el bus en el momento de la incidencia (texto libre). */
  lineaLabel: string | null;
  /** Servicio/turno/recorrido (texto libre). */
  servicioLabel: string | null;
  /** Nombre/id del conductor (texto libre). */
  conductorLabel: string | null;
  /** Tipo amplio de la incidencia (mostrado en columna TIPO DE INCIDENCIA). */
  tipoLabel: string;
  /** Estado actual del ticket. */
  status: TicketStatus;
  /** Prioridad/Criticidad. */
  priority: TicketPriority;
  /** T?tulo corto. */
  title: string;
  /** Descripci?n completa. */
  description: string;
};

/** Metadatos de cabecera del informe. */
export type DailyReportMeta = {
  reportDate: Date;
  generatedAt: Date;
  generatedByName: string;
  generatedByEmail: string;
  /** Cu?ntos compa?eros ya hab?an generado este informe hoy (antes del actual). */
  previousGenerations: number;
};

// =================== TOKENS DE DISE?O ===================
//
// Paleta corporativa CCMGC. Mantenemos contraste alto y un ?nico acento ?mbar
// para llamar la atenci?n de Jefatura sobre criticidad y m?tricas clave.
const T = {
  /** Azul profundo CCMGC (cabecera, dorso). */
  brandDeep: "FF0B1E36",
  /** Azul corporativo (acentos, totales). */
  brand: "FF13294B",
  /** Azul claro corporativo (acento secundario). */
  brandSoft: "FF1F4E79",
  /** L?nea/acento dorado (filete superior). */
  gold: "FFC9A227",
  /** Texto principal sobre fondo claro. */
  ink: "FF1F2937",
  /** Texto secundario sobre fondo claro. */
  ink2: "FF4B5563",
  /** Texto tenue. */
  ink3: "FF6B7280",
  /** Fondo de hoja (papel premium). */
  paper: "FFFFFFFF",
  /** Tarjetas / fondo bloque resumen. */
  cardBg: "FFF1F4F9",
  /** Borde sutil. */
  border: "FFE5E7EB",
  /** Zebra suave. */
  zebra: "FFFAFBFC",
} as const;

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

const PRIORITY_FILL: Record<TicketPriority, string> = {
  baja: "FFE8F0FE",
  media: "FFFFF4E5",
  alta: "FFFCE8E8",
};

const PRIORITY_TEXT: Record<TicketPriority, string> = {
  baja: "FF1E40AF",
  media: "FF92400E",
  alta: "FFB91C1C",
};

// NOTA: en versiones anteriores se mostraba el estado del ticket en la celda
// INCIDENCIA y como mini-cards de resumen, pero a Jefatura no le aporta valor
// y satura visualmente, asi que se ha retirado. Si en el futuro se quisiera
// reactivar, basta con recuperar los mapas STATUS_LABEL / STATUS_FILL /
// STATUS_TEXT y un imports del enum TicketStatus.

const SEP = " \u00b7 "; // middle dot ' \u00b7 '

/**
 * Genera el informe diario en XLSX con apariencia premium:
 *   - Cabecera corporativa con LOGO embebido + filete dorado.
 *   - Bloque metadatos (fecha, generado por, n?mero de generaci?n del d?a).
 *   - Resumen con cinco "mini-cards" (Total, por estado y por prioridad).
 *   - Tabla con cabeceras, zebra, criticidad/estado con badges de color.
 *   - Pie con marca de agua textual del CCMGC.
 *
 * Devuelve un Buffer listo para servir desde una API.
 */
export async function buildDailyReportXlsx(
  rows: DailyReportRow[],
  meta: DailyReportMeta,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = `CCMGC${SEP}App de Incidencias`;
  workbook.created = meta.generatedAt;
  workbook.title = `Informe diario${SEP}${formatDateShort(meta.reportDate)}`;
  workbook.company = "Centro de Control de Movilidad de Gran Canaria";

  const sheet = workbook.addWorksheet("Incidencias", {
    properties: { defaultRowHeight: 16, tabColor: { argb: T.brand } },
    // Congelamos por encima de la fila de cabeceras de tabla (fila 15).
    views: [{ state: "frozen", ySplit: 15, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: "15:15",
    },
  });

  // ============ COLUMNAS (anchos definidos primero) ============
  // Nota: la columna "I/P" se retiró en mayo 2026 a petición del centro
  // (no aporta valor a Jefatura). El layout es ahora de 11 columnas.
  const columns = [
    { key: "incidencia", header: "INCIDENCIA", width: 14 },
    { key: "fecha", header: "FECHA", width: 12 },
    { key: "vehiculo", header: "VEH\u00cdCULO", width: 11 },
    { key: "servicio", header: "SERVICIO", width: 14 },
    { key: "operadora", header: "OPERADORA", width: 13 },
    { key: "conductor", header: "CONDUCTOR", width: 14 },
    { key: "hreporte", header: "H. REPORTE", width: 11 },
    { key: "expedicion", header: "N\u00ba EXPEDICI\u00d3N", width: 14 },
    { key: "tipo", header: "TIPO DE INCIDENCIA", width: 26 },
    { key: "criticidad", header: "CRITICIDAD", width: 13 },
    { key: "descripcion", header: "DESCRIPCI\u00d3N", width: 70 },
  ] as const;
  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width;
  });

  // ============ FILA 1: filete dorado superior fino ============
  sheet.mergeCells("A1:K1");
  const goldStripe = sheet.getCell("A1");
  goldStripe.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.gold } };
  sheet.getRow(1).height = 3;

  // ============ FILAS 2-7: CABECERA con LOGO + Titulares ============
  // Bloque azul profundo de SEIS filas (24-28 px cada una) para dejar al logo
  // espacio alrededor (margen superior, izquierdo y por debajo) y separarlo
  // de los titulares.  La franja completa se pinta del color de marca.
  for (let r = 2; r <= 7; r++) {
    sheet.getRow(r).height = 24;
    for (let c = 1; c <= 11; c++) {
      sheet.getCell(r, c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: T.brandDeep },
      };
    }
  }
  // La fila 2 es padding superior visual; la 7 es padding inferior. Las filas
  // 3-6 contienen el contenido (logo a la izquierda; eyebrow + t?tulo + fecha
  // a la derecha).
  sheet.getRow(2).height = 14;
  sheet.getRow(7).height = 14;

  // Logo: usamos un bloque generoso a la izquierda (columnas A-C),
  // posicionado con margen superior e izquierdo claros para que respire.
  const logoPath = path.join(process.cwd(), "public", "ccmgc-logo-white.png");
  try {
    const logoBuffer = await fs.readFile(logoPath);
    const imageId = workbook.addImage({
      buffer: new Uint8Array(logoBuffer.buffer, logoBuffer.byteOffset, logoBuffer.byteLength) as unknown as ExcelJS.Buffer,
      extension: "png",
    });
    // Coordenadas en columnas/filas con decimales: col 0.4 = ~30px desde
    // borde izquierdo. row 1.7 = en la segunda fila de la franja azul.
    // Tama?o 160x72 (m?s peque?o que antes) para dejar aire alrededor.
    // Posicionamos el logo centrado verticalmente dentro de la franja azul.
    // La franja ocupa filas 2 (14px) + 3-6 (24px) + 7 (14px) = 124px.  El
    // logo mide 64px de alto, as? que dejamos ~30px de aire arriba y abajo.
    // row=2.6 ? empieza a mitad de la fila 3 (notaci?n 0-based de ExcelJS).
    sheet.addImage(imageId, {
      tl: { col: 0.85, row: 2.6 },
      ext: { width: 142, height: 64 },
      editAs: "absolute",
    });
  } catch {
    // Si el logo no est? disponible, seguimos sin ?l.
  }

  // Titulares: empezamos en la columna E para dejar reservadas las primeras
  // 4 columnas (A-D) al logo. Esto le da al logo un margen derecho c?modo
  // (ya no toca el texto amarillo).
  sheet.mergeCells("E3:K3");
  const subtitleCell = sheet.getCell("E3");
  subtitleCell.value = "CCMGC \u00b7 CENTRO DE CONTROL DE MOVILIDAD DE GRAN CANARIA";
  subtitleCell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFC9A227" } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sheet.mergeCells("E4:K5");
  const titleCell = sheet.getCell("E4");
  titleCell.value = "Informe diario de incidencias";
  titleCell.font = { name: "Calibri", size: 22, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sheet.mergeCells("E6:K6");
  const dateCell = sheet.getCell("E6");
  dateCell.value = capitalize(formatDateLong(meta.reportDate));
  dateCell.font = { name: "Calibri", size: 11, color: { argb: "FFCBD5E1" } };
  dateCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  // ============ FILA 8: META (generado por) ============
  // Solo "Generado por <nombre>" y fecha-hora. Sin info de generaciones
  // previas (irrelevante para Jefatura).
  sheet.mergeCells("A8:K8");
  const metaRow = sheet.getCell("A8");
  metaRow.value = {
    richText: [
      { text: "Generado por  ", font: { color: { argb: T.ink3 }, size: 10 } },
      { text: meta.generatedByName, font: { color: { argb: T.ink }, size: 10, bold: true } },
      { text: `  (${meta.generatedByEmail})`, font: { color: { argb: T.ink3 }, size: 10 } },
      { text: `  ${SEP}  `, font: { color: { argb: T.ink3 }, size: 10 } },
      { text: formatDateTimeLong(meta.generatedAt), font: { color: { argb: T.ink2 }, size: 10 } },
    ],
  };
  metaRow.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  metaRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.paper } };
  sheet.getRow(8).height = 24;
  // Borde fino abajo para separar de los KPI.
  for (let c = 1; c <= 11; c++) {
    sheet.getCell(8, c).border = {
      bottom: { style: "thin", color: { argb: T.border } },
    };
  }

  // Espacio.
  sheet.getRow(9).height = 8;

  // ============ FILAS 10-13: MINI-CARDS DE RESUMEN ============
  // Solo 4 tarjetas: Total destacado + 3 niveles de prioridad. Se ha quitado
  // el desglose por estado (Abiertos/En proceso/Resueltos) porque al Jefe no
  // le aporta valor y satura la lectura.
  const totals = summarize(rows);
  // 4 tarjetas en un layout de 11 columnas: 5 + 2 + 2 + 2 = 11.
  const cards: Array<{ range: string; label: string; value: string; accent: string; emphasis?: "primary" }> = [
    { range: "A10:E13", label: "TOTAL INCIDENCIAS", value: String(totals.total), accent: T.brand, emphasis: "primary" },
    { range: "F10:G13", label: "PRIORIDAD ALTA", value: String(totals.byPriority.alta), accent: PRIORITY_TEXT.alta },
    { range: "H10:I13", label: "PRIORIDAD MEDIA", value: String(totals.byPriority.media), accent: PRIORITY_TEXT.media },
    { range: "J10:K13", label: "PRIORIDAD BAJA", value: String(totals.byPriority.baja), accent: PRIORITY_TEXT.baja },
  ];

  for (const card of cards) {
    sheet.mergeCells(card.range);
    const cell = sheet.getCell(card.range.split(":")[0]);
    const valueSize = card.emphasis === "primary" ? 32 : 24;
    const labelColor = card.emphasis === "primary" ? T.ink2 : T.ink3;
    cell.value = {
      richText: [
        { text: `${card.label.toUpperCase()}\n`, font: { name: "Calibri", size: 9, bold: true, color: { argb: labelColor } } },
        { text: card.value, font: { name: "Calibri", size: valueSize, bold: true, color: { argb: card.accent } } },
      ],
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.cardBg } };
    cell.border = {
      top: { style: "thin", color: { argb: T.border } },
      bottom: { style: "thin", color: { argb: T.border } },
      left: { style: "thin", color: { argb: T.border } },
      right: { style: "thin", color: { argb: T.border } },
    };
  }
  // Tarjeta principal con barra lateral azul gruesa.
  sheet.getCell("A10").border = {
    ...sheet.getCell("A10").border,
    left: { style: "thick", color: { argb: T.brand } },
  };
  sheet.getRow(10).height = 18;
  sheet.getRow(11).height = 18;
  sheet.getRow(12).height = 18;
  sheet.getRow(13).height = 18;

  // Espacio antes de la tabla.
  sheet.getRow(14).height = 8;

  // ============ FILA 15: CABECERAS DE TABLA ============
  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.brand } };
    cell.border = {
      top: { style: "thin", color: { argb: T.brand } },
      bottom: { style: "medium", color: { argb: T.gold } },
      left: { style: "thin", color: { argb: T.brand } },
      right: { style: "thin", color: { argb: T.brand } },
    };
  });

  // ============ FILAS DE DATOS ============
  if (rows.length === 0) {
    // Estado vac?o profesional: mensaje centrado.
    const emptyRow = sheet.addRow([
      "\u2014",
      formatDateShort(meta.reportDate),
      "",
      "",
      "",
      "",
      "",
      "",
      "Sin incidencias el d\u00eda indicado",
      "\u2014",
      "No se registraron incidencias en el rango horario del informe.",
    ]);
    emptyRow.height = 28;
    emptyRow.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 11, italic: true, color: { argb: T.ink3 } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: T.border } },
      };
    });
  }

  rows.forEach((row, index) => {
    const dataRow = sheet.addRow([
      shortIncidenciaId(row.id),
      formatDateShort(row.createdAt),
      stripBusPrefix(row.busId),
      row.servicioLabel ?? "",
      row.operator ?? "",
      row.conductorLabel ?? "",
      formatTime(row.createdAt),
      row.lineaLabel ?? "",
      row.tipoLabel,
      PRIORITY_LABEL[row.priority],
      row.description ?? "",
    ]);

    const isZebra = index % 2 === 1;
    // Tras retirar "I/P", el layout es de 11 columnas:
    //   1 INCIDENCIA · 2 FECHA · 3 VEHÍCULO · 4 SERVICIO · 5 OPERADORA
    //   6 CONDUCTOR · 7 H. REPORTE · 8 Nº EXPEDICIÓN · 9 TIPO INCIDENCIA
    //   10 CRITICIDAD · 11 DESCRIPCIÓN
    dataRow.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 10, color: { argb: T.ink } };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 11 ? "left" : colNumber >= 2 && colNumber <= 10 ? "center" : "left",
        wrapText: colNumber === 11 || colNumber === 9,
        indent: colNumber === 11 ? 1 : 0,
      };
      cell.border = {
        top: { style: "hair", color: { argb: T.border } },
        bottom: { style: "hair", color: { argb: T.border } },
        left: { style: "hair", color: { argb: T.border } },
        right: { style: "hair", color: { argb: T.border } },
      };
      if (isZebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: T.zebra } };
      }
    });

    // Celda de criticidad (col 10): badge de color seg?n prioridad.
    const criticidadCell = dataRow.getCell(10);
    criticidadCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PRIORITY_FILL[row.priority] } };
    criticidadCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: PRIORITY_TEXT[row.priority] } };

    // Celda de incidencia: solo el id, sin estado del ticket.
    // Jefatura no necesita ver "Resuelto / Abierto / etc." en este informe.
    const incidenciaCell = dataRow.getCell(1);
    incidenciaCell.value = shortIncidenciaId(row.id);
    incidenciaCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: T.ink } };
    incidenciaCell.alignment = { vertical: "middle", horizontal: "center" };

    // Altura de fila adaptativa seg?n longitud de descripci?n.
    const descLen = (row.description ?? "").length;
    const tipoLen = (row.tipoLabel ?? "").length;
    const lines = Math.max(
      Math.ceil(descLen / 80),
      Math.ceil(tipoLen / 22),
      2,
    );
    dataRow.height = Math.max(34, Math.min(140, 14 + lines * 14));
  });

  // ============ FOOTER ============
  sheet.addRow([]);
  const footerRow = sheet.addRow([
    `Documento confidencial generado autom\u00e1ticamente desde la aplicaci\u00f3n CCMGC el ${formatDateTimeLong(meta.generatedAt)}. Contiene ${rows.length} ${rows.length === 1 ? "registro" : "registros"}.`,
  ]);
  sheet.mergeCells(footerRow.number, 1, footerRow.number, 11);
  footerRow.getCell(1).font = { name: "Calibri", size: 9, italic: true, color: { argb: T.ink3 } };
  footerRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };

  // Marca de agua textual en el pie de p?gina impreso.
  sheet.headerFooter.oddFooter =
    "&L&\"Calibri,Italic\"&8&I CCMGC \u00b7 Confidencial &C&\"Calibri,Italic\"&8 P\u00e1gina &P de &N";

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// =================== HELPERS ===================

function summarize(rows: DailyReportRow[]) {
  const byStatus: Record<TicketStatus, number> = {
    abierto: 0,
    en_proceso: 0,
    esperando_repuesto: 0,
    resuelto: 0,
  };
  const byPriority: Record<TicketPriority, number> = {
    baja: 0,
    media: 0,
    alta: 0,
  };
  for (const r of rows) {
    byStatus[r.status] += 1;
    byPriority[r.priority] += 1;
  }
  return { total: rows.length, byStatus, byPriority };
}

function shortIncidenciaId(id: string): string {
  return id.slice(-8).toUpperCase();
}

function stripBusPrefix(busId: string): string {
  if (busId.startsWith("GL-")) return busId.slice(3);
  return busId;
}

function formatDateShort(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("es-ES", { month: "short" }).replace(".", "");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${capitalize(month)}-${year}`;
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTimeLong(d: Date): string {
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
