import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { canReviewFeedback } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  type: z.enum(["idea", "error", "mejora"]),
  category: z.enum(["interfaz", "funcionalidad", "rendimiento", "documentacion", "otro"]),
  title: z.string().min(5, "El título debe tener al menos 5 caracteres").max(150),
  description: z.string().min(15, "La descripción debe tener al menos 15 caracteres").max(2000),
  rating: z.number().int().min(1).max(5).optional(),
  urgency: z.enum(["baja", "media", "alta"]).default("media"),
  currentPage: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Datos inválidos", errors: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const { type, category, title, description, rating, urgency, currentPage } = parsed.data;

    const feedback = await prisma.userFeedback.create({
      data: {
        type,
        category,
        title: title.trim(),
        description: description.trim(),
        rating: rating ?? null,
        urgency,
        currentPage: currentPage?.trim() || null,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        status: "pendiente",
      },
    });

    return NextResponse.json({ id: feedback.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating feedback:", error);
    return NextResponse.json({ message: "No se pudo guardar el feedback" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canReviewFeedback(actor.role)) {
      return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const search = url.searchParams.get("q") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = 30;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { userName: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.userFeedback.count({ where }),
      prisma.userFeedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const stats = await prisma.userFeedback.groupBy({
      by: ["type", "status"],
      _count: { id: true },
    });

    const avgRating = await prisma.userFeedback.aggregate({
      where: { rating: { not: null } },
      _avg: { rating: true },
    });

    // Cargamos adjuntos de los feedbacks visibles. Usamos $queryRawUnsafe
    // para no depender de que el cliente Prisma exponga el modelo recién
    // migrado (puede haber un desfase tras un deploy).
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
      total,
      page,
      pages: Math.ceil(total / limit),
      stats,
      avgRating: avgRating._avg.rating,
    });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json({ message: "Error al cargar feedback" }, { status: 500 });
  }
}
