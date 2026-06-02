import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AccountProfile } from "@/components/account-profile";
import { MyMetricsCard } from "@/components/account/MyMetricsCard";
import { SectionTabs } from "@/components/ui/section-tabs";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export default async function AccountPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      bannerUrl: true,
      bio: true,
      position: true,
      phone: true,
      lastLoginAt: true,
      passwordUpdatedAt: true,
      mustChangePassword: true,
    },
  });
  if (!user || !user.isActive) {
    redirect("/login?auth=required");
  }
  // Cargamos `isReadOnly` por raw query: el cliente Prisma puede ir un build
  // detrás del schema en arranques recién migrados (Windows + DLL bloqueada).
  const readOnlyRows = await prisma.$queryRawUnsafe<
    { isReadOnly: number | boolean | null }[]
  >(`SELECT isReadOnly FROM "User" WHERE id = ? LIMIT 1`, user.id);
  const isReadOnly =
    readOnlyRows[0]?.isReadOnly === true || readOnlyRows[0]?.isReadOnly === 1;

  return (
    <div className="flex flex-col gap-6">
      <SectionTabs preset="account" />
      <Suspense
        fallback={<div className="h-[36rem] animate-pulse rounded-3xl bg-[var(--color-surface-2)]" aria-busy />}
      >
        <AccountProfile
          initialUser={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatarUrl: user.avatarUrl,
            bannerUrl: user.bannerUrl,
            bio: user.bio,
            position: user.position,
            phone: user.phone,
            lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
            passwordUpdatedAt: user.passwordUpdatedAt ? user.passwordUpdatedAt.toISOString() : null,
            mustChangePassword: user.mustChangePassword,
            isReadOnly,
          }}
        />
      </Suspense>
      <MyMetricsCard />
    </div>
  );
}
