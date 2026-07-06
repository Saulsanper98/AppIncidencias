"use client";

import L from "leaflet";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  ArrowRight,
  ExternalLink,
  HelpCircle,
  ImageDown,
  Inbox,
  MapPinned,
  Maximize2,
  Monitor,
  PanelLeftClose,
  RefreshCw,
  SlidersHorizontal,
  Timer,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ReactNode,
  type RefObject,
} from "react";
import { LayersControl, MapContainer, Pane, ScaleControl, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { MapDateField } from "@/components/mapa/map-date-field";
import { MapClusteredMarkers } from "@/components/mapa/map-clustered-markers";
import { MapPreventiveMarkers, MapWarehouseMarkers } from "@/components/mapa/map-context-markers";
import { FeedbackTargetButton } from "@/components/feedback/FeedbackTargetButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { kpiToneValueClass, type KpiTone } from "@/components/ui/kpi-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/menu-select";
import type { TicketPriority, TicketStatus, UserRole } from "@/lib/domain";
import type { TicketScopeFilter } from "@/lib/ticket-filters";
import { formatSlaOverdueLabel } from "@/lib/ticketing";
import { GRAN_CANARIA_BOUNDS, GRAN_CANARIA_CENTER, type MapTicketFeature } from "@/lib/gran-canaria-map-geo";
import { motionTransition, slideFromRight } from "@/lib/motion";
import {
  priorityBadgeProps,
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";

const MAP_SORT_OPTIONS: MenuSelectOption[] = [
  { value: "sla", label: "Por SLA (próximo)" },
  { value: "title", label: "Por título" },
  { value: "municipio", label: "Por municipio" },
  { value: "created", label: "Por creación (reciente)" },
];

const AUTO_REFRESH_OPTIONS: MenuSelectOption[] = [
  { value: "0", label: "No" },
  { value: "60", label: "Cada 60 s" },
  { value: "120", label: "Cada 2 min" },
];

import "leaflet/dist/leaflet.css";
import "./map-leaflet-ccmgc.css";

const STATUS_LABEL: Record<TicketStatus, string> = {
  borrador: "Pendiente de completar",
  abierto: "Abierto",
  en_proceso: "En Proceso",
  esperando_repuesto: "Esperando repuesto",
  resuelto: "Resuelto",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

const SCOPE_LABEL: Record<TicketScopeFilter, string> = {
  activos: "En curso",
  resueltos: "Resueltos",
  todos: "Todos",
};

const MAP_SCOPE_OPTIONS: TicketScopeFilter[] = ["activos", "resueltos", "todos"];

const MAP_STORAGE_KEY = "ccmgc_map_filters_v1";
const MAP_PRESETS_KEY = "ccmgc_map_presets_v1";

type MapFilterPreset = {
  name: string;
  scope: TicketScopeFilter;
  status: TicketStatus | "todos";
  priority: TicketPriority | "todos";
  operator: string;
  busId: string;
  partCode: string;
  urgentOnly: boolean;
  createdAfter: string;
  createdBefore: string;
};

function AsideSection({
  title,
  children,
  defaultOpen = true,
  className,
  bodyClassName,
  variant = "default",
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Clases del cuerpo bajo el summary (p. ej. flex-1 min-h-0 para secciones que ocupan alto). */
  bodyClassName?: string;
  variant?: "default" | "flat";
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        variant === "flat"
          ? "mapa-options-section group border-b border-[var(--color-border)]/55 pb-3 last:border-b-0 last:pb-0"
          : "group rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/18 p-3",
        className,
      )}
    >
      <summary
        className={cn(
          "flex shrink-0 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden",
          variant === "flat"
            ? "py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)]"
            : "text-label text-[var(--color-text-2)]",
        )}
      >
        <span>{title}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[var(--color-text-3)] transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className={cn(variant === "flat" ? "pt-1" : "mt-3", bodyClassName)}>{children}</div>
    </details>
  );
}

function MapScopeToggle({
  scope,
  onChange,
  size = "default",
}: {
  scope: TicketScopeFilter;
  onChange: (scope: TicketScopeFilter) => void;
  size?: "default" | "muro";
}) {
  return (
    <div
      className={cn(
        "flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-0.5",
        size === "muro" && "lg:gap-2 lg:rounded-xl lg:p-1",
      )}
      role="group"
      aria-label="Ámbito de tickets en el mapa"
    >
      {MAP_SCOPE_OPTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          aria-pressed={scope === s}
          className={cn(
            "min-h-8 flex-1 rounded-md px-2 text-[11px] font-semibold transition-colors",
            scope === s
              ? "segmented-pill--active"
              : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]",
            size === "muro" &&
              "lg:min-h-14 lg:rounded-lg lg:px-4 lg:text-xl lg:font-bold min-[2200px]:lg:min-h-[4.5rem] min-[2200px]:lg:text-2xl",
          )}
        >
          {SCOPE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
const PART_DEBOUNCE_MS = 380;
const URL_DEBOUNCE_MS = 320;

const GRAN_CANARIA_HERO_PATH =
  "M 84.36,0 L 82.38,2.24 L 80.89,2.5 L 80.37,4.21 L 82.38,5.48 L 82.61,7.97 L 79.63,11.44 L 75.15,12.67 L 72.92,9.95 L 71.65,10.44 L 69.42,8.2 L 68.45,8.46 L 65.95,7.19 L 65.43,7.97 L 63.2,5.7 L 61.96,5.96 L 61.48,6.71 L 60.73,6.45 L 60.73,6.97 L 58.98,7.71 L 56.49,7.71 L 52.24,8.2 L 50.52,7.45 L 48.03,8.2 L 46.54,6.97 L 45.27,7.45 L 44.53,5.96 L 43.78,5.96 L 43.04,4.73 L 43.3,3.99 L 41.81,2.24 L 41.55,2.72 L 40.54,1.72 L 39.31,2.5 L 38.31,3.47 L 37.33,3.24 L 34.09,4.73 L 31.6,3.99 L 31.11,1.98 L 29.85,1.98 L 29.1,3.24 L 27.61,3.73 L 25.86,2.98 L 26.12,4.47 L 28.36,6.22 L 26.87,8.46 L 27.61,8.94 L 27.87,10.69 L 26.61,11.18 L 25.86,13.42 L 26.12,13.68 L 26.61,14.19 L 26.12,14.19 L 26.38,16.43 L 25.12,17.18 L 26.12,18.89 L 25.38,21.65 L 23.4,24.89 L 20.64,26.38 L 19.9,28.62 L 18.89,29.1 L 18.15,29.62 L 13.94,30.85 L 13.68,32.6 L 12.67,33.83 L 8.69,36.82 L 5.96,37.56 L 4.21,37.07 L 2.46,37.82 L 3.47,39.83 L 2.24,43.82 L 1.49,44.3 L 1.49,45.53 L 0,48.03 L 1.23,53.76 L 0,59.99 L 0.23,61.96 L 3.24,65.69 L 6.97,73.66 L 9.2,79.14 L 10.95,80.4 L 12.19,82.12 L 13.19,83.13 L 16.43,84.13 L 16.92,85.36 L 17.92,85.62 L 19.41,87.86 L 21.13,87.86 L 21.39,88.86 L 22.65,89.61 L 22.39,90.35 L 24.14,91.58 L 24.63,90.84 L 24.89,91.58 L 25.38,91.33 L 25.12,91.84 L 27.13,93.33 L 27.35,94.34 L 28.13,93.59 L 29.36,94.08 L 30.85,96.8 L 30.59,97.81 L 31.34,97.55 L 32.83,99.3 L 32.83,98.55 L 33.57,97.81 L 35.58,97.32 L 37.82,98.55 L 42.07,100.3 L 43.78,99.3 L 47.28,102.28 L 52.01,102.8 L 53.76,102.05 L 54.74,97.32 L 56.23,96.32 L 61.48,94.57 L 63.94,92.1 L 66.44,92.1 L 70.42,89.35 L 80.14,87.86 L 83.13,86.63 L 84.62,84.13 L 84.1,82.64 L 85.1,78.39 L 86.11,76.9 L 86.37,76.9 L 86.85,76.64 L 87.86,76.64 L 89.09,74.67 L 90.84,75.15 L 91.84,74.41 L 91.58,71.43 L 92.82,70.2 L 91.84,70.42 L 91.1,69.45 L 90.09,66.7 L 90.84,65.46 L 91.58,64.2 L 91.84,60.47 L 92.33,57.98 L 94.57,56.49 L 97.06,57.98 L 97.29,56.75 L 95.31,55.74 L 95.31,54.25 L 93.08,53.51 L 92.82,52.76 L 93.56,52.27 L 92.59,51.53 L 93.33,50.26 L 93.08,49.78 L 92.33,49.78 L 92.33,48.03 L 92.82,47.02 L 93.82,47.28 L 93.33,45.31 L 95.57,43.56 L 95.05,42.29 L 94.08,42.07 L 94.31,41.06 L 93.82,40.32 L 94.31,39.31 L 92.07,37.82 L 91.58,34.84 L 89.83,34.09 L 86.85,32.12 L 85.85,30.59 L 86.11,29.36 L 84.88,27.13 L 86.37,23.88 L 85.62,21.91 L 86.59,17.92 L 84.62,13.68 L 84.1,13.42 L 83.87,13.19 L 82.87,11.7 L 83.87,10.44 L 83.87,10.21 L 82.87,10.21 L 83.35,8.94 L 83.35,7.71 L 84.1,8.72 L 84.1,7.71 L 84.62,7.71 L 85.85,7.71 L 86.85,6.71 L 87.34,4.73 L 87.6,9.69 L 87.86,3.73 L 88.83,3.47 L 87.86,3.24 L 88.34,1.72 L 87.6,0.49 L 84.36,0 Z";

function MapHeroBandejaCta({ href }: { href: string }) {
  return (
    <Link href={href} className="ccmgc-module-cta ccmgc-module-cta--secondary group">
      <span className="ccmgc-module-cta__icon" aria-hidden>
        <Inbox size={16} strokeWidth={2} />
      </span>
      <span className="ccmgc-module-cta__body">
        <span className="ccmgc-module-cta__label">Ir a bandeja</span>
        <span className="ccmgc-module-cta__hint">Listado operativo en vivo</span>
      </span>
      <span className="ccmgc-module-cta__arrow" aria-hidden>
        <ArrowRight size={14} strokeWidth={2.2} />
      </span>
    </Link>
  );
}

function MapHeroKpiStrip({
  urgentCount,
  mapCount,
  listCount,
  listFiltered,
  className,
}: {
  urgentCount: number;
  mapCount: number;
  listCount: number;
  listFiltered?: boolean;
  className?: string;
}) {
  const items: { value: number; label: string; tone: KpiTone; pulse?: boolean; title?: string }[] = [
    ...(urgentCount > 0
      ? [
          {
            value: urgentCount,
            label: "SLA",
            tone: "error" as const,
            pulse: true,
            title: "Tickets fuera de SLA visibles en el mapa",
          },
        ]
      : []),
    {
      value: mapCount,
      label: "Mapa",
      tone: "accent",
      title: "Tickets visibles en el mapa",
    },
    {
      value: listCount,
      label: listFiltered ? "Lista*" : "Lista",
      tone: "success",
      title: listFiltered ? "Tickets en la lista filtrada (búsqueda activa)" : "Tickets en la lista filtrada",
    },
  ];

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3", className)}
      aria-label="Indicadores del mapa"
    >
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 ? (
            <span className="hidden h-3 w-px shrink-0 bg-[var(--color-border)]/50 sm:inline" aria-hidden />
          ) : null}
          <span
            className={cn(
              "inline-flex items-baseline gap-1 whitespace-nowrap",
              item.pulse && "animate-pulse",
            )}
            title={item.title ?? `${item.value} ${item.label}`}
          >
            <span
              className={cn(
                "text-[13px] font-bold tabular-nums leading-none sm:text-sm",
                item.value === 0 ? "text-[var(--color-text-3)]" : kpiToneValueClass(item.tone),
              )}
            >
              {item.value}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              {item.label}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

type MapApiResponse = {
  center: [number, number];
  bounds: [[number, number], [number, number]];
  features: MapTicketFeature[];
  fetchedAt: string;
};

type CatalogBus = { id: string; operator: string; municipio: string };

type MapContextResponse = {
  warehouses: { id: string; name: string; municipio: string; lat: number; lng: number; meta: string }[];
  preventives: { id: string; name: string; municipio: string; busId: string; lat: number; lng: number; status: string }[];
};

type SortKey = "sla" | "created" | "title" | "municipio";

function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(id);
    };
  }, [map]);
  return null;
}

/** Evita que Leaflet robe foco/scroll al hacer clic en el mapa. */
function MapPreventFocusScroll() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute("tabindex", "-1");
    container.style.outline = "none";
    if (map.keyboard?.enabled?.()) {
      map.keyboard.disable();
    }
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
    };
    container.addEventListener("mousedown", onMouseDown);
    return () => container.removeEventListener("mousedown", onMouseDown);
  }, [map]);

  useMapEvents({
    click() {
      map.getContainer().blur();
      const main = document.getElementById("main-content");
      const y = main?.scrollTop ?? window.scrollY;
      const x = main?.scrollLeft ?? window.scrollX;
      requestAnimationFrame(() => {
        if (main) {
          main.scrollTop = y;
          main.scrollLeft = x;
        } else {
          window.scrollTo(x, y);
        }
      });
    },
  });

  return null;
}

function scrollListItemIntoView(listEl: HTMLElement, itemEl: HTMLElement) {
  const itemTop = itemEl.offsetTop;
  const itemBottom = itemTop + itemEl.offsetHeight;
  const viewTop = listEl.scrollTop;
  const viewBottom = viewTop + listEl.clientHeight;
  if (itemTop < viewTop) {
    listEl.scrollTo({ top: itemTop, behavior: "smooth" });
  } else if (itemBottom > viewBottom) {
    listEl.scrollTo({ top: itemBottom - listEl.clientHeight, behavior: "smooth" });
  }
}

/** Leaflet calcula mal el ancho si el panel cambia (Enfoque / móvil) sin un resize. */
function MapLayoutInvalidate({ layoutKey }: { layoutKey: string }) {
  const map = useMap();
  useEffect(() => {
    const run = () => map.invalidateSize({ animate: false });
    const id = requestAnimationFrame(run);
    const t = window.setTimeout(run, 160);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [map, layoutKey]);
  return null;
}

const ISLAND_CORE_BOUNDS = L.latLngBounds(GRAN_CANARIA_BOUNDS);
/** Océano alrededor del rectángulo mínimo: el clamp se siente menos “cajón” y reduce saltos al activarse. */
const ISLAND_CLAMP_BOUNDS = ISLAND_CORE_BOUNDS.pad(0.32);
/** Límites “mundiales” suaves: desactiva el clamp de isla sin dejar `maxBounds` inválido. */
const WORLD_SOFT_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));

/**
 * - Zoom alejado: si el viewport es más ancho/alto que el rectángulo de clamp, `maxBounds` estricto rompe el pan;
 *   en ese caso usamos límites mundiales.
 * - Zoom intermedio (~escala 3 km): sin histérisis, alternar modos recoloca la vista (“centra la isla”) y el
 *   rectángulo mínimo se nota como jaula. Entramos al clamp solo cuando el encuadre queda claramente dentro
 *   (ratio bajo) y salimos antes de rozar el borde (ratio alto), y solo llamamos `setMaxBounds` al cambiar.
 */
function MapIslandMaxBoundsWhenFitting() {
  const map = useMap();
  const islandClampActiveRef = useRef(false);

  const apply = useCallback(() => {
    const vb = map.getBounds();
    const vh = vb.getNorth() - vb.getSouth();
    const vw = vb.getEast() - vb.getWest();
    const mb = ISLAND_CLAMP_BOUNDS;
    const mh = mb.getNorth() - mb.getSouth();
    const mw = mb.getEast() - mb.getWest();

    const physicallyWontFit = vh >= mh - 1e-6 || vw >= mw - 1e-6;
    if (physicallyWontFit) {
      islandClampActiveRef.current = false;
      const cur = map.options.maxBounds;
      if (!cur || !WORLD_SOFT_BOUNDS.equals(cur)) {
        map.setMaxBounds(WORLD_SOFT_BOUNDS);
      }
      return;
    }

    let useIslandClamp: boolean;
    if (islandClampActiveRef.current) {
      const exitIsland = vh >= mh * 0.94 || vw >= mw * 0.94;
      if (exitIsland) islandClampActiveRef.current = false;
      useIslandClamp = islandClampActiveRef.current;
    } else {
      const enterIsland = vh <= mh * 0.8 && vw <= mw * 0.8;
      if (enterIsland) islandClampActiveRef.current = true;
      useIslandClamp = islandClampActiveRef.current;
    }

    const target = useIslandClamp ? mb : WORLD_SOFT_BOUNDS;
    const cur = map.options.maxBounds;
    if (cur && target.equals(cur)) return;
    map.setMaxBounds(target);
  }, [map]);

  useEffect(() => {
    apply();
    map.on("zoomend", apply);
    map.on("resize", apply);
    return () => {
      map.off("zoomend", apply);
      map.off("resize", apply);
    };
  }, [map, apply]);

  return null;
}

/**
 * Centra la vista solo al cambiar el ticket seleccionado.
 * - No resetea el “último vuelo” si faltan coords un instante (refresco API), para no disparar otro flyTo al mismo id.
 * - Conserva el zoom actual del usuario (no fuerza nivel 13), solo desplaza el centro.
 */
function MapFlyTo({
  targetId,
  lat,
  lng,
}: {
  targetId: string | null;
  lat: number | null;
  lng: number | null;
}) {
  const map = useMap();
  const lastFlownTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetId) {
      lastFlownTargetRef.current = null;
      return;
    }
    if (lat == null || lng == null) {
      return;
    }
    if (lastFlownTargetRef.current === targetId) return;
    lastFlownTargetRef.current = targetId;
    const z = map.getZoom();
    map.flyTo([lat, lng], z, { duration: 0.45, animate: true });
  }, [targetId, lat, lng, map]);
  return null;
}

function MapLeafletScale() {
  return <ScaleControl position="bottomleft" imperial={false} metric />;
}

/** Texto compacto: el contenedor del mapa no debe heredar un ancho “columna” enorme (absolute + stretch). */
const MAP_TOOL_BTN =
  "!min-h-9 max-w-[11.5rem] shrink-0 justify-start border border-[var(--color-border)] bg-[var(--color-surface)]/92 px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-[var(--color-text-1)] shadow-[0_4px_16px_rgba(0,0,0,0.35)] backdrop-blur-md hover:bg-[var(--color-surface-2)]/95 hover:text-[var(--color-text-1)] disabled:opacity-45 sm:max-w-[13rem]";

function MapToolbarControls({
  features,
  mapShellRef,
  selectedId,
  wallMode = false,
}: {
  features: MapTicketFeature[];
  mapShellRef: RefObject<HTMLElement | null>;
  selectedId: string | null;
  /** Videowall: controles un poco más grandes para lectura a distancia. */
  wallMode?: boolean;
}) {
  const map = useMap();
  const toggleFs = () => {
    const el = mapShellRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  };
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[500] flex w-max max-w-[calc(100%-1rem)] flex-col items-end gap-2">
      <div className="pointer-events-auto flex w-max flex-col items-stretch gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn(
            MAP_TOOL_BTN,
            "gap-1.5",
            wallMode &&
              "lg:!min-h-16 lg:!max-w-[34rem] lg:!px-5 lg:!py-3 lg:!text-xl min-[2200px]:!min-h-[4.25rem] min-[2200px]:!text-2xl min-[2200px]:!max-w-[40rem]",
          )}
          disabled={!features.length}
          onClick={() => {
            const latlngs = features.map((f) => L.latLng(f.lat, f.lng));
            map.fitBounds(L.latLngBounds(latlngs), { padding: [36, 36], maxZoom: 14 });
          }}
          title="Encuadrar todos los tickets visibles"
        >
          <span className="hidden min-[420px]:inline">Ajustar vista</span>
          <span className="min-[420px]:hidden" aria-hidden>
            ⊞
          </span>
          <span className="sr-only min-[420px]:hidden">Ajustar vista (todos)</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn(
            MAP_TOOL_BTN,
            "gap-1.5",
            wallMode &&
              "lg:!min-h-16 lg:!max-w-[34rem] lg:!px-5 lg:!py-3 lg:!text-xl min-[2200px]:!min-h-[4.25rem] min-[2200px]:!text-2xl min-[2200px]:!max-w-[40rem]",
          )}
          disabled={!selectedId}
          onClick={() => {
            const f = features.find((x) => x.id === selectedId);
            if (!f) return;
            map.setView([f.lat, f.lng], Math.max(map.getZoom(), 14), { animate: true });
          }}
          title="Encuadrar solo el ticket seleccionado"
        >
          <span className="hidden min-[420px]:inline">Solo selección</span>
          <span className="min-[420px]:hidden" aria-hidden>
            ⊡
          </span>
          <span className="sr-only min-[420px]:hidden">Solo selección</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn(
            MAP_TOOL_BTN,
            "gap-1.5",
            wallMode &&
              "lg:!min-h-16 lg:!max-w-[34rem] lg:!px-5 lg:!py-3 lg:!text-xl min-[2200px]:!min-h-[4.25rem] min-[2200px]:!text-2xl min-[2200px]:!max-w-[40rem]",
          )}
          onClick={() => map.flyTo(GRAN_CANARIA_CENTER, 11, { duration: 0.45 })}
          title="Vista general de la isla"
        >
          <span className="hidden min-[420px]:inline">Vista isla</span>
          <span className="min-[420px]:hidden" aria-hidden>
            ◎
          </span>
          <span className="sr-only min-[420px]:hidden">Vista isla</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn(
            MAP_TOOL_BTN,
            "gap-1.5",
            wallMode &&
              "lg:!min-h-16 lg:!max-w-[34rem] lg:!px-5 lg:!py-3 lg:!text-xl min-[2200px]:!min-h-[4.25rem] min-[2200px]:!text-2xl min-[2200px]:!max-w-[40rem]",
          )}
          onClick={toggleFs}
          title="Pantalla completa del mapa"
        >
          <Maximize2 size={14} aria-hidden />
          <span className="hidden min-[420px]:inline">Pantalla completa</span>
        </Button>
        <MapExportPngButton mapShellRef={mapShellRef} wallMode={wallMode} />
      </div>
    </div>
  );
}

function MapExportPngButton({
  mapShellRef,
  wallMode = false,
}: {
  mapShellRef: RefObject<HTMLElement | null>;
  wallMode?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={cn(
        MAP_TOOL_BTN,
        "gap-1.5",
        wallMode &&
          "lg:!min-h-16 lg:!max-w-[34rem] lg:!px-5 lg:!py-3 lg:!text-xl min-[2200px]:!min-h-[4.25rem] min-[2200px]:!text-2xl min-[2200px]:!max-w-[40rem]",
      )}
      disabled={busy}
      title="Descargar captura del mapa (PNG)"
      onClick={async () => {
        const el = mapShellRef.current;
        if (!el) return;
        setBusy(true);
        try {
          const { toPng } = await import("html-to-image");
          const dataUrl = await toPng(el, {
            pixelRatio: 2,
            cacheBust: true,
            backgroundColor: "#0a1628",
          });
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `mapa-ccmgc-${new Date().toISOString().slice(0, 10)}.png`;
          a.click();
        } catch {
          /* ignore */
        } finally {
          setBusy(false);
        }
      }}
    >
      <ImageDown size={14} aria-hidden />
      <span className="hidden min-[420px]:inline">{busy ? "Exportando…" : "PNG"}</span>
    </Button>
  );
}

function buildTicketsHref(qs: URLSearchParams): string {
  const p = new URLSearchParams();
  const st = qs.get("status");
  if (st && st !== "todos") p.set("status", st);
  const op = qs.get("operator");
  if (op && op !== "todas") p.set("operator", op);
  const bus = qs.get("busId");
  if (bus && bus !== "todas") p.set("busId", bus);
  const part = qs.get("partCode");
  if (part) p.set("partCode", part);
  const pri = qs.get("priority");
  if (pri && pri !== "todos") p.set("priority", pri);
  const s = p.toString();
  // /bandeja desde junio 2026 (la bandeja vive ahora como pagina propia
  // del sidebar; /tickets quedo para la gestion/preventivo).
  return s ? `/bandeja?${s}` : "/bandeja";
}

type MapMuroTicketPayload = {
  id: string;
  busId: string;
  assetId: string;
  assetType: string;
  tipo: string | null;
  subtipo: string | null;
  subsubtipo: string | null;
  dominio: string | null;
  nivelImpacto: string | null;
  origenTecnico: string | null;
  observaciones: string | null;
  operator: string;
  municipio: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  slaDeadline: string;
  assignedToUserName: string | null;
  createdAt: string;
  updatedAt: string;
  comments: { id: string; author: string; body: string; createdAt: string }[];
  attachments: {
    id: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    downloadUrl: string | null;
  }[];
};

type MapMuroDetailLoadState =
  | { phase: "empty" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ok"; ticket: MapMuroTicketPayload };

function formatTicketShortId(id: string) {
  return id.slice(-8).toUpperCase();
}

function MapaMuroTicketDetailPanel({
  loadState,
  selectedId,
  onClose,
}: {
  loadState: MapMuroDetailLoadState;
  selectedId: string | null;
  onClose: () => void;
}) {
  const inner = (() => {
    if (!selectedId) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center lg:gap-8 lg:p-12">
          <p className="text-2xl font-extrabold leading-snug text-[var(--color-text-1)] lg:text-4xl min-[2200px]:lg:text-5xl">
            Detalle de incidencia
          </p>
          <p className="max-w-lg text-pretty text-xl font-semibold leading-relaxed text-[var(--color-text-2)] lg:max-w-2xl lg:text-3xl lg:leading-relaxed min-[2200px]:lg:text-4xl">
            Pulsa un marcador en el mapa o una fila en la bandeja de la izquierda. El detalle se muestra aquí sin salir
            del modo muro.
          </p>
        </div>
      );
    }
    if (loadState.phase === "loading" || (loadState.phase === "empty" && selectedId)) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent lg:h-12 lg:w-12"
            aria-hidden
          />
          <p className="text-xl font-semibold text-[var(--color-text-2)] lg:text-3xl min-[2200px]:lg:text-4xl">
            Cargando ticket…
          </p>
        </div>
      );
    }
    if (loadState.phase === "error") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-xl font-bold text-[var(--color-error)] lg:text-3xl min-[2200px]:lg:text-4xl">{loadState.message}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="lg:!min-h-16 lg:!px-8 lg:!text-xl lg:!font-bold min-[2200px]:lg:!text-2xl"
            onClick={onClose}
          >
            Cerrar panel
          </Button>
        </div>
      );
    }
    if (loadState.phase !== "ok") {
      return null;
    }
    const ticket = loadState.ticket;
    const slaMinsRemaining = Math.round((new Date(ticket.slaDeadline).getTime() - Date.now()) / 60000);
    const slaLabel =
      slaMinsRemaining < 0
        ? `Vencido · hace ${formatSlaOverdueLabel(slaMinsRemaining)}`
        : `Quedan ${formatSlaOverdueLabel(-slaMinsRemaining)}`;

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2 lg:gap-5 lg:p-3">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4 lg:pb-5">
          <div className="min-w-0 flex-1 space-y-3">
            <p className="font-mono text-base font-bold text-[var(--color-text-2)] lg:text-xl min-[2200px]:lg:text-2xl">
              {formatTicketShortId(ticket.id)}
            </p>
            <h3 className="text-3xl font-extrabold leading-tight tracking-tight text-[var(--color-text-1)] lg:text-5xl lg:leading-snug min-[2200px]:lg:text-6xl">
              {ticket.title}
            </h3>
            <div className="flex flex-wrap gap-2 lg:gap-4">
              <Badge
                variant={ticketStatusBadgeVariant(ticket.status)}
                className={cn(
                  "!px-4 !py-1.5 text-base font-bold lg:!px-5 lg:!py-2 lg:text-lg min-[2200px]:lg:!text-xl",
                  ticketStatusBadgeClassName(ticket.status),
                )}
              >
                {STATUS_LABEL[ticket.status]}
              </Badge>
              <Badge
                variant={priorityBadgeProps(ticket.priority).variant}
                className={cn(
                  "!px-4 !py-1.5 text-base font-bold lg:!px-5 lg:!py-2 lg:text-lg min-[2200px]:lg:!text-xl",
                  priorityBadgeProps(ticket.priority).className,
                )}
              >
                {PRIORITY_LABEL[ticket.priority]}
              </Badge>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 lg:!min-h-16 lg:!w-16 lg:!p-0"
            onClick={onClose}
            title="Cerrar detalle"
            aria-label="Cerrar detalle"
          >
            <X size={28} aria-hidden />
          </Button>
        </div>

        <dl className="grid gap-4 text-lg text-[var(--color-text-2)] lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4 lg:text-xl min-[2200px]:lg:gap-y-5 min-[2200px]:lg:text-2xl">
          <div className="lg:col-span-2">
            <dt className="text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              SLA
            </dt>
            <dd
              className={cn(
                "mt-2 text-xl font-extrabold lg:text-2xl min-[2200px]:lg:text-3xl",
                slaMinsRemaining < 0 ? "text-[var(--color-error)]" : "text-[var(--color-text-1)]",
              )}
            >
              {slaLabel}
            </dd>
            <dd className="mt-2 text-base font-medium text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              Límite: {new Date(ticket.slaDeadline).toLocaleString("es-ES")}
            </dd>
          </div>
          <div>
            <dt className="text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              Bus
            </dt>
            <dd className="mt-2 font-extrabold text-[var(--color-text-1)]">{ticket.busId}</dd>
          </div>
          <div>
            <dt className="text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              Operadora
            </dt>
            <dd className="mt-2 font-extrabold text-[var(--color-text-1)]">{ticket.operator}</dd>
          </div>
          <div className="lg:col-span-2">
            <dt className="text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              Municipio / lugar
            </dt>
            <dd className="mt-2 font-extrabold text-[var(--color-text-1)]">{ticket.municipio}</dd>
          </div>
          <div>
            <dt className="text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              Activo
            </dt>
            <dd className="mt-2 font-extrabold text-[var(--color-text-1)]">
              {ticket.assetType} ·{" "}
              <span className="font-mono text-base font-bold text-[var(--color-text-2)] lg:text-lg min-[2200px]:lg:text-xl">
                {ticket.assetId}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              Asignado
            </dt>
            <dd className="mt-2 font-extrabold text-[var(--color-text-1)]">{ticket.assignedToUserName ?? "Sin asignar"}</dd>
          </div>
          <div className="lg:col-span-2">
            <dt className="text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              Clasificación
            </dt>
            <dd className="mt-2 font-semibold text-[var(--color-text-1)]">
              {[ticket.tipo, ticket.subtipo, ticket.subsubtipo].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
          {ticket.observaciones?.trim() ? (
            <div className="lg:col-span-2">
              <dt className="text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
                Observaciones
              </dt>
              <dd className="mt-2 whitespace-pre-wrap rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4 font-medium text-[var(--color-text-1)] lg:p-5 lg:text-xl lg:leading-relaxed min-[2200px]:lg:text-2xl">
                {ticket.observaciones}
              </dd>
            </div>
          ) : null}
        </dl>

        <div>
          <p className="mb-3 text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:mb-4 lg:text-lg min-[2200px]:lg:text-xl">
            Descripción
          </p>
          <div className="max-h-[min(40vh,28rem)] overflow-y-auto whitespace-pre-wrap rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface-2)]/30 p-4 text-lg font-medium leading-relaxed text-[var(--color-text-1)] lg:max-h-[min(45vh,40rem)] lg:p-6 lg:text-xl lg:leading-relaxed min-[2200px]:lg:p-7 min-[2200px]:lg:text-2xl min-[2200px]:lg:leading-relaxed">
            {ticket.description}
          </div>
        </div>

        {ticket.comments.length ? (
          <div>
            <p className="mb-4 text-base font-extrabold uppercase tracking-wide text-[var(--color-text-2)] lg:mb-5 lg:text-xl min-[2200px]:lg:text-2xl">
              Comentarios recientes ({ticket.comments.length})
            </p>
            <ul className="space-y-4">
              {ticket.comments.slice(0, 10).map((c: MapMuroTicketPayload["comments"][number]) => (
                <li
                  key={c.id}
                  className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface-2)]/25 p-4 lg:p-5"
                >
                  <p className="text-base font-bold text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
                    {c.author} · {new Date(c.createdAt).toLocaleString("es-ES")}
                  </p>
                  <p className="mt-3 line-clamp-6 text-lg font-medium text-[var(--color-text-1)] lg:text-xl min-[2200px]:lg:text-2xl">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ticket.attachments.length ? (
          <div>
            <p className="mb-3 text-base font-bold uppercase tracking-wide text-[var(--color-text-3)] lg:text-lg min-[2200px]:lg:text-xl">
              Adjuntos
            </p>
            <ul className="space-y-3 text-lg font-semibold lg:text-xl min-[2200px]:lg:text-2xl">
              {ticket.attachments.map((a: MapMuroTicketPayload["attachments"][number]) => (
                <li key={a.id}>
                  {a.downloadUrl ? (
                    <a
                      href={a.downloadUrl}
                      className="text-[var(--color-accent)] underline-offset-2 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {a.fileName}
                    </a>
                  ) : (
                    <span className="text-[var(--color-text-2)]">{a.fileName}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-3 border-t border-[var(--color-border)] pt-4 lg:pt-5">
          <Link
            href={`/tickets/${ticket.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-accent-light)] px-6 py-3 text-lg font-bold text-[var(--color-text-1)] transition-colors hover:bg-[var(--color-surface-2)] lg:min-h-16 lg:gap-3 lg:px-9 lg:text-xl min-[2200px]:lg:min-h-[4.5rem] min-[2200px]:lg:text-2xl"
          >
            <ExternalLink size={20} className="lg:size-6 min-[2200px]:lg:size-7" aria-hidden />
            Ficha completa (nueva pestaña)
          </Link>
        </div>
      </div>
    );
  })();

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] lg:p-6",
        "lg:max-h-[min(calc(100dvh-2rem),2160px)] lg:min-w-[440px] lg:w-[min(38vw,1580px)] lg:max-w-[min(38vw,1580px)] lg:shrink-0",
        "font-medium text-[clamp(1.2rem,min(0.28vw+0.85rem),2.35rem)] leading-relaxed antialiased lg:leading-relaxed min-[2200px]:lg:text-[clamp(1.35rem,min(0.26vw+1rem),2.65rem)]",
      )}
      aria-label="Detalle del ticket (modo muro)"
    >
      {inner}
    </aside>
  );
}

export function MapaView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketFromUrl = searchParams.get("ticket");
  /** Muro / videowall: `?muro=1` — el layout quita sidebar y cabecera de app; aquí solo mapa + bandeja (sin tocar el modo Enfoque del uso normal). */
  const mapaMuro = searchParams.get("muro") === "1";

  const [status, setStatus] = useState<TicketStatus | "todos">("todos");
  const [scope, setScope] = useState<TicketScopeFilter>("activos");
  const [priority, setPriority] = useState<TicketPriority | "todos">("todos");
  const [operator, setOperator] = useState<"todas" | string>("todas");
  const [busId, setBusId] = useState<"todas" | string>("todas");
  const [partCodeInput, setPartCodeInput] = useState("");
  const [partCodeDebounced, setPartCodeDebounced] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [soloCriticos, setSoloCriticos] = useState(false);
  const [createdAfter, setCreatedAfter] = useState("");
  const [createdBefore, setCreatedBefore] = useState("");
  const [listSearch, setListSearch] = useState("");
  const deferredListSearch = useDeferredValue(listSearch.trim().toLowerCase());
  const [sortKey, setSortKey] = useState<SortKey>("sla");
  const [legendOpen, setLegendOpen] = useState(false);
  const [showWarehouses, setShowWarehouses] = useState(false);
  const [showPreventives, setShowPreventives] = useState(false);
  const [autoRefreshSec, setAutoRefreshSec] = useState(0);
  const [hydratedUrl, setHydratedUrl] = useState(false);
  const [actorUserId, setActorUserId] = useState("");
  const [actorRole, setActorRole] = useState<UserRole>("conductor");
  const [muroTicketDetail, setMuroTicketDetail] = useState<MapMuroDetailLoadState>({ phase: "empty" });

  const [catalog, setCatalog] = useState<CatalogBus[]>([]);
  const [context, setContext] = useState<MapContextResponse | null>(null);

  const [data, setData] = useState<MapApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [refreshUi, setRefreshUi] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionAnnounced, setSelectionAnnounced] = useState("");
  const [highlightTicketId, setHighlightTicketId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"panel" | "map">("panel");
  const [filtersMenuOpen, setFiltersMenuOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [overlayLabels, setOverlayLabels] = useState(false);
  const [mapTileOpacity, setMapTileOpacity] = useState(100);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mapPresets, setMapPresets] = useState<MapFilterPreset[]>([]);

  const listItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listSearchRef = useRef<HTMLInputElement>(null);
  const mapShellRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const operators = useMemo(() => Array.from(new Set(catalog.map((b) => b.operator))).sort(), [catalog]);

  const operatorMenuOptions = useMemo<MenuSelectOption[]>(
    () => [{ value: "todas", label: "Todas" }, ...operators.map((op) => ({ value: op, label: op }))],
    [operators],
  );
  const busMenuOptions = useMemo<MenuSelectOption[]>(
    () => [
      { value: "todas", label: "Todos" },
      ...catalog.map((b) => ({ value: b.id, label: `${b.id} · ${b.operator}` })),
    ],
    [catalog],
  );
  const presetMenuOptions = useMemo<MenuSelectOption[]>(
    () => [{ value: "", label: "Aplicar…" }, ...mapPresets.map((p) => ({ value: p.name, label: p.name }))],
    [mapPresets],
  );

  const authFetchHeaders = useMemo(() => {
    if (!actorUserId) return undefined;
    return { "x-user-id": actorUserId, "x-user-role": actorRole };
  }, [actorUserId, actorRole]);

  const exitMuroHref = useMemo(() => {
    const t = searchParams.get("ticket");
    if (!t) return "/mapa";
    return `/mapa?ticket=${encodeURIComponent(t)}`;
  }, [searchParams]);

  useEffect(() => {
    if (!mapaMuro) {
      setMuroTicketDetail({ phase: "empty" });
      return;
    }
    if (!selectedId) {
      setMuroTicketDetail({ phase: "empty" });
      return;
    }
    const ac = new AbortController();
    setMuroTicketDetail({ phase: "loading" });
    void (async () => {
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (authFetchHeaders) {
          headers["x-user-id"] = authFetchHeaders["x-user-id"];
          headers["x-user-role"] = authFetchHeaders["x-user-role"];
        }
        const res = await fetch(`/api/tickets/${encodeURIComponent(selectedId)}`, {
          credentials: "include",
          signal: ac.signal,
          headers,
        });
        const j = (await res.json().catch(() => ({}))) as {
          message?: string;
          ticket?: MapMuroTicketPayload;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          if (!ac.signal.aborted) {
            setMuroTicketDetail({
              phase: "error",
              message: typeof j.message === "string" ? j.message : "No se pudo cargar el ticket",
            });
          }
          return;
        }
        if (!j.ticket) {
          if (!ac.signal.aborted) {
            setMuroTicketDetail({ phase: "error", message: "Respuesta invalida del servidor" });
          }
          return;
        }
        if (!ac.signal.aborted) {
          setMuroTicketDetail({ phase: "ok", ticket: j.ticket });
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        const msg = e instanceof Error ? e.message : "Error de red";
        if (msg === "The user aborted a request." || /aborted/i.test(msg)) return;
        setMuroTicketDetail({
          phase: "error",
          message: msg,
        });
      }
    })();
    return () => ac.abort();
  }, [mapaMuro, selectedId, authFetchHeaders]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          authenticated?: boolean;
          user?: { id: string; role: UserRole };
        };
        if (data.authenticated && data.user?.id) {
          setActorUserId(data.user.id);
          setActorRole(data.user.role);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (!mapaMuro) return;
    setPresentationMode(false);
    setLegendOpen(true);
  }, [mapaMuro]);

  /**
   * Videowall / lectura a distancia: sube el `rem` raíz **solo** con `?muro=1`.
   * Al salir del muro o desmontar el mapa se restaura el tamaño anterior (modo mapa normal intacto).
   */
  useEffect(() => {
    if (!mapaMuro) return undefined;
    const root = document.documentElement;
    const prevFontSize = root.style.fontSize;
    root.style.fontSize = "clamp(18px, 0.52vw + 7px, 36px)";
    root.setAttribute("data-ccmgc-muro-wall", "1");
    return () => {
      if (prevFontSize) {
        root.style.fontSize = prevFontSize;
      } else {
        root.style.removeProperty("font-size");
      }
      root.removeAttribute("data-ccmgc-muro-wall");
    };
  }, [mapaMuro]);

  useEffect(() => {
    const t = setTimeout(() => setPartCodeDebounced(partCodeInput.trim()), PART_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [partCodeInput]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MAP_PRESETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as MapFilterPreset[];
      if (Array.isArray(parsed)) setMapPresets(parsed.slice(0, 12));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-map-shortcuts]")) return;
      setShortcutsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [shortcutsOpen]);

  useEffect(() => {
    if (!filtersMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtersMenuOpen]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/catalog", { cache: "no-store", credentials: "include" });
        if (!res.ok) return;
        const j = (await res.json()) as { buses: CatalogBus[] };
        setCatalog(j.buses ?? []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/map/context", {
          cache: "no-store",
          credentials: "include",
          ...(authFetchHeaders ? { headers: authFetchHeaders } : {}),
        });
        if (!res.ok) return;
        setContext((await res.json()) as MapContextResponse);
      } catch {
        /* ignore */
      }
    })();
  }, [authFetchHeaders]);

  const buildApiQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (status !== "todos") p.set("status", status);
    else if (scope !== "todos") p.set("scope", scope);
    if (priority !== "todos") p.set("priority", priority);
    if (operator !== "todas") p.set("operator", operator);
    if (busId !== "todas") p.set("busId", busId);
    if (partCodeDebounced) p.set("partCode", partCodeDebounced);
    if (urgentOnly) p.set("urgent", "1");
    if (createdAfter.trim()) p.set("createdAfter", new Date(createdAfter).toISOString());
    if (createdBefore.trim()) p.set("createdBefore", new Date(createdBefore).toISOString());
    return p.toString();
  }, [scope, status, priority, operator, busId, partCodeDebounced, urgentOnly, createdAfter, createdBefore]);

  /** Query de página `/mapa` (filtros + ticket + opcional `muro`), alineado con el efecto que sincroniza la URL. */
  const buildMapPageSearchParams = useCallback(
    (opts: { includeMuro: boolean }) => {
      const p = new URLSearchParams();
      if (status !== "todos") p.set("status", status);
      else if (scope !== "todos") p.set("scope", scope);
      if (priority !== "todos") p.set("priority", priority);
      if (operator !== "todas") p.set("operator", operator);
      if (busId !== "todas") p.set("busId", busId);
      if (partCodeDebounced) p.set("partCode", partCodeDebounced);
      if (urgentOnly) p.set("urgent", "1");
      if (createdAfter.trim()) p.set("createdAfter", new Date(createdAfter).toISOString());
      if (createdBefore.trim()) p.set("createdBefore", new Date(createdBefore).toISOString());
      if (selectedId) p.set("ticket", selectedId);
      if (opts.includeMuro) p.set("muro", "1");
      return p;
    },
    [scope, status, priority, operator, busId, partCodeDebounced, urgentOnly, createdAfter, createdBefore, selectedId],
  );

  const handleScopeChange = useCallback((next: TicketScopeFilter) => {
    setScope(next);
    setStatus((current) => {
      if (next === "resueltos" && current !== "todos" && current !== "resuelto") return "todos";
      if (next === "activos" && current === "resuelto") return "todos";
      return current;
    });
  }, []);

  const handleStatusChange = useCallback((next: TicketStatus | "todos") => {
    setStatus(next);
    if (next === "resuelto") setScope("resueltos");
    else if (next !== "todos") setScope("activos");
  }, []);

  const granularStatusOptions = useMemo((): Array<TicketStatus | "todos"> => {
    if (scope === "resueltos") return [];
    if (scope === "activos") {
      return ["todos", "borrador", "abierto", "en_proceso", "esperando_repuesto"];
    }
    return ["todos", "borrador", "abierto", "en_proceso", "esperando_repuesto", "resuelto"];
  }, [scope]);

  const enterMuroHref = useMemo(() => {
    const p = buildMapPageSearchParams({ includeMuro: true });
    const qs = p.toString();
    return qs ? `/mapa?${qs}` : "/mapa?muro=1";
  }, [buildMapPageSearchParams]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setErrorHint(null);
    setErrorDetail(null);
    setErrorStatus(null);
    setRefreshUi("loading");
    try {
      const qs = buildApiQuery();
      const res = await fetch(`/api/map/tickets${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
        credentials: "include",
        signal: ac.signal,
        ...(authFetchHeaders ? { headers: authFetchHeaders } : {}),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string; hint?: string; detail?: string };
        setErrorStatus(res.status);
        setErrorHint(typeof j.hint === "string" ? j.hint : null);
        setErrorDetail(typeof j.detail === "string" ? j.detail : null);
        if (res.status === 401) {
          throw new Error(j.message ?? "Sesión requerida o caducada.");
        }
        throw new Error(j.message ?? "Error al cargar el mapa");
      }
      setData((await res.json()) as MapApiResponse);
      setRefreshUi("ok");
      window.setTimeout(() => setRefreshUi((x) => (x === "ok" ? "idle" : x)), 1400);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Error desconocido");
      setData(null);
      setRefreshUi("err");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [buildApiQuery, authFetchHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (autoRefreshSec <= 0) return undefined;
    const id = window.setInterval(() => void load(), autoRefreshSec * 1000);
    return () => clearInterval(id);
  }, [autoRefreshSec, load]);

  useEffect(() => {
    if (ticketFromUrl) setSelectedId(ticketFromUrl);
  }, [ticketFromUrl]);

  useEffect(() => {
    if (!data?.features.length || !selectedId) return;
    const el = listItemRefs.current.get(selectedId);
    const listEl = listScrollRef.current;
    if (el && listEl) scrollListItemIntoView(listEl, el);
  }, [selectedId, data?.features]);

  useEffect(() => {
    if (!selectedId || !data?.features.length) {
      setSelectionAnnounced("");
      return;
    }
    const t = data.features.find((x) => x.id === selectedId);
    setSelectionAnnounced(
      t ? `Seleccionado: ${t.id.slice(-8).toUpperCase()}, ${t.title}, ${STATUS_LABEL[t.status]}` : "",
    );
  }, [selectedId, data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement;
        if (t.closest("input,textarea,select")) return;
        e.preventDefault();
        listSearchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (hydratedUrl) return;
    const st = searchParams.get("status") as TicketStatus | "todos" | null;
    if (st && st !== "todos") setStatus(st);
    const sc = searchParams.get("scope") as TicketScopeFilter | null;
    if (sc === "activos" || sc === "resueltos" || sc === "todos") {
      setScope(sc);
    } else if (st === "resuelto") {
      setScope("resueltos");
    } else if (!sc) {
      setScope("activos");
    }
    const pr = searchParams.get("priority") as TicketPriority | "todos" | null;
    if (pr && pr !== "todos") setPriority(pr);
    const op = searchParams.get("operator");
    if (op) setOperator(op);
    const bus = searchParams.get("busId");
    if (bus) setBusId(bus);
    const part = searchParams.get("partCode");
    if (part) {
      setPartCodeInput(part);
      setPartCodeDebounced(part);
    }
    if (searchParams.get("urgent") === "1") setUrgentOnly(true);
    const ca = searchParams.get("createdAfter");
    if (ca) {
      const d = new Date(ca);
      if (!Number.isNaN(d.getTime())) setCreatedAfter(d.toISOString().slice(0, 10));
    }
    const cb = searchParams.get("createdBefore");
    if (cb) {
      const d = new Date(cb);
      if (!Number.isNaN(d.getTime())) setCreatedBefore(d.toISOString().slice(0, 10));
    }
    setHydratedUrl(true);
    try {
      const raw = localStorage.getItem(MAP_STORAGE_KEY);
      if (raw) {
        const j = JSON.parse(raw) as Partial<{
          scope: TicketScopeFilter;
          sortKey: SortKey;
          autoRefreshSec: number;
          showWarehouses: boolean;
          showPreventives: boolean;
        }>;
        if (j.scope === "activos" || j.scope === "resueltos" || j.scope === "todos") setScope(j.scope);
        if (j.sortKey) setSortKey(j.sortKey);
        if (typeof j.autoRefreshSec === "number") setAutoRefreshSec(j.autoRefreshSec);
        if (typeof j.showWarehouses === "boolean") setShowWarehouses(j.showWarehouses);
        if (typeof j.showPreventives === "boolean") setShowPreventives(j.showPreventives);
      }
    } catch {
      /* ignore */
    }
  }, [hydratedUrl, searchParams]);

  useEffect(() => {
    if (!hydratedUrl) return;
    try {
      localStorage.setItem(
        MAP_STORAGE_KEY,
        JSON.stringify({ scope, sortKey, autoRefreshSec, showWarehouses, showPreventives }),
      );
    } catch {
      /* ignore */
    }
  }, [scope, sortKey, autoRefreshSec, showWarehouses, showPreventives, hydratedUrl]);

  useEffect(() => {
    if (!hydratedUrl) return;
    if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    urlTimerRef.current = setTimeout(() => {
      const p = buildMapPageSearchParams({ includeMuro: mapaMuro });
      const qs = p.toString();
      router.replace(qs ? `/mapa?${qs}` : mapaMuro ? "/mapa?muro=1" : "/mapa", { scroll: false });
    }, URL_DEBOUNCE_MS);
    return () => {
      if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    };
  }, [router, hydratedUrl, mapaMuro, buildMapPageSearchParams]);

  const flyTargetId = selectedId ?? ticketFromUrl ?? null;

  const flyLatLng = useMemo(() => {
    if (!data?.features.length) return { lat: null as number | null, lng: null as number | null };
    if (!flyTargetId) return { lat: null, lng: null };
    const f = data.features.find((x) => x.id === flyTargetId);
    return f ? { lat: f.lat, lng: f.lng } : { lat: null, lng: null };
  }, [data, flyTargetId]);

  const effectiveFeatures = useMemo(() => {
    const base = data?.features ?? [];
    if (!mapaMuro || !soloCriticos) return base;
    const now = Date.now();
    return base.filter(
      (f) => f.priority === "alta" || new Date(f.slaDeadline).getTime() < now,
    );
  }, [data?.features, mapaMuro, soloCriticos]);

  const sortedFilteredList = useMemo(() => {
    if (!effectiveFeatures.length) return [];
    let list = [...effectiveFeatures];
    if (deferredListSearch) {
      list = list.filter((f) => {
        const q = deferredListSearch;
        return (
          f.title.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          f.busId.toLowerCase().includes(q) ||
          f.municipio.toLowerCase().includes(q) ||
          f.operator.toLowerCase().includes(q)
        );
      });
    }
    list.sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title, "es");
      if (sortKey === "municipio") return a.municipio.localeCompare(b.municipio, "es");
      if (sortKey === "created") {
        const ac = new Date(a.createdAt ?? a.slaDeadline).getTime();
        const bc = new Date(b.createdAt ?? b.slaDeadline).getTime();
        return bc - ac;
      }
      return new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime();
    });
    return list;
  }, [effectiveFeatures, deferredListSearch, sortKey]);

  const filterChips = useMemo(() => {
    const chips: string[] = [];
    if (status !== "todos") chips.push(STATUS_LABEL[status]);
    else chips.push(SCOPE_LABEL[scope]);
    chips.push(priority === "todos" ? "Todas las prioridades" : PRIORITY_LABEL[priority]);
    chips.push(operator === "todas" ? "Todas las operadoras" : operator);
    chips.push(busId === "todas" ? "Todos los buses" : busId);
    if (partCodeDebounced) chips.push(`Pieza ${partCodeDebounced}`);
    if (urgentOnly) chips.push("Solo urgentes");
    if (mapaMuro && soloCriticos) chips.push("Solo críticos");
    if (createdAfter) chips.push(`Desde ${createdAfter}`);
    if (createdBefore) chips.push(`Hasta ${createdBefore}`);
    return chips;
  }, [scope, status, priority, operator, busId, partCodeDebounced, urgentOnly, createdAfter, createdBefore, mapaMuro, soloCriticos]);

  const filterSummary = useMemo(() => filterChips.join(" · "), [filterChips]);

  const liveSummary = useMemo(() => {
    if (!data) return "";
    const n = effectiveFeatures.length;
    const listN = sortedFilteredList.length;
    return `${n} tickets en mapa con filtros actuales. Lista lateral: ${listN}. ${filterSummary}.`;
  }, [data, effectiveFeatures.length, sortedFilteredList.length, filterSummary]);

  const lastUpdatedLabel = useMemo(() => {
    if (!data?.fetchedAt) return "—";
    try {
      return new Date(data.fetchedAt).toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }, [data?.fetchedAt]);

  const ticketsHref = useMemo(() => {
    const p = new URLSearchParams();
    if (status !== "todos") p.set("status", status);
    else if (scope === "resueltos") p.set("status", "resuelto");
    if (priority !== "todos") p.set("priority", priority);
    if (operator !== "todas") p.set("operator", operator);
    if (busId !== "todas") p.set("busId", busId);
    if (partCodeDebounced) p.set("partCode", partCodeDebounced);
    return buildTicketsHref(p);
  }, [scope, status, priority, operator, busId, partCodeDebounced]);

  const nVisible = effectiveFeatures.length;

  const urgentCount = useMemo(() => {
    const now = Date.now();
    return effectiveFeatures.filter((f) => f.priority === "alta" || new Date(f.slaDeadline).getTime() < now).length;
  }, [effectiveFeatures]);

  const ticketNotVisibleInMap = useMemo(() => {
    if (!ticketFromUrl || !data) return false;
    return !effectiveFeatures.some((f) => f.id === ticketFromUrl);
  }, [ticketFromUrl, data, effectiveFeatures]);

  const clearFiltersKeepTicket = useCallback(() => {
    setScope("activos");
    setStatus("todos");
    setPriority("todos");
    setOperator("todas");
    setBusId("todas");
    setPartCodeInput("");
    setPartCodeDebounced("");
    setUrgentOnly(false);
    setSoloCriticos(false);
    setCreatedAfter("");
    setCreatedBefore("");
  }, []);

  const mapLayoutKey = `${presentationMode ? 1 : 0}-${mapaMuro ? 1 : 0}-${mobileTab}-${filtersMenuOpen ? 1 : 0}-${scope}-${status}-${effectiveFeatures.length}`;

  return (
    // Movil: hero ultra-compacto. Ocultamos badge CCMGC, descripcion y
    // barra de controles secundaria para liberar verticales y que la
    // bandeja/mapa de abajo puedan respirar (en un iPhone 13 Pro el
    // header completo se comia ~280px del viewport util). El chevron de
    // migas ya dice donde esta el usuario.
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden", mapaMuro ? "gap-2" : "gap-2 sm:gap-3")}>
      {!mapaMuro ? (
      <header className="ccmgc-hero mapa-hero tickets-hero-glow shrink-0 rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-accent-light)]/30 p-4 shadow-sm sm:p-5">
        <div
          aria-hidden
          className="ccmgc-hero-parallax pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
        />
        <svg
          aria-hidden
          viewBox="0 0 97.29 102.80"
          preserveAspectRatio="xMidYMid meet"
          className="pointer-events-none hidden sm:block"
          style={{
            position: "absolute",
            right: "1%",
            top: "50%",
            transform: "translateY(-50%)",
            height: "175%",
            width: "auto",
            color: "#7dd3fc",
            filter: "drop-shadow(0 0 22px rgba(56,189,248,0.55))",
          }}
        >
          <path
            fill="currentColor"
            fillOpacity="0.10"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="0.45"
            strokeLinejoin="round"
            d={GRAN_CANARIA_HERO_PATH}
          />
        </svg>
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
              <MapPinned size={20} strokeWidth={1.7} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="ccmgc-eyebrow dashboard-pretitle hidden sm:inline-flex">
                <span className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
                CCMGC · Vista operativa
              </div>
              <h1 className="dashboard-hero-title mt-0.5 flex items-center gap-2 text-[16px] font-semibold leading-tight tracking-tight sm:mt-1 sm:text-[22px]">
                Mapa operativo
                <FeedbackTargetButton id="mapa/vista-operativa" label="Mapa operativo de incidencias" />
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {data ? (
              <MapHeroKpiStrip
                urgentCount={urgentCount}
                mapCount={nVisible}
                listCount={sortedFilteredList.length}
                listFiltered={!!listSearch.trim()}
                className="hidden md:flex"
              />
            ) : null}
            <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
              <button
                type="button"
                onClick={() => setPresentationMode((v) => !v)}
                title={presentationMode ? "Mostrar panel lateral" : "Solo mapa (oculta panel)"}
                aria-pressed={presentationMode}
                className={cn(
                  "desvios-action-chip",
                  presentationMode && "desvios-action-chip--accent",
                )}
              >
                <PanelLeftClose size={14} strokeWidth={1.7} aria-hidden />
                <span>{presentationMode ? "Panel" : "Enfoque"}</span>
              </button>
              <div className="relative" data-map-shortcuts>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen((o) => !o)}
                  aria-expanded={shortcutsOpen}
                  title="Atajos de teclado"
                  className={cn(
                    "desvios-action-chip !w-9 !px-0",
                    shortcutsOpen && "desvios-action-chip--accent",
                  )}
                >
                  <HelpCircle size={14} strokeWidth={1.7} aria-hidden />
                  <span className="sr-only">Atajos</span>
                </button>
                {shortcutsOpen ? (
                  <div
                    className="absolute right-0 top-[calc(100%+6px)] z-[80] w-[min(100vw-2rem,18rem)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[12px] text-[var(--color-text-2)] shadow-xl"
                    role="dialog"
                  >
                    <p className="mb-2 font-medium text-[var(--color-text-1)]">Atajos</p>
                    <ul className="list-inside list-disc space-y-1.5">
                      <li>
                        <kbd className="rounded bg-black/30 px-1 font-mono">/</kbd> enfocar búsqueda en lista
                      </li>
                      <li>
                        <kbd className="rounded bg-black/30 px-1 font-mono">Esc</kbd> quitar selección del mapa
                      </li>
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
            <MapHeroBandejaCta href={ticketsHref} />
          </div>
        </div>
        {data ? (
          <MapHeroKpiStrip
            urgentCount={urgentCount}
            mapCount={nVisible}
            listCount={sortedFilteredList.length}
            listFiltered={!!listSearch.trim()}
            className="relative pt-2 md:hidden"
          />
        ) : null}
        <p className="sr-only">
          Incidencias por municipio del bus o coordenadas GPS. Pulsa un marcador o una fila para centrar.{" "}
          {filterSummary}
        </p>
      </header>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {liveSummary}
      </p>
      {selectionAnnounced ? (
        <p className="sr-only" aria-live="polite">
          {selectionAnnounced}
        </p>
      ) : null}

      {error ? (
        <p className="sr-only" aria-live="assertive">
          {error}
          {errorHint ? ` ${errorHint}` : ""}
        </p>
      ) : null}

      {ticketNotVisibleInMap ? (
        <div
          className="shrink-0 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="status"
        >
          <p className="font-medium">El ticket de la URL no aparece con los filtros actuales.</p>
          <p className="mt-1 text-[13px] text-amber-200/90">
            Prueba a limpiar filtros para centrarlo en el mapa, o abre la ficha desde la bandeja.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={clearFiltersKeepTicket}>
              Limpiar filtros del mapa
            </Button>
            <Link
              href={`/tickets/${ticketFromUrl}`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-light)] px-3 py-2 text-sm font-medium text-[var(--color-text-1)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              Abrir ficha del ticket
            </Link>
          </div>
        </div>
      ) : null}

      {/* Tabs compactos en movil: segmented pill activo. */}
      <div
        className={cn(
          "flex shrink-0 gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-0.5 backdrop-blur lg:hidden",
          mapaMuro && "hidden",
        )}
        role="tablist"
        aria-label="Vista móvil del mapa"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "panel"}
          onClick={() => setMobileTab("panel")}
          className={cn(
            "min-h-9 flex-1 justify-center rounded-lg px-2 text-[13px] font-semibold transition-all duration-150",
            mobileTab === "panel"
              ? "segmented-pill--active"
              : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]",
          )}
        >
          Bandeja
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "map"}
          onClick={() => setMobileTab("map")}
          className={cn(
            "min-h-9 flex-1 justify-center rounded-lg px-2 text-[13px] font-semibold transition-all duration-150",
            mobileTab === "map"
              ? "segmented-pill--active"
              : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-1)]",
          )}
        >
          Mapa
        </button>
      </div>

      <div
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-1 flex-col lg:flex-row lg:items-stretch",
          mapaMuro ? "gap-3 lg:gap-3" : "gap-4 lg:gap-4",
        )}
      >
        <aside
          className={cn(
            "mapa-bandeja flex min-h-0 w-full min-w-0 flex-col overflow-hidden",
            mapaMuro
              ? "gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm lg:max-h-[min(calc(100dvh-2rem),2160px)] lg:min-w-[480px] lg:w-[min(40vw,1680px)] lg:max-w-[min(40vw,1680px)] lg:shrink-0 lg:font-medium lg:text-[clamp(1.35rem,min(0.32vw+0.75rem),2.5rem)] lg:leading-relaxed lg:antialiased min-[2200px]:lg:text-[clamp(1.5rem,min(0.28vw+1rem),2.75rem)]"
              : "flex-1 gap-0 rounded-xl border border-[var(--color-border)]/80 bg-[var(--color-surface)]/95 lg:max-h-[min(calc(100dvh-10.5rem),900px)] lg:w-[min(20rem,28vw)] lg:max-w-[min(20rem,28vw)] lg:shrink-0",
            "max-lg:min-h-0",
            presentationMode && "hidden",
            mobileTab === "map" && !mapaMuro && "max-lg:hidden",
          )}
        >
          <div className="mapa-bandeja__head flex shrink-0 flex-wrap items-start justify-between gap-x-2 gap-y-2 border-b border-[var(--color-border)]/70 px-2.5 pb-2.5 pt-2.5 sm:px-3">
            <div className="min-w-0 flex-1 pr-2">
              {/* Modo normal: pretitle premium con dot + titulo. Modo muro
                  conserva su tipografia gigante intacta (no aplica el
                  patron premium para no romper la legibilidad a 3-5m). */}
              {!mapaMuro ? (
                <span className="ccmgc-eyebrow dashboard-pretitle">
                  <span className="ccmgc-eyebrow-dot dashboard-pretitle-dot" aria-hidden />
                  Bandeja
                </span>
              ) : null}
              <h2
                className={cn(
                  "font-semibold leading-tight text-[var(--color-text-1)]",
                  mapaMuro
                    ? "text-3xl font-extrabold tracking-tight text-[var(--color-text-1)] lg:text-5xl min-[2200px]:lg:text-6xl"
                    : "mt-0.5 text-[14px] tracking-tight",
                )}
              >
                Tickets
              </h2>
              <p
                className={cn(
                  "mt-1 line-clamp-2 leading-snug text-[var(--color-text-3)]",
                  mapaMuro
                    ? "text-lg font-semibold text-[var(--color-text-2)] lg:mt-3 lg:line-clamp-4 lg:text-2xl lg:leading-snug min-[2200px]:lg:text-3xl"
                    : "text-[11px]",
                )}
              >
                {filterSummary}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {mapaMuro ? (
                <Link
                  href={exitMuroHref}
                  className="inline-flex min-h-14 items-center rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3 text-lg font-bold text-[var(--color-text-1)] transition-colors hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-surface-3)] lg:min-h-16 lg:px-8 lg:text-xl min-[2200px]:lg:min-h-[4.5rem] min-[2200px]:lg:text-2xl"
                >
                  Salir muro
                </Link>
              ) : (
                <Link
                  href={enterMuroHref}
                  title="Pantalla completa para muro o videowall (sin menú lateral de la app)"
                  className="desvios-action-chip"
                >
                  <Monitor size={13} strokeWidth={1.7} aria-hidden />
                  Modo muro
                </Link>
              )}
              {mapaMuro ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 gap-1.5 border-2 lg:!min-h-16 lg:!gap-2.5 lg:!px-8 lg:!py-3 lg:!text-xl lg:!font-bold [&_svg]:lg:!size-6 min-[2200px]:lg:!min-h-[4.5rem] min-[2200px]:lg:!text-2xl"
                  onClick={() => setFiltersMenuOpen(true)}
                  aria-expanded={filtersMenuOpen}
                  aria-controls="mapa-opciones-panel"
                >
                  <SlidersHorizontal size={14} className="lg:size-6" aria-hidden />
                  Opciones
                </Button>
              ) : (
                <button
                  type="button"
                  className="desvios-action-chip desvios-action-chip--accent"
                  onClick={() => setFiltersMenuOpen(true)}
                  aria-expanded={filtersMenuOpen}
                  aria-controls="mapa-opciones-panel"
                >
                  <SlidersHorizontal size={13} strokeWidth={1.7} aria-hidden />
                  Opciones
                </button>
              )}
            </div>
          </div>

          <div className="mapa-bandeja__scope shrink-0 border-b border-[var(--color-border)]/45 px-2.5 py-2 sm:px-3">
            <MapScopeToggle
              scope={scope}
              onChange={handleScopeChange}
              size={mapaMuro ? "muro" : "default"}
            />
          </div>

          <div
            className={cn(
              "mapa-bandeja__count shrink-0 border-b border-[var(--color-border)]/45 px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-3)] sm:px-3",
              mapaMuro && "px-0 text-base lg:text-xl min-[2200px]:lg:text-2xl",
            )}
          >
            Tickets en lista ({sortedFilteredList.length})
          </div>

          <div
            ref={listScrollRef}
            data-mapa-list-scroll
            className={cn(
              "mapa-bandeja__list min-h-0 flex-1 overflow-y-auto overscroll-contain",
              mapaMuro ? "px-0" : "px-0",
            )}
            onMouseLeave={() => setHighlightTicketId(null)}
          >
              {loading && !data ? (
                <ul className="divide-y divide-[var(--color-border)] p-2" aria-busy="true" aria-label="Cargando lista">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="py-3">
                      <Skeleton className="mb-1 h-3 w-20" />
                      <Skeleton className="mb-1 h-4 w-full" />
                      <Skeleton className="h-3 w-40" />
                    </li>
                  ))}
                </ul>
              ) : error ? (
                <div className="p-4 text-sm text-[var(--color-text-2)]">
                  <p className="text-[var(--color-error)]">Error al cargar datos del mapa.</p>
                  <p className="mt-2 text-caption">Usa <strong>Reintentar</strong> en el mapa si falla la carga, o <strong>Opciones</strong> → Actualizar.</p>
                </div>
              ) : !sortedFilteredList.length ? (
                <div className="p-4 text-sm text-[var(--color-text-2)]">Sin coincidencias en lista o filtros.</div>
              ) : (
                <ul className="mapa-bandeja__items" role="listbox" aria-label="Tickets en el mapa">
                  {sortedFilteredList.map((t) => {
                    const slaOver = new Date(t.slaDeadline).getTime() < Date.now();
                    const isSelected = selectedId === t.id;
                    const isHover = highlightTicketId === t.id;
                    const priColor =
                      t.priority === "alta"
                        ? "var(--color-error)"
                        : t.priority === "media"
                          ? "var(--color-warning)"
                          : "var(--color-success)";
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          ref={(el) => {
                            if (el) listItemRefs.current.set(t.id, el);
                            else listItemRefs.current.delete(t.id);
                          }}
                          onMouseEnter={() => setHighlightTicketId(t.id)}
                          onClick={() => setSelectedId(t.id)}
                          style={{
                            borderLeftColor: isSelected
                              ? "var(--color-accent)"
                              : isHover
                                ? priColor
                                : priColor,
                            borderLeftWidth: isSelected || isHover ? (mapaMuro ? 4 : 3) : mapaMuro ? 4 : 2,
                            borderLeftStyle: "solid",
                            opacity: isSelected || isHover ? 1 : undefined,
                          }}
                          className={cn(
                            "flex w-full flex-col gap-1 text-left transition-all hover:bg-[var(--color-surface-2)]",
                            mapaMuro
                              ? "gap-2.5 px-5 py-6 text-xl lg:gap-3 lg:px-6 lg:py-8 lg:text-2xl min-[2200px]:lg:px-8 min-[2200px]:lg:py-10 min-[2200px]:lg:text-3xl"
                              : "gap-1 px-3 py-2.5 text-sm",
                            isSelected && "bg-[var(--color-accent-light)]/45",
                          )}
                        >
                          <div className={cn("flex flex-wrap items-center", mapaMuro ? "gap-2 lg:gap-2.5" : "gap-1.5 lg:gap-2")}>
                            <span
                              className={cn(
                                "font-mono text-[var(--color-text-3)]",
                                mapaMuro
                                  ? "text-base font-bold tracking-wider text-[var(--color-text-2)] lg:text-xl min-[2200px]:lg:text-2xl"
                                  : "text-[11px]",
                              )}
                            >
                              {t.id.slice(-8).toUpperCase()}
                            </span>
                            <Badge
                              variant={ticketStatusBadgeVariant(t.status)}
                              className={cn(
                                mapaMuro
                                  ? "!px-4 !py-1.5 text-base font-bold lg:!px-5 lg:!py-2 lg:text-lg min-[2200px]:lg:!text-xl"
                                  : "!py-0 text-[10px]",
                                ticketStatusBadgeClassName(t.status),
                              )}
                            >
                              {STATUS_LABEL[t.status]}
                            </Badge>
                            <Badge
                              variant={priorityBadgeProps(t.priority).variant}
                              className={cn(
                                mapaMuro
                                  ? "!px-4 !py-1.5 text-base font-bold lg:!px-5 lg:!py-2 lg:text-lg min-[2200px]:lg:!text-xl"
                                  : "!py-0 text-[10px]",
                                priorityBadgeProps(t.priority).className,
                              )}
                            >
                              {PRIORITY_LABEL[t.priority]}
                            </Badge>
                            {slaOver ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md bg-[var(--color-error-light)] px-1.5 py-0.5 font-bold text-[var(--color-error)] ring-1 ring-[var(--color-error)]/30",
                                  mapaMuro
                                    ? "text-base lg:text-lg min-[2200px]:lg:text-xl"
                                    : "text-[10px]",
                                )}
                                title="Plazo de SLA vencido"
                              >
                                <Timer size={mapaMuro ? 14 : 10} strokeWidth={2} aria-hidden />
                                SLA vencido
                              </span>
                            ) : null}
                          </div>
                          <span
                            className={cn(
                              "line-clamp-2 text-[var(--color-text-1)]",
                              mapaMuro
                                ? "font-extrabold text-2xl leading-snug tracking-tight text-[var(--color-text-1)] lg:line-clamp-5 lg:text-3xl lg:leading-snug min-[2200px]:lg:text-4xl min-[2200px]:lg:leading-snug"
                                : "text-sm font-medium",
                            )}
                          >
                            {t.title}
                          </span>
                          <span
                            className={cn(
                              "text-[var(--color-text-2)]",
                              mapaMuro
                                ? "text-lg font-semibold text-[var(--color-text-2)] lg:text-2xl min-[2200px]:lg:text-3xl"
                                : "text-caption",
                            )}
                          >
                            {t.municipio} · {t.busId}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
        </aside>
        <AnimatePresence>
          {filtersMenuOpen ? (
            <>
              <motion.div
                className="ccmgc-drawer-overlay mapa-options-overlay fixed inset-0 z-[80]"
                role="presentation"
                aria-hidden
                onClick={() => setFiltersMenuOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionTransition(0.2)}
              />
              <motion.div
                id="mapa-opciones-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mapa-opciones-titulo"
                className="ccmgc-drawer-panel ccmgc-drawer-panel--map-options fixed inset-y-0 right-0 left-auto z-[90] flex w-[min(22rem,92vw)] flex-col border-l border-[var(--color-accent)]/35 shadow-[-12px_0_40px_rgba(0,0,0,0.55)]"
                variants={slideFromRight}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={motionTransition(0.28)}
              >
              <div className="mapa-options-panel__head flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-accent)]/25 px-4 py-3">
                <h2 id="mapa-opciones-titulo" className="flex items-center gap-2 text-subheading text-[var(--color-text-1)]">
                  <SlidersHorizontal size={16} className="text-[var(--color-accent)]" aria-hidden />
                  Opciones del mapa
                </h2>
                <Button type="button" variant="secondary" size="sm" onClick={() => setFiltersMenuOpen(false)}>
                  Cerrar
                </Button>
              </div>
              <div className="mapa-options-panel__body min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4">
          {!mapaMuro ? (
          <AsideSection variant="flat" title="Lista y orden (solo columna izquierda)">
            <div className="space-y-3">
              <p className="text-label text-[var(--color-text-3)]">Buscar en lista lateral</p>
              <Input
                ref={listSearchRef}
                placeholder="Título, ID, bus, municipio… (/)"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                className="!min-h-10"
                aria-label="Buscar en la lista de tickets del mapa"
              />
              <p className="text-[11px] leading-snug text-[var(--color-text-3)]">
                No cambia los marcadores: solo acota la lista. Los marcadores siguen los filtros del bloque «Mapa y
                fechas».
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption text-[var(--color-text-3)]">Orden</span>
                <MenuSelect
                  value={sortKey}
                  onChange={(v) => setSortKey(v as SortKey)}
                  options={MAP_SORT_OPTIONS}
                  className="max-w-[11rem]"
                  buttonClassName="!min-h-10"
                  aria-label="Ordenar lista"
                />
              </div>
            </div>
          </AsideSection>
          ) : null}

          <AsideSection variant="flat" title={mapaMuro ? "Filtros esenciales" : "Mapa y fechas (API)"}>
            <div className="space-y-3">
          <div>
            <p className="mb-2 text-label text-[var(--color-text-3)]">Ámbito</p>
            <MapScopeToggle scope={scope} onChange={handleScopeChange} />
          </div>

          {granularStatusOptions.length ? (
          <div>
            <p className="mb-2 text-label text-[var(--color-text-3)]">Estado concreto</p>
            <div className="flex flex-wrap gap-1.5">
              {granularStatusOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleStatusChange(s)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    status === s
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-text-1)]"
                      : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                  {s === "todos" ? "Todos en ámbito" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          ) : null}

          <div>
            <p className="mb-2 text-label text-[var(--color-text-3)]">Prioridad</p>
            <div className="flex flex-wrap gap-1.5">
              {(["todos", "alta", "media", "baja"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    priority === p
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-text-1)]"
                      : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                  {p === "todos" ? "Todas" : PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {!mapaMuro ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-label text-[var(--color-text-3)]">Operadora</p>
              <MenuSelect
                value={operator}
                onChange={(v) => setOperator(v as "todas" | string)}
                options={operatorMenuOptions}
                buttonClassName="!min-h-10"
                aria-label="Operadora"
              />
            </div>
            <div>
              <p className="mb-1 text-label text-[var(--color-text-3)]">Bus</p>
              <MenuSelect
                value={busId}
                onChange={(v) => setBusId(v as "todas" | string)}
                options={busMenuOptions}
                buttonClassName="!min-h-10"
                aria-label="Bus"
              />
            </div>
          </div>
          ) : null}

          {!mapaMuro ? (
          <div>
            <p className="mb-1 text-label text-[var(--color-text-3)]">Código pieza (opcional)</p>
            <Input
              value={partCodeInput}
              onChange={(e) => setPartCodeInput(e.target.value)}
              placeholder="REP-…"
              className="!min-h-10 font-mono text-sm"
              aria-label="Filtrar por código de repuesto"
            />
          </div>
          ) : null}

          <div>
            <p className="mb-2 text-label text-[var(--color-text-3)]">Urgencia</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setUrgentOnly((v) => !v)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  urgentOnly
                    ? "border-[var(--color-error)]/50 bg-[var(--color-error-light)] text-[var(--color-error)]"
                    : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                Solo urgentes
              </button>
              {mapaMuro ? (
                <button
                  type="button"
                  onClick={() => setSoloCriticos((v) => !v)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    soloCriticos
                      ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
                      : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  <AlertTriangle size={12} aria-hidden />
                  Solo críticos
                </button>
              ) : null}
            </div>
          </div>

          {!mapaMuro ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <MapDateField
              label="Creados desde"
              value={createdAfter}
              onChange={setCreatedAfter}
              maxDateStr={createdBefore || undefined}
            />
            <MapDateField
              label="Creados hasta"
              value={createdBefore}
              onChange={setCreatedBefore}
              minDateStr={createdAfter || undefined}
            />
          </div>
          ) : null}

          {!mapaMuro ? (
          <div className="space-y-2 pt-1">
            <p className="text-label text-[var(--color-text-3)]">Vistas guardadas</p>
            <div className="flex flex-wrap gap-2">
              <MenuSelect
                value=""
                placeholder="Aplicar…"
                options={presetMenuOptions}
                className="min-w-0 flex-1"
                buttonClassName="!min-h-10"
                aria-label="Aplicar vista guardada"
                onChange={(name) => {
                  if (!name) return;
                  const p = mapPresets.find((x) => x.name === name);
                  if (!p) return;
                  setScope(p.scope ?? "activos");
                  setStatus(p.status);
                  setPriority(p.priority);
                  setOperator(p.operator as "todas" | string);
                  setBusId(p.busId as "todas" | string);
                  setPartCodeInput(p.partCode);
                  setUrgentOnly(p.urgentOnly);
                  setCreatedAfter(p.createdAfter);
                  setCreatedBefore(p.createdBefore);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  const name = window.prompt("Nombre para esta combinación de filtros:");
                  if (!name?.trim()) return;
                  const entry: MapFilterPreset = {
                    name: name.trim().slice(0, 40),
                    scope,
                    status,
                    priority,
                    operator,
                    busId,
                    partCode: partCodeDebounced,
                    urgentOnly,
                    createdAfter,
                    createdBefore,
                  };
                  const next = [entry, ...mapPresets.filter((x) => x.name !== entry.name)].slice(0, 12);
                  setMapPresets(next);
                  try {
                    localStorage.setItem(MAP_PRESETS_KEY, JSON.stringify(next));
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Guardar
              </Button>
            </div>
          </div>
          ) : null}
            </div>
          </AsideSection>

          <AsideSection variant="flat" title="Capas y leyenda" bodyClassName="space-y-4">
          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3 sm:flex-row sm:flex-wrap sm:items-center lg:border-0 lg:pt-0">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--color-text-2)]">
              <Checkbox checked={showWarehouses} onChange={(e) => setShowWarehouses(e.target.checked)} />
              Almacenes
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--color-text-2)]">
              <Checkbox checked={showPreventives} onChange={(e) => setShowPreventives(e.target.checked)} />
              Preventivos
            </label>
          </div>

          <div className="w-full space-y-3 border-t border-[var(--color-border)] pt-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--color-text-2)]">
              <Checkbox checked={overlayLabels} onChange={(e) => setOverlayLabels(e.target.checked)} />
              Etiquetas claras (capa encima)
            </label>
            <div className="space-y-2">
              <p className="text-label text-[var(--color-text-3)]">Brillo del mapa</p>
              <input
                type="range"
                min={60}
                max={100}
                value={mapTileOpacity}
                onChange={(e) => setMapTileOpacity(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-surface-3)] accent-[var(--color-accent)] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-[var(--color-accent)] [&::-webkit-slider-thumb]:shadow-md"
                aria-label="Brillo del mapa base"
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)]/80 bg-[var(--color-surface)]/80 shadow-inner">
            <button
              type="button"
              className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-label text-[var(--color-text-3)]"
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
            >
              Leyenda
              <ChevronDown
                size={16}
                className={cn(
                  "shrink-0 transition-transform duration-200",
                  legendOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            <ul
              className={cn(
                "space-y-1.5 px-3 pb-3 text-xs text-[var(--color-text-1)]",
                legendOpen || mapaMuro ? "block" : "hidden",
              )}
            >
              {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        s === "abierto"
                          ? "#f87171"
                          : s === "en_proceso"
                            ? "#fbbf24"
                            : s === "esperando_repuesto"
                              ? "#38bdf8"
                              : "#4ade80",
                    }}
                  />
                  {STATUS_LABEL[s]}
                </li>
              ))}
              {showWarehouses ? (
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#7c3aed]" />
                  Almacén (capa)
                </li>
              ) : null}
              {showPreventives ? (
                <li className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#0891b2]" />
                  Preventivo (capa)
                </li>
              ) : null}
            </ul>
          </div>
          </AsideSection>


          <AsideSection variant="flat" title="Actualización" bodyClassName="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-[var(--color-text-3)]">Auto-actualizar</span>
            <MenuSelect
              value={String(autoRefreshSec)}
              onChange={(v) => setAutoRefreshSec(Number(v))}
              options={AUTO_REFRESH_OPTIONS}
              className="max-w-[10rem]"
              buttonClassName="!min-h-10"
              aria-label="Auto-actualizar mapa"
            />
            <span className="text-caption text-[var(--color-text-3)]">Última carga: {lastUpdatedLabel}</span>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={refreshUi === "loading"}
            onClick={() => void load()}
          >
            <RefreshCw size={14} className={cn(refreshUi === "loading" && "animate-spin")} aria-hidden />
            {refreshUi === "loading" ? "Actualizando…" : refreshUi === "ok" ? "Actualizado" : "Actualizar"}
          </Button>
          </AsideSection>
              </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>



        <section
          ref={mapShellRef}
          className={cn(
            // En movil eliminamos el min-height: el mapa toma TODO el
            // espacio disponible cuando el tab "Mapa" esta activo
            // (gracias al flex-1). Antes el min-h de 280px o 42dvh era
            // util cuando se mostraba junto a la bandeja, pero como en
            // movil van por tabs ya no aplica.
            "ccmgc-map-shell relative z-0 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#0f1f3d] shadow-[inset_0_2px_12px_rgba(0,0,0,0.18)] lg:min-h-0",
            mobileTab === "panel" && !mapaMuro && "max-lg:hidden",
            presentationMode && "lg:min-h-[min(70dvh,720px)]",
          )}
          style={mapTileOpacity < 100 ? { filter: `brightness(${mapTileOpacity / 100})` } : undefined}
          aria-label="Mapa de tickets Gran Canaria"
        >
          {loading && !data ? (
            <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-[var(--color-surface)]/85 backdrop-blur-sm">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" aria-hidden />
              <p className="text-sm text-[var(--color-text-2)]">Cargando mapa…</p>
            </div>
          ) : null}
          {!loading && error ? (
            <div
              className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
              role="alert"
            >
              <AlertTriangle className="text-[var(--color-error)]" size={40} aria-hidden />
              <div className="max-w-md space-y-2">
                <p className="text-base font-semibold text-[var(--color-text-1)]">No se pudo cargar el mapa</p>
                <p className="text-sm text-[var(--color-error)]">{error}</p>
                {errorHint ? <p className="text-sm text-[var(--color-text-2)]">{errorHint}</p> : null}
                {errorDetail ? (
                  <details className="text-left text-[12px] text-[var(--color-text-3)]">
                    <summary className="cursor-pointer text-[var(--color-text-2)]">Detalle técnico</summary>
                    <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/35 p-2 font-mono text-[11px]">
                      {errorDetail}
                    </pre>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => void navigator.clipboard.writeText(errorDetail)}
                    >
                      <Copy size={14} className="mr-1" aria-hidden />
                      Copiar detalle
                    </Button>
                  </details>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
                  Reintentar
                </Button>
                {errorStatus === 401 ? (
                  <Link
                    href="/login"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-light)] px-3 py-2 text-sm font-medium text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)]"
                  >
                    Iniciar sesión
                  </Link>
                ) : null}
                <Link
                  href={ticketsHref}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)]"
                >
                  Ir a bandeja
                </Link>
              </div>
            </div>
          ) : data && effectiveFeatures.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <MapPinned className="text-[var(--color-text-3)]" size={44} aria-hidden />
              <p className="text-base font-medium text-[var(--color-text-1)]">Sin tickets en el mapa</p>
              <p className="max-w-sm text-pretty text-caption text-[var(--color-text-3)]">
                Prueba otros filtros o crea tickets desde la bandeja.
              </p>
              <Link
                href={ticketsHref}
                className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-light)] px-4 py-2 text-sm font-medium text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)]"
              >
                Abrir bandeja
              </Link>
            </div>
          ) : data ? (
            <MapContainer
              center={GRAN_CANARIA_CENTER}
              zoom={11}
              className="z-0 h-full min-h-0 w-full flex-1 rounded-xl [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:opacity-90"
              scrollWheelZoom
              keyboard={false}
              maxBoundsViscosity={0.85}
            >
              <MapPreventFocusScroll />
              <LayersControl position="bottomright">
                <LayersControl.BaseLayer checked name="Oscuro (CARTO)">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={20}
                  />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Claro (OSM)">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    subdomains="abc"
                    maxZoom={19}
                  />
                </LayersControl.BaseLayer>
              </LayersControl>
              {overlayLabels ? (
                <Pane name="ccmgcLabels" style={{ zIndex: 650, pointerEvents: "none" }}>
                  <TileLayer
                    attribution=""
                    url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png"
                    subdomains="abcd"
                    maxZoom={20}
                    opacity={0.36}
                  />
                </Pane>
              ) : null}
              <MapResizeHandler />
              <MapLayoutInvalidate layoutKey={mapLayoutKey} />
              <MapIslandMaxBoundsWhenFitting />
              <MapLeafletScale />
              <MapFlyTo targetId={flyTargetId} lat={flyLatLng.lat} lng={flyLatLng.lng} />
              <MapToolbarControls
                features={effectiveFeatures}
                mapShellRef={mapShellRef}
                selectedId={selectedId}
                wallMode={mapaMuro}
              />
              <MapClusteredMarkers
                features={effectiveFeatures}
                selectedId={selectedId}
                hoveredId={highlightTicketId}
                onHoverTicket={setHighlightTicketId}
                onSelectTicket={setSelectedId}
                onMapBackgroundClick={() => setSelectedId(null)}
                suppressMarkerPopup={mapaMuro}
                wallMode={mapaMuro}
              />
              {showWarehouses && context?.warehouses?.length ? (
                <MapWarehouseMarkers items={context.warehouses} />
              ) : null}
              {showPreventives && context?.preventives?.length ? (
                <MapPreventiveMarkers items={context.preventives} />
              ) : null}
            </MapContainer>
          ) : null}

          <div className="pointer-events-none absolute bottom-1 left-2 right-2 z-[400] flex justify-center px-2">
            <p className="pointer-events-auto max-w-full truncate rounded bg-black/45 px-2 py-1 text-[10px] text-[var(--color-text-2)] backdrop-blur-sm">
              © OpenStreetMap · © CARTO · Datos operativos CCMGC
            </p>
          </div>
        </section>

        {mapaMuro ? (
          <MapaMuroTicketDetailPanel
            loadState={muroTicketDetail}
            selectedId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
