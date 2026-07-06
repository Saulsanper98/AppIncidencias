import { AdminFeedbackViewSkeleton } from "@/components/ui/view-skeletons";

export default function AdminFeedbackLoading() {
  return (
    <div className="p-4 sm:p-6">
      <AdminFeedbackViewSkeleton />
    </div>
  );
}
