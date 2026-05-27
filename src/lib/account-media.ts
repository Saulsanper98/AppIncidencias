/**
 * Helper isomorfico (server + client) para resolver la URL final de un
 * avatar/banner.
 *
 * Migramos las URLs de almacenamiento desde `/uploads/{kind}/{file}` a
 * `/api/account-media/{kind}/{file}` para que las imagenes se sirvan via un
 * route handler dinamico y no via la capa estatica de `next start` (que solo
 * sirve archivos presentes en `public/` al arrancar, dejando los uploads
 * recientes con 404 hasta el siguiente rebuild).
 *
 * Para no tener que migrar la columna `User.avatarUrl` / `User.bannerUrl` en
 * SQLite, normalizamos al renderizar: cualquier URL que empiece por
 * `/uploads/avatars/` o `/uploads/banners/` se reescribe al endpoint
 * dinamico. URLs externas (http/https) o cualquier otra ruta se devuelven
 * tal cual.
 */
export function resolveAccountImageUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Las URLs externas (https://i.imgur.com/...) se pasan tal cual; solo
  // reescribimos las rutas internas heredadas.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const match = trimmed.match(/^\/uploads\/(avatars|banners)\/(.+)$/);
  if (match) {
    return `/api/account-media/${match[1]}/${match[2]}`;
  }
  return trimmed;
}
