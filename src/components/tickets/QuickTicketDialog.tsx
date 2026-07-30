"use client";

/**
 * Modo "Ticket rápido" (sugerencia de OP03).
 *
 * Objetivo: en partes recurrentes (p.ej. "Salto de viaje en línea X") el
 * técnico solo debería teclear los datos que cambian: bus, servicio,
 * conductor, CP. El resto (tipología, prioridad, líneas afectadas, plantilla
 * de texto…) viene precargado por la plantilla elegida.
 *
 * Flujo:
 *   1. Selecciona una plantilla (filtradas por tipología completa).
 *   2. Rellena los campos variables que la plantilla NO fija.
 *   3. Pulsa Enter o "Crear ticket".
 *   4. Internamente reutilizamos el mismo `handleCreateTicket` que el form
 *      grande, así que respeta validaciones, attachments, SSE, audit, etc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Loader2, Sparkles, Zap } from "lucide-react";

import { CreateTicketTemplateDialog } from "@/components/tickets/CreateTicketTemplateDialog";
import { TemplateDropdown } from "@/components/tickets/TemplateDropdown";
import type { TicketTemplate } from "@/components/tickets/TicketTemplatePicker";
import { defaultForm } from "@/components/tickets/tickets-module-types";
import type {
  CatalogBus,
  CreateTicketPayload,
  FormState,
} from "@/components/tickets/tickets-module-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import type { NivelImpacto, TipologiaItem } from "@/lib/tipologia";
import type { SessionUser } from "@/lib/domain";
import {
  collectOperatorPrefixes,
  formatPrefixHint,
  validateOptionalLineaLabel,
} from "@/lib/catalog-id-format";
import { resolveBusIdForForm } from "@/lib/ticket-bus-asset";
import { cn } from "@/lib/utils";
import { trackUxEvent } from "@/lib/ux-telemetry";

import "./ticket-templates.css";

type Props = {
  open: boolean;
  onClose: () => void;
  catalog: CatalogBus[];
  lineas: string[];
  tipologias: TipologiaItem[];
  sessionUser: SessionUser | null;
  saving: boolean;
  onCreateTicket: (payload: CreateTicketPayload) => Promise<void>;
};

export function QuickTicketDialog({
  open,
  onClose,
  catalog,
  lineas,
  tipologias,
  sessionUser,
  saving,
  onCreateTicket,
}: Props) {
  const [templates, setTemplates] = useState<TicketTemplate[] | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [busId, setBusId] = useState("");
  const [lineaLabel, setLineaLabel] = useState("");
  const [servicioLabel, setServicioLabel] = useState("");
  const [conductorLabel, setConductorLabel] = useState("");
  const [mapPlace, setMapPlace] = useState(""); // municipio/CP de referencia
  const [extraNote, setExtraNote] = useState("");
  const canActorAssumeTicket =
    sessionUser?.role === "tecnico_campo" || sessionUser?.role === "gestor_centro_control";
  const [assignToMe, setAssignToMe] = useState<boolean>(canActorAssumeTicket);
  const [createAsResolved, setCreateAsResolved] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Telemetría: timestamp de apertura del diálogo (para medir cuánto tarda
  // un quick-ticket de principio a fin).
  const dialogOpenedAtRef = useRef<number>(0);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    setTemplateError(null);
    try {
      const res = await fetch("/api/tickets/templates", { cache: "no-store" });
      if (!res.ok) {
        setTemplateError("No se pudieron cargar las plantillas");
        return;
      }
      const data = (await res.json()) as { templates: TicketTemplate[] };
      setTemplates(data.templates ?? []);
    } catch {
      setTemplateError("No se pudieron cargar las plantillas");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  // Recarga plantillas al abrir y resetea estado.
  useEffect(() => {
    if (!open) return;
    dialogOpenedAtRef.current = Date.now();
    trackUxEvent("quickticket_open");
    setSubmitError(null);
    setAssignToMe(canActorAssumeTicket);
    if (templates === null && !loadingTemplates) {
      void loadTemplates();
    }
  }, [open, templates, loadingTemplates, canActorAssumeTicket, loadTemplates]);

  /** Plantillas válidas para ticket rápido: tipología completa + título. */
  const usableTemplates = useMemo(() => {
    if (!templates) return [] as TicketTemplate[];
    return templates
      .filter((t) => t.tipo && t.subtipo && t.subsubtipo && t.title)
      .sort((a, b) => {
        if (a.scope !== b.scope) return a.scope === "global" ? -1 : 1;
        return a.name.localeCompare(b.name, "es");
      });
  }, [templates]);

  const selectedTemplate = useMemo(
    () => usableTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [usableTemplates, selectedTemplateId],
  );

  /** Tipología resuelta para la plantilla elegida (o null si ya no existe). */
  const resolvedTipologia = useMemo<TipologiaItem | null>(() => {
    if (!selectedTemplate) return null;
    return (
      tipologias.find(
        (t) =>
          t.tipo === selectedTemplate.tipo &&
          t.subtipo === selectedTemplate.subtipo &&
          t.subsubtipo === selectedTemplate.subsubtipo,
      ) ?? null
    );
  }, [selectedTemplate, tipologias]);

  const catalogPrefixes = useMemo(
    () => collectOperatorPrefixes([...catalog.map((bus) => bus.id), ...lineas]),
    [catalog, lineas],
  );
  const trimmedBusId = busId.trim();
  const busIdValidation = useMemo(
    () => resolveBusIdForForm(trimmedBusId, catalog.map((bus) => bus.id), catalogPrefixes),
    [trimmedBusId, catalog, catalogPrefixes],
  );
  const lineaValidation = useMemo(
    () => validateOptionalLineaLabel(lineaLabel, lineas, catalogPrefixes),
    [lineaLabel, lineas, catalogPrefixes],
  );
  const canSubmitBusLinea = busIdValidation.ok && lineaValidation.ok;

  // Si la plantilla precarga línea o servicio, prerrellenamos los inputs
  // (el usuario los puede sobreescribir si quiere).
  useEffect(() => {
    if (!selectedTemplate) return;
    if (selectedTemplate.lineaLabel) setLineaLabel(selectedTemplate.lineaLabel);
    if (selectedTemplate.servicioLabel) setServicioLabel(selectedTemplate.servicioLabel);
  }, [selectedTemplate]);

  const reset = useCallback(() => {
    setSelectedTemplateId("");
    setBusId("");
    setLineaLabel("");
    setServicioLabel("");
    setConductorLabel("");
    setMapPlace("");
    setExtraNote("");
    setCreateAsResolved(false);
    setAssignToMe(canActorAssumeTicket);
    setSubmitError(null);
  }, [canActorAssumeTicket]);

  const handleClose = useCallback(() => {
    if (saving) return;
    reset();
    onClose();
  }, [saving, reset, onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!selectedTemplate) {
      setSubmitError("Selecciona una plantilla.");
      return;
    }
    if (!resolvedTipologia) {
      setSubmitError(
        "La tipología de esta plantilla ya no existe. Edítala o usa el formulario completo.",
      );
      return;
    }
    if (!busId.trim()) {
      setSubmitError("Indica el bus.");
      return;
    }
    if (!busIdValidation.ok) {
      setSubmitError(busIdValidation.message);
      return;
    }
    if (!lineaValidation.ok) {
      setSubmitError(lineaValidation.message);
      return;
    }

    // Construimos el FormState completo combinando plantilla + variables.
    const form: FormState = {
      ...defaultForm(busIdValidation.normalized),
      busId: busIdValidation.normalized,
      tipo: resolvedTipologia.tipo,
      subtipo: resolvedTipologia.subtipo,
      subsubtipo: resolvedTipologia.subsubtipo,
      dominio: resolvedTipologia.dominio,
      nivelImpacto: resolvedTipologia.nivelImpacto as NivelImpacto,
      origenTecnico: resolvedTipologia.origenTecnico,
      observaciones: resolvedTipologia.observaciones,
      title: selectedTemplate.title ?? "",
      description: selectedTemplate.description ?? "",
      impactedLines: selectedTemplate.impactedLines ?? 1,
      serviceStopped: selectedTemplate.serviceStopped ?? false,
      comment: [selectedTemplate.commentInitial, extraNote].filter(Boolean).join("\n").trim(),
      lineaLabel: lineaValidation.normalized ?? "",
      servicioLabel: servicioLabel.trim(),
      conductorLabel: conductorLabel.trim(),
      mapLatitude: "",
      mapLongitude: "",
      mapPlaceMunicipio: mapPlace.trim(),
    };

    if (form.title.length < 3) {
      setSubmitError("La plantilla no aporta título suficiente; edítala antes.");
      return;
    }
    if (form.description.length < 8) {
      setSubmitError("La plantilla no aporta descripción suficiente; edítala antes.");
      return;
    }

    const matchedBus = catalog.find((b) => b.id === form.busId) ?? null;

    await onCreateTicket({
      form,
      stagedUploadFiles: [],
      selectedBus: matchedBus,
      selectedAsset: matchedBus?.assets?.[0] ?? null,
      selectedTipologia: resolvedTipologia,
      assignToMe: canActorAssumeTicket ? assignToMe : false,
      createAsResolved: canActorAssumeTicket ? createAsResolved : false,
      resolutionNote: "",
      onTicketCreated: () => {
        // Telemetría: distinguimos los tickets creados desde "Quick Ticket"
        // (con plantilla) de los del formulario completo. Permite ver qué
        // plantillas son las más útiles y cuánto ahorra el modo rápido.
        trackUxEvent(
          "quickticket_complete",
          {
            template_id: selectedTemplate.id,
            template_name: selectedTemplate.name,
            tipo: resolvedTipologia.tipo,
            assign_to_me: canActorAssumeTicket ? assignToMe : false,
            created_as_resolved: canActorAssumeTicket ? createAsResolved : false,
          },
          Date.now() - dialogOpenedAtRef.current,
        );
        reset();
        onClose();
      },
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      variant="sheet"
      shake={Boolean(submitError)}
      maxWidth="32rem"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent)] text-white">
            <Zap size={16} strokeWidth={1.8} aria-hidden />
          </span>
          <span>
            <span className="block text-[15px] font-semibold">Ticket rápido</span>
            <span className="block text-[11.5px] font-normal text-[var(--color-text-3)]">
              Plantilla + datos variables. Atajo:{" "}
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 font-mono text-[10px]">
                Q
              </kbd>
            </span>
          </span>
        </span>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="quick-ticket-form"
            variant="primary"
            size="sm"
            disabled={saving || !selectedTemplate || !canSubmitBusLinea}
            className={cn(createAsResolved && "bg-emerald-600 hover:bg-emerald-700")}
          >
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" aria-hidden /> Guardando…
              </span>
            ) : createAsResolved ? (
              "Crear y cerrar"
            ) : (
              "Crear ticket"
            )}
          </Button>
        </div>
      }
    >
      <form id="quick-ticket-form" onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto">
          <div className="ccmgc-quick-template-field">
            <div className="ccmgc-quick-template-field__head">
              <span className="ccmgc-quick-template-field__label">
                <Sparkles size={11} aria-hidden />
                Plantilla
              </span>
              {!templateError && (usableTemplates.length > 0 || loadingTemplates) ? (
                <button
                  type="button"
                  className="ccmgc-template-new-btn ccmgc-template-new-btn--primary ccmgc-template-new-btn--compact"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <span className="ccmgc-template-new-btn__icon" aria-hidden>
                    <BookmarkPlus size={13} strokeWidth={2} />
                  </span>
                  Nueva plantilla
                </button>
              ) : null}
            </div>

            {templateError ? (
              <p className="text-[12px] text-[var(--color-error)]">{templateError}</p>
            ) : usableTemplates.length === 0 && !loadingTemplates ? (
              <div className="ccmgc-template-panel__empty ccmgc-template-panel__empty--premium !py-4">
                <p className="text-[12px] text-[var(--color-text-2)]">Aún no hay plantillas para ticket rápido.</p>
                <p className="text-[11px] text-[var(--color-text-3)]">
                  Crea una con tipología, título y descripción completos.
                </p>
                <button
                  type="button"
                  className="ccmgc-template-new-btn ccmgc-template-new-btn--primary mt-1"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <span className="ccmgc-template-new-btn__icon" aria-hidden>
                    <BookmarkPlus size={14} strokeWidth={2} />
                  </span>
                  Nueva plantilla
                </button>
              </div>
            ) : (
              <TemplateDropdown
                templates={usableTemplates}
                value={selectedTemplateId}
                onChange={setSelectedTemplateId}
                loading={loadingTemplates}
                placeholder="Elegir plantilla"
                aria-label="Plantilla de ticket rápido"
              />
            )}

            {selectedTemplate ? (
              <div className="flex flex-wrap gap-1.5 text-[10.5px]">
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-text-2)]">
                  {selectedTemplate.tipo} · {selectedTemplate.subtipo}
                </span>
                {selectedTemplate.impactedLines ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                    {selectedTemplate.impactedLines} línea(s)
                  </span>
                ) : null}
                {selectedTemplate.serviceStopped ? (
                  <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">
                    Servicio detenido
                  </span>
                ) : null}
                {selectedTemplate.lineaLabel ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                    Línea {selectedTemplate.lineaLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Variables del parte */}
          {selectedTemplate ? (
            <>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="block">
                  <span className="text-label">Bus *</span>
                  <Input
                    list="quick-ticket-bus-options"
                    value={busId}
                    onChange={(e) => setBusId(e.target.value)}
                    placeholder={catalogPrefixes.length ? `Ej: ${formatPrefixHint(catalogPrefixes)}` : "Ej: GF-11018"}
                    autoComplete="off"
                    spellCheck={false}
                    required
                    aria-invalid={trimmedBusId !== "" && !busIdValidation.ok}
                  />
                  {trimmedBusId && !busIdValidation.ok ? (
                    <p className="mt-1 text-[11px] text-[var(--color-danger)]" role="alert">
                      {busIdValidation.message}
                    </p>
                  ) : null}
                  <datalist id="quick-ticket-bus-options">
                    {catalog.map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.operator}
                        {bus.municipio ? ` · ${bus.municipio}` : ""}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="text-label">Conductor</span>
                  <Input
                    value={conductorLabel}
                    onChange={(e) => setConductorLabel(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    maxLength={120}
                  />
                </label>
                <label className="block">
                  <span className="text-label">
                    Línea
                    {selectedTemplate.lineaLabel ? (
                      <span className="ml-1 text-[10px] text-[var(--color-text-3)]">(de la plantilla)</span>
                    ) : null}
                  </span>
                  <Input
                    list="quick-ticket-linea-options"
                    value={lineaLabel}
                    onChange={(e) => setLineaLabel(e.target.value)}
                    placeholder={catalogPrefixes.length ? `Ej: ${formatPrefixHint(catalogPrefixes)}` : "Ej: GL-1"}
                    maxLength={120}
                    aria-invalid={lineaLabel.trim() !== "" && !lineaValidation.ok}
                  />
                  {lineaLabel.trim() && !lineaValidation.ok ? (
                    <p className="mt-1 text-[11px] text-[var(--color-danger)]" role="alert">
                      {lineaValidation.message}
                    </p>
                  ) : null}
                  <datalist id="quick-ticket-linea-options">
                    {lineas.map((linea) => (
                      <option key={linea} value={linea} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="text-label">
                    Servicio
                    {selectedTemplate.servicioLabel ? (
                      <span className="ml-1 text-[10px] text-[var(--color-text-3)]">(de la plantilla)</span>
                    ) : null}
                  </span>
                  <Input
                    value={servicioLabel}
                    onChange={(e) => setServicioLabel(e.target.value)}
                    placeholder="Turno o código"
                    maxLength={120}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-label">Lugar / CP / Municipio</span>
                  <Input
                    value={mapPlace}
                    onChange={(e) => setMapPlace(e.target.value)}
                    placeholder="Ej: Vecindario, Sardina, Telde…"
                    maxLength={160}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-label">Nota adicional</span>
                  <textarea
                    value={extraNote}
                    onChange={(e) => setExtraNote(e.target.value)}
                    placeholder="(opcional) detalles específicos de este parte"
                    rows={2}
                    className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                  />
                </label>
              </div>

              {canActorAssumeTicket ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-2">
                    <input
                      type="checkbox"
                      checked={assignToMe}
                      onChange={(e) => setAssignToMe(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]/40"
                    />
                    <span className="text-[12px] text-[var(--color-text-1)]">
                      Asignármelo a mí
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-2">
                    <input
                      type="checkbox"
                      checked={createAsResolved}
                      onChange={(e) => setCreateAsResolved(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-border)] text-emerald-500 focus:ring-emerald-400/40"
                    />
                    <span className="text-[12px] text-[var(--color-text-1)]">
                      Crear ya como <span className="text-emerald-300">resuelto</span>
                    </span>
                  </label>
                </div>
              ) : null}
            </>
          ) : null}

          {submitError ? (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              {submitError}
            </p>
          ) : null}
      </form>

      {showCreateDialog ? (
        <CreateTicketTemplateDialog
          sessionUser={sessionUser}
          tipologias={tipologias}
          onClose={() => setShowCreateDialog(false)}
          onSaved={(tpl) => {
            setTemplates((prev) => [...(prev ?? []), tpl]);
            setSelectedTemplateId(tpl.id);
            setShowCreateDialog(false);
          }}
        />
      ) : null}
    </ModalShell>
  );
}
