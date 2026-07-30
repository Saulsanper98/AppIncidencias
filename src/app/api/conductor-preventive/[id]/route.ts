import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canAssignTicket, canCreateTicket } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const item = await prisma.conductorPreventiveCase.findUnique({
      where: { id },
      include: {
        conductor: { select: { id: true, name: true, operator: true } },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            body: true,
            authorName: true,
            authorId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!item) {
      return NextResponse.json({ message: "Caso no encontrado" }, { status: 404 });
    }

    const since = new Date(Date.now() - item.windowDays * 24 * 60 * 60 * 1000);
    const relatedTickets = await prisma.ticket.findMany({
      where: {
        conductorId: item.conductorId,
        falloOrigen: "conductor",
        status: { not: "borrador" },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        busId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      case: {
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        ticketCountAtOpen: item.ticketCountAtOpen,
        windowDays: item.windowDays,
        conductorId: item.conductorId,
        conductorName: item.conductor.name,
        conductorOperator: item.conductor.operator,
        assignedToUserId: item.assignedToUserId,
        assignedToUserName: item.assignedTo?.name ?? null,
        createdByUserId: item.createdByUserId,
        createdByName: item.createdBy?.name ?? null,
        closedAt: item.closedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        comments: item.comments.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        })),
        relatedTickets: relatedTickets.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/conductor-preventive/[id]:", error);
    return NextResponse.json({ message: "No se pudo cargar el caso" }, { status: 500 });
  }
}

const patchSchema = z.object({
  status: z.enum(["abierto", "en_proceso", "cerrado"]).optional(),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  comment: z.string().trim().min(1).max(2000).optional(),
});

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canCreateTicket(actor.role)) {
      return NextResponse.json({ message: "Sin permiso" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.conductorPreventiveCase.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "Caso no encontrado" }, { status: 404 });
    }

    if (body.assignedToUserId && !canAssignTicket(actor.role)) {
      return NextResponse.json({ message: "Sin permiso para asignar" }, { status: 403 });
    }

    const updated = await prisma.conductorPreventiveCase.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.title ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId } : {}),
        ...(body.status === "cerrado" ? { closedAt: new Date() } : {}),
        ...(body.status && body.status !== "cerrado" ? { closedAt: null } : {}),
      },
    });

    if (body.comment?.trim()) {
      await prisma.conductorPreventiveComment.create({
        data: {
          caseId: id,
          body: body.comment.trim(),
          authorId: actor.userId,
          authorName: actor.displayName,
        },
      });
    }

    await writeAuditEvent({
      action: "conductor_preventive_update",
      detail: `Caso ${id} actualizado (${body.status ?? "campos"}).`,
      userId: actor.userId,
    });

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Datos inválidos", issues: error.flatten() }, { status: 400 });
    }
    console.error("PATCH /api/conductor-preventive/[id]:", error);
    return NextResponse.json({ message: "No se pudo actualizar el caso" }, { status: 500 });
  }
}
