import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

const loginSchema = z.object({
  userId: z.string().min(1),
});

export async function GET() {
  try {
    await ensureCatalogSeeded();
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!userId) {
      return NextResponse.json({ authenticated: false });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isActive: true, preferredDashboardId: true },
    });
    if (!user || !user.isActive) {
      cookieStore.delete(SESSION_COOKIE_NAME);
      return NextResponse.json({ authenticated: false });
    }

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        preferredDashboardId: user.preferredDashboardId,
      },
    });
    response.cookies.set(SESSION_COOKIE_NAME, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Error reading session:", error);
    return NextResponse.json({ message: "No se pudo leer la sesion" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCatalogSeeded();
    const payload = await request.json();
    const parsed = loginSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ message: "Usuario invalido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, name: true, email: true, role: true, isActive: true, preferredDashboardId: true },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ message: "Usuario no disponible" }, { status: 404 });
    }

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        preferredDashboardId: user.preferredDashboardId,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    await writeAuditEvent({
      userId: user.id,
      action: "auth.login",
      detail: `${user.name} inicio sesion (${user.role})`,
    });

    return response;
  } catch (error) {
    console.error("Error creating session:", error);
    return NextResponse.json({ message: "No se pudo iniciar sesion" }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (user) {
      await writeAuditEvent({
        userId: user.id,
        action: "auth.logout",
        detail: `${user.name} cerro sesion (${user.role})`,
      });
    }
  }

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
