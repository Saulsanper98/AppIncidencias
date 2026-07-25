"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function TicketWatchButton({ ticketId }: { ticketId: string }) {
  const [watching, setWatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/watch`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { watching: boolean };
          setWatching(data.watching);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [ticketId]);

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/watch`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { watching: boolean };
        setWatching(data.watching);
      }
    } finally {
      setBusy(false);
    }
  }, [ticketId]);

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={loading || busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
        watching
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)]/40 text-[var(--color-text-2)] hover:text-[var(--color-text-1)]",
      )}
      title={watching ? "Dejar de seguir este ticket" : "Seguir este ticket"}
    >
      {busy ? (
        <Loader2 size={13} className="animate-spin" aria-hidden />
      ) : watching ? (
        <BellOff size={13} aria-hidden />
      ) : (
        <Bell size={13} aria-hidden />
      )}
      {watching ? "Siguiendo" : "Seguir"}
    </button>
  );
}
