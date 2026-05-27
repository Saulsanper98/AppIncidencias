"use client";

import { AlertTriangle, ChevronDown, RefreshCw, Siren, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MarkdownView } from "@/components/kb/MarkdownView";
import { useSseEvent } from "@/hooks/use-sse-event";
import type { Announcement } from "@/lib/domain";

/**
 * Banner global de avisos críticos. Se renderiza dentro del layout privado y
 * aparece en TODAS las páginas mientras haya al menos un aviso crítico sin
 * descartar por el usuario. Se conecta al stream SSE para que los usuarios
 * que ya están dentro de la app vean el aviso en cuanto se publica.
 *
 * Estética: banda completa de color saturado (rojo para `critical`, ámbar para
 * `warning`), título grande con eyebrow uppercase + hora, descripción
 * desplegable y botones de acción contrastados. Inspirado en banners "live
 * status" tipo barra de mantenimiento de las apps SaaS modernas.
 */
export function AnnouncementsBanner() {
  const [criticals, setCriticals] = useState<Announcement[]>([]);
  const [warnings, setWarnings] = useState<Announcement[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/announcements?active=1", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { announcements: Announcement[] };
      const unread = (data.announcements ?? []).filter((a) => !a.isRead);
      setCriticals(unread.filter((a) => a.severity === "critical"));
      setWarnings(unread.filter((a) => a.severity === "warning" && a.kind === "aviso"));
    } catch {
      /* ignorar; el listener SSE volverá a intentar */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Reusa el SSE compartido para no abrir otra conexión HTTP por pestaña.
  useSseEvent("announcement_new", () => void load());
  useSseEvent("announcement_updated", () => void load());
  useSseEvent("announcement_deleted", () => void load());

  const dismiss = async (id: string) => {
    // Mutación optimista: lo quitamos ya y avisamos al server.
    setCriticals((prev) => prev.filter((a) => a.id !== id));
    setWarnings((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch(`/api/announcements/${encodeURIComponent(id)}/read`, { method: "POST" });
      window.dispatchEvent(new Event("ccmgc-announcements-changed"));
    } catch {
      void load();
    }
  };

  const primary = criticals[0];
  const moreCriticals = Math.max(0, criticals.length - 1);
  const warningBanner = !primary && warnings.length > 0 ? warnings[0] : null;
  const moreWarnings = warningBanner ? Math.max(0, warnings.length - 1) : 0;

  if (!primary && !warningBanner) return null;

  if (primary) return <CriticalBanner item={primary} extra={moreCriticals} expanded={expandedId === primary.id} onToggle={() => setExpandedId(expandedId === primary.id ? null : primary.id)} onDismiss={() => void dismiss(primary.id)} />;
  if (warningBanner) return <WarningBanner item={warningBanner} extra={moreWarnings} expanded={expandedId === warningBanner.id} onToggle={() => setExpandedId(expandedId === warningBanner.id ? null : warningBanner.id)} onDismiss={() => void dismiss(warningBanner.id)} />;
  return null;
}

// ─── Banner CRÍTICO ────────────────────────────────────────────────────────
function CriticalBanner({
  item,
  extra,
  expanded,
  onToggle,
  onDismiss,
}: {
  item: Announcement;
  extra: number;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  const time = item.publishedAt
    ? new Date(item.publishedAt).toLocaleTimeString("es-ES", {
        timeZone: "Atlantic/Canary",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;
  const hasBody = item.bodyMd && item.bodyMd.trim().length > 0;
  const firstLine = hasBody ? extractFirstLine(item.bodyMd) : null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-30 overflow-hidden border-b border-rose-900/60 bg-gradient-to-r from-rose-700 via-red-600 to-rose-700 text-white shadow-[0_10px_30px_-15px_rgba(225,29,72,0.7)]"
    >
      {/* Brillo decorativo lateral (no interactivo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -bottom-20 h-48 w-48 rounded-full bg-rose-300/15 blur-3xl"
      />
      <div className="relative flex flex-wrap items-center gap-3 px-4 py-2.5 md:flex-nowrap md:px-6">
        {/* Icono con halo pulsante */}
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 animate-ping rounded-full bg-white/30"
            style={{ animationDuration: "1.6s" }}
          />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/50 backdrop-blur-sm">
            <Siren size={17} strokeWidth={2} aria-hidden />
          </span>
        </div>

        {/* Texto central */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white"
                style={{ animationDuration: "1.4s" }}
              />
              Aviso crítico
            </span>
            {time ? <span className="text-white/65">· {time}h</span> : null}
            {extra > 0 ? (
              <Link
                href="/novedades"
                className="rounded-full bg-white/15 px-2 py-px text-[10px] font-medium tracking-normal text-white/95 hover:bg-white/25"
              >
                +{extra} más
              </Link>
            ) : null}
          </div>
          <h2 className="mt-0.5 truncate text-[15.5px] font-semibold leading-tight text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.35)] md:text-[17px]">
            {item.title}
          </h2>
          {firstLine && !expanded ? (
            <p className="mt-0.5 truncate text-[12px] text-white/85">{firstLine}</p>
          ) : null}
        </div>

        {/* Acciones */}
        <div className="flex shrink-0 items-center gap-1.5">
          {hasBody ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-md bg-white/0 px-2 py-1 text-[11.5px] font-medium text-white/90 ring-1 ring-inset ring-white/30 hover:bg-white/10 hover:text-white"
            >
              <ChevronDown
                size={12}
                strokeWidth={2}
                className={"transition-transform " + (expanded ? "rotate-180" : "")}
                aria-hidden
              />
              {expanded ? "Ocultar" : "Ver detalles"}
            </button>
          ) : null}
          <Link
            href="/novedades"
            className="hidden items-center gap-1 rounded-md bg-white/0 px-2 py-1 text-[11.5px] font-medium text-white/90 ring-1 ring-inset ring-white/30 hover:bg-white/10 hover:text-white sm:inline-flex"
          >
            Ver todos
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1 rounded-md bg-white/0 px-2 py-1 text-[11.5px] font-medium text-white/90 ring-1 ring-inset ring-white/30 hover:bg-white/10 hover:text-white"
            title="Recargar la página"
          >
            <RefreshCw size={11} strokeWidth={2} aria-hidden />
            Recargar
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11.5px] font-bold text-rose-700 shadow-sm hover:bg-rose-50"
          >
            Entendido
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-white/75 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar aviso"
            title="Cerrar (marca como leído)"
          >
            <X size={13} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {/* Cuerpo expandible — panel oscuro semitransparente del mismo tono que
          el banner para mantener cohesión cromática (en lugar de la tarjeta
          blanca, que quedaba como un parche). */}
      {expanded && hasBody ? (
        <div className="relative border-t border-white/15 bg-rose-950/55 px-4 py-3 backdrop-blur-sm md:px-6">
          <div className="rounded-md bg-rose-950/40 p-3 ring-1 ring-white/15 [&_*]:!text-white/95 [&_a]:!text-white [&_a]:!underline [&_code]:!bg-white/10 [&_code]:!text-white">
            <MarkdownView source={item.bodyMd} />
          </div>
        </div>
      ) : null}

      {/* Línea inferior con destello */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
      />
    </div>
  );
}

// ─── Banner WARNING (no crítico, más fino) ─────────────────────────────────
function WarningBanner({
  item,
  extra,
  expanded,
  onToggle,
  onDismiss,
}: {
  item: Announcement;
  extra: number;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  const time = item.publishedAt
    ? new Date(item.publishedAt).toLocaleTimeString("es-ES", {
        timeZone: "Atlantic/Canary",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;
  const hasBody = item.bodyMd && item.bodyMd.trim().length > 0;
  const firstLine = hasBody ? extractFirstLine(item.bodyMd) : null;

  return (
    <div
      role="status"
      className="sticky top-0 z-30 overflow-hidden border-b border-amber-700/60 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white shadow-[0_8px_24px_-15px_rgba(217,119,6,0.6)]"
    >
      <div className="relative flex flex-wrap items-center gap-3 px-4 py-2 md:flex-nowrap md:px-6">
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/85">
            <span>Aviso</span>
            {time ? <span className="text-white/65">· {time}h</span> : null}
            {extra > 0 ? (
              <Link
                href="/novedades"
                className="rounded-full bg-white/20 px-1.5 py-px text-[9.5px] font-medium tracking-normal hover:bg-white/30"
              >
                +{extra} más
              </Link>
            ) : null}
          </div>
          <p className="truncate text-[13px] font-semibold leading-tight text-white">
            {item.title}
            {firstLine && !expanded ? (
              <span className="ml-2 font-normal text-white/80">· {firstLine}</span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasBody ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-white/90 ring-1 ring-inset ring-white/30 hover:bg-white/10 hover:text-white"
            >
              <ChevronDown
                size={11}
                strokeWidth={2}
                className={"transition-transform " + (expanded ? "rotate-180" : "")}
                aria-hidden
              />
              {expanded ? "Ocultar" : "Detalles"}
            </button>
          ) : null}
          <Link
            href="/novedades"
            className="rounded-md bg-white/0 px-2 py-1 text-[11px] font-medium text-white/90 ring-1 ring-inset ring-white/30 hover:bg-white/10 hover:text-white"
          >
            Ver
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-50"
          >
            Entendido
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Descartar"
          >
            <X size={12} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
      {expanded && hasBody ? (
        <div className="border-t border-white/15 bg-amber-950/50 px-4 py-3 backdrop-blur-sm md:px-6">
          <div className="rounded-md bg-amber-950/40 p-3 ring-1 ring-white/15 [&_*]:!text-white/95 [&_a]:!text-white [&_a]:!underline [&_code]:!bg-white/10 [&_code]:!text-white">
            <MarkdownView source={item.bodyMd} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Devuelve la primera línea "limpia" del Markdown para mostrarla como
 * subtítulo en el banner. Quita encabezados (#), guiones de lista y comillas.
 */
function extractFirstLine(md: string): string | null {
  const trimmed = md.trim();
  if (!trimmed) return null;
  const firstParagraph = trimmed.split(/\r?\n\s*\r?\n/, 1)[0] ?? "";
  const firstLine = firstParagraph.split(/\r?\n/, 1)[0] ?? "";
  const cleaned = firstLine
    .replace(/^#+\s*/, "")
    .replace(/^[*\-]\s+/, "")
    .replace(/^>\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
