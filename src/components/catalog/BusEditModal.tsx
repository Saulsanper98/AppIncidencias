"use client";

/**
 * BusEditModal — editar un bus del catálogo.
 *
 * Permite cambiar operadora, municipio y la lista de líneas/servicios
 * que cubre. Las líneas son chips removibles; para añadir hay un input
 * con autocompletar del catálogo de líneas (`/api/lineas`) pero también
 * acepta texto libre (Enter o coma) por si el gestor escribe una línea
 * que aún no está en el catálogo (la creamos al vuelo desde el server
 * llamando además a /api/lineas POST si no existe).
 *
 * Persiste vía PATCH /api/catalog. Si el padre necesita refrescar la
 * lista, le pasamos los datos actualizados en `onSaved`.
 */

import {
  AlertTriangle,
  Building2,
  Check,
  Hash,
  Loader2,
  MapPin,
  Plus,
  Route,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";

export type BusEditPayload = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
};

export function BusEditModal({
  bus,
  catalogLineas,
  catalogOperators,
  catalogMunicipios,
  onClose,
  onSaved,
}: {
  bus: BusEditPayload;
  /** Líneas conocidas del catálogo (para autocompletar). */
  catalogLineas: string[];
  /** Operadoras existentes en otros buses (para sugerir reutilización). */
  catalogOperators: string[];
  /** Municipios existentes en otros buses (para sugerir reutilización). */
  catalogMunicipios: string[];
  onClose: () => void;
  onSaved: (next: BusEditPayload) => void;
}) {
  const [busId, setBusId] = useState(bus.id);
  const [operator, setOperator] = useState(bus.operator);
  const [municipio, setMunicipio] = useState(bus.municipio);
  const [lineas, setLineas] = useState<string[]>([...bus.lineas]);
  const [lineaInput, setLineaInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  /** Detecta si el usuario ha cambiado algo (para habilitar Guardar). */
  const dirty = useMemo(() => {
    if (busId.trim() !== bus.id) return true;
    if (operator.trim() && operator.trim() !== bus.operator) return true;
    if (municipio.trim() && municipio.trim() !== bus.municipio) return true;
    const a = lineas.map((l) => l.trim()).filter(Boolean);
    const b = bus.lineas.slice();
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  }, [busId, operator, municipio, lineas, bus]);

  const renameRequested = busId.trim() !== bus.id && busId.trim().length > 0;

  // Sugerencias filtradas (sin duplicar las ya añadidas, case-insensitive)
  const lineaSuggestions = useMemo(() => {
    const q = lineaInput.trim().toLowerCase();
    if (!q) return [] as string[];
    const taken = new Set(lineas.map((l) => l.toLowerCase()));
    return catalogLineas
      .filter((l) => l.toLowerCase().includes(q) && !taken.has(l.toLowerCase()))
      .slice(0, 8);
  }, [catalogLineas, lineas, lineaInput]);

  const addLinea = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    // Soporta también pegar "GL-1, GL-2, GL-3"
    const parts = cleaned
      .split(/[,;\n\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setLineas((prev) => {
      const taken = new Set(prev.map((l) => l.toLowerCase()));
      const next = [...prev];
      for (const p of parts) {
        if (!taken.has(p.toLowerCase())) {
          next.push(p);
          taken.add(p.toLowerCase());
        }
      }
      return next;
    });
    setLineaInput("");
  };

  const removeLinea = (l: string) => {
    setLineas((prev) => prev.filter((x) => x !== l));
  };

  const handleSave = async () => {
    setError(null);
    // Solo validamos campos que el usuario haya tocado / vaciado. Si
    // un campo queda vacío respetamos el valor anterior (no lo limpiamos
    // en BD), porque un bus sin operadora o municipio quedaría roto y
    // casi siempre el usuario sólo quiere cambiar un campo concreto.
    const op = operator.trim();
    const mu = municipio.trim();
    const idTrimmed = busId.trim();
    if (op !== "" && op.length < 2) {
      setError("La operadora debe tener al menos 2 caracteres (déjala vacía para mantener la actual).");
      return;
    }
    if (mu !== "" && mu.length < 2) {
      setError("El municipio debe tener al menos 2 caracteres (déjalo vacío para mantener el actual).");
      return;
    }
    const cleanLineas = Array.from(
      new Set(lineas.map((l) => l.trim()).filter(Boolean)),
    );
    // Si la lista se vació por completo respecto a la original lo
    // permitimos (bus "en reserva"), pero advertimos en consola para
    // evitar borrados accidentales sin querer.
    if (renameRequested && idTrimmed.length < 3) {
      setError("El nuevo identificador del bus debe tener al menos 3 caracteres.");
      return;
    }
    if (renameRequested && idTrimmed === bus.id) {
      // safety: no debería pasar con la flag actual, pero por si acaso.
    }

    if (!dirty) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { id: bus.id };
      // newId sólo si el usuario lo cambió.
      if (renameRequested) body.newId = idTrimmed;
      // operator y municipio sólo si el usuario tecleó algo. Si están vacíos
      // mantenemos el valor previo (no se envían y el backend no los toca).
      if (op !== "" && op !== bus.operator) body.operator = op;
      if (mu !== "" && mu !== bus.municipio) body.municipio = mu;
      // Líneas: enviamos siempre que el array haya cambiado respecto al original
      // (incluido vaciado a propósito → el backend ahora acepta lista vacía).
      const lineasChanged =
        cleanLineas.length !== bus.lineas.length ||
        cleanLineas.some((l, i) => l !== bus.lineas[i]);
      if (lineasChanged) body.lineas = cleanLineas;

      const res = await fetch("/api/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "No se pudo guardar.");
        return;
      }
      // Aprovechamos para registrar líneas nuevas en el catálogo central
      // por si el gestor tecleó una que aún no existía. Best-effort, no
      // bloqueamos la confirmación si falla.
      const unknownLineas = cleanLineas.filter(
        (l) => !catalogLineas.includes(l),
      );
      if (unknownLineas.length > 0) {
        void fetch("/api/lineas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: unknownLineas }),
        }).catch(() => {});
      }

      onSaved({
        id: renameRequested ? idTrimmed : bus.id,
        operator: op !== "" ? op : bus.operator,
        municipio: mu !== "" ? mu : bus.municipio,
        lineas: cleanLineas.length > 0 ? cleanLineas : bus.lineas,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setSaving(false);
    }
  };

  const onLineaInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (lineaSuggestions[0]) {
        addLinea(lineaSuggestions[0]);
      } else {
        addLinea(lineaInput);
      }
    } else if (e.key === "Backspace" && lineaInput === "" && lineas.length > 0) {
      // Backspace en input vacío borra el último chip (UX típica)
      e.preventDefault();
      setLineas((prev) => prev.slice(0, -1));
    } else if (e.key === "," || e.key === ";") {
      e.preventDefault();
      addLinea(lineaInput);
    }
  };

  return (
    <ModalShell
      open
      onClose={() => !saving && onClose()}
      shake={Boolean(error)}
      maxWidth="42rem"
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 shadow-md shadow-sky-500/30">
            <Building2 size={18} className="text-white" strokeWidth={2.2} />
          </span>
          <span>
            <span className="block text-base font-bold">
              Editar bus <span className="font-mono text-sky-300">{bus.id}</span>
              {renameRequested ? (
                <>
                  {" "}
                  <span className="text-[12px] font-normal text-[var(--color-text-3)]">→</span>{" "}
                  <span className="font-mono text-amber-300">{busId.trim()}</span>
                </>
              ) : null}
            </span>
            <span className="mt-0.5 block text-[11.5px] font-normal text-[var(--color-text-3)]">
              Cambia identificador, operadora, municipio o servicios. Deja vacío lo que no quieras tocar.
            </span>
          </span>
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-sky-500 to-cyan-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-all",
              saving
                ? "cursor-wait opacity-80"
                : !dirty
                  ? "cursor-not-allowed opacity-60"
                  : "hover:-translate-y-0.5 hover:shadow-md hover:shadow-sky-500/30",
            )}
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} strokeWidth={2.6} />
            )}
            Guardar cambios
          </button>
        </>
      }
    >
      <div className="space-y-4">
            {/* ID / nombre del bus */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                <Hash size={11} />
                Identificador del bus
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  ref={firstInputRef}
                  type="text"
                  value={busId}
                  onChange={(e) => setBusId(e.target.value)}
                  placeholder="Mantener actual"
                  className={cn(
                    "w-56 rounded-md border bg-[var(--color-surface-2)] px-3 py-1.5 font-mono text-[13px] text-[var(--color-text-1)] outline-none focus:ring-2",
                    renameRequested
                      ? "border-amber-400/60 focus:border-amber-400/70 focus:ring-amber-400/15"
                      : "border-[var(--color-border)] focus:border-sky-400/60 focus:ring-sky-400/15",
                  )}
                />
                {renameRequested ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/30">
                    <AlertTriangle size={9} />
                    Renombrará el bus y propagará a tickets, activos y mantenimientos
                  </span>
                ) : (
                  <span className="text-[10.5px] text-[var(--color-text-3)]">
                    Déjalo igual para mantener el ID actual.
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FieldWithDatalist
                label="Operadora"
                Icon={Building2}
                value={operator}
                onChange={setOperator}
                placeholder="Mantener actual"
                listId={`bus-edit-operators-${bus.id}`}
                options={catalogOperators}
              />
              <FieldWithDatalist
                label="Municipio"
                Icon={MapPin}
                value={municipio}
                onChange={setMunicipio}
                placeholder="Mantener actual"
                listId={`bus-edit-municipios-${bus.id}`}
                options={catalogMunicipios}
              />
            </div>

            {/* Líneas: chips + autocomplete */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                <Route size={11} />
                Líneas / servicios cubiertos
              </label>

              <div
                data-field-chrome
                className="mt-1.5 flex flex-wrap gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 focus-within:border-sky-400/60 focus-within:ring-2 focus-within:ring-sky-400/15"
              >
                {lineas.map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/15 py-0.5 pl-2 pr-1 text-[11.5px] font-medium text-sky-200"
                  >
                    <span className="font-mono">{l}</span>
                    <button
                      type="button"
                      onClick={() => removeLinea(l)}
                      aria-label={`Quitar ${l}`}
                      className="rounded p-0.5 text-sky-300 hover:bg-sky-500/30 hover:text-white"
                    >
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={lineaInput}
                  onChange={(e) => setLineaInput(e.target.value)}
                  onKeyDown={onLineaInputKeyDown}
                  placeholder={
                    lineas.length === 0 ? "Escribe una línea y pulsa Enter…" : "Añadir más…"
                  }
                  className="min-w-[140px] flex-1 bg-transparent text-[12.5px] text-[var(--color-text-1)] outline-none placeholder:text-[var(--color-text-3)]"
                />
              </div>
              <p className="mt-1 text-[10.5px] text-[var(--color-text-3)]">
                Pulsa Enter o coma para confirmar. Backspace borra el último chip.
              </p>

              {/* Sugerencias */}
              {lineaSuggestions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {lineaSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addLinea(s)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-2)] transition-colors hover:border-sky-400/40 hover:text-[var(--color-text-1)]"
                    >
                      <Plus size={9} strokeWidth={2.4} />
                      <span className="font-mono">{s}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-md border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-3 py-2 text-[12px] text-[var(--color-error)]">
                {error}
              </div>
            ) : null}
      </div>
    </ModalShell>
  );
}

function FieldWithDatalist({
  label,
  Icon,
  value,
  onChange,
  placeholder,
  listId,
  options,
  inputRef,
}: {
  label: string;
  Icon: typeof Building2;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  listId: string;
  options: string[];
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
        <Icon size={11} />
        {label}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[13px] text-[var(--color-text-1)] outline-none focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/15"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}
