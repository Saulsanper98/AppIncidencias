import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { findDuplicateTicketCandidates } from "@/lib/ticket-duplicates";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const url = new URL(request.url);
  const busId = url.searchParams.get("busId") ?? "";
  const title = url.searchParams.get("title") ?? "";
  const description = url.searchParams.get("description") ?? "";
  const tipo = url.searchParams.get("tipo") ?? undefined;
  const subtipo = url.searchParams.get("subtipo") ?? undefined;

  const duplicates = await findDuplicateTicketCandidates({
    busId,
    title,
    description,
    tipo,
    subtipo,
  });
  return NextResponse.json({ duplicates });
}
