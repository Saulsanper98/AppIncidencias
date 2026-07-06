import { InventoryViewSkeleton } from "@/components/ui/view-skeletons";

export default function InventoryLoading() {
  return (
    <div className="p-4 sm:p-6">
      <InventoryViewSkeleton />
    </div>
  );
}
