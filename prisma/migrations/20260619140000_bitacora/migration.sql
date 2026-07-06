-- Bitácora de turno (Conocimiento)
CREATE TABLE "BitacoraEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftDate" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'nota',
    "title" TEXT,
    "contentJson" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "authorName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BitacoraEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BitacoraEntry_shiftDate_shift_createdAt_idx" ON "BitacoraEntry"("shiftDate", "shift", "createdAt");
CREATE INDEX "BitacoraEntry_pinned_createdAt_idx" ON "BitacoraEntry"("pinned", "createdAt");
CREATE INDEX "BitacoraEntry_createdAt_idx" ON "BitacoraEntry"("createdAt");
