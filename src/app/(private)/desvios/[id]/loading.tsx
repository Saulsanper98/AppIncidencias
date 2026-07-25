import { DesvioDetailSkeleton } from "@/components/ui/view-skeletons";

export default function DesvioDetailLoading() {
  return (
    <div className="p-4 sm:p-6">
      <DesvioDetailSkeleton />
    </div>
  );
}
