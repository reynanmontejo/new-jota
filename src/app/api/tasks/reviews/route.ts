import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type SubmissionRow = { id: string; task_id: string; current_version_number: number; status: string; submitted_by: string | null; submitted_at: string | null }
type TaskRow = { id: string; title: string; client_id: string; campaign_id: string | null; priority: string; due_at: string | null }
type VersionRow = { id: string; submission_id: string; task_id: string; version_number: number; notes: string | null; submitted_by: string; submitted_at: string }
type VersionFileRow = { submission_version_id: string; attachment_id: string }
type AttachmentRow = { id: string; file_name: string; mime_type: string; size_bytes: number }

export async function GET() {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["tasks.review"])) return NextResponse.json({ error: "Supervisor task-review access is required." }, { status: 403 })

  const { data, error } = await actor.supabase.from("submissions")
    .select("id,task_id,current_version_number,status,submitted_by,submitted_at")
    .eq("status", "submitted").order("submitted_at", { ascending: true })
  if (error) return NextResponse.json({ error: "Task review queue could not be loaded. Apply the task-review migration if it is pending." }, { status: 503 })
  const submissions = (data ?? []) as unknown as SubmissionRow[]
  if (!submissions.length) return NextResponse.json({ submissions: [] }, { headers: { "cache-control": "private, no-store" } })

  const submissionIds = submissions.map((row) => row.id)
  const taskIds = [...new Set(submissions.map((row) => row.task_id))]
  const [versionResult, taskResult] = await Promise.all([
    actor.supabase.from("submission_versions").select("id,submission_id,task_id,version_number,notes,submitted_by,submitted_at").in("submission_id", submissionIds),
    actor.supabase.from("tasks").select("id,title,client_id,campaign_id,priority,due_at").in("id", taskIds),
  ])
  if (versionResult.error || taskResult.error) return NextResponse.json({ error: "Task submission details could not be loaded." }, { status: 503 })

  const versions = (versionResult.data ?? []) as unknown as VersionRow[]
  const tasks = (taskResult.data ?? []) as unknown as TaskRow[]
  const current = submissions.flatMap((submission) => {
    const version = versions.find((row) => row.submission_id === submission.id && row.version_number === submission.current_version_number)
    const task = tasks.find((row) => row.id === submission.task_id)
    return version && task ? [{ submission, version, task }] : []
  })
  const versionIds = current.map(({ version }) => version.id)
  const fileLinksResult = versionIds.length
    ? await actor.supabase.from("submission_version_files").select("submission_version_id,attachment_id").in("submission_version_id", versionIds)
    : { data: [], error: null }
  if (fileLinksResult.error) return NextResponse.json({ error: "Submitted task files could not be loaded." }, { status: 503 })
  const fileLinks = (fileLinksResult.data ?? []) as unknown as VersionFileRow[]
  const attachmentIds = [...new Set(fileLinks.map((row) => row.attachment_id))]
  const submitterIds = [...new Set(current.map(({ version }) => version.submitted_by))]
  const clientIds = [...new Set(current.map(({ task }) => task.client_id))]
  const campaignIds = [...new Set(current.flatMap(({ task }) => task.campaign_id ? [task.campaign_id] : []))]
  const [attachmentResult, profileResult, clientResult, campaignResult] = await Promise.all([
    attachmentIds.length ? actor.supabase.from("attachments").select("id,file_name,mime_type,size_bytes").in("id", attachmentIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
    submitterIds.length ? actor.supabase.from("profiles").select("id,display_name").in("id", submitterIds) : Promise.resolve({ data: [], error: null }),
    clientIds.length ? actor.supabase.from("clients").select("id,name").in("id", clientIds) : Promise.resolve({ data: [], error: null }),
    campaignIds.length ? actor.supabase.from("campaigns").select("id,name").in("id", campaignIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (attachmentResult.error || profileResult.error || clientResult.error || campaignResult.error) {
    return NextResponse.json({ error: "Task review details could not be loaded." }, { status: 503 })
  }

  const attachments = new Map(((attachmentResult.data ?? []) as unknown as AttachmentRow[]).map((row) => [row.id, row]))
  const profiles = new Map(((profileResult.data ?? []) as unknown as { id: string; display_name: string }[]).map((row) => [row.id, row.display_name]))
  const clients = new Map(((clientResult.data ?? []) as unknown as { id: string; name: string }[]).map((row) => [row.id, row.name]))
  const campaigns = new Map(((campaignResult.data ?? []) as unknown as { id: string; name: string }[]).map((row) => [row.id, row.name]))
  const submissionsForReview = current.map(({ submission, version, task }) => ({
    submissionId: submission.id,
    versionId: version.id,
    versionNumber: version.version_number,
    taskId: task.id,
    title: task.title,
    clientId: task.client_id,
    clientName: clients.get(task.client_id) ?? "Client",
    campaignName: task.campaign_id ? campaigns.get(task.campaign_id) ?? "General work" : "General work",
    priority: task.priority,
    dueAt: task.due_at,
    submittedBy: profiles.get(version.submitted_by) ?? "Teammate",
    submittedAt: version.submitted_at,
    notes: version.notes ?? "",
    files: fileLinks.filter((link) => link.submission_version_id === version.id).flatMap((link) => {
      const attachment = attachments.get(link.attachment_id)
      return attachment ? [attachment] : []
    }),
  }))
  return NextResponse.json({ submissions: submissionsForReview }, { headers: { "cache-control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["tasks.review"])) return NextResponse.json({ error: "Supervisor task-review access is required." }, { status: 403 })
  let payload: { versionId?: unknown; decision?: unknown; comment?: unknown }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "Invalid review request." }, { status: 400 }) }
  if (typeof payload.versionId !== "string" || !uuidPattern.test(payload.versionId)
    || !["approved", "revision_requested"].includes(String(payload.decision))
    || (payload.comment !== undefined && (typeof payload.comment !== "string" || payload.comment.length > 5000))) {
    return NextResponse.json({ error: "Review decision or comment is invalid." }, { status: 400 })
  }
  const { error } = await actor.supabase.rpc("review_task_submission", {
    p_submission_version_id: payload.versionId,
    p_decision: payload.decision,
    p_comment: typeof payload.comment === "string" ? payload.comment.trim() || null : null,
  })
  if (error?.code === "42501") return NextResponse.json({ error: "You cannot review this task or your own submission." }, { status: 403 })
  if (error?.code === "P0002") return NextResponse.json({ error: "Task submission not found." }, { status: 404 })
  if (error?.code === "PGRST202") return NextResponse.json({ error: "Apply the task-submission review migration, then refresh." }, { status: 503 })
  if (error) return NextResponse.json({ error: error.code === "22023" ? error.message : "The task review decision could not be saved." }, { status: error.code === "22023" ? 400 : 503 })
  return NextResponse.json({ success: true }, { headers: { "cache-control": "private, no-store" } })
}
