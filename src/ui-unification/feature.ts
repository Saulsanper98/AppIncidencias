/**
 * Vista previa de unificación visual CCMGC.
 *
 * Decisión de producto (auditoría 2026-07): mantener **opt-in** vía env.
 * No activar por defecto hasta completar heroes en todos los módulos;
 * activar con NEXT_PUBLIC_UI_UNIFICATION=1 + rebuild.
 * Desactivar: quitar la variable o poner 0 + rebuild.
 * Borrado completo: ver src/ui-unification/REVERT.md
 */
export function isUiUnificationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_UI_UNIFICATION === "1";
}
