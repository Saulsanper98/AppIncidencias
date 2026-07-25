"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { MapViewSkeleton } from "@/components/ui/view-skeletons";

const MapaView = dynamic(
  () => import("@/components/mapa/mapa-view").then((m) => ({ default: m.MapaView })),
  {
    ssr: false,
    loading: () => <MapViewSkeleton />,
  },
);

export default function MapaPageClient() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<MapViewSkeleton />}>
        <MapaView />
      </Suspense>
    </div>
  );
}
