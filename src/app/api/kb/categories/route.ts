/**
 * API de categorías de la base de conocimiento.
 *
 *   GET    /api/kb/categories            -> lista con contador de artículos publicados
 *   POST   /api/kb/categories            -> crear (canManageKnowledge)
 *
 * Operaciones por id en /api/kb/categories/[categoryId].
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { generateUniqueSlug, slugify } from "@/lib/kb-slug";
import { prisma } from "@/lib/prisma";
import { canManageKnowledge } from "@/lib/rbac";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).optional(),
  icon: z.string().trim().max(40).optional(),
  color: z.string().trim().max(20).optional(),
  order: z.number().int().min(0).max(999).optional(),
});

export async function GET() {
  try {
    const cats = await prisma.kbCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { articles: { where: { status: "publicado" } } },
        },
      },
    });
    return NextResponse.json({
      categories: cats.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        color: c.color,
        order: c.order,
        articleCount: c._count.articles,
      })),
    });
  } catch (error) {
    console.error("Error loading KB categories:", error);
    return NextResponse.json({ message: "No se pudo cargar las categorías" }, { status: 500 });
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
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }
    const slug = await generateUniqueSlug(
      slugify(parsed.data.name),
      async (s) => (await prisma.kbCategory.count({ where: { slug: s } })) > 0,
    );
    const created = await prisma.kbCategory.create({
      data: {
        slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        icon: parsed.data.icon ?? null,
        color: parsed.data.color ?? null,
        order: parsed.data.order ?? 0,
      },
    });
    return NextResponse.json({ category: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating KB category:", error);
    return NextResponse.json({ message: "No se pudo crear la categoría" }, { status: 500 });
  }
}
