import { Suspense } from "react";

import HandoverPageClient from "./handover-page-client";
import { requireActiveUser } from "@/lib/server-session";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export default async function HandoverPage() {
  await requireActiveUser("/handover");
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-1">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      }
    >
      <HandoverPageClient />
    </Suspense>
  );
}
