-- AlterTable: añade flag de "solo lectura" al usuario.
-- Default false → ningún usuario existente cambia de comportamiento.
-- Cuando isReadOnly=true, el servidor rechaza cualquier mutación y el
-- cliente solo renderiza la vista /lectura (ver auth-context.ts y layout privado).
ALTER TABLE "User" ADD COLUMN "isReadOnly" BOOLEAN NOT NULL DEFAULT false;
