import { renderTicketEmail, sendUserEmail } from "@/lib/email-notifications";
import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push-notifications";

export async function isWatchingTicket(ticketId: string, userId: string): Promise<boolean> {
  const row = await prisma.ticketWatcher.findUnique({
    where: { ticketId_userId: { ticketId, userId } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function toggleTicketWatch(ticketId: string, userId: string): Promise<boolean> {
  const existing = await prisma.ticketWatcher.findUnique({
    where: { ticketId_userId: { ticketId, userId } },
  });
  if (existing) {
    await prisma.ticketWatcher.delete({ where: { id: existing.id } });
    return false;
  }
  await prisma.ticketWatcher.create({ data: { ticketId, userId } });
  return true;
}

export async function listTicketWatcherUserIds(ticketId: string): Promise<string[]> {
  const rows = await prisma.ticketWatcher.findMany({
    where: { ticketId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/** Notifica a watchers (excepto al actor) por email y push. */
export async function notifyTicketWatchers(input: {
  ticketId: string;
  busId: string;
  title: string;
  priority: string;
  status: string;
  headline: string;
  bodyHtml: string;
  actorUserId: string | null;
  dedupeKey: string;
}): Promise<void> {
  const watcherIds = (await listTicketWatcherUserIds(input.ticketId)).filter(
    (id) => id !== input.actorUserId,
  );
  if (watcherIds.length === 0) return;

  const { subject, html } = renderTicketEmail({
    headline: input.headline,
    body: input.bodyHtml,
    ticketId: input.ticketId,
    ticketTitle: input.title,
    busId: input.busId,
    status: input.status,
    priority: input.priority,
  });

  void sendUserEmail({
    userIds: watcherIds,
    subject,
    html,
    dedupeKey: input.dedupeKey,
  });

  void sendPushToUsers(watcherIds, {
    title: input.headline,
    body: `${input.busId} · ${input.title}`,
    url: `/tickets/${input.ticketId}`,
    tag: input.dedupeKey,
  });
}
