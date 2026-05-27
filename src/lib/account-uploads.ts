import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";

import { fileExtFromMimeAndName } from "@/lib/ticket-uploads";

export const ACCOUNT_UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // 8 MB (margen para GIFs animados)
export const ACCOUNT_ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export type AccountImageKind = "avatar" | "banner";

function dirForKind(kind: AccountImageKind): string {
  return join(process.cwd(), "public", "uploads", kind === "avatar" ? "avatars" : "banners");
}

/**
 * URL publica del avatar/banner.
 *
 * Las URLs viajan por `/api/account-media/{avatars|banners}/{fileName}` y NO
 * por `/uploads/...`. Motivo: `next start` solo sirve via la capa estatica
 * los archivos de `public/` que existian en el momento del arranque del
 * proceso. Los avatares se crean en runtime, por lo que `/uploads/avatar.jpg`
 * devuelve 404 hasta el siguiente rebuild y la <img> queda en negro. El
 * route handler dinamico (src/app/api/account-media/[kind]/[name]/route.ts)
 * lee del FS en cada request y elimina el problema.
 */
function publicUrlForKind(kind: AccountImageKind, fileName: string): string {
  return `/api/account-media/${kind === "avatar" ? "avatars" : "banners"}/${fileName}`;
}

/**
 * Guarda en disco un avatar/banner del usuario y devuelve la URL pública relativa.
 * Genera un nombre `userId-<ts>.<ext>` para forzar invalidación de caché del navegador.
 */
export async function saveAccountImage(
  userId: string,
  kind: AccountImageKind,
  file: File,
): Promise<string> {
  if (file.size <= 0 || file.size > ACCOUNT_UPLOAD_MAX_BYTES) {
    throw new Error(`El archivo supera el tamaño máximo permitido (${Math.round(ACCOUNT_UPLOAD_MAX_BYTES / (1024 * 1024))} MB).`);
  }
  if (!ACCOUNT_ALLOWED_MIMES.has(file.type)) {
    throw new Error("Formato no admitido. Usa GIF, PNG, JPG o WebP.");
  }

  const dir = dirForKind(kind);
  await mkdir(dir, { recursive: true });

  const ext = fileExtFromMimeAndName(file.type, file.name);
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `${safeUserId}-${Date.now()}${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, fileName), buffer);

  return publicUrlForKind(kind, fileName);
}

/**
 * Borra de disco un avatar/banner anterior si era un archivo local nuestro.
 * Si la URL es externa o no es nuestra, no hace nada.
 */
export async function tryDeleteLocalAccountImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  // Aceptamos ambos prefijos para compatibilidad con URLs guardadas antes de
  // migrar a `/api/account-media/...`:
  //   - Nuevo: /api/account-media/avatars/<file>
  //   - Antiguo: /uploads/avatars/<file>
  const match = url.match(
    /^(?:\/api\/account-media|\/uploads)\/(avatars|banners)\/([a-zA-Z0-9_.\-]+)$/,
  );
  if (!match) return;
  const folder = match[1];
  const fileName = match[2];
  const filePath = join(process.cwd(), "public", "uploads", folder, fileName);
  try {
    await unlink(filePath);
  } catch {
    // El archivo puede no existir tras un despliegue limpio: ignoramos.
  }
}
