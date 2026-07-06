"use client";

import {
  Archive,
  BookOpenCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  Folder,
  LayoutGrid,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { KbAdminCategorySection } from "@/components/kb/KbAdminCategorySection";
import { KbEditor, type KbDraft } from "@/components/kb/KbEditor";
import type { KbCategoryDraft } from "@/components/kb/KbCategoryEditForm";
import { Skeleton } from "@/components/ui/skeleton";
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

type AdminTab = "articles" | "categories";
type ArticleSort = "recientes" | "alfabetico" | "vistos";

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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  // Filtros de la rejilla de artículos (no se persisten porque se usan poco).
  const [statusFilter, setStatusFilter] = useState<"all" | KbArticleStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminTab, setAdminTab] = useState<AdminTab>("articles");
  const [articleSort, setArticleSort] = useState<ArticleSort>("recientes");
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 8000);
    return () => window.clearTimeout(t);
  }, [error]);

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

  const changeArticleStatus = async (id: string, status: KbArticleStatus) => {
    setStatusChangingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/kb/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError("No se pudo cambiar el estado.");
        return;
      }
      setNotice(`Estado actualizado a «${STATUS_LABELS[status]}».`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setStatusChangingId(null);
    }
  };

  const duplicateArticle = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/kb/articles/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setError("No se pudo cargar el artículo para duplicar.");
        return;
      }
      const data = (await res.json()) as { article: KbArticleDetail };
      const a = data.article;
      const title = `${a.title} (copia)`.slice(0, 200);
      const postRes = await fetch("/api/kb/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary: a.summary,
          contentMd: a.contentMd,
          status: "borrador",
          categoryId: a.categoryId,
          tags: a.tags,
          linkedTicketIds: a.linkedTicketIds,
        }),
      });
      if (!postRes.ok) {
        setError("No se pudo duplicar el artículo.");
        return;
      }
      const created = (await postRes.json()) as { article: { id: string } };
      setNotice("Borrador duplicado. Abriendo editor…");
      await load();
      void startEdit(created.article.id);
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
      setNewCategoryName("");
      setNotice("Categoría creada.");
      await load();
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
      if (editingCategoryId === id) setEditingCategoryId(null);
      setNotice("Categoría eliminada.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const saveCategory = async (id: string, draft: KbCategoryDraft) => {
    if (draft.name.trim().length < 2) {
      setError("El nombre de la categoría debe tener al menos 2 caracteres.");
      return;
    }
    setSavingCategory(true);
    setError(null);
    try {
      const res = await fetch(`/api/kb/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          order: draft.order,
          color: draft.color.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "No se pudo actualizar la categoría.");
        return;
      }
      setEditingCategoryId(null);
      setNotice("Categoría actualizada.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingCategory(false);
    }
  };

  const editingCategory = useMemo(
    () => (editingCategoryId ? categories.find((c) => c.id === editingCategoryId) ?? null : null),
    [editingCategoryId, categories],
  );

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

  const categoryById = useMemo(() => {
    const map = new Map<string, KbCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const sortedArticles = useMemo(() => {
    const list = [...filteredArticles];
    if (articleSort === "alfabetico") {
      list.sort((a, b) => a.title.localeCompare(b.title, "es"));
    } else if (articleSort === "vistos") {
      list.sort((a, b) => b.views - a.views || a.title.localeCompare(b.title, "es"));
    } else {
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    return list;
  }, [filteredArticles, articleSort]);

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
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-3 py-2 text-sm text-[var(--color-success)]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100" aria-label="Cerrar">
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="opacity-70 hover:opacity-100" aria-label="Cerrar">
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : null}

      {/* Pestañas principales */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-1">
        <AdminTabBtn
          active={adminTab === "articles"}
          onClick={() => setAdminTab("articles")}
          icon={<LayoutGrid size={14} strokeWidth={1.7} aria-hidden />}
          label="Artículos"
          count={headerCounts.total}
        />
        <AdminTabBtn
          active={adminTab === "categories"}
          onClick={() => setAdminTab("categories")}
          icon={<Folder size={14} strokeWidth={1.7} aria-hidden />}
          label="Categorías"
          count={categories.length}
        />
      </div>

      {adminTab === "categories" ? (
        <KbAdminCategorySection
          categories={categories}
          articles={articles}
          newCategoryName={newCategoryName}
          creatingCategory={creatingCategory}
          editingCategoryId={editingCategoryId}
          editingCategory={editingCategory}
          savingCategory={savingCategory}
          onNewCategoryNameChange={setNewCategoryName}
          onCreateCategory={() => void createCategory()}
          onEditCategory={setEditingCategoryId}
          onDeleteCategory={(id, name) => void deleteCategory(id, name)}
          onSaveCategory={(id, draft) => void saveCategory(id, draft)}
        />
      ) : (
      <>
      {/* Filtro rápido por categoría */}
      {categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">Categoría</span>
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              categoryFilter === null
                ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
            )}
          >
            Todas ({articles.length})
          </button>
          {categories.map((c) => {
            const active = categoryFilter === c.id;
            const style = c.color && !active ? { borderColor: `${c.color}55`, backgroundColor: `${c.color}12` } : undefined;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(active ? null : c.id)}
                style={style}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* ── ARTÍCULOS ──────────────────────────────────────────────────── */}
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
            <select
              value={articleSort}
              onChange={(e) => setArticleSort(e.target.value as ArticleSort)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-[12px] text-[var(--color-text-2)] outline-none focus:border-[var(--color-accent)]/50"
              aria-label="Ordenar artículos"
            >
              <option value="recientes">Más recientes</option>
              <option value="alfabetico">A → Z</option>
              <option value="vistos">Más vistos</option>
            </select>
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
              <Skeleton
                key={i}
                className="h-44 rounded-xl border border-[var(--color-border)]"
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedArticles.map((a) => (
              <KbArticleCard
                key={a.id}
                article={a}
                categoryColor={a.categoryId ? categoryById.get(a.categoryId)?.color : null}
                statusChanging={statusChangingId === a.id}
                onEdit={() => void startEdit(a.id)}
                onDelete={() => void deleteArticle(a.id, a.title)}
                onDuplicate={() => void duplicateArticle(a.id)}
                onStatusChange={(status) => void changeArticleStatus(a.id, status)}
              />
            ))}
          </div>
        )}
      </section>
      </>
      )}
    </div>
  );
}

// ─── Subcomponentes del panel ─────────────────────────────────────────────

function AdminTabBtn({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all sm:flex-none",
        active
          ? "bg-[var(--color-surface-1)] text-[var(--color-text-1)] shadow-sm ring-1 ring-[var(--color-border)]"
          : "text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold num-tabular",
          active ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]" : "bg-[var(--color-surface-1)] text-[var(--color-text-3)]",
        )}
      >
        {count}
      </span>
    </button>
  );
}

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
  categoryColor,
  statusChanging,
  onEdit,
  onDelete,
  onDuplicate,
  onStatusChange,
}: {
  article: KbArticleSummary;
  categoryColor?: string | null;
  statusChanging: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onStatusChange: (status: KbArticleStatus) => void;
}) {
  const hasCover = Boolean(article.coverUrl);
  const barColor =
    categoryColor ??
    (article.status === "publicado"
      ? "var(--color-success)"
      : article.status === "borrador"
        ? "var(--color-warning)"
        : "var(--color-text-3)");

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)]/35 hover:shadow-lg">
      {hasCover ? (
        <Link href={`/kb/${article.slug}`} className="relative block aspect-[2/1] overflow-hidden bg-[var(--color-surface-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverUrl!}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface-1)]/80 via-transparent to-transparent" />
          <span
            className={cn(
              "absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm",
              article.status === "publicado"
                ? "border-[var(--color-success)]/50 bg-[var(--color-success-light)]/90 text-[var(--color-success)]"
                : article.status === "borrador"
                  ? "border-[var(--color-warning)]/50 bg-[var(--color-warning-light)]/90 text-[var(--color-warning)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)]/90 text-[var(--color-text-3)]",
            )}
          >
            {STATUS_LABELS[article.status]}
          </span>
        </Link>
      ) : (
        <div
          className="flex aspect-[2/1] items-center justify-center bg-gradient-to-br from-[var(--color-accent-light)]/25 to-[var(--color-surface-2)]"
          style={categoryColor ? { background: `linear-gradient(135deg, ${categoryColor}18, transparent)` } : undefined}
        >
          <FileText size={28} strokeWidth={1.3} className="text-[var(--color-accent)]/35" aria-hidden />
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 h-0.5 w-8 rounded-full" style={{ backgroundColor: barColor }} aria-hidden />

        <header className="flex items-start justify-between gap-2">
          <Link
            href={`/kb/${article.slug}`}
            className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--color-text-1)] transition-colors hover:text-[var(--color-accent)]"
          >
            {article.title}
          </Link>
          {!hasCover ? (
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                article.status === "publicado"
                  ? "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]"
                  : article.status === "borrador"
                    ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
              )}
            >
              {STATUS_LABELS[article.status]}
            </span>
          ) : null}
        </header>

        {article.summary ? (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-[var(--color-text-3)]">{article.summary}</p>
        ) : (
          <p className="text-[12px] italic text-[var(--color-text-3)]/50">Sin resumen</p>
        )}

        {article.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {article.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-0.5 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-2)]"
              >
                <Tag size={8} strokeWidth={1.7} aria-hidden />
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[10.5px] text-[var(--color-text-3)]">
          {article.categoryName ? (
            <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text-2)]">
              <Folder size={9} strokeWidth={1.7} aria-hidden />
              {article.categoryName}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-0.5">
            <Eye size={9} aria-hidden /> {article.views}
          </span>
          <span className="ml-auto">{relativeShort(article.updatedAt)}</span>
        </div>

        <footer className="mt-3 flex flex-wrap items-center gap-1 border-t border-[var(--color-border)] pt-2.5">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            <Pencil size={10} strokeWidth={1.7} aria-hidden /> Editar
          </button>
          <Link
            href={`/kb/${article.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
          >
            <ExternalLink size={10} aria-hidden /> Ver
          </Link>
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
            title="Duplicar como borrador"
          >
            <Copy size={10} aria-hidden />
          </button>
          <select
            value={article.status}
            disabled={statusChanging}
            onChange={(e) => onStatusChange(e.target.value as KbArticleStatus)}
            className="ml-auto max-w-[110px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-1 text-[10px] text-[var(--color-text-2)] outline-none disabled:opacity-50"
            aria-label={`Cambiar estado de ${article.title}`}
          >
            <option value="borrador">Borrador</option>
            <option value="publicado">Publicado</option>
            <option value="archivado">Archivado</option>
          </select>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1.5 text-[var(--color-text-3)] hover:border-[var(--color-error)]/40 hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
            aria-label={`Eliminar ${article.title}`}
          >
            <Trash2 size={11} strokeWidth={1.7} aria-hidden />
          </button>
        </footer>
      </div>
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
