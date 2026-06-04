"use client";

import {
  ArrowUpRight,
  BookOpenCheck,
  ChevronDown,
  Clock,
  Eye,
  FolderOpen,
  LayoutGrid,
  Library,
  ListTree,
  Plus,
  Search,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import Link from "next/link";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { KbArticleSummary, KbCategory } from "@/lib/domain";

type Props = {
  canEdit: boolean;
};

type ViewMode = "mosaico" | "categorias";
type SortMode = "recientes" | "vistos" | "alfabetico";

const SORT_LABELS: Record<SortMode, string> = {
  recientes: "Recientes",
  vistos: "Más vistos",
  alfabetico: "A - Z",
};

const RELATIVE = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "ahora";
  const min = Math.round(sec / 60);
  if (min < 60) return RELATIVE.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (hr < 24) return RELATIVE.format(-hr, "hour");
  const day = Math.round(hr / 24);
  if (day < 30) return RELATIVE.format(-day, "day");
  const mon = Math.round(day / 30);
  if (mon < 12) return RELATIVE.format(-mon, "month");
  return RELATIVE.format(-Math.round(mon / 12), "year");
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const norm = q.trim().toLowerCase();
  if (!norm) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(norm);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-[var(--color-accent-light)] px-0.5 text-[var(--color-accent)]">
        {text.slice(idx, idx + norm.length)}
      </mark>
      {text.slice(idx + norm.length)}
    </>
  );
}

export function KbIndex({ canEdit }: Props) {
  const [articles, setArticles] = useState<KbArticleSummary[]>([]);
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("mosaico");
  const [sort, setSort] = useState<SortMode>("recientes");
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch("/api/kb/articles", { cache: "no-store" }),
        fetch("/api/kb/categories", { cache: "no-store" }),
      ]);
      if (aRes.ok) {
        const data = (await aRes.json()) as { articles: KbArticleSummary[] };
        setArticles(data.articles);
      }
      if (cRes.ok) {
        const data = (await cRes.json()) as { categories: KbCategory[] };
        setCategories(data.categories);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Atajo "/" para enfocar la búsqueda
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allTags = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of articles) {
      for (const t of a.tags) {
        map.set(t, (map.get(t) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [articles]);

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    let list = articles.filter((a) => {
      if (activeCategory && a.categoryId !== activeCategory) return false;
      if (activeTag && !a.tags.some((t) => t.toLowerCase() === activeTag.toLowerCase())) return false;
      if (!lower) return true;
      const hay = [a.title, a.summary ?? "", a.tags.join(" "), a.categoryName ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(lower);
    });
    if (sort === "vistos") {
      list = [...list].sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));
    } else if (sort === "alfabetico") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else {
      list = [...list].sort((a, b) => {
        const da = new Date(a.publishedAt ?? a.updatedAt).getTime();
        const db = new Date(b.publishedAt ?? b.updatedAt).getTime();
        return db - da;
      });
    }
    return list;
  }, [articles, q, activeCategory, activeTag, sort]);

  const grouped = useMemo(() => {
    if (view !== "categorias") return [];
    const buckets = new Map<string | null, { category: KbCategory | null; items: KbArticleSummary[] }>();
    for (const a of filtered) {
      const key = a.categoryId ?? null;
      if (!buckets.has(key)) {
        const cat = a.categoryId ? categories.find((c) => c.id === a.categoryId) ?? null : null;
        buckets.set(key, { category: cat, items: [] });
      }
      buckets.get(key)!.items.push(a);
    }
    return [...buckets.values()].sort((x, y) => {
      const ox = x.category?.order ?? 999;
      const oy = y.category?.order ?? 999;
      if (ox !== oy) return ox - oy;
      const nx = x.category?.name ?? "\u200B";
      const ny = y.category?.name ?? "\u200B";
      return nx.localeCompare(ny);
    });
  }, [filtered, categories, view]);

  const totalArticles = articles.length;
  const totalCategories = categories.length;
  const totalTags = allTags.length;
  const hasFilters = Boolean(q || activeCategory || activeTag);

  const clearFilters = () => {
    setQ("");
    setActiveCategory(null);
    setActiveTag(null);
  };

  return (
    <div className="space-y-4">
      <HeroSearch
        ref={searchRef}
        q={q}
        onChange={setQ}
        loading={loading}
        totalArticles={totalArticles}
        totalCategories={totalCategories}
        totalTags={totalTags}
        canEdit={canEdit}
      />

      <ToolbarRow
        view={view}
        onView={setView}
        sort={sort}
        onSort={setSort}
        resultCount={filtered.length}
        hasFilters={hasFilters}
        onClear={clearFilters}
      />

      {categories.length > 0 ? (
        <CategoryChips
          categories={categories}
          articles={articles}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
          totalCount={articles.length}
        />
      ) : null}

      {allTags.length > 0 && view === "mosaico" ? (
        <TagCloud allTags={allTags} activeTag={activeTag} onSelect={setActiveTag} />
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="ccmgc-card h-36 animate-pulse p-4" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState q={q} canEdit={canEdit} onClear={clearFilters} hasFilters={hasFilters} />
      ) : view === "categorias" ? (
        <div className="space-y-5">
          {grouped.map((bucket) => (
            <CategorySection
              key={bucket.category?.id ?? "_uncategorized"}
              category={bucket.category}
              articles={bucket.items}
              q={q}
            />
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((article) => (
            <li key={article.id}>
              <ArticleCard article={article} q={q} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- HERO SEARCH ----------

type HeroSearchProps = {
  q: string;
  onChange: (v: string) => void;
  loading: boolean;
  totalArticles: number;
  totalCategories: number;
  totalTags: number;
  canEdit: boolean;
};

const HeroSearch = forwardRef<HTMLInputElement, HeroSearchProps>(function HeroSearch(
  { q, onChange, loading, totalArticles, totalCategories, totalTags, canEdit },
  ref,
) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface-1)] via-[var(--color-surface-1)] to-[var(--color-accent-light)]/40 p-4 shadow-sm sm:p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--color-accent-light)] p-2.5 text-[var(--color-accent)]">
            <Library size={22} strokeWidth={1.6} aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                CCMGC
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                Centro de documentación
              </span>
            </div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]">
              Base de conocimiento
            </h1>
            <p className="mt-0.5 max-w-xl text-[12.5px] text-[var(--color-text-3)]">
              Procedimientos, FAQs y casos resueltos del Centro de Control de Movilidad. Pulsa{" "}
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1 py-0.5 font-mono text-[10px] text-[var(--color-text-2)]">
                /
              </kbd>{" "}
              para buscar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatBadge icon={<BookOpenCheck size={12} strokeWidth={1.6} aria-hidden />} label="Artículos" value={totalArticles} />
          <StatBadge icon={<FolderOpen size={12} strokeWidth={1.6} aria-hidden />} label="Categorías" value={totalCategories} />
          <StatBadge icon={<Tag size={12} strokeWidth={1.6} aria-hidden />} label="Etiquetas" value={totalTags} />
          {canEdit ? (
            <Link
              href="/admin/kb"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[12.5px] font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus size={14} aria-hidden strokeWidth={2} />
              Gestionar artículos
            </Link>
          ) : null}
        </div>
      </div>

      <div className="relative mt-5">
        <Search
          size={16}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
          aria-hidden
        />
        <input
          ref={ref}
          type="search"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Busca un procedimiento, una FAQ o un caso\u2026"}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] py-2.5 pl-10 pr-10 text-[14px] text-[var(--color-text-1)] shadow-sm outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent-light)]"
          aria-label="Buscar artículos"
        />
        {q ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
            aria-label="Limpiar búsqueda"
          >
            <X size={14} strokeWidth={1.6} aria-hidden />
          </button>
        ) : null}
        {loading ? (
          <span className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
            Cargando{"\u2026"}
          </span>
        ) : null}
      </div>
    </section>
  );
});

type StatBadgeProps = { icon: React.ReactNode; label: string; value: number };
function StatBadge({ icon, label, value }: StatBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)]/80 px-2.5 py-1.5 text-[var(--color-text-2)] shadow-sm backdrop-blur">
      <span className="text-[var(--color-text-3)]">{icon}</span>
      <span className="num-tabular text-[13px] font-semibold text-[var(--color-text-1)]">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">{label}</span>
    </div>
  );
}

// ---------- TOOLBAR ----------

type ToolbarProps = {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  sort: SortMode;
  onSort: (v: SortMode) => void;
  resultCount: number;
  hasFilters: boolean;
  onClear: () => void;
};

function ToolbarRow({ view, onView, sort, onSort, resultCount, hasFilters, onClear }: ToolbarProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!sortRef.current) return;
      if (!sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-3)]">
        <span className="num-tabular font-medium text-[var(--color-text-1)]">{resultCount}</span>
        <span>artículo{resultCount === 1 ? "" : "s"}</span>
        {hasFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-text-2)] transition-colors hover:text-[var(--color-text-1)]"
          >
            <X size={10} strokeWidth={1.8} aria-hidden />
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* Sort */}
        <div className="relative" ref={sortRef}>
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-text-2)] shadow-sm hover:text-[var(--color-text-1)]"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
          >
            <Sparkles size={11} strokeWidth={1.6} aria-hidden />
            <span>{SORT_LABELS[sort]}</span>
            <ChevronDown size={11} strokeWidth={1.6} aria-hidden />
          </button>
          {sortOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-lg"
            >
              {(Object.keys(SORT_LABELS) as SortMode[]).map((s) => (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={sort === s}
                  type="button"
                  onClick={() => {
                    onSort(s);
                    setSortOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                    sort === s
                      ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                      : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
                  }`}
                >
                  <span>{SORT_LABELS[s]}</span>
                  {sort === s ? <span className="text-[var(--color-accent)]">•</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* View toggle */}
        <div
          role="tablist"
          aria-label="Modo de vista"
          className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-0.5 shadow-sm"
        >
          <button
            role="tab"
            aria-selected={view === "mosaico"}
            type="button"
            onClick={() => onView("mosaico")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium transition-colors ${
              view === "mosaico"
                ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
            }`}
            title="Vista en mosaico"
          >
            <LayoutGrid size={11} strokeWidth={1.6} aria-hidden /> Mosaico
          </button>
          <button
            role="tab"
            aria-selected={view === "categorias"}
            type="button"
            onClick={() => onView("categorias")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium transition-colors ${
              view === "categorias"
                ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
            }`}
            title="Agrupado por categoría"
          >
            <ListTree size={11} strokeWidth={1.6} aria-hidden /> Por categoría
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- CATEGORY CHIPS ----------

type CategoryChipsProps = {
  categories: KbCategory[];
  articles: KbArticleSummary[];
  activeCategory: string | null;
  onSelect: (id: string | null) => void;
  totalCount: number;
};

function CategoryChips({ categories, articles, activeCategory, onSelect, totalCount }: CategoryChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip active={activeCategory === null} onClick={() => onSelect(null)}>
        Todas{" "}
        <span className={`num-tabular ${activeCategory === null ? "opacity-90" : "opacity-60"}`}>
          ({totalCount})
        </span>
      </Chip>
      {categories.map((c) => {
        const count = articles.filter((a) => a.categoryId === c.id).length;
        if (count === 0 && activeCategory !== c.id) return null;
        const isActive = activeCategory === c.id;
        return (
          <Chip key={c.id} active={isActive} onClick={() => onSelect(isActive ? null : c.id)}>
            <FolderOpen size={10} strokeWidth={1.7} aria-hidden />
            {c.name} <span className={`num-tabular ${isActive ? "opacity-90" : "opacity-60"}`}>({count})</span>
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- TAG CLOUD ----------

function TagCloud({
  allTags,
  activeTag,
  onSelect,
}: {
  allTags: [string, number][];
  activeTag: string | null;
  onSelect: (t: string | null) => void;
}) {
  const top = allTags.slice(0, 16);
  if (top.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">Etiquetas</span>
      {top.map(([t, count]) => {
        const isActive = activeTag?.toLowerCase() === t.toLowerCase();
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(isActive ? null : t)}
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition-colors ${
              isActive
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
            }`}
          >
            <Tag size={9} strokeWidth={1.7} aria-hidden />
            {t}
            <span className={`num-tabular text-[9px] ${isActive ? "opacity-80" : "opacity-60"}`}>·{count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- ARTICLE CARD ----------

function ArticleCard({ article, q }: { article: KbArticleSummary; q: string }) {
  const updated = formatRelative(article.publishedAt ?? article.updatedAt);
  return (
    <Link
      href={`/kb/${article.slug}`}
      className="ccmgc-card group relative flex h-full flex-col gap-2 p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)]/30 hover:shadow-md"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-0 h-0.5 origin-center scale-x-0 rounded-full bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent opacity-0 transition-all duration-300 group-hover:scale-x-100 group-hover:opacity-80"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-text-3)]">
          {article.categoryName ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-medium text-[var(--color-text-2)]">
              <FolderOpen size={9} strokeWidth={1.7} aria-hidden />
              {article.categoryName}
            </span>
          ) : (
            <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-text-3)]">
              Sin categoría
            </span>
          )}
          {article.status !== "publicado" ? (
            <span className="rounded-full bg-[var(--color-warning-light)] px-2 py-0.5 font-medium text-[var(--color-warning)]">
              {article.status}
            </span>
          ) : null}
        </div>
        <ArrowUpRight
          size={14}
          strokeWidth={1.6}
          className="shrink-0 text-[var(--color-text-3)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
          aria-hidden
        />
      </div>

      <h3 className="text-[15px] font-semibold leading-snug text-[var(--color-text-1)] transition-colors group-hover:text-[var(--color-accent)]">
        {highlight(article.title, q)}
      </h3>
      {article.summary ? (
        <p className="line-clamp-3 text-[12.5px] leading-relaxed text-[var(--color-text-3)]">
          {highlight(article.summary, q)}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[10.5px] text-[var(--color-text-3)]">
        {article.tags.slice(0, 3).map((t) => (
          <span key={t} className="inline-flex items-center gap-0.5">
            <Tag size={9} strokeWidth={1.6} aria-hidden />
            {t}
          </span>
        ))}
        {article.tags.length > 3 ? (
          <span className="text-[10px]">+{article.tags.length - 3}</span>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-2">
          {article.views > 0 ? (
            <span className="inline-flex items-center gap-0.5 num-tabular">
              <Eye size={10} strokeWidth={1.6} aria-hidden /> {article.views}
            </span>
          ) : null}
          {updated ? (
            <span className="inline-flex items-center gap-0.5">
              <Clock size={10} strokeWidth={1.6} aria-hidden /> {updated}
            </span>
          ) : null}
        </span>
      </div>
    </Link>
  );
}

// ---------- CATEGORY SECTION ----------

function CategorySection({
  category,
  articles,
  q,
}: {
  category: KbCategory | null;
  articles: KbArticleSummary[];
  q: string;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-end justify-between gap-2 border-b border-dashed border-[var(--color-border)] pb-1.5">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[var(--color-accent-light)] p-1 text-[var(--color-accent)]">
            <FolderOpen size={13} strokeWidth={1.7} aria-hidden />
          </span>
          <h2 className="text-[14px] font-semibold tracking-tight text-[var(--color-text-1)]">
            {category?.name ?? "Sin categoría"}
          </h2>
          <span className="num-tabular text-[11px] text-[var(--color-text-3)]">{articles.length}</span>
        </div>
        {category?.description ? (
          <span className="hidden text-[11px] text-[var(--color-text-3)] sm:block">{category.description}</span>
        ) : null}
      </header>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {articles.map((a) => (
          <li key={a.id}>
            <ArticleCard article={a} q={q} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- EMPTY STATE ----------

function EmptyState({
  q,
  canEdit,
  hasFilters,
  onClear,
}: {
  q: string;
  canEdit: boolean;
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="ccmgc-card flex flex-col items-center gap-2 p-10 text-center">
      <div className="rounded-full bg-[var(--color-surface-2)] p-3 text-[var(--color-text-3)]">
        <BookOpenCheck size={26} strokeWidth={1.3} aria-hidden />
      </div>
      <p className="text-[14px] font-semibold text-[var(--color-text-1)]">
        {q ? (
          <>
            Sin resultados para <span className="text-[var(--color-accent)]">&ldquo;{q}&rdquo;</span>
          </>
        ) : hasFilters ? (
          "Sin resultados con los filtros aplicados"
        ) : (
          "Aún no hay artículos publicados"
        )}
      </p>
      <p className="max-w-md text-[12px] text-[var(--color-text-3)]">
        {hasFilters
          ? "Prueba a quitar algún filtro o cambiar la búsqueda."
          : canEdit
            ? "Empieza creando uno desde Gestionar artículos."
            : "Vuelve más tarde o sugiere un tema desde Feedback."}
      </p>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
        >
          <X size={11} strokeWidth={1.6} aria-hidden />
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}
