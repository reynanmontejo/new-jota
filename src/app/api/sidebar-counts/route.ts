import { NextResponse } from "next/server"

import { countOpenSidebarTasks } from "@/features/workflow/sidebar-counts"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"
import { createClient } from "@/lib/supabase/server"

const contentWorkStatuses = ["idea", "planned", "in_production", "for_review", "revision_requested", "waiting_client", "scheduled"]

export async function GET() {
  const currentUser = await getAuthenticatedAppUser()
  if (!currentUser) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })

  try {
    const supabase = await createClient()
    const [taskResult, clientResult] = await Promise.all([
      supabase.from("tasks").select("id,status,created_by").is("deleted_at", null).is("archived_at", null),
      supabase.from("clients").select("id").is("deleted_at", null),
    ])
    if (taskResult.error || clientResult.error) throw new Error("Could not load sidebar count sources.")

    const tasks = taskResult.data ?? []
    const taskIds = tasks.map(({ id }) => id)
    const clientIds = (clientResult.data ?? []).map(({ id }) => id)
    const [assigneeResult, submissionResult, contentResult] = await Promise.all([
      currentUser.role === "supervisor" || !taskIds.length
        ? Promise.resolve({ data: [], error: null })
        : supabase.from("task_assignees").select("task_id,user_id,is_primary").is("removed_at", null).in("task_id", taskIds),
      taskIds.length
        ? supabase.from("submissions").select("task_id", { count: "exact", head: true }).in("task_id", taskIds).eq("status", "submitted")
        : Promise.resolve({ count: 0, error: null }),
      clientIds.length
        ? supabase.from("content_items").select("id", { count: "exact", head: true }).in("client_id", clientIds).in("status", contentWorkStatuses).is("deleted_at", null)
        : Promise.resolve({ count: 0, error: null }),
    ])
    if (assigneeResult.error || submissionResult.error || contentResult.error) throw new Error("Could not calculate sidebar counts.")

    const taskCount = countOpenSidebarTasks(tasks, assigneeResult.data ?? [], currentUser) + (contentResult.count ?? 0)
    const reviewCount = submissionResult.count ?? 0

    return NextResponse.json({ taskCount, reviewCount }, { headers: { "cache-control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Sidebar counts could not be loaded." }, { status: 503 })
  }
}
