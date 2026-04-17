import { NextResponse } from "next/server";

import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await ensureCatalogSeeded();
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return NextResponse.json(
      { users },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    console.error("Error loading users:", error);
    return NextResponse.json({ message: "No se pudieron cargar los usuarios" }, { status: 500 });
  }
}
