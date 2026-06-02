/**
 * Devuelve los feedbacks enviados por el usuario logueado, con su estado
 * actual y las notas del admin si las hay.
 *
 * Sirve para alimentar la columna "Mis envíos" de la página /feedback:
 * el usuario deja de "enviar y olvidar" y puede ver si su sugerencia
 * está pendiente, en revisión, planificada, implementada o descartada,
 * y leer la respuesta del equipo.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  try {
    const items = await prisma.userFeedback.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        category: true,
        title: true,
        description: true,
        rating: true,
        urgency: true,
        currentPage: true,
        status: true,
        adminNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Cargamos los adjuntos en paralelo con $queryRaw para no depender de
    // que el cliente de Prisma exponga el modelo (recién migrado puede
    // tardar). Devolvemos las URLs públicas listas para usar.
    const ids = items.map((i) => i.id);
    type AttRow = {
      id: string;
      feedbackId: string;
      fileName: string;
      mimeType: string | null;
      sizeBytes: number | null;
      diskFileName: string;
    };
    const attRows: AttRow[] = ids.length
      ? await prisma.$queryRawUnsafe<AttRow[]>(
          `SELECT id, feedbackId, fileName, mimeType, sizeBytes, diskFileName
             FROM FeedbackAttachment
             WHERE feedbackId IN (${ids.map(() => "?").join(",")})
             ORDER BY createdAt ASC`,
          ...ids,
        )
      : [];
    const byFid = new Map<string, AttRow[]>();
    for (const r of attRows) {
      const list = byFid.get(r.feedbackId) ?? [];
      list.push(r);
      byFid.set(r.feedbackId, list);
    }

    return NextResponse.json({
      items: items.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        attachments: (byFid.get(f.id) ?? []).map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          url: `/uploads/feedback/${f.id}/${a.diskFileName}`,
        })),
      })),
      total: items.length,
    });
  } catch (error) {
    console.error("Error fetching user feedback:", error);
    return NextResponse.json(
      { message: "No se pudieron cargar tus envíos" },
      { status: 500 },
    );
  }
}
