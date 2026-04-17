import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/session";

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const { pathname } = request.nextUrl;

  const isProtectedPage =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/tickets") ||
    pathname.startsWith("/dashboards") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/mapa");
  const isAdminPage = pathname.startsWith("/admin");
  const isProtectedApi =
    pathname.startsWith("/api/tickets") ||
    pathname.startsWith("/api/map") ||
    pathname.startsWith("/api/audit") ||
    pathname.startsWith("/api/users/manage") ||
    pathname.startsWith("/api/maintenance");

  if ((isProtectedPage || isAdminPage || isProtectedApi) && !sessionCookie) {
    if (isProtectedApi) {
      return NextResponse.json({ message: "Sesion requerida" }, { status: 401 });
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("auth", "required");
    const returnTo = `${pathname}${request.nextUrl.search}`;
    redirectUrl.searchParams.set("next", returnTo);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/tickets/:path*",
    "/dashboard/:path*",
    "/dashboards/:path*",
    "/inventory/:path*",
    "/mapa",
    "/mapa/:path*",
    "/admin/:path*",
    "/api/tickets/:path*",
    "/api/map",
    "/api/map/:path*",
    "/api/audit/:path*",
    "/api/users/manage/:path*",
    "/api/maintenance/:path*",
  ],
};
