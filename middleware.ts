import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/session";

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
 * El resto de `/api/*` exige cookie (la validez la confirma cada handler).
 */
function isPublicApi(pathname: string, method: string): boolean {
  if (pathname === "/api/auth/session") return true;
  if (pathname === "/api/users" && method === "GET") return true;
  if (pathname === "/api/tickets/from-email" && method === "POST") return true;
  if (pathname.startsWith("/api/bi/")) return true;
  return false;
}

function requiresSession(pathname: string, method: string): boolean {
  if (pathname.startsWith("/api/")) {
    return !isPublicApi(pathname, method);
  }
  return !isPublicPage(pathname);
}

/** Sin cookie de sesión no entras. No valida el token: eso lo hace cada API / página servidor. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (!requiresSession(pathname, method)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
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
     * No interceptar estáticos de Next ni assets públicos.
     * Si el middleware redirige un chunk JS a /login, el navegador recibe
     * HTML con MIME text/html y bloquea el script (síntoma tras deploy).
     */
    "/((?!_next/|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
