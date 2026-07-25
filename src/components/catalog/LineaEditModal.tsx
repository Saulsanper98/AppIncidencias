"use client";

/**
 * LineaEditModal — gestiona la relación bus ↔ línea desde el lado línea.
 *
 * Muestra qué buses tienen asignada esta línea/servicio y permite:
 *   - Renombrar la línea (propaga el cambio a todos los buses asignados
 *     vía PATCH /api/lineas).
 *   - Desasignar un bus (PATCH /api/catalog quitando la línea de su lista).
 *   - Asignar buses adicionales (PATCH /api/catalog añadiéndola).
 *
 * No persiste el cambio hasta pulsar "Guardar"; mantiene un diff local
 * (toAdd / toRemove) y al guardar dispara los PATCH necesarios en
 * paralelo. Si alguno falla muestra qué buses se quedaron sin actualizar.
 */

import {
  AlertTriangle,
  Building2,
  Bus,
  Check,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Route,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";

export type CatalogBusLite = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
};

export function LineaEditModal({
  linea,
  allBuses,
  onClose,
  onSaved,
}: {
  linea: string;
  allBuses: CatalogBusLite[];
  onClose: () => void;
  /** Se llama tras persistir. El padre debería recargar el catálogo. */
  onSaved: (info: {
    renamedTo: string | null;
    addedBuses: string[];
    removedBuses: string[];
    failedBuses: string[];
  }) => void;
}) {
  const [newName, setNewName] = useState(linea);
  const [busQuery, setBusQuery] = useState("");
  // Buses asignados al cierre (diff base)
  const initiallyAssignedIds = useMemo(
    () =>
      new Set(
        allBuses
          .filter((b) => b.lineas.some((l) => l === linea))
          .map((b) => b.id),
      ),
    [allBuses, linea],
  );
  const [assignedIds, setAssignedIds] = useState<Set<string>>(
    () => new Set(initiallyAssignedIds),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // No autoenfocamos el rename para no asustar al usuario, sino el
    // buscador de buses (caso de uso principal: asignar/desasignar).
    document
      .getElementById(`linea-edit-search-${linea}`)
      ?.focus({ preventScroll: true });
  }, [linea]);

  const filteredBuses = useMemo(() => {
    const q = busQuery.trim().toLowerCase();
    if (!q) return allBuses;
    return allBuses.filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        b.operator.toLowerCase().includes(q) ||
        b.municipio.toLowerCase().includes(q),
    );
  }, [allBuses, busQuery]);

  const assignedBuses = useMemo(
    () => allBuses.filter((b) => assignedIds.has(b.id)),
    [allBuses, assignedIds],
  );

  const toAdd = useMemo(
    () =>
      Array.from(assignedIds).filter((id) => !initiallyAssignedIds.has(id)),
    [assignedIds, initiallyAssignedIds],
  );
  const toRemove = useMemo(
    () =>
      Array.from(initiallyAssignedIds).filter((id) => !assignedIds.has(id)),
    [assignedIds, initiallyAssignedIds],
  );

  const renameRequested = newName.trim() !== linea && newName.trim().length > 0;
  const dirty = renameRequested || toAdd.length > 0 || toRemove.length > 0;

  const toggleBus = (id: string) => {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    setError(null);
    setSaving(true);
    const failedBuses: string[] = [];

    try {
      // 1) Renombrar primero si procede. Esto propaga el cambio en BD a
      //    todos los buses que tenían la línea, así que al recalcular el
      //    diff usamos el nombre nuevo.
      let effectiveLinea = linea;
      let renamedTo: string | null = null;
      if (renameRequested) {
        const nn = newName.trim();
        const res = await fetch("/api/lineas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldId: linea, newId: nn }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        if (!res.ok) {
          setError(data.message ?? "No se pudo renombrar la línea.");
          setSaving(false);
          return;
        }
        effectiveLinea = nn;
        renamedTo = nn;
      }

      // 2) Diff de asignaciones. Para cada bus afectado calculamos su nueva
      //    lista de líneas y mandamos un PATCH /api/catalog. Se hacen en
      //    paralelo (no son tantos: solo los que cambiaron).
      const affectedIds = new Set<string>([...toAdd, ...toRemove]);
      const tasks: Promise<{ id: string; ok: boolean }>[] = [];
      for (const id of affectedIds) {
        const bus = allBuses.find((b) => b.id === id);
        if (!bus) continue;
        const wasAssigned = initiallyAssignedIds.has(id);
        const nowAssigned = assignedIds.has(id);
        // Si la línea original se renombró, también propaga el rename en
        // la lista local del bus para no recrear la antigua sin querer.
        const baseLineas = renamedTo
          ? bus.lineas.map((l) => (l === linea ? renamedTo! : l))
          : bus.lineas.slice();
        const set = new Set(baseLineas);
        if (nowAssigned && !wasAssigned) set.add(effectiveLinea);
        if (!nowAssigned && wasAssigned) set.delete(effectiveLinea);
        const finalLineas = Array.from(set);
        tasks.push(
          fetch("/api/catalog", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: bus.id,
              lineas: finalLineas,
            }),
          }).then(
            (r) => ({ id: bus.id, ok: r.ok }),
            () => ({ id: bus.id, ok: false }),
          ),
        );
      }
      const results = await Promise.all(tasks);
      for (const r of results) if (!r.ok) failedBuses.push(r.id);

      if (failedBuses.length > 0) {
        setError(
          `No se pudieron actualizar ${failedBuses.length} bus${failedBuses.length === 1 ? "" : "es"}: ${failedBuses.join(", ")}`,
        );
        // Aun así notificamos al padre con la info parcial
      }

      onSaved({
        renamedTo,
        addedBuses: toAdd,
        removedBuses: toRemove,
        failedBuses,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={() => !saving && onClose()}
      shake={Boolean(error)}
      maxWidth="48rem"
      className="max-h-[85vh] overflow-hidden"
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-md shadow-violet-500/30">
            <Route size={18} className="text-white" strokeWidth={2.2} />
          </span>
          <span>
            <span className="block text-base font-bold">
              Línea <span className="font-mono text-violet-300">{linea}</span>
            </span>
            <span className="mt-0.5 block text-[11.5px] font-normal text-[var(--color-text-3)]">
              Asigna o desasigna buses, o renombra la línea.
            </span>
          </span>
        </span>
      }
      footer={
        <>
          <p className="mr-auto text-[11px] text-[var(--color-text-3)]">
            {dirty ? (
              <>
                <span className="font-semibold text-[var(--color-text-2)]">Cambios sin guardar</span>
                {renameRequested ? " · renombrar línea" : ""}
                {toAdd.length > 0 ? ` · +${toAdd.length} asignar` : ""}
                {toRemove.length > 0 ? ` · −${toRemove.length} quitar` : ""}
              </>
            ) : (
              "Sin cambios pendientes"
            )}
          </p>
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
              "inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-all",
              saving
                ? "cursor-wait opacity-80"
                : !dirty
                  ? "cursor-not-allowed opacity-60"
                  : "hover:-translate-y-0.5 hover:shadow-md hover:shadow-violet-500/30",
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
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {/* Renombrar */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                <Pencil size={11} />
                Código / nombre
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: GL-15"
                  className="w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 font-mono text-[13px] text-[var(--color-text-1)] outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15"
                />
                {renameRequested ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/30">
                    <AlertTriangle size={9} />
                    Se renombrará en {initiallyAssignedIds.size} bus
                    {initiallyAssignedIds.size === 1 ? "" : "es"}
                  </span>
                ) : null}
              </div>
            </div>

            {/* KPIs y resumen del diff */}
            <div className="grid grid-cols-3 gap-2">
              <Counter
                label="Asignados"
                value={assignedBuses.length}
                tone="violet"
                Icon={Bus}
              />
              <Counter
                label="A añadir"
                value={toAdd.length}
                tone="emerald"
                Icon={Plus}
              />
              <Counter
                label="A quitar"
                value={toRemove.length}
                tone="red"
                Icon={Trash2}
              />
            </div>

            {/* Buscador */}
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
              />
              <input
                id={`linea-edit-search-${linea}`}
                type="search"
                value={busQuery}
                onChange={(e) => setBusQuery(e.target.value)}
                placeholder="Buscar bus, operadora o municipio…"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-2.5 text-[13px] outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15"
              />
            </div>

            {/* Lista de buses */}
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <div className="max-h-80 overflow-y-auto">
                {filteredBuses.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[12px] italic text-[var(--color-text-3)]">
                    Sin resultados.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--color-border)]/70">
                    {filteredBuses.map((bus) => {
                      const assigned = assignedIds.has(bus.id);
                      return (
                        <li
                          key={bus.id}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 transition-colors",
                            assigned
                              ? "bg-violet-500/[0.06]"
                              : "hover:bg-[var(--color-surface-2)]/40",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={assigned}
                            onChange={() => toggleBus(bus.id)}
                            className="h-4 w-4 cursor-pointer rounded border-[var(--color-border)] accent-violet-500"
                            aria-label={`${assigned ? "Desasignar" : "Asignar"} bus ${bus.id}`}
                          />
                          <span className="font-mono text-[12.5px] font-semibold text-[var(--color-text-1)]">
                            {bus.id}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-3)]">
                            <Building2 size={10} />
                            {bus.operator || "—"}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-3)]">
                            <MapPin size={10} />
                            {bus.municipio || "—"}
                          </span>
                          <span className="ml-auto text-[10.5px] text-[var(--color-text-3)]">
                            {bus.lineas.length} línea
                            {bus.lineas.length === 1 ? "" : "s"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
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

function Counter({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone: "violet" | "emerald" | "red";
  Icon: typeof Bus;
}) {
  const cls = {
    violet: "from-violet-500/20 ring-violet-500/30 text-violet-200",
    emerald: "from-emerald-500/20 ring-emerald-500/30 text-emerald-200",
    red: "from-[var(--color-error)]/20 ring-[var(--color-error)]/30 text-[var(--color-error)]",
  }[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-gradient-to-br to-transparent px-3 py-2 ring-1 ring-inset",
        cls,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-90">
        <Icon size={10} />
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[18px] font-bold tabular-nums text-[var(--color-text-1)]">
        {value}
      </div>
    </div>
  );
}
