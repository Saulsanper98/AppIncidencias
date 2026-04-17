"use client";

import L from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import Supercluster from "supercluster";

import type { TicketStatus } from "@/lib/domain";
import { statusMapMarkerColorHex, type MapTicketFeature } from "@/lib/gran-canaria-map-geo";

const STATUS_LABEL: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_proceso: "En Proceso",
  esperando_repuesto: "Esperando repuesto",
  resuelto: "Resuelto",
};

const PRIORITY_LABEL = { alta: "Alta", media: "Media", baja: "Baja" } as const;

type ClusterOrPoint = Supercluster.ClusterFeature<Supercluster.AnyProps> | Supercluster.PointFeature<Supercluster.AnyProps>;

type Props = {
  features: MapTicketFeature[];
  selectedId: string | null;
  /** Resaltado al pasar el ratón por la lista lateral (sin seleccionar). */
  hoveredId?: string | null;
  onHoverTicket?: (id: string | null) => void;
  onSelectTicket: (id: string) => void;
  onMapBackgroundClick: () => void;
};

export function MapClusteredMarkers({
  features,
  selectedId,
  hoveredId = null,
  onHoverTicket,
  onSelectTicket,
  onMapBackgroundClick,
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
          const icon = L.divIcon({
            className: "ccmgc-map-cluster-icon",
            html: `<div class="ccmgc-map-cluster-inner">${count}</div>`,
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
        return (
          <CircleMarker
            key={t.id}
            center={[lat, lng]}
            radius={selected ? 12 : hovered ? 10 : 8}
            pathOptions={{
              color: selected ? "#38bdf8" : hovered ? "#7dd3fc" : "#0f172a",
              weight: selected ? 3 : hovered ? 2.5 : 2,
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
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              <span className="text-[11px] font-medium">
                {t.id.slice(-8).toUpperCase()} · {STATUS_LABEL[t.status]}
              </span>
            </Tooltip>
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
          </CircleMarker>
        );
      })}
    </>
  );
}
