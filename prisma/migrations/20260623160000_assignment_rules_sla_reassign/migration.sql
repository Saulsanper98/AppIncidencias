-- EscalationConfig: flags de asignación automática y reasignación por SLA
ALTER TABLE "EscalationConfig" ADD COLUMN "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EscalationConfig" ADD COLUMN "slaReassignEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Reglas de asignación automática de tickets
CREATE TABLE "TicketAssignmentRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "operator" TEXT,
    "lineaMatch" TEXT,
    "shift" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketAssignmentRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TicketAssignmentRule_active_sortOrder_idx" ON "TicketAssignmentRule"("active", "sortOrder");
CREATE INDEX "TicketAssignmentRule_userId_idx" ON "TicketAssignmentRule"("userId");
