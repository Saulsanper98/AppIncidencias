-- Add business tipology fields while keeping asset linkage.
ALTER TABLE "Ticket" ADD COLUMN "tipo" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "subtipo" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "subsubtipo" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "dominio" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "nivelImpacto" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "origenTecnico" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "observaciones" TEXT;
