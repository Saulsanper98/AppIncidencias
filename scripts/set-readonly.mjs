#!/usr/bin/env node
// @ts-check
/**
 * scripts/set-readonly.mjs
 *
 * Activa/desactiva el flag `isReadOnly` de un usuario por email.
 *
 *   node scripts/set-readonly.mjs <email> [on|off]
 *
 * Ejemplos:
 *   node scripts/set-readonly.mjs read@movilidadgc.org on
 *   node scripts/set-readonly.mjs read@movilidadgc.org off
 *
 * Si el usuario no existe, se crea con rol "conductor" y password vacío
 * (no podrá entrar hasta que un admin le ponga una desde Admin → Usuarios).
 *
 * NO usa el cliente Prisma directamente para no fallar si el cliente
 * generado va detrás del schema: tira de SQL crudo contra `prisma.db`
 * a través de `@prisma/client` con $executeRaw.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [, , emailRaw, modeRaw] = process.argv;
  if (!emailRaw) {
    console.error("Uso: node scripts/set-readonly.mjs <email> [on|off]");
    process.exit(1);
  }
  const email = emailRaw.trim().toLowerCase();
  const mode = (modeRaw ?? "on").trim().toLowerCase();
  if (mode !== "on" && mode !== "off") {
    console.error('El segundo argumento debe ser "on" o "off". Por defecto "on".');
    process.exit(1);
  }
  const value = mode === "on" ? 1 : 0;

  // Asegurar que el usuario existe (si no, lo creamos como conductor inactivo
  // sin password — el admin tendrá que asignarle credenciales desde el panel).
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    console.log(`[i] Usuario ${email} no existe. Lo creo como 'conductor' inactivo.`);
    await prisma.user.create({
      data: {
        name: email.split("@")[0],
        email,
        role: "conductor",
        isActive: false,
      },
    });
    console.log(`[!] Creado. Recuerda activarlo y asignarle contraseña desde Admin → Usuarios.`);
  }

  const result = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "isReadOnly" = ? WHERE email = ?`,
    value,
    email,
  );

  console.log(
    `[OK] isReadOnly = ${value ? "true" : "false"} aplicado a ${email}. Filas afectadas: ${result}`,
  );
}

main()
  .catch((err) => {
    console.error("[X] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
