/**
 * Genera un borrador de Announcement (kind=novedad) leyendo `git log` del
 * servidor. Restringido al email del propietario de la app: solo
 * `saul@movilidadgc.org` puede ejecutarlo. No persiste nada en base de datos;
 * solo devuelve un draft que el cliente abrirá en el editor para revisar.
 *
 *   GET /api/announcements/auto-draft
 *     [?days=N]   → fuerza la ventana a los últimos N días (override del
 *                   cálculo automático basado en el último announcement
 *                   "novedad" publicado).
 *
 *   Respuesta: { title, bodyMd, commits, since, repoCwd }
 */

import { NextResponse } from "next/server";

import { buildChangelogDraftFromGit } from "@/lib/changelog-from-git";
import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

/** Email único autorizado para usar el generador automático. */
const ALLOWED_EMAIL = "saul@movilidadgc.org";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  // Verificamos email exacto. `resolveRequestActor` no selecciona email, así
  // que lo pedimos a la BD aquí (consulta barata, va por PK).
  const me = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { email: true },
  });
  if (!me || me.email.toLowerCase() !== ALLOWED_EMAIL) {
    return NextResponse.json(
      { message: "Generación automática reservada al propietario de la app." },
      { status: 403 },
    );
  }

  try {
    const url = new URL(request.url);
    const daysParam = url.searchParams.get("days");
    let since: Date | null = null;

    if (daysParam) {
      const days = Math.max(1, Math.min(90, Number(daysParam) || 14));
      since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    } else {
      // Por defecto: desde el createdAt del último Announcement kind=novedad
      // publicado. Si no hay ninguno, el helper usará 14 días.
      const last = await prisma.announcement.findFirst({
        where: { kind: "novedad", status: "publicado" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (last) since = last.createdAt;
    }

    const draft = await buildChangelogDraftFromGit({ since });
    return NextResponse.json(draft);
  } catch (error) {
    console.error("Error building changelog draft:", error);
    return NextResponse.json(
      { message: "No se pudo generar el borrador automático." },
      { status: 500 },
    );
  }
}
