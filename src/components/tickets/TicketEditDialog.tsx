"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import type { CatalogBus } from "@/components/tickets/tickets-module-types";
import { TipologiaPickerSection, applyGenericTipologiaToForm } from "@/components/tickets/TipologiaPickerSection";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { TypeaheadInput } from "@/components/ui/typeahead-input";
import { ModalShell } from "@/components/ui/modal-shell";
import type { SessionUser } from "@/lib/domain";
import {
  collectOperatorPrefixes,
  formatPrefixHint,
  validateOptionalLineaLabel,
} from "@/lib/catalog-id-format";
import { resolveBusIdForForm } from "@/lib/ticket-bus-asset";
import { GENERIC_TIPO, type TipologiaItem } from "@/lib/tipologia";
import { cn } from "@/lib/utils";

type EditableTicket = {
  id: string;
  busId: string;
  assetId: string;
  tipo?: string | null;
  subtipo?: string | null;
  subsubtipo?: string | null;
  dominio?: string | null;
  nivelImpacto?: string | null;
  origenTecnico?: string | null;
  observaciones?: string | null;
  title: string;
  description: string;
  lineaLabel?: string | null;
  servicioLabel?: string | null;
  conductorLabel?: string | null;
};

type EditFormState = {
  busId: string;
  tipo: string;
  subtipo: string;
  subsubtipo: string;
  dominio: string;
  nivelImpacto: "Alto" | "Medio" | "Bajo";
  origenTecnico: string;
  observaciones: string;
  title: string;
  description: string;
  lineaLabel: string;
  servicioLabel: string;
  conductorLabel: string;
  reason: string;
};

function formFromTicket(ticket: EditableTicket): EditFormState {
  return {
    busId: ticket.busId,
    tipo: ticket.tipo ?? "",
    subtipo: ticket.subtipo ?? "",
    subsubtipo: ticket.subsubtipo ?? "",
    dominio: ticket.dominio ?? "",
    nivelImpacto: (ticket.nivelImpacto as EditFormState["nivelImpacto"]) || "Medio",
    origenTecnico: ticket.origenTecnico ?? "",
    observaciones: ticket.observaciones ?? "",
    title: ticket.title,
    description: ticket.description,
    lineaLabel: ticket.lineaLabel ?? "",
    servicioLabel: ticket.servicioLabel ?? "",
    conductorLabel: ticket.conductorLabel ?? "",
    reason: "",
  };
}

type Props = {
  ticket: EditableTicket;
  sessionUser: SessionUser;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export function TicketEditDialog({ ticket, sessionUser, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EditFormState>(() => formFromTicket(ticket));
  const [buses, setBuses] = useState<CatalogBus[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [tipologias, setTipologias] = useState<TipologiaItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(formFromTicket(ticket));
    setError(null);
    setLoadingCatalog(true);
    void Promise.all([
      fetch("/api/catalog", { cache: "no-store" }).then(async (res) => {
        if (!res.ok) throw new Error("catalog");
        const data = (await res.json()) as { buses: CatalogBus[]; tipologias: TipologiaItem[] };
        setBuses(data.buses ?? []);
        setTipologias(data.tipologias ?? []);
      }),
      fetch("/api/lineas", { cache: "no-store" }).then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { lineas?: string[] };
        setLineas(data.lineas ?? []);
      }),
    ])
      .catch(() => setError("No se pudo cargar el catálogo."))
      .finally(() => setLoadingCatalog(false));
  }, [open, ticket]);

  const availableTipos = useMemo(
    () => Array.from(new Set(tipologias.map((item) => item.tipo))).sort((a, b) => a.localeCompare(b, "es")),
    [tipologias],
  );
  const availableSubtipos = useMemo(
    () =>
      Array.from(new Set(tipologias.filter((item) => item.tipo === form.tipo).map((item) => item.subtipo))).sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [tipologias, form.tipo],
  );
  const selectedTipologia = useMemo(
    () =>
      tipologias.find(
        (item) =>
          item.tipo === form.tipo && item.subtipo === form.subtipo && item.subsubtipo === form.subsubtipo,
      ),
    [tipologias, form.tipo, form.subtipo, form.subsubtipo],
  );

  const applyTipologiaSelection = useCallback((item: TipologiaItem) => {
    setForm((prev) => ({
      ...prev,
      tipo: item.tipo,
      subtipo: item.subtipo,
      subsubtipo: item.subsubtipo,
      dominio: item.dominio,
      nivelImpacto: item.nivelImpacto as EditFormState["nivelImpacto"],
      origenTecnico: item.origenTecnico,
      observaciones: item.observaciones,
    }));
  }, []);

  const resetTipologiaForSearch = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      tipo: "",
      subtipo: "",
      subsubtipo: "",
      dominio: "",
      nivelImpacto: "Medio",
      origenTecnico: "",
      observaciones: "",
    }));
  }, []);

  const selectedBus = useMemo(() => buses.find((b) => b.id === form.busId), [buses, form.busId]);
  const catalogPrefixes = useMemo(
    () => collectOperatorPrefixes([...buses.map((b) => b.id), ...lineas]),
    [buses, lineas],
  );
  const busIdValidation = useMemo(
    () => resolveBusIdForForm(form.busId.trim(), buses.map((b) => b.id), catalogPrefixes),
    [form.busId, buses, catalogPrefixes],
  );
  const lineaValidation = useMemo(
    () => validateOptionalLineaLabel(form.lineaLabel, lineas, catalogPrefixes),
    [form.lineaLabel, lineas, catalogPrefixes],
  );
  const busTypeaheadOptions = useMemo(
    () =>
      buses.map((bus) => ({
        value: bus.id,
        hint: [bus.operator || "Sin asignar", bus.municipio].filter(Boolean).join(" · "),
      })),
    [buses],
  );
  const lineaTypeaheadOptions = useMemo(
    () =>
      Array.from(new Set([...(selectedBus?.lineas ?? []), ...lineas, form.lineaLabel].filter(Boolean))).map(
        (linea) => ({ value: linea }),
      ),
    [selectedBus?.lineas, lineas, form.lineaLabel],
  );

  const buildPatchBody = () => {
    const body: Record<string, string | null> = { reason: form.reason.trim() };
    const initial = formFromTicket(ticket);

    if (form.busId.trim() !== initial.busId) body.busId = busIdValidation.ok ? busIdValidation.normalized : form.busId.trim();
    if (form.title.trim() !== initial.title) body.title = form.title.trim();
    if (form.description.trim() !== initial.description) body.description = form.description.trim();
    if (form.tipo !== initial.tipo) body.tipo = form.tipo;
    if (form.subtipo !== initial.subtipo) body.subtipo = form.subtipo;
    if (form.subsubtipo !== initial.subsubtipo) body.subsubtipo = form.subsubtipo;
    if (form.dominio !== initial.dominio) body.dominio = form.dominio;
    if (form.nivelImpacto !== initial.nivelImpacto) body.nivelImpacto = form.nivelImpacto;
    if (form.origenTecnico !== initial.origenTecnico) body.origenTecnico = form.origenTecnico;
    if (form.observaciones !== initial.observaciones) body.observaciones = form.observaciones;
    if (form.lineaLabel.trim() !== initial.lineaLabel) {
      body.lineaLabel = lineaValidation.ok ? (lineaValidation.normalized ?? "") : form.lineaLabel.trim();
      if (body.lineaLabel === "") body.lineaLabel = null;
    }
    if (form.servicioLabel.trim() !== initial.servicioLabel) body.servicioLabel = form.servicioLabel.trim() || null;
    if (form.conductorLabel.trim() !== initial.conductorLabel) body.conductorLabel = form.conductorLabel.trim() || null;

    return body;
  };

  const handleSave = async () => {
    setError(null);
    if (form.reason.trim().length < 3) {
      setError("Indica el motivo de la corrección (mín. 3 caracteres).");
      return;
    }
    if (!form.title.trim() || form.title.trim().length < 3) {
      setError("El título debe tener al menos 3 caracteres.");
      return;
    }
    if (!form.description.trim() || form.description.trim().length < 8) {
      setError("La descripción debe tener al menos 8 caracteres.");
      return;
    }
    if (!form.tipo || !form.subtipo || !form.subsubtipo) {
      setError("Completa la tipología (tipo, subtipo e incidencia).");
      return;
    }
    if (!busIdValidation.ok) {
      setError(busIdValidation.message);
      return;
    }
    if (!lineaValidation.ok) {
      setError(lineaValidation.message);
      return;
    }

    const body = buildPatchBody();
    const changeKeys = Object.keys(body).filter((k) => k !== "reason");
    if (changeKeys.length === 0) {
      setError("No hay cambios respecto al ticket actual.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticket.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": sessionUser.id,
          "x-user-role": sessionUser.role,
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message ?? "No se pudo guardar la corrección.");
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setError("No se pudo guardar la corrección.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Corregir datos del ticket"
      maxWidth="36rem"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" size="md" onClick={() => void handleSave()} disabled={saving || loadingCatalog}>
            {saving ? "Guardando…" : "Guardar corrección"}
          </Button>
        </div>
      }
    >
      {loadingCatalog ? (
        <p className="text-sm text-[var(--color-text-3)]">Cargando catálogo…</p>
      ) : (
        <div className="max-h-[min(70vh,32rem)] space-y-4 overflow-y-auto pr-1">
          <p className="text-xs text-[var(--color-text-3)]">
            Los cambios quedan registrados en el historial con el motivo que indiques.
          </p>
          <label className="block space-y-1">
            <span className="text-label">Bus</span>
            <TypeaheadInput
              value={form.busId}
              onValueChange={(next) => setForm((prev) => ({ ...prev, busId: next.toUpperCase() }))}
              options={busTypeaheadOptions}
              maxSuggestions={15}
              placeholder={catalogPrefixes.length ? `Ej: ${formatPrefixHint(catalogPrefixes)}` : "Ej: GF-11018"}
              autoComplete="off"
              spellCheck={false}
              emptyMessage="Sin buses en catálogo con ese criterio"
              aria-invalid={form.busId.trim() !== "" && !busIdValidation.ok}
            />
            {form.busId.trim() && !busIdValidation.ok ? (
              <p className="text-[11px] text-[var(--color-danger)]" role="status">
                {busIdValidation.message}
              </p>
            ) : null}
          </label>

          <TipologiaPickerSection
            tipologias={tipologias}
            isGenericTipo={form.tipo === GENERIC_TIPO}
            tipo={form.tipo}
            subtipo={form.subtipo}
            availableTipos={availableTipos}
            availableSubtipos={availableSubtipos}
            selectedTipologia={selectedTipologia}
            onSelect={applyTipologiaSelection}
            onSearchStart={resetTipologiaForSearch}
            onTipoChange={(nextTipo) =>
              setForm((prev) => ({
                ...prev,
                tipo: nextTipo,
                subtipo: "",
                subsubtipo: "",
              }))
            }
            onSubtipoChange={(nextSubtipo) =>
              setForm((prev) => ({
                ...prev,
                subtipo: nextSubtipo,
                subsubtipo: "",
              }))
            }
            onGenericTipoSelect={() => setForm((prev) => ({ ...prev, ...applyGenericTipologiaToForm() }))}
            showGuide={false}
          />

          <label className="block space-y-1">
            <span className="text-label">Título</span>
            <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} maxLength={240} />
          </label>

          <label className="block space-y-1">
            <span className="text-label">Descripción</span>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={4}
              maxLength={8000}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-label">Línea</span>
              <TypeaheadInput
                value={form.lineaLabel}
                onValueChange={(next) => setForm((prev) => ({ ...prev, lineaLabel: next }))}
                options={lineaTypeaheadOptions}
                maxSuggestions={15}
                placeholder={catalogPrefixes.length ? `Ej: ${formatPrefixHint(catalogPrefixes)}` : "Ej: GL-30"}
                maxLength={120}
                autoComplete="off"
                spellCheck={false}
                emptyMessage="Sin líneas con ese criterio"
                aria-invalid={form.lineaLabel.trim() !== "" && !lineaValidation.ok}
              />
              {form.lineaLabel.trim() && !lineaValidation.ok ? (
                <p className="text-[11px] text-[var(--color-danger)]" role="status">
                  {lineaValidation.message}
                </p>
              ) : null}
            </label>
            <label className="block space-y-1">
              <span className="text-label">Servicio</span>
              <Input
                value={form.servicioLabel}
                onChange={(e) => setForm((prev) => ({ ...prev, servicioLabel: e.target.value }))}
                maxLength={120}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-label">Conductor</span>
              <Input
                value={form.conductorLabel}
                onChange={(e) => setForm((prev) => ({ ...prev, conductorLabel: e.target.value }))}
                maxLength={120}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-label">Motivo de la corrección</span>
            <Textarea
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              rows={3}
              placeholder="Ej: Bus mal tecleado al crear la incidencia desde el móvil."
              className={cn(error && !form.reason.trim() && "border-[var(--color-error)]/50")}
            />
            <span className="text-caption text-[var(--color-text-3)]">{form.reason.trim().length} caracteres (mín. 3)</span>
          </label>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
    </ModalShell>
  );
}

export function TicketEditButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("desvios-action-chip", className)}
      title="Corregir datos del ticket (bus, tipología, descripción…)"
      aria-label="Corregir datos del ticket"
    >
      <Pencil size={12} strokeWidth={1.8} aria-hidden />
      Corregir datos
    </button>
  );
}
