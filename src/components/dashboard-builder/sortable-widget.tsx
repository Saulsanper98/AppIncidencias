"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Columns3, GripVertical, MoveVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { GRID_COLS } from "@/lib/dashboard/widget-layout";
import { cn } from "@/lib/utils";

type SortableWidgetProps = {
  id: string;
  layoutColSpan: number;
  layoutMinHeightPx: number;
  children: ReactNode;
  isEditing: boolean;
  /** Si está definido, en modo edición se muestran ancho (columnas) y asa de altura. */
  onLayoutPatch?: (patch: { colSpan?: number; minHeightPx?: number }) => void;
  /**
   * Notifica al padre del preview EN VIVO mientras se arrastra cualquier asa.
   * Se llama en cada `mousemove` con el valor predicho y, al soltar, con
   * `null` para limpiar. El padre usa esto para recalcular `chartHeight` y
   * que las gráficas de Recharts se redibujen frame a frame.
   */
  onLivePreview?: (preview: { colSpan?: number; minHeightPx?: number } | null) => void;
};

const HEIGHT_PRESETS: { id: string; label: string; px: number }[] = [
  { id: "s", label: "S", px: 240 },
  { id: "m", label: "M", px: 340 },
  { id: "l", label: "L", px: 480 },
  { id: "xl", label: "XL", px: 640 },
];

// Presets rápidos en porcentaje (sobre `GRID_COLS = 100`). Cubren los repartos
// típicos pero el asa lateral derecha permite cualquier valor intermedio.
const WIDTH_PRESETS: { id: string; label: string; cols: number }[] = [
  { id: "q1", label: "¼", cols: 25 },
  { id: "t1", label: "⅓", cols: 33 },
  { id: "h", label: "½", cols: 50 },
  { id: "t2", label: "⅔", cols: 67 },
  { id: "q3", label: "¾", cols: 75 },
  { id: "full", label: "1/1", cols: 100 },
];

const HEIGHT_MIN = 180;
const HEIGHT_MAX = 900;
// Grid del dashboard configurado con `gap-0`; el espacio visual entre widgets
// lo resuelve el padding interno del propio `SortableWidget`. Por eso el asa
// de ancho no descuenta gaps al traducir px a porcentaje.
const GRID_GAP_PX = 0;

export function SortableWidget({
  id,
  layoutColSpan,
  layoutMinHeightPx,
  children,
  isEditing,
  onLayoutPatch,
  onLivePreview,
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const outerRef = useRef<HTMLDivElement | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [previewColSpan, setPreviewColSpan] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isWidthResizing, setIsWidthResizing] = useState(false);

  useEffect(() => {
    setPreviewHeight(null);
  }, [layoutMinHeightPx]);

  useEffect(() => {
    setPreviewColSpan(null);
  }, [layoutColSpan]);

  const showLayoutControls = isEditing && !!onLayoutPatch;
  const effectiveColSpan = previewColSpan ?? layoutColSpan;

  const setNodeRefCombined = (el: HTMLDivElement | null) => {
    outerRef.current = el;
    setNodeRef(el);
  };

  const outerStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging || isResizing || isWidthResizing ? 10 : undefined,
    gridColumn: `span ${effectiveColSpan} / span ${effectiveColSpan}`,
  } as const;

  const innerMinHeight = previewHeight ?? layoutMinHeightPx;

  /**
   * Arrastre desde la esquina inferior-derecha. Lleva alto y ancho A LA VEZ
   * en un único gesto (Excel-style). El movimiento vertical actualiza la
   * altura píxel a píxel (180-900 px) y el horizontal el ancho 1-100% del
   * grid. Ambos previews se emiten en cada `mousemove` para que la gráfica
   * de Recharts se redibuje al instante.
   */
  const startCornerDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onLayoutPatch || !outerRef.current) return;
    const grid = outerRef.current.parentElement;
    if (!grid) return;

    const gridWidth = grid.getBoundingClientRect().width;
    const colPlusGap = (gridWidth + GRID_GAP_PX) / GRID_COLS;

    const startX = e.clientX;
    const startY = e.clientY;
    const startSpan = previewColSpan ?? layoutColSpan;
    const startH = previewHeight ?? layoutMinHeightPx;
    let lastSpan = startSpan;
    let lastH = startH;

    setIsResizing(true);
    setIsWidthResizing(true);

    const onMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaCols = deltaX / colPlusGap;
      lastSpan = Math.min(GRID_COLS, Math.max(1, Math.round(startSpan + deltaCols)));
      setPreviewColSpan(lastSpan);

      const deltaY = ev.clientY - startY;
      lastH = Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, Math.round(startH + deltaY)));
      setPreviewHeight(lastH);

      onLivePreview?.({ colSpan: lastSpan, minHeightPx: lastH });
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setIsResizing(false);
      setIsWidthResizing(false);
      const patch: { colSpan?: number; minHeightPx?: number } = {};
      if (lastSpan !== startSpan) patch.colSpan = lastSpan;
      if (lastH !== startH) patch.minHeightPx = lastH;
      if (patch.colSpan !== undefined || patch.minHeightPx !== undefined) {
        onLayoutPatch(patch);
      } else {
        setPreviewColSpan(null);
        setPreviewHeight(null);
      }
      onLivePreview?.(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const closestHeightPresetId =
    HEIGHT_PRESETS.reduce<{ id: string | null; diff: number }>(
      (acc, p) => {
        const diff = Math.abs(p.px - layoutMinHeightPx);
        return diff < acc.diff ? { id: p.id, diff } : acc;
      },
      { id: null, diff: Number.POSITIVE_INFINITY },
    ).id;

  return (
    <div
      ref={setNodeRefCombined}
      style={outerStyle}
      className={cn(
        // `p-2` recrea el espacio visual entre widgets (16 px netos entre dos
        // tarjetas adyacentes) ahora que el grid padre usa `gap-0` para
        // permitir 100 columnas sin que los gaps se coman el ancho útil.
        "group/widget relative min-w-0 p-2",
        isEditing && "cursor-grab active:cursor-grabbing",
        (isResizing || isWidthResizing) && "select-none",
      )}
    >
      {isEditing ? (
        <div
          {...attributes}
          {...listeners}
          aria-label="Arrastrar para reordenar"
          title="Arrastrar para reordenar"
          className="absolute left-2 top-2 z-30 flex h-6 w-6 cursor-grab items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 text-[var(--color-text-3)] shadow-sm backdrop-blur-sm transition-colors hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-1)] active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </div>
      ) : null}

      <div
        style={{ minHeight: innerMinHeight }}
        className={cn(
          "relative flex min-h-0 flex-col rounded-[inherit]",
          showLayoutControls && "pt-10",
        )}
      >
        {/* ── Barra superior: ancho (columnas) + alto (presets) ─────────── */}
        {showLayoutControls ? (
          <div className="pointer-events-none absolute inset-x-0 top-1 z-20 flex items-center justify-between gap-2 px-1">
            {/* spacer izquierdo para evitar GripVertical */}
            <span aria-hidden className="h-1 w-8" />

            <div className="pointer-events-auto flex items-center gap-1">
              {/* Ancho: presets en fracciones del grid (½, ⅓, …). Para
                  valores intermedios usa el asa lateral derecha. */}
              <div
                className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-1 py-0.5 shadow-sm backdrop-blur-sm"
                title="Ancho del widget (también arrastra el asa de la derecha)"
              >
                <Columns3
                  size={11}
                  strokeWidth={1.7}
                  className="text-[var(--color-text-3)]"
                  aria-hidden
                />
                {WIDTH_PRESETS.map((p) => {
                  const active = layoutColSpan === p.cols && previewColSpan === null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-label={`Ancho ${p.label} (${p.cols} columnas de ${GRID_COLS})`}
                      aria-pressed={active}
                      title={`${p.label} · ${p.cols}/${GRID_COLS}`}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        onLayoutPatch!({ colSpan: p.cols });
                      }}
                      className={cn(
                        "min-h-[22px] min-w-[24px] rounded px-1 text-[11px] font-semibold transition-colors",
                        active
                          ? "bg-[var(--color-accent)] text-white"
                          : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Alto: presets S/M/L/XL */}
              <div
                className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-1 py-0.5 shadow-sm backdrop-blur-sm"
                title="Alto recomendado (también puedes arrastrar el asa de la esquina)"
              >
                <MoveVertical
                  size={11}
                  strokeWidth={1.7}
                  className="text-[var(--color-text-3)]"
                  aria-hidden
                />
                {HEIGHT_PRESETS.map((p) => {
                  const active = closestHeightPresetId === p.id && previewHeight === null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-label={`Altura ${p.label} (${p.px}px)`}
                      aria-pressed={active}
                      title={`${p.label} \u00B7 ${p.px}px`}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        onLayoutPatch!({ minHeightPx: p.px });
                      }}
                      className={cn(
                        "min-h-[22px] min-w-[24px] rounded px-1 text-[10px] font-semibold uppercase transition-colors",
                        active
                          ? "bg-[var(--color-accent)] text-white"
                          : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">{children}</div>

        {/* ── Asa única de esquina: arrastra para ancho + alto a la vez ── */}
        {showLayoutControls ? (
          <button
            type="button"
            aria-label="Arrastra para redimensionar ancho y alto"
            title="Arrastra para redimensionar (ancho + alto)"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={startCornerDrag}
            className={cn(
              "absolute bottom-1.5 right-1.5 z-30 flex h-7 w-7 cursor-nwse-resize touch-none items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/90 text-[var(--color-text-3)] shadow-sm backdrop-blur-sm transition-all",
              "opacity-70 hover:opacity-100 hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]",
              (isResizing || isWidthResizing) &&
                "opacity-100 border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]",
            )}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M3 13 L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7 13 L13 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M11 13 L13 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}

        {/* ── Badge "live" combinado (ancho % · alto px) ──────────────── */}
        {showLayoutControls && (isResizing || isWidthResizing) ? (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-10 right-1.5 z-30 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-surface)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-accent)] shadow-md"
          >
            <span>
              <span className="num-tabular">{effectiveColSpan}</span>%
            </span>
            <span className="opacity-50">·</span>
            <span>
              <span className="num-tabular">{Math.round(innerMinHeight)}</span> px
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
