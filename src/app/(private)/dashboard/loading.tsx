export default function DashboardLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col gap-4 p-6">
      <div className="h-9 w-48 max-w-full rounded-lg bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
      <div className="h-32 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4">
        <div className="h-4 w-[min(60%,20rem)] rounded bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="h-16 rounded-lg bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
          <div className="h-16 rounded-lg bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
          <div className="h-16 rounded-lg bg-[var(--color-surface-2)] motion-safe:animate-pulse" />
        </div>
      </div>
      <div className="h-64 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 motion-safe:animate-pulse" />
    </div>
  );
}
