import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  intervalDays: z.number().int().min(1).max(365),
  templateJson: z.string().min(2),
  busId: z.string().optional(),
});

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const rows = await prisma.ticketRecurrence.findMany({
    orderBy: { nextRunAt: "asc" },
    take: 50,
  });
  return NextResponse.json({ recurrences: rows });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
  }
  const nextRunAt = new Date(Date.now() + parsed.data.intervalDays * 86_400_000);
  const row = await prisma.ticketRecurrence.create({
    data: {
      name: parsed.data.name,
      intervalDays: parsed.data.intervalDays,
      templateJson: parsed.data.templateJson,
      busId: parsed.data.busId ?? null,
      nextRunAt,
      createdByUserId: actor.userId,
    },
  });
  await writeAuditEvent({
    userId: actor.userId,
    action: "ticket_recurrence.created",
    detail: row.name,
  });
  return NextResponse.json({ recurrence: row }, { status: 201 });
}
