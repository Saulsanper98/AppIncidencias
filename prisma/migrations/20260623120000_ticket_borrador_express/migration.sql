-- Apuntes express: hora real de la incidencia y estado borrador (SQLite almacena enum como TEXT).
ALTER TABLE "Ticket" ADD COLUMN "incidentOccurredAt" DATETIME;
