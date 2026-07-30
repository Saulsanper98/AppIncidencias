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
  Inbox,
  LayoutDashboard,
  Loader2,
  MapPinned,
  NotebookPen,
  Route,
  Search,
  Shield,
  UserCircle2,
  Wrench,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useFramerTransition } from "@/hooks/use-reduced-motion-framer";
import { fadeScale } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { trackUxEvent } from "@/lib/ux-telemetry";

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
  { kind: "route", id: "bandeja", label: "Bandeja", hint: "Listado de tickets", href: "/bandeja", Icon: Inbox, shortcut: "G B" },
  { kind: "route", id: "tickets", label: "Tickets", hint: "Nuevo ticket y preventivo", href: "/tickets", Icon: ClipboardList, shortcut: "G T" },
  { kind: "route", id: "preventivo", label: "Preventivo", hint: "Buses anómalos", href: "/preventivo", Icon: Wrench, shortcut: "G P" },
  { kind: "route", id: "mapa", label: "Mapa", hint: "Vista geográfica", href: "/mapa", Icon: MapPinned, shortcut: "G M" },
  { kind: "route", id: "desvios", label: "Desvíos", hint: "Listado y nuevo desvío", href: "/desvios", Icon: AlertTriangle, shortcut: "G V" },
  { kind: "route", id: "bitacora", label: "Bitácora", hint: "Notas entre turnos", href: "/bitacora", Icon: NotebookPen, shortcut: "G L" },
  { kind: "route", id: "kb", label: "Base de conocimiento", hint: "Manuales y FAQs", href: "/kb", Icon: BookOpen, shortcut: "G K" },
  { kind: "route", id: "novedades", label: "Novedades", hint: "Avisos y cambios", href: "/novedades", Icon: Bell, shortcut: "G N" },
  { kind: "route", id: "account", label: "Mi cuenta", hint: "Perfil y contraseña", href: "/account", Icon: UserCircle2, shortcut: "G A" },
  { kind: "route", id: "admin", label: "Administración", hint: "Usuarios, catálogo, feedback", href: "/admin", Icon: Shield, shortcut: "G C" },
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

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="qs-mark">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="qs-kbd">{children}</kbd>;
}

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
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();
  const fetchAbortRef = useRef<AbortController | null>(null);
  const transition = useFramerTransition();
  const trimmedQuery = query.trim();
  const hasHighlight = trimmedQuery.length >= 2;
  const isBrowsing = trimmedQuery.length === 0;

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(async () => {
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
        const trimmed = query.trim();
        if (trimmed.length >= 2) {
          const counts = data.results;
          const total =
            (counts.ticket?.length ?? 0) +
            (counts.kb?.length ?? 0) +
            (counts.desvio?.length ?? 0) +
            (counts.bus?.length ?? 0) +
            (counts.linea?.length ?? 0) +
            (counts.announcement?.length ?? 0);
          trackUxEvent("search_query", {
            query: trimmed.slice(0, 80),
            length: trimmed.length,
            n_results: total,
            has_results: total > 0,
          });
        }
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
    return ROUTES.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.hint.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [query]);

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

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

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

  let cursor = filteredRoutes.length;
  const remoteSections = KIND_ORDER.map((kind) => {
    const items = remote[kind];
    if (items.length === 0) return null;
    const start = cursor;
    cursor += items.length;
    return { kind, items, start };
  }).filter(Boolean) as Array<{ kind: GlobalSearchKind; items: GlobalSearchResult[]; start: number }>;

  const hasAnyResult = flatList.length > 0;
  const remoteCount = remoteSections.reduce((n, s) => n + s.items.length, 0);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="qs-root"
          role="dialog"
          aria-modal="true"
          aria-label="Búsqueda rápida"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="qs-backdrop"
          />
          <motion.div
            className="qs-panel"
            variants={fadeScale}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
          >
            <div className="qs-header">
              <Search size={17} className="qs-header__icon" strokeWidth={1.7} aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar tickets, buses, desvíos, KB…"
                className="qs-header__input"
                autoComplete="off"
                spellCheck={false}
                aria-autocomplete="list"
                aria-controls="qs-results"
              />
              {loading ? (
                <Loader2 size={14} className="qs-header__spinner animate-spin" aria-hidden />
              ) : null}
              {query ? (
                <button
                  type="button"
                  className="qs-header__clear"
                  aria-label="Limpiar búsqueda"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <X size={14} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              <Kbd>Esc</Kbd>
            </div>

            <div id="qs-results" ref={listRef} className="qs-body" role="listbox">
              {filteredRoutes.length > 0 ? (
                <Section
                  title="Ir a"
                  meta={isBrowsing ? `${filteredRoutes.length}` : `${filteredRoutes.length} coincidencia${filteredRoutes.length === 1 ? "" : "s"}`}
                >
                  {filteredRoutes.map((r, idx) => (
                    <Item
                      key={r.id}
                      active={idx === active}
                      buttonRef={idx === active ? activeItemRef : undefined}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => handleSelect(r)}
                    >
                      <span className={cn("qs-item__icon", idx === active && "is-active")}>
                        <r.Icon size={15} strokeWidth={1.7} aria-hidden />
                      </span>
                      <span className="qs-item__text">
                        <span className="qs-item__title">
                          {hasHighlight ? highlightMatch(r.label, trimmedQuery) : r.label}
                        </span>
                        <span className="qs-item__hint">
                          {hasHighlight ? highlightMatch(r.hint, trimmedQuery) : r.hint}
                        </span>
                      </span>
                      {r.shortcut ? (
                        <span className="qs-item__shortcut" aria-hidden>
                          {r.shortcut.split(" ").map((part) => (
                            <Kbd key={part}>{part}</Kbd>
                          ))}
                        </span>
                      ) : (
                        <ArrowRight
                          size={14}
                          className={cn("qs-item__arrow", idx === active && "is-visible")}
                          aria-hidden
                        />
                      )}
                    </Item>
                  ))}
                </Section>
              ) : null}

              {remoteSections.map(({ kind, items, start }) => {
                const meta = KIND_META[kind];
                return (
                  <Section
                    key={kind}
                    title={isBrowsing && kind === "ticket" ? "Recientes" : meta.title}
                    meta={`${items.length}`}
                  >
                    {items.map((item, idx) => {
                      const realIdx = start + idx;
                      const isActive = realIdx === active;
                      return (
                        <Item
                          key={`${kind}-${item.id}`}
                          active={isActive}
                          buttonRef={isActive ? activeItemRef : undefined}
                          onMouseEnter={() => setActive(realIdx)}
                          onClick={() => handleSelect({ kind: "remote", data: item, href: item.href })}
                        >
                          <span className={cn("qs-item__icon", isActive && "is-active")}>
                            <meta.Icon size={15} strokeWidth={1.7} aria-hidden />
                          </span>
                          <span className="qs-item__text">
                            <span className="qs-item__title">
                              {hasHighlight ? highlightMatch(item.title, trimmedQuery) : item.title}
                            </span>
                            {item.subtitle ? (
                              <span className="qs-item__hint">
                                {hasHighlight
                                  ? highlightMatch(item.subtitle, trimmedQuery)
                                  : item.subtitle}
                              </span>
                            ) : null}
                          </span>
                          {item.badge ? <span className="qs-item__badge">{item.badge}</span> : null}
                          <ArrowRight
                            size={14}
                            className={cn("qs-item__arrow", isActive && "is-visible")}
                            aria-hidden
                          />
                        </Item>
                      );
                    })}
                  </Section>
                );
              })}

              {!hasAnyResult ? (
                <div className="qs-empty">
                  <Search size={22} strokeWidth={1.5} aria-hidden />
                  <p className="qs-empty__title">
                    {loading ? "Buscando…" : query ? `Sin resultados para «${query}»` : "Sin sugerencias"}
                  </p>
                  {!loading && query ? (
                    <p className="qs-empty__hint">Prueba un código de ticket, bus o un tramo de desvío.</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="qs-footer">
              <span className="qs-footer__group">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                <span>navegar</span>
              </span>
              <span className="qs-footer__group">
                <Kbd>↵</Kbd>
                <span>abrir</span>
              </span>
              <span className="qs-footer__meta">
                {loading
                  ? "Buscando…"
                  : remoteCount > 0
                    ? `${remoteCount} resultado${remoteCount === 1 ? "" : "s"}`
                    : null}
              </span>
              <span className="qs-footer__group qs-footer__group--end">
                <Command size={11} strokeWidth={1.8} aria-hidden />
                <Kbd>K</Kbd>
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="qs-section">
      <div className="qs-section__head">
        <p className="qs-section__title">{title}</p>
        {meta ? <span className="qs-section__meta">{meta}</span> : null}
      </div>
      <ul className="qs-section__list">{children}</ul>
    </div>
  );
}

function Item({
  active,
  onClick,
  onMouseEnter,
  buttonRef,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
        className={cn("qs-item", active && "is-active")}
      >
        {children}
      </button>
    </li>
  );
}
