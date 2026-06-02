-- CreateTable: telemetría de uso (UX analytics).
-- Cada fila es un evento del cliente. Indexamos por createdAt, eventName,
-- userId y path para que las agregaciones del panel de analítica vuelen.
CREATE TABLE "UxEvent" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "userId"     TEXT,
    "userRole"   TEXT,
    "eventName"  TEXT NOT NULL,
    "sessionId"  TEXT,
    "path"       TEXT,
    "durationMs" INTEGER,
    "shift"      TEXT,
    "device"     TEXT,
    "props"      TEXT,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UxEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "UxEvent_createdAt_idx"               ON "UxEvent"("createdAt");
CREATE INDEX "UxEvent_eventName_createdAt_idx"     ON "UxEvent"("eventName", "createdAt");
CREATE INDEX "UxEvent_userId_createdAt_idx"        ON "UxEvent"("userId", "createdAt");
CREATE INDEX "UxEvent_path_createdAt_idx"          ON "UxEvent"("path", "createdAt");
