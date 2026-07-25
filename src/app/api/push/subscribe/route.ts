import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveRequestActor } from "@/lib/auth-context";
import { getVapidPublicKey, removePushSubscription, savePushSubscription } from "@/lib/push-notifications";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Suscripción inválida" }, { status: 400 });
  }
  await savePushSubscription(actor.userId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor.userId) {
    return NextResponse.json({ message: "Autenticación requerida" }, { status: 401 });
  }
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ message: "Falta endpoint" }, { status: 400 });
  await removePushSubscription(actor.userId, endpoint);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}
