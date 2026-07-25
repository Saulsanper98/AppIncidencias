import { NextResponse } from "next/server";

import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { readSessionUserIdFromRequest } from "@/lib/server-session";

/**
 * Lista de usuarios activos para el selector de login.
 * Sin sesión: solo datos mínimos (sin email). Con sesión: perfil completo.
 */
export async function GET(request: Request) {
  try {
    await ensureCatalogSeeded();
    const hasSession = Boolean(readSessionUserIdFromRequest(request));

    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: hasSession
        ? {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            position: true,
          }
        : {
            id: true,
            name: true,
            role: true,
            avatarUrl: true,
            position: true,
          },
    });

    return NextResponse.json(
      { users },
      {
        headers: {
          "Cache-Control": hasSession ? "private, max-age=60" : "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Error loading users:", error);
    return NextResponse.json({ message: "No se pudieron cargar los usuarios" }, { status: 500 });
  }
}
