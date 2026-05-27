-- CreateTable
CREATE TABLE "TicketRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromTicketId" TEXT NOT NULL,
    "toTicketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'relacionado',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    CONSTRAINT "TicketRelation_fromTicketId_fkey" FOREIGN KEY ("fromTicketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketRelation_toTicketId_fkey" FOREIGN KEY ("toTicketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketRelation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketRelation_fromTicketId_toTicketId_key" ON "TicketRelation"("fromTicketId", "toTicketId");

-- CreateIndex
CREATE INDEX "TicketRelation_toTicketId_idx" ON "TicketRelation"("toTicketId");
