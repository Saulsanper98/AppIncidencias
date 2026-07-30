import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getConductorPreventiveThreshold } from "@/lib/conductor-preventive";
import { prisma } from "@/lib/prisma";
import { canViewOperationalReports } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    if (!canViewOperationalReports(actor.role) && actor.role === "conductor") {
      return NextResponse.json({ message: "Sin permiso" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const threshold = await getConductorPreventiveThreshold();

    const cases = await prisma.conductorPreventiveCase.findMany({
      where: {
        ...(status === "abierto" || status === "en_proceso" || status === "cerrado"
          ? { status }
          : status === "abiertos"
            ? { status: { in: ["abierto", "en_proceso"] } }
            : {}),
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100,
      include: {
        conductor: { select: { id: true, name: true, operator: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({
      threshold,
      cases: cases.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        status: c.status,
        ticketCountAtOpen: c.ticketCountAtOpen,
        windowDays: c.windowDays,
        conductorId: c.conductorId,
        conductorName: c.conductor.name,
        conductorOperator: c.conductor.operator,
        assignedToUserId: c.assignedToUserId,
        assignedToUserName: c.assignedTo?.name ?? null,
        commentCount: c._count.comments,
        closedAt: c.closedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/conductor-preventive:", error);
    return NextResponse.json({ message: "No se pudieron cargar preventivos" }, { status: 500 });
  }
}
