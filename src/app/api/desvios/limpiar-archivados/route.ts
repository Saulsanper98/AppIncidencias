/**
 * POST /api/desvios/limpiar-archivados
 *
 * Borra de forma masiva todos los desvios cuyo estado sea RESUELTO o
 * CANCELADO. Esta operacion es destructiva (los registros se eliminan, no se
 * archivan) y por eso queda restringida al rol que ya puede eliminar desvios
 * individuales (gestor_centro_control).
 *
 * Tambien intenta borrar los PDFs huerfanos asociados a esos desvios para no
 * dejar binarios sin referencia en `public/uploads/desvios/`. Si alguno
 * fallara (permisos, fichero ya inexistente, etc.) se registra en consola
 * pero no se aborta la respuesta: la limpieza de BD es lo critico.
 */

import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { deleteArchivedDesvios } from "@/lib/desvios/repo";
import { canDeleteDesvio } from "@/lib/rbac";
import { sseBus } from "@/lib/sse-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
  }
  if (!canDeleteDesvio(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  try {
    const { deleted, pdfPaths } = await deleteArchivedDesvios();

    // Limpieza best-effort de los PDFs huerfanos. Se hace despues del commit
    // para no bloquear el borrado de BD si el FS da guerra (permisos NTFS
    // tipicos en NSSM, antivirus reteniendo handles, etc.).
    if (pdfPaths.length > 0) {
      await Promise.allSettled(
        pdfPaths.map(async (relative) => {
          const cleaned = relative.replace(/^[\\/]+/, "");
          const absolute = join(process.cwd(), "public", cleaned);
          try {
            await unlink(absolute);
          } catch (err) {
            // ENOENT lo damos por bueno (ya estaba limpio).
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== "ENOENT") {
              console.warn("desvios limpiar-archivados unlink:", absolute, err);
            }
          }
        }),
      );
    }

    if (deleted > 0) {
      await writeAuditEvent({
        userId: actor.userId,
        action: "desvio.bulk_archived_cleared",
        detail: `Limpieza masiva: ${deleted} desvios archivados`.slice(0, 240),
      });
      // Notificamos al resto de clientes para que recarguen la tabla y los
      // contadores del sidebar/header se actualicen en vivo.
      sseBus.publish("desvio_actualizado", { bulk: true, deleted });
    }

    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("desvios limpiar-archivados:", error);
    return NextResponse.json(
      { message: "No se pudieron limpiar los desvios archivados" },
      { status: 500 },
    );
  }
}
