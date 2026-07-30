import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { listConductorsForTypeahead, upsertConductorFromLabel } from "@/lib/conductors";
import { canCreateTicket } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json({ message: "Debes iniciar sesión" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const items = await listConductorsForTypeahead(q, 30);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/conductors:", error);
    return NextResponse.json({ message: "No se pudieron listar conductores" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  operator: z.string().trim().max(80).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canCreateTicket(actor.role)) {
      return NextResponse.json({ message: "Sin permiso" }, { status: 403 });
    }
    const body = createSchema.parse(await request.json());
    const created = await upsertConductorFromLabel(body.name, body.operator);
    return NextResponse.json({ conductor: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Datos inválidos", issues: error.flatten() }, { status: 400 });
    }
    console.error("POST /api/conductors:", error);
    return NextResponse.json({ message: "No se pudo crear el conductor" }, { status: 500 });
  }
}
