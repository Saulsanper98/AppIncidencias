import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/auth-context";
import { ensureCatalogSeeded } from "@/lib/catalog";
import { isDevUserSelectorEnabled } from "@/lib/dev-auth";
import { verifyPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import {
  buildSessionCookieOptions,
  buildSessionDeleteCookieOptions,
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session";

// Modo "producción" clásico: email + contraseña. Se sigue aceptando para
// scripts/curl y compatibilidad.
const passwordLoginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});

// Modo selector + contraseña: el usuario elige su nombre/avatar y escribe
// solo la contraseña. Es el flujo principal en LAN del centro de control.
const userIdPasswordLoginSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1, "Contraseña requerida"),
});

// Modo desarrollo / demo: selector de usuario sin contraseña.
const devLoginSchema = z.object({
  userId: z.string().min(1),
});

export async function GET() {
  try {
    await ensureCatalogSeeded();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    const userId = verifySessionToken(token);
    if (!userId) {
      if (token) cookieStore.delete(SESSION_COOKIE_NAME);
      return NextResponse.json({ authenticated: false });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        preferredDashboardId: true,
        mustChangePassword: true,
        avatarUrl: true,
        bannerUrl: true,
        position: true,
      },
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
        mustChangePassword: user.mustChangePassword,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        position: user.position,
      },
    });
    // Renovamos la firma (sliding session). Mismo userId pero refresca maxAge.
    response.cookies.set(SESSION_COOKIE_NAME, signSessionToken(user.id), buildSessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Error reading session:", error);
    return NextResponse.json({ message: "No se pudo leer la sesion" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCatalogSeeded();
    const payload: unknown = await request.json().catch(() => ({}));

    // ============ 1) Modo selector + contraseña (LAN producción) ============
    const userIdPasswordParsed = userIdPasswordLoginSchema.safeParse(payload);
    if (userIdPasswordParsed.success) {
      return loginByUserIdWithPassword(
        userIdPasswordParsed.data.userId,
        userIdPasswordParsed.data.password,
      );
    }

    // ============ 2) Modo desarrollo / selector dev (sin contraseña) ============
    if (isDevUserSelectorEnabled()) {
      const devParsed = devLoginSchema.safeParse(payload);
      if (devParsed.success) {
        return loginByUserId(devParsed.data.userId);
      }
    }

    // ============ 3) Modo legacy: email + contraseña (curl/scripts) ============
    const parsed = passwordLoginSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Selecciona tu usuario y escribe tu contraseña." },
        { status: 400 },
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ message: "Credenciales incorrectas." }, { status: 401 });
    }
    return loginByUserIdWithPassword(user.id, parsed.data.password);
  } catch (error) {
    console.error("Error creating session:", error);
    return NextResponse.json({ message: "No se pudo iniciar sesion" }, { status: 500 });
  }
}

async function loginByUserIdWithPassword(userId: string, plainPassword: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      preferredDashboardId: true,
      mustChangePassword: true,
      passwordHash: true,
      avatarUrl: true,
      bannerUrl: true,
      position: true,
    },
  });

  // Mensajes genéricos: no diferenciamos "no existe" de "contraseña mala".
  if (!user || !user.isActive || !user.passwordHash) {
    return NextResponse.json({ message: "Credenciales incorrectas." }, { status: 401 });
  }
  const passwordOk = await verifyPassword(plainPassword, user.passwordHash);
  if (!passwordOk) {
    await writeAuditEvent({
      userId: user.id,
      action: "auth.login_failed",
      detail: `Intento fallido para ${user.email}`,
    });
    return NextResponse.json({ message: "Credenciales incorrectas." }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAuditEvent({
    userId: user.id,
    action: "auth.login",
    detail: `${user.name} inicio sesion (${user.role})`,
  });

  const response = NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      preferredDashboardId: user.preferredDashboardId,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      position: user.position,
    },
  });
  response.cookies.set(SESSION_COOKIE_NAME, signSessionToken(user.id), buildSessionCookieOptions());
  return response;
}

async function loginByUserId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      preferredDashboardId: true,
      mustChangePassword: true,
      avatarUrl: true,
      bannerUrl: true,
      position: true,
    },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ message: "Usuario no disponible" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAuditEvent({
    userId: user.id,
    action: "auth.login_dev",
    detail: `${user.name} inicio sesion (modo selector dev, ${user.role})`,
  });

  const response = NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      preferredDashboardId: user.preferredDashboardId,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      position: user.position,
    },
  });
  response.cookies.set(SESSION_COOKIE_NAME, signSessionToken(user.id), buildSessionCookieOptions());
  return response;
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);
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
  response.cookies.set(SESSION_COOKIE_NAME, "", buildSessionDeleteCookieOptions());
  return response;
}
