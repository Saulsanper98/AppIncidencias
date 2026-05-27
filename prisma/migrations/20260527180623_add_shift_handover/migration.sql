-- CreateTable
CREATE TABLE "ShiftHandover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftDate" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "summary" TEXT NOT NULL,
    "alerts" TEXT,
    "pendingActions" TEXT,
    "openTicketsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "acknowledgedById" TEXT,
    "acknowledgedByName" TEXT,
    "acknowledgedAt" DATETIME,
    CONSTRAINT "ShiftHandover_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ShiftHandover_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShiftHandover_shiftDate_shift_idx" ON "ShiftHandover"("shiftDate", "shift");

-- CreateIndex
CREATE INDEX "ShiftHandover_createdAt_idx" ON "ShiftHandover"("createdAt");
