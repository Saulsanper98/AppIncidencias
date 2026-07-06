import TicketDetailPageClient from "./ticket-detail-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  await requireActiveUser(`/tickets/${ticketId}`);
  return <TicketDetailPageClient />;
}
