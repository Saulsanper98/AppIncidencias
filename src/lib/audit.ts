import { prisma } from "@/lib/prisma";

export async function writeAuditEvent(input: {
  userId?: string | null;
  ticketId?: string | null;
  action: string;
  detail?: string;
}) {
  await prisma.auditEvent.create({
    data: {
      userId: input.userId ?? null,
      ticketId: input.ticketId ?? null,
      action: input.action,
      detail: input.detail,
    },
  });
}
