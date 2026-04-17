/**
 * Selector de usuario simulado en /login (solo desarrollo o cuando se fuerza explícitamente).
 * En build de producción está desactivado salvo NEXT_PUBLIC_DEV_LOGIN_SELECTOR=1 (p. ej. demo interna).
 */
export function isDevUserSelectorEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEV_LOGIN_SELECTOR === "1") return true;
  if (process.env.NEXT_PUBLIC_DEV_LOGIN_SELECTOR === "0") return false;
  return process.env.NODE_ENV === "development";
}
