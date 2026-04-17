-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PreventiveTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "busId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "scheduledAt" DATETIME,
    "createdByUserId" TEXT,
    "assignedToUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PreventiveTask_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreventiveTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PreventiveTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PreventiveTask" ("assetType", "busId", "createdAt", "createdByUserId", "id", "reason", "scheduledAt", "status", "updatedAt") SELECT "assetType", "busId", "createdAt", "createdByUserId", "id", "reason", "scheduledAt", "status", "updatedAt" FROM "PreventiveTask";
DROP TABLE "PreventiveTask";
ALTER TABLE "new_PreventiveTask" RENAME TO "PreventiveTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
