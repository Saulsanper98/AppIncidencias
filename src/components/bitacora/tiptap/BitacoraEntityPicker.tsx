"use client";

import { BookOpen, Bus, Loader2, Route, Search, Ticket, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";

export type EntityPick =
  | { kind: "ticket"; id: string; label: string; href: string; subtitle?: string | null }
  | { kind: "desvio"; id: string; label: string; href: string; subtitle?: string | null }
  | { kind: "kb"; id: string; label: string; href: string; subtitle?: string | null }
  | { kind: "bus"; id: string; label: string; href: string; subtitle?: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (entity: EntityPick) => void;
};

type Tab = EntityPick["kind"];

const TAB_META: Record<Tab, { label: string; icon: typeof Ticket; placeholder: string }> = {
  ticket: {
    label: "Ticket",
    icon: Ticket,
    placeholder: "Buscar ticket por título o código…",
  },
  desvio: {
    label: "Desvío",
    icon: Route,
    placeholder: "Buscar desvío por referencia o tramo…",
  },
  kb: {
    label: "KB",
    icon: BookOpen,
    placeholder: "Buscar artículo de conocimiento…",
  },
  bus: {
    label: "Bus",
    icon: Bus,
    placeholder: "Buscar bus por matrícula o operadora…",
  },
};

export function BitacoraEntityPicker({ open, onClose, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>("ticket");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EntityPick[]>([]);

  const search = useCallback(async (kind: Tab, q: string) => {
    setLoading(true);
    try {
      if (kind === "ticket") {
        const params = new URLSearchParams({ limit: "12" });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/tickets/search?${params}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          tickets: { id: string; shortId: string; title: string }[];
        };
        setResults(
          (data.tickets ?? []).map((t) => ({
            kind: "ticket" as const,
            id: t.id,
            label: `#${t.shortId} · ${t.title}`,
            href: `/tickets/${t.id}`,
          })),
        );
        return;
      }

      if (kind === "desvio") {
        const params = new URLSearchParams({ pageSize: "12", page: "1" });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/desvios?${params}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          items: { id: string; referencia: string; tramo: string; titulo: string }[];
        };
        setResults(
          (data.items ?? []).map((d) => ({
            kind: "desvio" as const,
            id: d.id,
            label: `${d.referencia} · ${d.tramo || d.titulo}`,
            href: `/desvios/${d.id}`,
          })),
        );
        return;
      }

      const params = new URLSearchParams({ limit: "12" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/search/global?${params}`);
      if (!res.ok) throw new Error();
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
        })),
      );
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    void search(tab, "");
  }, [open, tab, search]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void search(tab, query), 220);
    return () => window.clearTimeout(t);
  }, [open, tab, query, search]);

  const TabIcon = TAB_META[tab].icon;

  return (
    <ModalShell open={open} onClose={onClose} size="md" title="Vincular elemento">
      <div className="space-y-4">
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
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={TAB_META[tab].placeholder}
            className="b-log-entity-search"
            autoFocus
            aria-label={`Buscar ${TAB_META[tab].label}`}
          />
        </div>

        <div className="b-log-entity-results" role="listbox" aria-label="Resultados">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-text-3)]">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Buscando…
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-3)]">
              {tab === "bus" && !query.trim()
                ? "Escribe para buscar un bus"
                : "Sin resultados"}
            </p>
          ) : (
            results.map((item) => {
              const Icon = TAB_META[item.kind].icon;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  role="option"
                  className={cn("b-log-entity-result", item.kind)}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <Icon size={14} aria-hidden />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate">{item.label}</span>
                    {item.subtitle ? (
                      <span className="b-log-entity-result__sub truncate">{item.subtitle}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </ModalShell>
  );
}
