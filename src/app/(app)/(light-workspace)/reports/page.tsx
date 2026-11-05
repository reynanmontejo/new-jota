import { redirect } from "next/navigation"
import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"
import { DailyReports } from "@/features/reports/daily-reports"

export default async function ReportsPage() {
  const actor = await getWorkspaceRequestContext()
  if (!actor) redirect("/login?next=/reports")
  return <DailyReports key={`${actor.organizationId}:${actor.userId}`} userId={actor.userId} organizationId={actor.organizationId} name={actor.displayName} jobTitle={actor.jobTitle} canReceive={actor.roles.some(r => ["supervisor", "administrator"].includes(r.code))} />
}
