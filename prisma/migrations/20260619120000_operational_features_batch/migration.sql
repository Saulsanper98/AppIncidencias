-- Ticket accountability + timeline
ALTER TABLE "Ticket" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "resolvedAt" DATETIME;
CREATE INDEX "Ticket_createdByUserId_idx" ON "Ticket"("createdByUserId");
CREATE INDEX "Ticket_resolvedAt_idx" ON "Ticket"("resolvedAt");
CREATE INDEX "Ticket_status_updatedAt_idx" ON "Ticket"("status", "updatedAt");

-- TicketStatusChange
CREATE TABLE "TicketStatusChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "changedByName" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketStatusChange_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TicketStatusChange_ticketId_createdAt_idx" ON "TicketStatusChange"("ticketId", "createdAt");

-- TicketWatcher
CREATE TABLE "TicketWatcher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketWatcher_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TicketWatcher_ticketId_userId_key" ON "TicketWatcher"("ticketId", "userId");
CREATE INDEX "TicketWatcher_userId_idx" ON "TicketWatcher"("userId");

-- TicketDesvioLink
CREATE TABLE "TicketDesvioLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "desvioId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    CONSTRAINT "TicketDesvioLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketDesvioLink_desvioId_fkey" FOREIGN KEY ("desvioId") REFERENCES "Desvio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketDesvioLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TicketDesvioLink_ticketId_desvioId_key" ON "TicketDesvioLink"("ticketId", "desvioId");
CREATE INDEX "TicketDesvioLink_desvioId_idx" ON "TicketDesvioLink"("desvioId");

-- TipologiaEntry
CREATE TABLE "TipologiaEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "subtipo" TEXT NOT NULL,
    "subsubtipo" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "nivelImpacto" TEXT NOT NULL,
    "origenTecnico" TEXT NOT NULL,
    "observaciones" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TipologiaEntry_tipo_subtipo_subsubtipo_key" ON "TipologiaEntry"("tipo", "subtipo", "subsubtipo");
CREATE INDEX "TipologiaEntry_active_sortOrder_idx" ON "TipologiaEntry"("active", "sortOrder");

-- EscalationConfig (singleton)
CREATE TABLE "EscalationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "unassignedAltaMinutes" INTEGER NOT NULL DEFAULT 15,
    "unassignedMediaMinutes" INTEGER NOT NULL DEFAULT 60,
    "unassignedBajaMinutes" INTEGER NOT NULL DEFAULT 240,
    "slaWarnMinutes" INTEGER NOT NULL DEFAULT 15,
    "staleTicketHours" INTEGER NOT NULL DEFAULT 48,
    "updatedByName" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "EscalationConfig" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

-- TicketRecurrence
CREATE TABLE "TicketRecurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "intervalDays" INTEGER NOT NULL,
    "templateJson" TEXT NOT NULL,
    "busId" TEXT,
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketRecurrence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "TicketRecurrence_active_nextRunAt_idx" ON "TicketRecurrence"("active", "nextRunAt");

-- KbDashboardShortcut
CREATE TABLE "KbDashboardShortcut" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbDashboardShortcut_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KbArticle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "KbDashboardShortcut_sortOrder_idx" ON "KbDashboardShortcut"("sortOrder");

-- PushSubscription
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
