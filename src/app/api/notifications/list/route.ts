import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

function hrefForAudit(row: { ticketId: string | null; action: string }): string {
  if (row.ticketId) return `/tickets/${row.ticketId}`;
  if (row.action.startsWith("ticket.")) return "/tickets";
  if (row.action.startsWith("maintenance.")) return "/tickets";
  if (row.action === "auth.login" || row.action === "auth.logout") return "/dashboard";
  return "/dashboard";
}

function labelForAudit(row: { action: string; detail: string | null }): string {
  const d = row.detail?.trim();
  if (d && d.length < 120) return d;
  switch (row.action) {
    case "ticket.created":
      return "Nuevo ticket creado";
    case "ticket.status_changed":
      return "Cambio de estado en ticket";
    case "ticket.assigned":
      return "Ticket asignado";
    case "maintenance.task_created":
      return "Tarea preventiva creada";
    case "maintenance.task_status_changed":
      return "Tarea preventiva actualizada";
    case "auth.login":
      return "Inicio de sesión";
    case "auth.logout":
      return "Cierre de sesión";
    default:
      return row.action;
  }
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesion" }, { status: 401 });
    }

    // El usuario puede haber pulsado "Limpiar" → ignoramos eventos previos.
    const me = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { notificationsClearedAt: true },
    });
    const clearedAt = me?.notificationsClearedAt ?? null;

    const events = await prisma.auditEvent.findMany({
      where: {
        AND: [
          {
            OR: [
              { ticketId: { not: null } },
              { action: { startsWith: "ticket." } },
              { action: { startsWith: "maintenance." } },
            ],
          },
          clearedAt ? { createdAt: { gt: clearedAt } } : {},
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, action: true, detail: true, ticketId: true, createdAt: true },
    });

    const items = events.map((e) => ({
      id: e.id,
      label: labelForAudit(e),
      href: hrefForAudit(e),
      createdAt: e.createdAt.toISOString(),
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("notifications list:", error);
    return NextResponse.json({ message: "No se pudieron cargar notificaciones" }, { status: 500 });
  }
}
