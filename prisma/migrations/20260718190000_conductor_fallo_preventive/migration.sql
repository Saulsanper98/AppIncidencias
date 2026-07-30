-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "conductorId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "falloOrigen" TEXT;

-- CreateTable
CREATE TABLE "Conductor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "operator" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ConductorPreventiveCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conductorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'abierto',
    "ticketCountAtOpen" INTEGER NOT NULL DEFAULT 0,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConductorPreventiveCase_conductorId_fkey" FOREIGN KEY ("conductorId") REFERENCES "Conductor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConductorPreventiveCase_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ConductorPreventiveCase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConductorPreventiveComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConductorPreventiveComment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ConductorPreventiveCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConductorPreventiveComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Conductor_nameNormalized_key" ON "Conductor"("nameNormalized");

-- CreateIndex
CREATE INDEX "ConductorPreventiveCase_conductorId_status_idx" ON "ConductorPreventiveCase"("conductorId", "status");

-- CreateIndex
CREATE INDEX "ConductorPreventiveCase_status_updatedAt_idx" ON "ConductorPreventiveCase"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ConductorPreventiveCase_assignedToUserId_idx" ON "ConductorPreventiveCase"("assignedToUserId");

-- CreateIndex
CREATE INDEX "ConductorPreventiveComment_caseId_createdAt_idx" ON "ConductorPreventiveComment"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_conductorId_idx" ON "Ticket"("conductorId");

-- CreateIndex
CREATE INDEX "Ticket_falloOrigen_idx" ON "Ticket"("falloOrigen");

-- CreateIndex
CREATE INDEX "Ticket_conductorLabel_idx" ON "Ticket"("conductorLabel");
