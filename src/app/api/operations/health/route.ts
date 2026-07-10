import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { resolveRequestActor } from "@/lib/auth-context";
import { getDesviosPoller } from "@/lib/desvios/email-poller";
import { getScheduler } from "@/lib/scheduler";
import { canControlDesviosPoller, canManageUsers } from "@/lib/rbac";

function envFlag(key: string): string {
  return (process.env[key] ?? "").trim();
}

function readEnvFile(key: string): string {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return "";
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!m || m[1].trim() !== key) continue;
      return m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
  return "";
}

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  if (!canManageUsers(actor.role)) {
    return NextResponse.json({ message: "Sin permisos" }, { status: 403 });
  }

  const poller = getDesviosPoller().status();
  const scheduler = getScheduler().status();

  const dbUrl = envFlag("DATABASE_URL") || readEnvFile("DATABASE_URL");
  const emailProvider = envFlag("EMAIL_PROVIDER") || readEnvFile("EMAIL_PROVIDER") || "disabled";

  let disk: { freeGb: number; totalGb: number } | null = null;
  try {
    // Node 18+ en Linux
    const free = os.freemem();
    const total = os.totalmem();
    disk = {
      freeGb: Math.round((free / 1024 ** 3) * 10) / 10,
      totalGb: Math.round((total / 1024 ** 3) * 10) / 10,
    };
  } catch {
    disk = null;
  }

  return NextResponse.json({
    poller,
    scheduler,
    canManagePoller: canControlDesviosPoller(actor.role),
    env: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      databaseConfigured: Boolean(dbUrl),
      emailProvider,
      resendConfigured: Boolean(envFlag("RESEND_API_KEY") || readEnvFile("RESEND_API_KEY")),
      vapidConfigured: Boolean(
        (envFlag("VAPID_PUBLIC_KEY") || readEnvFile("VAPID_PUBLIC_KEY")) &&
          (envFlag("VAPID_PRIVATE_KEY") || readEnvFile("VAPID_PRIVATE_KEY")),
      ),
      tlsConfigured: Boolean(
        envFlag("TLS_PFX_PATH") ||
          readEnvFile("TLS_PFX_PATH") ||
          envFlag("TLS_CERT_PATH") ||
          readEnvFile("TLS_CERT_PATH"),
      ),
    },
    disk,
  });
}
