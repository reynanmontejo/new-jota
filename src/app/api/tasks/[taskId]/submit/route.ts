import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["tasks.submit"])) return NextResponse.json({ error: "Task submission is not enabled for this account. Confirm migration 202610130001_task_submission_review_workflow.sql is applied and that your role has task submission access." }, { status: 403 })
  const { taskId } = await params
  if (!uuidPattern.test(taskId)) return NextResponse.json({ error: "Task ID is invalid." }, { status: 400 })

  let payload: { attachmentIds?: unknown; notes?: unknown }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "Invalid submission request." }, { status: 400 }) }
  if (!Array.isArray(payload.attachmentIds) || payload.attachmentIds.length < 1 || payload.attachmentIds.length > 30
    || payload.attachmentIds.some((id) => typeof id !== "string" || !uuidPattern.test(id))
    || (payload.notes !== undefined && (typeof payload.notes !== "string" || payload.notes.length > 5000))) {
    return NextResponse.json({ error: "Choose 1 to 30 uploaded files and keep submission notes under 5,000 characters." }, { status: 400 })
  }

  const { data, error } = await actor.supabase.rpc("submit_task_for_review", {
    p_task_id: taskId,
    p_attachment_ids: payload.attachmentIds,
    p_notes: typeof payload.notes === "string" ? payload.notes.trim() || null : null,
  })
  if (error?.code === "42501") return NextResponse.json({ error: error.message.includes("primary task owner") ? error.message : "You do not have permission to submit this task." }, { status: 403 })
  if (error?.code === "P0002") return NextResponse.json({ error: "Task not found or inaccessible." }, { status: 404 })
  if (error?.code === "PGRST202") return NextResponse.json({ error: "Apply the task-submission workflow migration, then refresh." }, { status: 503 })
  if (error) return NextResponse.json({ error: error.code === "22023" ? error.message : "The task could not be submitted for review." }, { status: error.code === "22023" ? 400 : 503 })
  return NextResponse.json({ success: true, versionId: data }, { headers: { "cache-control": "private, no-store" } })
}
