"use client";

import {
  AlertCircle,
  Boxes,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  Hash,
  Loader2,
  MapPin,
  Plus,
  Route,
  Search,
  ShieldAlert,
  Timer,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [buses, setBuses] = useState<CatalogBus[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [form, setForm] = useState({ id: "", operator: "", municipio: "", lineas: "" });
  const [slaDrafts, setSlaDrafts] = useState<Record<string, string>>({});
  const [busQuery, setBusQuery] = useState("");
  const [slaQuery, setSlaQuery] = useState("");

  // ====== Estado del catalogo de Lineas (servicios) ======
  const [lineas, setLineas] = useState<string[]>([]);
  const [lineaQuery, setLineaQuery] = useState("");
  const [lineaForm, setLineaForm] = useState("");
  const [lineaSaving, setLineaSaving] = useState(false);
  const [lineaError, setLineaError] = useState<string | null>(null);

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
        await Promise.all([load(), loadLineas(), loadSlaConfig()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [load, loadLineas, loadSlaConfig]);

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
    if (!q) return buses;
    return buses.filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        b.operator.toLowerCase().includes(q) ||
        b.municipio.toLowerCase().includes(q) ||
        b.lineas.some((l) => l.toLowerCase().includes(q)),
    );
  }, [buses, busQuery]);

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
    if (!confirm(`\u00BFEliminar el bus ${id}?`)) return;
    const response = await fetch(`/api/catalog?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice({ kind: "error", text: "No se pudo eliminar el bus." });
      return;
    }
    await load();
    setNotice({ kind: "success", text: `Bus ${id} eliminado.` });
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
    return <div className="h-32 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />;
  }

  return (
    <div className="space-y-5">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-emerald-500/[0.08] p-5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 ring-1 ring-emerald-500/25 text-emerald-300">
              <Boxes size={18} strokeWidth={1.7} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-semibold text-[var(--color-text-3)]">
                  CCMGC
                </span>
                Catálogo de flota
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
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] shadow-sm ${
            notice.kind === "success"
              ? "border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]"
              : notice.kind === "error"
                ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)] text-[var(--color-error)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]"
          }`}
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

      {/* ── NUEVO BUS + IMPORTAR (grid 2 col en lg) ──────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Nuevo bus */}
        <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-2">
          <span aria-hidden className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-emerald-400/70" />
          <header className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-300">
              <Plus size={15} strokeWidth={1.8} aria-hidden />
            </div>
            <div>
              <h2 className="text-subheading">Nuevo bus</h2>
              <p className="text-[11.5px] text-[var(--color-text-3)]">Alta manual rápida.</p>
            </div>
          </header>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ID bus" hint="Ej. GC-120">
              <input
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                placeholder="GC-120"
                value={form.id}
                onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))}
              />
            </Field>
            <Field label="Operadora" hint="Empresa">
              <input
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                placeholder="Global Salcai"
                value={form.operator}
                onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value }))}
              />
            </Field>
            <Field label="Municipio" hint="Opcional">
              <input
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                placeholder="Las Palmas"
                value={form.municipio}
                onChange={(e) => setForm((p) => ({ ...p, municipio: e.target.value }))}
              />
            </Field>
            <Field label="Líneas" hint="Separadas por coma">
              <input
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
                placeholder="1, 12, 26"
                value={form.lineas}
                onChange={(e) => setForm((p) => ({ ...p, lineas: e.target.value }))}
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => void createBus()}
            disabled={!formValid}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[13px] font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={2} aria-hidden /> Crear bus
          </button>
        </section>

        {/* Importacion masiva */}
        <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:col-span-3">
          <span aria-hidden className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-sky-400/70" />
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/12 text-sky-300">
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
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--color-text-2)] hover:border-sky-400/40 hover:text-[var(--color-text-1)]"
            >
              Descargar plantilla
            </button>
          </header>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              ref={importFileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => onPickImportFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => importFileInput.current?.click()}
              disabled={importLoading === "commit"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] font-medium text-[var(--color-text-1)] hover:border-sky-400/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={14} aria-hidden /> Seleccionar archivo
            </button>
            {importFile ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[11.5px] text-[var(--color-text-2)]">
                <FileSpreadsheet size={12} aria-hidden /> {importFile.name}
                <button
                  type="button"
                  onClick={resetImport}
                  className="rounded p-0.5 text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
                  aria-label="Quitar archivo"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            ) : null}
            {importLoading === "preview" ? (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--color-text-3)]">
                <Loader2 className="size-3 animate-spin" aria-hidden /> Analizando…
              </span>
            ) : null}
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
                <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                  <table className="w-full min-w-[480px] text-[12px]">
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

      {/* ── BUSES ACTUALES ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-subheading">Buses actuales</h2>
            <p className="text-[11.5px] text-[var(--color-text-3)]">
              {filteredBuses.length} de {buses.length} buses
              {kpis.totalAssets > 0 ? ` \u00B7 ${kpis.totalAssets} activos` : ""}
            </p>
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
              value={busQuery}
              onChange={(e) => setBusQuery(e.target.value)}
              placeholder="Buscar bus, operadora, municipio…"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-2.5 text-[13px] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
              aria-label="Filtrar buses"
            />
          </div>
        </header>

        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="ccmgc-table w-full min-w-[640px] text-[13px]">
            <thead className="sticky top-0 z-[1] bg-[var(--color-surface-2)]/95 backdrop-blur">
              <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">
                <th className="px-3 py-2">ID</th>
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
                  <td colSpan={6} className="px-3 py-6 text-center text-[12.5px] text-[var(--color-text-3)]">
                    {busQuery ? `Sin resultados para "${busQuery}".` : "Aún no hay buses en el catálogo."}
                  </td>
                </tr>
              ) : (
                filteredBuses.map((bus, idx) => (
                  <tr
                    key={bus.id}
                    className={`border-t border-[var(--color-border)]/80 transition-colors hover:bg-[var(--color-accent-light)]/30 ${
                      idx % 2 ? "bg-[var(--color-surface-2)]/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-[12.5px] font-medium">{bus.id}</td>
                    <td className="px-3 py-2 text-[var(--color-text-2)]">{bus.operator || "\u2014"}</td>
                    <td className="px-3 py-2 text-[var(--color-text-2)]">{bus.municipio || "\u2014"}</td>
                    <td className="px-3 py-2">
                      {bus.lineas.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-warning-light)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-warning)] ring-1 ring-[var(--color-warning)]/25">
                          Sin líneas
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {bus.lineas.slice(0, 6).map((l) => (
                            <span
                              key={l}
                              className="num-tabular rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-2)]"
                            >
                              {l}
                            </span>
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
                    <td className="px-3 py-2 num-tabular text-[12px] text-[var(--color-text-3)]">{bus.assets.length}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void deleteBus(bus.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11.5px] text-[var(--color-text-3)] transition-colors hover:border-[var(--color-error)]/40 hover:bg-[var(--color-error-light)] hover:text-[var(--color-error)]"
                          aria-label={`Eliminar bus ${bus.id}`}
                          title="Eliminar"
                        >
                          <Trash2 size={11} strokeWidth={1.7} aria-hidden />
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

      {/* ── SLA POR PRIORIDAD (global) ──────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
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

      {/* ── SLA POR ACTIVO ──────────────────────────────────────────────── */}
      {flatAssets.length > 0 ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
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

          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="sticky top-0 z-[1] bg-[var(--color-surface-2)]/95 backdrop-blur">
                <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--color-text-3)]">
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
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
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
              {filteredLineas.map((linea) => (
                <span
                  key={linea}
                  className="group inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 pl-2.5 pr-1 text-[11.5px] font-medium text-[var(--color-text-1)] transition-colors hover:border-[var(--color-border-hover)]"
                >
                  <span className="num-tabular">{linea}</span>
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
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

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
      ? "ring-[var(--color-warning)]/30 bg-[var(--color-warning-light)] text-[var(--color-warning)]"
      : tone === "success"
        ? "ring-emerald-500/25 bg-emerald-500/10 text-emerald-300"
        : "ring-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-2)]";
  return (
    <div className={`flex min-w-[8.5rem] flex-col rounded-lg px-2.5 py-1.5 ring-1 ${toneCls}`}>
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
    <label className="block">
      <span className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
        {label}
        {hint ? <span className="text-[10px] normal-case tracking-normal opacity-70">{hint}</span> : null}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
