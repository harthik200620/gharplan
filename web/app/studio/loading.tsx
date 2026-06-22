import { Skeleton } from "@/components/ui/skeleton";

export default function StudioLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header bar */}
      <div className="mb-8 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
        {/* Left brief panel — stacked inputs */}
        <aside className="space-y-6 rounded-2xl border bg-card p-6 shadow-soft">
          <Skeleton className="h-5 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3.5 w-20" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-16 rounded-full" />
              ))}
            </div>
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </aside>

        {/* Right results area */}
        <section className="space-y-6">
          {/* Large canvas */}
          <div className="rounded-2xl border bg-card p-3 shadow-soft">
            <Skeleton className="aspect-[16/10] w-full rounded-xl" />
          </div>

          {/* Row of scheme cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
