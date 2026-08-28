import { PageContainer } from "@/components/app-shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the grid's column counts exactly — a skeleton of the wrong shape
 * promises a layout it then contradicts. */
export default function Loading() {
  return (
    <PageContainer width="wide">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-36" />
      </div>
      <Skeleton className="h-9 w-64 rounded-full" />
      <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4 sm:gap-1 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
        {Array.from({ length: 30 }, (_, i) => (
          <Skeleton key={i} className="aspect-square sm:rounded-sm" />
        ))}
      </div>
    </PageContainer>
  );
}
