import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { generateUniqueSlug, slugify } from "@/lib/kb-slug";
import { prisma } from "@/lib/prisma";
import { canManageKnowledge } from "@/lib/rbac";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
  order: z.number().int().min(0).max(999).optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ categoryId: string }> },
) {
  try {
    const { categoryId } = await ctx.params;
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageKnowledge(actor.role)) {
      return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
    }
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }

    const existing = await prisma.kbCategory.findUnique({ where: { id: categoryId } });
    if (!existing) {
      return NextResponse.json({ message: "Categoría no encontrada" }, { status: 404 });
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.name && parsed.data.name !== existing.name) {
      data.slug = await generateUniqueSlug(
        slugify(parsed.data.name),
        async (s) => {
          const hit = await prisma.kbCategory.findFirst({ where: { slug: s } });
          return Boolean(hit && hit.id !== categoryId);
        },
      );
    }

    const updated = await prisma.kbCategory.update({
      where: { id: categoryId },
      data,
    });
    return NextResponse.json({ category: updated });
  } catch (error) {
    console.error("Error updating KB category:", error);
    return NextResponse.json({ message: "No se pudo actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ categoryId: string }> },
) {
  try {
    const { categoryId } = await ctx.params;
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageKnowledge(actor.role)) {
      return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
    }
    await prisma.kbCategory.delete({ where: { id: categoryId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting KB category:", error);
    return NextResponse.json({ message: "No se pudo eliminar" }, { status: 500 });
  }
}
