/**
 * API de artículos de la base de conocimiento.
 *
 *   GET  /api/kb/articles?q=&category=&status=&tag=
 *   POST /api/kb/articles
 *
 * Lectura abierta a cualquier rol autenticado (devuelve solo "publicado" por
 * defecto, salvo que el actor tenga `canManageKnowledge` y use status=todos).
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { generateUniqueSlug, slugify } from "@/lib/kb-slug";
import { extractFirstImageUrl } from "@/lib/kb-media";
import { prisma } from "@/lib/prisma";
import { canManageKnowledge } from "@/lib/rbac";

const createSchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(500).optional(),
  contentMd: z.string().min(1).max(50_000),
  categoryId: z.string().trim().optional().nullable(),
  status: z.enum(["borrador", "publicado", "archivado"]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  linkedTicketIds: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

type SerializedArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: string;
  tags: string[];
  views: number;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  authorName: string | null;
  publishedAt: string | null;
  updatedAt: string;
  coverUrl: string | null;
};

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesión requerida" }, { status: 401 });
    }
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const categoryFilter = (url.searchParams.get("category") ?? "").trim();
    const tagFilter = (url.searchParams.get("tag") ?? "").trim().toLowerCase();
    const statusFilter = (url.searchParams.get("status") ?? "").trim();

    // Lectores normales solo ven publicados. Los editores pueden pedir "todos".
    const isEditor = canManageKnowledge(actor.role);
    const where: Parameters<typeof prisma.kbArticle.findMany>[0] = { where: {} };
    if (!isEditor || statusFilter !== "todos") {
      where.where = {
        ...where.where,
        status: isEditor && statusFilter ? (statusFilter as "borrador" | "publicado" | "archivado") : "publicado",
      };
    }
    if (categoryFilter) {
      where.where = { ...where.where, categoryId: categoryFilter };
    }

    const rows = await prisma.kbArticle.findMany({
      ...where,
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      include: {
        category: { select: { name: true, slug: true } },
        author: { select: { name: true } },
      },
      take: 200,
    });

    let serialized: SerializedArticle[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      status: row.status,
      tags: row.tags ? row.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      views: row.views,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      categorySlug: row.category?.slug ?? null,
      authorName: row.author?.name ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      coverUrl: extractFirstImageUrl(row.contentMd),
    }));

    if (q) {
      serialized = serialized.filter((a) => {
        const hay = [
          a.title,
          a.summary ?? "",
          a.tags.join(" "),
          a.categoryName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (tagFilter) {
      serialized = serialized.filter((a) =>
        a.tags.some((t) => t.toLowerCase() === tagFilter),
      );
    }

    return NextResponse.json({ articles: serialized });
  } catch (error) {
    console.error("Error loading KB articles:", error);
    return NextResponse.json({ message: "No se pudieron cargar los artículos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageKnowledge(actor.role)) {
      return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
    }
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;
    const slug = await generateUniqueSlug(
      slugify(data.title),
      async (s) => (await prisma.kbArticle.count({ where: { slug: s } })) > 0,
    );

    const status = data.status ?? "borrador";
    const created = await prisma.kbArticle.create({
      data: {
        slug,
        title: data.title,
        summary: data.summary ?? null,
        contentMd: data.contentMd,
        status,
        tags: (data.tags ?? []).map((t) => t.trim()).filter(Boolean).join(","),
        linkedTicketIds: (data.linkedTicketIds ?? []).join(","),
        categoryId: data.categoryId || null,
        authorId: actor.userId,
        publishedAt: status === "publicado" ? new Date() : null,
      },
    });
    return NextResponse.json({ article: { id: created.id, slug: created.slug } }, { status: 201 });
  } catch (error) {
    console.error("Error creating KB article:", error);
    return NextResponse.json({ message: "No se pudo crear el artículo" }, { status: 500 });
  }
}
