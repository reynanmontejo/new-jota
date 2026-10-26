import { DashboardShell } from "@/components/layout/dashboard-shell"
import { WorkspacePageSkeleton } from "@/components/states/workspace-page-skeleton"

export default function Loading() {
  return <DashboardShell><WorkspacePageSkeleton /></DashboardShell>
}
