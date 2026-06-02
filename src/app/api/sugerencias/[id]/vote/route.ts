/**
 * POST /api/sugerencias/[id]/vote
 * ───────────────────────────────────────────────────────────────────────
 * Alterna (toggle) el voto del usuario sobre una sugerencia (feedback de
 * tipo idea o mejora). Si no había votado → crea voto. Si ya había
 * votado → lo elimina. Devuelve el `voteCount` actualizado y el flag
 * `userHasVoted`.
 *
 * Restricciones de negocio:
 *  - Solo se puede votar feedback de tipo 'idea' o 'mejora'.
 *  - No se puede votar feedback con status 'descartado'.
 *
 * Validamos esas restricciones antes del upsert para no permitir votos
 * "fantasma" en items que el board no muestra.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoteRow = { id: string };
type CountRow = { count: bigint };

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const { id } = await context.params;

    const feedback = await prisma.userFeedback.findUnique({
      where: { id },
      select: { id: true, type: true, status: true },
    });
    if (!feedback) {
      return NextResponse.json({ message: "Sugerencia no encontrada" }, { status: 404 });
    }
    if (feedback.type !== "idea" && feedback.type !== "mejora") {
      return NextResponse.json(
        { message: "Solo se pueden votar ideas y mejoras" },
        { status: 400 },
      );
    }
    if (feedback.status === "descartado") {
      return NextResponse.json(
        { message: "Esta sugerencia ha sido descartada" },
        { status: 400 },
      );
    }

    // Toggle: si existe lo borro; si no, lo creo.
    const existing = await prisma.$queryRawUnsafe<VoteRow[]>(
      `SELECT id FROM FeedbackVote WHERE feedbackId = ? AND userId = ? LIMIT 1`,
      id,
      actor.userId,
    );

    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM FeedbackVote WHERE id = ?`,
        existing[0].id,
      );
    } else {
      const voteId = `vt_${id.slice(0, 6)}_${actor.userId.slice(0, 6)}_${Date.now().toString(36)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO FeedbackVote (id, feedbackId, userId, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        voteId,
        id,
        actor.userId,
      );
    }

    const countRows = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*) AS count FROM FeedbackVote WHERE feedbackId = ?`,
      id,
    );
    const voteCount = Number(countRows[0]?.count ?? 0);
    const userHasVoted = existing.length === 0;

    return NextResponse.json({ voteCount, userHasVoted });
  } catch (error) {
    console.error("Error al votar sugerencia:", error);
    return NextResponse.json({ message: "Error al votar" }, { status: 500 });
  }
}
