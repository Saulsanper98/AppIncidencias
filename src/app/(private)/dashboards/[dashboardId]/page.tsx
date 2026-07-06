import DashboardDetailPageClient from "./dashboard-detail-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function DashboardDetailPage({
  params,
}: {
  params: Promise<{ dashboardId: string }>;
}) {
  const { dashboardId } = await params;
  await requireActiveUser(`/dashboards/${dashboardId}`);
  return <DashboardDetailPageClient />;
}
