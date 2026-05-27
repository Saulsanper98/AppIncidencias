-- Añade soporte de contraseña local (bcrypt) al modelo User.
-- Compatible con BD ya poblada: todas las columnas son nullables o con default.

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "passwordUpdatedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;
