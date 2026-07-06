import { KbAdminViewSkeleton } from "@/components/ui/view-skeletons";

export default function KbAdminLoading() {
  return (
    <div className="p-4 sm:p-6">
      <KbAdminViewSkeleton />
    </div>
  );
}
