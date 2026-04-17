import { Suspense } from "react";

import { TicketsModule } from "@/components/tickets-module";

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl bg-white/5" />}>
      <TicketsModule />
    </Suspense>
  );
}
