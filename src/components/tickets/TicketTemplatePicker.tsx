"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Check, ChevronDown, Layers, Loader2, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
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
  /** Campos enriquecidos (Fase 2 sugerencia OP03 "ticket rápido"). */
  impactedLines: number | null;
  serviceStopped: boolean | null;
  lineaLabel: string | null;
  servicioLabel: string | null;
  commentInitial: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

type Props = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  sessionUser: SessionUser | null;
  /** Sin cáscara colapsable: contenido directo (p. ej. dentro de «Más contexto»). */
  embedded?: boolean;
};

function templateSubtitle(tpl: TicketTemplate): string {
  const tipologia = [tpl.tipo, tpl.subtipo, tpl.subsubtipo].filter(Boolean).join(" · ");
  if (tipologia) return tipologia;
  if (tpl.description?.trim()) return tpl.description.trim().slice(0, 72);
  return "Sin detalles";
}

/**
 * Selector de plantillas + acción "Guardar como plantilla".
 *
 * Vive en la cabecera del formulario (fuera del acordeón de pasos) como
 * franja colapsable premium. Solo carga el listado al expandir por primera vez.
 */
export function TicketTemplatePicker({ form, setForm, sessionUser, embedded = false }: Props) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(embedded);
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
    if ((expanded || embedded) && templates === null) {
      void loadTemplates();
    }
  }, [expanded, embedded, templates, loadTemplates]);

  useEffect(
    () => () => {
      if (appliedTimeoutRef.current) window.clearTimeout(appliedTimeoutRef.current);
    },
    [],
  );

  const applyTemplate = useCallback(
    (tpl: TicketTemplate) => {
      setForm((prev) => ({
        ...prev,
        title: tpl.title ?? prev.title,
        description: tpl.description ?? prev.description,
        tipo: tpl.tipo ?? prev.tipo,
        subtipo: tpl.subtipo ?? prev.subtipo,
        subsubtipo: tpl.subsubtipo ?? prev.subsubtipo,
        impactedLines: tpl.impactedLines ?? prev.impactedLines,
        serviceStopped:
          tpl.serviceStopped === null || tpl.serviceStopped === undefined
            ? prev.serviceStopped
            : tpl.serviceStopped,
        lineaLabel: tpl.lineaLabel ?? prev.lineaLabel,
        servicioLabel: tpl.servicioLabel ?? prev.servicioLabel,
        comment: tpl.commentInitial ?? prev.comment,
      }));
      setAppliedId(tpl.id);
      if (appliedTimeoutRef.current) window.clearTimeout(appliedTimeoutRef.current);
      appliedTimeoutRef.current = window.setTimeout(() => setAppliedId(null), 2200);
    },
    [setForm],
  );

  const deleteTemplate = useCallback(async (tpl: TicketTemplate) => {
    if (!tpl.canEdit) return;
    const ok = window.confirm(`¿Eliminar la plantilla "${tpl.name}"?`);
    if (!ok) return;
    const res = await fetch(`/api/tickets/templates/${tpl.id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => (prev ?? []).filter((t) => t.id !== tpl.id));
    }
  }, []);

  const grouped = useMemo(() => {
    if (!templates) return [] as { key: string; label: string; items: TicketTemplate[] }[];
    const byKey = new Map<string, { key: string; label: string; items: TicketTemplate[] }>();
    for (const t of templates) {
      const key = `${t.scope}::${t.category ?? "—"}`;
      const label =
        (t.scope === "global" ? "Compartidas" : "Mis plantillas") + (t.category ? ` · ${t.category}` : "");
      if (!byKey.has(key)) byKey.set(key, { key, label, items: [] });
      byKey.get(key)!.items.push(t);
    }
    return Array.from(byKey.values());
  }, [templates]);

  const canSaveTemplate = Boolean(form.title || form.description || form.tipo);

  const panelBody = (
    <div className={cn("ccmgc-template-panel", embedded && "!border-0 !bg-transparent !p-0")}>
      <div className="ccmgc-template-panel__toolbar">
        <p className="ccmgc-template-panel__intro">
          Aplica una plantilla y ajusta lo que necesites. El bus y el equipo no se modifican.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ccmgc-template-save-btn shrink-0"
          onClick={() => setShowSaveDialog(true)}
          disabled={!canSaveTemplate}
          title="Guardar los valores actuales como plantilla"
        >
          <BookmarkPlus size={13} className="mr-1.5" aria-hidden />
          Guardar como plantilla
        </Button>
      </div>

      {loading ? (
        <div className="ccmgc-template-panel__state">
          <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" aria-hidden />
          <span>Cargando plantillas…</span>
        </div>
      ) : error ? (
        <div className="ccmgc-template-panel__state ccmgc-template-panel__state--error">
          <span>{error}</span>
          <button type="button" className="ccmgc-template-retry" onClick={() => void loadTemplates()}>
            Reintentar
          </button>
        </div>
      ) : templates && templates.length === 0 ? (
        <div className="ccmgc-template-panel__empty">
          <Layers size={18} className="text-[var(--color-text-3)]" aria-hidden />
          <p>Aún no hay plantillas guardadas.</p>
          <p className="text-[11px] text-[var(--color-text-3)]">
            Rellena el formulario y pulsa «Guardar como plantilla».
          </p>
        </div>
      ) : (
        <div className="ccmgc-template-panel__groups">
          {grouped.map((group) => (
            <section key={group.key} className="ccmgc-template-group">
              <h4 className="ccmgc-template-group__title">{group.label}</h4>
              <ul className="ccmgc-template-grid">
                {group.items.map((tpl) => {
                  const applied = appliedId === tpl.id;
                  return (
                    <li key={tpl.id}>
                      <div
                        className={cn(
                          "ccmgc-template-card group",
                          applied && "ccmgc-template-card--applied",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => applyTemplate(tpl)}
                          className="ccmgc-template-card__main"
                          title={tpl.title ?? tpl.description ?? "Aplicar plantilla"}
                        >
                          <span className="ccmgc-template-card__name">{tpl.name}</span>
                          <span className="ccmgc-template-card__meta">{templateSubtitle(tpl)}</span>
                        </button>
                        <div className="ccmgc-template-card__actions">
                          {applied ? (
                            <span className="ccmgc-template-card__applied" aria-live="polite">
                              <Check size={13} strokeWidth={2.5} aria-hidden />
                              <span className="sr-only">Aplicada</span>
                            </span>
                          ) : null}
                          {tpl.canEdit ? (
                            <button
                              type="button"
                              onClick={() => deleteTemplate(tpl)}
                              className="ccmgc-template-card__delete"
                              title="Eliminar plantilla"
                              aria-label={`Eliminar plantilla ${tpl.name}`}
                            >
                              <Trash2 size={12} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );

  const saveDialog = showSaveDialog ? (
    <SaveTemplateDialog
      form={form}
      sessionUser={sessionUser}
      onClose={() => setShowSaveDialog(false)}
      onSaved={(tpl) => {
        setTemplates((prev) => [...(prev ?? []), tpl]);
        setShowSaveDialog(false);
      }}
    />
  ) : null;

  if (embedded) {
    return (
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-eyebrow">
          <Sparkles size={13} strokeWidth={1.75} aria-hidden />
          Plantillas de ticket
        </h4>
        {panelBody}
        {saveDialog}
      </div>
    );
  }

  return (
    <div className={cn("ccmgc-template-shell", expanded && "ccmgc-template-shell--open")}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="ccmgc-template-trigger"
      >
        <span className="ccmgc-template-trigger__lead">
          <span className="ccmgc-template-trigger__icon" aria-hidden>
            <Sparkles size={15} strokeWidth={1.75} />
          </span>
          <span className="ccmgc-template-trigger__copy">
            <span className="ccmgc-template-trigger__title">Plantillas de ticket</span>
            <span className="ccmgc-template-trigger__hint">Rellena tipología y detalle con un clic</span>
          </span>
        </span>
        <span className="ccmgc-template-trigger__meta">
          {templates ? (
            <span className="ccmgc-template-trigger__count" aria-label={`${templates.length} plantillas`}>
              {templates.length}
            </span>
          ) : expanded ? (
            <Loader2 size={12} className="animate-spin text-[var(--color-text-3)]" aria-hidden />
          ) : null}
          <span className={cn("ccmgc-template-trigger__chevron", expanded && "ccmgc-template-trigger__chevron--open")}>
            <ChevronDown size={14} strokeWidth={2.25} aria-hidden />
          </span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="template-panel"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            {panelBody}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {saveDialog}
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
  const [includeOperationalFields, setIncludeOperationalFields] = useState(true);
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
          ...(includeOperationalFields
            ? {
                impactedLines: form.impactedLines,
                serviceStopped: form.serviceStopped,
                lineaLabel: form.lineaLabel || null,
                servicioLabel: form.servicioLabel || null,
                commentInitial: form.comment || null,
              }
            : {}),
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
    <ModalShell
      open
      onClose={onClose}
      size="md"
      shake={Boolean(error)}
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <BookmarkPlus size={16} className="text-[var(--color-accent)]" aria-hidden />
          Guardar plantilla
        </span>
      }
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="save-template-form" variant="primary" size="sm" disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" aria-hidden /> Guardando…
              </span>
            ) : (
              "Guardar"
            )}
          </Button>
        </>
      }
    >
      <form id="save-template-form" onSubmit={handleSubmit} className="space-y-3">
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
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-2.5">
          <input
            type="checkbox"
            checked={includeOperationalFields}
            onChange={(e) => setIncludeOperationalFields(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]/40"
          />
          <span>
            <span className="block text-[12.5px] font-medium text-[var(--color-text-1)]">
              Incluir variables operativas
            </span>
            <span className="block text-[11px] text-[var(--color-text-3)]">
              Líneas afectadas, servicio detenido, línea/servicio y comentario inicial. Recomendado para plantillas
              tipo «Salto de viaje».
            </span>
          </span>
        </label>
        {error ? <p className="text-xs text-[var(--color-error)]">{error}</p> : null}
      </form>
    </ModalShell>
  );
}
