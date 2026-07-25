import { DashboardViewSkeleton } from "@/components/ui/view-skeletons";

export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6">
      <DashboardViewSkeleton />
    </div>
  );
}
