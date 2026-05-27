import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { canManageCatalog } from "@/lib/rbac";

export const runtime = "nodejs";

/**
 * Devuelve una plantilla XLSX bien formateada para la importación masiva de
 * Buses. Compatible con el parser `src/lib/catalog-import.ts` (cabeceras id,
 * operator, municipio, lineas). Las cabeceras llevan estilo y comentario con
 * pista para el usuario. Incluye 3 filas de ejemplo y formato de tabla.
 */
export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CCMGC Ticketing";
  workbook.created = new Date();
  workbook.title = "Plantilla import Buses";

  // ── Hoja 1: Datos ─────────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet("Buses", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "id", key: "id", width: 18 },
    { header: "operator", key: "operator", width: 24 },
    { header: "municipio", key: "municipio", width: 22 },
    { header: "lineas", key: "lineas", width: 30 },
  ];

  // Estilo de la fila de cabecera.
  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E40AF" } },
      left: { style: "thin", color: { argb: "FF1E40AF" } },
      bottom: { style: "thin", color: { argb: "FF1E40AF" } },
      right: { style: "thin", color: { argb: "FF1E40AF" } },
    };
  });

  // Comentarios de ayuda en cada cabecera.
  sheet.getCell("A1").note = {
    texts: [
      { text: "id\n", font: { bold: true } },
      { text: "Código único del bus (mín 3 caracteres). Ej: GC-120, TF-7, LP-04." },
    ],
  };
  sheet.getCell("B1").note = {
    texts: [
      { text: "operator\n", font: { bold: true } },
      { text: "Empresa operadora. Ej: Global Salcai, Titsa, Guaguas Municipales." },
    ],
  };
  sheet.getCell("C1").note = {
    texts: [
      { text: "municipio\n", font: { bold: true } },
      { text: "Municipio o cochera principal del bus." },
    ],
  };
  sheet.getCell("D1").note = {
    texts: [
      { text: "lineas\n", font: { bold: true } },
      {
        text: "Una o varias líneas que cubre el bus, separadas por coma, punto y coma o barra.\nEj: 1, 12, 26   ·   30;91   ·   GL-1/GL-15",
      },
    ],
  };

  // Filas de ejemplo (visualmente distinguibles, con fondo suave).
  const examples = [
    { id: "GC-120", operator: "Global Salcai", municipio: "Las Palmas", lineas: "1, 12, 26" },
    { id: "GC-201", operator: "Global Salcai", municipio: "Telde", lineas: "30; 91" },
    { id: "TF-077", operator: "Titsa", municipio: "Santa Cruz de Tenerife", lineas: "014, 015, 040" },
  ];
  examples.forEach((row, i) => {
    const r = sheet.addRow(row);
    r.height = 20;
    r.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      cell.font = { color: { argb: "FF334155" }, italic: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: i % 2 === 0 ? "FFF1F5F9" : "FFFFFFFF" },
      };
    });
  });

  // ── Hoja 2: Instrucciones ─────────────────────────────────────────────────
  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [{ width: 100 }];
  const lines = [
    { text: "Plantilla de importación masiva de Buses", style: { bold: true, size: 16, color: "FF1E3A8A" } },
    { text: "", style: {} },
    { text: "Cómo usarla:", style: { bold: true, size: 12 } },
    { text: "1. Ve a la pestaña «Buses» y RELLENA las filas debajo de la cabecera azul.", style: {} },
    { text: "2. Borra las 3 filas de ejemplo cuando ya no las necesites.", style: {} },
    { text: "3. Guarda el archivo (.xlsx o .csv) y súbelo desde el panel de Administración → Catálogo.", style: {} },
    { text: "", style: {} },
    { text: "Columnas:", style: { bold: true, size: 12 } },
    { text: "• id  →  código único del bus (mín 3 caracteres). Si ya existe, se omite.", style: {} },
    { text: "• operator  →  empresa operadora (Global, Titsa, Guaguas Municipales…).", style: {} },
    { text: "• municipio  →  municipio / cochera principal.", style: {} },
    { text: "• lineas  →  una o más líneas separadas por «, ; / |».  Ej:  1, 12, 26  ·  30;91", style: {} },
    { text: "", style: {} },
    { text: "Notas:", style: { bold: true, size: 12 } },
    { text: "• Acentos y mayúsculas/minúsculas en las cabeceras NO importan (operadora ≡ operator).", style: {} },
    { text: "• Las filas en blanco se ignoran. Las que tengan errores se mostrarán en la previsualización.", style: {} },
    { text: "• Al guardar, cada bus crea automáticamente un activo SAE por defecto.", style: {} },
  ];
  lines.forEach((line, i) => {
    const row = help.getRow(i + 1);
    row.getCell(1).value = line.text;
    if (line.style.bold) row.getCell(1).font = { bold: true, size: line.style.size, color: line.style.color ? { argb: line.style.color } : undefined };
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-catalogo-buses.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
