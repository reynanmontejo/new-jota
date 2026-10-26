export default function Loading() {
  return (
    <main aria-busy="true" aria-describedby="files-loading-message" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <p id="files-loading-message" role="status" className="sr-only">Loading file management</p>
      <div aria-hidden="true" className="space-y-4">
        <div className="h-3 w-32 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none" />
        <div className="h-7 w-52 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none" />
        <div className="rounded-lg border border-border/70 bg-card/55 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="h-8 w-52 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none" />
            <div className="h-8 w-28 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-lg bg-muted/55 motion-reduce:animate-none" />)}
          </div>
        </div>
      </div>
    </main>
  )
}
