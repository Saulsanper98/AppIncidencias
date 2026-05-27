import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageKnowledge } from "@/lib/rbac";

const updateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  summary: z.string().trim().max(500).nullable().optional(),
  contentMd: z.string().min(1).max(50_000).optional(),
  categoryId: z.string().trim().nullable().optional(),
  status: z.enum(["borrador", "publicado", "archivado"]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  linkedTicketIds: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

/**
 * GET /api/kb/articles/[articleId]
 *  - articleId puede ser el ID interno o el slug; probamos ambos.
 *  - Incrementa el contador de views (solo para lectores, no editores).
 */
export async function GET(request: Request, ctx: { params: Promise<{ articleId: string }> }) {
  try {
    const { articleId } = await ctx.params;
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Sesión requerida" }, { status: 401 });
    }
    const article = await prisma.kbArticle.findFirst({
      where: { OR: [{ id: articleId }, { slug: articleId }] },
      include: {
        category: { select: { id: true, slug: true, name: true } },
        author: { select: { id: true, name: true } },
      },
    });
    if (!article) {
      return NextResponse.json({ message: "Artículo no encontrado" }, { status: 404 });
    }
    const isEditor = canManageKnowledge(actor.role);
    if (article.status !== "publicado" && !isEditor) {
      return NextResponse.json({ message: "Artículo no disponible" }, { status: 404 });
    }
    if (!isEditor) {
      // Incremento "fire and forget"; no esperamos a que termine para responder.
      void prisma.kbArticle.update({
        where: { id: article.id },
        data: { views: { increment: 1 } },
      });
    }
    return NextResponse.json({
      article: {
        id: article.id,
        slug: article.slug,
        title: article.title,
        summary: article.summary,
        contentMd: article.contentMd,
        status: article.status,
        tags: article.tags ? article.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        linkedTicketIds: article.linkedTicketIds
          ? article.linkedTicketIds.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
        views: article.views,
        categoryId: article.categoryId,
        categoryName: article.category?.name ?? null,
        categorySlug: article.category?.slug ?? null,
        authorId: article.authorId,
        authorName: article.author?.name ?? null,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        createdAt: article.createdAt.toISOString(),
        updatedAt: article.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error loading KB article:", error);
    return NextResponse.json({ message: "Error al cargar artículo" }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ articleId: string }> }) {
  try {
    const { articleId } = await ctx.params;
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageKnowledge(actor.role)) {
      return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
    }
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }
    const previous = await prisma.kbArticle.findUnique({ where: { id: articleId } });
    if (!previous) {
      return NextResponse.json({ message: "Artículo no encontrado" }, { status: 404 });
    }
    const data = parsed.data;
    const nextStatus = data.status ?? previous.status;
    const publishedAt =
      data.status === "publicado" && previous.status !== "publicado"
        ? new Date()
        : data.status && data.status !== "publicado"
          ? previous.publishedAt
          : previous.publishedAt;

    const updated = await prisma.kbArticle.update({
      where: { id: articleId },
      data: {
        title: data.title ?? undefined,
        summary: data.summary === undefined ? undefined : data.summary,
        contentMd: data.contentMd ?? undefined,
        status: nextStatus,
        tags:
          data.tags === undefined
            ? undefined
            : data.tags.map((t) => t.trim()).filter(Boolean).join(","),
        linkedTicketIds:
          data.linkedTicketIds === undefined ? undefined : data.linkedTicketIds.join(","),
        categoryId: data.categoryId === undefined ? undefined : data.categoryId || null,
        publishedAt,
      },
    });
    return NextResponse.json({ article: { id: updated.id, slug: updated.slug } });
  } catch (error) {
    console.error("Error updating KB article:", error);
    return NextResponse.json({ message: "No se pudo actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ articleId: string }> },
) {
  try {
    const { articleId } = await ctx.params;
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageKnowledge(actor.role)) {
      return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
    }
    await prisma.kbArticle.delete({ where: { id: articleId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting KB article:", error);
    return NextResponse.json({ message: "No se pudo eliminar" }, { status: 500 });
  }
}
