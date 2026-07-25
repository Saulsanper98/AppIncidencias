"use client";

import { CheckCircle2, ChevronRight, Search, SlidersHorizontal } from "lucide-react";

import { TipologiaIncidenciaTypeahead } from "@/components/tickets/TipologiaIncidenciaTypeahead";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import {
  GENERIC_SUBSUBTIPO,
  GENERIC_SUBTIPO,
  GENERIC_TIPO,
  getGenericTipologia,
  type TipologiaItem,
} from "@/lib/tipologia";
import { getTipoHelp, listTipoHelpEntries } from "@/lib/tipologia-help";
import { cn } from "@/lib/utils";

type TipologiaPickerSectionProps = {
  tipologias: TipologiaItem[];
  isGenericTipo: boolean;
  tipo: string;
  subtipo: string;
  availableTipos: string[];
  availableSubtipos: string[];
  selectedTipologia: TipologiaItem | null | undefined;
  onSelect: (item: TipologiaItem) => void;
  onSearchStart: () => void;
  onTipoChange: (tipo: string) => void;
  onSubtipoChange: (subtipo: string) => void;
  onGenericTipoSelect: () => void;
  showGuide?: boolean;
};

function impactBadgeVariant(nivel: string): "error" | "warning" | "success" {
  if (nivel === "Alto") return "error";
  if (nivel === "Medio") return "warning";
  return "success";
}

export function TipologiaPickerSection({
  tipologias,
  isGenericTipo,
  tipo,
  subtipo,
  availableTipos,
  availableSubtipos,
  selectedTipologia,
  onSelect,
  onSearchStart,
  onTipoChange,
  onSubtipoChange,
  onGenericTipoSelect,
  showGuide = true,
}: TipologiaPickerSectionProps) {
  const hasSelection = Boolean(selectedTipologia && !isGenericTipo);

  return (
    <div className="tipologia-picker">
      {hasSelection ? (
        <div className="tipologia-picker__summary" role="status" aria-live="polite">
          <div className="tipologia-picker__summary-head">
            <CheckCircle2 size={18} className="tipologia-picker__summary-icon" aria-hidden />
            <div className="tipologia-picker__summary-copy">
              <p className="tipologia-picker__summary-title">{selectedTipologia!.subsubtipo}</p>
              <p className="tipologia-picker__summary-path">
                <span>{selectedTipologia!.tipo}</span>
                <ChevronRight size={12} aria-hidden />
                <span>{selectedTipologia!.subtipo}</span>
              </p>
            </div>
          </div>
          <div className="tipologia-picker__meta">
            <Badge variant="info">{selectedTipologia!.dominio}</Badge>
            <Badge variant="neutral">{selectedTipologia!.origenTecnico}</Badge>
            <Badge variant={impactBadgeVariant(selectedTipologia!.nivelImpacto)}>
              Impacto {selectedTipologia!.nivelImpacto}
            </Badge>
          </div>
        </div>
      ) : null}

      <div className={cn("tipologia-picker__search", hasSelection && "tipologia-picker__search--compact")}>
        <label className="tipologia-picker__search-label" htmlFor="tipologia-incidencia-search">
          {hasSelection ? "Cambiar incidencia" : "Buscar incidencia"}
        </label>
        {isGenericTipo ? (
          <Select value={GENERIC_SUBSUBTIPO} disabled id="tipologia-incidencia-search">
            <option value={GENERIC_SUBSUBTIPO}>{GENERIC_SUBSUBTIPO}</option>
          </Select>
        ) : (
          <div className="tipologia-picker__search-field">
            <Search size={16} className="tipologia-picker__search-icon" aria-hidden />
            <TipologiaIncidenciaTypeahead
              id="tipologia-incidencia-search"
              tipologias={tipologias}
              selected={selectedTipologia ?? null}
              onSelect={onSelect}
              onSearchStart={onSearchStart}
              placeholder={
                hasSelection
                  ? "Busca otra incidencia…"
                  : "Escribe incidencia, tipo o subtipo…"
              }
              compact={hasSelection}
            />
          </div>
        )}
        {!hasSelection && !isGenericTipo ? (
          <p className="tipologia-picker__search-hint">
            El catálogo completo se filtra al escribir. Tipo y subtipo se rellenan al elegir.
          </p>
        ) : null}
      </div>

      <details className="tipologia-picker__refine">
        <summary className="tipologia-picker__refine-summary">
          <SlidersHorizontal size={13} aria-hidden />
          Ajustar tipo y subtipo manualmente
        </summary>
        <div className="tipologia-picker__refine-grid">
          <label className="block space-y-1">
            <span className="text-label">Tipo</span>
            <Select
              value={tipo}
              onChange={(event) => {
                const nextTipo = event.target.value;
                if (nextTipo === GENERIC_TIPO) {
                  onGenericTipoSelect();
                  return;
                }
                onTipoChange(nextTipo);
              }}
            >
              <option value="">Selecciona tipo</option>
              {availableTipos.map((option) => (
                <option key={option} value={option}>
                  {option === GENERIC_TIPO ? `${option} (sin clasificar)` : option}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-label">Subtipo</span>
            <Select
              value={isGenericTipo ? GENERIC_SUBTIPO : subtipo}
              onChange={(event) => onSubtipoChange(event.target.value)}
              disabled={isGenericTipo || !tipo}
            >
              <option value="">Selecciona subtipo</option>
              {(isGenericTipo ? [GENERIC_SUBTIPO] : availableSubtipos).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </details>

      {showGuide ? (
        <div className="ticket-form-tipo-help">
          {tipo && getTipoHelp(tipo) ? (
            <p className="ticket-form-tipo-help__active">
              <span className="ticket-form-tipo-help__label">{tipo}</span>
              {getTipoHelp(tipo)}
            </p>
          ) : (
            <p className="ticket-form-tipo-help__hint">
              Elige un <strong>tipo</strong> para ver para qué sirve. Si no encaja ninguno, usa{" "}
              <strong>Genérica</strong>.
            </p>
          )}
          <details className="ticket-form-tipo-help__guide">
            <summary>Guía rápida de todos los tipos</summary>
            <ul>
              {listTipoHelpEntries().map(({ tipo: tipoEntry, help }) => (
                <li key={tipoEntry}>
                  <span className="ticket-form-tipo-help__tipo">{tipoEntry}</span>
                  <span>{help}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </div>
  );
}

export function applyGenericTipologiaToForm() {
  const generic = getGenericTipologia();
  return {
    tipo: GENERIC_TIPO,
    subtipo: GENERIC_SUBTIPO,
    subsubtipo: GENERIC_SUBSUBTIPO,
    dominio: generic.dominio,
    nivelImpacto: generic.nivelImpacto,
    origenTecnico: generic.origenTecnico,
    observaciones: generic.observaciones,
  };
}
