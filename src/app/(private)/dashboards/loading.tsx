import { DashboardsListSkeleton } from "@/components/ui/view-skeletons";

export default function DashboardsLoading() {
  return (
    <div className="p-4 sm:p-6">
      <DashboardsListSkeleton />
    </div>
  );
}
