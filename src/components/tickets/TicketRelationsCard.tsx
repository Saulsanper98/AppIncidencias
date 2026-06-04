"use client";

import { Link2, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { TicketStatus } from "@/lib/domain";
import {
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";

type RelatedTicketSummary = {
  id: string;
  shortId: string;
  title: string;
  status: TicketStatus;
  priority: string;
  busId: string;
  createdAt: string;
  updatedAt: string;
  slaDeadline?: string;
};

type Relation = {
  id: string;
  kind: string;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  related: RelatedTicketSummary;
};

type SearchHit = RelatedTicketSummary;

const STATUS_LABELS: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_proceso: "En proceso",
  esperando_repuesto: "Esperando repuesto",
  resuelto: "Resuelto",
};

type StatusFilter = "todos" | "resuelto" | "abiertos";

export function TicketRelationsCard({ ticketId }: { ticketId: string }) {
  const [relations, setRelations] = useState<Relation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("resuelto");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const queryInputRef = useRef<HTMLInputElement | null>(null);

  // ── Carga inicial de las relaciones del ticket ───────────────────────────
  const loadRelations = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/relations`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudieron cargar las relaciones.");
      }
      const data = (await response.json()) as { relations: Relation[] };
      setRelations(data.relations);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Error de red.");
      setRelations([]);
    }
  }, [ticketId]);

  useEffect(() => {
    void loadRelations();
  }, [loadRelations]);

  // ── Buscador con debounce ────────────────────────────────────────────────
  useEffect(() => {
    if (!pickerOpen) return;
    const handle = window.setTimeout(() => {
      void runSearch(query.trim(), statusFilter);
    }, 200);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, pickerOpen]);

  const runSearch = async (q: string, filter: StatusFilter) => {
    setSearching(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filter === "resuelto") params.set("status", "resuelto");
      params.set("excludeId", ticketId);
      params.set("limit", "10");
      const response = await fetch(`/api/tickets/search?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo buscar.");
      }
      const data = (await response.json()) as { tickets: SearchHit[] };
      let hits = data.tickets;
      if (filter === "abiertos") {
        hits = hits.filter((t) => t.status !== "resuelto");
      }
      // Filtrar también los ya enlazados para no ofrecerlos.
      const linkedIds = new Set((relations ?? []).map((r) => r.related.id));
      hits = hits.filter((t) => !linkedIds.has(t.id));
      setSearchHits(hits);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Error de red.");
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  };

  // ── Acciones ─────────────────────────────────────────────────────────────
  const linkTicket = async (relatedTicketId: string) => {
    setAdding(true);
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/relations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedTicketId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo vincular.");
      }
      const data = (await response.json()) as { relations: Relation[] };
      setRelations(data.relations);
      setPickerOpen(false);
      setQuery("");
      setSearchHits([]);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Error de red.");
    } finally {
      setAdding(false);
    }
  };

  const unlinkTicket = async (relatedId: string) => {
    if (!confirm("¿Quitar este vínculo? El otro ticket no se borrará.")) return;
    setRemovingId(relatedId);
    try {
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(ticketId)}/relations?relatedId=${encodeURIComponent(relatedId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo desvincular.");
      }
      await loadRelations();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Error de red.");
    } finally {
      setRemovingId(null);
    }
  };

  const togglePicker = () => {
    setPickerOpen((open) => {
      const next = !open;
      if (next) {
        // Pequeño delay para que el input exista en el DOM antes de enfocar.
        window.setTimeout(() => queryInputRef.current?.focus(), 50);
      }
      return next;
    });
  };

  const sortedRelations = useMemo(() => {
    if (!relations) return [];
    // Resueltos al final (los activos suelen ser más relevantes), por fecha desc dentro de cada grupo.
    return [...relations].sort((a, b) => {
      if (a.related.status === "resuelto" && b.related.status !== "resuelto") return 1;
      if (a.related.status !== "resuelto" && b.related.status === "resuelto") return -1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [relations]);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow duration-200 hover:shadow-md sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-subheading">
          <Link2 size={16} className="text-[var(--color-text-3)]" aria-hidden />
          Tickets relacionados
          {relations && relations.length > 0 ? (
            <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-3)] ring-1 ring-[var(--color-border)]">
              {relations.length}
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={togglePicker}
          aria-expanded={pickerOpen}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11.5px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-1)]"
        >
          {pickerOpen ? (
            <>
              <X size={11} aria-hidden /> Cerrar
            </>
          ) : (
            <>
              <Plus size={11} aria-hidden /> Vincular ticket
            </>
          )}
        </button>
      </div>

      {pickerOpen ? (
        <div className="mb-3 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search
                size={12}
                strokeWidth={1.5}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
                aria-hidden
              />
              <input
                ref={queryInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, ID corto (últimos 8) o bus…"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-6 pr-2 text-[12.5px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                aria-label="Buscar ticket a vincular"
              />
            </div>
            <div className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-[10.5px]">
              {(["resuelto", "abiertos", "todos"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded px-2 py-1 transition-colors ${
                    statusFilter === value
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                  }`}
                >
                  {value === "resuelto" ? "Resueltos" : value === "abiertos" ? "Abiertos" : "Todos"}
                </button>
              ))}
            </div>
            {searching ? (
              <Loader2 size={13} className="animate-spin text-[var(--color-text-3)]" aria-hidden />
            ) : null}
          </div>

          {searchError ? (
            <p className="mt-2 text-[11px] text-[var(--color-error)]">{searchError}</p>
          ) : null}

          <ul className="mt-2 max-h-64 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            {searchHits.length === 0 && !searching ? (
              <li className="px-3 py-3 text-center text-[11.5px] text-[var(--color-text-3)]">
                {query.trim() ? "Sin resultados." : "Escribe para buscar (o filtra por estado)."}
              </li>
            ) : (
              searchHits.map((hit) => (
                <li
                  key={hit.id}
                  className="flex items-center justify-between gap-2 border-b border-[var(--color-border)]/60 px-3 py-2 last:border-b-0 hover:bg-[var(--color-surface-2)]/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] text-[var(--color-text-3)]">#{hit.shortId}</span>
                      <Badge
                        variant={ticketStatusBadgeVariant(hit.status)}
                        className={ticketStatusBadgeClassName(hit.status)}
                      >
                        {STATUS_LABELS[hit.status]}
                      </Badge>
                      <span className="font-mono text-[10.5px] text-[var(--color-text-3)]">· {hit.busId}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-text-1)]" title={hit.title}>
                      {hit.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void linkTicket(hit.id)}
                    disabled={adding}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {adding ? (
                      <Loader2 size={11} className="animate-spin" aria-hidden />
                    ) : (
                      <Plus size={11} aria-hidden strokeWidth={2} />
                    )}
                    Vincular
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {/* Lista de relaciones ya existentes */}
      {loadError ? (
        <p className="text-[12px] text-[var(--color-error)]">{loadError}</p>
      ) : relations === null ? (
        <p className="text-[12px] text-[var(--color-text-3)]">Cargando…</p>
      ) : sortedRelations.length === 0 ? (
        <p className="text-sm text-[var(--color-text-3)]">
          Sin tickets vinculados. Usa &quot;Vincular ticket&quot; para enlazar un ticket relacionado
          (típicamente uno ya resuelto que sirva como referencia).
        </p>
      ) : (
        <ul className="space-y-2">
          {sortedRelations.map((rel) => (
            <li
              key={rel.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-[var(--color-text-3)]">
                      #{rel.related.shortId}
                    </span>
                    <Badge
                      variant={ticketStatusBadgeVariant(rel.related.status)}
                      className={ticketStatusBadgeClassName(rel.related.status)}
                    >
                      {STATUS_LABELS[rel.related.status]}
                    </Badge>
                    <span className="font-mono text-[10.5px] text-[var(--color-text-3)]">· {rel.related.busId}</span>
                  </div>
                  <Link
                    href={`/tickets/${rel.related.id}`}
                    className="mt-0.5 block truncate text-sm font-medium text-[var(--color-accent)] hover:underline"
                    title={rel.related.title}
                  >
                    {rel.related.title}
                  </Link>
                  <p className="mt-1 text-[10.5px] text-[var(--color-text-3)]">
                    Vinculado {new Date(rel.createdAt).toLocaleDateString("es-ES")}{" "}
                    {rel.createdByName ? `· por ${rel.createdByName}` : null}
                  </p>
                  {rel.note ? (
                    <p className="mt-1 text-[11.5px] italic text-[var(--color-text-2)]">{rel.note}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void unlinkTicket(rel.related.id)}
                  disabled={removingId === rel.related.id}
                  className="rounded-md p-1 text-[var(--color-text-3)] hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)] disabled:opacity-60"
                  aria-label={`Quitar vínculo con ${rel.related.shortId}`}
                  title="Quitar vínculo"
                >
                  {removingId === rel.related.id ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                  ) : (
                    <Trash2 size={12} aria-hidden strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
