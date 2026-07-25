import { CatalogAdminViewSkeleton } from "@/components/ui/view-skeletons";

export default function CatalogAdminLoading() {
  return (
    <div className="p-4 sm:p-6">
      <CatalogAdminViewSkeleton />
    </div>
  );
}
