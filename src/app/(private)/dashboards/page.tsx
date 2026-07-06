import DashboardsPageClient from "./dashboards-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  await requireActiveUser("/dashboards");
  return <DashboardsPageClient />;
}
