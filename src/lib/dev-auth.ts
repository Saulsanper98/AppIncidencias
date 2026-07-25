/**
 * Selector de usuario simulado en /login (solo desarrollo o demos no-prod).
 * En `NODE_ENV=production` está SIEMPRE desactivado, aunque
 * `NEXT_PUBLIC_DEV_LOGIN_SELECTOR=1` (esa flag solo vale fuera de producción).
 */
export function isDevUserSelectorEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.NEXT_PUBLIC_DEV_LOGIN_SELECTOR === "1") return true;
  if (process.env.NEXT_PUBLIC_DEV_LOGIN_SELECTOR === "0") return false;
  return process.env.NODE_ENV === "development";
}
