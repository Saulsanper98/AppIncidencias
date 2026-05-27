import { cookies } from "next/headers";

import type { UserRole } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { parseUserRole } from "@/lib/rbac";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

/**
 * `x-user-id` / `x-user-role` solo se aceptan en desarrollo (o tests) porque
 * permiten a cualquier cliente suplantar a un usuario. En producción se
 * ignoran siempre, incluso si llegan desde la propia red interna.
 */
function allowDevHeaderSpoofing(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

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
  // Cookie firmada con HMAC. Es la única vía válida en producción.
  let cookieToken: string | null = null;
  try {
    const store = await cookies();
    cookieToken = store.get(SESSION_COOKIE_NAME)?.value ?? null;
  } catch {
    /* cookies() solo está disponible en App Router / Route Handlers */
  }
  if (!cookieToken) {
    cookieToken = readSessionUserIdFromCookieHeader(request.headers.get("cookie"));
  }
  const cookieUserId = verifySessionToken(cookieToken);

  // Header `x-user-id`: solo en desarrollo, para que el flujo legacy del
  // selector dev y los tests de Playwright sigan funcionando.
  const headerUserId = allowDevHeaderSpoofing()
    ? request.headers.get("x-user-id")?.trim() || null
    : null;

  const userId = cookieUserId || headerUserId;
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

  const fallbackRole = allowDevHeaderSpoofing()
    ? parseUserRole(request.headers.get("x-user-role"))
    : ("conductor" as UserRole);
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
