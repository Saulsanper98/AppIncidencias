export type WidgetLayout = {
  colSpan: number;
  minHeightPx: number;
};

const COL_MIN = 1;
const COL_MAX = 4;
const H_MIN = 180;
const H_MAX = 900;

export function parseWidgetLayout(configStr: string, size: string): WidgetLayout {
  let colSpan = size === "small" ? 1 : size === "large" ? 4 : 2;
  let minHeightPx = size === "small" ? 260 : size === "large" ? 440 : 320;
  try {
    const c = JSON.parse(configStr || "{}") as {
      layout?: { colSpan?: number; minHeightPx?: number };
    };
    const cs = c.layout?.colSpan;
    if (typeof cs === "number" && Number.isFinite(cs)) {
      colSpan = Math.min(COL_MAX, Math.max(COL_MIN, Math.round(cs)));
    }
    const mh = c.layout?.minHeightPx;
    if (typeof mh === "number" && Number.isFinite(mh)) {
      minHeightPx = Math.min(H_MAX, Math.max(H_MIN, Math.round(mh)));
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
  const nextLayout: Record<string, unknown> = { ...prevLayout };
  if (patch.colSpan !== undefined) {
    nextLayout.colSpan = Math.min(COL_MAX, Math.max(COL_MIN, Math.round(patch.colSpan)));
  }
  if (patch.minHeightPx !== undefined) {
    nextLayout.minHeightPx = Math.min(H_MAX, Math.max(H_MIN, Math.round(patch.minHeightPx)));
  }
  return JSON.stringify({ ...base, layout: nextLayout });
}
