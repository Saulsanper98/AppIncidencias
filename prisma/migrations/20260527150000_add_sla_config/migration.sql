-- CreateTable: configuración editable del SLA por prioridad.
-- Sustituye los valores hardcoded (alta=30, media=120, baja=240) que vivían
-- en src/lib/ticketing.ts. Si una fila no existe, se cae al default histórico.
CREATE TABLE "SlaConfig" (
    "priority" TEXT NOT NULL PRIMARY KEY,
    "minutes" INTEGER NOT NULL,
    "updatedByName" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed inicial con los valores históricos (los que el usuario considera "falsos"
-- pero que sirven como punto de partida hasta que los edite desde el panel).
INSERT INTO "SlaConfig" ("priority", "minutes", "updatedAt") VALUES
  ('alta',  30,  CURRENT_TIMESTAMP),
  ('media', 120, CURRENT_TIMESTAMP),
  ('baja',  240, CURRENT_TIMESTAMP);
