"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TypeaheadInput } from "@/components/ui/typeahead-input";
import { tipologiaKey, type TipologiaItem } from "@/lib/tipologia";
import { cn } from "@/lib/utils";

type TipologiaIncidenciaTypeaheadProps = {
  tipologias: TipologiaItem[];
  selected: Pick<TipologiaItem, "tipo" | "subtipo" | "subsubtipo"> | null;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  compact?: boolean;
  id?: string;
  onSelect: (item: TipologiaItem) => void;
  /** Al empezar a escribir (búsqueda global), limpia la selección previa. */
  onSearchStart?: () => void;
};

export function TipologiaIncidenciaTypeahead({
  tipologias,
  selected,
  disabled,
  placeholder = "Escribe para buscar incidencia…",
  emptyMessage = "Sin incidencias con ese criterio",
  compact = false,
  id,
  onSelect,
  onSearchStart,
}: TipologiaIncidenciaTypeaheadProps) {
  const selectedKey = selected?.subsubtipo ? tipologiaKey(selected) : "";
  const [draft, setDraft] = useState("");
  const pickingRef = useRef(false);
  const hadDraftRef = useRef(false);

  const keyToItem = useMemo(() => {
    const map = new Map<string, TipologiaItem>();
    for (const item of tipologias) {
      map.set(tipologiaKey(item), item);
    }
    return map;
  }, [tipologias]);

  const options = useMemo(
    () =>
      tipologias.map((item) => ({
        value: tipologiaKey(item),
        label: item.subsubtipo,
        hint: `${item.tipo} · ${item.subtipo}`,
      })),
    [tipologias],
  );

  useEffect(() => {
    if (pickingRef.current) {
      pickingRef.current = false;
      return;
    }
    setDraft("");
    hadDraftRef.current = false;
  }, [selectedKey]);

  const displayValue = draft || (compact ? "" : selected?.subsubtipo || "");

  const handleValueChange = useCallback(
    (next: string) => {
      const item = keyToItem.get(next);
      if (item) {
        pickingRef.current = true;
        hadDraftRef.current = false;
        setDraft("");
        onSelect(item);
        return;
      }

      if (!hadDraftRef.current && next.trim()) {
        onSearchStart?.();
      }
      hadDraftRef.current = Boolean(next.trim());
      setDraft(next);
    },
    [keyToItem, onSelect, onSearchStart],
  );

  const handleBlur = useCallback(() => {
    if (!draft.trim()) return;
    const query = draft.trim().toLowerCase();
    const exact = tipologias.find((item) => item.subsubtipo.toLowerCase() === query);
    if (exact) {
      pickingRef.current = true;
      setDraft("");
      onSelect(exact);
      return;
    }
    setDraft("");
    hadDraftRef.current = false;
  }, [draft, onSelect, tipologias]);

  return (
    <TypeaheadInput
      id={id}
      value={displayValue}
      onValueChange={handleValueChange}
      options={options}
      maxSuggestions={20}
      openOnFocus
      variant="tipologia"
      listTitle="Catálogo de incidencias"
      disabled={disabled}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
      autoComplete="off"
      spellCheck={false}
      onBlur={handleBlur}
      className={cn(
        "tipologia-picker__typeahead-input",
        compact && "tipologia-picker__typeahead-input--compact",
      )}
    />
  );
}
