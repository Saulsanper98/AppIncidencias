"use client";

import { BookOpenCheck, FilePlus2, Loader2, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { KbEditor, type KbDraft } from "@/components/kb/KbEditor";
import type { KbArticleDetail, KbArticleStatus, KbArticleSummary, KbCategory } from "@/lib/domain";

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
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-eyebrow">CCMGC</span>
          <h1 className="text-heading">Base de conocimiento</h1>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-3)]">
            Crea y mantén manuales, FAQs y casos de referencia. {headerCounts.publicados} publicados {"\u00B7"}{" "}
            {headerCounts.borradores} borradores {"\u00B7"} {headerCounts.archivados} archivados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/kb"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
          >
            <BookOpenCheck size={13} strokeWidth={1.5} aria-hidden />
            Ver KB pública
          </Link>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-2 text-[12px] font-medium text-white hover:opacity-90"
          >
            <FilePlus2 size={13} strokeWidth={1.5} aria-hidden />
            Nuevo artículo
          </button>
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

      <section className="ccmgc-card p-4">
        <h2 className="text-subheading">Categorías</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-3)]">
          Agrupan los artículos por temática (manuales, FAQs, casos resueltos{"\u2026"}).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[200px] space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
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
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
              placeholder={"Ej: Manuales, FAQs, Casos resueltos\u2026"}
              maxLength={80}
            />
          </label>
          <button
            type="button"
            onClick={() => void createCategory()}
            disabled={creatingCategory || newCategoryName.trim().length < 2}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-3 py-2 text-[12px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingCategory ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
            Añadir
          </button>
        </div>
        {categories.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <span
                key={c.id}
                className="group inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 pl-2.5 pr-1 text-xs"
              >
                <span className="font-medium text-[var(--color-text-1)]">{c.name}</span>
                {typeof c.articleCount === "number" ? (
                  <span className="text-[var(--color-text-3)]">({c.articleCount})</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void deleteCategory(c.id, c.name)}
                  aria-label={`Eliminar ${c.name}`}
                  className="rounded p-0.5 text-[var(--color-text-3)] opacity-60 transition-all hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)] group-hover:opacity-100"
                >
                  <X size={11} strokeWidth={1.75} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="ccmgc-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-subheading">Artículos ({headerCounts.total})</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-[var(--color-text-3)]">Cargando{"\u2026"}</div>
        ) : articles.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-3)]">
            Aún no hay artículos. Pulsa{" "}
            <button
              type="button"
              onClick={startNew}
              className="text-[var(--color-accent)] hover:underline"
            >
              Nuevo artículo
            </button>{" "}
            para empezar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)]/50 text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">
              <tr>
                <th className="px-3 py-2 text-left">Título</th>
                <th className="px-3 py-2 text-left">Categoría</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Vistas</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/kb/${a.slug}`}
                      className="font-medium text-[var(--color-text-1)] hover:text-[var(--color-accent)]"
                    >
                      {a.title}
                    </Link>
                    {a.summary ? (
                      <p className="line-clamp-1 text-[11px] text-[var(--color-text-3)]">{a.summary}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-[var(--color-text-2)]">
                    {a.categoryName ?? "\u2014"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        a.status === "publicado"
                          ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
                          : a.status === "borrador"
                            ? "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                            : "bg-[var(--color-surface-2)] text-[var(--color-text-3)]"
                      }`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right num-tabular text-[12px] text-[var(--color-text-2)]">
                    {a.views}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => void startEdit(a.id)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                        aria-label="Editar"
                        title="Editar"
                      >
                        <Pencil size={11} strokeWidth={1.5} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteArticle(a.id, a.title)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1 text-[var(--color-text-3)] hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                        aria-label="Eliminar"
                        title="Eliminar"
                      >
                        <Trash2 size={11} strokeWidth={1.5} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
