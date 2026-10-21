import { NextResponse } from "next/server"

import { loadWorkflowTaskDetails } from "@/features/workflow/workflow-data"
import { getStorageActor } from "@/lib/storage/authorization"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  if (!uuidPattern.test(taskId)) return NextResponse.json({ error: "Task not found." }, { status: 404 })

  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })

  try {
    const details = await loadWorkflowTaskDetails(actor.supabase, taskId)
    if (!details) return NextResponse.json({ error: "Task not found." }, { status: 404 })
    return NextResponse.json({ details }, { headers: { "cache-control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Task details could not be loaded. Please try again." }, { status: 503 })
  }
}
