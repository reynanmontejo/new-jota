import "server-only"

import { NextResponse } from "next/server"

import type { StorageActor } from "@/lib/storage/authorization"
import { createServiceClient } from "@/lib/supabase/service"

type Uploaded = { id: string; name: string; mimeType: string; size: number }
type Registration = {
  actor: StorageActor
  clientId: string | null
  campaignId: string | null
  taskId: string | null
  contentItemId: string | null
  folderId: string
  uploaded: Uploaded
}

export async function registerDriveUpload({ actor, clientId, campaignId, taskId, contentItemId, folderId, uploaded }: Registration) {
  const service = createServiceClient()
  const { data: existing, error: lookupError } = await service.from("attachments")
    .select("id,file_name,mime_type,size_bytes,uploaded_by,created_at,task_id,content_item_id,client_id,deleted_at")
    .eq("organization_id", actor.organizationId).eq("provider_file_id", uploaded.id).maybeSingle()
  if (lookupError) return NextResponse.json({ error: "The file could not be registered by the app. Contact an administrator." }, { status: 503 })
  if (existing) {
    if (existing.deleted_at || existing.uploaded_by !== actor.userId || existing.task_id !== taskId || existing.content_item_id !== contentItemId || existing.client_id !== clientId) {
      return NextResponse.json({ error: "This upload was already registered for a different destination." }, { status: 409 })
    }
    return NextResponse.json({ file: existing }, { status: 200, headers: { "cache-control": "private, no-store" } })
  }

  const { data: attachment, error } = await service.from("attachments").insert({
    organization_id: actor.organizationId,
    client_id: clientId,
    campaign_id: campaignId,
    task_id: taskId,
    content_item_id: contentItemId,
    provider_file_id: uploaded.id,
    provider_folder_id: folderId,
    file_name: uploaded.name,
    mime_type: uploaded.mimeType,
    size_bytes: uploaded.size,
    uploaded_by: actor.userId,
  }).select("id,file_name,mime_type,size_bytes,uploaded_by,created_at,task_id,content_item_id").single()
  if (error || !attachment) {
    // The unique provider-file constraint makes concurrent finalization safe.
    const { data: concurrent } = await service.from("attachments")
      .select("id,file_name,mime_type,size_bytes,uploaded_by,created_at,task_id,content_item_id,client_id,deleted_at")
      .eq("organization_id", actor.organizationId).eq("provider_file_id", uploaded.id).eq("uploaded_by", actor.userId).maybeSingle()
    if (concurrent && !concurrent.deleted_at && concurrent.task_id === taskId && concurrent.content_item_id === contentItemId && concurrent.client_id === clientId) {
      return NextResponse.json({ file: concurrent }, { status: 200, headers: { "cache-control": "private, no-store" } })
    }
    // Keep the completed private Drive file so the same session can retry
    // registration after a transient database failure.
    return NextResponse.json({ error: "The file could not be registered by the app. Contact an administrator." }, { status: 503 })
  }
  const { error: activityError } = await service.from("activity_logs").insert({
    organization_id: actor.organizationId,
    actor_id: actor.userId,
    entity_type: taskId ? "task" : contentItemId ? "content_item" : "client",
    entity_id: taskId ?? contentItemId ?? clientId,
    action: "FILE_UPLOADED",
    metadata: { attachment_id: attachment.id, file_name: attachment.file_name, mime_type: attachment.mime_type, size_bytes: attachment.size_bytes },
  })
  if (activityError) {
    // The attachment is already committed. Do not delete a user file because
    // a secondary audit-log write failed.
    console.error("[File upload activity log failed]", { attachmentId: attachment.id, organizationId: actor.organizationId })
  }
  return NextResponse.json({ file: attachment }, { status: 201, headers: { "cache-control": "private, no-store" } })
}
