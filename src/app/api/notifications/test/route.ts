import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { canManageUsers } from "@/lib/rbac";

const bodySchema = z.object({
  channel: z.enum(["email", "sms"]),
});

export async function POST(request: Request) {
  try {
    const actor = await resolveRequestActor(request);
    if (!actor.userId || !canManageUsers(actor.role)) {
      return NextResponse.json({ message: "Solo gestores pueden probar notificaciones" }, { status: 403 });
    }
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ message: "Canal invalido" }, { status: 400 });
    }

    if (parsed.data.channel === "email") {
      const key = process.env.RESEND_API_KEY?.trim();
      const from = process.env.NOTIFICATION_EMAIL_FROM?.trim();
      const to = process.env.NOTIFICATION_EMAIL_TO?.trim();
      if (!key || !from || !to) {
        return NextResponse.json(
          { message: "Falta RESEND_API_KEY, NOTIFICATION_EMAIL_FROM o NOTIFICATION_EMAIL_TO" },
          { status: 400 },
        );
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: to.split(",").map((s) => s.trim()).filter(Boolean),
          subject: "CCMGC — prueba de notificación",
          html: "<p>Correo de prueba desde CCMGC Ticketing.</p>",
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ message: "Resend rechazó el envío", detail: text.slice(0, 400) }, { status: 502 });
      }
      return NextResponse.json({ ok: true, channel: "email" });
    }

    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_FROM_NUMBER?.trim();
    const to = process.env.NOTIFICATION_SMS_TO?.trim();
    if (!sid || !token || !from || !to) {
      return NextResponse.json(
        { message: "Faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER o NOTIFICATION_SMS_TO" },
        { status: 400 },
      );
    }
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const params = new URLSearchParams({
      To: to,
      From: from,
      Body: "CCMGC Ticketing: SMS de prueba.",
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ message: "Twilio rechazó el envío", detail: text.slice(0, 400) }, { status: 502 });
    }
    return NextResponse.json({ ok: true, channel: "sms" });
  } catch (error) {
    console.error("notification test error:", error);
    return NextResponse.json({ message: "Error en prueba de notificación" }, { status: 500 });
  }
}
