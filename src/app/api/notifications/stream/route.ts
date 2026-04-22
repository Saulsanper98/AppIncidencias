import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function buildNotificationPayload() {
  const now = new Date();
  const [openTickets, overdueTickets] = await Promise.all([
    prisma.ticket.count({
      where: {
        status: { in: ["abierto", "en_proceso", "esperando_repuesto"] },
      },
    }),
    prisma.ticket.count({
      where: {
        status: { in: ["abierto", "en_proceso", "esperando_repuesto"] },
        slaDeadline: { lt: now },
      },
    }),
  ]);

  return {
    openTickets,
    overdueTickets,
    unread: overdueTickets > 0 ? overdueTickets : openTickets,
    ts: new Date().toISOString(),
  };
}

export async function GET() {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
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
          return false;
        }
      };

      const send = async () => {
        if (streamClosed) return;
        try {
          const payload = await buildNotificationPayload();
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
