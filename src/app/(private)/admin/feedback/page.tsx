import { MessageSquareHeart, TrendingUp, Users } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FeedbackAdminBandeja } from "@/components/feedback/FeedbackAdminBandeja";
import { KpiPill } from "@/components/ui/kpi-pill";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { canReviewFeedback } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export default async function AdminFeedbackPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive || !canReviewFeedback(user.role)) redirect("/dashboard");

  const [total, pendingCount, activeUsers] = await Promise.all([
    prisma.userFeedback.count(),
    prisma.userFeedback.count({ where: { status: "pendiente" } }),
    prisma.userFeedback.findMany({ distinct: ["userId"], select: { userId: true } }).then((r) => r.length),
  ]);

  return (
    <div className="space-y-6">
      <header className="ccmgc-hero ccmgc-stagger-in ccmgc-stagger-in-1 relative overflow-hidden rounded-2xl border border-[var(--color-border)] px-4 py-4 sm:px-6 sm:py-5">
        <div className="relative z-[1] flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--color-warning)_14%,var(--color-surface))] ring-1 ring-[color-mix(in_oklab,var(--color-warning)_28%,transparent)]">
              <MessageSquareHeart size={24} className="text-[var(--color-warning)]" />
            </div>
            <div>
              <SectionEyebrow pulse dotColor="var(--color-warning)">
                Administración · Feedback
              </SectionEyebrow>
              <h1 className="dashboard-hero-title mt-1 text-lg sm:text-xl">Feedback de usuarios</h1>
              <p className="mt-0.5 max-w-2xl text-sm text-[var(--color-text-2)]">
                Ideas, errores y mejoras reportadas. Gestiona el estado y añade notas internas.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <KpiPill
              label="Total"
              value={total}
              tone="accent"
              icon={<TrendingUp size={12} aria-hidden />}
              animateValue={false}
              compact
            />
            {pendingCount > 0 ? (
              <KpiPill
                label="Pendientes"
                value={pendingCount}
                tone="warning"
                pulse
                icon={<MessageSquareHeart size={12} aria-hidden />}
                animateValue={false}
                compact
              />
            ) : null}
            <KpiPill
              label="Autores"
              value={activeUsers}
              tone="neutral"
              icon={<Users size={12} aria-hidden />}
              animateValue={false}
              compact
            />
          </div>
        </div>
      </header>

      <FeedbackAdminBandeja />
    </div>
  );
}
