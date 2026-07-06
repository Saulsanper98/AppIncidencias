/**
 * Genera templates/CCMGC-INC-000.docx de referencia (misma estructura que incident-docx.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Packer } from "docx";

// Reutilizamos el generador del servidor vía import dinámico del build TS no disponible aquí.
// Este script duplica la llamada mínima: ejecutar tras cambios solo si necesitas el .docx en disco.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(__dirname, "..", "templates", "CCMGC-INC-000.docx");

const sample = {
  numero_informe: "00000000",
  fecha_hora: "22/06/2026 10:00",
  operador: "{operador}",
  turno: "{turno}",
  operadora: "{operadora}",
  tipo_incidencia: "{tipo_incidencia}",
  linea: "{linea}",
  numero_vehiculo: "{numero_vehiculo}",
  id_conductor: "{id_conductor}",
  servicio: "{servicio}",
  planificacion: "{planificacion}",
  intensificacion: "{intensificacion}",
  descripcion_incidencia: "{descripcion_incidencia}",
};

const TITLE_COLOR = "806000";
const HEADER_FILL = "BDD7EE";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "9CC3E5" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER };

function hCell(text) {
  return new TableCell({
    shading: { fill: HEADER_FILL },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: TITLE_COLOR, size: 18 })] })],
  });
}
function vCell(text, opts = {}) {
  return new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ children: [new TextRun({ text })] })], ...opts });
}
function lvRow(label, value) {
  return new TableRow({ children: [hCell(label), vCell(value, { columnSpan: 5 })] });
}

const meta = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: BORDERS,
  rows: [
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 4,
          verticalMerge: VerticalMergeType.RESTART,
          shading: { fill: HEADER_FILL },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "CONTROL DE INCIDENCIAS CCMGC", bold: true, color: TITLE_COLOR, size: 28 })],
            }),
          ],
        }),
        hCell("N.º DE INFORME"),
        vCell(sample.numero_informe),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ columnSpan: 4, verticalMerge: VerticalMergeType.CONTINUE, shading: { fill: HEADER_FILL }, children: [new Paragraph("")] }),
        hCell("FECHA Y HORA"),
        vCell(sample.fecha_hora),
      ],
    }),
    lvRow("OPERADOR", sample.operador),
    lvRow("TURNO", sample.turno),
    lvRow("OPERADORA", sample.operadora),
    lvRow("TIPO INCIDENCIA", sample.tipo_incidencia),
    new TableRow({
      children: [
        hCell("LINEA"), vCell(sample.linea),
        hCell("N.º VEHICULO"), vCell(sample.numero_vehiculo),
        hCell("ID CONDUCTOR"), vCell(sample.id_conductor),
      ],
    }),
    new TableRow({
      children: [
        hCell("SERVICIO"), vCell(sample.servicio),
        hCell("PLANIFICACIÓN"), vCell(sample.planificacion),
        hCell("INTENSIFICACIÓN"), vCell(sample.intensificacion),
      ],
    }),
  ],
});

const desc = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: BORDERS,
  rows: [
    new TableRow({
      children: [
        new TableCell({
          shading: { fill: HEADER_FILL },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "DESCRIPCIÓN DE LA INCIDENCIA", bold: true, color: TITLE_COLOR, size: 20 })],
            }),
          ],
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: sample.descripcion_incidencia })] })],
        }),
      ],
    }),
  ],
});

const doc = new Document({ sections: [{ children: [meta, desc] }] });
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(outFile, buf);
console.log(`Plantilla generada: ${outFile}`);
