import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ContentState } from "@/components/states/content-state"

export default function AccessDeniedPage() {
  return <DashboardShell><main className="mx-auto max-w-4xl p-6"><ContentState variant="access_denied" /></main></DashboardShell>
}
