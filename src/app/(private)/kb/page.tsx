import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { KbIndex } from "@/components/kb/KbIndex";
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
      <header className="space-y-1">
        <span className="text-eyebrow">CCMGC</span>
        <h1 className="text-heading">Base de conocimiento</h1>
        <p className="text-[13px] text-[var(--color-text-3)]">
          Manuales operativos, FAQs y casos resueltos.{" "}
          <Link
            href="/feedback"
            className="text-[var(--color-accent)] underline-offset-2 hover:underline"
          >
            {"\u00BF"}Falta algo?
          </Link>
        </p>
      </header>
      <KbIndex canEdit={canManageKnowledge(user.role)} />
    </div>
  );
}
