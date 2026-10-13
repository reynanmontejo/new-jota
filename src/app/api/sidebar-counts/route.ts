import { NextResponse } from "next/server"

import { loadWorkflowData } from "@/features/workflow/workflow-data"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"

export async function GET() {
  const currentUser = await getAuthenticatedAppUser()
  if (!currentUser) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })

  try {
    const { tasks, contentWorkItems } = await loadWorkflowData()
    const isOpenTask = (status: string) => !["approved", "completed", "cancelled"].includes(status)
    const taskCount = tasks.filter((task) => isOpenTask(task.status) && (currentUser.role === "supervisor" || task.primaryOwner.id === currentUser.id)).length
      + contentWorkItems.length
    const reviewCount = tasks.filter((task) => task.versions.at(-1)?.status === "submitted").length

    return NextResponse.json({ taskCount, reviewCount }, { headers: { "cache-control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Sidebar counts could not be loaded." }, { status: 503 })
  }
}
