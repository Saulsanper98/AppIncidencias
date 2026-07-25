import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { UserRole } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { parseUserRole } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export type ActiveSessionUser = {
  id: string;
  role: UserRole;
  isReadOnly: boolean;
};

/** Lee userId de la cookie de sesión en un Route Handler (sin `cookies()` de Next). */
export function readSessionUserIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((item) => item.trim());
  const sessionCookie = parts.find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) return null;
  const value = sessionCookie.slice(SESSION_COOKIE_NAME.length + 1);
  try {
    return verifySessionToken(decodeURIComponent(value));
  } catch {
    return verifySessionToken(value);
  }
}

/**
 * Exige sesión activa en Server Components. Redirige a login si no hay token válido.
 */
export async function requireActiveUser(nextPath?: string): Promise<ActiveSessionUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
  if (!userId) {
    const params = new URLSearchParams({ auth: "required" });
    if (nextPath) params.set("next", nextPath);
    redirect(`/login?${params.toString()}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true, isReadOnly: true },
  });
  if (!user?.isActive) {
    redirect("/login?auth=required");
  }

  return {
    id: user.id,
    role: parseUserRole(user.role),
    isReadOnly: user.isReadOnly,
  };
}
