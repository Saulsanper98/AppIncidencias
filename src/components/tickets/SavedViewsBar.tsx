"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Loader2, Star, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackUxEvent } from "@/lib/ux-telemetry";
import { cn } from "@/lib/utils";

/**
 * Barra de chips de vistas guardadas. Cada chip aplica una combinación
 * predefinida de filtros (`status`, `priority`, `operator`, `busId`, `mine`,
 * `partCode`). Las vistas son personales por usuario; el botón "Guardar"
 * captura los filtros activos y permite ponerles nombre.
 *
 * Para evitar parpadeos, mantenemos el listado de vistas en memoria mientras
 * la página esté montada.
 */

export type SavedView = {
  id: string;
  name: string;
  query: string;
  scope: string;
  createdAt: string;
};

type Props = {
  /** Querystring serializado de los filtros actualmente activos (sin '?'). */
  currentQuery: string;
  /** Aplica un querystring guardado al hook `useTickets`. */
  onApply: (query: string) => void;
};

export function SavedViewsBar({ currentQuery, onApply }: Props) {
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [name, setName] = useState("");

  const loadViews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets/views", { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudieron cargar las vistas");
        return;
      }
      const data = (await res.json()) as { views: SavedView[] };
      setViews(data.views ?? []);
    } catch {
      setError("No se pudieron cargar las vistas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadViews();
  }, [loadViews]);

  const handleSave = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!name.trim()) return;
      setSaving(true);
      try {
        const res = await fetch("/api/tickets/views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), query: currentQuery }),
        });
        if (res.ok) {
          const data = (await res.json()) as { view: SavedView };
          setViews((prev) => [...(prev ?? []), data.view].sort((a, b) => a.name.localeCompare(b.name)));
          setName("");
          setShowSaveDialog(false);
        }
      } finally {
        setSaving(false);
      }
    },
    [name, currentQuery],
  );

  const handleDelete = useCallback(
    async (view: SavedView) => {
      const ok = window.confirm(`¿Eliminar la vista "${view.name}"?`);
      if (!ok) return;
      const res = await fetch(`/api/tickets/views/${view.id}`, { method: "DELETE" });
      if (res.ok) {
        setViews((prev) => (prev ?? []).filter((v) => v.id !== view.id));
      }
    },
    [],
  );

  /** Indica si la vista guardada coincide con los filtros actuales. */
  const activeViewId = useMemo(() => {
    if (!views) return null;
    // Para comparar de forma robusta normalizamos las claves (orden alfabético).
    const normalize = (q: string): string => {
      const p = new URLSearchParams(q.replace(/^\?/, ""));
      const entries = Array.from(p.entries()).sort(([a], [b]) => a.localeCompare(b));
      return entries.map(([k, v]) => `${k}=${v}`).join("&");
    };
    const current = normalize(currentQuery);
    for (const v of views) {
      if (normalize(v.query) === current) return v.id;
    }
    return null;
  }, [views, currentQuery]);

  const hasActiveFilters = currentQuery.length > 0;

  if (loading && !views) {
    return (
      <div className="flex items-center gap-2 px-1 py-1 text-xs text-[var(--color-text-3)]">
        <Loader2 size={12} className="animate-spin" aria-hidden /> Cargando vistas…
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <span className="flex shrink-0 items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
        <Star size={11} aria-hidden /> Vistas
      </span>
      {views && views.length === 0 ? (
        <span className="text-xs text-[var(--color-text-3)]">
          Sin vistas guardadas todavía.
        </span>
      ) : null}
      {(views ?? []).map((v) => (
        <span
          key={v.id}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
            activeViewId === v.id
              ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)]",
          )}
        >
          <button
            type="button"
            onClick={() => {
              trackUxEvent("ticket_view_applied", {
                view_id: v.id,
                view_name: v.name,
              });
              onApply(v.query);
            }}
            className="font-medium"
            title="Aplicar esta vista"
          >
            {v.name}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(v)}
            className="rounded p-0.5 text-[var(--color-text-3)] opacity-0 transition-opacity hover:text-[var(--color-error)] group-hover:opacity-100"
            aria-label={`Eliminar vista ${v.name}`}
            title="Eliminar vista"
          >
            <Trash2 size={10} aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => setShowSaveDialog(true)}
        disabled={!hasActiveFilters}
        title={
          hasActiveFilters
            ? "Guardar los filtros actuales como una vista"
            : "Aplica algún filtro antes de guardar la vista"
        }
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BookmarkPlus size={10} aria-hidden />
        Guardar vista
      </button>
      {error ? <span className="text-xs text-[var(--color-error)]">{error}</span> : null}

      {showSaveDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-view-title"
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3
                id="save-view-title"
                className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-1)]"
              >
                <BookmarkPlus size={14} className="text-[var(--color-accent)]" aria-hidden />
                Guardar vista
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="rounded p-1 text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)]"
                aria-label="Cerrar"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <label className="block text-xs font-medium text-[var(--color-text-2)]">
              Nombre
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Tickets altos sin asignar"
                maxLength={80}
                autoFocus
                className="mt-1"
              />
            </label>
            <p className="mt-2 text-[11px] text-[var(--color-text-3)]">
              Se guardarán los filtros actuales: <span className="font-mono">{currentQuery || "—"}</span>
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={saving || !name.trim()}>
                {saving ? (
                  <span className="flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" aria-hidden /> Guardando…
                  </span>
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
