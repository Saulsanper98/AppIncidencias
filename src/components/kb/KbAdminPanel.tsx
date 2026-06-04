"use client";

import {
  Archive,
  BookOpenCheck,
  CheckCircle2,
  Eye,
  FilePlus2,
  FileText,
  Folder,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { KbEditor, type KbDraft } from "@/components/kb/KbEditor";
import type { KbArticleDetail, KbArticleStatus, KbArticleSummary, KbCategory } from "@/lib/domain";
import { cn } from "@/lib/utils";

type DraftArticle = KbDraft;

const EMPTY_DRAFT: DraftArticle = {
  title: "",
  summary: "",
  contentMd: "",
  status: "borrador",
  tags: "",
  linkedTicketIds: "",
  categoryId: "",
};

const STATUS_LABELS: Record<KbArticleStatus, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  archivado: "Archivado",
};

export function KbAdminPanel() {
  const [articles, setArticles] = useState<KbArticleSummary[]>([]);
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DraftArticle | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  // Filtros de la rejilla de artículos (no se persisten porque se usan poco).
  const [statusFilter, setStatusFilter] = useState<"all" | KbArticleStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const initialEditCheckedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch("/api/kb/articles?status=todos", { cache: "no-store" }),
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = useCallback(async (articleId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/kb/articles/${articleId}`, { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudo cargar el artículo");
        return;
      }
      const data = (await res.json()) as { article: KbArticleDetail };
      setEditing({
        id: data.article.id,
        title: data.article.title,
        summary: data.article.summary ?? "",
        contentMd: data.article.contentMd,
        status: data.article.status,
        tags: data.article.tags.join(", "),
        linkedTicketIds: data.article.linkedTicketIds.join(", "),
        categoryId: data.article.categoryId ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  // Auto-cargar si la URL trae ?edit=<id>
  useEffect(() => {
    if (initialEditCheckedRef.current || loading) return;
    initialEditCheckedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId) void startEdit(editId);
  }, [loading, startEdit]);

  const startNew = () => {
    setEditing(EMPTY_DRAFT);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const saveArticle = async () => {
    if (!editing) return;
    if (editing.title.trim().length < 3) {
      setError("El título debe tener al menos 3 caracteres.");
      return;
    }
    if (editing.contentMd.trim().length === 0) {
      setError("El contenido no puede estar vacío.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: editing.title.trim(),
        summary: editing.summary.trim() || null,
        contentMd: editing.contentMd,
        status: editing.status,
        categoryId: editing.categoryId || null,
        tags: editing.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        linkedTicketIds: editing.linkedTicketIds
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const url = editing.id ? `/api/kb/articles/${editing.id}` : "/api/kb/articles";
      const method = editing.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "No se pudo guardar el artículo");
        return;
      }
      setEditing(null);
      setNotice(editing.id ? "Artículo actualizado." : "Artículo creado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async (id: string, title: string) => {
    if (!confirm(`\u00BFEliminar el artículo "${title}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/kb/articles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("No se pudo eliminar.");
        return;
      }
      setNotice("Artículo eliminado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (name.length < 2) return;
    setCreatingCategory(true);
    setError(null);
    try {
      const res = await fetch("/api/kb/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setError("No se pudo crear la categoría.");
        return;
      }
      const data = (await res.json()) as { category: KbCategory };
      setCategories((prev) => [...prev, data.category].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName("");
      if (editing) setEditing({ ...editing, categoryId: data.category.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreatingCategory(false);
    }
  };

  const deleteCategory = async (id: string, name: string) => {
    if (!confirm(`\u00BFEliminar la categoría "${name}"? Los artículos quedarán sin categoría.`)) return;
    try {
      const res = await fetch(`/api/kb/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("No se pudo eliminar la categoría.");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const headerCounts = useMemo(() => {
    const total = articles.length;
    const publicados = articles.filter((a) => a.status === "publicado").length;
    const borradores = articles.filter((a) => a.status === "borrador").length;
    const archivados = articles.filter((a) => a.status === "archivado").length;
    return { total, publicados, borradores, archivados };
  }, [articles]);

  const knownTags = useMemo(() => {
    const set = new Map<string, number>();
    for (const a of articles) {
      for (const t of a.tags) {
        const k = t.trim();
        if (!k) continue;
        set.set(k, (set.get(k) ?? 0) + 1);
      }
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [articles]);

  /**
   * Lista visible de artículos tras aplicar:
   *   - filtro por estado (todos / publicado / borrador / archivado)
   *   - filtro por categoría
   *   - búsqueda libre sobre título, resumen y etiquetas
   */
  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (categoryFilter && (a.categoryId ?? "") !== categoryFilter) return false;
      if (q) {
        const haystack = `${a.title} ${a.summary ?? ""} ${a.tags.join(" ")} ${a.authorName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [articles, statusFilter, categoryFilter, searchQuery]);

  const filtersDirty = statusFilter !== "all" || categoryFilter !== null || searchQuery.trim() !== "";

  if (editing) {
    return (
      <KbEditor
        draft={editing}
        categories={categories}
        saving={saving}
        error={error}
        knownTags={knownTags}
        onChange={setEditing}
        onCancel={cancelEdit}
        onSave={() => void saveArticle()}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* ── HERO con glow ──────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-sky-500/[0.07] p-4 shadow-sm sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl"
        />
        {/* Movil: titulo + acciones apilados; tablet+: horizontal. */}
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/12 ring-1 ring-sky-400/30 text-sky-300">
              <Sparkles size={20} strokeWidth={1.7} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--color-text-3)]">
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-semibold">CCMGC</span>
                Base de conocimiento
              </div>
              <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]">
                Manuales, FAQs y casos resueltos
              </h1>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                Documenta el conocimiento operativo del centro de control. Los artículos publicados
                se sugieren automáticamente al crear tickets similares.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/kb"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px] font-medium text-[var(--color-text-2)] hover:border-sky-400/40 hover:text-[var(--color-text-1)]"
            >
              <BookOpenCheck size={13} strokeWidth={1.7} aria-hidden />
              Ver KB pública
            </Link>
            <button
              type="button"
              onClick={startNew}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[12.5px] font-medium text-white shadow-sm hover:opacity-90"
            >
              <FilePlus2 size={13} strokeWidth={1.7} aria-hidden />
              Nuevo artículo
            </button>
          </div>
        </div>

        {/* KPIs por estado (clic = filtra) */}
        <div className="relative mt-4 grid grid-cols-2 gap-1.5 border-t border-[var(--color-border)] pt-3 sm:grid-cols-4">
          <KbKpi
            icon={<FileText size={11} aria-hidden />}
            label="Total"
            value={headerCounts.total}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            tone="neutral"
          />
          <KbKpi
            icon={<CheckCircle2 size={11} aria-hidden />}
            label="Publicados"
            value={headerCounts.publicados}
            active={statusFilter === "publicado"}
            onClick={() => setStatusFilter(statusFilter === "publicado" ? "all" : "publicado")}
            tone="success"
          />
          <KbKpi
            icon={<Pencil size={11} aria-hidden />}
            label="Borradores"
            value={headerCounts.borradores}
            active={statusFilter === "borrador"}
            onClick={() => setStatusFilter(statusFilter === "borrador" ? "all" : "borrador")}
            tone="warning"
          />
          <KbKpi
            icon={<Archive size={11} aria-hidden />}
            label="Archivados"
            value={headerCounts.archivados}
            active={statusFilter === "archivado"}
            onClick={() => setStatusFilter(statusFilter === "archivado" ? "all" : "archivado")}
            tone="muted"
          />
        </div>
      </header>

      {notice ? (
        <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-3 py-2 text-sm text-[var(--color-success)]">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      {/* ── CATEGORÍAS ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <span aria-hidden className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-violet-400/70" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/12 text-violet-300">
              <Folder size={15} strokeWidth={1.8} aria-hidden />
            </div>
            <div>
              <h2 className="text-subheading">Categorías</h2>
              <p className="text-[11.5px] text-[var(--color-text-3)]">
                Agrupan los artículos por temática (manuales, FAQs, casos resueltos…).
              </p>
            </div>
          </div>
          <div className="flex w-full max-w-md items-end gap-2">
            <label className="flex-1 space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-3)]">
                Nueva categoría
              </span>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createCategory();
                  }
                }}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                placeholder="Ej: Manuales, FAQs, Casos resueltos…"
                maxLength={80}
              />
            </label>
            <button
              type="button"
              onClick={() => void createCategory()}
              disabled={creatingCategory || newCategoryName.trim().length < 2}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingCategory ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
              Añadir
            </button>
          </div>
        </div>
        {categories.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors",
                categoryFilter === null
                  ? "border-violet-400/50 bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
              )}
            >
              Todas
              <span className="opacity-70">({articles.length})</span>
            </button>
            {categories.map((c) => {
              const active = categoryFilter === c.id;
              return (
                <span
                  key={c.id}
                  className={cn(
                    "group inline-flex items-center gap-1 rounded-full border py-1 pl-2.5 pr-1 text-[11.5px] transition-colors",
                    active
                      ? "border-violet-400/50 bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-violet-400/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(active ? null : c.id)}
                    className="flex items-center gap-1 font-medium text-[var(--color-text-1)]"
                    title={`Filtrar por ${c.name}`}
                  >
                    <Folder size={10} strokeWidth={1.8} aria-hidden className="opacity-70" />
                    {c.name}
                    {typeof c.articleCount === "number" ? (
                      <span className="text-[var(--color-text-3)]">({c.articleCount})</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteCategory(c.id, c.name)}
                    aria-label={`Eliminar ${c.name}`}
                    className="rounded p-0.5 text-[var(--color-text-3)] opacity-60 transition-all hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)] group-hover:opacity-100"
                  >
                    <X size={11} strokeWidth={1.75} aria-hidden />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* ── ARTÍCULOS (grid de cards) ──────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-subheading">Artículos</h2>
            <p className="text-[11.5px] text-[var(--color-text-3)]">
              {filteredArticles.length} de {headerCounts.total}
              {filtersDirty ? " · con filtros aplicados" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={13}
                strokeWidth={1.5}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar título, resumen, etiqueta…"
                className="w-[260px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-2.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                aria-label="Filtrar artículos"
              />
            </div>
            {filtersDirty ? (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setCategoryFilter(null);
                  setSearchQuery("");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
              >
                <X size={11} aria-hidden /> Limpiar
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60"
              />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-10 text-center">
            <Sparkles size={28} className="mx-auto mb-3 text-[var(--color-text-3)]" aria-hidden />
            <p className="text-[13.5px] font-medium text-[var(--color-text-1)]">
              Aún no hay artículos
            </p>
            <p className="mt-1 text-[12px] text-[var(--color-text-3)]">
              Crea tu primer artículo para empezar la base de conocimiento del centro de control.
            </p>
            <button
              type="button"
              onClick={startNew}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[12.5px] font-medium text-white hover:opacity-90"
            >
              <FilePlus2 size={13} aria-hidden /> Nuevo artículo
            </button>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-8 text-center text-[12.5px] text-[var(--color-text-3)]">
            No hay artículos que coincidan con los filtros actuales.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredArticles.map((a) => (
              <KbArticleCard
                key={a.id}
                article={a}
                onEdit={() => void startEdit(a.id)}
                onDelete={() => void deleteArticle(a.id, a.title)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Subcomponentes del panel ─────────────────────────────────────────────

type KbKpiTone = "neutral" | "success" | "warning" | "muted";

function KbKpi({
  icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: KbKpiTone;
  active: boolean;
  onClick: () => void;
}) {
  const toneCls =
    tone === "success"
      ? "ring-[var(--color-success)]/30 bg-[var(--color-success-light)] text-[var(--color-success)]"
      : tone === "warning"
        ? "ring-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : tone === "muted"
          ? "ring-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]"
          : "ring-sky-400/30 bg-sky-500/10 text-sky-300";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 transition-all",
        toneCls,
        active ? "scale-[1.02] shadow-sm" : "opacity-80 hover:opacity-100 hover:shadow-sm",
      )}
    >
      <span className="opacity-80">{icon}</span>
      <div className="flex min-w-0 flex-col text-left">
        <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
        <span className="num-tabular text-[15px] font-semibold leading-tight">{value}</span>
      </div>
    </button>
  );
}

function KbArticleCard({
  article,
  onEdit,
  onDelete,
}: {
  article: KbArticleSummary;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusTone =
    article.status === "publicado"
      ? "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]"
      : article.status === "borrador"
        ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
        : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]";
  const accentBar =
    article.status === "publicado"
      ? "bg-[var(--color-success)]/70"
      : article.status === "borrador"
        ? "bg-[var(--color-warning)]/70"
        : "bg-[var(--color-text-3)]/40";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)]/40 hover:shadow-md">
      <span aria-hidden className={cn("absolute inset-y-3 left-0 w-0.5 rounded-r", accentBar)} />
      <header className="flex items-start justify-between gap-2">
        <Link
          href={`/kb/${article.slug}`}
          className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--color-text-1)] transition-colors hover:text-[var(--color-accent)]"
        >
          {article.title}
        </Link>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            statusTone,
          )}
        >
          {STATUS_LABELS[article.status]}
        </span>
      </header>

      {article.summary ? (
        <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-[var(--color-text-3)]">
          {article.summary}
        </p>
      ) : (
        <p className="mt-2 text-[12px] italic text-[var(--color-text-3)]/60">Sin resumen.</p>
      )}

      {article.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {article.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-2)]"
            >
              <Tag size={9} strokeWidth={1.7} className="opacity-70" aria-hidden />
              {t}
            </span>
          ))}
          {article.tags.length > 4 ? (
            <span className="text-[10.5px] text-[var(--color-text-3)]">+{article.tags.length - 4}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-3)]">
        {article.categoryName ? (
          <span className="inline-flex items-center gap-1">
            <Folder size={10} strokeWidth={1.7} aria-hidden />
            {article.categoryName}
          </span>
        ) : null}
        {article.authorName ? (
          <span className="inline-flex items-center gap-1">
            <User size={10} strokeWidth={1.7} aria-hidden />
            {article.authorName}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Eye size={10} strokeWidth={1.7} aria-hidden />
          {article.views}
        </span>
        <span className="ml-auto text-[10.5px] tabular-nums" title={article.updatedAt}>
          {relativeShort(article.updatedAt)}
        </span>
      </div>

      <footer className="mt-3 flex items-center justify-end gap-1 border-t border-[var(--color-border)] pt-2 opacity-80 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-2)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-1)]"
          aria-label={`Editar ${article.title}`}
        >
          <Pencil size={11} strokeWidth={1.7} aria-hidden /> Editar
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-3)] hover:border-[var(--color-error)]/40 hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
          aria-label={`Eliminar ${article.title}`}
        >
          <Trash2 size={11} strokeWidth={1.7} aria-hidden />
        </button>
      </footer>
    </article>
  );
}

/** Devuelve "hoy", "ayer", "hace 3 d." o la fecha corta (dd/mm/aa). */
function relativeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const z = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((z(today) - z(d)) / 86400000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "ayer";
  if (diff > 1 && diff < 7) return `hace ${diff} d.`;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
