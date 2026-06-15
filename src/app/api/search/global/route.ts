/**
 * Búsqueda global del Ctrl+K.
 *
 * Une en una sola respuesta resultados de:
 *  - Tickets (por id corto, título, busId, conductor, línea…).
 *  - Artículos KB (por título, tags y resumen).
 *  - Desvíos activos (referencia, título, tramo).
 *  - Buses (id, municipio, operadora).
 *  - Líneas (id).
 *  - Anuncios publicados (título, resumen del cuerpo).
 *
 * Cada categoría devuelve hasta `perCategoryLimit` (default 6) resultados con
 * la misma forma para que el cliente pueda renderizarlos uniformemente.
 *
 * Diseño:
 *  - Acepta `q` (string) y `limit` opcional.
 *  - Si `q` está vacío, devuelve un set de "destacados" (tickets recientes,
 *    novedades, etc.) que ya viene siendo útil cuando se abre el Ctrl+K
 *    nada más entrar a la app.
 *  - Operaciones idempotentes y read-only.
 */

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { activeAnnouncementWhere } from "@/lib/announcements";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  /** Texto principal mostrado en la lista. */
  title: string;
  /** Texto secundario opcional (operadora, fecha, estado…). */
  subtitle?: string | null;
  /** Ruta interna a la que navegar al pulsar Enter. */
  href: string;
  /** Etiqueta de la categoría (se muestra como badge a la izquierda). */
  badge?: string;
};

function shortTicketId(id: string): string {
  return id.slice(-8).toUpperCase();
}

export async function GET(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId) {
      return NextResponse.json(
        { message: "Debes iniciar sesión", results: [] },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const qRaw = (searchParams.get("q") ?? "").trim();
    const perCategoryLimit = Math.min(20, Math.max(1, Number(searchParams.get("limit") ?? 6)));
    const q = qRaw.slice(0, 80); // limitamos para no enviar consultas absurdas

    // SQLite no soporta `mode: "insensitive"` con Prisma, pero `contains` es
    // case-insensitive por defecto cuando la columna no tiene `COLLATE BINARY`.
    // Los filtros aquí se basan en `contains` y un like simple.
    const hasQuery = q.length > 0;
    const tokens = hasQuery ? q.split(/\s+/).filter(Boolean) : [];

    // ── Tickets ───────────────────────────────────────────────────────────
    // Si el usuario escribe un id corto (8 chars hex/cuid), priorizamos match
    // por id. Si no, buscamos en título, busId, línea, conductor.
    const ticketsPromise = (async () => {
      if (hasQuery) {
        const upper = q.toUpperCase();
        const tickets = await prisma.ticket.findMany({
          where: {
            OR: [
              { id: { contains: q } },
              { id: { endsWith: upper.toLowerCase() } },
              { title: { contains: q } },
              { busId: { contains: q } },
              { lineaLabel: { contains: q } },
              { conductorLabel: { contains: q } },
            ],
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            busId: true,
            status: true,
            priority: true,
            bus: { select: { operator: true } },
          },
          take: perCategoryLimit,
        });
        return tickets.map<GlobalSearchResult>((t) => ({
          kind: "ticket",
          id: t.id,
          title: `${shortTicketId(t.id)} · ${t.title}`,
          subtitle: `${t.busId} · ${t.bus.operator} · ${t.status} · ${t.priority}`,
          href: `/tickets/${t.id}`,
          badge: "Ticket",
        }));
      }
      // sin query: tickets abiertos más recientes
      const tickets = await prisma.ticket.findMany({
        where: { status: { in: ["abierto", "en_proceso", "esperando_repuesto"] } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          busId: true,
          status: true,
          priority: true,
          bus: { select: { operator: true } },
        },
        take: perCategoryLimit,
      });
      return tickets.map<GlobalSearchResult>((t) => ({
        kind: "ticket",
        id: t.id,
        title: `${shortTicketId(t.id)} · ${t.title}`,
        subtitle: `${t.busId} · ${t.bus.operator} · ${t.status}`,
        href: `/tickets/${t.id}`,
        badge: "Ticket",
      }));
    })();

    // ── KB ─────────────────────────────────────────────────────────────────
    const kbPromise = (async () => {
      const articles = await prisma.kbArticle.findMany({
        where: {
          status: "publicado",
          ...(hasQuery
            ? {
                OR: [
                  { title: { contains: q } },
                  { tags: { contains: q } },
                  { summary: { contains: q } },
                ],
              }
            : {}),
        },
        orderBy: hasQuery ? { views: "desc" } : { updatedAt: "desc" },
        select: { id: true, slug: true, title: true, summary: true, tags: true },
        take: perCategoryLimit,
      });
      return articles.map<GlobalSearchResult>((a) => ({
        kind: "kb",
        id: a.id,
        title: a.title,
        subtitle: a.summary ?? a.tags ?? null,
        href: `/kb/${a.slug}`,
        badge: "KB",
      }));
    })();

    // ── Desvíos activos ────────────────────────────────────────────────────
    const desviosPromise = (async () => {
      const desvios = await prisma.desvio.findMany({
        where: {
          ...(hasQuery
            ? {
                OR: [
                  { referencia: { contains: q } },
                  { titulo: { contains: q } },
                  { tramo: { contains: q } },
                  { via: { contains: q } },
                ],
              }
            : { estado: { in: ["PENDIENTE", "ACTIVO"] } }),
        },
        orderBy: { fecha_inicio: "desc" },
        select: {
          id: true,
          referencia: true,
          titulo: true,
          tramo: true,
          via: true,
          estado: true,
        },
        take: perCategoryLimit,
      });
      return desvios.map<GlobalSearchResult>((d) => ({
        kind: "desvio",
        id: d.id,
        title: `${d.referencia} · ${d.titulo}`,
        subtitle: `${d.via}${d.tramo ? " — " + d.tramo : ""} · ${d.estado}`,
        href: `/desvios/${d.id}`,
        badge: "Desvío",
      }));
    })();

    // ── Buses ──────────────────────────────────────────────────────────────
    const busesPromise = (async () => {
      if (!hasQuery) return [] as GlobalSearchResult[];
      const buses = await prisma.bus.findMany({
        where: {
          OR: [
            { id: { contains: q } },
            { operator: { contains: q } },
            { municipio: { contains: q } },
            { lineas: { contains: q } },
          ],
        },
        orderBy: { id: "asc" },
        take: perCategoryLimit,
      });
      return buses.map<GlobalSearchResult>((b) => ({
        kind: "bus",
        id: b.id,
        title: b.id,
        subtitle: `${b.operator} · ${b.municipio}`,
        // Abre la bandeja filtrada por ese bus (es la vista más útil del bus).
        // Desde junio 2026 la bandeja vive en /bandeja (entrada propia
        // del sidebar; antes era una sub-vista de /tickets).
        href: `/bandeja?busId=${encodeURIComponent(b.id)}`,
        badge: "Bus",
      }));
    })();

    // ── Líneas ─────────────────────────────────────────────────────────────
    const lineasPromise = (async () => {
      if (!hasQuery) return [] as GlobalSearchResult[];
      const lineas = await prisma.linea.findMany({
        where: { id: { contains: q } },
        orderBy: { id: "asc" },
        take: perCategoryLimit,
      });
      return lineas.map<GlobalSearchResult>((l) => ({
        kind: "linea",
        id: l.id,
        title: `Línea ${l.id}`,
        subtitle: null,
        // No tenemos vista propia por línea; abrimos los desvíos para esa línea
        // (suele ser lo que se busca cuando uno teclea "303" en Ctrl+K).
        href: `/desvios?linea=${encodeURIComponent(l.id)}`,
        badge: "Línea",
      }));
    })();

    // ── Anuncios publicados ────────────────────────────────────────────────
    const announcementsPromise = (async () => {
      const announcements = await prisma.announcement.findMany({
        where: {
          AND: [
            activeAnnouncementWhere(),
            hasQuery
              ? { OR: [{ title: { contains: q } }, { bodyMd: { contains: q } }] }
              : {},
          ],
        },
        orderBy: { publishedAt: "desc" },
        select: { id: true, title: true, bodyMd: true, kind: true, severity: true },
        take: perCategoryLimit,
      });
      return announcements.map<GlobalSearchResult>((a) => {
        const firstLine = (a.bodyMd ?? "")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0);
        return {
          kind: "announcement",
          id: a.id,
          title: a.title,
          subtitle: firstLine ? firstLine.slice(0, 140) : null,
          href: "/novedades",
          badge: a.kind === "aviso" ? "Aviso" : "Novedad",
        };
      });
    })();

    const [
      ticketResults,
      kbResults,
      desvioResults,
      busResults,
      lineaResults,
      announcementResults,
    ] = await Promise.all([
      ticketsPromise,
      kbPromise,
      desviosPromise,
      busesPromise,
      lineasPromise,
      announcementsPromise,
    ]);

    return NextResponse.json({
      q,
      tokens,
      results: {
        ticket: ticketResults,
        kb: kbResults,
        desvio: desvioResults,
        bus: busResults,
        linea: lineaResults,
        announcement: announcementResults,
      },
    });
  } catch (error) {
    console.error("Error en /api/search/global:", error);
    return NextResponse.json(
      { message: "No se pudo ejecutar la búsqueda global" },
      { status: 500 },
    );
  }
}
