import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { serializeBitacoraEntry } from "@/lib/bitacora-shared";
import { prisma } from "@/lib/prisma";
import type { BitacoraEntryKind } from "@prisma/client";
import { isYmd, VALID_SHIFTS } from "@/lib/shift-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindSchema = z.enum(["nota", "alerta", "pendiente"]);

const postSchema = z.object({
  shiftDate: z.string().refine(isYmd, "Fecha inválida"),
  shift: z.string().refine((v) => VALID_SHIFTS.has(v as "M" | "T" | "N"), "Turno inválido"),
  kind: kindSchema.default("nota"),
  title: z.string().trim().max(160).optional().nullable(),
  contentJson: z.unknown(),
  pinned: z.boolean().optional(),
});

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const shiftDate = searchParams.get("shiftDate")?.trim();
  const shift = searchParams.get("shift")?.trim();
  const kind = searchParams.get("kind")?.trim();
  const q = searchParams.get("q")?.trim().toLowerCase();
  const take = Math.min(100, Math.max(10, Number(searchParams.get("take") ?? 40)));

  const where: {
    shiftDate?: string;
    shift?: string;
    kind?: BitacoraEntryKind;
    OR?: { title?: { contains: string }; authorName?: { contains: string } }[];
  } = {};

  if (shiftDate && isYmd(shiftDate)) where.shiftDate = shiftDate;
  if (shift && VALID_SHIFTS.has(shift as "M" | "T" | "N")) where.shift = shift;
  const kindParsed = kind ? kindSchema.safeParse(kind) : null;
  if (kindParsed?.success) where.kind = kindParsed.data;
  if (q) {
    where.OR = [{ title: { contains: q } }, { authorName: { contains: q } }];
  }

  const rows = await prisma.bitacoraEntry.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take,
  });

  const pinned = rows.filter((r) => r.pinned);
  const timeline = rows.filter((r) => !r.pinned);

  return NextResponse.json({
    entries: rows.map(serializeBitacoraEntry),
    pinned: pinned.map(serializeBitacoraEntry),
    timeline: timeline.map(serializeBitacoraEntry),
  });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
  }

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const contentStr = JSON.stringify(data.contentJson ?? { type: "doc", content: [] });
  if (contentStr.length < 20) {
    return NextResponse.json({ message: "Escribe algo en la nota antes de publicar" }, { status: 400 });
  }

  const row = await prisma.bitacoraEntry.create({
    data: {
      shiftDate: data.shiftDate,
      shift: data.shift,
      kind: data.kind,
      title: data.title?.trim() || null,
      contentJson: contentStr,
      pinned: data.pinned ?? false,
      authorId: actor.userId,
      authorName: actor.displayName ?? actor.userId,
    },
  });

  await writeAuditEvent({
    userId: actor.userId,
    action: "bitacora.created",
    detail: `${data.shiftDate} · ${data.shift} · ${data.kind}${data.title ? ` · ${data.title.slice(0, 40)}` : ""}`,
  });

  return NextResponse.json({ entry: serializeBitacoraEntry(row) }, { status: 201 });
}
