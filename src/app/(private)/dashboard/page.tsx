import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Dashboard } from "@/components/dashboard";
import { SectionTabs } from "@/components/ui/section-tabs";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredDashboardId: true, isActive: true },
    });
    if (user?.isActive && user.preferredDashboardId) {
      redirect(`/dashboards/${user.preferredDashboardId}`);
    }
  }

  return (
    <>
      <SectionTabs preset="dashboard" />
      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-xl bg-[var(--color-surface-2)]" aria-busy />}
      >
        <Dashboard />
      </Suspense>
    </>
  );
}
