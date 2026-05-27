/**
 * Helpers compartidos para serializar Announcements al cliente y aplicar la
 * lógica común a varios endpoints (publicado + vigente, marca de leído, etc.).
 */

import type {
  Announcement as AnnouncementDomain,
  AnnouncementKind,
  AnnouncementSeverity,
  AnnouncementStatus,
} from "@/lib/domain";

type PrismaAnnouncement = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  bodyMd: string;
  status: string;
  pinned: boolean;
  publishedAt: Date | null;
  expiresAt: Date | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeAnnouncement(
  row: PrismaAnnouncement,
  options: { isRead?: boolean } = {},
): AnnouncementDomain {
  return {
    id: row.id,
    kind: row.kind as AnnouncementKind,
    severity: row.severity as AnnouncementSeverity,
    title: row.title,
    bodyMd: row.bodyMd,
    status: row.status as AnnouncementStatus,
    pinned: row.pinned,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(typeof options.isRead === "boolean" ? { isRead: options.isRead } : {}),
  };
}

/**
 * Filtros para listar anuncios "vigentes" (visibles para usuario normal):
 * publicados + no expirados.
 */
export function activeAnnouncementWhere() {
  const now = new Date();
  return {
    status: "publicado" as const,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
