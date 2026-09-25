import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ClientWorkspace } from "@/features/clients/client-workspace"

export default async function ClientPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ clientId }, { tab }] = await Promise.all([params, searchParams])
  return <DashboardShell><ClientWorkspace clientId={clientId} initialTab={tab} /></DashboardShell>
}
