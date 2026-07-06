import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/change-password-form";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

type PageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function ChangePasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    redirect("/login?auth=required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, mustChangePassword: true, isActive: true },
  });
  if (!user || !user.isActive) {
    redirect("/login?auth=required");
  }

  const nextParam = typeof params.next === "string" ? params.next : Array.isArray(params.next) ? params.next[0] : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="ccmgc-hero rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg sm:p-6">
        <SectionEyebrow pulse dotColor="var(--color-accent)" className="mb-3">
          Seguridad
        </SectionEyebrow>
        <ChangePasswordForm
          userName={user.name}
          userEmail={user.email}
          forced={user.mustChangePassword}
          nextPath={nextParam}
        />
      </div>
    </main>
  );
}
