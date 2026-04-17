-- CreateTable
CREATE TABLE "PreventiveTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "busId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "scheduledAt" DATETIME,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PreventiveTask_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreventiveTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
