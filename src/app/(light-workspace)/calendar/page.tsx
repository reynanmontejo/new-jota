import { DashboardShell } from "@/components/layout/dashboard-shell"
import { calendarMonthQueryWindow, resolveCalendarMonth } from "@/features/calendar/calendar-month"
import { CalendarWorkspace } from "@/features/calendar/calendar-workspace"
import type { ContentCalendarPost } from "@/features/calendar/content-calendar"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const monthKey = resolveCalendarMonth((await searchParams).month)
  const { startInclusive, endExclusive } = calendarMonthQueryWindow(monthKey)
  let contentPosts: ContentCalendarPost[] | undefined
  let contentError = false
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const contentQuery = () => supabase.from("content_items")
      .select("id,title,client_id,platform,content_type,description,status,deadline_at,publish_at,next_action,revision_notes,client_approval_status,client_issues,notes,assigned_to")
      .in("status", ["planned", "in_production", "for_review", "revision_requested", "waiting_client", "scheduled"])
      .is("deleted_at", null)
    const [publishResult, deadlineResult, clientsResult] = await Promise.all([
      contentQuery().gte("publish_at", startInclusive).lt("publish_at", endExclusive),
      contentQuery().gte("deadline_at", startInclusive).lt("deadline_at", endExclusive),
      supabase.from("clients").select("id,name").is("deleted_at", null),
    ])
    contentError = Boolean(publishResult.error || deadlineResult.error || clientsResult.error)
    const contentRows = [...new Map([...(publishResult.data ?? []), ...(deadlineResult.data ?? [])].map((row) => [row.id, row])).values()]
      .sort((a, b) => (a.publish_at ?? "\uffff").localeCompare(b.publish_at ?? "\uffff"))
    const clientNames = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]))
    const assignedIds = [...new Set(contentRows.flatMap((row) => row.assigned_to ? [row.assigned_to] : []))]
    const { data: profiles } = assignedIds.length
      ? await supabase.from("profiles").select("id,display_name").in("id", assignedIds)
      : { data: [] }
    const assigneeNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]))
    contentPosts = contentRows.flatMap((row) => {
      const client = clientNames.get(row.client_id)
      if (!client) return []
      const common = {
        title: row.title,
        clientId: row.client_id,
        client,
        channel: row.platform,
        contentType: row.content_type,
        status: row.status,
        description: row.description,
        nextAction: row.next_action,
        revisionNotes: row.revision_notes,
        clientApprovalStatus: row.client_approval_status,
        clientIssues: row.client_issues,
        notes: row.notes,
        ownerId: row.assigned_to,
        ownerName: row.assigned_to ? assigneeNames.get(row.assigned_to) ?? "Assigned employee" : "Unassigned",
      }
      return [
        ...(row.publish_at ? [{ id: `${row.id}-publish`, date: row.publish_at, eventType: "publish" as const, ...common }] : []),
        ...(row.deadline_at ? [{ id: `${row.id}-deadline`, date: row.deadline_at, eventType: "deadline" as const, ...common }] : []),
      ]
    })
  }
  return <DashboardShell><CalendarWorkspace monthKey={monthKey} contentPosts={contentPosts} contentError={contentError} /></DashboardShell>
}
