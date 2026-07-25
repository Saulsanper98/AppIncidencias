"use client";

import L from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import Supercluster from "supercluster";

import type { TicketStatus } from "@/lib/domain";
import { statusMapMarkerColorHex, type MapTicketFeature } from "@/lib/gran-canaria-map-geo";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<TicketStatus, string> = {
  borrador: "Pendiente de completar",
  abierto: "Abierto",
  en_proceso: "En Proceso",
  esperando_repuesto: "Esperando repuesto",
  resuelto: "Resuelto",
};

const PRIORITY_LABEL = { alta: "Alta", media: "Media", baja: "Baja" } as const;

const PRIORITY_WEIGHT: Record<keyof typeof PRIORITY_LABEL, number> = {
  alta: 3,
  media: 2,
  baja: 1,
};

function dominantClusterPriority(
  sc: Supercluster,
  clusterId: number,
): keyof typeof PRIORITY_LABEL {
  const leaves = sc.getLeaves(clusterId, Infinity);
  let best: keyof typeof PRIORITY_LABEL = "baja";
  let bestWeight = 0;
  for (const leaf of leaves) {
    const priority = (leaf.properties as MapTicketFeature).priority;
    const weight = PRIORITY_WEIGHT[priority] ?? 1;
    if (weight > bestWeight) {
      bestWeight = weight;
      best = priority;
    }
  }
  return best;
}

type ClusterOrPoint = Supercluster.ClusterFeature<Supercluster.AnyProps> | Supercluster.PointFeature<Supercluster.AnyProps>;

type Props = {
  features: MapTicketFeature[];
  selectedId: string | null;
  /** Resaltado al pasar el ratón por la lista lateral (sin seleccionar). */
  hoveredId?: string | null;
  onHoverTicket?: (id: string | null) => void;
  onSelectTicket: (id: string) => void;
  onMapBackgroundClick: () => void;
  /** Modo muro / videowall: el detalle va en panel lateral; no abrir popup de Leaflet. */
  suppressMarkerPopup?: boolean;
  /** Videowall: marcadores y tooltip más grandes para verlos a distancia. */
  wallMode?: boolean;
};

export function MapClusteredMarkers({
  features,
  selectedId,
  hoveredId = null,
  onHoverTicket,
  onSelectTicket,
  onMapBackgroundClick,
  suppressMarkerPopup = false,
  wallMode = false,
}: Props) {
  const map = useMap();
  const indexRef = useRef<Supercluster | null>(null);
  const [clusters, setClusters] = useState<ClusterOrPoint[]>([]);

  const points = useMemo(
    () =>
      features.map((f) => ({
        type: "Feature" as const,
        id: f.id,
        properties: { ...f, cluster: false },
        geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] as [number, number] },
      })),
    [features],
  );

  useEffect(() => {
    const sc = new Supercluster({ radius: 72, maxZoom: 17, minZoom: 0 });
    sc.load(points as Supercluster.PointFeature<Supercluster.AnyProps>[]);
    indexRef.current = sc;
    return () => {
      indexRef.current = null;
    };
  }, [points]);

  const refreshClusters = useCallback(() => {
    const sc = indexRef.current;
    if (!sc || features.length === 0) {
      setClusters([]);
      return;
    }
    const b = map.getBounds();
    const z = Math.max(0, Math.round(map.getZoom()));
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    setClusters(sc.getClusters(bbox, z));
  }, [map, features.length]);

  useMapEvents({
    moveend: refreshClusters,
    zoomend: refreshClusters,
    click(e) {
      const tgt = e.originalEvent.target as HTMLElement | null;
      if (tgt?.closest?.(".leaflet-marker-icon") || tgt?.closest?.(".leaflet-interactive")) return;
      onMapBackgroundClick();
    },
  });

  useEffect(() => {
    refreshClusters();
  }, [refreshClusters, features]);

  return (
    <>
      {clusters.map((item) => {
        const [lng, lat] = item.geometry.coordinates;
        const props = item.properties as MapTicketFeature & { cluster?: boolean; point_count?: number };
        if (props.cluster) {
          const count = props.point_count ?? 0;
          const sc = indexRef.current;
          const clusterId = Number(item.id);
          const priority =
            sc && Number.isFinite(clusterId)
              ? dominantClusterPriority(sc, clusterId)
              : "media";
          const icon = L.divIcon({
            className: "ccmgc-map-cluster-icon",
            html: `<div class="ccmgc-map-cluster-inner ccmgc-map-cluster-inner--${priority}">${count}</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
          return (
            <Marker
              key={`c-${String(item.id)}`}
              position={[lat, lng]}
              icon={icon}
              eventHandlers={{
                click: () => {
                  const z = map.getZoom();
                  const reduceMotion =
                    typeof window !== "undefined" &&
                    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                  map.setView([lat, lng], Math.min(z + 2, 18), { animate: !reduceMotion });
                },
              }}
            />
          );
        }

        const t = props;
        const selected = selectedId === t.id;
        const hovered = hoveredId === t.id;
        const r = wallMode ? (selected ? 22 : hovered ? 18 : 15) : selected ? 12 : hovered ? 10 : 8;
        const w = wallMode ? (selected ? 4 : hovered ? 3.5 : 3) : selected ? 3 : hovered ? 2.5 : 2;
        return (
          <CircleMarker
            key={t.id}
            center={[lat, lng]}
            radius={r}
            pathOptions={{
              color: selected ? "#38bdf8" : hovered ? "#7dd3fc" : "#0f172a",
              weight: w,
              fillColor: statusMapMarkerColorHex(t.status),
              fillOpacity: hovered && !selected ? 1 : 0.92,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onSelectTicket(t.id);
              },
              mouseover: () => onHoverTicket?.(t.id),
              mouseout: () => onHoverTicket?.(null),
            }}
          >
            <Tooltip direction="top" offset={[0, wallMode ? -14 : -8]} opacity={0.95}>
              <span
                className={cn(
                  "font-semibold leading-tight",
                  wallMode ? "text-base min-[1800px]:text-xl min-[3200px]:text-2xl" : "text-[11px] font-medium",
                )}
              >
                {t.id.slice(-8).toUpperCase()} · {STATUS_LABEL[t.status]}
              </span>
            </Tooltip>
            {suppressMarkerPopup ? null : (
              <Popup>
                <div className="min-w-[200px] space-y-1 text-[13px] text-[var(--color-text-1)]">
                  <p className="font-mono text-[11px] text-[var(--color-text-3)]">{t.id.slice(-8).toUpperCase()}</p>
                  <p className="font-medium leading-snug">{t.title}</p>
                  <p className="text-caption">
                    {STATUS_LABEL[t.status]} · {PRIORITY_LABEL[t.priority]}
                  </p>
                  <p className="text-caption">
                    {t.municipio} · {t.operator} · {t.busId}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-3)]">
                    Posición: {t.positionFromGps ? "GPS del ticket" : "Aprox. por municipio"}
                  </p>
                  <Link href={`/tickets/${t.id}`} className="inline-block pt-1 text-[var(--color-accent)] underline-offset-2 hover:underline">
                    Abrir ficha
                  </Link>
                </div>
              </Popup>
            )}
          </CircleMarker>
        );
      })}
    </>
  );
}
