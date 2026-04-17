"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
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
  ImageIcon,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Package,
  Paperclip,
  PlayCircle,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from "lucide-react";

import { StatusChangeModal } from "@/components/status-change-modal";
import { Badge } from "@/components/ui/badge";
import type { SessionUser, Ticket, TicketStatus, UserRole } from "@/lib/domain";
import { canAddTicketComment, getAllowedTransitions } from "@/lib/rbac";
import { formatSlaOverdueLabel, toUiPriority } from "@/lib/ticketing";
import { priorityBadgeProps, ticketStatusBadgeClassName, ticketStatusBadgeVariant } from "@/lib/ticket-ui";
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

function isSystemComment(body: string): boolean {
  const b = body.trim().toLowerCase();
  return (
    b === "ticket creado automáticamente." ||
    b === "ticket creado automaticamente." ||
    b.startsWith("cambio de estado")
  );
}

function attachmentKind(mime: string | null | undefined, fileName: string): "image" | "pdf" | "archive" | "other" {
  if (mime?.startsWith("image/")) return "image";
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

function DetailFieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] gap-x-3 gap-y-0.5 border-b border-[var(--color-border)] py-2.5 last:border-0">
      <span className="min-w-0 text-[12px] font-medium capitalize text-[var(--color-text-3)]">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold leading-snug text-[var(--color-text-1)]">{value}</span>
    </div>
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
  const [copyLinkFeedback, setCopyLinkFeedback] = useState(false);
  const [copyShortIdFeedback, setCopyShortIdFeedback] = useState(false);
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

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setError(null);
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
          setError("Ticket no encontrado");
          setTicket(null);
        } else {
          setTicket(found);
        }
      } catch (bootstrapError) {
        console.error(bootstrapError);
        setError("No se pudo cargar detalle del ticket.");
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, [role, sessionUser?.id, ticketId]);

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
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 p-5">
              <div className={cn("mb-3 h-4 w-32 rounded bg-[var(--color-surface-3)]", sk)} />
              <div className={cn("mb-2 h-9 w-full max-w-md rounded-lg bg-[var(--color-surface-3)]", sk)} />
              <div className={cn("mb-4 h-4 w-full rounded bg-[var(--color-surface-3)]/70", sk)} />
              <div className={cn("h-16 w-full rounded-lg bg-[var(--color-surface-3)]/50", sk)} />
            </div>
            <div className="min-h-[12rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 p-5">
              <div className={cn("mb-4 h-5 w-28 rounded bg-[var(--color-surface-3)]", sk)} />
              <div className={cn("h-24 rounded-lg bg-[var(--color-surface-3)]/60", sk)} />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 p-5">
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
        <Link href="/tickets" className="mt-4 text-sm text-[var(--color-accent)] hover:underline">
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
          href="/tickets"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)]"
        >
          <ArrowLeft size={14} />
          Volver a la bandeja
        </Link>
        <button
          type="button"
          onClick={copyTicketLink}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-2)] transition-colors hover:border-[var(--color-accent)]/35 hover:text-[var(--color-accent)]"
        >
          <Copy size={12} aria-hidden />
          {copyLinkFeedback ? "Enlace copiado" : "Copiar enlace"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <div className="min-h-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-shadow duration-200 hover:shadow-md">
            <div className="mb-3 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1 md:pr-2">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-3)]">
                    Ticket {ticket.id.slice(-8).toUpperCase()}
                  </p>
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
                <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-[var(--color-text-1)] sm:text-3xl">
                  {ticket.title}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-snug text-[var(--color-text-2)]">
                  <span className="font-mono text-[var(--color-text-1)]">{ticket.busId}</span>
                  <span className="text-[var(--color-border)]">·</span>
                  <span>{ticket.subsubtipo ?? ticket.assetType}</span>
                  <span className="text-[var(--color-border)]">·</span>
                  <span>{ticket.operator}</span>
                  <span className="text-[var(--color-border)]">·</span>
                  <span>{ticket.municipio}</span>
                </p>
                <p className="mt-1.5 text-[12px] text-[var(--color-text-3)]">
                  Creado {new Date(ticket.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  Actualizado {new Date(ticket.updatedAt).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
                <div className="mt-2 flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                  <span
                    className={cn(
                      "inline-flex w-fit max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold tabular-nums sm:text-[11px]",
                      slaMinsRemaining <= 0
                        ? "border-[var(--color-error)]/45 bg-[var(--color-error-light)] text-[var(--color-error)]"
                        : slaMinsRemaining < 10
                          ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)]/50 text-[var(--color-error)]"
                          : slaMinsRemaining < 30
                            ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-light)]/35 text-[var(--color-warning)]"
                            : slaMinsRemaining < 120
                              ? "border-[var(--color-warning)]/25 bg-[var(--color-surface-2)] text-[var(--color-warning)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]",
                    )}
                  >
                    <Clock3 size={12} className="shrink-0 opacity-80" aria-hidden />
                    {slaMinsRemaining <= 0
                      ? `Vencido · ${formatSlaOverdueLabel(slaMinsRemaining)}`
                      : slaMinsRemaining < 60
                        ? `${slaMinsRemaining}m restantes`
                        : `${Math.floor(slaMinsRemaining / 60)}h ${slaMinsRemaining % 60}m restantes`}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-3)] sm:text-[11px]">
                    Vence {new Date(ticket.slaDeadline).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-start gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-3 md:border-t-0 md:pt-0 md:items-center">
                <div className="flex flex-wrap items-center gap-2 md:items-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
                    Estado actual
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
                    Prioridad
                  </span>
                  <span className="inline-flex items-center gap-1">
                    {ticket.priority === "alta" ? (
                      <SignalHigh size={14} className="shrink-0 text-[var(--color-error)]" aria-hidden />
                    ) : ticket.priority === "media" ? (
                      <SignalMedium size={14} className="shrink-0 text-[var(--color-warning)]" aria-hidden />
                    ) : (
                      <SignalLow size={14} className="shrink-0 text-[var(--color-success)]/90" aria-hidden />
                    )}
                    {(() => {
                      const pr = priorityBadgeProps(ticket.priority);
                      return (
                        <Badge
                          variant={pr.variant}
                          className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold", pr.className)}
                        >
                          {toUiPriority(ticket.priority)}
                        </Badge>
                      );
                    })()}
                    <span className="text-[10px] text-[var(--color-text-3)]" title="Alta / Media / Baja">
                      ({ticket.priority === "alta" ? "A" : ticket.priority === "media" ? "M" : "B"})
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="border-t border-[var(--color-border)] pt-4">
              {hideDuplicateDescription ? (
                <p className="text-[12px] italic text-[var(--color-text-3)]">La descripción coincide con el título.</p>
              ) : (
                <p className="text-body text-[var(--color-text-2)]">{ticket.description}</p>
              )}
            </div>
          </div>

          <div
            className={cn(
              "flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-shadow duration-200 hover:shadow-md",
              !activityFew && "min-h-[14rem]",
              activityFew && ticket.comments.length > 0 && "min-h-0",
            )}
          >
            <h2 className="mb-4 text-subheading">Actividad</h2>
            {ticket.comments.length === 0 ? (
              <div className="flex min-h-[10rem] flex-1 flex-col items-center justify-center py-6 text-center">
                <MessageSquare size={32} className="mb-2 text-[var(--color-text-3)]" />
                <p className="text-sm text-[var(--color-text-2)]">Sin comentarios todavía</p>
              </div>
            ) : (
              <div className={cn("space-y-0", !activityFew && "min-h-[12rem]", activityFew && "min-h-0")}>
                {ticket.comments.map((comment, index) => {
                  const sys = isSystemComment(comment.body);
                  const abs = new Date(comment.createdAt).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const rel = formatRelativeActivity(comment.createdAt);
                  return (
                    <div key={comment.id || `c-${index}`} className="relative flex items-start gap-3">
                      {index < ticket.comments.length - 1 ? (
                        <div
                          className={cn(
                            "absolute left-[15px] top-8 w-px",
                            sys ? "bg-[var(--color-warning)]/25" : "bg-[var(--color-border)]",
                            activityFew ? "bottom-1" : "bottom-0",
                          )}
                          aria-hidden
                        />
                      ) : (
                        <>
                          <div
                            className={cn(
                              "absolute left-[15px] top-8 w-px",
                              sys ? "bg-[var(--color-warning)]/25" : "bg-[var(--color-border)]",
                              activityFew ? "bottom-6" : "bottom-2",
                            )}
                            aria-hidden
                          />
                          <div
                            className="absolute bottom-1 left-[15px] z-[5] h-2 w-2 -translate-x-1/2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]"
                            aria-hidden
                          />
                        </>
                      )}
                      <div
                        className={cn(
                          "z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium",
                          sys
                            ? "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
                            : "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
                        )}
                      >
                        {sys ? <Bot size={14} aria-hidden /> : comment.author.slice(0, 2).toUpperCase()}
                      </div>
                      <div className={cn("min-w-0 flex-1", activityFew ? "pb-2" : "pb-4")}>
                        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-[var(--color-text-1)]">{comment.author}</span>
                          {sys ? (
                            <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
                              Sistema
                            </span>
                          ) : null}
                          <span className="text-[11px] text-[var(--color-text-3)]" title={abs}>
                            {rel} · {abs}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "rounded-lg border px-3 py-2",
                            sys
                              ? "border-[var(--color-warning)]/20 bg-[var(--color-surface-2)]/80"
                              : "border-[var(--color-border)] bg-[var(--color-surface-2)]",
                          )}
                        >
                          <p className="text-sm leading-relaxed text-[var(--color-text-2)]">
                            {comment.body.replace(/automaticamente/gi, "automáticamente")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {activityFew ? (
                  <p className="mt-2 text-center text-[11px] leading-relaxed text-[var(--color-text-3)]">
                    El historial mostrará aquí comentarios y cambios conforme avance el ticket.
                  </p>
                ) : null}
              </div>
            )}
            {sessionUser && canAddTicketComment(role) ? (
              <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                <label className="mb-1 block text-[12px] font-medium text-[var(--color-text-2)]">Añadir nota</label>
                <textarea
                  value={noteDraft}
                  onChange={(e) => {
                    setNoteDraft(e.target.value);
                    if (noteError) setNoteError(null);
                  }}
                  rows={3}
                  maxLength={8000}
                  placeholder="Escribe una nota visible en la actividad…"
                  className="mb-2 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                {noteError ? (
                  <p className="mb-2 text-xs text-[var(--color-error)]" role="alert">
                    {noteError}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={noteSaving || !noteDraft.trim()}
                  onClick={() => void submitNote()}
                  className="rounded-lg border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/15 px-3 py-2 text-xs font-semibold text-[var(--color-accent)] shadow-sm transition-colors hover:bg-[var(--color-accent)]/25 disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface-3)]/50 disabled:text-[var(--color-text-3)] disabled:shadow-none disabled:opacity-60"
                >
                  {noteSaving ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "h-3.5 w-3.5 rounded-full border-2 border-[var(--color-accent)]/25 border-t-[var(--color-accent)]",
                          !reduceMotion && "animate-spin",
                        )}
                        aria-hidden
                      />
                      Guardando…
                    </span>
                  ) : (
                    "Publicar nota"
                  )}
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-shadow duration-200 hover:shadow-md">
            <h2 className="mb-4 flex items-center gap-2 text-subheading">
              <Paperclip size={16} className="text-[var(--color-text-3)]" />
              Adjuntos ({ticket.attachments.length})
            </h2>
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
                  const sizeLabel = formatBytes(att.sizeBytes ?? undefined);
                  const href = att.downloadUrl ?? undefined;
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
                  ) : kind === "pdf" ? (
                    <FileText size={36} className="text-[var(--color-error)]/90" aria-hidden />
                  ) : kind === "archive" ? (
                    <FileArchive size={36} className="text-[var(--color-warning)]" aria-hidden />
                  ) : (
                    <ImageIcon size={36} className="text-[var(--color-text-3)]" aria-hidden />
                  );
                  const thumbClass =
                    ticket.attachments.length === 1
                      ? "relative h-40 w-full shrink-0 overflow-hidden bg-[var(--color-surface-3)]/50 sm:h-auto sm:min-h-[10rem] sm:w-44"
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
                        {href ? (
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
                        <p className="line-clamp-2 text-[12px] font-medium leading-snug text-[var(--color-text-1)]" title={att.fileName}>
                          {att.fileName}
                        </p>
                        {sizeLabel ? <p className="text-[11px] text-[var(--color-text-3)]">{sizeLabel}</p> : null}
                        {href ? (
                          <div className="mt-auto flex flex-wrap gap-2">
                            <a
                              href={href}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
                              download={att.fileName}
                            >
                              <Lock size={11} className="shrink-0 opacity-70" aria-hidden />
                              <Download size={12} aria-hidden />
                              Descargar
                            </a>
                            <span className="self-center text-[10px] text-[var(--color-text-3)]">Solo usuarios autenticados</span>
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
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-visible lg:sticky lg:top-16 lg:max-h-[calc(100vh-4.75rem)]">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain pb-8 pr-0.5 [scrollbar-gutter:stable]">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-shadow duration-200 hover:shadow-md">
              <h2 className="mb-3 text-subheading">Detalles</h2>
              <p className="mb-3 rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/60 px-3 py-2 text-[12px] leading-snug text-[var(--color-text-2)]">
                <span className="font-mono font-medium text-[var(--color-text-1)]">{ticket.busId}</span>
                <span className="text-[var(--color-text-3)]"> · </span>
                {ticket.municipio}
                <span className="text-[var(--color-text-3)]"> · </span>
                {ticket.operator}
              </p>
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
                    <DetailFieldRow label="Operadora" value={ticket.operator} />
                    <DetailFieldRow label="Municipio" value={ticket.municipio} />
                    <DetailFieldRow label="Bus" value={ticket.busId} />
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
                    <DetailFieldRow label="Incidencia" value={ticket.subsubtipo ?? ticket.assetType} />
                    <DetailFieldRow label="Tipo" value={ticket.tipo ?? "-"} />
                    <DetailFieldRow label="Subtipo" value={ticket.subtipo ?? "-"} />
                    <DetailFieldRow label="Dominio" value={ticket.dominio ?? "-"} />
                    <DetailFieldRow label="Origen técnico" value={ticket.origenTecnico ?? "-"} />
                    <DetailFieldRow label="Nivel impacto" value={ticket.nivelImpacto ?? "-"} />
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
                    <DetailFieldRow label="Creado" value={new Date(ticket.createdAt).toLocaleString("es-ES")} />
                    <DetailFieldRow label="Actualizado" value={new Date(ticket.updatedAt).toLocaleString("es-ES")} />
                  </div>
                </details>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-shadow duration-200 hover:shadow-md">
              <h2 className="mb-3 text-subheading">SLA</h2>
              {(() => {
                const mins = slaMinsRemaining;
                if (mins <= 0) {
                  const full = `${formatSlaOverdueLabel(mins)} · ${new Date(ticket.slaDeadline).toLocaleString("es-ES")}`;
                  return (
                    <div className="space-y-2">
                      <div
                        className="flex flex-wrap items-start gap-3 border-l-2 border-[var(--color-error)]/35 pl-3"
                        title={full}
                      >
                        <Clock3 size={14} className="mt-0.5 shrink-0 text-[var(--color-text-3)]" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight text-[var(--color-error)]">SLA vencido</p>
                          <p className="mt-0.5 text-[12px] text-[var(--color-text-3)]">
                            Límite: {new Date(ticket.slaDeadline).toLocaleString("es-ES")}
                          </p>
                        </div>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                        <div className="h-full w-full rounded-full bg-[var(--color-error)]/80" />
                      </div>
                      <p className="text-sm text-[var(--color-text-2)]">
                        Lleva{" "}
                        <span className="font-semibold text-[var(--color-error)]/90">{formatSlaOverdueLabel(mins)}</span>{" "}
                        por encima del objetivo.{" "}
                        <span className="text-[12px] text-[var(--color-text-3)]">Prioriza cierre o comunica el retraso.</span>
                      </p>
                    </div>
                  );
                }
                return (
                  <div>
                    <div className="flex flex-wrap items-end justify-between gap-2 gap-y-1">
                      <p
                        className={cn(
                          "font-semibold tabular-nums",
                          mins >= 120 ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
                          mins < 10
                            ? "text-[var(--color-error)]"
                            : mins < 30
                              ? "text-[var(--color-warning)]"
                              : mins < 120
                                ? "text-[var(--color-warning)]"
                                : "text-[var(--color-success)]",
                        )}
                      >
                        {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}
                      </p>
                      <p className="text-[12px] leading-snug text-[var(--color-text-3)]">
                        Restantes
                        <span className="mx-1 text-[var(--color-border)]">·</span>
                        vence {new Date(ticket.slaDeadline).toLocaleTimeString("es-ES")}
                      </p>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${slaBarPct}%`,
                          backgroundColor:
                            mins < 10
                              ? "var(--color-error)"
                              : mins < 30
                                ? "var(--color-warning)"
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
                );
              })()}
            </div>
          </div>

          {sessionUser ? (
            <div className="relative z-10 min-h-[8.5rem] shrink-0 overflow-visible rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] transition-shadow duration-200 hover:shadow-md lg:shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-subheading">
                <MoreHorizontal size={18} className="text-[var(--color-text-3)]" aria-hidden />
                Acciones
              </h2>
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
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm font-medium text-[var(--color-text-2)] transition-all duration-200 hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
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
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/70 px-3 py-3 text-[12px] leading-relaxed text-[var(--color-text-1)]">
                  <p className="mb-2 text-[var(--color-text-2)]">
                    No hay transiciones de estado disponibles para tu rol en este momento (por ejemplo, ticket resuelto o
                    permisos de solo lectura).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/tickets"
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
            <div className="shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
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
