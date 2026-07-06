import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton bandeja: hero + toolbar + tabla (p6/p8). */
export function BandejaViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton gestión tickets: formulario + paneles (p6/p9). */
export function TicketsManageViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Skeleton className="h-[min(480px,62vh)] min-h-[360px] rounded-xl xl:col-span-5" />
        <div className="flex h-[min(480px,62vh)] min-h-[360px] flex-col gap-3 xl:col-span-7">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="min-h-0 flex-1 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** @deprecated Usar BandejaViewSkeleton o TicketsManageViewSkeleton */
export function TicketsModuleLoadingSkeleton() {
  return <TicketsManageViewSkeleton />;
}

export function DashboardViewSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-16 rounded-md" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

export function MapViewSkeleton() {
  return (
    <div className="relative h-[min(72vh,640px)] w-full overflow-hidden rounded-2xl border border-[var(--color-border)]">
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 gap-px p-4 opacity-30">
        {Array.from({ length: 24 }).map((_, i) => (
          <Skeleton key={i} className="rounded-sm" />
        ))}
      </div>
      <div className="absolute bottom-4 left-4 right-4 flex gap-2">
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>
    </div>
  );
}

export function TableListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="mb-3 h-10 w-full rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function KbGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
    </div>
  );
}

export function LoginFormSkeleton() {
  return (
    <div className="space-y-4 p-1">
      <Skeleton className="mx-auto h-10 w-10 rounded-xl" />
      <Skeleton className="mx-auto h-6 w-40 rounded-md" />
      <Skeleton className="h-11 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}

/** z42 #343 — desvíos hero + filtros + tabla */
export function DesviosViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      <TableListSkeleton rows={10} />
    </div>
  );
}

/** z42 #344 — handover turno + bloques */
export function HandoverViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** z42 #345 — preventivo calendario + backlog */
export function PreventivoViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-[min(420px,55vh)] rounded-xl lg:col-span-8" />
        <Skeleton className="h-[min(420px,55vh)] rounded-xl lg:col-span-4" />
      </div>
    </div>
  );
}

/** z42 #346 — novedades tabs + cards */
export function NovedadesViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-10 w-64 rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** z42 #347 — feedback hero + bandeja */
export function FeedbackViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** z42 #348 — admin hub cards */
export function AdminHubSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}

/** z42 #349 — reportes filtros + preview */
export function ReportesViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

/** z42 #350 — detalle ticket 2 columnas (layout real lg: 1fr + 360px) */
export function TicketDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite" aria-label="Cargando detalle del ticket">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-44 rounded-xl sm:h-48" />
          <div className="rounded-xl border border-[var(--color-border)] p-4 sm:p-5">
            <Skeleton className="mb-4 h-5 w-28" />
            <Skeleton className="mb-3 h-20 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** z42 #351 — lectura wallboard */
export function LecturaViewSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-2xl" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

/** z42 #352 — conductor panel */
export function ConductorViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <TableListSkeleton rows={6} />
    </div>
  );
}

/** z42 #365 — builder widgets grid */
export function DashboardBuilderSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Ola 4 a63 — inventario hero + KPI strip + grid */
export function InventoryViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Ola 4 a63 — sugerencias hero aurora + board */
export function SugerenciasViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Ola 4 a63 — analytics hero + KPI grid */
export function AnalyticsViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <TableListSkeleton rows={8} />
    </div>
  );
}

/** Ola 4 a63 — catálogo admin tabs + tabla */
export function CatalogAdminViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <TableListSkeleton rows={12} />
    </div>
  );
}

/** Ola 4 a63 — KB admin grid */
export function KbAdminViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <KbGridSkeleton />
    </div>
  );
}

/** Ola 4 a63 — listado dashboards */
export function DashboardsListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Ola 4 a63 — detalle desvío */
export function DesvioDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-32 rounded-lg" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

/** Ola 4 a63 — formulario desvío nuevo */
export function DesvioFormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-lg" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
      <Skeleton className="h-11 w-40 rounded-lg" />
    </div>
  );
}

/** Ola 4 a63 — artículo KB */
export function KbArticleSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-48 rounded-lg" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-[min(60vh,480px)] w-full rounded-xl" />
    </div>
  );
}

/** Ola 4 a63 — perfil cuenta */
export function AccountViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-80 rounded-xl lg:col-span-4" />
        <Skeleton className="h-80 rounded-xl lg:col-span-8" />
      </div>
    </div>
  );
}

/** Ola 4 a63 — admin usuarios hero + tabla */
export function AdminUsersViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <TableListSkeleton rows={12} />
    </div>
  );
}

/** Ola 4 a63 — admin feedback bandeja */
export function AdminFeedbackViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Ola 4 a63 — cambiar contraseña */
export function CambiarPasswordSkeleton() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-11 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}
