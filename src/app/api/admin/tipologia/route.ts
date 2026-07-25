import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { canManageCatalog } from "@/lib/rbac";
import { getTipologias, invalidateTipologiaCache } from "@/lib/tipologia-store";

const entrySchema = z.object({
  tipo: z.string().trim().min(1),
  subtipo: z.string().trim().min(1),
  subsubtipo: z.string().trim().min(1),
  dominio: z.string().trim().min(1),
  nivelImpacto: z.enum(["Alto", "Medio", "Bajo"]),
  origenTecnico: z.string().trim().min(1),
  observaciones: z.string().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const includeInactive = new URL(request.url).searchParams.get("all") === "1";
  if (includeInactive) {
    const rows = await prisma.tipologiaEntry.findMany({ orderBy: [{ sortOrder: "asc" }, { tipo: "asc" }] });
    return NextResponse.json({ entries: rows });
  }
  return NextResponse.json({ entries: await getTipologias(true) });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const row = await prisma.tipologiaEntry.create({
    data: {
      tipo: data.tipo,
      subtipo: data.subtipo,
      subsubtipo: data.subsubtipo,
      dominio: data.dominio,
      nivelImpacto: data.nivelImpacto,
      origenTecnico: data.origenTecnico,
      observaciones: data.observaciones ?? "",
      sortOrder: data.sortOrder ?? 0,
      active: data.active ?? true,
    },
  });
  invalidateTipologiaCache();
  return NextResponse.json({ entry: row }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId || !canManageCatalog(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { id?: string; active?: boolean } | null;
  if (!body?.id) {
    return NextResponse.json({ message: "Falta id" }, { status: 400 });
  }
  const row = await prisma.tipologiaEntry.update({
    where: { id: body.id },
    data: { ...(body.active !== undefined ? { active: body.active } : {}) },
  });
  invalidateTipologiaCache();
  return NextResponse.json({ entry: row });
}
