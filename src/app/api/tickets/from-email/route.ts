/**
 * Endpoint webhook para crear tickets a partir de un correo electrónico.
 *
 * Pensado para integrarse con un flujo externo (Microsoft Power Automate,
 * Resend Inbound, Zapier, etc.) que monitoriza los buzones del centro de
 * control (`tecnicosistemas@movilidadgc.org`, `jefesala@movilidadgc.org`)
 * y reenvía cada correo nuevo a este endpoint.
 *
 * Seguridad:
 *  - Requiere `Authorization: Bearer <INCOMING_EMAIL_SECRET>` o
 *    `x-incoming-secret: <INCOMING_EMAIL_SECRET>` cuando la variable está
 *    definida. Si no está definida, el endpoint responde 503 (deshabilitado)
 *    para evitar abusos por defecto.
 *
 * Payload esperado (JSON):
 *  {
 *    "from": "conductor@movilidadgc.org",        // opcional
 *    "subject": "Avería bus 1234",                // obligatorio
 *    "body": "El conductor reporta que la SAE…",  // obligatorio
 *    "busId": "1234",                              // opcional; si falta se
 *                                                  // intenta detectar en subject/body
 *    "priority": "alta" | "media" | "baja"        // opcional, default "media"
 *  }
 *
 * Estrategia de parseo del bus:
 *  - Si `busId` viene en el payload se intenta directamente.
 *  - Si no, busca en `subject`/`body` un patrón "bus <id>" o "vehículo <id>"
 *    y lo intenta con varios formatos (mayúsculas, sin guiones, etc.).
 *  - Si no se identifica, devolvemos 422 para que el integrador no lo
 *    marque como procesado y un humano lo revise.
 */

import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/auth-context";
import type { TicketPriority } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { addMinutesIso } from "@/lib/ticketing";
import { publishTicketEvent } from "@/lib/tickets-events";
import { tryAutoAssignTicket } from "@/lib/ticket-auto-assign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PRIORITIES: TicketPriority[] = ["alta", "media", "baja"];

function getProvidedSecret(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-incoming-secret");
}

function pickString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function detectBusId(candidates: (string | null)[]): string | null {
  const text = candidates.filter(Boolean).join(" \n ").toLowerCase();
  // Patrones: "bus 1234", "vehículo 1234", "coche 1234", o simplemente "1234"
  // si está rodeado de espacios al inicio de subject.
  const m =
    text.match(/(?:bus|veh[ií]culo|coche)\s*[#:]?\s*(\d{2,6})/) ??
    text.match(/(\d{4})\b/);
  return m?.[1] ?? null;
}

async function getDefaultSlaMinutes(priority: TicketPriority): Promise<number> {
  try {
    const row = await prisma.slaConfig.findFirst({ where: { priority }, select: { minutes: true } });
    if (row?.minutes && row.minutes > 0) return row.minutes;
  } catch {
    /* tabla puede no existir en algunos entornos legacy */
  }
  // Defaults históricos por si no hay SlaConfig configurado.
  return priority === "alta" ? 30 : priority === "media" ? 120 : 240;
}

export async function POST(request: Request) {
  try {
    const requiredSecret = process.env.INCOMING_EMAIL_SECRET?.trim();
    if (!requiredSecret) {
      return NextResponse.json(
        { message: "Endpoint deshabilitado (defina INCOMING_EMAIL_SECRET)" },
        { status: 503 },
      );
    }
    const provided = getProvidedSecret(request);
    if (provided !== requiredSecret) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
    }

    const subject = pickString(body.subject, 160);
    const description = pickString(body.body, 4000);
    const from = pickString(body.from, 200);
    if (!subject || !description) {
      return NextResponse.json(
        { message: "Faltan campos obligatorios (subject, body)" },
        { status: 400 },
      );
    }

    const priorityRaw = pickString(body.priority, 10);
    const priority: TicketPriority =
      priorityRaw && VALID_PRIORITIES.includes(priorityRaw as TicketPriority)
        ? (priorityRaw as TicketPriority)
        : "media";

    // Detección de bus.
    const requestedBusId = pickString(body.busId, 40);
    const busIdGuess = requestedBusId ?? detectBusId([subject, description]);
    if (!busIdGuess) {
      return NextResponse.json(
        { message: "No se reconoce ningún bus en el correo" },
        { status: 422 },
      );
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busIdGuess },
      include: { assets: true },
    });
    if (!bus) {
      return NextResponse.json(
        { message: `Bus ${busIdGuess} no existe en el catálogo` },
        { status: 422 },
      );
    }
    const asset = bus.assets[0];
    if (!asset) {
      return NextResponse.json(
        { message: `Bus ${busIdGuess} no tiene activos registrados` },
        { status: 422 },
      );
    }

    const slaMinutes = await getDefaultSlaMinutes(priority);

    const created = await prisma.ticket.create({
      data: {
        busId: bus.id,
        assetId: asset.id,
        title: subject,
        description,
        status: "abierto",
        priority,
        slaDeadline: new Date(addMinutesIso(new Date(), slaMinutes)),
        conductorLabel: from ?? null,
        comments: {
          create: {
            author: from ?? "Correo entrante",
            body: `Ticket creado automáticamente desde correo${from ? ` (${from})` : ""}.`,
          },
        },
      },
    });

    await writeAuditEvent({
      userId: null,
      ticketId: created.id,
      action: "ticket.created",
      detail: `Creado desde correo (${from ?? "remitente desconocido"})`,
    });

    const auto = await tryAutoAssignTicket(created.id);
    const assignedToUserId = auto.assigned ? auto.userId : null;
    const assignedToUserName = auto.assigned ? auto.userName : null;

    publishTicketEvent("ticket_created", {
      id: created.id,
      busId: created.busId,
      status: created.status,
      priority: created.priority,
      title: created.title,
      assignedToUserId,
      assignedToUserName,
      by: from ?? "email-poller",
    });

    return NextResponse.json(
      {
        ticketId: created.id,
        busId: created.busId,
        priority: created.priority,
        slaDeadline: created.slaDeadline.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creando ticket desde email:", error);
    return NextResponse.json({ message: "No se pudo crear el ticket" }, { status: 500 });
  }
}
