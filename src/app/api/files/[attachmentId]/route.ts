import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { downloadDriveFile } from "@/lib/storage/google-drive"
import { createServiceClient } from "@/lib/supabase/service"
import { getPreviewMimeType } from "@/lib/storage/preview-types"

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { attachmentId } = await params
  let { data: attachment, error } = await actor.supabase.from("attachments")
    .select("id,file_name,mime_type,provider_file_id").eq("id", attachmentId).is("deleted_at", null).maybeSingle()
  if ((!attachment || error) && await hasStoragePermission(actor, ["storage.manage"])) {
    const service = createServiceClient()
    const result = await service.from("attachments").select("id,file_name,mime_type,provider_file_id")
      .eq("id", attachmentId).eq("organization_id", actor.organizationId).maybeSingle()
    attachment = result.data
    error = result.error
  }
  if (error || !attachment) return NextResponse.json({ error: "File not found." }, { status: 404 })

  try {
    const previewMimeType = getPreviewMimeType(attachment.mime_type, attachment.file_name)
    const inline = request.nextUrl.searchParams.get("inline") === "1" && Boolean(previewMimeType)
    const range = inline && previewMimeType?.startsWith("video/") ? request.headers.get("range") ?? undefined : undefined
    const response = await downloadDriveFile(actor.organizationId, attachment.provider_file_id, range)
    const safeName = attachment.file_name.replace(/[\u0000-\u001f/\\"<>:|?*]/g, "_").slice(0, 180) || "download"
    const fallbackName = safeName.replace(/[^\x20-\x7e]/g, "_")
    const contentDisposition = inline ? "inline" : "attachment"
    const headers = new Headers({
      "content-type": inline && previewMimeType ? previewMimeType : attachment.mime_type || "application/octet-stream",
      "content-disposition": `${contentDisposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(safeName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "cross-origin-resource-policy": "same-origin",
    })
    for (const name of ["accept-ranges", "content-range", "content-length"]) {
      const value = response.headers.get(name)
      if (value) headers.set(name, value)
    }
    return new NextResponse(response.body, { status: response.status, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown storage error"
    console.error("[file preview/download failed]", { attachmentId, organizationId: actor.organizationId, message })
    const safeMessage = [
      "The stored file is missing from the connected Google Drive.",
      "Google Drive denied access to this stored file.",
      "Google Drive refresh access was revoked or expired. An administrator must reconnect the approved account.",
      "Google rejected the configured OAuth client. An administrator must verify the server-side client ID and secret.",
      "Google Drive authorization could not be refreshed. An administrator must reconnect or check the OAuth configuration.",
    ].includes(message) || message.startsWith("Google Drive returned an error (")
      ? message
      : "File download failed. Check the Google Drive connection and try again."
    return NextResponse.json({ error: safeMessage }, { status: 503 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { attachmentId } = await params
  const body = await request.json().catch(() => null) as { action?: unknown } | null
  if (body?.action !== "archive" && body?.action !== "restore") return NextResponse.json({ error: "Choose move to Trash or restore." }, { status: 400 })

  const service = createServiceClient()
  const { data: file, error: fileError } = await service.from("attachments")
    .select("id,file_name,uploaded_by,deleted_at")
    .eq("id", attachmentId).eq("organization_id", actor.organizationId).maybeSingle()
  if (fileError || !file) return NextResponse.json({ error: "File not found." }, { status: 404 })
  const canManageAllFiles = await hasStoragePermission(actor, ["storage.manage"])
  if (file.uploaded_by !== actor.userId && !canManageAllFiles) return NextResponse.json({ error: "Only the uploader or an administrator can manage this file." }, { status: 403 })
  if (body.action === "archive" && file.deleted_at) return NextResponse.json({ error: "This file is already in Trash." }, { status: 409 })
  if (body.action === "restore" && !file.deleted_at) return NextResponse.json({ error: "This file is already active." }, { status: 409 })

  if (body.action === "archive") {
    const [taskRefs, contentRefs] = await Promise.all([
      service.from("submission_version_files").select("attachment_id", { count: "exact", head: true }).eq("organization_id", actor.organizationId).eq("attachment_id", attachmentId),
      service.from("content_submission_version_files").select("attachment_id", { count: "exact", head: true }).eq("organization_id", actor.organizationId).eq("attachment_id", attachmentId),
    ])
    if (taskRefs.error || contentRefs.error) return NextResponse.json({ error: "Review history could not be checked. No change was made." }, { status: 503 })
    if ((taskRefs.count ?? 0) > 0 || (contentRefs.count ?? 0) > 0) return NextResponse.json({ error: "This file is part of submitted review history and cannot be moved to Trash." }, { status: 409 })
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
    action: body.action === "archive" ? "FILE_MOVED_TO_TRASH" : "FILE_RESTORED_FROM_TRASH",
    metadata: { file_name: file.file_name },
  })
  return NextResponse.json({ ok: true, deletedAt }, { headers: { "cache-control": "private, no-store" } })
}
