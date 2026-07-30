"use client";

import { cn } from "@/lib/utils";
import {
  BUILTIN_VISUAL_PRESETS,
  type VisualPresetSettings,
} from "@/lib/dashboard/visual-preset-system";

type VisualPresetPickerProps = {
  onApply: (settings: VisualPresetSettings, presetId: string) => void;
  layout?: "grid" | "row";
  activePresetId?: string | null;
  className?: string;
};

/** Selector compartido de presets visuales builtin (panel + modal). */
export function VisualPresetPicker({
  onApply,
  layout = "grid",
  activePresetId = null,
  className,
}: VisualPresetPickerProps) {
  return (
    <div
      className={cn(
        layout === "grid" ? "flex flex-wrap gap-2" : "flex flex-wrap gap-1.5",
        className,
      )}
    >
      {BUILTIN_VISUAL_PRESETS.map((preset) => {
        const isActive = activePresetId === preset.id;
        const { id, name, description, ...settings } = preset;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onApply(settings, id)}
            className={cn(
              "dashboard-preset-chip rounded-xl border px-3 py-2 text-left transition-all",
              layout === "row" && "px-2.5 py-1.5",
              isActive
                ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/25"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-hover)]",
            )}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-1)]">
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: preset.accentColor }} />
              {name}
            </span>
            {layout === "grid" ? (
              <span className="mt-0.5 block text-[10px] text-[var(--color-text-3)]">{description}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
