-- AlterTable: flag para desvíos indefinidos.
-- Default false → todos los desvíos existentes mantienen su fecha_fin programada
-- y siguen comportándose igual. Cuando sin_fecha_fin=true, la UI ignora fecha_fin
-- y el desvío queda vivo hasta que un operador lo marca RESUELTO/CANCELADO.
ALTER TABLE "Desvio" ADD COLUMN "sin_fecha_fin" BOOLEAN NOT NULL DEFAULT false;
