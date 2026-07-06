"use client";

/**
 * Editor de articulos KB con experiencia premium:
 *
 * - Header sticky con titulo en vivo y acciones (volver / vista previa / guardar).
 * - Layout 2 columnas (lg+): contenido principal + sidebar lateral con
 *   estado, categoria, tags como chips y metricas en tiempo real.
 * - Toolbar de markdown encima del textarea con botones para H2/H3, bold,
 *   italic, link, lista, lista numerada, codigo y cita. Insertan markdown
 *   en la posicion del cursor.
 * - Atajos de teclado dentro del editor: Ctrl+B, Ctrl+I, Ctrl+K y Ctrl+S
 *   (guardar). Funcionan respetando la seleccion actual.
 * - Vista previa side-by-side cuando se activa "Vista previa" en pantallas
 *   anchas (>= xl); en moviles alterna entre editor y preview.
 * - Tags como chips con add por Enter / coma y remocion individual.
 */

import {
  ArrowLeft,
  Bold,
  Code,
  Eye,
  EyeOff,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Quote,
  Save,
  Sparkles,
  Tag,
  Ticket as TicketIcon,
  Type,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MarkdownView } from "@/components/kb/MarkdownView";
import { KbMediaToolbar } from "@/components/kb/KbMediaToolbar";
import { Select } from "@/components/ui/input";
import type { KbArticleStatus, KbCategory } from "@/lib/domain";

export type KbDraft = {
  id?: string;
  title: string;
  summary: string;
  contentMd: string;
  status: KbArticleStatus;
  tags: string;
  linkedTicketIds: string;
  categoryId: string;
};

type Props = {
  draft: KbDraft;
  categories: KbCategory[];
  saving: boolean;
  error: string | null;
  knownTags: string[];
  onChange: (next: KbDraft) => void;
  onCancel: () => void;
  onSave: () => void;
};

const STATUS_OPTIONS: Array<{ value: KbArticleStatus; label: string; tone: string; description: string }> = [
  {
    value: "borrador",
    label: "Borrador",
    tone: "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning)]/30",
    description: "Solo lo ven los gestores",
  },
  {
    value: "publicado",
    label: "Publicado",
    tone: "bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]/30",
    description: "Visible para todo el equipo",
  },
  {
    value: "archivado",
    label: "Archivado",
    tone: "bg-[var(--color-surface-2)] text-[var(--color-text-3)] border-[var(--color-border)]",
    description: "Oculto del listado publico",
  },
];

export function KbEditor({
  draft,
  categories,
  saving,
  error,
  knownTags,
  onChange,
  onCancel,
  onSave,
}: Props) {
  const [previewMode, setPreviewMode] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);

  const tags = useMemo(
    () =>
      draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [draft.tags],
  );

  const ticketIds = useMemo(
    () =>
      draft.linkedTicketIds
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [draft.linkedTicketIds],
  );

  const wordCount = useMemo(() => {
    const stripped = draft.contentMd
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*_`\-]/g, " ");
    return stripped.split(/\s+/).filter(Boolean).length;
  }, [draft.contentMd]);

  const charCount = draft.contentMd.length;
  const readingMin = Math.max(1, Math.round(wordCount / 200));

  const headingCount = useMemo(() => {
    let count = 0;
    let inFence = false;
    for (const line of draft.contentMd.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith("```")) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (/^#{1,3}\s+/.test(t)) count++;
    }
    return count;
  }, [draft.contentMd]);

  const titleOk = draft.title.trim().length >= 3;
  const contentOk = draft.contentMd.trim().length > 0;
  const canSave = titleOk && contentOk && !saving;

  // ----- Helpers de insercion en el textarea -----

  const surroundSelection = useCallback(
    (before: string, after: string = before, placeholder: string = "") => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      const selected = value.slice(start, end) || placeholder;
      const next = value.slice(0, start) + before + selected + after + value.slice(end);
      onChange({ ...draft, contentMd: next });
      const cursor = start + before.length + selected.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = start + before.length;
        ta.selectionEnd = cursor;
      });
    },
    [draft, onChange],
  );

  const insertLinePrefix = useCallback(
    (prefix: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      // Detectar el inicio de la linea actual / seleccion
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const selectedBlock = value.slice(lineStart, end);
      const lines = selectedBlock.split("\n");
      const transformed = lines.map((l) => (l.startsWith(prefix) ? l : `${prefix}${l}`));
      const next = value.slice(0, lineStart) + transformed.join("\n") + value.slice(end);
      onChange({ ...draft, contentMd: next });
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + transformed.join("\n").length;
      });
    },
    [draft, onChange],
  );

  const insertOrderedList = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const selectedBlock = value.slice(lineStart, end);
    const lines = selectedBlock.split("\n");
    const transformed = lines.map((l, i) => (/^\d+\.\s/.test(l) ? l : `${i + 1}. ${l}`));
    const next = value.slice(0, lineStart) + transformed.join("\n") + value.slice(end);
    onChange({ ...draft, contentMd: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + transformed.join("\n").length;
    });
  }, [draft, onChange]);

  const insertLink = useCallback(() => {
    const url = window.prompt("URL del enlace:", "https://");
    if (!url) return;
    surroundSelection("[", `](${url})`, "texto del enlace");
  }, [surroundSelection]);

  // ----- Atajos -----

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmd = e.ctrlKey || e.metaKey;
      // Ctrl+S global (incluso fuera del textarea, dentro del editor)
      if (isCmd && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canSave) onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, onSave]);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isCmd = e.ctrlKey || e.metaKey;
    if (!isCmd) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      surroundSelection("**", "**", "negrita");
    } else if (key === "i") {
      e.preventDefault();
      surroundSelection("*", "*", "cursiva");
    } else if (key === "k") {
      e.preventDefault();
      insertLink();
    }
  };

  // ----- Tags -----

  const addTag = (raw: string) => {
    const value = raw.trim().replace(/,$/, "").trim();
    if (!value) return;
    if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) return;
    const next = [...tags, value].join(", ");
    onChange({ ...draft, tags: next });
  };

  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t).join(", ");
    onChange({ ...draft, tags: next });
  };

  const handleTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
      setTagInput("");
      setTagSuggestionsOpen(false);
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const tagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    const lower = new Set(tags.map((t) => t.toLowerCase()));
    let pool = knownTags.filter((t) => !lower.has(t.toLowerCase()));
    if (q) pool = pool.filter((t) => t.toLowerCase().includes(q));
    return pool.slice(0, 8);
  }, [tagInput, knownTags, tags]);

  const insertMarkdown = useCallback(
    (snippet: string) => {
      const ta = textareaRef.current;
      if (!ta) {
        onChange({ ...draft, contentMd: draft.contentMd + snippet });
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      const next = value.slice(0, start) + snippet + value.slice(end);
      onChange({ ...draft, contentMd: next });
      const cursor = start + snippet.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = cursor;
        ta.selectionEnd = cursor;
      });
    },
    [draft, onChange],
  );

  const statusInfo = STATUS_OPTIONS.find((s) => s.value === draft.status) ?? STATUS_OPTIONS[0];

  return (
    <div className="space-y-3 pb-16">
      {/* HEADER STICKY */}
      <div className="sticky top-0 z-30 -mx-2 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-2 py-2 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)]"
              aria-label="Volver al listado"
            >
              <ArrowLeft size={13} strokeWidth={1.6} aria-hidden /> Volver
            </button>
            <span className="hidden h-5 w-px bg-[var(--color-border)] md:block" aria-hidden />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                <Sparkles size={10} strokeWidth={1.7} aria-hidden />
                {draft.id ? "Editando articulo" : "Nuevo articulo"}
              </div>
              <h2 className="truncate text-[15px] font-semibold text-[var(--color-text-1)]">
                {draft.title.trim() || (draft.id ? "Sin titulo" : "Nuevo articulo")}
              </h2>
            </div>
            <span
              className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium md:inline-block ${statusInfo.tone}`}
              title={statusInfo.description}
            >
              {statusInfo.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MetricPill label="palabras" value={wordCount} />
            <MetricPill label={readingMin === 1 ? "min" : "mins"} value={readingMin} />
            <button
              type="button"
              onClick={() => setPreviewMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                previewMode
                  ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
              }`}
              title="Atajo: alterna vista previa"
            >
              {previewMode ? (
                <EyeOff size={12} strokeWidth={1.6} aria-hidden />
              ) : (
                <Eye size={12} strokeWidth={1.6} aria-hidden />
              )}
              {previewMode ? "Solo editor" : "Vista previa"}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              title="Atajo: Ctrl + S"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : (
                <Save size={12} strokeWidth={1.6} aria-hidden />
              )}
              Guardar
              <kbd className="ml-1 hidden rounded border border-white/30 bg-white/10 px-1 text-[9px] font-mono text-white/80 md:inline-block">
                Ctrl+S
              </kbd>
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-sm text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      {/* CUERPO 2 COL */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* MAIN */}
        <div className="min-w-0 space-y-3">
          {/* Card: titulo + resumen */}
          <section className="ccmgc-card space-y-3 p-4">
            <label className="block space-y-1">
              <FieldLabel icon={<Type size={11} strokeWidth={1.7} aria-hidden />}>
                Titulo del articulo
              </FieldLabel>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => onChange({ ...draft, title: e.target.value })}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[16px] font-medium text-[var(--color-text-1)] outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent-light)]"
                placeholder={"Como resolver una validadora caida"}
                maxLength={200}
              />
              <div className="flex items-center justify-between text-[10.5px] text-[var(--color-text-3)]">
                <span>{titleOk ? "Listo" : `Minimo 3 caracteres`}</span>
                <span className="num-tabular">{draft.title.length}/200</span>
              </div>
            </label>

            <label className="block space-y-1">
              <FieldLabel>Resumen (1-2 frases para listados)</FieldLabel>
              <textarea
                value={draft.summary}
                onChange={(e) => onChange({ ...draft, summary: e.target.value })}
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text-1)] outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent-light)]"
                placeholder={"Pasos resumidos del procedimiento\u2026"}
              />
              <div className="text-right text-[10.5px] text-[var(--color-text-3)] num-tabular">
                {draft.summary.length}/500
              </div>
            </label>
          </section>

          {/* Card: contenido + toolbar */}
          <section className="ccmgc-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <MarkdownToolbar
                  onH2={() => insertLinePrefix("## ")}
                  onH3={() => insertLinePrefix("### ")}
                  onBold={() => surroundSelection("**", "**", "negrita")}
                  onItalic={() => surroundSelection("*", "*", "cursiva")}
                  onLink={insertLink}
                  onUl={() => insertLinePrefix("- ")}
                  onOl={insertOrderedList}
                  onQuote={() => insertLinePrefix("> ")}
                  onCode={() => surroundSelection("`", "`", "codigo")}
                />
                <Divider />
                <KbMediaToolbar articleId={draft.id} onInsert={insertMarkdown} disabled={saving} />
              </div>
              <a
                href="https://www.markdownguide.org/basic-syntax/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden text-[10.5px] text-[var(--color-text-3)] hover:text-[var(--color-accent)] hover:underline md:block"
              >
                {"\u00B7"} Referencia Markdown
              </a>
            </div>

            <div
              className={`grid ${
                previewMode ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1"
              } gap-0`}
            >
              {(!previewMode || true) && (
                <div className={previewMode ? "border-b border-[var(--color-border)] xl:border-b-0 xl:border-r" : ""}>
                  <textarea
                    ref={textareaRef}
                    value={draft.contentMd}
                    onChange={(e) => onChange({ ...draft, contentMd: e.target.value })}
                    onKeyDown={handleTextareaKeyDown}
                    rows={previewMode ? 20 : 22}
                    spellCheck={false}
                    className="block min-h-[420px] w-full resize-y border-0 bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--color-text-1)] outline-none focus:ring-0"
                    placeholder={"# Titulo\n\n## Procedimiento\n\n1. Paso uno\n2. Paso dos\n\n> Nota importante: ..."}
                  />
                </div>
              )}
              {previewMode ? (
                <div className="min-h-[420px] overflow-auto bg-[var(--color-bg)]/40 px-4 py-3">
                  <MarkdownView source={draft.contentMd || "*(vacio)*"} />
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-1.5 text-[10.5px] text-[var(--color-text-3)]">
              <span className="flex items-center gap-3">
                <span className="num-tabular">{wordCount} palabras</span>
                <span className="num-tabular">{charCount} caracteres</span>
                <span className="num-tabular">{headingCount} secciones</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1 py-0.5 font-mono text-[9px] text-[var(--color-text-2)]">
                  Ctrl+B
                </kbd>{" "}
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1 py-0.5 font-mono text-[9px] text-[var(--color-text-2)]">
                  Ctrl+I
                </kbd>{" "}
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1 py-0.5 font-mono text-[9px] text-[var(--color-text-2)]">
                  Ctrl+K
                </kbd>
              </span>
            </div>
          </section>

          {/* Tickets enlazados */}
          <section className="ccmgc-card space-y-2 p-4">
            <FieldLabel icon={<TicketIcon size={11} strokeWidth={1.7} aria-hidden />}>
              Tickets ejemplares vinculados
            </FieldLabel>
            <input
              type="text"
              value={draft.linkedTicketIds}
              onChange={(e) => onChange({ ...draft, linkedTicketIds: e.target.value })}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[12.5px] text-[var(--color-text-1)] outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent-light)]"
              placeholder="cltabc1234, cltxyz5678"
            />
            {ticketIds.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {ticketIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-accent)]"
                  >
                    <TicketIcon size={9} strokeWidth={1.7} aria-hidden />
                    {id.slice(-8).toUpperCase()}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10.5px] text-[var(--color-text-3)]">
                Separa los IDs por coma. Aparecen como chips en el pie del articulo.
              </p>
            )}
          </section>
        </div>

        {/* SIDEBAR */}
        <aside className="space-y-3">
          {/* Estado */}
          <section className="ccmgc-card p-4">
            <FieldLabel>Estado de publicacion</FieldLabel>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5">
              {STATUS_OPTIONS.map((opt) => {
                const isActive = draft.status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ ...draft, status: opt.value })}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      isActive
                        ? `${opt.tone} border-opacity-60`
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                    }`}
                    aria-pressed={isActive}
                  >
                    <span className="flex flex-col">
                      <span className="text-[12.5px] font-medium">{opt.label}</span>
                      <span className="text-[10.5px] opacity-80">{opt.description}</span>
                    </span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isActive ? "bg-current" : "bg-[var(--color-border)]"
                      }`}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Categoria */}
          <section className="ccmgc-card space-y-1.5 p-4">
            <FieldLabel>Categoria</FieldLabel>
            <Select
              value={draft.categoryId}
              onChange={(e) => onChange({ ...draft, categoryId: e.target.value })}
            >
              <option value="">Sin categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {categories.length === 0 ? (
              <p className="text-[10.5px] text-[var(--color-text-3)]">
                Crea categorias desde la pantalla principal para agrupar tus articulos.
              </p>
            ) : null}
          </section>

          {/* Tags */}
          <section className="ccmgc-card space-y-2 p-4">
            <FieldLabel icon={<Tag size={11} strokeWidth={1.7} aria-hidden />}>Etiquetas</FieldLabel>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1.5 transition-colors focus-within:border-[var(--color-accent)]/40 focus-within:ring-2 focus-within:ring-[var(--color-accent-light)]">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="rounded-full p-0.5 opacity-70 hover:bg-[var(--color-accent)]/20 hover:opacity-100"
                    aria-label={`Quitar etiqueta ${t}`}
                  >
                    <X size={9} strokeWidth={1.8} aria-hidden />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setTagSuggestionsOpen(true);
                }}
                onKeyDown={handleTagKey}
                onFocus={() => setTagSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setTagSuggestionsOpen(false), 120)}
                placeholder={tags.length === 0 ? "validadora, sae, urgente" : "Anadir\u2026"}
                className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-[12.5px] text-[var(--color-text-1)] outline-none"
              />
            </div>
            {tagSuggestionsOpen && tagSuggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {tagSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTag(s);
                      setTagInput("");
                    }}
                    className="inline-flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-2)] transition-colors hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)]"
                  >
                    <Plus size={9} strokeWidth={1.8} aria-hidden /> {s}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="text-[10.5px] text-[var(--color-text-3)]">
              Enter o coma para anadir. Backspace para quitar la ultima.
            </p>
          </section>

          {/* Metricas */}
          <section className="ccmgc-card p-4">
            <FieldLabel>Metricas del contenido</FieldLabel>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
              <Metric label="Palabras" value={wordCount} />
              <Metric label="Caracteres" value={charCount} />
              <Metric label="Secciones" value={headingCount} />
              <Metric
                label={readingMin === 1 ? "Min de lectura" : "Mins de lectura"}
                value={readingMin}
              />
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ---------- Subcomponentes ----------

function FieldLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
      {icon ? <span className="text-[var(--color-text-3)]">{icon}</span> : null}
      {children}
    </span>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="hidden items-center gap-1 rounded-md bg-[var(--color-surface-2)] px-2 py-1 text-[10.5px] text-[var(--color-text-3)] md:inline-flex">
      <span className="num-tabular font-semibold text-[var(--color-text-1)]">{value}</span>
      <span className="uppercase tracking-wider">{label}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-[var(--color-surface-2)] px-2 py-1.5">
      <dt className="text-[9.5px] uppercase tracking-wide text-[var(--color-text-3)]">{label}</dt>
      <dd className="num-tabular text-[14px] font-semibold text-[var(--color-text-1)]">{value}</dd>
    </div>
  );
}

type ToolbarProps = {
  onH2: () => void;
  onH3: () => void;
  onBold: () => void;
  onItalic: () => void;
  onLink: () => void;
  onUl: () => void;
  onOl: () => void;
  onQuote: () => void;
  onCode: () => void;
};

function MarkdownToolbar(p: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <TbBtn onClick={p.onH2} title="Encabezado nivel 2 (## )" icon={<Heading2 size={13} strokeWidth={1.7} aria-hidden />} />
      <TbBtn onClick={p.onH3} title="Encabezado nivel 3 (### )" icon={<Heading3 size={13} strokeWidth={1.7} aria-hidden />} />
      <Divider />
      <TbBtn onClick={p.onBold} title="Negrita (Ctrl+B)" icon={<Bold size={12} strokeWidth={1.9} aria-hidden />} />
      <TbBtn onClick={p.onItalic} title="Cursiva (Ctrl+I)" icon={<Italic size={12} strokeWidth={1.9} aria-hidden />} />
      <TbBtn onClick={p.onLink} title="Enlace (Ctrl+K)" icon={<LinkIcon size={12} strokeWidth={1.7} aria-hidden />} />
      <Divider />
      <TbBtn onClick={p.onUl} title="Lista" icon={<List size={12} strokeWidth={1.7} aria-hidden />} />
      <TbBtn onClick={p.onOl} title="Lista numerada" icon={<ListOrdered size={12} strokeWidth={1.7} aria-hidden />} />
      <TbBtn onClick={p.onQuote} title="Cita" icon={<Quote size={12} strokeWidth={1.7} aria-hidden />} />
      <TbBtn onClick={p.onCode} title="Codigo en linea" icon={<Code size={12} strokeWidth={1.7} aria-hidden />} />
    </div>
  );
}

function TbBtn({
  onClick,
  title,
  icon,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-1)]"
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--color-border)]" />;
}
