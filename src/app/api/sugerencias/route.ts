/**
 * GET /api/sugerencias
 * ───────────────────────────────────────────────────────────────────────
 * Lista pública de feedback "votable" (ideas y mejoras) ordenada por
 * votos descendente. Sirve al board /sugerencias donde el equipo prioriza
 * lo que más valor le aporta.
 *
 * Reglas:
 *  - Solo `type IN ('idea', 'mejora')` (los errores no se votan).
 *  - Se excluyen `status = 'descartado'` (limpia el ruido).
 *  - Si `filter=mias` → solo del usuario.
 *  - Si `filter=top` → orden por votos desc (default).
 *  - Si `filter=recientes` → orden por createdAt desc.
 *  - Si `filter=implementadas` → status = 'implementado'.
 *
 * El campo `voteCount` se calcula con un LEFT JOIN agregado y
 * `userHasVoted` con una sub-consulta sobre `FeedbackVote` del usuario.
 *
 * Usamos $queryRawUnsafe para hacer el agregado en una sola consulta y
 * no depender de que el cliente de Prisma exponga el modelo recién
 * migrado (mismo patrón que en /api/feedback/mine).
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  type: string;
  category: string;
  title: string;
  description: string;
  status: string;
  urgency: string;
  currentPage: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: Date | string;
  voteCount: number | bigint;
  userVoted: number | bigint;
  attachmentCount: number | bigint;
};

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const url = new URL(request.url);
    const filter = (url.searchParams.get("filter") ?? "top").toLowerCase();
    const typeParam = (url.searchParams.get("type") ?? "").toLowerCase();
    const search = (url.searchParams.get("q") ?? "").trim();

    const whereParts: string[] = ["f.type IN ('idea', 'mejora')", "f.status <> 'descartado'"];
    const params: unknown[] = [];

    if (filter === "mias") {
      whereParts.push("f.userId = ?");
      params.push(actor.userId);
    } else if (filter === "implementadas") {
      whereParts.push("f.status = 'implementado'");
    } else if (filter === "pendientes") {
      whereParts.push("f.status IN ('pendiente', 'en_revision', 'planificado')");
    }

    if (typeParam === "idea" || typeParam === "mejora") {
      whereParts.push("f.type = ?");
      params.push(typeParam);
    }

    if (search) {
      whereParts.push("(f.title LIKE ? OR f.description LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const orderBy =
      filter === "recientes"
        ? "f.createdAt DESC"
        : filter === "implementadas"
          ? "f.updatedAt DESC"
          : "voteCount DESC, f.createdAt DESC";

    const sql = `
      SELECT
        f.id, f.type, f.category, f.title, f.description, f.status, f.urgency,
        f.currentPage, f.userId, f.userName, f.createdAt,
        (SELECT COUNT(*) FROM FeedbackVote v WHERE v.feedbackId = f.id) AS voteCount,
        (SELECT COUNT(*) FROM FeedbackVote v WHERE v.feedbackId = f.id AND v.userId = ?) AS userVoted,
        (SELECT COUNT(*) FROM FeedbackAttachment a WHERE a.feedbackId = f.id) AS attachmentCount
      FROM UserFeedback f
      WHERE ${whereParts.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT 200
    `;

    const rows = await prisma.$queryRawUnsafe<Row[]>(sql, actor.userId, ...params);

    const items = rows.map((r) => ({
      id: r.id,
      type: r.type,
      category: r.category,
      title: r.title,
      description: r.description,
      status: r.status,
      urgency: r.urgency,
      currentPage: r.currentPage,
      userId: r.userId,
      userName: r.userName,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString(),
      voteCount: Number(r.voteCount ?? 0),
      userHasVoted: Number(r.userVoted ?? 0) > 0,
      attachmentCount: Number(r.attachmentCount ?? 0),
      isMine: r.userId === actor.userId,
    }));

    // Stats globales rápidas para el header.
    type StatsRow = {
      totalIdeas: number | bigint | null;
      totalMejoras: number | bigint | null;
      totalImplementadas: number | bigint | null;
      totalPlanificadas: number | bigint | null;
    };
    const statsRows = await prisma.$queryRawUnsafe<StatsRow[]>(
      `SELECT
         SUM(CASE WHEN type = 'idea' THEN 1 ELSE 0 END) AS totalIdeas,
         SUM(CASE WHEN type = 'mejora' THEN 1 ELSE 0 END) AS totalMejoras,
         SUM(CASE WHEN status = 'implementado' THEN 1 ELSE 0 END) AS totalImplementadas,
         SUM(CASE WHEN status = 'planificado' THEN 1 ELSE 0 END) AS totalPlanificadas
       FROM UserFeedback
       WHERE type IN ('idea','mejora') AND status <> 'descartado'`,
    );
    const stats = statsRows[0] ?? {
      totalIdeas: 0,
      totalMejoras: 0,
      totalImplementadas: 0,
      totalPlanificadas: 0,
    };

    return NextResponse.json({
      items,
      stats: {
        totalIdeas: Number(stats.totalIdeas ?? 0),
        totalMejoras: Number(stats.totalMejoras ?? 0),
        totalImplementadas: Number(stats.totalImplementadas ?? 0),
        totalPlanificadas: Number(stats.totalPlanificadas ?? 0),
      },
    });
  } catch (error) {
    console.error("Error en /api/sugerencias:", error);
    return NextResponse.json({ message: "Error al cargar sugerencias" }, { status: 500 });
  }
}
