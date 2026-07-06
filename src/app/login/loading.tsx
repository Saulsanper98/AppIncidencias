import { LoginFormSkeleton } from "@/components/ui/view-skeletons";

export default function LoginLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[var(--color-surface)]/80 p-6">
        <LoginFormSkeleton />
      </div>
    </div>
  );
}
