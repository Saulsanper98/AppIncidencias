/**
 * Layout persistido de cada widget del dashboard customizable.
 *
 * El ancho se guarda como un entero `colSpan` entre 1 y 100 (porcentaje
 * efectivo del grid). Equivale a un "grid de 100 columnas" que da pasos del
 * 1%, prácticamente continuos para el usuario que arrastra el asa lateral.
 *
 * Historia previa:
 *   - V1: grid de 4 columnas, `colSpan` 1-4 (cuartos).
 *   - V2: grid de 12 columnas, `colSpan` 1-12 (paso ~8.3%).
 *   - V3 (actual): grid de 100 columnas, `colSpan` 1-100 (paso 1%).
 *
 * Migración transparente al leer:
 *   - Si el JSON guarda `gridCols: 12`, escalamos colSpan × (100/12).
 *   - Si `gridCols` no existe y `colSpan` ≤ 4, asumimos V1 y escalamos × 25.
 *   - El resto (gridCols=100 o ausente con colSpan > 4) se interpreta literal.
 *
 * `mergeLayoutIntoConfig` siempre estampa `gridCols: GRID_COLS`, así que el
 * primer guardado normaliza el layout al modelo actual.
 */

export type WidgetLayout = {
  colSpan: number;
  minHeightPx: number;
};

const COL_MIN = 1;
export const GRID_COLS = 100;
const COL_MAX = GRID_COLS;
const H_MIN = 180;
const H_MAX = 900;

const LEGACY_V1_GRID = 4;
const LEGACY_V2_GRID = 12;

export function parseWidgetLayout(configStr: string, size: string): WidgetLayout {
  // Defaults a partir del campo legado `size`, expresados ya como porcentaje.
  let colSpan = size === "small" ? 25 : size === "large" ? 100 : 50;
  let minHeightPx = size === "small" ? 260 : size === "large" ? 440 : 320;

  try {
    const parsed = JSON.parse(configStr || "{}") as {
      layout?: { colSpan?: number; minHeightPx?: number; gridCols?: number };
    };
    const storedGridCols = parsed.layout?.gridCols;
    const storedColSpan = parsed.layout?.colSpan;
    const storedMinHeight = parsed.layout?.minHeightPx;

    if (typeof storedColSpan === "number" && Number.isFinite(storedColSpan)) {
      const raw = Math.max(1, Math.round(storedColSpan));
      let scaled = raw;
      if (storedGridCols === LEGACY_V2_GRID) {
        scaled = Math.round((raw * GRID_COLS) / LEGACY_V2_GRID);
      } else if (
        typeof storedGridCols !== "number" &&
        raw <= LEGACY_V1_GRID
      ) {
        scaled = Math.round((raw * GRID_COLS) / LEGACY_V1_GRID);
      }
      colSpan = clamp(scaled, COL_MIN, COL_MAX);
    }
    if (typeof storedMinHeight === "number" && Number.isFinite(storedMinHeight)) {
      minHeightPx = clamp(Math.round(storedMinHeight), H_MIN, H_MAX);
    }
  } catch {
    // defaults from size
  }

  return { colSpan, minHeightPx };
}

export function mergeLayoutIntoConfig(
  configStr: string,
  patch: Partial<{ colSpan: number; minHeightPx: number }>,
): string {
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(configStr || "{}") as Record<string, unknown>;
  } catch {
    base = {};
  }
  const prevLayout = (base.layout as Record<string, unknown> | undefined) ?? {};
  const nextLayout: Record<string, unknown> = { ...prevLayout, gridCols: GRID_COLS };
  if (patch.colSpan !== undefined) {
    nextLayout.colSpan = clamp(Math.round(patch.colSpan), COL_MIN, COL_MAX);
  }
  if (patch.minHeightPx !== undefined) {
    nextLayout.minHeightPx = clamp(Math.round(patch.minHeightPx), H_MIN, H_MAX);
  }
  return JSON.stringify({ ...base, layout: nextLayout });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
