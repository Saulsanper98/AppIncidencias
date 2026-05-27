import { MessageSquareHeart, TrendingUp, Users } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FeedbackAdminBandeja } from "@/components/feedback/FeedbackAdminBandeja";
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

      {/* Page header */}
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5"
        style={{ background: "radial-gradient(ellipse at 85% 50%, rgba(37,99,235,0.08) 0%, transparent 55%), var(--color-surface)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-light)]">
              <MessageSquareHeart size={24} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--color-text-1)]">Feedback de usuarios</h1>
              <p className="mt-0.5 text-sm text-[var(--color-text-2)]">
                Ideas, errores y mejoras reportadas. Gestiona el estado y añade notas internas.
              </p>
            </div>
          </div>

          {/* Quick stats strip */}
          <div className="hidden shrink-0 items-center gap-5 sm:flex">
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp size={15} className="text-[var(--color-accent)]" />
              <span className="font-bold tabular-nums text-[var(--color-text-1)]">{total}</span>
              <span className="text-[var(--color-text-3)]">total</span>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#f59e0b]" />
                <span className="font-bold tabular-nums text-[#f59e0b]">{pendingCount}</span>
                <span className="text-[var(--color-text-3)]">pendientes</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Users size={15} className="text-[var(--color-text-3)]" />
              <span className="font-bold tabular-nums text-[var(--color-text-1)]">{activeUsers}</span>
              <span className="text-[var(--color-text-3)]">autores</span>
            </div>
          </div>
        </div>
      </div>

      <FeedbackAdminBandeja />
    </div>
  );
}
