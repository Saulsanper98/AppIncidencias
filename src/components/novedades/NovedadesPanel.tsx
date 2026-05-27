"use client";

import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  GitBranch,
  Info,
  Loader2,
  Megaphone,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MarkdownView } from "@/components/kb/MarkdownView";
import { useSseEvent } from "@/hooks/use-sse-event";
import type {
  Announcement,
  AnnouncementKind,
  AnnouncementSeverity,
  AnnouncementStatus,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const SEVERITY_META: Record<
  AnnouncementSeverity,
  { label: string; icon: typeof Info; cls: string; ring: string; bg: string }
> = {
  info: {
    label: "Info",
    icon: Info,
    cls: "text-sky-300",
    ring: "ring-sky-500/30",
    bg: "bg-sky-500/[0.06]",
  },
  warning: {
    label: "Aviso",
    icon: AlertTriangle,
    cls: "text-amber-300",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/[0.08]",
  },
  critical: {
    label: "Crítico",
    icon: AlertOctagon,
    cls: "text-rose-300",
    ring: "ring-rose-500/40",
    bg: "bg-rose-500/[0.10]",
  },
};

const STATUS_META: Record<AnnouncementStatus, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-[var(--color-warning-light)] text-[var(--color-warning)]" },
  publicado: { label: "Publicado", cls: "bg-[var(--color-success-light)] text-[var(--color-success)]" },
  archivado: { label: "Archivado", cls: "bg-[var(--color-surface-2)] text-[var(--color-text-3)]" },
};

type Tab = "avisos" | "novedades";

type Notice = { kind: "success" | "error" | "info"; text: string } | null;

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Atlantic/Canary",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function defaultDraft(kind: AnnouncementKind): Announcement {
  return {
    id: "",
    kind,
    severity: kind === "aviso" ? "warning" : "info",
    title: "",
    bodyMd: "",
    status: "publicado",
    pinned: false,
    publishedAt: null,
    expiresAt: null,
    authorId: null,
    authorName: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function NovedadesPanel({
  canEdit,
  canAutoDraft = false,
}: {
  canEdit: boolean;
  /** Generador automático desde `git log` (reservado al propietario). */
  canAutoDraft?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("avisos");
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [editingDirty, setEditingDirty] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"publicado" | "todos">("publicado");
  const [autoDraftLoading, setAutoDraftLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Si es editor y elige "todos", pedimos todos los estados; si no, vigentes.
      if (canEdit && statusFilter === "todos") params.set("status", "todos");
      else params.set("active", "1");
      const response = await fetch(`/api/announcements?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo cargar la lista.");
      const data = (await response.json()) as { announcements: Announcement[] };
      setItems(data.announcements);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Error" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canEdit, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-clear notice
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Refresca al recibir un evento SSE (publicación / edición / borrado por
  // otro usuario). Usa el cliente compartido, no abre otra conexión.
  useSseEvent("announcement_new", () => void load());
  useSseEvent("announcement_updated", () => void load());
  useSseEvent("announcement_deleted", () => void load());

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((a) => (tab === "avisos" ? a.kind === "aviso" : a.kind === "novedad"));
  }, [items, tab]);

  const startCreate = (kind: AnnouncementKind) => {
    setEditing(defaultDraft(kind));
    setEditingDirty(true);
  };

  /**
   * Pide al servidor un borrador de novedad generado leyendo `git log` desde
   * la última novedad publicada. Si el endpoint responde, abre el editor con
   * el contenido pre-rellenado para que Saúl lo revise y publique.
   * Reservado al email saul@movilidadgc.org (el endpoint lo valida; aquí solo
   * se muestra el botón si `canAutoDraft` está habilitado).
   *
   * Implementa AbortController con timeout de 20s para que la UI no se quede
   * pillada si el `git log` del server se cuelga.
   */
  const runAutoDraft = async () => {
    setAutoDraftLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/announcements/auto-draft", {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as {
        title?: string;
        bodyMd?: string;
        commits?: unknown[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message ?? `No se pudo generar el borrador (HTTP ${response.status}).`);
      }
      const draft: Announcement = {
        ...defaultDraft("novedad"),
        title: data.title ?? "Novedades",
        bodyMd: data.bodyMd ?? "",
        status: "borrador",
      };
      setEditing(draft);
      setEditingDirty(true);
      const count = Array.isArray(data.commits) ? data.commits.length : 0;
      setNotice({
        kind: "info",
        text:
          count > 0
            ? `Borrador generado con ${count} commit${count === 1 ? "" : "s"}. Revísalo antes de publicar.`
            : "No se encontraron commits nuevos. El borrador está vacío para editar manualmente.",
      });
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      setNotice({
        kind: "error",
        text: aborted
          ? "El servidor tardó demasiado leyendo el historial de git. Inténtalo de nuevo o escribe la novedad a mano."
          : error instanceof Error
            ? error.message
            : "Error",
      });
    } finally {
      window.clearTimeout(timeoutId);
      setAutoDraftLoading(false);
    }
  };

  const startEdit = (announcement: Announcement) => {
    setEditing({ ...announcement });
    setEditingDirty(false);
  };

  const cancelEdit = () => {
    if (editingDirty && !confirm("Tienes cambios sin guardar. ¿Descartar?")) return;
    setEditing(null);
    setEditingDirty(false);
  };

  const saveEdit = async (status?: AnnouncementStatus) => {
    if (!editing) return;
    const trimmedTitle = editing.title.trim();
    if (trimmedTitle.length < 3) {
      setNotice({ kind: "error", text: "El título debe tener al menos 3 caracteres." });
      return;
    }
    const finalStatus = status ?? editing.status;
    const payload: Record<string, unknown> = {
      kind: editing.kind,
      title: trimmedTitle,
      bodyMd: editing.bodyMd,
      severity: editing.severity,
      status: finalStatus,
      pinned: editing.pinned,
      expiresAt: editing.expiresAt,
    };

    const isNew = !editing.id;
    try {
      const response = await fetch(
        isNew ? "/api/announcements" : `/api/announcements/${encodeURIComponent(editing.id)}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo guardar.");
      }
      setEditing(null);
      setEditingDirty(false);
      setNotice({
        kind: "success",
        text:
          finalStatus === "publicado"
            ? "Publicado. Los usuarios conectados ya lo ven."
            : finalStatus === "archivado"
              ? "Archivado."
              : "Guardado en borrador.",
      });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Error" });
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm("¿Eliminar definitivamente este aviso?")) return;
    try {
      const response = await fetch(`/api/announcements/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar.");
      setNotice({ kind: "success", text: "Eliminado." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Error" });
    }
  };

  const toggleRead = async (announcement: Announcement) => {
    try {
      const response = await fetch(
        `/api/announcements/${encodeURIComponent(announcement.id)}/read`,
        { method: announcement.isRead ? "DELETE" : "POST" },
      );
      if (!response.ok) throw new Error("No se pudo actualizar.");
      // Mutación optimista local.
      setItems((prev) =>
        prev
          ? prev.map((a) => (a.id === announcement.id ? { ...a, isRead: !announcement.isRead } : a))
          : prev,
      );
      // Notifica al sidebar para refrescar el badge sin esperar a SSE.
      window.dispatchEvent(new Event("ccmgc-announcements-changed"));
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Error" });
    }
  };

  // ── EDITOR (modo edición de pantalla completa) ───────────────────────────
  if (editing) {
    return (
      <AnnouncementEditor
        value={editing}
        onChange={(next) => {
          setEditing(next);
          setEditingDirty(true);
        }}
        onCancel={cancelEdit}
        onSave={() => void saveEdit()}
        onPublish={() => void saveEdit("publicado")}
        onArchive={() => void saveEdit("archivado")}
      />
    );
  }

  // ── LISTA ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-sky-500/[0.08] p-5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-500/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/12 text-sky-300 ring-1 ring-sky-500/25">
              <Megaphone size={18} strokeWidth={1.7} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-semibold">
                  CCMGC
                </span>
                Comunicación interna
              </div>
              <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]">
                Novedades y avisos en vivo
              </h1>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                Mantente al día de los cambios en la app y de los avisos operativos (reinicios,
                mantenimientos, incidencias) que publica el centro de control.
              </p>
            </div>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {canAutoDraft ? (
                <button
                  type="button"
                  onClick={() => void runAutoDraft()}
                  disabled={autoDraftLoading}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-violet-400/40 bg-gradient-to-r from-violet-500/15 to-sky-500/15 px-3 py-1.5 text-[12.5px] font-medium text-violet-200 hover:from-violet-500/25 hover:to-sky-500/25 disabled:opacity-60"
                  title="Genera un borrador leyendo los commits de git desde la última novedad publicada"
                >
                  {autoDraftLoading ? (
                    <Loader2 size={13} strokeWidth={1.8} className="animate-spin" aria-hidden />
                  ) : (
                    <Wand2 size={13} strokeWidth={1.8} aria-hidden />
                  )}
                  {autoDraftLoading ? "Detectando cambios…" : "Generar desde git"}
                  <span className="ml-1 hidden rounded-full bg-violet-400/15 px-1.5 py-px text-[9px] uppercase tracking-wider text-violet-300 sm:inline">
                    Solo Saúl
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => startCreate("aviso")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-rose-400"
              >
                <Megaphone size={13} strokeWidth={1.8} aria-hidden /> Nuevo aviso
              </button>
              <button
                type="button"
                onClick={() => startCreate("novedad")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-1)] hover:border-sky-400/40"
              >
                <Sparkles size={13} strokeWidth={1.8} aria-hidden /> Nueva novedad
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] shadow-sm",
            notice.kind === "success" &&
              "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]",
            notice.kind === "error" &&
              "border-[var(--color-error)]/40 bg-[var(--color-error-light)] text-[var(--color-error)]",
            notice.kind === "info" &&
              "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]",
          )}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
            aria-label="Cerrar"
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      ) : null}

      {/* Tabs + filtro de estado (editor only) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 text-[12.5px]">
          {(["avisos", "novedades"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
                tab === value
                  ? "bg-[var(--color-surface)] font-medium text-[var(--color-text-1)] shadow-sm"
                  : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
              )}
            >
              {value === "avisos" ? (
                <Megaphone size={12} strokeWidth={1.8} aria-hidden />
              ) : (
                <Sparkles size={12} strokeWidth={1.8} aria-hidden />
              )}
              {value === "avisos" ? "Avisos en vivo" : "Novedades de la app"}
            </button>
          ))}
        </div>
        {canEdit ? (
          <div className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 text-[11px]">
            {(["publicado", "todos"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  statusFilter === value
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                )}
              >
                {value === "publicado" ? "Solo publicados" : "Todos (incl. borradores)"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Lista */}
      {loading && !items ? (
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-[13px] text-[var(--color-text-3)]">
            {tab === "avisos"
              ? "No hay avisos operativos vigentes en este momento. ¡Buenas noticias!"
              : "Aún no hay entradas de changelog publicadas."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              canEdit={canEdit}
              onEdit={() => startEdit(a)}
              onDelete={() => void removeItem(a.id)}
              onToggleRead={() => void toggleRead(a)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Card de un anuncio ────────────────────────────────────────────────────
function AnnouncementCard({
  announcement,
  canEdit,
  onEdit,
  onDelete,
  onToggleRead,
}: {
  announcement: Announcement;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRead: () => void;
}) {
  const [expanded, setExpanded] = useState(announcement.severity === "critical");
  const meta = SEVERITY_META[announcement.severity];
  const Icon = meta.icon;
  const expired =
    announcement.expiresAt && new Date(announcement.expiresAt).getTime() < Date.now();
  const hasBody = announcement.bodyMd && announcement.bodyMd.trim().length > 0;

  return (
    <li
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow hover:shadow-md",
        announcement.severity === "critical" && "border-rose-500/35",
        announcement.severity === "warning" && "border-amber-500/35",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
            meta.bg,
            meta.ring,
            meta.cls,
          )}
        >
          <Icon size={16} strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-tight text-[var(--color-text-1)]">
              {announcement.title}
            </h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                meta.bg,
                meta.cls,
              )}
            >
              {meta.label}
            </span>
            {announcement.status !== "publicado" ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  STATUS_META[announcement.status].cls,
                )}
              >
                {STATUS_META[announcement.status].label}
              </span>
            ) : null}
            {announcement.pinned ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                <Pin size={9} strokeWidth={1.8} aria-hidden /> Fijado
              </span>
            ) : null}
            {expired ? (
              <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] text-[var(--color-text-3)]">
                Caducado
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
            {announcement.kind === "aviso" ? "Aviso" : "Novedad"} ·{" "}
            {announcement.authorName ?? "Sistema"} · publicado{" "}
            {formatRelative(announcement.publishedAt ?? announcement.createdAt)}
            {announcement.expiresAt
              ? ` · expira ${formatRelative(announcement.expiresAt)}`
              : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {hasBody ? (
            <button
              type="button"
              onClick={() => setExpanded((x) => !x)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
              aria-expanded={expanded}
            >
              <ChevronDown
                size={12}
                strokeWidth={1.8}
                className={cn("transition-transform", expanded && "rotate-180")}
                aria-hidden
              />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleRead}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
            title={announcement.isRead ? "Marcar como no leído" : "Marcar como leído"}
            aria-label={announcement.isRead ? "Marcar como no leído" : "Marcar como leído"}
          >
            {announcement.isRead ? (
              <EyeOff size={12} strokeWidth={1.8} aria-hidden />
            ) : (
              <Eye size={12} strokeWidth={1.8} aria-hidden />
            )}
          </button>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                title="Editar"
              >
                <Pencil size={12} strokeWidth={1.8} aria-hidden />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-text-3)] hover:border-[var(--color-error)]/40 hover:text-[var(--color-error)]"
                title="Eliminar"
              >
                <Trash2 size={12} strokeWidth={1.8} aria-hidden />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {expanded && hasBody ? (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <MarkdownView source={announcement.bodyMd} />
        </div>
      ) : null}
    </li>
  );
}

// ─── Editor (full screen) ───────────────────────────────────────────────────
function AnnouncementEditor({
  value,
  onChange,
  onCancel,
  onSave,
  onPublish,
  onArchive,
}: {
  value: Announcement;
  onChange: (next: Announcement) => void;
  onCancel: () => void;
  onSave: () => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  const isNew = !value.id;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--color-text-1)]">
            {isNew
              ? value.kind === "aviso"
                ? "Nuevo aviso en vivo"
                : "Nueva entrada de changelog"
              : `Editar ${value.kind}`}
          </h1>
          <p className="text-[11.5px] text-[var(--color-text-3)]">
            {value.kind === "aviso"
              ? "Visible para todos los usuarios conectados. Los críticos aparecen como banner sticky."
              : "Visible en la sección Novedades. Persistente; sin caducidad por defecto."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
          >
            <X size={12} aria-hidden /> Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onChange({ ...value, status: "borrador" });
              onSave();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
            title="Guardar como borrador (no se ve hasta publicar)"
          >
            <Save size={12} aria-hidden /> Borrador
          </button>
          {value.status === "publicado" ? (
            <button
              type="button"
              onClick={onArchive}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
            >
              <Archive size={12} aria-hidden /> Archivar
            </button>
          ) : null}
          <button
            type="button"
            onClick={onPublish}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
          >
            <Check size={12} aria-hidden /> {value.status === "publicado" ? "Guardar cambios" : "Publicar"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr,320px]">
        {/* Columna principal: título + cuerpo + preview */}
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <label className="block">
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              Título *
            </span>
            <input
              type="text"
              value={value.title}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
              placeholder={
                value.kind === "aviso"
                  ? "Ej: Reinicio del servicio en 5 min"
                  : "Ej: Nueva sección de tickets relacionados"
              }
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[14px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
              maxLength={200}
              autoFocus
            />
            <span className="mt-0.5 block text-right text-[10px] text-[var(--color-text-3)]">
              {value.title.length}/200
            </span>
          </label>
          <label className="mt-3 block">
            <span className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              Cuerpo (Markdown)
              <span className="text-[10px] normal-case tracking-normal opacity-70">
                Soporta **negrita**, *cursiva*, listas, enlaces…
              </span>
            </span>
            <textarea
              value={value.bodyMd}
              onChange={(e) => onChange({ ...value, bodyMd: e.target.value })}
              placeholder={
                value.kind === "aviso"
                  ? "Detalles del aviso. Ej: «Estamos reiniciando el servicio de SAE. Volverá en 5 min. No es necesario hacer nada.»"
                  : "Descripción de la novedad. Puedes usar listas y enlaces."
              }
              rows={12}
              maxLength={8000}
              className="mt-1 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[12.5px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
            />
            <span className="mt-0.5 block text-right text-[10px] text-[var(--color-text-3)]">
              {value.bodyMd.length}/8000
            </span>
          </label>

          {value.bodyMd.trim().length > 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
              <p className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
                Vista previa
              </p>
              <MarkdownView source={value.bodyMd} />
            </div>
          ) : null}
        </section>

        {/* Sidebar: opciones */}
        <aside className="space-y-3">
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              Tipo
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(["aviso", "novedad"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onChange({ ...value, kind })}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-left text-[12px]",
                    value.kind === kind
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-text-1)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {kind === "aviso" ? (
                      <Megaphone size={11} aria-hidden />
                    ) : (
                      <Sparkles size={11} aria-hidden />
                    )}
                    {kind === "aviso" ? "Aviso en vivo" : "Novedad"}
                  </span>
                  <span className="mt-0.5 block text-[10px] opacity-80">
                    {kind === "aviso" ? "Operativo / efímero" : "Changelog persistente"}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              Severidad
            </h2>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {(Object.keys(SEVERITY_META) as AnnouncementSeverity[]).map((sev) => {
                const meta = SEVERITY_META[sev];
                const SevIcon = meta.icon;
                const active = value.severity === sev;
                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => onChange({ ...value, severity: sev })}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors",
                      active
                        ? cn("ring-1", meta.bg, meta.ring, meta.cls)
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
                    )}
                    aria-pressed={active}
                  >
                    <span className="flex items-center gap-1.5">
                      <SevIcon size={11} aria-hidden /> {meta.label}
                    </span>
                    {sev === "critical" ? (
                      <span className="text-[9.5px] opacity-80">Banner sticky</span>
                    ) : sev === "warning" ? (
                      <span className="text-[9.5px] opacity-80">Toast destacado</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              Opciones
            </h2>
            <label className="mt-2 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={value.pinned}
                onChange={(e) => onChange({ ...value, pinned: e.target.checked })}
              />
              <span className="flex items-center gap-1">
                {value.pinned ? <Pin size={11} aria-hidden /> : <PinOff size={11} aria-hidden />}
                Fijar en la parte superior
              </span>
            </label>

            <label className="mt-2 block">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
                Caduca el (opcional)
              </span>
              <input
                type="datetime-local"
                value={
                  value.expiresAt
                    ? new Date(value.expiresAt).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  onChange({
                    ...value,
                    expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]/50"
              />
              <span className="mt-0.5 block text-[10px] text-[var(--color-text-3)]">
                Pasada esta fecha desaparece automáticamente del listado y del banner.
              </span>
            </label>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              Estado actual
            </h2>
            <span
              className={cn(
                "mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                STATUS_META[value.status].cls,
              )}
            >
              {STATUS_META[value.status].label}
            </span>
            <p className="mt-2 text-[10.5px] text-[var(--color-text-3)]">
              {value.status === "borrador"
                ? "No es visible para los usuarios todavía."
                : value.status === "publicado"
                  ? "Visible para todos los usuarios autenticados."
                  : "Archivado: solo lo ves tú desde el filtro «Todos»."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
