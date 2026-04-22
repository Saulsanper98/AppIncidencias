"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";

type SortableWidgetProps = {
  id: string;
  layoutColSpan: number;
  layoutMinHeightPx: number;
  children: ReactNode;
  isEditing: boolean;
  /** Si está definido, en modo edición se muestran ancho (columnas) y asa de altura. */
  onLayoutPatch?: (patch: { colSpan?: number; minHeightPx?: number }) => void;
};

export function SortableWidget({
  id,
  layoutColSpan,
  layoutMinHeightPx,
  children,
  isEditing,
  onLayoutPatch,
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const [previewHeight, setPreviewHeight] = useState<number | null>(null);

  useEffect(() => {
    setPreviewHeight(null);
  }, [layoutMinHeightPx]);

  const outerStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    gridColumn: `span ${layoutColSpan} / span ${layoutColSpan}`,
  } as const;

  const innerMinHeight = previewHeight ?? layoutMinHeightPx;

  const startHeightDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onLayoutPatch) return;
    const startY = e.clientY;
    const startH = previewHeight ?? layoutMinHeightPx;
    let lastH = startH;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      lastH = Math.min(900, Math.max(180, Math.round(startH + delta)));
      setPreviewHeight(lastH);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onLayoutPatch({ minHeightPx: lastH });
      setPreviewHeight(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={setNodeRef}
      style={outerStyle}
      className={cn("relative min-w-0", isEditing && "cursor-grab active:cursor-grabbing")}
    >
      {isEditing ? (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-2 top-2 z-30 flex h-6 w-6 cursor-grab items-center justify-center rounded-md bg-[var(--color-surface-3)] text-[var(--color-text-3)] active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </div>
      ) : null}

      <div
        style={{ minHeight: innerMinHeight }}
        className={cn(
          "relative flex min-h-0 flex-col rounded-[inherit]",
          isEditing && onLayoutPatch && "pt-8",
        )}
      >
        {isEditing && onLayoutPatch ? (
          <div className="pointer-events-none absolute inset-x-0 top-1 z-20 flex justify-end px-1">
            <div className="pointer-events-auto flex gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-0.5 shadow-sm backdrop-blur-sm">
              {([1, 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  title={`Ancho: ${n} columna${n > 1 ? "s" : ""}`}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                  }}
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    onLayoutPatch({ colSpan: n });
                  }}
                  className={cn(
                    "min-h-[26px] min-w-[26px] rounded px-1 text-[11px] font-semibold tabular-nums transition-colors",
                    layoutColSpan === n
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">{children}</div>

        {isEditing && onLayoutPatch ? (
          <button
            type="button"
            aria-label="Redimensionar altura del widget"
            title="Arrastra para cambiar la altura del bloque"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={startHeightDrag}
            className="absolute bottom-1 right-1 z-30 h-4 w-4 cursor-nwse-resize touch-none rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-3)] shadow-sm hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]"
          />
        ) : null}
      </div>
    </div>
  );
}
