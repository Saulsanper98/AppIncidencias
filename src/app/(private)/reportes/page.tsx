import ReportesPageClient from "./reportes-page-client";
import { requireActiveUser } from "@/lib/server-session";
import { canViewOperationalReports } from "@/lib/rbac";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  const user = await requireActiveUser("/reportes");
  if (!canViewOperationalReports(user.role)) {
    redirect("/dashboard");
  }
  return <ReportesPageClient />;
}
