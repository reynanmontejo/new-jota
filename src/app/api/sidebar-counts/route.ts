import { NextResponse } from "next/server"

import { countOpenSidebarTasks } from "@/features/workflow/sidebar-counts"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const currentUser = await getAuthenticatedAppUser()
  if (!currentUser) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })

  try {
    const supabase = await createClient()
    const taskResult = await supabase.from("tasks").select("id,status,created_by").is("deleted_at", null).is("archived_at", null)
    if (taskResult.error) throw new Error("Could not load sidebar count sources.")

    const tasks = taskResult.data ?? []
    const taskIds = tasks.map(({ id }) => id)
    const [assigneeResult, submissionResult] = await Promise.all([
      currentUser.role === "supervisor" || !taskIds.length
        ? Promise.resolve({ data: [], error: null })
        : supabase.from("task_assignees").select("task_id,user_id,is_primary").is("removed_at", null).in("task_id", taskIds),
      taskIds.length
        ? supabase.from("submissions").select("task_id", { count: "exact", head: true }).in("task_id", taskIds).eq("status", "submitted")
        : Promise.resolve({ count: 0, error: null }),
    ])
    if (assigneeResult.error || submissionResult.error) throw new Error("Could not calculate sidebar counts.")

    const taskCount = countOpenSidebarTasks(tasks, assigneeResult.data ?? [], currentUser)
    const reviewCount = submissionResult.count ?? 0

    return NextResponse.json({ taskCount, reviewCount }, { headers: { "cache-control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Sidebar counts could not be loaded." }, { status: 503 })
  }
}
