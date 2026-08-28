import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-9 w-80" />
      <div className="rounded-lg border">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b p-3 last:border-0"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto h-5 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
