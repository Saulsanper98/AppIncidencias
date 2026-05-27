/**
 * POST /api/desvios/upload-pdf
 *
 * Importa manualmente una "Circular Informativa" en PDF. Sigue el mismo flujo
 * que el poller de correo pero arrancado por un operador:
 *   1. Recibe multipart/form-data con campo "file" (PDF).
 *   2. Valida tamano y tipo.
 *   3. Extrae texto con `pdf-parse`.
 *   4. Parsea con `parsearCircularPDFTodosLosDias` (1 PDF → N dias).
 *   5. Persiste cada dia como `Desvio` con `origen = MANUAL`, `estado = PENDIENTE`.
 *   6. Guarda el PDF en `public/uploads/desvios/`.
 *   7. Emite eventos SSE `desvio_nuevo` para refrescar tabla y badge.
 *
 * Deduplicacion: si una circular con la misma `referencia` y el mismo
 * `fecha_inicio` (mismo dia) ya existe, ese dia se omite (no se duplica).
 *
 * Respuesta 201:
 *   { created: DesvioResumen[]; skipped: { referencia, fecha_inicio, motivo }[]; pdf_path: string }
 *
 * Errores:
 *   400 archivo faltante o vacio
 *   401 sin sesion
 *   403 sin permisos (canManageDesvios)
 *   413 PDF demasiado grande
 *   422 PDF no es una circular reconocible (parser lanza)
 *   500 error inesperado
 */

import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { parsearCircularPDFTodosLosDias } from "@/lib/desvios/parser";
import { saveCircularPdf } from "@/lib/desvios/pdf-storage";
import {
  extractImageText,
  extractPdfText,
  PdfTextError,
} from "@/lib/desvios/pdf-text";
import {
  createDesvioFromParsed,
  findDesviosByReferencia,
} from "@/lib/desvios/repo";
import { sseBus } from "@/lib/sse-bus";
import { calcularUrgencia } from "@/lib/desvios/urgencia";
import { canManageDesvios } from "@/lib/rbac";

export const runtime = "nodejs";
// Limite generoso: las circulares suelen pesar 200-700 KB con logos y mapas
// embebidos. 12 MB cubre incluso PDFs largos sin permitir abusos.
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json(
        { message: "Debes iniciar sesion" },
        { status: 401 },
      );
    }
    if (!canManageDesvios(actor.role)) {
      return NextResponse.json(
        { message: "Sin permisos para importar circulares" },
        { status: 403 },
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { message: "Adjunta el PDF en el campo 'file'." },
        { status: 400 },
      );
    }
    if (file.size <= 0) {
      return NextResponse.json(
        { message: "El archivo esta vacio." },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          message: `El PDF supera ${Math.round(
            MAX_UPLOAD_BYTES / (1024 * 1024),
          )} MB.`,
        },
        { status: 413 },
      );
    }
    const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
    const isImage =
      /^image\//i.test(file.type) || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name);
    if (!isPdf && !isImage) {
      return NextResponse.json(
        {
          message:
            "Solo se aceptan PDFs o imagenes (PNG/JPG). Para imagenes se usara OCR.",
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1) Extraer texto. Para PDF combinamos pdfjs-dist (Mozilla) ? pdf-parse
    //    ? OCR (Tesseract). Para imagen vamos directos a OCR.
    let texto: string;
    try {
      texto = isPdf
        ? await extractPdfText(buffer)
        : await extractImageText(buffer);
    } catch (err) {
      const detail =
        err instanceof PdfTextError ? err.message : "No se pudo leer el archivo.";
      console.warn("[desvios/upload-pdf] extraccion fallida:", detail);
      return NextResponse.json({ message: detail }, { status: 422 });
    }

    // 2) Parsear todos los dias contenidos en la circular.
    let parseds: ReturnType<typeof parsearCircularPDFTodosLosDias>;
    try {
      parseds = parsearCircularPDFTodosLosDias(texto);
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Parser desconocido.";
      return NextResponse.json(
        {
          message: `Este PDF no parece una Circular Informativa estandar: ${detail}`,
        },
        { status: 422 },
      );
    }
    if (parseds.length === 0) {
      return NextResponse.json(
        { message: "El parser no extrajo ningun dia del PDF." },
        { status: 422 },
      );
    }

    // 3) Guardar el archivo original (PDF o imagen). Usamos la referencia
    //    del primer dia y la extension acorde al tipo subido.
    const ext = isPdf
      ? "pdf"
      : (file.name.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1] ?? "png").toLowerCase();
    const { relativePath } = await saveCircularPdf(
      parseds[0].referencia,
      buffer,
      ext,
    );

    // 4) Buscar duplicados por referencia + dia.
    const existentes = await findDesviosByReferencia(parseds[0].referencia);
    const ddmm = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(d.getDate()).padStart(2, "0")}`;
    const yaImportados = new Set(existentes.map((e) => ddmm(e.fecha_inicio)));

    // 5) Crear los desvios que no existen aun.
    const created: Awaited<ReturnType<typeof createDesvioFromParsed>>[] = [];
    const skipped: {
      referencia: string;
      fecha_inicio: string;
      motivo: string;
    }[] = [];
    for (const parsed of parseds) {
      const key = ddmm(parsed.fecha_inicio);
      if (yaImportados.has(key)) {
        skipped.push({
          referencia: parsed.referencia,
          fecha_inicio: parsed.fecha_inicio.toISOString(),
          motivo: "Ya existe un desvio con esta referencia para ese dia.",
        });
        continue;
      }
      const desvio = await createDesvioFromParsed(parsed, {
        emailOrigenId: null,
        pdfPath: relativePath,
        origen: "MANUAL",
        notas: `Importado por ${actor.displayName || "usuario"} desde PDF`,
      });
      created.push(desvio);
    }

    // 6) Emitir SSE por cada nuevo.
    for (const c of created) {
      sseBus.publish("desvio_nuevo", {
        id: c.id,
        via: c.via,
        lineas: c.lineas_afectadas,
        fecha_inicio: c.fecha_inicio,
        urgencia: calcularUrgencia({
          lineas_afectadas: c.lineas_afectadas,
          fecha_inicio: c.fecha_inicio,
          fecha_fin: c.fecha_fin,
        }),
      });
    }

    // 7) Auditoria.
    if (created.length > 0) {
      await writeAuditEvent({
        userId: actor.userId,
        action: "desvio.imported_pdf",
        detail: `${created[0].referencia} (${created.length} dia${
          created.length === 1 ? "" : "s"
        })`.slice(0, 240),
      });
    }

    return NextResponse.json(
      {
        created,
        skipped,
        pdf_path: relativePath,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("desvios upload-pdf:", error);
    return NextResponse.json(
      { message: "No se pudo importar el PDF." },
      { status: 500 },
    );
  }
}
