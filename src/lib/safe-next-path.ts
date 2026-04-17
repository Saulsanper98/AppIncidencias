const ALLOWED_PREFIXES = ["/dashboard", "/tickets", "/inventory", "/dashboards", "/admin"] as const;

/** Evita redirecciones abiertas: solo rutas internas permitidas. */
export function safeInternalNextPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (s.length > 512) return null;
  const [pathPart] = s.split("?");
  if (pathPart === "/login") return null;
  const ok = ALLOWED_PREFIXES.some((p) => pathPart === p || pathPart.startsWith(`${p}/`));
  if (!ok) return null;
  return s;
}
