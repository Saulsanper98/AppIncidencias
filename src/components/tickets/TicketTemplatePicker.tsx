"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookmarkPlus, Check, Save } from "lucide-react";

import { CreateTicketTemplateDialog } from "@/components/tickets/CreateTicketTemplateDialog";
import { TemplateDropdown } from "@/components/tickets/TemplateDropdown";
import type { FormState } from "@/components/tickets/tickets-module-types";
import type { SessionUser } from "@/lib/domain";
import type { TipologiaItem } from "@/lib/tipologia";
import { cn } from "@/lib/utils";

import "./ticket-templates.css";

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
  tipologias: TipologiaItem[];
  /** Compat: ignorado. */
  embedded?: boolean;
  /** Compat: ignorado. */
  defaultExpanded?: boolean;
};

/**
 * Barra de una sola fila dentro del panel del formulario.
 * Misma altura y tipografía que Bus / Línea / etc.
 */
export function TicketTemplatePicker({
  form,
  setForm,
  sessionUser,
  tipologias,
}: Props) {
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [appliedFlash, setAppliedFlash] = useState(false);
  const flashRef = useRef<number | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets/templates", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { templates: TicketTemplate[] };
      setTemplates(data.templates ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(
    () => () => {
      if (flashRef.current) window.clearTimeout(flashRef.current);
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
        impactedLines:
          typeof tpl.impactedLines === "number" ? tpl.impactedLines : prev.impactedLines,
        serviceStopped:
          tpl.serviceStopped === null || tpl.serviceStopped === undefined
            ? prev.serviceStopped
            : tpl.serviceStopped,
        lineaLabel: tpl.lineaLabel ?? prev.lineaLabel,
        servicioLabel: tpl.servicioLabel ?? prev.servicioLabel,
        comment: tpl.commentInitial?.trim() ? tpl.commentInitial : prev.comment,
      }));
      setSelectedId(tpl.id);
      setAppliedFlash(true);
      if (flashRef.current) window.clearTimeout(flashRef.current);
      flashRef.current = window.setTimeout(() => setAppliedFlash(false), 1600);
    },
    [setForm],
  );

  const canSaveTemplate = Boolean(form.title || form.description || form.tipo);

  return (
    <div
      className={cn("ticket-form-template-bar", appliedFlash && "ticket-form-template-bar--applied")}
      role="group"
      aria-label="Plantilla de ticket"
    >
      <span className="ticket-form-template-bar__label">
        {appliedFlash ? (
          <>
            <Check size={12} strokeWidth={2.4} aria-hidden />
            Aplicada
          </>
        ) : (
          "Plantilla"
        )}
      </span>

      <TemplateDropdown
        compact
        className="ticket-form-template-bar__select"
        templates={templates}
        value={selectedId}
        loading={loading}
        placeholder={loading ? "Cargando…" : "Opcional · rellenar desde plantilla"}
        aria-label="Elegir plantilla de ticket"
        onChange={(id) => {
          const tpl = templates.find((t) => t.id === id);
          if (tpl) applyTemplate(tpl);
          else setSelectedId("");
        }}
      />

      <div className="ticket-form-template-bar__actions">
        <button
          type="button"
          className="ticket-form-template-bar__icon-btn"
          onClick={() => setShowCreateDialog(true)}
          title="Nueva plantilla"
          aria-label="Nueva plantilla"
        >
          <BookmarkPlus size={14} strokeWidth={1.9} aria-hidden />
        </button>
        <button
          type="button"
          className="ticket-form-template-bar__icon-btn"
          onClick={() => setShowSaveDialog(true)}
          disabled={!canSaveTemplate}
          title="Guardar formulario actual como plantilla"
          aria-label="Guardar formulario como plantilla"
        >
          <Save size={14} strokeWidth={1.9} aria-hidden />
        </button>
      </div>

      {showSaveDialog ? (
        <CreateTicketTemplateDialog
          sessionUser={sessionUser}
          tipologias={tipologias}
          initialValues={form}
          onClose={() => setShowSaveDialog(false)}
          onSaved={(tpl) => {
            setTemplates((prev) => [...prev, tpl]);
            setShowSaveDialog(false);
          }}
        />
      ) : null}

      {showCreateDialog ? (
        <CreateTicketTemplateDialog
          sessionUser={sessionUser}
          tipologias={tipologias}
          onClose={() => setShowCreateDialog(false)}
          onSaved={(tpl) => {
            setTemplates((prev) => [...prev, tpl]);
            setShowCreateDialog(false);
          }}
        />
      ) : null}
    </div>
  );
}
