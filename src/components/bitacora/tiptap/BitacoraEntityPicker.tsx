"use client";

import { BookOpen, Bus, Loader2, Route, Search, Ticket } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
import type { TicketPriority, TicketStatus } from "@/lib/domain";
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/ticket-labels";
import { cn } from "@/lib/utils";

export type EntityPick =
  | {
      kind: "ticket";
      id: string;
      label: string;
      href: string;
      subtitle?: string | null;
      meta?: string | null;
      badgeTone?: "alta" | "media" | "baja" | "desvio" | "neutral";
    }
  | {
      kind: "desvio";
      id: string;
      label: string;
      href: string;
      subtitle?: string | null;
      meta?: string | null;
      badgeTone?: "alta" | "media" | "baja" | "desvio" | "neutral";
    }
  | {
      kind: "kb";
      id: string;
      label: string;
      href: string;
      subtitle?: string | null;
      meta?: string | null;
      badgeTone?: "alta" | "media" | "baja" | "desvio" | "neutral";
    }
  | {
      kind: "bus";
      id: string;
      label: string;
      href: string;
      subtitle?: string | null;
      meta?: string | null;
      badgeTone?: "alta" | "media" | "baja" | "desvio" | "neutral";
    };

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (entity: EntityPick) => void;
};

type Tab = EntityPick["kind"];

const TAB_META: Record<
  Tab,
  { label: string; icon: typeof Ticket; placeholder: string; emptyHint: string }
> = {
  ticket: {
    label: "Ticket",
    icon: Ticket,
    placeholder: "Buscar por título, código o bus…",
    emptyHint: "Prueba con el código corto o el bus",
  },
  desvio: {
    label: "Desvío",
    icon: Route,
    placeholder: "Buscar por referencia o tramo…",
    emptyHint: "Prueba la referencia de la circular",
  },
  kb: {
    label: "KB",
    icon: BookOpen,
    placeholder: "Buscar artículo de conocimiento…",
    emptyHint: "Escribe un término del artículo",
  },
  bus: {
    label: "Bus",
    icon: Bus,
    placeholder: "Buscar por matrícula u operadora…",
    emptyHint: "Escribe la matrícula o operadora",
  },
};

const DESVIO_ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  ACTIVO: "Activo",
  RESUELTO: "Resuelto",
  CANCELADO: "Cancelado",
};

export function BitacoraEntityPicker({ open, onClose, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>("ticket");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<EntityPick[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (kind: Tab, q: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      if (kind === "ticket") {
        const params = new URLSearchParams({ limit: "16" });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/tickets/search?${params}`, { signal: ac.signal });
        if (!res.ok) throw new Error("No se pudieron cargar tickets");
        const data = (await res.json()) as {
          tickets: {
            id: string;
            shortId: string;
            title: string;
            status: TicketStatus;
            priority: TicketPriority;
            busId: string;
          }[];
        };
        setResults(
          (data.tickets ?? []).map((t) => {
            const statusLabel = TICKET_STATUS_LABELS[t.status] ?? t.status;
            const priorityLabel = TICKET_PRIORITY_LABELS[t.priority] ?? t.priority;
            return {
              kind: "ticket" as const,
              id: t.id,
              label: `#${t.shortId} · ${t.title}`,
              href: `/tickets/${t.id}`,
              subtitle: `Bus ${t.busId} · ${statusLabel}`,
              meta: priorityLabel,
              badgeTone: t.priority,
            };
          }),
        );
        return;
      }

      if (kind === "desvio") {
        const params = new URLSearchParams({ pageSize: "16", page: "1" });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/desvios?${params}`, { signal: ac.signal });
        if (!res.ok) throw new Error("No se pudieron cargar desvíos");
        const data = (await res.json()) as {
          items: {
            id: string;
            referencia: string;
            tramo: string;
            titulo: string;
            estado?: string;
            via?: string;
          }[];
        };
        setResults(
          (data.items ?? []).map((d) => ({
            kind: "desvio" as const,
            id: d.id,
            label: d.referencia,
            href: `/desvios/${d.id}`,
            subtitle: [d.tramo || d.titulo, d.via].filter(Boolean).join(" · "),
            meta: d.estado ? DESVIO_ESTADO_LABEL[d.estado] ?? d.estado : null,
            badgeTone: "desvio" as const,
          })),
        );
        return;
      }

      const params = new URLSearchParams({ limit: "16" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/search/global?${params}`, { signal: ac.signal });
      if (!res.ok) throw new Error("No se pudo buscar");
      const data = (await res.json()) as {
        results?: Record<string, { id: string; title: string; subtitle?: string | null; href: string }[]>;
      };
      const bucket = data.results?.[kind] ?? [];
      setResults(
        bucket.map((item) => ({
          kind,
          id: item.id,
          label: item.title,
          subtitle: item.subtitle,
          href: item.href,
          meta: kind === "bus" ? "Bus" : kind === "kb" ? "KB" : null,
        })),
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setResults([]);
      setError(e instanceof Error ? e.message : "Error de búsqueda");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }
    setQuery("");
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const delay = query === "" ? 0 : 220;
    const t = window.setTimeout(() => {
      setActiveIndex(0);
      void search(tab, query);
    }, delay);
    return () => window.clearTimeout(t);
  }, [open, query, search, tab]);

  const selectAt = (index: number) => {
    const item = results[index];
    if (!item) return;
    onSelect(item);
    onClose();
  };

  return (
    <ModalShell open={open} onClose={onClose} size="md" title="Vincular elemento">
      <div className="b-log-entity-picker">
        <p className="b-log-entity-picker__lead">
          Inserta un enlace rápido a un ticket, desvío, artículo o bus dentro de la nota.
        </p>

        <div className="b-log-entity-tabs" role="tablist" aria-label="Tipo de elemento">
          {(Object.keys(TAB_META) as Tab[]).map((k) => {
            const meta = TAB_META[k];
            const Icon = meta.icon;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={cn(tab === k && "is-active")}
                onClick={() => setTab(k)}
              >
                <Icon size={14} aria-hidden />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
            aria-hidden
          />
          <input
            ref={inputRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                selectAt(activeIndex);
              }
            }}
            placeholder={TAB_META[tab].placeholder}
            className="b-log-entity-search"
            aria-label={`Buscar ${TAB_META[tab].label}`}
            aria-controls={`${searchId}-results`}
            autoComplete="off"
          />
        </div>

        <div
          id={`${searchId}-results`}
          className="b-log-entity-results"
          role="listbox"
          aria-label="Resultados"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-text-3)]">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Buscando…
            </div>
          ) : error ? (
            <p className="b-log-entity-empty b-log-entity-empty--error" role="alert">
              {error}
            </p>
          ) : results.length === 0 ? (
            <div className="b-log-entity-empty">
              <p className="font-medium text-[var(--color-text-2)]">Sin resultados</p>
              <p className="mt-1 text-[var(--color-text-3)]">
                {tab === "bus" && !query.trim()
                  ? "Escribe para buscar un bus"
                  : TAB_META[tab].emptyHint}
              </p>
            </div>
          ) : (
            results.map((item, index) => {
              const Icon = TAB_META[item.kind].icon;
              const isActive = index === activeIndex;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={cn("b-log-entity-result", item.kind, isActive && "is-active")}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectAt(index)}
                >
                  <span className={cn("b-log-entity-result__icon", item.kind)} aria-hidden>
                    <Icon size={15} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="b-log-entity-result__title truncate">{item.label}</span>
                    {item.subtitle ? (
                      <span className="b-log-entity-result__sub truncate">{item.subtitle}</span>
                    ) : null}
                  </span>
                  {item.meta ? (
                    <span
                      className={cn(
                        "b-log-entity-result__badge",
                        item.badgeTone === "alta" && "is-alta",
                        item.badgeTone === "media" && "is-media",
                        item.badgeTone === "baja" && "is-baja",
                        item.badgeTone === "desvio" && "is-desvio",
                      )}
                    >
                      {item.meta}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </ModalShell>
  );
}
