/**
 * Telemetría UX — emisión server-side.
 *
 * El cliente tiene `trackUxEvent`. Pero hay acciones que solo ocurren
 * en el servidor (resolver un ticket, asignar, error de API) y queremos
 * registrarlas también en la misma tabla `UxEvent` para verlas en el
 * panel de analítica junto al resto.
 *
 * Diseño:
 *   - `trackServerUxEvent(...)` inserta una fila con `INSERT INTO "UxEvent"`
 *     usando `$executeRawUnsafe` (mismo enfoque que el ingest del cliente).
 *   - Si `actor.userId` está en la lista de exclusiones se descarta.
 *   - NUNCA lanza: telemetría no puede romper el flujo principal.
 *   - El `path` lo derivamos de la URL del request si se proporciona;
 *     si no, se queda null.
 *   - Resoluciones de ticket: `trackTicketResolvedTelemetry` en
 *     `lib/ticket-resolution-telemetry.ts` (evento `ticket_resolved`).
 */

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { getMetricsExcludedUserIds } from "@/lib/ux-exclusions";

export type ServerUxActor = {
  userId: string | null;
  role: string | null;
};

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
    if (json.length > 4_000) {
      return JSON.stringify({ _truncated: true, _bytes: json.length });
    }
    return json;
  } catch {
    return null;
  }
}

export type ServerUxEventInput = {
  eventName: string;
  actor: ServerUxActor;
  request?: Request | null;
  /** Override del path. Si no se da, se intenta sacar del request. */
  path?: string | null;
  durationMs?: number | null;
  props?: Record<string, unknown> | null;
  sessionId?: string | null;
};

export async function trackServerUxEvent(input: ServerUxEventInput): Promise<void> {
  try {
    const { eventName, actor, request, path, durationMs, props, sessionId } = input;
    if (!eventName || eventName.length > 80) return;

    // Excluir cuentas dueño / dev.
    if (actor.userId) {
      const excluded = await getMetricsExcludedUserIds();
      if (excluded.has(actor.userId)) return;
    }

    const ua = request?.headers.get("user-agent") ?? null;
    const device = inferDeviceFromUserAgent(ua);
    const now = new Date();
    let resolvedPath: string | null = path ?? null;
    if (!resolvedPath && request) {
      try {
        const url = new URL(request.url);
        resolvedPath = url.pathname;
      } catch {
        resolvedPath = null;
      }
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "UxEvent" (id, userId, userRole, eventName, sessionId, path, durationMs, shift, device, props, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      actor.userId,
      actor.userId ? actor.role : null,
      eventName,
      sessionId ?? null,
      resolvedPath,
      durationMs ?? null,
      inferShiftFromDate(now),
      device,
      safeStringifyProps(props),
      now.toISOString(),
    );
  } catch (err) {
    console.warn("[ux] trackServerUxEvent failed:", err);
  }
}
