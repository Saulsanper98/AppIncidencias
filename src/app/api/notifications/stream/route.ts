import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { sseBus, type SseListener } from "@/lib/sse-bus";

export const dynamic = "force-dynamic";

/**
 * Genera el payload de notificaciones que recibe la campana del header.
 *
 * El contador `unread` cuenta eventos relevantes (tickets / mantenimiento)
 * registrados después de `User.notificationsClearedAt`. Si el usuario nunca
 * ha pulsado "Limpiar", el filtro de fecha se omite y se cuentan todos.
 */
async function buildNotificationPayload(userId: string | null) {
  const now = new Date();

  // Sin sesión, el stream sigue funcionando pero sin badge.
  if (!userId) {
    return { openTickets: 0, overdueTickets: 0, unread: 0, ts: now.toISOString() };
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsClearedAt: true },
  });
  const clearedAt = me?.notificationsClearedAt ?? null;

  const [openTickets, overdueTickets, unread] = await Promise.all([
    prisma.ticket.count({
      where: { status: { in: ["abierto", "en_proceso", "esperando_repuesto"] } },
    }),
    prisma.ticket.count({
      where: {
        status: { in: ["abierto", "en_proceso", "esperando_repuesto"] },
        slaDeadline: { lt: now },
      },
    }),
    prisma.auditEvent.count({
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
    }),
  ]);

  return {
    openTickets,
    overdueTickets,
    unread,
    ts: now.toISOString(),
  };
}

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  const userId = actor.userId;
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let unsubscribeBus: (() => void) | null = null;
  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array): boolean => {
        if (streamClosed) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          streamClosed = true;
          if (intervalId != null) {
            clearInterval(intervalId);
            intervalId = null;
          }
          if (unsubscribeBus) {
            unsubscribeBus();
            unsubscribeBus = null;
          }
          return false;
        }
      };

      const send = async () => {
        if (streamClosed) return;
        try {
          const payload = await buildNotificationPayload(userId);
          if (!safeEnqueue(encoder.encode(`event: notifications\n`))) return;
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          if (streamClosed) return;
          const fallback = {
            openTickets: 0,
            overdueTickets: 0,
            unread: 0,
            ts: new Date().toISOString(),
          };
          if (!safeEnqueue(encoder.encode(`event: notifications\n`))) return;
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(fallback)}\n\n`));
        }
      };

      // Cualquier modulo del servidor (poller, route handler de confirmacion...)
      // puede publicar eventos en el bus. Aqui los reenviamos al cliente como
      // eventos SSE con el mismo `type` (`desvio_nuevo`, etc.). Cada cliente
      // recibe la copia integra para que el listener especializado decida
      // que hacer (toast, refrescar badge...).
      const busListener: SseListener = ({ type, payload }) => {
        if (streamClosed) return;
        const data = JSON.stringify({ type, payload, ts: new Date().toISOString() });
        if (!safeEnqueue(encoder.encode(`event: ${type}\n`))) return;
        safeEnqueue(encoder.encode(`data: ${data}\n\n`));
      };
      unsubscribeBus = sseBus.subscribe(busListener);

      safeEnqueue(encoder.encode(`retry: 8000\n\n`));
      void send();
      intervalId = setInterval(() => void send(), 15000);
    },
    cancel() {
      streamClosed = true;
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (unsubscribeBus) {
        unsubscribeBus();
        unsubscribeBus = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
