import { PageContainer } from "@/components/app-shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the list query runs. It mirrors the real layout's shape so the
 * page does not jump when the rows arrive — a skeleton of the wrong shape is
 * worse than none, because it promises a layout it then contradicts.
 */
export default function Loading() {
  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-52" />
      </div>
      <div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 p-3 even:bg-zebra">
            <Skeleton className="size-10 rounded-md" />
            <Skeleton className="h-4 flex-1 max-w-64" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
