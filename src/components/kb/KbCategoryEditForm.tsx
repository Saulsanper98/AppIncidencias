"use client";

import { Loader2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { KbCategory } from "@/lib/domain";

const COLOR_PRESETS = [
  { id: "", label: "Por defecto" },
  { id: "#8b5cf6", label: "Violeta" },
  { id: "#0ea5e9", label: "Azul" },
  { id: "#10b981", label: "Verde" },
  { id: "#f59e0b", label: "Ámbar" },
  { id: "#f43f5e", label: "Rosa" },
] as const;

export type KbCategoryDraft = {
  name: string;
  description: string;
  order: number;
  color: string;
};

type Props = {
  category: KbCategory;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: KbCategoryDraft) => void;
};

export function KbCategoryEditForm({ category, saving, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState<KbCategoryDraft>({
    name: category.name,
    description: category.description ?? "",
    order: category.order ?? 0,
    color: category.color ?? "",
  });

  useEffect(() => {
    setDraft({
      name: category.name,
      description: category.description ?? "",
      order: category.order ?? 0,
      color: category.color ?? "",
    });
  }, [category]);

  const canSave = draft.name.trim().length >= 2 && !saving;

  return (
    <div className="mt-4 rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[var(--color-text-1)]">
          Editar categoría
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
          aria-label="Cerrar edición"
        >
          <X size={14} strokeWidth={1.7} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-3)]">
            Nombre
          </span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            maxLength={80}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
          />
        </label>

        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-3)]">
            Descripción (opcional)
          </span>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            rows={2}
            maxLength={280}
            className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
            placeholder="Breve descripción para el equipo…"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-3)]">
            Orden en listados
          </span>
          <input
            type="number"
            min={0}
            max={999}
            value={draft.order}
            onChange={(e) =>
              setDraft((d) => ({ ...d, order: Math.max(0, Number(e.target.value) || 0) }))
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
          />
          <span className="text-[10px] text-[var(--color-text-3)]">Menor número = aparece antes.</span>
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-3)]">
            Color de acento
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((p) => {
              const active = draft.color === p.id;
              return (
                <button
                  key={p.id || "default"}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, color: p.id }))}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? "border-violet-400/50 bg-violet-500/15 text-violet-200"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-violet-400/30"
                  }`}
                >
                  {p.id ? (
                    <span
                      className="h-2.5 w-2.5 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: p.id }}
                      aria-hidden
                    />
                  ) : null}
                  {p.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-2)] hover:text-[var(--color-text-1)] disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={!canSave}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Save size={12} strokeWidth={1.7} aria-hidden />}
          Guardar categoría
        </button>
      </div>
    </div>
  );
}
