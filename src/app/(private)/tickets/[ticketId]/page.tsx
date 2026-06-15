"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  Bus as BusIcon,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Film,
  Hash,
  ImageIcon,
  Layers,
  Lock,
  MapPin,
  MapPinned,
  MessageSquare,
  MoreHorizontal,
  Package,
  Paperclip,
  PlayCircle,
  Route,
  Send,
  ShieldOff,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Sparkles,
  Tag,
  Timer,
  Trash2,
  Upload,
  User as UserIcon,
  UserCheck,
} from "lucide-react";

import { StatusChangeModal } from "@/components/status-change-modal";
import { DeleteTicketDialog } from "@/components/tickets/DeleteTicketDialog";
import { TicketRelationsCard } from "@/components/tickets/TicketRelationsCard";
import { Badge } from "@/components/ui/badge";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import { useSseEvent } from "@/hooks/use-sse-event";
import type { SessionUser, Ticket, TicketStatus, UserRole } from "@/lib/domain";
import {
  canAddTicketComment,
  canDeleteAttachment,
  canUploadAttachment,
  getAllowedTransitions,
} from "@/lib/rbac";

// Mismos valores que `@/lib/ticket-uploads` pero declarados aquí en el cliente
// para no arrastrar `node:fs` al bundle. Si cambias uno, cambia el otro.
const TICKET_UPLOAD_ACCEPT_CLIENT =
  "image/*,video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv";
const TICKET_UPLOAD_MAX_FILES_CLIENT = 6;
import { formatSlaOverdueLabel, toUiPriority } from "@/lib/ticketing";
import {
  priorityBadgeProps,
  statusDotClass,
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";

type TicketAttachmentView = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  downloadUrl?: string | null;
};

type TicketView = Ticket & {
  operator: string;
  municipio: string;
  assetType: string;
  attachments: TicketAttachmentView[];
  comments: { id: string; author: string; body: string; createdAt: string }[];
};

type BusHistoryItem = {
  id: string;
  title: string;
  status: TicketStatus;
  priority: "alta" | "media" | "baja";
  assetType: string;
  createdAt: string;
};

type DetailSidebarSection = "operacion" | "clasificacion" | "fechas";

function formatBytes(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeActivity(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 36) return `hace ${h} h`;
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function isTicketCreatedComment(body: string): boolean {
  const b = body.trim().toLowerCase();
  return b === "ticket creado automáticamente." || b === "ticket creado automaticamente.";
}

/**
 * Detecta y parsea un comentario de tipo "Cambio de estado X -> Y".
 *
 * Acepta variantes con flecha unicode `→`, flecha ASCII `->` o `=>` y un
 * comentario opcional al final con prefijo `Comentario:` (insensible a
 * mayúsculas y acentos).
 */
function parseStatusChangeEvent(
  body: string,
): { from: TicketStatus; to: TicketStatus; comment?: string } | null {
  const trimmed = body.trim();
  const re = /^cambio de estado\s+(\w+)\s*(?:→|->|=>|—>)\s*(\w+)\s*\.?\s*(?:coment[áa]rio:|comentario:)?\s*(.*)$/i;
  const match = trimmed.match(re);
  if (!match) return null;
  const valid: TicketStatus[] = ["abierto", "en_proceso", "esperando_repuesto", "resuelto"];
  const fromRaw = match[1].toLowerCase();
  const toRaw = match[2].toLowerCase();
  if (!valid.includes(fromRaw as TicketStatus) || !valid.includes(toRaw as TicketStatus)) return null;
  const tail = match[3]?.trim().replace(/^[\-·:\s]+/, "").trim();
  return {
    from: fromRaw as TicketStatus,
    to: toRaw as TicketStatus,
    comment: tail || undefined,
  };
}

/**
 * Genera un tinte estable para el avatar de un usuario humano usando el
 * hash del nombre como semilla. Devuelve clases Tailwind arbitrarias en
 * lugar de un estilo inline para mantener el dark-theme coherente.
 */
function authorAvatarTone(name: string): { bgClass: string; textClass: string; ringClass: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  const palettes: Array<{ bgClass: string; textClass: string; ringClass: string }> = [
    { bgClass: "bg-sky-500/20", textClass: "text-sky-200", ringClass: "ring-sky-400/30" },
    { bgClass: "bg-violet-500/20", textClass: "text-violet-200", ringClass: "ring-violet-400/30" },
    { bgClass: "bg-emerald-500/20", textClass: "text-emerald-200", ringClass: "ring-emerald-400/30" },
    { bgClass: "bg-amber-500/20", textClass: "text-amber-200", ringClass: "ring-amber-400/30" },
    { bgClass: "bg-rose-500/20", textClass: "text-rose-200", ringClass: "ring-rose-400/30" },
    { bgClass: "bg-cyan-500/20", textClass: "text-cyan-200", ringClass: "ring-cyan-400/30" },
    { bgClass: "bg-fuchsia-500/20", textClass: "text-fuchsia-200", ringClass: "ring-fuchsia-400/30" },
    { bgClass: "bg-teal-500/20", textClass: "text-teal-200", ringClass: "ring-teal-400/30" },
  ];
  return palettes[Math.abs(hash) % palettes.length];
}

/**
 * Chip compacto para representar el estado de un ticket dentro del flujo de
 * actividad. Reusa la paleta de `statusDotClass` y `statusMap` para que la
 * lectura sea inmediata sin tener que repintar fondos.
 */
function StatusFlowPill({ status }: { status: TicketStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/85 px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-1)]">
      <span className={cn("h-1.5 w-1.5 rounded-full", statusDotClass(status))} aria-hidden />
      {statusMap[status]}
    </span>
  );
}

function attachmentKind(
  mime: string | null | undefined,
  fileName: string,
): "image" | "video" | "pdf" | "archive" | "other" {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (/\.(mp4|webm|mov|mkv|m4v)$/i.test(fileName)) return "video";
  if (mime === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return "pdf";
  if (
    mime?.includes("zip") ||
    mime?.includes("rar") ||
    mime?.includes("7z") ||
    /\.(zip|rar|7z|tar|gz)$/i.test(fileName)
  ) {
    return "archive";
  }
  return "other";
}

const statusMap: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_proceso: "En Proceso",
  esperando_repuesto: "Esperando Repuesto",
  resuelto: "Resuelto",
};

function nextStatusMenuIcon(next: TicketStatus) {
  switch (next) {
    case "en_proceso":
      return PlayCircle;
    case "esperando_repuesto":
      return Package;
    case "resuelto":
      return CheckCircle2;
    case "abierto":
      return Circle;
    default:
      return ChevronRight;
  }
}

function DetailFieldRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] gap-x-3 gap-y-0.5 border-b border-[var(--color-border)] py-2.5 last:border-0">
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium capitalize text-[var(--color-text-3)]">
        {icon ? <span className="shrink-0 text-[var(--color-text-3)]/80">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-0 text-right text-sm font-semibold leading-snug text-[var(--color-text-1)]">{value}</span>
    </div>
  );
}

/**
 * Chip compacto para metadatos del ticket en la cabecera.
 *
 * - `label` se muestra como leyenda fina arriba (puede omitirse para chips
 *   primarios como el bus, donde el icono ya da contexto).
 * - `value` es el dato destacado.
 * - `icon` queda a la izquierda con tinte sutil.
 * - `tone="primary"` lo realza con el color de acento; `tone="muted"` lo
 *   atenúa para datos secundarios.
 */
function MetaChip({
  icon,
  label,
  value,
  tone = "default",
  title,
}: {
  icon: React.ReactNode;
  label?: string;
  value: React.ReactNode;
  tone?: "default" | "primary" | "muted";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] leading-tight transition-colors",
        tone === "primary"
          ? "border-[var(--color-accent)]/35 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
          : tone === "muted"
            ? "border-[var(--color-border)]/70 bg-[var(--color-surface-2)]/40 text-[var(--color-text-3)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)]/65 text-[var(--color-text-2)] hover:border-[var(--color-border-hover)]",
      )}
    >
      <span
        className={cn(
          "shrink-0",
          tone === "primary" ? "text-[var(--color-accent)]" : "text-[var(--color-text-3)]",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="inline-flex min-w-0 items-baseline gap-1.5">
        {label ? (
          <span className="hidden text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-3)] sm:inline">
            {label}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 truncate font-semibold",
            tone === "primary" ? "text-[var(--color-accent)]" : "text-[var(--color-text-1)]",
          )}
        >
          {value}
        </span>
      </span>
    </span>
  );
}

export default function TicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params?.ticketId ?? "";

  const [ticket, setTicket] = useState<TicketView | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [role, setRole] = useState<UserRole>("conductor");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState<{ ticketId: string; nextStatus: TicketStatus } | null>(
    null,
  );
  const [statusChangeComment, setStatusChangeComment] = useState("");
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [statusChangeSubmitting, setStatusChangeSubmitting] = useState(false);
  const [detailActionsOpen, setDetailActionsOpen] = useState(false);
  const detailActionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [detailActionsMenuBox, setDetailActionsMenuBox] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const [detailSidebarSection, setDetailSidebarSection] = useState<DetailSidebarSection | null>("operacion");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // Estado del uploader de adjuntos a posteriori (sobre ticket ya creado).
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [copyLinkFeedback, setCopyLinkFeedback] = useState(false);
  const [copyShortIdFeedback, setCopyShortIdFeedback] = useState(false);
  const [busHistory, setBusHistory] = useState<BusHistoryItem[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const toggleDetailSidebarSection = useCallback((id: DetailSidebarSection) => {
    setDetailSidebarSection((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ccmgc_detail_sidebar_section");
      if (raw == null) return;
      const v = JSON.parse(raw) as unknown;
      if (v === "operacion" || v === "clasificacion" || v === "fechas" || v === null) {
        setDetailSidebarSection(v);
      }
    } catch {
      /* ignore */
    }
  }, [ticketId]);

  useEffect(() => {
    try {
      localStorage.setItem("ccmgc_detail_sidebar_section", JSON.stringify(detailSidebarSection));
    } catch {
      /* ignore */
    }
  }, [detailSidebarSection]);

  useEffect(() => {
    if (!ticket) return;
    try {
      sessionStorage.setItem("ccmgc_ticket_crumb", JSON.stringify({ id: ticket.id, title: ticket.title }));
      window.dispatchEvent(new Event("ccmgc-ticket-breadcrumb"));
    } catch {
      /* ignore */
    }
  }, [ticket]);

  const loadTicket = useCallback(async () => {
    const response = await fetch("/api/tickets?status=todos&operator=todas&busId=todas", {
      cache: "no-store",
      headers: {
        "x-user-id": sessionUser?.id ?? "",
        "x-user-role": role,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || "No se pudo cargar ticket.");
    }
    const data = JSON.parse(text) as { tickets: TicketView[] };
    const found = data.tickets.find((entry) => entry.id === ticketId) ?? null;
    if (!found) {
      setTicket(null);
      setError("Ticket no encontrado");
      return;
    }
    setTicket(found);
  }, [role, sessionUser?.id, ticketId]);

  // Re-cargable: lo extraemos para poder llamarlo también desde eventos SSE
  // (cambios de estado, asignación, comentarios) sin recargar la página.
  const reloadTicket = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const ticketsResponse = await fetch("/api/tickets?status=todos&operator=todas&busId=todas", {
          cache: "no-store",
          headers: {
            "x-user-id": sessionUser?.id ?? "",
            "x-user-role": role,
          },
        });
        const ticketsText = await ticketsResponse.text();
        if (!ticketsResponse.ok) {
          throw new Error(ticketsText || "No se pudo cargar ticket.");
        }
        const data = JSON.parse(ticketsText) as { tickets: TicketView[] };
        const found = data.tickets.find((entry) => entry.id === ticketId) ?? null;
        if (!found) {
          if (!silent) {
            setError("Ticket no encontrado");
            setTicket(null);
          }
        } else {
          setTicket(found);
        }
      } catch (reloadError) {
        if (!silent) {
          console.error(reloadError);
          setError("No se pudo cargar detalle del ticket.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [role, sessionUser?.id, ticketId],
  );

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        const sessionText = await sessionResponse.text();
        if (sessionResponse.ok) {
          const sessionData = JSON.parse(sessionText) as { authenticated: boolean; user?: SessionUser };
          if (sessionData.authenticated && sessionData.user) {
            setSessionUser(sessionData.user);
            setRole(sessionData.user.role);
          }
        }
      } catch (sessionError) {
        console.warn("session bootstrap:", sessionError);
      }
      await reloadTicket();
    };
    bootstrap();
  }, [reloadTicket]);

  // ── Refresco en vivo del detalle ────────────────────────────────────────
  // Si llega un evento SSE cuyo `id` coincide con el ticket actualmente
  // abierto, recargamos en silencio (sin spinner). Para ráfagas de eventos
  // colapsamos con un timer corto.
  const detailLiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDetailLiveEvent = useCallback(
    (event: MessageEvent) => {
      if (!ticketId) return;
      try {
        const parsed = JSON.parse(event.data) as { payload?: { id?: string } };
        if (parsed?.payload?.id !== ticketId) return;
      } catch {
        return;
      }
      if (detailLiveTimerRef.current) clearTimeout(detailLiveTimerRef.current);
      detailLiveTimerRef.current = setTimeout(() => {
        void reloadTicket(true);
      }, 250);
    },
    [ticketId, reloadTicket],
  );

  useSseEvent("ticket_updated", handleDetailLiveEvent);
  useSseEvent("ticket_status_changed", handleDetailLiveEvent);
  useSseEvent("ticket_assigned", handleDetailLiveEvent);
  useSseEvent("ticket_commented", handleDetailLiveEvent);
  useSseEvent("ticket_deleted", handleDetailLiveEvent);

  useEffect(() => {
    if (!ticket?.busId) return;
    const loadBusHistory = async () => {
      try {
        const response = await fetch(`/api/buses/${encodeURIComponent(ticket.busId)}/history`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { history: BusHistoryItem[] };
        setBusHistory(data.history ?? []);
      } catch {
        setBusHistory([]);
      }
    };
    void loadBusHistory();
  }, [ticket?.busId]);

  useEffect(() => {
    if (!detailActionsOpen) return;
    const close = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el?.closest("[data-ticket-detail-actions]") || el?.closest("[data-ticket-detail-actions-portal-menu]")) return;
      setDetailActionsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [detailActionsOpen]);

  useLayoutEffect(() => {
    if (!detailActionsOpen) {
      setDetailActionsMenuBox(null);
      return;
    }
    const update = () => {
      const btn = detailActionsTriggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = Math.max(r.width, 200);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const menuH = 220;
      let top = r.bottom + 4;
      if (top + menuH > window.innerHeight - 10) {
        top = Math.max(8, r.top - menuH - 4);
      }
      setDetailActionsMenuBox({ top, left, width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [detailActionsOpen]);

  useEffect(() => {
    if (!detailActionsOpen) return;
    const id = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-ticket-detail-actions-portal-menu] [role=\"menuitem\"]")?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [detailActionsOpen, detailActionsMenuBox]);

  useEffect(() => {
    if (!notice) return;
    if (!notice.startsWith("Estado del ticket")) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const openStatusChangeModal = (targetTicketId: string, nextStatus: TicketStatus) => {
    if (!sessionUser) {
      setError("Debes iniciar sesión para cambiar estados.");
      return;
    }
    setDetailActionsOpen(false);
    setStatusChangeError(null);
    setStatusChangeComment("");
    setStatusChangeTarget({ ticketId: targetTicketId, nextStatus });
  };

  useEffect(() => {
    if (!detailActionsOpen || !ticket) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDetailActionsOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      const n = Number.parseInt(e.key, 10);
      if (n >= 1 && n <= 9) {
        const transitions = getAllowedTransitions(role, ticket.status);
        const pick = transitions[n - 1];
        if (pick && sessionUser) {
          e.preventDefault();
          setDetailActionsOpen(false);
          setStatusChangeError(null);
          setStatusChangeComment("");
          setStatusChangeTarget({ ticketId: ticket.id, nextStatus: pick });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailActionsOpen, role, ticket, sessionUser]);

  const submitStatusChange = async () => {
    if (!statusChangeTarget || !sessionUser) return;
    const comment = statusChangeComment.trim();
    if (comment.length < 3) {
      setStatusChangeError("El comentario debe tener al menos 3 caracteres.");
      return;
    }
    setStatusChangeError(null);
    setStatusChangeSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/tickets/${statusChangeTarget.ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": sessionUser.id },
        body: JSON.stringify({ nextStatus: statusChangeTarget.nextStatus, comment }),
      });
      if (!response.ok) {
        setStatusChangeError("No tienes permiso para esa transición o hubo un error.");
        return;
      }
      setStatusChangeTarget(null);
      setStatusChangeComment("");
      setNotice("Estado del ticket actualizado correctamente.");
      try {
        await loadTicket();
      } catch (refreshError) {
        console.error(refreshError);
        setError("Se actualizó el estado, pero no se pudo refrescar la vista.");
      }
      window.requestAnimationFrame(() => {
        detailActionsTriggerRef.current?.focus();
      });
    } finally {
      setStatusChangeSubmitting(false);
    }
  };

  const submitNote = async () => {
    if (!sessionUser || !ticket) return;
    const body = noteDraft.trim();
    if (body.length < 1) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role, "x-user-id": sessionUser.id },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setNoteError(payload?.message ?? "No se pudo guardar la nota.");
        return;
      }
      setNoteDraft("");
      await loadTicket();
    } catch {
      setNoteError("No se pudo guardar la nota.");
    } finally {
      setNoteSaving(false);
    }
  };

  // ── Adjuntos a posteriori ──────────────────────────────────────────────
  const uploadAttachments = useCallback(
    async (files: File[]) => {
      if (!sessionUser || !ticket || files.length === 0) return;
      setUploading(true);
      setUploadError(null);
      try {
        if (files.length > TICKET_UPLOAD_MAX_FILES_CLIENT) {
          setUploadError(`Máximo ${TICKET_UPLOAD_MAX_FILES_CLIENT} archivos por subida.`);
          return;
        }
        const form = new FormData();
        for (const f of files) form.append("files", f);
        const response = await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          headers: {
            "x-user-id": sessionUser.id,
            "x-user-role": role,
          },
          body: form,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          setUploadError(payload?.message ?? "No se pudieron subir los adjuntos.");
          return;
        }
        await loadTicket();
      } catch (uploadFetchError) {
        console.error(uploadFetchError);
        setUploadError("No se pudieron subir los adjuntos.");
      } finally {
        setUploading(false);
      }
    },
    [sessionUser, ticket, role, loadTicket],
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) return;
      void uploadAttachments(files);
    },
    [uploadAttachments],
  );

  const deleteAttachment = useCallback(
    async (attachmentId: string, fileName: string) => {
      if (!sessionUser) return;
      const confirmed = window.confirm(
        `¿Eliminar definitivamente el adjunto "${fileName}"?\nEsta acción no se puede deshacer.`,
      );
      if (!confirmed) return;
      setDeletingAttachmentId(attachmentId);
      try {
        const response = await fetch(`/api/tickets/attachments/${attachmentId}`, {
          method: "DELETE",
          headers: {
            "x-user-id": sessionUser.id,
            "x-user-role": role,
          },
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          setUploadError(payload?.message ?? "No se pudo eliminar el adjunto.");
          return;
        }
        await loadTicket();
      } catch (deleteFetchError) {
        console.error(deleteFetchError);
        setUploadError("No se pudo eliminar el adjunto.");
      } finally {
        setDeletingAttachmentId(null);
      }
    },
    [sessionUser, role, loadTicket],
  );

  const copyTicketLink = async () => {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tickets/${ticket.id}`);
      setCopyLinkFeedback(true);
      window.setTimeout(() => setCopyLinkFeedback(false), 2000);
    } catch {
      setCopyLinkFeedback(false);
    }
  };

  const copyShortTicketId = async () => {
    if (!ticket) return;
    const short = ticket.id.slice(-8).toUpperCase();
    try {
      await navigator.clipboard.writeText(short);
      setCopyShortIdFeedback(true);
      window.setTimeout(() => setCopyShortIdFeedback(false), 2000);
    } catch {
      setCopyShortIdFeedback(false);
    }
  };

  if (loading) {
    const sk = reduceMotion ? "" : "animate-pulse";
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite" aria-label="Cargando detalle del ticket">
        <div className={cn("h-9 w-40 rounded-lg bg-[var(--color-surface-2)]", sk)} />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 p-4 sm:p-5">
              <div className={cn("mb-3 h-4 w-32 rounded bg-[var(--color-surface-3)]", sk)} />
              <div className={cn("mb-2 h-9 w-full max-w-md rounded-lg bg-[var(--color-surface-3)]", sk)} />
              <div className={cn("mb-4 h-4 w-full rounded bg-[var(--color-surface-3)]/70", sk)} />
              <div className={cn("h-16 w-full rounded-lg bg-[var(--color-surface-3)]/50", sk)} />
            </div>
            <div className="min-h-[12rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 p-4 sm:p-5">
              <div className={cn("mb-4 h-5 w-28 rounded bg-[var(--color-surface-3)]", sk)} />
              <div className={cn("h-24 rounded-lg bg-[var(--color-surface-3)]/60", sk)} />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 p-4 sm:p-5">
              <div className={cn("mb-3 h-5 w-24 rounded bg-[var(--color-surface-3)]", sk)} />
              <div className="space-y-2">
                <div className={cn("h-10 rounded-lg bg-[var(--color-surface-3)]/70", sk)} />
                <div className={cn("h-10 rounded-lg bg-[var(--color-surface-3)]/70", sk)} />
              </div>
            </div>
            <div className={cn("h-28 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80", sk)} />
            <div className={cn("h-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80", sk)} />
          </div>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle size={40} className="mb-3 text-[var(--color-error)]" />
        <p className="text-subheading text-[var(--color-text-2)]">{error}</p>
        <Link href="/bandeja" className="mt-4 text-sm text-[var(--color-accent)] hover:underline">
          ← Volver a la bandeja
        </Link>
      </div>
    );
  }

  if (!ticket) {
    return null;
  }

  const detailTransitions = getAllowedTransitions(role, ticket.status);
  const activityFew = ticket.comments.length <= 1;
  const hideDuplicateDescription =
    ticket.description.trim().length > 0 && ticket.description.trim() === ticket.title.trim();
  const slaMinsRemaining = Math.round((new Date(ticket.slaDeadline).getTime() - Date.now()) / 60000);
  const slaWindowTotal = Math.max(
    1,
    Math.round((new Date(ticket.slaDeadline).getTime() - new Date(ticket.createdAt).getTime()) / 60000),
  );
  const slaBarPct =
    slaMinsRemaining <= 0 ? 0 : Math.max(4, Math.min(100, Math.round((slaMinsRemaining / slaWindowTotal) * 100)));

  return (
    <div className="ticket-detail-print-root space-y-4 pb-28 [padding-bottom:max(7rem,env(safe-area-inset-bottom))] lg:pb-0 lg:[padding-bottom:unset]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/bandeja"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)]"
        >
          <ArrowLeft size={14} />
          Volver a la bandeja
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/mapa?ticket=${encodeURIComponent(ticket.id)}`}
            className="desvios-action-chip"
            title="Centrar este ticket en el mapa operativo"
          >
            <MapPinned size={12} strokeWidth={1.8} aria-hidden />
            Ver en mapa
          </Link>
          <button
            type="button"
            onClick={copyTicketLink}
            className="desvios-action-chip"
          >
            <Copy size={12} strokeWidth={1.8} aria-hidden />
            {copyLinkFeedback ? "Enlace copiado" : "Copiar enlace"}
          </button>
          {(role === "tecnico_campo" || role === "gestor_centro_control") && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="desvios-action-chip desvios-action-chip--danger"
              title="Eliminar este ticket (requiere motivo)"
              aria-label="Eliminar ticket"
            >
              <Trash2 size={12} strokeWidth={1.8} aria-hidden />
              Eliminar
            </button>
          )}
        </div>
      </div>

      <DeleteTicketDialog
        ticketId={deleteOpen ? ticket.id : null}
        ticketLabel={`#${ticket.id.slice(-8).toUpperCase()} · ${ticket.title}`}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          router.replace("/bandeja");
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <div className="tickets-hero-glow relative min-h-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-accent-light)]/15 p-4 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
            />
            <div className="mb-3 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1 md:pr-2">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="dashboard-pretitle">
                    <span className="dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
                    Ticket · <span className="font-mono normal-case tracking-normal text-[var(--color-text-2)]">{ticket.id.slice(-8).toUpperCase()}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyShortTicketId()}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-accent)]/35 hover:text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    title="Copiar ID corto al portapapeles"
                  >
                    <Copy size={11} aria-hidden />
                    {copyShortIdFeedback ? "Copiado" : "ID"}
                  </button>
                </div>
                <h1 className="dashboard-hero-title text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                  {ticket.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <MetaChip
                    icon={<BusIcon size={13} strokeWidth={1.8} />}
                    label="Bus"
                    value={<span className="font-mono">{ticket.busId}</span>}
                    tone="primary"
                    title="Identificador del bus afectado"
                  />
                  <MetaChip
                    icon={<Tag size={13} strokeWidth={1.8} />}
                    label="Incidencia"
                    value={ticket.subsubtipo ?? ticket.assetType}
                    title="Tipificación del problema"
                  />
                  <MetaChip
                    icon={<Building2 size={13} strokeWidth={1.8} />}
                    label="Operadora"
                    value={ticket.operator}
                  />
                  <MetaChip
                    icon={<MapPin size={13} strokeWidth={1.8} />}
                    label="Municipio"
                    value={ticket.municipio}
                  />
                  {ticket.lineaLabel ? (
                    <MetaChip
                      icon={<Route size={13} strokeWidth={1.8} />}
                      label="Línea"
                      value={ticket.lineaLabel}
                      title="Línea declarada en el ticket"
                    />
                  ) : null}
                  {ticket.servicioLabel ? (
                    <MetaChip
                      icon={<Hash size={13} strokeWidth={1.8} />}
                      label="Servicio"
                      value={ticket.servicioLabel}
                      title="Servicio declarado en el ticket"
                    />
                  ) : null}
                  {ticket.conductorLabel ? (
                    <MetaChip
                      icon={<UserIcon size={13} strokeWidth={1.8} />}
                      label="Conductor"
                      value={ticket.conductorLabel}
                      title="Conductor declarado en el ticket"
                    />
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-[var(--color-text-3)]">
                  <span className="inline-flex items-center gap-1.5">
                    <UserCheck size={12} strokeWidth={1.8} className="text-[var(--color-text-3)]/80" aria-hidden />
                    <span className="font-medium text-[var(--color-text-3)]">Asignado a</span>
                    <span
                      className={cn(
                        "font-semibold",
                        ticket.assignedToUserName?.trim() || ticket.assignedToUserId
                          ? "text-[var(--color-text-1)]"
                          : "text-[var(--color-text-3)] italic",
                      )}
                    >
                      {ticket.assignedToUserName?.trim()
                        ? ticket.assignedToUserName
                        : ticket.assignedToUserId
                          ? "Usuario (sin nombre en catálogo)"
                          : "Sin asignar"}
                    </span>
                  </span>
                  <span className="text-[var(--color-border)]" aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock size={12} strokeWidth={1.8} className="text-[var(--color-text-3)]/80" aria-hidden />
                    Creado{" "}
                    <span className="font-medium text-[var(--color-text-2)]">
                      {new Date(ticket.createdAt).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span className="text-[var(--color-border)]" aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    Actualizado{" "}
                    <span className="font-medium text-[var(--color-text-2)]">
                      {new Date(ticket.updatedAt).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold tabular-nums",
                      slaMinsRemaining <= 0
                        ? "border-[var(--color-error)]/45 bg-[var(--color-error-light)] text-[var(--color-error)] shadow-[inset_3px_0_0_var(--color-error)]"
                        : slaMinsRemaining < 30
                          ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)]/55 text-[var(--color-error)]"
                          : slaMinsRemaining < 120
                            ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-light)]/45 text-[var(--color-warning)]"
                            : "border-[var(--color-success)]/30 bg-[var(--color-surface-2)]/65 text-[var(--color-success)]",
                    )}
                  >
                    {slaMinsRemaining <= 0 ? (
                      <AlertTriangle size={13} strokeWidth={1.8} className="shrink-0" aria-hidden />
                    ) : (
                      <Clock3 size={13} strokeWidth={1.8} className="shrink-0 opacity-90" aria-hidden />
                    )}
                    {slaMinsRemaining <= 0
                      ? `SLA vencido · ${formatSlaOverdueLabel(slaMinsRemaining)}`
                      : slaMinsRemaining < 60
                        ? `${slaMinsRemaining}m restantes`
                        : `${Math.floor(slaMinsRemaining / 60)}h ${slaMinsRemaining % 60}m restantes`}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-3)]">
                    <CalendarClock size={11} strokeWidth={1.8} className="opacity-80" aria-hidden />
                    Vence{" "}
                    <span className="font-medium text-[var(--color-text-2)]">
                      {new Date(ticket.slaDeadline).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-row items-stretch gap-2 self-stretch border-t border-[var(--color-border)] pt-3 md:border-t-0 md:pt-0">
                {/* Mini stat-card: Estado actual */}
                <div
                  className={cn(
                    "flex min-w-[6.5rem] flex-col items-start justify-center gap-1 rounded-lg border px-3 py-2 transition-colors",
                    "border-[var(--color-border)] bg-[var(--color-surface-2)]/55",
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                    Estado
                  </span>
                  <Badge
                    className={cn(
                      "whitespace-nowrap text-xs font-semibold",
                      ticketStatusBadgeClassName(ticket.status),
                    )}
                    variant={ticketStatusBadgeVariant(ticket.status)}
                  >
                    {statusMap[ticket.status]}
                  </Badge>
                </div>
                {/* Mini stat-card: Prioridad */}
                {(() => {
                  const pr = priorityBadgeProps(ticket.priority);
                  const Icon =
                    ticket.priority === "alta"
                      ? SignalHigh
                      : ticket.priority === "media"
                        ? SignalMedium
                        : SignalLow;
                  const iconColor =
                    ticket.priority === "alta"
                      ? "text-[var(--color-error)]"
                      : ticket.priority === "media"
                        ? "text-[var(--color-warning)]"
                        : "text-[var(--color-success)]/90";
                  return (
                    <div
                      className={cn(
                        "flex min-w-[6.5rem] flex-col items-start justify-center gap-1 rounded-lg border px-3 py-2",
                        ticket.priority === "alta"
                          ? "border-[var(--color-error)]/30 bg-[var(--color-error-light)]/35"
                          : ticket.priority === "media"
                            ? "border-[var(--color-warning)]/30 bg-[var(--color-warning-light)]/30"
                            : "border-[var(--color-success)]/25 bg-[var(--color-surface-2)]/55",
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                        Prioridad
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon size={14} strokeWidth={2} className={cn("shrink-0", iconColor)} aria-hidden />
                        <Badge
                          variant={pr.variant}
                          className={cn(
                            "whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold",
                            pr.className,
                          )}
                        >
                          {toUiPriority(ticket.priority)}
                        </Badge>
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="border-t border-[var(--color-border)] pt-4">
              {hideDuplicateDescription ? (
                <p className="text-[12px] italic text-[var(--color-text-3)]">La descripción coincide con el título.</p>
              ) : (
                <>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
                    Descripción
                  </p>
                  <div className="rounded-lg border-l-2 border-[var(--color-accent)]/35 bg-[var(--color-surface-2)]/35 px-4 py-3">
                    <p className="text-body whitespace-pre-wrap leading-relaxed text-[var(--color-text-2)]">
                      {ticket.description}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div
            className={cn(
              "flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow duration-200 hover:shadow-md sm:p-6",
              !activityFew && "min-h-[14rem]",
              activityFew && ticket.comments.length > 0 && "min-h-0",
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
              <header className="account-section-head !mb-0 flex-1">
                <span
                  className="account-section-icon"
                  style={{ ["--section-tone" as string]: "var(--color-accent)" }}
                  aria-hidden
                >
                  <MessageSquare size={16} strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="account-section-pretitle">
                    <span
                      className="account-section-pretitle-dot"
                      style={{ ["--section-tone" as string]: "var(--color-accent)" }}
                      aria-hidden
                    />
                    Timeline
                  </p>
                  <h2 className="account-section-title flex items-center gap-2">
                    Actividad
                    {ticket.comments.length > 0 ? (
                      <span className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--color-surface-2)] px-1.5 text-[11px] font-semibold text-[var(--color-text-2)]">
                        {ticket.comments.length}
                      </span>
                    ) : null}
                  </h2>
                </div>
              </header>
              <p className="hidden text-[10.5px] uppercase tracking-wider text-[var(--color-text-3)] sm:inline">
                Cambios de estado, notas y eventos
              </p>
            </div>
            {ticket.comments.length === 0 ? (
              <div className="flex min-h-[10rem] flex-1 flex-col items-center justify-center gap-2.5 py-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-3)] ring-1 ring-[var(--color-border)]">
                  <MessageSquare size={20} aria-hidden />
                </span>
                <p className="text-sm font-medium text-[var(--color-text-1)]">Sin actividad todavía</p>
                <p className="max-w-xs text-[11.5px] leading-relaxed text-[var(--color-text-3)]">
                  Los cambios de estado y las notas del equipo aparecerán aquí en orden cronológico.
                </p>
              </div>
            ) : (
              <div className={cn("relative space-y-3", !activityFew && "min-h-[12rem]", activityFew && "min-h-0")}>
                {/* Línea continua del timeline; los nodos la cubren a su altura. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-4 top-1 bottom-1 w-px bg-gradient-to-b from-[var(--color-border)]/0 via-[var(--color-border)] to-[var(--color-border)]/0"
                />
                {ticket.comments.map((comment, index) => {
                  const cleanedBody = comment.body.replace(/automaticamente/gi, "automáticamente");
                  const statusEvent = parseStatusChangeEvent(cleanedBody);
                  const isCreatedEvent = isTicketCreatedComment(cleanedBody);
                  const isSystem = Boolean(statusEvent) || isCreatedEvent;
                  const abs = new Date(comment.createdAt).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const rel = formatRelativeActivity(comment.createdAt);
                  const initials = comment.author
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? "")
                    .join("");
                  const tone = isSystem ? null : authorAvatarTone(comment.author);
                  const key = comment.id || `c-${index}`;
                  return (
                    <div key={key} className="relative flex items-start gap-3">
                      <div
                        className={cn(
                          "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-[var(--color-surface)]",
                          statusEvent && "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
                          isCreatedEvent && "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
                          tone && [tone.bgClass, tone.textClass, "ring-2", tone.ringClass],
                        )}
                      >
                        {statusEvent ? (
                          <PlayCircle size={15} strokeWidth={1.8} aria-hidden />
                        ) : isCreatedEvent ? (
                          <Sparkles size={14} strokeWidth={1.8} aria-hidden />
                        ) : (
                          initials || <UserIcon size={14} aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-[13.5px] font-semibold text-[var(--color-text-1)]">
                            {comment.author}
                          </span>
                          {isSystem ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                              <Bot size={9} strokeWidth={2} aria-hidden />
                              Sistema
                            </span>
                          ) : null}
                          <span
                            className="ml-auto text-[11px] text-[var(--color-text-3)] sm:ml-0"
                            title={abs}
                          >
                            {rel} <span className="text-[var(--color-text-3)]/60">·</span> {abs}
                          </span>
                        </div>
                        {statusEvent ? (
                          <div className="rounded-lg border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface-2)] via-[var(--color-surface-2)]/85 to-[var(--color-surface-2)]/65 px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--color-text-2)]">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                                Cambio de estado
                              </span>
                              <StatusFlowPill status={statusEvent.from} />
                              <ChevronRight
                                size={12}
                                strokeWidth={2}
                                className="text-[var(--color-text-3)]"
                                aria-hidden
                              />
                              <StatusFlowPill status={statusEvent.to} />
                            </div>
                            {statusEvent.comment ? (
                              <p className="mt-2 border-t border-[var(--color-border)]/70 pt-2 text-[13px] leading-relaxed text-[var(--color-text-2)]">
                                {statusEvent.comment}
                              </p>
                            ) : null}
                          </div>
                        ) : isCreatedEvent ? (
                          <div className="inline-flex items-center gap-2 rounded-md border border-[var(--color-warning)]/20 bg-[var(--color-warning-light)]/40 px-2.5 py-1.5 text-[12.5px] text-[var(--color-text-2)]">
                            <Sparkles size={12} strokeWidth={1.8} className="text-[var(--color-warning)]" aria-hidden />
                            <span>Ticket creado automáticamente al registrar la incidencia.</span>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 shadow-sm">
                            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--color-text-1)]">
                              {cleanedBody}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {activityFew ? (
                  <p className="mt-2 ml-12 text-[11px] leading-relaxed text-[var(--color-text-3)]">
                    El historial mostrará aquí comentarios y cambios conforme avance el ticket.
                  </p>
                ) : null}
              </div>
            )}
            {sessionUser && canAddTicketComment(role) ? (
              <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
                    <MessageSquare size={11} strokeWidth={2} aria-hidden />
                  </span>
                  <label
                    htmlFor="ticket-note-draft"
                    className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-2)]"
                  >
                    Añadir nota
                  </label>
                  <span className="text-[11px] text-[var(--color-text-3)]">
                    Quedará visible para tu equipo en la actividad
                  </span>
                </div>
                {/* overflow-hidden imprescindible: el footer interior tiene su
                 *  propio bg (surface/40) sin rounded-b-xl propio. Sin recortar
                 *  al wrapper, las esquinas inferiores y el ring de focus se
                 *  veian "escalonados" cuando el textarea estaba activo. */}
                <div
                  className={cn(
                    "group/note overflow-hidden rounded-xl border bg-[var(--color-surface-2)] transition-colors duration-150 focus-within:border-[var(--color-accent)]/55 focus-within:ring-2 focus-within:ring-[var(--color-accent)]/30",
                    noteError ? "border-[var(--color-error)]/55" : "border-[var(--color-border)]",
                  )}
                >
                  <textarea
                    id="ticket-note-draft"
                    value={noteDraft}
                    onChange={(e) => {
                      setNoteDraft(e.target.value);
                      if (noteError) setNoteError(null);
                    }}
                    rows={3}
                    maxLength={8000}
                    placeholder="Escribe una nota visible en la actividad…"
                    className="block w-full resize-y rounded-t-xl bg-transparent px-3.5 py-2.5 text-sm leading-relaxed text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none"
                  />
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)]/80 bg-[var(--color-surface)]/40 px-3 py-2">
                    <span className="flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-[var(--color-text-3)]">
                      <VoiceInputButton
                        onTranscript={(text) => {
                          setNoteDraft((prev) =>
                            prev.trim() ? `${prev.trimEnd()} ${text}` : text,
                          );
                          if (noteError) setNoteError(null);
                        }}
                      />
                      <span
                        className={cn(
                          noteDraft.length > 7500 && "font-semibold text-[var(--color-warning)]",
                          noteDraft.length >= 8000 && "text-[var(--color-error)]",
                        )}
                      >
                        {noteDraft.length}
                      </span>
                      <span className="text-[var(--color-text-3)]/60"> / 8000</span>
                    </span>
                    <button
                      type="button"
                      disabled={noteSaving || !noteDraft.trim()}
                      onClick={() => void submitNote()}
                      className="login-primary-cta-premium inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {noteSaving ? (
                        <>
                          <span
                            className={cn(
                              "h-3.5 w-3.5 rounded-full border-2 border-[var(--color-accent)]/25 border-t-[var(--color-accent)]",
                              !reduceMotion && "animate-spin",
                            )}
                            aria-hidden
                          />
                          Guardando…
                        </>
                      ) : (
                        <>
                          <Send size={12} strokeWidth={2} aria-hidden />
                          Publicar nota
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {noteError ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--color-error)]" role="alert">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
                    {noteError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow duration-200 hover:shadow-md sm:p-6">
            <header className="account-section-head">
              <span
                className="account-section-icon"
                style={{ ["--section-tone" as string]: "var(--color-warning)" }}
                aria-hidden
              >
                <Paperclip size={16} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="account-section-pretitle">
                  <span
                    className="account-section-pretitle-dot"
                    style={{ ["--section-tone" as string]: "var(--color-warning)" }}
                    aria-hidden
                  />
                  Archivos
                </p>
                <h2 className="account-section-title flex items-center gap-2">
                  Adjuntos
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--color-surface-2)] px-1.5 text-[10px] font-semibold text-[var(--color-text-2)]">
                    {ticket.attachments.length}
                  </span>
                </h2>
              </div>
              {canUploadAttachment(role) ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="desvios-action-chip disabled:cursor-not-allowed disabled:opacity-50"
                  title={`Hasta ${TICKET_UPLOAD_MAX_FILES_CLIENT} archivos (imágenes o vídeos, máx. 40 MB por vídeo)`}
                >
                  <Upload size={12} strokeWidth={1.8} aria-hidden />
                  {uploading ? "Subiendo…" : "Subir"}
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept={TICKET_UPLOAD_ACCEPT_CLIENT}
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
            </header>
            {uploadError ? (
              <p
                className="mb-3 flex items-start gap-1.5 rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-2 text-xs text-[var(--color-error)]"
                role="alert"
              >
                <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
                {uploadError}
              </p>
            ) : null}
            {ticket.attachments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-8 text-center">
                <ImageIcon size={28} className="text-[var(--color-text-3)]" aria-hidden />
                <p className="text-sm text-[var(--color-text-2)]">Sin archivos adjuntos</p>
                <p className="max-w-xs text-[12px] leading-relaxed text-[var(--color-text-3)]">
                  Las imágenes u otros documentos asociados al ticket aparecerán aquí con vista previa y enlace de descarga.
                </p>
              </div>
            ) : (
              <div
                className={cn(
                  "gap-3",
                  ticket.attachments.length === 1 ? "flex max-w-xl flex-col sm:flex-row" : "grid grid-cols-2 sm:grid-cols-3",
                )}
              >
                {ticket.attachments.map((att) => {
                  const kind = attachmentKind(att.mimeType ?? undefined, att.fileName);
                  const isImage = kind === "image";
                  const isVideo = kind === "video";
                  const sizeLabel = formatBytes(att.sizeBytes ?? undefined);
                  const href = att.downloadUrl ?? undefined;
                  const videoMime =
                    isVideo && (att.mimeType?.startsWith("video/") ? att.mimeType : undefined);
                  const preview = href && isImage ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- preview desde API de adjuntos */}
                      <img
                        src={href}
                        alt={`Vista previa: ${att.fileName}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </>
                  ) : isVideo && href ? (
                    /* Reproductor HTML5 con `preload=metadata` para evitar
                     * descargar el clip entero hasta que el usuario pulse
                     * play. El backend ya entrega `Accept-Ranges: bytes`. */
                    <video
                      src={href}
                      controls
                      preload="metadata"
                      playsInline
                      className="h-full w-full bg-black object-contain"
                    >
                      {videoMime ? <source src={href} type={videoMime} /> : null}
                      Tu navegador no admite reproducción de vídeo.
                    </video>
                  ) : kind === "pdf" ? (
                    <FileText size={36} className="text-[var(--color-error)]/90" aria-hidden />
                  ) : kind === "archive" ? (
                    <FileArchive size={36} className="text-[var(--color-warning)]" aria-hidden />
                  ) : (
                    <ImageIcon size={36} className="text-[var(--color-text-3)]" aria-hidden />
                  );
                  const thumbClass =
                    ticket.attachments.length === 1
                      ? "relative h-56 w-full shrink-0 overflow-hidden bg-[var(--color-surface-3)]/50 sm:h-auto sm:min-h-[12rem] sm:w-64"
                      : isVideo
                        ? "relative flex aspect-video items-center justify-center overflow-hidden bg-black"
                        : "relative flex aspect-square items-center justify-center bg-[var(--color-surface-3)]/50";
                  return (
                    <div
                      key={att.id}
                      title={`${att.fileName}${sizeLabel ? ` · ${sizeLabel}` : ""}${att.mimeType ? ` · ${att.mimeType}` : ""}`}
                      className={cn(
                        "flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]",
                        ticket.attachments.length === 1 ? "max-w-xl flex-col sm:flex-row" : "flex-col",
                      )}
                    >
                      <div className={cn("group", thumbClass)}>
                        {preview}
                        {/*
                         * El overlay de acciones se omite en vídeos porque
                         * colisiona con los controles nativos del reproductor.
                         * Para vídeo los botones (descargar / copiar enlace)
                         * viven en el footer de la tarjeta.
                         */}
                        {href && !isVideo ? (
                          <div className="pointer-events-none absolute inset-0 flex items-start justify-end gap-1 bg-gradient-to-t from-black/55 to-transparent p-2 opacity-100 transition-opacity md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100">
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="pointer-events-auto inline-flex rounded-md border border-white/20 bg-black/45 p-1.5 text-white backdrop-blur-sm hover:bg-black/60"
                              title="Abrir en pestaña"
                            >
                              <ExternalLink size={14} aria-hidden />
                            </a>
                            <a
                              href={href}
                              download={att.fileName}
                              className="pointer-events-auto inline-flex rounded-md border border-white/20 bg-black/45 p-1.5 text-white backdrop-blur-sm hover:bg-black/60"
                              title="Descargar"
                            >
                              <Download size={14} aria-hidden />
                            </a>
                            <button
                              type="button"
                              className="pointer-events-auto inline-flex rounded-md border border-white/20 bg-black/45 p-1.5 text-white backdrop-blur-sm hover:bg-black/60"
                              title="Copiar enlace"
                              onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${href}`)}
                            >
                              <Copy size={14} aria-hidden />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
                        <p
                          className="line-clamp-2 flex items-start gap-1.5 text-[12px] font-medium leading-snug text-[var(--color-text-1)]"
                          title={att.fileName}
                        >
                          {isVideo ? (
                            <span
                              className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-sm bg-[var(--color-accent-light)] px-1 py-0 text-[9px] font-bold uppercase tracking-wider text-[var(--color-accent)]"
                              aria-label="Vídeo"
                            >
                              <Film size={9} strokeWidth={2.5} aria-hidden />
                              Vídeo
                            </span>
                          ) : null}
                          <span className="min-w-0 break-words">{att.fileName}</span>
                        </p>
                        {sizeLabel ? <p className="text-[11px] text-[var(--color-text-3)]">{sizeLabel}</p> : null}
                        {href ? (
                          <div className="mt-auto flex flex-wrap items-center gap-2">
                            <a
                              href={href}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
                              download={att.fileName}
                            >
                              <Lock size={11} className="shrink-0 opacity-70" aria-hidden />
                              <Download size={12} aria-hidden />
                              Descargar
                            </a>
                            {canDeleteAttachment(role) ? (
                              <button
                                type="button"
                                onClick={() => void deleteAttachment(att.id, att.fileName)}
                                disabled={deletingAttachmentId === att.id}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Eliminar este adjunto"
                              >
                                <Trash2 size={12} aria-hidden />
                                {deletingAttachmentId === att.id ? "Eliminando…" : "Eliminar"}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--color-text-3)]">Solo metadatos (sin fichero)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow duration-200 hover:shadow-md sm:p-6">
            <header className="account-section-head">
              <span
                className="account-section-icon"
                style={{ ["--section-tone" as string]: "#38bdf8" }}
                aria-hidden
              >
                <BusIcon size={16} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="account-section-pretitle">
                  <span
                    className="account-section-pretitle-dot"
                    style={{ ["--section-tone" as string]: "#38bdf8" }}
                    aria-hidden
                  />
                  Trazabilidad
                </p>
                <h2 className="account-section-title">Historial por bus</h2>
              </div>
            </header>
            {busHistory.length <= 1 ? (
              <p className="text-sm text-[var(--color-text-3)]">Aún no hay historial suficiente para este bus.</p>
            ) : (
              <ul className="space-y-2">
                {busHistory
                  .filter((item) => item.id !== ticket.id)
                  .slice(0, 8)
                  .map((item) => (
                    <li key={item.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/tickets/${item.id}`} className="truncate text-sm font-medium text-[var(--color-accent)] hover:underline">
                          {item.title}
                        </Link>
                        <Badge variant={ticketStatusBadgeVariant(item.status)} className={ticketStatusBadgeClassName(item.status)}>
                          {statusMap[item.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--color-text-3)]">
                        {item.assetType} · {new Date(item.createdAt).toLocaleString("es-ES")}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Tickets relacionados: permite vincular tickets ya resueltos (u otros)
              al actual para mantener trazabilidad cuando una incidencia tiene
              relación con casos anteriores. */}
          <TicketRelationsCard ticketId={ticket.id} />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-visible lg:sticky lg:top-16 lg:max-h-[calc(100vh-4.75rem)]">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain pb-8 pr-0.5 [scrollbar-gutter:stable]">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow duration-200 hover:shadow-md sm:p-5">
              <header className="account-section-head !mb-3">
                <span
                  className="account-section-icon"
                  style={{ ["--section-tone" as string]: "var(--color-accent)" }}
                  aria-hidden
                >
                  <Layers size={16} strokeWidth={1.7} />
                </span>
                <div className="min-w-0">
                  <p className="account-section-pretitle">
                    <span
                      className="account-section-pretitle-dot"
                      style={{ ["--section-tone" as string]: "var(--color-accent)" }}
                      aria-hidden
                    />
                    Ficha
                  </p>
                  <h2 className="account-section-title">Detalles</h2>
                </div>
              </header>
              {/* "Vehicle hero card": resaltamos el bus afectado como dato
                   principal con icono prominente, y abajo operadora/municipio
                   como contexto secundario en una sola línea. */}
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--color-accent)]/25 bg-gradient-to-br from-[var(--color-accent-light)] via-[var(--color-surface-2)]/60 to-[var(--color-surface-2)]/30 px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
                  <BusIcon size={18} strokeWidth={1.8} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[14px] font-semibold leading-tight text-[var(--color-text-1)]">
                    {ticket.busId}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-snug text-[var(--color-text-3)]">
                    <Building2 size={10} strokeWidth={1.8} className="shrink-0 opacity-80" aria-hidden />
                    <span className="truncate">{ticket.operator}</span>
                    <span className="text-[var(--color-text-3)]/60">·</span>
                    <MapPin size={10} strokeWidth={1.8} className="shrink-0 opacity-80" aria-hidden />
                    <span className="truncate">{ticket.municipio}</span>
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <details
                  className="group rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 [&_summary::-webkit-details-marker]:hidden"
                  open={detailSidebarSection === "operacion"}
                >
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleDetailSidebarSection("operacion");
                    }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-2)]">
                      Operación y ubicación
                    </span>
                    <ChevronDown
                      size={16}
                      className={cn(
                        "shrink-0 text-[var(--color-text-3)] transition-transform duration-200",
                        detailSidebarSection === "operacion" && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </summary>
                  <div className="border-t border-[var(--color-border)] px-3 py-1">
                    <DetailFieldRow
                      icon={<Building2 size={12} strokeWidth={1.8} aria-hidden />}
                      label="Operadora"
                      value={ticket.operator}
                    />
                    <DetailFieldRow
                      icon={<MapPin size={12} strokeWidth={1.8} aria-hidden />}
                      label="Municipio"
                      value={ticket.municipio}
                    />
                    <DetailFieldRow
                      icon={<BusIcon size={12} strokeWidth={1.8} aria-hidden />}
                      label="Bus"
                      value={ticket.busId}
                    />
                    {ticket.lineaLabel ? (
                      <DetailFieldRow
                        icon={<Route size={12} strokeWidth={1.8} aria-hidden />}
                        label="Línea"
                        value={ticket.lineaLabel}
                      />
                    ) : null}
                    {ticket.servicioLabel ? (
                      <DetailFieldRow
                        icon={<Hash size={12} strokeWidth={1.8} aria-hidden />}
                        label="Servicio"
                        value={ticket.servicioLabel}
                      />
                    ) : null}
                    {ticket.conductorLabel ? (
                      <DetailFieldRow
                        icon={<UserIcon size={12} strokeWidth={1.8} aria-hidden />}
                        label="Conductor"
                        value={ticket.conductorLabel}
                      />
                    ) : null}
                  </div>
                </details>

                <details
                  className="group rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 [&_summary::-webkit-details-marker]:hidden"
                  open={detailSidebarSection === "clasificacion"}
                >
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--color-surface-2)]"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleDetailSidebarSection("clasificacion");
                    }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-2)]">
                      Clasificación técnica
                    </span>
                    <ChevronDown
                      size={16}
                      className={cn(
                        "shrink-0 text-[var(--color-text-3)] transition-transform duration-200",
                        detailSidebarSection === "clasificacion" && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </summary>
                  <div className="border-t border-[var(--color-border)] px-3 py-1">
                    <DetailFieldRow
                      icon={<Tag size={12} strokeWidth={1.8} aria-hidden />}
                      label="Incidencia"
                      value={ticket.subsubtipo ?? ticket.assetType}
                    />
                    <DetailFieldRow
                      icon={<Layers size={12} strokeWidth={1.8} aria-hidden />}
                      label="Tipo"
                      value={ticket.tipo ?? "-"}
                    />
                    <DetailFieldRow
                      icon={<Layers size={12} strokeWidth={1.8} aria-hidden />}
                      label="Subtipo"
                      value={ticket.subtipo ?? "-"}
                    />
                    <DetailFieldRow
                      icon={<Tag size={12} strokeWidth={1.8} aria-hidden />}
                      label="Dominio"
                      value={ticket.dominio ?? "-"}
                    />
                    <DetailFieldRow
                      icon={<Tag size={12} strokeWidth={1.8} aria-hidden />}
                      label="Origen técnico"
                      value={ticket.origenTecnico ?? "-"}
                    />
                    <DetailFieldRow
                      icon={<SignalMedium size={12} strokeWidth={1.8} aria-hidden />}
                      label="Nivel impacto"
                      value={ticket.nivelImpacto ?? "-"}
                    />
                  </div>
                </details>

                <details
                  className="group rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 [&_summary::-webkit-details-marker]:hidden"
                  open={detailSidebarSection === "fechas"}
                >
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleDetailSidebarSection("fechas");
                    }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-2)]">Fechas</span>
                    <ChevronDown
                      size={16}
                      className={cn(
                        "shrink-0 text-[var(--color-text-3)] transition-transform duration-200",
                        detailSidebarSection === "fechas" && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </summary>
                  <div className="border-t border-[var(--color-border)] px-3 py-1">
                    <DetailFieldRow
                      icon={<CalendarClock size={12} strokeWidth={1.8} aria-hidden />}
                      label="Creado"
                      value={new Date(ticket.createdAt).toLocaleString("es-ES")}
                    />
                    <DetailFieldRow
                      icon={<CalendarClock size={12} strokeWidth={1.8} aria-hidden />}
                      label="Actualizado"
                      value={new Date(ticket.updatedAt).toLocaleString("es-ES")}
                    />
                  </div>
                </details>
              </div>
            </div>

            {(() => {
              const mins = slaMinsRemaining;
              const overdue = mins <= 0;
              return (
                <div
                  className={cn(
                    "rounded-xl border p-4 transition-shadow duration-200 hover:shadow-md sm:p-5",
                    overdue
                      ? "border-[var(--color-error)]/35 bg-gradient-to-br from-[var(--color-error-light)]/40 via-[var(--color-surface)] to-[var(--color-surface)] shadow-[inset_3px_0_0_var(--color-error)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]",
                  )}
                >
                  <header className="account-section-head !mb-3">
                    <span
                      className="account-section-icon"
                      style={{
                        ["--section-tone" as string]: overdue
                          ? "var(--color-error)"
                          : "var(--color-warning)",
                      }}
                      aria-hidden
                    >
                      {overdue ? (
                        <AlertTriangle size={16} strokeWidth={1.8} />
                      ) : (
                        <Timer size={16} strokeWidth={1.8} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="account-section-pretitle">
                        <span
                          className="account-section-pretitle-dot"
                          style={{
                            ["--section-tone" as string]: overdue
                              ? "var(--color-error)"
                              : "var(--color-warning)",
                          }}
                          aria-hidden
                        />
                        Tiempo de respuesta
                      </p>
                      <h2 className="account-section-title">SLA</h2>
                    </div>
                  </header>
                  {overdue ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-error)]/15 text-[var(--color-error)] ring-1 ring-[var(--color-error)]/30">
                          <AlertTriangle size={18} strokeWidth={1.8} aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight text-[var(--color-error)]">SLA vencido</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-text-3)]">
                            Límite: {new Date(ticket.slaDeadline).toLocaleString("es-ES")}
                          </p>
                        </div>
                      </div>
                      <div
                        className="h-2.5 overflow-hidden rounded-full bg-[var(--color-error)]/15"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={100}
                      >
                        <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--color-error)] to-[var(--color-error)]/70" />
                      </div>
                      <p className="text-sm leading-relaxed text-[var(--color-text-2)]">
                        Lleva{" "}
                        <span className="font-semibold text-[var(--color-error)]">{formatSlaOverdueLabel(mins)}</span>{" "}
                        por encima del objetivo.{" "}
                        <span className="text-[12px] text-[var(--color-text-3)]">Prioriza cierre o comunica el retraso.</span>
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-wrap items-end justify-between gap-2 gap-y-1">
                        <p
                          className={cn(
                            "font-semibold tabular-nums",
                            mins >= 120 ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
                            mins < 30
                              ? "text-[var(--color-error)]"
                              : mins < 120
                                ? "text-[var(--color-warning)]"
                                : "text-[var(--color-success)]",
                          )}
                        >
                          {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}
                          <span className="ml-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
                            restantes
                          </span>
                        </p>
                        <p className="text-[12px] leading-snug text-[var(--color-text-3)]">
                          vence{" "}
                          <span className="font-medium text-[var(--color-text-2)]">
                            {new Date(ticket.slaDeadline).toLocaleTimeString("es-ES")}
                          </span>
                        </p>
                      </div>
                      <div
                        className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={slaBarPct}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${slaBarPct}%`,
                            backgroundColor:
                              mins < 30
                                ? "var(--color-error)"
                                : mins < 120
                                  ? "var(--color-warning)"
                                  : "var(--color-success)",
                          }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-[var(--color-text-3)]">
                        Ventana desde alta: {slaWindowTotal} min (objetivo según prioridad al crear).
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {sessionUser ? (
            <div className="relative z-10 min-h-[8.5rem] shrink-0 overflow-visible rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] transition-shadow duration-200 hover:shadow-md sm:p-5 lg:shadow-sm">
              <header className="account-section-head !mb-3">
                <span
                  className="account-section-icon"
                  style={{ ["--section-tone" as string]: "var(--color-success)" }}
                  aria-hidden
                >
                  <MoreHorizontal size={16} strokeWidth={1.7} />
                </span>
                <div className="min-w-0">
                  <p className="account-section-pretitle">
                    <span
                      className="account-section-pretitle-dot"
                      style={{ ["--section-tone" as string]: "var(--color-success)" }}
                      aria-hidden
                    />
                    Operativa
                  </p>
                  <h2 className="account-section-title">Acciones</h2>
                </div>
              </header>
              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-xs text-[var(--color-error)]"
                >
                  <AlertCircle size={12} />
                  {error}
                </div>
              )}
              {notice && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-light)] px-3 py-2 text-xs text-[var(--color-success)]"
                >
                  <CheckCircle2 size={12} />
                  {notice}
                </div>
              )}
              {detailTransitions.length > 0 ? (
                <div className="relative" data-ticket-detail-actions>
                  <button
                    ref={detailActionsTriggerRef}
                    type="button"
                    className="login-primary-cta-premium flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm"
                    aria-expanded={detailActionsOpen}
                    aria-haspopup="menu"
                    aria-label="Cambiar estado del ticket"
                    onClick={() => setDetailActionsOpen((o) => !o)}
                  >
                    <MoreHorizontal size={16} className="shrink-0" aria-hidden />
                    Cambiar estado
                    <ChevronDown
                      size={14}
                      className={cn("shrink-0 transition-transform duration-200", detailActionsOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/55 px-3.5 py-3 text-[12px] leading-relaxed text-[var(--color-text-1)]">
                  <div className="mb-2.5 flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface)] text-[var(--color-text-3)] ring-1 ring-[var(--color-border)]">
                      <ShieldOff size={13} strokeWidth={1.8} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-[var(--color-text-1)]">
                        Sin transiciones disponibles
                      </p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-text-3)]">
                        No puedes cambiar el estado de este ticket en este momento (por ejemplo, ya está resuelto o tu
                        rol es de sólo lectura).
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/bandeja"
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-light)]"
                    >
                      Volver a la bandeja
                    </Link>
                    <button
                      type="button"
                      onClick={() => void copyTicketLink()}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                    >
                      <Copy size={12} aria-hidden />
                      Copiar enlace del ticket
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {!sessionUser ? (
            <div className="shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center sm:p-5">
              <Lock size={24} className="mx-auto mb-2 text-[var(--color-text-3)]" />
              <p className="text-sm text-[var(--color-text-2)]">Inicia sesión para gestionar este ticket</p>
              <Link href="/login" className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline">
                Ir al login →
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ticket-detail-mobile-bar fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-2.5 backdrop-blur-md print:hidden lg:hidden">
        <Badge
          className={cn("shrink-0 text-[10px] font-semibold", ticketStatusBadgeClassName(ticket.status))}
          variant={ticketStatusBadgeVariant(ticket.status)}
        >
          {statusMap[ticket.status]}
        </Badge>
        <span
          className={cn(
            "min-w-0 truncate text-right text-[11px] font-semibold tabular-nums",
            slaMinsRemaining <= 0
              ? "text-[var(--color-error)]"
              : slaMinsRemaining < 30
                ? "text-[var(--color-error)]"
                : slaMinsRemaining < 120
                  ? "text-[var(--color-warning)]"
                  : "text-[var(--color-text-2)]",
          )}
        >
          SLA{" "}
          {slaMinsRemaining <= 0
            ? `vencido · ${formatSlaOverdueLabel(slaMinsRemaining)}`
            : slaMinsRemaining < 60
              ? `${slaMinsRemaining}m`
              : `${Math.floor(slaMinsRemaining / 60)}h ${slaMinsRemaining % 60}m`}
        </span>
      </div>

      {detailActionsOpen && detailActionsMenuBox
        ? createPortal(
            <ul
              data-ticket-detail-actions-portal-menu
              role="menu"
              style={{
                position: "fixed",
                top: detailActionsMenuBox.top,
                left: detailActionsMenuBox.left,
                width: detailActionsMenuBox.width,
                zIndex: 80,
              }}
              className="max-h-[min(50vh,16rem)] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl"
            >
              {detailTransitions.map((nextStatus, menuIndex) => {
                const Icon = nextStatusMenuIcon(nextStatus);
                return (
                  <li key={nextStatus} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      title={`Atajo: ${menuIndex + 1}`}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] focus:bg-[var(--color-surface-2)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-accent)]"
                      onClick={() => openStatusChangeModal(ticket.id, nextStatus)}
                    >
                      <Icon size={16} className="shrink-0 text-[var(--color-text-3)]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        {nextStatus === "esperando_repuesto" ? "Esperar repuesto" : statusMap[nextStatus]}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-3)]">{menuIndex + 1}</span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}

      <StatusChangeModal
        open={Boolean(statusChangeTarget)}
        title="Confirmar cambio de estado"
        targetLabel={statusChangeTarget ? statusMap[statusChangeTarget.nextStatus] : ""}
        comment={statusChangeComment}
        onCommentChange={(value) => {
          setStatusChangeComment(value);
          if (statusChangeError) setStatusChangeError(null);
        }}
        onConfirm={submitStatusChange}
        onCancel={() => {
          setStatusChangeTarget(null);
          setStatusChangeComment("");
          setStatusChangeError(null);
          setStatusChangeSubmitting(false);
        }}
        error={statusChangeError}
        submitting={statusChangeSubmitting}
      />
    </div>
  );
}
