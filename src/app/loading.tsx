import { DashboardShell } from "@/components/layout/dashboard-shell"

function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse motion-reduce:animate-none rounded-md bg-muted/70 ${className}`} />
}

export default function Loading() {
  return (
    <DashboardShell>
      <main aria-busy="true" aria-describedby="page-loading-message" className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <p id="page-loading-message" role="status" className="sr-only">Loading page content</p>
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-6 w-40 sm:w-52" />
            <Skeleton className="h-3 w-52 sm:w-72" />
          </div>
          <Skeleton className="hidden h-8 w-28 sm:block" />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-lg border border-border/70 bg-card/55 p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-5 w-12" />
              <Skeleton className="mt-2 h-2.5 w-24" />
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(15rem,0.8fr)]">
          <section className="overflow-hidden rounded-lg border border-border/70 bg-card/55">
            <div className="flex items-center justify-between border-b border-border/70 p-4">
              <div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-2.5 w-40" /></div>
              <Skeleton className="h-7 w-20" />
            </div>
            <div className="divide-y divide-border/60">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 px-4 py-3.5">
                  <Skeleton className="size-4 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-2.5 w-1/3" /></div>
                  <Skeleton className="hidden h-5 w-16 sm:block" />
                </div>
              ))}
            </div>
          </section>
          <div className="space-y-3">
            <section className="rounded-lg border border-border/70 bg-card/55 p-4">
              <Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-6 w-28" /><Skeleton className="mt-3 h-1.5 w-full" />
            </section>
            <section className="rounded-lg border border-border/70 bg-card/55 p-4">
              <Skeleton className="h-3.5 w-24" />
              {Array.from({ length: 3 }, (_, index) => <div key={index} className="mt-4 flex items-center gap-3"><Skeleton className="size-8 shrink-0 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-2.5 w-1/3" /></div></div>)}
            </section>
          </div>
        </div>
        <Skeleton className="mt-4 h-24 w-full rounded-lg" />
      </main>
    </DashboardShell>
  )
}
