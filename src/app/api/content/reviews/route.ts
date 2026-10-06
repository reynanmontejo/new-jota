import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type SubmissionRow = { id: string; client_id: string; campaign_id: string; content_item_id: string; current_version_number: number; status: string; submitted_by: string | null; submitted_at: string | null }
type ContentRow = { id: string; title: string; client_id: string; platform: string; content_type: string; deadline_at: string | null }
type VersionRow = { id: string; submission_id: string; version_number: number; notes: string | null; submitted_by: string; submitted_at: string }
type VersionFileRow = { submission_version_id: string; attachment_id: string }
type AttachmentRow = { id: string; file_name: string; mime_type: string; size_bytes: number }

export async function GET() {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["content.review"])) return NextResponse.json({ error: "Supervisor review access is required." }, { status: 403 })

  const { data: submissionData, error: submissionError } = await actor.supabase.from("content_submissions")
    .select("id,client_id,campaign_id,content_item_id,current_version_number,status,submitted_by,submitted_at")
    .eq("status", "submitted").order("submitted_at", { ascending: true })
  if (submissionError) return NextResponse.json({ error: "The review queue could not be loaded. Apply the content review migration if it is still pending." }, { status: 503 })
  const submissions = (submissionData ?? []) as unknown as SubmissionRow[]
  if (!submissions.length) return NextResponse.json({ submissions: [] }, { headers: { "cache-control": "private, no-store" } })

  const submissionIds = submissions.map((row) => row.id)
  const contentIds = [...new Set(submissions.map((row) => row.content_item_id))]
  const submitterIds = [...new Set(submissions.flatMap((row) => row.submitted_by ? [row.submitted_by] : []))]
  const [versionResult, contentResult, profilesResult] = await Promise.all([
    actor.supabase.from("content_submission_versions").select("id,submission_id,version_number,notes,submitted_by,submitted_at").in("submission_id", submissionIds),
    actor.supabase.from("content_items").select("id,title,client_id,platform,content_type,deadline_at").in("id", contentIds),
    submitterIds.length ? actor.supabase.from("profiles").select("id,display_name").in("id", submitterIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (versionResult.error || contentResult.error || profilesResult.error) return NextResponse.json({ error: "Submission details could not be loaded." }, { status: 503 })

  const contentRows = (contentResult.data ?? []) as unknown as ContentRow[]
  const contentById = new Map(contentRows.map((row) => [row.id, row]))
  const profileById = new Map(((profilesResult.data ?? []) as unknown as { id: string; display_name: string }[]).map((row) => [row.id, row.display_name]))
  const versions = (versionResult.data ?? []) as unknown as VersionRow[]
  const currentVersions = submissions.flatMap((submission) => {
    const version = versions.find((row) => row.submission_id === submission.id && row.version_number === submission.current_version_number)
    return version ? [{ submission, version }] : []
  })
  const versionIds = currentVersions.map(({ version }) => version.id)
  const fileLinksResult = versionIds.length
    ? await actor.supabase.from("content_submission_version_files").select("submission_version_id,attachment_id").in("submission_version_id", versionIds)
    : { data: [], error: null }
  if (fileLinksResult.error) return NextResponse.json({ error: "Submitted files could not be loaded." }, { status: 503 })
  const fileLinks = (fileLinksResult.data ?? []) as unknown as VersionFileRow[]
  const attachmentIds = [...new Set(fileLinks.map((row) => row.attachment_id))]
  const attachmentResult = attachmentIds.length
    ? await actor.supabase.from("attachments").select("id,file_name,mime_type,size_bytes").in("id", attachmentIds).is("deleted_at", null)
    : { data: [], error: null }
  if (attachmentResult.error) return NextResponse.json({ error: "Submitted files could not be loaded." }, { status: 503 })
  const attachmentById = new Map(((attachmentResult.data ?? []) as unknown as AttachmentRow[]).map((row) => [row.id, row]))

  const submissionsForReview = currentVersions.flatMap(({ submission, version }) => {
    const content = contentById.get(submission.content_item_id)
    if (!content) return []
    return [{
      submissionId: submission.id,
      versionId: version.id,
      versionNumber: version.version_number,
      contentItemId: content.id,
      title: content.title,
      clientName: "Client",
      clientId: content.client_id,
      platform: content.platform,
      contentType: content.content_type,
      deadlineAt: content.deadline_at,
      submittedBy: profileById.get(version.submitted_by) ?? "Teammate",
      submittedAt: version.submitted_at,
      notes: version.notes ?? "",
      files: fileLinks.filter((link) => link.submission_version_id === version.id).flatMap((link) => {
        const attachment = attachmentById.get(link.attachment_id)
        return attachment ? [attachment] : []
      }),
    }]
  })
  const clientIds = [...new Set(submissionsForReview.map((row) => row.clientId))]
  const clientsResult = clientIds.length ? await actor.supabase.from("clients").select("id,name").in("id", clientIds) : { data: [], error: null }
  if (clientsResult.error) return NextResponse.json({ error: "Client names could not be loaded." }, { status: 503 })
  const clientNames = new Map(((clientsResult.data ?? []) as unknown as { id: string; name: string }[]).map((row) => [row.id, row.name]))
  return NextResponse.json({ submissions: submissionsForReview.map((row) => ({ ...row, clientName: clientNames.get(row.clientId) ?? "Client" })) }, { headers: { "cache-control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["content.review"])) return NextResponse.json({ error: "Supervisor review access is required." }, { status: 403 })
  let payload: { versionId?: unknown; decision?: unknown; comment?: unknown }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "Invalid review request." }, { status: 400 }) }
  if (typeof payload.versionId !== "string" || !uuidPattern.test(payload.versionId)
    || !["approved", "revision_requested"].includes(String(payload.decision))
    || (payload.comment !== undefined && (typeof payload.comment !== "string" || payload.comment.length > 5000))) {
    return NextResponse.json({ error: "Review decision or comment is invalid." }, { status: 400 })
  }
  const { error } = await actor.supabase.rpc("review_content_submission", {
    p_submission_version_id: payload.versionId,
    p_decision: payload.decision,
    p_comment: typeof payload.comment === "string" ? payload.comment.trim() || null : null,
  })
  if (error?.code === "42501") return NextResponse.json({ error: "You cannot review this submission or your own work." }, { status: 403 })
  if (error?.code === "P0002") return NextResponse.json({ error: "Submission not found." }, { status: 404 })
  if (error?.code === "PGRST202") return NextResponse.json({ error: "Apply the content review migration, then refresh." }, { status: 503 })
  if (error) return NextResponse.json({ error: error.code === "22023" ? error.message : "The review decision could not be saved." }, { status: error.code === "22023" ? 400 : 503 })
  return NextResponse.json({ success: true }, { headers: { "cache-control": "private, no-store" } })
}
