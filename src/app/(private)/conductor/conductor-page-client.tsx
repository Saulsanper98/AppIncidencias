"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ConductorViewPanel } from "@/components/conductor-view-panel";
import { ExpressTicketPanel } from "@/components/tickets/ExpressTicketPanel";
import type { CatalogBus } from "@/components/tickets/tickets-module-types";
import type { SessionUser } from "@/lib/domain";
import type { TipologiaItem } from "@/lib/tipologia";

export function ConductorPageClient() {
  const [catalog, setCatalog] = useState<CatalogBus[]>([]);
  const [tipologias, setTipologias] = useState<TipologiaItem[]>([]);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [draftCount, setDraftCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [catalogRes, badgeRes, sessionRes] = await Promise.all([
        fetch("/api/catalog", { cache: "no-store" }),
        fetch("/api/tickets/drafts-badge", { cache: "no-store" }),
        fetch("/api/auth/session", { cache: "no-store" }),
      ]);
      if (catalogRes.ok) {
        const data = (await catalogRes.json()) as { buses?: CatalogBus[]; tipologias?: TipologiaItem[] };
        setCatalog(data.buses ?? []);
        setTipologias(data.tipologias ?? []);
      }
      if (badgeRes.ok) {
        const data = (await badgeRes.json()) as { count?: number };
        setDraftCount(Math.max(0, data.count ?? 0));
      }
      if (sessionRes.ok) {
        const data = (await sessionRes.json()) as { user?: SessionUser | null };
        setSessionUser(data.user ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stableCatalog = useMemo(() => catalog, [catalog]);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl bg-[var(--color-surface-2)]" aria-hidden />;
  }

  return (
    <div className="space-y-5">
      <ExpressTicketPanel
        catalog={stableCatalog}
        tipologias={tipologias}
        sessionUser={sessionUser}
        draftCount={draftCount}
        onCreated={() => void load()}
        embedded
      />
      <ConductorViewPanel />
    </div>
  );
}
