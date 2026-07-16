import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { commitBusImport, parseBusImportBuffer } from "@/lib/catalog-import";
import { canManageCatalog } from "@/lib/rbac";

export const runtime = "nodejs";
// 8 MB es más que de sobra para catálogos de buses; protege contra subidas
// accidentales enormes.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Importa buses en lote desde un archivo Excel/CSV.
 *
 * Query param `dryRun=1` → devuelve preview sin escribir nada.
 * Sin dryRun → escribe en base de datos y devuelve resumen.
 */
export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json(
        { message: "Sin permisos para gestionar catálogo" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "1";

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { message: "Adjunta un archivo en el campo 'file' (.xlsx, .xls o .csv)." },
        { status: 400 },
      );
    }
    if (file.size <= 0) {
      return NextResponse.json({ message: "El archivo está vacío." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { message: `El archivo supera ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = await parseBusImportBuffer(buffer);
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "No se pudo leer el archivo." },
        { status: 400 },
      );
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        totalRows: parsed.totalRows,
        validRows: parsed.rows.length,
        // Limitamos el preview que mandamos al cliente.
        preview: parsed.rows.slice(0, 30),
        errors: parsed.errors,
      });
    }

    const commit = await commitBusImport(parsed.rows);

    await writeAuditEvent({
      userId: actor.userId,
      action: "catalog.import_buses",
      detail: `Importación masiva de buses: ${commit.created} creados, ${commit.skippedExisting} ya existentes, ${commit.errors.length + parsed.errors.length} con error`,
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      totalRows: parsed.totalRows,
      created: commit.created,
      skippedExisting: commit.skippedExisting,
      // Combinamos errores de parseo y de escritura para una vista unificada.
      errors: [...parsed.errors, ...commit.errors],
    });
  } catch (error) {
    console.error("Error importing buses:", error);
    return NextResponse.json(
      { message: "No se pudo procesar la importación." },
      { status: 500 },
    );
  }
}
