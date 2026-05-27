/**
 * Vistas guardadas del listado de tickets.
 *
 * - GET → vistas del usuario actual (ordenadas por nombre).
 * - POST → crear una vista nueva con un querystring serializado.
 *
 * El querystring guardado se reaplica desde el cliente mediante
 * `useTickets().applyView(query)`, que resetea filtros y aplica los nuevos
 * antes de sincronizar la URL.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
}

/**
 * Limpia el querystring de entrada: solo deja claves conocidas para evitar
 * que se guarden parámetros arbitrarios que pudieran abusar del aplicador
 * de vistas en el cliente.
 */
function sanitizeQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.startsWith("?") ? value.slice(1) : value;
  if (raw.length === 0) return "";
  if (raw.length > 500) return null;
  const incoming = new URLSearchParams(raw);
  const allowed = ["status", "priority", "operator", "busId", "mine", "partCode"];
  const output = new URLSearchParams();
  for (const key of allowed) {
    const v = incoming.get(key);
    if (v !== null) output.set(key, v);
  }
  return output.toString();
}

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const views = await prisma.savedTicketView.findMany({
    where: { userId: actor.userId },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, query: true, scope: true, createdAt: true },
  });

  return NextResponse.json({ views });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const name = sanitizeName(body.name);
  if (!name) {
    return NextResponse.json({ message: "El nombre es obligatorio" }, { status: 400 });
  }
  const query = sanitizeQuery(body.query);
  if (query === null) {
    return NextResponse.json({ message: "Parámetros de vista no válidos" }, { status: 400 });
  }

  const created = await prisma.savedTicketView.create({
    data: {
      userId: actor.userId,
      name,
      query,
      scope: "personal",
    },
  });

  return NextResponse.json({ view: created }, { status: 201 });
}
