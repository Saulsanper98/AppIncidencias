import { Suspense } from "react";

import { TicketsModule } from "@/components/tickets-module";
import { SectionTabs } from "@/components/ui/section-tabs";

export default function TicketsPage() {
  return (
    <>
      <SectionTabs preset="tickets" />
      <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl bg-white/5" />}>
        <TicketsModule />
      </Suspense>
    </>
  );
}
