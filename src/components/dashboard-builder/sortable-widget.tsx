"use client";

import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";

type SortableWidgetProps = {
  id: string;
  size: string;
  children: ReactNode;
  isEditing: boolean;
};

export function SortableWidget({ id, size, children, isEditing }: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const sizeClasses =
    size === "small" ? "col-span-1" : size === "large" ? "col-span-4" : "col-span-2";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative", sizeClasses, isEditing && "cursor-grab active:cursor-grabbing")}
    >
      {isEditing ? (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-10 w-6 h-6 flex items-center justify-center rounded-md bg-[var(--color-surface-3)] text-[var(--color-text-3)] cursor-grab"
        >
          <GripVertical size={12} />
        </div>
      ) : null}
      {children}
    </div>
  );
}
