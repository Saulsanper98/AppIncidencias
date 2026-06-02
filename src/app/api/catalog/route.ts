import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";
import { TIPOLOGIA_CSV } from "@/lib/tipologia";

const createBusSchema = z.object({
  id: z.string().trim().min(3),
  operator: z.string().trim().min(2),
  municipio: z.string().trim().min(2),
  lineas: z.array(z.string().trim().min(1)).min(1),
});

const updateBusSchema = z.object({
  id: z.string().trim().min(1),
  /**
   * Si se indica y es distinto de `id`, se renombra el bus (propaga el
   * cambio a `Asset.busId`, `Ticket.busId` y `PreventiveTask.busId`
   * dentro de una transacción). Permitir cambiar el "nombre" del bus
   * es importante porque la flota a veces redenomina vehículos.
   */
  newId: z.string().trim().min(3).max(64).optional(),
  operator: z.string().trim().min(2).optional(),
  municipio: z.string().trim().min(2).optional(),
  // En PATCH aceptamos lista vacía: un bus puede quedarse temporalmente
  // sin líneas asignadas (p. ej. en mantenimiento o reserva). El POST
  // sigue exigiendo ≥1 para no crear buses huérfanos por accidente.
  lineas: z.array(z.string().trim().min(1)).optional(),
});

export async function GET() {
  try {
    await ensureCatalogSeeded();

    const buses = await prisma.bus.findMany({
      include: {
        assets: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    return NextResponse.json({
      buses: buses.map((bus) => ({
        id: bus.id,
        operator: bus.operator,
        municipio: bus.municipio,
        lineas: bus.lineas.split(",").filter(Boolean),
        assets: bus.assets.map((asset) => ({
          id: asset.id,
          type: asset.type,
          serialNumber: asset.serialNumber,
          slaMinutes: asset.slaMinutes ?? null,
        })),
      })),
      tipologias: TIPOLOGIA_CSV,
    });
  } catch (error) {
    console.error("Error loading catalog:", error);
    return NextResponse.json({ message: "No se pudo cargar el catalogo" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para gestionar catálogo" }, { status: 403 });
    }
    const payload = await request.json();
    const parsed = createBusSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }
    const data = parsed.data;
    const defaultAssetId = `${data.id}-SAE-DEFAULT`;
    const created = await prisma.bus.create({
      data: {
        id: data.id,
        operator: data.operator,
        municipio: data.municipio,
        lineas: data.lineas.join(","),
        assets: {
          create: [
            {
              id: defaultAssetId,
              type: "sae",
              serialNumber: `SN-${data.id}-01`,
            },
          ],
        },
      },
      include: { assets: true },
    });
    return NextResponse.json({ bus: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating catalog bus:", error);
    return NextResponse.json({ message: "No se pudo crear el bus" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json({ message: "Sin permisos para gestionar catálogo" }, { status: 403 });
    }
    const payload = await request.json();
    const parsed = updateBusSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }
    const data = parsed.data;

    // Si se pide renombrar el bus, lo procesamos antes del update de
    // propiedades. SQLite/Prisma no propagan UPDATE de PK por las FKs,
    // así que copiamos el bus al nuevo id, movemos las FKs (Asset /
    // Ticket / PreventiveTask) y borramos el original — todo dentro
    // de una transacción para que sea atómico.
    let effectiveId = data.id;
    let renamedFromTo: { from: string; to: string } | null = null;
    if (data.newId && data.newId !== data.id) {
      const oldId = data.id;
      const newId = data.newId;
      const conflict = await prisma.bus.findUnique({ where: { id: newId } });
      if (conflict) {
        return NextResponse.json(
          { message: `Ya existe un bus con id "${newId}".` },
          { status: 409 },
        );
      }
      const original = await prisma.bus.findUnique({ where: { id: oldId } });
      if (!original) {
        return NextResponse.json(
          { message: `No existe el bus "${oldId}".` },
          { status: 404 },
        );
      }
      await prisma.$transaction([
        prisma.bus.create({
          data: {
            id: newId,
            operator: original.operator,
            municipio: original.municipio,
            lineas: original.lineas,
          },
        }),
        prisma.asset.updateMany({
          where: { busId: oldId },
          data: { busId: newId },
        }),
        prisma.ticket.updateMany({
          where: { busId: oldId },
          data: { busId: newId },
        }),
        prisma.preventiveTask.updateMany({
          where: { busId: oldId },
          data: { busId: newId },
        }),
        prisma.bus.delete({ where: { id: oldId } }),
      ]);
      effectiveId = newId;
      renamedFromTo = { from: oldId, to: newId };
    }

    // Update de propiedades sobre el id efectivo (sea el original o el
    // recién renombrado). Sólo se actualizan los campos provistos: si
    // viene undefined, Prisma respeta el valor existente.
    const updated = await prisma.bus.update({
      where: { id: effectiveId },
      data: {
        operator: data.operator,
        municipio: data.municipio,
        lineas: data.lineas ? data.lineas.join(",") : undefined,
      },
    });
    return NextResponse.json({ bus: updated, renamed: renamedFromTo });
  } catch (error) {
    console.error("Error updating catalog bus:", error);
    return NextResponse.json({ message: "No se pudo actualizar el bus" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageCatalog(actor.role)) {
      return NextResponse.json(
        { message: "Sin permisos para gestionar el catálogo. Solo gestores pueden eliminar buses." },
        { status: 403 },
      );
    }
    if (!id) {
      return NextResponse.json({ message: "Falta id de bus" }, { status: 400 });
    }

    // Comprobación previa: tickets y mantenimientos vinculados.
    // Tickets están con onDelete: Restrict (no se pueden borrar en
    // cascada) — si hay tickets, el delete fallaría con P2003 igualmente,
    // así que adelantamos el error con info útil para el usuario.
    const [bus, ticketCount, preventiveCount, assetCount] = await Promise.all([
      prisma.bus.findUnique({ where: { id }, select: { id: true } }),
      prisma.ticket.count({ where: { busId: id } }),
      prisma.preventiveTask.count({ where: { busId: id } }),
      prisma.asset.count({ where: { busId: id } }),
    ]);
    if (!bus) {
      return NextResponse.json(
        { message: `El bus "${id}" ya no existe en el catálogo.` },
        { status: 404 },
      );
    }
    if (ticketCount > 0) {
      return NextResponse.json(
        {
          message: `No se puede eliminar el bus "${id}": tiene ${ticketCount} ticket${ticketCount === 1 ? "" : "s"} asociados. Borra o reasigna los tickets primero (o cámbiale el id si solo quieres renombrarlo).`,
          reason: "tickets_exist",
          ticketCount,
          assetCount,
          preventiveCount,
        },
        { status: 409 },
      );
    }

    // Asset y PreventiveTask cascadean (onDelete: Cascade) — al borrar
    // el bus se eliminan sus activos y tareas preventivas automáticamente.
    await prisma.bus.delete({ where: { id } });
    return NextResponse.json({
      ok: true,
      message: `Bus "${id}" eliminado.${assetCount > 0 ? ` Se borraron también ${assetCount} activo${assetCount === 1 ? "" : "s"} asociado${assetCount === 1 ? "" : "s"}.` : ""}${preventiveCount > 0 ? ` Se borraron ${preventiveCount} mantenimiento${preventiveCount === 1 ? "" : "s"} preventivo${preventiveCount === 1 ? "" : "s"}.` : ""}`,
      cascaded: { assets: assetCount, preventiveTasks: preventiveCount },
    });
  } catch (error) {
    // Prisma P2003 = foreign key constraint failed. Damos pista útil
    // (otros modelos pueden añadir FK en el futuro sin que nos demos cuenta).
    const code = (error as { code?: string })?.code;
    if (code === "P2003") {
      return NextResponse.json(
        {
          message: `No se puede eliminar el bus "${id ?? ""}": existen registros vinculados que dependen de él (foreign key). Revisa tickets, partes o mantenimientos asociados.`,
          reason: "foreign_key",
        },
        { status: 409 },
      );
    }
    console.error("Error deleting catalog bus:", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { message: `No se pudo eliminar el bus${id ? ` "${id}"` : ""}: ${detail}` },
      { status: 500 },
    );
  }
}
