"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BookmarkPlus, Loader2 } from "lucide-react";

import type { TicketTemplate } from "@/components/tickets/TicketTemplatePicker";
import {
  TipologiaPickerSection,
  applyGenericTipologiaToForm,
} from "@/components/tickets/TipologiaPickerSection";
import type { FormState } from "@/components/tickets/tickets-module-types";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import type { SessionUser } from "@/lib/domain";
import { GENERIC_TIPO, type TipologiaItem } from "@/lib/tipologia";
import { canCreateGroupTicketTemplate } from "@/lib/ticket-templates";

import "./ticket-templates.css";

type Props = {
  sessionUser: SessionUser | null;
  tipologias: TipologiaItem[];
  initialValues?: Partial<FormState>;
  onClose: () => void;
  onSaved: (tpl: TicketTemplate) => void;
};

function FormDivider({ children }: { children: ReactNode }) {
  return (
    <div className="ccmgc-template-form-divider" role="presentation">
      <span className="ccmgc-template-form-divider__label">{children}</span>
    </div>
  );
}

export function CreateTicketTemplateDialog({
  sessionUser,
  tipologias,
  initialValues,
  onClose,
  onSaved,
}: Props) {
  const canShare = canCreateGroupTicketTemplate(sessionUser?.role ?? "conductor");
  const [name, setName] = useState(() => initialValues?.title?.trim().slice(0, 80) ?? "");
  const [scope, setScope] = useState<"personal" | "global">("personal");
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [tipo, setTipo] = useState(initialValues?.tipo ?? "");
  const [subtipo, setSubtipo] = useState(initialValues?.subtipo ?? "");
  const [subsubtipo, setSubsubtipo] = useState(initialValues?.subsubtipo ?? "");
  const [includeOperationalFields, setIncludeOperationalFields] = useState(true);
  const [impactedLines, setImpactedLines] = useState(initialValues?.impactedLines ?? 1);
  const [serviceStopped, setServiceStopped] = useState(initialValues?.serviceStopped ?? false);
  const [lineaLabel, setLineaLabel] = useState(initialValues?.lineaLabel ?? "");
  const [servicioLabel, setServicioLabel] = useState(initialValues?.servicioLabel ?? "");
  const [commentInitial, setCommentInitial] = useState(initialValues?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTipos = useMemo(() => {
    const tipos = Array.from(new Set(tipologias.map((item) => item.tipo)));
    const generic = tipos.find((t) => t === GENERIC_TIPO);
    const rest = tipos.filter((t) => t !== GENERIC_TIPO).sort((a, b) => a.localeCompare(b, "es"));
    return generic ? [...rest, generic] : rest;
  }, [tipologias]);

  const availableSubtipos = useMemo(
    () =>
      Array.from(new Set(tipologias.filter((item) => item.tipo === tipo).map((item) => item.subtipo))).sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [tipologias, tipo],
  );

  const selectedTipologia = useMemo(
    () =>
      tipologias.find((item) => item.tipo === tipo && item.subtipo === subtipo && item.subsubtipo === subsubtipo) ??
      null,
    [tipologias, tipo, subtipo, subsubtipo],
  );

  const applyTipologia = (item: TipologiaItem) => {
    setTipo(item.tipo);
    setSubtipo(item.subtipo);
    setSubsubtipo(item.subsubtipo);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Indica un nombre para la plantilla");
      return;
    }
    if (!title.trim() || title.trim().length < 3) {
      setError("El título debe tener al menos 3 caracteres");
      return;
    }
    if (!description.trim() || description.trim().length < 8) {
      setError("La descripción debe tener al menos 8 caracteres");
      return;
    }
    if (!tipo || !subtipo || !subsubtipo) {
      setError("Selecciona una tipología completa");
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
          title: title.trim(),
          description: description.trim(),
          tipo,
          subtipo,
          subsubtipo,
          ...(includeOperationalFields
            ? {
                impactedLines,
                serviceStopped,
                lineaLabel: lineaLabel.trim() || null,
                servicioLabel: servicioLabel.trim() || null,
                commentInitial: commentInitial.trim() || null,
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
      maxWidth="40rem"
      className="ccmgc-template-modal"
      shake={Boolean(error)}
      title={
        <span className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-1)]">
          <BookmarkPlus size={16} className="text-[var(--color-accent)]" aria-hidden />
          Nueva plantilla
        </span>
      }
      footer={
        <div className="ccmgc-template-modal-footer">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <button type="submit" form="create-template-form" className="ccmgc-template-new-btn" disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              <>
                <BookmarkPlus size={14} strokeWidth={2} aria-hidden />
                Crear plantilla
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="create-template-form" onSubmit={handleSubmit} className="ccmgc-template-modal-form space-y-4">
        <p className="text-[12.5px] leading-relaxed text-[var(--color-text-3)]">
          Atajo reutilizable para tickets nuevos, express o rápidos.
        </p>

        {error ? <p className="ccmgc-template-modal-error">{error}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-[var(--color-text-2)] sm:col-span-2">
            Nombre de la plantilla *
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Desvío no cargado"
              maxLength={80}
              autoFocus
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--color-text-2)]">
            Categoría <span className="font-normal text-[var(--color-text-3)]">(opcional)</span>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej. Desvíos"
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
              <option value="personal">Personal — solo yo</option>
              <option value="global" disabled={!canShare}>
                Del equipo — compartida{canShare ? "" : " (requiere rol operativo)"}
              </option>
            </Select>
          </label>
        </div>

        <FormDivider>Contenido del ticket</FormDivider>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-[var(--color-text-2)]">
            Título *
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título que se rellenará al aplicar la plantilla"
              maxLength={160}
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--color-text-2)]">
            Descripción *
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción base del parte"
              rows={3}
              maxLength={4000}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
            />
          </label>
          <TipologiaPickerSection
            tipologias={tipologias}
            isGenericTipo={tipo === GENERIC_TIPO}
            tipo={tipo}
            subtipo={subtipo}
            availableTipos={availableTipos}
            availableSubtipos={availableSubtipos}
            selectedTipologia={selectedTipologia}
            onSelect={applyTipologia}
            onSearchStart={() => undefined}
            onTipoChange={(next) => {
              setTipo(next);
              setSubtipo("");
              setSubsubtipo("");
            }}
            onSubtipoChange={(next) => {
              setSubtipo(next);
              setSubsubtipo("");
            }}
            onGenericTipoSelect={() => {
              const generic = applyGenericTipologiaToForm();
              setTipo(generic.tipo);
              setSubtipo(generic.subtipo);
              setSubsubtipo(generic.subsubtipo);
            }}
            showGuide={false}
          />
        </div>

        <FormDivider>Variables operativas</FormDivider>

        <label className="flex cursor-pointer items-start gap-2.5 text-[var(--color-text-2)]">
          <input
            type="checkbox"
            checked={includeOperationalFields}
            onChange={(e) => setIncludeOperationalFields(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]/40"
          />
          <span>
            <span className="block text-xs font-medium text-[var(--color-text-1)]">Incluir variables operativas</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--color-text-3)]">
              Línea, servicio, líneas afectadas y comentario inicial. Necesario para Ticket rápido.
            </span>
          </span>
        </label>

        {includeOperationalFields ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-[var(--color-text-2)]">
              Línea (opcional)
              <Input value={lineaLabel} onChange={(e) => setLineaLabel(e.target.value)} maxLength={120} className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-[var(--color-text-2)]">
              Servicio (opcional)
              <Input
                value={servicioLabel}
                onChange={(e) => setServicioLabel(e.target.value)}
                maxLength={120}
                className="mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--color-text-2)]">
              Líneas afectadas
              <Input
                type="number"
                min={1}
                max={10}
                value={impactedLines}
                onChange={(e) => setImpactedLines(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                className="mt-1"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 self-end text-xs text-[var(--color-text-2)]">
              <input
                type="checkbox"
                checked={serviceStopped}
                onChange={(e) => setServiceStopped(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[var(--color-border)] text-[var(--color-accent)]"
              />
              Servicio detenido
            </label>
            <label className="block text-xs font-medium text-[var(--color-text-2)] sm:col-span-2">
              Comentario inicial (opcional)
              <textarea
                value={commentInitial}
                onChange={(e) => setCommentInitial(e.target.value)}
                rows={2}
                maxLength={2000}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
              />
            </label>
          </div>
        ) : null}
      </form>
    </ModalShell>
  );
}
