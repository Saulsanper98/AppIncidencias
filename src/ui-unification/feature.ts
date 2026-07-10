/**
 * Vista previa de unificación visual CCMGC.
 *
 * Activar:  NEXT_PUBLIC_UI_UNIFICATION=1  en `.env` + rebuild
 * Desactivar: quitar la variable o poner 0 + rebuild
 *
 * Para borrar por completo: ver src/ui-unification/REVERT.md
 */
export function isUiUnificationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_UI_UNIFICATION === "1";
}
