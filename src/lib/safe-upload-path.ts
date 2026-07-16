import { resolve, sep } from "node:path";

/**
 * Resuelve una ruta bajo `public/uploads` rechazando path traversal.
 * `segments` son trozos ya decodificados del URL (p. ej. feedback/id/file.jpg).
 */
export function resolveSafeUploadsPath(segments: string[]): string | null {
  if (!segments.length) return null;
  for (const s of segments) {
    if (!s || s === "." || s === ".." || s.includes("\0") || s.includes("/") || s.includes("\\")) {
      return null;
    }
  }
  const uploadsRoot = resolve(process.cwd(), "public", "uploads");
  const candidate = resolve(uploadsRoot, ...segments);
  const prefix = uploadsRoot.endsWith(sep) ? uploadsRoot : uploadsRoot + sep;
  if (candidate !== uploadsRoot && !candidate.startsWith(prefix)) {
    return null;
  }
  return candidate;
}

/** IDs de artículo / carpeta seguros (cuid u otros alfanuméricos). */
export function isSafeUploadId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}
