import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
  type IParagraphOptions,
  type ITableCellOptions,
} from "docx";

import { formatCanary } from "@/lib/datetime/canary";
import { currentShiftFromHour, SHIFT_LABEL } from "@/lib/shift-utils";

export type IncidentDocxTicket = {
  id: string;
  title: string;
  description: string;
  busId: string;
  tipo: string | null;
  subtipo: string | null;
  subsubtipo: string | null;
  observaciones: string | null;
  lineaLabel: string | null;
  servicioLabel: string | null;
  conductorLabel: string | null;
  createdAt: Date;
  bus: { operator: string };
  createdBy: { name: string } | null;
  comments: Array<{ author: string; body: string; createdAt: Date }>;
};

type IncidentDocxData = {
  numero_informe: string;
  fecha_hora: string;
  operador: string;
  turno: string;
  operadora: string;
  tipo_incidencia: string;
  linea: string;
  numero_vehiculo: string;
  id_conductor: string;
  servicio: string;
  planificacion: string;
  intensificacion: string;
};

type DescripcionParts = {
  titulo: string;
  parrafos: string[];
  observaciones: string | null;
  seguimiento: Array<{ fecha: string; autor: string; cuerpo: string }>;
};

/* Paleta alineada con la plantilla oficial CCMGC */
const FONT = "Calibri";
const COLOR_TITLE = "5C4A1E";
const COLOR_LABEL = "6B5A2E";
const COLOR_VALUE = "1E293B";
const COLOR_MUTED = "64748B";
const COLOR_ACCENT = "1D4E89";
const FILL_HEADER = "C5D9F1";
const FILL_FIELD = "F4F8FC";
const BORDER = "7BA7CE";

const CELL_MARGIN = { top: 100, bottom: 100, left: 180, right: 180 };
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 10, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 10, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 10, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 10, color: BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 6, color: BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 6, color: BORDER },
};

function dash(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "";
}

function displayValue(value: string): string {
  return value.trim() || "—";
}

function fmtDateTime(d: Date): string {
  return formatCanary(d, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ticketRef(id: string): string {
  return id.slice(-8).toUpperCase();
}

function canaryHour(d: Date): number {
  const h = formatCanary(d, { hour: "2-digit", hour12: false });
  return Number(h);
}

function shiftLabelAt(d: Date): string {
  return SHIFT_LABEL[currentShiftFromHour(canaryHour(d))];
}

function buildTipoIncidencia(ticket: IncidentDocxTicket): string {
  return [ticket.tipo, ticket.subtipo, ticket.subsubtipo].filter(Boolean).join("  ›  ");
}

function buildDescripcionParts(ticket: IncidentDocxTicket): DescripcionParts {
  const titulo = ticket.title.trim();
  const description = ticket.description.trim();
  const parrafos: string[] = [];

  if (description && description !== titulo) {
    parrafos.push(description);
  }

  const seguimiento = [...ticket.comments]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((c) => ({
      fecha: fmtDateTime(c.createdAt),
      autor: c.author,
      cuerpo: c.body.trim(),
    }));

  return {
    titulo,
    parrafos,
    observaciones: ticket.observaciones?.trim() || null,
    seguimiento,
  };
}

export function buildIncidentDocxData(ticket: IncidentDocxTicket): IncidentDocxData {
  return {
    numero_informe: ticketRef(ticket.id),
    fecha_hora: fmtDateTime(ticket.createdAt),
    operador: dash(ticket.createdBy?.name),
    turno: shiftLabelAt(ticket.createdAt),
    operadora: dash(ticket.bus.operator),
    tipo_incidencia: dash(buildTipoIncidencia(ticket)),
    linea: dash(ticket.lineaLabel),
    numero_vehiculo: ticket.busId,
    id_conductor: dash(ticket.conductorLabel),
    servicio: dash(ticket.servicioLabel),
    planificacion: "",
    intensificacion: "",
  };
}

function labelRun(text: string, size = 18) {
  return new TextRun({ text, font: FONT, bold: true, color: COLOR_LABEL, size, allCaps: true });
}

function valueRun(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) {
  const trimmed = text.trim();
  const isEmpty = !trimmed || trimmed === "—";
  return new TextRun({
    text: isEmpty ? "—" : trimmed,
    font: FONT,
    color: isEmpty ? COLOR_MUTED : COLOR_VALUE,
    size: 20,
    ...opts,
  });
}

function labelParagraph(text: string, center = false) {
  return new Paragraph({
    alignment: center ? AlignmentType.CENTER : undefined,
    spacing: { before: 40, after: 40 },
    children: [labelRun(text)],
  });
}

function valueParagraph(text: string, opts: Partial<IParagraphOptions> = {}) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    ...opts,
    children: [valueRun(text)],
  });
}

function headerCell(text: string, opts: Partial<ITableCellOptions> = {}) {
  return new TableCell({
    shading: { fill: FILL_HEADER },
    margins: CELL_MARGIN,
    verticalAlign: VerticalAlign.CENTER,
    children: [labelParagraph(text)],
    ...opts,
  });
}

function valueCell(text: string, opts: Partial<ITableCellOptions> = {}) {
  return new TableCell({
    shading: { fill: FILL_FIELD },
    margins: CELL_MARGIN,
    verticalAlign: VerticalAlign.CENTER,
    children: [valueParagraph(text)],
    ...opts,
  });
}

function labelValueRow(label: string, value: string) {
  return new TableRow({
    children: [
      headerCell(label, { width: { size: 22, type: WidthType.PERCENTAGE } }),
      valueCell(value, { columnSpan: 5 }),
    ],
  });
}

function tripleFieldBlock(fields: [string, string][]) {
  return [
    new TableRow({
      children: fields.map(([label]) =>
        new TableCell({
          columnSpan: 2,
          shading: { fill: FILL_HEADER },
          margins: CELL_MARGIN,
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 60, after: 40 },
              children: [labelRun(label, 16)],
            }),
          ],
        }),
      ),
    }),
    new TableRow({
      children: fields.map(([, value]) =>
        new TableCell({
          columnSpan: 2,
          shading: { fill: FILL_FIELD },
          margins: CELL_MARGIN,
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 40, after: 80 },
              children: [valueRun(displayValue(value), { bold: true, size: 22 })],
            }),
          ],
        }),
      ),
    }),
  ];
}

function buildMetaTable(data: IncidentDocxData) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            verticalMerge: VerticalMergeType.RESTART,
            shading: { fill: FILL_HEADER },
            margins: { top: 200, bottom: 200, left: 240, right: 240 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: "CONTROL DE INCIDENCIAS",
                    font: FONT,
                    bold: true,
                    color: COLOR_TITLE,
                    size: 30,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "CCMGC",
                    font: FONT,
                    bold: true,
                    color: COLOR_ACCENT,
                    size: 40,
                  }),
                ],
              }),
            ],
          }),
          headerCell("N.º DE INFORME"),
          new TableCell({
            shading: { fill: FILL_FIELD },
            margins: CELL_MARGIN,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: data.numero_informe,
                    font: "Consolas",
                    bold: true,
                    color: COLOR_ACCENT,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            verticalMerge: VerticalMergeType.CONTINUE,
            shading: { fill: FILL_HEADER },
            children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
          }),
          headerCell("FECHA Y HORA"),
          valueCell(data.fecha_hora),
        ],
      }),
      labelValueRow("OPERADOR", data.operador),
      labelValueRow("TURNO", data.turno),
      labelValueRow("OPERADORA", data.operadora),
      labelValueRow("TIPO INCIDENCIA", data.tipo_incidencia),
      ...tripleFieldBlock([
        ["LINEA", data.linea],
        ["N.º VEHICULO", data.numero_vehiculo],
        ["ID CONDUCTOR", data.id_conductor],
      ]),
      ...tripleFieldBlock([
        ["SERVICIO", data.servicio],
        ["PLANIFICACIÓN", data.planificacion],
        ["INTENSIFICACIÓN", data.intensificacion],
      ]),
    ],
  });
}

function buildDescriptionParagraphs(parts: DescripcionParts): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (parts.titulo) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: parts.titulo,
            font: FONT,
            bold: true,
            color: COLOR_VALUE,
            size: 26,
          }),
        ],
      }),
    );
  }

  for (const parrafo of parts.parrafos) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 160, line: 276 },
        children: [valueRun(parrafo, { size: 22 })],
      }),
    );
  }

  if (parts.observaciones) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 220, after: 160 },
        children: [
          new TextRun({ text: "Observaciones: ", font: FONT, bold: true, color: COLOR_LABEL, size: 20 }),
          new TextRun({
            text: parts.observaciones,
            font: FONT,
            italics: true,
            color: COLOR_VALUE,
            size: 22,
          }),
        ],
      }),
    );
  }

  if (parts.seguimiento.length > 0) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 280, after: 120 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 4 },
        },
        children: [
          new TextRun({
            text: "SEGUIMIENTO",
            font: FONT,
            bold: true,
            color: COLOR_LABEL,
            size: 18,
            allCaps: true,
          }),
        ],
      }),
    );

    for (const item of parts.seguimiento) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 120, line: 276 },
          indent: { left: 280 },
          children: [
            new TextRun({
              text: `${item.fecha}  ·  ${item.autor}`,
              font: FONT,
              bold: true,
              color: COLOR_MUTED,
              size: 18,
            }),
            new TextRun({ text: "\n", font: FONT, size: 4 }),
            new TextRun({ text: item.cuerpo, font: FONT, color: COLOR_VALUE, size: 20 }),
          ],
        }),
      );
    }
  }

  if (paragraphs.length === 0) {
    paragraphs.push(
      new Paragraph({
        children: [valueRun("Sin descripción registrada.", { italics: true, color: COLOR_MUTED })],
      }),
    );
  }

  paragraphs.push(new Paragraph({ spacing: { before: 480 } }));

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "CCMGC",
          font: "Calibri Light",
          bold: true,
          color: "D4E4F4",
          size: 88,
        }),
      ],
    }),
  );

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "Centro de Control de la Movilidad de Gran Canaria",
          font: FONT,
          color: "B8CCE4",
          size: 17,
        }),
      ],
    }),
  );

  return paragraphs;
}

function buildDescriptionTable(parts: DescripcionParts) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: FILL_HEADER },
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 40 },
                children: [
                  new TextRun({
                    text: "DESCRIPCIÓN DE LA INCIDENCIA",
                    font: FONT,
                    bold: true,
                    color: COLOR_TITLE,
                    size: 22,
                    allCaps: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        height: { value: 5200, rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: [
          new TableCell({
            shading: { fill: "FFFFFF" },
            margins: { top: 240, bottom: 240, left: 280, right: 280 },
            verticalAlign: VerticalAlign.TOP,
            children: buildDescriptionParagraphs(parts),
          }),
        ],
      }),
    ],
  });
}

function buildIncidentDocument(data: IncidentDocxData, parts: DescripcionParts) {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 20, color: COLOR_VALUE },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 900, right: 900, bottom: 900, left: 900 },
          },
        },
        children: [
          buildMetaTable(data),
          new Paragraph({ spacing: { before: 180, after: 0 } }),
          buildDescriptionTable(parts),
        ],
      },
    ],
  });
}

export function incidentDocxDownloadName(ticketId: string): string {
  return `CCMGC-INC-${ticketRef(ticketId)}.docx`;
}

export async function renderIncidentDocx(ticket: IncidentDocxTicket): Promise<Buffer> {
  const data = buildIncidentDocxData(ticket);
  const parts = buildDescripcionParts(ticket);
  return Packer.toBuffer(buildIncidentDocument(data, parts));
}
