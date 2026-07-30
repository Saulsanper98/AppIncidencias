"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Bus as BusIcon,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  MapPin,
  Pencil,
  Route,
  ShieldAlert,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BusAvatar } from "@/components/flota/bus-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import type { TicketStatus } from "@/lib/domain";
import { assetTone, formatMunicipio, operatorInitials, operatorTone } from "@/lib/flota-ui";
import {
  ticketStatusBadgeClassName,
  ticketStatusBadgeVariant,
} from "@/lib/ticket-ui";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<TicketStatus, string> = {
  borrador: "Borrador",
  abierto: "Abierto",
  en_proceso: "En proceso",
  esperando_repuesto: "Esperando repuesto",
  resuelto: "Resuelto",
};

type BusPhoto = {
  id: string;
  url: string;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
};

type BusDetail = {
  id: string;
  operator: string;
  municipio: string;
  lineas: string[];
  description: string | null;
  photos: BusPhoto[];
  assets: { id: string; type: string; serialNumber: string }[];
};

type AnomalyInfo = {
  busId: string;
  ticketCount: number;
  score: number;
  topTypes: { tipo: string; count: number }[];
  windowDays: number;
  threshold: number;
};

type TicketRow = {
  id: string;
  title: string;
  status: TicketStatus;
  priority: string;
  tipo: string | null;
  assetType: string;
  createdAt: string;
  updatedAt: string;
};

type DetailResponse = {
  bus: BusDetail;
  anomaly: AnomalyInfo | null;
  operational: {
    tickets: TicketRow[];
    desvios: { id: string; titulo: string; referencia: string; estado: string }[];
  };
  tickets: {
    total: number;
    statusCounts: Record<string, number>;
    recent: TicketRow[];
  };
};

type Props = {
  busId: string;
  /** Editar descripción y fotos en la ficha (todos los usuarios autenticados). */
  canEditDetail: boolean;
  /** Enlace a administración del catálogo (solo gestores). */
  canManageCatalog: boolean;
};

function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "warning" | "accent" | "success";
}) {
  const tones = {
    neutral: "border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-[var(--color-text-1)]",
    warning: "border-[var(--color-warning)]/35 bg-[var(--color-warning-light)]/25 text-[var(--color-warning)]",
    accent: "border-[var(--color-accent)]/35 bg-[var(--color-accent-light)]/30 text-[var(--color-accent)]",
    success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2", tones[tone])}>
      <p className="text-[9.5px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums leading-none">{value}</p>
    </div>
  );
}

function OperatorChipDetail({
  operator,
  tone,
}: {
  operator: string;
  tone: ReturnType<typeof operatorTone>;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        tone.chip,
      )}
    >
      <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold ring-1", tone.avatar)}>
        {operatorInitials(operator)}
      </span>
      {operator}
    </span>
  );
}

export function BusDetailView({ busId, canEditDetail, canManageCatalog }: Props) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/catalog/buses/${encodeURIComponent(busId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "No se pudo cargar el bus");
      }
      const json = (await res.json()) as DetailResponse;
      setData(json);
      setDescriptionDraft(json.bus.description ?? "");
      setActivePhotoIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [busId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDescription() {
    if (!canEditDetail) return;
    setSavingDescription(true);
    try {
      const res = await fetch(`/api/catalog/buses/${encodeURIComponent(busId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionDraft.trim() || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "No se pudo guardar");
      }
      setEditingDescription(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingDescription(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!canEditDetail) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/catalog/buses/${encodeURIComponent(busId)}/photos`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "No se pudo subir la foto");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function deletePhoto(photoId: string) {
    if (!canEditDetail) return;
    if (!window.confirm("¿Eliminar esta foto del bus?")) return;
    setDeletingPhotoId(photoId);
    try {
      const res = await fetch(
        `/api/catalog/buses/${encodeURIComponent(busId)}/photos/${photoId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("No se pudo eliminar");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeletingPhotoId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-[var(--color-text-3)]">
        <Loader2 size={28} className="animate-spin text-[var(--color-accent)]" aria-hidden />
        <p className="text-[13px]">Cargando ficha del bus…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={BusIcon}
        title="Bus no encontrado"
        hint={error ?? "No existe este bus en el catálogo."}
      />
    );
  }

  const { bus, anomaly, operational, tickets } = data;
  const openTickets = operational.tickets;
  const openCount =
    (tickets.statusCounts.abierto ?? 0) +
    (tickets.statusCounts.en_proceso ?? 0) +
    (tickets.statusCounts.esperando_repuesto ?? 0) +
    (tickets.statusCounts.borrador ?? 0);
  const tone = operatorTone(bus.operator);
  const municipio = formatMunicipio(bus.municipio);
  const coverUrl = bus.photos[activePhotoIdx]?.url ?? bus.photos[0]?.url ?? null;
  const activePhoto = bus.photos[activePhotoIdx] ?? bus.photos[0] ?? null;

  return (
    <div className="space-y-4">
      <Link
        href="/flota"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-text-3)] transition-colors hover:text-[var(--color-text-1)]"
      >
        <ArrowLeft size={14} aria-hidden />
        Volver al catálogo
      </Link>

      {error ? (
        <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-light)] px-3 py-2 text-[13px] text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      {/* Cabecera compacta */}
      <div className={cn("overflow-hidden rounded-2xl border bg-[var(--color-surface)]", tone.header.split(" ").pop())}>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="h-[72px] w-[72px] rounded-xl object-cover ring-2 ring-[var(--color-border)]" />
              ) : (
                <BusAvatar busId={bus.id} operator={bus.operator} size={72} variant="suffix" />
              )}
              {anomaly ? (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-warning)] text-[var(--color-bg)]">
                  <ShieldAlert size={11} aria-hidden />
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <OperatorChipDetail operator={bus.operator} tone={tone} />
              <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-[var(--color-text-1)] sm:text-[28px]">
                {bus.id}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-3)]">
                {municipio ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} aria-hidden />
                    {municipio}
                  </span>
                ) : null}
                {bus.lineas.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Route size={12} aria-hidden />
                    {bus.lineas.join(" · ")}
                  </span>
                ) : (
                  <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px]">
                    Sin líneas asignadas
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link
              href={`/bandeja?busId=${encodeURIComponent(bus.id)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-2)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)]"
            >
              <ClipboardList size={13} aria-hidden />
              Bandeja
            </Link>
            {canManageCatalog ? (
              <Link
                href="/admin/catalog"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-2)] hover:border-sky-400/40 hover:text-sky-300"
              >
                <Pencil size={13} aria-hidden />
                Gestionar
              </Link>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border)]/80 bg-[var(--color-surface-2)]/30 p-3 sm:grid-cols-4 sm:px-5">
          <StatPill label="Tickets" value={tickets.total} />
          <StatPill label="Abiertos" value={openCount} tone={openCount > 0 ? "warning" : "success"} />
          <StatPill label="Activos" value={bus.assets.length} tone="accent" />
          <StatPill label="Estado" value={anomaly ? "Anómalo" : "Normal"} tone={anomaly ? "warning" : "neutral"} />
        </div>
      </div>

      {anomaly ? (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-light)]/25 px-4 py-3">
          <ShieldAlert size={17} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--color-warning)]">
              Patrón anómalo en los últimos {anomaly.windowDays} días
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-2)]">
              {anomaly.ticketCount} tickets · score {anomaly.score} (umbral {anomaly.threshold})
            </p>
            {anomaly.topTypes.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {anomaly.topTypes.map((t) => (
                  <span key={t.tipo} className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10.5px] ring-1 ring-[var(--color-warning)]/20">
                    {t.tipo} ×{t.count}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Columna principal */}
        <div className="space-y-5">
          <SectionCard
            title="Galería"
            icon={Camera}
            action={
              canEditDetail ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadPhoto(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Subir
                  </Button>
                </>
              ) : null
            }
          >
            {bus.photos.length === 0 ? (
              <div className="flex items-center gap-4 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-4 py-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-text-3)]">
                  <Camera size={22} aria-hidden />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--color-text-2)]">Sin fotos del vehículo</p>
                  <p className="mt-0.5 text-[12px] text-[var(--color-text-3)]">
                    {canEditDetail ? "Sube imágenes para identificar el bus visualmente." : "Aún no hay imágenes en esta ficha."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="group relative overflow-hidden rounded-xl ring-1 ring-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="block w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activePhoto?.url}
                      alt={activePhoto?.caption ?? `Foto del bus ${bus.id}`}
                      className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-lg bg-black/55 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn size={12} aria-hidden />
                      Ampliar
                    </span>
                  </button>
                  {canEditDetail && activePhoto ? (
                    <button
                      type="button"
                      onClick={() => void deletePhoto(activePhoto.id)}
                      disabled={deletingPhotoId === activePhoto.id}
                      className="absolute right-3 top-3 rounded-lg bg-black/55 p-1.5 text-white hover:bg-black/75"
                      aria-label="Eliminar foto"
                    >
                      {deletingPhotoId === activePhoto.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  ) : null}
                </div>
                {activePhoto?.caption ? (
                  <p className="text-[12px] text-[var(--color-text-2)]">{activePhoto.caption}</p>
                ) : null}
                {bus.photos.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {bus.photos.map((photo, idx) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        className={cn(
                          "shrink-0 overflow-hidden rounded-lg ring-2 transition-all",
                          idx === activePhotoIdx
                            ? "ring-[var(--color-accent)]"
                            : "ring-transparent opacity-70 hover:opacity-100",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt="" className="h-14 w-20 object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Descripción" icon={Pencil}>
            {canEditDetail && !editingDescription ? (
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEditingDescription(true)}
                  className="text-[12px] text-[var(--color-accent)] hover:underline"
                >
                  Editar descripción
                </button>
              </div>
            ) : null}
            {editingDescription && canEditDetail ? (
              <div className="space-y-3">
                <textarea
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  rows={6}
                  maxLength={4000}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--color-text-1)] outline-none focus:border-[var(--color-accent)]/50"
                  placeholder="Equipamiento, particularidades, historial del vehículo…"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={savingDescription} onClick={() => void saveDescription()}>
                    Guardar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingDescription(false);
                      setDescriptionDraft(bus.description ?? "");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <blockquote className="whitespace-pre-wrap border-l-2 border-[var(--color-accent)]/50 pl-4 text-[14px] leading-relaxed text-[var(--color-text-2)]">
                {bus.description?.trim() || (
                  <span className="italic text-[var(--color-text-3)]">Sin descripción todavía.</span>
                )}
              </blockquote>
            )}
          </SectionCard>

          <SectionCard title={`Historial de tickets (${tickets.total})`} icon={ClipboardList}>
            {tickets.recent.length === 0 ? (
              <p className="text-[13px] text-[var(--color-text-3)]">No hay tickets para este bus.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full min-w-[480px] text-left text-[12.5px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-3)]">
                      <th className="pb-2 font-medium">Incidencia</th>
                      <th className="pb-2 font-medium">Estado</th>
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]/70">
                    {tickets.recent.map((t) => (
                      <tr key={t.id} className="group">
                        <td className="py-2.5 pr-2">
                          <Link
                            href={`/tickets/${t.id}`}
                            className="font-medium text-[var(--color-text-1)] group-hover:text-[var(--color-accent)]"
                          >
                            {t.title}
                          </Link>
                        </td>
                        <td className="py-2.5">
                          <Badge
                            variant={ticketStatusBadgeVariant(t.status)}
                            className={ticketStatusBadgeClassName(t.status)}
                          >
                            {STATUS_LABELS[t.status]}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-[var(--color-text-3)]">{t.tipo ?? "—"}</td>
                        <td className="py-2.5 tabular-nums text-[var(--color-text-3)]">
                          {new Date(t.createdAt).toLocaleDateString("es-ES")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {openTickets.length > 0 || operational.desvios.length > 0 ? (
            <SectionCard title="Operativa activa" icon={AlertTriangle}>
              {openTickets.length > 0 ? (
                <div className="mb-3">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
                    Tickets abiertos
                  </p>
                  <ul className="space-y-1">
                    {openTickets.slice(0, 6).map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/tickets/${t.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-[var(--color-accent-light)]/20"
                        >
                          <span className="min-w-0 truncate text-[var(--color-text-1)]">{t.title}</span>
                          <Badge
                            variant={ticketStatusBadgeVariant(t.status)}
                            className={cn("shrink-0 text-[10px]", ticketStatusBadgeClassName(t.status))}
                          >
                            {STATUS_LABELS[t.status]}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {operational.desvios.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-3)]">
                    Desvíos
                  </p>
                  <ul className="space-y-1">
                    {operational.desvios.slice(0, 5).map((d) => (
                      <li key={d.id}>
                        <Link
                          href={`/desvios/${d.id}`}
                          className="block rounded-lg px-2 py-1.5 text-[12px] hover:bg-[var(--color-accent-light)]/20"
                        >
                          <span className="line-clamp-2 text-[var(--color-text-1)]">{d.titulo}</span>
                          <span className="text-[10.5px] text-[var(--color-text-3)]">{d.estado}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </SectionCard>
          ) : (
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/8 px-4 py-3 text-[12.5px] text-emerald-200">
              Sin incidencias ni desvíos activos vinculados.
            </div>
          )}

          {bus.assets.length > 0 ? (
            <SectionCard title="Activos a bordo" icon={Boxes}>
              <ul className="space-y-2">
                {bus.assets.map((a) => (
                  <li
                    key={a.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[12px] ring-1",
                      assetTone(a.type),
                    )}
                  >
                    <span className="font-medium capitalize">{a.type}</span>
                    <span className="font-mono text-[10.5px] opacity-80">{a.serialNumber}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </aside>
      </div>

      {/* Lightbox */}
      {lightboxOpen && activePhoto ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
          aria-label="Vista ampliada de foto"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
          {bus.photos.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIdx((i) => (i - 1 + bus.photos.length) % bus.photos.length);
                }}
                className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Foto anterior"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePhotoIdx((i) => (i + 1) % bus.photos.length);
                }}
                className="absolute right-14 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Foto siguiente"
              >
                <ChevronRight size={22} />
              </button>
            </>
          ) : null}
          <div className="max-h-[90vh] max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activePhoto.url}
              alt={activePhoto.caption ?? `Foto del bus ${bus.id}`}
              className="max-h-[85vh] w-full rounded-lg object-contain"
            />
            {activePhoto.caption ? (
              <p className="mt-2 text-center text-[13px] text-white/80">{activePhoto.caption}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
