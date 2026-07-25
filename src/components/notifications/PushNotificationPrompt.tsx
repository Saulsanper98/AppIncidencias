"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushNotificationPrompt() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator);
    if (typeof Notification !== "undefined") {
      setEnabled(Notification.permission === "granted");
    }
  }, []);

  const enable = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const keyRes = await fetch("/api/push/subscribe");
      const { publicKey } = (await keyRes.json()) as { publicKey: string | null };
      if (!publicKey) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      setEnabled(true);
    } finally {
      setBusy(false);
    }
  }, [supported]);

  if (!supported || enabled) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-2)]">
        <BellRing size={14} className="text-[var(--color-accent)]" aria-hidden />
        Activa avisos push para tickets que sigues
      </p>
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void enable()}>
        Activar
      </Button>
    </div>
  );
}
