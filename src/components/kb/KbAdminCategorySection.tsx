"use client";

import { Folder, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { KbCategoryEditForm, type KbCategoryDraft } from "@/components/kb/KbCategoryEditForm";
import type { KbArticleSummary, KbCategory } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Props = {
  categories: KbCategory[];
  articles: KbArticleSummary[];
  newCategoryName: string;
  creatingCategory: boolean;
  editingCategoryId: string | null;
  editingCategory: KbCategory | null;
  savingCategory: boolean;
  onNewCategoryNameChange: (v: string) => void;
  onCreateCategory: () => void;
  onEditCategory: (id: string | null) => void;
  onDeleteCategory: (id: string, name: string) => void;
  onSaveCategory: (id: string, draft: KbCategoryDraft) => void;
};

export function KbAdminCategorySection({
  categories,
  articles,
  newCategoryName,
  creatingCategory,
  editingCategoryId,
  editingCategory,
  savingCategory,
  onNewCategoryNameChange,
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
  onSaveCategory,
}: Props) {
  const countByCategory = (categoryId: string) =>
    articles.filter((a) => a.categoryId === categoryId).length;

  const sorted = [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] bg-gradient-to-r from-violet-500/[0.08] to-transparent px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/25 text-violet-300">
              <Folder size={18} strokeWidth={1.7} aria-hidden />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--color-text-1)]">Categorías</h2>
              <p className="mt-0.5 max-w-lg text-[12px] text-[var(--color-text-3)]">
                Organiza la KB por temática. El orden define cómo aparecen en el índice público.
              </p>
            </div>
          </div>
          <div className="flex w-full max-w-md items-end gap-2 sm:w-auto">
            <label className="min-w-0 flex-1 space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-3)]">
                Nueva categoría
              </span>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => onNewCategoryNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCreateCategory();
                  }
                }}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] outline-none focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/15"
                placeholder="Ej: Manuales, FAQs…"
                maxLength={80}
              />
            </label>
            <button
              type="button"
              onClick={onCreateCategory}
              disabled={creatingCategory || newCategoryName.trim().length < 2}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[12.5px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingCategory ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <Plus size={13} strokeWidth={1.8} aria-hidden />
              )}
              Añadir
            </button>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-5 py-12 text-center text-[13px] text-[var(--color-text-3)]">
          Aún no hay categorías. Crea la primera arriba.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ccmgc-table w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-left text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                <th className="w-14 px-4 py-2.5 font-medium">Orden</th>
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Descripción</th>
                <th className="w-24 px-4 py-2.5 font-medium text-center">Artículos</th>
                <th className="w-28 px-4 py-2.5 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const isEditing = editingCategoryId === c.id;
                const count = countByCategory(c.id);
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-[var(--color-border)]/60 transition-colors",
                      isEditing ? "bg-violet-500/[0.08]" : "hover:bg-[var(--color-surface-2)]/40",
                    )}
                  >
                    <td className="px-4 py-3 num-tabular text-[var(--color-text-3)]">{c.order}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.color ? (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/10"
                            style={{ backgroundColor: c.color }}
                            aria-hidden
                          />
                        ) : (
                          <Folder size={12} className="shrink-0 text-[var(--color-text-3)]" aria-hidden />
                        )}
                        <span className="font-medium text-[var(--color-text-1)]">{c.name}</span>
                      </div>
                    </td>
                    <td className="hidden max-w-xs truncate px-4 py-3 text-[var(--color-text-3)] md:table-cell">
                      {c.description || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex min-w-[2rem] justify-center rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-medium num-tabular text-[var(--color-text-2)]">
                        {count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onEditCategory(isEditing ? null : c.id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                            isEditing
                              ? "border-violet-400/50 bg-violet-500/15 text-violet-200"
                              : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:border-violet-400/40 hover:text-[var(--color-text-1)]",
                          )}
                        >
                          <Pencil size={11} strokeWidth={1.7} aria-hidden />
                          {isEditing ? "Cerrar" : "Editar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCategory(c.id, c.name)}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1.5 text-[var(--color-text-3)] hover:border-[var(--color-error)]/40 hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                          aria-label={`Eliminar ${c.name}`}
                        >
                          <Trash2 size={12} strokeWidth={1.7} aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingCategory ? (
        <div className="border-t border-[var(--color-border)] p-5">
          <KbCategoryEditForm
            category={editingCategory}
            saving={savingCategory}
            onCancel={() => onEditCategory(null)}
            onSave={(draft) => onSaveCategory(editingCategory.id, draft)}
          />
        </div>
      ) : null}
    </section>
  );
}
