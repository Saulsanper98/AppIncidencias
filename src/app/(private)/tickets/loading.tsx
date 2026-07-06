import { TicketsManageViewSkeleton } from "@/components/ui/view-skeletons";

export default function TicketsLoading() {
  return (
    <div className="p-4 sm:p-6">
      <TicketsManageViewSkeleton />
    </div>
  );
}
