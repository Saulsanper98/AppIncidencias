"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardPen, Loader2 } from "lucide-react";

import type { CatalogBus, TicketView } from "@/components/tickets/tickets-module-types";
import { TipologiaPickerSection, applyGenericTipologiaToForm } from "@/components/tickets/TipologiaPickerSection";
import { Button } from "@/components/ui/button";
import { DateTimePickerField } from "@/components/ui/datetime-picker-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { TypeaheadInput } from "@/components/ui/typeahead-input";
import type { SessionUser } from "@/lib/domain";
import {
  collectOperatorPrefixes,
  formatPrefixHint,
  validateOptionalLineaLabel,
} from "@/lib/catalog-id-format";
import { GENERIC_TIPO, type NivelImpacto, type TipologiaItem } from "@/lib/tipologia";
import { resolveBusIdForForm } from "@/lib/ticket-bus-asset";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  ticket: TicketView | null;
  catalog: CatalogBus[];
  lineas: string[];
  tipologias: TipologiaItem[];
  sessionUser: SessionUser | null;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function DraftCompleteDialog({
  open,
  ticket,
  catalog,
  lineas,
  tipologias,
  sessionUser,
  onClose,
  onCompleted,
}: Props) {
  const [busId, setBusId] = useState("");
  const [tipo, setTipo] = useState("");
  const [subtipo, setSubtipo] = useState("");
  const [subsubtipo, setSubsubtipo] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lineaLabel, setLineaLabel] = useState("");
  const [servicioLabel, setServicioLabel] = useState("");
  const [conductorLabel, setConductorLabel] = useState("");
  const [incidentAt, setIncidentAt] = useState("");
  const [impactedLines, setImpactedLines] = useState(1);
  const [serviceStopped, setServiceStopped] = useState(false);
  const [assignToMe, setAssignToMe] = useState(true);
  const [targetStatus, setTargetStatus] = useState<"abierto" | "resuelto">("abierto");
  const [resolutionNote, setResolutionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogPrefixes = useMemo(() => collectOperatorPrefixes(catalog.map((b) => b.id)), [catalog]);
  const busOptions = useMemo(() => catalog.map((bus) => ({ value: bus.id, hint: bus.operator })), [catalog]);
  const busValidation = useMemo(
    () => resolveBusIdForForm(busId.trim(), catalog.map((b) => b.id), catalogPrefixes),
    [busId, catalog, catalogPrefixes],
  );
  const lineaCheck = useMemo(
    () => validateOptionalLineaLabel(lineaLabel, lineas, catalogPrefixes),
    [lineaLabel, lineas, catalogPrefixes],
  );

  const tipos = useMemo(() => Array.from(new Set(tipologias.map((t) => t.tipo))), [tipologias]);
  const subtipos = useMemo(
    () => Array.from(new Set(tipologias.filter((t) => t.tipo === tipo).map((t) => t.subtipo))),
    [tipologias, tipo],
  );
  const selectedTipologia = useMemo(
    () =>
      tipologias.find((t) => t.tipo === tipo && t.subtipo === subtipo && t.subsubtipo === subsubtipo) ?? null,
    [tipologias, tipo, subtipo, subsubtipo],
  );

  const applyTipologiaSelection = useCallback((item: TipologiaItem) => {
    setTipo(item.tipo);
    setSubtipo(item.subtipo);
    setSubsubtipo(item.subsubtipo);
  }, []);

  const resetTipologiaForSearch = useCallback(() => {
    setTipo("");
    setSubtipo("");
    setSubsubtipo("");
  }, []);

  useEffect(() => {
    if (!open || !ticket) return;
    setBusId(ticket.busId);
    setTipo(ticket.tipo ?? "");
    setSubtipo(ticket.subtipo ?? "");
    setSubsubtipo(ticket.subsubtipo ?? "");
    setTitle(ticket.title);
    setDescription(ticket.description);
    setLineaLabel(ticket.lineaLabel ?? "");
    setServicioLabel(ticket.servicioLabel ?? "");
    setConductorLabel(ticket.conductorLabel ?? "");
    setIncidentAt(toDatetimeLocal(ticket.incidentOccurredAt ?? ticket.createdAt));
    setImpactedLines(1);
    setServiceStopped(false);
    setAssignToMe(
      sessionUser?.role === "tecnico_campo" || sessionUser?.role === "gestor_centro_control",
    );
    setTargetStatus(ticket.status === "resuelto" ? "resuelto" : "abierto");
    setResolutionNote("");
    setError(null);
  }, [open, ticket, sessionUser?.role]);

  const handleSubmit = async () => {
    if (!ticket || !sessionUser) return;
    if (!busValidation.ok) {
      setError(busValidation.message);
      return;
    }
    if (!selectedTipologia) {
      setError("Selecciona una tipología completa.");
      return;
    }
    if (!lineaCheck.ok) {
      setError(lineaCheck.message);
      return;
    }
    if (title.trim().length < 3) {
      setError("El título debe tener al menos 3 caracteres.");
      return;
    }
    if (description.trim().length < 8) {
      setError("La descripción debe tener al menos 8 caracteres.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/promote-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busId: busValidation.normalized,
          tipo: selectedTipologia.tipo,
          subtipo: selectedTipologia.subtipo,
          subsubtipo: selectedTipologia.subsubtipo,
          dominio: selectedTipologia.dominio,
          nivelImpacto: selectedTipologia.nivelImpacto as NivelImpacto,
          origenTecnico: selectedTipologia.origenTecnico,
          observaciones: selectedTipologia.observaciones,
          title: title.trim(),
          description: description.trim(),
          impactedLines,
          serviceStopped,
          lineaLabel: lineaCheck.normalized,
          servicioLabel: servicioLabel.trim() || null,
          conductorLabel: conductorLabel.trim() || null,
          incidentOccurredAt: incidentAt ? new Date(incidentAt).toISOString() : undefined,
          assignToMe,
          targetStatus,
          resolutionNote: targetStatus === "resuelto" ? resolutionNote.trim() || undefined : undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(payload.message ?? "No se pudo completar el borrador.");
        return;
      }
      await onCompleted();
      onClose();
    } catch {
      setError("Error de red al completar el borrador.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Completar apunte"
      maxWidth="42rem"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ClipboardPen size={14} aria-hidden />}
            Completar ticket
          </Button>
        </>
      }
    >
      {ticket ? (
        <div className="space-y-4 text-sm">
          <p className="text-xs text-[var(--color-text-3)]">
            #{ticket.id.slice(-8).toUpperCase()} · {ticket.busId}
          </p>
          {error ? (
            <p role="alert" className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-[var(--color-error)]">
              {error}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-[var(--color-text-2)]">Bus</label>
              <TypeaheadInput value={busId} onValueChange={setBusId} options={busOptions} />
              <p className="text-[11px] text-[var(--color-text-3)]">{formatPrefixHint(catalogPrefixes)}</p>
            </div>

            <div className="sm:col-span-2">
              <TipologiaPickerSection
                tipologias={tipologias}
                isGenericTipo={tipo === GENERIC_TIPO}
                tipo={tipo}
                subtipo={subtipo}
                availableTipos={tipos}
                availableSubtipos={subtipos}
                selectedTipologia={selectedTipologia}
                onSelect={applyTipologiaSelection}
                onSearchStart={resetTipologiaForSearch}
                onTipoChange={(nextTipo) => {
                  setTipo(nextTipo);
                  setSubtipo("");
                  setSubsubtipo("");
                }}
                onSubtipoChange={(nextSubtipo) => {
                  setSubtipo(nextSubtipo);
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

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-[var(--color-text-2)]">Título</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-[var(--color-text-2)]">Descripción</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--color-text-2)]">Hora incidencia</label>
              <DateTimePickerField value={incidentAt} onChange={setIncidentAt} ariaLabel="Hora de la incidencia" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--color-text-2)]">Al completar</label>
              <Select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as "abierto" | "resuelto")}>
                <option value="abierto">Abrir ticket</option>
                <option value="resuelto">Cerrar resuelto</option>
              </Select>
            </div>

            {targetStatus === "resuelto" ? (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-[var(--color-text-2)]">Nota de cierre (opcional)</label>
                <Input value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
              </div>
            ) : null}

            <label className={cn("flex items-center gap-2 text-xs sm:col-span-2", !assignToMe && "opacity-80")}>
              <input
                type="checkbox"
                checked={assignToMe}
                onChange={(e) => setAssignToMe(e.target.checked)}
                className="rounded border-[var(--color-border)]"
              />
              Asignarme el ticket al completar
            </label>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}
