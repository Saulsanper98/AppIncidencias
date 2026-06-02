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
  /** True si la cuenta solo puede leer. Las mutaciones le devuelven 401. */
  isReadOnly: boolean;
};

/**
 * ¿La petición intenta modificar algo?
 *
 * GET/HEAD/OPTIONS son lectura pura. El resto (POST/PATCH/PUT/DELETE) se
 * consideran mutación. Excepciones explícitas (rutas que SÍ se permiten
 * a usuarios `isReadOnly` porque solo tocan datos propios del usuario, no
 * datos operativos del sistema):
 *
 *   - `/api/auth/session` — login con POST, logout con DELETE.
 *   - `/api/auth/change-password` — el usuario debe poder cambiar su clave.
 *   - `/api/account/*` — perfil propio: avatar, banner, nombre, bio, etc.
 *
 * El resto (tickets, feedback, admin, anuncios…) sigue bloqueado.
 */
const READONLY_ALLOWED_MUTATING_PATHS = [
  "/api/auth/session",
  "/api/auth/change-password",
  // Telemetría UX: las cuentas de lectura también generan eventos útiles
  // (cuánto tiempo miran la pantalla, qué filtros aplican, etc.). El endpoint
  // no muta datos operativos del sistema, solo inserta filas en UxEvent.
  "/api/ux/events",
];
const READONLY_ALLOWED_MUTATING_PREFIXES = ["/api/account/"];

function isMutatingRequest(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    if (READONLY_ALLOWED_MUTATING_PATHS.includes(path)) return false;
    if (READONLY_ALLOWED_MUTATING_PREFIXES.some((p) => path.startsWith(p))) return false;
  } catch {
    // URL malformada: la tratamos como mutación por seguridad.
  }
  return true;
}

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
    // Usamos $queryRaw para no depender de que `prisma generate` ya haya
    // expuesto el campo `isReadOnly` (recién migrado puede tardar un
    // arranque tras un deploy en Windows con la DLL bloqueada).
    type UserRow = {
      id: string;
      name: string;
      role: string;
      isActive: number | boolean;
      isReadOnly: number | boolean | null;
    };
    const rows = await prisma.$queryRawUnsafe<UserRow[]>(
      `SELECT id, name, role, isActive, isReadOnly FROM "User" WHERE id = ? LIMIT 1`,
      userId,
    );
    const user = rows[0];
    if (user && (user.isActive === true || user.isActive === 1)) {
      const isReadOnly = user.isReadOnly === true || user.isReadOnly === 1;

      // BLOQUEO CENTRAL: si la cuenta es de solo lectura y el método es
      // mutante, devolvemos como si no hubiera sesión. Los endpoints existentes
      // ya rechazan con 401 cuando `userId` viene null, sin que tengamos que
      // tocar cada uno. Mantenemos `isReadOnly: true` por si algún caller
      // quiere distinguir el motivo.
      if (isReadOnly && isMutatingRequest(request)) {
        return {
          userId: null,
          role: parseUserRole(user.role),
          displayName: user.name,
          isReadOnly: true,
        };
      }

      return {
        userId: user.id,
        role: parseUserRole(user.role),
        displayName: user.name,
        isReadOnly,
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
    isReadOnly: false,
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
