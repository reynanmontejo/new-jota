import { DashboardShell } from "@/components/layout/dashboard-shell"
import { InsightsDashboard } from "@/features/insights/insights-dashboard"

export default function InsightsPage() {
  return <DashboardShell><InsightsDashboard /></DashboardShell>
}
