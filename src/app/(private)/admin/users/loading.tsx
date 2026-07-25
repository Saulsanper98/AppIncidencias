import { AdminUsersViewSkeleton } from "@/components/ui/view-skeletons";

export default function AdminUsersLoading() {
  return (
    <div className="p-4 sm:p-6">
      <AdminUsersViewSkeleton />
    </div>
  );
}
