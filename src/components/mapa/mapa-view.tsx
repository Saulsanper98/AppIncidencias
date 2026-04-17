"use client";

import L from "leaflet";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  HelpCircle,
  ImageDown,
  MapPinned,
  Maximize2,
  PanelLeftClose,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { LayersControl, MapContainer, Pane, ScaleControl, TileLayer, useMap } from "react-leaflet";

import { MapDateField } from "@/components/mapa/map-date-field";
import { MapClusteredMarkers } from "@/components/mapa/map-clustered-markers";
import { MapPreventiveMarkers, MapWarehouseMarkers } from "@/components/mapa/map-context-markers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/menu-select";
import type { TicketPriority, TicketStatus, UserRole } from "@/lib/domain";
import { GRAN_CANARIA_BOUNDS, GRAN_CANARIA_CENTER, type MapTicketFeature } from "@/lib/gran-canaria-map-geo";
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

const MAP_STORAGE_KEY = "ccmgc_map_filters_v1";
const MAP_PRESETS_KEY = "ccmgc_map_presets_v1";

type MapFilterPreset = {
  name: string;
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
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Clases del cuerpo bajo el summary (p. ej. flex-1 min-h-0 para secciones que ocupan alto). */
  bodyClassName?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/18 p-3",
        className,
      )}
    >
      <summary className="flex shrink-0 cursor-pointer list-none items-center justify-between gap-2 text-label text-[var(--color-text-2)] [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[var(--color-text-3)] transition-transform group-open:rotate-180 lg:hidden"
          aria-hidden
        />
      </summary>
      <div className={cn("mt-3", bodyClassName)}>{children}</div>
    </details>
  );
}
const PART_DEBOUNCE_MS = 380;
const URL_DEBOUNCE_MS = 320;

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
}: {
  features: MapTicketFeature[];
  mapShellRef: RefObject<HTMLElement | null>;
  selectedId: string | null;
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
          className={cn(MAP_TOOL_BTN, "gap-1.5")}
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
          className={cn(MAP_TOOL_BTN, "gap-1.5")}
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
          className={cn(MAP_TOOL_BTN, "gap-1.5")}
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
          className={cn(MAP_TOOL_BTN, "gap-1.5")}
          onClick={toggleFs}
          title="Pantalla completa del mapa"
        >
          <Maximize2 size={14} aria-hidden />
          <span className="hidden min-[420px]:inline">Pantalla completa</span>
        </Button>
        <MapExportPngButton mapShellRef={mapShellRef} />
      </div>
    </div>
  );
}

function MapExportPngButton({ mapShellRef }: { mapShellRef: RefObject<HTMLElement | null> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={cn(MAP_TOOL_BTN, "gap-1.5")}
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
  return s ? `/tickets?${s}` : "/tickets";
}

export function MapaView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketFromUrl = searchParams.get("ticket");

  const [status, setStatus] = useState<TicketStatus | "todos">("todos");
  const [priority, setPriority] = useState<TicketPriority | "todos">("todos");
  const [operator, setOperator] = useState<"todas" | string>("todas");
  const [busId, setBusId] = useState<"todas" | string>("todas");
  const [partCodeInput, setPartCodeInput] = useState("");
  const [partCodeDebounced, setPartCodeDebounced] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
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
  const [presentationMode, setPresentationMode] = useState(false);
  const [overlayLabels, setOverlayLabels] = useState(false);
  const [mapTileOpacity, setMapTileOpacity] = useState(100);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mapPresets, setMapPresets] = useState<MapFilterPreset[]>([]);

  const listItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
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
    if (priority !== "todos") p.set("priority", priority);
    if (operator !== "todas") p.set("operator", operator);
    if (busId !== "todas") p.set("busId", busId);
    if (partCodeDebounced) p.set("partCode", partCodeDebounced);
    if (urgentOnly) p.set("urgent", "1");
    if (createdAfter.trim()) p.set("createdAfter", new Date(createdAfter).toISOString());
    if (createdBefore.trim()) p.set("createdBefore", new Date(createdBefore).toISOString());
    return p.toString();
  }, [status, priority, operator, busId, partCodeDebounced, urgentOnly, createdAfter, createdBefore]);

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
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
          sortKey: SortKey;
          autoRefreshSec: number;
          showWarehouses: boolean;
          showPreventives: boolean;
        }>;
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
        JSON.stringify({ sortKey, autoRefreshSec, showWarehouses, showPreventives }),
      );
    } catch {
      /* ignore */
    }
  }, [sortKey, autoRefreshSec, showWarehouses, showPreventives, hydratedUrl]);

  useEffect(() => {
    if (!hydratedUrl) return;
    if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    urlTimerRef.current = setTimeout(() => {
      const p = new URLSearchParams();
      if (status !== "todos") p.set("status", status);
      if (priority !== "todos") p.set("priority", priority);
      if (operator !== "todas") p.set("operator", operator);
      if (busId !== "todas") p.set("busId", busId);
      if (partCodeDebounced) p.set("partCode", partCodeDebounced);
      if (urgentOnly) p.set("urgent", "1");
      if (createdAfter.trim()) p.set("createdAfter", new Date(createdAfter).toISOString());
      if (createdBefore.trim()) p.set("createdBefore", new Date(createdBefore).toISOString());
      if (selectedId) p.set("ticket", selectedId);
      const qs = p.toString();
      router.replace(qs ? `/mapa?${qs}` : "/mapa", { scroll: false });
    }, URL_DEBOUNCE_MS);
    return () => {
      if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    };
  }, [
    status,
    priority,
    operator,
    busId,
    partCodeDebounced,
    urgentOnly,
    createdAfter,
    createdBefore,
    selectedId,
    router,
    hydratedUrl,
  ]);

  const flyTargetId = selectedId ?? ticketFromUrl ?? null;

  const flyLatLng = useMemo(() => {
    if (!data?.features.length) return { lat: null as number | null, lng: null as number | null };
    if (!flyTargetId) return { lat: null, lng: null };
    const f = data.features.find((x) => x.id === flyTargetId);
    return f ? { lat: f.lat, lng: f.lng } : { lat: null, lng: null };
  }, [data, flyTargetId]);

  const sortedFilteredList = useMemo(() => {
    if (!data?.features.length) return [];
    let list = [...data.features];
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
  }, [data, deferredListSearch, sortKey]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(status === "todos" ? "Todos los estados" : STATUS_LABEL[status]);
    parts.push(priority === "todos" ? "Todas las prioridades" : PRIORITY_LABEL[priority]);
    parts.push(operator === "todas" ? "Todas las operadoras" : operator);
    parts.push(busId === "todas" ? "Todos los buses" : busId);
    if (partCodeDebounced) parts.push(`Pieza ${partCodeDebounced}`);
    if (urgentOnly) parts.push("Solo urgentes");
    return parts.join(" · ");
  }, [status, priority, operator, busId, partCodeDebounced, urgentOnly]);

  const liveSummary = useMemo(() => {
    if (!data) return "";
    const n = data.features.length;
    const listN = sortedFilteredList.length;
    return `${n} tickets en mapa con filtros actuales. Lista lateral: ${listN}. ${filterSummary}.`;
  }, [data, sortedFilteredList.length, filterSummary]);

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
    if (priority !== "todos") p.set("priority", priority);
    if (operator !== "todas") p.set("operator", operator);
    if (busId !== "todas") p.set("busId", busId);
    if (partCodeDebounced) p.set("partCode", partCodeDebounced);
    return buildTicketsHref(p);
  }, [status, priority, operator, busId, partCodeDebounced]);

  const nVisible = data?.features.length ?? 0;

  const urgentCount = useMemo(() => {
    if (!data?.features.length) return 0;
    const now = Date.now();
    return data.features.filter((f) => f.priority === "alta" || new Date(f.slaDeadline).getTime() < now).length;
  }, [data]);

  const ticketNotVisibleInMap = useMemo(() => {
    if (!ticketFromUrl || !data) return false;
    return !data.features.some((f) => f.id === ticketFromUrl);
  }, [ticketFromUrl, data]);

  const clearFiltersKeepTicket = useCallback(() => {
    setStatus("todos");
    setPriority("todos");
    setOperator("todas");
    setBusId("todas");
    setPartCodeInput("");
    setPartCodeDebounced("");
    setUrgentOnly(false);
    setCreatedAfter("");
    setCreatedBefore("");
  }, []);

  const mapLayoutKey = `${presentationMode ? 1 : 0}-${mobileTab}`;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
      <header className="shrink-0 border-b border-[var(--color-border)] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-light)] ring-1 ring-[var(--color-accent)]/15">
                <MapPinned size={18} className="text-[var(--color-accent)]" aria-hidden />
              </div>
              <h1 className="text-heading">
                Mapa operativo
                {data ? (
                  <span className="ml-2 text-base font-normal text-[var(--color-text-3)]">· {nVisible} en vista</span>
                ) : null}
              </h1>
            </div>
            <p className="hidden max-w-2xl text-pretty text-body text-[var(--color-text-2)] sm:block sm:pl-11">
              Incidencias por municipio del bus (aprox.) o coordenadas GPS si el ticket las tiene. Clic en marcador o
              lista para centrar;{" "}
              <span className="whitespace-nowrap" title="Datos aproximados cuando no hay GPS">
                <abbr className="cursor-help underline decoration-dotted">aprox.</abbr>
              </span>{" "}
              por agrupación municipal.
            </p>
            <p className="mt-1 pl-11 text-caption text-[var(--color-text-3)] sm:hidden">
              Municipio o GPS; toca marcador o fila de la lista.
            </p>
            <p className="mt-2 text-caption text-[var(--color-text-3)] sm:pl-11">{filterSummary}</p>
            {data ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-11">
                {urgentCount > 0 ? (
                  <span className="order-first rounded-full border border-[var(--color-error)]/50 bg-[var(--color-error-light)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-error)] shadow-[0_0_0_1px_rgba(220,38,38,0.15)]">
                    Urgentes / SLA: {urgentCount}
                  </span>
                ) : null}
                <span className="rounded-full border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/80 px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-3)]">
                  Mapa: {nVisible} ticket{nVisible === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/80 px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-3)]">
                  Lista: {sortedFilteredList.length}
                  {listSearch.trim() ? " (búsqueda local)" : ""}
                </span>
              </div>
            ) : null}
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px] gap-2 px-2 text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
              onClick={() => setPresentationMode((v) => !v)}
              title={presentationMode ? "Mostrar panel lateral" : "Solo mapa (oculta panel)"}
            >
              <PanelLeftClose size={18} className={cn(presentationMode && "text-[var(--color-accent)]")} aria-hidden />
              <span className="hidden sm:inline">{presentationMode ? "Panel" : "Enfoque"}</span>
            </Button>
            <div className="relative" data-map-shortcuts>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-[44px] px-2 text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                aria-expanded={shortcutsOpen}
                onClick={() => setShortcutsOpen((o) => !o)}
                title="Atajos de teclado"
              >
                <HelpCircle size={18} aria-hidden />
                <span className="sr-only">Atajos</span>
              </Button>
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
            <Link
              href={ticketsHref}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-light)] px-3 py-2 text-sm font-medium text-[var(--color-text-1)] transition-all duration-200 hover:bg-[var(--color-surface-2)]"
            >
              <ExternalLink size={14} aria-hidden />
              Ir a bandeja
            </Link>
          </div>
        </div>
      </header>

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

      <div className="mb-2 flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("panel")}
          className={cn(
            "min-h-10 flex-1 rounded-lg px-2 text-sm font-medium transition-colors",
            mobileTab === "panel"
              ? "bg-[var(--color-accent-light)] text-[var(--color-text-1)]"
              : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
          )}
        >
          Filtros y lista
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("map")}
          className={cn(
            "min-h-10 flex-1 rounded-lg px-2 text-sm font-medium transition-colors",
            mobileTab === "map"
              ? "bg-[var(--color-accent-light)] text-[var(--color-text-1)]"
              : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
          )}
        >
          Mapa
        </button>
      </div>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-4">
        <aside
          className={cn(
            "flex max-h-[min(52vh,480px)] min-h-0 w-full flex-col gap-3 overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] lg:max-h-[min(calc(100dvh-10.5rem),900px)] lg:w-full lg:max-w-sm lg:shrink-0 lg:overflow-y-auto lg:p-4",
            presentationMode && "hidden",
            mobileTab === "map" && "max-lg:hidden",
          )}
        >
          <AsideSection title="Lista y orden (solo columna izquierda)">
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

          <AsideSection title="Mapa y fechas (API)">
            <div className="space-y-3">
          <div>
            <p className="mb-2 text-label text-[var(--color-text-3)]">Estado</p>
            <div className="flex flex-wrap gap-1.5">
              {(["todos", "abierto", "en_proceso", "esperando_repuesto", "resuelto"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    status === s
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-text-1)]"
                      : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
                  {s === "todos" ? "Todos" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

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

          <div>
            <p className="mb-2 text-label text-[var(--color-text-3)]">Urgencia</p>
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
          </div>

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

          <div className="rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/30 p-2">
            <p className="mb-2 text-label text-[var(--color-text-3)]">Vistas guardadas</p>
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
            </div>
          </AsideSection>

          <AsideSection title="Capas y leyenda" bodyClassName="space-y-4">
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

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-label text-[var(--color-text-3)] md:cursor-default md:pointer-events-none"
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
            >
              Leyenda
              <span className="md:hidden">
                {legendOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            </button>
            <ul
              className={cn(
                "space-y-1.5 px-3 pb-3 text-xs text-[var(--color-text-2)]",
                legendOpen ? "block" : "hidden",
                "md:!block",
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

          <div className="flex min-h-[min(14rem,28vh)] flex-1 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/18 p-3 lg:min-h-[12rem]">
            <p className="mb-2 shrink-0 text-label text-[var(--color-text-3)]">
              Tickets en lista ({sortedFilteredList.length})
            </p>
            <div
              className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/40 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
              onMouseLeave={() => setHighlightTicketId(null)}
            >
              {loading && !data ? (
                <ul className="divide-y divide-[var(--color-border)] p-2" aria-busy="true" aria-label="Cargando lista">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="animate-pulse py-3">
                      <div className="mb-1 h-3 w-20 rounded bg-[var(--color-surface-3)]" />
                      <div className="mb-1 h-4 w-full rounded bg-[var(--color-surface-3)]" />
                      <div className="h-3 w-40 rounded bg-[var(--color-surface-3)]" />
                    </li>
                  ))}
                </ul>
              ) : error ? (
                <div className="p-4 text-sm text-[var(--color-text-2)]">
                  <p className="text-[var(--color-error)]">Error al cargar datos del mapa.</p>
                  <p className="mt-2 text-caption">Usa <strong>Reintentar</strong> en el panel derecho.</p>
                </div>
              ) : !sortedFilteredList.length ? (
                <div className="p-4 text-sm text-[var(--color-text-2)]">Sin coincidencias en lista o filtros.</div>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]" role="listbox" aria-label="Tickets en el mapa">
                  {sortedFilteredList.map((t) => {
                    const slaOver = new Date(t.slaDeadline).getTime() < Date.now();
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedId === t.id}
                          ref={(el) => {
                            if (el) listItemRefs.current.set(t.id, el);
                            else listItemRefs.current.delete(t.id);
                          }}
                          onMouseEnter={() => setHighlightTicketId(t.id)}
                          onClick={() => setSelectedId(t.id)}
                          className={cn(
                            "flex w-full flex-col gap-1 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)]",
                            selectedId === t.id
                              ? "border-l-2 border-l-[var(--color-accent)] bg-[var(--color-accent-light)]/45"
                              : highlightTicketId === t.id
                                ? "border-l-2 border-l-sky-400/60 bg-sky-500/10"
                                : "border-l-2 border-l-transparent",
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[11px] text-[var(--color-text-3)]">
                              {t.id.slice(-8).toUpperCase()}
                            </span>
                            <Badge
                              variant={ticketStatusBadgeVariant(t.status)}
                              className={cn("!py-0 text-[10px]", ticketStatusBadgeClassName(t.status))}
                            >
                              {STATUS_LABEL[t.status]}
                            </Badge>
                            <Badge
                              variant={priorityBadgeProps(t.priority).variant}
                              className={cn("!py-0 text-[10px]", priorityBadgeProps(t.priority).className)}
                            >
                              {PRIORITY_LABEL[t.priority]}
                            </Badge>
                            {slaOver ? (
                              <span className="text-[10px] font-medium text-[var(--color-error)]">SLA vencido</span>
                            ) : null}
                          </div>
                          <span className="line-clamp-2 font-medium text-[var(--color-text-1)]">{t.title}</span>
                          <span className="text-caption">
                            {t.municipio} · {t.busId}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <AsideSection title="Actualización" bodyClassName="space-y-3">
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
        </aside>

        <section
          ref={mapShellRef}
          className={cn(
            "ccmgc-map-shell relative z-0 flex min-h-0 min-h-[min(280px,42dvh)] w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#0f1f3d] shadow-[inset_0_2px_12px_rgba(0,0,0,0.18)] lg:min-h-0",
            mobileTab === "panel" && "max-lg:hidden",
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
          ) : data && data.features.length === 0 ? (
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
              maxBoundsViscosity={0.85}
            >
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
              <MapToolbarControls features={data.features} mapShellRef={mapShellRef} selectedId={selectedId} />
              <MapClusteredMarkers
                features={data.features}
                selectedId={selectedId}
                hoveredId={highlightTicketId}
                onHoverTicket={setHighlightTicketId}
                onSelectTicket={setSelectedId}
                onMapBackgroundClick={() => setSelectedId(null)}
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
      </div>
    </div>
  );
}
