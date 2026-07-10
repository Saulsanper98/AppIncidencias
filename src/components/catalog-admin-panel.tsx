"use client";

import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Hash,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Route,
  Search,
  ShieldAlert,
  Timer,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BusEditModal } from "@/components/catalog/BusEditModal";
import { LineaEditModal } from "@/components/catalog/LineaEditModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Pestañas internas del panel del catálogo (orden visual). */
type CatalogTab = "buses" | "lineas" | "sla" | "anomalous";

type ImportPreviewRow = {
  rowNumber: number;
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
};

type ImportErrorRow = {
  rowNumber: number;
  rawId: string | null;
  message: string;
};

type ImportPreviewResponse = {
  ok: boolean;
  dryRun: true;
  totalRows: number;
  validRows: number;
  preview: ImportPreviewRow[];
  errors: ImportErrorRow[];
};

type ImportCommitResponse = {
  ok: boolean;
  dryRun: false;
  totalRows: number;
  created: number;
  skippedExisting: number;
  errors: ImportErrorRow[];
};

type LineaImportPreviewRow = {
  rowNumber: number;
  id: string;
};

type LineaImportPreviewResponse = {
  ok: boolean;
  dryRun: true;
  totalRows: number;
  validRows: number;
  preview: LineaImportPreviewRow[];
  errors: ImportErrorRow[];
};

type LineaImportCommitResponse = {
  ok: boolean;
  dryRun: false;
  totalRows: number;
  created: number;
  skippedExisting: number;
  errors: ImportErrorRow[];
};

type CatalogAsset = {
  id: string;
  type: string;
  serialNumber: string;
  slaMinutes?: number | null;
};

type CatalogBus = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
  assets: CatalogAsset[];
};

type CatalogResponse = {
  buses: CatalogBus[];
};

type Notice = { kind: "info" | "success" | "error"; text: string } | null;

export function CatalogAdminPanel() {
  const router = useRouter();
  const [buses, setBuses] = useState<CatalogBus[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [form, setForm] = useState({ id: "", operator: "", municipio: "", lineas: "" });
  const [slaDrafts, setSlaDrafts] = useState<Record<string, string>>({});
  const [busQuery, setBusQuery] = useState("");
  const [slaQuery, setSlaQuery] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<string | null>(null);
  // Pestaña activa. Se persiste en sessionStorage para que recargar
  // el catálogo no devuelva siempre a "Buses".
  const [tab, setTab] = useState<CatalogTab>(() => {
    if (typeof window === "undefined") return "buses";
    const saved = window.sessionStorage.getItem("catalog:tab");
    return (saved === "lineas" || saved === "sla" || saved === "anomalous"
      ? (saved as CatalogTab)
      : "buses");
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.sessionStorage.setItem("catalog:tab", tab);
  }, [tab]);

  // ====== Estado del catalogo de Lineas (servicios) ======
  const [lineas, setLineas] = useState<string[]>([]);
  const [lineaQuery, setLineaQuery] = useState("");
  const [lineaForm, setLineaForm] = useState("");
  const [lineaSaving, setLineaSaving] = useState(false);
  const [lineaError, setLineaError] = useState<string | null>(null);

  // ====== Modales de edición ======
  // Bus: editar operadora, municipio, líneas asignadas.
  // Línea: ver/asignar/desasignar buses, renombrar (propagando).
  const [editingBus, setEditingBus] = useState<CatalogBus | null>(null);
  const [editingLinea, setEditingLinea] = useState<string | null>(null);

  // ====== Estado de la importacion masiva de Buses (Excel/CSV) ======
  const importFileInput = useRef<HTMLInputElement | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportCommitResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState<"preview" | "commit" | null>(null);

  // ====== Estado de la importacion masiva de Lineas (Excel/CSV) ======
  const lineaImportFileInput = useRef<HTMLInputElement | null>(null);
  const [lineaImportFile, setLineaImportFile] = useState<File | null>(null);
  const [lineaImportPreview, setLineaImportPreview] = useState<LineaImportPreviewResponse | null>(null);
  const [lineaImportResult, setLineaImportResult] = useState<LineaImportCommitResponse | null>(null);
  const [lineaImportError, setLineaImportError] = useState<string | null>(null);
  const [lineaImportLoading, setLineaImportLoading] = useState<"preview" | "commit" | null>(null);

  // ====== Estado del SLA global por prioridad ======
  const [slaConfig, setSlaConfig] = useState<{ alta: number; media: number; baja: number } | null>(null);
  const [slaConfigDrafts, setSlaConfigDrafts] = useState<{ alta: string; media: string; baja: string }>({
    alta: "",
    media: "",
    baja: "",
  });
  const [slaConfigSaving, setSlaConfigSaving] = useState(false);

  // ====== Estado de la deteccion de buses anomalos ======
  // El "windowDays" arranca en 12 (sugerencia de Ibrahim); zscore permite
  // afinar la sensibilidad (1.5 = sensible, 2.5 = solo casos claros).
  // `typeWeights` (fase 3): cada tipo de incidencia puede pesar mas o menos
  // al calcular el score del bus. P. ej.: "Apertura/cierre puertas": 3 hace
  // que un fallo de puerta valga por 3 tickets en el algoritmo. Sin entradas
  // el algoritmo se comporta exactamente como antes (peso 1 para todo).
  const [anomalousConfig, setAnomalousConfig] = useState<{
    windowDays: number;
    zscore: number;
    typeWeights: Record<string, number>;
  } | null>(null);
  const [anomalousDrafts, setAnomalousDrafts] = useState<{ windowDays: string; zscore: string }>({
    windowDays: "",
    zscore: "",
  });
  const [anomalousSaving, setAnomalousSaving] = useState(false);
  /** Edición de pesos (fase 3): lista de {tipo,peso} editable como arrays. */
  const [weightDrafts, setWeightDrafts] = useState<{ tipo: string; peso: string }[]>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    const data = (await response.json()) as CatalogResponse;
    const next = data.buses ?? [];
    setBuses(next);
    const drafts: Record<string, string> = {};
    for (const bus of next) {
      for (const a of bus.assets) {
        drafts[a.id] = a.slaMinutes != null ? String(a.slaMinutes) : "";
      }
    }
    setSlaDrafts(drafts);
  }, []);

  const loadLineas = useCallback(async () => {
    const response = await fetch("/api/lineas", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { lineas?: string[] };
    setLineas(data.lineas ?? []);
  }, []);

  const loadSlaConfig = useCallback(async () => {
    const response = await fetch("/api/sla-config", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { sla?: { alta: number; media: number; baja: number } };
    if (data.sla) {
      setSlaConfig(data.sla);
      setSlaConfigDrafts({
        alta: String(data.sla.alta),
        media: String(data.sla.media),
        baja: String(data.sla.baja),
      });
    }
  }, []);

  const loadAnomalousConfig = useCallback(async () => {
    const response = await fetch("/api/anomalous-config", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as {
      config?: { windowDays: number; zscore: number; typeWeights: Record<string, number> };
    };
    if (data.config) {
      setAnomalousConfig({
        windowDays: data.config.windowDays,
        zscore: data.config.zscore,
        typeWeights: data.config.typeWeights ?? {},
      });
      setAnomalousDrafts({
        windowDays: String(data.config.windowDays),
        zscore: String(data.config.zscore),
      });
      setWeightDrafts(
        Object.entries(data.config.typeWeights ?? {}).map(([tipo, peso]) => ({
          tipo,
          peso: String(peso),
        })),
      );
    }
  }, []);

  const createLinea = async () => {
    const raw = lineaForm.trim();
    if (!raw) {
      setLineaError("Introduce un c\u00F3digo de l\u00EDnea.");
      return;
    }
    setLineaSaving(true);
    setLineaError(null);
    try {
      // La API acepta tanto un string como un array; le mandamos el string
      // entero y el servidor se encarga de partir por separadores. Así soportamos
      // "GL-1, GL-30, GL-309" en un mismo input sin recalentar el cliente.
      const response = await fetch("/api/lineas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: raw }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        created?: string[];
        skipped?: string[];
        requested?: number;
      };
      if (!response.ok) {
        setLineaError(data.message ?? "No se pudo crear la l\u00EDnea.");
        return;
      }
      setLineaForm("");
      await loadLineas();

      const created = data.created ?? [];
      const skipped = data.skipped ?? [];
      if (created.length > 0 && skipped.length === 0) {
        setNotice({
          kind: "success",
          text:
            created.length === 1
              ? `Línea ${created[0]} creada.`
              : `${created.length} líneas creadas (${created.slice(0, 6).join(", ")}${created.length > 6 ? "…" : ""}).`,
        });
      } else if (created.length > 0 && skipped.length > 0) {
        setNotice({
          kind: "success",
          text: `${created.length} creadas · ${skipped.length} ya existían (omitidas).`,
        });
      } else if (created.length === 0 && skipped.length > 0) {
        setNotice({
          kind: "info",
          text:
            skipped.length === 1
              ? `La línea ${skipped[0]} ya existía.`
              : `Las ${skipped.length} líneas indicadas ya existían.`,
        });
      }
    } catch (error) {
      setLineaError(error instanceof Error ? error.message : "Error de red.");
    } finally {
      setLineaSaving(false);
    }
  };

  const deleteLinea = async (id: string) => {
    if (!confirm(`\u00BFEliminar la l\u00EDnea ${id}?`)) return;
    try {
      const response = await fetch(`/api/lineas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        setLineaError("No se pudo eliminar la l\u00EDnea.");
        return;
      }
      await loadLineas();
    } catch (error) {
      setLineaError(error instanceof Error ? error.message : "Error de red.");
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([load(), loadLineas(), loadSlaConfig(), loadAnomalousConfig()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [load, loadLineas, loadSlaConfig, loadAnomalousConfig]);

  // Auto-clear de avisos
  useEffect(() => {
    if (!notice) return;
    const handle = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(handle);
  }, [notice]);

  const filteredLineas = useMemo(() => {
    const q = lineaQuery.trim().toLowerCase();
    if (!q) return lineas;
    return lineas.filter((l) => l.toLowerCase().includes(q));
  }, [lineas, lineaQuery]);

  const flatAssets = useMemo(
    () => buses.flatMap((bus) => bus.assets.map((a) => ({ ...a, busId: bus.id }))),
    [buses],
  );

  const filteredAssets = useMemo(() => {
    const q = slaQuery.trim().toLowerCase();
    if (!q) return flatAssets;
    return flatAssets.filter(
      (a) =>
        a.busId.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q),
    );
  }, [flatAssets, slaQuery]);

  const filteredBuses = useMemo(() => {
    const q = busQuery.trim().toLowerCase();
    let result = buses;
    if (operatorFilter) {
      result = result.filter((b) => b.operator === operatorFilter);
    }
    if (q) {
      result = result.filter(
        (b) =>
          b.id.toLowerCase().includes(q) ||
          b.operator.toLowerCase().includes(q) ||
          b.municipio.toLowerCase().includes(q) ||
          b.lineas.some((l) => l.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [buses, busQuery, operatorFilter]);

  /** Lista de operadoras únicas con su conteo (orden alfabético). */
  const operatorOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of buses) {
      const key = b.operator || "Sin operadora";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [buses]);

  // ── KPIs en vivo (sobre `buses`) ──────────────────────────────────────────
  const kpis = useMemo(() => {
    const operadoras = new Set(buses.map((b) => b.operator).filter(Boolean));
    const municipios = new Set(buses.map((b) => b.municipio).filter(Boolean));
    const sinLineas = buses.filter((b) => !b.lineas || b.lineas.length === 0).length;
    const totalAssets = buses.reduce((acc, b) => acc + b.assets.length, 0);
    return {
      totalBuses: buses.length,
      operadoras: operadoras.size,
      municipios: municipios.size,
      sinLineas,
      totalAssets,
    };
  }, [buses]);

  const formValid = form.id.trim() && form.operator.trim();

  const createBus = async () => {
    if (!formValid) {
      setNotice({ kind: "error", text: "Indica al menos ID y operadora." });
      return;
    }
    const payload = {
      id: form.id.trim(),
      operator: form.operator.trim(),
      municipio: form.municipio.trim(),
      lineas: form.lineas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setNotice({ kind: "error", text: "No se pudo crear el bus." });
      return;
    }
    setForm({ id: "", operator: "", municipio: "", lineas: "" });
    await load();
    setNotice({ kind: "success", text: `Bus ${payload.id} creado.` });
  };

  const deleteBus = async (id: string) => {
    if (
      !confirm(
        `¿Eliminar el bus ${id}?\n\nSe borrarán también sus activos y tareas de mantenimiento.\nNo se podrá deshacer.`,
      )
    ) {
      return;
    }
    try {
      const response = await fetch(
        `/api/catalog?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        reason?: string;
        ticketCount?: number;
      };
      if (!response.ok) {
        // Mostramos el motivo concreto que devuelve el backend
        // (FK con tickets, sin permisos, no existe…).
        setNotice({
          kind: "error",
          text:
            data.message ??
            `No se pudo eliminar el bus ${id} (HTTP ${response.status}).`,
        });
        return;
      }
      await load();
      setNotice({
        kind: "success",
        text: data.message ?? `Bus ${id} eliminado.`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? `No se pudo eliminar el bus ${id}: ${error.message}`
            : `Error de red eliminando el bus ${id}.`,
      });
    }
  };

  const saveSlaConfig = async () => {
    const parseMin = (raw: string) => {
      const v = Number.parseInt(raw, 10);
      return Number.isFinite(v) ? v : NaN;
    };
    const alta = parseMin(slaConfigDrafts.alta);
    const media = parseMin(slaConfigDrafts.media);
    const baja = parseMin(slaConfigDrafts.baja);
    if (
      !Number.isFinite(alta) || alta < 1 ||
      !Number.isFinite(media) || media < 1 ||
      !Number.isFinite(baja) || baja < 1
    ) {
      setNotice({ kind: "error", text: "SLA inválido: los tres valores deben ser enteros ≥ 1 minuto." });
      return;
    }
    if (alta > media || media > baja) {
      setNotice({
        kind: "info",
        text: "Aviso: lo habitual es alta < media < baja. Guardado igualmente.",
      });
    }
    setSlaConfigSaving(true);
    try {
      const response = await fetch("/api/sla-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alta, media, baja }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setNotice({ kind: "error", text: data.message ?? "No se pudo guardar el SLA." });
        return;
      }
      await loadSlaConfig();
      setNotice({ kind: "success", text: "SLA por prioridad actualizado." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Error de red guardando SLA.",
      });
    } finally {
      setSlaConfigSaving(false);
    }
  };

  const saveAnomalousConfig = async () => {
    const windowDays = Number.parseInt(anomalousDrafts.windowDays, 10);
    const zscore = Number.parseFloat(anomalousDrafts.zscore);
    if (!Number.isFinite(windowDays) || windowDays < 7 || windowDays > 180) {
      setNotice({ kind: "error", text: "La ventana debe estar entre 7 y 180 días." });
      return;
    }
    if (!Number.isFinite(zscore) || zscore < 0.5 || zscore > 5) {
      setNotice({ kind: "error", text: "El umbral (z-score) debe estar entre 0.5 y 5.0." });
      return;
    }
    // Construye typeWeights desde los drafts, descartando filas vacías y
    // duplicados (gana el último). Pesos válidos: 0 ≤ peso ≤ 10.
    const typeWeights: Record<string, number> = {};
    for (const { tipo, peso } of weightDrafts) {
      const tipoClean = tipo.trim();
      if (!tipoClean) continue;
      const pesoNum = Number.parseFloat(peso);
      if (!Number.isFinite(pesoNum) || pesoNum < 0 || pesoNum > 10) {
        setNotice({
          kind: "error",
          text: `Peso inválido para "${tipoClean}". Debe estar entre 0 y 10.`,
        });
        return;
      }
      typeWeights[tipoClean] = Math.round(pesoNum * 10) / 10;
    }
    setAnomalousSaving(true);
    try {
      const response = await fetch("/api/anomalous-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowDays, zscore, typeWeights }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setNotice({ kind: "error", text: data.message ?? "No se pudo guardar la configuración." });
        return;
      }
      await loadAnomalousConfig();
      setNotice({ kind: "success", text: "Detección de buses anómalos actualizada." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Error de red.",
      });
    } finally {
      setAnomalousSaving(false);
    }
  };

  const saveAssetSla = async (assetId: string) => {
    const raw = slaDrafts[assetId]?.trim() ?? "";
    const payload = raw === "" ? { slaMinutes: null } : { slaMinutes: Number.parseInt(raw, 10) };
    if (raw !== "" && (!Number.isFinite(payload.slaMinutes as number) || (payload.slaMinutes as number) < 5)) {
      setNotice({ kind: "error", text: "SLA inv\u00E1lido: entero \u2265 5 minutos o vac\u00EDo." });
      return;
    }
    const response = await fetch(`/api/catalog/assets/${encodeURIComponent(assetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setNotice({ kind: "error", text: "No se pudo guardar el SLA del activo." });
      return;
    }
    await load();
    setNotice({ kind: "success", text: "SLA del activo actualizado." });
  };

  // Descarga la plantilla XLSX (formateada con cabeceras, ejemplos e instrucciones)
  // desde el endpoint del server. Mantiene un fallback CSV mínimo si el endpoint
  // no responde (ej. red caída del lado del cliente).
  const downloadTemplate = async () => {
    try {
      const response = await fetch("/api/catalog/templates/buses", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo generar la plantilla.");
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "plantilla-catalogo-buses.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Error descargando plantilla.",
      });
    }
  };

  const downloadLineaTemplate = async () => {
    try {
      const response = await fetch("/api/catalog/templates/lineas", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo generar la plantilla de líneas.");
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "plantilla-catalogo-lineas.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setLineaError(error instanceof Error ? error.message : "Error descargando plantilla.");
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    if (importFileInput.current) importFileInput.current.value = "";
  };

  const onPickImportFile = (file: File | null) => {
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    if (!file) return;
    void runImportPreview(file);
  };

  const runImportPreview = async (file: File) => {
    setImportLoading("preview");
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/catalog/import?dryRun=1", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as Partial<ImportPreviewResponse> & {
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setImportError(data.message ?? "No se pudo procesar el archivo.");
        return;
      }
      setImportPreview(data as ImportPreviewResponse);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Error de red.");
    } finally {
      setImportLoading(null);
    }
  };

  const runImportCommit = async () => {
    if (!importFile || importLoading) return;
    setImportLoading("commit");
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await fetch("/api/catalog/import", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as Partial<ImportCommitResponse> & {
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setImportError(data.message ?? "No se pudo completar la importaci\u00F3n.");
        return;
      }
      setImportResult(data as ImportCommitResponse);
      setImportPreview(null);
      await load();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Error de red.");
    } finally {
      setImportLoading(null);
    }
  };

  // ── Handlers de import de Lineas (espejo de los de Buses) ─────────────────
  const resetLineaImport = () => {
    setLineaImportFile(null);
    setLineaImportPreview(null);
    setLineaImportResult(null);
    setLineaImportError(null);
    if (lineaImportFileInput.current) lineaImportFileInput.current.value = "";
  };

  const runLineaImportPreview = async (file: File) => {
    setLineaImportLoading("preview");
    setLineaImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/lineas/import?dryRun=1", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as Partial<LineaImportPreviewResponse> & {
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setLineaImportError(data.message ?? "No se pudo procesar el archivo.");
        return;
      }
      setLineaImportPreview(data as LineaImportPreviewResponse);
    } catch (error) {
      setLineaImportError(error instanceof Error ? error.message : "Error de red.");
    } finally {
      setLineaImportLoading(null);
    }
  };

  const onPickLineaImportFile = (file: File | null) => {
    setLineaImportFile(file);
    setLineaImportPreview(null);
    setLineaImportResult(null);
    setLineaImportError(null);
    if (!file) return;
    void runLineaImportPreview(file);
  };

  const runLineaImportCommit = async () => {
    if (!lineaImportFile || lineaImportLoading) return;
    setLineaImportLoading("commit");
    setLineaImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", lineaImportFile);
      const response = await fetch("/api/lineas/import", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as Partial<LineaImportCommitResponse> & {
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setLineaImportError(data.message ?? "No se pudo completar la importación.");
        return;
      }
      setLineaImportResult(data as LineaImportCommitResponse);
      setLineaImportPreview(null);
      await loadLineas();
    } catch (error) {
      setLineaImportError(error instanceof Error ? error.message : "Error de red.");
    } finally {
      setLineaImportLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="catalog-admin space-y-4">
        <Skeleton className="catalog-admin-hero h-36 rounded-2xl" />
        <Skeleton className="h-12 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="catalog-admin space-y-5">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <header className="catalog-admin-hero">
        <div aria-hidden className="catalog-admin-hero__glow" />
        {/* Movil: titulo + KPIs apilados; tablet+: horizontal. */}
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 ring-1 ring-emerald-500/25 text-emerald-300">
              <Boxes size={18} strokeWidth={1.7} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="ccmgc-eyebrow dashboard-pretitle">
                <span className="ccmgc-eyebrow-dot ccmgc-eyebrow-dot--pulse dashboard-pretitle-dot dashboard-pretitle-dot--pulse" aria-hidden />
                CCMGC · Administración
              </div>
              <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[var(--color-text-1)]">
                Gestión de catálogo
              </h1>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug text-[var(--color-text-3)]">
                Alta, baja e importación masiva de buses; SLA por activo y líneas de servicio.
              </p>
            </div>
          </div>

          {/* KPIs en vivo */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Kpi icon={<Hash size={11} strokeWidth={1.7} aria-hidden />} label="Buses" value={kpis.totalBuses} />
            <Kpi
              icon={<Building2 size={11} strokeWidth={1.7} aria-hidden />}
              label="Operadoras"
              value={kpis.operadoras}
            />
            <Kpi
              icon={<MapPin size={11} strokeWidth={1.7} aria-hidden />}
              label="Municipios"
              value={kpis.municipios}
            />
            <Kpi
              icon={<Route size={11} strokeWidth={1.7} aria-hidden />}
              label="Líneas"
              value={lineas.length}
              hint={kpis.sinLineas > 0 ? `${kpis.sinLineas} buses sin líneas` : undefined}
              tone={kpis.sinLineas > 0 ? "warning" : "neutral"}
            />
          </div>
        </div>
      </header>

      {/* Notice flotante */}
      {notice ? (
        <div
          role="status"
          className={cn(
            "catalog-admin-notice",
            notice.kind === "success"
              ? "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]"
              : notice.kind === "error"
                ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)] text-[var(--color-error)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]",
          )}
        >
          {notice.kind === "success" ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden />
          ) : notice.kind === "error" ? (
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
          ) : (
            <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          )}
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
            aria-label="Cerrar aviso"
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      ) : null}

      {/* ── BARRA DE PESTAÑAS INTERNAS ──────────────────────────────────── */}
      <nav
        role="tablist"
        aria-label="Secciones del catálogo"
        className="catalog-admin-tabs"
      >
        <CatalogTabButton
          icon={Boxes}
          label="Buses"
          count={buses.length}
          active={tab === "buses"}
          onClick={() => setTab("buses")}
        />
        <CatalogTabButton
          icon={Route}
          label="Líneas"
          count={lineas.length}
          active={tab === "lineas"}
          onClick={() => setTab("lineas")}
        />
        <CatalogTabButton
          icon={Timer}
          label="SLA"
          active={tab === "sla"}
          onClick={() => setTab("sla")}
        />
        <CatalogTabButton
          icon={AlertTriangle}
          label="Buses anómalos"
          active={tab === "anomalous"}
          tone="rose"
          onClick={() => setTab("anomalous")}
        />
      </nav>

      {/* ── NUEVO BUS + IMPORTAR (grid 2 col en lg) ──────────────────────── */}
      {tab === "buses" ? (
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Nuevo bus */}
        <section className="catalog-admin-section catalog-admin-section--emerald lg:col-span-2">
          <header className="catalog-admin-section__head">
            <div className="flex items-center gap-2">
              <div className="catalog-admin-section__icon">
                <Plus size={15} strokeWidth={1.8} aria-hidden />
              </div>
              <div>
                <h2 className="text-subheading">Nuevo bus</h2>
                <p className="text-[11.5px] text-[var(--color-text-3)]">Alta manual rápida.</p>
              </div>
            </div>
          </header>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ID bus" hint="Ej. GC-120">
              <Input
                className="catalog-admin-input catalog-admin-input--mono"
                placeholder="GC-120"
                value={form.id}
                onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))}
              />
            </Field>
            <Field label="Operadora" hint="Empresa">
              <Input
                className="catalog-admin-input"
                placeholder="Global Salcai"
                value={form.operator}
                onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value }))}
              />
            </Field>
            <Field label="Municipio" hint="Opcional">
              <Input
                className="catalog-admin-input"
                placeholder="Las Palmas"
                value={form.municipio}
                onChange={(e) => setForm((p) => ({ ...p, municipio: e.target.value }))}
              />
            </Field>
            <Field label="Líneas" hint="Separadas por coma">
              <Input
                className="catalog-admin-input"
                placeholder="1, 12, 26"
                value={form.lineas}
                onChange={(e) => setForm((p) => ({ ...p, lineas: e.target.value }))}
              />
            </Field>
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            className="mt-4"
            onClick={() => void createBus()}
            disabled={!formValid}
          >
            <Plus size={14} strokeWidth={2} aria-hidden /> Crear bus
          </Button>
        </section>

        {/* Importacion masiva */}
        <section className="catalog-admin-section catalog-admin-section--sky lg:col-span-3">
          <header className="catalog-admin-section__head">
            <div className="flex items-center gap-2">
            <div className="catalog-admin-section__icon">
              <FileSpreadsheet size={15} strokeWidth={1.8} aria-hidden />
            </div>
              <div>
                <h2 className="text-subheading">Importar desde Excel / CSV</h2>
                <p className="max-w-md text-[11.5px] text-[var(--color-text-3)]">
                  Columnas: <span className="font-mono text-[var(--color-text-2)]">id, operator, municipio, lineas</span>.
                  Las líneas pueden ir con coma, punto y coma o barra.
                </p>
              </div>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={downloadTemplate}>
              Descargar plantilla
            </Button>
          </header>

          <div className="mt-4">
            <input
              ref={importFileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => onPickImportFile(event.target.files?.[0] ?? null)}
            />
            <BusImportDropzone
              file={importFile}
              loading={importLoading}
              onPick={() => importFileInput.current?.click()}
              onDropFile={(f) => onPickImportFile(f)}
              onReset={resetImport}
            />
          </div>

          {importError ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-3 py-2 text-[12.5px] text-[var(--color-error)]"
            >
              <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
              <span>{importError}</span>
            </div>
          ) : null}

          {importPreview ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/25">
                  {importPreview.validRows} válidas
                </span>
                {importPreview.errors.length > 0 ? (
                  <span className="rounded-full bg-[var(--color-warning-light)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-warning)] ring-1 ring-[var(--color-warning)]/30">
                    {importPreview.errors.length} con errores
                  </span>
                ) : null}
                <span className="text-[11px] text-[var(--color-text-3)]">
                  de {importPreview.totalRows} totales
                </span>
              </div>

              {importPreview.preview.length > 0 ? (
                <div className="catalog-admin-table-wrap">
                  <table className="catalog-admin-table ccmgc-table min-w-[480px]">
                    <thead className="bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Fila</th>
                        <th className="px-2 py-1.5 text-left">ID</th>
                        <th className="px-2 py-1.5 text-left">Operadora</th>
                        <th className="px-2 py-1.5 text-left">Municipio</th>
                        <th className="px-2 py-1.5 text-left">Líneas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.preview.map((row, idx) => (
                        <tr
                          key={row.rowNumber}
                          className={`border-t border-[var(--color-border)] ${idx % 2 ? "bg-[var(--color-surface-2)]/40" : ""}`}
                        >
                          <td className="px-2 py-1 font-mono text-[var(--color-text-3)]">{row.rowNumber}</td>
                          <td className="px-2 py-1 font-mono">{row.id}</td>
                          <td className="px-2 py-1">{row.operator}</td>
                          <td className="px-2 py-1">{row.municipio}</td>
                          <td className="px-2 py-1">{row.lineas.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreview.validRows > importPreview.preview.length ? (
                    <p className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-2 py-1.5 text-[10px] text-[var(--color-text-3)]">
                      Mostrando las primeras {importPreview.preview.length} filas. Las{" "}
                      {importPreview.validRows - importPreview.preview.length} restantes se importarán igualmente.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {importPreview.errors.length > 0 ? (
                <details className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning-light)]/40 p-2">
                  <summary className="cursor-pointer text-[11.5px] font-medium text-[var(--color-warning)]">
                    Ver {importPreview.errors.length} filas con error
                  </summary>
                  <ul className="mt-2 space-y-1 text-[11.5px] text-[var(--color-text-2)]">
                    {importPreview.errors.map((err, idx) => (
                      <li key={`${err.rowNumber}-${idx}`} className="flex gap-2">
                        <span className="font-mono text-[var(--color-text-3)]">Fila {err.rowNumber}</span>
                        <span>
                          {err.rawId ? `(${err.rawId})` : ""} {"\u2014"} {err.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
                <button
                  type="button"
                  onClick={resetImport}
                  disabled={importLoading === "commit"}
                  className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12.5px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void runImportCommit()}
                  disabled={importLoading === "commit" || importPreview.validRows === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importLoading === "commit" ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Importando…
                    </>
                  ) : (
                    <>Importar {importPreview.validRows} buses</>
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {importResult ? (
            <div
              className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success-light)] px-3 py-3 text-[12.5px] text-[var(--color-success)]"
              role="status"
            >
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">Importación completada</p>
                <ul className="mt-1 list-disc pl-5 text-[11.5px] text-[var(--color-text-2)]">
                  <li>Buses creados: {importResult.created}</li>
                  {importResult.skippedExisting > 0 ? <li>Saltados por ya existir: {importResult.skippedExisting}</li> : null}
                  {importResult.errors.length > 0 ? <li>Con error: {importResult.errors.length}</li> : null}
                </ul>
                {importResult.errors.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[11.5px] text-[var(--color-text-2)]">
                    {importResult.errors.map((err, idx) => (
                      <li key={`${err.rowNumber}-${idx}`}>
                        Fila {err.rowNumber} {err.rawId ? `(${err.rawId})` : ""} {"\u2014"} {err.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={resetImport}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
      ) : null}

      {/* ── BUSES ACTUALES ──────────────────────────────────────────────── */}
      {tab === "buses" ? (
      <section className="catalog-admin-section">
        <header className="catalog-admin-section__head">
          <div>
            <h2 className="text-subheading">Buses actuales</h2>
            <p className="text-[11.5px] text-[var(--color-text-3)]">
              {filteredBuses.length} de {buses.length} buses
              {kpis.totalAssets > 0 ? ` \u00B7 ${kpis.totalAssets} activos` : ""}
              {operatorFilter ? (
                <>
                  {" · filtrado por "}
                  <strong className="text-[var(--color-text-2)]">{operatorFilter}</strong>
                </>
              ) : null}
            </p>
          </div>
          <div className="catalog-admin-search">
            <Search size={13} strokeWidth={1.5} aria-hidden />
            <Input
              type="search"
              className="catalog-admin-input"
              value={busQuery}
              onChange={(e) => setBusQuery(e.target.value)}
              placeholder="Buscar bus, operadora, municipio…"
              aria-label="Filtrar buses"
            />
          </div>
        </header>

        {/* Chips de filtro por operadora */}
        {operatorOptions.length > 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)]">
              Operadora
            </span>
            <button
              type="button"
              onClick={() => setOperatorFilter(null)}
              className={cn(
                "catalog-admin-chip",
                operatorFilter === null && "catalog-admin-chip--active",
              )}
            >
              Todas
              <span className="opacity-70">({buses.length})</span>
            </button>
            {operatorOptions.map((op) => {
              const active = operatorFilter === op.name;
              const tone = operatorTone(op.name);
              return (
                <button
                  key={op.name}
                  type="button"
                  onClick={() => setOperatorFilter(active ? null : op.name)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    active
                      ? `${tone.chipActive} shadow-sm`
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
                  )}
                  title={`Filtrar por ${op.name}`}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden />
                  {op.name}
                  <span className="opacity-70">({op.count})</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="catalog-admin-table-wrap">
          <table className="catalog-admin-table ccmgc-table min-w-[680px]">
            <thead>
              <tr>
                <th className="px-3 py-2">Bus</th>
                <th className="px-3 py-2">Operadora</th>
                <th className="px-3 py-2">Municipio</th>
                <th className="px-3 py-2">Líneas</th>
                <th className="px-3 py-2">Activos</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-[12.5px] text-[var(--color-text-3)]">
                    {busQuery
                      ? `Sin resultados para "${busQuery}".`
                      : operatorFilter
                        ? `No hay buses de "${operatorFilter}" con esos filtros.`
                        : "Aún no hay buses en el catálogo."}
                  </td>
                </tr>
              ) : (
                filteredBuses.map((bus, idx) => {
                  const tone = operatorTone(bus.operator);
                  return (
                    <tr
                      key={bus.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/flota/${encodeURIComponent(bus.id)}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/flota/${encodeURIComponent(bus.id)}`);
                        }
                      }}
                      className={cn(
                        "cursor-pointer border-t border-[var(--color-border)]/80 transition-colors hover:bg-[var(--color-accent-light)]/25",
                        idx % 2 ? "bg-[var(--color-surface-2)]/40" : "",
                      )}
                    >
                      {/* Bus = avatar (iniciales operadora) + ID */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wide ring-1",
                              tone.avatar,
                            )}
                            title={bus.operator || "Sin operadora"}
                          >
                            {operatorInitials(bus.operator)}
                          </span>
                          <span className="font-mono text-[12.5px] font-medium text-[var(--color-text-1)]">
                            <Link
                              href={`/flota/${encodeURIComponent(bus.id)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-[var(--color-accent)] hover:underline"
                              title="Ver detalle del bus"
                            >
                              {bus.id}
                            </Link>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {bus.operator ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOperatorFilter(bus.operator);
                            }}
                            className="rounded text-[var(--color-text-2)] hover:text-[var(--color-text-1)] hover:underline"
                            title="Filtrar por esta operadora"
                          >
                            {bus.operator}
                          </button>
                        ) : (
                          <span className="text-[var(--color-text-3)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-2)]">
                        {bus.municipio || <span className="text-[var(--color-text-3)]">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {bus.lineas.length === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-warning-light)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-warning)] ring-1 ring-[var(--color-warning)]/25">
                            <AlertCircle size={9} aria-hidden /> Sin líneas
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {bus.lineas.slice(0, 6).map((l) => (
                              <button
                                key={l}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingLinea(l);
                                }}
                                className="num-tabular rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-2)] transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-200"
                                title={`Editar línea ${l}`}
                              >
                                {l}
                              </button>
                            ))}
                            {bus.lineas.length > 6 ? (
                              <span
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-3)]"
                                title={bus.lineas.slice(6).join(", ")}
                              >
                                +{bus.lineas.length - 6}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      {/* Mini chips por tipo de activo */}
                      <td className="px-3 py-2">
                        {bus.assets.length === 0 ? (
                          <span className="text-[11px] text-[var(--color-text-3)]">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(
                              bus.assets.reduce<Record<string, number>>((acc, a) => {
                                acc[a.type] = (acc[a.type] ?? 0) + 1;
                                return acc;
                              }, {}),
                            ).map(([type, count]) => {
                              const aTone = assetTone(type);
                              return (
                                <span
                                  key={type}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1",
                                    aTone,
                                  )}
                                  title={`${count} × ${type}`}
                                >
                                  <span className="capitalize">{type}</span>
                                  {count > 1 ? <span className="opacity-80">×{count}</span> : null}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/flota/${encodeURIComponent(bus.id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11.5px] text-[var(--color-text-3)] transition-colors hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-300"
                            title="Ver detalle del bus"
                            aria-label={`Ver detalle del bus ${bus.id}`}
                          >
                            <ExternalLink size={11} strokeWidth={1.9} aria-hidden />
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingBus(bus);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11.5px] text-[var(--color-text-3)] transition-colors hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-300"
                            aria-label={`Editar bus ${bus.id}`}
                            title="Editar bus"
                          >
                            <Pencil size={11} strokeWidth={1.9} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteBus(bus.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11.5px] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-error)]/40 hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                            aria-label={`Eliminar bus ${bus.id}`}
                            title="Eliminar"
                          >
                            <Trash2 size={11} strokeWidth={1.7} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {/* ── SLA POR PRIORIDAD (global) ──────────────────────────────────── */}
      {tab === "sla" ? (
      <>
      <div className="rounded-lg border border-violet-400/30 bg-violet-500/8 px-3 py-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-violet-200">
          Configuración SLA separada del catálogo de buses
        </p>
        <p className="mt-0.5 text-[11.5px] text-[var(--color-text-2)]">
          Aquí ajustas tiempos y reglas globales. La gestión de buses queda en la pestaña "Buses".
        </p>
      </div>
      <section className="catalog-admin-section catalog-admin-section--violet">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/12 text-orange-300">
              <Timer size={15} strokeWidth={1.8} aria-hidden />
            </div>
            <div>
              <h2 className="text-subheading">SLA por prioridad</h2>
              <p className="max-w-xl text-[11.5px] text-[var(--color-text-3)]">
                Tiempo objetivo (en minutos) para que un ticket se considere vencido, según su prioridad
                calculada. Estos valores se usan en TODOS los tickets salvo que el activo tenga un SLA
                propio definido más abajo (que tiene prioridad sobre estos).
              </p>
            </div>
          </div>
          {slaConfig ? (
            <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[11.5px] text-[var(--color-text-2)] ring-1 ring-[var(--color-border)]">
              Vigente: A {slaConfig.alta}m · M {slaConfig.media}m · B {slaConfig.baja}m
            </span>
          ) : null}
        </header>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["alta", "media", "baja"] as const).map((priority) => {
            const accent =
              priority === "alta"
                ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-300"
                : priority === "media"
                  ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300";
            const label = priority === "alta" ? "Alta" : priority === "media" ? "Media" : "Baja";
            const hint =
              priority === "alta"
                ? "Corte de servicio / 3+ líneas afectadas"
                : priority === "media"
                  ? "SAE/router o 2 líneas afectadas"
                  : "Resto de incidencias";
            return (
              <div
                key={priority}
                className={`rounded-xl border ${accent} p-3 ring-1 ring-transparent`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wide">{label}</span>
                  <span className="text-[10px] opacity-70">{hint}</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    className="num-tabular w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[14px] font-semibold text-[var(--color-text-1)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                    value={slaConfigDrafts[priority]}
                    onChange={(e) =>
                      setSlaConfigDrafts((d) => ({ ...d, [priority]: e.target.value }))
                    }
                    placeholder={priority === "alta" ? "30" : priority === "media" ? "120" : "240"}
                  />
                  <span className="text-[11.5px] text-[var(--color-text-3)]">minutos</span>
                </div>
                {slaConfig ? (
                  <p className="mt-1.5 text-[10.5px] text-[var(--color-text-3)]">
                    Actual: <span className="num-tabular">{slaConfig[priority]}</span> min
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--color-text-3)]">
            Cambiando estos valores se actualiza el SLA por defecto de los próximos tickets. Los tickets ya
            creados conservan su vencimiento original.
          </p>
          <button
            type="button"
            onClick={() => void saveSlaConfig()}
            disabled={slaConfigSaving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {slaConfigSaving ? (
              <>
                <Loader2 size={12} className="animate-spin" aria-hidden /> Guardando…
              </>
            ) : (
              <>Guardar SLA</>
            )}
          </button>
        </div>
      </section>
      </>
      ) : null}

      {/* ── BUSES ANÓMALOS ──────────────────────────────────────────────── */}
      {tab === "anomalous" ? (
      <section className="catalog-admin-section catalog-admin-section--violet">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/12 text-rose-300">
              <AlertTriangle size={15} strokeWidth={1.8} aria-hidden />
            </div>
            <div>
              <h2 className="text-subheading">Buses anómalos</h2>
              <p className="max-w-xl text-[11.5px] text-[var(--color-text-3)]">
                Detección automática de buses con un volumen de incidencias inusualmente alto en la ventana
                de tiempo configurada. El banner aparece en Preventivo.
              </p>
            </div>
          </div>
          {anomalousConfig ? (
            <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[11.5px] text-[var(--color-text-2)] ring-1 ring-[var(--color-border)]">
              Vigente: {anomalousConfig.windowDays}d · z≥{anomalousConfig.zscore}
            </span>
          ) : null}
        </header>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 text-rose-300 ring-1 ring-transparent">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wide">Ventana de análisis</span>
              <span className="text-[10px] opacity-70">7 a 180 días</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="number"
                min={7}
                max={180}
                className="num-tabular w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[14px] font-semibold text-[var(--color-text-1)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                value={anomalousDrafts.windowDays}
                onChange={(e) =>
                  setAnomalousDrafts((d) => ({ ...d, windowDays: e.target.value }))
                }
                placeholder="12"
              />
              <span className="text-[11.5px] text-[var(--color-text-3)]">días</span>
            </div>
            <p className="mt-1.5 text-[10.5px] text-[var(--color-text-3)]">
              Cuanto menor, antes detecta picos recientes. Habitual: 12–30 días.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-amber-300 ring-1 ring-transparent">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wide">Umbral (z-score)</span>
              <span className="text-[10px] opacity-70">0.5 a 5.0</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="number"
                min={0.5}
                max={5}
                step={0.1}
                className="num-tabular w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[14px] font-semibold text-[var(--color-text-1)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                value={anomalousDrafts.zscore}
                onChange={(e) =>
                  setAnomalousDrafts((d) => ({ ...d, zscore: e.target.value }))
                }
                placeholder="1.5"
              />
              <span className="text-[11.5px] text-[var(--color-text-3)]">σ sobre la media</span>
            </div>
            <p className="mt-1.5 text-[10.5px] text-[var(--color-text-3)]">
              1.5 = sensible. 2.0 = equilibrado. 2.5+ = solo casos extremos.
            </p>
          </div>
        </div>

        {/* Pesos por tipo (fase 3 sugerencia Ibrahim). Un peso > 1 hace que ese
            tipo de incidencia cuente más al puntuar el bus; un peso < 1 lo
            relativiza. Sin entradas, todo pesa 1. */}
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[12.5px] font-semibold text-[var(--color-text-1)]">
                Pesos por tipo de incidencia
              </p>
              <p className="text-[10.5px] text-[var(--color-text-3)]">
                Una avería de puerta puede valer más que un parte de aire: ajusta el peso
                para que el algoritmo lo refleje. Tipos sin entrada pesan 1.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWeightDrafts((rows) => [...rows, { tipo: "", peso: "1.5" }])}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-2)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-1)]"
            >
              <Plus size={11} strokeWidth={2} aria-hidden /> Añadir tipo
            </button>
          </div>
          {weightDrafts.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/30 px-3 py-2 text-[11.5px] text-[var(--color-text-3)]">
              No hay pesos personalizados. Pulsa "Añadir tipo" para empezar
              (ej. <code className="text-[var(--color-text-2)]">Apertura/cierre puertas</code> con peso{" "}
              <code className="text-[var(--color-text-2)]">3</code>).
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {weightDrafts.map((row, idx) => (
                <li key={idx} className="grid grid-cols-[1fr_88px_auto] items-center gap-1.5">
                  <input
                    type="text"
                    value={row.tipo}
                    onChange={(e) =>
                      setWeightDrafts((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, tipo: e.target.value } : r)),
                      )
                    }
                    placeholder="Tipo de incidencia (ej: Apertura/cierre puertas)"
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                  />
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={row.peso}
                    onChange={(e) =>
                      setWeightDrafts((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, peso: e.target.value } : r)),
                      )
                    }
                    className="num-tabular rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setWeightDrafts((rows) => rows.filter((_, i) => i !== idx))}
                    className="rounded-md p-1.5 text-[var(--color-text-3)] hover:bg-rose-500/15 hover:text-rose-300"
                    aria-label="Quitar peso"
                    title="Quitar peso"
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--color-text-3)]">
            Los cambios afectan al banner de buses anómalos en Preventivo
          </p>
          <button
            type="button"
            onClick={() => void saveAnomalousConfig()}
            disabled={anomalousSaving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {anomalousSaving ? (
              <>
                <Loader2 size={12} className="animate-spin" aria-hidden /> Guardando…
              </>
            ) : (
              <>Guardar configuración</>
            )}
          </button>
        </div>
      </section>
      ) : null}

      {/* ── SLA POR ACTIVO ──────────────────────────────────────────────── */}
      {tab === "buses" && flatAssets.length > 0 ? (
        <section className="catalog-admin-section catalog-admin-section--violet">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/12 text-amber-300">
                <Timer size={15} strokeWidth={1.8} aria-hidden />
              </div>
              <div>
                <h2 className="text-subheading">SLA por activo</h2>
                <p className="text-[11.5px] text-[var(--color-text-3)]">
                  Minutos hasta el vencimiento al crear un ticket. Vacío {"="} usar SLA según prioridad.
                </p>
              </div>
            </div>
            <div className="relative w-full max-w-xs">
              <Search
                size={13}
                strokeWidth={1.5}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
                aria-hidden
              />
              <input
                type="search"
                value={slaQuery}
                onChange={(e) => setSlaQuery(e.target.value)}
                placeholder="Buscar bus, activo o tipo…"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-2.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                aria-label="Filtrar activos"
              />
            </div>
          </header>

          <div className="catalog-admin-table-wrap">
            <table className="catalog-admin-table ccmgc-table min-w-[640px]">
              <thead>
                <tr>
                  <th className="px-3 py-2">Bus</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">SLA (min)</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[12.5px] text-[var(--color-text-3)]">
                      Sin resultados.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-t border-[var(--color-border)]/80 ${idx % 2 ? "bg-[var(--color-surface-2)]/40" : ""}`}
                    >
                      <td className="px-3 py-2 font-mono text-[12px] text-[var(--color-text-2)]">{row.busId}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[var(--color-text-2)]">{row.id}</td>
                      <td className="px-3 py-2 text-[var(--color-text-2)]">{row.type}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={5}
                          className="num-tabular w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12.5px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                          value={slaDrafts[row.id] ?? ""}
                          onChange={(e) => setSlaDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                          placeholder="auto"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void saveAssetSla(row.id)}
                            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11.5px] text-[var(--color-text-2)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-text-1)]"
                          >
                            Guardar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── CATÁLOGO DE LÍNEAS ──────────────────────────────────────────── */}
      {tab === "lineas" ? (
      <section className="catalog-admin-section catalog-admin-section--violet">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/12 text-violet-300">
              <Route size={15} strokeWidth={1.8} aria-hidden />
            </div>
            <div>
              <h2 className="text-subheading">Líneas (servicios)</h2>
              <p className="max-w-xl text-[11.5px] text-[var(--color-text-3)]">
                Catálogo libre de líneas. Alimenta el autocompletar del campo &quot;Servicio / línea&quot;
                en el formulario de nuevo ticket. No están atadas a buses concretos.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[11.5px] text-[var(--color-text-2)] ring-1 ring-[var(--color-border)]">
              {lineas.length} líneas
            </span>
            <button
              type="button"
              onClick={() => void downloadLineaTemplate()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--color-text-2)] hover:border-violet-400/40 hover:text-[var(--color-text-1)]"
              title="Descargar plantilla Excel"
            >
              <FileSpreadsheet size={12} aria-hidden /> Descargar plantilla
            </button>
            <input
              ref={lineaImportFileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => onPickLineaImportFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => lineaImportFileInput.current?.click()}
              disabled={lineaImportLoading === "commit"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--color-text-1)] hover:border-violet-400/50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Importar líneas desde Excel/CSV"
            >
              <Upload size={12} aria-hidden /> Importar fichero
            </button>
          </div>
        </header>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 space-y-1">
            <span className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
              Añadir línea(s)
              <span className="text-[10px] normal-case tracking-normal opacity-70">
                Separadas por coma, espacio o nueva línea
              </span>
            </span>
            <textarea
              className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
              placeholder={"Ej: GL-1, GL-30, GL-309\nO una por línea:\nGL-15\nGL-16\nGL-17"}
              value={lineaForm}
              onChange={(e) => setLineaForm(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/Cmd + Enter envía. Enter solo añade salto de línea (UX
                // de textarea normal, para que el usuario pueda pegar listas).
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void createLinea();
                }
              }}
              disabled={lineaSaving}
              rows={2}
            />
          </label>
          <button
            type="button"
            onClick={() => void createLinea()}
            disabled={lineaSaving || !lineaForm.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            title="Ctrl+Enter para añadir"
          >
            {lineaSaving ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <Plus size={13} aria-hidden strokeWidth={2} />
            )}
            Añadir
          </button>
          <div className="relative ml-auto">
            <Search
              size={13}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]"
              aria-hidden
            />
            <input
              type="search"
              value={lineaQuery}
              onChange={(e) => setLineaQuery(e.target.value)}
              placeholder="Buscar línea…"
              className="w-[200px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-2.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
              aria-label="Filtrar líneas"
            />
          </div>
        </div>

        {lineaError ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-3 py-2 text-[12.5px] text-[var(--color-error)]"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>{lineaError}</span>
          </div>
        ) : null}

        {/* Bloque de IMPORT de líneas: archivo elegido + preview + commit */}
        {(lineaImportFile || lineaImportPreview || lineaImportResult || lineaImportError || lineaImportLoading) ? (
          <div className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/[0.04] p-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <FileSpreadsheet size={13} className="text-violet-300" aria-hidden />
              {lineaImportFile ? (
                <span className="font-medium text-[var(--color-text-2)]">
                  {lineaImportFile.name}{" "}
                  <span className="text-[10.5px] text-[var(--color-text-3)]">
                    ({(lineaImportFile.size / 1024).toFixed(1)} KB)
                  </span>
                </span>
              ) : (
                <span className="text-[var(--color-text-2)]">Importación de líneas</span>
              )}
              {lineaImportLoading === "preview" ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-3)]">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Analizando…
                </span>
              ) : null}
              <button
                type="button"
                onClick={resetLineaImport}
                className="ml-auto rounded p-0.5 text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
                aria-label="Cerrar importación"
              >
                <X size={12} aria-hidden />
              </button>
            </div>

            {lineaImportError ? (
              <div
                role="alert"
                className="mt-2 flex items-start gap-2 rounded-md border border-[var(--color-error)]/40 bg-[var(--color-error-light)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-error)]"
              >
                <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
                <span>{lineaImportError}</span>
              </div>
            ) : null}

            {lineaImportPreview ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300 ring-1 ring-emerald-500/25">
                    {lineaImportPreview.validRows} válidas
                  </span>
                  {lineaImportPreview.errors.length > 0 ? (
                    <span className="rounded-full bg-[var(--color-warning-light)] px-2 py-0.5 font-medium text-[var(--color-warning)] ring-1 ring-[var(--color-warning)]/30">
                      {lineaImportPreview.errors.length} con errores
                    </span>
                  ) : null}
                  <span className="text-[10.5px] text-[var(--color-text-3)]">
                    de {lineaImportPreview.totalRows} totales
                  </span>
                </div>

                {lineaImportPreview.preview.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {lineaImportPreview.preview.slice(0, 40).map((row) => (
                      <span
                        key={`${row.rowNumber}-${row.id}`}
                        className="num-tabular rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-violet-200"
                      >
                        {row.id}
                      </span>
                    ))}
                    {lineaImportPreview.validRows > 40 ? (
                      <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-3)]">
                        +{lineaImportPreview.validRows - 40} más…
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {lineaImportPreview.errors.length > 0 ? (
                  <details className="rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)]/30 p-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium text-[var(--color-warning)]">
                      Ver {lineaImportPreview.errors.length} con error
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--color-text-2)]">
                      {lineaImportPreview.errors.slice(0, 30).map((err, idx) => (
                        <li key={`${err.rowNumber}-${idx}`} className="flex gap-2">
                          <span className="font-mono text-[var(--color-text-3)]">F{err.rowNumber}</span>
                          <span>
                            {err.rawId ? `(${err.rawId})` : ""} — {err.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetLineaImport}
                    disabled={lineaImportLoading === "commit"}
                    className="rounded-md border border-[var(--color-border)] bg-transparent px-2.5 py-1 text-[11.5px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void runLineaImportCommit()}
                    disabled={lineaImportLoading === "commit" || lineaImportPreview.validRows === 0}
                    className="inline-flex items-center gap-1.5 rounded-md bg-violet-500 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {lineaImportLoading === "commit" ? (
                      <>
                        <Loader2 className="size-3 animate-spin" aria-hidden /> Importando…
                      </>
                    ) : (
                      <>Importar {lineaImportPreview.validRows} líneas</>
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {lineaImportResult ? (
              <div
                className="mt-2 flex items-start gap-2 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success-light)] px-2.5 py-2 text-[11.5px] text-[var(--color-success)]"
                role="status"
              >
                <CheckCircle2 size={13} className="mt-0.5 shrink-0" aria-hidden />
                <div className="flex-1">
                  <p className="font-medium">Importación completada</p>
                  <ul className="mt-0.5 list-disc pl-4 text-[11px] text-[var(--color-text-2)]">
                    <li>Líneas creadas: {lineaImportResult.created}</li>
                    {lineaImportResult.skippedExisting > 0 ? (
                      <li>Saltadas por ya existir: {lineaImportResult.skippedExisting}</li>
                    ) : null}
                    {lineaImportResult.errors.length > 0 ? (
                      <li>Con error: {lineaImportResult.errors.length}</li>
                    ) : null}
                  </ul>
                  <button
                    type="button"
                    onClick={resetLineaImport}
                    className="mt-1.5 inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10.5px] text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          {filteredLineas.length === 0 ? (
            <p className="text-[12.5px] text-[var(--color-text-3)]">
              {lineaQuery
                ? `No hay líneas que coincidan con "${lineaQuery}".`
                : "Aún no hay líneas en el catálogo."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filteredLineas.map((linea) => {
                const busesCount = buses.filter((b) =>
                  b.lineas.some((l) => l === linea),
                ).length;
                return (
                  <span
                    key={linea}
                    className="group inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 pl-1 pr-1 text-[11.5px] font-medium text-[var(--color-text-1)] transition-colors hover:border-violet-400/40 hover:bg-violet-500/[0.04]"
                  >
                    <button
                      type="button"
                      onClick={() => setEditingLinea(linea)}
                      title={`Editar línea ${linea} · ${busesCount} bus${busesCount === 1 ? "" : "es"} asignado${busesCount === 1 ? "" : "s"}`}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0 text-left hover:text-violet-200"
                    >
                      <span className="num-tabular">{linea}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-px text-[9.5px] font-semibold tabular-nums",
                          busesCount > 0
                            ? "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30"
                            : "bg-[var(--color-warning-light)] text-[var(--color-warning)] ring-1 ring-inset ring-[var(--color-warning)]/30",
                        )}
                        title={
                          busesCount === 0
                            ? "Sin buses asignados"
                            : `${busesCount} bus${busesCount === 1 ? "" : "es"} asignado${busesCount === 1 ? "" : "s"}`
                        }
                      >
                        {busesCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteLinea(linea)}
                      aria-label={`Eliminar línea ${linea}`}
                      title={`Eliminar ${linea}`}
                      className="rounded p-0.5 text-[var(--color-text-3)] opacity-60 transition-all hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)] group-hover:opacity-100"
                    >
                      <Trash2 size={11} strokeWidth={1.75} aria-hidden />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </section>
      ) : null}

      {/* ── Modales de edición ───────────────────────────────────────────── */}
      {editingBus ? (
        <BusEditModal
          bus={{
            id: editingBus.id,
            operator: editingBus.operator,
            municipio: editingBus.municipio,
            lineas: editingBus.lineas,
          }}
          catalogLineas={lineas}
          catalogOperators={operatorOptions.map((o) => o.name)}
          catalogMunicipios={Array.from(
            new Set(buses.map((b) => b.municipio).filter(Boolean)),
          ).sort((a, b) => a.localeCompare(b, "es"))}
          onClose={() => setEditingBus(null)}
          onSaved={async (next) => {
            setEditingBus(null);
            await Promise.all([load(), loadLineas()]);
            setNotice({ kind: "success", text: `Bus ${next.id} actualizado.` });
          }}
        />
      ) : null}

      {editingLinea ? (
        <LineaEditModal
          linea={editingLinea}
          allBuses={buses.map((b) => ({
            id: b.id,
            operator: b.operator,
            municipio: b.municipio,
            lineas: b.lineas,
          }))}
          onClose={() => setEditingLinea(null)}
          onSaved={async (info) => {
            setEditingLinea(null);
            await Promise.all([load(), loadLineas()]);
            const parts: string[] = [];
            if (info.renamedTo) parts.push(`Línea renombrada a ${info.renamedTo}`);
            if (info.addedBuses.length > 0)
              parts.push(`${info.addedBuses.length} asignados`);
            if (info.removedBuses.length > 0)
              parts.push(`${info.removedBuses.length} desasignados`);
            if (info.failedBuses.length > 0) {
              setNotice({
                kind: "error",
                text: `Cambios parciales: fallaron ${info.failedBuses.length} bus${info.failedBuses.length === 1 ? "" : "es"} (${info.failedBuses.join(", ")}).`,
              });
            } else {
              setNotice({
                kind: "success",
                text: parts.length
                  ? `Línea actualizada · ${parts.join(" · ")}.`
                  : "Línea actualizada.",
              });
            }
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

/**
 * Zona de subida con drag & drop para el importador de buses.
 *
 *  - Cuando no hay archivo: muestra una caja punteada grande con icono y texto
 *    "Arrastra aquí o haz clic". Resalta visualmente al pasar por encima
 *    con un fichero arrastrado.
 *  - Cuando hay archivo: muestra una pill compacta con su nombre y opción
 *    de quitarlo, y la barra "Analizando…" mientras se construye la preview.
 */
function BusImportDropzone({
  file,
  loading,
  onPick,
  onDropFile,
  onReset,
}: {
  file: File | null;
  loading: "preview" | "commit" | null;
  onPick: () => void;
  onDropFile: (file: File | null) => void;
  onReset: () => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const disabled = loading === "commit";

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0] ?? null;
    if (!f) return;
    const validExt = /\.(xlsx|xls|csv)$/i.test(f.name);
    if (!validExt) {
      onDropFile(null);
      return;
    }
    onDropFile(f);
  };

  if (file) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/[0.06] px-3 py-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30">
          <FileSpreadsheet size={14} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-[var(--color-text-1)]" title={file.name}>
            {file.name}
          </p>
          <p className="text-[10.5px] text-[var(--color-text-3)]">{prettyBytes(file.size)}</p>
        </div>
        {loading === "preview" ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-3)]">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Analizando…
          </span>
        ) : null}
        <button
          type="button"
          onClick={onPick}
          disabled={disabled}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-2)] transition-colors hover:border-sky-400/40 hover:text-[var(--color-text-1)] disabled:cursor-not-allowed disabled:opacity-60"
          title="Reemplazar archivo"
        >
          Reemplazar
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="rounded p-1 text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-error)] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Quitar archivo"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={disabled ? undefined : onPick}
      role="button"
      tabIndex={0}
      aria-disabled={disabled || undefined}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "catalog-admin-dropzone group relative flex cursor-pointer flex-col items-center justify-center gap-2 px-6 py-7 text-center",
        isOver && "catalog-admin-dropzone--over",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl ring-1 transition-all",
          isOver
            ? "bg-sky-500/20 text-sky-200 ring-sky-400/40 scale-110"
            : "bg-sky-500/12 text-sky-300 ring-sky-400/25",
        )}
      >
        <Upload size={20} strokeWidth={1.7} aria-hidden />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[var(--color-text-1)]">
          {isOver ? "Suelta el archivo aquí" : "Arrastra el archivo o haz clic"}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--color-text-3)]">
          Formatos admitidos: <span className="font-mono">.xlsx</span>,{" "}
          <span className="font-mono">.xls</span>, <span className="font-mono">.csv</span>
        </p>
      </div>
    </div>
  );
}

/** Formatea bytes a unidad humana (KB, MB). */
function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Iniciales operadora (1–3 letras MAYÚSCULAS). */
function operatorInitials(operator: string): string {
  if (!operator) return "?";
  const words = operator
    .replace(/[.,\-_/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0] + (words[2]?.[0] ?? "")).toUpperCase().slice(0, 3);
}

/** Paleta determinista por nombre de operadora (hash → tono). */
function operatorTone(operator: string): {
  avatar: string;
  dot: string;
  chipActive: string;
} {
  const palette = [
    {
      avatar: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
      dot: "bg-sky-400",
      chipActive: "border-sky-400/40 bg-sky-500/15 text-sky-200",
    },
    {
      avatar: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
      dot: "bg-emerald-400",
      chipActive: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
    },
    {
      avatar: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
      dot: "bg-violet-400",
      chipActive: "border-violet-400/40 bg-violet-500/15 text-violet-200",
    },
    {
      avatar: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
      dot: "bg-amber-400",
      chipActive: "border-amber-400/40 bg-amber-500/15 text-amber-200",
    },
    {
      avatar: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
      dot: "bg-rose-400",
      chipActive: "border-rose-400/40 bg-rose-500/15 text-rose-200",
    },
    {
      avatar: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30",
      dot: "bg-cyan-400",
      chipActive: "border-cyan-400/40 bg-cyan-500/15 text-cyan-200",
    },
  ];
  if (!operator) {
    return {
      avatar: "bg-[var(--color-surface-2)] text-[var(--color-text-3)] ring-[var(--color-border)]",
      dot: "bg-[var(--color-text-3)]",
      chipActive: "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]",
    };
  }
  let hash = 0;
  for (let i = 0; i < operator.length; i++) hash = (hash * 31 + operator.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/** Tono visual para el tipo de activo (validadora/sae/router/pantalla/…). */
function assetTone(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("valid")) return "bg-sky-500/12 text-sky-300 ring-sky-400/25";
  if (t.includes("sae")) return "bg-violet-500/12 text-violet-300 ring-violet-400/25";
  if (t.includes("router")) return "bg-emerald-500/12 text-emerald-300 ring-emerald-400/25";
  if (t.includes("pantalla")) return "bg-amber-500/12 text-amber-300 ring-amber-400/25";
  return "bg-[var(--color-surface-2)] text-[var(--color-text-2)] ring-[var(--color-border)]";
}

function CatalogTabButton({
  icon: Icon,
  label,
  count,
  active,
  tone = "accent",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  active: boolean;
  tone?: "accent" | "rose";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("catalog-admin-tab", tone === "rose" && active && "catalog-admin-tab--rose")}
    >
      <Icon size={13} strokeWidth={1.8} aria-hidden />
      {label}
      {count !== undefined ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
            active
              ? tone === "rose"
                ? "bg-rose-500/20 text-rose-200"
                : "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
              : "bg-[var(--color-surface-2)] text-[var(--color-text-3)]",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

type KpiTone = "neutral" | "warning" | "success";

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone?: KpiTone;
}) {
  const toneCls =
    tone === "warning"
      ? "text-[var(--color-warning)]"
      : tone === "success"
        ? "text-emerald-300"
        : "text-[var(--color-text-2)]";
  const ringCls =
    tone === "warning"
      ? "color-mix(in oklab, var(--color-warning) 30%, var(--color-border))"
      : tone === "success"
        ? "color-mix(in oklab, #34d399 28%, var(--color-border))"
        : "var(--color-border)";
  return (
    <div
      className={cn("catalog-admin-kpi", toneCls)}
      style={{ ["--catalog-kpi-ring" as string]: ringCls }}
    >
      <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="num-tabular text-[16px] font-semibold leading-tight text-[var(--color-text-1)]">{value}</span>
        {hint ? (
          <span className="truncate text-[10px] opacity-70" title={hint}>
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="catalog-admin-field block">
      <span>
        {label}
        {hint ? <span className="text-[10px] normal-case tracking-normal opacity-70">{hint}</span> : null}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
