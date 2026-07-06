import { KbArticleSkeleton } from "@/components/ui/view-skeletons";

export default function KbArticleLoading() {
  return (
    <div className="p-4 sm:p-6">
      <KbArticleSkeleton />
    </div>
  );
}
