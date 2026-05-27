/**
 * Endpoints para gestionar tickets relacionados.
 *
 *   GET    /api/tickets/[ticketId]/relations
 *     → lista los tickets vinculados a éste (en ambas direcciones).
 *
 *   POST   /api/tickets/[ticketId]/relations
 *     body: { relatedTicketId: string, note?: string, kind?: string }
 *     → crea el vínculo (idempotente: si ya existe en cualquier dirección, devuelve 200).
 *
 *   DELETE /api/tickets/[ticketId]/relations?relatedId=<id>
 *     → elimina el vínculo (en cualquier dirección).
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

const postSchema = z.object({
  relatedTicketId: z.string().trim().min(1).max(64),
  note: z.string().trim().max(500).optional(),
  kind: z.string().trim().max(40).optional(),
});

type RawRelationRow = {
  id: string;
  kind: string;
  note: string | null;
  createdAt: Date;
  fromTicketId: string;
  toTicketId: string;
  createdByName: string | null;
  related: {
    id: string;
    title: string;
    status: string;
    priority: string;
    busId: string;
    createdAt: Date;
    updatedAt: Date;
    slaDeadline: Date;
  };
};

async function fetchRelationsRaw(ticketId: string): Promise<RawRelationRow[]> {
  const relations = await prisma.ticketRelation.findMany({
    where: {
      OR: [{ fromTicketId: ticketId }, { toTicketId: ticketId }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      fromTicket: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          busId: true,
          createdAt: true,
          updatedAt: true,
          slaDeadline: true,
        },
      },
      toTicket: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          busId: true,
          createdAt: true,
          updatedAt: true,
          slaDeadline: true,
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  return relations.map((r) => {
    const related = r.fromTicketId === ticketId ? r.toTicket : r.fromTicket;
    return {
      id: r.id,
      kind: r.kind,
      note: r.note,
      createdAt: r.createdAt,
      fromTicketId: r.fromTicketId,
      toTicketId: r.toTicketId,
      createdByName: r.createdBy?.name ?? null,
      related,
    };
  });
}

function serializeRelation(row: RawRelationRow) {
  return {
    id: row.id,
    kind: row.kind,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByName,
    related: {
      id: row.related.id,
      shortId: row.related.id.slice(-8).toUpperCase(),
      title: row.related.title,
      status: row.related.status,
      priority: row.related.priority,
      busId: row.related.busId,
      createdAt: row.related.createdAt.toISOString(),
      updatedAt: row.related.updatedAt.toISOString(),
      slaDeadline: row.related.slaDeadline.toISOString(),
    },
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { ticketId } = await context.params;

  try {
    const rows = await fetchRelationsRaw(ticketId);
    return NextResponse.json({ relations: rows.map(serializeRelation) });
  } catch (error) {
    console.error("Error loading ticket relations:", error);
    return NextResponse.json({ message: "No se pudieron cargar las relaciones" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { ticketId } = await context.params;

  try {
    const payload = await request.json().catch(() => null);
    const parsed = postSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }
    const { relatedTicketId, note, kind } = parsed.data;
    if (relatedTicketId === ticketId) {
      return NextResponse.json({ message: "No puedes relacionar un ticket consigo mismo." }, { status: 400 });
    }

    // Verificamos que ambos tickets existan.
    const [base, related] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, title: true } }),
      prisma.ticket.findUnique({ where: { id: relatedTicketId }, select: { id: true, title: true } }),
    ]);
    if (!base) {
      return NextResponse.json({ message: "El ticket actual no existe." }, { status: 404 });
    }
    if (!related) {
      return NextResponse.json({ message: "El ticket que intentas vincular no existe." }, { status: 404 });
    }

    // Idempotencia: si ya existe en cualquier dirección, no duplicamos.
    const existing = await prisma.ticketRelation.findFirst({
      where: {
        OR: [
          { fromTicketId: ticketId, toTicketId: relatedTicketId },
          { fromTicketId: relatedTicketId, toTicketId: ticketId },
        ],
      },
    });
    if (existing) {
      const rows = await fetchRelationsRaw(ticketId);
      return NextResponse.json({ ok: true, alreadyLinked: true, relations: rows.map(serializeRelation) });
    }

    await prisma.ticketRelation.create({
      data: {
        fromTicketId: ticketId,
        toTicketId: relatedTicketId,
        kind: kind && kind.length > 0 ? kind : "relacionado",
        note: note && note.length > 0 ? note : null,
        createdByUserId: actor.userId,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      ticketId,
      action: "ticket.relation_added",
      detail: `Vinculó ticket ${related.id.slice(-8).toUpperCase()} ("${related.title}") al ticket ${base.id.slice(-8).toUpperCase()}.`,
    });

    const rows = await fetchRelationsRaw(ticketId);
    return NextResponse.json({ ok: true, alreadyLinked: false, relations: rows.map(serializeRelation) }, { status: 201 });
  } catch (error) {
    console.error("Error creating ticket relation:", error);
    return NextResponse.json({ message: "No se pudo vincular el ticket" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }
  const { ticketId } = await context.params;

  try {
    const { searchParams } = new URL(request.url);
    const relatedId = searchParams.get("relatedId")?.trim();
    if (!relatedId) {
      return NextResponse.json({ message: "Falta relatedId" }, { status: 400 });
    }

    const result = await prisma.ticketRelation.deleteMany({
      where: {
        OR: [
          { fromTicketId: ticketId, toTicketId: relatedId },
          { fromTicketId: relatedId, toTicketId: ticketId },
        ],
      },
    });

    if (result.count > 0) {
      await writeAuditEvent({
        userId: actor.userId,
        ticketId,
        action: "ticket.relation_removed",
        detail: `Desvinculó ticket ${relatedId.slice(-8).toUpperCase()} del ticket ${ticketId.slice(-8).toUpperCase()}.`,
      });
    }

    return NextResponse.json({ ok: true, removed: result.count });
  } catch (error) {
    console.error("Error deleting ticket relation:", error);
    return NextResponse.json({ message: "No se pudo eliminar el vínculo" }, { status: 500 });
  }
}
