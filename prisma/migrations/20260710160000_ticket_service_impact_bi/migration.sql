-- Persistir impacto operativo en ticket (KPIs Power BI).
ALTER TABLE "Ticket" ADD COLUMN "serviceStopped" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN "impactedLines" INTEGER NOT NULL DEFAULT 1;
