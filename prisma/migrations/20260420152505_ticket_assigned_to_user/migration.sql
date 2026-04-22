-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "assignedToUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("assetId", "busId", "createdAt", "description", "dominio", "id", "latitude", "longitude", "mapPlaceMunicipio", "nivelImpacto", "observaciones", "origenTecnico", "priority", "slaDeadline", "status", "subsubtipo", "subtipo", "tipo", "title", "updatedAt") SELECT "assetId", "busId", "createdAt", "description", "dominio", "id", "latitude", "longitude", "mapPlaceMunicipio", "nivelImpacto", "observaciones", "origenTecnico", "priority", "slaDeadline", "status", "subsubtipo", "subtipo", "tipo", "title", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
