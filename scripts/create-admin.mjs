// Crea (o actualiza) un usuario administrador (rol `gestor_centro_control`) con
// contraseña inicial. Pensado para ejecutar UNA VEZ al desplegar la app o
// cuando se ha perdido el acceso de gestor.
//
// Uso:
//   node --env-file=.env scripts/create-admin.mjs \
//     --name "Saul" \
//     --email saul@movilidadgc.org \
//     --password "TuPasswordTemporal"
//
// Opciones:
//   --name, -n       Nombre completo (obligatorio salvo si --email ya existe)
//   --email, -e      Correo electrónico (obligatorio)
//   --password, -p   Contraseña en texto plano. Si se omite se genera una
//                    temporal y se muestra por consola.
//   --no-force-change  No marcar mustChangePassword=true. Por defecto SÍ se
//                      marca (el usuario debe cambiarla en el primer login)
//                      salvo cuando estableces tu propia contraseña.
//   --force-change     Forzar el cambio aunque pases --password.
//
// Si el usuario ya existe se actualiza nombre/rol/contraseña.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { argv, env, exit } from "node:process";
import process from "node:process";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    let key, value;
    if (eq >= 0) {
      key = a.slice(0, eq);
      value = a.slice(eq + 1);
    } else if (a.startsWith("--") || a.startsWith("-")) {
      key = a;
      value = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[++i] : "true";
    } else {
      continue;
    }
    const k = key.replace(/^-+/, "");
    out[k] = value;
  }
  return out;
}

function generateTemporaryPassword() {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = lower + upper + digits;
  const rand = (chars) => chars[Math.floor(Math.random() * chars.length)];
  const arr = [rand(upper), rand(lower), rand(digits), rand(digits)];
  while (arr.length < 14) arr.push(rand(all));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

function validateStrength(pw) {
  if (typeof pw !== "string" || pw.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return "Incluye al menos una letra y un dígito.";
  return null;
}

async function main() {
  const args = parseArgs(argv);

  const email = (args.email ?? args.e ?? "").toLowerCase().trim();
  let name = (args.name ?? args.n ?? "").trim();
  let password = args.password ?? args.p ?? null;
  const role = (args.role ?? args.r ?? "gestor_centro_control").trim();
  const forceFlag = args["force-change"] === "true";
  const noForceFlag = args["no-force-change"] === "true";

  if (!email || !email.includes("@")) {
    console.error("Falta --email (correo electrónico válido).");
    exit(1);
  }
  if (!["conductor", "tecnico_campo", "gestor_centro_control"].includes(role)) {
    console.error(`Rol no válido: ${role}.`);
    exit(1);
  }

  // Si la contraseña la pone el admin, por defecto NO forzamos cambio.
  // Si la generamos nosotros, por defecto SÍ.
  let mustChange;
  let passwordWasGenerated = false;
  if (password) {
    const err = validateStrength(password);
    if (err) {
      console.error(err);
      exit(1);
    }
    mustChange = forceFlag ? true : noForceFlag ? false : false;
  } else {
    password = generateTemporaryPassword();
    passwordWasGenerated = true;
    mustChange = noForceFlag ? false : true;
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await prisma.user.findUnique({ where: { email } });

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: name || existing.name,
          role,
          isActive: true,
          passwordHash,
          mustChangePassword: mustChange,
          passwordUpdatedAt: new Date(),
        },
        select: { id: true, name: true, email: true, role: true },
      });
      console.log("\nUsuario actualizado:");
    } else {
      if (!name) {
        console.error("Falta --name (es obligatorio cuando se crea un usuario nuevo).");
        exit(1);
      }
      user = await prisma.user.create({
        data: {
          name,
          email,
          role,
          isActive: true,
          passwordHash,
          mustChangePassword: mustChange,
          passwordUpdatedAt: new Date(),
        },
        select: { id: true, name: true, email: true, role: true },
      });
      console.log("\nUsuario creado:");
    }

    console.log(`  id     : ${user.id}`);
    console.log(`  name   : ${user.name}`);
    console.log(`  email  : ${user.email}`);
    console.log(`  role   : ${user.role}`);
    console.log(`  mustChangePassword: ${mustChange ? "SÍ" : "no"}`);
    if (passwordWasGenerated) {
      console.log("\n>> Contraseña TEMPORAL generada (cópiala ahora):");
      console.log(`   ${password}`);
      console.log("   Comunícala al usuario por canal seguro. Tendrá que cambiarla al iniciar sesión.");
    } else {
      console.log("\n>> Contraseña: la que indicaste por línea de comandos.");
      if (mustChange) console.log("   Se ha marcado mustChangePassword=true.");
    }
    console.log("");
  } catch (err) {
    console.error("Error:", err.message || err);
    exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
