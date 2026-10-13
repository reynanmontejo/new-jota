import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { permanentlyDeleteDriveFile } from "@/lib/storage/google-drive"
import { createServiceClient } from "@/lib/supabase/service"

type AdminActionFile = { id: string; deleted_at: string | null; file_name: string; content_item_id?: string | null }

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["storage.manage"])) return NextResponse.json({ error: "Administrator access required." }, { status: 403 })
  const { attachmentId } = await params
  const body = await request.json().catch(() => null) as { action?: unknown } | null
  if (body?.action !== "archive" && body?.action !== "restore") return NextResponse.json({ error: "Choose archive or restore." }, { status: 400 })

  const service = createServiceClient()
  const initialFileResult = await service.from("attachments")
    .select("id,deleted_at,file_name,content_item_id")
    .eq("id", attachmentId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle()
  let file = initialFileResult.data as unknown as AdminActionFile | null
  let fileError = initialFileResult.error
  let contentReviewReady = true
  if (["42703", "PGRST204"].includes(fileError?.code ?? "") && fileError?.message.toLowerCase().includes("content_item_id")) {
    contentReviewReady = false
    const fallback = await service.from("attachments").select("id,deleted_at,file_name")
      .eq("id", attachmentId).eq("organization_id", actor.organizationId).maybeSingle()
    file = fallback.data as unknown as AdminActionFile | null
    fileError = fallback.error
  }
  if (fileError || !file) return NextResponse.json({ error: "File not found." }, { status: 404 })
  if (body.action === "archive" && file.deleted_at) return NextResponse.json({ error: "This file is already archived." }, { status: 409 })
  if (body.action === "restore" && !file.deleted_at) return NextResponse.json({ error: "This file is already active." }, { status: 409 })

  if (body.action === "archive") {
    const [taskRefs, contentRefs] = await Promise.all([
      service.from("submission_version_files").select("attachment_id", { count: "exact", head: true }).eq("organization_id", actor.organizationId).eq("attachment_id", attachmentId),
      contentReviewReady ? service.from("content_submission_version_files").select("attachment_id", { count: "exact", head: true }).eq("organization_id", actor.organizationId).eq("attachment_id", attachmentId) : Promise.resolve({ data: null, error: null, count: 0 }),
    ])
    if (taskRefs.error || contentRefs.error) return NextResponse.json({ error: "Submission history could not be checked. No change was made." }, { status: 503 })
    if ((taskRefs.count ?? 0) > 0 || (contentRefs.count ?? 0) > 0) return NextResponse.json({ error: "This file is part of submitted review history and cannot be archived." }, { status: 409 })
  }

  const deletedAt = body.action === "archive" ? new Date().toISOString() : null
  const { error: updateError } = await service.from("attachments").update({ deleted_at: deletedAt })
    .eq("id", attachmentId).eq("organization_id", actor.organizationId)
  if (updateError) return NextResponse.json({ error: "The file could not be updated." }, { status: 503 })
  await service.from("activity_logs").insert({
    organization_id: actor.organizationId,
    actor_id: actor.userId,
    entity_type: "attachment",
    entity_id: attachmentId,
    action: body.action === "archive" ? "FILE_ARCHIVED_BY_ADMIN" : "FILE_RESTORED_BY_ADMIN",
    metadata: { file_name: file.file_name },
  })
  return NextResponse.json({ ok: true, deletedAt }, { headers: { "cache-control": "private, no-store" } })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["storage.manage"])) return NextResponse.json({ error: "Administrator access required." }, { status: 403 })
  const body = await request.json().catch(() => null) as { confirm?: unknown } | null
  if (body?.confirm !== true) return NextResponse.json({ error: "Confirm permanent deletion to continue." }, { status: 400 })

  const { attachmentId } = await params
  const service = createServiceClient()
  const { data: file, error: fileError } = await service.from("attachments")
    .select("id,file_name,provider_file_id,deleted_at")
    .eq("id", attachmentId).eq("organization_id", actor.organizationId).maybeSingle()
  if (fileError || !file) return NextResponse.json({ error: "File not found." }, { status: 404 })
  if (!file.deleted_at) return NextResponse.json({ error: "Move the file to Archive before permanently deleting it." }, { status: 409 })

  const [taskRefs, contentRefs] = await Promise.all([
    service.from("submission_version_files").select("attachment_id", { count: "exact", head: true }).eq("organization_id", actor.organizationId).eq("attachment_id", attachmentId),
    service.from("content_submission_version_files").select("attachment_id", { count: "exact", head: true }).eq("organization_id", actor.organizationId).eq("attachment_id", attachmentId),
  ])
  if (taskRefs.error || contentRefs.error) return NextResponse.json({ error: "Review history could not be checked. The file was not deleted." }, { status: 503 })
  if ((taskRefs.count ?? 0) > 0 || (contentRefs.count ?? 0) > 0) return NextResponse.json({ error: "This file is part of submitted review history and cannot be permanently deleted." }, { status: 409 })

  try {
    await permanentlyDeleteDriveFile(actor.organizationId, file.provider_file_id)
  } catch (error) {
    console.error("[admin permanent file deletion failed]", {
      attachmentId,
      organizationId: actor.organizationId,
      reason: error instanceof Error ? error.message : "Unknown error",
    })
    const reason = error instanceof Error ? error.message : ""
    const message = reason === "Google Drive is not connected"
      ? "Google Drive is not connected. Reconnect it in File storage settings, then retry."
      : reason.startsWith("Google Drive refresh access was revoked or expired")
        ? "Google Drive authorization expired. Reconnect the approved account in File storage settings, then retry."
        : "Google Drive could not delete this file. It remains in Archive; check the Drive connection and retry."
    return NextResponse.json({ error: message }, { status: 503 })
  }

  const { data: deleted, error: deleteError } = await service.from("attachments").delete()
    .eq("id", attachmentId).eq("organization_id", actor.organizationId).not("deleted_at", "is", null)
    .select("id").maybeSingle()
  if (deleteError || !deleted) {
    console.error("[admin attachment record deletion failed after Drive deletion]", {
      attachmentId,
      organizationId: actor.organizationId,
      code: deleteError?.code ?? "not_deleted",
      message: deleteError?.message ?? "The attachment row was not removed",
    })
    return NextResponse.json({ error: "The Drive copy was removed, but Jota could not finish deleting its file record. Retry the permanent delete or contact support." }, { status: 503 })
  }

  const { error: activityError } = await service.from("activity_logs").insert({
    organization_id: actor.organizationId,
    actor_id: actor.userId,
    entity_type: "attachment",
    entity_id: attachmentId,
    action: "FILE_PERMANENTLY_DELETED_BY_ADMIN",
    metadata: { file_name: file.file_name },
  })
  if (activityError) console.error("[admin permanent file deletion audit failed]", { attachmentId, organizationId: actor.organizationId, message: activityError.message })
  return NextResponse.json({ ok: true, auditRecorded: !activityError }, { headers: { "cache-control": "private, no-store" } })
}
