import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor, writeAuditEvent } from "@/lib/auth-context";
import { generateTemporaryPassword, hashPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/rbac";

const ROLE_VALUES = ["conductor", "tecnico_campo", "gestor_centro_control"] as const;
type CsvRole = (typeof ROLE_VALUES)[number];

const rowSchema = z.object({
  name: z.string().min(3).max(120).transform((v) => v.trim()),
  email: z.string().email().max(180).transform((v) => v.toLowerCase().trim()),
  role: z.enum(ROLE_VALUES),
});

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
});

type ImportRowResult = {
  index: number;
  email: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
  generatedPassword?: string | null;
};

const ROLE_ALIASES: Record<string, CsvRole> = {
  conductor: "conductor",
  conductores: "conductor",
  driver: "conductor",
  tecnico: "tecnico_campo",
  técnico: "tecnico_campo",
  tecnico_campo: "tecnico_campo",
  "tecnico de campo": "tecnico_campo",
  "técnico de campo": "tecnico_campo",
  tecnico_de_campo: "tecnico_campo",
  fieldtechnician: "tecnico_campo",
  field_technician: "tecnico_campo",
  gestor: "gestor_centro_control",
  gestor_centro_control: "gestor_centro_control",
  "gestor del centro de control": "gestor_centro_control",
  controlmanager: "gestor_centro_control",
  control_manager: "gestor_centro_control",
};

function normalizeRole(raw: unknown): CsvRole | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (ROLE_VALUES.includes(k as CsvRole)) return k as CsvRole;
  return ROLE_ALIASES[k] ?? null;
}

/**
 * Importación masiva de usuarios desde un CSV ya parseado por el cliente.
 * El cliente debe enviar `rows: Array<{ name, email, role }>` (case-insensitive).
 * Genera contraseñas temporales y las devuelve para mostrar en pantalla.
 */
export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageUsers(actor.role)) {
      return NextResponse.json({ message: "Permisos insuficientes" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = bodySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Datos de importación invalidos", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const results: ImportRowResult[] = [];

    for (let i = 0; i < parsed.data.rows.length; i++) {
      const raw = parsed.data.rows[i];
      const normalized = {
        name: typeof raw.name === "string" ? raw.name : (raw["nombre"] as string | undefined) ?? "",
        email: typeof raw.email === "string" ? raw.email : (raw["correo"] as string | undefined) ?? "",
        role: normalizeRole(raw.role ?? raw["rol"]),
      };

      if (!normalized.role) {
        results.push({
          index: i + 1,
          email: typeof normalized.email === "string" ? normalized.email : "",
          status: "error",
          message: "Rol no reconocido. Usa: conductor, tecnico_campo o gestor_centro_control.",
        });
        continue;
      }

      const validated = rowSchema.safeParse(normalized);
      if (!validated.success) {
        results.push({
          index: i + 1,
          email: normalized.email ?? "",
          status: "error",
          message: validated.error.issues.map((iss) => iss.message).join(", "),
        });
        continue;
      }

      try {
        const tempPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(tempPassword);

        const created = await prisma.user.create({
          data: {
            name: validated.data.name,
            email: validated.data.email,
            role: validated.data.role,
            isActive: true,
            passwordHash,
            mustChangePassword: true,
            passwordUpdatedAt: new Date(),
          },
          select: { id: true, email: true },
        });

        results.push({
          index: i + 1,
          email: created.email,
          status: "created",
          generatedPassword: tempPassword,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          results.push({
            index: i + 1,
            email: validated.data.email,
            status: "skipped",
            message: "Ya existe un usuario con ese correo electrónico.",
          });
        } else {
          console.error("[users/import] fila", i + 1, err);
          results.push({
            index: i + 1,
            email: validated.data.email,
            status: "error",
            message: err instanceof Error ? err.message : "Error desconocido.",
          });
        }
      }
    }

    const stats = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
    };

    await writeAuditEvent({
      userId: actor.userId,
      action: "user.imported",
      detail: `${actor.displayName} importo ${stats.created} usuarios (skipped=${stats.skipped}, errors=${stats.errors})`,
    });

    return NextResponse.json({ results, stats });
  } catch (error) {
    console.error("Error importing users:", error);
    return NextResponse.json({ message: "No se pudo procesar la importación" }, { status: 500 });
  }
}
