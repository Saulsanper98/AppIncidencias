"use client";

import L from "leaflet";
import { MapPin, Navigation, Search, Trash2, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GRAN_CANARIA_BOUNDS,
  GRAN_CANARIA_CENTER,
  haversineKm,
  isWithinGranCanariaBounds,
  resolveMunicipioCoordinates,
} from "@/lib/gran-canaria-map-geo";
import { parseLatLngFromPastedText } from "@/lib/ticket-map-location-parse";
import { cn } from "@/lib/utils";

import "leaflet/dist/leaflet.css";

function clampToGc(lat: number, lng: number): [number, number] {
  const [[s, w], [n, e]] = GRAN_CANARIA_BOUNDS;
  return [Math.min(n, Math.max(s, lat)), Math.min(e, Math.max(w, lng))];
}

function formatCoord(n: number, decimals: number) {
  return n.toFixed(decimals);
}

function MapPickerResize() {
  const map = useMap();
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [map]);
  return null;
}

function MapClickLayer({
  onPick,
  disabled,
}: {
  onPick: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      const [lat, lng] = clampToGc(e.latlng.lat, e.latlng.lng);
      onPick(lat, lng);
    },
  });
  return null;
}

const pinIcon = L.divIcon({
  className: "ccmgc-ticket-loc-pin",
  html: `<div style="width:20px;height:20px;border-radius:9999px;background:#2563eb;border:3px solid #e2e8f0;box-shadow:0 2px 10px rgba(0,0,0,.45)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

type GeocodeHit = { label: string; lat: number; lng: number };

type Props = {
  mapLatitude: string;
  mapLongitude: string;
  mapPlaceMunicipio: string;
  onMapLatitudeChange: (v: string) => void;
  onMapLongitudeChange: (v: string) => void;
  onMapPlaceMunicipioChange: (v: string | null) => void;
  busMunicipio: string;
  onNotify: (message: string | null) => void;
  /** Mapa más bajo (formulario de ticket colapsable). */
  compact?: boolean;
};

export function TicketLocationPicker({
  mapLatitude,
  mapLongitude,
  mapPlaceMunicipio,
  onMapLatitudeChange,
  onMapLongitudeChange,
  onMapPlaceMunicipioChange,
  busMunicipio,
  onNotify,
  compact = false,
}: Props) {
  const [geoLocating, setGeoLocating] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [reverseLoading, setReverseLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;
  const onPlaceRef = useRef(onMapPlaceMunicipioChange);
  onPlaceRef.current = onMapPlaceMunicipioChange;

  const parsed = useMemo(() => {
    const laStr = String(mapLatitude).trim().replace(",", ".");
    const loStr = String(mapLongitude).trim().replace(",", ".");
    if (!laStr || !loStr) return null;
    const la = Number(laStr);
    const lo = Number(loStr);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    return { lat: la, lng: lo };
  }, [mapLatitude, mapLongitude]);

  const setPair = useCallback(
    (lat: number, lng: number, decimals = 5) => {
      const [clat, clng] = clampToGc(lat, lng);
      onMapLatitudeChange(formatCoord(clat, decimals));
      onMapLongitudeChange(formatCoord(clng, decimals));
    },
    [onMapLatitudeChange, onMapLongitudeChange],
  );

  const clearPair = useCallback(() => {
    onMapLatitudeChange("");
    onMapLongitudeChange("");
    onMapPlaceMunicipioChange(null);
    setHits([]);
    onNotify(null);
  }, [onMapLatitudeChange, onMapLongitudeChange, onMapPlaceMunicipioChange, onNotify]);

  const busCenter = useMemo(() => {
    if (!busMunicipio?.trim()) return null;
    const [lat, lng] = resolveMunicipioCoordinates(busMunicipio);
    return { lat, lng };
  }, [busMunicipio]);

  const distanceHint = useMemo(() => {
    if (!parsed || !busMunicipio?.trim() || !busCenter) return null;
    const km = haversineKm(parsed.lat, parsed.lng, busCenter.lat, busCenter.lng);
    if (km <= 18) return null;
    return `El pin está a unos ${km.toFixed(0)} km del punto de referencia del municipio del bus (${busMunicipio.trim()}). Comprueba que sea correcto.`;
  }, [parsed, busMunicipio, busCenter]);

  const boundsHint = useMemo(() => {
    if (!parsed) return null;
    if (isWithinGranCanariaBounds(parsed.lat, parsed.lng)) return null;
    return "Coordenadas fuera del rectángulo habitual de Gran Canaria; se han ajustado al límite del mapa.";
  }, [parsed]);

  useEffect(() => {
    if (!searchQ.trim() || searchQ.trim().length < 2) {
      setHits([]);
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQ.trim())}`, { credentials: "include" });
        const json = (await res.json()) as { results?: GeocodeHit[]; message?: string };
        if (!res.ok) {
          setHits([]);
          if (res.status === 429) onNotifyRef.current(json.message ?? "Demasiadas búsquedas seguidas.");
          return;
        }
        onNotifyRef.current(null);
        setHits(Array.isArray(json.results) ? json.results : []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchQ]);

  useEffect(() => {
    if (!parsed) {
      setReverseLoading(false);
      const coordsCleared = !String(mapLatitude).trim() && !String(mapLongitude).trim();
      if (coordsCleared) onPlaceRef.current(null);
      return;
    }
    if (reverseDebounce.current) clearTimeout(reverseDebounce.current);
    setReverseLoading(true);
    reverseDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geocode/reverse?lat=${encodeURIComponent(String(parsed.lat))}&lng=${encodeURIComponent(String(parsed.lng))}`,
          { credentials: "include" },
        );
        const json = (await res.json()) as { municipio?: string | null };
        if (res.status === 429) {
          onPlaceRef.current(null);
          return;
        }
        const m = json.municipio?.trim();
        onPlaceRef.current(m || null);
      } catch {
        onPlaceRef.current(null);
      } finally {
        setReverseLoading(false);
      }
    }, 420);
    return () => {
      if (reverseDebounce.current) clearTimeout(reverseDebounce.current);
    };
  }, [parsed, mapLatitude, mapLongitude]);

  return (
    <div className="space-y-3">
      <p className={cn("text-[var(--color-text-3)]", compact ? "text-[10.5px] leading-snug" : "text-[11px]")}>
        Toca el mapa o arrastra el pin: se rellenan coordenadas y el municipio o barrio reconocido (geocodificación
        inversa). Búsqueda por nombre abajo. Coordenadas avanzadas al final.
      </p>

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg border border-[var(--color-border)]",
          compact ? "h-[min(180px,34vw)] min-h-[160px]" : "h-[min(240px,42vw)] min-h-[200px]",
        )}
      >
        <MapContainer
          center={parsed ? [parsed.lat, parsed.lng] : GRAN_CANARIA_CENTER}
          zoom={parsed ? 13 : 11}
          className="h-full w-full [&_.leaflet-control-attribution]:hidden"
          scrollWheelZoom
          maxBounds={GRAN_CANARIA_BOUNDS}
          maxBoundsViscosity={0.82}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
          <MapPickerResize />
          <MapClickLayer
            disabled={geoLocating}
            onPick={(lat, lng) => {
              setPair(lat, lng, 5);
              onNotify(null);
            }}
          />
          {parsed ? (
            <Marker
              position={[parsed.lat, parsed.lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target.getLatLng();
                  const [lat, lng] = clampToGc(m.lat, m.lng);
                  setPair(lat, lng, 5);
                },
              }}
            />
          ) : null}
        </MapContainer>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          disabled={geoLocating}
          onClick={() => {
            if (!navigator.geolocation) {
              onNotify("Tu navegador no permite geolocalización.");
              return;
            }
            setGeoLocating(true);
            onNotify(null);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setPair(pos.coords.latitude, pos.coords.longitude, 5);
                setGeoLocating(false);
              },
              () => {
                onNotify("No se pudo obtener la ubicación. Revisa permisos del sitio.");
                setGeoLocating(false);
              },
              { enableHighAccuracy: true, timeout: 18_000, maximumAge: 60_000 },
            );
          }}
        >
          <Navigation size={14} aria-hidden />
          {geoLocating ? "Obteniendo…" : "Mi ubicación"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          disabled={!busCenter}
          title={!busMunicipio?.trim() ? "Selecciona un bus antes" : `Centrar en ${busMunicipio}`}
          onClick={() => {
            if (!busCenter || !busMunicipio.trim()) return;
            setPair(busCenter.lat, busCenter.lng, 5);
            onMapPlaceMunicipioChange(busMunicipio.trim());
            onNotify(null);
          }}
        >
          <MapPin size={14} aria-hidden />
          Municipio del bus
        </Button>
        <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={clearPair}>
          <Trash2 size={14} aria-hidden />
          Quitar pin
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={async () => {
            try {
              const t = await navigator.clipboard.readText();
              const p = parseLatLngFromPastedText(t);
              if (!p) {
                onNotify("No se reconoce el texto como coordenadas o enlace de mapas.");
                return;
              }
              setPair(p.lat, p.lng, 5);
              onNotify(null);
            } catch {
              onNotify("No se pudo leer el portapapeles.");
            }
          }}
        >
          <Link2 size={14} aria-hidden />
          Pegar enlace / coords
        </Button>
      </div>

      <div className="relative">
        <div className="flex gap-2">
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Buscar lugar en la isla…"
            className="!min-h-10 flex-1"
            aria-label="Buscar dirección o lugar"
          />
          <span className="inline-flex min-h-10 items-center text-[var(--color-text-3)]" title="Búsqueda automática">
            <Search size={16} aria-hidden />
            {searching ? <span className="sr-only">Buscando</span> : null}
          </span>
        </div>
        {hits.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-lg">
            {hits.map((h, i) => (
              <li key={`${h.label}-${i}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-[13px] text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)]"
                  onClick={() => {
                    setPair(h.lat, h.lng, 5);
                    setHits([]);
                    setSearchQ("");
                    onNotify(null);
                  }}
                >
                  {h.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {parsed ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2">
          <p className="text-label text-[var(--color-text-3)]">Lugar reconocido en el mapa</p>
          <p className="mt-1 text-sm font-medium text-[var(--color-text-1)]">
            {reverseLoading && !mapPlaceMunicipio.trim() ? (
              <span className="text-[var(--color-text-3)]">Identificando…</span>
            ) : mapPlaceMunicipio.trim() ? (
              mapPlaceMunicipio.trim()
            ) : (
              <span className="text-[var(--color-text-3)]">Sin etiqueta (revisa coordenadas o red)</span>
            )}
          </p>
        </div>
      ) : null}

      {(distanceHint || boundsHint) && parsed ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
          {boundsHint ? <p>{boundsHint}</p> : null}
          {distanceHint ? <p className={cn(boundsHint && "mt-1")}>{distanceHint}</p> : null}
        </div>
      ) : null}

      <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 py-2">
        <summary className="cursor-pointer select-none text-label text-[var(--color-text-2)]">
          Coordenadas (avanzado, 6 decimales)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-caption text-[var(--color-text-3)]">Latitud</span>
            <Input
              inputMode="decimal"
              value={mapLatitude}
              onChange={(e) => onMapLatitudeChange(e.target.value)}
              placeholder="Ej: 28.123456"
              className="font-mono text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-caption text-[var(--color-text-3)]">Longitud</span>
            <Input
              inputMode="decimal"
              value={mapLongitude}
              onChange={(e) => onMapLongitudeChange(e.target.value)}
              placeholder="Ej: -15.432198"
              className="font-mono text-sm"
            />
          </label>
        </div>
        {parsed ? (
          <p className="mt-2 font-mono text-[11px] text-[var(--color-text-3)]">
            Vista previa: {formatCoord(parsed.lat, 6)}, {formatCoord(parsed.lng, 6)}
          </p>
        ) : null}
      </details>

      <p className="text-[11px] text-[var(--color-text-3)]">
        Con ubicación, el ticket va al mapa con GPS y el texto de municipio/lugar guardado; sin pin, se usa el
        municipio del bus en catálogo.
      </p>
    </div>
  );
}
