import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";

const postSchema = z.object({
  articleId: z.string().min(1),
  label: z.string().trim().max(120).optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  try {
    const rows = await prisma.kbDashboardShortcut.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        article: {
          select: { id: true, slug: true, title: true, summary: true, status: true },
        },
      },
    });
    const shortcuts = rows
      .filter((r) => r.article.status === "publicado")
      .map((r) => ({
        id: r.id,
        label: r.label ?? r.article.title,
        slug: r.article.slug,
        articleId: r.articleId,
        summary: r.article.summary,
      }));
    return NextResponse.json({ shortcuts });
  } catch (error) {
    console.warn("[kb/shortcuts] fallback vacío:", error);
    return NextResponse.json({ shortcuts: [] });
  }
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
  }
  const maxOrder = await prisma.kbDashboardShortcut.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.kbDashboardShortcut.create({
    data: {
      articleId: parsed.data.articleId,
      label: parsed.data.label ?? null,
      sortOrder: parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  return NextResponse.json({ shortcut: row }, { status: 201 });
}

export async function DELETE(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Falta id" }, { status: 400 });
  await prisma.kbDashboardShortcut.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
