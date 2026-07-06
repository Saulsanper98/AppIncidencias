import { NextResponse } from "next/server";

import { resolveRequestActor, type RequestActor } from "@/lib/auth-context";
import { readSessionUserIdFromRequest } from "@/lib/server-session";

/** Respuesta 401 estándar para handlers de API. */
export function apiUnauthorized(message = "Sesión requerida") {
  return NextResponse.json({ message }, { status: 401 });
}

/**
 * Exige cookie de sesión válida en rutas de medios (imágenes).
 * Devuelve userId o una respuesta 401.
 */
export function requireMediaSession(request: Request): string | NextResponse {
  const userId = readSessionUserIdFromRequest(request);
  if (!userId) {
    return new NextResponse("Sesión requerida", { status: 401 });
  }
  return userId;
}

export function isMediaAuthError(result: string | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Resuelve el actor de la petición y exige sesión válida (no invitado).
 * Devuelve `NextResponse` (401) o el `RequestActor` autenticado.
 */
export async function requireActor(request: Request): Promise<RequestActor | NextResponse> {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    const message = actor.isReadOnly ? "Cuenta de solo lectura" : "Sesión requerida";
    return apiUnauthorized(message);
  }
  return actor;
}

export function isApiAuthError(result: RequestActor | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
