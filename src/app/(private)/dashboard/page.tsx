import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Dashboard } from "@/components/dashboard";
import { SectionTabs } from "@/components/ui/section-tabs";
import { DashboardViewSkeleton } from "@/components/ui/view-skeletons";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireActiveUser("/dashboard");
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { preferredDashboardId: true, isActive: true },
  });
  if (user?.isActive && user.preferredDashboardId) {
    redirect(`/dashboards/${user.preferredDashboardId}`);
  }

  return (
    <>
      <SectionTabs preset="dashboard" />
      <Suspense fallback={<DashboardViewSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}
