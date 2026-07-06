import { CambiarPasswordSkeleton } from "@/components/ui/view-skeletons";

export default function CambiarPasswordLoading() {
  return (
    <div className="p-4 sm:p-6">
      <CambiarPasswordSkeleton />
    </div>
  );
}
