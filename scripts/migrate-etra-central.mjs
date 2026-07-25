#!/usr/bin/env node
// @ts-check
/**
 * Consolida la cuenta de la central ETRA:
 *  1. Elimina el usuario duplicado etra@etramovilidad.org
 *  2. Renombra read@movilidadgc.org → nombre "ETRA" y email etra@etramovilidad.org
 *  3. Mantiene isReadOnly=true (vista /lectura confinada + ops limitadas en tickets)
 *
 *   node scripts/migrate-etra-central.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const READ_ID = "cmpv39smj0004ue44eno1gdhd";
const OLD_ETRA_ID = "cmq7g40ih0000ueooqtkmcwl9";
const NEW_EMAIL = "etra@etramovilidad.org";

async function main() {
  const read = await prisma.user.findUnique({ where: { id: READ_ID } });
  if (!read) {
    console.error("[X] No se encontró el usuario Read (read@movilidadgc.org).");
    process.exit(1);
  }

  const oldEtra = await prisma.user.findUnique({ where: { id: OLD_ETRA_ID } });
  if (oldEtra) {
    await prisma.user.delete({ where: { id: OLD_ETRA_ID } });
    console.log(`[OK] Eliminado usuario duplicado: ${oldEtra.email} (${oldEtra.name})`);
  } else {
    console.log("[i] Usuario etra@etramovilidad.org ya no existe; se omite borrado.");
  }

  const emailTaken = await prisma.user.findFirst({
    where: { email: NEW_EMAIL, id: { not: READ_ID } },
  });
  if (emailTaken) {
    console.error(`[X] El email ${NEW_EMAIL} ya está en uso por otro usuario.`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: READ_ID },
    data: {
      name: "ETRA",
      email: NEW_EMAIL,
      isReadOnly: true,
      isActive: true,
    },
    select: { id: true, name: true, email: true, isReadOnly: true, role: true },
  });

  console.log("[OK] Cuenta central actualizada:", updated);
}

main()
  .catch((err) => {
    console.error("[X] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
