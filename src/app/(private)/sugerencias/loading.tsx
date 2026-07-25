import { SugerenciasViewSkeleton } from "@/components/ui/view-skeletons";

export default function SugerenciasLoading() {
  return (
    <div className="p-4 sm:p-6">
      <SugerenciasViewSkeleton />
    </div>
  );
}
