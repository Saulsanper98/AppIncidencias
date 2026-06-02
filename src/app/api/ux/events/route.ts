import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { getMetricsExcludedUserIds } from "@/lib/ux-exclusions";

/**
 * Telemetría UX — ingesta de eventos del cliente en BATCH.
 *
 * El cliente acumula eventos y los envía cada N segundos (o en
 * `beforeunload`) en un único POST. Esto reduce ruido en la red y nos
 * permite procesar varios eventos con una sola query.
 *
 * Filosofía de seguridad:
 *   - No es un endpoint público: requiere sesión.
 *   - Tampoco lo bloqueamos para `isReadOnly`: las cuentas de lectura
 *     también generan métricas de uso interesantes (cuánto miran la pantalla).
 *     Por eso lo añadimos a la lista blanca de auth-context (más abajo).
 *   - Si el evento viene sin userId resuelto (cookie inválida) lo dejamos
 *     pasar pero anotando `userId: null` — sigue siendo útil para anónimos
 *     pre-login (`view_login`).
 *   - Sanitizamos: limitamos longitudes y descartamos lotes mayores de 50.
 */

const MAX_EVENTS_PER_BATCH = 50;
const MAX_PROPS_BYTES = 4_000;
const MAX_STRING_LEN = 500;

const eventSchema = z.object({
  eventName: z.string().min(1).max(80),
  sessionId: z.string().max(64).optional().nullable(),
  path: z.string().max(MAX_STRING_LEN).optional().nullable(),
  durationMs: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000).optional().nullable(),
  // Los timestamps cliente nos permiten reconstruir el orden aunque el batch
  // llegue desordenado por la red. No los guardamos por separado (el createdAt
  // del servidor manda) pero los usamos para ordenar dentro del mismo batch.
  clientTs: z.number().int().optional(),
  props: z.record(z.string(), z.unknown()).optional().nullable(),
});

const payloadSchema = z.object({
  events: z.array(eventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

function inferShiftFromDate(d: Date): "M" | "T" | "N" {
  const h = d.getHours();
  if (h >= 6 && h < 14) return "M";
  if (h >= 14 && h < 22) return "T";
  return "N";
}

function inferDeviceFromUserAgent(ua: string | null): string {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  if (/ipad|tablet/.test(u)) return "tablet";
  if (/mobile|android|iphone/.test(u)) return "mobile";
  return "desktop";
}

function safeStringifyProps(props: unknown): string | null {
  if (props === null || props === undefined) return null;
  try {
    const json = JSON.stringify(props);
    if (json.length > MAX_PROPS_BYTES) {
      return JSON.stringify({ _truncated: true, _bytes: json.length });
    }
    return json;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    const payload = await request.json().catch(() => null);
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Payload inválido", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Si el usuario está en la lista de exclusiones (propietarios,
    // cuentas de dev), descartamos todo el batch silenciosamente. No
    // queremos que su actividad sesgue las métricas pero tampoco
    // queremos romperle el cliente con un error.
    if (actor.userId) {
      const excluded = await getMetricsExcludedUserIds();
      if (excluded.has(actor.userId)) {
        return NextResponse.json({ ok: true, accepted: 0, skipped_excluded: true });
      }
    }

    const device = inferDeviceFromUserAgent(request.headers.get("user-agent"));

    // Ordenamos por clientTs ascendente (estable). Si dos llegan a la vez,
    // el orden de inserción se respeta.
    const sorted = [...parsed.data.events].sort(
      (a, b) => (a.clientTs ?? 0) - (b.clientTs ?? 0),
    );

    // Insertamos con $executeRawUnsafe en bucle (SQLite no tiene un buen
    // bulkCreate transaccional via Prisma client si el modelo se llama
    // recién migrado; raw funciona siempre).
    const now = new Date();
    for (const ev of sorted) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "UxEvent" (id, userId, userRole, eventName, sessionId, path, durationMs, shift, device, props, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        actor.userId,
        actor.userId ? actor.role : null,
        ev.eventName,
        ev.sessionId ?? null,
        ev.path ?? null,
        ev.durationMs ?? null,
        inferShiftFromDate(now),
        device,
        safeStringifyProps(ev.props),
        now.toISOString(),
      );
    }

    return NextResponse.json({ ok: true, accepted: sorted.length });
  } catch (error) {
    console.error("ux events ingest error:", error);
    // No queremos que un fallo en telemetría rompa nada en el cliente.
    // Devolvemos 204 para que el cliente no reintente eternamente.
    return new NextResponse(null, { status: 204 });
  }
}
