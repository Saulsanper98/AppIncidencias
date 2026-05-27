-- CreateTable: Announcement
-- Avisos en vivo (kind=aviso) y entradas de changelog (kind=novedad)
-- publicados por un gestor para todos los usuarios.
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "expiresAt" DATETIME,
    "authorId" TEXT,
    "authorName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Announcement_kind_status_publishedAt_idx" ON "Announcement"("kind", "status", "publishedAt");
CREATE INDEX "Announcement_status_expiresAt_idx" ON "Announcement"("status", "expiresAt");

-- CreateTable: AnnouncementRead
-- Marca que un usuario ya ha visto/descartado un anuncio concreto.
CREATE TABLE "AnnouncementRead" (
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "announcementId"),
    CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_readAt_idx" ON "AnnouncementRead"("userId", "readAt");

-- Seed inicial: una novedad de bienvenida con el resumen de los cambios
-- recientes (tickets relacionados, SLA editable, import de líneas).
INSERT INTO "Announcement" ("id", "kind", "severity", "title", "bodyMd", "status", "pinned", "publishedAt", "createdAt", "updatedAt", "authorName")
VALUES (
  'seed-novedad-bienvenida',
  'novedad',
  'info',
  'Bienvenida a Novedades · ¿Qué hay nuevo?',
  '## Mayo 2026 · Mejoras importantes' || char(10) || char(10) ||
  '- **Tickets relacionados**: en el detalle de cualquier ticket ahora puedes vincular otros tickets (incluidos los resueltos) para mantener la trazabilidad entre incidencias.' || char(10) ||
  '- **SLA configurable**: el SLA por prioridad ya no está hardcoded. Los gestores pueden ajustarlo en *Administración → Catálogo → SLA por prioridad*.' || char(10) ||
  '- **Catálogo de líneas mejorado**: ahora puedes añadir varias líneas a la vez (pegando una lista) y/o importar un fichero Excel/CSV. Plantilla bien formateada disponible para descargar.' || char(10) ||
  '- **Plantillas Excel**: tanto la de "Nuevo bus" como la de "Nueva línea" son ahora XLSX con cabeceras estilizadas e instrucciones.' || char(10) ||
  '- **Avisos en vivo**: esto mismo. Si hay un reinicio o mantenimiento, lo verás como banner arriba de todas las pantallas.',
  'publicado',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'Sistema'
);
