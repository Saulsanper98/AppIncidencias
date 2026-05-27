import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

const patchSchema = z.object({
  preferredDashboardId: z.string().min(1).nullable(),
});

export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ message: "No hay sesion" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) {
      return NextResponse.json({ message: "Usuario no disponible" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Datos invalidos" }, { status: 400 });
    }

    if (parsed.data.preferredDashboardId) {
      const dash = await prisma.customDashboard.findUnique({
        where: { id: parsed.data.preferredDashboardId },
        select: { id: true },
      });
      if (!dash) {
        return NextResponse.json({ message: "Dashboard no encontrado" }, { status: 404 });
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { preferredDashboardId: parsed.data.preferredDashboardId },
    });

    return NextResponse.json({ ok: true, preferredDashboardId: parsed.data.preferredDashboardId });
  } catch (error) {
    console.error("preferences patch:", error);
    return NextResponse.json({ message: "No se pudo guardar preferencia" }, { status: 500 });
  }
}
