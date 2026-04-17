import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export default async function Home() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });

  if (!user?.isActive) {
    redirect("/login");
  }

  redirect("/dashboard");
}
