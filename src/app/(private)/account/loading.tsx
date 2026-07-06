import { AccountViewSkeleton } from "@/components/ui/view-skeletons";

export default function AccountLoading() {
  return (
    <div className="p-4 sm:p-6">
      <AccountViewSkeleton />
    </div>
  );
}
