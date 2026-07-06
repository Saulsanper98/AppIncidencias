import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountProfile } from "@/components/account-profile";
import { SectionTabs } from "@/components/ui/section-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireActiveUser("/account");

  const user = await prisma.user.findUnique({
    where: { id: session.id },
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
      isReadOnly: true,
    },
  });
  if (!user || !user.isActive) {
    redirect("/login?auth=required");
  }

  return (    <div className="flex flex-col gap-6">
      <SectionTabs preset="account" />
      <div className="-mt-2">
        <Link
          href="/feedback"
          className="text-xs font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)] hover:underline"
        >
          Ver mis envíos de feedback
        </Link>
      </div>
      <Suspense
        fallback={<Skeleton className="h-[36rem] rounded-3xl" aria-busy />}
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
            isReadOnly: user.isReadOnly,
          }}        />
      </Suspense>
    </div>
  );
}
