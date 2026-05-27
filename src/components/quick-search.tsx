"use client";

/**
 * Quick-search global (Ctrl+K).
 *
 * Atajos:
 *  - Ctrl/Cmd + K  abre / cierra el modal.
 *  - Esc           cierra.
 *  - Flechas       navegan entre sugerencias.
 *  - Enter         abre la sugerencia destacada.
 *
 * Datos:
 *  - Las "rutas" se filtran en cliente (set fijo).
 *  - El resto (tickets, KB, desvíos, buses, líneas, anuncios) llega del
 *    endpoint `/api/search/global?q=...` con un debounce de 200 ms. Si el
 *    query está vacío se piden los "destacados" (tickets recientes,
 *    novedades publicadas).
 */

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Bus as BusIcon,
  ClipboardList,
  Command,
  LayoutDashboard,
  MapPinned,
  Package,
  Route,
  Search,
  Shield,
  UserCircle2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Tipos duplicados local-mente para evitar arrastrar el route handler al
// bundle del cliente (Next.js permite importar tipos pero queremos cero
// acoplamiento con el módulo server-side de `/api/search/global`).
export type GlobalSearchKind =
  | "ticket"
  | "kb"
  | "desvio"
  | "bus"
  | "linea"
  | "announcement";

export type GlobalSearchResult = {
  kind: GlobalSearchKind;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  badge?: string;
};

type StaticTarget = {
  kind: "route";
  id: string;
  label: string;
  hint: string;
  href: string;
  Icon: typeof LayoutDashboard;
  shortcut?: string;
};

type RemoteSuggestion = {
  kind: "remote";
  data: GlobalSearchResult;
  href: string;
};

type Suggestion = StaticTarget | RemoteSuggestion;

const ROUTES: StaticTarget[] = [
  { kind: "route", id: "dashboard", label: "Dashboard", hint: "Panel operativo", href: "/dashboard", Icon: LayoutDashboard, shortcut: "G D" },
  { kind: "route", id: "tickets", label: "Tickets", hint: "Bandeja y nuevo ticket", href: "/tickets", Icon: ClipboardList, shortcut: "G T" },
  { kind: "route", id: "inventory", label: "Inventario", hint: "Repuestos y stock", href: "/inventory", Icon: Package, shortcut: "G I" },
  { kind: "route", id: "mapa", label: "Mapa", hint: "Vista geográfica", href: "/mapa", Icon: MapPinned, shortcut: "G M" },
  { kind: "route", id: "novedades", label: "Novedades", hint: "Avisos y cambios de versión", href: "/novedades", Icon: Bell },
  { kind: "route", id: "kb", label: "Base de conocimiento", hint: "Manuales y FAQs", href: "/kb", Icon: BookOpen, shortcut: "G K" },
  { kind: "route", id: "desvios", label: "Desvíos", hint: "Listado y nuevo desvío", href: "/desvios", Icon: AlertTriangle },
  { kind: "route", id: "account", label: "Mi cuenta", hint: "Perfil y contraseña", href: "/account", Icon: UserCircle2, shortcut: "G A" },
  { kind: "route", id: "admin", label: "Administración", hint: "Usuarios, catálogo, feedback", href: "/admin", Icon: Shield },
];

type GlobalSearchPayload = {
  q: string;
  results: Record<GlobalSearchKind, GlobalSearchResult[]>;
};

const KIND_META: Record<GlobalSearchKind, { title: string; Icon: typeof LayoutDashboard }> = {
  ticket: { title: "Tickets", Icon: ClipboardList },
  kb: { title: "Base de conocimiento", Icon: BookOpen },
  desvio: { title: "Desvíos", Icon: AlertTriangle },
  bus: { title: "Buses", Icon: BusIcon },
  linea: { title: "Líneas", Icon: Route },
  announcement: { title: "Avisos y novedades", Icon: Bell },
};

const KIND_ORDER: GlobalSearchKind[] = ["ticket", "kb", "desvio", "bus", "linea", "announcement"];

export function QuickSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Record<GlobalSearchKind, GlobalSearchResult[]>>({
    ticket: [],
    kb: [],
    desvio: [],
    bus: [],
    linea: [],
    announcement: [],
  });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isOpenCombo = (e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K");
      if (isOpenCombo) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onCustomOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ccmgc-open-quick-search", onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ccmgc-open-quick-search", onCustomOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Búsqueda remota con debounce.
  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(async () => {
      // Cancelamos cualquier fetch anterior si seguía en vuelo.
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      setLoading(true);
      try {
        const url = `/api/search/global?q=${encodeURIComponent(query.trim())}&limit=6`;
        const res = await fetch(url, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) {
          setRemote({ ticket: [], kb: [], desvio: [], bus: [], linea: [], announcement: [] });
          return;
        }
        const data = (await res.json()) as GlobalSearchPayload;
        setRemote(data.results);
      } catch (error) {
        if ((error as { name?: string })?.name !== "AbortError") {
          console.warn("quick-search:", error);
          setRemote({ ticket: [], kb: [], desvio: [], bus: [], linea: [], announcement: [] });
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROUTES;
    return ROUTES.filter((r) => r.label.toLowerCase().includes(q) || r.hint.toLowerCase().includes(q));
  }, [query]);

  // Lista plana en el ORDEN en que se renderizan, para mapear flecha ↓/↑ con
  // los `realIdx`.
  const flatList: Suggestion[] = useMemo(() => {
    const flat: Suggestion[] = filteredRoutes.map((r) => r);
    for (const kind of KIND_ORDER) {
      for (const item of remote[kind]) {
        flat.push({ kind: "remote", data: item, href: item.href });
      }
    }
    return flat;
  }, [filteredRoutes, remote]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, flatList.length - 1)));
  }, [flatList.length]);

  const handleSelect = useCallback(
    (s: Suggestion | undefined) => {
      if (!s) return;
      setOpen(false);
      router.push(s.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(flatList.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(flatList[active]);
    }
  };

  if (!open) return null;

  let cursor = filteredRoutes.length;
  const remoteSections = KIND_ORDER.map((kind) => {
    const items = remote[kind];
    if (items.length === 0) return null;
    const start = cursor;
    cursor += items.length;
    return { kind, items, start };
  }).filter(Boolean) as Array<{ kind: GlobalSearchKind; items: GlobalSearchResult[]; start: number }>;

  const hasAnyResult = flatList.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda rápida"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <Search size={16} className="text-[var(--color-text-3)]" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar tickets, KB, desvíos, buses, líneas, avisos…"
            className="flex-1 bg-transparent text-[15px] text-[var(--color-text-1)] outline-none placeholder:text-[var(--color-text-3)]"
            autoComplete="off"
            spellCheck={false}
          />
          {loading ? (
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">…</span>
          ) : null}
          <span className="kbd">Esc</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filteredRoutes.length > 0 ? (
            <Section title="Ir a">
              {filteredRoutes.map((r, idx) => (
                <Item
                  key={r.id}
                  active={idx === active}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => handleSelect(r)}
                >
                  <r.Icon size={16} strokeWidth={1.5} className="text-[var(--color-text-3)]" />
                  <span className="flex-1 min-w-0">
                    <span className="text-[14px] text-[var(--color-text-1)]">{r.label}</span>
                    <span className="ml-2 text-[12px] text-[var(--color-text-3)]">{r.hint}</span>
                  </span>
                  {r.shortcut ? <span className="kbd shrink-0">{r.shortcut}</span> : null}
                </Item>
              ))}
            </Section>
          ) : null}

          {remoteSections.map(({ kind, items, start }) => {
            const meta = KIND_META[kind];
            return (
              <Section key={kind} title={meta.title}>
                {items.map((item, idx) => {
                  const realIdx = start + idx;
                  return (
                    <Item
                      key={`${kind}-${item.id}`}
                      active={realIdx === active}
                      onMouseEnter={() => setActive(realIdx)}
                      onClick={() => handleSelect({ kind: "remote", data: item, href: item.href })}
                    >
                      <meta.Icon size={16} strokeWidth={1.5} className="text-[var(--color-text-3)]" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-[14px] text-[var(--color-text-1)]">
                          {item.title}
                        </span>
                        {item.subtitle ? (
                          <span className="block truncate text-[12px] text-[var(--color-text-3)]">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <ArrowRight size={14} className="text-[var(--color-text-3)]" />
                    </Item>
                  );
                })}
              </Section>
            );
          })}

          {!hasAnyResult ? (
            <p className="px-4 py-6 text-center text-[13px] text-[var(--color-text-3)]">
              {loading ? "Buscando…" : query ? `Sin resultados para "${query}"` : "Sin sugerencias"}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-2 text-[11px] text-[var(--color-text-3)]">
          <span className="flex items-center gap-1.5">
            <span className="kbd">UP</span><span className="kbd">DN</span> navegar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="kbd">Enter</span> abrir
          </span>
          <span className="flex items-center gap-1.5">
            <Command size={12} strokeWidth={1.5} />
            <span className="kbd">K</span> abrir / cerrar
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-3)]/70">
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

function Item({
  active,
  onClick,
  onMouseEnter,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-selected={active}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
        className={cn(
          "group flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
          active ? "bg-[var(--color-surface-2)]" : "hover:bg-[var(--color-surface-2)]/70",
        )}
      >
        {children}
      </button>
    </li>
  );
}
