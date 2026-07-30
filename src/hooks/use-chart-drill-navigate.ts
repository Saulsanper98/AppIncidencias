"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { getBandejaDrillHref, getEntryLabel } from "@/lib/dashboard/widget-data-helpers";

type DrillPayload = {
  name?: string | number;
  payload?: Record<string, unknown>;
};

/** Navega a bandeja filtrada desde un segmento de gráfica. */
export function useChartDrillNavigate(dataSource: string) {
  const router = useRouter();

  const drillTo = useCallback(
    (segmentName: string) => {
      const href = getBandejaDrillHref(dataSource, segmentName);
      if (href) router.push(href);
    },
    [dataSource, router],
  );

  const onSegmentClick = useCallback(
    (data: unknown) => {
      const entry = data as DrillPayload;
      const fromPayload =
        entry?.payload != null
          ? getEntryLabel(entry.payload as Record<string, string | number>)
          : "";
      const segment =
        fromPayload ||
        (entry?.name != null ? String(entry.name) : "") ||
        (typeof data === "object" && data != null && "value" in data
          ? getEntryLabel(data as Record<string, string | number>)
          : "");
      if (segment) drillTo(segment);
    },
    [drillTo],
  );

  return { drillTo, onSegmentClick, canDrill: (segment: string) => Boolean(getBandejaDrillHref(dataSource, segment)) };
}
