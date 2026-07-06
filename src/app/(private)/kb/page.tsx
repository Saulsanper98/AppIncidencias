import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { KbIndex } from "@/components/kb/KbIndex";
import { KbGridSkeleton } from "@/components/ui/view-skeletons";
import { prisma } from "@/lib/prisma";
import { canManageKnowledge } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function KbHomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) redirect("/login?auth=required");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || !user.isActive) redirect("/login?auth=required");

  return (
    <div className="space-y-4">
      <Suspense fallback={<KbGridSkeleton />}>
        <KbIndex canEdit={canManageKnowledge(user.role)} />
      </Suspense>
    </div>
  );
}
