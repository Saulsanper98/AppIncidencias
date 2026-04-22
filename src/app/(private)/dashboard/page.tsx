import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Dashboard } from "@/components/dashboard";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
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
    <Suspense
      fallback={<div className="h-48 animate-pulse rounded-xl bg-[var(--color-surface-2)]" aria-busy />}
    >
      <Dashboard />
    </Suspense>
  );
}
