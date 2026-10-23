import "server-only"

import { NextResponse } from "next/server"

import { hasStoragePermission, type StorageActor } from "@/lib/storage/authorization"
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL } from "@/lib/storage/upload-limits"

const acceptedExtensions = new Map<string, Set<string>>([
  [".jpg", new Set(["image/jpeg"])], [".jpeg", new Set(["image/jpeg"])],
  [".png", new Set(["image/png"])], [".webp", new Set(["image/webp"])], [".gif", new Set(["image/gif"])],
  [".mp4", new Set(["video/mp4"])], [".mov", new Set(["video/quicktime"])],
  [".pdf", new Set(["application/pdf"])], [".txt", new Set(["text/plain"])],
  [".csv", new Set(["text/csv", "application/csv", "application/vnd.ms-excel"])],
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".pptx", new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"])],
])

export type UploadDetails = {
  clientId: string
  taskId: string | null
  contentItemId: string | null
  campaignId: string | null
  fileName: string
  mimeType: string
  size: number
}

export async function authorizeUpload(actor: StorageActor, details: UploadDetails) {
  const { clientId, taskId, contentItemId, fileName, mimeType, size } = details
  let campaignId = details.campaignId
  if (taskId && contentItemId) return { error: NextResponse.json({ error: "Choose a task or a content item, not both." }, { status: 400 }) }
  if (!clientId && !taskId) return { error: NextResponse.json({ error: "Choose a task or client and file." }, { status: 400 }) }
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_SIZE_BYTES) return { error: NextResponse.json({ error: `File must be between 1 byte and ${MAX_UPLOAD_SIZE_LABEL}.` }, { status: 413 }) }
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f]/.test(fileName)) return { error: NextResponse.json({ error: "File name must be 255 characters or fewer and contain no control characters." }, { status: 400 }) }
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase()
  if (!acceptedExtensions.get(extension)?.has(mimeType)) return { error: NextResponse.json({ error: "This file type or file extension is not supported." }, { status: 415 }) }

  const permissionCodes = taskId ? ["tasks.create", "tasks.update"] : ["content.create", "content.update"]
  if (!await hasStoragePermission(actor, permissionCodes)) return { error: NextResponse.json({ error: "You do not have permission to upload files here." }, { status: 403 }) }
  let client: { id: string; name: string; organization_id: string } | null = null
  if (taskId) {
    const { data: task } = await actor.supabase.from("tasks").select("id,client_id,organization_id").eq("id", taskId).is("deleted_at", null).maybeSingle()
    if (!task || task.client_id !== (clientId || null) || task.organization_id !== actor.organizationId) return { error: NextResponse.json({ error: "Task files are unavailable." }, { status: 404 }) }
    if (task.client_id) {
      const result = await actor.supabase.from("clients").select("id,name,organization_id").eq("id", task.client_id).is("deleted_at", null).maybeSingle()
      if (result.error || !result.data || result.data.organization_id !== actor.organizationId) return { error: NextResponse.json({ error: "Client files are unavailable." }, { status: 404 }) }
      client = result.data
    }
  } else {
    const result = await actor.supabase.from("clients").select("id,name,organization_id").eq("id", clientId).is("deleted_at", null).maybeSingle()
    if (result.error || !result.data || result.data.organization_id !== actor.organizationId) return { error: NextResponse.json({ error: "Client files are unavailable." }, { status: 404 }) }
    client = result.data
  }
  if (contentItemId) {
    const { data: item } = await actor.supabase.from("content_items").select("id,client_id,campaign_id").eq("id", contentItemId).eq("client_id", clientId).is("deleted_at", null).maybeSingle()
    if (!item) return { error: NextResponse.json({ error: "Content files are unavailable." }, { status: 404 }) }
    if (campaignId && campaignId !== item.campaign_id) return { error: NextResponse.json({ error: "The content item does not belong to the selected campaign." }, { status: 400 }) }
    campaignId = item.campaign_id
  }
  if (campaignId) {
    const { data: campaign } = await actor.supabase.from("campaigns").select("id,client_id").eq("id", campaignId).is("deleted_at", null).maybeSingle()
    if (!campaign || campaign.client_id !== clientId) return { error: NextResponse.json({ error: "Campaign files are unavailable." }, { status: 404 }) }
  }
  return { client, campaignId, error: null }
}
