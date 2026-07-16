import { NextResponse, type NextRequest } from "next/server";

import { isSessionTokenShape, SESSION_COOKIE_NAME } from "@/lib/session-edge";

const PUBLIC_PAGE_PATHS = new Set(["/login", "/offline"]);

function isPublicPage(pathname: string): boolean {
  if (pathname === "/") return true;
  if (PUBLIC_PAGE_PATHS.has(pathname)) return true;
  for (const prefix of PUBLIC_PAGE_PATHS) {
    if (pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/**
 * APIs accesibles sin cookie de sesión.
 * El resto de `/api/*` exige cookie (la validez HMAC la confirma cada handler).
 */
function isPublicApi(pathname: string, method: string): boolean {
  if (pathname === "/api/auth/session") return true;
  if (pathname === "/api/users" && method === "GET") return true;
  if (pathname === "/api/tickets/from-email" && method === "POST") return true;
  if (pathname.startsWith("/api/bi/")) return true;
  return false;
}

function requiresSession(pathname: string, method: string): boolean {
  if (pathname.startsWith("/uploads/")) return true;
  if (pathname.startsWith("/api/")) {
    return !isPublicApi(pathname, method);
  }
  return !isPublicPage(pathname);
}

function hasSessionCookieShape(request: NextRequest): boolean {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return isSessionTokenShape(raw);
}

/**
 * Gate Edge: exige cookie con forma `v1.*.*` (no basura).
 * HMAC completo lo validan handlers Node / `requireActiveUser`.
 * `/uploads/*` se reescribe a proxy autenticado.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (pathname.startsWith("/uploads/")) {
    if (!hasSessionCookieShape(request)) {
      return new NextResponse("Sesión requerida", { status: 401 });
    }
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/api/media/uploads${pathname.slice("/uploads".length)}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  if (!requiresSession(pathname, method)) {
    return NextResponse.next();
  }

  if (hasSessionCookieShape(request)) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    return NextResponse.json({ message: "Sesión requerida" }, { status: 401 });
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.searchParams.set("auth", "required");
  const returnTo = `${pathname}${request.nextUrl.search}`;
  redirectUrl.searchParams.set("next", returnTo);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    /*
     * Incluye /uploads/* (también .jpg/.png): antes se excluían por extensión
     * y saltaban el gate. Siguen fuera _next, iconos y offline.
     */
    "/((?!_next/|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|offline).*)",
  ],
};
