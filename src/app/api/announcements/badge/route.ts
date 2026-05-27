/**
 * Devuelve el contador de novedades / avisos no leídos por el usuario actual.
 * Usado por el badge del sidebar y por el banner global.
 *
 *   GET /api/announcements/badge
 *     → { unread, critical, byKind: { novedad, aviso } }
 */

import { NextResponse } from "next/server";

import { activeAnnouncementWhere } from "@/lib/announcements";
import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ unread: 0, critical: 0, byKind: { novedad: 0, aviso: 0 } });
  }

  try {
    const active = await prisma.announcement.findMany({
      where: activeAnnouncementWhere(),
      select: { id: true, kind: true, severity: true },
    });
    if (active.length === 0) {
      return NextResponse.json({ unread: 0, critical: 0, byKind: { novedad: 0, aviso: 0 } });
    }
    const readRows = await prisma.announcementRead.findMany({
      where: {
        userId: actor.userId,
        announcementId: { in: active.map((r) => r.id) },
      },
      select: { announcementId: true },
    });
    const readSet = new Set(readRows.map((r) => r.announcementId));

    let unread = 0;
    let critical = 0;
    let novedad = 0;
    let aviso = 0;
    for (const row of active) {
      if (readSet.has(row.id)) continue;
      unread += 1;
      if (row.severity === "critical") critical += 1;
      if (row.kind === "novedad") novedad += 1;
      if (row.kind === "aviso") aviso += 1;
    }

    return NextResponse.json({ unread, critical, byKind: { novedad, aviso } });
  } catch (error) {
    console.error("Error reading announcements badge:", error);
    return NextResponse.json({ unread: 0, critical: 0, byKind: { novedad: 0, aviso: 0 } });
  }
}
