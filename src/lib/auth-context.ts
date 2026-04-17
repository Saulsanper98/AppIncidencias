import { cookies } from "next/headers";

import type { UserRole } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { parseUserRole } from "@/lib/rbac";
import { SESSION_COOKIE_NAME } from "@/lib/session";

function readSessionUserIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((item) => item.trim());
  const sessionCookie = parts.find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) return null;
  const value = sessionCookie.slice(SESSION_COOKIE_NAME.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
export type RequestActor = {
  userId: string | null;
  role: UserRole;
  displayName: string;
};

export async function resolveRequestActor(request: Request): Promise<RequestActor> {
  const headerUserId = request.headers.get("x-user-id")?.trim() || null;

  let cookieUserId: string | null = null;
  try {
    const store = await cookies();
    const fromStore = store.get(SESSION_COOKIE_NAME)?.value;
    if (fromStore) cookieUserId = fromStore;
  } catch {
    /* cookies() solo en App Router / Route Handlers */
  }
  if (!cookieUserId) {
    cookieUserId = readSessionUserIdFromCookieHeader(request.headers.get("cookie"));
  }

  const userId = headerUserId || cookieUserId;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, isActive: true },
    });
    if (user && user.isActive) {
      return {
        userId: user.id,
        role: user.role,
        displayName: user.name,
      };
    }
  }

  const fallbackRole = parseUserRole(request.headers.get("x-user-role"));
  return {
    userId: null,
    role: fallbackRole,
    displayName: "Usuario invitado",
  };
}

export async function writeAuditEvent(input: {
  userId?: string | null;
  ticketId?: string | null;
  action: string;
  detail?: string;
}) {
  await prisma.auditEvent.create({
    data: {
      userId: input.userId ?? null,
      ticketId: input.ticketId ?? null,
      action: input.action,
      detail: input.detail,
    },
  });
}
