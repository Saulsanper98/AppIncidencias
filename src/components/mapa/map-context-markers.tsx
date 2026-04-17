"use client";

import { CircleMarker, Popup, Tooltip } from "react-leaflet";

type W = { id: string; name: string; municipio: string; lat: number; lng: number; meta: string };
type P = { id: string; name: string; municipio: string; busId: string; lat: number; lng: number; status: string };

export function MapWarehouseMarkers({ items }: { items: W[] }) {
  return (
    <>
      {items.map((w) => (
        <CircleMarker
          key={w.id}
          center={[w.lat, w.lng]}
          radius={7}
          pathOptions={{ color: "#a78bfa", weight: 2, fillColor: "#7c3aed", fillOpacity: 0.85 }}
        >
          <Tooltip direction="top">Almacén · {w.name}</Tooltip>
          <Popup>
            <div className="text-[13px] text-[var(--color-text-1)]">
              <p className="font-medium">{w.name}</p>
              <p className="text-caption">{w.municipio}</p>
              <p className="text-caption">{w.meta}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

export function MapPreventiveMarkers({ items }: { items: P[] }) {
  return (
    <>
      {items.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={6}
          pathOptions={{ color: "#22d3ee", weight: 2, fillColor: "#0891b2", fillOpacity: 0.88 }}
        >
          <Tooltip direction="top">Preventivo · {p.busId}</Tooltip>
          <Popup>
            <div className="text-[13px] text-[var(--color-text-1)]">
              <p className="font-medium leading-snug">{p.name}</p>
              <p className="text-caption">
                {p.municipio} · {p.busId}
              </p>
              <p className="text-caption">Estado: {p.status}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}
