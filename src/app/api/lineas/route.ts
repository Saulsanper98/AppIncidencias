/**
 * API del catalogo de lineas (servicios).
 *
 *   GET    /api/lineas         -> lista todas las lineas (ordenadas por id natural)
 *   POST   /api/lineas         -> crea una o varias lineas (gestor_centro_control)
 *                                 body: { id: string }      (formato legacy)
 *                                 body: { ids: string[] }   (bulk; o un string con separadores)
 *   DELETE /api/lineas?id=...  -> borra una linea (gestor_centro_control)
 *
 * Las lineas son catalogo libre: no estan ligadas rigidamente a buses, solo
 * alimentan el autocompletar del campo `servicioLabel` en el formulario de tickets.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";

const SEPARATORS = /[\s,;/|\n\r\t]+/;

/** Acepta un objeto con `id` (string) o `ids` (string[] o string con separadores). */
const createLineaSchema = z.union([
  z.object({ id: z.string().trim().min(1).max(64) }),
  z.object({ ids: z.array(z.string()).or(z.string()) }),
]);

/** Comparator que ordena GL-1, GL-2, GL-10, GL-100 en orden natural numerico
 *  (en lugar de lexicografico GL-1, GL-10, GL-100, GL-2). */
function naturalSort(a: string, b: string): number {
  const re = /(\d+)/g;
  const ap = a.split(re);
  const bp = b.split(re);
  for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
    const ai = ap[i];
    const bi = bp[i];
    if (ai === bi) continue;
    const an = Number(ai);
    const bn = Number(bi);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return ai < bi ? -1 : 1;
  }
  return ap.length - bp.length;
}

/** Normaliza una lista heterogénea de entradas en IDs únicos válidos. */
function normalizeIds(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : [input];
  const out = new Set<string>();
  for (const part of raw) {
    if (typeof part !== "string") continue;
    for (const token of part.split(SEPARATORS)) {
      const trimmed = token.trim();
      if (trimmed.length === 0) continue;
      if (trimmed.length > 64) continue;
      out.add(trimmed);
    }
  }
  return Array.from(out);
}

export async function GET() {
  try {
    const lineas = await prisma.linea.findMany({ select: { id: true } });
    const sorted = lineas.map((l) => l.id).sort(naturalSort);
    return NextResponse.json({ lineas: sorted });
  } catch (error) {
    console.error("Error loading lineas:", error);
    return NextResponse.json({ message: "No se pudo cargar el catálogo de líneas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para gestionar el catálogo" }, { status: 403 });
    }
    const payload = await request.json().catch(() => null);
    const parsed = createLineaSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }

    // Aceptamos tanto `id` legacy como `ids` (string[] o string con separadores).
    const rawInput = "id" in parsed.data ? parsed.data.id : parsed.data.ids;
    const ids = normalizeIds(rawInput);

    if (ids.length === 0) {
      return NextResponse.json({ message: "No se reconoció ningún código de línea válido." }, { status: 400 });
    }

    // Pre-cargar existentes para evitar N+1 selects.
    const existing = await prisma.linea.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((row) => row.id));

    const toCreate = ids.filter((id) => !existingSet.has(id));
    const skipped = ids.filter((id) => existingSet.has(id));

    let created: string[] = [];
    if (toCreate.length > 0) {
      // createMany no devuelve los registros en SQLite, así que insertamos uno a uno
      // pero acumulamos para responder con la lista creada. Es operación masiva esporádica
      // (panel de admin), no caliente, no necesita transacción.
      const results = await Promise.allSettled(
        toCreate.map((id) => prisma.linea.create({ data: { id }, select: { id: true } })),
      );
      created = results
        .filter((r): r is PromiseFulfilledResult<{ id: string }> => r.status === "fulfilled")
        .map((r) => r.value.id);
    }

    if (created.length > 0) {
      await writeAuditEvent({
        userId: actor.userId,
        action: "catalog.create_lineas",
        detail: `Líneas creadas (${created.length}): ${created.slice(0, 20).join(", ")}${created.length > 20 ? "…" : ""}`,
      });
    }

    // Compatibilidad con el cliente antiguo que esperaba `{linea: {id}}` cuando se mandaba un solo id.
    if ("id" in parsed.data && ids.length === 1) {
      if (created.length === 1) {
        return NextResponse.json({ linea: { id: created[0] }, created, skipped }, { status: 201 });
      }
      if (skipped.length === 1) {
        return NextResponse.json({ message: "Esa línea ya existe", skipped }, { status: 409 });
      }
    }

    return NextResponse.json(
      {
        created,
        skipped,
        requested: ids.length,
      },
      { status: created.length > 0 ? 201 : 200 },
    );
  } catch (error) {
    console.error("Error creating linea(s):", error);
    return NextResponse.json({ message: "No se pudo crear la línea" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para gestionar el catálogo" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ message: "Falta id de línea" }, { status: 400 });
    }
    await prisma.linea.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting linea:", error);
    return NextResponse.json({ message: "No se pudo eliminar la línea" }, { status: 500 });
  }
}
