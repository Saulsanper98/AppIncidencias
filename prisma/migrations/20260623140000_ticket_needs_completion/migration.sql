-- Apuntes express: marcar tickets con datos pendientes de completar (borrador o cerrado express).
ALTER TABLE "Ticket" ADD COLUMN "needsCompletion" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Ticket" SET "needsCompletion" = true WHERE "status" = 'borrador';
