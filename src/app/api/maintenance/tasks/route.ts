import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canCreatePreventiveTask } from "@/lib/rbac";

const createTaskSchema = z.object({
  busId: z.string().min(1),
  assetType: z.enum(["validadora", "sae", "router", "pantalla"]),
  reason: z.string().trim().min(8),
});

const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["pendiente", "programada", "completada", "cancelada"]).optional(),
  assignedToUserId: z.string().min(1).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
}).refine(
  (payload) =>
    payload.status !== undefined || payload.assignedToUserId !== undefined || payload.scheduledAt !== undefined,
  {
    message: "Debes enviar al menos un campo para actualizar",
  },
);

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para ver tareas preventivas" }, { status: 401 });
    }

    const tasks = await prisma.preventiveTask.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        createdByUser: {
          select: { name: true },
        },
        assignedToUser: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        id: task.id,
        busId: task.busId,
        assetType: task.assetType,
        reason: task.reason,
        status: task.status,
        assignedToUserId: task.assignedToUserId,
        assignedToUserName: task.assignedToUser?.name ?? null,
        scheduledAt: task.scheduledAt?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        creatorName: task.createdByUser?.name ?? "Sistema",
      })),
    });
  } catch (error) {
    console.error("Error loading preventive tasks:", error);
    return NextResponse.json({ message: "No se pudieron cargar tareas preventivas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para crear tareas preventivas" }, { status: 401 });
    }
    if (!canCreatePreventiveTask(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para tareas preventivas" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = createTaskSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos de tarea preventiva invalidos" }, { status: 400 });
    }

    const openTask = await prisma.preventiveTask.findFirst({
      where: {
        busId: parsed.data.busId,
        assetType: parsed.data.assetType,
        status: {
          in: ["pendiente", "programada"],
        },
      },
      select: { id: true },
    });
    if (openTask) {
      return NextResponse.json({ message: "Ya existe una tarea preventiva abierta para este activo" }, { status: 409 });
    }

    const task = await prisma.preventiveTask.create({
      data: {
        busId: parsed.data.busId,
        assetType: parsed.data.assetType,
        reason: parsed.data.reason,
        createdByUserId: actor.userId,
        status: "pendiente",
      },
      select: {
        id: true,
        busId: true,
        assetType: true,
        status: true,
      },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "maintenance.task_created",
      detail: `${actor.displayName} creo tarea preventiva ${task.id} (${task.busId} - ${task.assetType})`,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error creating preventive task:", error);
    return NextResponse.json({ message: "No se pudo crear la tarea preventiva" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion para actualizar tareas preventivas" }, { status: 401 });
    }
    if (!canCreatePreventiveTask(actor.role)) {
      return NextResponse.json({ message: "Rol sin permisos para actualizar tareas preventivas" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = updateTaskSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: parsed.error.issues[0]?.message ?? "Datos de actualización invalidos",
        },
        { status: 400 },
      );
    }

    if (parsed.data.assignedToUserId) {
      const technician = await prisma.user.findUnique({
        where: { id: parsed.data.assignedToUserId },
        select: { id: true, role: true, isActive: true },
      });
      if (!technician || !technician.isActive || technician.role !== "tecnico_campo") {
        return NextResponse.json({ message: "Solo se puede asignar a un tecnico activo" }, { status: 400 });
      }
    }

    const updated = await prisma.preventiveTask.update({
      where: { id: parsed.data.taskId },
      data: {
        status: parsed.data.status,
        assignedToUserId: parsed.data.assignedToUserId,
        scheduledAt:
          parsed.data.scheduledAt === undefined
            ? undefined
            : parsed.data.scheduledAt
              ? new Date(parsed.data.scheduledAt)
              : null,
      },
      select: { id: true, busId: true, assetType: true, status: true, assignedToUserId: true, scheduledAt: true },
    });

    await writeAuditEvent({
      userId: actor.userId,
      action: "maintenance.task_status_changed",
      detail: `${actor.displayName} actualizo tarea ${updated.id} (estado: ${updated.status})`,
    });

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error("Error updating preventive task:", error);
    return NextResponse.json({ message: "No se pudo actualizar la tarea preventiva" }, { status: 500 });
  }
}
