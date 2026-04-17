import type { UserRole } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { parseUserRole } from "@/lib/rbac";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export type RequestActor = {
  userId: string | null;
  role: UserRole;
  displayName: string;
};

export async function resolveRequestActor(request: Request): Promise<RequestActor> {
  const headerUserId = request.headers.get("x-user-id");
  const cookieUserId = (() => {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) {
      return null;
    }
    const cookies = cookieHeader.split(";").map((item) => item.trim());
    const sessionCookie = cookies.find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
    return sessionCookie ? decodeURIComponent(sessionCookie.split("=")[1] ?? "") : null;
  })();
  const userId = headerUserId ?? cookieUserId;

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
