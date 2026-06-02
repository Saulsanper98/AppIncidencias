/**
 * Genera un borrador de Announcement (kind=novedad) leyendo `git log` del
 * servidor. Restringido al email del propietario de la app: solo
 * `saul@movilidadgc.org` puede ejecutarlo. No persiste nada en base de datos;
 * solo devuelve un draft que el cliente abrirá en el editor para revisar.
 *
 *   GET /api/announcements/auto-draft
 *     [?days=N]   → ventana de los últimos N días (1–90).
 *
 *   Si no llega `days`, el default es "HOY" (commits desde las 00:00 del
 *   día actual). Antes leía desde el último Announcement publicado, pero
 *   eso producía borradores demasiado largos cuando llevaba varios días
 *   sin publicar (cambio solicitado por el dueño de la app).
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
    let since: Date;

    if (daysParam) {
      // Ventana arbitraria solicitada por el usuario (1-90 días).
      const days = Math.max(1, Math.min(90, Number(daysParam) || 1));
      since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    } else {
      // Default: HOY → desde las 00:00 del día actual. Si el usuario no
      // ha tocado nada hoy, el borrador saldrá vacío (lo cual es la señal
      // correcta), y podrá pedir 7/14/30 días desde el selector de la UI.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      since = todayStart;
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
