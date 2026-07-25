-- CreateTable
CREATE TABLE "TicketDeletionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "TicketDeletionRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketDeletionRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketDeletionRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EscalationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "unassignedAltaMinutes" INTEGER NOT NULL DEFAULT 15,
    "unassignedMediaMinutes" INTEGER NOT NULL DEFAULT 60,
    "unassignedBajaMinutes" INTEGER NOT NULL DEFAULT 240,
    "slaWarnMinutes" INTEGER NOT NULL DEFAULT 15,
    "staleTicketHours" INTEGER NOT NULL DEFAULT 48,
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT true,
    "slaReassignEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByName" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_EscalationConfig" ("autoAssignEnabled", "id", "slaReassignEnabled", "slaWarnMinutes", "staleTicketHours", "unassignedAltaMinutes", "unassignedBajaMinutes", "unassignedMediaMinutes", "updatedAt", "updatedByName") SELECT "autoAssignEnabled", "id", "slaReassignEnabled", "slaWarnMinutes", "staleTicketHours", "unassignedAltaMinutes", "unassignedBajaMinutes", "unassignedMediaMinutes", "updatedAt", "updatedByName" FROM "EscalationConfig";
DROP TABLE "EscalationConfig";
ALTER TABLE "new_EscalationConfig" RENAME TO "EscalationConfig";
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "busId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tipo" TEXT,
    "subtipo" TEXT,
    "subsubtipo" TEXT,
    "dominio" TEXT,
    "nivelImpacto" TEXT,
    "origenTecnico" TEXT,
    "observaciones" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "slaDeadline" DATETIME NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "mapPlaceMunicipio" TEXT,
    "lineaLabel" TEXT,
    "servicioLabel" TEXT,
    "conductorLabel" TEXT,
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "resolvedAt" DATETIME,
    "incidentOccurredAt" DATETIME,
    "needsCompletion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("assetId", "assignedToUserId", "busId", "conductorLabel", "createdAt", "createdByUserId", "description", "dominio", "id", "incidentOccurredAt", "latitude", "lineaLabel", "longitude", "mapPlaceMunicipio", "needsCompletion", "nivelImpacto", "observaciones", "origenTecnico", "priority", "resolvedAt", "servicioLabel", "slaDeadline", "status", "subsubtipo", "subtipo", "tipo", "title", "updatedAt") SELECT "assetId", "assignedToUserId", "busId", "conductorLabel", "createdAt", "createdByUserId", "description", "dominio", "id", "incidentOccurredAt", "latitude", "lineaLabel", "longitude", "mapPlaceMunicipio", "needsCompletion", "nivelImpacto", "observaciones", "origenTecnico", "priority", "resolvedAt", "servicioLabel", "slaDeadline", "status", "subsubtipo", "subtipo", "tipo", "title", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE INDEX "Ticket_createdByUserId_idx" ON "Ticket"("createdByUserId");
CREATE INDEX "Ticket_resolvedAt_idx" ON "Ticket"("resolvedAt");
CREATE INDEX "Ticket_status_updatedAt_idx" ON "Ticket"("status", "updatedAt");
CREATE TABLE "new_TicketAssignmentRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operator" TEXT,
    "lineaMatch" TEXT,
    "shift" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketAssignmentRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TicketAssignmentRule" ("active", "createdAt", "id", "lineaMatch", "operator", "shift", "sortOrder", "updatedAt", "userId") SELECT "active", "createdAt", "id", "lineaMatch", "operator", "shift", "sortOrder", "updatedAt", "userId" FROM "TicketAssignmentRule";
DROP TABLE "TicketAssignmentRule";
ALTER TABLE "new_TicketAssignmentRule" RENAME TO "TicketAssignmentRule";
CREATE INDEX "TicketAssignmentRule_active_sortOrder_idx" ON "TicketAssignmentRule"("active", "sortOrder");
CREATE INDEX "TicketAssignmentRule_userId_idx" ON "TicketAssignmentRule"("userId");
CREATE TABLE "new_TicketRecurrence" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TicketRecurrence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TicketRecurrence" ("active", "busId", "createdAt", "createdByUserId", "id", "intervalDays", "lastRunAt", "name", "nextRunAt", "templateJson", "updatedAt") SELECT "active", "busId", "createdAt", "createdByUserId", "id", "intervalDays", "lastRunAt", "name", "nextRunAt", "templateJson", "updatedAt" FROM "TicketRecurrence";
DROP TABLE "TicketRecurrence";
ALTER TABLE "new_TicketRecurrence" RENAME TO "TicketRecurrence";
CREATE INDEX "TicketRecurrence_active_nextRunAt_idx" ON "TicketRecurrence"("active", "nextRunAt");
CREATE TABLE "new_TipologiaEntry" (
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TipologiaEntry" ("active", "createdAt", "dominio", "id", "nivelImpacto", "observaciones", "origenTecnico", "sortOrder", "subsubtipo", "subtipo", "tipo", "updatedAt") SELECT "active", "createdAt", "dominio", "id", "nivelImpacto", "observaciones", "origenTecnico", "sortOrder", "subsubtipo", "subtipo", "tipo", "updatedAt" FROM "TipologiaEntry";
DROP TABLE "TipologiaEntry";
ALTER TABLE "new_TipologiaEntry" RENAME TO "TipologiaEntry";
CREATE INDEX "TipologiaEntry_active_sortOrder_idx" ON "TipologiaEntry"("active", "sortOrder");
CREATE UNIQUE INDEX "TipologiaEntry_tipo_subtipo_subsubtipo_key" ON "TipologiaEntry"("tipo", "subtipo", "subsubtipo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TicketDeletionRequest_status_createdAt_idx" ON "TicketDeletionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TicketDeletionRequest_ticketId_idx" ON "TicketDeletionRequest"("ticketId");

-- CreateIndex
CREATE INDEX "TicketDeletionRequest_requestedByUserId_idx" ON "TicketDeletionRequest"("requestedByUserId");
