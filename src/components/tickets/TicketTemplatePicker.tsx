"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Check, ChevronDown, Loader2, Sparkles, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { FormState } from "@/components/tickets/tickets-module-types";
import type { SessionUser } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Plantilla de ticket tal como la devuelve `/api/tickets/templates`.
 * Todos los campos rellenables son opcionales: la plantilla solo "siembra"
 * valores en el formulario; el usuario sigue siendo libre de modificarlos.
 */
export type TicketTemplate = {
  id: string;
  name: string;
  scope: "personal" | "global";
  ownerId: string | null;
  title: string | null;
  description: string | null;
  tipo: string | null;
  subtipo: string | null;
  subsubtipo: string | null;
  priority: "alta" | "media" | "baja" | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

type Props = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  sessionUser: SessionUser | null;
};

/**
 * Selector de plantillas + acción "Guardar como plantilla".
 *
 * Diseño deliberadamente compacto (una sola fila colapsable) para no
 * añadir ruido al ya extenso formulario de alta. Solo se carga el listado
 * cuando el panel se expande por primera vez.
 */
export function TicketTemplatePicker({ form, setForm, sessionUser }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [templates, setTemplates] = useState<TicketTemplate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const appliedTimeoutRef = useRef<number | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets/templates", { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudieron cargar las plantillas");
        return;
      }
      const data = (await res.json()) as { templates: TicketTemplate[] };
      setTemplates(data.templates ?? []);
    } catch {
      setError("No se pudieron cargar las plantillas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded && templates === null) {
      void loadTemplates();
    }
  }, [expanded, templates, loadTemplates]);

  const applyTemplate = useCallback(
    (tpl: TicketTemplate) => {
      setForm((prev) => ({
        ...prev,
        title: tpl.title ?? prev.title,
        description: tpl.description ?? prev.description,
        tipo: tpl.tipo ?? prev.tipo,
        subtipo: tpl.subtipo ?? prev.subtipo,
        subsubtipo: tpl.subsubtipo ?? prev.subsubtipo,
      }));
      setAppliedId(tpl.id);
      if (appliedTimeoutRef.current) window.clearTimeout(appliedTimeoutRef.current);
      appliedTimeoutRef.current = window.setTimeout(() => setAppliedId(null), 2000);
    },
    [setForm],
  );

  const deleteTemplate = useCallback(
    async (tpl: TicketTemplate) => {
      if (!tpl.canEdit) return;
      const ok = window.confirm(`¿Eliminar la plantilla "${tpl.name}"?`);
      if (!ok) return;
      const res = await fetch(`/api/tickets/templates/${tpl.id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => (prev ?? []).filter((t) => t.id !== tpl.id));
      }
    },
    [],
  );

  const grouped = useMemo(() => {
    if (!templates) return [] as { key: string; label: string; items: TicketTemplate[] }[];
    const byKey = new Map<string, { key: string; label: string; items: TicketTemplate[] }>();
    for (const t of templates) {
      const key = `${t.scope}::${t.category ?? "—"}`;
      const label =
        (t.scope === "global" ? "Plantillas compartidas" : "Mis plantillas") +
        (t.category ? ` · ${t.category}` : "");
      if (!byKey.has(key)) byKey.set(key, { key, label, items: [] });
      byKey.get(key)!.items.push(t);
    }
    return Array.from(byKey.values());
  }, [templates]);

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-[var(--color-text-1)] transition-colors hover:bg-[var(--color-surface-2)]"
      >
        <span className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--color-accent)]" aria-hidden />
          Plantillas de ticket
          {templates ? (
            <span className="rounded-full bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-3)]">
              {templates.length}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={14}
          className={cn("text-[var(--color-text-3)] transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="border-t border-[var(--color-border)] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--color-text-3)]">
              Aplica una plantilla para rellenar título, descripción y tipología. Luego puedes
              ajustar lo que necesites.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowSaveDialog(true)}
              disabled={!form.title && !form.description && !form.tipo}
              title="Guardar los valores actuales como plantilla"
            >
              <BookmarkPlus size={12} className="mr-1" aria-hidden />
              Guardar como plantilla
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-3)]">
              <Loader2 size={12} className="animate-spin" aria-hidden /> Cargando plantillas…
            </div>
          ) : error ? (
            <p className="text-xs text-[var(--color-error)]">{error}</p>
          ) : templates && templates.length === 0 ? (
            <p className="text-xs text-[var(--color-text-3)]">
              Aún no hay plantillas. Crea la primera con el botón de arriba.
            </p>
          ) : (
            <div className="space-y-3">
              {grouped.map((group) => (
                <div key={group.key}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                    {group.label}
                  </p>
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((tpl) => (
                      <li
                        key={tpl.id}
                        className="group flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => applyTemplate(tpl)}
                          className="min-w-0 flex-1 text-left"
                          title={tpl.title ?? tpl.description ?? "Aplicar plantilla"}
                        >
                          <span className="block truncate text-sm font-medium text-[var(--color-text-1)]">
                            {tpl.name}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--color-text-3)]">
                            {[tpl.tipo, tpl.subtipo].filter(Boolean).join(" · ") ||
                              tpl.description?.slice(0, 60) ||
                              "Sin detalles"}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {appliedId === tpl.id ? (
                            <Check size={14} className="text-[var(--color-success)]" aria-hidden />
                          ) : null}
                          {tpl.canEdit ? (
                            <button
                              type="button"
                              onClick={() => deleteTemplate(tpl)}
                              className="rounded p-1 text-[var(--color-text-3)] opacity-0 transition-opacity hover:bg-[var(--color-surface-2)] hover:text-[var(--color-error)] group-hover:opacity-100"
                              title="Eliminar plantilla"
                              aria-label="Eliminar plantilla"
                            >
                              <Trash2 size={11} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {showSaveDialog ? (
        <SaveTemplateDialog
          form={form}
          sessionUser={sessionUser}
          onClose={() => setShowSaveDialog(false)}
          onSaved={(tpl) => {
            setTemplates((prev) => [...(prev ?? []), tpl]);
            setShowSaveDialog(false);
          }}
        />
      ) : null}
    </div>
  );
}

function SaveTemplateDialog({
  form,
  sessionUser,
  onClose,
  onSaved,
}: {
  form: FormState;
  sessionUser: SessionUser | null;
  onClose: () => void;
  onSaved: (tpl: TicketTemplate) => void;
}) {
  const canShare = sessionUser?.role === "gestor_centro_control";
  const [name, setName] = useState(() => {
    const base = form.title?.trim();
    return base && base.length > 0 ? base.slice(0, 80) : "";
  });
  const [scope, setScope] = useState<"personal" | "global">("personal");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Indica un nombre para la plantilla");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scope,
          category: category.trim() || null,
          title: form.title,
          description: form.description,
          tipo: form.tipo,
          subtipo: form.subtipo,
          subsubtipo: form.subsubtipo,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "No se pudo guardar la plantilla");
        return;
      }
      const data = (await res.json()) as { template: TicketTemplate };
      onSaved({ ...data.template, canEdit: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-template-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3
            id="save-template-title"
            className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-1)]"
          >
            <BookmarkPlus size={16} className="text-[var(--color-accent)]" aria-hidden />
            Guardar plantilla
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)]"
            aria-label="Cerrar"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-[var(--color-text-2)]">
            Nombre
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Climatización trasera averiada"
              maxLength={80}
              autoFocus
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--color-text-2)]">
            Categoría <span className="text-[var(--color-text-3)]">(opcional)</span>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej. Aire acondicionado"
              maxLength={80}
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--color-text-2)]">
            Visibilidad
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value as "personal" | "global")}
              disabled={!canShare}
              className="mt-1"
            >
              <option value="personal">Solo para mí</option>
              <option value="global" disabled={!canShare}>
                Compartida con todo el centro de control{canShare ? "" : " (requiere gestor)"}
              </option>
            </Select>
          </label>
          {error ? <p className="text-xs text-[var(--color-error)]">{error}</p> : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
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
  );
}
