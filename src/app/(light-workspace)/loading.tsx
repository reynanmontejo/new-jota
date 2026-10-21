import { DashboardShell } from "@/components/layout/dashboard-shell"

export default function Loading() {
  return <DashboardShell><main className="mx-auto w-full max-w-6xl space-y-4 p-6" aria-busy="true"><p role="status" className="text-sm text-muted-foreground">Loading page…</p><div aria-hidden="true" className="h-8 w-48 animate-pulse rounded-md bg-muted" /><div aria-hidden="true" className="h-40 animate-pulse rounded-xl bg-muted/60" /></main></DashboardShell>
}
