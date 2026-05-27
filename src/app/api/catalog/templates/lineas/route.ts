import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { canManageCatalog } from "@/lib/rbac";

export const runtime = "nodejs";

/**
 * Devuelve una plantilla XLSX bien formateada para la importación masiva de
 * Líneas (servicios). Compatible con el parser `src/lib/lineas-import.ts`.
 * Una sola columna `id`, con ejemplos y soporte para varios códigos por celda.
 */
export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CCMGC Ticketing";
  workbook.created = new Date();
  workbook.title = "Plantilla import Líneas";

  // ── Hoja 1: Datos ─────────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet("Lineas", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [{ header: "id", key: "id", width: 22 }];

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  const headerCell = sheet.getCell("A1");
  headerCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF7C3AED" },
  };
  headerCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  headerCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  headerCell.border = {
    top: { style: "thin", color: { argb: "FF6D28D9" } },
    left: { style: "thin", color: { argb: "FF6D28D9" } },
    bottom: { style: "thin", color: { argb: "FF6D28D9" } },
    right: { style: "thin", color: { argb: "FF6D28D9" } },
  };
  headerCell.note = {
    texts: [
      { text: "id\n", font: { bold: true } },
      {
        text: "Código único de la línea / servicio. Ej: GL-1, GL-30, 309.\nPuedes meter varios códigos por celda separados por «, ; / |».",
      },
    ],
  };

  const examples = ["GL-1", "GL-30", "GL-309", "GL-15, GL-16, GL-17", "TF-014"];
  examples.forEach((value, i) => {
    const row = sheet.addRow([value]);
    row.height = 20;
    const cell = row.getCell(1);
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.font = { color: { argb: "FF334155" }, italic: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: i % 2 === 0 ? "FFF5F3FF" : "FFFFFFFF" },
    };
  });

  // ── Hoja 2: Instrucciones ─────────────────────────────────────────────────
  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [{ width: 100 }];
  const lines = [
    { text: "Plantilla de importación masiva de Líneas (servicios)", style: { bold: true, size: 16, color: "FF6D28D9" } },
    { text: "", style: {} },
    { text: "Cómo usarla:", style: { bold: true, size: 12 } },
    { text: "1. Ve a la pestaña «Lineas» y escribe un código de línea por fila (debajo de la cabecera morada).", style: {} },
    { text: "2. Si quieres, puedes meter VARIAS líneas en una sola celda separadas por «, ; / |» (se desdoblan).", style: {} },
    { text: "3. Borra las filas de ejemplo cuando ya no las necesites.", style: {} },
    { text: "4. Guarda el archivo (.xlsx o .csv) y súbelo desde Administración → Catálogo → Líneas.", style: {} },
    { text: "", style: {} },
    { text: "Notas:", style: { bold: true, size: 12 } },
    { text: "• Si el archivo no tiene cabecera, también funciona: se asume que toda la columna A son códigos.", style: {} },
    { text: "• Códigos duplicados dentro del archivo se cuentan como error.", style: {} },
    { text: "• Códigos que ya existan en el catálogo se saltan sin avisar (idempotente).", style: {} },
  ];
  lines.forEach((line, i) => {
    const row = help.getRow(i + 1);
    row.getCell(1).value = line.text;
    if (line.style.bold) {
      row.getCell(1).font = {
        bold: true,
        size: line.style.size,
        color: line.style.color ? { argb: line.style.color } : undefined,
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-catalogo-lineas.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
