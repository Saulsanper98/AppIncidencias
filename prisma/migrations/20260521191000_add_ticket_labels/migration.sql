-- Añade etiquetas libres al ticket: servicio (línea/recorrido) y conductor.
-- Ambas son nullable: tickets existentes no se ven afectados.
ALTER TABLE "Ticket" ADD COLUMN "servicioLabel" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "conductorLabel" TEXT;
