import type { TicketStatus } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

export async function recordTicketStatusChange(input: {
  ticketId: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedByUserId: string | null;
  changedByName: string;
  comment?: string | null;
}): Promise<void> {
  await prisma.ticketStatusChange.create({
    data: {
      ticketId: input.ticketId,
      fromStatus: input.fromStatus ?? undefined,
      toStatus: input.toStatus,
      changedByUserId: input.changedByUserId,
      changedByName: input.changedByName,
      comment: input.comment?.trim() || null,
    },
  });
}

export async function getTicketStatusHistory(ticketId: string) {
  return prisma.ticketStatusChange.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
  });
}
