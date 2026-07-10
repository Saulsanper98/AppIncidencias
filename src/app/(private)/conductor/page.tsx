import { Suspense } from "react";

import { ConductorPageClient } from "./conductor-page-client";
import { requireActiveUser } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function ConductorPage() {
  await requireActiveUser("/conductor");

  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-[var(--color-surface-2)]" aria-hidden />}>
      <ConductorPageClient />
    </Suspense>
  );
}
