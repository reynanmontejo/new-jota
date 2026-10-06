import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ContentCalendar, type ContentCalendarPost } from "@/features/calendar/content-calendar"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

export default async function CalendarPage() {
  let contentPosts: ContentCalendarPost[] | undefined
  let contentError = false
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const [contentResult, clientsResult] = await Promise.all([
      supabase.from("content_items")
        .select("id,title,client_id,platform,content_type,description,status,deadline_at,publish_at,next_action,revision_notes,client_approval_status,client_issues,notes")
        .in("status", ["planned", "in_production", "for_review", "revision_requested", "waiting_client", "scheduled"])
        .is("deleted_at", null)
        .order("publish_at"),
      supabase.from("clients").select("id,name").is("deleted_at", null),
    ])
    contentError = Boolean(contentResult.error || clientsResult.error)
    const clientNames = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]))
    contentPosts = (contentResult.data ?? []).flatMap((row) => {
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
      }
      return [
        ...(row.publish_at ? [{ id: `${row.id}-publish`, date: row.publish_at, eventType: "publish" as const, ...common }] : []),
        ...(row.deadline_at ? [{ id: `${row.id}-deadline`, date: row.deadline_at, eventType: "deadline" as const, ...common }] : []),
      ]
    })
  }
  return <DashboardShell><ContentCalendar contentPosts={contentPosts} contentError={contentError} /></DashboardShell>
}
